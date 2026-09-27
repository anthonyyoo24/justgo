import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { type AccessResponse, type ChallengeQueue } from '@justgo/contracts';
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
  rateKey: 'reflection-integration-tests',
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
const request = (
  token: string,
  path: string,
  method: 'GET' | 'POST',
  body?: object,
) =>
  app.inject({
    method,
    url: path,
    headers: { authorization: `Bearer ${token}` },
    ...(body ? { payload: body } : {}),
  });
async function attempt(
  token: string,
  outcome: 'completed' | 'given_up' | 'active' = 'completed',
) {
  const queue = (
    await request(token, '/v1/challenges/queue/streets', 'GET')
  ).json() as ChallengeQueue;
  const card = queue.cards[0]!;
  const id = randomUUID();
  const start = await request(token, '/v1/challenges/start', 'POST', {
    attemptId: id,
    venue: queue.venue,
    cardId: card.id,
    revisionId: card.revisionId,
    queueVersion: queue.version,
  });
  expect(start.statusCode, start.body).toBe(200);
  if (outcome !== 'active') {
    const finish = await request(token, '/v1/challenges/finish', 'POST', {
      attemptId: id,
      outcome,
      timeZone: 'America/Toronto',
    });
    expect(finish.statusCode, finish.body).toBe(200);
  }
  return id;
}
const get = (token: string, id: string) =>
  request(token, `/v1/reflections/${id}`, 'GET');
const write = (
  token: string,
  id: string,
  action: 'draft' | 'final' | 'skip',
  body: object,
) => request(token, `/v1/reflections/${id}/${action}`, 'POST', body);
const content = (
  expectedRevision: number,
  feeling: string | null,
  text: string | null,
) => ({
  actionId: randomUUID(),
  expectedRevision,
  feeling,
  text,
});

