// probe
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function appJobsNeeded(files) {
  return files.length === 0 || !files.every((file) => file.endsWith('.md'));
}

export function classifyChanges({
  event,
  base,
  listFiles = (from) =>
    execFileSync('git', ['diff', '--name-only', from, 'HEAD'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean),
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
