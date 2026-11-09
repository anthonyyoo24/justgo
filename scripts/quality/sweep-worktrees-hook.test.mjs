import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  decide,
  disposable,
  idleMs,
  sweep,
  transcriptDir,
} from '../../.claude/hooks/sweep-worktrees.mjs';

const hook = fileURLToPath(
  new URL('../../.claude/hooks/sweep-worktrees.mjs', import.meta.url),
);

function git(cwd, ...args) {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Sweep Test',
      '-c',
      'user.email=sweep@example.test',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

function commit(cwd, file, text) {
  writeFileSync(path.join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', `change ${file}`);
}

// A main checkout with worktrees under .claude/worktrees/, and an empty home
// folder for chat transcripts.
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'sweep-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const main = path.join(root, 'main');
  const home = path.join(root, 'home');
  mkdirSync(main);
  mkdirSync(home);
  git(main, 'init', '-q', '-b', 'main');
  commit(
    main,
    '.gitignore',
    'node_modules/\n.env\n.local/\n*.log\n*.key\n.claude/worktrees/\n',
  );
  const logs = [];
  return {
    main,
    home,
    logs,
    add(name, ...args) {
      const dir = path.join(main, '.claude', 'worktrees', name);
      git(main, 'worktree', 'add', '-q', ...args, dir, 'main');
      return dir;
    },
    // open: undefined stands for GitHub being unreadable.
    run({ now = Date.now() + 2 * idleMs, busy = [], ...rest } = {}) {
      const open = 'open' in rest ? rest.open : new Set();
      const results = sweep(main, {
        now,
        home,
        busyPaths: () => busy,
        openBranches: () => open,
        log: (line) => logs.push(line),
      });
      return Object.fromEntries(
        results.map((entry) => [path.basename(entry.path), entry.verdict]),
      );
    },
  };
}

const listed = (main) =>
  git(main, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => path.basename(line.slice(9)));

test('decide keeps anything that might still be needed', () => {
  const now = 10 * idleMs;
  const idle = {
    locked: false,
    clean: true,
    kept: [],
    saved: true,
    branch: '',
    openBranches: new Set(),
    busy: false,
    lastTouched: now - idleMs,
  };
  assert.equal(decide(idle, now), 'remove');
  assert.equal(decide({ ...idle, branch: 'done' }, now), 'remove');
  assert.equal(decide({ ...idle, locked: true }, now), 'keep: locked');
  assert.equal(
    decide({ ...idle, clean: false }, now),
    'keep: uncommitted or untracked files',
  );
  assert.equal(
    decide({ ...idle, kept: ['signing.key'] }, now),
    'keep: ignored files that may be unique (signing.key)',
  );
  assert.equal(
    decide({ ...idle, saved: false }, now),
    'keep: commit is on no branch',
  );
  assert.equal(
    decide({ ...idle, branch: 'wip', openBranches: new Set(['wip']) }, now),
    'keep: open PR',
  );
  assert.equal(
    decide({ ...idle, branch: 'wip', openBranches: undefined }, now),
    'keep: PR state unknown',
  );
  assert.equal(
    decide({ ...idle, openBranches: undefined }, now),
    'remove',
    'a detached worktree needs no PR state',
  );
  assert.equal(
    decide({ ...idle, busy: true }, now),
    'keep: a running process is inside it',
  );
  assert.equal(
    decide({ ...idle, lastTouched: now - idleMs + 1 }, now),
    'keep: used in the last day',
  );
});

test('only rebuildable ignored files and .local scratch are disposable', () => {
  for (const entry of [
    'node_modules',
    'node_modules/',
    'apps/api/node_modules/',
    'packages/contracts/dist/',
    'apps/mobile/.expo/',
    'apps/mobile/expo-env.d.ts',
    'apps/api/.env',
    'coverage/',
    'tsc.log',
    'apps/mobile/tsconfig.tsbuildinfo',
    '.local/',
  ])
    assert.equal(disposable(entry), true, entry);
  for (const entry of [
    'apps/mobile/ios/',
    'AuthKey.p8',
    'signing.key',
    'apps/api/.env.staging',
    'output/',
    '.wrangler/',
  ])
    assert.equal(disposable(entry), false, entry);
  assert.equal(
    disposable('.local/', true),
    false,
    'a decision trail is unique',
  );
});

test('transcript folders use the chat folder with dashes for other characters', () => {
  assert.equal(
    transcriptDir('/Users/a/apps/justgo/.claude/worktrees/x_1', '/home'),
    '/home/.claude/projects/-Users-a-apps-justgo--claude-worktrees-x-1',
  );
});

test('removes idle clean worktrees, ignored files included, and keeps their branches', (t) => {
  const repo = fixture(t);
  const detached = repo.add('verifier', '--detach');
  const merged = repo.add('merged', '-b', 'merged');
  commit(merged, 'feature.txt', 'done\n');
  const head = git(merged, 'rev-parse', 'HEAD');
  mkdirSync(path.join(detached, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(path.join(detached, 'node_modules', 'pkg', 'index.js'), '');
  assert.deepEqual(repo.run(), { verifier: 'remove', merged: 'remove' });
  assert.equal(existsSync(detached), false);
  assert.equal(existsSync(merged), false);
  assert.deepEqual(listed(repo.main), ['main']);
  assert.equal(git(repo.main, 'rev-parse', 'merged'), head);
  assert.equal(repo.logs.length, 2);
  assert.match(repo.logs.join('\n'), /branch=\(detached\)/);
  assert.match(repo.logs.join('\n'), new RegExp(`branch=merged head=${head}`));
});

test('keeps worktrees with changes, unsaved commits, open PRs or a process inside', (t) => {
  const repo = fixture(t);
  const edited = repo.add('edited', '--detach');
  writeFileSync(path.join(edited, '.gitignore'), 'changed\n');
  const scratch = repo.add('scratch', '--detach');
  writeFileSync(path.join(scratch, 'notes.txt'), 'draft\n');
  const orphan = repo.add('orphan', '--detach');
  commit(orphan, 'lost.txt', 'only here\n');
  repo.add('open-pr', '-b', 'open-pr');
  const busy = repo.add('busy', '--detach');
  repo.add('locked', '--detach', '--lock');
  assert.deepEqual(
    repo.run({
      busy: [path.join(busy, '.local', 'postgres')],
      open: new Set(['open-pr']),
    }),
    {
      edited: 'keep: uncommitted or untracked files',
      scratch: 'keep: uncommitted or untracked files',
      orphan: 'keep: commit is on no branch',
      'open-pr': 'keep: open PR',
      busy: 'keep: a running process is inside it',
      locked: 'keep: locked',
    },
  );
  assert.equal(listed(repo.main).length, 7);
  assert.deepEqual(repo.logs, []);
});

test('removes scratch and local settings but keeps decision trails and keys', (t) => {
  const repo = fixture(t);
  const scratch = repo.add('scratch', '--detach');
  mkdirSync(path.join(scratch, '.local', 'postgres'), { recursive: true });
  writeFileSync(path.join(scratch, '.local', 'pr-body.md'), 'body\n');
  writeFileSync(path.join(scratch, '.env'), 'PORT=1\n');
  writeFileSync(path.join(scratch, 'tsc.log'), 'ok\n');
  const trail = repo.add('trail', '--detach');
  mkdirSync(path.join(trail, '.local', 'decision-trails'), { recursive: true });
  writeFileSync(path.join(trail, '.local', 'decision-trails', 'run.tsv'), '');
  const key = repo.add('key', '--detach');
  writeFileSync(path.join(key, 'signing.key'), 'secret\n');
  assert.deepEqual(repo.run(), {
    scratch: 'remove',
    trail: 'keep: ignored files that may be unique (.local/)',
    key: 'keep: ignored files that may be unique (signing.key)',
  });
  assert.equal(existsSync(scratch), false);
});

test('keeps branch worktrees when GitHub cannot be read', (t) => {
  const repo = fixture(t);
  repo.add('branch', '-b', 'branch');
  repo.add('detached', '--detach');
  assert.deepEqual(repo.run({ open: undefined }), {
    branch: 'keep: PR state unknown',
    detached: 'remove',
  });
});

test('keeps worktrees used in the last day, by git or by a chat', (t) => {
  const repo = fixture(t);
  repo.add('fresh', '--detach');
  assert.deepEqual(repo.run({ now: Date.now() }), {
    fresh: 'keep: used in the last day',
  });
  const old = (Date.now() - 3 * idleMs) / 1000;
  const date = `@${Math.floor(old)} +0000`;
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Sweep Test',
      '-c',
      'user.email=sweep@example.test',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'old',
    ],
    {
      cwd: repo.main,
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    },
  );
  const chatted = repo.add('chatted', '--detach');
  const committed = repo.add('committed', '-b', 'committed');
  commit(committed, 'today.txt', 'new\n');
  const switched = repo.add('switched', '--detach');
  for (const dir of [
    repo.add('stale', '--detach'),
    chatted,
    committed,
    switched,
  ]) {
    const gitDir = git(dir, 'rev-parse', '--path-format=absolute', '--git-dir');
    for (const file of [dir, path.join(gitDir, 'HEAD')])
      utimesSync(file, old, old);
  }
  // A checkout rewrites HEAD without touching the folder or making a commit:
  // move to another old commit, on a branch so it counts as saved.
  const side = execFileSync(
    'git',
    ['commit-tree', 'main^{tree}', '-p', 'main', '-m', 'side'],
    {
      cwd: repo.main,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Sweep Test',
        GIT_AUTHOR_EMAIL: 'sweep@example.test',
        GIT_COMMITTER_NAME: 'Sweep Test',
        GIT_COMMITTER_EMAIL: 'sweep@example.test',
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      },
    },
  ).trim();
  git(repo.main, 'branch', 'side', side);
  git(switched, 'checkout', '-q', '--detach', 'side');
  const transcripts = transcriptDir(chatted, repo.home);
  mkdirSync(transcripts, { recursive: true });
  writeFileSync(path.join(transcripts, 'chat.jsonl'), '{}\n');
  // A plain git status, git gc and lock files touch the index, reflog and
  // metadata folder with no one working, so those stay recent here and must
  // not keep the worktree. The fixture's commit is also recent, so commit
  // with an old date first.
  const results = repo.run({ now: Date.now() });
  assert.equal(results.stale, 'remove');
  assert.equal(results.chatted, 'keep: used in the last day');
  assert.equal(results.committed, 'keep: used in the last day');
  assert.equal(results.switched, 'keep: used in the last day');
});

