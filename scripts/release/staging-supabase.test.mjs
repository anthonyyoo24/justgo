import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseEnv } from 'node:util';
import { stagingRunnerFailureCode } from './staging-api.mjs';
import {
  envFileText,
  functionSecrets,
  readServing,
  releaseSupabaseFunction,
  setSupabaseSecrets,
  stagingProjectRef,
  supabaseCli,
  supabaseTarget,
} from './staging-supabase.mjs';

const older = 'a'.repeat(40);
const newer = 'b'.repeat(40);
const target = supabaseTarget({
  SUPABASE_PROJECT_REF: stagingProjectRef,
  SUPABASE_ACCESS_TOKEN: 'synthetic-token',
  STAGING_WORKER_ORIGIN: 'https://justgo-api-staging.example.workers.dev',
});

function response(sha, path, { ready = true } = {}) {
  const id = randomUUID();
  const headers = {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-request-id': id,
    'x-justgo-source-sha': sha,
    'x-justgo-environment': 'staging',
  };
  if (path.startsWith('/v1/'))
    return {
      status: 401,
      headers,
      body: JSON.stringify({ code: 'UNAUTHORIZED', requestId: id }),
    };
  if (path === '/health')
    return {
      status: 200,
      headers,
      body: JSON.stringify({ status: 'ok', service: 'justgo-api' }),
    };
  return ready
    ? { status: 200, headers, body: JSON.stringify({ status: 'ready' }) }
    : { status: 503, headers, body: JSON.stringify({ status: 'unavailable' }) };
}

/** A fake project: deployed functions, the Worker and every CLI call. */
function project({
  functions = {},
  workerSha = older,
  broken = new Set(),
} = {}) {
  const state = { functions: { ...functions }, workerSha };
  const events = [];
  let lose;
  const cli = {
    deploy: async (name) => {
      events.push(`deploy ${name}`);
      const current = state.functions[name];
      state.functions[name] = {
        version: (current?.version ?? 0) + 1,
        sha: state.building,
      };
      if (lose === name) {
        lose = undefined;
        throw Object.assign(new Error('killed'), { synthetic: true });
      }
    },
    functions: async () =>
      Object.entries(state.functions).map(([slug, item]) => ({
        slug,
        version: item.version,
        status: 'ACTIVE',
        verify_jwt: false,
        ezbr_sha256: 'c'.repeat(64),
      })),
    setSecrets: async (file) => {
      events.push('secrets set');
      state.secretFile = file;
      state.secrets = Object.keys(parseEnv(readFileSync(file, 'utf8')));
    },
    secrets: async () =>
      (state.secrets ?? []).map((name) => ({ name, value: 'digest' })),
  };
  const probe = async (name, path) => {
    const item = state.functions[name];
    if (!item) throw new Error('missing function');
    return response(item.sha, path, { ready: !broken.has(item.sha) });
  };
  const worker = async (_origin, path) => response(state.workerSha, path);
  return {
    state,
    events,
    cli,
    probe,
    worker,
    loseNext: (name) => {
      lose = name;
    },
  };
}

async function release(world, sha, options = {}) {
  world.state.building = sha;
  const previous = await readServing({
    target,
    cli: world.cli,
    probe: world.probe,
    workerProbe: world.worker,
  });
  return releaseSupabaseFunction({
    context: { sha },
    target,
    cli: world.cli,
    previous,
    build: async () => {
      world.events.push('build');
      return { uploadSha256: 'd'.repeat(64), bytes: 2_200_000 };
    },
    probe: world.probe,
    beforeServing: async () => {
      world.events.push('lease');
      await options.beforeServing?.();
    },
  });
}

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(stagingRunnerFailureCode(error), code);
    return true;
  });
}

test('the first deploy reads the Worker, then probes the candidate before the serving function changes', async () => {
  const world = project();
  const receipt = await release(world, newer);
  assert.deepEqual(world.events, [
    'build',
    'deploy api-candidate',
    'lease',
    'deploy api',
  ]);
  assert.deepEqual(receipt, {
    event: 'staging_supabase_release',
    project: stagingProjectRef,
    sourceSha: newer,
    previousApiSha: older,
    previousHost: 'worker',
    status: 'deployed',
    uploadSha256: 'd'.repeat(64),
    bytes: 2_200_000,
    candidateVersion: 1,
    servingVersion: 1,
  });
  assert.equal(world.state.functions.api.sha, newer);
});

test('an unchanged serving SHA builds and deploys nothing', async () => {
  const world = project({ functions: { api: { version: 4, sha: newer } } });
  const receipt = await release(world, newer);
  assert.deepEqual(world.events, []);
  assert.equal(receipt.status, 'unchanged');
  assert.equal(receipt.servingVersion, 4);
});

