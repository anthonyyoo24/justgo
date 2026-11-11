import { createHmac, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { accessResponseSchema } from '@justgo/contracts';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';
import { localTestDatabaseUrl } from '../../scripts/local-test-database.js';
import { IdentityService } from '../../src/identity/service.js';
import { createManagedAuthVerifier } from '../../src/identity/managed-verifier.js';
import { createManagedAuthDeletion } from '../../src/identity/managed-deletion.js';
import { outboundFetch } from '../../src/http/outbound-fetch.js';
import { createServerErrorReporter } from '../../src/http/server-error-reporter.js';
import { serverDiagnosticConfiguration } from '../../src/http/sentry-configuration.js';
import { buildApp } from '../../src/build-app.js';
import type { EntitlementReader } from '../../src/access/service.js';
import { apiRequest } from '../request.js';

const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '3' });
for (const url of [config.DATABASE_URL, process.env.MIGRATION_DATABASE_URL])
  localTestDatabaseUrl(url);
const database = createDatabase(config);
const admin = new Pool(
  poolOptions(
    readConfig({
      ...process.env,
      DATABASE_URL: process.env.MIGRATION_DATABASE_URL!,
    }),
  ),
);
const rateKey = `owner-transaction-io-${randomUUID()}`;
const authOrigin = 'https://auth.invalid';
const owners = new Set<string>();
const providerCalls: string[] = [];
const encode = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const claims = (token: string) =>
  JSON.parse(
    Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
  ) as { sub: string };

const provider: typeof fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  providerCalls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
  if (url.pathname === '/auth/v1/user') {
    const token = new Headers(init?.headers).get('authorization')!.slice(7);
    return Response.json({
      id: claims(token).sub,
      identities: [{ provider: 'apple' }],
    });
  }
  if (url.pathname.startsWith('/auth/v1/admin/users/'))
    return Response.json({ id: url.pathname.split('/').pop() });
  return new Response(null, { status: 404 });
};

function managedToken() {
  return [
    encode({ alg: 'ES256', typ: 'JWT' }),
    encode({
      sub: randomUUID(),
      session_id: randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: 'authenticated',
      aud: 'authenticated',
      iss: `${authOrigin}/auth/v1`,
    }),
    'signature',
  ].join('.');
}

function app(
  options: {
    entitlementReader?: EntitlementReader;
    send?: typeof fetch;
  } = {},
) {
  return buildApp({
    identity: new IdentityService(database.db, {
      rateKey,
      managedAuthVerifier: createManagedAuthVerifier(
        authOrigin,
        'publishable-key',
        provider,
      ),
      managedLiveSessionReader: async () => true,
      managedAuthDeletion: createManagedAuthDeletion(
        authOrigin,
        'secret-key',
        provider,
      ),
      newUserId: () => {
        const id = randomUUID();
        owners.add(id);
        return id;
      },
    }),
    checkDatabase: async () => {},
    logger: false,
    ...(options.entitlementReader
      ? { entitlementReader: options.entitlementReader }
      : {}),
    ...(options.send
      ? {
          reportServerError: createServerErrorReporter(
            serverDiagnosticConfiguration(
              true,
              `https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/4512345678901234`,
              'b'.repeat(40),
              'staging',
            ),
            { send: options.send },
          ),
        }
      : {}),
  });
}

async function signIn(api: ReturnType<typeof app>) {
  const token = managedToken();
  const response = await apiRequest(api, {
    method: 'POST',
    url: '/v1/auth/session',
    headers: { authorization: `Bearer ${token}` },
    payload: { deviceId: randomUUID() },
  });
  expect(response.statusCode, response.body).toBe(200);
  return { token, authUserId: claims(token).sub };
}

afterAll(async () => {
  try {
    await admin.query(
      'delete from justgo.identity_rate_buckets where key = any($1)',
      [
        ['managed-auth', 'identity'].map((lane) =>
          createHmac('sha256', rateKey)
            .update(`${lane}:127.0.0.1`)
            .digest('hex'),
        ),
      ],
    );
    for (const owner of owners) {
      for (const table of [
        'managed_auth_deletions',
        'managed_auth_sessions',
        'managed_auth_accounts',
        'recovery_credentials',
      ])
        await admin.query(`delete from justgo.${table} where user_id=$1`, [
          owner,
        ]);
      await admin.query('delete from justgo.users where id=$1', [owner]);
    }
  } finally {
    await Promise.all([database.pool.end(), admin.end()]);
  }
});

describe('provider I/O and owner transactions', () => {
  it('verifies with Auth and deletes the Auth user only while no owner transaction is open', async () => {
    const api = app();
    const { token, authUserId } = await signIn(api);
    const session = await apiRequest(api, {
      url: '/v1/auth/session',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(session.statusCode, session.body).toBe(200);
    const deleted = await apiRequest(api, {
      method: 'DELETE',
      url: '/v1/account',
      headers: { authorization: `Bearer ${token}` },
      payload: { confirmation: 'delete-account' },
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(providerCalls).toContain('GET /auth/v1/user');
    expect(providerCalls).toContain(
      `DELETE /auth/v1/admin/users/${authUserId}`,
    );
  });

  it('refuses provider I/O started inside an owner transaction and reports the failure after it closes', async () => {
    const billing = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        status: 'unpaid',
        checkedAt: new Date().toISOString(),
      }),
    );
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    const api = app({
      entitlementReader: async () =>
        accessResponseSchema.parse(
          await (
            await outboundFetch(billing)('https://billing.invalid/entitlements')
          ).json(),
        ),
      send,
    });
    const { token } = await signIn(api);
    const access = await apiRequest(api, {
      url: '/v1/access',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(access.statusCode).toBe(503);
    expect(billing).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  });
});
