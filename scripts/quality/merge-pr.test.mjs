import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
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
  checkState,
  maxRounds,
  parseArgs,
  refusal,
  timingFromEnv,
} from './merge-pr.mjs';

const script = fileURLToPath(new URL('./merge-pr.mjs', import.meta.url));
const sha = 'a'.repeat(40);

test('arguments need a PR number and a full head SHA', () => {
  assert.deepEqual(parseArgs(['236', '--head', sha, '--auto', '--squash']), {
    auto: true,
    disable: false,
    number: 236,
    head: sha,
  });
  assert.equal(parseArgs(['#7', `--head=${sha}`]).number, 7);
  assert.deepEqual(parseArgs(['5', '--disable-auto']), {
    auto: false,
    disable: true,
    number: 5,
  });
  assert.throws(() => parseArgs(['--head', sha]), /no PR number/);
  assert.throws(() => parseArgs(['5']), /full 40-character head SHA/);
  assert.throws(() => parseArgs(['5', '--head', 'abc123']), /full 40/);
  assert.throws(() => parseArgs(['5', '--head', sha, '--merge']), /unknown/);
  assert.throws(
    () => parseArgs(['5', '--disable-auto', '--head', sha]),
    /takes only a PR number/,
  );
});

const pr = (number, extra = {}) => ({
  number,
  title: `PR ${number}`,
  inFlight: false,
  agreedAt: undefined,
  ...extra,
});

