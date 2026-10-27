import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseDocument } from '../../sites/legal/build.mjs';

// Node 24 can require this synchronous TS module without reclassifying the
// CommonJS mobile package or changing Metro's package semantics.
const { diagnosticConfiguration } = createRequire(import.meta.url)(
  '../../apps/mobile/src/app-support/diagnostics/configuration.ts',
);

const root = new URL('../../', import.meta.url);
export const betaApiOrigin = 'https://justgo-two.vercel.app';
const authOrigin = 'https://kmcpcauaxlgpevkkenwd.supabase.co';
const bundle = 'com.anthonyyoo.justgo';
const googleSuffix = '.apps.googleusercontent.com';

/** A missing flag preserves the original route, including older build artifacts. */
export function betaDiagnosticsMode(environment) {
  const value = environment.RELEASE_DIAGNOSTICS ?? 'false';
  if (!['true', 'false'].includes(value))
    throw new Error('RELEASE_DIAGNOSTICS must be true or false.');
  const diagnosticsEnabled = value === 'true';
  return {
    diagnosticsEnabled,
    buildProfile: diagnosticsEnabled ? 'beta-diagnostics' : 'beta',
  };
}

function publicUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      !isIP(host) &&
      host.includes('.') &&
      !/\.(?:local|localhost|internal|test|invalid|example)$/.test(host)
      ? url
      : null;
  } catch {
    return null;
  }
}

function publicAuthKey(value) {
  if (typeof value !== 'string') return false;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  try {
    // Configuration classification only, never session/token authentication.
    return (
      JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role === 'anon'
    );
  } catch {
    return false;
  }
}

