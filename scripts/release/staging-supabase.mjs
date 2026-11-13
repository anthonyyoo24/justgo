import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv, promisify } from 'node:util';
import { buildEdge } from '../../apps/api/scripts/edge-build.mjs';
import {
  stagingProbe,
  verifyPublicStagingProbes,
} from './staging-public-probes.mjs';
import {
  isSourceSha,
  releaseContext,
  requireRelease,
  StagingRunnerFailure,
  stagingRunnerFailureCode,
  validateProbe,
} from './staging-api.mjs';

const executeFile = promisify(execFile);

/** The staging project that serves the API and its Auth. */
export const stagingProjectRef = 'kmcpcauaxlgpevkkenwd';
export const stagingFunctions = Object.freeze({
  serving: 'api',
  candidate: 'api-candidate',
});

/**
 * Names the staging function may hold as secrets. Supabase injects SUPABASE_*,
 * and the bundle names its own release, so neither is set here.
 */
export const functionSecretNames = Object.freeze([
  'NODE_ENV',
  'APP_ENVIRONMENT',
  'DATABASE_URL',
  'DATABASE_SSL',
  'DATABASE_CA_CERT',
  'IDENTITY_RATE_LIMIT_KEY',
  'MANAGED_AUTH_ENABLED',
  'JUSTGO_AUTH_PUBLISHABLE_KEY',
  'JUSTGO_AUTH_SECRET_KEY',
  'API_SENTRY_ENABLED',
  'API_SENTRY_DSN',
  'CORS_ORIGINS',
  'LOG_LEVEL',
  'IDENTITY_SESSION_HOURS',
  'IDENTITY_TRANSFER_MINUTES',
  'IDENTITY_RECOVERY_RATE_LIMIT',
  'ACTIVITY_WRITE_RATE_LIMIT',
  'ACCOUNT_EXPORT_RATE_LIMIT',
  'BETA_ACCESS_GRANTS',
  'BETA_ACCESS_WINDOW',
]);
const requiredSecretNames = [
  'NODE_ENV',
  'APP_ENVIRONMENT',
  'DATABASE_URL',
  'DATABASE_CA_CERT',
  'IDENTITY_RATE_LIMIT_KEY',
  'MANAGED_AUTH_ENABLED',
  'JUSTGO_AUTH_PUBLISHABLE_KEY',
  'JUSTGO_AUTH_SECRET_KEY',
];

/** Read the public target and the CLI token's presence, never its value. */
export function supabaseTarget(env) {
  requireRelease(
    env.SUPABASE_PROJECT_REF === stagingProjectRef &&
      typeof env.SUPABASE_ACCESS_TOKEN === 'string' &&
      env.SUPABASE_ACCESS_TOKEN.length > 0 &&
      !/[\r\n]/.test(env.SUPABASE_ACCESS_TOKEN),
    'STAGING_SUPABASE_CONFIGURATION_REQUIRED',
  );
  return Object.freeze({
    ref: stagingProjectRef,
    origin: `https://${stagingProjectRef}.supabase.co`,
  });
}

/** The CLI sees the token and nothing from the database step. */
export function cliEnvironment(env) {
  return Object.fromEntries(
    Object.entries({
      PATH: env.PATH,
      HOME: env.HOME,
      DOCKER_HOST: env.DOCKER_HOST,
      SUPABASE_ACCESS_TOKEN: env.SUPABASE_ACCESS_TOKEN,
      DO_NOT_TRACK: '1',
      SUPABASE_TELEMETRY_DISABLED: '1',
    }).filter(([, value]) => value !== undefined),
  );
}

export async function supabaseCommand(args, options = {}) {
  try {
    const result = await executeFile('supabase', args, {
      encoding: 'utf8',
      timeout: 10 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
      ...options,
    });
    return result.stdout;
  } catch {
    // CLI output can echo a request; report a fixed code only.
    throw new StagingRunnerFailure('STAGING_COMMAND_FAILED');
  }
}

/** The four CLI calls the lane makes, each pinned to the staging project. */
export function supabaseCli({
  target,
  env,
  root,
  signal,
  run = supabaseCommand,
}) {
  const remote = `--remote=${target.ref}`;
  const options = { cwd: root, env: cliEnvironment(env), signal };
  const json = async (args) => {
    const output = await run(args, options);
    try {
      return JSON.parse(output);
    } catch {
      throw new StagingRunnerFailure('STAGING_SUPABASE_DEPLOY_UNCONFIRMED');
    }
  };
  return {
    deploy: async (name) => {
      await run(['functions', 'deploy', name, remote, '--yes'], options);
    },
    functions: () => json(['functions', 'list', '--output', 'json', remote]),
    setSecrets: async (file) => {
      await run(
        ['secrets', 'set', '--env-file', file, remote, '--yes'],
        options,
      );
    },
    secrets: () => json(['secrets', 'list', '--output', 'json', remote]),
  };
}

