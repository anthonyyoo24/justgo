import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { changedPaths } from './git.mjs';

// Agent tooling that the unit, database, journeys and exports jobs never run.
// Its own tests run in `static`. The files those jobs do run stay out:
// api-coverage.mjs (unit, database, checks), ci-changes.mjs and the git.mjs it
// imports (this gate) and generate-route-types.mjs (the mobile typecheck).
const appRunsFromQuality = new Set([
  'scripts/quality/api-coverage.mjs',
  'scripts/quality/ci-changes.mjs',
  'scripts/quality/git.mjs',
  'scripts/quality/generate-route-types.mjs',
]);

export function isToolingOnly(file) {
  if (file.startsWith('.claude/hooks/') || file === '.claude/settings.json')
    return true;
  return file.startsWith('scripts/quality/') && !appRunsFromQuality.has(file);
}

export function appJobsNeeded(files) {
  return (
    files.length === 0 ||
    !files.every((file) => file.endsWith('.md') || isToolingOnly(file))
  );
}

// What live Expo Doctor and the API dependency audit read: every manifest, the
// lockfile and pnpm settings, the Node pin, the mobile app's root config files,
// config plugins, native modules and folders, and the CI pieces that run them.
// A new Expo or package release changes their answer without any commit, so
// other PRs skip them and a daily run on main catches that drift.
const dependencyFiles = new Set([
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  '.nvmrc',
  '.github/workflows/ci.yml',
  'scripts/quality/audit-api-dependencies.mjs',
  'scripts/quality/ci-changes.mjs',
  'scripts/quality/git.mjs',
]);
const dependencyFolders = [
  '.github/actions/setup-node/',
  'apps/mobile/plugins/',
  'apps/mobile/modules/',
  'apps/mobile/ios/',
  'apps/mobile/android/',
];

export function isDependencyFile(file) {
  if (file === 'package.json' || file.endsWith('/package.json')) return true;
  if (dependencyFiles.has(file)) return true;
  if (dependencyFolders.some((folder) => file.startsWith(folder))) return true;
  // apps/mobile/app.config.ts, eas.json, metro.config.js and the like.
  return file.startsWith('apps/mobile/') && !file.slice(12).includes('/');
}

export function dependencyChecksNeeded(files) {
  return files.length === 0 || files.some(isDependencyFile);
}

// The Swift package tests only this module; the workflow counts so job edits run it.
export function nativeICloudNeeded(files) {
  return (
    files.length === 0 ||
    files.some(
      (file) =>
        file.startsWith('apps/mobile/modules/justgo-icloud/') ||
        file === '.github/workflows/ci.yml',
    )
  );
}

export function classifyChanges({
  event,
  base,
  listFiles = (from) => changedPaths(`${from}..HEAD`),
}) {
  const all = { app: true, icloud: true, dependencies: true };
  if (event !== 'pull_request' || !base) return all;
  try {
    const files = listFiles(base);
    return {
      app: appJobsNeeded(files),
      icloud: nativeICloudNeeded(files),
      dependencies: dependencyChecksNeeded(files),
    };
  } catch {
    return all;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { app, icloud, dependencies } = classifyChanges({
    event: process.env.JUSTGO_CI_EVENT,
    base: process.env.JUSTGO_CI_BASE,
  });
  console.info(
    app ? 'App jobs run.' : 'Markdown and tooling change: app jobs skip.',
  );
  console.info(
    icloud
      ? 'Native iCloud tests run.'
      : 'No iCloud module change: native iCloud tests skip.',
  );
  console.info(
    dependencies
      ? 'Expo Doctor and the dependency audit run.'
      : 'No dependency change: Expo Doctor and the dependency audit skip.',
  );
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `app=${app}\nicloud=${icloud}\ndependencies=${dependencies}\n`,
    );
}
