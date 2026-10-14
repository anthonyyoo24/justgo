import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { Catalog } from '@justgo/contracts';
import { readConfig } from '../../src/config.js';
import { createDatabase, poolOptions, withOwner } from '../../src/db/client.js';
import { IdentityService } from '../../src/identity/service.js';
import { createBetaAccess } from '../../src/access/beta-access.js';
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
  rateKey: `beta-test-${randomUUID()}`,
});
const users: string[] = [];
const apps: ReturnType<typeof buildApp>[] = [];
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
function app(grants: Parameters<typeof createBetaAccess>[0]) {
  const result = buildApp({
    identity,
    logger: false,
    checkDatabase: async () => {},
    ...createBetaAccess(grants),
  });
  apps.push(result);
  return result;
}
const request = (
  api: ReturnType<typeof buildApp>,
  token: string,
  url: string,
  payload?: object,
) =>
  api.inject({
    url,
    headers: { authorization: `Bearer ${token}` },
    method: payload ? 'POST' : 'GET',
    ...(payload ? { payload } : {}),
  });
const iso = (time: number) => new Date(time).toISOString();
afterAll(async () => {
  try {
    for (const api of apps) await api.close();
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
describe('real authenticated free test access', () => {
  it('admits only the approved owner and rejects revoked sessions, while export remains available without a grant', async () => {
    const a = await account(),
      b = await account();
    const api = app([
      {
        userId: a.userId,
        startsAt: iso(Date.now() - 60_000),
        expiresAt: iso(Date.now() + 3_600_000),
      },
    ]);
    expect((await api.inject('/v1/access')).statusCode).toBe(401);
    expect(
      (await request(api, a.sessionToken, '/v1/access')).json(),
    ).toMatchObject({ status: 'verified', source: 'free_beta' });
    expect(
      (await request(api, a.sessionToken, '/v1/challenges')).statusCode,
    ).toBe(200);
    expect(
      (await request(api, b.sessionToken, '/v1/access')).json(),
    ).toMatchObject({ status: 'unpaid', source: 'free_beta' });
    expect(
      (await request(api, b.sessionToken, '/v1/challenges')).statusCode,
    ).toBe(403);
    expect(
      (await request(api, b.sessionToken, '/v1/account/export')).statusCode,
    ).toBe(200);
    await identity.revokeDevice(a.sessionToken, a.deviceId);
    expect((await request(api, a.sessionToken, '/v1/access')).statusCode).toBe(
      401,
    );
    expect(
      (await request(api, a.sessionToken, '/v1/challenges')).statusCode,
    ).toBe(401);
  });
  it('ends current access but preserves uploads begun during the grant, with exclusive expiry and idempotent replay', async () => {
    const a = await account();
    const start = Date.now() - 3_600_000,
      end = Date.now() - 60_000;
    const active = app([
      {
        userId: a.userId,
        startsAt: iso(start),
        expiresAt: iso(Date.now() + 60_000),
      },
    ]);
    const card = (
      await request(active, a.sessionToken, '/v1/challenges')
    ).json<Catalog>().cards[0]!;
    const expired = app([
      { userId: a.userId, startsAt: iso(start), expiresAt: iso(end) },
    ]);
    expect(
      (await request(expired, a.sessionToken, '/v1/access')).json().status,
    ).toBe('unpaid');
    const data = {
      id: randomUUID(),
      challengeId: card.challengeId,
      venue: card.venue,
      startedAt: iso(start),
      startTimeZone: 'America/Toronto',
    };
    expect(
      (await request(expired, a.sessionToken, '/v1/attempts', data)).statusCode,
    ).toBe(201);
    // Already accepted records replay even if the access configuration changes.
    expect(
      (await request(app([]), a.sessionToken, '/v1/attempts', data)).statusCode,
    ).toBe(200);
    for (const startedAt of [iso(start - 1), iso(end)])
      expect(
        (
          await request(expired, a.sessionToken, '/v1/attempts', {
            ...data,
            id: randomUUID(),
            startedAt,
          })
        ).statusCode,
      ).toBe(403);
  });
  it('bounds revoked grants, rejects owner-context substitution and leaves unconfigured production access closed', async () => {
    const a = await account(),
      b = await account();
    const startsAt = iso(Date.now() - 3_600_000),
      revokedAt = iso(Date.now() - 60_000);
    const readers = createBetaAccess([
      {
        userId: a.userId,
        startsAt,
        expiresAt: iso(Date.now() + 60_000),
        revokedAt,
      },
    ]);
    await withOwner(database.db, a.userId, async (tx) => {
      expect((await readers.entitlementReader(tx)).status).toBe('unpaid');
      expect(
        await readers.uploadEligibilityReader(tx, {
          userId: a.userId,
          startedAt: startsAt,
        }),
      ).toBe('eligible');
      expect(
        await readers.uploadEligibilityReader(tx, {
          userId: a.userId,
          startedAt: revokedAt,
        }),
      ).toBe('ineligible');
      expect(
        await readers.uploadEligibilityReader(tx, {
          userId: b.userId,
          startedAt: startsAt,
        }),
      ).toBe('ineligible');
    });
    await database.db.transaction(async (tx) => {
      expect((await readers.entitlementReader(tx)).status).toBe('unpaid');
      expect(
        await readers.uploadEligibilityReader(tx, {
          userId: a.userId,
          startedAt: startsAt,
        }),
      ).toBe('ineligible');
    });
    const production = buildApp({
      identity,
      logger: false,
      checkDatabase: async () => {},
    });
    apps.push(production);
    expect(
      (await request(production, a.sessionToken, '/v1/access')).json().status,
    ).toBe('unavailable');
    expect(
      (await request(production, a.sessionToken, '/v1/challenges')).statusCode,
    ).toBe(503);
  });
});
