import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, describe, it, expect } from 'vitest';
import type {
  CompletionAttempt,
  ManagedSessionResponse,
  JournalSyncVersion,
} from '@justgo/contracts';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';
import { localTestDatabaseUrl } from '../../scripts/local-test-database.js';
import {
  IdentityService,
  type IdentityOptions,
} from '../../src/identity/service.js';
import { buildApp } from '../../src/build-app.js';
import { createBetaAccess } from '../../src/access/beta-access.js';
import { ApiError } from '../../src/http/api-error.js';
import { loggerOptions } from '../../src/http/diagnostics.js';
import type { VerifiedManagedIdentity } from '../../src/identity/managed-verifier.js';

const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '3' });
for (const url of [config.DATABASE_URL, process.env.MIGRATION_DATABASE_URL])
  localTestDatabaseUrl(url);
const db = createDatabase(config),
  admin = new Pool(
    poolOptions(
      readConfig({
        ...process.env,
        DATABASE_URL: process.env.MIGRATION_DATABASE_URL!,
      }),
    ),
  );
const verified = new Map<string, VerifiedManagedIdentity>(),
  live = new Set<string>(),
  owners = new Set<string>();
const failedAuthDeletes = new Set<string>(),
  authDeleteCalls: string[] = [];
const rateKey = `managed-tests-${randomUUID()}`;
const identityOptions: IdentityOptions = {
  rateKey,
  managedAuthVerifier: async (token) => {
    const result = verified.get(token);
    if (!result) throw new ApiError('UNAUTHORIZED');
    return result;
  },
  managedLiveSessionReader: async (_tx, subject) => live.has(subject.sessionId),
  managedAuthDeletion: async (authUserId) => {
    authDeleteCalls.push(authUserId);
    if (failedAuthDeletes.delete(authUserId))
      throw new ApiError('UNAVAILABLE', 503);
    for (const [token, subject] of verified)
      if (subject.authUserId === authUserId) {
        verified.delete(token);
        live.delete(subject.sessionId);
      }
  },
};
const identity = new IdentityService(db.db, identityOptions);
const app = buildApp({
  identity,
  logger: loggerOptions('error'),
  checkDatabase: async () => {},
});
const request = (
  token: string,
  path: string,
  method: 'POST' | 'GET' | 'DELETE' | 'PATCH' = 'GET',
  payload?: object,
) =>
  app.inject({
    url: `/v1${path}`,
    method,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  });
