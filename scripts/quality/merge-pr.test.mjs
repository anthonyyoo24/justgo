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
import { parseArgs, refusal } from './merge-pr.mjs';

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

// A temporary origin with PR branches, a clone the script runs in, and a fake
// gh on PATH that answers `pr list` from a JSON file and records `pr merge`.
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
  writeFileSync(
    join(bin, 'gh'),
    `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require('node:fs');
const args = process.argv.slice(2);
if (process.env.FAKE_GH_FAIL) { process.stderr.write('gh: network down'); process.exit(1); }
if (args[0] === 'pr' && args[1] === 'list')
  process.stdout.write(readFileSync(${JSON.stringify(pulls)}, 'utf8'));
else if (args[0] === 'pr' && args[1] === 'merge')
  appendFileSync(${JSON.stringify(calls)}, args.join(' ') + '\\n');
else { process.stderr.write('unexpected ' + args.join(' ')); process.exit(2); }
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
  const run = (args, list, extraEnv = {}) => {
    writeFileSync(pulls, JSON.stringify(list));
    rmSync(calls, { force: true });
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: work,
      encoding: 'utf8',
      env: { ...env, ...extraEnv, PATH: `${bin}:${process.env.PATH}` },
    });
    return {
      status: result.status,
      stderr: result.stderr,
      merged: existsSync(calls) ? readFileSync(calls, 'utf8').trim() : '',
    };
  };
  return { heads, pull, run };
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

test('the root package runs the script as merge:pr', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url)),
  );
  assert.equal(
    manifest.scripts['merge:pr'],
    'node scripts/quality/merge-pr.mjs',
  );
});
