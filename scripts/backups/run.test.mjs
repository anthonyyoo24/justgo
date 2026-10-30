import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { dirname } from 'node:path';
import test from 'node:test';
import { mintUploadCredentials } from './mint-upload-credentials.mjs';
import { runBackup } from './run.mjs';

const policy = {
  version: 1,
  approvalReference: 'synthetic-staging-approval',
  accountId: 'a'.repeat(32),
  bucket: 'justgo-test',
  environment: 'staging',
  jurisdiction: 'default',
  backupDays: 7,
  ledgerDays: 7,
  lockDays: 7,
  ageRecipient: `age1${'a'.repeat(58)}`,
  sourceHost: 'db.kmcpcauaxlgpevkkenwd.supabase.co',
  sourceDatabase: 'postgres',
  sourceProjectRef: 'kmcpcauaxlgpevkkenwd',
  allowCronJobRunDetailsDelete: true,
};
const raw = JSON.stringify(policy);
const env = {
  JUSTGO_BACKUPS_ENABLED: 'approved',
  BACKUP_POLICY_JSON: raw,
  BACKUP_POLICY_SHA256: createHash('sha256').update(raw).digest('hex'),
  BACKUP_DATABASE_CA_CERT: 'synthetic-certificate',
  BACKUP_DATABASE_URL: `postgres://justgo_backup:synthetic@${policy.sourceHost}:5432/postgres`,
  GITHUB_SHA: 'a'.repeat(40),
  BACKUP_SENTRY_DSN: 'synthetic-test-dsn',
  R2_INSPECT_TOKEN: 'synthetic-inspector',
};
const failure = {
  message: 'Encrypted backup failed; inspect protected operator configuration',
};

/**
 * Replace provider/database I/O with recorded steps and an optional injected failure.
 * Capture check-ins, safe reports and the real temporary-directory path so tests can
 * assert health ordering, error redaction and cleanup without network or database use.
 */
function fixture(kind, failAt) {
  const calls = [];
  const checkIns = [];
  const logs = [];
  let directory;
  const step = (name) => {
    calls.push(name);
    if (name === failAt)
      throw new Error('private credential or provider response');
  };
  const client = {
    connect: async () => step('connect'),
    end: async () => step('end'),
  };
  const environment = {
    ...env,
    BACKUP_KIND: kind,
    ...mintUploadCredentials(policy, 'd'.repeat(32), 'e'.repeat(64), 3600),
  };
  const operations = {
    createClient: (connection) => {
      assert.equal(connection.user, 'justgo_backup');
      assert.equal(connection.ssl.rejectUnauthorized, true);
      assert.equal(connection.ssl.ca, env.BACKUP_DATABASE_CA_CERT);
      return client;
    },
    checkIn: async (dsn, slug, status, id) => {
      assert.equal(dsn, env.BACKUP_SENTRY_DSN);
      assert.equal(slug, 'justgo-staging-backup-health');
      assert.equal(id, status === 'in_progress' ? undefined : 'b'.repeat(32));
      checkIns.push(status);
      step(status);
      return 'b'.repeat(32);
    },
    inspectRetention: async (candidate) => {
      assert.deepEqual(candidate, policy);
      step('retention');
    },
    encryptSnapshot: async (input) => {
      directory = dirname(input.destination);
      assert.deepEqual(input.policy, policy);
      assert.equal(input.kind, kind);
      assert.equal(input.client, client);
      step('snapshot');
      return {
        capturedAt: '2026-10-30T17:23:00.000Z',
        migrationDigest: 'f'.repeat(64),
        sourceSha: env.GITHUB_SHA,
        source: 'private-source-not-for-logs',
      };
    },
    artifactMetadata: async () => {
      step('metadata');
      return { bytes: 128, sha256: 'f'.repeat(64) };
    },
    uploadArtifact: async (candidate, _credentials, candidateKind) => {
      assert.deepEqual(candidate, policy);
      assert.equal(candidateKind, kind);
      step('upload');
      return {
        key: `${kind}/synthetic.age`,
        bytes: 128,
        sha256: 'f'.repeat(64),
      };
    },
    verifyRecentDatabaseCopy: async (received) => {
      assert.equal(received, environment);
      step('database-health');
    },
    report: (message) => logs.push(message),
  };
  return {
    environment,
    operations,
    calls,
    checkIns,
    logs,
    directory: () => directory,
  };
}

test('nightly database copy uses no Cron slot and preserves approved snapshot policy', async () => {
  const f = fixture('database');
  const receipt = await runBackup(f.environment, f.operations);
  assert.equal(receipt.key, 'database/synthetic.age');
  assert.deepEqual(f.checkIns, []);
  assert.deepEqual(f.calls, [
    'retention',
    'connect',
    'snapshot',
    'end',
    'metadata',
    'upload',
  ]);
  assert.doesNotMatch(f.logs.join(''), /private|credential|provider/);
  await assert.rejects(access(f.directory()), { code: 'ENOENT' });
});

test('hourly heartbeat reports healthy only after ledger upload and database-copy verification', async () => {
  const f = fixture('ledger');
  await runBackup(f.environment, f.operations);
  assert.deepEqual(f.checkIns, ['in_progress', 'ok']);
  assert.deepEqual(f.calls, [
    'in_progress',
    'retention',
    'connect',
    'snapshot',
    'end',
    'metadata',
    'upload',
    'database-health',
    'ok',
  ]);
  assert.doesNotMatch(f.logs.join(''), /private|credential|provider/);
  await assert.rejects(access(f.directory()), { code: 'ENOENT' });
});

test('stale database evidence keeps the uploaded ledger but reports health error, never ok', async () => {
  const f = fixture('ledger', 'database-health');
  await assert.rejects(runBackup(f.environment, f.operations), failure);
  assert.deepEqual(f.checkIns, ['in_progress', 'error']);
  assert.ok(f.calls.indexOf('upload') < f.calls.indexOf('database-health'));
  assert.equal(f.calls.filter((name) => name === 'upload').length, 1);
  assert.deepEqual(f.logs, []);
  await assert.rejects(access(f.directory()), { code: 'ENOENT' });
});

test('ledger copy failure reports an immediate fixed error and closes its connection', async () => {
  const f = fixture('ledger', 'snapshot');
  await assert.rejects(runBackup(f.environment, f.operations), failure);
  assert.deepEqual(f.checkIns, ['in_progress', 'error']);
  assert.equal(f.calls.filter((name) => name === 'end').length, 1);
  assert.equal(f.calls.includes('upload'), false);
  assert.equal(f.calls.includes('database-health'), false);
  await assert.rejects(access(f.directory()), { code: 'ENOENT' });
});

test('failed database copy stays failed without pretending to be an hourly heartbeat', async () => {
  const f = fixture('database', 'snapshot');
  await assert.rejects(runBackup(f.environment, f.operations), failure);
  assert.deepEqual(f.checkIns, []);
  assert.equal(f.calls.filter((name) => name === 'end').length, 1);
  await assert.rejects(access(f.directory()), { code: 'ENOENT' });
});

test('unavailable heartbeat delivery fails safely and never issues a healthy check-in', async () => {
  const f = fixture('ledger', 'in_progress');
  await assert.rejects(runBackup(f.environment, f.operations), failure);
  assert.deepEqual(f.checkIns, ['in_progress']);
  assert.deepEqual(f.calls, ['in_progress']);
});
