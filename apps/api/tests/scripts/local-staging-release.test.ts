import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  configure: vi.fn(),
  source: vi.fn(),
  api: vi.fn(),
  bundle: vi.fn(),
  checks: vi.fn(),
  sourceCheck: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  construct: vi.fn(),
  watch: vi.fn(),
  stop: vi.fn(),
  lease: vi.fn(),
  release: vi.fn(),
  tls: vi.fn(),
}));
vi.mock('../../../../scripts/release/staging-local.mjs', async (original) => ({
  ...(await original<
    typeof import('../../../../scripts/release/staging-local.mjs')
  >()),
  localReleaseConfiguration: mocks.configure,
  localStagingContext: mocks.source,
  localStagingApi: mocks.api,
  prepareLocalBundle: mocks.bundle,
  runLocalPublicationChecks: mocks.checks,
  assertLocalSource: mocks.sourceCheck,
}));
vi.mock('pg', () => ({
  Client: class {
    constructor(options: unknown) {
      mocks.construct(options);
    }
    connect = mocks.connect;
    end = mocks.end;
  },
}));
vi.mock('../../scripts/staging-release-guard.js', async (original) => ({
  ...(await original<
    typeof import('../../scripts/staging-release-guard.js')
  >()),
  hostedMigrationOptions: () => ({}),
  requireVerifiedTls: mocks.tls,
  watchReleaseConnection: mocks.watch,
  assertReleaseLease: mocks.lease,
  withStagingRelease: mocks.release,
}));
import { runLocalStagingRelease } from '../../scripts/local-staging-release.js';

