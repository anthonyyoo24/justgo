import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  plan,
  report,
  touchesSessionConfig,
  triggerOf,
} from '../../.claude/hooks/sync-main.mjs';

const hook = fileURLToPath(
  new URL('../../.claude/hooks/sync-main.mjs', import.meta.url),
);
const restart =
  /^Updated main to [0-9a-f]{7,}; restart this session to load the new hooks and settings\.$/;

function git(cwd, ...args) {
  return execFileSync(
    'git',
    [
      '-c',
      'user.name=Sync Test',
      '-c',
      'user.email=sync@example.test',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

function commit(cwd, file, text) {
  mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  writeFileSync(path.join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', `change ${file}`);
}

// An origin, an author clone that pushes, and a checkout that falls behind.
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'sync-main-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = path.join(root, 'origin.git');
  const author = path.join(root, 'author');
  const checkout = path.join(root, 'checkout');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, author);
  git(author, 'checkout', '-q', '-b', 'main');
  commit(author, 'README.md', 'one\n');
  git(author, 'push', '-q', 'origin', 'main');
  git(root, 'clone', '-q', origin, checkout);
  return {
    root,
    origin,
    author,
    checkout,
    push(file, text) {
      commit(author, file, text);
      git(author, 'push', '-q', 'origin', 'main');
      return git(author, 'rev-parse', 'HEAD');
    },
  };
}

const sessionStart = { hook_event_name: 'SessionStart', source: 'startup' };
const beforeAgent = {
  hook_event_name: 'PreToolUse',
  tool_name: 'Agent',
  tool_input: { description: 'Build it', prompt: 'Build it.' },
};
const beforeBash = (command) => ({
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command },
});

function runHook(dir, event = sessionStart) {
  const result = spawnSync(process.execPath, [hook], {
    cwd: dir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    input: JSON.stringify(event),
    encoding: 'utf8',
    timeout: 20_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  if (result.stdout === '') return undefined;
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, event.hook_event_name);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, undefined);
  assert.equal(
    parsed.hookSpecificOutput.additionalContext,
    parsed.systemMessage,
  );
  return parsed.systemMessage;
}

const ageStamp = (repo, seconds) => {
  const stamp = path.join(repo.checkout, '.git', 'sync-main-fetched');
  const then = new Date(Date.now() - seconds * 1000);
  utimesSync(stamp, then, then);
};

const head = (dir) => git(dir, 'rev-parse', 'HEAD');

test('an up-to-date main checkout prints nothing', (t) => {
  const repo = fixture(t);
  const before = head(repo.checkout);
  assert.equal(runHook(repo.checkout), undefined);
  assert.equal(head(repo.checkout), before);
});

test('a clean main checkout that is behind fast-forwards and asks for a restart when .claude changed', (t) => {
  const repo = fixture(t);
  repo.push('README.md', 'two\n');
  const tip = repo.push('.claude/settings.json', '{}\n');
  const line = runHook(repo.checkout);
  assert.match(line, restart);
  assert.ok(tip.startsWith(line.match(/to ([0-9a-f]+);/)[1]));
  assert.equal(head(repo.checkout), tip);
});

test('a restart is asked for when AGENTS.md or CLAUDE.md changed', (t) => {
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    const repo = fixture(t);
    const tip = repo.push(file, 'rules\n');
    assert.match(runHook(repo.checkout), restart, file);
    assert.equal(head(repo.checkout), tip, file);
  }
});

test('a fast-forward that changes no session config prints nothing', (t) => {
  const repo = fixture(t);
  const tip = repo.push('apps/mobile/app.ts', 'export {};\n');
  assert.equal(runHook(repo.checkout), undefined);
  assert.equal(head(repo.checkout), tip);
});

