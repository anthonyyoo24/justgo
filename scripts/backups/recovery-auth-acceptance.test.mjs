import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
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
const issuer = `${config.origin}/auth/v1`;
const acceptanceFailure = {
  message: 'Isolated Auth recovery acceptance failed',
};
const signedToken = (
  claims,
  secret = config.jwtSecret,
  header = { alg: 'HS256' },
) => {
  const body = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
};

function restoredWorld(fault) {
  const registry = [{ version: '20250101000000' }];
  const state = {
    epoch: owner.data_epoch,
    deleted: false,
    sessions: [],
    attempts: new Set(),
    reflections: new Set(),
    deletionRequests: [],
  };
  const keeps = (session, surface) =>
    Boolean(session) &&
    (!session.ended || fault === `${session.ended} keeps ${surface}`);
  const byAccess = (token) => state.sessions.find((s) => s.access === token);
  const byApp = (id) => state.sessions.find((s) => s.appSessionId === id);
  const end = (reason) => {
    for (const session of state.sessions) session.ended ??= reason;
  };
  const json = (body, status = 200) => Response.json(body, { status });

  async function request(url, init) {
    const target = new URL(url);
    assert.equal(target.origin, config.origin);
    if (fault === 'Auth redirects' && init.redirect === 'error')
      throw new TypeError('fetch failed');
    const { apikey, authorization } = init.headers;
    const body = init.body && JSON.parse(init.body);
    const route = `${init.method} ${target.pathname}${target.search}`;
    if (route === 'POST /auth/v1/admin/generate_link') {
      assert.equal(apikey, config.adminKey);
      assert.equal(authorization, `Bearer ${config.adminKey}`);
      return json({ id: owner.auth_user_id, hashed_token: randomUUID() });
    }
    assert.equal(apikey, config.publicKey);
    const bearer = authorization?.replace(/^Bearer /, '');
    switch (route) {
      case 'GET /auth/v1/health':
        return json({ version: 'v2.197.0' });
      case 'POST /auth/v1/verify': {
        const session = {
          access: signedToken({
            sub: owner.auth_user_id,
            iss: issuer,
            aud: 'authenticated',
            role: 'authenticated',
            exp: Math.floor(Date.now() / 1000) + 3600,
            jti: randomUUID(),
          }),
          refresh: randomUUID(),
        };
        state.sessions.push(session);
        return json({
          user: { id: owner.auth_user_id },
          access_token: session.access,
          refresh_token: session.refresh,
        });
      }
      case 'GET /auth/v1/user':
        return keeps(byAccess(bearer), 'access')
          ? json({ id: owner.auth_user_id })
          : json({ error_code: 'session_not_found' }, 403);
      case 'POST /auth/v1/token?grant_type=refresh_token':
        return keeps(
          state.sessions.find((s) => s.refresh === body.refresh_token),
          'refresh',
        )
          ? json({ access_token: randomUUID(), refresh_token: randomUUID() })
          : json({ error_code: 'refresh_token_not_found' }, 400);
      default:
        return json({ error_code: 'not_found' }, 404);
    }
  }

  async function apiFetch(apiRequest) {
    const { pathname } = new URL(apiRequest.url);
    const route = `${apiRequest.method} ${pathname}`;
    if (route === 'GET /ready') return json({ ready: true });
    const session = byAccess(
      apiRequest.headers.get('authorization')?.replace(/^Bearer /, ''),
    );
    if (!keeps(session, 'API session'))
      return json({ error: 'unauthorized' }, 401);
    const body = apiRequest.body ? await apiRequest.json() : undefined;
    switch (route) {
      case 'POST /v1/auth/session':
        session.appSessionId = randomUUID();
        return json({
          authUserId: owner.auth_user_id,
          userId: owner.user_id,
          dataEpoch: state.epoch,
          deviceId: body.deviceId,
          sessionId: session.appSessionId,
        });
      case 'GET /v1/auth/session':
        return json({ sessionId: session.appSessionId });
      case 'POST /v1/completion-restores':
        for (const attempt of body.attempts) state.attempts.add(attempt.id);
        return json({
          dataEpoch: state.epoch,
          attempts: body.attempts,
          added: body.attempts.length,
          identical: 0,
        });
      case 'POST /v1/journal-sync':
        for (const version of body.versions)
          state.reflections.add(
            `${version.attemptId}/${version.versionId}/${version.reflection.text}`,
          );
        return json({
          dataEpoch: state.epoch,
          versions: body.versions,
          saved: body.versions.length,
          identical: 0,
        });
      case 'DELETE /v1/account':
        state.deletionRequests.push(body);
        if (body?.confirmation !== 'delete-account')
          return json({ error: 'confirmation_required' }, 400);
        state.deleted = true;
        end('deletion');
        state.attempts.clear();
        if (fault !== 'deletion keeps writing') state.reflections.clear();
        return json(
          { deleted: true },
          fault === 'deletion reports failure' ? 500 : 200,
        );
      default:
        return json({ error: 'not_found' }, 404);
    }
  }

  const targetRows = [
    ['auth.schema_migrations', () => registry],
    [
      'current_database()',
      () => [
        {
          db:
            fault === 'wrong target'
              ? 'justgo_restore_ffffffffffff'
              : 'justgo_restore_abcdef012345',
          role: 'postgres',
        },
      ],
    ],
    ['managed_auth_accounts', () => [owner]],
    [
      'managed_auth_sessions',
      ([sessionId]) => [{ revoked: !keeps(byApp(sessionId), 'app session') }],
    ],
    [
      'select data_epoch,deleted_at',
      () => [{ data_epoch: state.epoch, deleted_at: null }],
    ],
    [
      'justgo.challenges',
      () => [
        {
          challenge_id: 'challenge-1',
          instruction: 'Say hello to a stranger',
          level_id: 'level-1',
          venue: 'park',
        },
      ],
    ],
    [
      'attempt_present',
      ([, attemptId, versionId, text]) => [
        {
          attempt_present: state.attempts.has(attemptId),
          reflection_present: state.reflections.has(
            `${attemptId}/${versionId}/${text}`,
          ),
        },
      ],
    ],
    [
      'tombstone',
      () => [
        {
          tombstone: state.deleted,
          no_attempts: state.attempts.size === 0,
          no_writing: state.reflections.size === 0,
          no_auth: state.deleted,
          no_sessions: state.sessions.every((s) => s.ended),
          no_refresh: state.sessions.every((s) => s.ended),
          auth_cleanup_complete: state.deleted,
        },
      ],
    ],
  ];
  const query =
    (routes) =>
    async (sql, params = []) => {
      const route = routes.find(([token]) => sql.includes(token));
      assert.ok(route, `unexpected query: ${sql}`);
      return { rows: route[1](params) };
    };
  const pool = {
    query: async (sql, params) => {
      if (sql.includes('from auth.sessions limit 0')) {
        if (fault === 'runtime reads Auth sessions') return { rows: [] };
        throw Object.assign(new Error('permission denied'), { code: '42501' });
      }
      return query([
        [
          'is_live_session_v1',
          ([sessionId]) => [
            { live: keeps(byApp(sessionId), 'helper session') },
          ],
        ],
      ])(sql, params);
    },
    end: async () => {},
  };

  return {
    state,
    client: { query: query(targetRows) },
    request,
    startRuntime: async () => ({ app: { fetch: apiFetch }, pool }),
    replay() {
      end('replay');
      state.epoch += 1;
    },
    registrySha256: createHash('sha256')
      .update(JSON.stringify(registry))
      .digest('hex'),
  };
}

