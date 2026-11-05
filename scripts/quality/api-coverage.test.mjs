import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { requireSuccessfulJobs, runApiCoverage } from './api-coverage.mjs';

const root = path.resolve('/justgo-root');

for (const mode of ['unit', 'database']) {
  test(`${mode} coverage selects its disjoint suites`, () => {
    assert.equal(
      runApiCoverage(mode, {
        root,
        run(command, args, options) {
          assert.equal(command, process.execPath);
          assert.equal(options.cwd, path.join(root, 'apps/api'));
          assert.equal(args.includes('--exclude'), mode === 'unit');
          assert.equal(
            args.includes('**/*.integration.test.ts'),
            mode === 'unit',
          );
          assert.equal(
            args.includes('.integration.test.ts'),
            mode === 'database',
          );
          assert.ok(
            args.includes(
              `--coverage.reportsDirectory=../../coverage/api-${mode}`,
            ),
          );
          assert.ok(args.includes('--coverage.reportOnFailure'));
          return { status: 0 };
        },
      }),
      0,
    );
  });
}

test('producer failures and interrupted processes cannot appear successful', () => {
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
    () => runApiCoverage('merge', { root }),
    /requires unit or database/,
  );
});

test('the required status rejects failed, skipped, cancelled and absent producer results', () => {
  const passing = Object.fromEntries(
    ['static', 'unit', 'database', 'journeys', 'exports', 'native-icloud'].map(
      (name) => [name, { result: 'success' }],
    ),
  );
  requireSuccessfulJobs(JSON.stringify(passing));
  for (const name of Object.keys(passing)) {
    const missing = { ...passing };
    delete missing[name];
    assert.throws(
      () => requireSuccessfulJobs(JSON.stringify(missing)),
      new RegExp(name),
    );
    for (const result of ['failure', 'skipped', 'cancelled', undefined])
      assert.throws(
        () =>
          requireSuccessfulJobs(
            JSON.stringify({ ...passing, [name]: { result } }),
          ),
        new RegExp(name),
      );
  }
  for (const value of [undefined, '{', 'null', '{}'])
    assert.throws(() => requireSuccessfulJobs(value));
});
