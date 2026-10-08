import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import type {
  AccessResponse,
  Attempt,
  CreateAttempt,
  Catalog,
  ProgressDayResponse,
} from '@justgo/contracts';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';
import { IdentityService } from '../../src/identity/service.js';
import { buildApp } from '../../src/build-app.js';
import { ProgressResources } from '../../src/progress/resources.js';
const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '3' });
for (const url of [config.DATABASE_URL, process.env.MIGRATION_DATABASE_URL])
  if (
    !url ||
    !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/justgo_test' ||
    new URL(url).search !== ''
  )
    throw new Error('Only isolated local justgo_test is allowed');
const db = createDatabase(config),
  admin = new Pool(
    poolOptions(
      readConfig({
        ...process.env,
        DATABASE_URL: process.env.MIGRATION_DATABASE_URL!,
      }),
    ),
  );
const identity = new IdentityService(db.db, {
  rateKey: `resource-test-${randomUUID()}`,
});
let access: 'verified' | 'unpaid' | 'unavailable' = 'verified';
let eligibility: 'eligible' | 'ineligible' | 'unavailable' = 'eligible';
const verifiedCoverage = new Map<
  string,
  { startsAt: number; endsAt: number }
>();
const coverage = vi.fn(
  async (_tx: unknown, context: { userId: string; startedAt: string }) => {
    if (eligibility !== 'eligible') return eligibility;
    const interval = verifiedCoverage.get(context.userId);
    const startedAt = Date.parse(context.startedAt);
    return interval &&
      startedAt >= interval.startsAt &&
      startedAt < interval.endsAt
      ? ('eligible' as const)
      : ('ineligible' as const);
  },
);
const reader = async (): Promise<AccessResponse> =>
  access === 'verified'
    ? {
        status: access,
        checkedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      }
    : { status: access, checkedAt: new Date().toISOString() };
