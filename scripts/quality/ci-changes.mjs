import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { changedPaths } from './git.mjs';

// Agent tooling that the unit, database, journeys and exports jobs never run.
// Its own tests run in `static`. The files those jobs do run stay out:
// api-coverage.mjs (unit, database, checks), ci-changes.mjs (this gate) and
// generate-route-types.mjs (the mobile typecheck).
const appRunsFromQuality = new Set([
  'scripts/quality/api-coverage.mjs',
  'scripts/quality/ci-changes.mjs',
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
  if (event !== 'pull_request' || !base) return { app: true, icloud: true };
  try {
    const files = listFiles(base);
    return {
      app: appJobsNeeded(files),
      icloud: nativeICloudNeeded(files),
    };
  } catch {
    return { app: true, icloud: true };
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { app, icloud } = classifyChanges({
    event: process.env.JUSTGO_CI_EVENT,
    base: process.env.JUSTGO_CI_BASE,
  });
  console.info(app ? 'App jobs run.' : 'Markdown-only change: app jobs skip.');
  console.info(
    icloud
      ? 'Native iCloud tests run.'
      : 'No iCloud module change: native iCloud tests skip.',
  );
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `app=${app}\nicloud=${icloud}\n`);
}