test('leaves worktrees outside .claude/worktrees and does nothing from a linked worktree', (t) => {
  const repo = fixture(t);
  const outside = path.join(path.dirname(repo.main), 'elsewhere');
  git(repo.main, 'worktree', 'add', '-q', '--detach', outside, 'main');
  const inside = repo.add('inside', '--detach');
  assert.deepEqual(
    sweep(inside, {
      now: Date.now() + 2 * idleMs,
      home: repo.home,
      busyPaths: () => [],
      openBranches: () => new Set(),
      log: () => assert.fail('nothing should be removed'),
    }),
    [],
  );
  assert.deepEqual(repo.run(), { inside: 'remove' });
  assert.equal(existsSync(outside), true);
});

test('the hook exits 0 silently, inside or outside a repository', (t) => {
  const repo = fixture(t);
  const fresh = repo.add('fresh', '--detach');
  const outside = realpathSync(mkdtempSync(path.join(tmpdir(), 'sweep-none-')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  for (const dir of [repo.main, outside, fresh]) {
    const result = spawnSync(process.execPath, [hook], {
      cwd: dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
      encoding: 'utf8',
      timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  }
  assert.equal(existsSync(fresh), true, 'a new worktree is kept');
  assert.equal(
    existsSync(path.join(repo.main, '.local', 'worktree-sweep.log')),
    false,
  );
});
