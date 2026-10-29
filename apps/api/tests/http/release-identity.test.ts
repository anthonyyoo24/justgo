import { apiRequest } from '../request.js';
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

      const health = await apiRequest(app, '/health');
      expect(health.json()).toEqual({ status: 'ok', service: 'justgo-api' });
      const ready = await apiRequest(app, '/ready?untrusted=ignored');
      expect(ready.json()).toEqual({ status: 'ready' });
      available = false;
      const failed = await apiRequest(app, '/ready');
      expect(failed.statusCode).toBe(503);
      expect(failed.json()).toEqual({ status: 'unavailable' });
      for (const response of [health, ready, failed]) {
        expect(response.headers['x-justgo-source-sha']).toBe(sourceSha);
        expect(response.headers['x-justgo-environment']).toBe(environment);
        expect(response.headers['cache-control']).toBe('no-store');
      }
      for (const path of ['/openapi.json', '/unknown', '/health/unknown']) {
        const response = await apiRequest(app, path);
        expect(response.headers['x-justgo-source-sha']).toBeUndefined();
        expect(response.headers['x-justgo-environment']).toBeUndefined();
      }
    },
  );

  it('does not invent source evidence for unconfigured local or old deployments', async () => {
    const app = buildApp({ checkDatabase: async () => {}, logger: false });

    for (const path of ['/health', '/ready']) {
      const response = await apiRequest(app, path);
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-justgo-source-sha']).toBeUndefined();
      expect(response.headers['x-justgo-environment']).toBeUndefined();
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
