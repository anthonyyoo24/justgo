import { describe, expect, it, vi } from 'vitest';
import {
  createEdgeHandler,
  deferredReporter,
  edgeClientAddress,
  edgeConfigEnvironment,
  stripFunctionPrefix,
} from '../../src/edge.js';
import { buildRuntimeApp } from '../../src/runtime-app.js';
import type { createDatabase } from '../../src/db/client.js';
import type { readConfig } from '../../src/config.js';

const sha = 'a'.repeat(40);
const hosted = {
  NODE_ENV: 'production',
  APP_ENVIRONMENT: 'staging',
  DATABASE_URL:
    'postgresql://justgo_runtime:synthetic@aws-0-ca-central-1.pooler.supabase.com:6543/postgres',
  DATABASE_SSL: 'verify-full',
  IDENTITY_RATE_LIMIT_KEY: 'synthetic-only-test-key-at-least-32-long',
  MANAGED_AUTH_ENABLED: 'true',
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_DB_URL:
    'postgresql://postgres:synthetic-owner@db.fixture.supabase.co:5432/postgres',
  JUSTGO_AUTH_PUBLISHABLE_KEY: 'synthetic-publishable-key',
  JUSTGO_AUTH_SECRET_KEY: 'synthetic-auth-secret-with-at-least-32-characters',
  LOG_LEVEL: 'silent',
};

function fakeDatabase() {
  const query = vi.fn();
  const end = vi.fn(async () => {});
  return {
    database: { pool: { query, end }, db: {} } as unknown as ReturnType<
      typeof createDatabase
    >,
    query,
    end,
  };
}

