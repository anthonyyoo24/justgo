import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
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
  busyPaths,
  decide,
  disposable,
  idleMs,
  localScratch,
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
    // open: undefined stands for GitHub being unreadable, and busy:
    // undefined for lsof failing.
    run({ now = Date.now() + 2 * idleMs, ...rest } = {}) {
      const open = 'open' in rest ? rest.open : new Set();
      const busy = 'busy' in rest ? rest.busy : [];
      const results = sweep(main, {
        now,
        home,
        busyPaths: rest.busyPaths ?? (() => busy),
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
    unsaved: '',
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
    decide(
      { ...idle, unsaved: 'a rebase, merge or bisect is in progress' },
      now,
    ),
    'keep: a rebase, merge or bisect is in progress',
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

test('only rebuildable ignored files and tool output in .local are disposable', () => {
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
  for (const name of [
    'postgres',
    'postgres.log',
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
    'mutation-run.json',
    'edge-trial',
    'swarm',
    'local-database-54339.mjs',
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

test('removes tool output and local settings but keeps agent records and keys', (t) => {
  const repo = fixture(t);
  const scratch = repo.add('scratch', '--detach');
  for (const dir of ['postgres', 'journey-results', 'journey-report'])
    mkdirSync(path.join(scratch, '.local', dir), { recursive: true });
  writeFileSync(path.join(scratch, '.local', 'postgres.log'), 'up\n');
  writeFileSync(path.join(scratch, '.local', 'database.env'), 'PORT=1\n');
  writeFileSync(path.join(scratch, '.env'), 'PORT=1\n');
  writeFileSync(path.join(scratch, 'tsc.log'), 'ok\n');
  const trail = repo.add('trail', '--detach');
  mkdirSync(path.join(trail, '.local', 'decision-trails'), { recursive: true });
  writeFileSync(path.join(trail, '.local', 'decision-trails', 'run.tsv'), '');
  // A review beside an empty trail folder, and agent drafts beside a
  // database, are records too.
  const review = repo.add('review', '--detach');
  mkdirSync(path.join(review, '.local', 'decision-trails'), {
    recursive: true,
  });
  writeFileSync(path.join(review, '.local', 'run.review.md'), 'review\n');
  const drafts = repo.add('drafts', '--detach');
  mkdirSync(path.join(drafts, '.local', 'postgres'), { recursive: true });
  writeFileSync(path.join(drafts, '.local', 'pr-body.md'), 'body\n');
  // The verify-justgo skill says cleanup never touches its evidence.
  const evidence = repo.add('evidence', '--detach');
  mkdirSync(path.join(evidence, '.local', 'verify-justgo', 'run-1'), {
    recursive: true,
  });
  const key = repo.add('key', '--detach');
  writeFileSync(path.join(key, 'signing.key'), 'secret\n');
  assert.deepEqual(repo.run(), {
    scratch: 'remove',
    trail: 'keep: ignored files that may be unique (.local/decision-trails)',
    review:
      'keep: ignored files that may be unique (.local/decision-trails, .local/run.review.md)',
    drafts: 'keep: ignored files that may be unique (.local/pr-body.md)',
    evidence: 'keep: ignored files that may be unique (.local/verify-justgo)',
    key: 'keep: ignored files that may be unique (signing.key)',
  });
  assert.equal(existsSync(scratch), false);
});

test('keeps a worktree whose .local folder cannot be read', (t) => {
  const repo = fixture(t);
  const sealed = repo.add('sealed', '--detach');
  const local = path.join(sealed, '.local');
  mkdirSync(local);
  writeFileSync(path.join(local, 'run.review.md'), 'review\n');
  chmodSync(local, 0);
  try {
    assert.deepEqual(repo.run(), {
      sealed: 'keep: ignored files that may be unique (.local/)',
    });
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
  assert.deepEqual(repo.run(), {
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
  assert.deepEqual(repo.run({ open: new Set(['source']) }), {
    source: 'keep: open PR',
    picking: 'keep: a rebase, merge or bisect is in progress',
  });
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
    chatted: 'keep: used in the last day',
    'own-chat': 'keep: used in the last day',
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

test('keeps hidden edits and commits only a non-main remote branch holds', (t) => {
  const repo = fixture(t);
  const skipped = repo.add('skipped', '--detach');
  git(skipped, 'update-index', '--skip-worktree', '.gitignore');
  writeFileSync(path.join(skipped, '.gitignore'), 'local edit\n');
  const assumed = repo.add('assumed', '--detach');
  git(assumed, 'update-index', '--assume-unchanged', '.gitignore');
  writeFileSync(path.join(assumed, '.gitignore'), 'local edit\n');
  const remote = repo.add('remote', '--detach');
  commit(remote, 'pushed.txt', 'on a remote branch only\n');
  git(repo.main, 'update-ref', 'refs/remotes/origin/feature', 'HEAD');
  git(remote, 'push', '-q', '.', 'HEAD:refs/remotes/origin/feature');
  const onMain = repo.add('on-main', '--detach');
  commit(onMain, 'landed.txt', 'on origin/main\n');
  git(onMain, 'push', '-q', '.', 'HEAD:refs/remotes/origin/main');
  assert.deepEqual(repo.run(), {
    skipped: 'keep: uncommitted or untracked files',
    assumed: 'keep: uncommitted or untracked files',
    remote: 'keep: commit is on no branch',
    'on-main': 'remove',
  });
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
  const viaMain = repo.add('via-main', '--detach');
  const pastChat = repo.add('past-chat', '--detach');
  const committed = repo.add('committed', '-b', 'committed');
  commit(committed, 'today.txt', 'new\n');
  const switched = repo.add('switched', '--detach');
  // A worktree created today on an old commit is new only by its folder.
  const created = repo.add('created', '--detach');
  const createdHead = path.join(
    git(created, 'rev-parse', '--path-format=absolute', '--git-dir'),
    'HEAD',
  );
  utimesSync(createdHead, old, old);
  for (const dir of [
    repo.add('stale', '--detach'),
    chatted,
    committed,
    switched,
    viaMain,
    pastChat,
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
  // A chat started in the main checkout files its transcript there, and each
  // line names the folder its step ran in. Only a transcript from the last
  // day counts.
  const mainChats = path.join(transcriptDir(repo.main, repo.home), 'chat');
  mkdirSync(path.join(mainChats, 'subagents'), { recursive: true });
  writeFileSync(
    path.join(mainChats, 'subagents', 'agent.jsonl'),
    `${JSON.stringify({ cwd: path.join(viaMain, 'apps') })}\n`,
  );
  const past = path.join(mainChats, 'past.jsonl');
  writeFileSync(past, `${JSON.stringify({ cwd: pastChat })}\n`);
  utimesSync(past, old, old);
  // A plain git status, git gc and lock files touch the index, reflog and
  // metadata folder with no one working, so those stay recent here and must
  // not keep the worktree. The fixture's commit is also recent, so commit
  // with an old date first.
  const results = repo.run({ now: Date.now() });
  assert.equal(results.stale, 'remove');
  assert.equal(results.chatted, 'keep: used in the last day');
  assert.equal(results.committed, 'keep: used in the last day');
  assert.equal(results.switched, 'keep: used in the last day');
  assert.equal(results['via-main'], 'keep: used in the last day');
  assert.equal(results.created, 'keep: used in the last day');
  assert.equal(results['past-chat'], 'remove');
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
      openBranches: () => new Set(),
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
});
