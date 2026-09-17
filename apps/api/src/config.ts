import { z } from 'zod';

const configSchema = z.object({
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
});

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = configSchema.safeParse(env);
  if (!result.success) throw new Error('Invalid API environment configuration');
  const config = result.data;
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
  return config;
}
export type Config = ReturnType<typeof readConfig>;
