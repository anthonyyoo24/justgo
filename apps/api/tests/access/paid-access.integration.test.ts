import { apiRequest } from '../request.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { AccessResponse, Catalog } from '@justgo/contracts';
import { readConfig } from '../../src/config.js';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { IdentityService } from '../../src/identity/service.js';
import { createFreeAccess } from '../../src/access/free-access.js';
import { createPaidAccess } from '../../src/access/paid-access.js';
import { buildApp } from '../../src/build-app.js';
import { localTestDatabaseUrl } from '../../scripts/local-test-database.js';
import { withOwner } from '../db/fixtures/owner.js';

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '2' });
for (const url of [config.DATABASE_URL, migrationUrl])
  localTestDatabaseUrl(url);
const database = createDatabase(config);
const admin = new Pool(
  poolOptions(readConfig({ ...process.env, DATABASE_URL: migrationUrl! })),
);
const identity = new IdentityService(database.db, {
  rateKey: `paid-access-test-${randomUUID()}`,
});
// Billing on: build-app serves the paid readers whatever else it is given.
const paid = buildApp({
  identity,
  logger: false,
  checkDatabase: async () => {},
  ...createFreeAccess(),
  billing: () => Promise.reject(new Error('Apple is not called')),
});
const free = buildApp({
  identity,
  logger: false,
  checkDatabase: async () => {},
  ...createFreeAccess(),
});
const users: string[] = [],
  subscriptions: string[] = [];
const hour = 3_600_000;
const iso = (time: number) => new Date(time).toISOString();
let card: Catalog['cards'][number];

