import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { setTransactionContext } from '../../src/db/transaction-context.js';
import { readConfig } from '../../src/config.js';

const config = readConfig();
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (
  !config.DATABASE_URL ||
  !migrationUrl ||
  !['localhost', '127.0.0.1'].includes(new URL(config.DATABASE_URL).hostname) ||
  !['localhost', '127.0.0.1'].includes(new URL(migrationUrl).hostname)
) {
  throw new Error(
    'Database integration tests require the dedicated local test database. Run pnpm run db:local first.',
  );
}
const runtime = createDatabase(config);
const admin = new Pool(
  poolOptions(readConfig({ ...process.env, DATABASE_URL: migrationUrl })),
);
type Transaction = Parameters<typeof setTransactionContext>[0];
type Context = {
  owner?: string;
  purchase?: string;
  event?: string;
  confirmed?: string;
  repair?: boolean;
};

const alice = randomUUID();
const bob = randomUUID();
// Two guest accounts: an anonymous Auth user mapped with guest set.
const gina = randomUUID();
const gus = randomUUID();
const guests = [gina, gus];
const serial = () =>
  String(3_000_000_000_000_000n + BigInt(Math.floor(Math.random() * 1e15)));
const alicePurchase = serial();
const bobPurchase = serial();
const purchases = [alicePurchase, bobPurchase];
const events: string[] = [];
const eventId = () => {
  const id = randomUUID();
  events.push(id);
  return id;
};

const within = <T>(
  context: Context,
  operation: (tx: Transaction) => Promise<T>,
) =>
  runtime.db.transaction(async (tx) => {
    if (context.owner)
      await setTransactionContext(tx, 'app.user_id', context.owner);
    if (context.purchase)
      await setTransactionContext(
        tx,
        'app.original_transaction_id',
        context.purchase,
      );
    if (context.event)
      await setTransactionContext(tx, 'app.billing_event_id', context.event);
    if (context.confirmed)
      await setTransactionContext(
        tx,
        'app.apple_confirmed_transaction_id',
        context.confirmed,
      );
    if (context.repair)
      await setTransactionContext(tx, 'app.billing_repair', 'on');
    return operation(tx);
  });
const insertSubscription = (purchase: string, owner: string | null) =>
  sql`insert into justgo.app_store_subscriptions(original_transaction_id,user_id,product_id,environment,expires_at,latest_transaction_id)
    values(${purchase},${owner},'justgo.monthly','Sandbox',now()+interval '30 days',${purchase})`;
const visible = async (context: Context) =>
  (
    await within(context, (tx) =>
      tx.execute<{ id: string; owner: string | null }>(
        sql`select original_transaction_id as id,user_id as owner from justgo.app_store_subscriptions order by 1`,
      ),
    )
  ).rows;
const sqlState = (work: Promise<unknown>) =>
  work.then(
    () => 'succeeded',
    (error: { code?: string; cause?: { code?: string } }) =>
      error.cause?.code ?? error.code,
  );

beforeAll(async () => {
  await admin.query('insert into justgo.users(id) values($1),($2),($3),($4)', [
    alice,
    bob,
    ...guests,
  ]);
  await admin.query(
    'insert into justgo.managed_auth_accounts(auth_user_id,user_id,guest) select gen_random_uuid(),id,true from unnest($1::uuid[]) id',
    [guests],
  );
  await within({ owner: alice }, (tx) =>
    tx.execute(insertSubscription(alicePurchase, alice)),
  );
  await within({ owner: bob }, (tx) =>
    tx.execute(insertSubscription(bobPurchase, bob)),
  );
});
afterAll(async () => {
  try {
    await admin.query(
      'delete from justgo.app_store_subscriptions where user_id = any($1) or original_transaction_id = any($2)',
      [[alice, bob, ...guests], purchases],
    );
    await admin.query(
      'delete from justgo.managed_auth_accounts where user_id = any($1)',
      [guests],
    );
    await admin.query(
      'delete from justgo.billing_events where event_id = any($1)',
      [events],
    );
    await admin.query('delete from justgo.users where id = any($1)', [
      [alice, bob, ...guests],
    ]);
  } finally {
    await Promise.all([admin.end(), runtime.pool.end()]);
  }
});

