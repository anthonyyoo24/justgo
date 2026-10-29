import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { artifactMetadata } from './storage.mjs';
import { validateRecovery, reconcileLedger } from './recovery.mjs';
import { verifyMigrationRegistry } from './snapshot.mjs';

export function localRestoreConnection(value) {
  const url = new URL(value);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !/^\/justgo_restore_[a-f0-9]{12}$/.test(url.pathname) ||
    url.username !== 'postgres' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Restore requires a dedicated disposable loopback database',
    );
  return {
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: Number(url.port || 5432),
    database: url.pathname.slice(1),
    user: 'postgres',
    password: decodeURIComponent(url.password),
    ssl: false,
    connectionTimeoutMillis: 5000,
  };
}
function done(child) {
  return new Promise((resolve, reject) => {
    child.once('error', () =>
      reject(new Error('Local restore subprocess failed')),
    );
    child.once('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('Local restore subprocess failed')),
    );
  });
}
async function decryptLedger(path, keyPath, ageBin) {
  const child = spawn(ageBin, ['--decrypt', '--identity', keyPath, path], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const result = done(child);
  result.catch(() => {});
  const timer = setTimeout(() => child.kill('SIGKILL'), 60000);
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of child.stdout) {
      bytes += chunk.length;
      if (bytes > 64 * 1024 ** 2)
        throw new Error('Recovery ledger exceeds bound');
      chunks.push(chunk);
    }
    await result;
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    clearTimeout(timer);
    child.kill('SIGKILL');
    await result.catch(() => {});
  }
}
export async function restoreLocal(env = process.env) {
  const connection = localRestoreConnection(env.JUSTGO_RESTORE_DATABASE_URL);
  const evidence = JSON.parse(
    await readFile(env.RECOVERY_EVIDENCE_FILE, 'utf8'),
  );
  const database = await artifactMetadata(env.RECOVERY_DATABASE_FILE);
  const ledgerArtifact = await artifactMetadata(env.RECOVERY_LEDGER_FILE);
  const ledger = await decryptLedger(
    env.RECOVERY_LEDGER_FILE,
    env.RECOVERY_OFFLINE_KEY_FILE,
    env.AGE_BIN || 'age',
  );
  validateRecovery(ledger, evidence, {
    databaseSha256: database.sha256,
    ledgerSha256: ledgerArtifact.sha256,
  });
  const client = new Client(connection);
  await client.connect();
  let age, restore;
  const tasks = [];
  let timer;
  try {
    const {
      rows: [state],
    } = await client.query(
      "select to_regnamespace('justgo') is null and to_regnamespace('auth') is null and to_regnamespace('drizzle') is null as empty",
    );
    if (!state.empty) throw new Error('Restore target must be empty');
    age = spawn(
      env.AGE_BIN || 'age',
      ['--decrypt', '--identity', env.RECOVERY_OFFLINE_KEY_FILE],
      { stdio: ['pipe', 'pipe', 'ignore'] },
    );
    restore = spawn(
      env.JUSTGO_PG_BIN ? join(env.JUSTGO_PG_BIN, 'pg_restore') : 'pg_restore',
      [
        '--no-owner',
        '--exit-on-error',
        '--single-transaction',
        '--dbname',
        connection.database,
      ],
      {
        stdio: ['pipe', 'ignore', 'ignore'],
        env: {
          PATH: process.env.PATH,
          PGHOST: connection.host,
          PGPORT: String(connection.port),
          PGUSER: connection.user,
          PGPASSWORD: connection.password,
          PGSSLMODE: 'disable',
          PGCONNECT_TIMEOUT: '5',
        },
      },
    );
    timer = setTimeout(() => {
      age.kill('SIGKILL');
      restore.kill('SIGKILL');
    }, 600000);
    tasks.push(
      done(age),
      done(restore),
      pipeline(createReadStream(env.RECOVERY_DATABASE_FILE), age.stdin),
      pipeline(age.stdout, restore.stdin),
    );
    await Promise.all(tasks);
    const digest = await verifyMigrationRegistry(
      client,
      new URL('../../apps/api/drizzle/', import.meta.url).pathname,
    );
    if (digest !== ledger.migrationDigest)
      throw new Error('Forward migrations need a reviewed restore procedure');
    await client.query('begin');
    const result = await reconcileLedger(client, ledger);
    await client.query('commit');
    console.log(
      JSON.stringify({ event: 'local_recovery_reconciled', ...result }),
    );
    return result;
  } catch {
    age?.kill('SIGKILL');
    restore?.kill('SIGKILL');
    await Promise.allSettled(tasks);
    await client.query('rollback').catch(() => {});
    throw new Error(
      'Local restore failed; target remains isolated and writers closed',
    );
  } finally {
    clearTimeout(timer);
    await client.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  restoreLocal().catch(() => {
    console.error('Local restore failed. Keep the isolated target closed.');
    process.exitCode = 1;
  });
