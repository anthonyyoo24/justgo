import { apiRequest } from '../request.js';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { completionExportPageSchema } from '@justgo/contracts';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';
import { IdentityService } from '../../src/identity/service.js';
import { buildApp } from '../../src/build-app.js';

const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '2' });
for (const url of [config.DATABASE_URL, process.env.MIGRATION_DATABASE_URL])
  if (
    !url ||
    !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/justgo_test'
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
const identity = new IdentityService(database.db, { rateKey: 'export-tests' });
const app = buildApp({
  identity,
  checkDatabase: async () => {},
  logger: false,
});
const owners: string[] = [];
async function account() {
  const input = {
    deviceId: randomUUID(),
    sessionId: randomUUID(),
    sessionToken: randomBytes(32).toString('hex'),
    credential: randomBytes(32).toString('hex'),
  };
  const info = await identity.bootstrap(input);
  owners.push(info.userId);
  return { ...input, userId: info.userId };
}
const request = (token?: string, suffix = '') =>
  apiRequest(app, {
    method: 'GET',
    url: '/v1/account/export' + suffix,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
async function history(userId: string, count: number) {
  const ids = Array.from({ length: count }, () => randomUUID()).sort();
  for (const id of ids)
    await admin.query(
      `insert into justgo.attempts (user_id,id,venue_id,challenge_id,level_id,started_at,activity_date,legacy_display_time_zone,reflection_feeling,reflection_text,reflection_revision)
      select $1,$2,v.venue_id,c.id,c.level_id,'2024-11-03T05:30:00.123456Z','2024-11-03','America/Toronto','a_little_better',$3,2
      from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id order by v.position limit 1`,
      [userId, id, 'Synthetic export note, "quotes"\n여행 🌱'],
    );
  return ids;
}
afterAll(async () => {
  for (const id of owners) {
    for (const table of [
      'attempts',
      'device_sessions',
      'recovery_credentials',
      'devices',
    ])
      await admin.query(`delete from justgo.${table} where user_id=$1`, [id]);
    await admin.query('delete from justgo.users where id=$1', [id]);
  }

  await Promise.all([database.pool.end(), admin.end()]);
});

describe('authenticated data export on the real restricted database role', () => {
  it('exports all pages and older completion history without private journal fields without paid access or another owner', async () => {
    const a = await account(),
      b = await account();
    const ids = await history(a.userId, 51);
    await history(b.userId, 2);
    const first = await request(a.sessionToken);
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    const page = completionExportPageSchema.parse(first.json());
    expect(page.account.id).toBe(a.userId);
    expect(Object.keys(page.account).sort()).toEqual([
      'analyticsRestricted',
      'createdAt',
      'id',
    ]);
    expect(page.account.analyticsRestricted).toBe(false);
    expect(page.devices.map((d) => d.id)).toEqual([a.deviceId]);
    expect(page.attempts.map((x) => x.id)).toEqual(ids.slice(0, 50));
    expect(page.attempts[0]).toMatchObject({
      startedAt: '2024-11-03T05:30:00.123456Z',
      activityDate: '2024-11-03',
      startTimeZone: null,
      displayTimeZone: 'America/Toronto',
    });
    expect(page.attempts[0]).not.toHaveProperty('reflection');
    expect(first.body).not.toContain('Synthetic export note');
    const last = completionExportPageSchema.parse(
      (await request(a.sessionToken, '?cursor=' + page.nextCursor)).json(),
    );
    expect(last.attempts.map((x) => x.id)).toEqual(ids.slice(50));
    expect(last.nextCursor).toBeNull();
    for (const forbidden of [
      a.sessionToken,
      a.credential,
      'digest',
      'session',
      'requestId',
      b.userId,
      b.deviceId,
    ])
      expect(first.body).not.toContain(forbidden);
    // Even a cursor obtained from another account cannot change trusted ownership.
    expect(
      completionExportPageSchema.parse(
        (await request(b.sessionToken, '?cursor=' + page.nextCursor)).json(),
      ).account.id,
    ).toBe(b.userId);
  });
  it('does not expose the retired legacy journal route with or without credentials', async () => {
    const a = await account();
    await history(a.userId, 1);
    for (const token of [undefined, a.sessionToken]) {
      const response = await apiRequest(app, {
        method: 'GET',
        url: '/v1/journal/legacy',
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain('Synthetic export note');
    }
  });
  it('returns a complete empty export and safe revoked-device metadata', async () => {
    const a = await account();
    const deviceId = randomUUID();
    await admin.query(
      'update justgo.users set analytics_restricted_at=now() where id=$1',
      [a.userId],
    );
    await admin.query(
      'insert into justgo.devices (user_id,id,revoked_at) values ($1,$2,now())',
      [a.userId, deviceId],
    );
    const page = completionExportPageSchema.parse(
      (await request(a.sessionToken)).json(),
    );
    expect(page.account.analyticsRestricted).toBe(true);
    expect(page.attempts).toEqual([]);
    expect(page.nextCursor).toBeNull();
    expect(page.devices.find((d) => d.id === deviceId)?.revokedAt).toEqual(
      expect.any(String),
    );
  });
  it('rejects unknown accounts, malformed cursors, unknown fields and absent credentials', async () => {
    const a = await account();
    expect((await request()).statusCode).toBe(401);
    expect((await request(randomBytes(32).toString('hex'))).statusCode).toBe(
      401,
    );
    expect((await request(a.sessionToken, '?cursor=broken')).statusCode).toBe(
      400,
    );
    expect(
      (await request(a.sessionToken, '?userId=' + randomUUID())).statusCode,
    ).toBe(400);
  });
  it('rejects expired and revoked sessions and retired accounts before returning content', async () => {
    const a = await account();
    await admin.query(
      "update justgo.device_sessions set expires_at=now()-interval '1 hour' where user_id=$1",
      [a.userId],
    );
    expect((await request(a.sessionToken)).json().code).toBe('SESSION_EXPIRED');
    await admin.query(
      'update justgo.device_sessions set revoked_at=now() where user_id=$1',
      [a.userId],
    );
    expect((await request(a.sessionToken)).json().code).toBe('SESSION_REVOKED');
    const b = await account();
    await identity.retireAccount(b.sessionToken);
    expect((await request(b.sessionToken)).json().code).toBe(
      'CREDENTIAL_REJECTED',
    );
  });
});
