import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readdirSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import test from 'node:test';
import {
  stagingTarget as target,
  validateFoundation,
  validateStagingEnvironment,
  productionPath,
  validateUpload,
  validateProbe,
  validateDeployment,
  releaseContext,
  candidateReceipt,
  requireRelease,
  StagingRunnerFailure,
  stagingRunnerFailureCode,
} from './staging-api.mjs';
import { stagingApi, privateCommand } from './staging-api-runner.mjs';

test('only branded allowlisted failures expose codes, independent of error text', () => {
  const failure = new StagingRunnerFailure('STAGING_SOURCE_NOT_CLEAN');
  failure.message = 'PRIVATE_PROVIDER_CREDENTIAL';
  failure.code = 'PRIVATE_PROVIDER_CREDENTIAL';
  assert.equal(stagingRunnerFailureCode(failure), 'STAGING_SOURCE_NOT_CLEAN');
  for (const error of [
    new Error('STAGING_SOURCE_NOT_CLEAN'),
    new Error('PRIVATE_PROVIDER_CREDENTIAL'),
    {
      code: 'STAGING_SOURCE_NOT_CLEAN',
      message: 'PRIVATE_PROVIDER_CREDENTIAL',
    },
    Object.create(StagingRunnerFailure.prototype),
    new SyntaxError('PRIVATE_PROVIDER_CREDENTIAL'),
    'PRIVATE_PROVIDER_CREDENTIAL',
    undefined,
  ])
    assert.equal(stagingRunnerFailureCode(error), undefined);
  const unknown = new StagingRunnerFailure('PRIVATE_PROVIDER_CREDENTIAL');
  assert.equal(unknown.message, 'STAGING_RUNNER_FAILED');
  assert.equal(stagingRunnerFailureCode(unknown), 'STAGING_RUNNER_FAILED');
  assert.throws(
    () => requireRelease(false, 'STAGING_BASELINE_CHANGED'),
    (error) => {
      assert.equal(error.message, 'STAGING_BASELINE_CHANGED');
      assert.equal(stagingRunnerFailureCode(error), 'STAGING_BASELINE_CHANGED');
      return true;
    },
  );
});

const sha = 'a'.repeat(40),
  previous = 'b'.repeat(40);
