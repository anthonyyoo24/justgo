import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { localTestDatabaseUrl } from './local-test-database.js';
import { createDatabase, poolOptions } from '../src/db/client.js';
import { readConfig } from '../src/config.js';
import { IdentityService } from '../src/identity/service.js';
import {
  catalogSchema,
  completionAttemptResultSchema,
} from '@justgo/contracts';

/** Actual workerd -> pg -> isolated Postgres smoke, without remote bindings. */
async function run() {
  const runtimeUrl = localTestDatabaseUrl(process.env.DATABASE_URL);
  const migrationUrl = localTestDatabaseUrl(process.env.MIGRATION_DATABASE_URL);
  if (
    runtimeUrl.username !== 'justgo_runtime' ||
    migrationUrl.username !== 'justgo_migrator' ||
    process.env.DATABASE_SSL !== 'disable'
  )
    throw new Error(
      'Workers smoke requires isolated runtime/migrator roles with local SSL disabled',
    );
  runtimeUrl.hostname = '127.0.0.1';
  const port = Number(process.env.JUSTGO_WORKERS_TEST_PORT ?? '8791');
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid Worker smoke port');
  const probe = createServer();
  await new Promise<void>((resolveProbe, reject) => {
    probe.once('error', () =>
      reject(new Error('Worker smoke port is occupied')),
    );
    probe.listen(port, '127.0.0.1', () =>
      probe.close((error) => (error ? reject(error) : resolveProbe())),
    );
  });
  const root = resolve(import.meta.dirname, '../../..');
  await mkdir(resolve(root, '.local/workers'), {
    recursive: true,
    mode: 0o700,
  });
  const folder = await mkdtemp(resolve(root, '.local/workers/smoke-'));
  const config = readConfig({
    DATABASE_URL: runtimeUrl.toString(),
    DATABASE_SSL: 'disable',
    NODE_ENV: 'test',
  });
  const database = createDatabase(config);
  const admin = new Pool(
    poolOptions(
      readConfig({
        DATABASE_URL: migrationUrl.toString(),
        DATABASE_SSL: 'disable',
      }),
    ),
  );
  const owner = randomUUID();
  const rateKey = randomBytes(32).toString('hex');
  const token = randomBytes(32).toString('hex');
  let child: ReturnType<typeof spawn> | undefined;
  let stopped: Promise<unknown> | undefined;
  let stage = 'fixture preparation';
  try {
    // Register the known owner before creation; lost HTTP responses cannot leak fixtures.
    const identity = new IdentityService(database.db, {
      rateKey,
      newUserId: () => owner,
    });
    await identity.bootstrap({
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      sessionToken: token,
      credential: randomBytes(32).toString('hex'),
    });
    const now = Date.now();
    const vars = {
      NODE_ENV: 'production',
      APP_ENVIRONMENT: 'staging',
      MANAGED_AUTH_ENABLED: 'false',
      JUSTGO_SOURCE_SHA: 'a'.repeat(40),
      DATABASE_SSL: 'disable',
      LOG_LEVEL: 'silent',
      LOCK_DATABASE_URL: runtimeUrl.toString(),
      IDENTITY_RATE_LIMIT_KEY: rateKey,
      BETA_ACCESS_GRANTS: JSON.stringify([
        {
          userId: owner,
          startsAt: new Date(now - 60000).toISOString(),
          expiresAt: new Date(now + 3600000).toISOString(),
        },
      ]),
    };
    const file = resolve(folder, 'wrangler.json');
    await writeFile(
      file,
      JSON.stringify({
        name: 'justgo-local-smoke',
        main: resolve(root, 'apps/api/scripts/workers-smoke-entry.ts'),
        compatibility_date: '2026-10-28',
        compatibility_flags: ['nodejs_compat'],
        observability: { enabled: false },
        vars,
        hyperdrive: [
          {
            binding: 'HYPERDRIVE',
            id: '0'.repeat(32),
            localConnectionString: runtimeUrl.toString(),
          },
        ],
      }),
      { mode: 0o600 },
    );
    stage = 'runtime startup';
    child = spawn(
      process.execPath,
      [
        resolve(root, 'node_modules/wrangler/bin/wrangler.js'),
        'dev',
        '--local',
        '--config',
        file,
        '--ip',
        '127.0.0.1',
        '--port',
        String(port),
        '--inspector-port',
        '0',
        '--log-level',
        'none',
        '--show-interactive-dev-session',
        'false',
      ],
      {
        cwd: folder,
        stdio: 'ignore',
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          CI: 'true',
          WRANGLER_SEND_METRICS: 'false',
          CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
        },
      },
    );
    const running = child;
    stopped = new Promise((resolveStop) => {
      running.once('exit', resolveStop);
      running.once('error', resolveStop);
    });
    const origin = `http://127.0.0.1:${port}`;
    const request = async (path: string, init?: RequestInit) => {
      const response = await fetch(origin + path, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.match(
        response.headers.get('x-request-id') ?? '',
        /^[a-f0-9-]{36}$/,
      );
      return response;
    };
    const deadline = Date.now() + 45000;
    let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null)
        throw new Error('Worker runtime exited before startup');
      try {
        const response = await request('/health');
        const startup = response.headers.get('x-justgo-startup-stage');
        if (startup) {
          stage = `startup ${startup}`;
          break;
        }
        if (response.status === 200) {
          ready = true;
          break;
        }
      } catch {
        /* Wait only for owned runtime startup; the assertion stays failing. */
      }
      await delay(100);
    }
    assert.ok(ready, 'Worker startup');
    for (const mode of ['managed', 'managed-wrapped']) {
      stage = `${mode} startup with Sentry and beta configuration`;
      const response = await request('/health', {
        headers: { 'x-justgo-smoke-mode': mode },
      });
      const failure = response.headers.get('x-justgo-startup-stage');
      if (failure) stage = `${mode} startup ${failure}`;
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        status: 'ok',
        service: 'justgo-api',
      });
      assert.equal(response.headers.get('x-justgo-source-sha'), 'b'.repeat(40));
      assert.equal(response.headers.get('x-justgo-environment'), 'staging');
      assert.equal(response.headers.get('x-justgo-startup-stage'), null);
      assert.equal(response.headers.get('x-justgo-smoke-outbound'), '0');
    }
    stage = 'invalid startup redaction';
    for (const path of ['/health', '/ready']) {
      const response = await request(path, {
        headers: { 'x-justgo-smoke-mode': 'invalid' },
      });
      assert.equal(response.status, path === '/health' ? 500 : 503);
      assert.equal(response.headers.get('x-justgo-source-sha'), null);
      assert.equal(response.headers.get('x-justgo-environment'), null);
      assert.equal(
        response.headers.get('x-justgo-startup-stage'),
        'configuration',
      );
      assert.deepEqual(
        await response.json(),
        path === '/health'
          ? {
              error: 'Internal server error',
              requestId: response.headers.get('x-request-id'),
            }
          : { status: 'unavailable' },
      );
      assert.equal(response.headers.get('x-justgo-smoke-outbound'), '0');
    }
    stage = 'database readiness';
    assert.equal((await request('/ready')).status, 200);
    const headers = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };
    stage = 'authenticated read';
    const catalogResponse = await request('/v1/challenges', { headers });
    assert.equal(catalogResponse.status, 200);
    const catalog = catalogSchema.parse(await catalogResponse.json());
    const card = catalog.cards[0];
    assert.ok(card, 'Seeded challenge catalog');
    const input = {
      id: randomUUID(),
      challengeId: card.challengeId,
      venue: card.venue,
      startedAt: new Date(now).toISOString(),
      startTimeZone: 'UTC',
    };
    stage = 'authenticated write';
    const write = await request('/v1/attempts', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    assert.equal(write.status, 201);
    assert.equal(
      completionAttemptResultSchema.parse(await write.json()).attempt.id,
      input.id,
    );
    assert.equal(
      (
        await request('/v1/attempts', {
          method: 'POST',
          headers,
          body: JSON.stringify(input),
        })
      ).status,
      200,
      'Worker idempotent retry',
    );
    stage = 'error envelope';
    const rejected = await request('/v1/challenges');
    assert.equal(rejected.status, 401);
    const error = (await rejected.json()) as {
      code: string;
      requestId: string;
    };
    assert.equal(error.code, 'UNAUTHORIZED');
    assert.equal(error.requestId, rejected.headers.get('x-request-id'));
    const stored = await admin.query(
      'select id from justgo.attempts where user_id=$1 and id=$2',
      [owner, input.id],
    );
    assert.equal(stored.rowCount, 1);
    console.info(
      'Workers smoke passed: managed Auth/Sentry/beta composition, wrapped transport health, startup redaction, readiness, authenticated read/write, idempotency and error envelope. Hosted Hyperdrive/CPU acceptance remains separate.',
    );
  } catch {
    throw new Error(`Workers smoke failed during ${stage}`);
  } finally {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      const timeout = setTimeout(() => child?.kill('SIGKILL'), 5000);
      await stopped;
      clearTimeout(timeout);
    }
    try {
      for (const table of [
        'attempt_patch_receipts',
        'journal_versions',
        'deleted_completion_ids',
        'attempts',
        'managed_auth_sessions',
        'managed_auth_accounts',
        'device_transfers',
        'device_sessions',
        'recovery_credentials',
        'devices',
      ])
        await admin.query(`delete from justgo.${table} where user_id=$1`, [
          owner,
        ]);
      await admin.query('delete from justgo.users where id=$1', [owner]);
      const buckets = ['account-write', 'account-export'].map((lane) =>
        createHmac('sha256', rateKey).update(`${lane}:${owner}`).digest('hex'),
      );
      await admin.query(
        'delete from justgo.identity_rate_buckets where key=any($1::text[])',
        [buckets],
      );
    } finally {
      await Promise.all([database.pool.end(), admin.end()]);
      await rm(folder, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(
    error instanceof Error &&
      error.message.startsWith('Workers smoke failed during ')
      ? error.message
      : 'Workers smoke failed preflight or cleanup; no raw runtime output retained.',
  );
  process.exitCode = 1;
});
