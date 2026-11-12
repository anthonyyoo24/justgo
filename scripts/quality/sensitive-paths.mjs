// The sensitive areas from AGENTS.md "Agent effort": sign-in and identity,
// account data and deletion, database migrations, and release and backup
// scripts. Privacy counts too: secret storage, the code that carries account
// data or writing, diagnostics, outbound requests, and the legal pages and
// the code that shows them. The verifier hook keeps a PR that touches one on
// Opus.
export const sensitivePaths = [
  'apps/api/src/identity/',
  'apps/api/src/access/',
  'apps/api/src/account-export/',
  'apps/api/src/data-sync/',
  'apps/api/src/build-app.ts',
  'apps/api/src/http/bearer.ts',
  'apps/api/src/http/diagnostics.ts',
  'apps/api/src/http/legal-drafts.ts',
  'apps/api/src/http/outbound-fetch.ts',
  'apps/api/src/http/sentry-configuration.ts',
  'apps/api/src/http/server-error-reporter.ts',
  'apps/api/src/db/schema.ts',
  'apps/api/src/db/managed-session-check.ts',
  'apps/api/src/db/owner-transaction.ts',
  'apps/api/src/db/transaction-context.ts',
  'apps/api/drizzle/',
  'apps/api/scripts/',
  'apps/mobile/src/app-support/identity/',
  'apps/mobile/src/app-support/access/',
  'apps/mobile/src/app-support/acceptance/',
  'apps/mobile/src/app-support/providers/',
  'apps/mobile/src/app-support/diagnostics/',
  'apps/mobile/src/app/account/',
  'apps/mobile/src/data/',
  'apps/mobile/src/features/reflections/',
  'apps/mobile/src/features/settings/data/',
  'apps/mobile/src/features/settings/export/',
  'apps/mobile/src/lib/network/account-client.ts',
  'apps/mobile/src/platform/auth/',
  'apps/mobile/src/platform/backup/',
  'apps/mobile/src/platform/export/',
  'apps/mobile/src/platform/icloud/',
  'apps/mobile/plugins/with-sentry-privacy.cjs',
  'docs/legal/',
  'sites/legal/',
  'scripts/release/',
  'scripts/backups/',
  '.github/workflows/database-backups.yml',
  '.github/workflows/development-ios.yml',
  '.github/workflows/staging-api.yml',
  '.github/workflows/staging-health.yml',
  '.github/workflows/testflight-beta.yml',
];

// A trailing slash names a folder. Anything else names one file.
export function isSensitivePath(file) {
  return sensitivePaths.some((entry) =>
    entry.endsWith('/') ? file.startsWith(entry) : file === entry,
  );
}

// A verdict marks a change that affects a sensitive area from outside the list.
export const sensitiveFlag = /^[ \t]*\**Sensitive:\**[ \t]*yes\b/im;
