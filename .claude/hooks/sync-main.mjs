import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changedPaths } from '../../scripts/quality/git.mjs';
import { shellText } from './push-after-pass-guard.mjs';

// SessionStart and PreToolUse hook. Hooks and settings load from the folder a
// session starts in, and on 2026-11-08 Anthony's main checkout sat 56 commits
// behind origin/main, so sessions there ran without newer hooks. A later
// multi-hour run fell 6 commits behind after it started. So at session start,
// and before each Agent call or Bash `git worktree add`, this fast-forwards a
// clean `main` and says nothing, and asks for a restart when the update changed
// session config. Only session start warns when the folder is behind but
// cannot be updated, so the warning does not repeat before every tool call.
// Linked worktrees are left alone, since each is cut from origin/main when its
// session starts.
// It never resets, stashes, rebases or touches untracked files, and it must
// never block a session or a tool call: every error ends it silently with
// exit 0, and it never returns a permission decision. A fast-forward killed
// partway leaves the files it wrote as untracked files that stop every later
// one, so the merge runs in its own process, and one that outlasts the wait
// finishes after the hook exits.

const fetchTimeout = 6000;
const gitTimeout = 2000;
const stampName = 'sync-main-fetched';

const createsWorktree = (command) =>
  shellText(command)
    .split(/&&|\|\||[;|&\n]/)
    .some((part) =>
      /^\s*(?:[A-Za-z_]\w*=\S*\s+)*git(?:\s+-[Cc]\s+\S+|\s+-\S+)*\s+worktree\s+add\b/.test(
        part,
      ),
    );

export function triggerOf(event) {
  if (event.hook_event_name === 'SessionStart')
    return { event: 'SessionStart', fetchEvery: 0, warns: true };
  if (event.hook_event_name !== 'PreToolUse') return undefined;
  const before =
    event.tool_name === 'Agent' ||
    (event.tool_name === 'Bash' &&
      createsWorktree(String(event.tool_input?.command ?? '')));
  return before
    ? { event: 'PreToolUse', fetchEvery: 60_000, warns: false }
    : undefined;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// state: { linkedWorktree, fetched, branch, behind, ahead, dirty }
export function plan(state) {
  if (state.linkedWorktree || !state.fetched || state.behind === 0)
    return { action: 'none' };
  const warn = (reason) => ({ action: 'warn', behind: state.behind, reason });
  if (state.branch === '') return warn('HEAD is detached, not on main');
  if (state.branch !== 'main')
    return warn(`it is on branch ${state.branch}, not main`);
  if (state.ahead > 0)
    return warn(
      `main has ${plural(state.ahead, 'commit')} that origin/main lacks`,
    );
  if (state.dirty) return warn('it has uncommitted changes to tracked files');
  return { action: 'ff' };
}

export function touchesSessionConfig(paths) {
  return paths.some(
    (file) =>
      file.startsWith('.claude/') ||
      file === 'AGENTS.md' ||
      file === 'CLAUDE.md',
  );
}

export function report(result) {
  if (result.action === 'warn')
    return `This folder is ${plural(result.behind, 'commit')} behind origin/main; not updated because ${result.reason}.`;
  if (result.action === 'updated' && touchesSessionConfig(result.paths))
    return `Updated main to ${result.sha}; restart this session to load the new hooks and settings.`;
  if (result.action === 'updating' && touchesSessionConfig(result.paths))
    return `Updating main to ${result.sha} in the background; restart this session once it finishes to load the new hooks and settings.`;
  return undefined;
}

const env = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND ?? 'ssh -o BatchMode=yes',
};

function git(cwd, args, timeout = gitTimeout) {
  return execFileSync('git', args, {
    cwd,
    env,
    timeout,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

// Resolves 'done', 'failed', or 'running' when git outlasts `wait`. A running
// git is left to finish on its own, even after this process exits.
function background(cwd, args, wait) {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      env,
      detached: true,
      stdio: 'ignore',
    });
    const timer = setTimeout(() => {
      child.unref();
      resolve('running');
    }, wait);
    const end = (outcome) => {
      clearTimeout(timer);
      resolve(outcome);
    };
    child.on('error', () => end('failed'));
    child.on('exit', (code) => end(code === 0 ? 'done' : 'failed'));
  });
}

function attempt(fn) {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

// Before a tool call, a fetch within a minute of the last attempt is skipped
// and the last fetched origin/main stands in, so a fan-out of agents fetches
// once. The stamp is written before the fetch, so an offline fetch is not
// retried before every tool call either.
function fetchMain(dir, gitDir, fetchEvery) {
  const stamp = path.join(gitDir, stampName);
  let last = 0;
  attempt(() => {
    last = statSync(stamp).mtimeMs;
  });
  if (Date.now() - last < fetchEvery) return true;
  attempt(() => writeFileSync(stamp, ''));
  return attempt(() =>
    git(dir, ['fetch', '--quiet', '--no-tags', 'origin', 'main'], fetchTimeout),
  );
}

function inspect(dir, fetchEvery) {
  const gitDir = git(dir, ['rev-parse', '--path-format=absolute', '--git-dir']);
  const common = git(dir, [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]);
  if (gitDir !== common) return { linkedWorktree: true };
  const fetched = fetchMain(dir, gitDir, fetchEvery);
  if (!fetched) return { fetched };
  let branch = '';
  attempt(() => {
    branch = git(dir, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  });
  const [ahead, behind] = git(dir, [
    'rev-list',
    '--left-right',
    '--count',
    'HEAD...origin/main',
  ])
    .split(/\s+/)
    .map(Number);
  const dirty =
    git(dir, ['status', '--porcelain', '--untracked-files=no']) !== '';
  return { linkedWorktree: false, fetched, branch, ahead, behind, dirty };
}

export async function sync(
  dir,
  fetchEvery = 0,
  { mergeWait = gitTimeout } = {},
) {
  const state = inspect(dir, fetchEvery);
  const next = plan(state);
  if (next.action !== 'ff') return next;
  const before = git(dir, ['rev-parse', 'HEAD']);
  const after = git(dir, ['rev-parse', 'origin/main']);
  const paths = changedPaths(`${before}..${after}`, dir);
  const merge = await background(
    dir,
    ['merge', '--ff-only', '--quiet', after],
    mergeWait,
  );
  if (merge === 'failed')
    return {
      action: 'warn',
      behind: state.behind,
      reason: 'the fast-forward failed',
    };
  return {
    action: merge === 'done' ? 'updated' : 'updating',
    sha: after.slice(0, 7),
    paths,
  };
}

async function main() {
  let line;
  let trigger;
  try {
    trigger = triggerOf(JSON.parse(readFileSync(0, 'utf8')));
    if (!trigger) return;
    const result = await sync(
      process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      trigger.fetchEvery,
    );
    if (result.action === 'warn' && !trigger.warns) return;
    line = report(result);
  } catch {
    return;
  }
  if (!line) return;
  // systemMessage shows the line to Anthony, who restarts the session, and
  // additionalContext tells the session's agent which hooks it is running.
  process.stdout.write(
    JSON.stringify({
      systemMessage: line,
      hookSpecificOutput: {
        hookEventName: trigger.event,
        additionalContext: line,
      },
    }),
  );
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  await main();
