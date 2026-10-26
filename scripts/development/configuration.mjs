import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const mobileRoot = fileURLToPath(
  new URL('../../apps/mobile/', import.meta.url),
);
export const developmentIdentity = Object.freeze({
  bundle: 'com.anthonyyoo.justgo.dev',
  container: 'iCloud.com.anthonyyoo.justgo.dev',
  scheme: 'justgo-dev',
  team: 'NPDYTJS425',
  projectId: '53cf0560-8ab5-446a-9bc6-deb193b337b5',
});
export const releaseGoogleIosClientId =
  '881166911699-nnplpatgdvqogjlnfed198jlbqslj3cn.apps.googleusercontent.com';

/** Public configuration only. Fail with variable names, never supplied values. */
export function validateDevelopmentEnvironment(environment) {
  const check = (condition, name) => {
    if (!condition)
      throw new Error(`Invalid JustGO Dev configuration: ${name}.`);
  };
  check(
    environment.IOS_BUNDLE_IDENTIFIER === developmentIdentity.bundle,
    'IOS_BUNDLE_IDENTIFIER',
  );
  check(
    environment.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER ===
      developmentIdentity.container &&
      environment.ICLOUD_CONTAINER_ENVIRONMENT === 'Production',
    'separate Production CloudKit container',
  );
  check(
    environment.EXPO_PUBLIC_API_URL === 'https://justgo-two.vercel.app',
    'EXPO_PUBLIC_API_URL',
  );
  check(
    environment.EXPO_PUBLIC_SUPABASE_URL ===
      'https://kmcpcauaxlgpevkkenwd.supabase.co',
    'EXPO_PUBLIC_SUPABASE_URL',
  );
  check(
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(
      environment.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    ),
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  );
  const suffix = '.apps.googleusercontent.com';
  const ios = environment.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
  check(
    /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(ios) &&
      ios !== releaseGoogleIosClientId &&
      environment.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ===
        `com.googleusercontent.apps.${ios.slice(0, -suffix.length)}`,
    'Google iOS client and callback scheme',
  );
  check(
    /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(
      environment.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
    ),
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  );
  check(
    environment.EXPO_PUBLIC_SENTRY_ENABLED === 'false',
    'EXPO_PUBLIC_SENTRY_ENABLED',
  );
  for (const [key, path] of [
    ['EXPO_PUBLIC_PRIVACY_POLICY_URL', 'privacy'],
    ['EXPO_PUBLIC_TERMS_URL', 'terms'],
  ]) {
    check(environment[key] === `https://justgo-legal.vercel.app/${path}/`, key);
  }
  check(
    !Object.entries(environment).some(
      ([key, value]) =>
        /(?:FIXTURE|JOURNEY)/.test(key) &&
        value &&
        value !== 'false' &&
        value !== '0',
    ),
    'fixture-free environment',
  );
  return environment;
}

export async function developmentEnvironment(environment, configuration) {
  const eas =
    configuration ??
    JSON.parse(
      await readFile(
        new URL('../../apps/mobile/eas.json', import.meta.url),
        'utf8',
      ),
    );
  const profile = eas.build.development;
  if (
    profile.developmentClient !== true ||
    profile.distribution !== 'internal' ||
    profile.environment !== 'development' ||
    profile.ios?.simulator ||
    profile.node !== '24.18.0' ||
    profile.autoIncrement !== true ||
    profile.extends ||
    eas.cli.version !== '25.3.0' ||
    eas.cli.appVersionSource !== 'remote' ||
    !eas.cli.requireCommit
  ) {
    throw new Error(
      'JustGO Dev requires its pinned internal development profile.',
    );
  }
  // Validate the source environment first: do not hide stale release identity
  // inputs from an old .env.local or the EAS development environment.
  validateDevelopmentEnvironment(environment);
  const resolved = { ...environment, ...profile.env, EXPO_NO_DOTENV: '1' };
  validateDevelopmentEnvironment(resolved);
  if (resolved.JUSTGO_APP_VARIANT !== 'development')
    throw new Error('JustGO Dev requires its explicit development variant.');
  return resolved;
}

export async function localDevelopmentEnvironment(
  base = process.env,
  path = new URL('../../apps/mobile/.env.development.local', import.meta.url),
) {
  let file;
  try {
    file = await readFile(path, 'utf8');
  } catch {
    throw new Error(
      'Pull the configured EAS development environment into apps/mobile/.env.development.local before starting JustGO Dev.',
    );
  }
  return developmentEnvironment({ ...base, ...parseEnv(file) });
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  developmentEnvironment(process.env)
    .then(() => {
      console.info('JustGO Dev public configuration passed.');
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
