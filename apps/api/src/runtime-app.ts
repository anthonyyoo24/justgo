import { buildApp } from './build-app.js';
import type { Config } from './config.js';
import type { ApiContext } from './http/request.js';
import type { ServerErrorReporter } from './http/server-error-reporter.js';
import {
  checkDatabase,
  checkManagedAuthDatabase,
  createDatabase,
} from './db/client.js';
import { loggerOptions } from './http/diagnostics.js';
import { createServerErrorReporter } from './http/server-error-reporter.js';
import { IdentityService } from './identity/service.js';
import { createBetaAccess } from './access/beta-access.js';
import { createManagedAuthVerifier } from './identity/managed-verifier.js';
import { createManagedAuthDeletion } from './identity/managed-deletion.js';

export function buildRuntimeApp(
  config: Config,
  database: ReturnType<typeof createDatabase> | undefined,
  runtime: {
    clientAddress?: (context: ApiContext) => string;
    reportServerError?: ServerErrorReporter;
    onVercel?: boolean;
    checkAdditionalDatabase?: () => Promise<void>;
  } = {},
) {
  return buildApp({
    logger: loggerOptions(config.LOG_LEVEL),
    reportServerError:
      runtime.reportServerError ?? createServerErrorReporter(config.API_SENTRY),
    ...(runtime.clientAddress ? { clientAddress: runtime.clientAddress } : {}),
    ...(config.JUSTGO_SOURCE_SHA
      ? {
          releaseIdentity: {
            sourceSha: config.JUSTGO_SOURCE_SHA,
            environment: config.APP_ENVIRONMENT,
          },
        }
      : {}),
    onVercel: runtime.onVercel ?? false,
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
      await runtime.checkAdditionalDatabase?.();
    },
  });
}
