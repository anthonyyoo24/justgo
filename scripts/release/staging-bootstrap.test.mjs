import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  bootstrapBindings,
  bootstrapStagingWorker,
} from './staging-bootstrap.mjs';
import { cloudflareTarget, stagingRunnerFailureCode } from './staging-api.mjs';

const sha = 'a'.repeat(40);
const versionId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const deploymentId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const otherId = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';
const privateValue = 'PRIVATE_FIXTURE_VALUE_'.repeat(2);
const configuration = {
  secrets: Object.fromEntries(
    [
      'IDENTITY_RATE_LIMIT_KEY',
      'SUPABASE_AUTH_SECRET_KEY',
      'SUPABASE_PUBLISHABLE_KEY',
      'LOCK_DATABASE_URL',
      'BETA_ACCESS_GRANTS',
      'BETA_ACCESS_WINDOW',
    ].map((name) => [name, privateValue]),
  ),
  vars: { API_SENTRY_ENABLED: 'false' },
};
const env = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'anthonyyoo24/justgo',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  RELEASE_SHA: sha,
  RELEASE_OPERATION: 'bootstrap',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
  CLOUDFLARE_ACCOUNT_ID: '1'.repeat(32),
  CLOUDFLARE_WORKERS_SUBDOMAIN: 'fixture-account',
  STAGING_HYPERDRIVE_ID: '2'.repeat(32),
  CLOUDFLARE_API_TOKEN: privateValue,
  MIGRATION_DATABASE_URL: privateValue,
  DATABASE_CA_CERT: privateValue,
  STAGING_BOOTSTRAP_BINDINGS: JSON.stringify(configuration),
};
const target = cloudflareTarget(env);
const context = { sha, runId: '123', attempt: '1' };
function fixture(t, failure) {
  const root = mkdtempSync(join(tmpdir(), 'justgo-bootstrap-test-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const calls = [];
  const controller = new AbortController();
  let uploaded = false,
    built = false,
    routes = failure === 'routes-exist';
  let bindings;
  return {
    env: { ...env, RUNNER_TEMP: root },
    root,
    calls,
    run: async (binary, args, options) => {
      calls.push({ command: binary, args });
      for (const name of [
        'STAGING_BOOTSTRAP_BINDINGS',
        'CLOUDFLARE_API_TOKEN',
        'MIGRATION_DATABASE_URL',
        'DATABASE_CA_CERT',
      ])
        assert.equal(options.env[name], undefined);
      if (binary === 'git') {
        if (args[0] === 'rev-parse')
          return failure === 'source-sha' ? 'b'.repeat(40) : sha;
        return failure === 'dirty' || (failure === 'dirty-after-build' && built)
          ? ' M private'
          : '';
      }
      assert.equal(binary, 'gh');
      assert.deepEqual(args.slice(0, 3), ['api', '--method', 'GET']);
      const path = args.at(-1);
      if (path.includes('ci.yml/runs')) {
        assert.ok(
          path.endsWith(`head_sha=${sha}&event=push&branch=main&per_page=1`),
        );
        return JSON.stringify({
          workflow_runs: [
            {
              head_sha: sha,
              head_branch: 'main',
              event: 'push',
              status: 'completed',
              conclusion: failure === 'ci' ? 'failure' : 'success',
            },
          ],
        });
      }
      if (path.endsWith('deployment-branch-policies'))
        return JSON.stringify({
          total_count: 1,
          branch_policies: [{ name: 'main', type: 'branch' }],
        });
      return JSON.stringify({
        name: 'justgo-staging',
        deployment_branch_policy: { custom_branch_policies: true },
        protection_rules:
          failure === 'protection'
            ? []
            : [
                {
                  type: 'required_reviewers',
                  reviewers: [{ type: 'User', reviewer: { id: 51426358 } }],
                },
              ],
      });
    },
    withDatabase: async (_options, upload) => {
      calls.push({ database: 'locked-and-current' });
      if (failure === 'migrations')
        throw new Error('private migration failure');
      return upload({
        signal: controller.signal,
        assertLease: async () => {
          calls.push({ lease: true });
          if (failure === 'lease') throw new Error('private lease failure');
        },
      });
    },
    build: async (options) => {
      built = true;
      calls.push({ build: true });
      assert.equal(options.env.STAGING_BOOTSTRAP_BINDINGS, undefined);
      assert.equal(options.env.CLOUDFLARE_API_TOKEN, undefined);
      if (failure === 'aborted-build') controller.abort();
      return {
        content: Buffer.from('reviewed worker bytes'),
        uploadSha256: 'd'.repeat(64),
        configuration: {
          compatibility_date: '2026-10-28',
          compatibility_flags: ['nodejs_compat'],
          placement: { region: 'aws:ca-central-1' },
        },
      };
    },
    request: async (_target, path, options) => {
      calls.push({ path, method: options.method ?? 'GET' });
      assert.deepEqual(_target, target);
      if (path === '/settings') {
        if (!uploaded) {
          assert.equal(options.allowMissing, true);
          if (failure === 'unknown-absence') throw new Error(privateValue);
          return failure === 'existing' ||
            (failure === 'existing-race' && built)
            ? {}
            : null;
        }
        return {
          observability: { enabled: failure === 'logs' },
          logpush: false,
          tail_consumers:
            failure === 'tails' ? [{ service: 'unexpected' }] : [],
        };
      }
      if (path.startsWith('/hyperdrive/'))
        return {
          id: target.hyperdriveId,
          caching: { disabled: failure !== 'hyperdrive' },
          origin: {
            host: 'db.kmcpcauaxlgpevkkenwd.supabase.co',
            database: 'postgres',
            user: 'justgo_runtime',
            scheme: 'postgres',
            port: 5432,
          },
          mtls: { sslmode: 'verify-full', ca_certificate_id: versionId },
          origin_connection_limit: 5,
        };
      if (path === '/workers/subdomain') return { subdomain: target.subdomain };
      if (path.startsWith('?')) {
        assert.equal(options.method, 'PUT');
        const metadata = JSON.parse(options.body.get('metadata'));
        assert.deepEqual(metadata.observability, { enabled: false });
        assert.equal(metadata.logpush, false);
        assert.deepEqual(metadata.tail_consumers, []);
        assert.equal(
          await options.body.get('worker.js').text(),
          'reviewed worker bytes',
        );
        assert.equal(
          metadata.bindings.find(
            (binding) => binding.name === 'LOCK_DATABASE_URL',
          ).text,
          privateValue,
        );
        bindings = metadata.bindings.map(({ text, ...binding }) =>
          binding.type === 'secret_text' ? binding : { ...binding, text },
        );
        if (failure === 'bindings')
          bindings.find(
            (binding) => binding.name === 'API_SENTRY_ENABLED',
          ).text = 'true';
        if (failure === 'provenance')
          bindings.find(
            (binding) => binding.name === 'JUSTGO_SOURCE_SHA',
          ).text = 'b'.repeat(40);
        uploaded = true;
        if (failure === 'upload-lost') throw new Error(privateValue);
        return {
          deployment_id:
            failure === 'upload-id' ? 'invalid' : versionId.replaceAll('-', ''),
        };
      }
      if (path === '/deployments')
        return {
          deployments: [
            {
              id: deploymentId,
              strategy: 'percentage',
              versions: [
                {
                  version_id: failure === 'deployment' ? otherId : versionId,
                  percentage: 100,
                },
              ],
            },
          ],
        };
      if (path === '/versions')
        return { items: [{ id: failure === 'latest' ? otherId : versionId }] };
      if (path.startsWith('/versions/'))
        return {
          id: versionId,
          metadata: { has_preview: routes },
          resources: { bindings },
        };
      if (path === '/subdomain') {
        if (options.method === 'POST') {
          assert.deepEqual(JSON.parse(options.body), {
            enabled: true,
            previews_enabled: true,
          });
          routes = failure !== 'route-readback';
          if (failure === 'route-lost') throw new Error(privateValue);
        }
        return { enabled: routes, previews_enabled: routes };
      }
      throw new Error(`Unexpected fixture path ${path}`);
    },
    probe: async (origin, path) => {
      calls.push({ probe: origin + path });
      if (failure === 'probe') throw new Error(privateValue);
      const unauthorized = path.startsWith('/v1/');
      const id = '12345678-1234-1234-1234-123456789012';
      return {
        status: unauthorized ? 401 : 200,
        headers: {
          'cache-control': 'no-store',
          'content-type': 'application/json',
          'x-request-id': id,
          'x-justgo-source-sha': sha,
          'x-justgo-environment': 'staging',
        },
        body: JSON.stringify(
          unauthorized
            ? { code: 'UNAUTHORIZED', requestId: id }
            : path === '/health'
              ? { status: 'ok', service: 'justgo-api' }
              : { status: 'ready' },
        ),
      };
    },
    summary: (text) => assert.ok(!text.includes(privateValue)),
  };
}

for (const setup of [undefined, 'routes-exist'])
  test(`bootstrap uploads inspected code and complete secrets once, with exact readback (${setup ?? 'new routes'})`, async (t) => {
    const f = fixture(t, setup);
    const receipt = await bootstrapStagingWorker(f);
    assert.deepEqual(receipt, {
      sourceSha: sha,
      versionId,
      deploymentId,
      uploadSha256: 'd'.repeat(64),
      runId: '123',
      runAttempt: '1',
    });
    assert.equal(f.calls.filter((call) => call.method === 'PUT').length, 1);
    assert.equal(
      f.calls.filter((call) => call.method === 'POST').length,
      setup ? 0 : 1,
    );
    assert.equal(f.calls.filter((call) => call.probe).length, 8);
    assert.ok(!JSON.stringify(receipt).includes(privateValue));
    assert.deepEqual(readdirSync(f.root), []);
    const upload = f.calls.findIndex((call) => call.method === 'PUT');
    assert.equal(f.calls[upload - 1].lease, true);
    assert.ok(
      f.calls.findIndex((call) => call.database) <
        f.calls.findIndex((call) => call.build),
    );
  });

for (const failure of [
  'source-sha',
  'dirty',
  'ci',
  'protection',
  'migrations',
  'unknown-absence',
  'existing',
  'hyperdrive',
  'existing-race',
  'dirty-after-build',
  'lease',
  'aborted-build',
])
  test(`${failure} prevents every cloud mutation`, async (t) => {
    const f = fixture(t, failure);
    await assert.rejects(bootstrapStagingWorker(f));
    assert.equal(
      f.calls.filter((call) =>
        ['PUT', 'POST', 'DELETE', 'PATCH'].includes(call.method),
      ).length,
      0,
    );
    assert.deepEqual(readdirSync(f.root), []);
  });

for (const failure of [
  'upload-lost',
  'upload-id',
  'deployment',
  'latest',
  'bindings',
  'provenance',
  'logs',
  'tails',
  'route-lost',
  'route-readback',
  'probe',
])
  test(`${failure} reports uncertain bootstrap, never repeats upload or rolls back`, async (t) => {
    const f = fixture(t, failure);
    await assert.rejects(bootstrapStagingWorker(f), (error) => {
      assert.equal(
        stagingRunnerFailureCode(error),
        'STAGING_BOOTSTRAP_UNCONFIRMED',
      );
      assert.ok(!error.message.includes(privateValue));
      return true;
    });
    assert.equal(f.calls.filter((call) => call.method === 'PUT').length, 1);
    assert.ok(f.calls.filter((call) => call.method === 'POST').length <= 1);
    if (!['route-lost', 'route-readback', 'probe'].includes(failure))
      assert.equal(f.calls.filter((call) => call.method === 'POST').length, 0);
    assert.ok(
      !f.calls.some((call) => ['DELETE', 'PATCH'].includes(call.method)),
    );
    assert.deepEqual(readdirSync(f.root), []);
  });

test('bootstrap rejects local, non-main, non-dispatch and migration contexts before I/O', async (t) => {
  for (const change of [
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_EVENT_NAME: 'push' },
    { RELEASE_OPERATION: 'deploy' },
    { MIGRATION_PLAN_SHA256: 'a'.repeat(64) },
    { STAGING_RECOVERY_ATTESTATION: '{}' },
  ]) {
    const f = fixture(t);
    await assert.rejects(
      bootstrapStagingWorker({ ...f, env: { ...f.env, ...change } }),
      /INVALID_STAGING_RELEASE_CONTEXT/,
    );
    assert.equal(f.calls.length, 0);
  }
});

test('bootstrap bindings reject unknown values, absent secrets and caller-provided source or target overrides', () => {
  bootstrapBindings(JSON.stringify(configuration), target, context);
  for (const raw of [
    undefined,
    privateValue,
    'x'.repeat(65537),
    'null',
    '{}',
    JSON.stringify({ ...configuration, vars: { JUSTGO_SOURCE_SHA: sha } }),
    JSON.stringify({ ...configuration, vars: { NODE_ENV: 'development' } }),
    JSON.stringify({ ...configuration, vars: { DATABASE_URL: privateValue } }),
    JSON.stringify({
      ...configuration,
      secrets: { ...configuration.secrets, LOCK_DATABASE_URL: '' },
    }),
    JSON.stringify({
      ...configuration,
      secrets: { ...configuration.secrets, BETA_ACCESS_GRANTS: undefined },
    }),
    JSON.stringify({
      ...configuration,
      secrets: { ...configuration.secrets, SUPABASE_AUTH_SECRET_KEY: 1 },
    }),
  ])
    assert.throws(
      () => bootstrapBindings(raw, target, context),
      /STAGING_BOOTSTRAP_BINDINGS_REQUIRED/,
    );
});

test('the real tsx entry adapter validates runtime bindings before opening its database connection', () => {
  const source = `
    import { withBootstrapDatabase } from './scripts/release/staging-bootstrap.mjs';
    import { stagingRunnerFailureCode } from './scripts/release/staging-api.mjs';
    try {
      await withBootstrapDatabase({ env: {}, bindings: [] }, async () => {
        throw new Error('Upload callback must not run');
      });
      process.exitCode = 1;
    } catch (error) {
      if (stagingRunnerFailureCode(error) !== 'STAGING_BOOTSTRAP_BINDINGS_REQUIRED')
        process.exitCode = 1;
    }
  `;
  assert.equal(
    execFileSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', source],
      {
        cwd: new URL('../..', import.meta.url),
        encoding: 'utf8',
        timeout: 10_000,
      },
    ),
    '',
  );
});
