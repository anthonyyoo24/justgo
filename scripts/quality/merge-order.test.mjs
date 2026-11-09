import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { changedPaths, mergeTree } from './git.mjs';
import {
  agreementOf,
  byPriority,
  describe,
  format,
  overlaps,
  plan,
} from './merge-order.mjs';

const pr = (number, files, extra = {}) => ({
  number,
  title: `PR ${number}`,
  base: 'main',
  branch: `branch-${number}`,
  head: `${number}`.padEnd(40, '0'),
  draft: false,
  inFlight: false,
  agreedAt: undefined,
  agreedStale: false,
  files,
  ...extra,
});

test('PRs that share a file are paired with the shared files', () => {
  assert.deepEqual(
    overlaps([pr(1, ['a', 'b']), pr(2, ['b', 'c']), pr(3, ['d'])]),
    [{ a: 1, b: 2, files: ['b'] }],
  );
});

test('sharing PRs merge one at a time and disjoint PRs in any order', () => {
  const result = plan([
    pr(5, ['x']),
    pr(4, ['a']),
    pr(3, ['b']),
    pr(2, ['a', 'b']),
  ]);
  // 4 and 3 share nothing, but each shares a file with 2, so all three wait
  // for each other.
  assert.deepEqual(result.sequences, [[2, 3, 4]]);
  assert.deepEqual(result.independent, [5]);
});

test('in-flight PRs go first, then the earliest PASS, then the lowest number', () => {
  const prs = [
    pr(1, ['a']),
    pr(2, ['a'], { agreedAt: '2026-11-08T10:00:00Z' }),
    pr(3, ['a'], { agreedAt: '2026-11-07T10:00:00Z' }),
    pr(4, ['a'], { inFlight: true }),
    pr(5, ['a']),
  ];
  assert.deepEqual(plan(prs).sequences, [[4, 3, 2, 1, 5]]);
  assert.ok(byPriority(prs[3], prs[2]) < 0);
  assert.ok(byPriority(prs[0], prs[4]) < 0);
});

test('a stacked PR waits for the PR it targets and is not paired', () => {
  const result = plan([
    pr(1, ['a']),
    pr(2, ['a'], { base: 'branch-1' }),
    pr(3, ['a'], { base: 'gone' }),
  ]);
  assert.deepEqual(result.stacked, [
    { number: 2, after: 1, base: 'branch-1' },
    { number: 3, after: undefined, base: 'gone' },
  ]);
  assert.deepEqual(result.pairs, []);
  assert.deepEqual(result.independent, [1]);
});

const verdictComment = (verdict, head, createdAt, association = 'OWNER') => ({
  authorAssociation: association,
  body: `Verifier verdict: ${verdict} on base \`abc1234\`, head \`${head}\`\nSensitive: no`,
  url: `https://example.test/${createdAt}`,
  createdAt,
});

test('agreement is the newest owner PASS and its time', () => {
  assert.deepEqual(
    agreementOf([verdictComment('PASS', 'def5678', '2026-11-08T01:00:00Z')]),
    { at: '2026-11-08T01:00:00Z', head: 'def5678' },
  );
  assert.equal(
    agreementOf([
      verdictComment('PASS', 'def5678', '2026-11-08T01:00:00Z'),
      verdictComment('FAIL', 'def5678', '2026-11-08T02:00:00Z'),
    ]),
    undefined,
  );
  assert.equal(
    agreementOf([
      verdictComment('PASS', 'def5678', '2026-11-08T01:00:00Z', 'NONE'),
    ]),
    undefined,
  );
  assert.equal(agreementOf(undefined), undefined);
});

test('describe marks a PASS on an older head', () => {
  const pull = {
    number: 9,
    title: 'Nine',
    baseRefName: 'main',
    headRefName: 'nine',
    headRefOid: 'f'.repeat(40),
    isDraft: false,
    autoMergeRequest: { mergeMethod: 'SQUASH' },
    comments: [verdictComment('PASS', 'def5678', '2026-11-08T01:00:00Z')],
  };
  const described = describe(pull, ['a']);
  assert.equal(described.inFlight, true);
  assert.equal(described.agreedStale, true);
  assert.equal(
    describe({ ...pull, headRefOid: `def5678${'0'.repeat(33)}` }, ['a'])
      .agreedStale,
    false,
  );
});

test('the report names shared files, the order and the free PRs', () => {
  const prs = [
    pr(1, ['a'], { inFlight: true }),
    pr(2, ['a']),
    pr(3, ['b']),
    pr(4, ['a'], { base: 'branch-1' }),
  ];
  const text = format(plan(prs), prs);
  assert.match(text, /#1 and #2: a/);
  assert.match(text, /1\. #1 PR 1 \(auto-merge armed\)\n {4}2\. #2 PR 2/);
  assert.match(text, /Any order[^\n]*\n {2}#3 PR 3/);
  assert.match(text, /#4 PR 4 after #1/);
});

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'merge-order-'));
  const run = (...args) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 't',
        GIT_AUTHOR_EMAIL: 't@t',
        GIT_COMMITTER_NAME: 't',
        GIT_COMMITTER_EMAIL: 't@t',
      },
    }).trim();
  run('init', '-q', '-b', 'main');
  return { dir, run };
}

test('mergeTree reports conflicts by path, including spaces, and clean merges', (t) => {
  const { dir, run } = repo();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'f'), 'a\nb\nc\n');
  writeFileSync(join(dir, 'sp ace'), 'x\n');
  writeFileSync(join(dir, 'other'), '1\n');
  run('add', '.');
  run('commit', '-qm', 'base');
  const base = run('rev-parse', 'HEAD');
  for (const [branch, line] of [
    ['one', 'A'],
    ['two', 'Z'],
  ]) {
    run('checkout', '-qb', branch, base);
    writeFileSync(join(dir, 'f'), `${line}\nb\nc\n`);
    writeFileSync(join(dir, 'sp ace'), `${line}\n`);
    run('commit', '-qam', branch);
  }
  run('checkout', '-qb', 'three', base);
  writeFileSync(join(dir, 'other'), '2\n');
  run('commit', '-qam', 'three');

  const conflict = mergeTree('one', 'two', dir);
  assert.equal(conflict.clean, false);
  assert.deepEqual(conflict.conflicts.sort(), ['f', 'sp ace']);
  const clean = mergeTree('one', 'three', dir);
  assert.equal(clean.clean, true);
  assert.match(clean.tree, /^[0-9a-f]{40}$/);
  assert.deepEqual(clean.conflicts, []);
  assert.deepEqual(changedPaths(`${base}...one`, dir).sort(), ['f', 'sp ace']);
  // git exits 1 for a missing commit too, which must not read as a conflict.
  assert.throws(() => mergeTree('one', 'missing', dir), /merge-tree/);
  assert.throws(() => mergeTree('one', '1'.repeat(40), dir), /merge-tree/);
});
