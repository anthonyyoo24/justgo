import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  decide,
  mergeTargets,
  numberOf,
  visibleText,
} from '../../.claude/hooks/merge-order-guard.mjs';
import { byPriority } from './merge-order.mjs';

const hook = fileURLToPath(
  new URL('../../.claude/hooks/merge-order-guard.mjs', import.meta.url),
);

const selectors = (command) =>
  mergeTargets(command).map(({ selector, computed }) =>
    computed ? `computed:${selector}` : selector,
  );

test('gh pr merge calls are found with their PR selector', () => {
  assert.deepEqual(selectors('gh pr merge 214 --squash'), ['214']);
  assert.deepEqual(
    selectors(
      'gh pr merge --auto --squash --match-head-commit abc123 -t "x y" 12',
    ),
    ['12'],
  );
  assert.deepEqual(
    selectors('git fetch && gh pr merge https://github.com/o/r/pull/9 -s'),
    ['https://github.com/o/r/pull/9'],
  );
  assert.deepEqual(selectors('gh pr merge --squash'), [undefined]);
  assert.deepEqual(selectors('gh pr merge --squash; ls'), [undefined]);
  assert.deepEqual(selectors('gh pr merge 3 --disable-auto'), []);
  assert.deepEqual(selectors('gh pr view 3 && git merge main'), []);
  assert.deepEqual(selectors('ls'), []);
});

test('merges inside loops, substitutions, prefixes and other shells are found', () => {
  for (const [command, expected] of [
    ['for n in 207; do gh pr merge $n; done', ['computed:$n']],
    ['for n in 1 2; do gh pr merge "${n}" --squash; done', ['computed:${n}']],
    ['if true; then gh pr merge 207; fi', ['207']],
    ['{ gh pr merge 207; }', ['207']],
    ['env X=y gh pr merge 207', ['207']],
    ['GH_DEBUG=1 gh pr merge 8 --auto', ['8']],
    ['command gh pr merge 207', ['207']],
    ['timeout 60 gh pr merge 207', ['207']],
    ['/opt/homebrew/bin/gh pr merge 207', ['207']],
    ["bash -c 'gh pr merge 207 --squash'", ['207']],
    ['x="$(gh pr merge 207)"', ['207']],
    ['x=`gh pr merge 207`', ['207']],
    ['gh pr merge $(gh pr list -q .[0].number)', ['computed:$(gh']],
    ['git status; gh pr merge 9 && echo done', ['9']],
    ['gh pr \\\nmerge 207', ['207']],
    ['gh pr merge \\\n  236 --squash', ['236']],
    ['gh pr merge 1 && gh pr merge 2', ['1', '2']],
  ])
    assert.deepEqual(selectors(command), expected, command);
});

test('gh -R and URLs name the repository', () => {
  assert.deepEqual(mergeTargets('gh -R a/b pr merge 207'), [
    { selector: '207', repo: 'a/b', computed: false },
  ]);
  assert.equal(mergeTargets('gh pr merge 5 --repo=c/d')[0].repo, 'c/d');
  assert.equal(
    mergeTargets('gh pr merge https://github.com/o/r/pull/9')[0].repo,
    'o/r',
  );
});

test('heredoc bodies, full-line comments and placeholders are not merges', () => {
  const body = [
    "gh pr comment 5 --body-file - <<'EOF'",
    'Arm it with gh pr merge 12 --auto --squash',
    'After gh pr merge 214 --squash landed.',
    'EOF',
  ].join('\n');
  assert.deepEqual(selectors(body), []);
  for (const command of [
    'cat <<EOF\ngh pr merge 3\nEOF',
    'cat <<\\EOF\ngh pr merge 3\nEOF',
    'cat <<-"END"\ngh pr merge 3\n\tEND',
    'cat <<A <<B\ngh pr merge 1\nA\ngh pr merge 2\nB',
    'git commit -m "$(cat <<\'EOF\'\nsay "gh pr merge 5\nEOF\n)"',
    '# gh pr merge 5',
    '  # gh pr merge 5',
    'echo "Arm it with gh pr merge <n> --auto"',
  ])
    assert.deepEqual(selectors(command), [], command);
});

test('a merge after a heredoc, here-string, arithmetic or open heredoc is found', () => {
  for (const command of [
    "cat > notes <<'EOF'\nDon't forget\nEOF\ngh pr merge 207 --squash",
    "# don't skip this\ngh pr merge 207 --squash",
    'grep x <<< $foo\ngh pr merge 207',
    'grep x <<<word; gh pr merge 207',
    'echo $((1<<2)); gh pr merge 207',
    'echo $((1 << x))\ngh pr merge 207',
    'cat <<EOF\nno closing line\ngh pr merge 207',
    'bash <<EOF\ngh pr merge 207\nEOF',
  ])
    assert.deepEqual(selectors(command), ['207'], command);
});