/** One function from `functions list`, or undefined when it does not exist. */
export function listedFunction(list, name) {
  requireRelease(Array.isArray(list), 'STAGING_SUPABASE_DEPLOY_UNCONFIRMED');
  const found = list.filter((item) => item?.slug === name);
  requireRelease(found.length <= 1, 'STAGING_SUPABASE_DEPLOY_UNCONFIRMED');
  const [item] = found;
  if (!item) return undefined;
  requireRelease(
    Number.isInteger(item.version) &&
      item.version > 0 &&
      item.status === 'ACTIVE' &&
      item.verify_jwt === false,
    'STAGING_SUPABASE_DEPLOY_UNCONFIRMED',
  );
  return {
    version: item.version,
    ...(typeof item.ezbr_sha256 === 'string'
      ? { ezbrSha256: item.ezbr_sha256 }
      : {}),
  };
}

/** Probe one function by name; the gateway serves it under /functions/v1/<name>. */
export function functionProbe(target, fetch) {
  return (name, path, options = {}) =>
    stagingProbe(target.origin, `/functions/v1/${name}${path}`, {
      ...options,
      ...(fetch ? { fetch } : {}),
    });
}

/** The source SHA a healthy staging API names about itself. */
export function servingSha(response) {
  const sha = response?.headers?.['x-justgo-source-sha'];
  requireRelease(isSourceSha(sha), 'STAGING_HEALTH_FAILED');
  validateProbe(response, 'health', sha);
  return sha;
}

/** Read what staging serves now. Its /health names the previous API. */
export async function readServing({ cli, probe }) {
  const serving = listedFunction(
    await cli.functions(),
    stagingFunctions.serving,
  );
  requireRelease(serving, 'STAGING_SUPABASE_FUNCTION_MISSING');
  return {
    version: serving.version,
    sha: servingSha(await probe(stagingFunctions.serving, '/health')),
  };
}

async function deployed(cli, name) {
  const listed = listedFunction(await cli.functions(), name);
  requireRelease(listed, 'STAGING_SUPABASE_DEPLOY_UNCONFIRMED');
  return listed;
}

async function deploy(cli, name) {
  try {
    await cli.deploy(name);
  } catch (error) {
    // A lost response may still have uploaded. The next run reads back first.
    throw stagingRunnerFailureCode(error) === 'STAGING_COMMAND_FAILED'
      ? new StagingRunnerFailure('STAGING_SUPABASE_DEPLOY_UNCONFIRMED')
      : error;
  }
  return deployed(cli, name);
}

/**
 * Release one source to staging. The candidate gets the bundle first and must
 * pass every public probe before the serving function changes. A rerun reads
 * the serving state before it deploys anything, so a release that already
 * reached `api` stops there.
 */
export async function releaseSupabaseFunction({
  context,
  target,
  cli,
  previous,
  build,
  probe,
  verify = verifyPublicStagingProbes,
  beforeServing = async () => {},
  signal,
}) {
  requireRelease(isSourceSha(context?.sha), 'INVALID_STAGING_RELEASE_CONTEXT');
  const receipt = {
    event: 'staging_supabase_release',
    project: target.ref,
    sourceSha: context.sha,
    previousApiSha: previous.sha,
    ...(previous.version ? { previousVersion: previous.version } : {}),
  };
  if (previous.sha === context.sha)
    return {
      ...receipt,
      status: 'unchanged',
      servingVersion: previous.version,
    };

  const bundle = await build();
  const prior = listedFunction(
    await cli.functions(),
    stagingFunctions.candidate,
  )
    ? await probe(stagingFunctions.candidate, '/health', { signal }).then(
        (response) => servingSha(response),
        () => undefined,
      )
    : undefined;
  const candidate = await deploy(cli, stagingFunctions.candidate);
  await verify({
    origin: `${target.origin}/functions/v1/${stagingFunctions.candidate}`,
    candidateSha: context.sha,
    previousSha: prior,
    signal,
    probe: (_origin, path, options) =>
      probe(stagingFunctions.candidate, path, options),
  });

  await beforeServing();
  const serving = await deploy(cli, stagingFunctions.serving);
  await verify({
    origin: `${target.origin}/functions/v1/${stagingFunctions.serving}`,
    candidateSha: context.sha,
    previousSha: previous.sha,
    signal,
    probe: (_origin, path, options) =>
      probe(stagingFunctions.serving, path, options),
  });
  const after = await deployed(cli, stagingFunctions.serving);
  requireRelease(
    after.version === serving.version,
    'STAGING_SUPABASE_DEPLOY_UNCONFIRMED',
  );
  return {
    ...receipt,
    status: 'deployed',
    uploadSha256: bundle.uploadSha256,
    bytes: bundle.bytes,
    candidateVersion: candidate.version,
    servingVersion: serving.version,
  };
}

/** The runtime role through the transaction pooler of this project only. */
function poolerUrl(value) {
  try {
    const url = new URL(value);
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.port === '6543' &&
      decodeURIComponent(url.username) ===
        `justgo_runtime.${stagingProjectRef}` &&
      url.password.length > 0
    );
  } catch {
    return false;
  }
}

