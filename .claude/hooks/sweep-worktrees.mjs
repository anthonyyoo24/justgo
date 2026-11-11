import { execFileSync, spawn } from 'node:child_process';
import {
  appendFileSync,
  closeSync,
  cpSync,
  existsSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Removes the agent worktrees under .claude/worktrees/ that nobody needs.
// Agents create about 60 a day, each with about 1.4 GB of node_modules, and on
// 2026-11-10 the 76 left behind filled the disk. The SessionStart (startup)
// and SessionEnd hooks start it as a detached process, and it runs only from
// the main checkout. It removes a worktree only when all of these hold:
//  - it is not locked and not inside another worktree,
//  - `git status` shows no changes and no untracked files, and no file is
//    marked skip-worktree or assume-unchanged (git status hides their edits),
//  - every ignored file outside .local/ is one a command rebuilds (see
//    `disposable`), so removal loses nothing unique, such as a signing key,
//  - no rebase, merge, notes merge, cherry-pick, revert or bisect is in
//    progress, it has no refs of its own, and every commit its HEAD reflog
//    records is on a branch, a remote branch, a branch's own reflog or HEAD
//    itself, because its HEAD reflog and its own refs go with it,
//  - its HEAD commit is on a remote branch, or the PR of its branch, or the
//    PR a `ver-<n>` or `adv-<n>` worktree is named after, is merged or closed,
//  - no open PR uses its branch or its HEAD commit (when GitHub cannot be
//    read, keep it),
//  - no running process has its working directory inside it, checked again
//    with the chats just before each removal,
//  - nothing touched it for 2 hours: a file or folder outside node_modules,
//    its HEAD file (rewritten by a checkout), its newest commit, or the
//    transcripts of a Claude chat that ran in it, including a chat started in
//    the main checkout whose steps ran inside it.
// Before each removal, the ref refs/archive/worktrees/<name> keeps its HEAD
// commit reachable, and its .local/ records are copied to
// <main>/.local/archived-worktrees/<name>/. Then `git worktree move` puts it
// in <main>/.local/worktree-trash/, and `git worktree remove` deletes it
// there. git deletes the files first and its record last, so a removal killed
// or timed out partway leaves a half-deleted worktree, and the next sweep
// deletes what is left in the trash once git status there shows nothing but
// deleted files. It never forces a removal, never deletes branches, and
// must never fail a session: every error ends it silently with exit 0. Each
// removal is logged to .local/worktree-sweep.log with its branch, commit and
// archive ref.

export const idleMs = 2 * 60 * 60 * 1000;
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
    // A half-deleted worktree can list tens of thousands of untracked paths.
    maxBuffer: 256 * 1024 * 1024,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
  }).trim();
}

function attempt(fn) {
  try {
    fn();
  } catch {
    // The caller goes on either way.
  }
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
// logs and the loopback `apps/<name>/.env` files `pnpm run db:local` writes.
// Every other ignored path outside .local/, such as a `*.key`, a root or
// nested `.env`, an `apps/<name>/.env/` directory or `apps/mobile/ios/`,
// keeps the worktree.
const rebuilt = new Set(['node_modules', 'dist', '.expo', 'coverage']);

export function disposable(entry) {
  const file = entry.replace(/\/$/, '');
  const name = path.posix.basename(file);
  return (
    rebuilt.has(name) ||
    name === 'expo-env.d.ts' ||
    name === '.DS_Store' ||
    /^apps\/[^/]+\/\.env$/.test(entry) ||
    /\.(log|tsbuildinfo)$/.test(name)
  );
}

// What the repository's own tools write into `.local/` and rebuild: the
// loopback database (scripts/local-database.mjs) and the journey and
// exported-web Playwright output (e2e/*.config.ts). The archive leaves these
// out and copies everything else, such as a decision trail, a review or
// verify-justgo evidence.
const toolOutput = new Set([
  'postgres',
  'database.env',
  'journey-repository.mjs',
  'journey-results',
  'journey-report',
  'exported-web-results',
  'exported-web-report',
]);

export function localScratch(name) {
  return toolOutput.has(name) || name === '.DS_Store';
}

// Files whose edits git status hides: skip-worktree (S) and assume-unchanged
// (a lowercase tag).
function hidden(worktree) {
  return git(worktree, ['ls-files', '-v'])
    .split('\n')
    .some((line) => line.startsWith('S ') || /^[a-z] /.test(line));
}

// Returns { clean, kept }: whether git shows no changes or untracked files,
// and the ignored paths outside .local/ that are not disposable.
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
      .filter(
        (entry) => entry.split('/')[0] !== '.local' && !disposable(entry),
      ),
  };
}

