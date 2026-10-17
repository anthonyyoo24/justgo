import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { requireSuccessfulJobs, runApiCoverage } from './api-coverage.mjs';

const require = createRequire(import.meta.url);
function fixture(t) {
  const root = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'justgo-ci-coverage-')),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'apps/api/src'), { recursive: true });
  mkdirSync(path.join(root, 'coverage/api-blobs'), { recursive: true });
  return root;
}
const blob = (root, mode) => path.join(root, `coverage/api-blobs/${mode}.json`);

for (const mode of ['unit', 'database']) {
  test(`${mode} coverage selects its disjoint suites and cannot reuse a stale blob`, (t) => {
    const root = fixture(t);
    writeFileSync(blob(root, mode), 'stale');
    assert.equal(
      runApiCoverage(mode, {
        root,
        run(command, args, options) {
          assert.equal(command, process.execPath);
          assert.equal(options.cwd, path.join(root, 'apps/api'));
          assert.equal(existsSync(blob(root, mode)), false);
          assert.equal(args.includes('--exclude'), mode === 'unit');
          assert.equal(
            args.includes('**/*.integration.test.ts'),
            mode === 'unit',
          );
          assert.equal(
            args.includes('.integration.test.ts'),
            mode === 'database',
          );
          assert.ok(args.includes('--reporter=blob'));
          assert.ok(args.includes('--coverage.reportOnFailure'));
          writeFileSync(blob(root, mode), 'fresh');
          return { status: 0 };
        },
      }),
      0,
    );
  });
}

test('missing or empty producer blobs fail before merging', (t) => {
  const root = fixture(t);
  const run = () => {
    throw new Error('must not start');
  };
  assert.throws(
    () => runApiCoverage('merge', { root, run }),
    /Missing API coverage producer: unit.json/,
  );
  writeFileSync(blob(root, 'unit'), 'valid');
  assert.throws(() => runApiCoverage('merge', { root, run }), /database.json/);
  writeFileSync(blob(root, 'database'), '');
  assert.throws(() => runApiCoverage('merge', { root, run }), /database.json/);
});

test('producer failures and interrupted processes cannot appear successful', (t) => {
  const root = fixture(t);
  assert.equal(
    runApiCoverage('unit', { root, run: () => ({ status: 17 }) }),
    17,
  );
  assert.equal(
    runApiCoverage('unit', { root, run: () => ({ status: null }) }),
    1,
  );
  assert.throws(
    () =>
      runApiCoverage('unit', {
        root,
        run: () => ({ error: new Error('spawn failed') }),
      }),
    /spawn failed/,
  );
  assert.throws(
    () => runApiCoverage('unit', { root, run: () => ({ status: 0 }) }),
    /Missing API coverage producer/,
  );
  assert.throws(
    () => runApiCoverage('other', { root }),
    /requires unit, database or merge/,
  );
});

test('the required status rejects failed, skipped, cancelled and absent producer results', () => {
  const passing = Object.fromEntries(
    ['static', 'unit', 'database', 'journeys', 'exports'].map((name) => [
      name,
      { result: 'success' },
    ]),
  );
  requireSuccessfulJobs(JSON.stringify(passing));
  for (const name of Object.keys(passing))
    for (const result of ['failure', 'skipped', 'cancelled', undefined])
      assert.throws(
        () =>
          requireSuccessfulJobs(
            JSON.stringify({ ...passing, [name]: { result } }),
          ),
        new RegExp(name),
      );
  for (const value of [undefined, '{', 'null', '{}'])
    assert.throws(() => requireSuccessfulJobs(value));
});

test(
  'Vitest unions complementary execution branches and retains untouched source without rerunning tests',
  { timeout: 30_000 },
  (t) => {
    const root = fixture(t);
    const api = path.join(root, 'apps/api');
    const nodeModules = path.dirname(
      path.dirname(require.resolve('vitest/package.json')),
    );
    symlinkSync(nodeModules, path.join(root, 'node_modules'), 'dir');
    writeFileSync(
      path.join(api, 'vitest.config.mjs'),
      `export default { test: {
    fileParallelism: false,
    coverage: { provider: 'v8', include: ['src/**/*.ts'],
      reporter: ['json-summary'], reportsDirectory: '../../coverage/api' }
  } };`,
    );
    writeFileSync(
      path.join(api, 'src/decision.ts'),
      "export function decide(value: number) { return value > 0 ? 'positive' : 'other'; }\n",
    );
    writeFileSync(
      path.join(api, 'src/untouched.ts'),
      'export const untouched = (value: number) => value + 1;\n',
    );
    writeFileSync(
      path.join(api, 'unit.test.ts'),
      "import { it, expect } from 'vitest'; import { decide } from './src/decision'; it('unit branch', () => expect(decide(1)).toBe('positive'));\n",
    );
    writeFileSync(
      path.join(api, 'database.integration.test.ts'),
      "import { it, expect } from 'vitest'; import { decide } from './src/decision'; it('database branch', () => expect(decide(0)).toBe('other'));\n",
    );
    const run = (command, args, options) => {
      const result = spawnSync(command, args, {
        ...options,
        stdio: 'pipe',
        encoding: 'utf8',
        timeout: 10_000,
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return result;
    };
    for (const mode of ['unit', 'database'])
      assert.equal(runApiCoverage(mode, { root, run }), 0);
    const report = (mode) =>
      JSON.parse(
        readFileSync(
          path.join(root, `coverage/api-${mode}/coverage-summary.json`),
          'utf8',
        ),
      );
    const decision = path.join(api, 'src/decision.ts');
    assert.ok(report('unit')[decision].branches.pct < 100);
    assert.ok(report('database')[decision].branches.pct < 100);
    // If merge accidentally runs tests, these files now throw instead of passing.
    for (const filename of ['unit.test.ts', 'database.integration.test.ts'])
      writeFileSync(
        path.join(api, filename),
        "throw new Error('merge reran tests');\n",
      );
    assert.equal(runApiCoverage('merge', { root, run }), 0);
    const merged = JSON.parse(
      readFileSync(
        path.join(root, 'coverage/api/coverage-summary.json'),
        'utf8',
      ),
    );
    assert.equal(merged[decision].branches.pct, 100);
    assert.equal(merged[path.join(api, 'src/untouched.ts')].lines.covered, 0);
    assert.equal(
      merged[path.join(api, 'src/untouched.ts')].lines.total > 0,
      true,
    );
    assert.equal(
      merged[decision].branches.total,
      report('unit')[decision].branches.total,
    );
  },
);
