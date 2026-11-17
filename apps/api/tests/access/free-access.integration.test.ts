import { apiRequest } from '../request.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { Catalog } from '@justgo/contracts';
import { readConfig } from '../../src/config.js';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { withOwner } from '../db/fixtures/owner.js';
import { IdentityService } from '../../src/identity/service.js';
import { createFreeAccess } from '../../src/access/free-access.js';
import { buildApp } from '../../src/build-app.js';

const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '2' });
for (const url of [config.DATABASE_URL, process.env.MIGRATION_DATABASE_URL])
  if (
    !url ||
    !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/justgo_test' ||
    new URL(url).search !== ''
  )
    throw new Error('Only isolated local justgo_test is allowed');
const database = createDatabase(config);
const admin = new Pool(
  poolOptions(
    readConfig({
      ...process.env,
      DATABASE_URL: process.env.MIGRATION_DATABASE_URL!,
    }),
  ),
);
const identity = new IdentityService(database.db, {
  rateKey: `free-access-test-${randomUUID()}`,
});
const users: string[] = [];
async function account() {
  const input = {
    deviceId: randomUUID(),
    sessionId: randomUUID(),
    sessionToken: randomBytes(32).toString('hex'),
    credential: randomBytes(32).toString('hex'),
  };
  const result = await identity.bootstrap(input);
  users.push(result.userId);
  return { ...input, userId: result.userId };
}
function app(now: () => number = Date.now) {
  return buildApp({
    identity,
    logger: false,
    checkDatabase: async () => {},
    ...createFreeAccess(now),
  });
}
const request = (
  api: ReturnType<typeof buildApp>,
  token: string,
  url: string,
  payload?: object,
) =>
  apiRequest(api, {
    url,
    headers: { authorization: `Bearer ${token}` },
    method: payload ? 'POST' : 'GET',
    ...(payload ? { payload } : {}),
  });
const iso = (time: number) => new Date(time).toISOString();
afterAll(async () => {
  try {
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
describe('real authenticated free access', () => {
  it('admits a fresh account and its replacement after deletion without reviving the deleted session', async () => {
    const a = await account();
    const api = app();
    expect((await apiRequest(api, '/v1/access')).statusCode).toBe(401);
    expect(
      (await request(api, a.sessionToken, '/v1/access')).json(),
    ).toMatchObject({ status: 'verified', source: 'free_beta' });
    const catalog = await request(api, a.sessionToken, '/v1/challenges');
    expect(catalog.statusCode).toBe(200);
    const card = catalog.json<Catalog>().cards[0]!;
    expect(
      (
        await request(api, a.sessionToken, '/v1/attempts', {
          id: randomUUID(),
          challengeId: card.challengeId,
          venue: card.venue,
          startedAt: iso(Date.now()),
          startTimeZone: 'America/Toronto',
        })
      ).statusCode,
    ).toBe(201);
    const removed = await apiRequest(api, {
      method: 'DELETE',
      url: '/v1/account',
      headers: { authorization: `Bearer ${a.sessionToken}` },
      payload: { confirmation: 'delete-account' },
    });
    expect(removed.statusCode).toBe(200);
    for (const path of ['/v1/access', '/v1/challenges'])
      expect((await request(api, a.sessionToken, path)).statusCode).toBe(401);
    const replacement = await account();
    expect(replacement.userId).not.toBe(a.userId);
    expect(
      (await request(api, replacement.sessionToken, '/v1/access')).json(),
    ).toMatchObject({ status: 'verified', source: 'free_beta' });
    expect(
      (await request(api, replacement.sessionToken, '/v1/challenges'))
        .statusCode,
    ).toBe(200);
  });
  it('rejects revoked sessions and keeps the account export open', async () => {
    const a = await account();
    const api = app();
    expect(
      (await request(api, a.sessionToken, '/v1/account/export')).statusCode,
    ).toBe(200);
    await identity.revokeDevice(a.sessionToken, a.deviceId);
    for (const path of ['/v1/access', '/v1/challenges'])
      expect((await request(api, a.sessionToken, path)).statusCode).toBe(401);
  });
  it('accepts earlier uploads with idempotent replay and refuses future-dated ones', async () => {
    const a = await account();
    let now = Date.now();
    const api = app(() => now);
    const card = (
      await request(api, a.sessionToken, '/v1/challenges')
    ).json<Catalog>().cards[0]!;
    const data = {
      id: randomUUID(),
      challengeId: card.challengeId,
      venue: card.venue,
      startedAt: iso(now - 30 * 24 * 3_600_000),
      startTimeZone: 'America/Toronto',
    };
    expect(
      (await request(api, a.sessionToken, '/v1/attempts', data)).statusCode,
    ).toBe(201);
    expect(
      (await request(api, a.sessionToken, '/v1/attempts', data)).statusCode,
    ).toBe(200);
    const upload = (started: number) =>
      request(api, a.sessionToken, '/v1/attempts', {
        ...data,
        id: randomUUID(),
        startedAt: iso(started),
      });
    expect((await upload(now)).statusCode).toBe(201);
    // Inside the attempt service's five-minute tolerance, but still in the future.
    const early = await upload(now + 1);
    expect(early.statusCode).toBe(403);
    expect(early.json().code).toBe('ATTEMPT_INELIGIBLE');
    now += 60_000;
    expect((await upload(now - 30_000)).statusCode).toBe(201);
  });
  it('rejects owner-context substitution and a transaction with no owner, and leaves unconfigured access closed', async () => {
    const a = await account(),
      b = await account();
    const readers = createFreeAccess();
    const startedAt = iso(Date.now() - 60_000);
    await withOwner(database.db, a.userId, async (tx) => {
      expect((await readers.entitlementReader(tx)).status).toBe('verified');
      expect(
        await readers.uploadEligibilityReader(tx, {
          userId: a.userId,
          startedAt,
        }),
      ).toBe('eligible');
      expect(
        await readers.uploadEligibilityReader(tx, {
          userId: b.userId,
          startedAt,
        }),
      ).toBe('ineligible');
    });
    await database.db.transaction(async (tx) => {
      expect(
        await readers.uploadEligibilityReader(tx, {
          userId: a.userId,
          startedAt,
        }),
      ).toBe('ineligible');
    });
    const unconfigured = buildApp({
      identity,
      logger: false,
      checkDatabase: async () => {},
    });
    expect(
      (await request(unconfigured, a.sessionToken, '/v1/access')).json().status,
    ).toBe('unavailable');
    expect(
      (await request(unconfigured, a.sessionToken, '/v1/challenges'))
        .statusCode,
    ).toBe(503);
  });
});
