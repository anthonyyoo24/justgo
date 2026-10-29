import { z } from 'zod';
import { ledgerTables } from './snapshot.mjs';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const stamp = z.iso.datetime();
export const evidenceSchema = z.strictObject({
  version: z.literal(1),
  approvalReference: z.string().min(8).max(200),
  source: z.string().min(5).max(300),
  databaseSha256: hash,
  databaseCapturedAt: stamp,
  ledgerSha256: hash,
  migrationDigest: hash,
  writesFencedAt: stamp,
  // This must include Auth administrative/provider changes as well as API writes.
  currentLedgerConfirmedAt: stamp,
  invalidateAllSessions: z.literal(true),
});
export function validateRecovery(ledger, evidence, artifacts) {
  evidence = evidenceSchema.parse(evidence);
  if (
    ledger?.format !== 'justgo-recovery-ledger' ||
    ledger.version !== 1 ||
    !stamp.safeParse(ledger.capturedAt).success ||
    !/^[a-f0-9]{40}$/.test(ledger.sourceSha ?? '') ||
    ledger.source !== evidence.source ||
    ledger.migrationDigest !== evidence.migrationDigest ||
    artifacts.databaseSha256 !== evidence.databaseSha256 ||
    artifacts.ledgerSha256 !== evidence.ledgerSha256 ||
    Date.parse(evidence.databaseCapturedAt) > Date.parse(ledger.capturedAt) ||
    Date.parse(evidence.writesFencedAt) > Date.parse(ledger.capturedAt) ||
    Date.parse(evidence.currentLedgerConfirmedAt) <
      Date.parse(ledger.capturedAt)
  )
    throw new Error(
      'Current writer-fenced ledger evidence is required; keep writers closed',
    );
  const expected = [
    ...Object.keys(ledgerTables),
    'auth_users',
    'auth_sessions',
    'auth_refresh_tokens',
  ];
  if (
    !ledger.tables ||
    Object.keys(ledger.tables).length !== expected.length ||
    !expected.every(
      (name) =>
        Array.isArray(ledger.tables[name]) &&
        ledger.tables[name].length <= 1000000,
    )
  )
    throw new Error('Incomplete recovery ledger');
  for (const [name, rows] of Object.entries(ledger.tables)) {
    const columns =
      ledgerTables[name]?.split(',') ??
      {
        auth_users: ['id'],
        auth_sessions: ['id', 'user_id', 'not_after'],
        auth_refresh_tokens: ['id', 'user_id', 'session_id', 'revoked'],
      }[name];
    for (const row of rows) {
      if (
        !row ||
        Object.keys(row).length !== columns.length ||
        !columns.every((column) => Object.hasOwn(row, column))
      )
        throw new Error('Invalid recovery ledger record');
      for (const [key, value] of Object.entries(row)) {
        if (
          (key === 'id' && name !== 'auth_refresh_tokens') ||
          [
            'user_id',
            'auth_user_id',
            'device_id',
            'attempt_id',
            'rotated_to',
            'session_id',
          ].includes(key)
        ) {
          if (value !== null && !z.uuid().safeParse(value).success)
            throw new Error('Invalid recovery identity');
        }
      }
    }
  }
  return evidence;
}