async function account() {
  const token = randomBytes(32).toString('hex');
  const { userId } = await identity.bootstrap({
    deviceId: randomUUID(),
    sessionId: randomUUID(),
    sessionToken: token,
    credential: randomBytes(32).toString('hex'),
  });
  users.push(userId);
  return { userId, token };
}
let serial = 0n;
const base = 5_000_000_000_000_000n + BigInt(Math.floor(Math.random() * 1e12));
async function subscribe(
  userId: string | null,
  expiresAt: number,
  revokedAt: number | null = null,
) {
  const id = String(base + ++serial);
  subscriptions.push(id);
  await admin.query(
    `insert into justgo.app_store_subscriptions(original_transaction_id,user_id,product_id,environment,expires_at,revoked_at,latest_transaction_id) values ($1,$2,'justgo.annual','Sandbox',$3,$4,$1)`,
    [id, userId, iso(expiresAt), revokedAt === null ? null : iso(revokedAt)],
  );
  return id;
}
const get = (api: ReturnType<typeof buildApp>, url: string, token?: string) =>
  apiRequest(api, {
    url,
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
const upload = (token: string, startedAt: number) =>
  apiRequest(paid, {
    method: 'POST',
    url: '/v1/attempts',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      id: randomUUID(),
      challengeId: card.challengeId,
      venue: card.venue,
      startedAt: iso(startedAt),
      startTimeZone: 'America/Toronto',
    },
  });

beforeAll(async () => {
  const reader = await account();
  card = (await get(free, '/v1/challenges', reader.token)).json<Catalog>()
    .cards[0]!;
});
afterAll(async () => {
  try {
    // Billing rows reference users, and the runtime cannot delete them.
    await admin.query(
      'delete from justgo.app_store_subscriptions where original_transaction_id = any($1)',
      [subscriptions],
    );
    for (const id of users) {
      for (const table of [
        'attempt_patch_receipts',
        'attempts',
        'device_sessions',
        'recovery_credentials',
        'devices',
      ])
        await admin.query(`delete from justgo.${table} where user_id=$1`, [id]);
      await admin.query('delete from justgo.users where id=$1', [id]);
    }
  } finally {
    await Promise.all([database.pool.end(), admin.end()]);
  }
});

describe('access from saved Apple subscriptions', () => {
  it('keeps free access with billing off', async () => {
    const a = await account();
    await subscribe(a.userId, Date.now() - hour);
    expect((await get(free, '/v1/access', a.token)).json()).toMatchObject({
      status: 'verified',
      source: 'free_beta',
    });
  });

  it('grants access only from an unexpired, unrevoked row the bearer owns', async () => {
    const none = await account(),
      valid = await account(),
      expired = await account(),
      revoked = await account(),
      other = await account();
    const expiry = Date.now() + 2 * hour;
    await subscribe(valid.userId, Date.now() - hour);
    await subscribe(valid.userId, expiry);
    await subscribe(expired.userId, Date.now() - hour);
    await subscribe(revoked.userId, expiry, Date.now() - hour);
    await subscribe(other.userId, expiry);
    await subscribe(null, expiry);
    const before = Date.now();
    const answer = (
      await get(paid, '/v1/access', valid.token)
    ).json<AccessResponse>();
    expect(answer).toEqual({
      status: 'verified',
      source: 'subscription',
      productId: 'justgo.annual',
      checkedAt: expect.any(String),
      expiresAt: iso(expiry),
    });
    expect(Date.parse(answer.checkedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(answer.checkedAt)).toBeLessThanOrEqual(Date.now());
    expect((await get(paid, '/v1/challenges', valid.token)).statusCode).toBe(
      200,
    );
    for (const unpaid of [none, expired, revoked]) {
      expect((await get(paid, '/v1/access', unpaid.token)).json()).toEqual({
        status: 'unpaid',
        checkedAt: expect.any(String),
      });
      const catalog = await get(paid, '/v1/challenges', unpaid.token);
      expect(catalog.statusCode).toBe(403);
      expect(catalog.json().code).toBe('ACCESS_REQUIRED');
    }
    // Another owner's row and a guest row stay out of reach of this owner.
    await withOwner(database.db, none.userId, async (tx) => {
      expect((await createPaidAccess().entitlementReader(tx)).status).toBe(
        'unpaid',
      );
    });
    expect((await get(paid, '/v1/guest/access')).json().status).toBe('unpaid');
    const guestCatalog = await get(paid, '/v1/guest/challenges');
    expect(guestCatalog.statusCode).toBe(403);
    expect(guestCatalog.json().code).toBe('ACCESS_REQUIRED');
  });

  it('uploads a completion started inside a covered period after it ends, and refuses one started after', async () => {
    const lapsed = await account(),
      cancelled = await account();
    const expiry = Date.now() - hour;
    await subscribe(lapsed.userId, expiry);
    expect((await get(paid, '/v1/access', lapsed.token)).json().status).toBe(
      'unpaid',
    );
    expect((await upload(lapsed.token, expiry - hour)).statusCode).toBe(201);
    const late = await upload(lapsed.token, expiry + 60_000);
    expect(late.statusCode).toBe(403);
    expect(late.json().code).toBe('ATTEMPT_INELIGIBLE');
    // A revocation ends coverage before the expiry Apple first gave.
    const revokedAt = Date.now() - hour;
    await subscribe(cancelled.userId, Date.now() + hour, revokedAt);
    expect((await upload(cancelled.token, revokedAt - 60_000)).statusCode).toBe(
      201,
    );
    expect((await upload(cancelled.token, revokedAt + 60_000)).statusCode).toBe(
      403,
    );
  });

  it('reads coverage only for the session owner', async () => {
    const a = await account(),
      b = await account();
    await subscribe(b.userId, Date.now() + hour);
    const { uploadEligibilityReader } = createPaidAccess();
    const startedAt = iso(Date.now() - 60_000);
    await withOwner(database.db, a.userId, async (tx) => {
      expect(
        await uploadEligibilityReader(tx, { userId: b.userId, startedAt }),
      ).toBe('ineligible');
    });
    await database.db.transaction(async (tx) => {
      expect(
        await uploadEligibilityReader(tx, { userId: b.userId, startedAt }),
      ).toBe('ineligible');
    });
    await withOwner(database.db, b.userId, async (tx) => {
      expect(
        await uploadEligibilityReader(tx, { userId: b.userId, startedAt }),
      ).toBe('eligible');
    });
  });
});
