import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';

for (const url of [
  process.env.DATABASE_URL,
  process.env.MIGRATION_DATABASE_URL,
])
  if (
    !url ||
    !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/justgo_test'
  )
    throw new Error('Only isolated local justgo_test is allowed');
const admin = new Pool(
  poolOptions(
    readConfig({
      ...process.env,
      DATABASE_URL: process.env.MIGRATION_DATABASE_URL!,
    }),
  ),
);
const runtime = new Pool(poolOptions(readConfig(process.env)));
const prefix = `retention-test:${randomUUID()}:`;
const hex = () => randomBytes(32).toString('hex');
const transferIds: string[] = [];
const userIds: string[] = [];

afterAll(async () => {
  await admin.query(
    'delete from justgo.identity_rate_buckets where key like $1',
    [`${prefix}%`],
  );
  await admin.query('delete from justgo.device_transfers where id = any($1)', [
    transferIds,
  ]);
  await admin.query(
    'delete from justgo.recovery_credentials where user_id = any($1)',
    [userIds],
  );
  await admin.query('delete from justgo.users where id = any($1)', [userIds]);
  await Promise.all([admin.end(), runtime.end()]);
});

async function bucket(name: string, age: string) {
  await admin.query(
    `insert into justgo.identity_rate_buckets (key,count,window_start) values ($1,1,now() - $2::interval)`,
    [`${prefix}${name}`, age],
  );
}
async function transfer(
  expiredFor: string,
  state: 'open' | 'redeemed' | 'cancelled',
) {
  const id = randomUUID();
  transferIds.push(id);
  await admin.query(
    `insert into justgo.device_transfers
      (id,code_digest,claim_digest,device_id,session_id,session_digest,credential_digest,verification,expires_at,approved_at,redeemed_at,cancelled_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,now() - $9::interval,now() - $9::interval,
       case when $10 = 'redeemed' then now() - $9::interval end,
       case when $10 = 'cancelled' then now() - $9::interval end)`,
    [
      id,
      hex(),
      hex(),
      randomUUID(),
      randomUUID(),
      hex(),
      hex(),
      hex(),
      expiredFor,
      state,
    ],
  );
  return id;
}
async function remaining() {
  const buckets = await admin.query<{ key: string }>(
    'select key from justgo.identity_rate_buckets where key like $1 order by key',
    [`${prefix}%`],
  );
  const transfers = await admin.query<{ id: string }>(
    'select id from justgo.device_transfers where id = any($1)',
    [transferIds],
  );
  return {
    buckets: buckets.rows.map((row) => row.key.slice(prefix.length)),
    transfers: new Set(transfers.rows.map((row) => row.id)),
  };
}
async function purge(limit: number) {
  const result = await admin.query<{ rate_buckets: number; transfers: number }>(
    'select * from justgo.purge_expired_identity_records($1)',
    [limit],
  );
  return result.rows[0]!;
}

describe('identity retention cleanup', () => {
  it('removes only stale rate buckets and long-expired unredeemed transfers, keeping tombstones', async () => {
    await bucket('old', '31 days');
    await bucket('recent', '29 days');
    const expired = await transfer('25 hours', 'open');
    const cancelled = await transfer('3 days', 'cancelled');
    const grace = await transfer('23 hours', 'open');
    const redeemed = await transfer('40 days', 'redeemed');
    const current = await transfer('-10 minutes', 'open');
    const deletedUser = randomUUID();
    userIds.push(deletedUser);
    await admin.query(
      `insert into justgo.users (id,deleted_at,deletion_session_digest) values ($1,now() - interval '90 days',$2)`,
      [deletedUser, hex()],
    );
    await admin.query(
      `insert into justgo.recovery_credentials (id,user_id,digest,kind,revoked_at) values ($1,$2,$3,'key',now() - interval '90 days')`,
      [randomUUID(), deletedUser, hex()],
    );

    let total = { rate_buckets: 0, transfers: 0 };
    for (let run = 0; run < 50; run++) {
      const removed = await purge(10000);
      if (!removed.rate_buckets && !removed.transfers) break;
      total = {
        rate_buckets: total.rate_buckets + removed.rate_buckets,
        transfers: total.transfers + removed.transfers,
      };
    }
    expect(total.rate_buckets).toBeGreaterThanOrEqual(1);
    expect(total.transfers).toBeGreaterThanOrEqual(2);
    const left = await remaining();
    expect(left.buckets).toEqual(['recent']);
    expect([...left.transfers].sort()).toEqual(
      [grace, redeemed, current].sort(),
    );
    expect(left.transfers.has(expired) || left.transfers.has(cancelled)).toBe(
      false,
    );
    expect(
      (
        await admin.query(
          `select (select count(*)::int from justgo.users where id=$1 and deleted_at is not null) as receipts,
                  (select count(*)::int from justgo.recovery_credentials where user_id=$1 and revoked_at is not null) as tombstones`,
          [deletedUser],
        )
      ).rows[0],
    ).toEqual({ receipts: 1, tombstones: 1 });
  });

  it('deletes at most one bounded batch per call', async () => {
    for (const name of ['batch-a', 'batch-b', 'batch-c'])
      await bucket(name, '45 days');
    expect((await purge(2)).rate_buckets).toBe(2);
    let calls = 1;
    while (
      (await remaining()).buckets.some((key) => key.startsWith('batch-'))
    ) {
      expect((await purge(2)).rate_buckets).toBeLessThanOrEqual(2);
      calls++;
      expect(calls).toBeLessThan(50);
    }
  });

  it('rejects unbounded limits and cannot run as the mobile runtime role', async () => {
    for (const limit of [0, 10001])
      await expect(purge(limit)).rejects.toThrow(
        'batch_limit must be between 1 and 10000',
      );
    await expect(
      runtime.query('select * from justgo.purge_expired_identity_records(1)'),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
