import assert from 'node:assert/strict';
import test from 'node:test';
import {
  stagingTarget,
  validateFoundation,
  validateStagingEnvironment,
  validateProbe,
  productionPath,
  releaseContext,
  StagingRunnerFailure,
  stagingRunnerFailureCode,
} from './staging-api.mjs';

const sha = 'a'.repeat(40),
  previous = 'b'.repeat(40);
const context = { sha, runId: '123', attempt: '1' };
const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: stagingTarget.repository,
  GITHUB_REF: 'refs/heads/main',
  RELEASE_SHA: sha,
  RELEASE_OPERATION: 'deploy',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
};
function probe(kind = 'ready') {
  const id = '12345678-1234-1234-1234-123456789012';
  return {
    status: kind === 'unauthorized' ? 401 : 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json',
      'x-request-id': id,
      'x-justgo-source-sha': sha,
      'x-justgo-environment': 'staging',
    },
    body: JSON.stringify(
      kind === 'unauthorized'
        ? { code: 'UNAUTHORIZED', requestId: id }
        : kind === 'health'
          ? { status: 'ok', service: 'justgo-api' }
          : { status: 'ready' },
    ),
  };
}

test('release context and Foundation checks bind exactly the reviewed main push', () => {
  assert.deepEqual(releaseContext(env), context);
  const good = {
    head_sha: sha,
    head_branch: 'main',
    event: 'push',
    status: 'completed',
    conclusion: 'success',
  };
  validateFoundation({ workflow_runs: [good] }, sha);
  for (const change of [
    { head_sha: previous },
    { event: 'pull_request' },
    { conclusion: 'failure' },
    { head_branch: 'other' },
  ])
    assert.throws(() =>
      validateFoundation({ workflow_runs: [{ ...good, ...change }] }, sha),
    );
  for (const change of [
    { RELEASE_SHA: `${sha}\n` },
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_REPOSITORY: 'fork/repo' },
    { RELEASE_OPERATION: 'rollback' },
    { RELEASE_OPERATION: 'bootstrap' },
    { GITHUB_REF: 'refs/heads/other' },
  ])
    assert.throws(() => releaseContext({ ...env, ...change }));
});
test('environment keeps Anthony as sole reviewer and main as sole branch policy', () => {
  const environment = {
    name: 'justgo-staging',
    deployment_branch_policy: { custom_branch_policies: true },
    protection_rules: [
      {
        type: 'required_reviewers',
        reviewers: [{ type: 'User', reviewer: { id: 51426358 } }],
      },
    ],
  };
  const policies = {
    total_count: 1,
    branch_policies: [{ name: 'main', type: 'branch' }],
  };
  validateStagingEnvironment(environment, policies, '51426358');
  assert.throws(() =>
    validateStagingEnvironment(environment, policies, 'other'),
  );
  assert.throws(() =>
    validateStagingEnvironment(
      { ...environment, protection_rules: [] },
      policies,
      '51426358',
    ),
  );
  assert.throws(() =>
    validateStagingEnvironment(
      environment,
      { ...policies, branch_policies: [{ name: '*', type: 'branch' }] },
      '51426358',
    ),
  );
});
test('probes preserve source, environment, auth fence and no-store', () => {
  for (const kind of ['health', 'ready', 'unauthorized'])
    validateProbe(probe(kind), kind, sha);
  for (const value of [
    { ...probe(), status: 503 },
    { ...probe(), body: 'PRIVATE_PROVIDER_CONTENT' },
    {
      ...probe(),
      headers: { ...probe().headers, 'x-justgo-source-sha': previous },
    },
    { ...probe(), headers: { ...probe().headers, 'cache-control': 'public' } },
  ])
    assert.throws(() => validateProbe(value, 'ready', sha));
});
test('health startup failure is not misclassified as release identity drift', () => {
  const value = probe('health');
  value.status = 500;
  delete value.headers['x-justgo-source-sha'];
  delete value.headers['x-justgo-environment'];
  value.body = JSON.stringify({
    error: 'Internal server error',
    requestId: value.headers['x-request-id'],
  });
  assert.throws(
    () => validateProbe(value, 'health', sha),
    (error) => {
      assert.equal(stagingRunnerFailureCode(error), 'STAGING_HEALTH_FAILED');
      assert.equal(error.message, 'STAGING_HEALTH_FAILED');
      return true;
    },
  );
});
test('readiness failure keeps its diagnostic with or without release headers', () => {
  for (const hasIdentity of [true, false]) {
    const value = probe('ready');
    value.status = 503;
    value.body = JSON.stringify({ status: 'unavailable' });
    if (!hasIdentity) {
      delete value.headers['x-justgo-source-sha'];
      delete value.headers['x-justgo-environment'];
    }
    assert.throws(
      () => validateProbe(value, 'ready', sha),
      (error) => {
        assert.equal(
          stagingRunnerFailureCode(error),
          'STAGING_READINESS_FAILED',
        );
        assert.equal(error.message, 'STAGING_READINESS_FAILED');
        return true;
      },
    );
  }
});
test('HTTP success still requires exact source and staging environment', () => {
  for (const kind of ['health', 'ready'])
    for (const headers of [
      { 'x-justgo-source-sha': previous },
      { 'x-justgo-environment': 'production' },
      { 'x-justgo-source-sha': undefined },
      { 'x-justgo-environment': undefined },
    ]) {
      const value = probe(kind);
      value.headers = { ...value.headers, ...headers };
      assert.throws(
        () => validateProbe(value, kind, sha),
        (error) => {
          assert.equal(
            stagingRunnerFailureCode(error),
            'STAGING_RUNTIME_IDENTITY_MISMATCH',
          );
          return true;
        },
      );
    }
});
test('malformed HTTP statuses fail with a closed probe diagnostic', () => {
  for (const kind of ['health', 'ready', 'unauthorized'])
    for (const status of [
      undefined,
      null,
      '200',
      'PRIVATE_PROVIDER_CONTENT',
      NaN,
      Infinity,
      200.5,
      99,
      600,
    ])
      assert.throws(
        () => validateProbe({ ...probe(kind), status }, kind, sha),
        (error) => {
          assert.equal(
            stagingRunnerFailureCode(error),
            'INVALID_STAGING_PROBE',
          );
          assert.equal(error.message, 'INVALID_STAGING_PROBE');
          return true;
        },
      );
});
test('invalid successful endpoint bodies retain health or readiness diagnostics', () => {
  for (const [kind, expected] of [
    ['health', 'STAGING_HEALTH_FAILED'],
    ['ready', 'STAGING_READINESS_FAILED'],
  ])
    assert.throws(
      () =>
        validateProbe(
          { ...probe(kind), body: JSON.stringify({ status: 'unavailable' }) },
          kind,
          sha,
        ),
      (error) => {
        assert.equal(stagingRunnerFailureCode(error), expected);
        return true;
      },
    );
});
test('production paths admit only tracked API, contracts and manifest sources', () => {
  for (const path of [
    'package.json',
    'pnpm-lock.yaml',
    'apps/api/package.json',
    'apps/api/src/edge.ts',
    'packages/contracts/src/index.ts',
  ])
    assert.equal(productionPath(path), true, path);
  for (const path of [
    '/apps/api/src/edge.ts',
    'apps/api/src/../scripts/x.ts',
    'apps/api/src//edge.ts',
    'apps/api/src/edge.test.ts',
    'apps/api/src/__mocks__/x.ts',
    'apps/api/src/.env.local',
    'apps/api/src/key.pem',
    'apps/api/scripts/staging-release.ts',
    'apps/api/wrangler.jsonc',
    'apps/mobile/src/index.ts',
    undefined,
  ])
    assert.equal(productionPath(path), false, String(path));
});
test('provider and subprocess error text never supplies a trusted diagnostic', () => {
  for (const error of [
    new Error('STAGING_SOURCE_NOT_CLEAN'),
    { code: 'STAGING_SOURCE_NOT_CLEAN' },
    undefined,
  ])
    assert.equal(stagingRunnerFailureCode(error), undefined);
  const failure = new StagingRunnerFailure('STAGING_SOURCE_NOT_CLEAN');
  failure.message = 'PRIVATE_PROVIDER_CONTENT';
  assert.equal(stagingRunnerFailureCode(failure), 'STAGING_SOURCE_NOT_CLEAN');
  assert.equal(
    stagingRunnerFailureCode(
      new StagingRunnerFailure('PRIVATE_PROVIDER_CONTENT'),
    ),
    'STAGING_RUNNER_FAILED',
  );
});
