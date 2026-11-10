import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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
//  - `git status` shows no changes and no untracked files, and no file is
//    marked skip-worktree or assume-unchanged (git status hides their edits),
//  - every ignored file is one a command rebuilds (see `disposable` and
//    `localScratch`), so removal loses nothing unique, such as a decision
//    trail, a review, a mutation run or a signing key,
//  - its commit is on a branch: its own, or for a detached HEAD a local
//    branch or origin/main that contains it, so removal loses no commits
//    (branches are never deleted, and other remote branches may be),
//  - no checkout left a commit behind that no branch holds, no rebase, merge,
//    cherry-pick, revert or bisect is in progress, and it has no refs of its
//    own, because its HEAD reflog and its own refs go with it (commits that
//    an amend, rebase or reset replaced are not kept),
//  - its branch has no open PR (when GitHub cannot be read, keep it),
//  - no running process has its working directory inside it,
//  - nothing touched it for a day: the folder (set when it is created), its
//    HEAD file (rewritten by a checkout), its newest commit, or the
//    transcripts of a Claude chat that ran in it, including a chat started in
//    the main checkout whose steps ran inside it. The index, the reflog and
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

function git(cwd, args, timeout = gitTimeout, input) {
  return execFileSync('git', args, {
    cwd,
    env,
    timeout,
    input,
    encoding: 'utf8',
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
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
// logs and the loopback `.env` files `npm run db:local` writes. Every other
// ignored path, such as a `*.key` or `apps/mobile/ios/`, keeps the worktree.
// `.local/` is judged entry by entry in `localScratch`.
const rebuilt = new Set(['node_modules', 'dist', '.expo', 'coverage']);

export function disposable(entry) {
  const file = entry.replace(/\/$/, '');
  const name = path.posix.basename(file);
  return (
    rebuilt.has(name) ||
    name === 'expo-env.d.ts' ||
    name === '.DS_Store' ||
    name === '.env' ||
    /\.(log|tsbuildinfo)$/.test(name)
  );
}

// What the repository's own tools write into `.local/`: the loopback database
// (scripts/local-database.mjs), the journey and exported-web Playwright
// output (e2e/*.config.ts) and verify-justgo runs. Anything else there, such
// as a decision trail, a review, a PR body draft or a mutation run, is an
// agent's own record and keeps the worktree.
const toolOutput = new Set([
  'postgres',
  'database.env',
  'journey-repository.mjs',
  'journey-results',
  'journey-report',
  'exported-web-results',
  'exported-web-report',
  'verify-justgo',
]);

export function localScratch(name) {
  return toolOutput.has(name) || /\.log$/.test(name) || name === '.DS_Store';
}

function localKept(worktree) {
  try {
    return readdirSync(path.join(worktree, '.local'))
      .filter((name) => !localScratch(name))
      .map((name) => `.local/${name}`);
  } catch {
    return ['.local/'];
  }
}

// Files whose edits git status hides: skip-worktree (S) and assume-unchanged
// (a lowercase tag).
function hidden(worktree) {
  return git(worktree, ['ls-files', '-v'])
    .split('\n')
    .some((line) => line.startsWith('S ') || /^[a-z] /.test(line));
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
  return {
    clean: lines.every((line) => line.startsWith('!! ')) && !hidden(worktree),
    kept: lines
      .filter((line) => line.startsWith('!! '))
      .map((line) => line.slice(3))
      .flatMap((entry) => {
        const [top, name] = entry.replace(/\/$/, '').split('/');
        if (top !== '.local') return disposable(entry) ? [] : [entry];
        if (!name) return localKept(worktree);
        return localScratch(name) ? [] : [entry];
      }),
  };
}

// facts: { locked, clean, kept, saved, unsaved, branch, openBranches, busy,
//          lastTouched }
// unsaved is why removal would lose a commit or an operation, or ''.
// openBranches is a Set of branch names with an open PR, or undefined when
// GitHub could not be read.
export function decide(facts, now) {
  if (facts.locked) return 'keep: locked';
  if (!facts.clean) return 'keep: uncommitted or untracked files';
  if (facts.kept.length > 0)
    return `keep: ignored files that may be unique (${facts.kept.join(', ')})`;
  if (!facts.saved) return 'keep: commit is on no branch';
  if (facts.unsaved) return `keep: ${facts.unsaved}`;
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

// A chat started in one folder can run its steps in another, such as a
// desktop chat whose worktree sits under the main checkout. Each transcript
// line records the folder it ran in, so this maps every folder that a
// transcript under `dir` changed within the last day to that transcript's
// time.
export function chatFolders(dir, now) {
  const folders = new Map();
  const visit = (folder, depth) => {
    let entries;
    try {
      entries = readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (depth < 2) visit(file, depth + 1);
        continue;
      }
      if (!entry.name.endsWith('.jsonl')) continue;
      const time = mtime(file);
      if (now - time >= idleMs) continue;
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const [, raw] of text.matchAll(/"cwd":("(?:[^"\\]|\\.)*")/g)) {
        let cwd;
        try {
          cwd = JSON.parse(raw);
        } catch {
          continue;
        }
        folders.set(cwd, Math.max(folders.get(cwd) ?? 0, time));
      }
    }
  };
  visit(dir, 0);
  return folders;
}

export function lastTouched(worktree, home, chats = new Map()) {
  const gitDir = git(worktree, [
    'rev-parse',
    '--path-format=absolute',
    '--git-dir',
  ]);
  let chat = 0;
  for (const [folder, time] of chats)
    if (within(worktree, folder)) chat = Math.max(chat, time);
  return Math.max(
    mtime(worktree),
    mtime(path.join(gitDir, 'HEAD')),
    Number(git(worktree, ['log', '-1', '--format=%ct', 'HEAD'])) * 1000,
    newest(transcriptDir(worktree, home)),
    chat,
  );
}

const inProgress = [
  'rebase-merge',
  'rebase-apply',
  'MERGE_HEAD',
  'CHERRY_PICK_HEAD',
  'REVERT_HEAD',
  'BISECT_LOG',
];

// Removal deletes the worktree's HEAD reflog and its own refs, so a commit
// that only they hold is lost. A checkout that leaves a commit no branch
// holds is the case git itself warns about. Commits that an amend, rebase or
// reset replaced are left out, because almost every worktree has some.
export function unsaved(worktree) {
  const gitDir = git(worktree, [
    'rev-parse',
    '--path-format=absolute',
    '--git-dir',
  ]);
  if (inProgress.some((name) => existsSync(path.join(gitDir, name))))
    return 'a rebase, merge or bisect is in progress';
  if (
    git(worktree, [
      'for-each-ref',
      '--count=1',
      '--format=%(refname)',
      'refs/worktree',
      'refs/bisect',
      'refs/rewritten',
    ]) !== ''
  )
    return 'it has refs of its own';
  // Newest first, so entry i - 1 is the move that left entry i's commit.
  const log = git(worktree, ['reflog', 'show', '--format=%H %gs', 'HEAD'])
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ commit: line.slice(0, 40), action: line.slice(41) }));
  if (log.length < 2) return '';
  const lost = new Set(
    git(
      worktree,
      [
        'rev-list',
        '--ignore-missing',
        '--not',
        '--branches',
        'refs/remotes/origin/main',
        '--stdin',
      ],
      gitTimeout,
      `${log.map((entry) => entry.commit).join('\n')}\n`,
    )
      .split('\n')
      .filter(Boolean),
  );
  for (let index = 1; index < log.length; index += 1)
    if (
      lost.has(log[index].commit) &&
      log[index - 1].commit !== log[index].commit &&
      log[index - 1].action.startsWith('checkout:')
    )
      return 'a checkout left a commit no branch holds';
  return '';
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
      'refs/remotes/origin/main',
    ]) !== ''
  );
}

