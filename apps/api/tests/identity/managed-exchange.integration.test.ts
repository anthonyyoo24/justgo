import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase, poolOptions } from '../../src/db/client.js';
import { readConfig } from '../../src/config.js';
import { localTestDatabaseUrl } from '../../scripts/local-test-database.js';
import { IdentityService } from '../../src/identity/service.js';
import type { VerifiedManagedIdentity } from '../../src/identity/managed-verifier.js';
import { ApiError } from '../../src/http/api-error.js';

const config = readConfig({ ...process.env, DATABASE_POOL_MAX: '3' });
for (const url of [config.DATABASE_URL, process.env.MIGRATION_DATABASE_URL])
  localTestDatabaseUrl(url);
const database = createDatabase(config);
const admin = new Pool(
  poolOptions(
    readConfig({
      ...process.env,
      DATABASE_URL: process.env.MIGRATION_DATABASE_URL!,
    }),
  ),
);
const owners = new Set<string>();
const subjects = new Map<string, VerifiedManagedIdentity>();
const live = new Set<string>();
const dialect = new PgDialect();

/** Model Hyperdrive's documented restriction while executing real RLS transactions. */
function pooledDatabase(
  afterMissingMapping?: () => Promise<void>,
  afterMappingConflict?: () => Promise<void>,
) {
  return new Proxy(database.db, {
    get(target, key, receiver) {
      if (key !== 'transaction') return Reflect.get(target, key, receiver);
      return <T>(operation: Parameters<NodePgDatabase['transaction']>[0]) =>
        target.transaction(async (tx) => {
          const pooled = new Proxy(tx, {
            get(transaction, method, txReceiver) {
              if (method !== 'execute')
                return Reflect.get(transaction, method, txReceiver);
              return async (statement: SQL) => {
                const query = dialect.sqlToQuery(statement);
                if (query.sql.includes('pg_advisory'))
                  throw new Error(
                    'Advisory locks are not supported by the pooled transport',
                  );
                const result = await transaction.execute(statement);
                if (
                  afterMappingConflict &&
                  query.sql.startsWith(
                    'insert into justgo.managed_auth_accounts',
                  ) &&
                  result.rows.length === 0
                )
                  await afterMappingConflict();
                if (
                  afterMissingMapping &&
                  query.sql.startsWith(
                    'select user_id from justgo.managed_auth_accounts',
                  ) &&
                  result.rows.length === 0
                )
                  await afterMissingMapping();
                return result;
              };
            },
          });
          return operation(pooled) as Promise<T>;
        });
    },
  });
}

function simultaneousReads() {
  let count = 0;
  let release: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async () => {
    if (++count === 2) release?.();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ready,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(new Error('Concurrent mapping readers did not arrive')),
            2000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  };
}

