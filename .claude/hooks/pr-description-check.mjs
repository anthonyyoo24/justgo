import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  descriptionProblems,
  guide,
} from '../../scripts/quality/pr-description.mjs';

// PostToolUse hook on Bash. After a `gh pr create` or `gh pr edit`, it reads
// the PR body back from GitHub and runs the same descriptionProblems() check
// as the required `description` job, so a bad description goes back to the
// agent at once instead of after CI (PR #248 sat armed and red with
// Summary/Why/Checks headings while everyone read it as waiting for review).
// Reading the body from GitHub works however it was passed: a heredoc,
// --body-file, --fill or an editor. When gh cannot read the PR, the hook
// says it could not check and blocks nothing.

const ghPr =
  /(?:^|[;&|(\n]|\$\()\s*(?:\S*\/)?gh\s+(?:(?:-R|--repo)[\s=]\S+\s+)?pr\s+(create|edit)\b([^\n;&|)]*)/g;
const pullUrl = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g;
const explicitRef =
  /^(?:#?\d+|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+)$/;

// The PRs a command created or edited: the PR URLs gh printed, else the PR
// named right after `gh pr edit`, else the current branch's PR. Undefined
// when the command runs no `gh pr create` or `gh pr edit`.
export function targets(command, stdout = '') {
  const text = command.replace(/\\\r?\n/g, ' ');
  const runs = [...text.matchAll(ghPr)];
  if (!runs.length) return undefined;
  const printed = [...new Set(stdout.match(pullUrl) ?? [])];
  if (printed.length) return printed.map((ref) => ({ ref }));
  const named = [];
  for (const [whole, , rest] of runs) {
    const repo = whole.match(/(?:-R|--repo)[\s=](\S+)/)?.[1];
    const first = rest.trim().split(/\s+/)[0] ?? '';
    const ref = explicitRef.test(first) ? first.replace('#', '') : undefined;
    named.push({ ref, repo });
  }
  const unique = new Map(named.map((one) => [`${one.repo}|${one.ref}`, one]));
  return [...unique.values()];
}

export function readPull({ ref, repo }, cwd) {
  const args = ['pr', 'view'];
  if (ref) args.push(ref);
  if (repo && !ref?.startsWith('https://')) args.push('--repo', repo);
  args.push('--json', 'number,url,body');
  return JSON.parse(
    execFileSync('gh', args, {
      cwd,
      encoding: 'utf8',
      timeout: 20000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
}

export function check(command, stdout, read) {
  const found = targets(command, stdout);
  if (!found) return undefined;
  const bad = [];
  const unread = [];
  for (const target of found) {
    let pull;
    try {
      pull = read(target);
    } catch (error) {
      const why = String(error?.stderr || error?.message || error).trim();
      unread.push(`${target.ref ?? 'the current branch PR'} (${why})`);
      continue;
    }
    const problems = descriptionProblems(pull.body ?? '');
    if (problems.length)
      bad.push(
        `PR #${pull.number} (${pull.url}) fails the required \`description\` check, which stays red until the description is fixed:\n- ${problems.join('\n- ')}`,
      );
  }
  const note = unread.length
    ? `pr-description-check could not read ${unread.join('; ')} with \`gh pr view\`, so it did not check that description. Run \`gh pr view <n> --json body\` and compare it with: ${guide}`
    : undefined;
  if (bad.length)
    return {
      decision: 'block',
      reason: [
        `pr-description-check: ${bad.join('\n')}`,
        guide,
        'Fix the description now with `gh pr edit <n> --body-file <file>`. This hook checks it again after the edit.',
        note,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  if (note)
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: note,
      },
    };
  return undefined;
}

function stdoutOf(response) {
  if (typeof response === 'string') return response;
  return String(response?.stdout ?? '');
}

function main() {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  if (event.tool_name !== 'Bash') return;
  const cwd = event.cwd || process.cwd();
  const result = check(
    String(event.tool_input?.command ?? ''),
    stdoutOf(event.tool_response),
    (target) => readPull(target, cwd),
  );
  if (result) process.stdout.write(JSON.stringify(result));
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  main();