function isMainCheckout(dir) {
  return (
    git(dir, ['rev-parse', '--path-format=absolute', '--git-dir']) ===
    git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  );
}

// deps: { now, busyPaths(): string[] | undefined, openBranches(): Set | undefined,
//         home, log(line), dryRun }
// home defaults to the user's home folder, where Claude keeps transcripts.
export function sweep(dir, deps) {
  if (!isMainCheckout(dir)) return [];
  const main = realpathSync(git(dir, ['rev-parse', '--show-toplevel']));
  const root = path.join(main, '.claude', 'worktrees');
  const candidates = worktrees(main).filter(
    (entry) => entry.path !== main && within(root, entry.path),
  );
  if (candidates.length === 0) return [];
  const busy = deps.busyPaths();
  const chats = chatFolders(transcriptDir(main, deps.home), deps.now);
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
          unsaved: unsaved(entry.path),
          branch: entry.branch,
          openBranches: open,
          busy: !busy || busy.some((file) => within(entry.path, file)),
          lastTouched: lastTouched(entry.path, deps.home, chats),
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
  return results;
}

const lsof = () =>
  execFileSync('lsof', ['-d', 'cwd', '-Fn'], {
    encoding: 'utf8',
    timeout: gitTimeout,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

// Every process's working directory, or undefined when lsof fails, which
// keeps every worktree.
export function busyPaths(run = lsof) {
  try {
    return run()
      .split('\n')
      .filter((line) => line.startsWith('n/'))
      .map((line) => line.slice(1));
  } catch (error) {
    // lsof exits 1 when some processes cannot be read but still prints the
    // rest. A timeout or another signal cuts the list short, so it counts as
    // unreadable.
    if (error?.status !== 1 || error?.signal) return undefined;
    const out = typeof error.stdout === 'string' ? error.stdout : '';
    const lines = out.split('\n').filter((line) => line.startsWith('n/'));
    return lines.length > 0 ? lines.map((line) => line.slice(1)) : undefined;
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
      busyPaths: () => busyPaths(),
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