function provider(authUserId = randomUUID()) {
  const token = `synthetic.${randomUUID()}.proof`;
  const identity = {
    authUserId,
    sessionId: randomUUID(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  subjects.set(token, identity);
  live.add(identity.sessionId);
  return { token, identity };
}

function service(db = pooledDatabase(), allocate?: () => string) {
  return new IdentityService(db, {
    rateKey: 'isolated-managed-exchange-test-key',
    managedAuthVerifier: async (token) => {
      const identity = subjects.get(token);
      if (!identity) throw new ApiError('UNAUTHORIZED');
      return identity;
    },
    managedLiveSessionReader: async (_tx, identity) =>
      live.has(identity.sessionId),
    newUserId: () => {
      const id = allocate?.() ?? randomUUID();
      owners.add(id);
      return id;
    },
  });
}

afterAll(async () => {
  try {
    for (const owner of owners) {
      for (const table of [
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
    await Promise.all([database.pool.end(), admin.end()]);
  }
});

describe('managed exchange on a transaction-pooled connection', () => {
  it('rolls back the losing candidate and gives concurrent first sign-ins one canonical owner', async () => {
    const a = provider();
    const b = provider(a.identity.authUserId);
    const allocated: string[] = [];
    const identity = service(pooledDatabase(simultaneousReads()), () => {
      const id = randomUUID();
      allocated.push(id);
      return id;
    });
    const [first, second] = await Promise.all([
      identity.exchangeManaged(a.token, { deviceId: randomUUID() }),
      identity.exchangeManaged(b.token, { deviceId: randomUUID() }),
    ]);
    expect(allocated).toHaveLength(2);
    expect(first.userId).toBe(second.userId);
    expect(first.authUserId).toBe(a.identity.authUserId);
    expect(second.authUserId).toBe(a.identity.authUserId);
    expect(
      (
        await admin.query(
          'select id from justgo.users where id=any($1::uuid[])',
          [allocated],
        )
      ).rows,
    ).toEqual([{ id: first.userId }]);
    expect(
      (
        await admin.query(
          'select id from justgo.managed_auth_sessions where user_id=$1',
          [first.userId],
        )
      ).rows,
    ).toHaveLength(2);
  });

  it.each(['provider revocation', 'owner deletion'] as const)(
    'does not revive an account when %s happens before the losing exchange retries',
    async (boundary) => {
      const a = provider();
      const b = provider(a.identity.authUserId);
      const allocated: string[] = [];
      const identity = service(
        pooledDatabase(simultaneousReads(), async () => {
          if (boundary === 'provider revocation') {
            live.delete(a.identity.sessionId);
            live.delete(b.identity.sessionId);
          } else {
            await admin.query(
              'update justgo.users set deleted_at=now() where id=(select user_id from justgo.managed_auth_accounts where auth_user_id=$1)',
              [a.identity.authUserId],
            );
          }
        }),
        () => {
          const id = randomUUID();
          allocated.push(id);
          return id;
        },
      );
      const results = await Promise.allSettled([
        identity.exchangeManaged(a.token, { deviceId: randomUUID() }),
        identity.exchangeManaged(b.token, { deviceId: randomUUID() }),
      ]);
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.find((result) => result.status === 'rejected'),
      ).toMatchObject({
        reason: {
          code:
            boundary === 'provider revocation'
              ? 'SESSION_REVOKED'
              : 'CREDENTIAL_REJECTED',
        },
      });
      expect(allocated).toHaveLength(2);
      expect(
        (
          await admin.query(
            'select id from justgo.users where id=any($1::uuid[])',
            [allocated],
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await admin.query(
            'select id from justgo.managed_auth_sessions where auth_user_id=$1',
            [a.identity.authUserId],
          )
        ).rows,
      ).toHaveLength(1);
    },
  );

  it('replays concurrent legacy adoption after the winning transaction revoked the exact old proof', async () => {
    const legacy = service(database.db);
    const proof = {
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      sessionToken: randomBytes(32).toString('hex'),
      credential: randomBytes(32).toString('hex'),
    };
    const previous = await legacy.bootstrap(proof);
    const a = provider();
    const b = provider(a.identity.authUserId);
    const identity = service(pooledDatabase(simultaneousReads()));
    const [first, second] = await Promise.all([
      identity.exchangeManaged(a.token, {
        deviceId: randomUUID(),
        legacySessionToken: proof.sessionToken,
      }),
      identity.exchangeManaged(b.token, {
        deviceId: randomUUID(),
        legacySessionToken: proof.sessionToken,
      }),
    ]);
    expect(first.userId).toBe(previous.userId);
    expect(second.userId).toBe(previous.userId);
    await expect(legacy.me(proof.sessionToken)).rejects.toMatchObject({
      code: 'SESSION_REVOKED',
    });
    const stranger = provider();
    await expect(
      identity.exchangeManaged(stranger.token, {
        deviceId: randomUUID(),
        legacySessionToken: proof.sessionToken,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
    expect(
      (
        await admin.query(
          'select user_id from justgo.managed_auth_accounts where auth_user_id=$1',
          [stranger.identity.authUserId],
        )
      ).rows,
    ).toHaveLength(0);
  });

  it('keeps existing-proof recovery supported without enabling new legacy accounts', async () => {
    const legacy = service(database.db);
    const proof = {
      deviceId: randomUUID(),
      sessionId: randomUUID(),
      sessionToken: randomBytes(32).toString('hex'),
      credential: randomBytes(32).toString('hex'),
    };
    const previous = await legacy.bootstrap(proof);
    const identity = service();
    const recovered = await identity.bootstrap(
      {
        ...proof,
        deviceId: randomUUID(),
        sessionId: randomUUID(),
        sessionToken: randomBytes(32).toString('hex'),
      },
      false,
    );
    expect(recovered.userId).toBe(previous.userId);
    await expect(
      identity.bootstrap(
        { ...proof, credential: randomBytes(32).toString('hex') },
        false,
      ),
    ).rejects.toMatchObject({ code: 'CREDENTIAL_REJECTED' });
  });
});
