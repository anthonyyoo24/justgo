import { apiRequest } from '../request.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';
import { IdentityService } from '../../src/identity/service.js';
import { buildApp } from '../../src/build-app.js';
import {
  createAppleSubscriptions,
  createAppleTransactions,
} from '../../src/billing/apple.js';
import { localTestDatabaseUrl } from '../../scripts/local-test-database.js';
import {
  createConnectKey,
  createTestChain,
  createTestStore,
  testBilling,
  transactionPayload,
} from '../../scripts/apple-test-store.js';
import { superwallEvent, svixHeaders, testWebhookSecret } from './svix.js';

const migrationUrl = process.env.MIGRATION_DATABASE_URL;
const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '2' });
for (const url of [config.DATABASE_URL, migrationUrl])
  localTestDatabaseUrl(url);
const database = createDatabase(config);
const admin = new Pool(
  poolOptions(readConfig({ ...process.env, DATABASE_URL: migrationUrl! })),
);
const identity = new IdentityService(database.db, {
  rateKey: `isolated-billing-webhook-tests-${randomUUID()}`,
});
const secret = testWebhookSecret();
/** Apple's transactions by ID, and each subscription's latest by original ID. */
const transactions = new Map<string, Record<string, unknown>>();
const latest = new Map<string, Record<string, unknown>>();
const users = new Set<string>(),
  purchases = new Set<string>(),
  events = new Set<string>();
let appleDown = false;
let statusReads: string[] = [];
/** Apple's next answer about this ID, held after Apple gives it until the gate opens. */
let hold: { id: string; answered: () => void; gate: Promise<void> } | undefined;
let app: ReturnType<typeof buildApp>;