async function runAcceptance(
  fault,
  { replayResult = Object.freeze({ writersMayOpen: false }) } = {},
) {
  const world = restoredWorld(fault);
  const acceptance = recoveryAuthAcceptance({
    ...config,
    expectedRegistrySha256: world.registrySha256,
    request: world.request,
    startRuntime: world.startRuntime,
  });
  try {
    await acceptance.hooks.beforeReconcile({ client: world.client });
    world.replay();
    await acceptance.hooks.afterReconcile({
      client: world.client,
      result: replayResult,
    });
    return { result: acceptance.result(), state: world.state };
  } finally {
    await acceptance.close();
  }
}

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
    { origin: 'http://127.0.0.1:12345' },
    { origin: 'https://user:secret@127.0.0.1:12345' },
    { origin: config.origin + '/?next=https://example.com' },
    { origin: config.origin + '/#fragment' },
    { publicKey: 'a'.repeat(31) },
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
    iss: issuer,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
  };
  assert.equal(
    unexpiredLocalToken(
      signedToken(payload),
      config.jwtSecret,
      issuer,
      owner.auth_user_id,
    ).sub,
    owner.auth_user_id,
  );
  for (const bad of [
    signedToken({ ...payload, exp: 1 }),
    signedToken({ ...payload, exp: String(payload.exp) }),
    signedToken({ ...payload, iss: 'https://example.com/auth/v1' }),
    signedToken({ ...payload, sub: owner.user_id }),
    signedToken({ ...payload, aud: 'anon' }),
    signedToken({ ...payload, role: 'anon' }),
    signedToken(payload, 'wrong-key'),
    signedToken(payload, config.jwtSecret, { alg: 'none' }),
    signedToken(payload) + '.extra',
  ])
    assert.throws(() =>
      unexpiredLocalToken(bad, config.jwtSecret, issuer, owner.auth_user_id),
    );
});

