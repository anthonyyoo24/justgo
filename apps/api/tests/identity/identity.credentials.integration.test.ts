import {
  db,
  admin,
  service,
  transfers,
  secret,
  proposal,
  request,
  account,
  transfer,
  start,
  post,
  remove,
} from './fixtures/identity.js';
import { randomUUID } from 'node:crypto';

import { expect, it } from 'vitest';

import { IdentityService, digest } from '../../src/identity/service.js';

it('soft revokes owned device and credential resources with bodyless DELETE', async () => {
  const owner = await account();
  const key = {
    id: randomUUID(),
    kind: 'key' as const,
    credential: secret(),
  };
  expect(
    (await post('/credentials', key, owner.input.sessionToken)).statusCode,
  ).toBe(200);
  expect(
    (await remove(`/credentials/${key.id}`, owner.input.sessionToken))
      .statusCode,
  ).toBe(200);
  expect(
    (await service.listCredentials(owner.input.sessionToken)).credentials.find(
      (item) => item.id === key.id,
    )?.revokedAt,
  ).not.toBeNull();
  const recovered = { ...proposal(), credential: owner.input.credential };
  await service.bootstrap(recovered, false);
  expect(
    (await remove(`/devices/${recovered.deviceId}`, owner.input.sessionToken))
      .statusCode,
  ).toBe(200);
  await expect(service.me(recovered.sessionToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  expect(
    (await service.listDevices(owner.input.sessionToken)).devices.find(
      (item) => item.id === recovered.deviceId,
    )?.revokedAt,
  ).not.toBeNull();
});

it('stores only a keyed verifier, replays the same digits and fails safely after a server key rotation', async () => {
  const t = await start({ ...transfer(), claimSecret: 'a'.repeat(64) });
  const records = await admin.query(
    'select verification from justgo.device_transfers where id=$1',
    [t.input.id],
  );
  expect(t.result.verification).toMatch(/^\d{6}$/);
  expect(records.rows[0].verification).toMatch(/^[a-f0-9]{64}$/);
  expect(records.rows[0].verification).not.toBe(t.result.verification);
  expect(records.rows[0].verification).not.toBe(digest(t.result.verification));
  expect(await service.startTransfer(t.input)).toEqual(t.result);
  const rotated = new IdentityService(db.db, {
    rateKey: 'a-different-isolated-test-server-key',
  });
  await expect(rotated.startTransfer(t.input)).rejects.toMatchObject({
    code: 'CREDENTIAL_REJECTED',
  });
  const fresh = transfer();
  // Same claimant with a different server key: storage alone cannot derive the code.
  fresh.claimSecret = t.input.claimSecret;
  const second = await rotated.startTransfer(fresh);
  transfers.add(fresh.id);
  expect(second.verification).not.toBe(t.result.verification);
});

it('does not bootstrap unknown recovery credentials or resurrect revoked/deleted ones', async () => {
  await expect(service.bootstrap(request(), false)).rejects.toMatchObject({
    code: 'CREDENTIAL_REJECTED',
  });
  const a = await account();
  const credential = (await service.listCredentials(a.input.sessionToken))
    .credentials[0]!;
  await service.revokeCredential(a.input.sessionToken, credential.id);
  await expect(
    service.bootstrap({ ...a.input, ...proposal() }),
  ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  expect((await service.me(a.input.sessionToken)).userId).toBe(
    a.session.userId,
  );
  const b = await account();
  await service.retireAccount(b.input.sessionToken);
  await expect(
    service.bootstrap({ ...b.input, ...proposal() }),
  ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  await expect(service.me(b.input.sessionToken)).rejects.toMatchObject({
    code: 'CREDENTIAL_REJECTED',
  });
});

it('enforces expiry, per-device revocation, and independent revocable recovery keys', async () => {
  const a = await account();
  const key = {
    id: randomUUID(),
    credential: secret(),
    kind: 'key' as const,
  };
  await service.addCredential(a.input.sessionToken, key);
  await service.addCredential(a.input.sessionToken, key);
  const recovered = { ...proposal(), credential: key.credential };
  await service.bootstrap(recovered, false);
  await service.revokeDevice(a.input.sessionToken, recovered.deviceId);
  await expect(service.me(recovered.sessionToken)).rejects.toMatchObject({
    code: 'SESSION_REVOKED',
  });
  await service.revokeCredential(a.input.sessionToken, key.id);
  await expect(
    service.bootstrap({ ...proposal(), credential: key.credential }, false),
  ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  await admin.query(
    "update justgo.device_sessions set expires_at=now()-interval '1 second' where id=$1",
    [a.session.sessionId],
  );
  await expect(service.me(a.input.sessionToken)).rejects.toMatchObject({
    code: 'SESSION_EXPIRED',
  });
  const fresh = { ...proposal(), credential: a.input.credential };
  expect((await service.bootstrap(fresh, false)).userId).toBe(a.session.userId);
});
