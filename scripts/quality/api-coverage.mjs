import { spawnSync } from 'node:child_process';
import { rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const blobNames = ['unit', 'database'];

function requireBlob(filename) {
  let valid = false;
  try {
    const stat = statSync(filename);
    valid = stat.isFile() && stat.size > 0;
  } catch {
    // Missing producer output must not turn a partial coverage report green.
  }
  if (!valid)
    throw new Error(
      `Missing API coverage producer: ${path.basename(filename)}`,
    );
}

/** Merge remapped coverage maps with Vitest; never add overlapping summaries. */
export function runApiCoverage(
  mode,
  { root = repositoryRoot, run = spawnSync } = {},
) {
  if (![...blobNames, 'merge'].includes(mode))
    throw new Error('API coverage requires unit, database or merge.');
  const blobDirectory = path.join(root, 'coverage/api-blobs');
  const output = path.join(blobDirectory, `${mode}.json`);
  const args = [
    path.join(
      path.dirname(require.resolve('vitest/package.json')),
      'vitest.mjs',
    ),
  ];
  if (mode === 'merge') {
    for (const producer of blobNames)
      requireBlob(path.join(blobDirectory, `${producer}.json`));
    args.push(
      '--merge-reports=../../coverage/api-blobs',
      '--coverage',
      '--reporter=default',
    );
  } else {
    rmSync(output, { force: true });
    args.push('run');
    if (mode === 'unit') args.push('--exclude', '**/*.integration.test.ts');
    else args.push('.integration.test.ts');
    args.push(
      '--coverage',
      `--coverage.reportsDirectory=../../coverage/api-${mode}`,
      '--coverage.reportOnFailure',
      '--reporter=default',
      '--reporter=blob',
      `--outputFile.blob=../../coverage/api-blobs/${mode}.json`,
    );
  }
  const result = run(process.execPath, args, {
    cwd: path.join(root, 'apps/api'),
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  const status = result.status ?? 1;
  if (status === 0 && mode !== 'merge') requireBlob(output);
  return status;
}

/** The aggregate status must fail for failed, cancelled or skipped producers. */
export function requireSuccessfulJobs(value) {
  const required = [
    'static',
    'unit',
    'database',
    'journeys',
    'exports',
    'native-icloud',
  ];
  let jobs;
  try {
    jobs = JSON.parse(value);
  } catch {
    throw new Error('Missing CI producer results.');
  }
  for (const name of required)
    if (jobs?.[name]?.result !== 'success')
      throw new Error(`CI producer did not pass: ${name}`);
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
