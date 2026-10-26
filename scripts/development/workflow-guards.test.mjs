import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  validateFoundationChecks,
  validateSigningEnvironment,
} from './workflow-guards.mjs';

test('only the latest successful main push for the exact source is accepted', () => {
  const run = {
    head_sha: 'a'.repeat(40),
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
  };
  validateFoundationChecks({ workflow_runs: [run] }, run.head_sha);
  for (const change of [
    { head_sha: 'b'.repeat(40) },
    { head_branch: 'feature' },
    { event: 'pull_request' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
  ])
    assert.throws(() =>
      validateFoundationChecks(
        { workflow_runs: [{ ...run, ...change }, run] },
        run.head_sha,
      ),
    );
  assert.throws(() => validateFoundationChecks({}, run.head_sha));
});
test('missing owner review, environment or branch protection stops before credentials', () => {
  const value = {
    name: 'testflight-beta',
    protection_rules: [
      { type: 'required_reviewers', reviewers: [{ reviewer: { id: 42 } }] },
    ],
    deployment_branch_policy: { custom_branch_policies: true },
  };
  validateSigningEnvironment(value);
  for (const change of [
    { name: 'production' },
    { protection_rules: [] },
    { protection_rules: [{ type: 'required_reviewers', reviewers: [] }] },
    { deployment_branch_policy: {} },
  ])
    assert.throws(() => validateSigningEnvironment({ ...value, ...change }));
});
test('the workflow compiles on the standard GitHub Mac, freezes signing and hosts only inspected bytes', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/development-ios.yml', import.meta.url),
    'utf8',
  );
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(
    workflow,
    /^ {2}(push|pull_request|schedule|workflow_run):/m,
  );
  assert.match(workflow, /runs-on: macos-26\n/);
  assert.match(workflow, /Xcode_26\.6/);
  assert.match(
    workflow,
    /eas build --platform ios --profile development --local --freeze-credentials --non-interactive/,
  );
  assert.match(
    workflow,
    /eas upload --platform ios --build-path "\$RUNNER_TEMP\/justgo-dev-artifact\/JustGO-Dev\.ipa" --non-interactive --json/,
  );
  assert.match(workflow, /EXPO_NO_DOTENV: '1'/);
  assert.match(workflow, /environment:\n {6}name: testflight-beta/);
  assert.ok(
    workflow.indexOf('Recheck signing approval before Expo access') <
      workflow.indexOf('EXPO_TOKEN:'),
  );
  assert.ok(
    workflow.indexOf('artifact.mjs record') < workflow.indexOf('eas upload'),
  );
  assert.ok(
    workflow.indexOf('artifact.mjs verify') < workflow.indexOf('eas upload'),
  );
  assert.match(workflow, /artifact.mjs receipt/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /security delete-keychain/);
  assert.match(workflow, /retention-days: 7/);
  assert.doesNotMatch(
    workflow,
    /eas submit|--auto-submit|--latest|continue-on-error|EAS_LOCAL_BUILD_SKIP_CLEANUP/,
  );
  for (const [, reference] of workflow.matchAll(/\buses: ([^\s]+)/g))
    if (!reference.startsWith('./'))
      assert.match(reference, /^actions\/[\w-]+@[a-f0-9]{40}$/);
});
