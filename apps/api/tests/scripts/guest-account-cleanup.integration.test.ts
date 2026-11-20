import { execFile } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';
import { cleanUpGuestAccounts } from '../../scripts/guest-account-cleanup.js';

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
for (const url of [runtimeUrl, migrationUrl])
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
      DATABASE_URL: migrationUrl,
      DATABASE_POOL_MAX: '2',
    }),
  ),
);
const db = drizzle(admin);
const dialect = new PgDialect();
const seeded: string[] = [];

type Seed = { days: number; guest?: boolean; expiresInDays?: number };
async function seed({ days, guest = true, expiresInDays }: Seed) {
  const userId = randomUUID();
  const authUserId = randomUUID();
  seeded.push(userId);
  await admin.query(
    `insert into justgo.users(id,created_at) values($1,now() - make_interval(days => $2))`,
    [userId, days],
  );
  await admin.query(
    'insert into justgo.managed_auth_accounts(auth_user_id,user_id,guest) values($1,$2,$3)',
    [authUserId, userId, guest],
  );
  await admin.query(
    `insert into justgo.managed_auth_sessions(id,auth_user_id,user_id,device_id,expires_at) values($1,$2,$3,$4,now() + interval '1 day')`,
    [randomUUID(), authUserId, userId, randomUUID()],
  );
  if (expiresInDays !== undefined) await subscribe(userId, expiresInDays);
  return { userId, authUserId };
}
async function subscribe(userId: string, expiresInDays: number) {
  const transaction = String(randomInt(1, 2 ** 47));
  await admin.query(
    `insert into justgo.app_store_subscriptions(original_transaction_id,user_id,product_id,environment,expires_at,latest_transaction_id)
    values($1,$2,'justgo.annual','Sandbox',now() + make_interval(days => $3),$1)`,
    [transaction, userId, expiresInDays],
  );
}
async function state({
  userId,
  authUserId,
}: {
  userId: string;
  authUserId: string;
}) {
  const { rows } = await admin.query<{
    deleted: boolean;
    pending: number;
    live: number;
  }>(
    `select u.deleted_at is not null as deleted,
      (select count(*)::int from justgo.managed_auth_deletions d where d.user_id=u.id and d.auth_user_id=$2 and d.completed_at is null) as pending,
      (select count(*)::int from justgo.managed_auth_sessions s where s.user_id=u.id and s.revoked_at is null) as live
    from justgo.users u where u.id=$1`,
    [userId, authUserId],
  );
  return rows[0];
}
const kept = { deleted: false, pending: 0, live: 1 };
const erased = { deleted: true, pending: 1, live: 0 };
const sorted = (ids: string[]) => [...ids].sort();

const script = fileURLToPath(
  new URL('../../scripts/clean-up-guest-accounts.ts', import.meta.url),
);
function run(args: string[], env: Record<string, string | undefined>) {
  const merged = { ...process.env, ...env };
  for (const [key, value] of Object.entries(env))
    if (value === undefined) delete merged[key];
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        process.execPath,
        ['--import', 'tsx', script, ...args],
        { env: merged, cwd: fileURLToPath(new URL('../..', import.meta.url)) },
        (error, stdout, stderr) =>
          resolve({
            code: error ? Number(error.code ?? 1) : 0,
            stdout,
            stderr,
          }),
      );
    },
  );
}

afterAll(async () => {
  for (const table of [
    'managed_auth_deletions',
    'managed_auth_sessions',
    'app_store_subscriptions',
    'managed_auth_accounts',
  ])
    await admin.query(`delete from justgo.${table} where user_id=any($1)`, [
      seeded,
    ]);
  await admin.query('delete from justgo.users where id=any($1)', [seeded]);
  await admin.end();
});