test('tracked changes keep the checkout where it is and warn', (t) => {
  const repo = fixture(t);
  repo.push('.claude/settings.json', '{}\n');
  repo.push('README.md', 'two\n');
  const before = head(repo.checkout);
  writeFileSync(path.join(repo.checkout, 'README.md'), 'local edit\n');
  assert.equal(
    runHook(repo.checkout),
    'This folder is 2 commits behind origin/main; not updated because it has uncommitted changes to tracked files.',
  );
  assert.equal(head(repo.checkout), before);
  assert.equal(
    readFileSync(path.join(repo.checkout, 'README.md'), 'utf8'),
    'local edit\n',
  );
});

test('untracked files alone do not stop the fast-forward and are kept', (t) => {
  const repo = fixture(t);
  const tip = repo.push('.claude/hooks/new.mjs', 'export {};\n');
  writeFileSync(path.join(repo.checkout, 'scratch.txt'), 'mine\n');
  assert.match(runHook(repo.checkout), restart);
  assert.equal(head(repo.checkout), tip);
  assert.equal(
    readFileSync(path.join(repo.checkout, 'scratch.txt'), 'utf8'),
    'mine\n',
  );
});

test('a linked worktree is left alone and prints nothing', (t) => {
  const repo = fixture(t);
  repo.push('.claude/settings.json', '{}\n');
  git(repo.checkout, 'checkout', '-q', '-b', 'other');
  const worktree = path.join(repo.root, 'worktree');
  git(repo.checkout, 'worktree', 'add', '-q', worktree, 'main');
  const before = head(worktree);
  assert.equal(runHook(worktree), undefined);
  assert.equal(head(worktree), before);
});

test('a failed fetch prints nothing and changes nothing', (t) => {
  const repo = fixture(t);
  repo.push('.claude/settings.json', '{}\n');
  git(repo.checkout, 'fetch', '-q', 'origin');
  git(
    repo.checkout,
    'remote',
    'set-url',
    'origin',
    path.join(repo.root, 'missing.git'),
  );
  const before = head(repo.checkout);
  assert.equal(runHook(repo.checkout), undefined);
  assert.equal(head(repo.checkout), before);
});

test('a main checkout on another branch is not updated and warns', (t) => {
  const repo = fixture(t);
  git(repo.checkout, 'checkout', '-q', '-b', 'feature');
  repo.push('.claude/settings.json', '{}\n');
  const before = head(repo.checkout);
  assert.equal(
    runHook(repo.checkout),
    'This folder is 1 commit behind origin/main; not updated because it is on branch feature, not main.',
  );
  assert.equal(head(repo.checkout), before);
  assert.equal(git(repo.checkout, 'branch', '--show-current'), 'feature');
});

test('a main with local commits cannot fast-forward and warns', (t) => {
  const repo = fixture(t);
  repo.push('.claude/settings.json', '{}\n');
  commit(repo.checkout, 'local.md', 'local\n');
  const before = head(repo.checkout);
  assert.equal(
    runHook(repo.checkout),
    'This folder is 1 commit behind origin/main; not updated because main has 1 commit that origin/main lacks.',
  );
  assert.equal(head(repo.checkout), before);
});

test('a folder outside git prints nothing', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'sync-main-plain-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(runHook(root), undefined);
});

test('before an Agent call a clean main checkout fast-forwards and asks for a restart when .claude changed', (t) => {
  const repo = fixture(t);
  repo.push('README.md', 'two\n');
  const tip = repo.push('.claude/hooks/new.mjs', 'export {};\n');
  assert.match(runHook(repo.checkout, beforeAgent), restart);
  assert.equal(head(repo.checkout), tip);
});

test('before an Agent call an up-to-date or offline checkout prints nothing', (t) => {
  const repo = fixture(t);
  const before = head(repo.checkout);
  assert.equal(runHook(repo.checkout, beforeAgent), undefined);
  repo.push('.claude/settings.json', '{}\n');
  git(
    repo.checkout,
    'remote',
    'set-url',
    'origin',
    path.join(repo.root, 'missing.git'),
  );
  ageStamp(repo, 61);
  assert.equal(runHook(repo.checkout, beforeAgent), undefined);
  assert.equal(head(repo.checkout), before);
});

