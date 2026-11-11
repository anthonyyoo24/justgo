import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// .github/workflows/dependency-health.yml runs this when the daily live Expo
// Doctor or dependency audit fails on main. It keeps one open issue with this
// title: it comments on the open one, or opens it when none is open.
export const issueTitle = 'Daily dependency health check fails on main';

export function body(runUrl) {
  return [
    `The daily live Expo Doctor or API dependency audit failed on main: ${runUrl}`,
    '',
    'A new Expo or package release usually causes this. Open a PR that bumps the packages the run names, then close this issue with a link to it.',
  ].join('\n');
}

const defaultGh = (args) =>
  execFileSync('gh', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

// Returns 'commented' with the issue number, or 'opened'.
export function reportFailure({ runUrl, gh = defaultGh }) {
  if (!runUrl) throw new Error('RUN_URL is not set');
  const open = JSON.parse(
    gh([
      'issue',
      'list',
      '--state',
      'open',
      '--search',
      `"${issueTitle}" in:title`,
      '--json',
      'number,title',
    ]),
  ).filter((issue) => issue.title === issueTitle);
  if (open.length) {
    const [{ number }] = open;
    gh(['issue', 'comment', String(number), '--body', body(runUrl)]);
    return { action: 'commented', number };
  }
  gh(['issue', 'create', '--title', issueTitle, '--body', body(runUrl)]);
  return { action: 'opened' };
}

const isMain =
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    const result = reportFailure({ runUrl: process.env.RUN_URL });
    console.info(
      result.action === 'commented'
        ? `Commented on #${result.number}.`
        : 'Opened the dependency health issue.',
    );
  } catch (error) {
    process.stderr.write(`dependency-health-issue: ${error.message}\n`);
    process.exitCode = 1;
  }
}
