import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { changedPaths } from './git.mjs';

export function appJobsNeeded(files) {
  return files.length === 0 || !files.every((file) => file.endsWith('.md'));
}

export function classifyChanges({
  event,
  base,
  listFiles = (from) => changedPaths(`${from}..HEAD`),
}) {
  if (event !== 'pull_request' || !base) return true;
  try {
    return appJobsNeeded(listFiles(base));
  } catch {
    return true;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = classifyChanges({
    event: process.env.JUSTGO_CI_EVENT,
    base: process.env.JUSTGO_CI_BASE,
  });
  console.info(app ? 'App jobs run.' : 'Markdown-only change: app jobs skip.');
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `app=${app}\n`);
}