test('before an Agent call a dirty or non-main checkout is left alone without a warning', (t) => {
  const repo = fixture(t);
  repo.push('.claude/settings.json', '{}\n');
  const before = head(repo.checkout);
  writeFileSync(path.join(repo.checkout, 'README.md'), 'local edit\n');
  assert.equal(runHook(repo.checkout, beforeAgent), undefined);
  assert.equal(head(repo.checkout), before);
  assert.equal(
    readFileSync(path.join(repo.checkout, 'README.md'), 'utf8'),
    'local edit\n',
  );
  git(repo.checkout, 'checkout', '-q', 'README.md');
  git(repo.checkout, 'checkout', '-q', '-b', 'feature');
  assert.equal(runHook(repo.checkout, beforeAgent), undefined);
  assert.equal(head(repo.checkout), before);
  assert.equal(git(repo.checkout, 'branch', '--show-current'), 'feature');
});

test('a second tool call within a minute skips the fetch but still fast-forwards to what was fetched', (t) => {
  const repo = fixture(t);
  assert.equal(runHook(repo.checkout, beforeAgent), undefined);
  const unfetched = repo.push('.claude/settings.json', '{}\n');
  const before = head(repo.checkout);
  assert.equal(runHook(repo.checkout, beforeAgent), undefined);
  assert.equal(head(repo.checkout), before, 'second call did not fetch');
  git(repo.checkout, 'fetch', '-q', 'origin');
  assert.match(runHook(repo.checkout, beforeAgent), restart);
  assert.equal(head(repo.checkout), unfetched);
  const later = repo.push('apps/mobile/app.ts', 'export {};\n');
  ageStamp(repo, 61);
  assert.equal(runHook(repo.checkout, beforeAgent), undefined);
  assert.equal(head(repo.checkout), later, 'fetches again after a minute');
});

test('session start always fetches, even right after a tool call did', (t) => {
  const repo = fixture(t);
  assert.equal(runHook(repo.checkout, beforeAgent), undefined);
  const tip = repo.push('AGENTS.md', 'rules\n');
  assert.match(runHook(repo.checkout), restart);
  assert.equal(head(repo.checkout), tip);
});

test('a Bash git worktree add syncs first, and other Bash commands do not', (t) => {
  const repo = fixture(t);
  const tip = repo.push('.claude/settings.json', '{}\n');
  const before = head(repo.checkout);
  assert.equal(
    runHook(repo.checkout, beforeBash('git fetch -q && git status')),
    undefined,
  );
  assert.equal(head(repo.checkout), before);
  assert.match(
    runHook(
      repo.checkout,
      beforeBash(
        'git -C "$HOME/justgo" worktree add .claude/worktrees/x -b x origin/main',
      ),
    ),
    restart,
  );
  assert.equal(head(repo.checkout), tip);
});

test('the trigger is session start, an Agent call or a worktree add', () => {
  assert.deepEqual(triggerOf(sessionStart), {
    event: 'SessionStart',
    fetchEvery: 0,
    warns: true,
  });
  const beforeTool = { event: 'PreToolUse', fetchEvery: 60_000, warns: false };
  assert.deepEqual(triggerOf(beforeAgent), beforeTool);
  for (const command of [
    'git worktree add ../w -b w origin/main',
    'cd /repo && git fetch -q && git -C /repo worktree add .claude/worktrees/a -b a origin/main',
    'GIT_DIR=x git -c core.x=1 worktree add w',
    // #345 item 3
    'if true; then git worktree add w; fi',
    'for b in a; do git worktree add "$b"; done',
    'env GIT_DIR=x git worktree add w',
    'time git worktree add w',
    '/usr/bin/git worktree add w',
    'echo $(git -C /repo worktree add w)',
    'git --work-tree /repo worktree add w',
    '(git worktree add w)',
  ])
    assert.deepEqual(triggerOf(beforeBash(command)), beforeTool, command);
  for (const command of [
    'git worktree list',
    'git worktree remove w',
    "grep -n 'git worktree add' AGENTS.md",
    'echo "git worktree add w"',
    'git commit -m "git worktree add"',
    'git --work-tree /repo worktree list',
    'legit worktree add w',
  ])
    assert.equal(triggerOf(beforeBash(command)), undefined, command);
  assert.equal(
    triggerOf({ hook_event_name: 'PreToolUse', tool_name: 'Read' }),
    undefined,
  );
  assert.equal(triggerOf({ hook_event_name: 'Stop' }), undefined);
});