describe('billing tables under the restricted runtime role', () => {
  it('shows no subscription or event without an owner or a verified ID', async () => {
    const event = eventId();
    await within({ event }, (tx) =>
      tx.execute(
        sql`insert into justgo.billing_events(event_id) values(${event})`,
      ),
    );
    expect(await visible({})).toEqual([]);
    expect(
      (await runtime.pool.query('select * from justgo.billing_events')).rows,
    ).toEqual([]);
  });

  it('keeps each owner to its own subscriptions', async () => {
    expect(await visible({ owner: alice })).toEqual([
      { id: alicePurchase, owner: alice },
    ]);
    expect(
      await sqlState(
        within({ owner: alice }, (tx) =>
          tx.execute(insertSubscription(serial(), bob)),
        ),
      ),
    ).toBe('42501');
    expect(
      await sqlState(
        within({ owner: alice }, (tx) =>
          tx.execute(insertSubscription(bobPurchase, alice)),
        ),
      ),
    ).toBe('23505');
    const moved = await within({ owner: alice }, (tx) =>
      tx.execute(
        sql`update justgo.app_store_subscriptions set expires_at=now() where original_transaction_id=${bobPurchase}`,
      ),
    );
    expect(moved.rowCount).toBe(0);
    expect(
      await sqlState(
        within({ owner: alice, purchase: bobPurchase }, (tx) =>
          tx.execute(
            sql`update justgo.app_store_subscriptions set user_id=${alice} where original_transaction_id=${bobPurchase}`,
          ),
        ),
      ).then(async (state) => [
        state,
        (await visible({ owner: bob }))[0]?.owner,
      ]),
    ).toEqual(['succeeded', bob]);
  });

  it('reaches a guest account purchase only through its verified original transaction ID', async () => {
    const purchase = serial();
    purchases.push(purchase);
    // The verified ID alone writes no row, with an owner or without.
    for (const owner of [null, gina])
      expect(
        await sqlState(
          within({ purchase }, (tx) =>
            tx.execute(insertSubscription(purchase, owner)),
          ),
        ),
      ).toBe('42501');
    expect(
      await sqlState(
        admin.query(
          "insert into justgo.app_store_subscriptions(original_transaction_id,product_id,environment,expires_at,latest_transaction_id) values($1,'justgo.monthly','Sandbox',now(),$1)",
          [purchase],
        ),
      ),
    ).toBe('23502');
    await within({ owner: gina }, (tx) =>
      tx.execute(insertSubscription(purchase, gina)),
    );
    expect(await visible({ purchase })).toEqual([
      { id: purchase, owner: gina },
    ]);
    expect(await visible({ purchase: serial() })).toEqual([]);
    // A signed-in account's row stays out of reach of its verified ID.
    expect(await visible({ purchase: alicePurchase })).toEqual([]);
    expect(await visible({ owner: alice })).toEqual([
      { id: alicePurchase, owner: alice },
    ]);
    // The verified ID alone cannot move the row: a write leaves it with the caller.
    expect(
      await sqlState(
        within({ purchase }, (tx) =>
          tx.execute(
            sql`update justgo.app_store_subscriptions set user_id=${alice} where original_transaction_id=${purchase}`,
          ),
        ),
      ),
    ).toBe('42501');
    // Guest mappings show only while a verified ID is set, and never change there.
    const mappings = (context: Context) =>
      within(context, async (tx) =>
        (
          await tx.execute<{ user_id: string }>(
            sql`select user_id from justgo.managed_auth_accounts where user_id in (${gina},${gus},${alice}) order by 1`,
          )
        ).rows.map(({ user_id }) => user_id),
      );
    expect(await mappings({})).toEqual([]);
    expect(await mappings({ purchase })).toEqual([...guests].sort());
    expect(
      await within({ purchase }, async (tx) => [
        (
          await tx.execute(
            sql`select 1 from justgo.managed_auth_accounts where user_id=${gina} for share`,
          )
        ).rows.length,
        await sqlState(
          tx.execute(
            sql`update justgo.managed_auth_accounts set guest=false where user_id=${gus}`,
          ),
        ),
      ]),
    ).toEqual([1, '42501']);
  });

  it('moves a guest account purchase to the verifying owner, then never again', async () => {
    const purchase = serial();
    purchases.push(purchase);
    await within({ owner: gina }, (tx) =>
      tx.execute(insertSubscription(purchase, gina)),
    );
    await within({ owner: gus, purchase }, (tx) =>
      tx.execute(
        sql`update justgo.app_store_subscriptions set user_id=${gus} where original_transaction_id=${purchase}`,
      ),
    );
    await within({ owner: alice, purchase }, (tx) =>
      tx.execute(
        sql`update justgo.app_store_subscriptions set user_id=${alice} where original_transaction_id=${purchase}`,
      ),
    );
    expect(await visible({ owner: alice })).toContainEqual({
      id: purchase,
      owner: alice,
    });
    expect(await visible({ purchase })).toEqual([]);
    expect(
      await sqlState(
        within({ owner: alice, purchase }, (tx) =>
          tx.execute(
            sql`update justgo.app_store_subscriptions set user_id=null where original_transaction_id=${purchase}`,
          ),
        ),
      ),
    ).toBe('42501');
    for (const [owner, state] of [
      [bob, '23514'],
      [gina, '23514'],
      [null, '23502'],
    ] as const)
      expect(
        await sqlState(
          admin.query(
            'update justgo.app_store_subscriptions set user_id=$2 where original_transaction_id=$1',
            [purchase, owner],
          ),
        ),
      ).toBe(state);
    const {
      rows: [row],
    } = await admin.query<{ user_id: string }>(
      'select user_id from justgo.app_store_subscriptions where original_transaction_id=$1',
      [purchase],
    );
    expect(row?.user_id).toBe(alice);
  });

  it('ends a guest once and never makes an account a guest again', async () => {
    const auth = randomUUID();
    const user = randomUUID();
    await admin.query('insert into justgo.users(id) values($1)', [user]);
    await admin.query(
      'insert into justgo.managed_auth_accounts(auth_user_id,user_id,guest) values($1,$2,true)',
      [auth, user],
    );
    try {
      const own = (guest: boolean) =>
        runtime.db.transaction(async (tx) => {
          await setTransactionContext(tx, 'app.auth_user_id', auth);
          await setTransactionContext(tx, 'app.user_id', user);
          return (
            await tx.execute(
              sql`update justgo.managed_auth_accounts set guest=${guest} where auth_user_id=${auth}`,
            )
          ).rowCount;
        });
      expect(await own(false)).toBe(1);
      expect(await sqlState(own(true))).toBe('23514');
      expect(
        await sqlState(
          admin.query(
            'update justgo.managed_auth_accounts set guest=true where auth_user_id=$1',
            [auth],
          ),
        ),
      ).toBe('23514');
      // The runtime may change only the guest column of its own mapping.
      expect(
        await sqlState(
          runtime.db.transaction(async (tx) => {
            await setTransactionContext(tx, 'app.auth_user_id', auth);
            await setTransactionContext(tx, 'app.user_id', user);
            await tx.execute(
              sql`update justgo.managed_auth_accounts set user_id=${user} where auth_user_id=${auth}`,
            );
          }),
        ),
      ).toBe('42501');
    } finally {
      await admin.query(
        'delete from justgo.managed_auth_accounts where auth_user_id=$1',
        [auth],
      );
      await admin.query('delete from justgo.users where id=$1', [user]);
    }
  });

  it('records a Superwall event once, so a redelivery is a no-op', async () => {
    const event = eventId();
    const record = () =>
      within({ event }, (tx) =>
        tx.execute(
          sql`insert into justgo.billing_events(event_id) values(${event}) on conflict do nothing`,
        ),
      );
    expect((await record()).rowCount).toBe(1);
    expect((await record()).rowCount).toBe(0);
    expect(
      await sqlState(
        within({ event: randomUUID() }, (tx) =>
          tx.execute(
            sql`insert into justgo.billing_events(event_id) values(${event})`,
          ),
        ),
      ),
    ).toBe('42501');
  });

  it('lets an Apple-confirmed ID read and update only its own subscription and events, never insert one or move an owner', async () => {
    const guest = serial();
    purchases.push(guest);
    await within({ owner: gina }, (tx) =>
      tx.execute(insertSubscription(guest, gina)),
    );
    const named = eventId();
    const other = eventId();
    await within({ event: named }, (tx) =>
      tx.execute(
        sql`insert into justgo.billing_events(event_id,original_transaction_id) values(${named},${guest})`,
      ),
    );
    await within({ event: other }, (tx) =>
      tx.execute(
        sql`insert into justgo.billing_events(event_id,original_transaction_id) values(${other},${alicePurchase})`,
      ),
    );
    expect(await visible({ confirmed: guest })).toEqual([
      { id: guest, owner: gina },
    ]);
    expect(await visible({ confirmed: alicePurchase })).toEqual([
      { id: alicePurchase, owner: alice },
    ]);
    const updated = await within({ confirmed: guest }, async (tx) => [
      (
        await tx.execute(
          sql`update justgo.app_store_subscriptions set checked_at=now(), expires_at=expires_at+interval '1 day' where original_transaction_id in (${guest},${alicePurchase},${bobPurchase})`,
        )
      ).rowCount,
      (
        await tx.execute(
          sql`update justgo.billing_events set confirmed_at=now() where event_id in (${named},${other})`,
        )
      ).rowCount,
    ]);
    expect(updated).toEqual([1, 1]);
    // A fresh purchase, a guest row moved, an owner moved and another column of an event.
    const fresh = serial();
    expect(
      await sqlState(
        within({ confirmed: fresh }, (tx) =>
          tx.execute(insertSubscription(fresh, alice)),
        ),
      ),
    ).toBe('42501');
    for (const [confirmed, purchase, owner] of [
      [guest, guest, alice],
      [alicePurchase, alicePurchase, bob],
    ] as const)
      expect(
        await sqlState(
          within({ confirmed, owner: alice }, (tx) =>
            tx.execute(
              sql`update justgo.app_store_subscriptions set user_id=${owner} where original_transaction_id=${purchase}`,
            ),
          ),
        ),
      ).toBe('23514');
    expect(
      await sqlState(
        within({ confirmed: guest }, (tx) =>
          tx.execute(
            sql`update justgo.billing_events set original_transaction_id=${alicePurchase} where event_id=${named}`,
          ),
        ),
      ),
    ).toBe('42501');
    expect(
      await sqlState(
        within({ confirmed: guest }, (tx) =>
          tx.execute(
            sql`insert into justgo.billing_events(event_id,original_transaction_id) values(${eventId()},${guest})`,
          ),
        ),
      ),
    ).toBe('42501');
    const { rows } = await admin.query<{
      user_id: string;
      checked: boolean;
    }>(
      'select user_id, checked_at is not null as checked from justgo.app_store_subscriptions where original_transaction_id=$1',
      [guest],
    );
    expect(rows).toEqual([{ user_id: gina, checked: true }]);
  });

  it('lets the repair scan list only lapsed unchecked subscriptions and unconfirmed events, read-only', async () => {
    const lapsed = serial();
    const checked = serial();
    purchases.push(lapsed, checked);
    for (const purchase of [lapsed, checked])
      await within({ owner: gina }, (tx) =>
        tx.execute(insertSubscription(purchase, gina)),
      );
    await admin.query(
      "update justgo.app_store_subscriptions set expires_at=now()-interval '1 hour', checked_at=case when original_transaction_id=$2 then now() else null end where original_transaction_id in ($1,$2)",
      [lapsed, checked],
    );
    const pending = eventId();
    const done = eventId();
    const bare = eventId();
    await admin.query(
      'insert into justgo.billing_events(event_id,original_transaction_id,confirmed_at) values($1,$4,null),($2,$4,now()),($3,null,null)',
      [pending, done, bare, bobPurchase],
    );
    const scan = (context: Context) =>
      within(context, async (tx) => ({
        subscriptions: (
          await tx.execute<{ id: string }>(
            sql`select original_transaction_id as id from justgo.app_store_subscriptions where original_transaction_id in (${sql.join([lapsed, checked, alicePurchase, bobPurchase], sql`,`)})`,
          )
        ).rows.map(({ id }) => id),
        events: (
          await tx.execute<{ id: string }>(
            sql`select event_id as id from justgo.billing_events where event_id in (${sql.join([pending, done, bare], sql`,`)})`,
          )
        ).rows.map(({ id }) => id),
      }));
    expect(await scan({ repair: true })).toEqual({
      subscriptions: [lapsed],
      events: [pending],
    });
    expect(await scan({})).toEqual({ subscriptions: [], events: [] });
    const writes = await within({ repair: true }, async (tx) => [
      (
        await tx.execute(
          sql`update justgo.app_store_subscriptions set checked_at=now() where original_transaction_id=${lapsed}`,
        )
      ).rowCount,
      (
        await tx.execute(
          sql`update justgo.billing_events set confirmed_at=now() where event_id=${pending}`,
        )
      ).rowCount,
    ]);
    expect(writes).toEqual([0, 0]);
  });

  it('grants the runtime no delete on subscriptions and no update or delete on events', async () => {
    expect(
      await sqlState(
        within({ owner: alice }, (tx) =>
          tx.execute(
            sql`delete from justgo.app_store_subscriptions where original_transaction_id=${alicePurchase}`,
          ),
        ),
      ),
    ).toBe('42501');
    const { rows } = await admin.query<{ privilege: string; held: boolean }>(
      `select t || ':' || p as privilege, has_table_privilege('justgo_runtime', 'justgo.' || t, p) as held
       from unnest(array['app_store_subscriptions','billing_events']) t, unnest(array['DELETE','UPDATE','TRUNCATE']) p order by 1`,
    );
    expect(
      Object.fromEntries(rows.map((row) => [row.privilege, row.held])),
    ).toEqual({
      'app_store_subscriptions:DELETE': false,
      'app_store_subscriptions:TRUNCATE': false,
      'app_store_subscriptions:UPDATE': true,
      'billing_events:DELETE': false,
      'billing_events:TRUNCATE': false,
      'billing_events:UPDATE': false,
    });
    // Only the confirmation time of an event can change.
    const columns = await admin.query<{ column_name: string; held: boolean }>(
      `select column_name, has_column_privilege('justgo_runtime', 'justgo.billing_events', column_name, 'UPDATE') as held
       from information_schema.columns where table_schema='justgo' and table_name='billing_events' order by 1`,
    );
    expect(
      Object.fromEntries(
        columns.rows.map((row) => [row.column_name, row.held]),
      ),
    ).toEqual({
      confirmed_at: true,
      event_id: false,
      original_transaction_id: false,
      received_at: false,
    });
  });
});
