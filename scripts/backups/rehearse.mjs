import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client, Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { localTestDatabaseUrl } from '../../apps/api/scripts/local-test-database.ts';
import { IdentityService } from '../../apps/api/src/identity/service.ts';
import { DeleteAccountService } from '../../apps/api/src/identity/delete-account.ts';
import { DeleteDataService } from '../../apps/api/src/data-sync/deletion.ts';
import { artifactMetadata } from './storage.mjs';
import { encryptSnapshot } from './snapshot.mjs';
import { verifyBackupRole } from './backup-role.mjs';
import { restoreLocal } from './restore-local.mjs';
import { cleanupRehearsal } from './rehearsal-cleanup.mjs';
import { readPolicy } from './configuration.mjs';

const migrations = new URL('../../apps/api/drizzle/', import.meta.url).pathname;
const secret = () => randomBytes(32).toString('hex');
const proposal = () => ({
  credential: secret(),
  deviceId: randomUUID(),
  sessionId: randomUUID(),
  sessionToken: secret(),
});

/** Real pg_dump -> age -> pg_restore and deletion replay, only synthetic owned DBs. */
export async function rehearse(env = process.env) {
  const adminUrl = localTestDatabaseUrl(env.JUSTGO_TEST_ADMIN_DATABASE_URL);
  if (adminUrl.username !== 'postgres' || env.DATABASE_SSL !== 'disable')
    throw new Error('Local administrator and disabled loopback SSL required');
  const suffix = randomBytes(6).toString('hex');
  const sourceName = `justgo_restore_${suffix}`;
  const targetName = `justgo_restore_${randomBytes(6).toString('hex')}`;
  const clients = [],
    pools = [],
    ownedDatabases = [];
  let admin, failure;
  let ownsRole = false;
  let step = 'connect';
  const pgBin = env.JUSTGO_PG_BIN || '';
  const ageBin = env.AGE_BIN || 'age';
  const sourceConfig = {
    host: adminUrl.hostname,
    port: Number(adminUrl.port || 5432),
    user: 'postgres',
    password: decodeURIComponent(adminUrl.password),
    database: sourceName,
    ssl: false,
  };
  const directory = await mkdtemp(join(tmpdir(), 'justgo-recovery-rehearsal-'));
  try {
    admin = new Client({ connectionString: adminUrl.href, ssl: false });
    await admin.connect();
    step = 'isolated setup';
    if (
      (
        await admin.query(
          "select 1 from pg_roles where rolname='justgo_backup'",
        )
      ).rowCount
    )
      throw new Error('Backup rehearsal refuses an existing role');
    const password = secret();
    await admin.query(
      await readFile(new URL('./backup-role.sql', import.meta.url), 'utf8'),
    );
    ownsRole = true;
    await admin.query(`alter role justgo_backup password '${password}'`);
    for (const name of [sourceName, targetName]) {
      await admin.query(`create database ${name} template template0`);
      ownedDatabases.push(name);
    }
    const source = new Client(sourceConfig);
    clients.push(source);
    await source.connect();
    await source.query(
      `create schema justgo authorization justgo_migrator; create schema drizzle authorization justgo_migrator; grant create on database ${sourceName} to justgo_migrator; revoke create on schema public from public; grant usage on schema justgo to justgo_runtime; set role justgo_migrator`,
    );
    const journal = JSON.parse(
      await readFile(join(migrations, 'meta/_journal.json'), 'utf8'),
    );
    await source.query(
      'create table drizzle.__drizzle_migrations (id serial primary key,hash text not null,created_at bigint)',
    );
    for (const entry of journal.entries) {
      assert.match(entry.tag, /^\d{4}_[a-z0-9_]+$/);
      const sql = await readFile(join(migrations, `${entry.tag}.sql`), 'utf8');
      await source.query(sql);
      await source.query(
        'insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)',
        [createHash('sha256').update(sql).digest('hex'), entry.when],
      );
    }
    await source.query(`reset role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,not_after timestamptz);
      create table auth.refresh_tokens(id bigint primary key,user_id uuid references auth.users(id) on delete cascade,session_id uuid references auth.sessions(id) on delete cascade,revoked boolean)`);
    const runtime = localTestDatabaseUrl(env.DATABASE_URL);
    if (runtime.username !== 'justgo_runtime')
      throw new Error('Restricted runtime role required');
    const pool = new Pool({
      ...sourceConfig,
      user: 'justgo_runtime',
      password: decodeURIComponent(runtime.password),
      max: 1,
    });
    pools.push(pool);
    const identity = new IdentityService(drizzle(pool), {
      rateKey: secret(),
      managedAuthDeletion: async (id) => {
        await source.query('delete from auth.users where id=$1', [id]);
      },
    });
    const deleted = proposal(),
      erased = proposal(),
      revoked = proposal();
    const deletedOwner = await identity.bootstrap(deleted);
    const erasedOwner = await identity.bootstrap(erased);
    const revokedOwner = await identity.bootstrap(revoked);
    const subject = randomUUID(),
      authSession = randomUUID();
    await source.query('insert into auth.users(id) values($1)', [subject]);
    await source.query('insert into auth.sessions(id,user_id) values($1,$2)', [
      authSession,
      subject,
    ]);
    await source.query(
      'insert into auth.refresh_tokens(id,user_id,session_id,revoked) values(1,$1,$2,false)',
      [subject, authSession],
    );
    await source.query(
      'insert into justgo.managed_auth_accounts(auth_user_id,user_id) values($1,$2)',
      [subject, deletedOwner.userId],
    );
    await source.query(
      "insert into justgo.managed_auth_sessions(id,auth_user_id,user_id,device_id,expires_at) values($1,$2,$3,$4,now()+interval '1 day')",
      [authSession, subject, deletedOwner.userId, deleted.deviceId],
    );
    const attempt = randomUUID();
    const {
      rows: [catalog],
    } = await source.query(
      'select c.id as challenge,c.level_id,v.id as venue from justgo.challenges c cross join justgo.venues v limit 1',
    );
    for (const user of [deletedOwner.userId, erasedOwner.userId]) {
      await source.query(
        "insert into justgo.attempts(user_id,id,venue_id,challenge_id,level_id,started_at,activity_date,start_time_zone) values($1,$2,$3,$4,$5,now(),'2026-10-28','UTC')",
        [user, attempt, catalog.venue, catalog.challenge, catalog.level_id],
      );
      await source.query(
        'insert into justgo.journal_versions(user_id,version_id,attempt_id,parents,feeling_scale_version,reflection) values($1,$2,$3,\'{}\',1,\'{"text":"synthetic recovery fixture"}\')',
        [user, randomUUID(), attempt],
      );
    }
    step = 'encrypted snapshot';
    const key = join(directory, 'owner-key.txt');
    const generated = spawnSync('age-keygen', ['-o', key], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    if (generated.status !== 0) throw new Error('age key generation failed');
    const publicKey = spawnSync('age-keygen', ['-y', key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (publicKey.status !== 0) throw new Error('age recipient failed');
    const recipient = publicKey.stdout.trim();
    const backupConnection = {
      ...sourceConfig,
      user: 'justgo_backup',
      password,
      options: '-c default_transaction_read_only=on',
    };
    const backup = new Client(backupConnection);
    clients.push(backup);
    await backup.connect();
    step = 'backup privilege verification';
    await verifyBackupRole(backup);
    // Exercise actual catalog ACLs using only this rehearsal's owned database.
    // Both drift checks must reject before any fixture plaintext is exported.
    step = 'backup MAINTAIN rejection';
    try {
      await source.query(
        'grant maintain on table justgo.attempts to justgo_backup',
      );
      await assert.rejects(verifyBackupRole(backup), {
        message: 'Backup role privileges are not restricted',
      });
    } finally {
      await source.query(
        'revoke maintain on table justgo.attempts from justgo_backup',
      );
    }
    await verifyBackupRole(backup);
    step = 'backup inherited ownership rejection';
    try {
      await source.query(
        "create function justgo.backup_ownership_probe() returns integer language sql security invoker as 'select 1'",
      );
      await source.query(
        'alter function justgo.backup_ownership_probe() owner to pg_read_all_data',
      );
      // Ownership includes ALTER/DROP even with SET FALSE. Never invoke the probe.
      await assert.rejects(verifyBackupRole(backup), {
        message: 'Backup role privileges are not restricted',
      });
    } finally {
      await source.query(
        'drop function if exists justgo.backup_ownership_probe()',
      );
    }
    step = 'backup cron history policy verification';
    // This is a synthetic policy and fixture, never a hosted connection. It
    // exercises the same approved source scope and policy flow as the real job.
    const policyRaw = JSON.stringify({
      version: 1,
      approvalReference: 'synthetic-cron-history-delete-rehearsal',
      accountId: 'a'.repeat(32),
      bucket: 'justgo-test',
      environment: 'staging',
      jurisdiction: 'default',
      backupDays: 7,
      ledgerDays: 7,
      lockDays: 7,
      ageRecipient: recipient,
      sourceHost: 'db.kmcpcauaxlgpevkkenwd.supabase.co',
      sourceDatabase: 'postgres',
      sourceProjectRef: 'kmcpcauaxlgpevkkenwd',
      allowCronJobRunDetailsDelete: true,
    });
    const backupPolicy = readPolicy(
      policyRaw,
      createHash('sha256').update(policyRaw).digest('hex'),
    );
    // Removing the provider grant later must not break an opted-in backup.
    await verifyBackupRole(backup, backupPolicy);
    await source.query(`create schema cron;
      create table cron.job_run_details(id bigint primary key);
      create table cron.other_job_run_details(id bigint primary key);
      grant delete on table cron.job_run_details to public`);
    await assert.rejects(verifyBackupRole(backup), {
      message: 'Backup role privileges are not restricted',
    });
    await verifyBackupRole(backup, backupPolicy);
    for (const privilege of [
      'INSERT',
      'UPDATE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
      'MAINTAIN',
    ]) {
      try {
        await source.query(
          `grant ${privilege} on table cron.job_run_details to justgo_backup`,
        );
        await assert.rejects(verifyBackupRole(backup, backupPolicy), {
          message: 'Backup role privileges are not restricted',
        });
      } finally {
        await source.query(
          `revoke ${privilege} on table cron.job_run_details from justgo_backup`,
        );
      }
    }
    try {
      await source.query(
        'grant delete on table cron.other_job_run_details to justgo_backup',
      );
      await assert.rejects(verifyBackupRole(backup, backupPolicy), {
        message: 'Backup role privileges are not restricted',
      });
    } finally {
      await source.query(
        'revoke delete on table cron.other_job_run_details from justgo_backup',
      );
    }
    await verifyBackupRole(backup, backupPolicy);
    step = 'encrypted snapshot';
    const databasePath = join(directory, 'database.age'),
      ledgerPath = join(directory, 'ledger.age');
    const shared = {
      client: backup,
      connection: backupConnection,
      recipient,
      migrationsDirectory: migrations,
      pgBin,
      ageBin,
      sourceSha: 'a'.repeat(40),
      source: 'synthetic.local/justgo_test',
      policy: backupPolicy,
    };
    const databaseMetadata = await encryptSnapshot({
      ...shared,
      kind: 'database',
      destination: databasePath,
    });
    // All application/provider writers here are this one process. Record the fence
    // only after mutations settle; no fabricated production current-ledger claim.
    step = 'post-snapshot deletion';
    const newer = proposal();
    await identity.bootstrap(newer);
    await new DeleteAccountService(identity).delete(newer.sessionToken);
    await new DeleteAccountService(identity).delete(deleted.sessionToken);
    await new DeleteDataService(identity).delete(erased.sessionToken, 0);
    await source.query(
      'update justgo.recovery_credentials set revoked_at=now() where user_id=$1',
      [revokedOwner.userId],
    );
    const writesFencedAt = new Date().toISOString();
    const ledgerMetadata = await encryptSnapshot({
      ...shared,
      kind: 'ledger',
      destination: ledgerPath,
    });
    const evidencePath = join(directory, 'evidence.json');
    const databaseArtifact = await artifactMetadata(databasePath),
      ledgerArtifact = await artifactMetadata(ledgerPath);
    await writeFile(
      evidencePath,
      JSON.stringify({
        version: 1,
        approvalReference: 'synthetic-local-rehearsal',
        source: shared.source,
        databaseSha256: databaseArtifact.sha256,
        databaseCapturedAt: databaseMetadata.capturedAt,
        ledgerSha256: ledgerArtifact.sha256,
        migrationDigest: ledgerMetadata.migrationDigest,
        writesFencedAt,
        currentLedgerConfirmedAt: new Date().toISOString(),
        invalidateAllSessions: true,
      }),
      { mode: 0o600 },
    );
    step = 'restore and reconciliation';
    const targetUrl = new URL(adminUrl);
    targetUrl.pathname = `/${targetName}`;
    const restoreEnv = {
      JUSTGO_RESTORE_DATABASE_URL: targetUrl.href,
      RECOVERY_EVIDENCE_FILE: evidencePath,
      RECOVERY_DATABASE_FILE: databasePath,
      RECOVERY_LEDGER_FILE: ledgerPath,
      RECOVERY_OFFLINE_KEY_FILE: key,
      JUSTGO_PG_BIN: pgBin,
      AGE_BIN: ageBin,
    };
    const result = await restoreLocal(restoreEnv);
    assert.equal(result.writersMayOpen, false);
    step = 'revoked proof assertions';
    const target = new Client({ ...sourceConfig, database: targetName });
    clients.push(target);
    await target.connect();
    const restoredPool = new Pool({
      ...sourceConfig,
      database: targetName,
      user: 'justgo_runtime',
      password: decodeURIComponent(runtime.password),
      max: 1,
    });
    pools.push(restoredPool);
    const restoredIdentity = new IdentityService(drizzle(restoredPool), {
      rateKey: secret(),
    });
    await assert.rejects(
      restoredIdentity.bootstrap(
        { ...proposal(), credential: deleted.credential },
        false,
      ),
      (error) => error.code === 'CREDENTIAL_REJECTED',
    );
    await assert.rejects(
      restoredIdentity.bootstrap(
        { ...proposal(), credential: revoked.credential },
        false,
      ),
      (error) => error.code === 'CREDENTIAL_REJECTED',
    );
    await assert.rejects(
      restoredIdentity.bootstrap(
        { ...proposal(), credential: newer.credential },
        false,
      ),
      (error) => error.code === 'CREDENTIAL_REJECTED',
    );
    await assert.rejects(restoredIdentity.me(deleted.sessionToken));
    await assert.rejects(
      restoredIdentity.me(erased.sessionToken),
      (error) => error.code === 'SESSION_REVOKED',
    );
    const {
      rows: [state],
    } = await target.query(
      `select
      (select count(*)::int from justgo.attempts) as attempts,
      (select count(*)::int from justgo.journal_versions) as versions,
      (select count(*)::int from auth.users) as auth_users,
      (select count(*)::int from auth.sessions) as auth_sessions,
      (select data_epoch from justgo.users where id=$1) as epoch,
      (select count(*)::int from justgo.deleted_completion_ids where user_id=$1) as tombstones`,
      [erasedOwner.userId],
    );
    assert.deepEqual(state, {
      attempts: 0,
      versions: 0,
      auth_users: 0,
      auth_sessions: 0,
      epoch: 1,
      tombstones: 1,
    });
    // Replaying exactly the ledger is idempotent and preserves the epoch.
    const { reconcileLedger } = await import('./recovery.mjs');
    const decrypted = spawnSync(
      ageBin,
      ['--decrypt', '--identity', key, ledgerPath],
      {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 ** 2,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    if (decrypted.status !== 0) throw new Error('Ledger decryption failed');
    await target.query('begin');
    await reconcileLedger(target, JSON.parse(decrypted.stdout));
    await target.query('commit');
  } catch {
    failure = new Error(`Recovery rehearsal failed during ${step}`);
  } finally {
    await cleanupRehearsal(
      { pools, clients, ownedDatabases, ownsRole, admin, directory },
      failure,
    );
  }
  console.log(
    'Encrypted local app/Auth restore, deletion replay, epoch fencing, revoked proofs and idempotency passed. Synthetic Auth tables are not hosted provider acceptance.',
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  rehearse().catch((error) => {
    console.error(
      error.message.startsWith('Recovery rehearsal failed during ') ||
        error.message === 'Recovery rehearsal cleanup incomplete'
        ? error.message
        : 'Recovery rehearsal setup failed',
    );
    process.exitCode = 1;
  });
