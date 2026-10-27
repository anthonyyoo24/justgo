import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/build-app.js';

const sourceSha = 'a'.repeat(40);

describe('release identity probes', () => {
  it.each(['staging', 'production'] as const)(
    'returns the reviewed %s identity only on readiness/health',
    async (environment) => {
      let available = true;
      const app = buildApp({
        checkDatabase: async () => {
          if (!available) throw new Error('private database error');
        },
        logger: false,
        releaseIdentity: { sourceSha, environment },
      });
      try {
        const health = await app.inject('/health');
        expect(health.json()).toEqual({ status: 'ok', service: 'justgo-api' });
        const ready = await app.inject('/ready?untrusted=ignored');
        expect(ready.json()).toEqual({ status: 'ready' });
        available = false;
        const failed = await app.inject('/ready');
        expect(failed.statusCode).toBe(503);
        expect(failed.json()).toEqual({ status: 'unavailable' });
        for (const response of [health, ready, failed]) {
          expect(response.headers['x-justgo-source-sha']).toBe(sourceSha);
          expect(response.headers['x-justgo-environment']).toBe(environment);
          expect(response.headers['cache-control']).toBe('no-store');
        }
        for (const path of ['/openapi.json', '/unknown', '/health/unknown']) {
          const response = await app.inject(path);
          expect(response.headers['x-justgo-source-sha']).toBeUndefined();
          expect(response.headers['x-justgo-environment']).toBeUndefined();
        }
      } finally {
        await app.close();
      }
    },
  );

  it('does not invent source evidence for unconfigured local or old deployments', async () => {
    const app = buildApp({ checkDatabase: async () => {}, logger: false });
    try {
      for (const path of ['/health', '/ready']) {
        const response = await app.inject(path);
        expect(response.statusCode).toBe(200);
        expect(response.headers['x-justgo-source-sha']).toBeUndefined();
        expect(response.headers['x-justgo-environment']).toBeUndefined();
      }
    } finally {
      await app.close();
    }
  });

  it.each([
    '',
    'main',
    `${sourceSha}\n`,
    `${sourceSha}\nprivate`,
    'g'.repeat(40),
  ])('rejects malformed release metadata before serving: %j', (invalidSha) => {
    expect(() =>
      buildApp({
        checkDatabase: async () => {},
        releaseIdentity: { sourceSha: invalidSha, environment: 'staging' },
      }),
    ).toThrow('Invalid API release identity');
  });
});
