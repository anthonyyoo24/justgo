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

// git options whose value is the next word.
const valueOptions = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--config-env',
  '--attr-source',
]);

// A git command anywhere in the text outside quotes and heredocs, so one after
// `then`, `env`, `time`, `$(`, an operator with no space around it, or a path
// such as /usr/bin/git counts too. Each word is read once, so a long command
// costs linear time. A miss only skips a sync, since every Agent call also
// syncs, and a false match only costs one.
// A $(...) with no space inside, such as `-C $(pwd)`, becomes one placeholder
// word first, so an option keeps its value. Braces and ! split nothing, since
// a brace group or a ! before a command stands as its own word, and inside a
// value such as `-C ${REPO}` or `-c alias.w=!f` they belong to it. An empty
// word, at either end, matches nothing.
const substitution = /\$\([^\s()]*\)/g;

function createsWorktree(command) {
  const words = shellText(command)
    .replace(substitution, '_')
    .split(/[\s;&|()`]+/);
  for (let at = 0; at < words.length; at += 1) {
    if (words[at] !== 'git' && !words[at].endsWith('/git')) continue;
    at += 1;
    while (at < words.length && words[at].startsWith('-'))
      at += valueOptions.has(words[at]) ? 2 : 1;
    if (words[at] === 'worktree' && words[at + 1] === 'add') return true;
    at -= 1;
  }
  return false;
}

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

const env = () => ({
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
});

function git(cwd, args, timeout = gitTimeout) {
  return execFileSync('git', args, {
    cwd,
    env: env(),
    timeout,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

// Resolves 'done', 'failed', or 'running' when git outlasts `wait`. A running
// git is left to finish on its own, even after this process exits. With
// `stop`, it resolves 'stopped' instead and git is stopped with every helper
// it started, such as ssh, since they share its process group.
function background(cwd, args, wait, { stop = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      env: env(),
      detached: true,
      stdio: 'ignore',
    });
    const timer = setTimeout(() => {
      if (stop) attempt(() => process.kill(-child.pid, 'SIGTERM'));
      child.unref();
      resolve(stop ? 'stopped' : 'running');
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

// git takes GIT_SSH_COMMAND, then core.sshCommand, then GIT_SSH, so batch-mode
// ssh goes in only when none is set and never replaces one Anthony chose.
function sshDefault(dir) {
  if (process.env.GIT_SSH_COMMAND || process.env.GIT_SSH) return [];
  return attempt(() => git(dir, ['config', 'core.sshCommand']))
    ? []
    : ['-c', 'core.sshCommand=ssh -o BatchMode=yes'];
}

// Before a tool call, a fetch within a minute of the last attempt is skipped
// and the last fetched origin/main stands in, so a fan-out of agents fetches
// once. The stamp is written before the fetch, so an offline fetch is not
// retried before every tool call either.
async function fetchMain(dir, gitDir, fetchEvery, fetchWait) {
  const stamp = path.join(gitDir, stampName);
  let last = 0;
  attempt(() => {
    last = statSync(stamp).mtimeMs;
  });
  if (Date.now() - last < fetchEvery) return true;
  attempt(() => writeFileSync(stamp, ''));
  const fetch = await background(
    dir,
    [...sshDefault(dir), 'fetch', '--quiet', '--no-tags', 'origin', 'main'],
    fetchWait,
    { stop: true },
  );
  return fetch === 'done';
}

const foldersOf = (file) =>
  file
    .split('/')
    .slice(0, -1)
    .map((_, i, parts) => parts.slice(0, i + 1).join('/'));

// Untracked files that make git refuse a fast-forward: one at a path it
// writes, one where it needs a folder, or one inside a folder it turns into a
// file.
function inTheWay(dir, paths) {
  const changed = new Set(paths);
  const folders = new Set(paths.flatMap(foldersOf));
  return execFileSync(
    'git',
    ['ls-files', '-z', '--others', '--exclude-standard'],
    {
      cwd: dir,
      env: env(),
      timeout: gitTimeout,
      encoding: 'utf8',
      maxBuffer: Infinity,
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  )
    .split('\0')
    .filter(
      (file) =>
        changed.has(file) ||
        folders.has(file) ||
        foldersOf(file).some((folder) => changed.has(folder)),
    );
}

function failure(dir, paths) {
  let clash = [];
  attempt(() => {
    clash = inTheWay(dir, paths);
  });
  if (clash.length === 0) return 'the fast-forward failed';
  if (clash.length === 1)
    return `the untracked file ${clash[0]} would be overwritten`;
  return `${clash.length} untracked files would be overwritten, such as ${clash[0]}`;
}

async function inspect(dir, fetchEvery, fetchWait) {
  const gitDir = git(dir, ['rev-parse', '--path-format=absolute', '--git-dir']);
  const common = git(dir, [
    'rev-parse',
    '--path-format=absolute',
    '--git-common-dir',
  ]);
  if (gitDir !== common) return { linkedWorktree: true };
  const fetched = await fetchMain(dir, gitDir, fetchEvery, fetchWait);
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
  { mergeWait = gitTimeout, fetchWait = fetchTimeout } = {},
) {
  const state = await inspect(dir, fetchEvery, fetchWait);
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
      reason: failure(dir, paths),
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
