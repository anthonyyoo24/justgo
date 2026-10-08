import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import {
  type AccessResponse,
  type ProgressDayResponse,
  type ProgressSummary,
} from '@justgo/contracts';
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
  rateKey: 'progress-integration-tests',
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
const request = (token: string, path: string) =>
  app.inject({
    method: 'GET',
    url: path,
    headers: { authorization: `Bearer ${token}` },
  });
const dateOffset = (days: number) => {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
async function insertCompletion(
  userId: string,
  date: string,
  startedAt: string,
  options: { timeZone?: string } = {},
) {
  const id = randomUUID();
  // Represent preserved pre-cutover history: its original completion date/zone
  // survives even when no reliable start zone was recorded by the old client.
  await admin.query(
    `insert into justgo.attempts
      (user_id,id,venue_id,challenge_id,level_id,started_at,activity_date,legacy_display_time_zone)
    select $1,$2,v.venue_id,c.id,c.level_id,$4::timestamptz,$3,$5
    from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id
    order by v.position limit 1`,
    [userId, id, date, startedAt, options.timeZone ?? 'UTC'],
  );
  return id;
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
  await app.close();
  await Promise.all([db.pool.end(), admin.end()]);
});

describe('owner-scoped Progress history', () => {
  it('counts preserved history dates independently from summary and measures streaks through yesterday', async () => {
    const a = await account();
    const b = await account();
    const yesterday = dateOffset(-1);
    const prior = dateOffset(-2);
    const old = dateOffset(-5);
    const month = yesterday.slice(0, 7);
    await insertCompletion(a.userId, yesterday, `${yesterday}T12:00:00Z`);
    await insertCompletion(a.userId, yesterday, `${yesterday}T12:05:00Z`);
    await insertCompletion(a.userId, prior, `${prior}T12:00:00Z`);
    await insertCompletion(a.userId, old, `${old}T12:00:00Z`);
    await insertCompletion(b.userId, yesterday, `${yesterday}T13:00:00Z`);
    const res = await request(
      a.sessionToken,
      '/v1/progress/summary?timeZone=UTC',
    );
    expect(res.statusCode, res.body).toBe(200);
    const result = res.json() as ProgressSummary;
    expect(result).toMatchObject({
      today: dateOffset(0),
      currentStreak: 2,
      bestStreak: 2,
      totalReps: 4,
    });
    const inMonth = [yesterday, yesterday, prior, old].filter((d) =>
      d.startsWith(month),
    );
    const calendar = (
      await request(a.sessionToken, `/v1/progress/calendar?month=${month}`)
    ).json();
    expect(calendar.monthlyReps).toBe(inMonth.length);
    expect(calendar.activeDays).toBe(new Set(inMonth).size);
    expect(
      calendar.days.find(
        (day: { date: string; reps: number }) => day.date === yesterday,
      )?.reps,
    ).toBe(2);
    const empty = await request(
      a.sessionToken,
      '/v1/progress/calendar?month=2020-01',
    );
    expect(empty.json()).toMatchObject({
      monthlyReps: 0,
      activeDays: 0,
      days: [],
    });
    expect(
      (
        await request(b.sessionToken, '/v1/progress/summary?timeZone=UTC')
      ).json().totalReps,
    ).toBe(1);
  });

  it('orders and pages starts exactly, keeps historical travel/DST dates frozen and returns only inline submissions', async () => {
    const a = await account();
    const date = '2024-11-03';
    const ids = [
      await insertCompletion(a.userId, date, '2024-11-03T05:30:00.123456Z', {
        timeZone: 'America/Toronto',
      }),
      await insertCompletion(a.userId, date, '2024-11-03T05:30:00.123789Z', {
        timeZone: 'America/Toronto',
      }),
      await insertCompletion(a.userId, date, '2024-11-03T06:30:00Z', {
        timeZone: 'America/Toronto',
      }),
      await insertCompletion(a.userId, date, '2024-11-04T04:30:00Z', {
        timeZone: 'America/Toronto',
      }),
    ];
    await admin.query(
      `update justgo.attempts set reflection_feeling='a_little_better',reflection_text='Saved note',reflection_revision=6 where user_id=$1 and id=$2`,
      [a.userId, ids[1]],
    );
    const first = await request(
      a.sessionToken,
      `/v1/attempts?date=${date}&limit=1`,
    );
    expect(first.statusCode, first.body).toBe(200);
    const page1 = first.json() as ProgressDayResponse;
    expect(page1).toMatchObject({
      date,
      totalReps: 4,
    });
    expect(page1).not.toHaveProperty('totalElapsedSeconds');
    expect(page1.entries[0]).not.toHaveProperty('elapsedSeconds');
    expect(page1.entries[0]).toMatchObject({
      id: ids[0],
      reflection: null,
      startTimeZone: null,
      displayTimeZone: 'America/Toronto',
      levelId: 'level-1',
    });
    expect(page1.entries[0]?.instruction.length).toBeGreaterThan(0);
    expect(page1.entries[0]).not.toHaveProperty('revisionId');
    expect(first.body).not.toContain('Unfinished secret');
    const second = await request(
      a.sessionToken,
      `/v1/attempts?date=${date}&limit=1&cursor=${page1.nextCursor}`,
    );
    const page2 = second.json() as ProgressDayResponse;
    expect(page2.entries[0]).toMatchObject({
      id: ids[1],
      reflection: {
        feeling: 'a_little_better',
        text: 'Saved note',
        revision: 6,
      },
    });
    const third = await request(
      a.sessionToken,
      `/v1/attempts?date=${date}&limit=1&cursor=${page2.nextCursor}`,
    );
    const page3 = third.json() as ProgressDayResponse;
    expect(page3.entries[0]).toMatchObject({
      id: ids[2],
      reflection: null,
    });
    expect(page3.nextCursor).not.toBeNull();
    const fourth = await request(
      a.sessionToken,
      `/v1/attempts?date=${date}&limit=1&cursor=${page3.nextCursor}`,
    );
    expect((fourth.json() as ProgressDayResponse).entries[0]).toMatchObject({
      id: ids[3],
      reflection: null,
    });
    expect((fourth.json() as ProgressDayResponse).nextCursor).toBeNull();
    const month = await request(
      a.sessionToken,
      '/v1/progress/calendar?month=2024-11',
    );
    expect(month.json()).toMatchObject({
      monthlyReps: 4,
      activeDays: 1,
      days: [{ date, reps: 4 }],
    });
    expect(
      (await request(a.sessionToken, `/v1/attempts?date=${date}&cursor=bad`))
        .statusCode,
    ).toBe(400);
    expect(
      (await request(a.sessionToken, `/v1/attempts?date=${date}&limit=51`))
        .statusCode,
    ).toBe(400);
  });

  it('keeps empty history honest and enforces access and input validation', async () => {
    const a = await account();
    const summary = await request(
      a.sessionToken,
      '/v1/progress/summary?timeZone=UTC',
    );
    expect(summary.json()).toMatchObject({
      currentStreak: 0,
      bestStreak: 0,
      totalReps: 0,
    });
    expect(
      (await request(a.sessionToken, '/v1/attempts?date=2026-09-01')).json(),
    ).toMatchObject({
      totalReps: 0,
      entries: [],
      nextCursor: null,
    });
    expect(
      (await request(a.sessionToken, '/v1/progress/calendar?month=2026-13'))
        .statusCode,
    ).toBe(400);
    expect(
      (await request(a.sessionToken, '/v1/attempts?date=2026-02-30'))
        .statusCode,
    ).toBe(400);
    access = 'unpaid';
    expect(
      (await request(a.sessionToken, '/v1/progress/summary?timeZone=UTC'))
        .statusCode,
    ).toBe(403);
    access = 'unavailable';
    expect(
      (await request(a.sessionToken, '/v1/attempts?date=2026-09-01'))
        .statusCode,
    ).toBe(503);
    access = 'verified';
  });
});
