import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  chmodSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  localReleaseArguments,
  localStagingContext,
  assertLocalSource,
  localReleaseConfiguration,
  localBuildEnvironment,
  localStagingApi,
  localPublicationEnvironment,
  runLocalPublicationChecks,
} from './staging-local.mjs';

const sha = 'a'.repeat(40);
const phaseBranch = 'codex/phase-16-billing';
const source = { sha, phaseBranch };
const releaseArgs = (mode, branch = phaseBranch, commit = sha) => [
  mode,
  '--phase-branch',
  branch,
  '--source',
  commit,
  '--credentials',
  'protected.json',
];
const git = async (_command, args) =>
  args[0] === 'branch' ? phaseBranch : args[0] === 'rev-parse' ? sha : '';
const configuration = {
  CLOUDFLARE_API_TOKEN: 'synthetic-private-token',
  CLOUDFLARE_ACCOUNT_ID: '1'.repeat(32),
  CLOUDFLARE_WORKERS_SUBDOMAIN: 'fixture-account',
  STAGING_HYPERDRIVE_ID: '2'.repeat(32),
  MIGRATION_DATABASE_URL: '',
  DATABASE_CA_CERT: 'synthetic-ca',
};

test('local command explicitly selects exact committed source and prepare or deploy', () => {
  for (const mode of ['--prepare', '--deploy']) {
    assert.deepEqual(localReleaseArguments(releaseArgs(mode)), {
      deploy: mode === '--deploy',
      ...source,
      credentials: 'protected.json',
    });
  }
  for (const args of [
    [],
    ['--deploy'],
    ['--deploy', '--source', sha, '--credentials', 'private'],
    releaseArgs('--bootstrap'),
    releaseArgs('--migrate-deploy'),
    releaseArgs('--deploy', phaseBranch, 'main'),
    releaseArgs('--deploy', 'main'),
    releaseArgs('--deploy', ''),
    [...releaseArgs('--deploy'), '--force'],
  ])
    assert.throws(
      () => localReleaseArguments(args),
      /INVALID_LOCAL_STAGING_CONTEXT/,
    );
});

test('local provenance is truthful and performs only local Git reads', async () => {
  const calls = [];
  const context = await localStagingContext(source, {
    env: {},
    run: async (...args) => {
      calls.push(args);
      return git(...args);
    },
  });
  assert.equal(context.sha, sha);
  assert.equal(context.phaseBranch, phaseBranch);
  assert.match(context.runId, /^local-[a-f0-9-]{36}$/);
  assert.equal(context.attempt, '1');
  assert.ok(Object.isFrozen(context));
  assert.deepEqual(
    calls.map(([command, args]) => [command, ...args]),
    [
      ['git', 'branch', '--show-current'],
      ['git', 'rev-parse', 'HEAD'],
      ['git', 'status', '--porcelain'],
    ],
  );
});

for (const [name, env] of Object.entries({
  ci: { CI: '1' },
  github: { GITHUB_ACTIONS: 'true' },
  githubRun: { GITHUB_RUN_ID: '123' },
  vercel: { VERCEL: '1' },
  eas: { EAS_BUILD: 'true' },
  migrations: { RELEASE_OPERATION: 'migrate-deploy' },
  plan: { MIGRATION_PLAN_SHA256: 'a'.repeat(64) },
  recovery: { STAGING_RECOVERY_ATTESTATION: '{}' },
  abandoned: { STAGING_ABANDONED_VERSION_ID: 'private' },
}))
  test(`local context rejects ${name} before any source or provider call`, async () => {
    let called = false;
    await assert.rejects(
      localStagingContext(source, {
        env,
        run: async () => {
          called = true;
          return '';
        },
      }),
      /INVALID_LOCAL_STAGING_CONTEXT/,
    );
    assert.equal(called, false);
  });

for (const [name, override] of Object.entries({
  branch: { branch: 'main' },
  'another phase': { branch: 'codex/phase-15-rollout' },
  'detached HEAD': { branch: '' },
  source: { 'rev-parse': 'b'.repeat(40) },
  dirty: { status: ' M apps/api/src/worker.ts' },
  untracked: { status: '?? unreviewed.ts' },
}))
  test(`local source rejects ${name}`, async () => {
    await assert.rejects(
      assertLocalSource(source, {
        run: async (command, args) => override[args[0]] ?? git(command, args),
      }),
      /STAGING_SOURCE_NOT_CLEAN/,
    );
  });