beforeAll(async () => {
  const [chain, connect] = await Promise.all([
    createTestChain(),
    createConnectKey(),
  ]);
  const store = createTestStore(chain, connect.publicKey, transactions, {
    subscriptions: latest,
  });
  const transport: typeof fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const asked = /\/subscriptions\/(\d+)$/.exec(url)?.[1];
    if (asked) statusReads.push(asked);
    if (appleDown) return Promise.resolve(new Response('{}', { status: 503 }));
    const held = hold;
    if (held && /\/(\d+)$/.exec(url)?.[1] === held.id) {
      hold = undefined;
      return store.transport(input, init).then(async (answer) => {
        held.answered();
        await held.gate;
        return answer;
      });
    }
    return store.transport(input, init);
  };
  const apple = {
    transport,
    rootFingerprints: [chain.rootFingerprint],
  };
  const billingConfig = { ...testBilling, privateKey: connect.pem };
  app = buildApp({
    logger: false,
    checkDatabase: async () => {},
    identity,
    billing: createAppleTransactions(billingConfig, apple),
    billingEvents: {
      subscriptions: createAppleSubscriptions(billingConfig, apple),
      webhookSecret: secret,
      repairSecret: randomBytes(32).toString('hex'),
    },
  });
});
afterAll(async () => {
  try {
    // Billing rows reference users, and the runtime cannot delete them.
    await admin.query(
      'delete from justgo.billing_events where event_id = any($1)',
      [[...events]],
    );
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

let serial = 0n;
const base = 5_000_000_000_000_000n + BigInt(Math.floor(Math.random() * 1e12));
const day = 86_400_000;
let address = 0;
const remoteAddress = () => `127.41.0.${(++address % 250) + 1}`;

/** A subscription the phone already verified, so the API holds a row. */
async function subscribed(
  overrides: Record<string, unknown> = {},
  token?: string,
) {
  const transactionId = String(base + ++serial);
  const payload = transactionPayload({
    transactionId,
    originalTransactionId: transactionId,
    expiresDate: Date.now() + 2 * day,
    ...overrides,
  });
  transactions.set(transactionId, payload);
  latest.set(transactionId, payload);
  purchases.add(transactionId);
  const response = await apiRequest(app, {
    method: 'POST',
    url: '/v1/billing/verifications',
    payload: { transactionId },
    remoteAddress: remoteAddress(),
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
  expect(response.statusCode).toBe(200);
  return transactionId;
}
/** Change what Apple answers as the subscription's latest transaction. */
function appleSays(original: string, overrides: Record<string, unknown>) {
  const transactionId = String(base + ++serial);
  latest.set(
    original,
    transactionPayload({
      transactionId,
      originalTransactionId: original,
      ...overrides,
    }),
  );
  return transactionId;
}
function deliver(body: string, signed = svixHeaders(secret, body)) {
  events.add(signed['svix-id']);
  return apiRequest(app, {
    method: 'POST',
    url: '/v1/billing/superwall-events',
    headers: { 'content-type': 'application/json', ...signed },
    payload: body,
    remoteAddress: remoteAddress(),
  });
}
/**
 * Let Apple answer the next read about `id` at once and hold that answer on
 * its way to the API, as network delay or a slow handler would, until
 * `release()`. `answered` settles once Apple has answered.
 */
function holdNextAnswer(id: string) {
  let release!: () => void;
  let answered!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const ready = new Promise<void>((resolve) => (answered = resolve));
  hold = { id, answered, gate };
  return { answered: ready, release };
}
async function owned() {
  const sessionToken = randomBytes(32).toString('hex');
  const owner = await identity.bootstrap({
    deviceId: randomUUID(),
    sessionId: randomUUID(),
    sessionToken,
    credential: randomBytes(32).toString('hex'),
  });
  users.add(owner.userId);
  return { sessionToken, userId: owner.userId };
}
const access = async (token: string) =>
  (
    await apiRequest(app, {
      url: '/v1/access',
      headers: { authorization: `Bearer ${token}` },
    })
  ).json<{ status: string }>().status;
const row = async (original: string) =>
  (
    await admin.query<{
      user_id: string | null;
      latest_transaction_id: string;
      expires_at: Date;
      revoked_at: Date | null;
      checked_at: Date | null;
    }>(
      'select user_id,latest_transaction_id,expires_at,revoked_at,checked_at from justgo.app_store_subscriptions where original_transaction_id=$1',
      [original],
    )
  ).rows[0];
const event = async (id: string) =>
  (
    await admin.query<{
      original_transaction_id: string | null;
      confirmed: boolean;
    }>(
      'select original_transaction_id, confirmed_at is not null as confirmed from justgo.billing_events where event_id=$1',
      [id],
    )
  ).rows;

describe('POST /v1/billing/superwall-events', () => {
  it('moves the saved expiry forward when a signed renewal arrives and Apple confirms it', async () => {
    const original = await subscribed();
    const renewedUntil = Date.now() + 32 * day;
    const renewal = appleSays(original, { expiresDate: renewedUntil });
    const response = await deliver(superwallEvent('renewal', original));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'confirmed' });
    expect(await row(original)).toMatchObject({
      latest_transaction_id: renewal,
      expires_at: new Date(renewedUntil),
      revoked_at: null,
      checked_at: expect.any(Date),
    });
  });

  it('refuses an unsigned or stale event and saves nothing', async () => {
    const original = await subscribed();
    appleSays(original, { expiresDate: Date.now() + 50 * day });
    const before = await row(original);
    const body = superwallEvent('renewal', original);
    const stale = svixHeaders(secret, body, {
      timestamp: Math.floor(Date.now() / 1000) - 301,
    });
    const unsigned = {
      'svix-id': `msg_${randomUUID().replaceAll('-', '')}`,
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': 'v1,',
    };
    for (const signed of [unsigned, stale]) {
      const reads = statusReads.length;
      const response = await deliver(body, signed);
      expect(response.statusCode).toBe(400);
      expect(await event(signed['svix-id'])).toEqual([]);
      expect(statusReads.length).toBe(reads);
    }
    expect(await row(original)).toEqual(before);
  });

  it('handles a redelivered event once and answers 2xx both times', async () => {
    const original = await subscribed();
    appleSays(original, { expiresDate: Date.now() + 40 * day });
    const body = superwallEvent('renewal', original);
    const signed = svixHeaders(secret, body);
    statusReads = [];
    const first = await deliver(body, signed);
    const second = await deliver(
      body,
      svixHeaders(secret, body, { id: signed['svix-id'] }),
    );
    expect([first.statusCode, second.statusCode]).toEqual([200, 200]);
    expect([first.json(), second.json()]).toEqual([
      { status: 'confirmed' },
      { status: 'duplicate' },
    ]);
    expect(statusReads).toEqual([original]);
    expect(await event(signed['svix-id'])).toEqual([
      { original_transaction_id: original, confirmed: true },
    ]);
  });

  it("stores Apple's state whatever order expiration and renewal arrive in, and ignores the payload's own claims", async () => {
    const original = await subscribed({ expiresDate: Date.now() - 60_000 });
    const renewedUntil = Date.now() + 30 * day;
    const renewal = appleSays(original, { expiresDate: renewedUntil });
    // Expiration arrives after the renewal happened, then the renewal, each
    // claiming an expiry Apple never gave.
    for (const [type, claimed] of [
      ['expiration', Date.now() - 60_000],
      ['renewal', Date.now() + 365 * day],
    ] as const) {
      const response = await deliver(
        superwallEvent(type, original, { expirationAt: claimed }),
      );
      expect(response.json()).toEqual({ status: 'confirmed' });
      expect(await row(original)).toMatchObject({
        latest_transaction_id: renewal,
        expires_at: new Date(renewedUntil),
      });
    }
    // A stale answer that names an earlier expiry never shortens access.
    appleSays(original, { expiresDate: Date.now() + day });
    await deliver(superwallEvent('renewal', original));
    expect((await row(original))?.expires_at).toEqual(new Date(renewedUntil));
  });

  it('ends access when Apple confirms a refund, and keeps the owner', async () => {
    const sessionToken = randomBytes(32).toString('hex');
    const owner = await identity.bootstrap({
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      sessionToken,
      credential: randomBytes(32).toString('hex'),
    });
    users.add(owner.userId);
    const original = await subscribed(
      { appAccountToken: owner.userId },
      sessionToken,
    );
    const stored = await row(original);
    expect(stored?.user_id).toBe(owner.userId);
    const revokedAt = Date.now() - 1000;
    appleSays(original, {
      appAccountToken: owner.userId,
      expiresDate: stored?.expires_at.getTime(),
      revocationDate: revokedAt,
    });
    const response = await deliver(superwallEvent('refund', original));
    expect(response.json()).toEqual({ status: 'confirmed' });
    expect(await row(original)).toMatchObject({
      revoked_at: new Date(revokedAt),
      user_id: owner.userId,
    });
  });

  it("keeps a refund when Apple's earlier answer about the same period reaches the API after it", async () => {
    const { sessionToken, userId } = await owned();
    const original = await subscribed(
      { appAccountToken: userId },
      sessionToken,
    );
    const expiry = (await row(original))!.expires_at.getTime();
    // Apple answers a renewal event before the refund, and that answer arrives late.
    const late = holdNextAnswer(original);
    const renewal = deliver(superwallEvent('renewal', original));
    await late.answered;
    const revokedAt = Date.now() - 1000;
    const refunded = appleSays(original, {
      appAccountToken: userId,
      expiresDate: expiry,
      revocationDate: revokedAt,
    });
    const refund = await deliver(superwallEvent('refund', original));
    expect(refund.json()).toEqual({ status: 'confirmed' });
    expect(await access(sessionToken)).toBe('unpaid');
    late.release();
    expect((await renewal).json()).toEqual({ status: 'confirmed' });
    expect(await row(original)).toMatchObject({
      revoked_at: new Date(revokedAt),
      latest_transaction_id: refunded,
      expires_at: new Date(expiry),
    });
    expect(await access(sessionToken)).toBe('unpaid');
  });

  it("keeps a refund when the phone's verification read Apple before it and saves after it", async () => {
    const { sessionToken, userId } = await owned();
    const original = await subscribed(
      { appAccountToken: userId },
      sessionToken,
    );
    const expiry = (await row(original))!.expires_at.getTime();
    const late = holdNextAnswer(original);
    const verification = apiRequest(app, {
      method: 'POST',
      url: '/v1/billing/verifications',
      payload: { transactionId: original },
      remoteAddress: remoteAddress(),
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    await late.answered;
    const revokedAt = Date.now() - 1000;
    const refunded = appleSays(original, {
      appAccountToken: userId,
      expiresDate: expiry,
      revocationDate: revokedAt,
    });
    expect((await deliver(superwallEvent('refund', original))).json()).toEqual({
      status: 'confirmed',
    });
    late.release();
    const answer = await verification;
    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toMatchObject({ status: 'unpaid' });
    expect(await row(original)).toMatchObject({
      revoked_at: new Date(revokedAt),
      latest_transaction_id: refunded,
    });
    expect(await access(sessionToken)).toBe('unpaid');
  });

  it('restores access when a newer Apple answer for the same period shows the refund reversed', async () => {
    const { sessionToken, userId } = await owned();
    const original = await subscribed(
      { appAccountToken: userId },
      sessionToken,
    );
    const expiry = (await row(original))!.expires_at.getTime();
    appleSays(original, {
      appAccountToken: userId,
      expiresDate: expiry,
      revocationDate: Date.now() - 1000,
    });
    await deliver(superwallEvent('refund', original));
    expect(await access(sessionToken)).toBe('unpaid');
    const restored = appleSays(original, {
      appAccountToken: userId,
      expiresDate: expiry,
    });
    expect((await deliver(superwallEvent('renewal', original))).json()).toEqual(
      { status: 'confirmed' },
    );
    expect(await row(original)).toMatchObject({
      revoked_at: null,
      latest_transaction_id: restored,
    });
    expect(await access(sessionToken)).toBe('verified');
  });

  it('answers 503 while Apple is down, leaves the event pending, and confirms it on redelivery', async () => {
    const original = await subscribed();
    const renewedUntil = Date.now() + 33 * day;
    appleSays(original, { expiresDate: renewedUntil });
    const body = superwallEvent('renewal', original);
    const signed = svixHeaders(secret, body);
    appleDown = true;
    try {
      const response = await deliver(body, signed);
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'UNAVAILABLE' });
    } finally {
      appleDown = false;
    }
    expect(await event(signed['svix-id'])).toEqual([
      { original_transaction_id: original, confirmed: false },
    ]);
    expect((await row(original))?.expires_at).not.toEqual(
      new Date(renewedUntil),
    );
    const retried = await deliver(
      body,
      svixHeaders(secret, body, { id: signed['svix-id'] }),
    );
    expect(retried.json()).toEqual({ status: 'confirmed' });
    expect(await event(signed['svix-id'])).toEqual([
      { original_transaction_id: original, confirmed: true },
    ]);
    expect((await row(original))?.expires_at).toEqual(new Date(renewedUntil));
  });

  it('never creates a subscription from an event', async () => {
    const unseen = String(base + ++serial);
    purchases.add(unseen);
    latest.set(
      unseen,
      transactionPayload({
        transactionId: unseen,
        originalTransactionId: unseen,
      }),
    );
    const body = superwallEvent('initial_purchase', unseen);
    const signed = svixHeaders(secret, body);
    expect((await deliver(body, signed)).json()).toEqual({
      status: 'confirmed',
    });
    expect(await row(unseen)).toBeUndefined();
    expect(await event(signed['svix-id'])).toEqual([
      { original_transaction_id: unseen, confirmed: true },
    ]);
  });

  it('closes an event Apple refuses, and one that names no App Store purchase without asking Apple', async () => {
    const unknown = String(base + ++serial);
    const refused = superwallEvent('renewal', unknown);
    const refusedHeaders = svixHeaders(secret, refused);
    expect((await deliver(refused, refusedHeaders)).json()).toEqual({
      status: 'ignored',
    });
    expect(await event(refusedHeaders['svix-id'])).toEqual([
      { original_transaction_id: unknown, confirmed: true },
    ]);

    for (const other of [
      superwallEvent('renewal', unknown, { store: 'PLAY_STORE' }),
      superwallEvent('renewal', 'not-digits'),
      JSON.stringify({ type: 'test' }),
    ]) {
      const signed = svixHeaders(secret, other);
      const reads = statusReads.length;
      expect((await deliver(other, signed)).json()).toEqual({
        status: 'ignored',
      });
      expect(await event(signed['svix-id'])).toEqual([
        { original_transaction_id: null, confirmed: true },
      ]);
      expect(statusReads.length).toBe(reads);
    }
  });
});