test('post-replay acceptance cannot run before a successful pre-replay sign-in', async () => {
  const acceptance = recoveryAuthAcceptance({
    ...config,
    request: () => assert.fail('No Auth request before the stage guard'),
  });
  await assert.rejects(
    acceptance.hooks.afterReconcile({
      client: {
        query: () => assert.fail('No database access before the stage guard'),
      },
      result: { writersMayOpen: false },
    }),
    acceptanceFailure,
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
    acceptanceFailure,
  );
  await acceptance.close();
});

test('a healthy restored world passes revocation, fresh sign-in and API account deletion', async () => {
  const { result, state } = await runAcceptance();
  assert.deepEqual(result, {
    preReplaySignInPassed: true,
    runtimeReadinessAndRestrictionsPassed: true,
    oldUnexpiredAccessAndRefreshRejected: true,
    freshSignInSameCanonicalOwnerPassed: true,
    localWritingSavedBeforeDeletion: true,
    actualApiAndAuthDeletionPassed: true,
    writersMayOpen: false,
  });
  assert.deepEqual(state.deletionRequests, [
    { confirmation: 'delete-account' },
  ]);
  assert.equal(state.reflections.size, 0);
});

test('post-replay acceptance refuses a replay result that opens writers', async () => {
  await assert.rejects(
    runAcceptance(undefined, { replayResult: { writersMayOpen: true } }),
    acceptanceFailure,
  );
});

test('the pre-replay acceptance runs once per restored target', async () => {
  const world = restoredWorld();
  const acceptance = recoveryAuthAcceptance({
    ...config,
    expectedRegistrySha256: world.registrySha256,
    request: world.request,
    startRuntime: world.startRuntime,
  });
  await acceptance.hooks.beforeReconcile({ client: world.client });
  await assert.rejects(
    acceptance.hooks.beforeReconcile({ client: world.client }),
    acceptanceFailure,
  );
  await acceptance.close();
});

for (const [fault, error = acceptanceFailure] of [
  ['Auth redirects', TypeError],
  ['wrong target'],
  ['runtime reads Auth sessions'],
  ['replay keeps access'],
  ['replay keeps refresh'],
  ['replay keeps app session'],
  ['replay keeps helper session'],
  ['replay keeps API session'],
  ['deletion reports failure'],
  ['deletion keeps writing'],
  ['deletion keeps access'],
  ['deletion keeps refresh'],
  ['deletion keeps API session'],
])
  test(`recovery acceptance fails when ${fault}`, async () => {
    await assert.rejects(runAcceptance(fault), error);
  });