test('credentials require an owner-only regular file and closed fields', (t) => {
  const folder = mkdtempSync(join(tmpdir(), 'justgo-local-release-'));
  t.after(() => rmSync(folder, { recursive: true, force: true }));
  const path = join(folder, 'credentials.json');
  const save = (value) =>
    writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
  save(configuration);
  assert.deepEqual(localReleaseConfiguration(path), configuration);
  chmodSync(path, 0o644);
  assert.throws(
    () => localReleaseConfiguration(path),
    /INVALID_LOCAL_STAGING_CONFIGURATION/,
  );
  chmodSync(path, 0o600);
  const alias = join(folder, 'alias');
  symlinkSync(path, alias);
  assert.throws(
    () => localReleaseConfiguration(alias),
    /INVALID_LOCAL_STAGING_CONFIGURATION/,
  );
  for (const value of [
    { ...configuration, CLOUDFLARE_API_TOKEN: 'token\nprivate' },
    { ...configuration, MIGRATION_DATABASE_URL: '[SENSITIVE]' },
    { ...configuration, UNREVIEWED_OVERRIDE: 'private' },
    { ...configuration, STAGING_HYPERDRIVE_ID: 'invalid' },
    [],
    null,
  ]) {
    save(value);
    assert.throws(
      () => localReleaseConfiguration(path),
      /INVALID_LOCAL_STAGING_CONFIGURATION/,
    );
  }
});

test('local child environment omits DB, CA, inherited keys and GitHub context', () => {
  const result = localBuildEnvironment(configuration, {
    PATH: '/synthetic/bin',
    HOME: '/synthetic/home',
    GITHUB_ACTIONS: 'true',
    PRIVATE_KEY: 'private',
    MIGRATION_DATABASE_URL: 'private',
    DATABASE_CA_CERT: 'private',
  });
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      'PATH',
      'HOME',
      'CLOUDFLARE_API_TOKEN',
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_WORKERS_SUBDOMAIN',
      'STAGING_HYPERDRIVE_ID',
    ].sort(),
  );
});

test('local wrapper rejects migration operations and false provenance', async () => {
  for (const operation of ['bootstrap', 'migrate-deploy', 'production'])
    await assert.rejects(
      localStagingApi(operation, {}),
      /INVALID_LOCAL_STAGING_CONTEXT/,
    );
  for (const context of [
    undefined,
    { sha, runId: '123', attempt: '1' },
    { sha: 'invalid', runId: 'local-a', attempt: '1' },
  ])
    await assert.rejects(
      localStagingApi('preflight', { context }),
      /INVALID_LOCAL_STAGING_CONTEXT/,
    );
});

test('publication gates use isolated DB credentials and stop at the first failed command', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'justgo-local-gates-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const { mkdirSync } = await import('node:fs');
  mkdirSync(join(root, 'apps/api'), { recursive: true });
  const path = join(root, 'apps/api/.env');
  const local = '@127.0.0.1:54329/justgo_test';
  writeFileSync(
    path,
    `DATABASE_URL=postgresql://justgo_runtime:fixture${local}\nMIGRATION_DATABASE_URL=postgresql://justgo_migrator:fixture${local}\nJUSTGO_TEST_ADMIN_DATABASE_URL=postgresql://postgres:fixture${local}\nDATABASE_SSL=disable\n`,
  );
  const env = localPublicationEnvironment(root, {
    PATH: '/bin',
    HOME: '/home',
    CLOUDFLARE_API_TOKEN: 'private',
  });
  assert.ok(!Object.hasOwn(env, 'CLOUDFLARE_API_TOKEN'));
  let calls = [];
  const passed = await runLocalPublicationChecks(root, {
    env: {},
    run: async (command, args) => {
      calls.push([command, args]);
    },
  });
  assert.deepEqual(passed, [
    'doctor',
    'check:static',
    'coverage-including-database',
    'workers',
    'selected-journeys',
  ]);
  assert.deepEqual(calls.slice(0, 3), [
    ['pnpm', ['--filter', '@justgo/mobile', 'run', 'doctor']],
    ['pnpm', ['run', 'check:static']],
    ['pnpm', ['run', 'test:coverage']],
  ]);
  assert.equal(calls.length, 5);
  calls = [];
  await assert.rejects(
    runLocalPublicationChecks(root, {
      run: async (command, args) => {
        calls.push([command, args]);
        throw new Error('safe check failure');
      },
    }),
    /safe check failure/,
  );
  assert.equal(calls.length, 1);
  writeFileSync(
    path,
    `DATABASE_URL=postgresql://justgo_runtime:fixture@hosted.invalid/postgres\n`,
  );
  calls = [];
  await assert.rejects(
    runLocalPublicationChecks(root, {
      run: async () => calls.push('unexpected'),
    }),
  );
  assert.equal(calls.length, 0);
});