describe('Edge entry', () => {
  it('strips only the function name the lane deploys', () => {
    for (const [from, to] of [
      ['https://ref.supabase.co/api/health', '/health'],
      ['https://ref.supabase.co/api', '/'],
      ['https://ref.supabase.co/api-candidate/v1/access?x=1', '/v1/access'],
      ['https://ref.supabase.co/apis/health', '/apis/health'],
      ['https://ref.supabase.co/health', '/health'],
    ] as const)
      expect(new URL(stripFunctionPrefix(new Request(from)).url).pathname).toBe(
        to,
      );
    const stripped = stripFunctionPrefix(
      new Request('https://ref.supabase.co/api-candidate/v1/access?x=1', {
        method: 'POST',
        headers: { authorization: 'Bearer synthetic' },
        body: '{}',
      }),
    );
    expect(new URL(stripped.url).search).toBe('?x=1');
    expect(stripped.method).toBe('POST');
    expect(stripped.headers.get('authorization')).toBe('Bearer synthetic');
  });

  it('maps the Auth secrets, never reads the owner database URL and lets the bundle name its release', () => {
    const mapped = edgeConfigEnvironment(
      {
        ...hosted,
        SUPABASE_PUBLISHABLE_KEY: 'injected-anon',
        SUPABASE_AUTH_SECRET_KEY: 'injected-not-ours',
        JUSTGO_SOURCE_SHA: 'b'.repeat(40),
      },
      { JUSTGO_SOURCE_SHA: sha, API_SENTRY_RELEASE: `justgo-api@${sha}` },
    );
    expect(mapped.SUPABASE_PUBLISHABLE_KEY).toBe('synthetic-publishable-key');
    expect(mapped.SUPABASE_AUTH_SECRET_KEY).toBe(
      'synthetic-auth-secret-with-at-least-32-characters',
    );
    expect(mapped).not.toHaveProperty('SUPABASE_DB_URL');
    expect(mapped).not.toHaveProperty('JUSTGO_AUTH_PUBLISHABLE_KEY');
    expect(mapped).not.toHaveProperty('JUSTGO_AUTH_SECRET_KEY');
    expect(mapped.JUSTGO_SOURCE_SHA).toBe(sha);
    expect(mapped.API_SENTRY_RELEASE).toBe(`justgo-api@${sha}`);
    expect(edgeConfigEnvironment({ JUSTGO_SOURCE_SHA: sha }, {})).toEqual({
      JUSTGO_SOURCE_SHA: sha,
      SUPABASE_PUBLISHABLE_KEY: undefined,
      SUPABASE_AUTH_SECRET_KEY: undefined,
    });
  });

  it('uses the gateway CF-Connecting-IP and ignores forged X-Forwarded-For and X-Real-IP', () => {
    const request = (headers: Record<string, string>) =>
      new Request('https://ref.supabase.co/api/health', { headers });
    expect(
      edgeClientAddress(
        request({
          'cf-connecting-ip': '203.0.113.7',
          'x-forwarded-for': '10.0.0.1',
          'x-real-ip': '10.0.0.2',
        }),
      ),
    ).toBe('203.0.113.7');
    expect(
      edgeClientAddress(request({ 'cf-connecting-ip': '2001:db8::1' })),
    ).toBe('2001:db8::1');
    for (const headers of [
      { 'x-forwarded-for': '198.51.100.1' },
      { 'x-real-ip': '198.51.100.1' },
      { 'cf-connecting-ip': '198.51.100.1, 203.0.113.7' },
      { 'cf-connecting-ip': 'unknown' },
      {},
    ])
      expect(edgeClientAddress(request(headers))).toBe('unknown');
  });

  it('composes once per worker, keeps one pool and serves the release identity without a query', async () => {
    const { database, query, end } = fakeDatabase();
    const open = vi.fn<
      (config: ReturnType<typeof readConfig>) => typeof database
    >(() => database);
    const build = vi.fn(buildRuntimeApp);
    const handler = createEdgeHandler(hosted, {
      release: { JUSTGO_SOURCE_SHA: sha },
      createDatabase: open,
      buildApp: build,
    });
    for (let index = 0; index < 3; index++) {
      const response = await handler.fetch(
        new Request('https://ref.supabase.co/api/health'),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        status: 'ok',
        service: 'justgo-api',
      });
      expect(response.headers.get('x-justgo-source-sha')).toBe(sha);
      expect(response.headers.get('x-justgo-environment')).toBe('staging');
    }
    expect(open).toHaveBeenCalledOnce();
    expect(build).toHaveBeenCalledOnce();
    expect(open.mock.calls[0]?.[0].DATABASE_POOL_MAX).toBe(1);
    expect(open.mock.calls[0]?.[0].SUPABASE_AUTH_SECRET_KEY).toBe(
      hosted.JUSTGO_AUTH_SECRET_KEY,
    );
    expect(query).not.toHaveBeenCalled();
    expect(end).not.toHaveBeenCalled();
  });

  it.each([
    [
      'configuration',
      { ...hosted, JUSTGO_AUTH_SECRET_KEY: undefined },
      () => fakeDatabase().database,
    ],
    [
      'database',
      hosted,
      () => {
        throw new Error(`could not open ${hosted.DATABASE_URL}`);
      },
    ],
  ] as const)(
    'answers a %s failure with a redacted response',
    async (stage, env, open) => {
      const handler = createEdgeHandler(env, { createDatabase: open });
      expect(handler.database).toBeUndefined();
      const ready = await handler.fetch(
        new Request('https://ref.supabase.co/api/ready'),
      );
      expect(ready.status).toBe(503);
      expect(await ready.json()).toEqual({ status: 'unavailable' });
      expect(ready.headers.get('x-justgo-startup-stage')).toBe(stage);
      const api = await handler.fetch(
        new Request('https://ref.supabase.co/api/v1/access'),
      );
      expect(api.status).toBe(503);
      const apiBody = await api.text();
      expect(JSON.parse(apiBody)).toMatchObject({ code: 'UNAVAILABLE' });
      const other = await handler.fetch(
        new Request('https://ref.supabase.co/api/health'),
      );
      expect(other.status).toBe(500);
      const otherBody = await other.text();
      expect(JSON.parse(otherBody)).toMatchObject({
        error: 'Internal server error',
      });
      for (const body of [apiBody, otherBody])
        for (const secret of [
          'synthetic',
          'pooler.supabase.com',
          'could not open',
        ])
          expect(body).not.toContain(secret);
    },
  );

  it('closes a pool opened before composition failed', async () => {
    const { database, end } = fakeDatabase();
    const handler = createEdgeHandler(hosted, {
      createDatabase: () => database,
      buildApp: () => {
        throw new Error('composition');
      },
    });
    const response = await handler.fetch(
      new Request('https://ref.supabase.co/api/ready'),
    );
    expect(response.headers.get('x-justgo-startup-stage')).toBe('composition');
    await vi.waitFor(() => expect(end).toHaveBeenCalledOnce());
  });

  it('hands error delivery to the runtime instead of holding the response', async () => {
    let finish: () => void = () => {};
    const delivery = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const reporter = vi.fn(() => delivery);
    const pending: Promise<unknown>[] = [];
    const deferred = deferredReporter(reporter, (work) => {
      pending.push(work);
    });
    const diagnostic = {
      statusCode: 500,
      requestId: '7d444840-9dc0-4c0f-8b5a-2f5f2b1c3d4e',
    };
    await deferred(diagnostic);
    expect(reporter).toHaveBeenCalledWith(diagnostic);
    expect(pending).toEqual([delivery]);
    finish();
    await Promise.all(pending);
    expect(deferredReporter(reporter)).toBe(reporter);
  });
});
