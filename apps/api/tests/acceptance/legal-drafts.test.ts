import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/build-app.js';

afterEach(() => vi.unstubAllEnvs());
describe('local development legal destinations', () => {
  it('renders public, labeled draft destinations only after explicit development opt-in', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('VERCEL', undefined);
    const app = buildApp({
      logger: false,
      checkDatabase: async () => {},
      developmentLegalDrafts: true,
    });
    try {
      for (const [path, title] of [
        ['terms', 'Terms of Service'],
        ['privacy', 'Privacy Policy'],
      ]) {
        const response = await app.inject(`/legal/${path}`);
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']).toContain('text/html');
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.body).toContain(`<h1>${title}</h1>`);
        expect(response.body).toContain(
          'Development draft — not final release documents.',
        );
        expect(response.body).toContain('noindex,nofollow');
      }
    } finally {
      await app.close();
    }
  });
  it.each([
    { enabled: false, environment: 'test', vercel: undefined },
    { enabled: true, environment: 'production', vercel: undefined },
    { enabled: true, environment: 'test', vercel: '1' },
  ])(
    'does not expose drafts for $environment / $vercel / $enabled',
    async ({ enabled, environment, vercel }) => {
      vi.stubEnv('NODE_ENV', environment);
      vi.stubEnv('VERCEL', vercel);
      const app = buildApp({
        logger: false,
        checkDatabase: async () => {},
        developmentLegalDrafts: enabled,
      });
      try {
        expect((await app.inject('/legal/terms')).statusCode).toBe(404);
        expect((await app.inject('/legal/privacy')).statusCode).toBe(404);
      } finally {
        await app.close();
      }
    },
  );
});