describe('abandoned guest account cleanup on the operator role', () => {
  it('lists only old guests with no recent subscription, then deletes exactly those through account deletion', async () => {
    const oldUnpaid = await seed({ days: 31 });
    const lapsed = await seed({ days: 90, expiresInDays: -31 });
    const young = await seed({ days: 29 });
    const live = await seed({ days: 90, expiresInDays: 10 });
    const recentlyLapsed = await seed({ days: 90, expiresInDays: -29 });
    const linked = await seed({ days: 400, guest: false });
    const others = [young, live, recentlyLapsed, linked];

    expect(sorted(await cleanUpGuestAccounts(db, { dryRun: true }))).toEqual(
      sorted([oldUnpaid.userId, lapsed.userId]),
    );
    for (const account of [oldUnpaid, lapsed, ...others])
      expect(await state(account)).toEqual(kept);

    expect(sorted(await cleanUpGuestAccounts(db, { dryRun: false }))).toEqual(
      sorted([oldUnpaid.userId, lapsed.userId]),
    );
    expect(await state(oldUnpaid)).toEqual(erased);
    expect(await state(lapsed)).toEqual(erased);
    for (const account of others) expect(await state(account)).toEqual(kept);

    expect(await cleanUpGuestAccounts(db, { dryRun: false })).toEqual([]);
    expect(await cleanUpGuestAccounts(db, { dryRun: true })).toEqual([]);
  });

  it('takes at most 100 accounts a run and refuses a larger or invalid batch', async () => {
    const accounts: string[] = [];
    for (let index = 0; index < 101; index++)
      accounts.push((await seed({ days: 40 })).userId);

    const first = await cleanUpGuestAccounts(db, { dryRun: false });
    expect(first).toHaveLength(100);
    const second = await cleanUpGuestAccounts(db, { dryRun: false });
    expect(sorted([...first, ...second])).toEqual(sorted(accounts));
    expect(await cleanUpGuestAccounts(db, { dryRun: false })).toEqual([]);

    for (const limit of [0, 101, 1.5])
      await expect(
        cleanUpGuestAccounts(db, { dryRun: false, limit }),
      ).rejects.toThrow('batch size');
  });

  it('keeps a guest that links or subscribes after the listing and before its deletion', async () => {
    const linking = await seed({ days: 60 });
    const subscribing = await seed({ days: 60 });
    let raced = false;
    const racing = new Proxy(db, {
      get(target, key, receiver) {
        if (key !== 'transaction') return Reflect.get(target, key, receiver);
        return async (
          operation: Parameters<NodePgDatabase['transaction']>[0],
        ) => {
          if (!raced) {
            raced = true;
            await admin.query(
              'update justgo.managed_auth_accounts set guest=false where user_id=$1',
              [linking.userId],
            );
            await subscribe(subscribing.userId, 30);
          }
          return target.transaction(operation);
        };
      },
    });

    expect(await cleanUpGuestAccounts(racing, { dryRun: false })).toEqual([]);
    expect(raced).toBe(true);
    expect(await state(linking)).toEqual(kept);
    expect(await state(subscribing)).toEqual(kept);
  });

  it('leaves no half-deleted account when a deletion fails, and a rerun finishes it', async () => {
    const guest = await seed({ days: 45 });
    const failing = new Proxy(db, {
      get(target, key, receiver) {
        if (key !== 'transaction') return Reflect.get(target, key, receiver);
        return (operation: Parameters<NodePgDatabase['transaction']>[0]) =>
          target.transaction((tx) =>
            operation(
              new Proxy(tx, {
                get(transaction, method, txReceiver) {
                  if (method !== 'execute')
                    return Reflect.get(transaction, method, txReceiver);
                  return async (statement: SQL) => {
                    if (
                      dialect
                        .sqlToQuery(statement)
                        .sql.includes('set deleted_at=now()')
                    )
                      throw new Error('database stopped');
                    return transaction.execute(statement);
                  };
                },
              }),
            ),
          );
      },
    });

    await expect(
      cleanUpGuestAccounts(failing, { dryRun: false }),
    ).rejects.toThrow('database stopped');
    expect(await state(guest)).toEqual(kept);

    expect(await cleanUpGuestAccounts(db, { dryRun: false })).toEqual([
      guest.userId,
    ]);
    expect(await state(guest)).toEqual(erased);
  });

  it('runs only on a separate migrator connection and prints only counts and user IDs', async () => {
    const guest = await seed({ days: 35 });
    const failed = {
      code: 1,
      stdout: '',
      stderr: '{"event":"guest_account_cleanup_failed"}\n',
    };

    expect(
      await run(['--dry-run'], {
        DATABASE_URL:
          'postgresql://justgo_runtime:private-password@db.example.com:5432/postgres',
        MIGRATION_DATABASE_URL: undefined,
      }),
    ).toEqual(failed);
    expect(
      await run(['--dry-run'], {
        DATABASE_URL: migrationUrl,
        MIGRATION_DATABASE_URL: migrationUrl,
      }),
    ).toEqual(failed);
    expect(
      await run(['--dry-run'], {
        DATABASE_URL: 'postgresql://unused@127.0.0.1:1/justgo_test',
        MIGRATION_DATABASE_URL: runtimeUrl,
      }),
    ).toEqual(failed);
    expect(
      await run(['--limit=500'], { MIGRATION_DATABASE_URL: migrationUrl }),
    ).toEqual(failed);
    expect(await state(guest)).toEqual(kept);

    const listed = await run(['--dry-run'], {
      MIGRATION_DATABASE_URL: migrationUrl,
    });
    expect(listed).toEqual({
      code: 0,
      stdout: `${JSON.stringify({ event: 'guest_account_cleanup', dryRun: true, count: 1, userIds: [guest.userId] })}\n`,
      stderr: '',
    });
    expect(await state(guest)).toEqual(kept);

    const deleted = await run([], { MIGRATION_DATABASE_URL: migrationUrl });
    expect(deleted).toEqual({
      code: 0,
      stdout: `${JSON.stringify({ event: 'guest_account_cleanup', dryRun: false, count: 1, userIds: [guest.userId] })}\n`,
      stderr: '',
    });
    expect(await state(guest)).toEqual(erased);
  });
});
