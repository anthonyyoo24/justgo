import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import {
  CURRENT_ACCEPTANCE_VERSIONS,
  accountAcceptanceResponseSchema,
  exportPageSchema,
} from '@justgo/contracts';
import { AcceptanceService } from '../../src/acceptance/service.js';
import { readAcceptance } from '../../src/acceptance/model.js';
import { IdentityService } from '../../src/identity/service.js';
import { withOwner } from '../../src/db/client.js';
import {
  account,
  admin,
  app,
  db,
  nextAddress,
  post,
  proposal,
  remove,
  request,
  secret,
  service,
  users,
} from '../identity/fixtures/identity.js';

const acceptance = new AcceptanceService(service);
const get = (token?: string) =>
  app.inject({
    method: 'GET',
    url: '/v1/account/acceptance',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
const put = (token?: string, payload: object = CURRENT_ACCEPTANCE_VERSIONS) =>
  app.inject({
    method: 'PUT',
    url: '/v1/account/acceptance',
    payload,
    remoteAddress: nextAddress(),
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe('account-owned Terms and Privacy acceptance', () => {
  it('atomically records new-account acceptance, preserves it on bootstrap/recovery retry, and rolls back a failed creation', async () => {
    const input = { ...request(), acceptance: CURRENT_ACCEPTANCE_VERSIONS };
    const created = await post('/sessions', { kind: 'bootstrap', ...input });
    expect(created.statusCode).toBe(200);
    const userId = (created.json() as { userId: string }).userId;
    users.add(userId);
    const state = accountAcceptanceResponseSchema.parse(
      (await get(input.sessionToken)).json(),
    );
    expect(state).toMatchObject({
      userId,
      analyticsRestricted: false,
      receipt: { userId, ...CURRENT_ACCEPTANCE_VERSIONS },
    });
    expect(state.receipt?.acceptedAt).toEqual(expect.any(String));
    expect(
      (await post('/sessions', { kind: 'bootstrap', ...input })).json(),
    ).toEqual(created.json());
    expect((await get(input.sessionToken)).json()).toEqual(state);
    const recovered = { ...proposal(), credential: input.credential };
    expect(
      (await post('/sessions', { kind: 'recovery', ...recovered })).statusCode,
    ).toBe(200);
    expect((await get(recovered.sessionToken)).json()).toEqual(state);

    const failedOwner = randomUUID();
    users.add(failedOwner);
    const isolated = new IdentityService(db.db, {
      rateKey: 'acceptance-rollback',
      newUserId: () => failedOwner,
    });
    await expect(
      isolated.bootstrap({
        ...request(),
        sessionToken: input.sessionToken,
        acceptance: CURRENT_ACCEPTANCE_VERSIONS,
      }),
    ).rejects.toThrow();
    expect(
      (
        await admin.query('select id from justgo.users where id=$1', [
          failedOwner,
        ])
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await admin.query(
          'select user_id from justgo.account_acceptances where user_id=$1',
          [failedOwner],
        )
      ).rowCount,
    ).toBe(0);
  });

  it('prompts legacy accounts and does not accept on recovery, even when bootstrap encounters an existing credential', async () => {
    const a = await account();
    const empty = {
      userId: a.session.userId,
      receipt: null,
      analyticsRestricted: false,
    };
    expect((await get(a.input.sessionToken)).json()).toEqual(empty);
    const recovered = { ...proposal(), credential: a.input.credential };
    expect(
      (
        await post('/sessions', {
          kind: 'bootstrap',
          ...recovered,
          acceptance: CURRENT_ACCEPTANCE_VERSIONS,
        })
      ).statusCode,
    ).toBe(200);
    expect((await get(recovered.sessionToken)).json()).toEqual(empty);
    expect(
      (
        await post('/sessions', {
          kind: 'recovery',
          ...recovered,
          acceptance: CURRENT_ACCEPTANCE_VERSIONS,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      await acceptance.isEligibleForAnalytics({
        userId: a.session.userId,
        occurredAt: new Date().toISOString(),
      }),
    ).toBe(false);
  });

  it('uses server time and ownership, returns identical receipts for lost acknowledgements/concurrent retries, and replaces stale versions', async () => {
    const a = await account(),
      b = await account();
    const first = await put(a.input.sessionToken);
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    const receipt = accountAcceptanceResponseSchema.parse(first.json());
    const retries = await Promise.all([
      put(a.input.sessionToken),
      put(a.input.sessionToken),
    ]);
    for (const retry of retries) expect(retry.json()).toEqual(receipt);
    expect((await get(b.input.sessionToken)).json().receipt).toBeNull();
    expect(
      (
        await put(a.input.sessionToken, {
          ...CURRENT_ACCEPTANCE_VERSIONS,
          userId: b.session.userId,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await put(a.input.sessionToken, {
          ...CURRENT_ACCEPTANCE_VERSIONS,
          acceptedAt: '2026-01-01T00:00:00Z',
        })
      ).statusCode,
    ).toBe(400);
    for (const field of Object.keys(CURRENT_ACCEPTANCE_VERSIONS))
      expect(
        (
          await put(a.input.sessionToken, {
            ...CURRENT_ACCEPTANCE_VERSIONS,
            [field]: 'stale',
          })
        ).statusCode,
      ).toBe(400);
    await admin.query(
      "update justgo.account_acceptances set terms_version='previous',accepted_at='2026-01-01T00:00:00Z' where user_id=$1",
      [a.session.userId],
    );
    expect(
      await acceptance.isEligibleForAnalytics({
        userId: a.session.userId,
        occurredAt: new Date().toISOString(),
      }),
    ).toBe(false);
    const renewed = accountAcceptanceResponseSchema.parse(
      (await put(a.input.sessionToken)).json(),
    );
    expect(renewed.receipt?.termsVersion).toBe(
      CURRENT_ACCEPTANCE_VERSIONS.termsVersion,
    );
    expect(renewed.receipt?.acceptedAt).not.toBe('2026-01-01T00:00:00.000Z');
    expect(
      exportPageSchema.parse(
        (
          await app.inject({
            url: '/v1/account/export',
            headers: { authorization: `Bearer ${a.input.sessionToken}` },
          })
        ).json(),
      ).account.acceptance,
    ).toEqual(renewed.receipt);
  });

  it('fails closed for missing/expired/revoked proofs, unknown owners and uncertain storage without changing a receipt', async () => {
    expect((await get()).statusCode).toBe(401);
    expect((await put()).statusCode).toBe(401);
    expect((await put(secret())).statusCode).toBe(401);
    const a = await account();
    const original = service.withSession.bind(service);
    const rollback = vi
      .spyOn(service, 'withSession')
      .mockImplementationOnce((token, work) =>
        original(token, async (tx, session) => {
          await work(tx, session);
          throw new Error('Synthetic acceptance failure');
        }),
      );
    try {
      expect((await put(a.input.sessionToken)).statusCode).toBe(503);
    } finally {
      rollback.mockRestore();
    }
    expect((await get(a.input.sessionToken)).json().receipt).toBeNull();
    expect((await put(a.input.sessionToken)).statusCode).toBe(200);
    await admin.query(
      "update justgo.device_sessions set expires_at=now()-interval '1 hour' where id=$1",
      [a.input.sessionId],
    );
    expect((await get(a.input.sessionToken)).json().code).toBe(
      'SESSION_EXPIRED',
    );
    expect((await put(a.input.sessionToken)).json().code).toBe(
      'SESSION_EXPIRED',
    );
    await admin.query(
      'update justgo.device_sessions set revoked_at=now() where id=$1',
      [a.input.sessionId],
    );
    expect((await put(a.input.sessionToken)).json().code).toBe(
      'SESSION_REVOKED',
    );
    expect(
      await acceptance.isEligibleForAnalytics({
        userId: randomUUID(),
        occurredAt: new Date().toISOString(),
      }),
    ).toBe(false);
    const absentOwner = randomUUID();
    await expect(
      withOwner(db.db, absentOwner, (tx) => readAcceptance(tx, absentOwner)),
    ).rejects.toThrow('Account acceptance unavailable');
    const unavailable = vi
      .spyOn(db.db, 'transaction')
      .mockRejectedValueOnce(new Error('Synthetic unavailable database'));
    try {
      expect(
        await acceptance.isEligibleForAnalytics({
          userId: a.session.userId,
          occurredAt: new Date().toISOString(),
        }),
      ).toBe(false);
    } finally {
      unavailable.mockRestore();
    }
  });

  it('enforces database ownership for reads, writes and deletes, including an empty owner context', async () => {
    const a = await account(),
      b = await account();
    await put(a.input.sessionToken);
    expect(
      (await db.pool.query('select user_id from justgo.account_acceptances'))
        .rows,
    ).toEqual([]);
    expect(
      (
        await withOwner(db.db, b.session.userId, (tx) =>
          tx.execute(
            sql`select user_id from justgo.account_acceptances where user_id=${a.session.userId}`,
          ),
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await withOwner(db.db, b.session.userId, (tx) =>
          tx.execute(
            sql`delete from justgo.account_acceptances where user_id=${a.session.userId} returning user_id`,
          ),
        )
      ).rows,
    ).toEqual([]);
    await expect(
      withOwner(db.db, b.session.userId, (tx) =>
        tx.execute(
          sql`insert into justgo.account_acceptances (user_id,terms_version,privacy_version,analytics_scope_version) values (${a.session.userId},'forged','forged','forged')`,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      withOwner(db.db, a.session.userId, (tx) =>
        tx.execute(
          sql`update justgo.account_acceptances set user_id=${b.session.userId} where user_id=${a.session.userId}`,
        ),
      ),
    ).rejects.toThrow();
    expect((await get(a.input.sessionToken)).json().receipt.userId).toBe(
      a.session.userId,
    );
  });

  it('checks each delivery against time, current versions, durable privacy restrictions and deletion without gating product resources', async () => {
    const a = await account(),
      b = await account();
    const state = accountAcceptanceResponseSchema.parse(
      (await put(a.input.sessionToken)).json(),
    );
    const event = {
      userId: a.session.userId,
      occurredAt: state.receipt!.acceptedAt,
    };
    expect(await acceptance.isEligibleForAnalytics(event)).toBe(true);
    expect(
      await acceptance.isEligibleForAnalytics({
        ...event,
        occurredAt: '2026-01-01T00:00:00Z',
      }),
    ).toBe(false);
    expect(
      await acceptance.isEligibleForAnalytics({
        ...event,
        userId: b.session.userId,
      }),
    ).toBe(false);
    const restricted = await acceptance.restrictAnalytics(a.input.sessionToken);
    expect(restricted).toEqual({ ...state, analyticsRestricted: true });
    expect(await acceptance.isEligibleForAnalytics(event)).toBe(false);
    expect((await put(a.input.sessionToken)).json()).toEqual(restricted);
    const exported = exportPageSchema.parse(
      (
        await app.inject({
          url: '/v1/account/export',
          headers: { authorization: `Bearer ${a.input.sessionToken}` },
        })
      ).json(),
    );
    expect(exported.account.analyticsRestricted).toBe(true);
    expect(exported.account.acceptance).toEqual(state.receipt);
    expect((await service.me(a.input.sessionToken)).userId).toBe(
      a.session.userId,
    );
    expect(
      (
        await remove('/account', a.input.sessionToken, {
          confirmation: 'delete-account',
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await admin.query(
          'select user_id from justgo.account_acceptances where user_id=$1',
          [a.session.userId],
        )
      ).rowCount,
    ).toBe(0);
    expect(await acceptance.isEligibleForAnalytics(event)).toBe(false);
    expect((await get(a.input.sessionToken)).statusCode).toBe(401);
    expect((await put(a.input.sessionToken)).statusCode).toBe(401);
  });
});
