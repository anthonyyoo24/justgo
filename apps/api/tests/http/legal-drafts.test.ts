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
        expect(response.body).toContain('Phase 12 owns legal review');
        expect(response.body).toContain(
          'JustGO does not record document views or legal agreement.',
        );
        expect(response.body).not.toContain('analytics-scope versions');
        if (path === 'privacy') {
          expect(response.body).toContain(
            'Product analytics stays disabled through beta and paid launch.',
          );
          expect(response.body).toContain(
            'Reading legal documents does not authorize future analytics.',
          );
          expect(response.body).toContain(
            'When enabled, Sentry processes minimal crash reports in the United States',
          );
          expect(response.body).toContain(
            'Exported reports exclude your account ID, feelings, written reflections and breadcrumbs.',
          );
          expect(response.body).toContain('Ordinary delivery remains disabled');
          expect(response.body).toContain(
            'Pending uploads remain only on the original phone',
          );
          expect(response.body).not.toContain('PostHog');
          expect(response.body).not.toContain('reflection-length categories');
        }
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