test('visible text joins continuations and drops only what cannot run', () => {
  assert.equal(visibleText('a \\\nb'), 'a  b');
  assert.equal(visibleText('# c\nx\ncat <<E\nbody\nE\ny'), 'x\ncat <<E\ny');
});

test('PR numbers come from numbers and URLs only', () => {
  assert.equal(numberOf('214'), 214);
  assert.equal(numberOf('#7'), 7);
  assert.equal(numberOf('https://github.com/o/r/pull/9'), 9);
  assert.equal(numberOf('feature/branch'), undefined);
  assert.equal(numberOf(undefined), undefined);
});

const pr = (number, extra = {}) => ({
  number,
  title: `PR ${number}`,
  inFlight: false,
  agreedAt: undefined,
  ...extra,
});

test('breaking a PR ahead in the order is denied with its files', () => {
  const decision = decide(
    pr(5, { agreedAt: '2026-11-08T00:00:00Z' }),
    [
      { pr: pr(9, { inFlight: true }), files: ['AGENTS.md', 'a.ts'] },
      { pr: pr(2), files: ['b.ts'] },
    ],
    byPriority,
  );
  assert.equal(decision?.permissionDecision, 'deny');
  assert.match(
    decision.reason,
    /#9 \(PR 9\) would conflict in AGENTS\.md, a\.ts/,
  );
  assert.match(decision.reason, /auto-merge is armed/);
  assert.doesNotMatch(decision.reason, /#2/);
});

test('breaking only PRs behind in the order is allowed', () => {
  assert.equal(
    decide(
      pr(2, { inFlight: true }),
      [{ pr: pr(1), files: ['a'] }],
      byPriority,
    ),
    undefined,
  );
  assert.equal(
    decide(pr(3), [{ pr: pr(4), files: ['a'] }], byPriority),
    undefined,
  );
  assert.equal(decide(pr(3), [], byPriority), undefined);
});

// A temporary origin with PR heads, a clone the hook runs in, and a fake gh
// on PATH that answers from a JSON file.
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'merge-order-guard-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
  };
  const origin = join(dir, 'origin.git');
  const work = join(dir, 'work');
  const git = (...args) =>
    execFileSync('git', args, { cwd: work, encoding: 'utf8', env }).trim();
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin]);
  execFileSync('git', ['clone', '-q', origin, work], { env, stdio: 'ignore' });
  const write = (file, text) => writeFileSync(join(work, file), text);
  write('shared.txt', 'one\ntwo\nthree\n');
  write('free.txt', 'free\n');
  git('add', '.');
  git('commit', '-qm', 'base');
  git('push', '-q', 'origin', 'HEAD:main');
  const base = git('rev-parse', 'HEAD');
  const branch = (name, file, text) => {
    git('checkout', '-q', '-B', name, base);
    write(file, text);
    git('commit', '-qam', name);
    git('push', '-q', 'origin', `HEAD:${name}`);
    return git('rev-parse', 'HEAD');
  };
  const heads = {
    first: branch('first', 'shared.txt', 'ONE\ntwo\nthree\n'),
    second: branch('second', 'shared.txt', 'uno\ntwo\nthree\n'),
    free: branch('free', 'free.txt', 'changed\n'),
  };
  git('checkout', '-q', '--detach', base);
  // The clone forgets the branch heads, so the hook must fetch them by commit.
  for (const name of Object.keys(heads)) git('branch', '-qD', name);
  git('update-ref', '-d', 'refs/remotes/origin/first');
  git('update-ref', '-d', 'refs/remotes/origin/second');
  git('update-ref', '-d', 'refs/remotes/origin/free');
  git('gc', '-q', '--prune=now');

  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const pulls = join(dir, 'pulls.json');
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env node
const { readFileSync } = require('node:fs');
const args = process.argv.slice(2);
if (process.env.FAKE_GH_FAIL) { process.stderr.write('gh: network down'); process.exit(1); }
const pulls = JSON.parse(readFileSync(${JSON.stringify(pulls)}, 'utf8'));
if (args[0] === 'pr' && args[1] === 'list') process.stdout.write(JSON.stringify(pulls));
else if (args[0] === 'pr' && args[1] === 'view') {
  const named = args[2] && !args[2].startsWith('-') ? args[2] : 'first';
  const pull = pulls.find((p) => p.headRefName === named || String(p.number) === named);
  if (!pull) { process.stderr.write('no pull'); process.exit(1); }
  process.stdout.write(JSON.stringify({ number: pull.number }));
} else { process.stderr.write('unexpected ' + args.join(' ')); process.exit(2); }
`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  const pull = (number, name, extra = {}) => ({
    number,
    title: `PR ${name}`,
    baseRefName: 'main',
    headRefName: name,
    headRefOid: heads[name],
    isDraft: false,
    autoMergeRequest: null,
    comments: [],
    ...extra,
  });
  const run = (command, list, extraEnv = {}) => {
    writeFileSync(pulls, JSON.stringify(list));
    const result = spawnSync(process.execPath, [hook], {
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command },
        cwd: work,
      }),
      encoding: 'utf8',
      env: { ...env, ...extraEnv, PATH: `${bin}:${process.env.PATH}` },
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout
      ? JSON.parse(result.stdout).hookSpecificOutput
      : undefined;
  };
  return { pull, run };
}

test('the hook denies a merge that breaks an in-flight PR', (t) => {
  const { pull, run } = fixture(t);
  const decision = run('gh pr merge 1 --squash', [
    pull(1, 'first'),
    pull(2, 'second', { autoMergeRequest: { mergeMethod: 'SQUASH' } }),
    pull(3, 'free'),
  ]);
  assert.equal(decision?.permissionDecision, 'deny');
  assert.match(
    decision.permissionDecisionReason,
    /merging #1 now.*#2 \(PR second\) would conflict in shared\.txt/,
  );
  assert.doesNotMatch(decision.permissionDecisionReason, /#3/);
});

test('the hook allows the PR that is first in the order', (t) => {
  const { pull, run } = fixture(t);
  const list = [pull(1, 'first'), pull(2, 'second'), pull(3, 'free')];
  assert.equal(run('gh pr merge 1 --squash', list), undefined);
  assert.equal(run('gh pr merge --auto --squash 3', list), undefined);
  // No selector means the current branch's PR, resolved through gh pr view.
  assert.equal(run('gh pr merge --squash', list), undefined);
});

test('the hook resolves a branch selector and denies when it breaks an earlier PR', (t) => {
  const { pull, run } = fixture(t);
  const decision = run('gh pr merge second --squash', [
    pull(1, 'first'),
    pull(2, 'second'),
  ]);
  assert.equal(decision?.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /#1 \(PR first\)/);
});

test('the hook allows a merge of a PR that is not open', (t) => {
  const { pull, run } = fixture(t);
  assert.equal(run('gh pr merge 99 --squash', [pull(1, 'first')]), undefined);
});

test('the hook denies a computed selector before calling gh', (t) => {
  const { run } = fixture(t);
  const decision = run('for n in 1 2; do gh pr merge $n --squash; done', [], {
    FAKE_GH_FAIL: '1',
  });
  assert.equal(decision?.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /variable or substitution/);
});

test('the hook leaves another repository to GitHub', (t) => {
  const { run } = fixture(t);
  assert.equal(
    run('gh -R someone/else pr merge 1', [], { FAKE_GH_FAIL: '1' }),
    undefined,
  );
});

test('the hook checks every merge in one command', (t) => {
  const { pull, run } = fixture(t);
  const decision = run('gh pr merge 3 && gh pr merge 1 --squash', [
    pull(1, 'first'),
    pull(2, 'second', { autoMergeRequest: { mergeMethod: 'SQUASH' } }),
    pull(3, 'free'),
  ]);
  assert.equal(decision?.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /merging #1 now/);
});

test('the hook leaves merges into other branches to GitHub', (t) => {
  const { pull, run } = fixture(t);
  assert.equal(
    run('gh pr merge 2 --squash', [
      pull(1, 'first', { autoMergeRequest: {} }),
      pull(2, 'second', { baseRefName: 'first' }),
    ]),
    undefined,
  );
});

test('the hook fails closed when gh fails', (t) => {
  const { pull, run } = fixture(t);
  const decision = run('gh pr merge 1 --squash', [pull(1, 'first')], {
    FAKE_GH_FAIL: '1',
  });
  assert.equal(decision?.permissionDecision, 'deny');
  assert.match(
    decision.permissionDecisionReason,
    /could not check.*network down/,
  );
});

test('the hook ignores other commands and tools without calling gh', (t) => {
  const { run } = fixture(t);
  assert.equal(run('git status', [], { FAKE_GH_FAIL: '1' }), undefined);
  assert.equal(
    run('gh pr merge 1 --disable-auto', [], { FAKE_GH_FAIL: '1' }),
    undefined,
  );
  const other = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({ tool_name: 'Agent', tool_input: {} }),
    encoding: 'utf8',
  });
  assert.equal(other.stdout, '');
});

test('settings run the guard on Bash and block when it fails', () => {
  const settings = JSON.parse(
    readFileSync(new URL('../../.claude/settings.json', import.meta.url)),
  );
  const entry = settings.hooks.PreToolUse.find(({ hooks }) =>
    hooks[0]?.command.includes('merge-order-guard.mjs'),
  );
  assert.ok(entry, 'no PreToolUse entry runs merge-order-guard.mjs');
  assert.equal(entry.matcher, 'Bash');
  assert.equal(entry.hooks[0].onFailure, 'block');
});