test('breaking a PR ahead in the order is refused with its files', () => {
  const message = refusal(pr(5, { agreedAt: '2026-11-08T00:00:00Z' }), [
    { pr: pr(9, { inFlight: true }), files: ['AGENTS.md', 'a.ts'] },
    { pr: pr(2), files: ['b.ts'] },
  ]);
  assert.match(message, /#9 \(PR 9\) would conflict in AGENTS\.md, a\.ts/);
  assert.match(message, /auto-merge is armed/);
  assert.doesNotMatch(message, /#2/);
});

test('breaking only PRs behind in the order is allowed', () => {
  assert.equal(
    refusal(pr(2, { inFlight: true }), [{ pr: pr(1), files: ['a'] }]),
    undefined,
  );
  assert.equal(refusal(pr(3), [{ pr: pr(4), files: ['a'] }]), undefined);
  assert.equal(refusal(pr(3), []), undefined);
});

// The fake gh answers `pr list` from pulls.json and records `pr merge` and
// update-branch calls in calls.txt. update-branch merges main into the PR
// branch on the origin, as GitHub does, unless FAKE_FOREIGN_PUSH asks for a
// plain commit instead. Check runs come back pending FAKE_PENDING times, then
// with the conclusion FAKE_CHECKS (default success) for every required check.
// The first FAKE_MAIN_MOVES check-run reads each push a new commit to main, as
// another merge landing during the wait would.
const fakeGhSource = String.raw`
const { execFileSync } = require('node:child_process');
const { appendFileSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const dir = process.env.FAKE_GH_DIR;
const pullsFile = join(dir, 'pulls.json');
const calls = join(dir, 'calls.txt');
const origin = join(dir, 'origin.git');
const pulls = () => JSON.parse(readFileSync(pullsFile, 'utf8'));
const args = process.argv.slice(2);
const fail = (text, code = 1) => { process.stderr.write(text); process.exit(code); };
if (process.env.FAKE_GH_FAIL) fail('gh: network down');
const git = (cwd, ...rest) =>
  execFileSync('git', rest, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const path = args.find((arg) => arg.startsWith('repos/'));
let match;
if (args[0] === 'pr' && args[1] === 'list')
  process.stdout.write(readFileSync(pullsFile, 'utf8'));
else if (args[0] === 'pr' && args[1] === 'merge')
  appendFileSync(calls, args.join(' ') + '\n');
else if (args[0] === 'api' && (match = /^repos\/\{owner\}\/\{repo\}\/pulls\/(\d+)\/update-branch$/.exec(path))) {
  appendFileSync(calls, args.join(' ') + '\n');
  const list = pulls();
  const pull = list.find((one) => one.number === Number(match[1]));
  const expected = args.find((arg) => arg.startsWith('expected_head_sha=')).split('=')[1];
  if (pull.headRefOid !== expected) fail('gh: 422 expected_head_sha is not the head');
  const work = join(dir, 'gh-work');
  if (!existsSync(work)) execFileSync('git', ['clone', '-q', origin, work]);
  git(work, 'fetch', '-q', 'origin');
  git(work, 'checkout', '-q', '--detach', pull.headRefOid);
  if (process.env.FAKE_FOREIGN_PUSH) {
    writeFileSync(join(work, 'foreign.txt'), 'pushed\n');
    git(work, 'add', 'foreign.txt');
    git(work, 'commit', '-qm', 'someone else');
  } else git(work, 'merge', '-q', '--no-ff', '-m', 'Merge main', 'origin/main');
  git(work, 'push', '-q', 'origin', 'HEAD:refs/heads/' + pull.headRefName);
  pull.headRefOid = git(work, 'rev-parse', 'HEAD');
  writeFileSync(pullsFile, JSON.stringify(list));
  process.stdout.write('{"message":"Updating pull request branch."}');
} else if (args[0] === 'api' && (match = /^repos\/\{owner\}\/\{repo\}\/pulls\/(\d+)$/.exec(path)))
  process.stdout.write(pulls().find((one) => one.number === Number(match[1])).headRefOid + '\n');
else if (args[0] === 'api' && (match = /^repos\/\{owner\}\/\{repo\}\/commits\/([0-9a-f]+)\/check-runs/.exec(path))) {
  const movesFile = join(dir, 'main-moves.txt');
  const moves = existsSync(movesFile) ? Number(readFileSync(movesFile, 'utf8')) : 0;
  if (moves < Number(process.env.FAKE_MAIN_MOVES ?? 0)) {
    const mover = join(dir, 'gh-mover');
    if (!existsSync(mover)) execFileSync('git', ['clone', '-q', origin, mover]);
    git(mover, 'fetch', '-q', 'origin');
    git(mover, 'checkout', '-q', '--detach', 'origin/main');
    writeFileSync(join(mover, 'moved-' + moves + '.txt'), 'moved\n');
    git(mover, 'add', '.');
    git(mover, 'commit', '-qm', 'main moves ' + moves);
    git(mover, 'push', '-q', 'origin', 'HEAD:main');
    writeFileSync(movesFile, String(moves + 1));
  }
  const counter = join(dir, 'pending.txt');
  const seen = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0;
  writeFileSync(counter, String(seen + 1));
  const pending = seen < Number(process.env.FAKE_PENDING ?? 0);
  const runs = ['checks', 'sections', 'unit'].map((name, id) => ({
    id: id + 1,
    name,
    status: pending ? 'in_progress' : 'completed',
    conclusion: pending ? null : name === 'unit' ? 'failure' : (process.env.FAKE_CHECKS ?? 'success'),
    html_url: 'https://example.test/' + name + '/' + match[1],
  }));
  process.stdout.write(JSON.stringify(runs));
} else if (args[0] === 'api' && (match = /^repos\/\{owner\}\/\{repo\}\/commits\/([0-9a-f]+)$/.exec(path)))
  process.stdout.write(git(origin, 'rev-parse', match[1] + '^{commit}') + '\n');
else fail('unexpected ' + args.join(' '), 2);
`;

// A temporary origin with PR branches, a clone the script runs in, and the
// fake gh above on PATH.
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'merge-pr-'));
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
  // Moves main on the origin from a scratch clone, so the script's clone sees
  // the new main only when it fetches.
  const moveMain = (file, text) => {
    const other = join(dir, `main-${file}`);
    execFileSync('git', ['clone', '-q', origin, other], {
      env,
      stdio: 'ignore',
    });
    writeFileSync(join(other, file), text);
    const run = (...args) =>
      execFileSync('git', args, { cwd: other, encoding: 'utf8', env }).trim();
    run('add', file);
    run('commit', '-qm', `main changes ${file}`);
    run('push', '-q', 'origin', 'HEAD:main');
    return run('rev-parse', 'HEAD');
  };
  git('checkout', '-q', '--detach', base);
  // The clone forgets the PR heads, so the script must fetch them by commit.
  for (const name of Object.keys(heads)) {
    git('branch', '-qD', name);
    git('update-ref', '-d', `refs/remotes/origin/${name}`);
  }
  git('gc', '-q', '--prune=now');

  const bin = join(dir, 'bin');
  mkdirSync(bin);
  const pulls = join(dir, 'pulls.json');
  const calls = join(dir, 'calls.txt');
  const fakeGh = join(dir, 'fake-gh.cjs');
  writeFileSync(fakeGh, fakeGhSource);
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(fakeGh)} "$@"\n`,
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
  const run = (args, list, extraEnv = {}) => {
    writeFileSync(pulls, JSON.stringify(list));
    rmSync(calls, { force: true });
    rmSync(join(dir, 'pending.txt'), { force: true });
    rmSync(join(dir, 'main-moves.txt'), { force: true });
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: work,
      encoding: 'utf8',
      env: {
        ...env,
        FAKE_GH_DIR: dir,
        MERGE_PR_POLL_MS: '1',
        ...extraEnv,
        PATH: `${bin}:${process.env.PATH}`,
      },
    });
    const lines = existsSync(calls)
      ? readFileSync(calls, 'utf8').trim().split('\n')
      : [];
    return {
      status: result.status,
      stderr: result.stderr,
      merged: lines.filter((line) => line.startsWith('pr merge')).join('\n'),
      updates: lines.filter((line) => line.includes('update-branch')),
      head: (number) =>
        JSON.parse(readFileSync(pulls, 'utf8')).find(
          (one) => one.number === number,
        ).headRefOid,
    };
  };
  const parents = (commit) => {
    execFileSync('git', ['fetch', '-q', origin, commit], { cwd: work, env });
    return git('rev-list', '--parents', '-n', '1', commit).split(' ').slice(1);
  };
  const mainTip = () => git('ls-remote', origin, 'main').split('\t')[0];
  return { base, heads, pull, run, moveMain, parents, mainTip };
}

test('a merge that breaks an in-flight PR is refused and nothing merges', (t) => {
  const { heads, pull, run } = fixture(t);
  const result = run(
    ['1', '--head', heads.first, '--squash'],
    [
      pull(1, 'first'),
      pull(2, 'second', { autoMergeRequest: { mergeMethod: 'SQUASH' } }),
      pull(3, 'free'),
    ],
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /merging #1 now.*#2 \(PR second\) would conflict in shared\.txt/,
  );
  assert.doesNotMatch(result.stderr, /#3/);
  assert.equal(result.merged, '');
});

test('the PR first in the order merges, pinned to its head', (t) => {
  const { heads, pull, run } = fixture(t);
  const list = [pull(1, 'first'), pull(2, 'second'), pull(3, 'free')];
  const direct = run(['1', '--head', heads.first], list);
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(
    direct.merged,
    `pr merge 1 --squash --match-head-commit ${heads.first}`,
  );
  const auto = run(['3', '--head', heads.free, '--auto'], list);
  assert.equal(auto.status, 0, auto.stderr);
  assert.equal(
    auto.merged,
    `pr merge 3 --squash --auto --match-head-commit ${heads.free}`,
  );
});

test('an --auto arm that would break an earlier PR is refused', (t) => {
  const { heads, pull, run } = fixture(t);
  const result = run(
    ['2', '--head', heads.second, '--auto'],
    [pull(1, 'first'), pull(2, 'second')],
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /#1 \(PR first\).*lower number/);
  assert.equal(result.merged, '');
});

test('a merge into another branch and disarming skip the check', (t) => {
  const { heads, pull, run } = fixture(t);
  const stacked = run(
    ['2', '--head', heads.second],
    [
      pull(1, 'first', { autoMergeRequest: {} }),
      pull(2, 'second', { baseRefName: 'first' }),
    ],
  );
  assert.equal(stacked.status, 0, stacked.stderr);
  assert.match(stacked.merged, /^pr merge 2 --squash/);
  const disarm = run(['2', '--disable-auto'], []);
  assert.equal(disarm.status, 0, disarm.stderr);
  assert.equal(disarm.merged, 'pr merge 2 --disable-auto');
});

test('a PR that is not open, a bad head or a gh failure merges nothing', (t) => {
  const { heads, pull, run } = fixture(t);
  const closed = run(['9', '--head', heads.first], [pull(1, 'first')]);
  assert.equal(closed.status, 1);
  assert.match(closed.stderr, /#9 is not open/);
  const unknown = run(['1', '--head', 'f'.repeat(40)], [pull(1, 'first')]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /nothing merged/);
  const down = run(['1', '--head', heads.first], [pull(1, 'first')], {
    FAKE_GH_FAIL: '1',
  });
  assert.equal(down.status, 2);
  assert.match(down.stderr, /nothing merged.*network down/);
  for (const result of [closed, unknown, down]) assert.equal(result.merged, '');
});

const verdict = (base, head, word = 'PASS') => ({
  authorAssociation: 'OWNER',
  body: `Verifier verdict: ${word} on base \`${base.slice(0, 7)}\`, head \`${head.slice(0, 7)}\`\nSensitive: no`,
  url: 'https://example.test/verdict',
  createdAt: '2026-11-08T00:00:00Z',
});

