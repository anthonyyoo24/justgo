// The sensitive areas from AGENTS.md "Agent effort": sign-in and identity,
// account data and deletion, database migrations, and release and backup
// scripts. The verifier hook keeps a PR that touches one on Opus.
export const sensitivePaths = [
  'apps/api/src/identity/',
  'apps/api/src/access/',
  'apps/api/src/account-export/',
  'apps/api/src/data-sync/',
  'apps/api/src/http/bearer.ts',
  'apps/api/src/db/schema.ts',
  'apps/api/src/db/managed-session-check.ts',
  'apps/api/drizzle/',
  'apps/api/scripts/',
  'apps/mobile/src/app-support/identity/',
  'apps/mobile/src/app-support/access/',
  'apps/mobile/src/app/account/',
  'apps/mobile/src/data/backup/',
  'apps/mobile/src/data/cloud/',
  'apps/mobile/src/data/activity/sync/',
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
