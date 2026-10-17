import {
  db,
  admin,
  service,
  app,
  users,
  secret,
  proposal,
  request,
  account,
  start,
  nextAddress,
  post,
  remove,
} from './fixtures/identity.js';
import { randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { bootstrapSchema } from '@justgo/contracts';

import { IdentityService, digest } from '../../src/identity/service.js';

it('allocates fixture ownership only for newly created accounts, not recovery or rejected proofs', async () => {
  const existing = await account();
  const allocated: string[] = [];
  const tracked = new IdentityService(db.db, {
    rateKey: 'isolated-allocation-regression',
    newUserId: () => {
      const id = randomUUID();
      allocated.push(id);
      return id;
    },
  });
  const owned = await tracked.bootstrap(request());
  users.add(owned.userId);
  expect(allocated).toEqual([owned.userId]);
  const recovered = await tracked.bootstrap(existing.input);
  expect(recovered.userId).toBe(existing.session.userId);
  await expect(
    tracked.bootstrap({ ...existing.input, sessionToken: secret() }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(allocated).toEqual([owned.userId]);
});

it('creates, recovers and renews through the discriminated session resource with stable replay', async () => {
  const input = request();
  const created = await post('/sessions', { kind: 'bootstrap', ...input });
  expect(created.statusCode).toBe(200);
  const original = created.json<{
    userId: string;
    deviceId: string;
    sessionId: string;
  }>();
  users.add(original.userId);
  expect(
    (await post('/sessions', { kind: 'bootstrap', ...input })).json(),
  ).toEqual(original);
  const current = await app.inject({
    url: '/v1/sessions/current',
    headers: { authorization: `Bearer ${input.sessionToken}` },
  });
  expect(current.json()).toEqual(original);
  expect(
    (await post('/sessions', { kind: 'recovery', ...request() })).json().code,
  ).toBe('CREDENTIAL_REJECTED');
  const recovery = { ...proposal(), credential: input.credential };
  const recovered = await post('/sessions', {
    kind: 'recovery',
    ...recovery,
  });
  expect(recovered.statusCode).toBe(200);
  expect(recovered.json().userId).toBe(original.userId);
  const next = {
    kind: 'renewal',
    sessionId: randomUUID(),
    sessionToken: secret(),
  };
  expect((await post('/sessions', next)).statusCode).toBe(401);
  const renewed = await post('/sessions', next, recovery.sessionToken);
  expect(renewed.statusCode).toBe(200);
  expect(renewed.json()).toMatchObject({
    userId: original.userId,
    deviceId: recovery.deviceId,
    sessionId: next.sessionId,
  });
  expect((await post('/sessions', next, recovery.sessionToken)).json()).toEqual(
    renewed.json(),
  );
  expect(
    (
      await app.inject({
        url: '/v1/sessions/current',
        headers: { authorization: `Bearer ${recovery.sessionToken}` },
      })
    ).json().code,
  ).toBe('SESSION_REVOKED');
});

it('lets the receiver cancel before approval without changing its current account', async () => {
  const current = await account(),
    t = await start();
  const cancel = () =>
    app.inject({
      method: 'DELETE',
      url: `/v1/transfers/${t.input.id}`,
      payload: t.input,
      remoteAddress: nextAddress(2),
    });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await cancel();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'cancelled' });
  }
  expect((await service.me(current.input.sessionToken)).userId).toBe(
    current.session.userId,
  );
  await expect(service.startTransfer(t.input)).rejects.toMatchObject({
    code: 'CREDENTIAL_REJECTED',
  });
  await expect(
    service.inspectTransfer(current.input.sessionToken, t.input.code),
  ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  await expect(
    service.approveTransfer(
      current.input.sessionToken,
      t.input.code,
      t.result.verification,
    ),
  ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  await expect(
    service.redeemTransfer(t.input.code, t.input.claimSecret),
  ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
});

it('requires the complete exact receiver proposal and validates the resource id', async () => {
  const t = await start();
  for (const field of [
    'claimSecret',
    'sessionToken',
    'credential',
    'id',
    'deviceId',
    'sessionId',
  ] as const) {
    await expect(
      service.cancelReceivingTransfer({
        ...t.input,
        [field]:
          field.endsWith('Id') || field === 'id' ? randomUUID() : secret(),
      }),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  }
  const invalid = await app.inject({
    method: 'DELETE',
    url: `/v1/transfers/${randomUUID()}`,
    payload: t.input,
    remoteAddress: nextAddress(2),
  });
  expect(invalid.statusCode).toBe(400);
  expect(
    (
      await app.inject({
        method: 'DELETE',
        url: `/v1/transfers/${t.input.id}`,
        payload: { code: t.input.code },
        remoteAddress: nextAddress(2),
      })
    ).statusCode,
  ).toBe(401);
  expect((await service.startTransfer(t.input)).status).toBe('waiting');
});

it('commits and bounds failed verification attempts across accounts and concurrent requests', async () => {
  const a = await account(),
    b = await account(),
    t = await start();
  const wrong = t.result.verification === '000000' ? '000001' : '000000';
  const results = await Promise.allSettled(
    Array.from({ length: 7 }, (_, i) =>
      service.approveTransfer(
        i % 2 ? a.input.sessionToken : b.input.sessionToken,
        t.input.code,
        wrong,
      ),
    ),
  );
  expect(results.every((result) => result.status === 'rejected')).toBe(true);
  const record = await admin.query(
    'select verification_attempts, cancelled_at, user_id from justgo.device_transfers where id=$1',
    [t.input.id],
  );
  expect(record.rows[0].verification_attempts).toBe(5);
  expect(record.rows[0].cancelled_at).toBeInstanceOf(Date);
  expect(record.rows[0].user_id).toBeNull();
  await expect(
    service.approveTransfer(
      a.input.sessionToken,
      t.input.code,
      t.result.verification,
    ),
  ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  await expect(
    service.redeemTransfer(t.input.code, t.input.claimSecret),
  ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
});

it('stores hashes only and recovers exactly one account/session after lost and concurrent bootstrap responses', async () => {
  const input = request();
  const results = await Promise.all([
    service.bootstrap(input),
    service.bootstrap(input),
    service.bootstrap(input),
  ]);
  users.add(results[0]!.userId);
  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
  const records = await admin.query(
    'select digest from justgo.recovery_credentials where user_id=$1',
    [results[0]!.userId],
  );
  expect(records.rows).toEqual([{ digest: digest(input.credential) }]);
  const sessions = await admin.query(
    'select digest from justgo.device_sessions where user_id=$1',
    [results[0]!.userId],
  );
  expect(sessions.rows).toEqual([{ digest: digest(input.sessionToken) }]);
});

it('rejects changed-input reuse, forged ownership fields, weak tokens and invalid auth', async () => {
  const a = await account();
  await expect(
    service.bootstrap({ ...a.input, sessionToken: secret() }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(
    (
      await post('/sessions', {
        kind: 'bootstrap',
        ...request(),
        userId: a.session.userId,
      })
    ).statusCode,
  ).toBe(400);
  expect(
    (
      await post('/sessions', {
        kind: 'bootstrap',
        ...request(),
        credential: 'password',
      })
    ).statusCode,
  ).toBe(400);
  expect((await app.inject('/v1/sessions/current')).statusCode).toBe(401);
  expect(
    bootstrapSchema.safeParse({ ...a.input, sessionToken: 'x'.repeat(64) })
      .success,
  ).toBe(false);
});

it('isolates users at both API and RLS levels, including pooled transaction cleanup', async () => {
  const a = await account(),
    b = await account();
  const cred = (await service.listCredentials(b.input.sessionToken))
    .credentials[0]!;
  expect(
    (await remove(`/credentials/${cred.id}`, a.input.sessionToken)).statusCode,
  ).toBe(404);
  expect(
    (await remove(`/devices/${b.input.deviceId}`, a.input.sessionToken))
      .statusCode,
  ).toBe(404);
  const pairs = await Promise.all([
    service.listDevices(a.input.sessionToken),
    service.listDevices(b.input.sessionToken),
  ]);
  expect(pairs[0].devices.map((d) => d.id)).toEqual([a.input.deviceId]);
  expect(pairs[1].devices.map((d) => d.id)).toEqual([b.input.deviceId]);
  for (const table of [
    'users',
    'devices',
    'recovery_credentials',
    'device_sessions',
    'device_transfers',
    'identity_rate_buckets',
  ])
    expect(
      (await db.pool.query(`select * from justgo.${table}`)).rows,
    ).toHaveLength(0);
  expect(
    (await db.pool.query('select justgo.current_user_id() as owner')).rows[0]
      .owner,
  ).toBeNull();
  await expect(
    db.pool.query('delete from justgo.recovery_credentials'),
  ).rejects.toThrow();
});
