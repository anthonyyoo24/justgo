import { apiRequest } from '../request.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';
import { IdentityService } from '../../src/identity/service.js';
import { buildApp } from '../../src/build-app.js';
import { ApiError } from '../../src/http/api-error.js';
import { BillingRepair } from '../../src/billing/repair.js';
import type {
  AppleSubscriptionReader,
  VerifiedTransaction,
} from '../../src/billing/apple.js';
import { localTestDatabaseUrl } from '../../scripts/local-test-database.js';

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '2' });
for (const url of [config.DATABASE_URL, migrationUrl])
  localTestDatabaseUrl(url);
const database = createDatabase(config);
const admin = new Pool(
  poolOptions(readConfig({ ...process.env, DATABASE_URL: migrationUrl! })),
);
const identity = new IdentityService(database.db, {
  rateKey: `isolated-billing-repair-tests-${randomUUID()}`,
});
const purchases = new Set<string>();
const events = new Set<string>();
// Every subscription has an owner. The repair never reads or changes it.
const owner = randomUUID();
beforeAll(async () => {
  await admin.query('insert into justgo.users(id) values($1)', [owner]);
});
afterAll(async () => {
  try {
    await admin.query(
      'delete from justgo.billing_events where event_id = any($1)',
      [[...events]],
    );
    await admin.query(
      'delete from justgo.app_store_subscriptions where original_transaction_id = any($1)',
      [[...purchases]],
    );
    await admin.query('delete from justgo.users where id=$1', [owner]);
  } finally {
    await Promise.all([database.pool.end(), admin.end()]);
  }
});

const day = 86_400_000;
let serial = 0n;
const base = 6_000_000_000_000_000n + BigInt(Math.floor(Math.random() * 1e12));
/** Seed lapsed subscriptions the repair has never checked. */
async function lapsed(count: number) {
  const ids = Array.from({ length: count }, () => String(base + ++serial));
  for (const id of ids) purchases.add(id);
  await admin.query(
    `insert into justgo.app_store_subscriptions(original_transaction_id,user_id,product_id,environment,expires_at,latest_transaction_id)
     select id,$2,'app.justgo.monthly','Sandbox',now()-interval '1 hour',id from unnest($1::text[]) id`,
    [ids, owner],
  );
  return ids;
}
const renewedUntil = new Date(Date.now() + 30 * day);
/**
 * Apple's stub. It renews every ID this file seeded, refuses an ID it does not
 * know as Apple would, and records each ID it was asked about. Other suites
 * may leave due rows behind, so cases assert only on their own IDs.
 */
function apple(fail?: (id: string) => Error | undefined) {
  const asked: string[] = [];
  const reader: AppleSubscriptionReader = (id) => {
    asked.push(id);
    const failure = fail?.(id);
    if (failure) return Promise.reject(failure);
    if (!purchases.has(id))
      return Promise.reject(new ApiError('NOT_FOUND', 404));
    const purchase: VerifiedTransaction = {
      transactionId: id,
      originalTransactionId: id,
      productId: 'app.justgo.monthly',
      environment: 'Sandbox',
      expiresAt: renewedUntil,
      revokedAt: null,
      appAccountToken: null,
      signedAt: new Date(),
      trial: false,
      autoRenew: true,
    };
    return Promise.resolve(purchase);
  };
  const of = (ids: string[]) => asked.filter((id) => ids.includes(id));
  return { reader, asked, of };
}
const generous = { batch: 25, rows: 100_000, budget: 60_000 };
const checked = async (ids: string[]) =>
  (
    await admin.query<{ id: string; expires_at: Date; checked: boolean }>(
      'select original_transaction_id as id, expires_at, checked_at is not null as checked from justgo.app_store_subscriptions where original_transaction_id = any($1) order by 1',
      [ids],
    )
  ).rows;

