import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  busyPaths,
  decide,
  disposable,
  idleMs,
  localScratch,
  prState,
  staleLockMs,
  sweep,
  takeOver,
  transcriptDir,
} from '../../.claude/hooks/sweep-worktrees.mjs';

const hook = fileURLToPath(
  new URL('../../.claude/hooks/sweep-worktrees.mjs', import.meta.url),
);

const author = {
  GIT_AUTHOR_NAME: 'Sweep Test',
  GIT_AUTHOR_EMAIL: 'sweep@example.test',
  GIT_COMMITTER_NAME: 'Sweep Test',
  GIT_COMMITTER_EMAIL: 'sweep@example.test',
};

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

// A commit dated `seconds` (since the epoch) on top of `parent`, on no branch.
function oldCommit(cwd, parent, seconds) {
  const date = `@${Math.floor(seconds)} +0000`;
  return execFileSync(
    'git',
    ['commit-tree', `${parent}^{tree}`, '-p', parent, '-m', 'old'],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...author,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_DATE: date,
      },
    },
  ).trim();
}

// Dates every file and folder in a worktree, and its HEAD file, to `seconds`.
function age(dir, seconds) {
  for (const entry of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  }))
    utimesSync(path.join(entry.parentPath, entry.name), seconds, seconds);
  utimesSync(dir, seconds, seconds);
  const gitDir = git(dir, 'rev-parse', '--path-format=absolute', '--git-dir');
  utimesSync(path.join(gitDir, 'HEAD'), seconds, seconds);
}