// facts: { locked, clean, kept, unsaved, pushed, pr, busy, lastTouched }
// unsaved is why removal would lose a commit or an operation, or ''. pushed
// is whether a remote branch holds the HEAD commit, and pr is its `prState`.
export function decide(facts, now) {
  if (facts.locked) return 'keep: locked';
  if (!facts.clean) return 'keep: uncommitted or untracked files';
  if (facts.kept.length > 0)
    return `keep: ignored files that may be unique (${facts.kept.join(', ')})`;
  if (facts.unsaved) return `keep: ${facts.unsaved}`;
  if (!facts.pr) return 'keep: PR state unknown';
  if (facts.pr === 'open') return 'keep: open PR';
  if (!facts.pushed && facts.pr !== 'finished')
    return 'keep: commit is on no remote branch and its PR is not merged or closed';
  if (facts.busy) return 'keep: a running process is inside it';
  if (now - facts.lastTouched < idleMs) return 'keep: used in the last 2 hours';
  return 'remove';
}

// prs is every PR as `gh pr list --json number,state,headRefName,headRefOid`
// lists it, or undefined when GitHub could not be read. The state is 'open'
// when an open PR uses the branch or the HEAD commit, 'finished' when the
// branch's PR, or the PR a `ver-<n>` or `adv-<n>` worktree is named after, is
// merged or closed, and 'none' otherwise.
export function prState(prs, { name, branch, head }) {
  if (!prs) return undefined;
  const number = Number(/^(?:ver|adv)-(\d+)(?!\d)/.exec(name)?.[1]);
  let state = 'none';
  for (const pr of prs) {
    const ownBranch = branch !== '' && pr.headRefName === branch;
    if (pr.state === 'OPEN') {
      if (ownBranch || pr.headRefOid === head) return 'open';
    } else if (ownBranch || pr.number === number) state = 'finished';
  }
  return state;
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

// The newest change to a file or folder in `dir` outside node_modules. It
// stops at the first change after `since`, because one is enough.
export function newestFile(dir, since) {
  let latest = 0;
  const folders = [dir];
  while (folders.length > 0) {
    const folder = folders.pop();
    latest = Math.max(latest, mtime(folder));
    let entries;
    try {
      entries = readdirSync(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (latest > since) return latest;
      if (entry.name === 'node_modules') continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) folders.push(file);
      else {
        try {
          latest = Math.max(latest, lstatSync(file).mtimeMs);
        } catch {
          // Deleted while the sweep looked.
        }
      }
    }
  }
  return latest;
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
// transcript under `dir` changed after `since` (by default, within the idle
// window) to that transcript's time.
export function chatFolders(dir, now, since = now - idleMs) {
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
      if (time <= since) continue;
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

export function lastTouched(worktree, home, chats, since) {
  const gitDir = git(worktree, [
    'rev-parse',
    '--path-format=absolute',
    '--git-dir',
  ]);
  let chat = 0;
  for (const [folder, time] of chats)
    if (within(worktree, folder)) chat = Math.max(chat, time);
  return Math.max(
    newestFile(worktree, since),
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
  // A multi-commit cherry-pick or revert keeps its remaining steps here after
  // a conflict is committed and CHERRY_PICK_HEAD or REVERT_HEAD is gone.
  'sequencer',
  // A `git notes merge` stopped on a conflict.
  'NOTES_MERGE_PARTIAL',
];

// Every commit a branch's own reflog records. Branch reflogs live in the
// shared repository and survive a worktree's removal, so a commit that an
// amend, rebase or reset replaced on a branch stays reachable after it.
export function branchHistory(dir) {
  return git(dir, ['log', '--walk-reflogs', '--format=%H', '--branches'])
    .split('\n')
    .filter(Boolean);
}

// Removal deletes the worktree's HEAD reflog and its own refs, so a commit
// that only they hold is lost: one made on a detached HEAD and then left by a
// checkout, a reset or an amend. A commit on a branch, a remote branch, an
// archive ref, a branch's own reflog or HEAD (which the archive ref keeps) is
// safe.
export function unsaved(worktree, history = branchHistory(worktree)) {
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
  const log = git(worktree, ['reflog', 'show', '--format=%H', 'HEAD'])
    .split('\n')
    .filter(Boolean);
  if (log.length === 0) return '';
  const lost = git(
    worktree,
    [
      'rev-list',
      '--ignore-missing',
      '--max-count=1',
      '--not',
      '--branches',
      '--remotes',
      '--glob=refs/archive/*',
      'HEAD',
      '--stdin',
    ],
    gitTimeout,
    // Revisions read from stdin are not flipped by --not, so the branch
    // reflog commits are passed as ^ exclusions.
    `${[...log, ...history.map((commit) => `^${commit}`)].join('\n')}\n`,
  );
  return lost ? 'its HEAD history holds a commit no branch holds' : '';
}

function pushed(main, head) {
  return (
    git(main, [
      'for-each-ref',
      '--count=1',
      '--format=%(refname)',
      `--contains=${head}`,
      'refs/remotes',
    ]) !== ''
  );
}

function refCommit(main, ref) {
  try {
    return git(main, ['rev-parse', '--verify', '--quiet', ref]);
  } catch {
    return '';
  }
}

// Keeps the worktree's HEAD commit reachable with a local ref and copies its
// .local/ records into the main checkout, leaving out tool output. Verifier
// checkouts reuse names such as ver-<n>, often on the same commit, so every
// archive takes the first numbered slot with neither a ref nor a folder, and
// no earlier archive is ever overwritten. A retry after a refused removal
// takes a new slot too. Returns the ref, or throws when it cannot archive.
export function archive(main, entry, name) {
  for (let n = 1; n <= 100; n += 1) {
    const slot = n === 1 ? name : `${name}-${n}`;
    const ref = `refs/archive/worktrees/${slot}`;
    const dest = path.join(main, '.local', 'archived-worktrees', slot);
    if (refCommit(main, ref) || existsSync(dest)) continue;
    // An empty old value makes git refuse a ref that appeared meanwhile.
    git(main, ['update-ref', ref, entry.head, '']);
    const local = path.join(entry.path, '.local');
    if (existsSync(local))
      cpSync(local, dest, {
        recursive: true,
        verbatimSymlinks: true,
        force: false,
        errorOnExist: true,
        filter: (file) =>
          file === local || !localScratch(path.relative(local, file)),
      });
    return ref;
  }
  throw new Error(`no free archive name for ${name}`);
}

function isMainCheckout(dir) {
  return (
    git(dir, ['rev-parse', '--path-format=absolute', '--git-dir']) ===
    git(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  );
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

// A running sweep touches its lock before each worktree, and one removal gets
// at most `removeTimeout`, so a lock this old belongs to no running sweep even
// when its PID now names another process, as after a reboot.
export const staleLockMs = 30 * 60_000;

const sameFile = (a, b) =>
  a.ino === b.ino && a.birthtimeMs === b.birthtimeMs && a.mtimeMs === b.mtimeMs;

// Moves a lock judged stale aside, so only one sweep can take it over. When
// the file moved is not the one judged, another sweep took the lock first, so
// it goes back.
export function takeOver(file, judged) {
  const aside = `${file}.${process.pid}.${Date.now()}`;
  try {
    renameSync(file, aside);
  } catch {
    return false;
  }
  const moved = statSync(aside);
  if (!sameFile(moved, judged)) {
    try {
      linkSync(aside, file);
    } catch {
      // A third sweep holds the lock now.
    }
    rmSync(aside, { force: true });
    return false;
  }
  rmSync(aside, { force: true });
  return true;
}

// Session starts and ends overlap, so one sweep runs at a time. Returns
// { refresh, release }, or undefined while another sweep runs.
export function lock(main) {
  const file = path.join(main, '.local', 'worktree-sweep.lock');
  mkdirSync(path.dirname(file), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(file, `${process.pid}\n`, { flag: 'wx' });
      const own = statSync(file);
      const owned = () => {
        try {
          return statSync(file).ino === own.ino;
        } catch {
          return false;
        }
      };
      return {
        refresh() {
          const now = new Date();
          if (owned()) utimesSync(file, now, now);
        },
        release() {
          if (owned()) rmSync(file, { force: true });
        },
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') return undefined;
    }
    let judged;
    let owner;
    try {
      const fd = openSync(file, 'r');
      try {
        judged = fstatSync(fd);
        owner = Number(readFileSync(fd, 'utf8'));
      } finally {
        closeSync(fd);
      }
    } catch {
      continue;
    }
    if (alive(owner) && Date.now() - judged.mtimeMs < staleLockMs)
      return undefined;
    if (!takeOver(file, judged)) return undefined;
  }
  return undefined;
}

// deps: { now, busyPaths(): string[] | undefined,
//         pullRequests(): object[] | undefined, home, log(line), dryRun,
//         remove(worktree): 'removed' | 'stopped' | 'refused',
//         removeTimeout }
// home defaults to the user's home folder, where Claude keeps transcripts,
// and remove to `git worktree remove` without --force.
export function sweep(dir, deps) {
  if (!isMainCheckout(dir)) return [];
  const main = realpathSync(git(dir, ['rev-parse', '--show-toplevel']));
  const root = path.join(main, '.claude', 'worktrees');
  const trash = path.join(main, '.local', 'worktree-trash');
  const all = worktrees(main).filter((entry) => entry.path !== main);
  // A worktree inside another one is left to the outer one, whose chats and
  // processes it cannot see.
  const candidates = all.filter(
    (entry) =>
      within(root, entry.path) &&
      !all.some(
        (other) => other.path !== entry.path && within(other.path, entry.path),
      ),
  );
  const leftovers = deps.dryRun ? [] : boxes(trash);
  if (candidates.length === 0 && leftovers.length === 0) return [];
  const held = deps.dryRun ? { refresh() {}, release() {} } : lock(main);
  if (!held) return [];
  try {
    finish(main, leftovers, all, deps);
    return sweepCandidates(main, root, trash, candidates, deps, held);
  } finally {
    held.release();
  }
}

function boxes(trash) {
  try {
    return readdirSync(trash).map((name) => path.join(trash, name));
  } catch {
    return [];
  }
}

// Each box in the trash held a worktree that passed every check before it
// moved there, so what is left of it is deleted, unless a process is inside,
// it is locked (a worktree git refused to remove that could not move back),
// or git status shows anything but deleted files, which means someone changed
// it after its check. A box that holds no worktree git knows, or whose
// worktree folder is gone, is deleted only when it holds no files. A box that
// cannot be deleted is kept, and the sweep goes on.
function finish(main, leftovers, all, deps) {
  if (leftovers.length === 0) return;
  const busy = deps.busyPaths();
  for (const box of leftovers) {
    const inside = all.filter((entry) => within(box, entry.path));
    if (!busy || busy.some((file) => within(box, file))) continue;
    if (inside.some((entry) => entry.locked)) continue;
    if (
      inside.length === 0 ? !empty(box) : !inside.every(finishable(main, box))
    )
      continue;
    try {
      rmSync(box, { recursive: true, force: true });
    } catch {
      continue;
    }
    for (const entry of inside)
      if (succeeds(main, ['worktree', 'remove', entry.path]))
        deps.log(`finished removing ${entry.path}`);
  }
}

function empty(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).every(
      (item) => item.isDirectory() && empty(path.join(dir, item.name)),
    );
  } catch {
    return false;
  }
}

// What git status shows for a worktree a removal stopped partway: 'deleted'
// when only deleted files show, 'whole' when nothing shows, 'gone' when the
// folder is gone, and 'changed' for anything else or no answer. git deletes
// the worktree's .git file early and its record in the main repository last,
// so status runs through that record. A plain status in the folder would find
// the main checkout instead. Once git has deleted a .gitignore, the paths only
// it ignored, such as node_modules, show as untracked (#412). An untracked
// path counts as deleted only when the main checkout's rules ignore it, so a
// file they do not ignore still keeps the box.
function leftover(main, worktree) {
  if (!existsSync(worktree)) return 'gone';
  const record = recordOf(main, worktree);
  if (!record) return 'changed';
  try {
    const lines = git(main, [
      '--git-dir',
      record,
      '--work-tree',
      worktree,
      'status',
      '--porcelain',
      '--untracked-files=all',
    ])
      .split('\n')
      .filter(Boolean);
    if (lines.length === 0) return 'whole';
    const untracked = lines
      .filter((line) => line.startsWith('?? '))
      .map((line) => line.slice(3));
    // The output is trimmed, so the first line lost its leading space.
    const deleted = lines.every(
      (line) => line.startsWith('?? ') || /^ ?D /.test(line),
    );
    return deleted && ignoredByMain(main, untracked) ? 'deleted' : 'changed';
  } catch {
    return 'changed';
  }
}

// Whether the main checkout's ignore rules ignore every path. A quoted or
// trimmed path matches nothing there, so it keeps the box. check-ignore exits
// 1 when it ignores none of them, and a path tracked in main is never ignored.
function ignoredByMain(main, paths) {
  if (paths.length === 0) return true;
  let ignored;
  try {
    ignored = git(
      main,
      ['check-ignore', '-z', '--stdin'],
      gitTimeout,
      `${paths.join('\0')}\0`,
    );
  } catch (error) {
    if (error.status !== 1) throw error;
    return false;
  }
  const found = new Set(ignored.split('\0'));
  return paths.every((file) => found.has(file));
}

// The folder under .git/worktrees/ whose gitdir names this worktree.
function recordOf(main, worktree) {
  try {
    const records = path.join(
      git(main, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
      'worktrees',
    );
    const gitFile = path.join(worktree, '.git');
    return readdirSync(records)
      .map((name) => path.join(records, name))
      .find((record) => {
        try {
          return (
            readFileSync(path.join(record, 'gitdir'), 'utf8').trim() === gitFile
          );
        } catch {
          return false;
        }
      });
  } catch {
    return undefined;
  }
}

const finishable = (main, box) => (entry) => {
  const state = leftover(main, entry.path);
  return state === 'gone' ? empty(box) : state !== 'changed';
};

// 'removed', 'stopped' when a signal ended git (the time limit sends one), or
// 'refused' when git exited on its own.
function removal(main, worktree, timeout) {
  try {
    git(main, ['worktree', 'remove', worktree], timeout);
    return 'removed';
  } catch (error) {
    return error?.signal ? 'stopped' : 'refused';
  }
}

function sweepCandidates(main, root, trash, candidates, deps, held) {
  const started = Date.now();
  const busy = deps.busyPaths();
  const chats = chatFolders(transcriptDir(main, deps.home), deps.now);
  const history = branchHistory(main);
  const prs = deps.pullRequests();
  const remove =
    deps.remove ??
    ((worktree) =>
      removal(main, worktree, deps.removeTimeout ?? removeTimeout));
  const results = [];
  for (const entry of candidates) {
    held.refresh();
    const name = path.relative(root, entry.path);
    let verdict;
    try {
      verdict = decide(
        {
          locked: entry.locked,
          ...files(entry.path),
          unsaved: unsaved(entry.path, history),
          pushed: pushed(main, entry.head),
          pr: prState(prs, { name, branch: entry.branch, head: entry.head }),
          busy: !busy || busy.some((file) => within(entry.path, file)),
          lastTouched: lastTouched(
            entry.path,
            deps.home,
            chats,
            deps.now - idleMs,
          ),
        },
        deps.now,
      );
    } catch {
      verdict = 'keep: could not inspect';
    }
    if (verdict === 'remove' && !deps.dryRun)
      verdict = recheck(main, entry.path, deps, started);
    if (verdict === 'remove' && !deps.dryRun) {
      let ref;
      try {
        ref = archive(main, entry, name);
      } catch {
        verdict = 'keep: could not archive it';
      }
      if (ref) verdict = removeAside(main, trash, entry, ref, remove, deps);
    }
    results.push({ path: entry.path, verdict });
  }
  return results;
}

// The move is one rename, so a kill leaves the worktree whole in one place or
// the other. No --force: git refuses if the worktree changed since the check,
// and it moves back. A removal stopped partway, or one that deleted files
// before git gave up, stays in the trash for the next sweep to finish, unless
// git status shows a change since the check. The
// box is deleted here only when empty, so a move that renamed the folder and
// then failed never deletes it.
function removeAside(main, trash, entry, ref, remove, deps) {
  let box;
  try {
    mkdirSync(trash, { recursive: true });
    box = mkdtempSync(path.join(trash, `${path.basename(entry.path)}-`));
  } catch {
    return 'keep: could not move it aside';
  }
  const aside = path.join(box, path.basename(entry.path));
  if (!succeeds(main, ['worktree', 'move', entry.path, aside])) {
    attempt(() => rmdirSync(box));
    return 'keep: could not move it aside';
  }
  const outcome = remove(aside);
  if (outcome === 'removed') {
    attempt(() => rmdirSync(box));
    deps.log(
      `removed ${entry.path} branch=${entry.branch || '(detached)'} head=${entry.head} archive=${ref}`,
    );
    return 'remove';
  }
  // A worktree changed since its check goes back even when git was stopped.
  const state = leftover(main, aside);
  if (
    state === 'deleted' ||
    state === 'gone' ||
    (state === 'whole' && outcome === 'stopped')
  ) {
    deps.log(
      `stopped removing ${entry.path} branch=${entry.branch || '(detached)'} head=${entry.head} archive=${ref}; the next sweep finishes it in ${box}`,
    );
    return 'keep: removal stopped partway; the next sweep finishes it';
  }
  if (succeeds(main, ['worktree', 'move', aside, entry.path]))
    attempt(() => rmdirSync(box));
  else
    succeeds(main, [
      'worktree',
      'lock',
      '--reason',
      `git refused the sweep's removal of ${entry.path}`,
      aside,
    ]);
  return 'keep: git refused the removal';
}

// One removal can take minutes, so just before each one this looks again for
// a process inside the worktree, or a chat that touched it since the sweep
// began.
function recheck(main, worktree, deps, started) {
  const busy = deps.busyPaths();
  if (!busy || busy.some((file) => within(worktree, file)))
    return 'keep: a running process is inside it';
  let chat = newest(transcriptDir(worktree, deps.home));
  for (const [folder, time] of chatFolders(
    transcriptDir(main, deps.home),
    started,
    started - 1,
  ))
    if (within(worktree, folder)) chat = Math.max(chat, time);
  return chat >= started ? 'keep: used in the last 2 hours' : 'remove';
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

function pullRequests(main) {
  try {
    const list = JSON.parse(
      execFileSync(
        'gh',
        [
          'pr',
          'list',
          '--state',
          'all',
          '--limit',
          '5000',
          '--json',
          'number,state,headRefName,headRefOid',
        ],
        {
          cwd: main,
          encoding: 'utf8',
          timeout: 60_000,
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      ),
    );
    return Array.isArray(list) ? list : undefined;
  } catch {
    return undefined;
  }
}

const self = fileURLToPath(import.meta.url);

// As a hook it prints nothing. `--detach` starts the sweep as its own process
// and returns at once, so it outlives the session that started it. Run by
// hand, `--dry-run` lists what it would remove without removing it, and
// `--report` removes and lists.
function main(args) {
  try {
    if (args.includes('--detach')) {
      spawn(
        process.execPath,
        [self, ...args.filter((arg) => arg !== '--detach')],
        { detached: true, stdio: 'ignore' },
      )
        .on('error', () => {})
        .unref();
      return;
    }
    const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const logFile = path.join(dir, '.local', 'worktree-sweep.log');
    const dryRun = args.includes('--dry-run');
    const results = sweep(dir, {
      dryRun,
      now: Date.now(),
      busyPaths: () => busyPaths(),
      pullRequests: () => pullRequests(dir),
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

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  main(process.argv.slice(2));
