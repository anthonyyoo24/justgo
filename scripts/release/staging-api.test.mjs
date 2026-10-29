import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  stagingTarget,
  validateFoundation,
  validateStagingEnvironment,
  validateProbe,
  validateWorkerSettings,
  validateVersion,
  cloudflareTarget,
  validateDeployment,
  releaseContext,
  StagingRunnerFailure,
  stagingRunnerFailureCode,
} from './staging-api.mjs';
import {
  stagingApi,
  privateCommand,
  validateHyperdrive,
} from './staging-api-runner.mjs';

const sha = 'a'.repeat(40),
  previous = 'b'.repeat(40);
const candidateId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const previousId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const deploymentId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const oldDeploymentId = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const otherId = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';
const context = { sha, runId: '123', attempt: '1' };
const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: stagingTarget.repository,
  GITHUB_REF: 'refs/heads/main',
  RELEASE_SHA: sha,
  RELEASE_OPERATION: 'deploy',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
  CLOUDFLARE_API_TOKEN: 'private-fixture-token',
  CLOUDFLARE_ACCOUNT_ID: '1'.repeat(32),
  CLOUDFLARE_WORKERS_SUBDOMAIN: 'fixture-account',
  STAGING_HYPERDRIVE_ID: '2'.repeat(32),
  STAGING_BASELINE_ID: oldDeploymentId,
  STAGING_BASELINE_SHA: previous,
};
const target = cloudflareTarget(env);
const text = (name, value) => ({ name, type: 'plain_text', text: value });
function metadata(id = candidateId) {
  return {
    id,
    metadata: { has_preview: true },
    resources: {
      bindings: [
        text('APP_ENVIRONMENT', 'staging'),
        text('NODE_ENV', 'production'),
        text('MANAGED_AUTH_ENABLED', 'true'),
        text('SUPABASE_URL', 'https://kmcpcauaxlgpevkkenwd.supabase.co'),
        text('JUSTGO_SOURCE_SHA', id === previousId ? previous : sha),
        text('API_SENTRY_RELEASE', sha),
        text('JUSTGO_RELEASE_RUN_ID', '123'),
        text('JUSTGO_RELEASE_RUN_ATTEMPT', '1'),
        ...[
          'IDENTITY_RATE_LIMIT_KEY',
          'SUPABASE_AUTH_SECRET_KEY',
          'SUPABASE_PUBLISHABLE_KEY',
          'LOCK_DATABASE_URL',
        ].map((name) => ({ name, type: 'secret_text' })),
        { name: 'HYPERDRIVE', type: 'hyperdrive', id: target.hyperdriveId },
      ],
    },
  };
}
function hyperdrive() {
  return {
    id: target.hyperdriveId,
    caching: { disabled: true },
    origin: {
      host: 'db.kmcpcauaxlgpevkkenwd.supabase.co',
      database: 'postgres',
      user: 'justgo_runtime',
      scheme: 'postgres',
      port: 5432,
    },
    mtls: { sslmode: 'verify-full', ca_certificate_id: previousId },
    origin_connection_limit: 5,
  };
}
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
function fixture(t, failure) {
  const root = mkdtempSync(join(tmpdir(), 'justgo-staging-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const calls = [],
    waits = [];
  let uploaded = false,
    promoted = false,
    reads = 0;
  return {
    root,
    env: { ...env, RUNNER_TEMP: root },
    calls,
    waits,
    run: async (command, args) => {
      calls.push({ command, args });
      assert.equal(command, 'git');
      return args[0] === 'rev-parse' ? sha : '';
    },
    build: async () => ({
      content: Buffer.from('reviewed worker'),
      uploadSha256: 'c'.repeat(64),
      configuration: {
        compatibility_date: '2026-10-28',
        compatibility_flags: ['nodejs_compat'],
        placement: { region: 'aws:ca-central-1' },
      },
    }),
    request: async (_target, path, options) => {
      calls.push({ path, method: options.method ?? 'GET' });
      assert.deepEqual(_target, target);
      assert.equal(options.token, env.CLOUDFLARE_API_TOKEN);
      if (path === '/workers/subdomain') return { subdomain: target.subdomain };
      if (path.startsWith('/hyperdrive/'))
        return failure === 'hyperdrive-cache'
          ? { ...hyperdrive(), caching: { disabled: false } }
          : hyperdrive();
      if (path === '/script-settings')
        return {
          ...(failure === 'logs'
            ? { observability: { enabled: true } }
            : failure === 'nested-logs'
              ? { observability: { enabled: false, logs: { enabled: true } } }
              : {}),
          logpush: false,
          ...(failure === 'malformed-settings'
            ? { tail_consumers: { length: 0 } }
            : {}),
        };
      if (path === '/subdomain')
        return {
          enabled: true,
          previews_enabled: failure !== 'preview-disabled',
        };
      if (path === '/deployments') {
        if (promoted) reads++;
        if (promoted && failure === 'readback')
          throw new Error('PRIVATE_PROVIDER_CONTENT');
        const pending =
          promoted &&
          (failure === 'promotion-never' ||
            (failure === 'promotion-delay' && reads <= 2));
        const version_id = promoted && !pending ? candidateId : previousId;
        return {
          deployments: [
            {
              id:
                promoted && !pending
                  ? deploymentId
                  : uploaded && failure === 'alias-race'
                    ? otherId
                    : oldDeploymentId,
              strategy: 'percentage',
              versions: [{ version_id, percentage: 100 }],
            },
          ],
        };
      }
      if (path === '/versions')
        return {
          items: [
            {
              id: uploaded
                ? candidateId
                : failure === 'latest-race'
                  ? otherId
                  : previousId,
            },
          ],
        };
      if (path.startsWith('/versions/') && options.method !== 'POST') {
        const version = metadata(path.split('/').at(-1));
        if (uploaded && failure === 'source')
          version.resources.bindings.find(
            (b) => b.name === 'JUSTGO_SOURCE_SHA',
          ).text = previous;
        if (uploaded && failure === 'binding')
          version.resources.bindings.push(
            text('CORS_ORIGINS', 'https://attacker.invalid'),
          );
        return version;
      }
      if (path === '/versions?bindings_inherit=strict') {
        assert.equal(options.method, 'POST');
        const metadata = JSON.parse(options.body.get('metadata'));
        assert.equal(metadata.main_module, 'worker.js');
        assert.deepEqual(metadata.placement, {
          mode: 'targeted',
          region: 'aws:ca-central-1',
        });
        assert.equal(
          metadata.bindings.find((b) => b.name === 'LOCK_DATABASE_URL').type,
          'inherit',
        );
        assert.equal(
          await options.body.get('worker.js').text(),
          'reviewed worker',
        );
        uploaded = true;
        if (failure === 'upload-response')
          throw new StagingRunnerFailure('STAGING_VERSION_UPLOAD_UNCONFIRMED');
        return { id: candidateId };
      }
      throw new Error('Unexpected provider call');
    },
    promote: async (id, options) => {
      calls.push({ promotion: id });
      assert.equal(id, candidateId);
      assert.deepEqual(options.target, target);
      promoted = true;
      if (failure === 'promotion-timeout')
        throw new Error('PRIVATE_PROVIDER_CONTENT');
    },
    probe: async (origin, path) => {
      calls.push({ probe: origin + path });
      const result = probe(
        path === '/health'
          ? 'health'
          : path === '/ready'
            ? 'ready'
            : 'unauthorized',
      );
      if (
        (failure === 'candidate-probe' && !promoted) ||
        (failure === 'public-probe' && promoted)
      )
        result.body = 'PRIVATE_PROVIDER_CONTENT';
      return result;
    },
    wait: async (milliseconds) => {
      waits.push(milliseconds);
    },
    summary: () => {},
    beforePromote: async () => {},
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
test('targets reject missing account, secret, Hyperdrive or unsafe subdomain before network I/O', async (t) => {
  for (const change of [
    { CLOUDFLARE_ACCOUNT_ID: '' },
    { CLOUDFLARE_API_TOKEN: '' },
    { STAGING_HYPERDRIVE_ID: 'unsafe' },
    { CLOUDFLARE_WORKERS_SUBDOMAIN: 'attacker.example' },
    { CLOUDFLARE_API_TOKEN: 'x\r\n' },
  ]) {
    const f = fixture(t);
    await assert.rejects(
      stagingApi('deploy', { ...f, env: { ...f.env, ...change } }),
      /STAGING_CLOUDFLARE_CONFIGURATION_REQUIRED/,
    );
    assert.equal(f.calls.length, 0);
  }
});
test('script settings accept omitted, null and explicitly disabled observability', () => {
  for (const settings of [
    { logpush: false, tail_consumers: [] },
    { observability: null, logpush: false, tail_consumers: [] },
    { observability: null, logpush: false, tail_consumers: null },
    { observability: { enabled: false } },
    {
      observability: {
        enabled: false,
        logs: { enabled: false, invocation_logs: true, persist: true },
        traces: { enabled: false, destinations: [] },
        issues: { enabled: false },
      },
    },
  ])
    validateWorkerSettings(settings);
});
test('script settings reject malformed responses and every enabled telemetry path', () => {
  for (const settings of [
    undefined,
    null,
    false,
    [],
    'PRIVATE_PROVIDER_CONTENT',
    { logpush: true },
    { logpush: 'false' },
    { tail_consumers: [{ service: 'unapproved' }] },
    { tail_consumers: { length: 0 } },
    { tail_consumers: '' },
    { observability: false },
    { observability: [] },
    { observability: {} },
    { observability: { enabled: true } },
    { observability: { enabled: 'false' } },
    ...['logs', 'traces', 'issues'].flatMap((name) =>
      [
        true,
        null,
        [],
        { enabled: true },
        { enabled: 'false' },
        { enabled: false, destinations: ['unapproved'] },
        { enabled: false, destinations: { length: 0 } },
      ].map((telemetry) => ({
        observability: { enabled: false, [name]: telemetry },
      })),
    ),
  ])
    assert.throws(
      () => validateWorkerSettings(settings),
      (error) => {
        assert.equal(
          stagingRunnerFailureCode(error),
          'STAGING_WORKER_CONFIGURATION_MISMATCH',
        );
        assert.ok(!error.message.includes('PRIVATE_PROVIDER_CONTENT'));
        return true;
      },
    );
});
test('version and Hyperdrive guards reject privileged credentials, caching and unsafe protocols', () => {
  validateVersion(metadata(), target, context);
  validateHyperdrive(hyperdrive(), target);
  for (const change of [
    { origin_connection_limit: 20 },
    { caching: { disabled: false } },
    { mtls: { sslmode: 'require' } },
    { origin: { ...hyperdrive().origin, user: 'postgres' } },
    { origin: { ...hyperdrive().origin, host: 'foreign.invalid' } },
  ])
    assert.throws(() =>
      validateHyperdrive({ ...hyperdrive(), ...change }, target),
    );
  for (const bindings of [
    metadata().resources.bindings.filter((b) => b.name !== 'LOCK_DATABASE_URL'),
    [
      ...metadata().resources.bindings,
      text('DATABASE_URL', 'postgres://private'),
    ],
    [...metadata().resources.bindings, metadata().resources.bindings[0]],
  ])
    assert.throws(() =>
      validateVersion(
        { ...metadata(), resources: { bindings } },
        target,
        context,
      ),
    );
  assert.throws(() => validateDeployment({ deployments: [] }));
  assert.throws(() =>
    validateDeployment({
      deployments: [
        {
          id: deploymentId,
          strategy: 'percentage',
          versions: [{ version_id: candidateId, percentage: 50 }],
        },
      ],
    }),
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
test('uploads inspected bytes without traffic then probes and promotes precisely once', async (t) => {
  const f = fixture(t);
  const result = await stagingApi('deploy', f);
  assert.equal(result.versionId, candidateId);
  assert.equal(result.deploymentId, deploymentId);
  assert.equal(f.calls.filter((c) => c.method === 'POST').length, 1);
  assert.equal(f.calls.filter((c) => c.promotion).length, 1);
  assert.equal(f.calls.filter((c) => c.probe).length, 8);
  assert.ok(f.calls.some((c) => c.path === '/script-settings'));
  assert.ok(!f.calls.some((c) => c.path === '/settings'));
  assert.ok(
    f.calls.findIndex((c) => c.promotion) > f.calls.findIndex((c) => c.probe),
  );
  assert.ok(
    !readdirSync(f.root).some((p) => p.startsWith('justgo-worker-release-')),
  );
});
for (const failure of ['promotion-delay', 'promotion-timeout'])
  test(`${failure} resolves through readback without repeating the mutation`, async (t) => {
    const f = fixture(t, failure);
    const result = await stagingApi('deploy', f);
    assert.equal(result.versionId, candidateId);
    assert.equal(f.calls.filter((c) => c.promotion).length, 1);
    assert.deepEqual(
      f.waits,
      failure === 'promotion-delay' ? [2000, 2000] : [],
    );
  });
for (const failure of [
  'hyperdrive-cache',
  'logs',
  'nested-logs',
  'malformed-settings',
  'preview-disabled',
  'latest-race',
  'alias-race',
  'source',
  'binding',
  'upload-response',
  'candidate-probe',
  'public-probe',
  'readback',
  'promotion-never',
])
  test(`fails closed on ${failure} without rollback or private output`, async (t) => {
    const f = fixture(t, failure);
    const uncertain = ['public-probe', 'readback', 'promotion-never'].includes(
      failure,
    );
    await assert.rejects(stagingApi('deploy', f), (error) => {
      assert.ok(!error.message.includes('PRIVATE_PROVIDER_CONTENT'));
      assert.ok(stagingRunnerFailureCode(error));
      if (uncertain)
        assert.equal(
          stagingRunnerFailureCode(error),
          'STAGING_PROMOTION_UNCONFIRMED',
        );
      return true;
    });
    assert.equal(f.calls.filter((c) => c.promotion).length, uncertain ? 1 : 0);
    assert.ok(
      !f.calls.some((c) => ['DELETE', 'PUT', 'PATCH'].includes(c.method)),
    );
  });
test('lost database lease after build prevents uploads and promotion', async (t) => {
  const f = fixture(t),
    controller = new AbortController();
  await assert.rejects(
    stagingApi('deploy', {
      ...f,
      signal: controller.signal,
      build: async (...args) => {
        const built = await f.build(...args);
        controller.abort();
        return built;
      },
    }),
    /STAGING_DATABASE_LEASE_LOST/,
  );
  assert.ok(!f.calls.some((c) => c.method === 'POST' || c.promotion));
});
test('same-session advisory lock is checked immediately before promotion', async (t) => {
  const f = fixture(t);
  let checked = false;
  await assert.rejects(
    stagingApi('deploy', {
      ...f,
      beforePromote: async () => {
        checked = true;
        throw new Error('lease lost');
      },
    }),
  );
  assert.equal(checked, true);
  assert.ok(!f.calls.some((c) => c.promotion));
});
test('provider and subprocess error text never supplies a trusted diagnostic', async () => {
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
  await assert.rejects(
    privateCommand(process.execPath, [
      '-e',
      'throw new Error("PRIVATE_PROVIDER_CONTENT")',
    ]),
    /STAGING_COMMAND_FAILED/,
  );
});