afterAll(async () => {
  for (const id of owners) {
    for (const table of [
      'reflection_actions',
      'reflections',
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

describe('private completed-attempt reflections through restricted PostgreSQL role', () => {
  it('accepts feeling-only, text-only and both, with no default feeling or invented neutral', async () => {
    const a = await account();
    for (const [feeling, text] of [
      ['a_lot_worse', null],
      [null, 'I said hello.'],
      ['a_lot_better', 'I can try again.'],
    ] as const) {
      const id = await attempt(a.sessionToken);
      const initial = await get(a.sessionToken, id);
      expect(initial.statusCode, initial.body).toBe(200);
      expect(initial.json()).toMatchObject({
        attemptId: id,
        revision: 0,
        status: 'none',
        feelingVersion: 1,
        feeling: null,
        text: null,
      });
      const saved = await write(
        a.sessionToken,
        id,
        'final',
        content(0, feeling, text),
      );
      expect(saved.statusCode, saved.body).toBe(200);
      expect(saved.json()).toMatchObject({
        revision: 1,
        status: 'submitted',
        feeling,
        text,
        inputMethod: text ? 'typed' : null,
      });
      expect((await get(a.sessionToken, id)).json()).toEqual(saved.json());
      expect(
        (
          await write(a.sessionToken, id, 'skip', {
            actionId: randomUUID(),
            expectedRevision: 1,
          })
        ).statusCode,
      ).toBe(409);
    }
  });
  it('stores drafts separately, makes skip terminal, and leaves the completed rep intact', async () => {
    const a = await account();
    const id = await attempt(a.sessionToken);
    const first = await write(
      a.sessionToken,
      id,
      'draft',
      content(0, 'a_little_better', 'first thought'),
    );
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toMatchObject({ status: 'draft', revision: 1 });
    const blank = await write(
      a.sessionToken,
      id,
      'draft',
      content(1, null, '   '),
    );
    expect(blank.json()).toMatchObject({
      status: 'draft',
      revision: 2,
      feeling: null,
      text: null,
    });
    const skip = await write(a.sessionToken, id, 'skip', {
      actionId: randomUUID(),
      expectedRevision: 2,
    });
    expect(skip.statusCode, skip.body).toBe(200);
    expect(skip.json()).toMatchObject({
      status: 'skipped',
      revision: 3,
      feeling: null,
      text: null,
    });
    expect(
      (await write(a.sessionToken, id, 'final', content(3, null, 'late')))
        .statusCode,
    ).toBe(409);
    const completed = await admin.query(
      'select status from justgo.attempts where user_id=$1 and id=$2',
      [a.userId, id],
    );
    expect(completed.rows[0]?.status).toBe('completed');
  });
  it('serializes competing devices, rejects stale revisions, and replays only identical action IDs', async () => {
    const a = await account();
    const id = await attempt(a.sessionToken);
    const second = {
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      sessionToken: randomBytes(32).toString('hex'),
      credential: a.credential,
    };
    await identity.bootstrap(second, false);
    const first = content(0, 'about_the_same', null);
    const competing = content(0, null, 'other device');
    const results = await Promise.all([
      write(a.sessionToken, id, 'draft', first),
      write(second.sessionToken, id, 'draft', competing),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.statusCode === 200)!;
    const winnerToken =
      results[0]!.statusCode === 200 ? a.sessionToken : second.sessionToken;
    const winnerBody = results[0]!.statusCode === 200 ? first : competing;
    expect((await write(winnerToken, id, 'draft', winnerBody)).json()).toEqual(
      winner.json(),
    );
    expect(
      (
        await write(winnerToken, id, 'draft', {
          ...winnerBody,
          text: 'changed',
        })
      ).statusCode,
    ).toBe(409);
    expect((await get(a.sessionToken, id)).json()).toEqual(winner.json());
    const finalInput = content(1, 'a_little_worse', 'saved together');
    const final = await write(a.sessionToken, id, 'final', finalInput);
    expect(final.statusCode, final.body).toBe(200);
    expect(final.json()).toMatchObject({
      revision: 2,
      status: 'submitted',
      feeling: 'a_little_worse',
      text: 'saved together',
    });
    expect(
      (await write(a.sessionToken, id, 'final', finalInput)).json(),
    ).toEqual(final.json());
    expect(
      (
        await write(a.sessionToken, id, 'final', {
          ...finalInput,
          text: 'changed',
        })
      ).statusCode,
    ).toBe(409);
    const stored = await admin.query(
      'select feeling, reflection_text, revision from justgo.reflections where user_id=$1 and attempt_id=$2',
      [a.userId, id],
    );
    expect(stored.rows[0]).toMatchObject({
      feeling: 'a_little_worse',
      reflection_text: 'saved together',
      revision: 2,
    });
  });
  it('guards owners, attempt status, input, and paid access', async () => {
    const a = await account();
    const b = await account();
    const active = await attempt(a.sessionToken, 'active');
    expect((await get(a.sessionToken, active)).statusCode).toBe(409);
    expect((await get(b.sessionToken, active)).statusCode).toBe(404);
    const unauthorized = await write(
      b.sessionToken,
      active,
      'draft',
      content(0, null, 'private'),
    );
    expect(unauthorized.statusCode).toBe(404);
    await request(a.sessionToken, '/v1/challenges/finish', 'POST', {
      attemptId: active,
      outcome: 'given_up',
      timeZone: 'UTC',
    });
    expect((await get(a.sessionToken, active)).statusCode).toBe(409);
    const id = await attempt(a.sessionToken);
    expect(
      (await write(a.sessionToken, id, 'final', content(0, null, '  ')))
        .statusCode,
    ).toBe(400);
    expect(
      (await write(a.sessionToken, id, 'final', content(0, 'bogus', null)))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await write(
          a.sessionToken,
          id,
          'draft',
          content(0, null, 'x'.repeat(10001)),
        )
      ).statusCode,
    ).toBe(400);
    access = 'unpaid';
    try {
      expect((await get(a.sessionToken, id)).statusCode).toBe(403);
      expect(
        (
          await write(a.sessionToken, id, 'skip', {
            actionId: randomUUID(),
            expectedRevision: 0,
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      access = 'verified';
    }
    const visible = await identity.withSession(b.sessionToken, (tx) =>
      tx.execute(
        sql`select * from justgo.reflections where user_id=${a.userId}`,
      ),
    );
    expect(visible.rows).toHaveLength(0);
  });
});
