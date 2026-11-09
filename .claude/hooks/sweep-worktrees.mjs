import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SessionStart hook for brand-new chats, run in the background. Every agent
// works in its own git worktree under .claude/worktrees/, and on 2026-11-09
// 93 of them had piled up, each with its own node_modules, because nothing
// removed a worktree once its work was done (auto-merge lands a PR long after
// the agent that opened it has finished). This removes the ones nobody needs:
// it runs only from the main checkout and removes a worktree only when all of
// these hold:
//  - it sits under <main>/.claude/worktrees/ and is not locked,
//  - `git status` shows no changes and no untracked files,
//  - every ignored file is one a command rebuilds (see `disposable`), so
//    removal loses nothing unique, such as a decision trail or a signing key,
//  - its commit is on a branch: its own, or for a detached HEAD one that
//    contains it, so removal loses no commits (branches are never deleted),
//  - its branch has no open PR (when GitHub cannot be read, keep it),
//  - no running process has its working directory inside it,
//  - nothing touched it for a day: the folder (set when it is created), its
//    HEAD file (rewritten by a checkout), its newest commit, or the
//    transcripts of a Claude chat that ran in it. The index, the reflog and
//    the git metadata folder are left out, because a plain `git status`,
//    `git gc` and lock files touch them with no one working.
// It never forces a removal, never deletes branches, and must never fail a
// session: every error ends it silently with exit 0. Each removal is logged
// to .local/worktree-sweep.log with its branch and commit, so a worktree can
// be recreated with `git worktree add`.

export const idleMs = 24 * 60 * 60 * 1000;
const gitTimeout = 10_000;
// Deleting a worktree with its node_modules can take minutes. A kill midway
// leaves it half-deleted, so the removal gets far more time than a lookup.
export const removeTimeout = 10 * 60_000;

const env = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GIT_OPTIONAL_LOCKS: '0',
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

function succeeds(cwd, args, timeout) {
  try {
    git(cwd, args, timeout);
    return true;
  } catch {
    return false;
  }
}

// Ignored paths that a command rebuilds: installed packages, build output,
// logs, the loopback `.env` files `npm run db:local` writes, and the `.local/`
// scratch folder. `.local/decision-trails/` is the exception, since a trail
// is a run's only record. Every other ignored path, such as a `*.key` or
// `apps/mobile/ios/`, keeps the worktree.
const rebuilt = new Set(['node_modules', 'dist', '.expo', 'coverage']);

export function disposable(entry, hasTrails = false) {
  const file = entry.replace(/\/$/, '');
  const name = path.posix.basename(file);
  if (file === '.local') return !hasTrails;
  return (
    rebuilt.has(name) ||
    name === 'expo-env.d.ts' ||
    name === '.DS_Store' ||
    name === '.env' ||
    /\.(log|tsbuildinfo)$/.test(name)
  );
}

function hasEntries(dir) {
  try {
    return readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

// Returns { clean, kept }: whether git shows no changes or untracked files,
// and the ignored paths that are not disposable.
export function files(worktree) {
  const lines = git(worktree, [
    'status',
    '--porcelain',
    '--ignored=matching',
    '--untracked-files=normal',
  ])
    .split('\n')
    .filter(Boolean);
  const trails = hasEntries(path.join(worktree, '.local', 'decision-trails'));
  return {
    clean: lines.every((line) => line.startsWith('!! ')),
    kept: lines
      .filter((line) => line.startsWith('!! '))
      .map((line) => line.slice(3))
      .filter((entry) => !disposable(entry, trails)),
  };
}

// facts: { locked, clean, kept, saved, branch, openBranches, busy,
//          lastTouched }
// openBranches is a Set of branch names with an open PR, or undefined when
// GitHub could not be read.
export function decide(facts, now) {
  if (facts.locked) return 'keep: locked';
  if (!facts.clean) return 'keep: uncommitted or untracked files';
  if (facts.kept.length > 0)
    return `keep: ignored files that may be unique (${facts.kept.join(', ')})`;
  if (!facts.saved) return 'keep: commit is on no branch';
  if (facts.branch) {
    if (!facts.openBranches) return 'keep: PR state unknown';
    if (facts.openBranches.has(facts.branch)) return 'keep: open PR';
  }
  if (facts.busy) return 'keep: a running process is inside it';
  if (now - facts.lastTouched < idleMs) return 'keep: used in the last day';
  return 'remove';
}

export function worktrees(main) {
  const list = [];
  let current;
  for (const line of git(main, ['worktree', 'list', '--porcelain']).split(
    '\n',
  )) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice(9), branch: '', locked: false };
      list.push(current);
    } else if (!current) continue;
    else if (line.startsWith('HEAD ')) current.head = line.slice(5);
    else if (line.startsWith('branch refs/heads/'))
      current.branch = line.slice(18);
    else if (line === 'locked' || line.startsWith('locked '))
      current.locked = true;
  }
  return list;
}

const within = (dir, file) => file === dir || file.startsWith(`${dir}/`);