function provider(authUserId: string = randomUUID()) {
  const subject = {
    authUserId,
    sessionId: randomUUID(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const token = `managed.${Buffer.from(randomUUID()).toString('base64url')}.proof`;
  verified.set(token, subject);
  live.add(subject.sessionId);
  return { token, subject };
}
async function signIn(authUserId?: string, legacySessionToken?: string) {
  const p = provider(authUserId),
    deviceId = randomUUID();
  const response = await request(p.token, '/auth/session', 'POST', {
    deviceId,
    ...(legacySessionToken ? { legacySessionToken } : {}),
  });
  expect(response.statusCode, response.body).toBe(200);
  const session = response.json<ManagedSessionResponse>();
  owners.add(session.userId);
  return { ...p, deviceId, session };
}
async function completion(
  extra: Partial<CompletionAttempt> = {},
): Promise<CompletionAttempt> {
  const row = (
    await admin.query<{
      challenge_id: string;
      venue_id: CompletionAttempt['venue'];
    }>(
      'select challenge_id,venue_id from justgo.venue_cards order by id limit 1',
    )
  ).rows[0]!;
  return {
    id: randomUUID(),
    challengeId: row.challenge_id,
    venue: row.venue_id,
    levelId: 'level-1',
    instruction: 'Frozen historical instruction',
    startedAt: '2026-09-19T02:55:00.000100Z',
    startTimeZone: 'America/Toronto',
    displayTimeZone: 'America/Toronto',
    activityDate: '2026-09-18',
    ...extra,
  };
}
const restore = (
  token: string,
  attempts: CompletionAttempt[],
  expectedEpoch = 0,
) =>
  request(token, '/completion-restores', 'POST', { expectedEpoch, attempts });
const version = (
  attemptId: string,
  extra: Partial<JournalSyncVersion> = {},
): JournalSyncVersion => ({
  versionId: randomUUID(),
  attemptId,
  parents: [],
  feelingScaleVersion: 1,
  reflection: {
    feeling: 'a_little_better',
    text: 'Synthetic journal content',
    revision: 1,
  },
  ...extra,
});
const save = (
  token: string,
  versions: JournalSyncVersion[],
  expectedEpoch = 0,
) => request(token, '/journal-sync', 'POST', { expectedEpoch, versions });
afterAll(async () => {
  try {
    await admin.query(
      'delete from justgo.identity_rate_buckets where key = any($1)',
      [
        [...owners].flatMap((owner) =>
          ['write', 'export'].map((lane) =>
            createHmac('sha256', rateKey)
              .update(`account-${lane}:${owner}`)
              .digest('hex'),
          ),
        ),
      ],
    );
    for (const owner of owners) {
      for (const table of [
        'journal_versions',
        'managed_auth_deletions',
        'attempt_patch_receipts',
        'attempts',
        'deleted_completion_ids',
        'managed_auth_sessions',
        'managed_auth_accounts',
        'device_transfers',
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

function limitedServer(database = db.db) {
  return buildApp({
    identity: new IdentityService(database, {
      ...identityOptions,
      activityWriteRateLimit: 2,
      accountExportRateLimit: 2,
    }),
    logger: false,
    checkDatabase: async () => {},
    uploadEligibilityReader: async () => 'eligible',
  });
}

describe('durable account activity budgets', () => {
  it('shares the write budget across API instances with a one-connection pool, isolates owners and preserves accepted retries', async () => {
    const single = createDatabase({ ...config, DATABASE_POOL_MAX: 1 });
    const first = limitedServer(single.db),
      second = limitedServer(single.db);
    try {
      const a = await signIn(),
        b = await signIn();
      const entry = await completion();
      const entries = Array.from({ length: 3 }, () => ({
        id: randomUUID(),
        challengeId: entry.challengeId,
        venue: entry.venue,
        startedAt: entry.startedAt,
        startTimeZone: entry.startTimeZone,
        expectedEpoch: 0,
      }));
      const post = (server: typeof first, token: string, input: object) =>
        server.inject({
          method: 'POST',
          url: '/v1/attempts',
          headers: { authorization: `Bearer ${token}` },
          payload: input,
        });
      const results = await Promise.all(
        entries.map((input, i) => post(i % 2 ? first : second, a.token, input)),
      );
      expect(results.map((response) => response.statusCode).sort()).toEqual([
        201, 201, 429,
      ]);
      const limited = results.find((response) => response.statusCode === 429)!;
      expect(limited.json().code).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      expect(Number(limited.headers['retry-after'])).toBeLessThanOrEqual(600);
      expect(limited.body).not.toContain(a.token);
      const accepted =
        entries[results.findIndex((response) => response.statusCode === 201)]!;
      expect((await post(second, a.token, accepted)).statusCode).toBe(200);
      expect(
        (await post(second, b.token, { ...entries[0], id: randomUUID() }))
          .statusCode,
      ).toBe(201);
      const key = createHmac('sha256', rateKey)
        .update(`account-write:${a.session.userId}`)
        .digest('hex');
      const count = await admin.query(
        'select count from justgo.identity_rate_buckets where key=$1',
        [key],
      );
      expect(count.rows[0].count).toBe(2);
      await admin.query(
        "update justgo.identity_rate_buckets set window_start=now()-interval '11 minutes' where key=$1",
        [key],
      );
      expect(
        (await post(first, a.token, { ...entries[0], id: randomUUID() }))
          .statusCode,
      ).toBe(201);
    } finally {
      await Promise.all([first.close(), second.close()]);
      await single.pool.end();
    }
  });

  it('counts one new-write batch, rolls back failed batches and keeps journal/restore replays available', async () => {
    const limited = limitedServer();
    const a = await signIn();
    const send = (path: string, input: object) =>
      limited.inject({
        method: 'POST',
        url: `/v1${path}`,
        headers: { authorization: `Bearer ${a.token}` },
        payload: input,
      });
    try {
      const one = await completion(),
        two = await completion();
      const invalid = { ...two, challengeId: 'nonexistent-challenge' };
      const rejected = await send('/completion-restores', {
        expectedEpoch: 0,
        attempts: [one, invalid],
      });
      expect(rejected.statusCode).toBe(400);
      const restored = await send('/completion-restores', {
        expectedEpoch: 0,
        attempts: [one, two],
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json().added).toBe(2);
      const versions = [version(one.id), version(two.id)];
      const journal = await send('/journal-sync', {
        expectedEpoch: 0,
        versions,
      });
      expect(journal.statusCode).toBe(200);
      expect(journal.json().saved).toBe(2);
      expect(
        (
          await send('/journal-sync', {
            expectedEpoch: 0,
            versions: [version(one.id)],
          })
        ).statusCode,
      ).toBe(429);
      expect(
        (await send('/journal-sync', { expectedEpoch: 0, versions })).json(),
      ).toMatchObject({ saved: 0, identical: 2 });
      expect(
        (
          await send('/completion-restores', {
            expectedEpoch: 0,
            attempts: [one, two],
          })
        ).json(),
      ).toMatchObject({ added: 0, identical: 2 });
      expect(
        (
          await send('/completion-restores', {
            expectedEpoch: 0,
            attempts: [await completion()],
          })
        ).statusCode,
      ).toBe(429);
    } finally {
      await limited.close();
    }
  });

  it('shares a separate export budget across history/journal pages and keeps deletion reachable', async () => {
    const limited = limitedServer();
    const a = await signIn();
    const get = (path: string) =>
      limited.inject({
        url: `/v1${path}`,
        headers: { authorization: `Bearer ${a.token}` },
      });
    try {
      expect((await get('/account/export')).statusCode).toBe(200);
      expect((await get('/completion-restores')).statusCode).toBe(200);
      expect((await get('/journal-sync')).statusCode).toBe(429);
      const key = createHmac('sha256', rateKey)
        .update(`account-export:${a.session.userId}`)
        .digest('hex');
      await admin.query(
        "update justgo.identity_rate_buckets set window_start=now()-interval '11 minutes' where key=$1",
        [key],
      );
      expect((await get('/journal-sync')).statusCode).toBe(200);
      expect((await get('/completion-restores')).statusCode).toBe(200);
      expect((await get('/account/export')).statusCode).toBe(429);
      const deleted = await limited.inject({
        method: 'DELETE',
        url: '/v1/data',
        headers: { authorization: `Bearer ${a.token}` },
        payload: { expectedEpoch: 0 },
      });
      expect(deleted.statusCode).toBe(200);
    } finally {
      await limited.close();
    }
  });
});
describe('managed authentication and guest boundary', () => {
  it('maps only verified Auth subjects and replays the exact owner/session/device', async () => {
    const a = await signIn();
    const replay = await request(a.token, '/auth/session', 'POST', {
      deviceId: a.deviceId,
    });
    expect(replay.json()).toEqual(a.session);
    expect((await request(a.token, '/auth/session')).json()).toEqual(a.session);
    expect(
      (
        await request(a.token, '/auth/session', 'POST', {
          deviceId: randomUUID(),
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(a.token, '/auth/session', 'POST', {
          deviceId: a.deviceId,
          userId: randomUUID(),
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('forged.jwt.signature', '/auth/session', 'POST', {
          deviceId: randomUUID(),
        })
      ).statusCode,
    ).toBe(401);
    const second = await signIn(a.subject.authUserId);
    expect(second.session.userId).toBe(a.session.userId);
    expect((await signIn()).session.userId).not.toBe(a.session.userId);
  });
  it('links legacy history only with an active owner proof and rejects claiming a second owner', async () => {
    const proof = {
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      sessionToken: randomBytes(32).toString('hex'),
      credential: randomBytes(32).toString('hex'),
    };
    const legacy = await identity.bootstrap(proof);
    owners.add(legacy.userId);
    const linked = await signIn(undefined, proof.sessionToken);
    expect(linked.session.userId).toBe(legacy.userId);
    expect(
      (
        await request(linked.token, '/auth/session', 'POST', {
          deviceId: linked.deviceId,
          legacySessionToken: proof.sessionToken,
        })
      ).json(),
    ).toEqual(linked.session);
    expect(
      (await request(proof.sessionToken, '/completion-restores')).statusCode,
    ).toBe(401);
    const other = await signIn();
    const liveProof = {
      ...proof,
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      sessionToken: randomBytes(32).toString('hex'),
      credential: randomBytes(32).toString('hex'),
    };
    owners.add((await identity.bootstrap(liveProof)).userId);
    expect(
      (
        await request(other.token, '/auth/session', 'POST', {
          deviceId: other.deviceId,
          legacySessionToken: liveProof.sessionToken,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request(other.token, '/auth/session', 'POST', {
          deviceId: other.deviceId,
          legacySessionToken: proof.sessionToken,
        })
      ).statusCode,
    ).toBe(401);
    const fresh = provider();
    expect(
      (
        await request(fresh.token, '/auth/session', 'POST', {
          deviceId: randomUUID(),
          legacySessionToken: 'f'.repeat(64),
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await admin.query(
          'select user_id from justgo.managed_auth_accounts where auth_user_id=$1',
          [fresh.subject.authUserId],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it('rechecks live provider sessions and immediate app revocation', async () => {
    const a = await signIn(),
      otherDevice = await signIn(a.subject.authUserId),
      b = await signIn();
    live.delete(a.subject.sessionId);
    expect((await request(a.token, '/completion-restores')).statusCode).toBe(
      401,
    );
    live.add(a.subject.sessionId);
    expect(
      (await request(a.token, '/auth/logout', 'POST', { scope: 'session' }))
        .statusCode,
    ).toBe(200);
    expect((await request(a.token, '/auth/session')).statusCode).toBe(401);
    expect(
      (
        await request(a.token, '/auth/session', 'POST', {
          deviceId: a.deviceId,
        })
      ).statusCode,
    ).toBe(401);
    expect((await request(otherDevice.token, '/auth/session')).statusCode).toBe(
      200,
    );
    expect(
      (
        await request(otherDevice.token, '/auth/logout', 'POST', {
          scope: 'all',
        })
      ).statusCode,
    ).toBe(200);
    expect((await request(otherDevice.token, '/auth/session')).statusCode).toBe(
      401,
    );
    expect((await request(b.token, '/auth/session')).statusCode).toBe(200);
  });
  it('exposes guest catalog only under explicit trusted admission and creates no account', async () => {
    const before = (
      await admin.query<{ count: string }>('select count(*) from justgo.users')
    ).rows[0]!.count;
    expect((await app.inject('/v1/guest/access')).json().status).toBe('unpaid');
    expect((await app.inject('/v1/guest/challenges')).statusCode).toBe(403);
    const guest = buildApp({
      identity,
      logger: false,
      checkDatabase: async () => {},
      ...createBetaAccess([], Date.now, {
        startsAt: new Date(Date.now() - 60000).toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    });
    try {
      expect((await guest.inject('/v1/guest/access')).json().status).toBe(
        'verified',
      );
      expect(
        (await guest.inject('/v1/guest/challenges')).json().cards,
      ).toHaveLength(61);
    } finally {
      await guest.close();
    }
    expect(
      (
        await admin.query<{ count: string }>(
          'select count(*) from justgo.users',
        )
      ).rows[0]!.count,
    ).toBe(before);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/journal-sync',
          payload: { expectedEpoch: 0, versions: [version(randomUUID())] },
        })
      ).statusCode,
    ).toBe(401);
  });
  it('retires new legacy bootstrap, transfers and key/code controls while preserving existing-proof migration', async () => {
    const managed = buildApp({
      identity,
      legacyIdentityEnabled: false,
      logger: false,
      checkDatabase: async () => {},
    });
    const proof = {
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      sessionToken: randomBytes(32).toString('hex'),
      credential: randomBytes(32).toString('hex'),
    };
    owners.add((await identity.bootstrap(proof)).userId);
    try {
      expect(
        (
          await managed.inject({
            url: '/v1/sessions/current',
            headers: { authorization: `Bearer ${proof.sessionToken}` },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await managed.inject({
            url: '/v1/sessions',
            method: 'POST',
            payload: { ...proof, kind: 'recovery' },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await managed.inject({
            url: '/v1/sessions',
            method: 'POST',
            payload: { ...proof, kind: 'bootstrap' },
          })
        ).statusCode,
      ).toBe(410);
      for (const path of ['/v1/credentials', '/v1/devices', '/v1/transfers'])
        expect((await managed.inject({ url: path })).statusCode).toBe(404);
      expect(
        (
          await managed.inject({
            url: '/v1/transfers',
            method: 'POST',
            payload: {},
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await managed.close();
    }
    const legacyOnly = new IdentityService(db.db, {
      rateKey: `no-managed-${randomUUID()}`,
    });
    await expect(
      legacyOnly.withSession('unknown.jwt.signature', async () => true),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      legacyOnly.withAccountDeletion('unknown.jwt.signature', async () => true),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(() =>
      legacyOnly.exchangeManaged('unknown.jwt.signature', {
        deviceId: randomUUID(),
      }),
    ).toThrow('UNAVAILABLE');
  });
});
describe('stable completion restoration', () => {
  it('preserves full context and legacy completion dates without entitlement or private fields', async () => {
    const a = await signIn(),
      modern = await completion(),
      legacy = await completion({
        startTimeZone: null,
        displayTimeZone: 'UTC',
        activityDate: '2026-09-20',
      });
    const response = await restore(a.token, [modern, legacy]);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      dataEpoch: 0,
      attempts: [modern, legacy],
      added: 2,
      identical: 0,
    });
    expect((await restore(a.token, [modern, legacy])).json()).toEqual({
      dataEpoch: 0,
      attempts: [modern, legacy],
      added: 0,
      identical: 2,
    });
    const first = (
      await request(a.token, '/completion-restores?limit=1')
    ).json();
    expect(first.attempts).toHaveLength(1);
    expect(first.nextCursor).toBe(first.attempts[0].id);
    const last = (
      await request(
        a.token,
        `/completion-restores?limit=1&cursor=${first.nextCursor}`,
      )
    ).json();
    expect(last.attempts).toHaveLength(1);
    expect(last.nextCursor).toBeNull();
    const rows = await admin.query(
      'select reflection_feeling,reflection_text,reflection_revision from justgo.attempts where user_id=$1',
      [a.session.userId],
    );
    expect(rows.rows).toEqual(
      Array.from({ length: 2 }, () => ({
        reflection_feeling: null,
        reflection_text: null,
        reflection_revision: 0,
      })),
    );
  });
  it('serializes concurrent replay, isolates IDs by owner, rejects changed contexts and rolls back invalid batches', async () => {
    const a = await signIn(),
      b = await signIn(),
      entry = await completion();
    const results = await Promise.all([
      restore(a.token, [entry]),
      restore(a.token, [entry]),
    ]);
    expect(results.map((result) => result.json().added).sort()).toEqual([0, 1]);
    expect((await restore(b.token, [entry])).json().added).toBe(1);
    for (const changed of [
      { instruction: 'Changed context' },
      { startedAt: '2026-09-19T02:55:00.000101Z' },
      { startTimeZone: null },
    ])
      expect(
        (await restore(a.token, [{ ...entry, ...changed }])).statusCode,
      ).toBe(409);
    const valid = await completion(),
      unknown = await completion({ challengeId: 'unknown' });
    expect((await restore(a.token, [valid, unknown])).statusCode).toBe(400);
    expect(
      (
        await admin.query(
          'select id from justgo.attempts where user_id=$1 and id=$2',
          [a.session.userId, valid.id],
        )
      ).rows,
    ).toHaveLength(0);
    expect((await restore(a.token, [entry, entry])).statusCode).toBe(400);
    expect(
      (
        await restore(a.token, [
          await completion({
            startedAt: new Date(Date.now() + 600000).toISOString(),
          }),
        ])
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await restore(a.token, [
          await completion({ activityDate: '2026-09-17' }),
        ])
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request(a.token, '/completion-restores', 'POST', {
          expectedEpoch: 0,
          attempts: [{ ...entry, reflection: { text: 'private' } }],
        })
      ).statusCode,
    ).toBe(400);
  });
});
describe('signed-in immutable journal versions and deletion', () => {
  it('retains concurrent writing and exact retries without overwrites or cross-owner reads', async () => {
    const a = await signIn(),
      b = await signIn(),
      entry = await completion();
    await restore(a.token, [entry]);
    const first = version(entry.id),
      left = version(entry.id, {
        parents: [first.versionId],
        reflection: { feeling: null, text: 'Left writing', revision: 2 },
      }),
      right = version(entry.id, {
        parents: [first.versionId],
        reflection: { feeling: null, text: 'Right writing', revision: 2 },
      });
    expect((await save(a.token, [first])).json().saved).toBe(1);
    await admin.query(
      'update justgo.journal_versions set context=null where user_id=$1 and version_id=$2',
      [a.session.userId, first.versionId],
    );
    expect(
      (
        await save(a.token, [
          {
            ...first,
            context: {
              ...entry,
              startedAt: entry.startedAt.replace('.000100Z', '.0001Z'),
            },
          },
        ])
      ).json().identical,
    ).toBe(1);
    expect((await save(a.token, [left, right])).json()).toMatchObject({
      dataEpoch: 0,
      versions: [left, right],
      saved: 2,
      identical: 0,
    });
    expect((await save(a.token, [left, right])).json().identical).toBe(2);
    expect(
      (
        await save(a.token, [
          { ...left, reflection: { ...left.reflection, text: 'Overwrite' } },
        ])
      ).statusCode,
    ).toBe(409);
    const response = (await request(a.token, '/journal-sync')).json();
    expect(response.versions).toHaveLength(3);
    expect((await request(b.token, '/journal-sync')).json().versions).toEqual(
      [],
    );
    expect((await save(b.token, [left])).statusCode).toBe(400);
    const good = version(entry.id),
      invalid = version(entry.id, { parents: [randomUUID()] });
    expect((await save(a.token, [good, invalid])).statusCode).toBe(400);
    expect(
      (await request(a.token, '/journal-sync')).json().versions,
    ).toHaveLength(3);
    const legacyProof = {
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      sessionToken: randomBytes(32).toString('hex'),
      credential: randomBytes(32).toString('hex'),
    };
    owners.add((await identity.bootstrap(legacyProof)).userId);
    expect((await save(legacyProof.sessionToken, [first])).statusCode).toBe(
      401,
    );
    expect(
      (
        await request(a.token, `/attempts/${entry.id}`, 'PATCH', {
          reflection: { text: 'retired' },
        })
      ).statusCode,
    ).toBe(410);
  });
  it('clears account data, advances epochs, tombstones IDs and safely replays a lost deletion response', async () => {
    const a = await signIn(),
      otherDevice = await signIn(a.subject.authUserId),
      entry = await completion();
    await restore(a.token, [entry]);
    await save(a.token, [version(entry.id)]);
    const deleted = await request(a.token, '/data', 'DELETE', {
      expectedEpoch: 0,
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(deleted.json().dataEpoch).toBe(1);
    expect((await request(a.token, '/auth/session')).json().dataEpoch).toBe(1);
    expect((await request(a.token, '/journal-sync')).json().versions).toEqual(
      [],
    );
    expect(
      (await request(a.token, '/completion-restores')).json().attempts,
    ).toEqual([]);
    expect((await restore(otherDevice.token, [entry])).json().code).toBe(
      'DATA_EPOCH_CHANGED',
    );
    expect((await restore(otherDevice.token, [entry], 1)).json().code).toBe(
      'DATA_DELETED',
    );
    expect(
      (
        await request(otherDevice.token, '/attempts', 'POST', {
          id: entry.id,
          challengeId: entry.challengeId,
          venue: entry.venue,
          startedAt: entry.startedAt,
          startTimeZone: 'America/Toronto',
        })
      ).json().code,
    ).toBe('DATA_EPOCH_CHANGED');
    const fresh = await completion();
    expect((await restore(a.token, [fresh], 1)).json().added).toBe(1);
    expect(
      (await request(a.token, '/data', 'DELETE', { expectedEpoch: 0 })).json(),
    ).toEqual(deleted.json());
    expect(
      (await request(a.token, '/completion-restores')).json().attempts,
    ).toHaveLength(1);
    expect(
      (
        await request(otherDevice.token, '/completion-restores', 'POST', {
          expectedEpoch: 0,
          restoreDeleted: true,
          attempts: [entry],
        })
      ).json().code,
    ).toBe('DATA_EPOCH_CHANGED');
    expect(
      (
        await request(a.token, '/completion-restores', 'POST', {
          expectedEpoch: 1,
          restoreDeleted: true,
          attempts: [entry],
        })
      ).json().added,
    ).toBe(1);
    expect((await restore(a.token, [entry], 1)).json().identical).toBe(1);
    expect((await save(a.token, [version(entry.id)], 1)).json().saved).toBe(1);
    expect(
      (
        await admin.query('select deleted_at from justgo.users where id=$1', [
          a.session.userId,
        ])
      ).rows[0]!.deleted_at,
    ).toBeNull();
  });
  it('synchronizes journal-only historical writing without fabricating completion counts, including explicit restore after deletion', async () => {
    const a = await signIn(),
      context = await completion(),
      orphan = version(context.id, { context });
    expect((await save(a.token, [orphan])).statusCode).toBe(200);
    expect(
      (await request(a.token, '/completion-restores')).json().attempts,
    ).toEqual([]);
    expect((await request(a.token, '/journal-sync')).json().versions).toEqual([
      orphan,
    ]);
    const next = version(context.id, {
      parents: [orphan.versionId],
      context: { ...context, instruction: 'Earlier wording' },
      reflection: {
        feeling: null,
        text: 'Edited historical writing',
        revision: 2,
      },
    });
    expect((await save(a.token, [next])).json().saved).toBe(1);
    expect(
      (
        await save(a.token, [
          version(context.id, {
            context: { ...context, activityDate: '2026-09-17' },
          }),
        ])
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await save(a.token, [
          version(context.id, {
            context: {
              ...context,
              venue: context.venue === 'park' ? 'gym' : 'park',
            },
          }),
        ])
      ).statusCode,
    ).toBe(409);
    const noContext = version(randomUUID());
    expect((await save(a.token, [noContext])).statusCode).toBe(400);
    const deleted = await request(a.token, '/data', 'DELETE', {
      expectedEpoch: 0,
    });
    expect(deleted.json().dataEpoch).toBe(1);
    expect((await save(a.token, [orphan], 1)).json().code).toBe('DATA_DELETED');
    expect(
      (
        await request(a.token, '/journal-sync', 'POST', {
          expectedEpoch: 0,
          restoreDeleted: true,
          versions: [orphan],
        })
      ).json().code,
    ).toBe('DATA_EPOCH_CHANGED');
    expect(
      (
        await request(a.token, '/journal-sync', 'POST', {
          expectedEpoch: 1,
          restoreDeleted: true,
          versions: [orphan],
        })
      ).json().saved,
    ).toBe(1);
    expect((await save(a.token, [next], 1)).json().saved).toBe(1);
    expect((await restore(a.token, [context], 1)).json().code).toBe(
      'DATA_DELETED',
    );
    expect(
      (await request(a.token, '/completion-restores')).json().attempts,
    ).toEqual([]);
    expect(
      (await request(a.token, '/journal-sync')).json().versions,
    ).toHaveLength(2);
  });
  it('keeps managed account deletion replayable under the original proof and prevents resurrection', async () => {
    const a = await signIn(),
      second = await signIn(a.subject.authUserId),
      entry = await completion();
    await restore(a.token, [entry]);
    await save(a.token, [version(entry.id)]);
    const [deleted, concurrent] = await Promise.all([
      request(a.token, '/account', 'DELETE', {
        confirmation: 'delete-account',
      }),
      request(a.token, '/account', 'DELETE', {
        confirmation: 'delete-account',
      }),
    ]);
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(concurrent.statusCode, concurrent.body).toBe(200);
    expect(concurrent.json()).toEqual(deleted.json());
    live.delete(a.subject.sessionId);
    expect(
      (
        await request(a.token, '/account', 'DELETE', {
          confirmation: 'delete-account',
        })
      ).json(),
    ).toEqual(deleted.json());
    expect((await request(second.token, '/journal-sync')).statusCode).toBe(401);
    const fresh = provider(a.subject.authUserId);
    expect(
      (
        await request(fresh.token, '/auth/session', 'POST', {
          deviceId: randomUUID(),
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await admin.query(
          'select version_id from justgo.journal_versions where user_id=$1',
          [a.session.userId],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it('persists pending Auth cleanup and retries the original proof before returning successful account deletion', async () => {
    const a = await signIn(),
      entry = await completion();
    await restore(a.token, [entry]);
    await save(a.token, [version(entry.id)]);
    failedAuthDeletes.add(a.subject.authUserId);
    const failed = await request(a.token, '/account', 'DELETE', {
      confirmation: 'delete-account',
    });
    expect(failed.statusCode).toBe(503);
    expect(failed.json().code).toBe('UNAVAILABLE');
    expect((await request(a.token, '/auth/session')).statusCode).toBe(401);
    expect(
      (
        await admin.query(
          'select completed_at from justgo.managed_auth_deletions where user_id=$1',
          [a.session.userId],
        )
      ).rows,
    ).toEqual([{ completed_at: null }]);
    expect(
      (
        await admin.query(
          'select version_id from justgo.journal_versions where user_id=$1',
          [a.session.userId],
        )
      ).rows,
    ).toEqual([]);
    const retried = await request(a.token, '/account', 'DELETE', {
      confirmation: 'delete-account',
    });
    expect(retried.statusCode, retried.body).toBe(200);
    expect(
      (
        await admin.query(
          'select completed_at is not null as done from justgo.managed_auth_deletions where user_id=$1',
          [a.session.userId],
        )
      ).rows,
    ).toEqual([{ done: true }]);
    const before = authDeleteCalls.filter(
      (id) => id === a.subject.authUserId,
    ).length;
    expect(
      (
        await request(a.token, '/account', 'DELETE', {
          confirmation: 'delete-account',
        })
      ).json(),
    ).toEqual(retried.json());
    expect(
      authDeleteCalls.filter((id) => id === a.subject.authUserId),
    ).toHaveLength(before);
  });
});
