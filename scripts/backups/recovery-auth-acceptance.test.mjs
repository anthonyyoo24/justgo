import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  existingAppleOwner,
  recoveryAuthAcceptance,
  unexpiredLocalToken,
} from './recovery-auth-acceptance.mjs';

const owner = {
  auth_user_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  user_id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  email: 'fixture@example.invalid',
  data_epoch: 1,
};
const config = {
  databaseUrl:
    'postgres://justgo_runtime:synthetic@127.0.0.1:54329/justgo_restore_abcdef012345',
  origin: 'https://127.0.0.1:12345',
  publicKey: 'a'.repeat(32),
  adminKey: 'b'.repeat(32),
  jwtSecret: 'c'.repeat(32),
  expectedRegistrySha256: 'd'.repeat(64),
};
test('ambiguous or missing archived Apple owners abort without choosing a replacement', () => {
  assert.throws(() => existingAppleOwner([]));
  assert.throws(() =>
    existingAppleOwner([owner, { ...owner, user_id: 'c'.repeat(36) }]),
  );
  assert.throws(() => existingAppleOwner([{ ...owner, data_epoch: -1 }]));
  assert.equal(Object.isFrozen(existingAppleOwner([owner])), true);
});
test('Auth recovery controls refuse hosted targets, wrong runtime roles and shared admin/public credentials', () => {
  for (const change of [
    { origin: 'https://example.com' },
    { origin: config.origin + '/auth/v1' },
    { databaseUrl: config.databaseUrl.replace('127.0.0.1', 'db.example.com') },
    { databaseUrl: config.databaseUrl + '?host=db.example.com' },
    { databaseUrl: config.databaseUrl.replace('justgo_runtime', 'postgres') },
    { adminKey: config.publicKey },
    { expectedRegistrySha256: undefined },
  ])
    assert.throws(() => recoveryAuthAcceptance({ ...config, ...change }));
  assert.equal(recoveryAuthAcceptance(config).hooks.preserveOwnership, true);
});
test('missing-session control requires valid unchanged signature, issuer, subject and future expiry', () => {
  const payload = {
    sub: owner.auth_user_id,
    iss: config.origin + '/auth/v1',
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  const token = (
    claims,
    secret = config.jwtSecret,
    header = { alg: 'HS256' },
  ) => {
    const body = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
  };
  assert.equal(
    unexpiredLocalToken(
      token(payload),
      config.jwtSecret,
      payload.iss,
      owner.auth_user_id,
    ).sub,
    owner.auth_user_id,
  );
  for (const bad of [
    token({ ...payload, exp: 1 }),
    token({ ...payload, iss: 'https://example.com/auth/v1' }),
    token({ ...payload, sub: owner.user_id }),
    token(payload, 'wrong-key'),
    token(payload, config.jwtSecret, { alg: 'none' }),
    token(payload) + '.extra',
  ])
    assert.throws(() =>
      unexpiredLocalToken(
        bad,
        config.jwtSecret,
        payload.iss,
        owner.auth_user_id,
      ),
    );
});

test('post-replay acceptance cannot run before a successful pre-replay sign-in', async () => {
  const acceptance = recoveryAuthAcceptance(config);
  await assert.rejects(
    acceptance.hooks.afterReconcile({
      client: {
        query: () => assert.fail('No database access before the stage guard'),
      },
      result: { writersMayOpen: false },
    }),
    { message: 'Isolated Auth recovery acceptance failed' },
  );
  assert.deepEqual(acceptance.result(), { writersMayOpen: false });
  await acceptance.close();
});

test('a mismatched Auth service is rejected before any target records are read', async () => {
  const acceptance = recoveryAuthAcceptance({
    ...config,
    request: async () => Response.json({ version: 'v2.196.0' }),
  });
  await assert.rejects(
    acceptance.hooks.beforeReconcile({
      client: {
        query: () => assert.fail('No database access for the wrong service'),
      },
    }),
    { message: 'Isolated Auth recovery acceptance failed' },
  );
  await acceptance.close();
});
