import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { pgEnvironment } from './configuration.mjs';
import { verifyBackupRole } from './backup-role.mjs';

export { verifyBackupRole } from './backup-role.mjs';

// Complete identity states preserve missing-session/cancelled-transfer evidence too.
// No attempt, private journal version or reflection content belongs in the ledger.
export const ledgerTables = Object.freeze({
  users:
    'id,created_at,deleted_at,deletion_session_digest,data_epoch,data_deleted_at',
  recovery_credentials: 'id,user_id,digest,kind,created_at,revoked_at',
  devices: 'id,user_id,created_at,revoked_at',
  device_sessions:
    'id,user_id,device_id,digest,created_at,expires_at,revoked_at,rotated_to',
  device_transfers:
    'id,user_id,credential_digest,cancelled_at,redeemed_at,expires_at',
  managed_auth_accounts: 'auth_user_id,user_id',
  managed_auth_sessions:
    'id,auth_user_id,user_id,device_id,expires_at,revoked_at',
  managed_auth_deletions: 'user_id,auth_user_id,requested_at,completed_at',
  deleted_completion_ids: 'user_id,attempt_id',
});
export async function verifyMigrationRegistry(client, directory) {
  const registry = JSON.parse(
    await readFile(join(directory, 'meta/_journal.json'), 'utf8'),
  );
  const expected = [];
  for (const entry of registry.entries) {
    if (!/^\d{4}_[a-z0-9_]+$/.test(entry.tag))
      throw new Error('Invalid migration registry');
    expected.push({
      hash: createHash('sha256')
        .update(await readFile(join(directory, `${entry.tag}.sql`)))
        .digest('hex'),
      created_at: String(entry.when),
    });
  }
  const { rows } = await client.query(
    'select hash,created_at::text from drizzle.__drizzle_migrations order by created_at',
  );
  if (!expected.length || JSON.stringify(rows) !== JSON.stringify(expected))
    throw new Error('Backup source migrations differ from reviewed source');
  return createHash('sha256').update(JSON.stringify(expected)).digest('hex');
}
export async function captureLedger(client, metadata) {
  const tables = {};
  for (const [name, columns] of Object.entries(ledgerTables)) {
    tables[name] = (
      await client.query(`select ${columns} from justgo.${name}`)
    ).rows;
  }
  // Supabase Auth schema drift is fail-closed. Revocation reconciliation also
  // invalidates every restored Auth session and refresh token before acceptance.
  tables.auth_users = (await client.query('select id from auth.users')).rows;
  tables.auth_sessions = (
    await client.query('select id,user_id,not_after from auth.sessions')
  ).rows;
  tables.auth_refresh_tokens = (
    await client.query(
      'select id::text,user_id,session_id,revoked from auth.refresh_tokens',
    )
  ).rows;
  const ledger = {
    format: 'justgo-recovery-ledger',
    version: 1,
    ...metadata,
    tables,
  };
  const encoded = JSON.stringify(ledger);
  if (Buffer.byteLength(encoded) > 64 * 1024 ** 2)
    throw new Error('Ledger exceeds reviewed bound');
  return encoded;
}
function completed(child) {
  return new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('Backup subprocess failed')));
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error('Backup subprocess failed')),
    );
  });
}
/** Plaintext goes only through pipes; stderr is discarded, never copied to CI. */
export async function encryptSnapshot({
  kind,
  client,
  connection,
  rootCert,
  recipient,
  destination,
  migrationsDirectory,
  pgBin = '',
  ageBin = 'age',
  sourceSha,
  source,
  policy,
}) {
  await client.query('begin isolation level repeatable read read only');
  let dump, age;
  let timer;
  const tasks = [];
  const observe = (promise) => {
    promise.catch(() => {});
    tasks.push(promise);
    return promise;
  };
  try {
    await verifyBackupRole(client, policy);
    const migrationDigest = await verifyMigrationRegistry(
      client,
      migrationsDirectory,
    );
    const {
      rows: [snapshot],
    } = await client.query(
      'select pg_export_snapshot() as id,transaction_timestamp() as captured_at',
    );
    const metadata = {
      capturedAt: new Date(snapshot.captured_at).toISOString(),
      migrationDigest,
      sourceSha,
      source,
    };
    age = spawn(ageBin, ['--encrypt', '--recipient', recipient], {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { PATH: process.env.PATH },
    });
    const ageDone = observe(completed(age));
    timer = setTimeout(() => {
      dump?.kill('SIGKILL');
      age.kill('SIGKILL');
    }, 600000);
    const output = observe(
      pipeline(
        age.stdout,
        createWriteStream(destination, { mode: 0o600, flags: 'wx' }),
      ),
    );
    if (kind === 'database') {
      dump = spawn(
        pgBin ? join(pgBin, 'pg_dump') : 'pg_dump',
        [
          '--format=custom',
          '--no-owner',
          '--schema=justgo',
          '--schema=auth',
          '--schema=drizzle',
          '--snapshot',
          snapshot.id,
          '--lock-wait-timeout=10000',
          '--no-password',
        ],
        {
          stdio: ['ignore', 'pipe', 'ignore'],
          env: pgEnvironment(connection, rootCert),
        },
      );
      await Promise.all([
        observe(completed(dump)),
        ageDone,
        output,
        observe(pipeline(dump.stdout, age.stdin)),
      ]);
    } else {
      const encoded = await captureLedger(client, metadata);
      await Promise.all([
        ageDone,
        output,
        observe(pipeline(Readable.from([encoded]), age.stdin)),
      ]);
    }
    await client.query('commit');
    return metadata;
  } catch {
    dump?.kill('SIGKILL');
    age?.kill('SIGKILL');
    await Promise.allSettled(tasks);
    await client.query('rollback').catch(() => {});
    throw new Error('Encrypted snapshot failed');
  } finally {
    clearTimeout(timer);
  }
}
