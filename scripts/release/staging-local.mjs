import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import {
  lstatSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  isSourceSha,
  requireRelease,
  cloudflareTarget,
} from './staging-api.mjs';
import {
  privateCommand,
  runStagingDeployment,
} from './staging-api-deployment.mjs';
import { buildStagingWorker } from './staging-worker-build.mjs';
import { localTestDatabaseUrl } from '../../apps/api/scripts/local-test-database.ts';

const invalid = 'INVALID_LOCAL_STAGING_CONTEXT';
const configurationFailure = 'INVALID_LOCAL_STAGING_CONFIGURATION';
const isPhaseBranch = (branch) =>
  typeof branch === 'string' &&
  branch.length > 0 &&
  branch !== 'main' &&
  !branch.startsWith('-') &&
  !/\s/.test(branch);

export function localReleaseArguments(args) {
  requireRelease(args.length === 7, invalid);
  const [
    mode,
    branchFlag,
    phaseBranch,
    sourceFlag,
    sha,
    credentialsFlag,
    credentials,
  ] = args;
  requireRelease(
    ['--prepare', '--deploy'].includes(mode) &&
      branchFlag === '--phase-branch' &&
      isPhaseBranch(phaseBranch) &&
      sourceFlag === '--source' &&
      isSourceSha(sha) &&
      credentialsFlag === '--credentials' &&
      typeof credentials === 'string' &&
      credentials.length > 0,
    invalid,
  );
  return { deploy: mode === '--deploy', phaseBranch, sha, credentials };
}

/** No remote Git operation and no fabricated GitHub environment. */
export async function assertLocalSource(
  { sha, phaseBranch },
  { root = process.cwd(), run = privateCommand, signal } = {},
) {
  requireRelease(isSourceSha(sha) && isPhaseBranch(phaseBranch), invalid);
  const git = async (...args) =>
    (await run('git', args, { cwd: root, signal })).trim();
  requireRelease(
    (await git('branch', '--show-current')) === phaseBranch &&
      (await git('rev-parse', 'HEAD')) === sha &&
      !(await git('status', '--porcelain')),
    'STAGING_SOURCE_NOT_CLEAN',
  );
}

export async function localStagingContext(
  source,
  { env = process.env, root, run, signal } = {},
) {
  requireRelease(
    !['CI', 'GITHUB_ACTIONS', 'GITHUB_RUN_ID', 'VERCEL', 'EAS_BUILD'].some(
      (name) => env[name] && env[name] !== 'false' && env[name] !== '0',
    ) &&
      !env.MIGRATION_PLAN_SHA256 &&
      !env.STAGING_ABANDONED_VERSION_ID &&
      !env.STAGING_RECOVERY_ATTESTATION &&
      (!env.RELEASE_OPERATION || env.RELEASE_OPERATION === 'deploy'),
    invalid,
  );
  await assertLocalSource(source, { root, run, signal });
  return Object.freeze({
    sha: source.sha,
    phaseBranch: source.phaseBranch,
    runId: `local-${randomUUID()}`,
    attempt: '1',
  });
}

const fields = [
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_WORKERS_SUBDOMAIN',
  'STAGING_HYPERDRIVE_ID',
  'MIGRATION_DATABASE_URL',
  'DATABASE_CA_CERT',
];

/** Read one explicitly selected owner-only file, never dotenv or GitHub secrets. */
export function localReleaseConfiguration(path) {
  try {
    const file = lstatSync(path);
    requireRelease(
      file.isFile() &&
        !file.isSymbolicLink() &&
        file.nlink === 1 &&
        file.uid === process.getuid() &&
        (file.mode & 0o077) === 0,
      configurationFailure,
    );
    const input = JSON.parse(readFileSync(path, 'utf8'));
    requireRelease(
      input &&
        typeof input === 'object' &&
        !Array.isArray(input) &&
        Object.keys(input).every((name) => fields.includes(name)),
      configurationFailure,
    );
    const values = Object.fromEntries(
      fields.map((name) => [name, input[name]]),
    );
    requireRelease(
      fields.every(
        (name) =>
          typeof values[name] === 'string' &&
          (name === 'MIGRATION_DATABASE_URL' || values[name].length > 0) &&
          !values[name].includes('[SENSITIVE]'),
      ) && !/[\r\n]/.test(values.CLOUDFLARE_API_TOKEN),
      configurationFailure,
    );
    cloudflareTarget(values);
    return values;
  } catch {
    requireRelease(false, configurationFailure);
  }
}

