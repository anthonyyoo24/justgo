import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export function runApiCoverage(
  mode,
  { root = repositoryRoot, run = spawnSync } = {},
) {
  if (!['unit', 'database'].includes(mode))
    throw new Error('API coverage requires unit or database.');
  const args = [
    path.join(
      path.dirname(require.resolve('vitest/package.json')),
      'vitest.mjs',
    ),
    'run',
  ];
  if (mode === 'unit') args.push('--exclude', '**/*.integration.test.ts');
  else args.push('.integration.test.ts');
  args.push(
    '--coverage',
    `--coverage.reportsDirectory=../../coverage/api-${mode}`,
    '--coverage.reportOnFailure',
  );
  const result = run(process.execPath, args, {
    cwd: path.join(root, 'apps/api'),
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function requireSuccessfulJobs(value) {
  const appJobs = ['unit', 'database', 'journeys', 'exports', 'native-icloud'];
  let jobs;
  try {
    jobs = JSON.parse(value);
  } catch {
    throw new Error('Missing CI producer results.');
  }
  for (const name of ['changes', 'static'])
    if (jobs?.[name]?.result !== 'success')
      throw new Error(`CI producer did not pass: ${name}`);
  const noAppChange = jobs.changes.outputs?.app === 'false';
  const noICloudChange = jobs.changes.outputs?.icloud === 'false';
  const noDependencyChange = jobs.changes.outputs?.dependencies === 'false';
  for (const name of [...appJobs, 'dependencies']) {
    const result = jobs?.[name]?.result;
    const maySkip =
      name === 'dependencies'
        ? noDependencyChange
        : noAppChange || (name === 'native-icloud' && noICloudChange);
    if (result !== 'success' && !(maySkip && result === 'skipped'))
      throw new Error(`CI producer did not pass: ${name}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const mode = process.argv[2];
  if (mode === 'require-jobs')
    requireSuccessfulJobs(process.env.JUSTGO_CI_RESULTS);
  else process.exitCode = runApiCoverage(mode);
}
