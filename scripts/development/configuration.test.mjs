import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  developmentEnvironment,
  validateDevelopmentEnvironment,
  localDevelopmentEnvironment,
  releaseGoogleIosClientId,
} from './configuration.mjs';

export function publicEnvironment() {
  return {
    IOS_BUNDLE_IDENTIFIER: 'com.anthonyyoo.justgo.dev',
    EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER: 'iCloud.com.anthonyyoo.justgo.dev',
    ICLOUD_CONTAINER_ENVIRONMENT: 'Production',
    EXPO_PUBLIC_API_URL: 'https://justgo-two.vercel.app',
    EXPO_PUBLIC_SUPABASE_URL: 'https://kmcpcauaxlgpevkkenwd.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: '123-dev.apps.googleusercontent.com',
    EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME: 'com.googleusercontent.apps.123-dev',
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: '123-web.apps.googleusercontent.com',
    EXPO_PUBLIC_SENTRY_ENABLED: 'false',
    EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://justgo-legal.vercel.app/privacy/',
    EXPO_PUBLIC_TERMS_URL: 'https://justgo-legal.vercel.app/terms/',
  };
}

test('launch configuration pins the separate device variant and prevents Expo dotenv overrides', async () => {
  const environment = await developmentEnvironment(publicEnvironment());
  assert.equal(environment.JUSTGO_APP_VARIANT, 'development');
  assert.equal(environment.EXPO_NO_DOTENV, '1');
  assert.equal(
    environment.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    publicEnvironment().EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  );
});

test('profile overrides cannot substitute another API or release identity after environment validation', async () => {
  const eas = JSON.parse(
    await readFile(
      new URL('../../apps/mobile/eas.json', import.meta.url),
      'utf8',
    ),
  );
  for (const [key, value] of [
    ['EXPO_PUBLIC_API_URL', 'https://wrong.invalid'],
    ['IOS_BUNDLE_IDENTIFIER', 'com.anthonyyoo.justgo'],
    ['EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER', 'iCloud.com.anthonyyoo.justgo'],
    ['JUSTGO_APP_VARIANT', 'release'],
  ]) {
    const changed = structuredClone(eas);
    changed.build.development.env[key] = value;
    await assert.rejects(developmentEnvironment(publicEnvironment(), changed));
  }
  for (const patch of [
    { distribution: 'store' },
    { developmentClient: false },
    { node: '22.0.0' },
    { autoIncrement: false },
    { extends: 'production' },
    { ios: { simulator: true } },
  ]) {
    const changed = structuredClone(eas);
    Object.assign(changed.build.development, patch);
    await assert.rejects(developmentEnvironment(publicEnvironment(), changed));
  }
});

test('a correctly formatted release Google client cannot be reused by the Dev app', () => {
  assert.throws(
    () =>
      validateDevelopmentEnvironment({
        ...publicEnvironment(),
        EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: releaseGoogleIosClientId,
        EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME: `com.googleusercontent.apps.${releaseGoogleIosClientId.replace('.apps.googleusercontent.com', '')}`,
      }),
    /Google iOS client/,
  );
});

test('the local launcher loads only its dedicated file and refuses missing configuration', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'justgo-dev-env-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, '.env.development.local');
  await assert.rejects(
    localDevelopmentEnvironment({}, path),
    /Pull the configured EAS development environment/,
  );
  await writeFile(
    path,
    Object.entries(publicEnvironment())
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
  );
  const environment = await localDevelopmentEnvironment(
    {
      IOS_BUNDLE_IDENTIFIER: 'com.anthonyyoo.justgo',
      EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: releaseGoogleIosClientId,
    },
    path,
  );
  assert.equal(environment.IOS_BUNDLE_IDENTIFIER, 'com.anthonyyoo.justgo.dev');
  assert.equal(
    environment.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    publicEnvironment().EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  );
  assert.equal(environment.EXPO_NO_DOTENV, '1');
});

test('stale release identities and wrong provider/server inputs fail before launching or building', async () => {
  for (const [key, value] of [
    ['IOS_BUNDLE_IDENTIFIER', 'com.anthonyyoo.justgo'],
    ['EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER', 'iCloud.com.anthonyyoo.justgo'],
    ['ICLOUD_CONTAINER_ENVIRONMENT', 'Development'],
    ['EXPO_PUBLIC_API_URL', 'https://unapproved.invalid'],
    ['EXPO_PUBLIC_SUPABASE_URL', 'https://other.supabase.co'],
    ['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_secret_do-not-print'],
    ['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID', 'invalid'],
    ['EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME', 'com.googleusercontent.apps.release'],
    ['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'invalid'],
    ['EXPO_PUBLIC_SENTRY_ENABLED', 'true'],
    ['EXPO_PUBLIC_PRIVACY_POLICY_URL', 'http://localhost/privacy/'],
    ['EXPO_PUBLIC_TERMS_URL', ''],
    ['JUSTGO_JOURNEY_FIXTURES', 'true'],
  ]) {
    const environment = { ...publicEnvironment(), [key]: value };
    assert.throws(
      () => validateDevelopmentEnvironment(environment),
      (error) =>
        error.message.startsWith('Invalid JustGO Dev configuration:') &&
        !error.message.includes('do-not-print'),
    );
    await assert.rejects(developmentEnvironment(environment));
  }
});