function mtime(file) {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

// Claude stores a chat's transcripts under ~/.claude/projects/<slug>, where
// the slug is the chat's folder with every non-alphanumeric character
// replaced by a dash.
export function transcriptDir(worktree, home = homedir()) {
  return path.join(
    home,
    '.claude',
    'projects',
    worktree.replace(/[^a-zA-Z0-9]/g, '-'),
  );
}

function newest(dir) {
  let latest = mtime(dir);
  try {
    for (const entry of readdirSync(dir))
      latest = Math.max(latest, mtime(path.join(dir, entry)));
  } catch {
    // No such folder: nothing ran there.
  }
  return latest;
}

export function lastTouched(worktree, home) {
  const gitDir = git(worktree, [
    'rev-parse',
    '--path-format=absolute',
    '--git-dir',
  ]);
  return Math.max(
    mtime(worktree),
    mtime(path.join(gitDir, 'HEAD')),
    Number(git(worktree, ['log', '-1', '--format=%ct', 'HEAD'])) * 1000,
    newest(transcriptDir(worktree, home)),
  );
}

function saved(main, entry) {
  if (entry.branch) return true;
  if (!entry.head) return false;
  return (
    git(main, [
      'for-each-ref',
      '--count=1',
      '--format=%(refname)',
      `--contains=${entry.head}`,
      'refs/heads',
      'refs/remotes',
    ]) !== ''
  );
}

function isMainCheckout(dir) {
  return (
    git(dir, ['rev-parse', '--path-format=absolute', '--git-dir']) ===
    git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  );
}

// deps: { now, busyPaths(): string[], openBranches(): Set | undefined,
//         home, log(line), dryRun }
export function sweep(dir, deps) {
  if (!isMainCheckout(dir)) return [];
  const main = realpathSync(git(dir, ['rev-parse', '--show-toplevel']));
  const root = path.join(main, '.claude', 'worktrees');
  const candidates = worktrees(main).filter(
    (entry) => entry.path !== main && within(root, entry.path),
  );
  if (candidates.length === 0) return [];
  const busy = deps.busyPaths();
  const open = candidates.some((entry) => entry.branch)
    ? deps.openBranches()
    : new Set();
  const results = [];
  for (const entry of candidates) {
    let verdict;
    try {
      verdict = decide(
        {
          locked: entry.locked,
          ...files(entry.path),
          saved: saved(main, entry),
          branch: entry.branch,
          openBranches: open,
          busy: busy.some((file) => within(entry.path, file)),
          lastTouched: lastTouched(entry.path, deps.home),
        },
        deps.now,
      );
    } catch {
      verdict = 'keep: could not inspect';
    }
    if (verdict === 'remove' && !deps.dryRun) {
      // No --force: git refuses if the worktree changed since the check.
      if (succeeds(main, ['worktree', 'remove', entry.path], removeTimeout))
        deps.log(
          `removed ${entry.path} branch=${entry.branch || '(detached)'} head=${entry.head}`,
        );
      else verdict = 'keep: git refused the removal';
    }
    results.push({ path: entry.path, verdict });
  }
  succeeds(main, ['worktree', 'prune']);
  return results;
}

function busyPaths() {
  // Every process's working directory. If lsof fails, treat every worktree
  // as busy so nothing is removed.
  try {
    return execFileSync('lsof', ['-d', 'cwd', '-Fn'], {
      encoding: 'utf8',
      timeout: gitTimeout,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\n')
      .filter((line) => line.startsWith('n/'))
      .map((line) => line.slice(1));
  } catch (error) {
    // lsof exits 1 when some processes cannot be read but still prints the
    // rest.
    const out = typeof error?.stdout === 'string' ? error.stdout : '';
    const lines = out.split('\n').filter((line) => line.startsWith('n/'));
    return lines.length > 0 ? lines.map((line) => line.slice(1)) : ['/'];
  }
}

function openBranches(main) {
  try {
    const list = JSON.parse(
      execFileSync(
        'gh',
        [
          'pr',
          'list',
          '--state',
          'open',
          '--limit',
          '500',
          '--json',
          'headRefName',
        ],
        {
          cwd: main,
          encoding: 'utf8',
          timeout: 15_000,
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      ),
    );
    return new Set(list.map((pr) => pr.headRefName));
  } catch {
    return undefined;
  }
}

// As a hook it prints nothing. Run by hand, `--dry-run` lists what it would
// remove without removing it, and `--report` removes and lists.
function main(args) {
  try {
    const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const logFile = path.join(dir, '.local', 'worktree-sweep.log');
    const dryRun = args.includes('--dry-run');
    const results = sweep(dir, {
      dryRun,
      now: Date.now(),
      busyPaths,
      openBranches: () => openBranches(dir),
      log(line) {
        mkdirSync(path.dirname(logFile), { recursive: true });
        appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
      },
    });
    if (dryRun || args.includes('--report'))
      for (const { path: worktree, verdict } of results)
        process.stdout.write(`${verdict}\t${worktree}\n`);
  } catch {
    // Never fail a session.
  }
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  main(process.argv.slice(2));
