import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import {
  catalogSchema,
  completionAttemptResultSchema,
  managedSessionResponseSchema,
} from '@justgo/contracts';
import { localTestDatabaseUrl } from './local-test-database.js';
import { buildEdge, bundleEdge } from './edge-build.mjs';

const run = promisify(execFile);

/** The Supabase Edge runtime that P15-1 proved, pinned by digest. */
export const edgeRuntimeImage =
  'supabase/edge-runtime:v1.78.0@sha256:0d21a556a2bf1c090d4558f3fcf2897b93de46036f0e8a973444c614ecca2d91';

const root = resolve(import.meta.dirname, '../../..');
const sourceSha = 'b'.repeat(40);
const authOrigin = 'https://justgo-auth.smoke.invalid';
const sentryOrigin = 'https://o1.ingest.us.sentry.io';

export type Variant = { name: string; env: Record<string, string> };
export type Runtime = {
  origin: string;
  stop(): Promise<void>;
  logs(): Promise<string>;
};
/** Starts the function in some runtime and returns its loopback origin. */
export type StartRuntime = (options: {
  functionDirectory: string;
  variants: Variant[];
}) => Promise<Runtime>;

class SmokeFailure extends Error {}

function listen(server: Server) {
  return new Promise<number>((resolveListen) =>
    server.listen(0, '127.0.0.1', () =>
      resolveListen((server.address() as AddressInfo).port),
    ),
  );
}

async function freePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

function encode(value: object) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Run the pinned edge-runtime image with the smoke main service. */
export const startDocker: StartRuntime = async ({
  functionDirectory,
  variants,
}) => {
  try {
    await run('docker', ['image', 'inspect', edgeRuntimeImage]);
  } catch {
    await run('docker', ['pull', edgeRuntimeImage], {
      maxBuffer: 16 * 1024 * 1024,
    });
  }
  const name = `justgo-edge-smoke-${randomBytes(4).toString('hex')}`;
  const port = await freePort();
  await run('docker', [
    'run',
    '-d',
    '--name',
    name,
    '--network',
    'host',
    '-v',
    `${root}:/repo`,
    '-w',
    '/repo',
    '-e',
    `EDGE_SMOKE_FUNCTION=/repo/${relative(root, functionDirectory)}`,
    '-e',
    `EDGE_SMOKE_VARIANTS=${JSON.stringify(variants)}`,
    edgeRuntimeImage,
    'start',
    '--main-service',
    '/repo/apps/api/scripts/edge-smoke-main',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--policy',
    'per_worker',
  ]);
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(`${origin}/_internal/health`)).ok) break;
    } catch {
      /* The runtime is still starting. */
    }
    if (Date.now() > deadline) break;
    await delay(250);
  }
  return {
    origin,
    logs: async () => {
      const output = await run('docker', ['logs', '--tail', '60', name], {
        maxBuffer: 4 * 1024 * 1024,
      }).catch((error: { stdout?: string; stderr?: string }) => error);
      return `${output.stdout ?? ''}${output.stderr ?? ''}`;
    },
    stop: async () => {
      await run('docker', ['rm', '-f', name]).catch(() => undefined);
    },
  };
};

/**
 * Build the production bundle, wrap it with the smoke function and drive the
 * route sequence through the runtime against loopback justgo_test.
 */
