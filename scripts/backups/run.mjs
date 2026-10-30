import { Client } from 'pg';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  readPolicy,
  databaseConnection,
  databaseSource,
  uploadCredentials,
} from './configuration.mjs';
import {
  artifactMetadata,
  inspectRetention,
  uploadArtifact,
} from './storage.mjs';
import { encryptSnapshot } from './snapshot.mjs';
import { checkIn } from './monitor.mjs';
import { verifyRecentDatabaseCopy } from './workflow-health.mjs';

/**
 * Create and verify one encrypted database or ledger copy under the approved
 * source/retention policy. Only ledger runs drive the shared health monitor;
 * they report success after both their upload and recent database-copy evidence.
 * Source connections and temporary ciphertext/CA files are cleaned up after
 * success or failure of this operation.
 *
 * @param env Protected job configuration, including the explicit activation gate.
 * @param operations Injectable external I/O used to test ordering and failures.
 * @returns The verified upload receipt; operational failures omit private details.
 */
export async function runBackup(env = process.env, operations = {}) {
  const io = {
    createClient: (connection) => new Client(connection),
    inspectRetention,
    encryptSnapshot,
    artifactMetadata,
    uploadArtifact,
    checkIn,
    verifyRecentDatabaseCopy,
    report: console.log,
    ...operations,
  };
  if (env.JUSTGO_BACKUPS_ENABLED !== 'approved')
    throw new Error('Backups are not enabled');
  const kind = env.BACKUP_KIND;
  if (!['database', 'ledger'].includes(kind))
    throw new Error('Invalid backup kind');
  const policy = readPolicy(env.BACKUP_POLICY_JSON, env.BACKUP_POLICY_SHA256);
  if (
    !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') ||
    !env.BACKUP_DATABASE_CA_CERT
  )
    throw new Error('Reviewed source and database CA required');
  const slug = `justgo-${policy.environment}-backup-health`;
  const monitorsHealth = kind === 'ledger';
  let client, directory, monitorId;
  try {
    if (monitorsHealth)
      monitorId = await io.checkIn(env.BACKUP_SENTRY_DSN, slug, 'in_progress');
    directory = await mkdtemp(join(tmpdir(), 'justgo-encrypted-backup-'));
    const credentials = uploadCredentials(env, policy);
    await io.inspectRetention(policy, env.R2_INSPECT_TOKEN);
    const connection = databaseConnection(env.BACKUP_DATABASE_URL, policy);
    const rootCert = join(directory, 'database-ca.pem');
    await writeFile(rootCert, env.BACKUP_DATABASE_CA_CERT, {
      mode: 0o600,
      flag: 'wx',
    });
    connection.ssl.ca = env.BACKUP_DATABASE_CA_CERT;
    client = io.createClient(connection);
    await client.connect();
    const destination = join(directory, 'snapshot.age');
    const metadata = await io.encryptSnapshot({
      kind,
      client,
      connection,
      rootCert,
      recipient: policy.ageRecipient,
      destination,
      migrationsDirectory: new URL('../../apps/api/drizzle/', import.meta.url)
        .pathname,
      pgBin: env.JUSTGO_PG_BIN,
      sourceSha: env.GITHUB_SHA,
      source: databaseSource(policy),
      policy,
    });
    await client.end();
    client = undefined;
    const id = `${metadata.capturedAt}-${randomUUID()}`;
    const receipt = await io.uploadArtifact(
      policy,
      credentials,
      kind,
      destination,
      id,
      await io.artifactMetadata(destination),
    );
    if (monitorsHealth) {
      await io.verifyRecentDatabaseCopy(env);
      await io.checkIn(env.BACKUP_SENTRY_DSN, slug, 'ok', monitorId);
    }
    // Only non-private object identity and ciphertext checksum leave the process.
    io.report(
      JSON.stringify({
        event: 'encrypted_backup_verified',
        kind,
        ...receipt,
        ...metadata,
        source: undefined,
      }),
    );
    return receipt;
  } catch {
    if (monitorsHealth && monitorId)
      await io
        .checkIn(env.BACKUP_SENTRY_DSN, slug, 'error', monitorId)
        .catch(() => {});
    throw new Error(
      'Encrypted backup failed; inspect protected operator configuration',
    );
  } finally {
    await client?.end().catch(() => {});
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runBackup().catch(() => {
    console.error(
      'Encrypted backup failed. No plaintext or credentials were logged.',
    );
    process.exitCode = 1;
  });
