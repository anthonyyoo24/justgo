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
import { abandonedVersionRequested } from './staging-abandoned-version.mjs';

const sha = 'a'.repeat(40),
  previous = 'b'.repeat(40);
const candidateId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const previousId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const deploymentId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const oldDeploymentId = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const otherId = 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee';
const context = { sha, runId: '123', attempt: '1' };
const incident = {
  accountId: '52662d8ba7ae983237860a1719c66a1e',
  abandonedId: 'c0fefad7-9a31-4db7-976a-bfc8fbb0366b',
  baselineId: 'd15d9fbd-1d99-4106-abc4-43b907ba7a2c',
  deploymentId: 'caaa7a54-d4a3-4eec-bdc2-9d5f927142e5',
  baselineSha: '7d8a5624bf7224bc243a342dab22a9d0b82f7f04',
  sha: '39f11c3b6475e4f9666ebf8b2698daf05740920d',
  runId: '41095205288',
  attempt: '1',
  predecessor: {
    abandonedId: '2d6ea61b-2714-4cd9-9437-2a73f9476dd6',
    sha: '8b1e7d5838fa0d3d8d828aedbf15a3ecfbc85ba4',
    runId: '41075504576',
    attempt: '1',
  },
};
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
/** Model the recorded incident's public provenance while retaining fixture secrets. */
function incidentMetadata(id) {
  const value = metadata(id);
  const provenance =
    id === incident.predecessor.abandonedId ? incident.predecessor : incident;
  const source =
    id === incident.baselineId ? incident.baselineSha : provenance.sha;
  const texts = {
    JUSTGO_SOURCE_SHA: source,
    API_SENTRY_RELEASE: source,
    JUSTGO_RELEASE_RUN_ID: provenance.runId,
    JUSTGO_RELEASE_RUN_ATTEMPT: provenance.attempt,
  };
  for (const binding of value.resources.bindings)
    if (Object.hasOwn(texts, binding.name)) binding.text = texts[binding.name];
  value.annotations = {
    'workers/tag': source,
    'workers/message': `JustGO ${source} GitHub ${provenance.runId}/${provenance.attempt}`,
  };
  return value;
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
/**
 * Model upload, promotion and eventual readback without provider or database I/O.
 * failure selects a configuration fault, race or uncertain response; calls/waits
 * retain ordering evidence, and t.after removes only this fixture's temporary root.
 */
function fixture(t, failure, continuation = false) {
  const root = mkdtempSync(join(tmpdir(), 'justgo-staging-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const calls = [],
    waits = [];
  const fixtureEnv = {
    ...env,
    RUNNER_TEMP: root,
    ...(continuation
      ? {
          CLOUDFLARE_ACCOUNT_ID: incident.accountId,
          STAGING_ABANDONED_VERSION_ID: incident.abandonedId,
          STAGING_BASELINE_ID: incident.deploymentId,
          STAGING_BASELINE_SHA: incident.baselineSha,
        }
      : {}),
  };
  const fixtureTarget = cloudflareTarget(fixtureEnv);
  const baselineId = continuation ? incident.baselineId : previousId;
  const baselineDeploymentId = continuation
    ? incident.deploymentId
    : oldDeploymentId;
  let uploaded = false,
    promoted = false,
    reads = 0;
  return {
    root,
    env: fixtureEnv,
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
      assert.deepEqual(_target, fixtureTarget);
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
        const version_id = promoted && !pending ? candidateId : baselineId;
        return {
          deployments: [
            {
              id:
                promoted && !pending
                  ? deploymentId
                  : uploaded && failure === 'alias-race'
                    ? otherId
                    : baselineDeploymentId,
              strategy: 'percentage',
              versions: [{ version_id, percentage: 100 }],
            },
          ],
        };
      }
      if (path === '/versions')
        return {
          items:
            continuation && !uploaded
              ? [
                  { id: incident.abandonedId },
                  { id: incident.predecessor.abandonedId },
                  { id: incident.baselineId },
                ]
              : [
                  {
                    id: uploaded
                      ? candidateId
                      : failure === 'latest-race'
                        ? otherId
                        : baselineId,
                  },
                ],
        };
      if (path.startsWith('/versions/') && options.method !== 'POST') {
        const id = path.split('/').at(-1);
        const version =
          continuation && id !== candidateId
            ? incidentMetadata(id)
            : metadata(id);
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
      assert.deepEqual(options.target, fixtureTarget);
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
        logs: null,
        traces: null,
        issues: null,
      },
    },
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
test('abandoned continuation requires an exact code-only, account-bound opt-in', async (t) => {
  const f = fixture(t, undefined, true);
  const incidentTarget = cloudflareTarget(f.env);
  for (const value of [undefined, ''])
    assert.equal(
      abandonedVersionRequested(
        { ...f.env, STAGING_ABANDONED_VERSION_ID: value },
        incidentTarget,
      ),
      false,
    );
  for (const change of [
    { STAGING_ABANDONED_VERSION_ID: otherId },
    { STAGING_ABANDONED_VERSION_ID: incident.predecessor.abandonedId },
    { STAGING_ABANDONED_VERSION_ID: `${incident.abandonedId}\n` },
    { STAGING_ABANDONED_VERSION_ID: null },
    { RELEASE_OPERATION: 'migrate-deploy' },
    { RELEASE_OPERATION: 'bootstrap' },
    { CLOUDFLARE_ACCOUNT_ID: '1'.repeat(32) },
  ]) {
    await assert.rejects(
      stagingApi('preflight', { ...f, env: { ...f.env, ...change } }),
      /STAGING_ABANDONED_VERSION_REJECTED|INVALID_STAGING_RELEASE_CONTEXT/,
    );
    assert.equal(f.calls.length, 0);
  }
  assert.throws(
    () =>
      abandonedVersionRequested(f.env, {
        ...incidentTarget,
        worker: 'other-worker',
      }),
    /STAGING_ABANDONED_VERSION_REJECTED/,
  );
});
test('the default guard still rejects the recorded abandoned latest version', async (t) => {
  const f = fixture(t, undefined, true);
  delete f.env.STAGING_ABANDONED_VERSION_ID;
  await assert.rejects(
    stagingApi('preflight', f),
    /STAGING_LATEST_VERSION_CHANGED/,
  );
  assert.ok(!f.calls.some((c) => c.method === 'POST' || c.promotion));
});
test('exact incident preflight and replacement recheck provenance before upload', async (t) => {
  const f = fixture(t, undefined, true);
  assert.deepEqual(await stagingApi('preflight', f), {
    deploymentId: incident.deploymentId,
    sourceSha: incident.baselineSha,
  });
  assert.ok(!f.calls.some((c) => c.method === 'POST' || c.promotion));
  f.calls.length = 0;
  const result = await stagingApi('deploy', f);
  assert.equal(result.versionId, candidateId);
  const upload = f.calls.findIndex((c) => c.method === 'POST');
  for (const id of [incident.abandonedId, incident.predecessor.abandonedId]) {
    const abandonedReads = f.calls.flatMap((c, index) =>
      c.path === `/versions/${id}` ? [index] : [],
    );
    assert.equal(abandonedReads.length, 2);
    assert.ok(abandonedReads.every((index) => index < upload));
  }
  assert.equal(f.calls.filter((c) => c.method === 'POST').length, 1);
  assert.equal(f.calls.filter((c) => c.promotion).length, 1);
  assert.equal(f.calls.filter((c) => c.probe).length, 8);
});
const incidentDrifts = [
  [
    'missing version list',
    '/versions',
    (v) => {
      delete v.items;
    },
  ],
  ['reordered versions', '/versions', (v) => v.items.reverse()],
  ['newer version', '/versions', (v) => v.items.unshift({ id: otherId })],
  ['missing baseline version', '/versions', (v) => v.items.pop()],
  ['missing predecessor version', '/versions', (v) => v.items.splice(1, 1)],
  [
    'swapped abandoned versions',
    '/versions',
    (v) => {
      [v.items[0], v.items[1]] = [v.items[1], v.items[0]];
    },
  ],
  [
    'different abandoned version',
    '/versions',
    (v) => {
      v.items[0].id = otherId;
    },
  ],
  [
    'different predecessor version',
    '/versions',
    (v) => {
      v.items[1].id = otherId;
    },
  ],
  [
    'different baseline version',
    '/versions',
    (v) => {
      v.items[2].id = otherId;
    },
  ],
  [
    'predecessor version deployed',
    '/deployments',
    (v) => {
      v.deployments[0].versions[0].version_id =
        incident.predecessor.abandonedId;
    },
  ],
  [
    'extra deployment history',
    '/deployments',
    (v) => v.deployments.push(structuredClone(v.deployments[0])),
  ],
  [
    'changed deployment ID',
    '/deployments',
    (v) => {
      v.deployments[0].id = otherId;
    },
  ],
  [
    'abandoned version deployed',
    '/deployments',
    (v) => {
      v.deployments[0].versions[0].version_id = incident.abandonedId;
    },
  ],
  [
    'split traffic',
    '/deployments',
    (v) => {
      v.deployments[0].versions[0].percentage = 50;
    },
  ],
  [
    'baseline source drift',
    `/versions/${incident.baselineId}`,
    (v) => {
      v.resources.bindings.find((b) => b.name === 'JUSTGO_SOURCE_SHA').text =
        previous;
    },
  ],
  [
    'abandoned ID drift',
    `/versions/${incident.abandonedId}`,
    (v) => {
      v.id = otherId;
    },
  ],
  [
    'preview disabled',
    `/versions/${incident.abandonedId}`,
    (v) => {
      v.metadata.has_preview = false;
    },
  ],
  [
    'missing annotations',
    `/versions/${incident.abandonedId}`,
    (v) => {
      delete v.annotations;
    },
  ],
  ...['workers/tag', 'workers/message'].map((name) => [
    `${name} drift`,
    `/versions/${incident.abandonedId}`,
    (v) => {
      v.annotations[name] += '-changed';
    },
  ]),
  ...[
    'JUSTGO_SOURCE_SHA',
    'API_SENTRY_RELEASE',
    'JUSTGO_RELEASE_RUN_ID',
    'JUSTGO_RELEASE_RUN_ATTEMPT',
  ].map((name) => [
    `${name} drift`,
    `/versions/${incident.abandonedId}`,
    (v) => {
      v.resources.bindings.find((b) => b.name === name).text = previous;
    },
  ]),
  [
    'stable binding drift',
    `/versions/${incident.abandonedId}`,
    (v) => {
      v.resources.bindings.push(
        text('CORS_ORIGINS', 'https://attacker.invalid'),
      );
    },
  ],
];
// The known predecessor must satisfy the same complete provenance/binding checks.
incidentDrifts.push(
  ...incidentDrifts
    .filter(([, path]) => path === `/versions/${incident.abandonedId}`)
    .map(([name, , mutate]) => [
      `predecessor ${name}`,
      `/versions/${incident.predecessor.abandonedId}`,
      mutate,
    ]),
);
for (const [name, path, mutate] of incidentDrifts)
  test(`abandoned continuation rejects ${name} without upload or promotion`, async (t) => {
    const f = fixture(t, undefined, true);
    await assert.rejects(
      stagingApi('deploy', {
        ...f,
        request: async (target, requested, options) => {
          const value = await f.request(target, requested, options);
          if (requested === path) mutate(value);
          return value;
        },
      }),
      (error) => Boolean(stagingRunnerFailureCode(error)),
    );
    assert.ok(!f.calls.some((c) => c.method === 'POST' || c.promotion));
  });
for (const name of [
  'newer version',
  'extra deployment history',
  'workers/message drift',
  'stable binding drift',
  'predecessor workers/message drift',
  'predecessor stable binding drift',
])
  test(`abandoned continuation catches ${name} appearing during build`, async (t) => {
    const f = fixture(t, undefined, true);
    const [, path, mutate] = incidentDrifts.find(([label]) => label === name);
    let built = false;
    await assert.rejects(
      stagingApi('deploy', {
        ...f,
        build: async (...args) => {
          const bundle = await f.build(...args);
          built = true;
          return bundle;
        },
        request: async (target, requested, options) => {
          const value = await f.request(target, requested, options);
          if (built && requested === path) mutate(value);
          return value;
        },
      }),
      (error) => Boolean(stagingRunnerFailureCode(error)),
    );
    assert.equal(built, true);
    assert.ok(!f.calls.some((c) => c.method === 'POST' || c.promotion));
  });
test('a replacement with failing previews stays unpromoted and cannot reuse this incident', async (t) => {
  const f = fixture(t, 'candidate-probe', true);
  await assert.rejects(stagingApi('deploy', f), /INVALID_STAGING_PROBE/);
  assert.equal(f.calls.filter((c) => c.method === 'POST').length, 1);
  assert.ok(!f.calls.some((c) => c.promotion));
  await assert.rejects(
    stagingApi('preflight', f),
    /STAGING_ABANDONED_VERSION_REJECTED/,
  );
  assert.equal(f.calls.filter((c) => c.method === 'POST').length, 1);
});
test('replacement upload returns to the ordinary latest-version guard', async (t) => {
  const f = fixture(t, undefined, true);
  await assert.rejects(
    stagingApi('deploy', {
      ...f,
      request: async (target, path, options) => {
        const value = await f.request(target, path, options);
        if (path === '/versions' && f.calls.some((c) => c.method === 'POST'))
          value.items[0].id = incident.abandonedId;
        return value;
      },
    }),
    /STAGING_LATEST_VERSION_CHANGED/,
  );
  assert.equal(f.calls.filter((c) => c.method === 'POST').length, 1);
  assert.ok(!f.calls.some((c) => c.promotion));
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
