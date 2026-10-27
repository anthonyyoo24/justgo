import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  stagingTarget as target,
  releaseContext,
  requireRelease,
  validateDeployment,
  validateProbe,
  validateUpload,
  candidateReceipt,
  isSourceSha,
} from './staging-api.mjs';

// All child output stays private: provider failures can contain credentials/content.
const executeFile = promisify(execFile);
export async function privateCommand(command, args, options = {}) {
  try {
    const result = await executeFile(command, args, {
      encoding: 'utf8',
      timeout: 12 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
      ...options,
    });
    return result.stdout;
  } catch {
    throw new Error('STAGING_COMMAND_FAILED');
  }
}
export async function stagingApi(operation, options = {}) {
  const env = options.env ?? process.env;
  const context = releaseContext(env);
  requireRelease(Boolean(env.VERCEL_TOKEN), 'STAGING_VERCEL_TOKEN_REQUIRED');
  requireRelease(
    Boolean(env.VERCEL_AUTOMATION_BYPASS_SECRET),
    'STAGING_EXISTING_BYPASS_SECRET_REQUIRED',
  );
  // Project-only tokens cannot read /user. Seed only the known nonsecret scope
  // mapping so the pinned CLI does not try that unrelated identity lookup.
  const directory = mkdtempSync(join(env.RUNNER_TEMP, 'justgo-api-cli-'));
  try {
    const config = join(directory, 'com.vercel.cli');
    mkdirSync(config, { mode: 0o700 });
    writeFileSync(
      join(config, 'config.json'),
      JSON.stringify({
        currentTeam: target.team,
        cachedTeamIds: { [target.scope]: target.team },
        cachedTeamSlugs: {
          [target.team]: { slug: target.scope, savedAt: Date.now() },
        },
        updates: { auto: false },
      }),
      { mode: 0o600, flag: 'wx' },
    );
    return await runStagingApi(operation, {
      ...options,
      context,
      env: {
        ...env,
        XDG_CONFIG_HOME: directory,
        XDG_DATA_HOME: directory,
        XDG_CACHE_HOME: directory,
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
async function runStagingApi(
  operation,
  {
    env = process.env,
    run = privateCommand,
    root = process.cwd(),
    signal,
    beforePromote,
    context,
    summary = (text) => {
      if (env.GITHUB_STEP_SUMMARY)
        appendFileSync(env.GITHUB_STEP_SUMMARY, text);
    },
  } = {},
) {
  const vc = (args) => {
    requireRelease(!signal?.aborted, 'STAGING_DATABASE_LEASE_LOST');
    const split = args.indexOf('--');
    // curl forwards unrecognized CLI flags to curl, including --non-interactive.
    const flags = [
      '--scope',
      target.scope,
      ...(args[0] === 'curl' ? [] : ['--non-interactive']),
    ];
    return run(
      'vercel',
      split < 0
        ? [...args, ...flags]
        : [...args.slice(0, split), ...flags, ...args.slice(split)],
      { cwd: root, env, signal },
    );
  };
  const api = async (path) =>
    JSON.parse(
      await vc([
        'api',
        `${path}${path.includes('?') ? '&' : '?'}teamId=${target.team}`,
        '--method',
        'GET',
      ]),
    );
  const deployment = (id) => api(`/v13/deployments/${id}`);
  const baseline = validateDeployment(await deployment(target.alias));
  const previousSha =
    baseline.meta?.justgoSourceSha ?? baseline.meta?.githubCommitSha;
  requireRelease(isSourceSha(previousSha), 'STAGING_BASELINE_SOURCE_REQUIRED');
  requireRelease(
    (await run('git', ['rev-parse', 'HEAD'], { cwd: root, signal })).trim() ===
      context.sha &&
      !(
        await run('git', ['status', '--porcelain'], { cwd: root, signal })
      ).trim(),
    'STAGING_SOURCE_NOT_CLEAN',
  );
  if (operation === 'preflight')
    return { deploymentId: baseline.id, sourceSha: previousSha };
  requireRelease(
    operation === 'deploy' &&
      typeof beforePromote === 'function' &&
      env.STAGING_BASELINE_ID === baseline.id &&
      env.STAGING_BASELINE_SHA === previousSha,
    'STAGING_BASELINE_CHANGED',
  );
  const version = (await vc(['--version'])).trim();
  requireRelease(
    version === 'Vercel CLI 64.5.0' || version === '64.5.0',
    'PINNED_VERCEL_REQUIRED',
  );
  const project = await api(`/v9/projects/${target.project}`);
  requireRelease(
    project.id === target.project &&
      project.accountId === target.team &&
      project.rootDirectory === 'apps/api' &&
      project.framework === 'fastify' &&
      project.nodeVersion === '24.x' &&
      !project.link,
    'STAGING_PROJECT_CONFIGURATION_MISMATCH',
  );
  const manifest = JSON.parse(
    await vc(['deploy', '--dry', '--json', '--project', target.project]),
  );
  const tracked = (await run('git', ['ls-files', '-z'], { cwd: root, signal }))
    .split('\0')
    .filter(Boolean);
  const uploadSha256 = validateUpload(manifest, tracked, root);
  // Production-built candidate preserves the tested artifact when promoted.
  const output = (
    await vc([
      'deploy',
      '--json',
      '--prod',
      '--skip-domain',
      '--yes',
      '--project',
      target.project,
      '--regions',
      'yul1',
      '--env',
      'APP_ENVIRONMENT=staging',
      '--env',
      `JUSTGO_SOURCE_SHA=${context.sha}`,
      '--env',
      `API_SENTRY_RELEASE=${context.sha}`,
      '--meta',
      `githubCommitSha=${context.sha}`,
      '--meta',
      `justgoSourceSha=${context.sha}`,
      '--meta',
      `justgoRunId=${context.runId}`,
      '--meta',
      `justgoRunAttempt=${context.attempt}`,
    ])
  ).trim();
  const deploymentReceipt = candidateReceipt(output);
  const candidate = validateDeployment(
    await deployment(deploymentReceipt.id),
    context,
  );
  requireRelease(
    candidate.id === deploymentReceipt.id &&
      `https://${candidate.url}` === deploymentReceipt.url,
    'CANDIDATE_RECEIPT_PROVENANCE_MISMATCH',
  );
  // --skip-domain must preserve the public target before any candidate probes.
  requireRelease(
    validateDeployment(await deployment(target.alias)).id === baseline.id,
    'STAGING_ALIAS_CHANGED_DURING_CANDIDATE_BUILD',
  );
  const temporary = mkdtempSync(join(env.RUNNER_TEMP, 'justgo-api-probes-'));
  const probe = async (path, kind, publicOrigin = false) => {
    requireRelease(!signal?.aborted, 'STAGING_DATABASE_LEASE_LOST');
    const headersPath = join(temporary, 'headers'),
      bodyPath = join(temporary, 'body');
    const args = [
      '--silent',
      '--show-error',
      '--max-time',
      '20',
      '--dump-header',
      headersPath,
      '--output',
      bodyPath,
      '--write-out',
      '%{http_code}',
    ];
    const status = Number(
      publicOrigin
        ? await run('curl', [...args, `https://${target.alias}${path}`], {
            env,
            signal,
          })
        : await vc(['curl', path, '--deployment', candidate.id, '--', ...args]),
    );
    const headers = {};
    for (const line of readFileSync(headersPath, 'utf8').split(/\r?\n/)) {
      if (/^HTTP\//.test(line)) {
        for (const key of Object.keys(headers)) delete headers[key];
      }
      const index = line.indexOf(':');
      if (index > 0)
        headers[line.slice(0, index).toLowerCase()] = line
          .slice(index + 1)
          .trim();
    }
    validateProbe(
      { status, headers, body: readFileSync(bodyPath, 'utf8') },
      kind,
      context.sha,
    );
  };
  try {
    await probe('/health', 'health');
    await probe('/ready', 'ready');
    await probe('/v1/journal-sync?limit=1', 'unauthorized');
    await probe('/v1/completion-restores?limit=1', 'unauthorized');
    requireRelease(
      validateDeployment(await deployment(target.alias)).id === baseline.id,
      'STAGING_ALIAS_CHANGED_BEFORE_PROMOTION',
    );
    await beforePromote();
    requireRelease(!signal?.aborted, 'STAGING_DATABASE_LEASE_LOST');
    await vc(['promote', candidate.id]);
    requireRelease(
      validateDeployment(await deployment(target.alias), context).id ===
        candidate.id,
      'STAGING_PROMOTION_UNCONFIRMED',
    );
    await probe('/health', 'health', true);
    await probe('/ready', 'ready', true);
    await probe('/v1/journal-sync?limit=1', 'unauthorized', true);
    const receipt = {
      sourceSha: context.sha,
      deploymentId: candidate.id,
      previousDeploymentId: baseline.id,
      uploadSha256,
      runId: context.runId,
      runAttempt: context.attempt,
    };
    summary(
      `Staging API verified: \`${context.sha}\` → \`${candidate.id}\`. Previous deployment: \`${baseline.id}\`. No automatic rollback is performed.\n`,
    );
    return receipt;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    console.info(JSON.stringify(await stagingApi(process.argv[2])));
  } catch {
    console.error(
      'Staging API release failed; inspect deployment state before retrying. No automatic rollback was performed.',
    );
    process.exitCode = 1;
  }
}