test('a failed candidate probe stops before the lease check and leaves api untouched', async () => {
  const world = project({
    functions: { api: { version: 2, sha: older } },
    broken: new Set([newer]),
  });
  await rejectsWith(release(world, newer), 'STAGING_READINESS_FAILED');
  assert.deepEqual(world.events, ['build', 'deploy api-candidate']);
  assert.deepEqual(world.state.functions.api, { version: 2, sha: older });
});

test('a lost lease stops before the serving deploy', async () => {
  const world = project({ functions: { api: { version: 2, sha: older } } });
  await assert.rejects(
    release(world, newer, {
      beforeServing: () => Promise.reject(new Error('lease lost')),
    }),
    /lease lost/,
  );
  assert.deepEqual(world.state.functions.api, { version: 2, sha: older });
});

test('a lost deploy response fails unconfirmed, and the rerun reads back the serving state before it deploys', async () => {
  const world = project({ functions: { api: { version: 2, sha: older } } });
  const run = world.cli.deploy;
  world.cli.deploy = async (name) => {
    try {
      await run(name);
    } catch {
      const { StagingRunnerFailure } = await import('./staging-api.mjs');
      throw new StagingRunnerFailure('STAGING_COMMAND_FAILED');
    }
  };
  world.loseNext('api');
  await rejectsWith(
    release(world, newer),
    'STAGING_SUPABASE_DEPLOY_UNCONFIRMED',
  );
  assert.equal(world.state.functions.api.sha, newer);
  world.events.length = 0;
  const rerun = await release(world, newer);
  assert.equal(rerun.status, 'unchanged');
  assert.equal(rerun.servingVersion, 3);
  assert.deepEqual(world.events, []);
});

test('a lost candidate response deploys again on the rerun', async () => {
  const world = project({ functions: { api: { version: 2, sha: older } } });
  world.loseNext('api-candidate');
  await assert.rejects(release(world, newer), /killed/);
  assert.equal(world.state.functions.api.sha, older);
  world.events.length = 0;
  const rerun = await release(world, newer);
  assert.equal(rerun.status, 'deployed');
  assert.deepEqual(world.events, [
    'build',
    'deploy api-candidate',
    'lease',
    'deploy api',
  ]);
});

test('a rollback is the same lane on the previous tag', async () => {
  const world = project({
    functions: {
      api: { version: 5, sha: newer },
      'api-candidate': { version: 5, sha: newer },
    },
  });
  const receipt = await release(world, older);
  assert.equal(receipt.status, 'deployed');
  assert.equal(receipt.previousApiSha, newer);
  assert.equal(receipt.previousHost, 'function');
  assert.equal(receipt.servingVersion, 6);
  assert.equal(world.state.functions.api.sha, older);
});

test('with no function and no Worker origin the lane cannot name the previous API', async () => {
  const world = project();
  await rejectsWith(
    readServing({
      target: { ...target, workerOrigin: undefined },
      cli: world.cli,
      probe: world.probe,
      workerProbe: world.worker,
    }),
    'STAGING_SUPABASE_FUNCTION_MISSING',
  );
});

const pem =
  '-----BEGIN CERTIFICATE-----\nMIIBsynthetic\n-----END CERTIFICATE-----';
const secretValues = {
  NODE_ENV: 'production',
  APP_ENVIRONMENT: 'staging',
  MANAGED_AUTH_ENABLED: 'true',
  DATABASE_URL: `postgresql://justgo_runtime.${stagingProjectRef}:synthetic-password@aws-0-ca-central-1.pooler.supabase.com:6543/postgres`,
  DATABASE_SSL: 'verify-full',
  DATABASE_CA_CERT: pem,
  IDENTITY_RATE_LIMIT_KEY: 'r'.repeat(32),
  JUSTGO_AUTH_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
  JUSTGO_AUTH_SECRET_KEY: 's'.repeat(40),
  BETA_ACCESS_WINDOW: '{"startsAt":"2026-11-01T00:00:00Z"}',
};
const secretText = envFileText(secretValues);