test('a PR behind main is updated, waits for its checks and merges on the new head', (t) => {
  const { base, heads, pull, run, moveMain, parents } = fixture(t);
  const main = moveMain('later.txt', 'main moved\n');
  const result = run(
    ['1', '--head', heads.first],
    [pull(1, 'first', { comments: [verdict(base, heads.first)] })],
    { FAKE_PENDING: '2' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.updates, [
    `api -X PUT repos/{owner}/{repo}/pulls/1/update-branch -f expected_head_sha=${heads.first}`,
  ]);
  const next = result.head(1);
  assert.deepEqual(parents(next), [heads.first, main]);
  assert.match(result.stderr, /verdict on head .* carries/);
  assert.match(result.stderr, /Waiting for checks and sections/);
  assert.equal(
    result.merged,
    `pr merge 1 --squash --match-head-commit ${next}`,
  );
});

test('a verdict that does not cover the updated head stops for a fresh verifier', (t) => {
  const { base, heads, pull, run, moveMain } = fixture(t);
  moveMain('later.txt', 'main moved\n');
  const result = run(
    ['1', '--head', heads.first],
    [pull(1, 'first', { comments: [verdict(base, heads.free)] })],
  );
  assert.equal(result.status, 1);
  assert.equal(result.updates.length, 1);
  assert.match(
    result.stderr,
    new RegExp(
      `does not cover the updated head ${result.head(1)}.*shared\\.txt.*fresh verifier`,
    ),
  );
  assert.equal(result.merged, '');
});

test('failing checks on the updated head merge nothing', (t) => {
  const { base, heads, pull, run, moveMain } = fixture(t);
  moveMain('later.txt', 'main moved\n');
  const result = run(
    ['1', '--head', heads.first],
    [pull(1, 'first', { comments: [verdict(base, heads.first)] })],
    { FAKE_CHECKS: 'failure' },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /failed against the latest main.*checks failure.*sections failure/,
  );
  assert.doesNotMatch(result.stderr, /unit/);
  assert.equal(result.merged, '');
});

test('--auto on a PR behind main updates it and arms on the new head without waiting', (t) => {
  const { heads, pull, run, moveMain } = fixture(t);
  moveMain('later.txt', 'main moved\n');
  // Checks never finish, so a wait would time out.
  const result = run(
    ['1', '--head', heads.first, '--auto'],
    [pull(1, 'first')],
    {
      FAKE_PENDING: '1000',
      MERGE_PR_CHECKS_MS: '50',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.updates.length, 1);
  assert.equal(
    result.merged,
    `pr merge 1 --squash --auto --match-head-commit ${result.head(1)}`,
  );
});

test('a PR behind main with no verdict, or one that conflicts with main, is not updated', (t) => {
  const { base, heads, pull, run, moveMain } = fixture(t);
  moveMain('later.txt', 'main moved\n');
  const unverified = run(['1', '--head', heads.first], [pull(1, 'first')]);
  assert.equal(unverified.status, 1);
  assert.match(unverified.stderr, /no PASS verdict.*Nothing was updated/);
  const failing = [
    pull(1, 'first', { comments: [verdict(base, heads.first, 'FAIL')] }),
  ];
  const failed = run(['1', '--head', heads.first], failing);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /newest verdict is FAIL.*Nothing was updated/);
  // --auto skips the verdict check on update, but not a FAIL.
  const failedAuto = run(['1', '--head', heads.first, '--auto'], failing);
  assert.equal(failedAuto.status, 1);
  assert.match(
    failedAuto.stderr,
    /newest verdict is FAIL.*Nothing was updated/,
  );
  moveMain('shared.txt', 'eins\ntwo\nthree\n');
  const conflicted = run(
    ['1', '--head', heads.first],
    [pull(1, 'first', { comments: [verdict(base, heads.first)] })],
  );
  assert.equal(conflicted.status, 1);
  assert.match(conflicted.stderr, /behind main and conflicts with it/);
  for (const result of [unverified, failed, failedAuto, conflicted]) {
    assert.deepEqual(result.updates, []);
    assert.equal(result.merged, '');
  }
});

test("a head that is not GitHub's merge of main is refused", (t) => {
  const { base, heads, pull, run, moveMain } = fixture(t);
  moveMain('later.txt', 'main moved\n');
  const result = run(
    ['1', '--head', heads.first],
    [pull(1, 'first', { comments: [verdict(base, heads.first)] })],
    { FAKE_FOREIGN_PUSH: '1' },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /is not GitHub's merge of main/);
  assert.equal(result.merged, '');
});

test('main moving during the checks wait updates again and merges on the newest head', (t) => {
  const { base, heads, pull, run, moveMain, parents, mainTip } = fixture(t);
  const main = moveMain('later.txt', 'main moved\n');
  const result = run(
    ['1', '--head', heads.first],
    [pull(1, 'first', { comments: [verdict(base, heads.first)] })],
    { FAKE_MAIN_MOVES: '1' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.updates.length, 2);
  // The second update starts from the first update's head, and the final head
  // merges the main that moved during the first wait.
  const next = result.head(1);
  const [firstUpdate, movedMain] = parents(next);
  assert.deepEqual(parents(firstUpdate), [heads.first, main]);
  assert.equal(movedMain, mainTip());
  assert.notEqual(movedMain, main);
  assert.match(
    result.updates[1],
    new RegExp(`expected_head_sha=${firstUpdate}$`),
  );
  assert.equal(
    result.merged,
    `pr merge 1 --squash --match-head-commit ${next}`,
  );
});

test(`main moving during every wait stops after ${maxRounds} updates`, (t) => {
  const { base, heads, pull, run, moveMain } = fixture(t);
  moveMain('later.txt', 'main moved\n');
  const result = run(
    ['1', '--head', heads.first],
    [pull(1, 'first', { comments: [verdict(base, heads.first)] })],
    { FAKE_MAIN_MOVES: '1000' },
  );
  assert.equal(result.status, 1);
  assert.equal(result.updates.length, maxRounds);
  assert.match(
    result.stderr,
    new RegExp(`main moved during each of ${maxRounds} updates of #1`),
  );
  assert.equal(result.merged, '');
});

test('a wait setting that is not a positive number fails before any call', (t) => {
  assert.deepEqual(timingFromEnv({}), {
    pollMs: 15000,
    updateMs: 120000,
    checksMs: 2700000,
  });
  assert.equal(timingFromEnv({ MERGE_PR_POLL_MS: '5' }).pollMs, 5);
  for (const value of ['abc', '', '0', '-1', 'Infinity'])
    assert.throws(
      () => timingFromEnv({ MERGE_PR_CHECKS_MS: value }),
      /MERGE_PR_CHECKS_MS must be a positive number/,
    );
  const { heads, pull, run } = fixture(t);
  const result = run(['1', '--head', heads.first], [pull(1, 'first')], {
    MERGE_PR_UPDATE_MS: 'abc',
  });
  assert.equal(result.status, 2);
  assert.match(
    result.stderr,
    /nothing merged.*MERGE_PR_UPDATE_MS must be a positive number.*"abc"/,
  );
  assert.deepEqual(result.updates, []);
  assert.equal(result.merged, '');
});

test('check state reads the newest run of each required check', () => {
  const runs = (conclusion, status = 'completed') => [
    { id: 1, name: 'checks', status: 'completed', conclusion: 'failure' },
    { id: 2, name: 'checks', status, conclusion, html_url: 'u' },
    { id: 3, name: 'sections', status: 'completed', conclusion: 'success' },
    { id: 4, name: 'unit', status: 'completed', conclusion: 'failure' },
  ];
  assert.equal(checkState(runs('success')), 'pass');
  assert.equal(checkState(runs('skipped')), 'pass');
  assert.equal(checkState(runs(null, 'in_progress')), 'pending');
  assert.equal(checkState(runs('success').slice(1, 2)), 'pending');
  assert.deepEqual(checkState(runs('cancelled')), {
    failed: ['checks cancelled (u)'],
  });
});

test('the root package runs the script as merge:pr', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url)),
  );
  assert.equal(
    manifest.scripts['merge:pr'],
    'node scripts/quality/merge-pr.mjs',
  );
});