test('the plan acts only on a clean main checkout that is behind', () => {
  const base = {
    linkedWorktree: false,
    fetched: true,
    branch: 'main',
    behind: 3,
    ahead: 0,
    dirty: false,
  };
  assert.deepEqual(plan(base), { action: 'ff' });
  assert.deepEqual(plan({ ...base, linkedWorktree: true }), { action: 'none' });
  assert.deepEqual(plan({ ...base, fetched: false }), { action: 'none' });
  assert.deepEqual(plan({ ...base, behind: 0 }), { action: 'none' });
  assert.deepEqual(plan({ ...base, behind: 0, dirty: true }), {
    action: 'none',
  });
  assert.deepEqual(plan({ ...base, dirty: true }), {
    action: 'warn',
    behind: 3,
    reason: 'it has uncommitted changes to tracked files',
  });
  assert.deepEqual(plan({ ...base, branch: '' }), {
    action: 'warn',
    behind: 3,
    reason: 'HEAD is detached, not on main',
  });
  assert.deepEqual(plan({ ...base, ahead: 2 }), {
    action: 'warn',
    behind: 3,
    reason: 'main has 2 commits that origin/main lacks',
  });
});

test('the report names a restart only for session config changes', () => {
  assert.equal(report({ action: 'none' }), undefined);
  assert.equal(
    report({ action: 'updated', sha: 'abc1234', paths: ['apps/a.ts'] }),
    undefined,
  );
  assert.equal(
    report({ action: 'updated', sha: 'abc1234', paths: ['.claude/x.mjs'] }),
    'Updated main to abc1234; restart this session to load the new hooks and settings.',
  );
  assert.equal(
    report({ action: 'warn', behind: 1, reason: 'the fast-forward failed' }),
    'This folder is 1 commit behind origin/main; not updated because the fast-forward failed.',
  );
  assert.equal(touchesSessionConfig(['AGENTS.md']), true);
  assert.equal(touchesSessionConfig(['CLAUDE.md']), true);
  assert.equal(touchesSessionConfig(['.claude/settings.json']), true);
  assert.equal(
    touchesSessionConfig(['docs/AGENTS.md', '.claudeignore']),
    false,
  );
});

test('settings run the hook at session start without blocking it', () => {
  const settings = JSON.parse(
    readFileSync(new URL('../../.claude/settings.json', import.meta.url)),
  );
  const hooks = settings.hooks.SessionStart.flatMap((entry) => entry.hooks);
  const entry = hooks.find((h) => h.command.includes('sync-main.mjs'));
  assert.ok(entry, 'SessionStart runs sync-main.mjs');
  assert.equal(entry.type, 'command');
  assert.ok(entry.timeout > 0 && entry.timeout <= 10, 'short timeout');
  assert.equal(entry.onFailure, undefined, 'never blocks a session');
});

test('settings run the hook before Agent and Bash calls without blocking them', () => {
  const settings = JSON.parse(
    readFileSync(new URL('../../.claude/settings.json', import.meta.url)),
  );
  for (const tool of ['Agent', 'Bash']) {
    const hooks = settings.hooks.PreToolUse.filter((entry) =>
      new RegExp(`^(?:${entry.matcher})$`).test(tool),
    ).flatMap((entry) => entry.hooks);
    const entry = hooks.find((h) => h.command.includes('sync-main.mjs'));
    assert.ok(entry, `PreToolUse ${tool} runs sync-main.mjs`);
    assert.ok(entry.timeout > 0 && entry.timeout <= 10, 'short timeout');
    assert.equal(entry.onFailure, undefined, 'never blocks a tool call');
  }
});