// A main checkout whose main branch is on origin, with worktrees under
// .claude/worktrees/, and an empty home folder for chat transcripts.
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
  git(main, 'update-ref', 'refs/remotes/origin/main', 'main');
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
    // prs: undefined stands for GitHub being unreadable, and busy:
    // undefined for lsof failing.
    run({ now = Date.now() + 2 * idleMs, ...rest } = {}) {
      const prs = 'prs' in rest ? rest.prs : [];
      const busy = 'busy' in rest ? rest.busy : [];
      const results = sweep(main, {
        now,
        home,
        busyPaths: rest.busyPaths ?? (() => busy),
        pullRequests: () => prs,
        log: (line) => logs.push(line),
        remove: rest.remove,
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

const archived = (main, name) =>
  git(main, 'rev-parse', `refs/archive/worktrees/${name}`);

const noRemote =
  'keep: commit is on no remote branch and its PR is not merged or closed';

test('decide keeps anything that might still be needed', () => {
  const now = 10 * idleMs;
  const idle = {
    locked: false,
    clean: true,
    kept: [],
    unsaved: '',
    pushed: true,
    pr: 'none',
    busy: false,
    lastTouched: now - idleMs,
  };
  assert.equal(decide(idle, now), 'remove');
  assert.equal(
    decide({ ...idle, pushed: false, pr: 'finished' }, now),
    'remove',
  );
  assert.equal(decide({ ...idle, pr: 'finished' }, now), 'remove');
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
    decide(
      { ...idle, unsaved: 'a rebase, merge or bisect is in progress' },
      now,
    ),
    'keep: a rebase, merge or bisect is in progress',
  );
  assert.equal(decide({ ...idle, pushed: false }, now), noRemote);
  assert.equal(decide({ ...idle, pr: 'open' }, now), 'keep: open PR');
  assert.equal(
    decide({ ...idle, pr: undefined }, now),
    'keep: PR state unknown',
  );
  assert.equal(
    decide({ ...idle, busy: true }, now),
    'keep: a running process is inside it',
  );
  assert.equal(
    decide({ ...idle, lastTouched: now - idleMs + 1 }, now),
    'keep: used in the last 2 hours',
  );
});

test('a PR that uses the branch or HEAD is open, and a merged or closed one named by the branch or a verifier checkout is finished', () => {
  const head = 'a'.repeat(40);
  const prs = [
    { number: 288, state: 'MERGED', headRefName: 'done', headRefOid: 'b' },
    { number: 291, state: 'CLOSED', headRefName: 'dropped', headRefOid: 'c' },
    { number: 299, state: 'OPEN', headRefName: 'wip', headRefOid: head },
    { number: 300, state: 'CLOSED', headRefName: 'redo', headRefOid: 'd' },
    { number: 301, state: 'OPEN', headRefName: 'redo', headRefOid: 'e' },
    { number: 3010, state: 'MERGED', headRefName: 'other', headRefOid: 'f' },
  ];
  const state = (name, branch = '', commit = 'z') =>
    prState(prs, { name, branch, head: commit });
  assert.equal(state('agent-1', 'done'), 'finished');
  assert.equal(state('agent-1', 'dropped'), 'finished');
  assert.equal(state('agent-1', 'wip'), 'open');
  assert.equal(state('agent-1', 'redo'), 'open', 'a newer open PR wins');
  assert.equal(state('agent-1', '', head), 'open', 'a checkout of its head');
  assert.equal(state('agent-1', 'local-only'), 'none');
  assert.equal(state('ver-288'), 'finished');
  assert.equal(state('ver-291b'), 'finished');
  assert.equal(state('adv-288-a'), 'finished');
  assert.equal(state('ver-299'), 'none', 'its PR is still open');
  assert.equal(state('ver-301'), 'none', 'not PR 3010');
  assert.equal(state('verify-288'), 'none');
  assert.equal(prState(undefined, { name: 'ver-288', branch: '' }), undefined);
});

test('only rebuildable ignored files are disposable, and only tool output in .local is not archived', () => {
  for (const entry of [
    'node_modules',
    'node_modules/',
    'apps/api/node_modules/',
    'packages/contracts/dist/',
    'apps/mobile/.expo/',
    'apps/mobile/expo-env.d.ts',
    'apps/api/.env',
    'apps/mobile/.env',
    'coverage/',
    'tsc.log',
    'apps/mobile/tsconfig.tsbuildinfo',
  ])
    assert.equal(disposable(entry), true, entry);
  for (const entry of [
    'apps/mobile/ios/',
    'AuthKey.p8',
    'signing.key',
    'apps/api/.env.staging',
    // #308: only the apps/<name>/.env files `pnpm run db:local` writes are
    // rebuilt, so any other .env may be the only copy of a key.
    '.env',
    'e2e/.env',
    'apps/.env',
    'apps/api/config/.env',
    'packages/contracts/.env',
    'output/',
    '.wrangler/',
  ])
    assert.equal(disposable(entry), false, entry);
  for (const name of [
    'postgres',
    'database.env',
    'journey-results',
    'journey-report',
    'journey-repository.mjs',
    'exported-web-results',
    'exported-web-report',
  ])
    assert.equal(localScratch(name), true, name);
  for (const name of [
    'decision-trails',
    'run.review.md',
    'pr-body.md',
    'postgres.log',
    'verify-301.log',
    'verify-justgo',
  ])
    assert.equal(localScratch(name), false, name);
});

test('transcript folders use the chat folder with dashes for other characters', () => {
  assert.equal(
    transcriptDir('/Users/a/apps/justgo/.claude/worktrees/x_1', '/home'),
    '/home/.claude/projects/-Users-a-apps-justgo--claude-worktrees-x-1',
  );
});

test('removes idle clean worktrees, ignored files included, and keeps their branches and commits', (t) => {
  const repo = fixture(t);
  const detached = repo.add('verifier', '--detach');
  const merged = repo.add('merged', '-b', 'merged');
  commit(merged, 'feature.txt', 'done\n');
  const head = git(merged, 'rev-parse', 'HEAD');
  const main = git(repo.main, 'rev-parse', 'main');
  mkdirSync(path.join(detached, 'node_modules', 'pkg'), { recursive: true });
  writeFileSync(path.join(detached, 'node_modules', 'pkg', 'index.js'), '');
  assert.deepEqual(
    repo.run({
      prs: [
        { number: 7, state: 'MERGED', headRefName: 'merged', headRefOid: head },
      ],
    }),
    { verifier: 'remove', merged: 'remove' },
  );
  assert.equal(existsSync(detached), false);
  assert.equal(existsSync(merged), false);
  assert.deepEqual(listed(repo.main), ['main']);
  assert.equal(git(repo.main, 'rev-parse', 'merged'), head);
  assert.equal(archived(repo.main, 'merged'), head);
  assert.equal(archived(repo.main, 'verifier'), main);
  assert.equal(repo.logs.length, 2);
  assert.match(
    repo.logs.join('\n'),
    /branch=\(detached\) head=\w+ archive=refs\/archive\/worktrees\/verifier/,
  );
  assert.match(
    repo.logs.join('\n'),
    new RegExp(
      `branch=merged head=${head} archive=refs/archive/worktrees/merged`,
    ),
  );
});

test('removes a verifier checkout of a merged or closed PR whose branch is gone, and archives its commit', (t) => {
  const repo = fixture(t);
  const heads = {};
  for (const name of ['ver-301c', 'adv-302-a', 'ver-303', 'ver-304']) {
    const dir = repo.add(name, '--detach');
    commit(dir, 'pr.txt', `${name}\n`);
    heads[name] = git(dir, 'rev-parse', 'HEAD');
  }
  const pr = (number, state) => ({
    number,
    state,
    headRefName: `deleted-${number}`,
    headRefOid: 'f'.repeat(40),
  });
  assert.deepEqual(
    repo.run({
      prs: [pr(301, 'MERGED'), pr(302, 'CLOSED'), pr(304, 'OPEN')],
    }),
    {
      'ver-301c': 'remove',
      'adv-302-a': 'remove',
      'ver-303': noRemote,
      'ver-304': noRemote,
    },
  );
  for (const name of ['ver-301c', 'adv-302-a']) {
    assert.equal(archived(repo.main, name), heads[name]);
    assert.notEqual(
      git(repo.main, 'for-each-ref', `--contains=${heads[name]}`),
      '',
      `${name} stays reachable`,
    );
  }
});

test('keeps worktrees with changes, unsaved commits, open PRs or a process inside', (t) => {
  const repo = fixture(t);
  const edited = repo.add('edited', '--detach');
  writeFileSync(path.join(edited, '.gitignore'), 'changed\n');
  const scratch = repo.add('scratch', '--detach');
  writeFileSync(path.join(scratch, 'notes.txt'), 'draft\n');
  const orphan = repo.add('orphan', '--detach');
  commit(orphan, 'lost.txt', 'only here\n');
  const local = repo.add('local', '-b', 'local');
  commit(local, 'unpushed.txt', 'on a local branch only\n');
  repo.add('open-pr', '-b', 'open-pr');
  const checkout = repo.add('checkout', '--detach');
  commit(checkout, 'pushed.txt', 'an open PR head\n');
  const openHead = git(checkout, 'rev-parse', 'HEAD');
  git(repo.main, 'update-ref', 'refs/remotes/origin/feature', openHead);
  const busy = repo.add('busy', '--detach');
  repo.add('locked', '--detach', '--lock');
  assert.deepEqual(
    repo.run({
      busy: [path.join(busy, '.local', 'postgres')],
      prs: [
        { number: 1, state: 'OPEN', headRefName: 'open-pr', headRefOid: 'x' },
        {
          number: 2,
          state: 'OPEN',
          headRefName: 'feature',
          headRefOid: openHead,
        },
      ],
    }),
    {
      edited: 'keep: uncommitted or untracked files',
      scratch: 'keep: uncommitted or untracked files',
      orphan: noRemote,
      local: noRemote,
      'open-pr': 'keep: open PR',
      checkout: 'keep: open PR',
      busy: 'keep: a running process is inside it',
      locked: 'keep: locked',
    },
  );
  assert.equal(listed(repo.main).length, 9);
  assert.deepEqual(repo.logs, []);
  assert.equal(git(repo.main, 'for-each-ref', 'refs/archive'), '');
});

test('copies .local records into the main checkout and keeps only unique ignored files outside it', (t) => {
  const repo = fixture(t);
  const scratch = repo.add('scratch', '--detach');
  for (const dir of ['postgres', 'journey-results', 'journey-report'])
    mkdirSync(path.join(scratch, '.local', dir), { recursive: true });
  writeFileSync(path.join(scratch, '.local', 'postgres', 'PG_VERSION'), '17\n');
  writeFileSync(path.join(scratch, '.local', 'postgres.log'), 'up\n');
  writeFileSync(path.join(scratch, '.local', 'database.env'), 'PORT=1\n');
  mkdirSync(path.join(scratch, 'apps', 'api'), { recursive: true });
  writeFileSync(path.join(scratch, 'apps', 'api', '.env'), 'PORT=1\n');
  writeFileSync(path.join(scratch, 'tsc.log'), 'ok\n');
  const trail = repo.add('trail', '--detach');
  mkdirSync(path.join(trail, '.local', 'decision-trails'), { recursive: true });
  writeFileSync(
    path.join(trail, '.local', 'decision-trails', 'run.tsv'),
    'a\n',
  );
  writeFileSync(path.join(trail, '.local', 'run.review.md'), 'review\n');
  mkdirSync(path.join(trail, '.local', 'verify-justgo', 'run-1'), {
    recursive: true,
  });
  writeFileSync(
    path.join(trail, '.local', 'verify-justgo', 'run-1', 'shot.png'),
    'png',
  );
  const key = repo.add('key', '--detach');
  writeFileSync(path.join(key, 'signing.key'), 'secret\n');
  mkdirSync(path.join(key, '.local'));
  writeFileSync(path.join(key, '.local', 'pr-body.md'), 'body\n');
  // #308: a root or nested .env outside apps/<name>/ may hold a unique key.
  const env = repo.add('env', '--detach');
  writeFileSync(path.join(env, '.env'), 'STAGING_SERVICE_KEY=unique\n');
  mkdirSync(path.join(env, 'e2e'));
  writeFileSync(path.join(env, 'e2e', '.env'), 'X=unique\n');
  assert.deepEqual(repo.run(), {
    scratch: 'remove',
    trail: 'remove',
    key: 'keep: ignored files that may be unique (signing.key)',
    env: 'keep: ignored files that may be unique (.env, e2e/.env)',
  });
  assert.equal(
    readFileSync(path.join(env, '.env'), 'utf8'),
    'STAGING_SERVICE_KEY=unique\n',
  );
  assert.equal(
    readFileSync(path.join(env, 'e2e', '.env'), 'utf8'),
    'X=unique\n',
  );
  const store = path.join(repo.main, '.local', 'archived-worktrees');
  assert.deepEqual(readdirSync(path.join(store, 'scratch')).sort(), [
    'postgres.log',
  ]);
  for (const [file, text] of [
    ['decision-trails/run.tsv', 'a\n'],
    ['run.review.md', 'review\n'],
    ['verify-justgo/run-1/shot.png', 'png'],
  ])
    assert.equal(
      readFileSync(path.join(store, 'trail', file), 'utf8'),
      text,
      file,
    );
  assert.equal(existsSync(path.join(store, 'key')), false);
  assert.equal(existsSync(path.join(key, '.local', 'pr-body.md')), true);
});

test('archives under a new name when an earlier archive holds the name', (t) => {
  const repo = fixture(t);
  const earlier = oldCommit(repo.main, 'main', Date.now() / 1000 - 1000);
  git(repo.main, 'update-ref', 'refs/archive/worktrees/reused', earlier);
  const store = path.join(repo.main, '.local', 'archived-worktrees');
  mkdirSync(path.join(store, 'taken'), { recursive: true });
  writeFileSync(path.join(store, 'taken', 'old.md'), 'earlier run\n');
  const reused = repo.add('reused', '--detach');
  const taken = repo.add('taken', '--detach');
  for (const dir of [reused, taken]) {
    mkdirSync(path.join(dir, '.local'));
    writeFileSync(path.join(dir, '.local', 'new.md'), 'this run\n');
  }
  assert.deepEqual(repo.run(), { reused: 'remove', taken: 'remove' });
  const main = git(repo.main, 'rev-parse', 'main');
  assert.equal(archived(repo.main, 'reused'), earlier);
  assert.equal(archived(repo.main, 'reused-2'), main);
  assert.equal(archived(repo.main, 'taken-2'), main);
  assert.deepEqual(readdirSync(path.join(store, 'taken')), ['old.md']);
  assert.deepEqual(readdirSync(path.join(store, 'reused-2')), ['new.md']);
  assert.deepEqual(readdirSync(path.join(store, 'taken-2')), ['new.md']);
});

test('never overwrites an archive that a same-name worktree on the same commit left', (t) => {
  const repo = fixture(t);
  // An earlier verifier checkout of the same PR head left its archive.
  git(repo.main, 'update-ref', 'refs/archive/worktrees/ver-9', 'main');
  const store = path.join(repo.main, '.local', 'archived-worktrees');
  mkdirSync(path.join(store, 'ver-9'), { recursive: true });
  writeFileSync(path.join(store, 'ver-9', 'verdict.md'), 'earlier verdict\n');
  const again = repo.add('ver-9', '--detach');
  mkdirSync(path.join(again, '.local'));
  writeFileSync(path.join(again, '.local', 'verdict.md'), 'later verdict\n');
  assert.deepEqual(repo.run(), { 'ver-9': 'remove' });
  const main = git(repo.main, 'rev-parse', 'main');
  assert.equal(archived(repo.main, 'ver-9'), main);
  assert.equal(archived(repo.main, 'ver-9-2'), main);
  assert.equal(
    readFileSync(path.join(store, 'ver-9', 'verdict.md'), 'utf8'),
    'earlier verdict\n',
  );
  assert.equal(
    readFileSync(path.join(store, 'ver-9-2', 'verdict.md'), 'utf8'),
    'later verdict\n',
  );
});

test('keeps a worktree whose .local folder cannot be copied', (t) => {
  const repo = fixture(t);
  const sealed = repo.add('sealed', '--detach');
  const local = path.join(sealed, '.local');
  mkdirSync(local);
  writeFileSync(path.join(local, 'run.review.md'), 'review\n');
  chmodSync(local, 0);
  try {
    assert.deepEqual(repo.run(), { sealed: 'keep: could not archive it' });
  } finally {
    chmodSync(local, 0o755);
  }
  assert.equal(existsSync(path.join(local, 'run.review.md')), true);
});

test('keeps every worktree when the process list cannot be read', (t) => {
  const repo = fixture(t);
  const idle = repo.add('idle', '--detach');
  assert.deepEqual(repo.run({ busy: undefined }), {
    idle: 'keep: a running process is inside it',
  });
  assert.equal(existsSync(idle), true);
});

test('treats a process list cut short as unreadable', () => {
  const failed = (fields) => () => {
    throw Object.assign(new Error('lsof'), fields);
  };
  assert.deepEqual(
    busyPaths(() => 'p1\nn/a\nn/b c\n'),
    ['/a', '/b c'],
  );
  // lsof exits 1 when it cannot read some processes and lists the rest.
  assert.deepEqual(busyPaths(failed({ status: 1, stdout: 'n/a\n' })), ['/a']);
  assert.equal(busyPaths(failed({ status: 1, stdout: '' })), undefined);
  // A timeout kills lsof with a signal partway through the list.
  assert.equal(
    busyPaths(failed({ status: null, signal: 'SIGTERM', stdout: 'n/a\n' })),
    undefined,
  );
  assert.equal(busyPaths(failed({ status: 2, stdout: 'n/a\n' })), undefined);
  assert.equal(busyPaths(failed({ code: 'ENOENT' })), undefined);
});

test('keeps commits and operations that only the worktree holds', (t) => {
  const repo = fixture(t);
  const lost = 'keep: its HEAD history holds a commit no branch holds';
  // A commit made on a detached HEAD lives only in the worktree's HEAD
  // reflog, which removal deletes, once a checkout or a reset leaves it.
  const left = repo.add('left', '-b', 'left');
  git(left, 'checkout', '-q', '--detach');
  commit(left, 'experiment.txt', 'only in the reflog\n');
  git(left, 'checkout', '-q', 'left');
  const reset = repo.add('reset', '--detach');
  commit(reset, 'reset.txt', 'dropped by a reset\n');
  git(reset, 'reset', '-q', '--hard', 'main');
  const ref = repo.add('ref', '--detach');
  git(ref, 'update-ref', 'refs/worktree/keep', 'HEAD');
  const bisecting = repo.add('bisecting', '--detach');
  git(bisecting, 'bisect', 'start');
  // On a branch, the branch's own reflog keeps a commit that an amend or a
  // reset replaced, and it survives the removal.
  const amended = repo.add('amended', '-b', 'amended');
  commit(amended, 'draft.txt', 'first\n');
  git(amended, 'commit', '-q', '--amend', '-m', 'reworded');
  const rewound = repo.add('rewound', '-b', 'rewound');
  commit(rewound, 'draft.txt', 'first\n');
  git(rewound, 'reset', '-q', '--hard', 'HEAD~1');
  const prs = ['amended', 'rewound'].map((branch, number) => ({
    number,
    state: 'MERGED',
    headRefName: branch,
    headRefOid: 'x',
  }));
  assert.deepEqual(repo.run({ prs }), {
    left: lost,
    reset: lost,
    ref: 'keep: it has refs of its own',
    bisecting: 'keep: a rebase, merge or bisect is in progress',
    amended: 'remove',
    rewound: 'remove',
  });
  // Once a branch holds the commit, removal loses nothing, even after the
  // branch's own reflog expires.
  git(left, 'branch', 'kept-experiment', 'HEAD@{1}');
  git(
    repo.main,
    'reflog',
    'expire',
    '--expire=all',
    '--expire-unreachable=all',
    'refs/heads/kept-experiment',
  );
  assert.equal(git(repo.main, 'reflog', 'show', 'kept-experiment'), '');
  assert.deepEqual(repo.run(), {
    left: 'remove',
    reset: lost,
    ref: 'keep: it has refs of its own',
    bisecting: 'keep: a rebase, merge or bisect is in progress',
  });
});

test('keeps a worktree for every operation in progress and every ref of its own', (t) => {
  const repo = fixture(t);
  const expected = {};
  for (const [name, dir] of [
    ['rebase-merge', true],
    ['rebase-apply', true],
    ['MERGE_HEAD', false],
    ['CHERRY_PICK_HEAD', false],
    ['REVERT_HEAD', false],
    ['BISECT_LOG', false],
    ['sequencer', true],
    ['NOTES_MERGE_PARTIAL', false],
  ]) {
    const worktree = repo.add(name.toLowerCase(), '--detach');
    const marker = path.join(
      git(worktree, 'rev-parse', '--path-format=absolute', '--git-dir'),
      name,
    );
    if (dir) mkdirSync(marker);
    else writeFileSync(marker, `${git(worktree, 'rev-parse', 'HEAD')}\n`);
    expected[name.toLowerCase()] =
      'keep: a rebase, merge or bisect is in progress';
  }
  for (const ref of [
    'refs/worktree/keep',
    'refs/bisect/bad',
    'refs/rewritten/x',
  ]) {
    const name = ref.split('/')[1];
    const worktree = repo.add(name, '--detach');
    git(worktree, 'update-ref', ref, 'HEAD');
    expected[name] = 'keep: it has refs of its own';
  }
  assert.deepEqual(repo.run(), expected);
});

test('keeps the remaining steps of a cherry-pick after a conflict is committed', (t) => {
  const repo = fixture(t);
  const source = repo.add('source', '-b', 'source');
  commit(source, 'shared.txt', 'a\n');
  commit(source, 'shared.txt', 'b\n');
  const conflicting = git(source, 'rev-parse', 'HEAD');
  commit(source, 'other.txt', 'c\n');
  const last = git(source, 'rev-parse', 'HEAD');
  const picking = repo.add('picking', '-b', 'picking');
  commit(picking, 'shared.txt', 'mine\n');
  assert.throws(() => git(picking, 'cherry-pick', conflicting, last));
  writeFileSync(path.join(picking, 'shared.txt'), 'resolved\n');
  git(picking, 'add', 'shared.txt');
  git(picking, 'commit', '-q', '--no-edit');
  assert.deepEqual(
    repo.run({
      prs: [
        { number: 1, state: 'OPEN', headRefName: 'source', headRefOid: last },
      ],
    }),
    {
      source: 'keep: open PR',
      picking: 'keep: a rebase, merge or bisect is in progress',
    },
  );
});

test('keeps a notes merge stopped on a conflict', (t) => {
  const repo = fixture(t);
  const merging = repo.add('merging', '--detach');
  git(merging, 'notes', 'add', '-m', 'mine', 'HEAD');
  git(merging, 'notes', '--ref=other', 'add', '-m', 'theirs', 'HEAD');
  assert.throws(() => git(merging, 'notes', 'merge', 'other'));
  assert.deepEqual(repo.run(), {
    merging: 'keep: a rebase, merge or bisect is in progress',
  });
});

test('looks again for a process or a chat just before each removal', (t) => {
  const repo = fixture(t);
  const first = repo.add('first', '--detach');
  const busy = repo.add('busy', '--detach');
  const chatted = repo.add('chatted', '--detach');
  const ownChat = repo.add('own-chat', '--detach');
  const slug = transcriptDir(repo.main, repo.home);
  let calls = 0;
  // The first call is the sweep's own look. By the next one, a process has
  // started in one worktree, a chat started in the main checkout has resumed
  // in another, and a chat started in a third has resumed there.
  const busyPaths = () => {
    calls += 1;
    if (calls === 1) return [];
    mkdirSync(slug, { recursive: true });
    writeFileSync(
      path.join(slug, 'resumed.jsonl'),
      `${JSON.stringify({ cwd: chatted })}\n`,
    );
    const own = transcriptDir(ownChat, repo.home);
    mkdirSync(own, { recursive: true });
    writeFileSync(path.join(own, 'resumed.jsonl'), '{}\n');
    return [path.join(busy, 'apps')];
  };
  assert.deepEqual(repo.run({ busyPaths }), {
    first: 'remove',
    busy: 'keep: a running process is inside it',
    chatted: 'keep: used in the last 2 hours',
    'own-chat': 'keep: used in the last 2 hours',
  });
  assert.equal(existsSync(first), false);
  assert.equal(existsSync(busy), true);
  assert.equal(existsSync(chatted), true);
  assert.equal(existsSync(ownChat), true);
});

test('never forces a removal when a worktree changes after its check', (t) => {
  const repo = fixture(t);
  const changed = repo.add('changed', '--detach');
  let calls = 0;
  // By the look just before removal, someone has saved a new file there.
  const busyPaths = () => {
    calls += 1;
    if (calls > 1) writeFileSync(path.join(changed, 'draft.txt'), 'new\n');
    return [];
  };
  assert.deepEqual(repo.run({ busyPaths }), {
    changed: 'keep: git refused the removal',
  });
  assert.equal(existsSync(path.join(changed, 'draft.txt')), true);
  assert.deepEqual(repo.logs, []);
});

// #275
test('finishes a removal killed partway on the next sweep, without --force', (t) => {
  const repo = fixture(t);
  commit(repo.main, 'a.txt', 'a\n');
  commit(repo.main, 'b.txt', 'b\n');
  git(repo.main, 'update-ref', 'refs/remotes/origin/main', 'main');
  const killed = repo.add('killed', '--detach');
  // git deletes the files first and its record last, so a kill partway
  // leaves a registered worktree with some tracked files gone.
  const kill = (worktree) => {
    rmSync(path.join(worktree, 'a.txt'));
    throw new Error('killed');
  };
  assert.throws(() => repo.run({ remove: kill }), /killed/);
  repo.run();
  assert.equal(existsSync(killed), false);
  assert.deepEqual(listed(repo.main), ['main']);
  assert.equal(git(repo.main, 'status', '--porcelain'), '');
});

test('leaves a worktree inside another worktree to the outer one', (t) => {
  const repo = fixture(t);
  const outer = repo.add('outer', '--detach');
  const inner = repo.add('outer/inner', '--detach');
  assert.deepEqual(repo.run(), {
    outer: 'keep: uncommitted or untracked files',
  });
  assert.equal(existsSync(inner), true);
  assert.equal(existsSync(outer), true);
});

test('keeps hidden edits and removes commits a remote branch holds', (t) => {
  const repo = fixture(t);
  const skipped = repo.add('skipped', '--detach');
  git(skipped, 'update-index', '--skip-worktree', '.gitignore');
  writeFileSync(path.join(skipped, '.gitignore'), 'local edit\n');
  const assumed = repo.add('assumed', '--detach');
  git(assumed, 'update-index', '--assume-unchanged', '.gitignore');
  writeFileSync(path.join(assumed, '.gitignore'), 'local edit\n');
  const remote = repo.add('remote', '--detach');
  commit(remote, 'pushed.txt', 'on a remote branch only\n');
  git(remote, 'push', '-q', '.', 'HEAD:refs/remotes/origin/feature');
  const onMain = repo.add('on-main', '--detach');
  commit(onMain, 'landed.txt', 'on origin/main\n');
  git(onMain, 'push', '-q', '.', 'HEAD:refs/remotes/origin/main');
  assert.deepEqual(repo.run(), {
    skipped: 'keep: uncommitted or untracked files',
    assumed: 'keep: uncommitted or untracked files',
    remote: 'remove',
    'on-main': 'remove',
  });
});

test('keeps every worktree when GitHub cannot be read', (t) => {
  const repo = fixture(t);
  repo.add('branch', '-b', 'branch');
  repo.add('detached', '--detach');
  assert.deepEqual(repo.run({ prs: undefined }), {
    branch: 'keep: PR state unknown',
    detached: 'keep: PR state unknown',
  });
});

test('keeps worktrees used in the last 2 hours, by a file outside node_modules, git or a chat', (t) => {
  const repo = fixture(t);
  const now = Date.now();
  repo.add('fresh', '--detach');
  assert.deepEqual(repo.run({ now }), {
    fresh: 'keep: used in the last 2 hours',
  });
  const old = (now - 3 * idleMs) / 1000;
  git(repo.main, 'reset', '-q', oldCommit(repo.main, 'main', old));
  git(repo.main, 'update-ref', 'refs/remotes/origin/main', 'main');
  const side = oldCommit(repo.main, 'main', old);
  git(repo.main, 'update-ref', 'refs/remotes/origin/side', side);
  const names = [
    'stale',
    'modules',
    'edited',
    'switched',
    'chatted',
    'via-main',
    'past-chat',
  ];
  const dirs = Object.fromEntries(
    names.map((name) => [name, repo.add(name, '--detach')]),
  );
  mkdirSync(path.join(dirs.modules, 'node_modules', 'pkg'), {
    recursive: true,
  });
  mkdirSync(path.join(dirs.edited, '.local'));
  for (const dir of Object.values(dirs)) age(dir, old);
  // Packages installed or rebuilt in node_modules are not work. A change to
  // any other file, ignored ones included, is.
  writeFileSync(path.join(dirs.modules, 'node_modules', 'pkg', 'index.js'), '');
  writeFileSync(path.join(dirs.edited, '.local', 'notes.md'), 'draft\n');
  // A checkout rewrites HEAD without changing a file or making a commit.
  git(dirs.switched, 'checkout', '-q', '--detach', side);
  const transcripts = transcriptDir(dirs.chatted, repo.home);
  mkdirSync(transcripts, { recursive: true });
  writeFileSync(path.join(transcripts, 'chat.jsonl'), '{}\n');
  // A chat started in the main checkout files its transcript there, and each
  // line names the folder its step ran in. Only a recent transcript counts.
  const mainChats = path.join(transcriptDir(repo.main, repo.home), 'chat');
  mkdirSync(path.join(mainChats, 'subagents'), { recursive: true });
  writeFileSync(
    path.join(mainChats, 'subagents', 'agent.jsonl'),
    `${JSON.stringify({ cwd: path.join(dirs['via-main'], 'apps') })}\n`,
  );
  const past = path.join(mainChats, 'past.jsonl');
  writeFileSync(past, `${JSON.stringify({ cwd: dirs['past-chat'] })}\n`);
  utimesSync(past, old, old);
  const results = repo.run({ now });
  assert.deepEqual(
    Object.fromEntries(names.map((name) => [name, results[name]])),
    {
      stale: 'remove',
      modules: 'remove',
      edited: 'keep: used in the last 2 hours',
      switched: 'keep: used in the last 2 hours',
      chatted: 'keep: used in the last 2 hours',
      'via-main': 'keep: used in the last 2 hours',
      'past-chat': 'remove',
    },
  );
});

test('runs one sweep at a time and takes over the lock of a sweep that died', (t) => {
  const repo = fixture(t);
  const idle = repo.add('idle', '--detach');
  const file = path.join(repo.main, '.local', 'worktree-sweep.lock');
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${process.pid}\n`);
  assert.deepEqual(repo.run(), {});
  assert.equal(existsSync(idle), true);
  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  writeFileSync(file, `${dead}\n`);
  assert.deepEqual(repo.run(), { idle: 'remove' });
  assert.equal(existsSync(file), false);
});

test('takes over a lock older than the stale limit even when its PID now names a live process', (t) => {
  const repo = fixture(t);
  const idle = repo.add('idle', '--detach');
  const file = path.join(repo.main, '.local', 'worktree-sweep.lock');
  mkdirSync(path.dirname(file), { recursive: true });
  // After a reboot, the PID a dead sweep wrote can name an unrelated process.
  writeFileSync(file, `${process.pid}\n`);
  const old = (Date.now() - staleLockMs - 60_000) / 1000;
  utimesSync(file, old, old);
  assert.deepEqual(repo.run(), { idle: 'remove' });
  assert.equal(existsSync(idle), false);
  assert.equal(existsSync(file), false);
});

test('a sweep that judged a lock stale never removes a fresh lock another sweep took first', (t) => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'sweep-lock-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'worktree-sweep.lock');
  const dead = spawnSync(process.execPath, ['-e', '']).pid;
  writeFileSync(file, `${dead}\n`);
  const old = (Date.now() - staleLockMs - 60_000) / 1000;
  utimesSync(file, old, old);
  const judged = statSync(file);
  // Between that look and the takeover, another sweep replaced the stale
  // lock with its own.
  rmSync(file);
  writeFileSync(file, `${process.pid}\n`);
  assert.equal(takeOver(file, judged), false);
  assert.equal(readFileSync(file, 'utf8'), `${process.pid}\n`);
  assert.deepEqual(readdirSync(dir), ['worktree-sweep.lock']);
  assert.equal(takeOver(file, statSync(file)), true);
  assert.deepEqual(readdirSync(dir), []);
});

test('leaves worktrees outside .claude/worktrees and does nothing from a linked worktree', (t) => {
  const repo = fixture(t);
  const outside = path.join(path.dirname(repo.main), 'elsewhere');
  git(repo.main, 'worktree', 'add', '-q', '--detach', outside, 'main');
  repo.add('inside', '--detach');
  // A linked worktree outside the main checkout can hold idle worktrees in
  // its own .claude/worktrees, and its chats cannot see them.
  const nested = path.join(outside, '.claude', 'worktrees', 'nested');
  git(repo.main, 'worktree', 'add', '-q', '--detach', nested, 'main');
  assert.deepEqual(
    sweep(outside, {
      now: Date.now() + 2 * idleMs,
      home: repo.home,
      busyPaths: () => [],
      pullRequests: () => [],
      log: () => assert.fail('nothing should be removed'),
    }),
    [],
  );
  assert.equal(existsSync(nested), true);
  assert.deepEqual(repo.run(), { inside: 'remove' });
  assert.equal(existsSync(outside), true);
  // A worktree moved or deleted by hand outside .claude/worktrees keeps its
  // git record: the sweep never prunes.
  rmSync(outside, { recursive: true, force: true });
  repo.add('later', '--detach');
  assert.deepEqual(repo.run(), { later: 'remove' });
  assert.equal(listed(repo.main).includes('elsewhere'), true);
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
  assert.equal(existsSync(path.join(outside, '.local')), false);
});

test('--detach returns at once and the sweep finishes in its own process', async (t) => {
  const repo = fixture(t);
  const old = (Date.now() - 3 * idleMs) / 1000;
  git(repo.main, 'reset', '-q', oldCommit(repo.main, 'main', old));
  git(repo.main, 'update-ref', 'refs/remotes/origin/main', 'main');
  const idle = repo.add('idle', '--detach');
  age(idle, old);
  // A stand-in gh that lists no PRs, so the sweep can read GitHub offline.
  const bin = path.join(repo.home, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'gh'), '#!/bin/sh\necho "[]"\n');
  chmodSync(path.join(bin, 'gh'), 0o755);
  const result = spawnSync(process.execPath, [hook, '--detach'], {
    cwd: repo.main,
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: repo.main,
      HOME: repo.home,
      PATH: `${bin}:${process.env.PATH}`,
    },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  const log = path.join(repo.main, '.local', 'worktree-sweep.log');
  const lock = path.join(repo.main, '.local', 'worktree-sweep.lock');
  for (let i = 0; i < 300 && (!existsSync(log) || existsSync(lock)); i += 1)
    await sleep(100);
  assert.match(
    readFileSync(log, 'utf8'),
    /removed .*\/idle branch=\(detached\) head=\w+ archive=refs\/archive\/worktrees\/idle\n/,
  );
  assert.equal(existsSync(idle), false);
});

test('a chat that starts or ends in the main checkout starts a detached sweep', () => {
  const { hooks } = JSON.parse(
    readFileSync(new URL('../../.claude/settings.json', import.meta.url)),
  );
  const command =
    'node "$CLAUDE_PROJECT_DIR/.claude/hooks/sweep-worktrees.mjs" --detach';
  const sweeps = (event) =>
    hooks[event].flatMap((group) =>
      group.hooks
        .filter((entry) => entry.command === command)
        .map(() => group.matcher ?? 'any'),
    );
  assert.deepEqual(sweeps('SessionStart'), ['startup']);
  assert.deepEqual(sweeps('SessionEnd'), ['any']);
});
