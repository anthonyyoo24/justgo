import Fastify from 'fastify';
import { buildApp } from './build-app.js';
import { readConfig } from './config.js';
import {
  checkDatabase,
  checkManagedAuthDatabase,
  createDatabase,
} from './db/client.js';
import { loggerOptions } from './http/diagnostics.js';
import { IdentityService } from './identity/service.js';
import { createBetaAccess } from './access/beta-access.js';
import { createManagedAuthVerifier } from './identity/managed-verifier.js';
import { createManagedAuthDeletion } from './identity/managed-deletion.js';

const config = readConfig();
// Once per warm process/function instance; never construct a pool per request.
const database = config.DATABASE_URL ? createDatabase(config) : undefined;
const app = buildApp(
  {
    logger: loggerOptions(config.LOG_LEVEL),
    onVercel: process.env.VERCEL === '1',
    legacyIdentityEnabled: !config.MANAGED_AUTH_ENABLED,
    developmentLegalDrafts:
      config.NODE_ENV === 'development' &&
      config.APP_ENVIRONMENT !== 'staging' &&
      !process.env.VERCEL,
    ...(config.APP_ENVIRONMENT === 'staging'
      ? createBetaAccess(
          config.BETA_ACCESS_GRANTS,
          Date.now,
          config.BETA_ACCESS_WINDOW,
        )
      : {}),
    ...(database
      ? {
          identity: new IdentityService(database.db, {
            rateKey: config.IDENTITY_RATE_LIMIT_KEY,
            sessionHours: config.IDENTITY_SESSION_HOURS,
            transferMinutes: config.IDENTITY_TRANSFER_MINUTES,
            rateLimit: config.IDENTITY_RECOVERY_RATE_LIMIT,
            activityWriteRateLimit: config.ACTIVITY_WRITE_RATE_LIMIT,
            accountExportRateLimit: config.ACCOUNT_EXPORT_RATE_LIMIT,
            ...(config.MANAGED_AUTH_ENABLED &&
            config.SUPABASE_URL &&
            config.SUPABASE_PUBLISHABLE_KEY
              ? {
                  managedAuthVerifier: createManagedAuthVerifier(
                    config.SUPABASE_URL,
                    config.SUPABASE_PUBLISHABLE_KEY,
                  ),
                }
              : {}),
            ...(config.MANAGED_AUTH_ENABLED &&
            config.SUPABASE_URL &&
            config.SUPABASE_AUTH_SECRET_KEY
              ? {
                  managedAuthDeletion: createManagedAuthDeletion(
                    config.SUPABASE_URL,
                    config.SUPABASE_AUTH_SECRET_KEY,
                  ),
                }
              : {}),
          }),
        }
      : {}),
    origins: config.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    checkDatabase: async () => {
      if (!database) throw new Error('Database is not configured');
      await checkDatabase(database.pool);
      if (config.MANAGED_AUTH_ENABLED)
        await checkManagedAuthDatabase(database.pool);
    },
  },
  Fastify,
);
app.addHook('onClose', async () => {
  await database?.pool.end();
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void app.close();
  });
}
// Vercel captures listen during module loading; do not await it at module scope.
void app.listen({ port: config.PORT, host: '0.0.0.0' }).catch(() => {
  app.log.fatal('API startup failed');
  process.exitCode = 1;
  void app.close();
});
