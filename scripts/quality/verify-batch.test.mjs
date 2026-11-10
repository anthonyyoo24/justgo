import assert from 'node:assert/strict';
import test from 'node:test';
import {
  exclusion,
  format,
  maxBatchPulls,
  needsVerdict,
  plan,
} from './verify-batch.mjs';

const head = 'a'.repeat(40);
const verdict = (kind, sha = head) => ({
  authorAssociation: 'OWNER',
  body: `Verifier verdict: ${kind} on base \`${'b'.repeat(7)}\`, head \`${sha.slice(0, 7)}\`\nSensitive: no`,
  url: 'https://example.test/c',
  createdAt: '2026-11-10T00:00:00Z',
});
const pull = (number, files, extra = {}) => ({
  number,
  title: `PR ${number}`,
  isDraft: false,
  headRefOid: head,
  comments: [],
  statusCheckRollup: [],
  files: files.map(([path, additions, deletions = 0]) => ({
    path,
    additions,
    deletions,
  })),
  ...extra,
});

test('a PR needs a verdict until a PASS covers its head', () => {
  assert.equal(needsVerdict(pull(1, [['a.ts', 1]])), true);
  assert.equal(
    needsVerdict(pull(1, [['a.ts', 1]], { comments: [verdict('PASS')] })),
    false,
  );
  assert.equal(
    needsVerdict(
      pull(1, [['a.ts', 1]], { comments: [verdict('PASS', 'c'.repeat(40))] }),
    ),
    true,
  );
  assert.equal(
    needsVerdict(pull(1, [['a.ts', 1]], { comments: [verdict('FAIL')] })),
    true,
  );
  // A passed check covers a carried verdict after a merge from main.
  assert.equal(
    needsVerdict(
      pull(1, [['a.ts', 1]], {
        comments: [verdict('PASS', 'c'.repeat(40))],
        statusCheckRollup: [{ name: 'verdict', conclusion: 'SUCCESS' }],
      }),
    ),
    false,
  );
  // While the check runs after a merge from main, the PR waits for it.
  const older = { comments: [verdict('PASS', 'c'.repeat(40))] };
  assert.equal(
    needsVerdict(
      pull(1, [['a.ts', 1]], {
        ...older,
        statusCheckRollup: [{ name: 'verdict', status: 'IN_PROGRESS' }],
      }),
    ),
    false,
  );
  assert.equal(
    needsVerdict(
      pull(1, [['a.ts', 1]], {
        ...older,
        statusCheckRollup: [
          { name: 'verdict', status: 'COMPLETED', conclusion: 'FAILURE' },
        ],
      }),
    ),
    true,
  );
  assert.equal(needsVerdict(pull(1, [['a.ts', 1]], older)), true);
});

test('drafts, sensitive paths, boundary files and large PRs keep their own verifier', () => {
  assert.equal(exclusion(pull(1, [['a.ts', 1]], { isDraft: true })), 'draft');
  assert.match(
    exclusion(pull(1, [['apps/api/src/identity/x.ts', 1]])),
    /^sensitive path/,
  );
  for (const path of [
    'packages/contracts/src/a.ts',
    'apps/api/src/db/schema-extra.ts',
    '.github/workflows/ci.yml',
    'apps/mobile/package.json',
    'package-lock.json',
    '.claude/hooks/x.mjs',
    '.claude/settings.json',
    '.claude/skills/verify-justgo/SKILL.md',
    'eslint.config.mjs',
    'scripts/quality/verdict-patch.mjs',
  ])
    assert.match(exclusion(pull(1, [[path, 1]])), /^boundary file/, path);
  assert.equal(
    exclusion(pull(1, [['scripts/quality/verdict-patch.test.mjs', 1]])),
    undefined,
  );
  assert.match(exclusion(pull(1, [['a.ts', 100, 51]])), /151 changed lines/);
});

test('tests do not count toward the size, but Markdown does', () => {
  assert.equal(
    exclusion(
      pull(1, [
        ['a.ts', 150],
        ['apps/mobile/src/a.test.tsx', 900],
        ['apps/api/tests/b.ts', 900],
      ]),
    ),
    undefined,
  );
  assert.match(exclusion(pull(1, [['AGENTS.md', 151]])), /151 changed lines/);
});

test('batches close at the PR and line limits, in number order', () => {
  const pulls = [
    pull(9, [['a.ts', 140]]),
    pull(3, [['b.ts', 140]]),
    pull(5, [['c.ts', 140]]),
    pull(7, [['apps/api/drizzle/0001.sql', 1]]),
    pull(8, [['d.ts', 1]], { comments: [verdict('PASS')] }),
  ];
  const result = plan(pulls);
  assert.deepEqual(
    result.batches.map((batch) => batch.pulls.map((p) => p.number)),
    [[3, 5], [9]],
  );
  assert.deepEqual(
    result.alone.map((p) => p.number),
    [7],
  );
  const small = Array.from({ length: maxBatchPulls + 1 }, (_, i) =>
    pull(i + 1, [['e.ts', 1]]),
  );
  assert.deepEqual(
    plan(small).batches.map((batch) => batch.pulls.length),
    [maxBatchPulls, 1],
  );
});

test('the report names every batch and every PR left alone', () => {
  const text = format(
    plan([pull(3, [['b.ts', 2]]), pull(4, [['.github/x.yml', 1]])]),
  );
  assert.match(text, /Batch 1 \(2 lines, only one fits\):\n {2}#3 PR 3/);
  assert.match(
    text,
    /Own verifier:\n {2}#4 PR 4: boundary file \.github\/x\.yml/,
  );
  assert.equal(format(plan([])), 'No open PR needs a verdict.');
});
