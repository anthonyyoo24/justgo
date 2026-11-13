import { describe, expect, it } from 'vitest';
import {
  envFileText,
  functionSecretNames,
  functionSecrets,
} from '../../../../scripts/release/staging-supabase.mjs';
import { readConfig } from '../../src/config.js';
import { edgeConfigEnvironment } from '../../src/edge.js';

// #447: the release lane checks function secrets by hand. These cases hold it
// to the real boot path, so a value the lane accepts never fails readConfig().
const ref = 'kmcpcauaxlgpevkkenwd';
const sha = 'a'.repeat(40);
const dsn = `https://${'b'.repeat(32)}@o1.ingest.us.sentry.io/2`;
const window = {
  startsAt: '2026-11-01T00:00:00Z',
  expiresAt: '2026-12-01T00:00:00Z',
};
const grant = {
  userId: '6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
  ...window,
};
const base: Record<string, string> = {
  NODE_ENV: 'production',
  APP_ENVIRONMENT: 'staging',
  MANAGED_AUTH_ENABLED: 'true',
  DATABASE_URL: `postgresql://justgo_runtime.${ref}:synthetic-password@aws-0-ca-central-1.pooler.supabase.com:6543/postgres`,
  DATABASE_SSL: 'verify-full',
  DATABASE_CA_CERT:
    '-----BEGIN CERTIFICATE-----\nMIIBsynthetic\n-----END CERTIFICATE-----',
  IDENTITY_RATE_LIMIT_KEY: 'r'.repeat(32),
  JUSTGO_AUTH_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
  JUSTGO_AUTH_SECRET_KEY: 's'.repeat(40),
};

/** What the deployed function reads: the secrets, the platform URL and the bundle's release. */
function boots(values: Record<string, string>) {
  readConfig(
    edgeConfigEnvironment(
      { ...values, SUPABASE_URL: `https://${ref}.supabase.co` },
      { JUSTGO_SOURCE_SHA: sha, API_SENTRY_RELEASE: sha },
    ),
  );
}

function accepted(values: Record<string, string>) {
  try {
    functionSecrets(envFileText(values));
    return true;
  } catch {
    return false;
  }
}

const probes = [
  'x',
  '0',
  '1',
  '-1',
  '1.5',
  '1e2',
  '30',
  '31',
  '100',
  '101',
  '720',
  '721',
  '10000',
  '10001',
  'true',
  'false',
  'TRUE',
  'yes',
  'null',
  '[]',
  '{}',
  'verify-full',
  'disable',
  'require',
  'production',
  'staging',
  'development',
  'test',
  'silent',
  'error',
  'warn',
  'info',
  'debug',
  'verbose',
  'r'.repeat(32),
  dsn,
  'https://key@sentry.example/1',
  JSON.stringify(window),
  JSON.stringify({ startsAt: window.startsAt }),
  JSON.stringify({ ...window, expiresAt: window.startsAt }),
  JSON.stringify([grant]),
  JSON.stringify([grant, grant]),
  JSON.stringify([{ ...grant, userId: 'someone' }]),
  JSON.stringify([{ ...grant, revokedAt: '2026-10-01T00:00:00Z' }]),
  JSON.stringify([{ ...grant, startsAt: '2026-11-01T00:00:00+01:00' }]),
];

describe('staging function secrets (#447)', () => {
  it('accepts a complete staging file that the function boots with', () => {
    expect(accepted(base)).toBe(true);
    expect(() => boots(base)).not.toThrow();
  });

  it.each([...functionSecretNames])(
    'never accepts a %s value that readConfig() refuses',
    (name) => {
      const contexts = [
        base,
        { ...base, API_SENTRY_ENABLED: 'true', API_SENTRY_DSN: dsn },
      ];
      let checked = 0;
      for (const context of contexts)
        for (const value of [...probes, base[name] ?? 'x']) {
          const values = { ...context, [name]: value };
          if (!accepted(values)) continue;
          checked += 1;
          expect(() => boots(values), `${name}=${value}`).not.toThrow();
        }
      expect(checked).toBeGreaterThan(0);
    },
  );

  it('refuses the value that failed the November 12 release', () => {
    const values = { ...base, DATABASE_SSL: 'true' };
    expect(() => boots(values)).toThrow(
      'Invalid API environment configuration',
    );
    expect(accepted(values)).toBe(false);
  });
});