const context = { sha, runId: '123', attempt: '1' };
const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: target.repository,
  GITHUB_REF: 'refs/heads/main',
  RELEASE_SHA: sha,
  RELEASE_OPERATION: 'deploy',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
  VERCEL_TOKEN: 'private-fixture-token',
  VERCEL_AUTOMATION_BYPASS_SECRET: 'private-existing-bypass-fixture',
  STAGING_BASELINE_ID: 'dpl_previous',
  STAGING_BASELINE_SHA: previous,
};
function metadata(id = 'dpl_candidate') {
  return {
    id,
    projectId: target.project,
    ownerId: target.team,
    target: 'production',
    readyState: 'READY',
    regions: ['yul1'],
    url: 'justgo-candidate-anthony-youngshin-yoos-projects.vercel.app',
    meta: {
      githubCommitSha: sha,
      justgoSourceSha: sha,
      justgoRunId: '123',
      justgoRunAttempt: '1',
    },
  };
}
function deploymentReceipt() {
  return {
    status: 'ok',
    deployment: {
      id: 'dpl_candidate',
      url: `https://${metadata().url}`,
      readyState: 'READY',
      target: 'production',
    },
    message: 'Deployment complete',
    next: ['vercel promote dpl_unreviewed', 'curl https://untrusted.example'],
  };
}
test('CLI64.5 JSON receipt requires the exact successful production-ready deployment shape', () => {
  assert.deepEqual(candidateReceipt(JSON.stringify(deploymentReceipt())), {
    id: 'dpl_candidate',
    url: `https://${metadata().url}`,
  });
  for (const value of [
    metadata().url,
    '{}',
    JSON.stringify({ ...deploymentReceipt(), status: 'error' }),
    ...[
      { id: undefined },
      { target: 'preview' },
      { readyState: 'BUILDING' },
      { url: 'https://untrusted.example' },
      { url: `https://${metadata().url}/extra` },
    ].map((change) =>
      JSON.stringify({
        ...deploymentReceipt(),
        deployment: { ...deploymentReceipt().deployment, ...change },
      }),
    ),
  ])
    assert.throws(() => candidateReceipt(value), /INVALID_CANDIDATE_RECEIPT/);
});
function probe(kind = 'ready') {
  const id = '00000000-0000-4000-8000-000000000001';
  return {
    status: kind === 'unauthorized' ? 401 : 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
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
test('release requires the exact latest successful Foundation main push and trusted context', () => {
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
    { head_branch: 'other' },
    { event: 'pull_request' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
  ])
    assert.throws(() =>
      validateFoundation(
        { workflow_runs: [{ ...good, ...change }, good] },
        sha,
      ),
    );
  assert.deepEqual(releaseContext(env), context);
  for (const change of [
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_REF: 'refs/heads/other' },
    { GITHUB_REPOSITORY: 'fork/justgo' },
    { RELEASE_SHA: 'bad' },
    { RELEASE_SHA: `${sha}\n` },
    { RELEASE_OPERATION: 'rollback' },
  ])
    assert.throws(() => releaseContext({ ...env, ...change }));
  assert.throws(() =>
    validateFoundation(
      { workflow_runs: [{ ...good, head_sha: `${sha}\n` }] },
      `${sha}\n`,
    ),
  );
});
test('environment requires Anthony and exactly the main branch policy', () => {
  const environment = {
    name: target.environment,
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
  validateStagingEnvironment(environment, policies, target.reviewer);
  const owner = environment.protection_rules[0].reviewers[0];
  for (const reviewers of [
    [],
    [owner, { type: 'User', reviewer: { id: 123 } }],
    [owner, { type: 'Team', reviewer: { id: 456 } }],
  ])
    assert.throws(() =>
      validateStagingEnvironment(
        {
          ...environment,
          protection_rules: [{ type: 'required_reviewers', reviewers }],
        },
        policies,
        target.reviewer,
      ),
    );
  assert.throws(() =>
    validateStagingEnvironment(
      {
        ...environment,
        protection_rules: [
          ...environment.protection_rules,
          ...environment.protection_rules,
        ],
      },
      policies,
      target.reviewer,
    ),
  );
  for (const value of [
    { ...environment, name: 'testflight-beta' },
    { ...environment, protection_rules: [] },
    {
      ...environment,
      deployment_branch_policy: { custom_branch_policies: false },
    },
  ])
    assert.throws(() =>
      validateStagingEnvironment(value, policies, target.reviewer),
    );
  for (const value of [
    { ...policies, total_count: 2 },
    { ...policies, branch_policies: [{ name: '*', type: 'branch' }] },
    { ...policies, branch_policies: [{ name: 'main', type: 'tag' }] },
  ])
    assert.throws(() =>
      validateStagingEnvironment(environment, value, target.reviewer),
    );
  assert.throws(() => validateStagingEnvironment(environment, policies, '123'));
});
test('runtime probes require the exact source/environment, healthy contract and auth fence', () => {
  for (const kind of ['health', 'ready', 'unauthorized'])
    validateProbe(probe(kind), kind, sha);
  for (const value of [
    { ...probe(), status: 503 },
    { ...probe(), body: 'private-invalid-body' },
    { ...probe(), body: '{"status":"ready","private":"fixture"}' },
    {
      ...probe(),
      headers: { ...probe().headers, 'x-justgo-source-sha': previous },
    },
    {
      ...probe(),
      headers: { ...probe().headers, 'x-justgo-environment': 'production' },
    },
  ])
    assert.throws(
      () => validateProbe(value, 'ready', sha),
      (error) => !error.message.includes('private'),
    );
  assert.throws(() =>
    validateProbe(
      { ...probe('unauthorized'), status: 200 },
      'unauthorized',
      sha,
    ),
  );
  assert.throws(() =>
    validateProbe(
      {
        ...probe('unauthorized'),
        body: '{"code":"UNAUTHORIZED","requestId":"wrong"}',
      },
      'unauthorized',
      sha,
    ),
  );
});
test('deployment identity rejects wrong project/team/source/runtime/preview metadata', () => {
  validateDeployment(metadata(), context);
  assert.throws(() =>
    validateDeployment(
      {
        ...metadata(),
        meta: {
          ...metadata().meta,
          justgoSourceSha: `${sha}\n`,
          githubCommitSha: `${sha}\n`,
        },
      },
      { ...context, sha: `${sha}\n` },
    ),
  );
  for (const changes of [
    { projectId: 'other' },
    { ownerId: 'other' },
    { target: 'preview' },
    { readyState: 'ERROR' },
    { public: true },
    { regions: ['iad1'] },
    { meta: { ...metadata().meta, justgoSourceSha: previous } },
    { meta: { ...metadata().meta, justgoRunAttempt: '2' } },
    { url: 'attacker.example' },
  ])
    assert.throws(() =>
      validateDeployment({ ...metadata(), ...changes }, context),
    );
});
function fixture(t, failure) {
  const root = mkdtempSync(join(tmpdir(), 'justgo-staging-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const path = 'apps/api/src/server.ts',
    contents = 'reviewed synthetic API';
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
  const manifest = {
    framework: { slug: 'fastify' },
    files: [{ path, sha: createHash('sha1').update(contents).digest('hex') }],
  };
  const calls = [];
  let promoted = false,
    aliasReads = 0;
  const run = (command, args) => {
    calls.push({ command, args });
    if (command === 'git')
      return args[0] === 'rev-parse'
        ? sha
        : args[0] === 'ls-files'
          ? `${path}\0`
          : '';
    if (command === 'vercel' && args[0] === '--version') return '64.5.0';
    if (command === 'vercel' && args[0] === 'api') {
      if (args[1].startsWith('/v9/projects/'))
        return JSON.stringify({
          id: target.project,
          accountId: target.team,
          rootDirectory: 'apps/api',
          framework: 'fastify',
          nodeVersion: '24.x',
        });
      if (args[1].includes(target.alias)) {
        aliasReads++;
        if (promoted && failure === 'promotion-readback')
          throw new Error('PRIVATE_PROVIDER_CREDENTIAL');
        if (promoted && failure === 'promotion-json')
          return 'PRIVATE_PROVIDER_CREDENTIAL';
        if (promoted && failure === 'promotion-metadata')
          return JSON.stringify(metadata('dpl_unconfirmed'));
        return JSON.stringify(
          promoted
            ? metadata()
            : {
                ...metadata(
                  (failure === 'alias-race' && aliasReads > 1) ||
                    (failure === 'alias-race-late' && aliasReads > 2)
                    ? 'dpl_changed'
                    : 'dpl_previous',
                ),
                meta: { githubCommitSha: previous },
              },
        );
      }
      return JSON.stringify(
        failure === 'metadata'
          ? { ...metadata(), ownerId: 'other' }
          : metadata(),
      );
    }
    if (command === 'vercel' && args[0] === 'deploy')
      return args.includes('--dry')
        ? JSON.stringify(manifest)
        : JSON.stringify(
            failure === 'receipt-id-mismatch'
              ? {
                  ...deploymentReceipt(),
                  deployment: {
                    ...deploymentReceipt().deployment,
                    id: 'dpl_different',
                  },
                }
              : failure === 'receipt-url-mismatch'
                ? {
                    ...deploymentReceipt(),
                    deployment: {
                      ...deploymentReceipt().deployment,
                      url: 'https://justgo-different-anthony-youngshin-yoos-projects.vercel.app',
                    },
                  }
                : deploymentReceipt(),
          );
    if (command === 'vercel' && args[0] === 'promote') {
      promoted = true;
      if (failure === 'promotion-timeout')
        throw new Error('private-provider-error');
      return '';
    }
    if (command === 'curl' || args[0] === 'curl') {
      if (command === 'vercel') {
        assert.ok(args.indexOf('--scope') < args.indexOf('--'));
        assert.ok(!args.includes('--non-interactive'));
      }
      const path = command === 'curl' ? new URL(args.at(-1)).pathname : args[1];
      const kind =
        path === '/health'
          ? 'health'
          : path === '/ready'
            ? 'ready'
            : 'unauthorized';
      const value = probe(kind);
      if (
        (failure === 'candidate-probe' && !promoted) ||
        (failure === 'public-probe' && promoted)
      )
        value.body = 'private-provider-error';
      writeFileSync(
        args[args.indexOf('--dump-header') + 1],
        Object.entries(value.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n'),
      );
      writeFileSync(args[args.indexOf('--output') + 1], value.body);
      return String(value.status);
    }
    throw new Error('Unexpected fixture command');
  };
  return {
    root,
    manifest,
    path,
    calls,
    run,
    env: { ...env, RUNNER_TEMP: root },
    summary: () => {},
    beforePromote: async () => {},
  };
}
test('actual upload allowlist and hashes exclude secrets, migrations, fixtures and untracked files', (t) => {
  const f = fixture(t);
  assert.match(validateUpload(f.manifest, [f.path], f.root), /^[a-f0-9]{64}$/);
  for (const path of [
    '.env',
    'apps/api/scripts/migrate.ts',
    'apps/api/drizzle/0000_initial.sql',
    'apps/mobile/src/app.ts',
    'apps/api/src/.env.local',
    'apps/api/src/test.test.ts',
    'apps/api/src/test-support/fixture.ts',
    'apps/api/src/private.pem',
    '../secret',
  ])
    assert.equal(productionPath(path), false, path);
  assert.throws(() =>
    validateUpload({ ...f.manifest, files: [] }, [f.path], f.root),
  );
  assert.throws(() =>
    validateUpload(f.manifest, [f.path, 'apps/api/src/new.ts'], f.root),
  );
  assert.throws(() =>
    validateUpload(
      {
        ...f.manifest,
        files: [{ ...f.manifest.files[0], sha: '0'.repeat(40) }],
      },
      [f.path],
      f.root,
    ),
  );
});
test('release verifies candidate, promotes only exact inspected ID, verifies public alias and cleans probes', async (t) => {
  const f = fixture(t);
  const receipt = await stagingApi('deploy', f);
  assert.equal(receipt.sourceSha, sha);
  assert.equal(receipt.deploymentId, 'dpl_candidate');
  const deploy = f.calls.find(
    (c) => c.args[0] === 'deploy' && !c.args.includes('--dry'),
  );
  assert.ok(
    deploy.args.includes('--json') &&
      deploy.args.includes('--prod') &&
      deploy.args.includes('--skip-domain'),
  );
  assert.ok(deploy.args.includes(`API_SENTRY_RELEASE=${sha}`));
  assert.ok(
    !f.calls.some(
      (c) =>
        c.args.includes('dpl_unreviewed') ||
        c.args.includes('https://untrusted.example'),
    ),
  );
  assert.deepEqual(
    f.calls.filter((c) => c.args[0] === 'promote').map((c) => c.args[1]),
    ['dpl_candidate'],
  );
  assert.equal(f.calls.filter((c) => c.command === 'curl').length, 3);
  assert.ok(
    !readdirSync(f.root).some((p) => p.startsWith('justgo-api-probes-')),
  );
});
test('release requires an existing bypass credential before any CLI request, never creating one', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    stagingApi('deploy', {
      ...f,
      env: { ...f.env, VERCEL_AUTOMATION_BYPASS_SECRET: '' },
    }),
    /STAGING_EXISTING_BYPASS_SECRET_REQUIRED/,
  );
  assert.deepEqual(f.calls, []);
});
test('project-scoped CLI calls use fresh nonsecret scope config without an owner auth session and clean it on return', async (t) => {
  const f = fixture(t);
  const directories = new Set();
  const run = (command, args, options) => {
    if (command === 'vercel') {
      const directory = options.env.XDG_CONFIG_HOME;
      directories.add(directory);
      assert.ok(directory.startsWith(join(f.root, 'justgo-api-cli-')));
      assert.equal(options.env.XDG_DATA_HOME, directory);
      assert.equal(options.env.XDG_CACHE_HOME, directory);
      const config = JSON.parse(
        readFileSync(join(directory, 'com.vercel.cli', 'config.json'), 'utf8'),
      );
      assert.deepEqual(config.cachedTeamIds, { [target.scope]: target.team });
      assert.equal(config.currentTeam, target.team);
      assert.equal(config.cachedTeamSlugs[target.team].slug, target.scope);
      assert.equal(config.updates.auto, false);
      assert.ok(!existsSync(join(directory, 'com.vercel.cli', 'auth.json')));
      assert.ok(!args.includes('--global-config'));
    }
    return f.run(command, args, options);
  };
  await stagingApi('preflight', { ...f, run });
  assert.equal(directories.size, 1);
  for (const directory of directories) assert.ok(!existsSync(directory));
  await stagingApi('deploy', { ...f, run });
  assert.equal(directories.size, 2);
  for (const directory of directories) assert.ok(!existsSync(directory));
});
for (const failure of [
  'metadata',
  'candidate-probe',
  'alias-race',
  'alias-race-late',
  'receipt-id-mismatch',
  'receipt-url-mismatch',
  'public-probe',
  'promotion-timeout',
  'promotion-readback',
  'promotion-json',
  'promotion-metadata',
])
  test(`release fails closed for ${failure} without automatic rollback or private output`, async (t) => {
    const f = fixture(t, failure);
    const uncertain = [
      'public-probe',
      'promotion-timeout',
      'promotion-readback',
      'promotion-json',
      'promotion-metadata',
    ].includes(failure);
    await assert.rejects(stagingApi('deploy', f), (error) => {
      if (uncertain) {
        assert.equal(error.message, 'STAGING_PROMOTION_UNCONFIRMED');
        assert.equal(
          stagingRunnerFailureCode(error),
          'STAGING_PROMOTION_UNCONFIRMED',
        );
      } else {
        assert.notEqual(stagingRunnerFailureCode(error), undefined);
        assert.notEqual(
          stagingRunnerFailureCode(error),
          'STAGING_RUNNER_FAILED',
        );
      }
      assert.ok(!JSON.stringify(error).includes('PRIVATE_PROVIDER_CREDENTIAL'));
      return true;
    });
    assert.equal(
      f.calls.filter((c) => c.args[0] === 'promote').length,
      uncertain ? 1 : 0,
    );
    assert.ok(
      !f.calls.some((c) => c.args[0] === 'rollback' || c.args[0] === 'remove'),
    );
    if (
      ['alias-race', 'receipt-id-mismatch', 'receipt-url-mismatch'].includes(
        failure,
      )
    )
      assert.ok(
        !f.calls.some((c) => c.command === 'curl' || c.args[0] === 'curl'),
        'An unverified candidate/public alias must not be probed',
      );
    assert.ok(
      !readdirSync(f.root).some(
        (p) =>
          p.startsWith('justgo-api-probes-') || p.startsWith('justgo-api-cli-'),
      ),
    );
  });
test('private command failures never expose provider output or argument secrets', async () => {
  await assert.rejects(
    () =>
      privateCommand(process.execPath, [
        '-e',
        'throw new Error("private-secret-fixture")',
      ]),
    (error) =>
      error.message === 'STAGING_COMMAND_FAILED' &&
      stagingRunnerFailureCode(error) === 'STAGING_COMMAND_FAILED',
  );
});
test('failures before promotion preserve their own classification, while a failed receipt write is uncertain', async (t) => {
  const f = fixture(t);
  await assert.rejects(
    stagingApi('deploy', {
      ...f,
      env: { ...f.env, STAGING_BASELINE_ID: 'dpl_wrong' },
    }),
    (error) => stagingRunnerFailureCode(error) === 'STAGING_BASELINE_CHANGED',
  );
  assert.ok(!f.calls.some((call) => call.args[0] === 'promote'));
  await assert.rejects(
    stagingApi('deploy', {
      ...f,
      summary: () => {
        throw new Error('PRIVATE_PROVIDER_CREDENTIAL');
      },
    }),
    (error) =>
      stagingRunnerFailureCode(error) === 'STAGING_PROMOTION_UNCONFIRMED',
  );
  assert.equal(f.calls.filter((call) => call.args[0] === 'promote').length, 1);
});
test('lost DB connection during candidate build prevents all later provider operations', async (t) => {
  const f = fixture(t);
  const controller = new AbortController();
  const run = (command, args, options) => {
    const result = f.run(command, args, options);
    if (command === 'vercel' && args[0] === 'deploy' && !args.includes('--dry'))
      controller.abort();
    return result;
  };
  await assert.rejects(
    stagingApi('deploy', { ...f, run, signal: controller.signal }),
    /STAGING_DATABASE_LEASE_LOST/,
  );
  assert.ok(!f.calls.some((c) => c.args[0] === 'promote'));
});
test('same-session lease verification must succeed immediately before promotion', async (t) => {
  const f = fixture(t);
  let checked = false;
  await assert.rejects(
    stagingApi('deploy', {
      ...f,
      beforePromote: async () => {
        checked = true;
        throw new Error('STAGING_DATABASE_LEASE_LOST');
      },
    }),
  );
  assert.equal(checked, true);
  assert.ok(!f.calls.some((c) => c.args[0] === 'promote'));
  assert.ok(
    !readdirSync(f.root).some((p) => p.startsWith('justgo-api-probes-')),
  );
});
test('asynchronous private subprocesses stop on abort without leaking errors', async () => {
  const controller = new AbortController();
  const pending = privateCommand(
    process.execPath,
    ['-e', 'setTimeout(()=>{},10000)'],
    { signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(
    pending,
    (error) => error.message === 'STAGING_COMMAND_FAILED',
  );
});