const sha = 'a'.repeat(40);
const phaseBranch = 'codex/phase-16-billing';
const context = {
  sha,
  phaseBranch,
  runId: 'local-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  attempt: '1',
};
let folder: string;
let signal: AbortSignal;
const args = (deploy = false) => [
  deploy ? '--deploy' : '--prepare',
  '--phase-branch',
  phaseBranch,
  '--source',
  sha,
  '--credentials',
  'protected.json',
];
beforeEach(() => {
  vi.resetAllMocks();
  folder = mkdtempSync(join(tmpdir(), 'justgo-local-staging-'));
  vi.spyOn(process, 'cwd').mockReturnValue(folder);
  signal = new AbortController().signal;
  mocks.configure.mockReturnValue({
    CLOUDFLARE_API_TOKEN: 'private',
    CLOUDFLARE_ACCOUNT_ID: '1'.repeat(32),
    CLOUDFLARE_WORKERS_SUBDOMAIN: 'fixture',
    STAGING_HYPERDRIVE_ID: '2'.repeat(32),
    MIGRATION_DATABASE_URL: '',
    DATABASE_CA_CERT: 'private-ca',
  });
  mocks.source.mockResolvedValue(context);
  mocks.api.mockImplementation(async (operation) =>
    operation === 'preflight'
      ? { deploymentId: 'baseline', sourceSha: 'b'.repeat(40) }
      : { sourceSha: sha, versionId: 'candidate', deploymentId: 'deployed' },
  );
  mocks.bundle.mockResolvedValue({ uploadSha256: 'c'.repeat(64), bytes: 100 });
  mocks.checks.mockResolvedValue([
    'doctor',
    'check:static',
    'coverage-including-database',
    'workers',
    'selected-journeys',
  ]);
  mocks.watch.mockReturnValue({ signal, stop: mocks.stop });
  mocks.release.mockImplementation(async (_client, options, work) => {
    expect(await options.previousApiSha()).toBe('b'.repeat(40));
    return work({ pending: [] });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});
function withDatabase() {
  mocks.configure.mockReturnValue({
    ...mocks.configure(),
    MIGRATION_DATABASE_URL: 'protected-hosted-url',
  });
}

it('prepares inspected local source without a DB credential or any upload', async () => {
  const result = await runLocalStagingRelease(args());
  expect(result).toMatchObject({
    databaseVerified: false,
    deployReady: false,
    deployed: false,
    phaseBranch,
    pendingMigrations: null,
    publicationChecks: [],
    missing: ['MIGRATION_DATABASE_URL'],
  });
  expect(mocks.construct).not.toHaveBeenCalled();
  expect(mocks.source).toHaveBeenCalledWith(
    expect.objectContaining({ sha, phaseBranch }),
  );
  expect(mocks.checks).not.toHaveBeenCalled();
  expect(mocks.api.mock.calls.map(([operation]) => operation)).toEqual([
    'preflight',
  ]);
  expect(mocks.bundle).toHaveBeenCalledOnce();
});
it('deploy with missing DB connection stops before checks, provider access and database work', async () => {
  await expect(runLocalStagingRelease(args(true))).rejects.toThrow(
    'LOCAL_STAGING_DATABASE_CONNECTION_REQUIRED',
  );
  expect(mocks.checks).not.toHaveBeenCalled();
  expect(mocks.api).not.toHaveBeenCalled();
  expect(mocks.construct).not.toHaveBeenCalled();
});
it('runs publication checks then holds the code-only lease through deployment and promotion check', async () => {
  withDatabase();
  mocks.api.mockImplementation(async (operation, options) => {
    if (operation === 'preflight')
      return { deploymentId: 'baseline', sourceSha: 'b'.repeat(40) };
    await options.beforePromote();
    return { versionId: 'candidate', deploymentId: 'deployed' };
  });
  const result = await runLocalStagingRelease(args(true));
  expect(result).toMatchObject({
    databaseVerified: true,
    deployReady: true,
    deployed: true,
    missing: [],
  });
  expect(mocks.checks.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.connect.mock.invocationCallOrder[0]!,
  );
  expect(mocks.release.mock.calls[0]![1]).toMatchObject({
    operation: 'deploy',
    sourceSha: sha,
    expectedDatabase: 'postgres',
  });
  expect(mocks.release.mock.calls[0]![1]).not.toHaveProperty('planDigest');
  expect(mocks.release.mock.calls[0]![1]).not.toHaveProperty('attestation');
  expect(mocks.api.mock.calls.map(([operation]) => operation)).toEqual([
    'preflight',
    'deploy',
  ]);
  expect(mocks.api.mock.calls[1]![1].env).toMatchObject({
    STAGING_BASELINE_ID: 'baseline',
    STAGING_BASELINE_SHA: 'b'.repeat(40),
  });
  expect(mocks.lease).toHaveBeenCalledOnce();
  expect(mocks.tls).toHaveBeenCalledOnce();
  expect(mocks.end).toHaveBeenCalledOnce();
  expect(mocks.stop).toHaveBeenCalledOnce();
  const env = mocks.api.mock.calls[0]![1].env;
  expect(env).not.toHaveProperty('MIGRATION_DATABASE_URL');
  expect(env).not.toHaveProperty('DATABASE_CA_CERT');
});
it('prepares with pending migrations under the DB lease without checks or deployment', async () => {
  withDatabase();
  mocks.release.mockImplementationOnce(async (_client, options, work) => {
    expect(options.operation).toBe('prepare');
    expect(await options.previousApiSha()).toBe('b'.repeat(40));
    return work({ pending: [{ tag: '0001_pending' }] });
  });
  const result = await runLocalStagingRelease(args());
  expect(result).toMatchObject({
    databaseVerified: true,
    deployReady: false,
    deployed: false,
    publicationChecks: [],
    pendingMigrations: ['0001_pending'],
  });
  expect(mocks.api.mock.calls.map(([operation]) => operation)).toEqual([
    'preflight',
  ]);
  expect(mocks.lease).toHaveBeenCalledOnce();
});
it.each(['checks', 'source'])(
  'failed %s blocks before database and provider access',
  async (stage) => {
    withDatabase();
    (stage === 'checks'
      ? mocks.checks
      : mocks.sourceCheck
    ).mockRejectedValueOnce(new Error('safe failure'));
    await expect(runLocalStagingRelease(args(true))).rejects.toThrow(
      'safe failure',
    );
    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.api).not.toHaveBeenCalled();
  },
);
it('history or pending-migration failure cannot reach upload and closes the DB watcher', async () => {
  withDatabase();
  mocks.release.mockRejectedValueOnce(
    new Error('reviewed_pending_migration_plan_required'),
  );
  await expect(runLocalStagingRelease(args(true))).rejects.toThrow(
    'reviewed_pending_migration_plan_required',
  );
  expect(mocks.api).not.toHaveBeenCalled();
  expect(mocks.end).toHaveBeenCalledOnce();
  expect(mocks.stop).toHaveBeenCalledOnce();
});
