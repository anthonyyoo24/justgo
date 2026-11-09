import { randomBytes, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { localTestDatabaseUrl } from '../../scripts/local-test-database.js';
import {
  captureLedger,
  ledgerTables,
} from '../../../../scripts/backups/snapshot.mjs';
import { reconcileLedger } from '../../../../scripts/backups/recovery.mjs';

const url = localTestDatabaseUrl(process.env.JUSTGO_TEST_ADMIN_DATABASE_URL);
if (url.username !== 'postgres' || process.env.DATABASE_SSL !== 'disable')
  throw new Error(
    'Recovery ledger fixtures require the isolated postgres operator',
  );
const pool = new Pool({ connectionString: url.toString(), ssl: false, max: 1 });
let client: PoolClient;
const hex = () => randomBytes(32).toString('hex');
const deleted = randomUUID(),
  live = randomUUID(),
  device = randomUUID(),
  session = randomUUID(),
  credential = randomUUID(),
  transfer = randomUUID(),
  deletedSubject = randomUUID(),
  liveSubject = randomUUID(),
  managedSession = randomUUID(),
  completion = randomUUID();
const receipt = hex();
const digest = hex();
const old = "now() - interval '90 days'";
const run = (sql: string, values: unknown[]) => client.query(sql, values);
const exists = async (sql: string, values: unknown[]) =>
  (
    await client.query<{ found: boolean }>(
      `select exists(${sql}) as found`,
      values,
    )
  ).rows[0]!.found;

const tombstones: Record<
  string,
  { write: () => Promise<unknown>; holds: () => Promise<boolean> }
> = {
  users: {
    write: () =>
      run(
        `update justgo.users set deleted_at=${old},deletion_session_digest=$2,data_epoch=1,data_deleted_at=${old} where id=$1`,
        [deleted, receipt],
      ),
    holds: () =>
      exists(
        'select 1 from justgo.users where id=$1 and deleted_at is not null and deletion_session_digest=$2 and data_epoch=1',
        [deleted, receipt],
      ),
  },
  recovery_credentials: {
    write: () =>
      run(
        `update justgo.recovery_credentials set revoked_at=${old} where id=$1`,
        [credential],
      ),
    holds: () =>
      exists(
        'select 1 from justgo.recovery_credentials where id=$1 and user_id=$2 and digest=$3 and revoked_at is not null',
        [credential, live, digest],
      ),
  },
  devices: {
    write: () =>
      run(
        `update justgo.devices set revoked_at=${old} where user_id=$1 and id=$2`,
        [live, device],
      ),
    holds: () =>
      exists(
        'select 1 from justgo.devices where user_id=$1 and id=$2 and revoked_at is not null',
        [live, device],
      ),
  },
  device_sessions: {
    write: () =>
      run(`update justgo.device_sessions set revoked_at=${old} where id=$1`, [
        session,
      ]),
    holds: () =>
      exists(
        'select 1 from justgo.device_sessions where id=$1 and revoked_at is not null',
        [session],
      ),
  },
  device_transfers: {
    write: () =>
      run(
        `update justgo.device_transfers set approved_at=${old},redeemed_at=${old} where id=$1`,
        [transfer],
      ),
    holds: () =>
      exists(
        'select 1 from justgo.device_transfers where id=$1 and (redeemed_at is not null or cancelled_at is not null)',
        [transfer],
      ),
  },
  managed_auth_accounts: {
    write: () =>
      run(
        'insert into justgo.managed_auth_accounts(auth_user_id,user_id) values($1,$2)',
        [deletedSubject, deleted],
      ),
    holds: () =>
      exists(
        'select 1 from justgo.managed_auth_accounts where auth_user_id=$1 and user_id=$2',
        [deletedSubject, deleted],
      ),
  },
  managed_auth_sessions: {
    write: () =>
      run(
        `update justgo.managed_auth_sessions set revoked_at=${old} where id=$1`,
        [managedSession],
      ),
    holds: () =>
      exists(
        'select 1 from justgo.managed_auth_sessions where id=$1 and revoked_at is not null',
        [managedSession],
      ),
  },
  managed_auth_deletions: {
    write: () =>
      run(
        `insert into justgo.managed_auth_deletions(user_id,auth_user_id,requested_at,completed_at) values($1,$2,${old},${old})`,
        [deleted, deletedSubject],
      ),
    holds: () =>
      exists(
        'select 1 from justgo.managed_auth_deletions where user_id=$1 and auth_user_id=$2',
        [deleted, deletedSubject],
      ),
  },
  deleted_completion_ids: {
    write: () =>
      run(
        'insert into justgo.deleted_completion_ids(user_id,attempt_id) values($1,$2)',
        [live, completion],
      ),
    holds: () =>
      exists(
        'select 1 from justgo.deleted_completion_ids where user_id=$1 and attempt_id=$2',
        [live, completion],
      ),
  },
};
const writeTombstones = async () => {
  for (const tombstone of Object.values(tombstones)) await tombstone.write();
};
const holding = async () => {
  const result: Record<string, boolean> = {};
  for (const [name, tombstone] of Object.entries(tombstones))
    result[name] = await tombstone.holds();
  return result;
};
const every = (value: boolean) =>
  Object.fromEntries(Object.keys(tombstones).map((name) => [name, value]));

beforeAll(async () => {
  client = await pool.connect();
  await client.query('begin');
  const existing = await client.query<{ occupied: boolean }>(
    "select to_regnamespace('auth') is not null as occupied",
  );
  if (existing.rows[0]?.occupied)
    throw new Error(
      'Recovery ledger fixtures refuse a pre-existing Auth schema',
    );
  await client.query(`create schema auth authorization postgres;
    create table auth.users(id uuid primary key);
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,not_after timestamptz);
    create table auth.refresh_tokens(id bigint primary key,user_id uuid references auth.users(id) on delete cascade,session_id uuid references auth.sessions(id) on delete cascade,revoked boolean)`);
  await run('insert into justgo.users(id) values($1),($2)', [deleted, live]);
  await run('insert into justgo.devices(id,user_id) values($1,$2)', [
    device,
    live,
  ]);
  await run(
    "insert into justgo.device_sessions(id,user_id,device_id,digest,expires_at) values($1,$2,$3,$4,now()+interval '1 day')",
    [session, live, device, hex()],
  );
  await run(
    "insert into justgo.recovery_credentials(id,user_id,digest,kind) values($1,$2,$3,'key')",
    [credential, live, digest],
  );
  await run(
    `insert into justgo.device_transfers(id,code_digest,claim_digest,user_id,device_id,session_id,session_digest,credential_digest,verification,expires_at)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,now()-interval '89 days')`,
    [transfer, hex(), hex(), live, device, randomUUID(), hex(), hex(), hex()],
  );
  await run(
    'insert into justgo.managed_auth_accounts(auth_user_id,user_id) values($1,$2)',
    [liveSubject, live],
  );
  await run(
    "insert into justgo.managed_auth_sessions(id,auth_user_id,user_id,device_id,expires_at) values($1,$2,$3,$4,now()+interval '1 day')",
    [managedSession, liveSubject, live, device],
  );
});
beforeEach(async () => {
  await client.query('savepoint recovery_ledger_case');
});
afterEach(async () => {
  await client.query('rollback to savepoint recovery_ledger_case');
});
afterAll(async () => {
  try {
    await client?.query('rollback');
  } finally {
    client?.release();
    await pool.end();
  }
});

describe('recovery ledger tombstones', () => {
  it('has a tombstone case for every ledger table', () => {
    expect(
      Object.keys(tombstones).sort(),
      'Add a tombstone case here for each table in ledgerTables in scripts/backups/snapshot.mjs',
    ).toEqual(Object.keys(ledgerTables).sort());
  });

  it('keeps every ledger tombstone through the identity retention purge', async () => {
    await writeTombstones();
    for (let pass = 0; pass < 50; pass++) {
      const removed = await client.query<{
        rate_buckets: number;
        transfers: number;
      }>('select * from justgo.purge_expired_identity_records(10000)');
      if (!removed.rows[0]!.rate_buckets && !removed.rows[0]!.transfers) break;
    }
    expect(await holding()).toEqual(every(true));
  });

  it('replays every ledger tombstone over an older database dump', async () => {
    await client.query('savepoint database_dump');
    await writeTombstones();
    const ledger: unknown = JSON.parse(
      await captureLedger(client, { capturedAt: new Date().toISOString() }),
    );
    await client.query('rollback to savepoint database_dump');
    expect(await holding()).toEqual(every(false));
    await reconcileLedger(client, ledger);
    expect(await holding()).toEqual(every(true));
  });
});