/** Accept only allowed, non-empty names. The receipt keeps names, never values. */
export function functionSecrets(text) {
  let values;
  try {
    values = parseEnv(text ?? '');
  } catch {
    throw new StagingRunnerFailure('STAGING_SUPABASE_SECRETS_REJECTED');
  }
  const names = Object.keys(values).sort();
  requireRelease(
    names.length > 0 &&
      names.every(
        (name) =>
          functionSecretNames.includes(name) &&
          typeof values[name] === 'string' &&
          values[name].length > 0 &&
          // Only the PEM certificate spans lines.
          (name === 'DATABASE_CA_CERT' || !/[\r\n]/.test(values[name])),
      ) &&
      requiredSecretNames.every((name) => names.includes(name)) &&
      values.APP_ENVIRONMENT === 'staging' &&
      values.NODE_ENV === 'production' &&
      values.MANAGED_AUTH_ENABLED === 'true' &&
      poolerUrl(values.DATABASE_URL) &&
      values.DATABASE_CA_CERT.includes('-----BEGIN CERTIFICATE-----') &&
      values.JUSTGO_AUTH_SECRET_KEY.length >= 32 &&
      values.IDENTITY_RATE_LIMIT_KEY.length >= 32,
    'STAGING_SUPABASE_SECRETS_REJECTED',
  );
  return { values, names };
}

/**
 * `supabase secrets set --env-file` parses with dotenv, which expands `\n`
 * only inside double quotes. Quote each value with a mark it does not hold.
 */
export function envFileText(values) {
  return Object.entries(values)
    .map(([name, value]) => {
      const quote = ["'", '`', '"'].find(
        (candidate) =>
          !value.includes(candidate) &&
          !value.endsWith('\\') &&
          (candidate !== '"' || !/\\[nr]/.test(value)),
      );
      requireRelease(quote, 'STAGING_SUPABASE_SECRETS_REJECTED');
      return `${name}=${quote}${value}${quote}\n`;
    })
    .join('');
}

/**
 * Set the project's function secrets without a deploy, then confirm each name
 * is listed and that the serving function, if any, still answers ready.
 */
export async function setSupabaseSecrets({
  text,
  target,
  cli,
  probe,
  temporaryRoot = tmpdir(),
}) {
  const { values, names } = functionSecrets(text);
  const directory = mkdtempSync(join(temporaryRoot, 'justgo-supabase-'));
  try {
    const file = join(directory, 'function.env');
    writeFileSync(file, envFileText(values), { mode: 0o600 });
    await cli.setSecrets(file);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const listed = await cli.secrets();
  requireRelease(
    Array.isArray(listed) &&
      names.every((name) => listed.some((secret) => secret?.name === name)),
    'STAGING_SUPABASE_SECRETS_UNCONFIRMED',
  );
  const serving = listedFunction(
    await cli.functions(),
    stagingFunctions.serving,
  );
  let servingSource;
  if (serving) {
    servingSource = servingSha(
      await probe(stagingFunctions.serving, '/health'),
    );
    validateProbe(
      await probe(stagingFunctions.serving, '/ready'),
      'ready',
      servingSource,
    );
  }
  return {
    event: 'staging_supabase_secrets',
    project: target.ref,
    names,
    deployed: false,
    ...(serving
      ? { servingVersion: serving.version, servingSha: servingSource }
      : {}),
  };
}

/** The protected GitHub entry. Deploys run through staging-release.ts. */
export function supabaseLane({ env = process.env, root, signal } = {}) {
  const context = releaseContext(env);
  const target = supabaseTarget(env);
  const repository = root ?? resolve(import.meta.dirname, '../..');
  const cli = supabaseCli({ target, env, root: repository, signal });
  const probe = functionProbe(target);
  let previous;
  const preflight = () => (previous ??= readServing({ cli, probe }));
  return {
    context,
    target,
    preflight,
    deploy: async ({ beforeServing }) =>
      releaseSupabaseFunction({
        context,
        target,
        cli,
        previous: await preflight(),
        build: () => buildEdge({ root: repository, sourceSha: context.sha }),
        probe,
        beforeServing,
        signal,
      }),
    secrets: () =>
      setSupabaseSecrets({
        text: env.STAGING_FUNCTION_SECRETS,
        target,
        cli,
        probe,
        temporaryRoot: env.RUNNER_TEMP ?? tmpdir(),
      }),
  };
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    requireRelease(
      process.argv[2] === 'secrets' &&
        process.env.RELEASE_OPERATION === 'secrets',
      'INVALID_STAGING_GUARD_ARGUMENTS',
    );
    console.info(JSON.stringify(await supabaseLane().secrets()));
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'staging_supabase_secrets_failed',
        code: stagingRunnerFailureCode(error) ?? 'STAGING_RUNNER_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}
