import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { venues, type AccessResponse, type Catalog } from '@justgo/contracts';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';
import { IdentityService } from '../../src/identity/service.js';
import { buildApp } from '../../src/build-app.js';
const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '3' });
for (const url of [config.DATABASE_URL, process.env.MIGRATION_DATABASE_URL])
  if (
    !url ||
    !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/justgo_test'
  )
    throw new Error('Only isolated local justgo_test is allowed');
const db = createDatabase(config);
const admin = new Pool(
  poolOptions(
    readConfig({
      ...process.env,
      DATABASE_URL: process.env.MIGRATION_DATABASE_URL!,
    }),
  ),
);
const identity = new IdentityService(db.db, {
  rateKey: 'challenge-integration-tests',
});
const access: 'verified' | 'unpaid' | 'unavailable' = 'verified';
const reader = async (): Promise<AccessResponse> =>
  access === 'verified'
    ? {
        status: 'verified',
        checkedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }
    : { status: access, checkedAt: new Date().toISOString() };
const app = buildApp({
  identity,
  entitlementReader: reader,
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
  const result = await identity.bootstrap(input);
  owners.push(result.userId);
  return { ...input, userId: result.userId };
}
const request = (token: string, path: string, body?: object) =>
  app.inject({
    method: body ? 'POST' : 'GET',
    url: `/v1/challenges${path}`,
    headers: { authorization: `Bearer ${token}` },
    ...(body ? { payload: body } : {}),
  });
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
  await app.close();
  await Promise.all([db.pool.end(), admin.end()]);
});
describe('canonical catalog and final route cutover', () => {
  it('keeps exactly the reviewed 61 placements, all six venues and current Level 1 wording', async () => {
    const a = await account();
    const response = await request(a.sessionToken, '');
    expect(response.statusCode, response.body).toBe(200);
    const { cards } = response.json<Catalog>();
    expect(cards).toHaveLength(61);
    for (const venue of venues) {
      const selected = cards.filter((card) => card.venue === venue.id);
      expect(selected).toHaveLength(venue.id === 'gym' ? 11 : 10);
      expect(selected.map((card) => card.position)).toEqual(
        [...selected.map((card) => card.position)].sort((a, b) => a - b),
      );
      for (const card of selected) {
        expect(card).toMatchObject({
          levelId: 'level-1',
          durationSeconds: 300,
        });
        expect(card).not.toHaveProperty('revisionId');
      }
    }
    expect(cards.find((card) => card.id === 'BC-10')).toMatchObject({
      text: 'Comment on the song to someone beside you on the dance floor.',
    });
    expect(cards.find((card) => card.id === 'ST-05')?.challengeId).toBe(
      cards.find((card) => card.id === 'PK-02')?.challengeId,
    );
  });
  it('rejects every obsolete product route without creating state', async () => {
    const a = await account();
    const id = randomUUID();
    for (const [method, url] of [
      ['GET', '/v1/challenges/state'],
      ['GET', '/v1/challenges/queue/streets'],
      ['GET', `/v1/challenges/attempt/${id}`],
      ['POST', '/v1/challenges/venue'],
      ['POST', '/v1/challenges/skip'],
      ['POST', '/v1/challenges/start'],
      ['POST', '/v1/challenges/finish'],
      ['GET', `/v1/reflections/${id}`],
      ['POST', `/v1/reflections/${id}/draft`],
      ['POST', `/v1/reflections/${id}/final`],
      ['POST', `/v1/reflections/${id}/skip`],
      ['GET', '/v1/progress?month=2026-10&timeZone=UTC'],
      ['GET', '/v1/progress/days/2026-10-01'],
    ] as const) {
      const result = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${a.sessionToken}` },
        ...(method === 'POST'
          ? {
              payload: {
                attemptId: id,
                venue: 'streets',
                outcome: 'completed',
                timeZone: 'UTC',
                text: 'Synthetic stale client input',
              },
            }
          : {}),
      });
      expect(result.statusCode, `${method} ${url}: ${result.body}`).toBe(404);
      expect(result.json()).toMatchObject({ code: 'NOT_FOUND' });
      expect(result.body).not.toContain('Synthetic stale client input');
    }
    expect(
      (
        await admin.query('select id from justgo.attempts where user_id=$1', [
          a.userId,
        ])
      ).rows,
    ).toEqual([]);
    expect(
      (
        await admin.query(
          'select id from justgo.attempt_patch_receipts where user_id=$1',
          [a.userId],
        )
      ).rows,
    ).toEqual([]);
  });
  it('has no obsolete product tables or lifecycle columns after the registered migration', async () => {
    expect(
      (
        await admin.query(
          `select table_name from information_schema.tables where table_schema='justgo' and table_name=any($1::text[])`,
          [
            [
              'challenge_revisions',
              'challenge_preferences',
              'venue_queues',
              'deck_skips',
              'reflections',
              'reflection_actions',
            ],
          ],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await admin.query(
          `select column_name from information_schema.columns where table_schema='justgo' and table_name='attempts' and column_name=any($1::text[])`,
          [
            [
              'status',
              'card_id',
              'revision_id',
              'queue_version',
              'deadline_at',
              'ended_at',
              'completion_date',
              'time_zone',
              'elapsed_seconds',
            ],
          ],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await admin.query(
          `select proname from pg_proc join pg_namespace on pg_namespace.oid=pronamespace where nspname='justgo' and proname='immutable_revision'`,
        )
      ).rows,
    ).toEqual([]);
  });
});
