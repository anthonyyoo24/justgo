import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import {
  venues,
  type AccessResponse,
  type Attempt,
  type ChallengeQueue,
} from '@justgo/contracts';
import { createDatabase, poolOptions } from '../src/db/client.js';
import { readConfig } from '../src/config.js';
import { IdentityService } from '../src/identity/service.js';
import { buildApp } from '../src/build-app.js';
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
let access: 'verified' | 'unpaid' | 'unavailable' = 'verified';
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
async function queue(
  token: string,
  venue = 'streets',
): Promise<ChallengeQueue> {
  const result = await request(token, `/queue/${venue}`);
  expect(result.statusCode, result.body).toBe(200);
  return result.json();
}
const selection = (q: ChallengeQueue) => ({
  venue: q.venue,
  cardId: q.cards[0]!.id,
  revisionId: q.cards[0]!.revisionId,
  queueVersion: q.version,
});
const start = async (token: string, q: ChallengeQueue) => {
  const body = { attemptId: randomUUID(), ...selection(q) };
  const result = await request(token, '/start', body);
  expect(result.statusCode, result.body).toBe(200);
  return { body, attempt: result.json().attempt as Attempt };
};
afterAll(async () => {
  for (const id of owners) {
    for (const table of [
      'attempts',
      'deck_skips',
      'venue_queues',
      'challenge_preferences',
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
describe('real challenge loop through restricted PostgreSQL role', () => {
  it('seeds exactly the reviewed 61 placements, six queues and stable Level 1 revisions', async () => {
    const a = await account();
    let total = 0;
    for (const venue of venues) {
      const q = await queue(a.sessionToken, venue.id);
      expect(q.cards).toHaveLength(venue.id === 'gym' ? 11 : 10);
      total += q.cards.length;
      for (const c of q.cards)
        expect(c).toMatchObject({
          venue: venue.id,
          levelId: 'level-1',
          durationSeconds: 300,
        });
    }
    expect(total).toBe(61);
    await expect(
      admin.query(
        "update justgo.challenge_revisions set text='changed' where id='st-01-v1'",
      ),
    ).rejects.toThrow('immutable');
  });
  it('rejects incomplete terminal records at the database boundary', async () => {
    const a = await account();
    await start(a.sessionToken, await queue(a.sessionToken));
    await expect(
      admin.query(
        "update justgo.attempts set status='completed',time_zone='UTC',completion_date='2026-09-24' where user_id=$1",
        [a.userId],
      ),
    ).rejects.toThrow('attempt_outcome_fields');
  });
  it('skips without attempts, cycles full stacks, and keeps shared placements independent', async () => {
    const a = await account(),
      q = await queue(a.sessionToken),
      park = await queue(a.sessionToken, 'park');
    let current = q;
    for (let i = 0; i < q.cards.length; i++) {
      const body = { actionId: randomUUID(), ...selection(current) };
      const result = await request(a.sessionToken, '/skip', body);
      expect(result.statusCode, result.body).toBe(200);
      current = result.json();
      const retry = await request(a.sessionToken, '/skip', body);
      expect(retry.json()).toEqual(current);
    }
    expect(current.cards).toEqual(q.cards);
    expect(current.version).toBe(10);
    expect(await queue(a.sessionToken, 'park')).toEqual(park);
    expect(q.cards.find((c) => c.id === 'ST-05')?.challengeId).toBe(
      park.cards.find((c) => c.id === 'PK-02')?.challengeId,
    );
    expect((await request(a.sessionToken, '/state')).json().active).toBeNull();
    const count = await admin.query(
      'select count(*)::int as count from justgo.attempts where user_id=$1',
      [a.userId],
    );
    expect(count.rows[0].count).toBe(0);
  });
  it('replays concurrent/lost starts and completions once and rejects different inputs', async () => {
    const a = await account(),
      q = await queue(a.sessionToken),
      body = { attemptId: randomUUID(), ...selection(q) };
    const starts = await Promise.all([
      request(a.sessionToken, '/start', body),
      request(a.sessionToken, '/start', body),
    ]);
    for (const r of starts) expect(r.statusCode, r.body).toBe(200);
    expect(starts[0]!.json().attempt).toEqual(starts[1]!.json().attempt);
    expect(
      Date.parse(starts[0]!.json().attempt.deadlineAt) -
        Date.parse(starts[0]!.json().attempt.startedAt),
    ).toBe(300000);
    expect(
      (await request(a.sessionToken, '/start', { ...body, cardId: 'ST-02' }))
        .statusCode,
    ).toBe(409);
    expect(
      (
        await request(a.sessionToken, '/start', {
          ...body,
          attemptId: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(a.sessionToken, '/skip', {
          actionId: randomUUID(),
          ...selection(q),
        })
      ).statusCode,
    ).toBe(409);
    await request(a.sessionToken, '/venue', { venue: 'gym' });
    const saved = (await request(a.sessionToken, '/state')).json();
    expect(saved.active).toEqual(starts[0]!.json().attempt);
    expect(saved.selectedVenue).toBe('gym');
    const end = {
      attemptId: body.attemptId,
      outcome: 'completed',
      timeZone: 'America/Toronto',
    };
    const outcomes = await Promise.all([
      request(a.sessionToken, '/finish', end),
      request(a.sessionToken, '/finish', end),
    ]);
    expect(outcomes[0]!.statusCode, outcomes[0]!.body).toBe(200);
    expect(outcomes[1]!.json().attempt).toEqual(outcomes[0]!.json().attempt);
    expect((await queue(a.sessionToken)).version).toBe(1);
    expect(
      (
        await request(a.sessionToken, '/finish', {
          ...end,
          outcome: 'given_up',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await request(a.sessionToken, '/finish', { ...end, timeZone: 'UTC' }))
        .statusCode,
    ).toBe(409);
    expect(
      (await request(a.sessionToken, '/start', body)).json().attempt.status,
    ).toBe('completed');
    const count = await admin.query(
      "select count(*)::int as count from justgo.attempts where user_id=$1 and status='completed'",
      [a.userId],
    );
    expect(count.rows[0].count).toBe(1);
  });
  it('allows only one of simultaneous device starts, then accepts a new deliberate repetition', async () => {
    const a = await account(),
      q = await queue(a.sessionToken);
    const device = {
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      sessionToken: randomBytes(32).toString('hex'),
      credential: a.credential,
    };
    await identity.bootstrap(device, false);
    const bodies = [
      { attemptId: randomUUID(), ...selection(q) },
      { attemptId: randomUUID(), ...selection(q) },
    ];
    const results = await Promise.all([
      request(a.sessionToken, '/start', bodies[0]),
      request(device.sessionToken, '/start', bodies[1]),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const original = results.find((r) => r.statusCode === 200)!.json().attempt;
    await request(a.sessionToken, '/finish', {
      attemptId: original.id,
      outcome: 'given_up',
      timeZone: 'UTC',
    });
    let current = await queue(a.sessionToken);
    for (let i = 0; i < q.cards.length - 1; i++)
      current = (
        await request(a.sessionToken, '/skip', {
          actionId: randomUUID(),
          ...selection(current),
        })
      ).json();
    const repeated = await start(a.sessionToken, current);
    expect(repeated.attempt.card.id).toBe(original.card.id);
    expect(repeated.attempt.id).not.toBe(original.id);
  });
  it('keeps zero active, freezes completion day/time zone and includes after-zero duration', async () => {
    const a = await account(),
      s = await start(a.sessionToken, await queue(a.sessionToken));
    await admin.query(
      "update justgo.attempts set started_at=now()-interval '8 minutes',deadline_at=now()-interval '3 minutes' where user_id=$1",
      [a.userId],
    );
    expect((await request(a.sessionToken, '/state')).json().active.status).toBe(
      'active',
    );
    const done = await request(a.sessionToken, '/finish', {
      attemptId: s.attempt.id,
      outcome: 'completed',
      timeZone: 'Pacific/Kiritimati',
    });
    expect(done.statusCode, done.body).toBe(200);
    const result = done.json().attempt as Attempt;
    expect(result.elapsedSeconds).toBeGreaterThanOrEqual(480);
    expect(result.completionDate).toBe(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Pacific/Kiritimati',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(result.endedAt!)),
    );
    expect(result.card.revisionId).toBe(s.attempt.card.revisionId);
  });
  it('isolates owners, validates inputs and locks every paid operation on expiry', async () => {
    const a = await account(),
      b = await account(),
      q = await queue(a.sessionToken),
      s = await start(a.sessionToken, q);
    expect(
      (await request(b.sessionToken, `/attempt/${s.attempt.id}`)).statusCode,
    ).toBe(404);
    expect(
      (
        await request(b.sessionToken, '/finish', {
          attemptId: s.attempt.id,
          outcome: 'completed',
          timeZone: 'UTC',
        })
      ).statusCode,
    ).toBe(404);
    const visible = await identity.withSession(b.sessionToken, (tx) =>
      tx.execute(sql`select id from justgo.attempts where user_id=${a.userId}`),
    );
    expect(visible.rows).toHaveLength(0);
    expect(
      (
        await request(a.sessionToken, '/finish', {
          attemptId: s.attempt.id,
          outcome: 'completed',
          timeZone: 'garbage',
        })
      ).statusCode,
    ).toBe(400);
    access = 'unpaid';
    try {
      expect((await request(a.sessionToken, '/state')).statusCode).toBe(403);
      expect(
        (
          await request(a.sessionToken, '/finish', {
            attemptId: s.attempt.id,
            outcome: 'completed',
            timeZone: 'UTC',
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      access = 'verified';
    }
    expect((await request(a.sessionToken, '/state')).json().active.id).toBe(
      s.attempt.id,
    );
  });
});
