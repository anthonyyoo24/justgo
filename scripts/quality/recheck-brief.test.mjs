import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBrief, findingsOf } from './recheck-brief.mjs';

const body =
  'Verifier verdict: FAIL on base `aaaaaaa`, head `bbbbbbb`\n\nBlocking: the bullet contradicts arm-at-open.\nNotes: (1) hold';
const base = {
  pr: '7',
  verdict: { verdict: 'FAIL', base: 'aaaaaaa', head: 'bbbbbbb', url: 'u' },
  findings: findingsOf(body),
  head: 'ccccccc',
  result: 're-verify',
  rebased: false,
  sensitive: false,
  diff: '+fixed\n',
};

test('the brief quotes the findings, scopes to the diff and asks for callers and checks', () => {
  const brief = buildBrief(base);
  assert.match(brief, /> Blocking: the bullet contradicts arm-at-open\./);
  assert.match(brief, /> Notes: \(1\) hold/);
  assert.match(brief, /Scope: the change since the verdict/);
  assert.match(brief, /callers and callees/);
  assert.match(brief, /Rerun the PR's own checks/);
  assert.match(brief, /```diff\n\+fixed\n```/);
});

test('a rebase that needs re-verify asks for a full re-read', () => {
  assert.match(
    buildBrief({ ...base, rebased: true }),
    /full re-read\n\nverdict-patch/,
  );
  assert.doesNotMatch(
    buildBrief({ ...base, rebased: true, result: 'carries' }),
    /full re-read/,
  );
});

test('a sensitive PR always asks for a full re-read', () => {
  assert.match(
    buildBrief({ ...base, sensitive: true, result: 'docs-tests-only' }),
    /full re-read\n\nThe PR is sensitive\./,
  );
});

test('a verdict with no findings says so', () => {
  assert.equal(
    findingsOf('Verifier verdict: PASS on base `a1b2c3d`, head `d4e5f6a`'),
    '',
  );
  assert.match(buildBrief({ ...base, findings: '' }), /lists no findings/);
});
