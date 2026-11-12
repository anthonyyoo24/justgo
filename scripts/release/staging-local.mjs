import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { promisify } from 'node:util';
import { buildEdge } from '../../apps/api/scripts/edge-build.mjs';
import {
  isSourceSha,
  requireRelease,
  StagingRunnerFailure,
  stagingTarget,
} from './staging-api.mjs';

const executeFile = promisify(execFile);
const invalid = 'INVALID_LOCAL_STAGING_CONTEXT';
const operations = ['deploy', 'migrate-deploy', 'secrets'];
export const stagingWorkflow = 'staging-api.yml';

export const usage =
  'Usage: pnpm run release:staging:local --tag <tag> --operation deploy|migrate-deploy|secrets [--plan <sha256>] [--dry-run]';

/** Parse the owner's flags. Anything unknown or repeated is refused. */
export function localReleaseArguments(args) {
  const options = { dryRun: false };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--dry-run' && !options.dryRun) {
      options.dryRun = true;
      continue;
    }
    const name = {
      '--tag': 'tag',
      '--operation': 'operation',
      '--plan': 'plan',
    }[flag];
    const value = args[index + 1];
    requireRelease(
      name && options[name] === undefined && typeof value === 'string',
      invalid,
    );
    options[name] = value;
    index++;
  }
  requireRelease(
    typeof options.tag === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(options.tag) &&
      operations.includes(options.operation) &&
      (options.operation === 'migrate-deploy'
        ? /^[a-f0-9]{64}$/.test(options.plan ?? '')
        : options.plan === undefined),
    invalid,
  );
  return options;
}

export async function localCommand(command, args, options = {}) {
  try {
    const result = await executeFile(command, args, {
      encoding: 'utf8',
      timeout: 40 * 60_000,
      maxBuffer: 32 * 1024 * 1024,
      ...options,
    });
    return result.stdout;
  } catch {
    throw new StagingRunnerFailure('STAGING_COMMAND_FAILED');
  }
}

/** The checkout must be clean and sit exactly on the tag it releases. */
export async function taggedSource(tag, { root, run = localCommand } = {}) {
  const git = async (...args) => (await run('git', args, { cwd: root })).trim();
  requireRelease(
    !(await git('status', '--porcelain', '--untracked-files=normal')),
    'STAGING_SOURCE_NOT_CLEAN',
  );
  const head = await git('rev-parse', 'HEAD');
  let tagged;
  try {
    tagged = await git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`);
  } catch {
    tagged = undefined;
  }
  requireRelease(
    isSourceSha(head) && tagged === head,
    'STAGING_SOURCE_NOT_TAGGED',
  );
  return head;
}

/** Print every step, build the bundle locally and contact no provider. */
export async function dryRun(
  { tag, operation, sha },
  { root, build = buildEdge, log = console.info } = {},
) {
  log(`source ${sha} at tag ${tag}, clean`);
  if (operation === 'secrets') {
    log('would dispatch staging-api.yml with operation secrets');
    log('would set the function secrets from STAGING_FUNCTION_SECRETS');
    log('would list the secret names and probe api /health and /ready');
  } else {
    const directory = mkdtempSync(join(tmpdir(), 'justgo-dry-run-'));
    try {
      const bundle = await build({ root, directory, sourceSha: sha });
      log(
        `built edge.mjs: ${bundle.bytes} bytes, upload sha256 ${bundle.uploadSha256}`,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    log(`would dispatch staging-api.yml with operation ${operation}`);
    log('would read the serving /health as previousApiSha');
    log(
      operation === 'migrate-deploy'
        ? 'would hold the database lock and apply the reviewed migration plan'
        : 'would hold the database lock and require no pending migration',
    );
    log('would deploy api-candidate and probe it');
    log('would deploy api, probe it and read back its version');
  }
  log('dry run, no deploy');
}

/** Lines the lane prints as JSON receipts. They hold no secret values. */
export function receiptsFrom(log) {
  const receipts = [];
  for (const line of log.split('\n')) {
    const start = line.indexOf('{"event":"staging_');
    if (start < 0) continue;
    try {
      receipts.push(JSON.parse(line.slice(start)));
    } catch {
      // A partial line is not a receipt.
    }
  }
  return receipts;
}

/**
 * Dispatch the protected workflow and wait for its receipt. The Mac runs no
 * deploy and holds no provider credential.
 */
export async function dispatchRelease(
  { tag, operation, plan },
  {
    run = localCommand,
    log = console.info,
    wait = pause,
    now = () => Date.now(),
    attempts = 20,
  } = {},
) {
  const repo = ['--repo', stagingTarget.repository];
  const started = now();
  await run('gh', [
    'workflow',
    'run',
    stagingWorkflow,
    ...repo,
    '--ref',
    'main',
    '-f',
    `tag=${tag}`,
    '-f',
    `operation=${operation}`,
    ...(plan ? ['-f', `migration_plan_sha256=${plan}`] : []),
  ]);
  const title = `Staging API ${operation} from ${tag}`;
  let found;
  for (let attempt = 0; attempt < attempts && !found; attempt++) {
    if (attempt) await wait(3000);
    const runs = JSON.parse(
      await run('gh', [
        'run',
        'list',
        ...repo,
        '--workflow',
        stagingWorkflow,
        '--event',
        'workflow_dispatch',
        '--limit',
        '10',
        '--json',
        'databaseId,createdAt,displayTitle,url',
      ]),
    );
    found = runs.find(
      (item) =>
        item.displayTitle === title &&
        Date.parse(item.createdAt) >= started - 60_000,
    );
  }
  requireRelease(found, 'STAGING_COMMAND_FAILED');
  log(`dispatched ${found.url}`);
  const id = String(found.databaseId);
  let failed = false;
  try {
    await run('gh', ['run', 'watch', id, ...repo, '--exit-status']);
  } catch {
    failed = true;
  }
  const receipts = receiptsFrom(
    await run('gh', ['run', 'view', id, ...repo, '--log']),
  );
  for (const receipt of receipts) log(JSON.stringify(receipt));
  requireRelease(!failed, 'STAGING_COMMAND_FAILED');
  return { runId: id, url: found.url, receipts };
}

/** The owner's Mac only. A CI or hosted build must use the workflow itself. */
export function assertOwnerMachine(env = process.env) {
  requireRelease(
    !['CI', 'GITHUB_ACTIONS', 'GITHUB_RUN_ID', 'VERCEL', 'EAS_BUILD'].some(
      (name) => env[name] && env[name] !== 'false' && env[name] !== '0',
    ),
    invalid,
  );
}

export async function runLocalStagingRelease(
  args,
  {
    env = process.env,
    root = process.cwd(),
    run = localCommand,
    log = console.info,
    ...rest
  } = {},
) {
  assertOwnerMachine(env);
  const options = localReleaseArguments(args);
  const sha = await taggedSource(options.tag, { root, run });
  if (options.dryRun)
    return dryRun({ ...options, sha }, { root, log, build: rest.build });
  return dispatchRelease(options, { run, log, ...rest });
}