/** The build receives only public target configuration; DB/CA secrets stay here. */
export function localBuildEnvironment(configuration, env = process.env) {
  return {
    ...(env.PATH ? { PATH: env.PATH } : {}),
    ...(env.HOME ? { HOME: env.HOME } : {}),
    CLOUDFLARE_API_TOKEN: configuration.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: configuration.CLOUDFLARE_ACCOUNT_ID,
    CLOUDFLARE_WORKERS_SUBDOMAIN: configuration.CLOUDFLARE_WORKERS_SUBDOMAIN,
    STAGING_HYPERDRIVE_ID: configuration.STAGING_HYPERDRIVE_ID,
  };
}

/** Publication checks can use only the dedicated loopback test database. */
export function localPublicationEnvironment(root, env = process.env) {
  const input = parseEnv(readFileSync(resolve(root, 'apps/api/.env'), 'utf8'));
  for (const [name, role] of [
    ['DATABASE_URL', 'justgo_runtime'],
    ['MIGRATION_DATABASE_URL', 'justgo_migrator'],
    ['JUSTGO_TEST_ADMIN_DATABASE_URL', 'postgres'],
  ])
    requireRelease(
      localTestDatabaseUrl(input[name]).username === role,
      configurationFailure,
    );
  requireRelease(input.DATABASE_SSL === 'disable', configurationFailure);
  return {
    ...(env.PATH ? { PATH: env.PATH } : {}),
    ...(env.HOME ? { HOME: env.HOME } : {}),
    ...(env.JUSTGO_PG_BIN ? { JUSTGO_PG_BIN: env.JUSTGO_PG_BIN } : {}),
    DATABASE_URL: input.DATABASE_URL,
    MIGRATION_DATABASE_URL: input.MIGRATION_DATABASE_URL,
    JUSTGO_TEST_ADMIN_DATABASE_URL: input.JUSTGO_TEST_ADMIN_DATABASE_URL,
    DATABASE_SSL: 'disable',
    DATABASE_POOL_MAX: '1',
  };
}

export async function runLocalPublicationChecks(
  root,
  { run = privateCommand, env = process.env } = {},
) {
  const childEnvironment = localPublicationEnvironment(root, env);
  const commands = [
    ['run', 'doctor', '-w', '@justgo/mobile'],
    ['run', 'check:static'],
    ['run', 'test:coverage'],
    ['run', 'test:workers'],
    [
      'run',
      'test:journey',
      '--',
      'e2e/provider-sign-in.spec.ts',
      'e2e/local-sync.spec.ts',
      'e2e/account-deletion.spec.ts',
    ],
  ];
  for (const args of commands)
    await run('npm', args, { cwd: root, env: childEnvironment });
  return [
    'doctor',
    'check:static',
    'coverage-including-database',
    'workers',
    'selected-journeys',
  ];
}

/** Explicit local entry. The GitHub wrapper and its main-only checks are unchanged. */
export async function localStagingApi(operation, options) {
  requireRelease(['preflight', 'deploy'].includes(operation), invalid);
  const { context, ...rest } = options;
  requireRelease(
    isSourceSha(context?.sha) &&
      /^local-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        context?.runId,
      ) &&
      context.attempt === '1',
    invalid,
  );
  await assertLocalSource(context, rest);
  return runStagingDeployment(operation, {
    ...rest,
    context,
    provenance: 'Local',
  });
}

export async function prepareLocalBundle(
  context,
  env,
  root = process.cwd(),
  { signal } = {},
) {
  const parent = resolve(root, '.local/phase15-cloudflare/local-releases');
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const directory = mkdtempSync(join(parent, 'prepare-'));
  try {
    await assertLocalSource(context, { root, signal });
    const bundle = await buildStagingWorker({
      root,
      directory,
      target: cloudflareTarget(env),
      context,
      env,
      run: privateCommand,
      signal,
    });
    requireRelease(!signal?.aborted, 'STAGING_DATABASE_LEASE_LOST');
    await assertLocalSource(context, { root, signal });
    return { uploadSha256: bundle.uploadSha256, bytes: bundle.content.length };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
