import { apiRequest } from './request.js';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/build-app.js';
import { readConfig } from '../src/config.js';
import { createLogger, loggerOptions } from '../src/http/diagnostics.js';
import { poolOptions } from '../src/db/client.js';

describe('health and readiness', () => {
  it('stays live when the database is unavailable and never exposes the error', async () => {
    const app = buildApp({
      logger: false,
      checkDatabase: async () => {
        throw new Error('postgresql://secret@host/private-reflection');
      },
    });

    expect((await apiRequest(app, '/health')).json()).toEqual({
      status: 'ok',
      service: 'justgo-api',
    });
    const readiness = await apiRequest(app, '/ready');
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json()).toEqual({ status: 'unavailable' });
    expect(readiness.headers['cache-control']).toBe('no-store');
    expect(readiness.body).not.toContain('secret');
  });
  it('reports database readiness, generates its own request ID and restricts browser origins', async () => {
    const app = buildApp({
      logger: false,
      origins: ['http://localhost:8081'],
      checkDatabase: async () => {},
    });

    const response = await apiRequest(app, {
      url: '/ready',
      headers: {
        'x-request-id': 'attacker-controlled',
        origin: 'https://unknown.example',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
    expect(response.headers['x-request-id']).not.toBe('attacker-controlled');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    const allowed = await apiRequest(app, {
      url: '/health',
      headers: { origin: 'http://localhost:8081' },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:8081',
    );
    const missing = await apiRequest(app, '/secret-path?token=secret');
    expect(missing.statusCode).toBe(404);
    expect(missing.body).not.toContain('secret');
    // Fixture cleanup provenance is never exposed by the deployable app.
    expect((await apiRequest(app, '/__fixtures/accounts')).statusCode).toBe(
      404,
    );
  });
  it.each(['PUT', 'PATCH', 'DELETE'])(
    'allows %s preflight from the configured app origin only',
    async (method) => {
      const app = buildApp({
        logger: false,
        origins: ['http://localhost:8081'],
        checkDatabase: async () => {},
      });

      const preflight = (origin: string) =>
        apiRequest(app, {
          method: 'OPTIONS',
          url: '/v1/devices/00000000-0000-4000-8000-000000000000',
          headers: {
            origin,
            'access-control-request-method': method,
            'access-control-request-headers': 'authorization,content-type',
          },
        });
      const allowed = await preflight('http://localhost:8081');
      expect(allowed.statusCode).toBe(204);
      expect(allowed.headers['access-control-allow-origin']).toBe(
        'http://localhost:8081',
      );
      expect(allowed.headers['access-control-allow-methods']).toBe(
        'GET, POST, PUT, PATCH, DELETE',
      );
      const denied = await preflight('https://unknown.example');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    },
  );
});

describe('safe operational configuration', () => {
  it('keeps managed Auth disabled until explicitly enabled with matching public configuration', () => {
    expect(readConfig({}).MANAGED_AUTH_ENABLED).toBe(false);
    expect(() => readConfig({ MANAGED_AUTH_ENABLED: 'true' })).toThrow(
      'Managed Auth requires',
    );
    expect(() =>
      readConfig({ SUPABASE_URL: 'https://example.supabase.co' }),
    ).toThrow('must include');
    expect(
      readConfig({
        MANAGED_AUTH_ENABLED: 'true',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'public',
        SUPABASE_AUTH_SECRET_KEY:
          'server-only-fixture-secret-key-32-characters',
      }).MANAGED_AUTH_ENABLED,
    ).toBe(true);
  });
  it('rejects production without a database and remote plaintext connections', () => {
    expect(() => readConfig({ NODE_ENV: 'production' })).toThrow();
    expect(() =>
      readConfig({
        DATABASE_URL: 'postgresql://secret@remote.example/app',
        DATABASE_SSL: 'disable',
      }),
    ).toThrow();
    expect(() => readConfig({ DATABASE_POOL_MAX: '1000' })).toThrow();
  });
  it('uses a bounded pool and cannot disable certificate validation via the URL', () => {
    const config = readConfig({
      DATABASE_URL:
        'postgresql://user:password@remote.example/app?sslmode=no-verify',
    });
    const options = poolOptions(config);
    expect(options.max).toBe(1);
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
    expect(options.connectionString).not.toContain('sslmode');
  });
  it('excludes secrets and private payloads from diagnostics', () => {
    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, next) {
        output += chunk.toString();
        next();
      },
    });
    const logger = createLogger({ ...loggerOptions(), stream });
    logger.error(
      {
        req: {
          method: 'POST',
          url: '/?token=private',
          headers: { authorization: 'private' },
          body: { reflection: 'private' },
        },
        err: new Error('private'),
        token: 'private',
        reflection: 'private',
      },
      'Request failed',
    );
    expect(output).not.toContain('private');
    expect(output).toContain('POST');
    expect(output).toContain('[REDACTED]');
  });
});
