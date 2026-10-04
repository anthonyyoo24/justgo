import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { coverageFailures } from './check-coverage.mjs';

const root = path.resolve('/fixture');
const stats = (covered, total = 100) => ({ branches: { total, covered } });
const file = (name) => path.join(root, name);

test('global coverage includes critical files and rejects a regression despite a passing file', () => {
  assert.deepEqual(
    coverageFailures(
      { total: stats(79), [file('src/critical.ts')]: stats(100) },
      {
        global: { branches: 80 },
        files: { 'src/critical.ts': { branches: 95 } },
      },
      root,
    ),
    ['all source: branches 79.00% < 80%'],
  );
});
test('a critical regression fails despite a passing total', () => {
  assert.deepEqual(
    coverageFailures(
      { total: stats(98), [file('src/critical.ts')]: stats(94) },
      {
        global: { branches: 80 },
        files: { 'src/critical.ts': { branches: 95 } },
      },
      root,
    ),
    ['src/critical.ts: branches 94.00% < 95%'],
  );
});
test('directory floors weight branch counts rather than averaging percentages', () => {
  const report = {
    total: stats(91),
    [file('src/progress/a.ts')]: stats(90),
    [file('src/progress/b.ts')]: stats(1, 1),
  };
  assert.deepEqual(
    coverageFailures(
      report,
      {
        global: { branches: 80 },
        files: { 'src/progress/': { branches: 90 } },
      },
      root,
    ),
    [],
  );
  assert.match(
    coverageFailures(
      report,
      { global: {}, files: { 'src/progress/': { branches: 91 } } },
      root,
    )[0],
    /90.10% < 91%/,
  );
});
test('missing source/report counts cannot silently pass a threshold', () => {
  assert.deepEqual(
    coverageFailures(
      {},
      { global: { branches: 80 }, files: { 'src/moved.ts': { branches: 95 } } },
      root,
    ),
    [
      'all source: no coverage entries (check the include pattern)',
      'all source: missing/invalid branches counts',
      'src/moved.ts: no coverage entry (check the include pattern or a moved file)',
    ],
  );
});
test('reports without source entries fail even when all global coverage floors pass', () => {
  const metrics = ['branches', 'lines', 'statements', 'functions'];
  const rules = {
    global: Object.fromEntries(metrics.map((metric) => [metric, 95])),
    files: {},
  };
  for (const total of [0, 100]) {
    const summary = {
      total: Object.fromEntries(
        metrics.map((metric) => [metric, { total, covered: total }]),
      ),
    };
    assert.deepEqual(coverageFailures(summary, rules, root), [
      'all source: no coverage entries (check the include pattern)',
    ]);
  }
});
test('empty branch sets pass, but malformed counts and rounded percentages cannot inflate coverage', () => {
  const rules = { global: { branches: 95 }, files: {} };
  const source = { [file('src/branchless.ts')]: stats(0, 0) };
  assert.deepEqual(
    coverageFailures({ total: stats(0, 0), ...source }, rules, root),
    [],
  );
  assert.match(
    coverageFailures({ total: stats(100, 1), ...source }, rules, root)[0],
    /invalid/,
  );
  assert.match(
    coverageFailures(
      {
        total: { branches: { total: 10000, covered: 9499, pct: 95 } },
        ...source,
      },
      rules,
      root,
    )[0],
    /94.99%/,
  );
});
