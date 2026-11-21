import { apiRequest } from '../request.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessResponseSchema } from '@justgo/contracts';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';
import { IdentityService } from '../../src/identity/service.js';
import type { VerifiedManagedIdentity } from '../../src/identity/managed-verifier.js';
import { ApiError } from '../../src/http/api-error.js';
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
/** Synthetic Auth users: each bearer names one verified identity. */
const subjects = new Map<string, VerifiedManagedIdentity>();
const identity = new IdentityService(database.db, {
  rateKey: `isolated-billing-integration-tests-${randomUUID()}`,
  managedAuthVerifier: async (token) => {
    const subject = subjects.get(token);
    if (!subject) throw new ApiError('UNAUTHORIZED');
    return subject;
  },
  managedLiveSessionReader: async () => true,
  managedAuthDeletion: async () => {},
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
        'managed_auth_sessions',
        'managed_auth_deletions',
        'managed_auth_accounts',
        'recovery_credentials',
      ])
        await admin.query(`delete from justgo.${table} where user_id=$1`, [id]);
      await admin.query('delete from justgo.users where id=$1', [id]);
    }
  } finally {
    await Promise.all([database.pool.end(), admin.end()]);
  }
});

const secret = () => randomBytes(32).toString('hex');
/** Exchange a fresh bearer for an Auth user, a guest unless `guest` is false. */
async function exchange(authUserId: string, guest: boolean) {
  const token = `synthetic.${randomUUID()}.proof`;
  subjects.set(token, {
    authUserId,
    sessionId: randomUUID(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    guest,
  });
  const session = await identity.exchangeManaged(token, {
    deviceId: randomUUID(),
  });
  users.add(session.userId);
  return { userId: session.userId, token, authUserId, guest: session.guest };
}
const guest = () => exchange(randomUUID(), true);
const account = () => exchange(randomUUID(), false);
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
const verify = (transactionId: string, token: string | undefined) =>
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
      user_id: string;
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

  it('stores a guest purchase under the guest account', async () => {
    const buyer = await guest();
    expect(buyer.guest).toBe(true);
    const { transactionId, original } = purchase({
      appAccountToken: buyer.userId,
    });
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await verify(transactionId, buyer.token);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        status: 'verified',
        source: 'subscription',
      });
    }
    expect(await stored(original)).toEqual([
      expect.objectContaining({ user_id: buyer.userId }),
    ]);
    expect((await access(buyer.token)).json()).toMatchObject({
      status: 'verified',
      source: 'subscription',
    });
  });

  it('keeps the account and its purchase when the guest links a provider', async () => {
    const buyer = await guest();
    const { transactionId, original } = purchase({
      appAccountToken: buyer.userId,
    });
    expect((await verify(transactionId, buyer.token)).statusCode).toBe(200);
    const linked = await exchange(buyer.authUserId, false);
    expect(linked).toMatchObject({ userId: buyer.userId, guest: false });
    const mapping = await admin.query(
      'select guest from justgo.managed_auth_accounts where auth_user_id=$1',
      [buyer.authUserId],
    );
    expect(mapping.rows).toEqual([{ guest: false }]);
    expect((await verify(transactionId, linked.token)).statusCode).toBe(200);
    expect(await stored(original)).toEqual([
      expect.objectContaining({ user_id: buyer.userId }),
    ]);
    // The account it became now holds the row, so another caller is refused.
    const other = await guest();
    expect((await verify(transactionId, other.token)).statusCode).toBe(409);
    // A guest bearer for the linked Auth user no longer passes.
    expect(
      await exchange(buyer.authUserId, true).catch((error: unknown) => error),
    ).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('moves a guest row to the account that signs in, and then holds it there', async () => {
    const buyer = await guest();
    const { transactionId, original } = purchase({
      appAccountToken: buyer.userId,
    });
    await verify(transactionId, buyer.token);
    const owner = await account();
    const moved = await verify(transactionId, owner.token);
    expect(moved.statusCode).toBe(200);
    expect(moved.json()).toMatchObject({ source: 'subscription' });
    expect(await stored(original)).toEqual([
      expect.objectContaining({
        user_id: owner.userId,
        app_account_token: buyer.userId,
      }),
    ]);
    for (const caller of [buyer, await account(), await guest()]) {
      const refused = await verify(transactionId, caller.token);
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ code: 'CONFLICT' });
    }
    expect(await stored(original)).toEqual([
      expect.objectContaining({ user_id: owner.userId }),
    ]);
  });

  it('moves a row from a deleted guest to a new guest', async () => {
    const buyer = await guest();
    const { transactionId, original } = purchase({
      appAccountToken: buyer.userId,
    });
    await verify(transactionId, buyer.token);
    const deleted = await apiRequest(app, {
      method: 'DELETE',
      url: '/v1/account',
      payload: { confirmation: 'delete-account' },
      headers: { authorization: `Bearer ${buyer.token}` },
    });
    expect(deleted.statusCode).toBe(200);
    expect(
      (
        await admin.query(
          'select user_id from justgo.managed_auth_deletions where user_id=$1',
          [buyer.userId],
        )
      ).rows,
    ).toHaveLength(1);
    const next = await guest();
    expect((await verify(transactionId, next.token)).statusCode).toBe(200);
    expect(await stored(original)).toEqual([
      expect.objectContaining({ user_id: next.userId }),
    ]);
  });

  it('refuses a purchase a signed-in account owns or its token names', async () => {
    const [first, second] = [await account(), await account()];
    const owned = purchase();
    expect((await verify(owned.transactionId, first.token)).statusCode).toBe(
      200,
    );
    for (const caller of [second, await guest()])
      expect((await verify(owned.transactionId, caller.token)).statusCode).toBe(
        409,
      );
    expect(await stored(owned.original)).toEqual([
      expect.objectContaining({ user_id: first.userId }),
    ]);

    // A token naming another signed-in account, or nothing this database
    // knows, is refused for every caller and stores nothing.
    for (const token of [first.userId, randomUUID()]) {
      const named = purchase({ appAccountToken: token });
      for (const caller of [second, await guest()]) {
        const refused = await verify(named.transactionId, caller.token);
        expect(refused.statusCode).toBe(409);
        expect(refused.json()).toMatchObject({ code: 'CONFLICT' });
      }
      expect(await stored(named.original)).toEqual([]);
    }
  });

  it('lets any caller take a purchase whose token names a guest account', async () => {
    const buyer = await guest();
    const owner = await account();
    const { transactionId, original } = purchase({
      appAccountToken: buyer.userId,
    });
    expect((await verify(transactionId, owner.token)).statusCode).toBe(200);
    expect(await stored(original)).toEqual([
      expect.objectContaining({ user_id: owner.userId }),
    ]);
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

  it('answers 404 for a transaction Apple does not know and 401 without a valid bearer', async () => {
    const caller = await guest();
    const unknown = String(base + 999_999n);
    expect((await verify(unknown, caller.token)).statusCode).toBe(404);
    const { transactionId, original } = purchase();
    for (const token of [undefined, secret(), 'synthetic.unknown.proof'])
      expect((await verify(transactionId, token)).statusCode).toBe(401);
    expect(await stored(original)).toEqual([]);
  });
});
