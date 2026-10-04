import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Both Jest/Istanbul and Vitest/V8 emit the same count-based summary format.
// Evaluate global totals independently of critical-file floors (Jest otherwise
// subtracts individually targeted files from its global threshold calculation).
export function coverageFailures(summary, rules, directory) {
  const failures = [];
  const files = Object.entries(summary).filter(
    ([filename]) => filename !== 'total',
  );
  if (!files.length) {
    failures.push(
      'all source: no coverage entries (check the include pattern)',
    );
  }
  function check(label, stats, thresholds) {
    for (const [metric, minimum] of Object.entries(thresholds)) {
      const counts = stats?.[metric];
      if (
        !counts ||
        !Number.isFinite(counts.total) ||
        !Number.isFinite(counts.covered) ||
        counts.total < 0 ||
        counts.covered < 0 ||
        counts.covered > counts.total
      ) {
        failures.push(`${label}: missing/invalid ${metric} counts`);
        continue;
      }
      const percent =
        counts.total === 0 ? 100 : (100 * counts.covered) / counts.total;
      if (percent < minimum)
        failures.push(
          `${label}: ${metric} ${percent.toFixed(2)}% < ${minimum}%`,
        );
    }
  }
  check('all source', summary.total, rules.global);
  for (const [selector, thresholds] of Object.entries(rules.files)) {
    const matches = files.filter(([filename]) => {
      const relative = path
        .relative(directory, filename)
        .split(path.sep)
        .join('/');
      return selector.endsWith('/')
        ? relative.startsWith(selector)
        : relative === selector;
    });
    if (!matches.length) {
      failures.push(
        `${selector}: no coverage entry (check the include pattern or a moved file)`,
      );
      continue;
    }
    const aggregate = {};
    for (const metric of Object.keys(thresholds)) {
      const counts = matches.map(([, stats]) => stats[metric]);
      if (
        counts.every(
          (value) =>
            value &&
            Number.isFinite(value.total) &&
            Number.isFinite(value.covered),
        )
      ) {
        aggregate[metric] = counts.reduce(
          (sum, value) => ({
            total: sum.total + value.total,
            covered: sum.covered + value.covered,
          }),
          { total: 0, covered: 0 },
        );
      }
    }
    check(selector, aggregate, thresholds);
  }
  return failures;
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const thresholds = JSON.parse(
    await readFile(path.join(root, 'scripts/coverage-thresholds.json'), 'utf8'),
  );
  let failed = false;
  for (const [workspace, rules] of Object.entries(thresholds)) {
    const summary = JSON.parse(
      await readFile(
        path.join(root, 'coverage', workspace, 'coverage-summary.json'),
        'utf8',
      ),
    );
    const failures = coverageFailures(
      summary,
      rules,
      path.join(root, rules.directory),
    );
    if (failures.length) {
      failed = true;
      for (const failure of failures) console.error(`${workspace}: ${failure}`);
    } else
      console.log(
        `${workspace}: all-source and critical-behavior coverage floors pass`,
      );
  }
  if (failed) process.exitCode = 1;
}
if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
