import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { localRestoreConnection } from './restore-local.mjs';

const check = (condition) => {
  if (!condition) throw new Error('Isolated Auth recovery acceptance failed');
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export async function authRegistrySignature(client) {
  const { rows } = await client.query(
    'select version from auth.schema_migrations order by version collate "C"',
  );
  check(rows.length > 0 && rows.length < 1000);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

export function existingAppleOwner(rows) {
  check(Array.isArray(rows) && rows.length === 1);
  const owner = rows[0];
  check(
    uuid.test(owner.auth_user_id ?? '') &&
      uuid.test(owner.user_id ?? '') &&
      typeof owner.email === 'string' &&
      owner.email.length > 3 &&
      Number.isSafeInteger(owner.data_epoch) &&
      owner.data_epoch >= 0,
  );
  return Object.freeze({ ...owner });
}

export function unexpiredLocalToken(token, secret, issuer, subject) {
  try {
    const [header, payload, signature, extra] = token.split('.');
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64url'));
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    const actual = Buffer.from(signature, 'base64url');
    const expected = createHmac('sha256', secret)
      .update(`${header}.${payload}`)
      .digest();
    check(
      extra === undefined &&
        decodedHeader.alg === 'HS256' &&
        actual.length === expected.length &&
        timingSafeEqual(actual, expected) &&
        claims.iss === issuer &&
        claims.aud === 'authenticated' &&
        claims.role === 'authenticated' &&
        claims.sub === subject &&
        Number.isSafeInteger(claims.exp) &&
        claims.exp * 1000 > Date.now(),
    );
    return claims;
  } catch {
    throw new Error('Isolated Auth recovery acceptance failed');
  }
}

/**
 * Programmatic hooks for a closed, disposable loopback target. The caller owns
 * the pinned local Auth service, normal TLS trust, strict gateway and cleanup.
 * Never use hosted Auth keys or a hosted database here.
 */
export function recoveryAuthAcceptance({
  databaseUrl,
  origin,
  publicKey,
  adminKey,
  jwtSecret,
  expectedRegistrySha256,
  request = fetch,
}) {
  const runtime = new URL(databaseUrl);
  check(runtime.username === 'justgo_runtime');
  const admin = new URL(runtime);
  admin.username = 'postgres';
  const connection = localRestoreConnection(admin.href);
  const authOrigin = new URL(origin);
  check(
    authOrigin.protocol === 'https:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(authOrigin.hostname) &&
      authOrigin.pathname === '/' &&
      !authOrigin.username &&
      !authOrigin.password &&
      !authOrigin.search &&
      !authOrigin.hash &&
      [publicKey, adminKey, jwtSecret].every(
        (value) => typeof value === 'string' && value.length >= 32,
      ) &&
      publicKey !== adminKey,
  );
  check(/^[a-f0-9]{64}$/.test(expectedRegistrySha256 ?? ''));
  const issuer = new URL('/auth/v1', authOrigin).href;
  let database, app, owner, before, after, t0;
  const result = {};
  async function auth(path, { token, body, admin: privileged = false } = {}) {
    check(
      /^\/(health|user|admin\/generate_link|verify|token\?grant_type=refresh_token)$/.test(
        path,
      ),
    );
    const response = await request(new URL(`/auth/v1${path}`, authOrigin), {
      method: body ? 'POST' : 'GET',
      headers: {
        apikey: privileged ? adminKey : publicKey,
        ...(token || privileged
          ? { authorization: `Bearer ${token || adminKey}` }
          : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, body: await response.json() };
  }
  async function signIn() {
    const link = await auth('/admin/generate_link', {
      admin: true,
      body: { type: 'recovery', email: owner.email },
    });
    check(link.status === 200 && link.body.id === owner.auth_user_id);
    check(typeof link.body.hashed_token === 'string');
    const signedIn = await auth('/verify', {
      body: { type: 'recovery', token_hash: link.body.hashed_token },
    });
    check(
      signedIn.status === 200 && signedIn.body.user?.id === owner.auth_user_id,
    );
    check(typeof signedIn.body.refresh_token === 'string');
    unexpiredLocalToken(
      signedIn.body.access_token,
      jwtSecret,
      issuer,
      owner.auth_user_id,
    );
    return signedIn.body;
  }
  async function api(path, { token, method = 'GET', body } = {}) {
    const response = await app.fetch(
      new Request(`http://127.0.0.1${path}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
    return { status: response.status, body: await response.json() };
  }
  async function exchange(token, epoch) {
    const deviceId = randomUUID();
    const exchanged = await api('/v1/auth/session', {
      method: 'POST',
      token,
      body: { deviceId },
    });
    check(exchanged.status === 200);
    check(
      exchanged.body.authUserId === owner.auth_user_id &&
        exchanged.body.userId === owner.user_id &&
        exchanged.body.dataEpoch === epoch &&
        exchanged.body.deviceId === deviceId,
    );
    check((await api('/v1/auth/session', { token })).status === 200);
    return exchanged.body;
  }
  async function saveWritingToErase(client, token, epoch) {
    const card = (
      await client.query(`select c.id as challenge_id,c.text as instruction,
        c.level_id,v.venue_id as venue from justgo.challenges c
        join justgo.venue_cards v on v.challenge_id=c.id
        where c.level_id='level-1' order by c.id,v.venue_id limit 1`)
    ).rows[0];
    check(card);
    const attemptId = randomUUID(),
      versionId = randomUUID();
    const startedAt = new Date().toISOString();
    const completion = await api('/v1/completion-restores', {
      token,
      method: 'POST',
      body: {
        expectedEpoch: epoch,
        attempts: [
          {
            id: attemptId,
            challengeId: card.challenge_id,
            venue: card.venue,
            levelId: card.level_id,
            instruction: card.instruction,
            startedAt,
            startTimeZone: 'UTC',
            displayTimeZone: 'UTC',
            activityDate: startedAt.slice(0, 10),
          },
        ],
      },
    });
    check(completion.status === 200);
    const { completionRestoreResponseSchema, journalSyncResponseSchema } =
      await import('@justgo/contracts');
    const restored = completionRestoreResponseSchema.parse(completion.body);
    check(
      restored.dataEpoch === epoch &&
        restored.added === 1 &&
        restored.identical === 0 &&
        restored.attempts.length === 1 &&
        restored.attempts[0].id === attemptId,
    );
    const text = 'Local recovery deletion control';
    const journal = await api('/v1/journal-sync', {
      token,
      method: 'POST',
      body: {
        expectedEpoch: epoch,
        versions: [
          {
            versionId,
            attemptId,
            parents: [],
            feelingScaleVersion: 1,
            reflection: { feeling: null, text, revision: 1 },
          },
        ],
      },
    });
    check(journal.status === 200);
    const saved = journalSyncResponseSchema.parse(journal.body);
    check(
      saved.dataEpoch === epoch &&
        saved.saved === 1 &&
        saved.identical === 0 &&
        saved.versions.length === 1 &&
        saved.versions[0].attemptId === attemptId &&
        saved.versions[0].versionId === versionId,
    );
    const present = (
      await client.query(
        `select
      exists(select 1 from justgo.attempts where user_id=$1 and id=$2) as attempt_present,
      exists(select 1 from justgo.journal_versions where user_id=$1 and attempt_id=$2
        and version_id=$3 and reflection->>'text'=$4) as reflection_present`,
        [owner.user_id, attemptId, versionId, text],
      )
    ).rows[0];
    check(
      present.attempt_present === true && present.reflection_present === true,
    );
  }
  return {
    hooks: {
      preserveOwnership: true,
      beforeReconcile: async ({ client }) => {
        check(!before && !after && !database);
        const health = await auth('/health');
        check(health.status === 200 && health.body.version === 'v2.197.0');
        check((await authRegistrySignature(client)) === expectedRegistrySha256);
        const identity = (
          await client.query(
            'select current_database() as db,current_user as role',
          )
        ).rows[0];
        check(
          identity.db === connection.database && identity.role === 'postgres',
        );
        owner = existingAppleOwner(
          (
            await client.query(`select a.id::text as auth_user_id,
          a.email,m.user_id::text,u.data_epoch
          from auth.users a join justgo.managed_auth_accounts m on m.auth_user_id=a.id
          join justgo.users u on u.id=m.user_id
          where u.deleted_at is null and exists(select 1 from auth.identities i
            where i.user_id=a.id and i.provider='apple')`)
          ).rows,
        );
        const { readConfig } = await import('../../apps/api/src/config.ts');
        const { createDatabase } =
          await import('../../apps/api/src/db/client.ts');
        const { buildRuntimeApp } =
          await import('../../apps/api/src/runtime-app.ts');
        const config = readConfig({
          NODE_ENV: 'test',
          APP_ENVIRONMENT: 'production',
          LOG_LEVEL: 'silent',
          DATABASE_URL: databaseUrl,
          DATABASE_SSL: 'disable',
          MANAGED_AUTH_ENABLED: 'true',
          SUPABASE_URL: authOrigin.origin,
          SUPABASE_PUBLISHABLE_KEY: publicKey,
          SUPABASE_AUTH_SECRET_KEY: adminKey,
          API_SENTRY_ENABLED: 'false',
          IDENTITY_RATE_LIMIT_KEY: jwtSecret,
        });
        database = createDatabase(config);
        app = buildRuntimeApp(config, database, { onVercel: false });
        check((await api('/ready')).status === 200);
        const helper = await database.pool.query(
          'select justgo_auth_private.is_live_session_v1($1::uuid,$2::uuid) as live',
          [randomUUID(), owner.auth_user_id],
        );
        check(helper.rows[0].live === false);
        let directDenied = false;
        try {
          await database.pool.query('select id from auth.sessions limit 0');
        } catch (error) {
          directDenied = error.code === '42501';
        }
        check(directDenied);
        t0 = await signIn();
        before = await exchange(t0.access_token, owner.data_epoch);
        const live = await database.pool.query(
          'select justgo_auth_private.is_live_session_v1($1::uuid,$2::uuid) as live',
          [before.sessionId, owner.auth_user_id],
        );
        check(live.rows[0].live === true);
        result.preReplaySignInPassed = true;
        result.runtimeReadinessAndRestrictionsPassed = true;
      },
      afterReconcile: async ({ client, result: reconciled }) => {
        check(before && !after && reconciled.writersMayOpen === false);
        const health = await auth('/health');
        check(health.status === 200 && health.body.version === 'v2.197.0');
        check((await authRegistrySignature(client)) === expectedRegistrySha256);
        unexpiredLocalToken(
          t0.access_token,
          jwtSecret,
          issuer,
          owner.auth_user_id,
        );
        const rejected = await auth('/user', { token: t0.access_token });
        check(
          rejected.status === 403 &&
            rejected.body.error_code === 'session_not_found',
        );
        const refresh = await auth('/token?grant_type=refresh_token', {
          body: { refresh_token: t0.refresh_token },
        });
        check(
          refresh.status === 400 &&
            refresh.body.error_code === 'refresh_token_not_found',
        );
        const applicationRevocation = await client.query(
          `select exists(select 1 from justgo.managed_auth_sessions
            where id=$1 and auth_user_id=$2 and user_id=$3
              and revoked_at is not null) as revoked`,
          [before.sessionId, owner.auth_user_id, owner.user_id],
        );
        check(applicationRevocation.rows[0].revoked === true);
        const missing = await database.pool.query(
          'select justgo_auth_private.is_live_session_v1($1::uuid,$2::uuid) as live',
          [before.sessionId, owner.auth_user_id],
        );
        check(missing.rows[0].live === false);
        check(
          (await api('/v1/auth/session', { token: t0.access_token })).status ===
            401,
        );
        result.oldUnexpiredAccessAndRefreshRejected = true;
        const current = (
          await client.query(
            'select data_epoch,deleted_at from justgo.users where id=$1',
            [owner.user_id],
          )
        ).rows[0];
        check(
          current &&
            !current.deleted_at &&
            current.data_epoch >= owner.data_epoch,
        );
        const t1 = await signIn();
        after = await exchange(t1.access_token, current.data_epoch);
        check(after.sessionId !== before.sessionId);
        result.freshSignInSameCanonicalOwnerPassed = true;
        await saveWritingToErase(client, t1.access_token, current.data_epoch);
        result.localWritingSavedBeforeDeletion = true;
        const deletion = await api('/v1/account', {
          token: t1.access_token,
          method: 'DELETE',
          body: { confirmation: 'delete-account' },
        });
        check(deletion.status === 200);
        const remaining = (
          await client.query(
            `select
          exists(select 1 from justgo.users where id=$1 and deleted_at is not null) as tombstone,
          not exists(select 1 from justgo.attempts where user_id=$1) as no_attempts,
          not exists(select 1 from justgo.journal_versions where user_id=$1) as no_writing,
          not exists(select 1 from auth.users where id=$2) as no_auth,
          not exists(select 1 from auth.sessions where user_id=$2) as no_sessions,
          not exists(select 1 from auth.refresh_tokens where user_id=$2::text) as no_refresh,
          exists(select 1 from justgo.managed_auth_deletions where user_id=$1 and completed_at is not null) as auth_cleanup_complete`,
            [owner.user_id, owner.auth_user_id],
          )
        ).rows[0];
        check(Object.values(remaining).every((value) => value === true));
        const deletedAccess = await auth('/user', { token: t1.access_token });
        check(deletedAccess.status >= 400 && deletedAccess.status < 500);
        check(
          (await api('/v1/auth/session', { token: t1.access_token })).status ===
            401,
        );
        const deletedRefresh = await auth('/token?grant_type=refresh_token', {
          body: { refresh_token: t1.refresh_token },
        });
        check(
          deletedRefresh.status === 400 &&
            deletedRefresh.body.error_code === 'refresh_token_not_found',
        );
        result.actualApiAndAuthDeletionPassed = true;
      },
    },
    result: () => Object.freeze({ ...result, writersMayOpen: false }),
    close: async () => {
      if (database) await database.pool.end();
    },
  };
}
