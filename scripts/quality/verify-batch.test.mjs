import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  brief,
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
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.npmrc',
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
  assert.match(
    exclusion(pull(1, [['a.ts', 100, 51]])),
    /151 counted changed lines/,
  );
});

test('privacy code, private writing and the legal pages are sensitive', () => {
  for (const path of [
    'apps/api/src/build-app.ts',
    'apps/api/src/http/outbound-fetch.ts',
    'apps/api/src/http/server-error-reporter.ts',
    'apps/api/src/db/owner-transaction.ts',
    'apps/mobile/src/app-support/providers/AppProvider.tsx',
    'apps/mobile/src/app-support/diagnostics/event.ts',
    'apps/mobile/src/data/activity/model.ts',
    'apps/mobile/src/data/journal/storage.ts',
    'apps/mobile/src/features/settings/data/SettingsDataScreen.tsx',
    'apps/mobile/src/features/settings/export/data-export.ts',
    'apps/mobile/src/lib/network/account-client.ts',
    'apps/mobile/src/platform/auth/auth-storage.ts',
    'apps/mobile/src/platform/icloud/index.ts',
    'apps/mobile/plugins/with-sentry-privacy.cjs',
    'docs/legal/PRIVACY_POLICY_DRAFT.md',
    'apps/mobile/src/features/reflections/controller.ts',
    'apps/mobile/src/app-support/acceptance/AcceptanceScreen.tsx',
    'apps/api/src/http/legal-drafts.ts',
    'sites/legal/build.mjs',
  ])
    assert.match(exclusion(pull(1, [[path, 1]])), /^sensitive path/, path);
  // Neighbours outside the privacy areas stay small.
  for (const path of [
    'apps/mobile/src/app-support/saving/SavingNotice.tsx',
    'apps/mobile/src/lib/network/http.ts',
    'apps/mobile/src/platform/haptics/index.ts',
    'apps/api/src/http/parse.ts',
  ])
    assert.equal(exclusion(pull(1, [[path, 1]])), undefined, path);
});

test('tests and docs do not count toward the size, but agent instructions do', () => {
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
  assert.equal(
    exclusion(
      pull(1, [
        ['a.ts', 150],
        ['docs/implementation-plan/README.md', 400],
        ['apps/mobile/README.md', 400],
      ]),
    ),
    undefined,
  );
  for (const path of ['AGENTS.md', 'docs/operations/X.md'])
    assert.match(
      exclusion(pull(1, [[path, 151]])),
      /151 counted changed lines/,
      path,
    );
});

test('batches close at the PR limit, in number order', () => {
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
    [[3, 5, 9]],
  );
  assert.equal(result.batches[0].lines, 420);
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
  assert.match(text, /--brief <n>\.\.\.$/);
  assert.equal(format(plan([])), 'No open PR needs a verdict.');
});

test('the brief names the PRs and carries the verifier rules', () => {
  const one = brief([12]);
  assert.match(one, /^Agent description: Verify PR #12\n/);
  assert.match(
    one,
    /JustGO PR #12 \(https:\/\/github\.com\/anthonyyoo24\/justgo\/pull\/12\)\. You did not write it\./,
  );
  const two = brief([7, 8]);
  assert.match(two, /^Agent description: Verify PRs #7, #8\n/);
  assert.match(two, /each PR/);
  for (const text of [one, two]) {
    assert.match(text, /gh pr checks <n>/);
    assert.match(text, /Do not rerun install/);
    assert.match(text, /no fuzzer/);
    assert.match(text, /never real programs such as `say`/);
    assert.match(text, /File no issues/);
    assert.match(
      text,
      /^Verifier verdict: <PASS\|PASS\+NOTES\|FAIL> on base `<base-sha>`, head `<head-sha>`$/m,
    );
    assert.match(text, /^Sensitive: <yes\|no>$/m);
    assert.match(text, /Failure shown:/);
  }
});

test('--brief prints the brief and refuses a missing or bad number', () => {
  const script = fileURLToPath(new URL('./verify-batch.mjs', import.meta.url));
  const run = (...args) =>
    spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  const ok = run('--brief', '7', '8');
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trimEnd(), brief([7, 8]));
  assert.notEqual(run('--brief').status, 0);
  assert.notEqual(run('--brief', 'x').status, 0);
});
