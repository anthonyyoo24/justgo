import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/build-app.js';
import { readConfig } from '../src/config.js';
import { loggerOptions } from '../src/diagnostics.js';
import { poolOptions } from '../src/db/client.js';

describe('health and readiness', () => {
  it('stays live when the database is unavailable and never exposes the error', async () => {
    const app = buildApp({
      logger: false,
      checkDatabase: async () => {
        throw new Error('postgresql://secret@host/private-reflection');
      },
    });
    try {
      expect((await app.inject('/health')).json()).toEqual({
        status: 'ok',
        service: 'justgo-api',
      });
      const readiness = await app.inject('/ready');
      expect(readiness.statusCode).toBe(503);
      expect(readiness.json()).toEqual({ status: 'unavailable' });
      expect(readiness.headers['cache-control']).toBe('no-store');
      expect(readiness.body).not.toContain('secret');
    } finally {
      await app.close();
    }
  });
  it('reports database readiness, generates its own request ID and restricts browser origins', async () => {
    const app = buildApp({
      logger: false,
      origins: ['http://localhost:8081'],
      checkDatabase: async () => {},
    });
    try {
      const response = await app.inject({
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
      const allowed = await app.inject({
        url: '/health',
        headers: { origin: 'http://localhost:8081' },
      });
      expect(allowed.headers['access-control-allow-origin']).toBe(
        'http://localhost:8081',
      );
      const missing = await app.inject('/secret-path?token=secret');
      expect(missing.statusCode).toBe(404);
      expect(missing.body).not.toContain('secret');
    } finally {
      await app.close();
    }
  });
});

describe('safe operational configuration', () => {
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
    const logger = pino(loggerOptions(), stream);
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
