import worker from '../src/worker.js';
import { localTestDatabaseUrl } from './local-test-database.js';

// This entrypoint is used only by the disposable local workerd smoke. Startup
// must not contact Auth, Sentry or any other hosted HTTP service.
let outboundRequests = 0;
globalThis.fetch = async () => {
  outboundRequests++;
  throw new Error('Worker smoke forbids outbound HTTP');
};

export default {
  async fetch(...args: Parameters<typeof worker.fetch>) {
    const [request, bindings, execution] = args;
    const target = localTestDatabaseUrl(bindings.LOCK_DATABASE_URL);
    if (
      new URL(request.url).hostname !== '127.0.0.1' ||
      target.username !== 'justgo_runtime' ||
      bindings.DATABASE_SSL !== 'disable'
    )
      throw new Error('Worker smoke entrypoint requires the loopback fixture');
    const mode = request.headers.get('x-justgo-smoke-mode');
    const managed = mode === 'managed' || mode === 'managed-wrapped';
    const now = Date.now();
    const fixture = managed
      ? {
          ...bindings,
          MANAGED_AUTH_ENABLED: 'true',
          SUPABASE_URL: 'https://synthetic-auth.invalid',
          SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable-key',
          SUPABASE_AUTH_SECRET_KEY:
            'synthetic-auth-secret-with-at-least-32-characters',
          JUSTGO_SOURCE_SHA: 'b'.repeat(40),
          API_SENTRY_ENABLED: 'true',
          API_SENTRY_DSN: `https://${'c'.repeat(32)}@o1.ingest.us.sentry.io/1`,
          API_SENTRY_RELEASE: 'b'.repeat(40),
          BETA_ACCESS_WINDOW: JSON.stringify({
            startsAt: new Date(now - 60000).toISOString(),
            expiresAt: new Date(now + 3600000).toISOString(),
          }),
          ...(mode === 'managed-wrapped'
            ? {
                HYPERDRIVE: {
                  connectionString: `postgresql://${'b'.repeat(32)}:${'c'.repeat(32)}@${'d'.repeat(32)}.workers.alt:5432/${'e'.repeat(32)}?sslmode=disable`,
                },
              }
            : {}),
        }
      : mode === 'invalid'
        ? { ...bindings, JUSTGO_SOURCE_SHA: 'synthetic-invalid-source' }
        : bindings;
    const response = await worker.fetch(request, fixture, execution);
    response.headers.set('x-justgo-smoke-outbound', String(outboundRequests));
    return response;
  },
};