const app = buildApp({
  identity,
  logger: false,
  checkDatabase: async () => {},
  entitlementReader: reader,
  uploadEligibilityReader: coverage,
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
  verifiedCoverage.set(result.userId, {
    startsAt: Date.parse('2000-01-01T00:00:00Z'),
    endsAt: Date.now() + 3600000,
  });
  return { ...input, userId: result.userId };
}
const request = (
  token: string,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  payload?: object,
) =>
  app.inject({
    method,
    url: path,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  });
async function input(
  token: string,
  extra: Partial<CreateAttempt> = {},
): Promise<CreateAttempt> {
  const result = await request(token, '/v1/challenges');
  expect(result.statusCode, result.body).toBe(200);
  const card = result.json<Catalog>().cards[0]!;
  return {
    id: randomUUID(),
    challengeId: card.challengeId,
    venue: card.venue,
    startedAt: '2026-09-18T23:55:00.000Z',
    startTimeZone: 'America/Toronto',
    ...extra,
  };
}
async function create(token: string, data?: CreateAttempt) {
  const body = data ?? (await input(token));
  const result = await request(token, '/v1/attempts', 'POST', body);
  expect(result.statusCode, result.body).toBe(201);
  return { body, attempt: result.json<{ attempt: Attempt }>().attempt };
}
const patch = (
  token: string,
  id: string,
  expectedReflectionRevision: number,
  reflection: object,
  submissionId = randomUUID(),
) =>
  request(token, `/v1/attempts/${id}`, 'PATCH', {
    submissionId,
    expectedReflectionRevision,
    reflection,
  });
afterEach(() => {
  access = 'verified';
  eligibility = 'eligible';
  coverage.mockClear();
  vi.restoreAllMocks();
});
afterAll(async () => {
  try {
    for (const owner of owners) {
      for (const table of [
        'attempt_patch_receipts',
        'attempts',
        'device_sessions',
        'recovery_credentials',
        'devices',
      ])
        await admin.query(`delete from justgo.${table} where user_id=$1`, [
          owner,
        ]);
      await admin.query('delete from justgo.users where id=$1', [owner]);
    }
  } finally {
    await app.close();
    await Promise.all([db.pool.end(), admin.end()]);
  }
});

describe('completed attempt resources', () => {
  it('downloads ordered current catalog for all six venues', async () => {
    const a = await account(),
      catalog = (
        await request(a.sessionToken, '/v1/challenges')
      ).json<Catalog>();
    expect(catalog.cards).toHaveLength(61);
    expect(new Set(catalog.cards.map((c) => c.venue)).size).toBe(6);
    for (const card of catalog.cards) {
      expect(card).not.toHaveProperty('revisionId');
      expect(card).toHaveProperty('position');
      expect(card.subtext).toBeNull();
    }
    const cards = catalog.cards.filter((c) => c.venue === 'bars');
    expect(cards.map((c) => c.position)).toEqual(
      [...cards.map((c) => c.position)].sort((a, b) => a - b),
    );
    expect(
      (await request(a.sessionToken, '/v1/challenges/state')).statusCode,
    ).toBe(404);
  });
  it('creates201 and replays concurrent lost acknowledgements200 with completed-only metadata', async () => {
    const a = await account(),
      body = await input(a.sessionToken);
    const results = await Promise.all([
      request(a.sessionToken, '/v1/attempts', 'POST', body),
      request(a.sessionToken, '/v1/attempts', 'POST', body),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 201]);
    expect(results[0]!.json()).toEqual(results[1]!.json());
    const rows = await admin.query(
      'select start_time_zone,legacy_display_time_zone,activity_date from justgo.attempts where user_id=$1 and id=$2',
      [a.userId, body.id],
    );
    expect(rows.rows).toEqual([
      {
        start_time_zone: body.startTimeZone,
        legacy_display_time_zone: null,
        activity_date: '2026-09-18',
      },
    ]);
    for (const changed of [
      { venue: 'park' },
      { startedAt: '2026-09-18T23:56:00.000Z' },
      { startTimeZone: 'UTC' },
      { challengeId: 'wrong' },
    ])
      expect(
        (
          await request(a.sessionToken, '/v1/attempts', 'POST', {
            ...body,
            ...changed,
          })
        ).statusCode,
      ).toBe(409);
    expect(
      (await request(a.sessionToken, `/v1/challenges/attempt/${body.id}`))
        .statusCode,
    ).toBe(404);
  });
  it('compares full PostgreSQL timestamp precision on create replay', async () => {
    const a = await account(),
      body = await input(a.sessionToken, {
        startedAt: '2026-09-18T12:00:00.000100Z',
      });
    const saved = await create(a.sessionToken, body);
    expect(saved.attempt.startedAt).toBe(body.startedAt);
    expect(
      (
        await request(a.sessionToken, '/v1/attempts', 'POST', {
          ...body,
          startedAt: '2026-09-18T12:00:00.000101Z',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await request(a.sessionToken, '/v1/attempts', 'POST', body)).statusCode,
    ).toBe(200);
  });
  it('scopes create identities and coverage to the authenticated owner', async () => {
    const a = await account(),
      b = await account(),
      body = await input(a.sessionToken);
    await create(a.sessionToken, body);
    verifiedCoverage.delete(b.userId);
    const rejected = await request(
      b.sessionToken,
      '/v1/attempts',
      'POST',
      body,
    );
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).not.toHaveProperty('attempt');
    verifiedCoverage.set(b.userId, {
      startsAt: Date.parse('2026-09-01T00:00:00Z'),
      endsAt: Date.parse('2026-10-01T00:00:00Z'),
    });
    const accepted = await create(b.sessionToken, body);
    expect(accepted.attempt.id).toBe(body.id);
    expect(
      (await request(a.sessionToken, '/v1/attempts?date=2026-09-18')).json()
        .totalReps,
    ).toBe(1);
    expect(
      (await request(b.sessionToken, '/v1/attempts?date=2026-09-18')).json()
        .totalReps,
    ).toBe(1);
  });
  it('freezes captured start date across midnight, travel and delayed uploads', async () => {
    const a = await account();
    const first = await create(
      a.sessionToken,
      await input(a.sessionToken, {
        startedAt: '2026-09-19T02:55:00.000Z',
        startTimeZone: 'America/Toronto',
      }),
    );
    expect(first.attempt.activityDate).toBe('2026-09-18');
    expect(first.attempt.startedAt).toBe(first.body.startedAt);
    const second = await create(
      a.sessionToken,
      await input(a.sessionToken, {
        startedAt: '2026-09-19T02:55:00.000Z',
        startTimeZone: 'Asia/Tokyo',
      }),
    );
    expect(second.attempt.activityDate).toBe('2026-09-19');
    expect(second.attempt.displayTimeZone).toBe('Asia/Tokyo');
  });
  it('authorizes earlier valid coverage independently of current paid access and rejects unavailable/invalid coverage', async () => {
    const a = await account(),
      body = await input(a.sessionToken);
    verifiedCoverage.set(a.userId, {
      startsAt: Date.parse('2026-09-18T00:00:00Z'),
      endsAt: Date.parse('2026-09-19T00:00:00Z'),
    });
    access = 'unpaid';
    const accepted = await create(a.sessionToken, body);
    expect(coverage).toHaveBeenLastCalledWith(expect.anything(), {
      userId: a.userId,
      startedAt: body.startedAt,
    });
    expect(
      (
        await patch(a.sessionToken, accepted.attempt.id, 0, {
          text: 'Earlier paid rep',
        })
      ).statusCode,
    ).toBe(200);
    for (const startedAt of [
      '2026-09-17T23:59:59.999Z',
      '2026-09-19T00:00:00.000Z',
    ]) {
      const rejected = await request(a.sessionToken, '/v1/attempts', 'POST', {
        ...body,
        id: randomUUID(),
        startedAt,
      });
      expect(rejected.statusCode).toBe(403);
      expect(rejected.json().code).toBe('ATTEMPT_INELIGIBLE');
    }
    eligibility = 'ineligible';
    expect(
      (
        await request(a.sessionToken, '/v1/attempts', 'POST', {
          ...body,
          id: randomUUID(),
        })
      ).json().code,
    ).toBe('ATTEMPT_INELIGIBLE');
    eligibility = 'unavailable';
    expect(
      (
        await request(a.sessionToken, '/v1/attempts', 'POST', {
          ...body,
          id: randomUUID(),
        })
      ).statusCode,
    ).toBe(503);
    expect(
      (await request(a.sessionToken, '/v1/attempts', 'POST', body)).statusCode,
    ).toBe(200);
    const closed = buildApp({
      identity,
      logger: false,
      checkDatabase: async () => {},
    });
    try {
      expect(
        (
          await closed.inject({
            method: 'POST',
            url: '/v1/attempts',
            headers: { authorization: `Bearer ${a.sessionToken}` },
            payload: { ...body, id: randomUUID() },
          })
        ).statusCode,
      ).toBe(503);
    } finally {
      await closed.close();
    }
  });
  it('rejects forged fields, invalid placement/zone/UUID and implausibly future starts without inserts', async () => {
    const a = await account(),
      body = await input(a.sessionToken);
    for (const changed of [
      { userId: a.userId },
      { status: 'completed' },
      { id: 'bad' },
      { startTimeZone: 'nonsense' },
      { challengeId: 'missing' },
      { startedAt: new Date(Date.now() + 3600000).toISOString() },
    ])
      expect(
        (
          await request(a.sessionToken, '/v1/attempts', 'POST', {
            ...body,
            ...changed,
          })
        ).statusCode,
      ).toBe(400);
    const catalog = (
      await request(a.sessionToken, '/v1/challenges')
    ).json<Catalog>();
    const missingVenue = (
      ['streets', 'gym', 'cafe', 'park', 'bookstore', 'bars'] as const
    ).find(
      (v) =>
        !catalog.cards.some(
          (c) => c.challengeId === body.challengeId && c.venue === v,
        ),
    )!;
    expect(missingVenue).toBeDefined();
    expect(
      (
        await request(a.sessionToken, '/v1/attempts', 'POST', {
          ...body,
          venue: missingVenue,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await admin.query('select id from justgo.attempts where user_id=$1', [
          a.userId,
        ])
      ).rows,
    ).toHaveLength(0);
  });
});

describe('inline reflection rules and history', () => {
  it('keeps inactive references uploadable and projects live challenge wording', async () => {
    const a = await account(),
      body = await input(a.sessionToken);
    const original = (
      await admin.query(
        'select text,active from justgo.challenges where id=$1',
        [body.challengeId],
      )
    ).rows[0];
    try {
      await admin.query(
        "update justgo.challenges set active=false,text='Disposable revised wording' where id=$1",
        [body.challengeId],
      );
      expect(
        (await request(a.sessionToken, '/v1/challenges'))
          .json<Catalog>()
          .cards.some((c) => c.challengeId === body.challengeId),
      ).toBe(false);
      const result = await create(a.sessionToken, body);
      expect(result.attempt.instruction).toBe('Disposable revised wording');
      await admin.query(
        "update justgo.challenges set text='Disposable newest wording' where id=$1",
        [body.challengeId],
      );
      expect(
        (
          await request(a.sessionToken, '/v1/attempts?date=2026-09-18')
        ).json<ProgressDayResponse>().entries[0]?.instruction,
      ).toBe('Disposable newest wording');
    } finally {
      await admin.query(
        'update justgo.challenges set text=$2,active=$3 where id=$1',
        [body.challengeId, original.text, original.active],
      );
    }
  });
  it('supports feeling-only, text-only and combined submissions with no mutable feeling on edits', async () => {
    const a = await account();
    for (const reflection of [
      { feeling: 'a_little_better' },
      { text: 'Text only' },
      { feeling: 'about_the_same', text: 'Both' },
    ]) {
      const { attempt } = await create(a.sessionToken),
        saved = await patch(a.sessionToken, attempt.id, 0, reflection);
      expect(saved.statusCode, saved.body).toBe(200);
      expect(saved.json().attempt.reflection.revision).toBe(1);
      const edited = await patch(a.sessionToken, attempt.id, 1, {
        text: 'Edited',
      });
      expect(edited.statusCode, edited.body).toBe(200);
      expect(edited.json().attempt.reflection.feeling).toBe(
        saved.json().attempt.reflection.feeling,
      );
      expect(
        (
          await patch(a.sessionToken, attempt.id, 2, {
            feeling: 'a_lot_better',
            text: 'Edited',
          })
        ).statusCode,
      ).toBe(400);
      const cleared = await patch(a.sessionToken, attempt.id, 2, {
        text: '   ',
      });
      expect(cleared.statusCode).toBe('feeling' in reflection ? 200 : 400);
      if ('feeling' in reflection)
        expect(cleared.json().attempt.reflection.text).toBeNull();
    }
    const { attempt } = await create(a.sessionToken);
    for (const reflection of [
      {},
      { text: null },
      { text: '  ', feeling: null },
      { text: 'a'.repeat(10001) },
    ])
      expect(
        (await patch(a.sessionToken, attempt.id, 0, reflection)).statusCode,
      ).toBe(400);
  });
  it('replays matching receipts before checking revisions without regressing canonical content', async () => {
    const a = await account(),
      { attempt } = await create(a.sessionToken),
      submission = randomUUID();
    const first = await patch(
      a.sessionToken,
      attempt.id,
      0,
      { text: 'First' },
      submission,
    );
    expect(first.statusCode).toBe(200);
    const next = await patch(a.sessionToken, attempt.id, 1, { text: 'Second' });
    expect(next.statusCode).toBe(200);
    const replay = await patch(
      a.sessionToken,
      attempt.id,
      0,
      { text: 'First' },
      submission,
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      attempt: { reflection: { text: 'Second', revision: 2 } },
      acknowledgement: { submissionId: submission, appliedRevision: 1 },
    });
    expect(
      (
        await patch(
          a.sessionToken,
          attempt.id,
          0,
          { text: 'Changed' },
          submission,
        )
      ).json().code,
    ).toBe('CONFLICT');
    const another = await create(a.sessionToken);
    expect(
      (
        await patch(
          a.sessionToken,
          another.attempt.id,
          0,
          { text: 'First' },
          submission,
        )
      ).json().code,
    ).toBe('CONFLICT');
    expect(
      (
        await admin.query(
          'select count(*)::int as n from justgo.attempt_patch_receipts where user_id=$1',
          [a.userId],
        )
      ).rows[0].n,
    ).toBe(2);
  });
  it('returns latest owner-scoped canonical content for genuine revision conflicts and serializes competing edits', async () => {
    const a = await account(),
      { attempt } = await create(a.sessionToken);
    const results = await Promise.all([
      patch(a.sessionToken, attempt.id, 0, { text: 'One' }),
      patch(a.sessionToken, attempt.id, 0, { text: 'Two' }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const winner = results.find((r) => r.statusCode === 200)!.json().attempt;
    expect(results.find((r) => r.statusCode === 409)!.json()).toMatchObject({
      code: 'REFLECTION_CONFLICT',
      currentAttempt: winner,
    });
    const b = await account(),
      other = await patch(b.sessionToken, attempt.id, 0, { text: 'Attack' });
    expect(other.statusCode).toBe(404);
    expect(other.json()).not.toHaveProperty('currentAttempt');
    expect(
      (await patch(a.sessionToken, randomUUID(), 0, { text: 'Missing' }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await request(a.sessionToken, '/v1/attempts/not-an-id', 'PATCH', {
          submissionId: randomUUID(),
          expectedReflectionRevision: 0,
          reflection: { text: 'x' },
        })
      ).statusCode,
    ).toBe(400);
  });
  it('pages by precise start time and UUID, keeps cursors self-contained and rejects invalid or cross-date cursors', async () => {
    const a = await account();
    const ids = [randomUUID(), randomUUID()].sort();
    for (const id of ids)
      await create(
        a.sessionToken,
        await input(a.sessionToken, {
          id,
          startedAt: '2026-09-18T12:00:00.000100Z',
        }),
      );
    const third = await create(
      a.sessionToken,
      await input(a.sessionToken, { startedAt: '2026-09-18T12:00:00.000101Z' }),
    );
    const first = (
      await request(a.sessionToken, '/v1/attempts?date=2026-09-18&limit=1')
    ).json<ProgressDayResponse>();
    expect(first.entries[0]?.id).toBe(ids[0]);
    expect(first.totalReps).toBe(3);
    const next = (
      await request(
        a.sessionToken,
        `/v1/attempts?date=2026-09-18&limit=1&cursor=${first.nextCursor}`,
      )
    ).json<ProgressDayResponse>();
    expect(next.entries[0]?.id).toBe(ids[1]);
    const last = (
      await request(
        a.sessionToken,
        `/v1/attempts?date=2026-09-18&cursor=${next.nextCursor}`,
      )
    ).json<ProgressDayResponse>();
    expect(last.entries.map((e) => e.id)).toEqual([third.attempt.id]);
    expect(last.nextCursor).toBeNull();
    for (const suffix of [
      `date=2026-09-19&cursor=${first.nextCursor}`,
      'date=2026-09-18&cursor=invalid',
      'date=2026-09-18&limit=51',
      'date=2026-02-30',
    ])
      expect(
        (await request(a.sessionToken, `/v1/attempts?${suffix}`)).statusCode,
      ).toBe(400);
    const empty = (
      await request(a.sessionToken, '/v1/attempts?date=2000-01-01')
    ).json();
    expect(empty).toMatchObject({
      totalReps: 0,
      entries: [],
      nextCursor: null,
    });
  });
  it('keeps a current streak when travel attributes another rep to tomorrow', async () => {
    const a = await account(),
      now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    await create(
      a.sessionToken,
      await input(a.sessionToken, {
        startedAt: yesterday.toISOString(),
        startTimeZone: 'Pacific/Honolulu',
      }),
    );
    const today = await create(
      a.sessionToken,
      await input(a.sessionToken, {
        startedAt: now.toISOString(),
        startTimeZone: 'Pacific/Honolulu',
      }),
    );
    const tomorrow = await create(
      a.sessionToken,
      await input(a.sessionToken, {
        startedAt: now.toISOString(),
        startTimeZone: 'Pacific/Kiritimati',
      }),
    );
    expect(tomorrow.attempt.activityDate > today.attempt.activityDate).toBe(
      true,
    );
    for (const path of ['/v1/progress/summary?timeZone=Pacific/Honolulu']) {
      const response = await request(a.sessionToken, path);
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json()).toMatchObject({
        today: today.attempt.activityDate,
        currentStreak: 2,
        bestStreak: 3,
        totalReps: 3,
      });
    }
  });
  it('separates calendar from summary work, returns month-boundary streak context and preserves owner isolation', async () => {
    const a = await account(),
      b = await account();
    const today = new Date(),
      month = today.toISOString().slice(0, 7),
      first = new Date(`${month}-01T00:00:00.000Z`);
    const day = (offset: number) => {
      const date = new Date(first);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString();
    };
    for (const startedAt of [day(-2), day(-1), day(0)])
      await create(
        a.sessionToken,
        await input(a.sessionToken, { startedAt, startTimeZone: 'UTC' }),
      );
    const summary = (
      await request(a.sessionToken, '/v1/progress/summary?timeZone=UTC')
    ).json();
    expect(summary).toMatchObject({
      timeZone: 'UTC',
      totalReps: 3,
      bestStreak: 3,
      streakContext: { month, precedingRun: 2, bestBeforeMonth: 2 },
    });
    const spy = vi.spyOn(ProgressResources.prototype, 'summary');
    expect(
      (
        await request(a.sessionToken, `/v1/progress/calendar?month=${month}`)
      ).json(),
    ).toMatchObject({ month, monthlyReps: 1, activeDays: 1 });
    expect(spy).not.toHaveBeenCalled();
    expect(
      (
        await request(b.sessionToken, '/v1/progress/summary?timeZone=UTC')
      ).json().totalReps,
    ).toBe(0);
    expect(
      (
        await request(
          b.sessionToken,
          `/v1/attempts?date=${day(0).slice(0, 10)}`,
        )
      ).json().entries,
    ).toEqual([]);
    expect(
      (await db.pool.query('select * from justgo.attempt_patch_receipts')).rows,
    ).toEqual([]);
    await expect(
      identity.withSession(b.sessionToken, (tx) =>
        tx.execute(
          sql`insert into justgo.attempt_patch_receipts(user_id,id,attempt_id,input_digest,applied_revision)values(${a.userId},${randomUUID()},${randomUUID()},${'a'.repeat(64)},1)`,
        ),
      ),
    ).rejects.toThrow();
  });
  it('keeps catalog and history access closed while upload authorization remains separate', async () => {
    const a = await account();
    for (const status of ['unpaid', 'unavailable'] as const) {
      access = status;
      for (const path of [
        '/v1/challenges',
        '/v1/progress/summary?timeZone=UTC',
        '/v1/progress/calendar?month=2026-10',
        '/v1/attempts?date=2026-10-01',
      ])
        expect((await request(a.sessionToken, path)).statusCode).toBe(
          status === 'unpaid' ? 403 : 503,
        );
    }
    access = 'verified';
    for (const path of [
      '/v1/progress/summary?timeZone=invalid',
      '/v1/progress/summary?timeZone=UTC&month=2026-10',
      '/v1/progress/calendar?month=bad',
    ])
      expect((await request(a.sessionToken, path)).statusCode).toBe(400);
  });
});