/** Validate the resolved public build inputs; errors contain names, not values. */
export function checkBetaRelease({
  eas,
  environment,
  documents,
  operation = 'build',
  diagnostics = false,
}) {
  const errors = [];
  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };
  check(
    typeof diagnostics === 'boolean',
    'Select an explicit diagnostics mode.',
  );
  const base = eas.build?.beta;
  const selected = diagnostics ? eas.build?.['beta-diagnostics'] : base;
  const profile = diagnostics
    ? {
        ...base,
        ...selected,
        env: { ...base?.env, ...selected?.env },
        ios: { ...base?.ios, ...selected?.ios },
      }
    : base;
  const env = { ...environment, ...profile?.env };
  check(
    !base?.extends && (!diagnostics || selected?.extends === 'beta'),
    'Only the diagnostics profile may inherit the explicit beta profile.',
  );
  check(['build', 'submit'].includes(operation), 'Unknown release operation.');
  check(eas.cli?.version === '25.3.0', 'Pin EAS CLI to 25.3.0.');
  check(eas.cli?.appVersionSource === 'remote', 'Use remote app versions.');
  check(
    eas.cli?.requireCommit === true,
    'Require a committed build candidate.',
  );
  check(
    profile?.distribution === 'store' &&
      profile.developmentClient === false &&
      !profile.ios?.simulator &&
      (!profile.ios?.buildConfiguration ||
        profile.ios.buildConfiguration === 'Release') &&
      (!profile.extends || (diagnostics && profile.extends === 'beta')),
    'Beta must be an explicit store build without a development client.',
  );
  check(
    profile?.environment === 'preview',
    'Beta must use the preview EAS environment.',
  );
  check(profile?.node === '24.18.0', 'Beta must use the pinned Node runtime.');
  check(
    profile?.autoIncrement === true &&
      eas.build?.production?.autoIncrement === true,
    'Beta and production must increment their build versions.',
  );
  check(
    env.IOS_BUNDLE_IDENTIFIER === bundle,
    'Preserve the registered IOS_BUNDLE_IDENTIFIER.',
  );
  const api = publicUrl(env.EXPO_PUBLIC_API_URL);
  check(
    api?.origin === betaApiOrigin && api.pathname === '/',
    'EXPO_PUBLIC_API_URL must select the reviewed staging API.',
  );
  const auth = publicUrl(env.EXPO_PUBLIC_SUPABASE_URL);
  check(
    auth?.origin === authOrigin && auth.pathname === '/',
    'EXPO_PUBLIC_SUPABASE_URL must select the existing staging Auth project.',
  );
  check(
    publicAuthKey(env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    'Configure a public Supabase publishable/anon key, never a secret/service key.',
  );
  const iosClient = env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';
  const webClient = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
  check(
    /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(iosClient) &&
      /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(webClient) &&
      env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ===
        `com.googleusercontent.apps.${iosClient.slice(0, -googleSuffix.length)}`,
    'Configure the verified Google iOS/web clients and matching reversed iOS scheme.',
  );
  check(
    env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER === `iCloud.${bundle}` &&
      env.ICLOUD_CONTAINER_ENVIRONMENT === 'Production',
    'Preserve the approved private CloudKit container and Production environment.',
  );
  check(
    [base, selected].every(
      (value) =>
        !!value?.env?.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER ===
        !!value?.env?.ICLOUD_CONTAINER_ENVIRONMENT,
    ),
    'Profile CloudKit overrides must be paired before EAS loads remote variables.',
  );
  check(
    env.EXPO_PUBLIC_SENTRY_ENABLED === (diagnostics ? 'true' : 'false'),
    'Sentry configuration must match the explicitly selected diagnostics mode.',
  );
  if (diagnostics) {
    check(
      !!diagnosticConfiguration(
        env.EXPO_PUBLIC_SENTRY_ENABLED,
        env.EXPO_PUBLIC_SENTRY_DSN,
        env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
      ) &&
        env.EXPO_PUBLIC_SENTRY_ENVIRONMENT === 'staging' &&
        (!env.SENTRY_ENVIRONMENT || env.SENTRY_ENVIRONMENT === 'staging'),
      'Diagnostics needs the reviewed mobile US project DSN and staging environment.',
    );
    check(
      !environment.SENTRY_DISABLE_AUTO_UPLOAD &&
        !environment.SENTRY_ALLOW_FAILURE,
      'Diagnostics builds must not bypass source-map or debug-symbol uploads.',
    );
    if (operation === 'build')
      check(
        typeof environment.SENTRY_AUTH_TOKEN === 'string' &&
          environment.SENTRY_AUTH_TOKEN.trim().length > 0,
        'Diagnostics Release builds require private SENTRY_AUTH_TOKEN.',
      );
  }
  check(
    !env.JUSTGO_JOURNEY_FIXTURES && !env.EXPO_PUBLIC_JUSTGO_JOURNEY_FIXTURE,
    'Disposable journey fixtures must not enter a beta build.',
  );
  const legal = [
    ['PRIVACY_POLICY_DRAFT.md', 'EXPO_PUBLIC_PRIVACY_POLICY_URL', '/privacy/'],
    ['TERMS_DRAFT.md', 'EXPO_PUBLIC_TERMS_URL', '/terms/'],
  ];
  for (const [filename, name, route] of legal) {
    const url = publicUrl(env[name]);
    check(
      url && url.origin !== betaApiOrigin && url.pathname === route,
      `${name} must point to the published HTTPS document, independently of API drafts.`,
    );
    try {
      // Reuse the site's actual publication boundary, including dates and placeholders.
      const document = parseDocument(documents[filename], true);
      if (diagnostics && filename === 'PRIVACY_POLICY_DRAFT.md') {
        const scopes = documents[filename].match(
          /^<!-- diagnostics-scope: [^\r\n]+ -->$/gm,
        );
        check(
          scopes?.length === 1 &&
            scopes[0] === '<!-- diagnostics-scope: essential-errors-only -->' &&
            environment.BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION ===
              document.version,
          'Publish the approved essential-errors notice and attest its exact version before diagnostics builds.',
        );
      }
    } catch {
      errors.push(
        `${filename} needs approved public wording and a final effective date.`,
      );
    }
  }
  if (operation === 'submit') {
    check(
      /^\d{6,20}$/.test(String(eas.submit?.beta?.ios?.ascAppId ?? '')),
      'Verify and configure the matching App Store Connect ascAppId before upload.',
    );
    check(
      eas.submit?.beta?.ios?.appleTeamId === 'NPDYTJS425',
      'Preserve the existing Apple team for beta upload.',
    );
  }
  return errors;
}

async function main() {
  const eas = JSON.parse(
    await readFile(new URL('apps/mobile/eas.json', root), 'utf8'),
  );
  const documents = Object.fromEntries(
    await Promise.all(
      ['PRIVACY_POLICY_DRAFT.md', 'TERMS_DRAFT.md'].map(async (name) => [
        name,
        await readFile(new URL(`docs/legal/${name}`, root), 'utf8'),
      ]),
    ),
  );
  const errors = checkBetaRelease({
    eas,
    environment: process.env,
    documents,
    operation: process.env.RELEASE_OPERATION ?? 'build',
    diagnostics: betaDiagnosticsMode(process.env).diagnosticsEnabled,
  });
  if (errors.length) {
    console.error(`Beta preflight blocked (${errors.length} items):`);
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
  } else {
    console.info(
      'Beta public configuration and legal-source preflight passed.',
    );
    console.info(
      'Native device acceptance remains open before external testing; build/upload authorization is separate.',
    );
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  await main();
