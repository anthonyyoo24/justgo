import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { accountDeletionResponseSchema } from '@justgo/contracts';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';
import { IdentityService, digest } from '../../src/identity/service.js';
import { buildApp } from '../../src/build-app.js';

const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '3' });
for (const url of [config.DATABASE_URL, process.env.MIGRATION_DATABASE_URL])
  if (
    !url ||
    !['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/justgo_test'
  )
    throw new Error('Only isolated local justgo_test is allowed');
const database = createDatabase(config);
const admin = new Pool(
  poolOptions(
    readConfig({
      ...process.env,
      DATABASE_URL: process.env.MIGRATION_DATABASE_URL!,
    }),
  ),
);
const identity = new IdentityService(database.db, {
  rateKey: `delete-tests-${randomUUID()}`,
});
const app = buildApp({
  identity,
  checkDatabase: async () => {},
  logger: false,
});
const owners: string[] = [];
const secret = () => randomBytes(32).toString('hex');
const proposal = () => ({
  deviceId: randomUUID(),
  sessionId: randomUUID(),
  sessionToken: secret(),
});
async function account() {
  const input = { ...proposal(), credential: secret() };
  const info = await identity.bootstrap(input);
  owners.push(info.userId);
  return { ...input, userId: info.userId };
}
function remove(
  token?: string,
  payload: object = { confirmation: 'delete-account' },
) {
  return app.inject({
    method: 'DELETE',
    url: '/v1/account',
    payload,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}
async function history(userId: string) {
  const id = randomUUID();
  await admin.query(
    `insert into justgo.attempts (user_id,id,venue_id,challenge_id,level_id,started_at,activity_date,legacy_display_time_zone,reflection_text,reflection_revision)
    select $1,$2,v.venue_id,c.id,c.level_id,now(),'2026-10-14','America/Toronto','Synthetic deletion fixture',1
    from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id limit 1`,
    [userId, id],
  );
  await admin.query(
    `insert into justgo.attempt_patch_receipts (user_id,id,attempt_id,input_digest,applied_revision) values ($1,$2,$3,$4,1)`,
    [userId, randomUUID(), id, 'a'.repeat(64)],
  );
}
afterAll(async () => {
  for (const id of owners) {
    for (const table of [
      'attempt_patch_receipts',
      'attempts',
      'device_transfers',
      'device_sessions',
      'recovery_credentials',
      'devices',
    ])
      await admin.query(`delete from justgo.${table} where user_id=$1`, [id]);
    await admin.query('delete from justgo.users where id=$1', [id]);
  }
  await app.close();
  await Promise.all([database.pool.end(), admin.end()]);
});
describe('permanent owner-only deletion on the restricted database role', () => {
  it('requires an active proof and exact confirmation, without accepting another owner', async () => {
    const a = await account(),
      b = await account();
    expect((await remove()).statusCode).toBe(401);
    expect(
      (
        await remove(a.sessionToken, {
          confirmation: 'delete-account',
          userId: b.userId,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await remove(a.sessionToken, { confirmation: 'yes' })).statusCode,
    ).toBe(400);
    await admin.query(
      'update justgo.device_sessions set expires_at=now() where id=$1',
      [a.sessionId],
    );
    expect((await remove(a.sessionToken)).json()).toMatchObject({
      code: 'SESSION_EXPIRED',
    });
    await admin.query(
      "update justgo.device_sessions set expires_at=now()+interval '1 day',revoked_at=now() where id=$1",
      [a.sessionId],
    );
    expect((await remove(a.sessionToken)).json()).toMatchObject({
      code: 'SESSION_REVOKED',
    });
    expect(
      (
        await admin.query('select deleted_at from justgo.users where id=$1', [
          a.userId,
        ])
      ).rows[0].deleted_at,
    ).toBeNull();
  });
  it('deletes activity and identity resources atomically, isolates owners and blocks all recovery/replay paths', async () => {
    const a = await account(),
      b = await account();
    await history(a.userId);
    await history(b.userId);
    const key = secret();
    await identity.addCredential(a.sessionToken, {
      id: randomUUID(),
      credential: key,
      kind: 'key',
    });
    const second = { ...proposal(), credential: a.credential };
    await identity.bootstrap(second, false);
    const transfer = {
      ...proposal(),
      credential: secret(),
      id: randomUUID(),
      code: randomBytes(8).toString('hex').toUpperCase(),
      claimSecret: secret(),
    };
    const started = await identity.startTransfer(transfer);
    await identity.approveTransfer(
      a.sessionToken,
      transfer.code,
      started.verification,
    );
    const result = await remove(a.sessionToken);
    expect(result.statusCode).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    const receipt = accountDeletionResponseSchema.parse(result.json());
    expect(receipt.userId).toBe(a.userId);
    expect(receipt.credentialDigests).toEqual(
      expect.arrayContaining([
        digest(a.credential),
        digest(key),
        digest(transfer.credential),
      ]),
    );
    for (const table of [
      'attempt_patch_receipts',
      'attempts',
      'device_transfers',
      'device_sessions',
      'devices',
    ])
      expect(
        (
          await admin.query(
            `select count(*)::int as n from justgo.${table} where user_id=$1`,
            [a.userId],
          )
        ).rows[0].n,
      ).toBe(0);
    expect(
      (
        await admin.query(
          'select count(*)::int as n from justgo.attempts where user_id=$1',
          [b.userId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect((await remove(a.sessionToken)).json()).toEqual(receipt);
    expect((await remove(second.sessionToken)).statusCode).toBe(401);
    await expect(identity.me(a.sessionToken)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    for (const credential of [a.credential, key, transfer.credential]) {
      await expect(
        identity.bootstrap({ ...proposal(), credential }),
      ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
      await expect(
        identity.bootstrap({ ...proposal(), credential }, false),
      ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
    }
    await expect(
      identity.redeemTransfer(transfer.code, transfer.claimSecret),
    ).rejects.toBeDefined();
    expect((await identity.me(b.sessionToken)).userId).toBe(b.userId);
    expect(result.body).not.toContain(a.sessionToken);
    expect(result.body).not.toContain(a.credential);
  });
  it('rolls back deletion and revocation together on a failed transaction', async () => {
    const a = await account();
    await history(a.userId);
    const original = identity.withAccountDeletion.bind(identity);
    const spy = vi
      .spyOn(identity, 'withAccountDeletion')
      .mockImplementationOnce((token, work) =>
        original(token, async (tx, userId, deletedAt) => {
          await work(tx, userId, deletedAt);
          throw new Error('Synthetic transaction failure');
        }),
      );
    try {
      expect((await remove(a.sessionToken)).statusCode).toBe(503);
    } finally {
      spy.mockRestore();
    }
    expect((await identity.me(a.sessionToken)).userId).toBe(a.userId);
    expect(
      (
        await admin.query(
          'select count(*)::int as n from justgo.attempts where user_id=$1',
          [a.userId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect((await remove(a.sessionToken)).statusCode).toBe(200);
  });
  it('serializes duplicate deletions and fences simultaneous writes and account recovery', async () => {
    const a = await account();
    const results = await Promise.all([
      remove(a.sessionToken),
      remove(a.sessionToken),
    ]);
    expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
    expect(results[0]!.json()).toEqual(results[1]!.json());
    const b = await account();
    const recovery = identity.bootstrap(
      { ...proposal(), credential: b.credential },
      false,
    );
    const deletion = remove(b.sessionToken);
    await Promise.allSettled([recovery]);
    expect((await deletion).statusCode).toBe(200);
    expect(
      (
        await admin.query(
          'select count(*)::int as n from justgo.device_sessions where user_id=$1',
          [b.userId],
        )
      ).rows[0].n,
    ).toBe(0);
    await expect(
      identity.bootstrap({ ...proposal(), credential: b.credential }, false),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  });
});