test('a secret change deploys nothing and its receipt holds names only', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'justgo-secrets-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const world = project({ functions: { api: { version: 3, sha: older } } });
  const receipt = await setSupabaseSecrets({
    text: secretText,
    target,
    cli: world.cli,
    probe: world.probe,
    temporaryRoot: root,
  });
  assert.deepEqual(world.events, ['secrets set']);
  assert.equal(existsSync(world.state.secretFile), false);
  assert.deepEqual(receipt, {
    event: 'staging_supabase_secrets',
    project: stagingProjectRef,
    names: Object.keys(secretValues).sort(),
    deployed: false,
    servingVersion: 3,
    servingSha: older,
  });
  const text = JSON.stringify(receipt);
  for (const value of [
    'synthetic-password',
    'r'.repeat(32),
    'MIIB',
    's'.repeat(40),
  ])
    assert.equal(text.includes(value), false);
});

test('the env file keeps every value, the PEM lines included', () => {
  assert.deepEqual(parseEnv(secretText), secretValues);
});

test('secrets refuse names the platform or the bundle owns, and a database URL outside the pooler', async () => {
  for (const extra of [
    'SUPABASE_URL=https://other.supabase.co',
    `JUSTGO_SOURCE_SHA=${older}`,
    'API_SENTRY_RELEASE=x',
    'PORT=1',
  ])
    assert.throws(
      () => functionSecrets(`${secretText}${extra}\n`),
      (error) =>
        stagingRunnerFailureCode(error) === 'STAGING_SUPABASE_SECRETS_REJECTED',
    );
  for (const change of [
    { DATABASE_URL: secretValues.DATABASE_URL.replace(':6543', ':5432') },
    {
      DATABASE_URL: secretValues.DATABASE_URL.replace(
        `justgo_runtime.${stagingProjectRef}`,
        'postgres',
      ),
    },
    { APP_ENVIRONMENT: 'production' },
    { JUSTGO_AUTH_SECRET_KEY: 'short' },
    { IDENTITY_RATE_LIMIT_KEY: 'x\ny'.repeat(20) },
  ])
    assert.throws(
      () => functionSecrets(envFileText({ ...secretValues, ...change })),
      (error) =>
        stagingRunnerFailureCode(error) === 'STAGING_SUPABASE_SECRETS_REJECTED',
    );
  const world = project();
  await rejectsWith(
    setSupabaseSecrets({
      text: 'SUPABASE_URL=x\n',
      target,
      cli: world.cli,
      probe: world.probe,
    }),
    'STAGING_SUPABASE_SECRETS_REJECTED',
  );
  assert.deepEqual(world.events, []);
});

test('every CLI call names the staging project and sees only the token', async () => {
  const calls = [];
  const cli = supabaseCli({
    target,
    root: '/repo',
    env: {
      PATH: '/bin',
      SUPABASE_ACCESS_TOKEN: 'synthetic-token',
      MIGRATION_DATABASE_URL: 'postgresql://owner:secret@db/postgres',
      DATABASE_CA_CERT: pem,
    },
    run: async (args, options) => {
      calls.push({ args, options });
      return '[]';
    },
  });
  await cli.deploy('api-candidate');
  await cli.functions();
  await cli.setSecrets('/tmp/function.env');
  await cli.secrets();
  assert.deepEqual(
    calls.map(({ args }) => args),
    [
      [
        'functions',
        'deploy',
        'api-candidate',
        `--remote=${stagingProjectRef}`,
        '--yes',
      ],
      [
        'functions',
        'list',
        '--output',
        'json',
        `--remote=${stagingProjectRef}`,
      ],
      [
        'secrets',
        'set',
        '--env-file',
        '/tmp/function.env',
        `--remote=${stagingProjectRef}`,
        '--yes',
      ],
      ['secrets', 'list', '--output', 'json', `--remote=${stagingProjectRef}`],
    ],
  );
  for (const { options } of calls) {
    assert.equal(options.cwd, '/repo');
    assert.deepEqual(options.env, {
      PATH: '/bin',
      SUPABASE_ACCESS_TOKEN: 'synthetic-token',
      DO_NOT_TRACK: '1',
      SUPABASE_TELEMETRY_DISABLED: '1',
    });
  }
});

test('the target is pinned to the staging project', () => {
  for (const env of [
    {
      SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
      SUPABASE_ACCESS_TOKEN: 'x',
    },
    { SUPABASE_PROJECT_REF: stagingProjectRef },
    { SUPABASE_PROJECT_REF: stagingProjectRef, SUPABASE_ACCESS_TOKEN: 'x\ny' },
    {
      SUPABASE_PROJECT_REF: stagingProjectRef,
      SUPABASE_ACCESS_TOKEN: 'x',
      STAGING_WORKER_ORIGIN: 'http://worker.example',
    },
  ])
    assert.throws(
      () => supabaseTarget(env),
      (error) =>
        stagingRunnerFailureCode(error) ===
        'STAGING_SUPABASE_CONFIGURATION_REQUIRED',
    );
});
