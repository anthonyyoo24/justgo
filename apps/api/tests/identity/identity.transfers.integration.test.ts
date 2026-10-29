import { apiRequest } from '../request.js';
import {
  admin,
  service,
  app,
  transfers,
  retryAfterSeconds,
  secret,
  account,
  transfer,
  start,
  post,
  remove,
} from './fixtures/identity.js';
import { randomBytes, randomUUID } from 'node:crypto';

import { readFile } from 'node:fs/promises';

import { expect, it } from 'vitest';

it('keeps transfer claimant proof in the session body and validates cancellation resource ownership', async () => {
  const owner = await account(),
    other = await account();
  const input = transfer();
  const created = await post('/transfers', input);
  expect(created.statusCode).toBe(200);
  transfers.add(input.id);
  const proof = {
    kind: 'transfer',
    code: input.code,
    claimSecret: input.claimSecret,
  };
  expect((await post('/sessions', proof)).json().code).toBe('TRANSFER_PENDING');
  expect(
    (
      await post(
        '/transfer-approvals',
        { code: input.code, verification: created.json().verification },
        owner.input.sessionToken,
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await remove(`/transfers/${randomUUID()}`, owner.input.sessionToken, {
        code: input.code,
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (
      await remove(`/transfers/${input.id}`, other.input.sessionToken, {
        code: input.code,
      })
    ).statusCode,
  ).toBe(404);
  expect(
    (await post('/sessions', { ...proof, claimSecret: secret() })).json().code,
  ).toBe('CREDENTIAL_REJECTED');
  const redeemed = await post('/sessions', proof);
  expect(redeemed.statusCode).toBe(200);
  expect(redeemed.json().userId).toBe(owner.session.userId);
  expect((await post('/sessions', proof)).json()).toEqual(redeemed.json());
  expect(
    (
      await remove(`/transfers/${input.id}`, owner.input.sessionToken, {
        code: input.code,
      })
    ).statusCode,
  ).toBe(404);
  const cancellable = await start();
  await service.approveTransfer(
    owner.input.sessionToken,
    cancellable.input.code,
    cancellable.result.verification,
  );
  expect(
    (
      await remove(
        `/transfers/${cancellable.input.id}`,
        owner.input.sessionToken,
        { code: cancellable.input.code },
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await post('/sessions', {
        kind: 'transfer',
        code: cancellable.input.code,
        claimSecret: cancellable.input.claimSecret,
      })
    ).json().code,
  ).toBe('CREDENTIAL_REJECTED');
});

it('records cancellation before creation so a delayed start cannot revive the code', async () => {
  const input = transfer();
  transfers.add(input.id);
  expect(await service.cancelReceivingTransfer(input)).toEqual({
    status: 'cancelled',
  });
  await expect(service.startTransfer(input)).rejects.toMatchObject({
    code: 'CREDENTIAL_REJECTED',
  });
  const fresh = transfer();
  transfers.add(fresh.id);
  const results = await Promise.allSettled([
    service.startTransfer(fresh),
    service.cancelReceivingTransfer(fresh),
  ]);
  expect(results[1]).toMatchObject({
    status: 'fulfilled',
    value: { status: 'cancelled' },
  });
  await expect(service.startTransfer(fresh)).rejects.toMatchObject({
    code: 'CREDENTIAL_REJECTED',
  });
});

it('serializes cancellation with approval and redemption, retaining only an already completed transfer', async () => {
  const owner = await account();
  const approving = await start();
  await Promise.allSettled([
    service.approveTransfer(
      owner.input.sessionToken,
      approving.input.code,
      approving.result.verification,
    ),
    service.cancelReceivingTransfer(approving.input),
  ]);
  await expect(
    service.redeemTransfer(approving.input.code, approving.input.claimSecret),
  ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  const t = await start();
  await service.approveTransfer(
    owner.input.sessionToken,
    t.input.code,
    t.result.verification,
  );
  const [claim, cancel] = await Promise.allSettled([
    service.redeemTransfer(t.input.code, t.input.claimSecret),
    service.cancelReceivingTransfer(t.input),
  ]);
  expect(cancel.status).toBe('fulfilled');
  const outcome = cancel.status === 'fulfilled' ? cancel.value.status : null;
  if (outcome === 'redeemed') {
    expect(claim).toMatchObject({
      status: 'fulfilled',
      value: { userId: owner.session.userId, sessionId: t.input.sessionId },
    });
    expect(
      await service.redeemTransfer(t.input.code, t.input.claimSecret),
    ).toEqual(claim.status === 'fulfilled' ? claim.value : null);
  } else {
    expect(claim).toMatchObject({
      status: 'rejected',
      reason: { code: 'CREDENTIAL_REJECTED' },
    });
  }
  const count = await admin.query(
    'select count(*)::int as count from justgo.device_sessions where id=$1',
    [t.input.sessionId],
  );
  expect(count.rows[0].count).toBe(outcome === 'redeemed' ? 1 : 0);
  const completed = await start();
  await service.approveTransfer(
    owner.input.sessionToken,
    completed.input.code,
    completed.result.verification,
  );
  const issued = await service.redeemTransfer(
    completed.input.code,
    completed.input.claimSecret,
  );
  expect(await service.cancelReceivingTransfer(completed.input)).toEqual({
    status: 'redeemed',
  });
  expect(
    await service.redeemTransfer(
      completed.input.code,
      completed.input.claimSecret,
    ),
  ).toEqual(issued);
  await admin.query(
    "update justgo.device_transfers set expires_at=now()-interval '1 second' where id=$1",
    [completed.input.id],
  );
  expect(await service.cancelReceivingTransfer(completed.input)).toEqual({
    status: 'redeemed',
  });
  expect(await service.me(completed.input.sessionToken)).toEqual(issued);
});

it('erases legacy approval values and cancels old transfers when the forward migration runs', async () => {
  const client = await admin.connect();
  const table = `migration_fixture_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query('begin');
    await client.query(
      `create table justgo.${table} (verification text not null, cancelled_at timestamptz)`,
    );
    await client.query(
      `insert into justgo.${table} values ('012345', null), ('999999', now()-interval '1 day')`,
    );
    const migration = await readFile(
      new URL('../../drizzle/0003_transfer_verification.sql', import.meta.url),
      'utf8',
    );
    await client.query(
      migration.replaceAll('"justgo"."device_transfers"', `justgo.${table}`),
    );
    const result = await client.query(
      `select verification, cancelled_at, verification_attempts from justgo.${table}`,
    );
    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.verification).toBe('0'.repeat(64));
      expect(row.cancelled_at).toBeInstanceOf(Date);
      expect(row.verification_attempts).toBe(0);
    }
    await expect(
      client.query(
        `insert into justgo.${table} (verification) values ('123456')`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  } finally {
    await client.query('rollback');
    client.release();
  }
});

it('keeps verification out of inspection and prevents binding with the transfer code alone', async () => {
  const owner = await account(),
    attacker = await account(),
    t = await start();
  const inspection = await post(
    '/transfer-inspections',
    { code: t.input.code },
    attacker.input.sessionToken,
  );
  expect(inspection.statusCode).toBe(200);
  expect(inspection.json()).toEqual({
    id: t.input.id,
    expiresAt: t.result.expiresAt,
    status: 'waiting',
  });
  const missingProof = await post(
    '/transfer-approvals',
    { code: t.input.code },
    attacker.input.sessionToken,
  );
  expect(missingProof.statusCode).toBe(400);
  const wrong = t.result.verification === '000000' ? '000001' : '000000';
  const rejected = await post(
    '/transfer-approvals',
    { code: t.input.code, verification: wrong },
    attacker.input.sessionToken,
  );
  expect(rejected.statusCode).toBe(409);
  const pending = await admin.query(
    'select user_id, verification_attempts from justgo.device_transfers where id=$1',
    [t.input.id],
  );
  expect(pending.rows[0]).toEqual({
    user_id: null,
    verification_attempts: 1,
  });
  const approved = await post(
    '/transfer-approvals',
    { code: t.input.code, verification: t.result.verification },
    owner.input.sessionToken,
  );
  expect(approved.statusCode).toBe(200);
  const redeemed = await service.redeemTransfer(
    t.input.code,
    t.input.claimSecret,
  );
  expect(redeemed.userId).toBe(owner.session.userId);
  expect(redeemed.userId).not.toBe(attacker.session.userId);
});

it('requires existing-device approval, claimant proof and matching verification; redemption retries are one-use', async () => {
  const a = await account(),
    t = await start();
  expect(await service.startTransfer(t.input)).toEqual(t.result);
  await expect(
    service.redeemTransfer(t.input.code, t.input.claimSecret),
  ).rejects.toMatchObject({ code: 'TRANSFER_PENDING' });
  await expect(
    service.approveTransfer(a.input.sessionToken, t.input.code, 'xxxxxx'),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await service.approveTransfer(
    a.input.sessionToken,
    t.input.code,
    t.result.verification,
  );
  await expect(
    service.redeemTransfer(t.input.code, secret()),
  ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  const results = await Promise.all([
    service.redeemTransfer(t.input.code, t.input.claimSecret),
    service.redeemTransfer(t.input.code, t.input.claimSecret),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0]!.userId).toBe(a.session.userId);
  expect((await service.me(t.input.sessionToken)).userId).toBe(
    a.session.userId,
  );
  await expect(
    service.startTransfer({ ...t.input, sessionToken: secret() }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await expect(
    service.approveTransfer(
      a.input.sessionToken,
      t.input.code,
      t.result.verification,
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
});

it('rejects expired/cancelled transfers and cross-account approval', async () => {
  const a = await account(),
    b = await account(),
    t = await start();
  await service.approveTransfer(
    a.input.sessionToken,
    t.input.code,
    t.result.verification,
  );
  await expect(
    service.approveTransfer(
      b.input.sessionToken,
      t.input.code,
      t.result.verification,
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  await service.cancelTransfer(a.input.sessionToken, t.input.id, t.input.code);
  await expect(
    service.redeemTransfer(t.input.code, t.input.claimSecret),
  ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  const expired = await start();
  await admin.query(
    "update justgo.device_transfers set expires_at=now()-interval '1 second' where id=$1",
    [expired.input.id],
  );
  await expect(
    service.inspectTransfer(a.input.sessionToken, expired.input.code),
  ).rejects.toMatchObject({ code: 'TRANSFER_EXPIRED' });
});

it('shares the sensitive budget with transfer cancellation and leaves blocked transfers unchanged', async () => {
  const owner = await account(),
    other = await account(),
    t = await start(),
    ip = `test-${randomUUID()}`;
  await service.approveTransfer(
    owner.input.sessionToken,
    t.input.code,
    t.result.verification,
  );
  for (const attempt of [
    { id: randomUUID(), code: t.input.code, token: owner.input.sessionToken },
    {
      id: t.input.id,
      code: randomBytes(8).toString('hex').toUpperCase(),
      token: owner.input.sessionToken,
    },
    { id: t.input.id, code: t.input.code, token: other.input.sessionToken },
  ]) {
    const rejected = await remove(
      `/transfers/${attempt.id}`,
      attempt.token,
      { code: attempt.code },
      ip,
    );
    expect(rejected.statusCode).toBe(404);
    expect(rejected.json().code).toBe('NOT_FOUND');
  }
  const limited = await remove(
    `/transfers/${t.input.id}`,
    owner.input.sessionToken,
    { code: t.input.code },
    ip,
  );
  expect(limited.statusCode).toBe(429);
  expect(limited.json().code).toBe('RATE_LIMITED');
  retryAfterSeconds(limited.headers['retry-after']);
  const inspection = await post(
    '/transfer-inspections',
    { code: t.input.code },
    owner.input.sessionToken,
    ip,
  );
  expect(inspection.statusCode).toBe(429);
  const session = await apiRequest(app, {
    url: '/v1/sessions/current',
    remoteAddress: ip,
    headers: { authorization: `Bearer ${owner.input.sessionToken}` },
  });
  expect(session.statusCode).toBe(200);
  expect(
    await service.inspectTransfer(owner.input.sessionToken, t.input.code),
  ).toMatchObject({ id: t.input.id });
  const cancelled = await remove(
    `/transfers/${t.input.id}`,
    owner.input.sessionToken,
    { code: t.input.code },
  );
  expect(cancelled.statusCode).toBe(200);
  await expect(
    service.inspectTransfer(owner.input.sessionToken, t.input.code),
  ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
});
