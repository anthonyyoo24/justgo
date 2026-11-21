import { z } from 'zod';
import { serverDiagnosticConfiguration } from './http/sentry-configuration.js';
import type { AppleBillingConfig } from './billing/apple.js';
import type { SuperwallErasureConfig } from './identity/superwall-erasure.js';

/** The default rate key for local runs. Production refuses it at boot. */
export const localDevelopmentRateKey =
  'local-development-rate-key-not-for-deployment';

const databaseSchema = z.object({
  DATABASE_URL: z.url().optional(),
  DATABASE_SSL: z.enum(['verify-full', 'disable']).default('verify-full'),
  DATABASE_CA_CERT: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(5).default(1),
});
const configSchema = z.object({
  ...databaseSchema.shape,
  APP_ENVIRONMENT: z.enum(['production', 'staging']).default('production'),
  JUSTGO_SOURCE_SHA: z
    .string()
    .length(40)
    .regex(/^[a-f0-9]{40}$/)
    .optional(),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['silent', 'error', 'warn', 'info', 'debug'])
    .default('info'),
  API_SENTRY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  API_SENTRY_DSN: z.string().optional(),
  API_SENTRY_RELEASE: z.string().optional(),
  CORS_ORIGINS: z.string().default(''),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  SUPABASE_AUTH_SECRET_KEY: z.string().min(32).optional(),
  MANAGED_AUTH_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Paid access stays off until every App Store Server API value is set.
  BILLING_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  APPLE_IAP_KEY_ID: z
    .string()
    .regex(/^[A-Z0-9]{10}$/)
    .optional(),
  APPLE_IAP_ISSUER_ID: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .optional(),
  APPLE_BUNDLE_ID: z
    .string()
    .regex(/^[A-Za-z0-9.-]{1,155}$/)
    .optional(),
  APPLE_IAP_PRIVATE_KEY: z.string().includes('PRIVATE KEY').optional(),
  APPLE_IAP_ENVIRONMENT: z.enum(['Production', 'Sandbox']).optional(),
  // Superwall's Svix endpoint secret, and the bearer the scheduled repair sends.
  SUPERWALL_WEBHOOK_SECRET: z
    .string()
    .regex(/^whsec_[A-Za-z0-9+/]{32,}={0,2}$/)
    .optional(),
  BILLING_REPAIR_SECRET: z
    .string()
    .regex(/^[\x21-\x7e]{32,512}$/)
    .optional(),
  // A Superwall API key with the user erasure scope, and the Superwall app it erases from.
  SUPERWALL_API_KEY: z
    .string()
    .regex(/^[\x21-\x7e]{16,512}$/)
    .optional(),
  SUPERWALL_APPLICATION_ID: z
    .string()
    .regex(/^[0-9]{1,20}$/)
    .optional(),
  IDENTITY_RATE_LIMIT_KEY: z.string().min(32).default(localDevelopmentRateKey),
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

function validateDatabase(config: z.infer<typeof databaseSchema>) {
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

/** Validate an alternate transport after the complete invocation config passed. */
export function readDatabaseConfig(env: NodeJS.ProcessEnv) {
  const result = databaseSchema.safeParse(env);
  if (!result.success) throw new Error('Invalid API environment configuration');
  return validateDatabase(result.data);
}

function appleBilling(
  config: z.infer<typeof configSchema>,
): AppleBillingConfig | undefined {
  if (!config.BILLING_ENABLED) return undefined;
  const {
    APPLE_IAP_KEY_ID: keyId,
    APPLE_IAP_ISSUER_ID: issuerId,
    APPLE_BUNDLE_ID: bundleId,
    APPLE_IAP_PRIVATE_KEY: privateKey,
    APPLE_IAP_ENVIRONMENT: environment,
  } = config;
  if (!keyId || !issuerId || !bundleId || !privateKey || !environment)
    throw new Error('Billing requires every App Store Server API setting');
  return { keyId, issuerId, bundleId, privateKey, environment };
}

function billingEvents(config: z.infer<typeof configSchema>) {
  if (!config.BILLING_ENABLED) return undefined;
  const {
    SUPERWALL_WEBHOOK_SECRET: webhookSecret,
    BILLING_REPAIR_SECRET: repairSecret,
  } = config;
  if (!webhookSecret || !repairSecret)
    throw new Error('Billing requires the webhook and repair secrets');
  return { webhookSecret, repairSecret };
}

function superwallErasure(
  config: z.infer<typeof configSchema>,
): SuperwallErasureConfig | undefined {
  if (!config.BILLING_ENABLED) return undefined;
  const { SUPERWALL_API_KEY: apiKey, SUPERWALL_APPLICATION_ID: applicationId } =
    config;
  // Billing identifies owners to Superwall, so account deletion must erase them there.
  if (!apiKey || !applicationId)
    throw new Error('Billing requires the Superwall erasure settings');
  return { apiKey, applicationId };
}

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
  if (config.NODE_ENV === 'production' && !config.DATABASE_URL)
    throw new Error('DATABASE_URL is required in production');
  if (
    config.NODE_ENV === 'production' &&
    config.IDENTITY_RATE_LIMIT_KEY === localDevelopmentRateKey
  )
    throw new Error('IDENTITY_RATE_LIMIT_KEY is required in production');
  validateDatabase(config);
  return {
    ...config,
    APPLE_BILLING: appleBilling(config),
    BILLING_EVENTS: billingEvents(config),
    SUPERWALL_ERASURE: superwallErasure(config),
    API_SENTRY: serverDiagnosticConfiguration(
      config.API_SENTRY_ENABLED,
      config.API_SENTRY_DSN,
      config.API_SENTRY_RELEASE,
      config.APP_ENVIRONMENT,
    ),
  };
}
export type Config = ReturnType<typeof readConfig>;
