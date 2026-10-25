import { z } from 'zod';
import { readBetaAccessWindow, readBetaGrants } from './access/beta-access.js';

const configSchema = z.object({
  APP_ENVIRONMENT: z.enum(['production', 'staging']).default('production'),
  BETA_ACCESS_GRANTS: z.string().default('[]'),
  BETA_ACCESS_WINDOW: z.string().default('null'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_SSL: z.enum(['verify-full', 'disable']).default('verify-full'),
  DATABASE_CA_CERT: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(5).default(1),
  LOG_LEVEL: z
    .enum(['silent', 'error', 'warn', 'info', 'debug'])
    .default('info'),
  CORS_ORIGINS: z.string().default(''),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_AUTH_SECRET_KEY: z.string().min(32).optional(),
  MANAGED_AUTH_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  IDENTITY_RATE_LIMIT_KEY: z
    .string()
    .min(32)
    .default('local-development-rate-key-not-for-deployment'),
  IDENTITY_SESSION_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  IDENTITY_TRANSFER_MINUTES: z.coerce.number().int().min(1).max(30).default(10),
  IDENTITY_RECOVERY_RATE_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(30),
  ACTIVITY_WRITE_RATE_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .default(600),
  ACCOUNT_EXPORT_RATE_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    // Full-history sync/import can enumerate the 50,000-record client limit twice.
    .default(3000),
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = configSchema.safeParse(env);
  if (!result.success) throw new Error('Invalid API environment configuration');
  const config = result.data;
  if (config.MANAGED_AUTH_ENABLED && !config.SUPABASE_URL)
    throw new Error('Managed Auth requires Supabase configuration');
  if (config.MANAGED_AUTH_ENABLED && !config.SUPABASE_AUTH_SECRET_KEY)
    throw new Error(
      'Managed Auth requires server-only Auth deletion credentials',
    );
  if (Boolean(config.SUPABASE_URL) !== Boolean(config.SUPABASE_PUBLISHABLE_KEY))
    throw new Error(
      'Supabase Auth configuration must include URL and publishable key',
    );
  const grants = readBetaGrants(config.BETA_ACCESS_GRANTS);
  const accessWindow = readBetaAccessWindow(config.BETA_ACCESS_WINDOW);
  if (
    config.APP_ENVIRONMENT !== 'staging' &&
    (grants.length > 0 || accessWindow)
  )
    throw new Error('Beta access is allowed only in staging');
  if (config.NODE_ENV === 'production' && !config.DATABASE_URL)
    throw new Error('DATABASE_URL is required in production');
  if (
    config.NODE_ENV === 'production' &&
    config.IDENTITY_RATE_LIMIT_KEY ===
      'local-development-rate-key-not-for-deployment'
  )
    throw new Error('IDENTITY_RATE_LIMIT_KEY is required in production');
  if (config.DATABASE_URL) {
    const url = new URL(config.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol))
      throw new Error('Database URL must use PostgreSQL');
    if (
      config.DATABASE_SSL === 'disable' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    )
      throw new Error(
        'Unencrypted database connections are allowed only on loopback',
      );
  }
  return {
    ...config,
    BETA_ACCESS_GRANTS: grants,
    BETA_ACCESS_WINDOW: accessWindow,
  };
}
export type Config = ReturnType<typeof readConfig>;
