import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { changedPaths } from '../../scripts/quality/git.mjs';

// SessionStart hook. Hooks and settings load from the folder a session starts
// in, and on 2026-11-08 Anthony's main checkout sat 56 commits behind
// origin/main, so sessions there ran without newer hooks. This keeps the main
// checkout on origin/main: it fast-forwards a clean `main` and says nothing,
// asks for a restart when the update changed session config, and warns when
// the folder is behind but cannot be updated. Linked worktrees are left alone,
// since each is cut from origin/main when its session starts.
// It never resets, stashes, rebases or touches untracked files, and it must
// never block or fail a session: every error ends it silently with exit 0.

const fetchTimeout = 6000;
const gitTimeout = 2000;

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

function attempt(fn) {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

function inspect(dir) {
  const gitDir = git(dir, ['rev-parse', '--path-format=absolute', '--git-dir']);
  const common = git(dir, [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]);
  if (gitDir !== common) return { linkedWorktree: true };
  const fetched = attempt(() =>
    git(dir, ['fetch', '--quiet', '--no-tags', 'origin', 'main'], fetchTimeout),
  );
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

export function sync(dir) {
  const state = inspect(dir);
  const next = plan(state);
  if (next.action !== 'ff') return next;
  const before = git(dir, ['rev-parse', 'HEAD']);
  if (
    !attempt(() => git(dir, ['merge', '--ff-only', '--quiet', 'origin/main']))
  )
    return {
      action: 'warn',
      behind: state.behind,
      reason: 'the fast-forward failed',
    };
  const after = git(dir, ['rev-parse', 'HEAD']);
  return {
    action: 'updated',
    sha: after.slice(0, 7),
    paths: changedPaths(`${before}..${after}`, dir),
  };
}

function main() {
  let line;
  try {
    line = report(sync(process.env.CLAUDE_PROJECT_DIR || process.cwd()));
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
        hookEventName: 'SessionStart',
        additionalContext: line,
      },
    }),
  );
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  main();
