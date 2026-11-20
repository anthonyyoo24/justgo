import { apiRequest } from '../request.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessResponseSchema } from '@justgo/contracts';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';
import { IdentityService } from '../../src/identity/service.js';
import { buildApp } from '../../src/build-app.js';
import { createAppleTransactions } from '../../src/billing/apple.js';
import { localTestDatabaseUrl } from '../../scripts/local-test-database.js';
import {
  createConnectKey,
  createTestChain,
  createTestStore,
  testBilling,
  transactionPayload,
} from '../../scripts/apple-test-store.js';

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '2' });
for (const url of [config.DATABASE_URL, migrationUrl])
  localTestDatabaseUrl(url);
const database = createDatabase(config);
const admin = new Pool(
  poolOptions(readConfig({ ...process.env, DATABASE_URL: migrationUrl! })),
);
const identity = new IdentityService(database.db, {
  rateKey: `isolated-billing-integration-tests-${randomUUID()}`,
});
const transactions = new Map<string, Record<string, unknown>>();
const users = new Set<string>(),
  purchases = new Set<string>();
let app: ReturnType<typeof buildApp>;

beforeAll(async () => {
  const [chain, connect] = await Promise.all([
    createTestChain(),
    createConnectKey(),
  ]);
  const store = createTestStore(chain, connect.publicKey, transactions);
  app = buildApp({
    logger: false,
    checkDatabase: async () => {},
    identity,
    billing: createAppleTransactions(
      { ...testBilling, privateKey: connect.pem },
      { transport: store.transport, rootFingerprints: [chain.rootFingerprint] },
    ),
  });
});
afterAll(async () => {
  try {
    // Billing rows reference users, and the runtime cannot delete them.
    await admin.query(
      'delete from justgo.app_store_subscriptions where original_transaction_id = any($1)',
      [[...purchases]],
    );
    for (const id of users) {
      for (const table of [
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

const secret = () => randomBytes(32).toString('hex');
async function account() {
  const sessionToken = secret();
  const session = await identity.bootstrap({
    deviceId: randomUUID(),
    sessionId: randomUUID(),
    sessionToken,
    credential: secret(),
  });
  users.add(session.userId);
  return { userId: session.userId, token: sessionToken };
}
let serial = 0n;
const base = 4_000_000_000_000_000n + BigInt(Math.floor(Math.random() * 1e12));
/** Sign a transaction at the stub; the original ID defaults to its own ID. */
function purchase(overrides: Record<string, unknown> = {}) {
  const transactionId = String(base + ++serial);
  const payload = transactionPayload({
    transactionId,
    originalTransactionId: transactionId,
    ...overrides,
  });
  purchases.add(String(payload.originalTransactionId));
  transactions.set(transactionId, payload);
  return { transactionId, original: String(payload.originalTransactionId) };
}
let address = 0;
const verify = (transactionId: string, token?: string) =>
  apiRequest(app, {
    method: 'POST',
    url: '/v1/billing/verifications',
    payload: { transactionId },
    remoteAddress: `127.40.0.${++address}`,
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
const access = (token: string) =>
  apiRequest(app, {
    url: '/v1/access',
    headers: { authorization: `Bearer ${token}` },
  });
const stored = async (original: string) =>
  (
    await admin.query<{
      user_id: string | null;
      latest_transaction_id: string;
      expires_at: Date;
      app_account_token: string | null;
    }>(
      'select user_id,latest_transaction_id,expires_at,app_account_token from justgo.app_store_subscriptions where original_transaction_id=$1',
      [original],
    )
  ).rows;

describe('POST /v1/billing/verifications', () => {
  it('stores an owner purchase once and grants the subscription on replay', async () => {
    const owner = await account();
    const { transactionId, original } = purchase();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await verify(transactionId, owner.token);
      expect(response.statusCode).toBe(200);
      const body = accessResponseSchema.parse(response.json());
      expect(body).toMatchObject({
        status: 'verified',
        source: 'subscription',
        productId: 'app.justgo.monthly',
      });
    }
    expect(await stored(original)).toEqual([
      expect.objectContaining({
        user_id: owner.userId,
        latest_transaction_id: transactionId,
      }),
    ]);
    expect((await access(owner.token)).json()).toMatchObject({
      status: 'verified',
      source: 'subscription',
      productId: 'app.justgo.monthly',
    });
  });

  it('stores a guest purchase with no owner', async () => {
    const { transactionId, original } = purchase();
    const response = await verify(transactionId);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'verified',
      source: 'guest_subscription',
    });
    expect(await verify(transactionId)).toMatchObject({ statusCode: 200 });
    expect(await stored(original)).toEqual([
      expect.objectContaining({ user_id: null }),
    ]);
  });

  it('lets the account the app account token names take a guest row', async () => {
    const owner = await account();
    const { transactionId, original } = purchase({
      appAccountToken: owner.userId,
    });
    expect((await verify(transactionId)).json()).toMatchObject({
      source: 'guest_subscription',
    });
    const claimed = await verify(transactionId, owner.token);
    expect(claimed.statusCode).toBe(200);
    expect(claimed.json()).toMatchObject({ source: 'subscription' });
    expect(await stored(original)).toEqual([
      expect.objectContaining({
        user_id: owner.userId,
        app_account_token: owner.userId,
      }),
    ]);
    // The guest no longer reaches the owned row.
    expect((await verify(transactionId)).statusCode).toBe(409);
  });

  it('leaves a guest row without an app account token for adoption', async () => {
    const owner = await account();
    const { transactionId, original } = purchase();
    await verify(transactionId);
    const response = await verify(transactionId, owner.token);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ source: 'guest_subscription' });
    expect(await stored(original)).toEqual([
      expect.objectContaining({ user_id: null }),
    ]);
  });

  it('refuses a purchase another account owns or its token names', async () => {
    const [first, second] = [await account(), await account()];
    const owned = purchase();
    expect((await verify(owned.transactionId, first.token)).statusCode).toBe(
      200,
    );
    for (const token of [second.token, undefined])
      expect((await verify(owned.transactionId, token)).statusCode).toBe(409);
    expect(await stored(owned.original)).toEqual([
      expect.objectContaining({ user_id: first.userId }),
    ]);

    const named = purchase({ appAccountToken: first.userId });
    const refused = await verify(named.transactionId, second.token);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: 'CONFLICT' });
    expect(await stored(named.original)).toEqual([]);
  });

  it.each([
    ['revoked', { revocationDate: Date.now() - 1000 }],
    ['expired', { expiresDate: Date.now() - 1000 }],
  ])('answers unpaid for a %s subscription', async (_name, overrides) => {
    const owner = await account();
    const { transactionId, original } = purchase(overrides);
    const response = await verify(transactionId, owner.token);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'unpaid',
      checkedAt: expect.any(String),
    });
    expect(await stored(original)).toHaveLength(1);
    expect((await access(owner.token)).json().status).toBe('unpaid');
  });

  it('keeps the latest expiry when an older renewal arrives late', async () => {
    const owner = await account();
    const first = purchase({ expiresDate: Date.now() + 86_400_000 });
    const renewalExpiry = Date.now() + 30 * 86_400_000;
    const renewal = purchase({
      originalTransactionId: first.original,
      expiresDate: renewalExpiry,
    });
    await verify(renewal.transactionId, owner.token);
    const late = await verify(first.transactionId, owner.token);
    expect(late.statusCode).toBe(200);
    const [row] = await stored(first.original);
    expect(row?.latest_transaction_id).toBe(renewal.transactionId);
    expect(row?.expires_at.getTime()).toBe(renewalExpiry);
    expect(late.json()).toMatchObject({
      expiresAt: new Date(renewalExpiry).toISOString(),
    });
  });

  it('answers 404 for a transaction Apple does not know and 401 for a bad session', async () => {
    const unknown = String(base + 999_999n);
    expect((await verify(unknown)).statusCode).toBe(404);
    const { transactionId, original } = purchase();
    expect((await verify(transactionId, secret())).statusCode).toBe(401);
    expect(await stored(original)).toEqual([]);
  });
});