/** Caller owns an isolated transaction. No provider calls and no API reopening. */
export async function reconcileLedger(client, ledger) {
  for (const [name, columns] of Object.entries(ledgerTables)) {
    await client.query(
      `create temp table recovery_${name} on commit drop as select ${columns} from justgo.${name} with no data`,
    );
    await client.query(
      `insert into recovery_${name} select ${columns} from jsonb_populate_recordset(null::justgo.${name},$1::jsonb)`,
      [JSON.stringify(ledger.tables[name])],
    );
  }
  await client.query(`create temp table recovery_erased on commit drop as
    select r.id from recovery_users r left join justgo.users u on u.id=r.id
    where r.deleted_at is not null or r.data_epoch>coalesce(u.data_epoch,0)`);
  // Preserve tombstones even for owners first created after the nightly snapshot.
  await client.query(`insert into justgo.users(id,created_at,deleted_at,deletion_session_digest,data_epoch,data_deleted_at)
    select id,created_at,deleted_at,deletion_session_digest,data_epoch,data_deleted_at from recovery_users
    on conflict(id) do update set
      deleted_at=coalesce(excluded.deleted_at,justgo.users.deleted_at),
      deletion_session_digest=coalesce(excluded.deletion_session_digest,justgo.users.deletion_session_digest),
      data_epoch=greatest(justgo.users.data_epoch,excluded.data_epoch),
      data_deleted_at=case when excluded.data_epoch>=justgo.users.data_epoch then coalesce(excluded.data_deleted_at,justgo.users.data_deleted_at) else justgo.users.data_deleted_at end`);
  const {
    rows: [conflicts],
  } =
    await client.query(`select exists(select 1 from recovery_managed_auth_accounts r join justgo.managed_auth_accounts m
    on m.auth_user_id=r.auth_user_id or m.user_id=r.user_id
    where m.auth_user_id<>r.auth_user_id or m.user_id<>r.user_id) as found`);
  if (conflicts.found) throw new Error('Recovery subject ownership conflict');
  await client.query(
    `insert into justgo.managed_auth_accounts select * from recovery_managed_auth_accounts on conflict do nothing`,
  );
  await client.query(
    `insert into justgo.deleted_completion_ids select * from recovery_deleted_completion_ids on conflict do nothing`,
  );
  for (const table of [
    'journal_versions',
    'attempt_patch_receipts',
    'attempts',
  ]) {
    const id = table === 'attempts' ? 'id' : 'attempt_id';
    await client.query(`delete from justgo.${table} a where a.user_id in(select id from recovery_erased)
      or exists(select 1 from justgo.users u where u.id=a.user_id and u.deleted_at is not null)
      or exists(select 1 from justgo.deleted_completion_ids d where d.user_id=a.user_id and d.attempt_id=a.${id})`);
  }
  // A revoked digest may never change owner. Reject rather than silently repoint it.
  const {
    rows: [credentialConflict],
  } =
    await client.query(`select exists(select 1 from recovery_recovery_credentials r join justgo.recovery_credentials c
    on c.digest=r.digest or c.id=r.id where c.user_id<>r.user_id or c.digest<>r.digest or c.id<>r.id) as found`);
  if (credentialConflict.found)
    throw new Error('Recovery credential ownership conflict');
  await client.query(`insert into justgo.recovery_credentials(id,user_id,digest,kind,created_at,revoked_at)
    select id,user_id,digest,kind,created_at,revoked_at from recovery_recovery_credentials where revoked_at is not null
    on conflict(id) do update set revoked_at=coalesce(justgo.recovery_credentials.revoked_at,excluded.revoked_at)`);
  // Sign-out of all restored sessions is deliberate and requires the evidence flag.
  await client.query(
    'update justgo.device_sessions set revoked_at=coalesce(revoked_at,now())',
  );
  await client.query(
    'update justgo.managed_auth_sessions set revoked_at=coalesce(revoked_at,now())',
  );
  await client.query(
    'update justgo.device_transfers set cancelled_at=coalesce(cancelled_at,now())',
  );
  await client.query(`update justgo.devices d set revoked_at=coalesce(d.revoked_at,r.revoked_at)
    from recovery_devices r where d.id=r.id and d.user_id=r.user_id and r.revoked_at is not null`);
  await client.query(`update justgo.recovery_credentials c set revoked_at=coalesce(c.revoked_at,now())
    where exists(select 1 from justgo.users u where u.id=c.user_id and u.deleted_at is not null)`);
  for (const table of ['device_transfers', 'device_sessions', 'devices'])
    await client.query(
      `delete from justgo.${table} where user_id in(select id from justgo.users where deleted_at is not null)`,
    );
  await client.query(
    'update justgo.users set analytics_restricted_at=null where deleted_at is not null',
  );
  await client.query(`insert into justgo.managed_auth_deletions(user_id,auth_user_id,requested_at,completed_at)
    select user_id,auth_user_id,requested_at,null from recovery_managed_auth_deletions
    on conflict(user_id) do update set completed_at=null`);
  // Recovered completed outbox state does not establish erased Auth data.
  // This runs only in the isolated local restore; hosted cleanup uses the provider.
  await client.query('delete from auth.refresh_tokens');
  await client.query('delete from auth.sessions');
  await client.query(
    `delete from auth.users where id not in(select id from jsonb_to_recordset($1::jsonb) as r(id uuid))
    or id in(select auth_user_id from justgo.managed_auth_deletions)
    or id in(select m.auth_user_id from justgo.managed_auth_accounts m join justgo.users u on u.id=m.user_id where u.deleted_at is not null)`,
    [JSON.stringify(ledger.tables.auth_users)],
  );
  const {
    rows: [result],
  } = await client.query(`select
    not exists(select 1 from justgo.users u join justgo.attempts a on a.user_id=u.id where u.deleted_at is not null)
    and not exists(select 1 from justgo.users u join justgo.journal_versions j on j.user_id=u.id where u.deleted_at is not null)
    and not exists(select 1 from auth.users a join justgo.managed_auth_deletions d on d.auth_user_id=a.id)
    and not exists(select 1 from auth.sessions)
    and not exists(select 1 from auth.refresh_tokens)
    and not exists(select 1 from recovery_recovery_credentials r left join justgo.recovery_credentials c on c.id=r.id where r.revoked_at is not null and c.revoked_at is null)
    and not exists(select 1 from recovery_users r join justgo.users u on u.id=r.id where u.data_epoch<r.data_epoch or(r.deleted_at is not null and u.deleted_at is null)) as safe`);
  if (!result.safe) throw new Error('Restored deletion invariants failed');
  return {
    reconciled: true,
    writersMayOpen: false,
    providerAcceptanceRequired: true,
  };
}