describe('billing repair', () => {
  it("stores Apple's answer for each lapsed subscription and each pending event, then finds nothing due", async () => {
    const ids = await lapsed(3);
    const pending = String(base + ++serial);
    purchases.add(pending);
    await admin.query(
      `insert into justgo.app_store_subscriptions(original_transaction_id,user_id,product_id,environment,expires_at,latest_transaction_id)
       values($1,$2,'app.justgo.monthly','Sandbox',now()+interval '2 days',$1)`,
      [pending, owner],
    );
    const eventId = `msg_${randomUUID().replaceAll('-', '')}`;
    events.add(eventId);
    await admin.query(
      'insert into justgo.billing_events(event_id,original_transaction_id) values($1,$2)',
      [eventId, pending],
    );
    const stub = apple();
    const result = await new BillingRepair(
      identity,
      stub.reader,
      generous,
    ).run();
    expect(result.remaining).toBe(false);
    expect(stub.of([...ids, pending]).sort()).toEqual([...ids, pending].sort());
    expect(await checked([...ids, pending])).toEqual(
      [...ids, pending]
        .sort()
        .map((id) => ({ id, expires_at: renewedUntil, checked: true })),
    );
    const { rows } = await admin.query<{ confirmed: boolean }>(
      'select confirmed_at is not null as confirmed from justgo.billing_events where event_id=$1',
      [eventId],
    );
    expect(rows).toEqual([{ confirmed: true }]);
    const again = apple();
    await new BillingRepair(identity, again.reader, generous).run();
    expect(again.of([...ids, pending])).toEqual([]);
  });

  it('resumes after a crash from what is still due and repeats no completed row', async () => {
    const ids = await lapsed(6);
    // The process dies on the fourth of this file's rows.
    const crashing = apple((id) =>
      id === ids[3] ? new Error('process killed') : undefined,
    );
    await expect(
      new BillingRepair(identity, crashing.reader, generous).run(),
    ).rejects.toThrow('process killed');
    expect(crashing.of(ids)).toEqual(ids.slice(0, 4));
    expect((await checked(ids)).map((row) => row.checked)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
    const resumed = apple();
    const result = await new BillingRepair(
      identity,
      resumed.reader,
      generous,
    ).run();
    expect(result.remaining).toBe(false);
    expect(resumed.of(ids)).toEqual(ids.slice(3));
    expect((await checked(ids)).every((row) => row.checked)).toBe(true);
  });

  it('answers 503 and keeps committed rows when Apple is unreachable mid-run', async () => {
    const ids = await lapsed(3);
    const down = apple((id) =>
      id === ids[1] ? new ApiError('UNAVAILABLE', 503) : undefined,
    );
    await expect(
      new BillingRepair(identity, down.reader, generous).run(),
    ).rejects.toMatchObject({ status: 503 });
    expect((await checked(ids)).map((row) => row.checked)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('stops at its row limit and finishes over later runs, asking about each row once', async () => {
    const ids = await lapsed(7);
    const seen: string[] = [];
    for (let run = 0; run < 1000; run += 1) {
      const stub = apple();
      const result = await new BillingRepair(identity, stub.reader, {
        batch: 2,
        rows: 3,
        budget: 60_000,
      }).run();
      expect(stub.of(ids).length).toBeLessThanOrEqual(3);
      seen.push(...stub.of(ids));
      if (!result.remaining) break;
    }
    expect(seen).toEqual(ids);
  });

  it('counts a row Apple refuses as failed, leaves it due and moves past it', async () => {
    const ids = await lapsed(3);
    const middle = ids[1]!;
    const refusing = apple((id) =>
      id === middle ? new ApiError('NOT_FOUND', 404) : undefined,
    );
    const result = await new BillingRepair(
      identity,
      refusing.reader,
      generous,
    ).run();
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(refusing.of(ids)).toEqual(ids);
    expect((await checked(ids)).map((row) => row.checked)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it('repairs 100 rows within 30 seconds', async () => {
    const ids = await lapsed(100);
    const stub = apple();
    const started = performance.now();
    const result = await new BillingRepair(
      identity,
      stub.reader,
      generous,
    ).run();
    const elapsed = performance.now() - started;
    expect(result.remaining).toBe(false);
    expect(stub.of(ids)).toEqual(ids);
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);

  it('runs only for the repair secret', async () => {
    const repairSecret = randomBytes(32).toString('hex');
    const stub = apple();
    const app = buildApp({
      logger: false,
      checkDatabase: async () => {},
      identity,
      billing: () => Promise.reject(new Error('not called')),
      billingEvents: {
        subscriptions: stub.reader,
        webhookSecret: `whsec_${randomBytes(24).toString('base64')}`,
        repairSecret,
      },
    });
    const post = (authorization?: string) =>
      apiRequest(app, {
        method: 'POST',
        url: '/v1/billing/repair',
        remoteAddress: '127.42.0.1',
        ...(authorization ? { headers: { authorization } } : {}),
      });
    for (const authorization of [
      undefined,
      `Bearer ${repairSecret.slice(1)}`,
      repairSecret,
    ]) {
      const refused = await post(authorization);
      expect(refused.statusCode).toBe(401);
      expect(refused.body).not.toContain(repairSecret);
    }
    expect(stub.asked).toEqual([]);
    const ids = await lapsed(2);
    const response = await post(`Bearer ${repairSecret}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ remaining: false });
    expect(stub.of(ids)).toEqual(ids);
  });
});