export async function runEdgeSmoke(start: StartRuntime) {
  const runtimeUrl = localTestDatabaseUrl(process.env.DATABASE_URL);
  const adminUrl = localTestDatabaseUrl(
    process.env.JUSTGO_TEST_ADMIN_DATABASE_URL,
  );
  if (
    runtimeUrl.username !== 'justgo_runtime' ||
    adminUrl.username !== 'postgres' ||
    process.env.DATABASE_SSL !== 'disable'
  )
    throw new SmokeFailure(
      'Edge smoke requires the loopback runtime and admin roles with local SSL disabled',
    );
  runtimeUrl.hostname = '127.0.0.1';
  adminUrl.hostname = '127.0.0.1';

  await mkdir(resolve(root, '.local/edge'), { recursive: true, mode: 0o700 });
  const folder = await mkdtemp(resolve(root, '.local/edge/smoke-'));
  const functionDirectory = resolve(folder, 'function');
  const admin = new Pool({ connectionString: adminUrl.toString(), ssl: false });
  const publishableKey = `sb_publishable_${randomBytes(12).toString('hex')}`;
  const authSecretKey = `sb_secret_${randomBytes(24).toString('hex')}`;
  const rateKey = randomBytes(32).toString('hex');
  const authTokens = new Map<string, string>();
  const authCalls: string[] = [];
  const envelopes: string[] = [];
  const users = new Set<string>();
  const log: string[] = [];
  let createdAuthSchemas = false;
  let runtime: Runtime | undefined;
  let stage = 'build';

  const authStub = createServer((request, response) => {
    const url = request.url ?? '';
    const reply = (status: number, body: object) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.method === 'GET' && url === '/auth/v1/user') {
      const token = (request.headers.authorization ?? '').slice(7);
      const authUserId = authTokens.get(token);
      if (request.headers.apikey !== publishableKey || !authUserId)
        return reply(401, { code: 401 });
      authCalls.push('GET /auth/v1/user');
      return reply(200, {
        id: authUserId,
        aud: 'authenticated',
        identities: [{ provider: 'apple' }],
      });
    }
    // supabase-js reads the user, then deletes it, with the secret key.
    const admin = /^\/auth\/v1\/admin\/users\/([0-9a-f-]{36})$/.exec(url);
    if (
      (request.method === 'GET' || request.method === 'DELETE') &&
      admin?.[1] &&
      [...authTokens.values()].includes(admin[1]) &&
      (request.headers.apikey === authSecretKey ||
        request.headers.authorization === `Bearer ${authSecretKey}`)
    ) {
      authCalls.push(`${request.method} ${admin[1]}`);
      return reply(200, {
        id: admin[1],
        aud: 'authenticated',
        identities: [{ provider: 'apple' }],
      });
    }
    return reply(404, { code: 404 });
  });
  const sentryStub = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      envelopes.push(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200);
      response.end();
    });
  });

  try {
    const bundle = await buildEdge({
      root,
      directory: resolve(folder, 'build'),
      sourceSha,
    });
    await mkdir(resolve(functionDirectory, 'dist'), { recursive: true });
    for (const file of ['index.ts', 'deno.json'])
      await copyFile(
        resolve(root, 'supabase/functions/api', file),
        resolve(functionDirectory, file),
      );
    await copyFile(
      resolve(folder, 'build/edge.mjs'),
      resolve(functionDirectory, 'dist/production.mjs'),
    );
    await copyFile(
      resolve(folder, 'build/release.mjs'),
      resolve(functionDirectory, 'dist/release.mjs'),
    );
    await bundleEdge({
      root,
      entry: 'apps/api/scripts/edge-smoke-function.ts',
      outfile: resolve(functionDirectory, 'dist/edge.mjs'),
      external: ['./production.mjs'],
    });
    log.push(`bundle ${bundle.bytes} bytes sha256 ${bundle.uploadSha256}`);

    stage = 'database fixture';
    const existing = await admin.query<{ occupied: boolean }>(`select
      to_regnamespace('auth') is not null
      or to_regnamespace('justgo_auth_private') is not null as occupied`);
    if (existing.rows[0]?.occupied)
      throw new SmokeFailure('Edge smoke refuses pre-existing Auth schemas');
    createdAuthSchemas = true;
    for (const role of ['anon', 'authenticated', 'service_role'])
      if (
        !(await admin.query('select 1 from pg_roles where rolname=$1', [role]))
          .rowCount
      )
        await admin.query(`create role ${role} nologin`);
    await admin.query(`create schema auth authorization postgres;
      create table auth.sessions (
        id uuid primary key, user_id uuid not null, not_after timestamptz
      );`);
    await admin.query(
      await readFile(
        resolve(root, 'apps/api/scripts/managed-auth/session-check-v1.sql'),
        'utf8',
      ),
    );

    stage = 'runtime startup';
    const fetchMap = JSON.stringify({
      [authOrigin]: `http://127.0.0.1:${await listen(authStub)}`,
      [sentryOrigin]: `http://127.0.0.1:${await listen(sentryStub)}`,
    });
    const now = Date.now();
    const env = {
      NODE_ENV: 'production',
      APP_ENVIRONMENT: 'staging',
      DATABASE_URL: runtimeUrl.toString(),
      DATABASE_SSL: 'disable',
      LOG_LEVEL: 'silent',
      IDENTITY_RATE_LIMIT_KEY: rateKey,
      MANAGED_AUTH_ENABLED: 'true',
      SUPABASE_URL: authOrigin,
      // Hosted Supabase injects these. The entry must use its own keys.
      SUPABASE_PUBLISHABLE_KEY: 'injected-anon-key',
      SUPABASE_DB_URL: 'postgresql://postgres:injected@127.0.0.1:1/postgres',
      JUSTGO_AUTH_PUBLISHABLE_KEY: publishableKey,
      JUSTGO_AUTH_SECRET_KEY: authSecretKey,
      // The bundle's release module must win over a project-wide secret.
      JUSTGO_SOURCE_SHA: 'c'.repeat(40),
      BETA_ACCESS_WINDOW: JSON.stringify({
        startsAt: new Date(now - 60_000).toISOString(),
        expiresAt: new Date(now + 3_600_000).toISOString(),
      }),
      API_SENTRY_ENABLED: 'true',
      API_SENTRY_DSN: `https://${'c'.repeat(32)}@o1.ingest.us.sentry.io/1`,
      JUSTGO_EDGE_SMOKE_FETCH_MAP: fetchMap,
    };
    const unreachable = new URL(runtimeUrl);
    unreachable.port = '1';
    runtime = await start({
      functionDirectory,
      variants: [
        { name: 'managed', env },
        {
          name: 'invalid',
          env: { ...env, IDENTITY_RATE_LIMIT_KEY: 'too-short' },
        },
        {
          name: 'unreachable',
          env: { ...env, DATABASE_URL: unreachable.toString() },
        },
      ],
    });
    const origin = runtime.origin;
    const call = async (
      method: string,
      path: string,
      options: {
        token?: string;
        body?: object;
        variant?: string;
      } = {},
    ) => {
      const started = performance.now();
      const response = await fetch(origin + path, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
        headers: {
          ...(options.token
            ? { authorization: `Bearer ${options.token}` }
            : {}),
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...(options.variant
            ? { 'x-edge-smoke-variant': options.variant }
            : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      const text = await response.text();
      const wallMs = Math.round(performance.now() - started);
      log.push(
        `${options.variant ? `[${options.variant}] ` : ''}${method} ${path} -> ${response.status} (${wallMs} ms)`,
      );
      const startup = response.headers.get('x-justgo-startup-stage');
      if (startup && options.variant !== 'invalid')
        stage = `${stage} (startup ${startup})`;
      return {
        status: response.status,
        headers: response.headers,
        text,
        json: () => JSON.parse(text) as unknown,
      };
    };

    stage = 'health and release identity';
    for (const path of ['/api/health', '/api-candidate/health']) {
      const health = await call('GET', path);
      assert.equal(health.status, 200);
      assert.deepEqual(health.json(), { status: 'ok', service: 'justgo-api' });
      assert.equal(health.headers.get('x-justgo-source-sha'), sourceSha);
      assert.equal(health.headers.get('x-justgo-environment'), 'staging');
      assert.equal(health.headers.get('cache-control'), 'no-store');
      assert.equal(health.headers.get('x-justgo-smoke-refused'), '0');
    }

    stage = 'database readiness';
    assert.equal((await call('GET', '/api/ready')).status, 200);

    stage = 'outbound adapters';
    const outbound = await call('GET', '/api/__smoke/outbound');
    assert.equal(outbound.status, 200);
    assert.deepEqual(outbound.json(), { outbound: 'passed', refused: 0 });

    stage = 'managed sign-in';
    const authUserId = randomUUID();
    const sessionId = randomUUID();
    await admin.query('insert into auth.sessions(id,user_id) values($1,$2)', [
      sessionId,
      authUserId,
    ]);
    const token = [
      encode({ alg: 'ES256', typ: 'JWT' }),
      encode({
        sub: authUserId,
        session_id: sessionId,
        exp: Math.floor(now / 1000) + 3600,
        role: 'authenticated',
        aud: 'authenticated',
        iss: `${authOrigin}/auth/v1`,
      }),
      randomBytes(32).toString('base64url'),
    ].join('.');
    authTokens.set(token, authUserId);
    const session = await call('POST', '/api/v1/auth/session', {
      token,
      body: { deviceId: randomUUID() },
    });
    assert.equal(session.status, 200);
    const { userId, dataEpoch } = managedSessionResponseSchema.parse(
      session.json(),
    );
    users.add(userId);

    stage = 'authenticated read';
    const catalogResponse = await call('GET', '/api/v1/challenges', { token });
    assert.equal(catalogResponse.status, 200);
    const card = catalogSchema.parse(catalogResponse.json()).cards[0];
    assert.ok(card, 'Seeded challenge catalog');

    stage = 'authenticated write';
    const input = {
      id: randomUUID(),
      challengeId: card.challengeId,
      venue: card.venue,
      startedAt: new Date(now).toISOString(),
      startTimeZone: 'UTC',
      expectedEpoch: dataEpoch,
    };
    const write = await call('POST', '/api/v1/attempts', {
      token,
      body: input,
    });
    assert.equal(write.status, 201);
    assert.equal(
      completionAttemptResultSchema.parse(write.json()).attempt.id,
      input.id,
    );
    const retry = await call('POST', '/api/v1/attempts', {
      token,
      body: input,
    });
    assert.equal(retry.status, 200, 'Idempotent retry');

    stage = 'error envelope';
    const rejected = await call('GET', '/api/v1/challenges');
    assert.equal(rejected.status, 401);
    const error = rejected.json() as { code: string; requestId: string };
    assert.equal(error.code, 'UNAUTHORIZED');
    assert.equal(error.requestId, rejected.headers.get('x-request-id'));

    stage = 'account deletion';
    const deleted = await call('DELETE', '/api/v1/account', {
      token,
      body: { confirmation: 'delete-account' },
    });
    assert.equal(deleted.status, 200);
    assert.ok(authCalls.includes(`DELETE ${authUserId}`), 'Auth user deleted');
    const remaining = await admin.query(
      'select 1 from justgo.attempts where user_id=$1',
      [userId],
    );
    assert.equal(remaining.rowCount, 0);

    stage = 'startup redaction';
    const invalidHealth = await call('GET', '/api/health', {
      variant: 'invalid',
    });
    assert.equal(invalidHealth.status, 500);
    assert.equal(
      invalidHealth.headers.get('x-justgo-startup-stage'),
      'configuration',
    );
    assert.equal(invalidHealth.headers.get('x-justgo-source-sha'), null);
    assert.deepEqual(invalidHealth.json(), {
      error: 'Internal server error',
      requestId: invalidHealth.headers.get('x-request-id'),
    });
    const invalidReady = await call('GET', '/api/ready', {
      variant: 'invalid',
    });
    assert.equal(invalidReady.status, 503);
    assert.deepEqual(invalidReady.json(), { status: 'unavailable' });

    stage = 'error delivery after the response';
    const before = envelopes.length;
    const down = await call('GET', '/api/ready', { variant: 'unreachable' });
    assert.equal(down.status, 503);
    assert.equal(down.headers.get('x-justgo-startup-stage'), null);
    const deadline = Date.now() + 10_000;
    while (envelopes.length === before && Date.now() < deadline)
      await delay(100);
    assert.equal(envelopes.length, before + 1, 'One Sentry envelope');
    assert.ok(
      envelopes.at(-1)?.includes(down.headers.get('x-request-id') ?? '-'),
    );

    stage = 'outbound fence';
    const last = await call('GET', '/api/health');
    assert.equal(last.headers.get('x-justgo-smoke-refused'), '0');

    for (const line of log) console.info(line);
    console.info(
      'edge smoke passed: managed sign-in, read, write, idempotent retry, error envelope, account deletion, startup redaction, deferred error delivery and outbound adapters in the pinned Edge runtime.',
    );
  } catch (error) {
    for (const line of log) console.info(line);
    if (runtime)
      console.error(
        `Edge runtime log tail:\n${(await runtime.logs())
          .split(publishableKey)
          .join('<masked>')
          .split(authSecretKey)
          .join('<masked>')}`,
      );
    throw new SmokeFailure(
      error instanceof SmokeFailure
        ? error.message
        : `Edge smoke failed during ${stage}`,
    );
  } finally {
    await runtime?.stop();
    authStub.close();
    sentryStub.close();
    try {
      for (const userId of users) {
        for (const table of [
          'attempt_patch_receipts',
          'journal_versions',
          'deleted_completion_ids',
          'attempts',
          'managed_auth_sessions',
          'managed_auth_accounts',
          'managed_auth_deletions',
          'device_transfers',
          'device_sessions',
          'recovery_credentials',
          'devices',
        ])
          await admin
            .query(`delete from justgo.${table} where user_id=$1`, [userId])
            .catch(() => undefined);
        await admin.query('delete from justgo.users where id=$1', [userId]);
      }
      const buckets = [
        'managed-auth:unknown',
        'identity:unknown',
        ...[...users].flatMap((userId) => [
          `account-write:${userId}`,
          `account-export:${userId}`,
        ]),
      ].map((lane) => createHmac('sha256', rateKey).update(lane).digest('hex'));
      await admin.query(
        'delete from justgo.identity_rate_buckets where key=any($1::text[])',
        [buckets],
      );
      if (createdAuthSchemas)
        await admin.query(
          'drop schema if exists justgo_auth_private cascade; drop schema if exists auth cascade;',
        );
    } finally {
      await admin.end();
      await rm(folder, { recursive: true, force: true });
    }
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  runEdgeSmoke(startDocker).catch((error: unknown) => {
    console.error(
      error instanceof SmokeFailure
        ? error.message
        : 'Edge smoke failed preflight or cleanup; no raw runtime output retained.',
    );
    process.exitCode = 1;
  });
}
