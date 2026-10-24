import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { ManagedIdentityService } from '../../src/identity/managed-service.js';

const identity = {
  authUserId: '10000000-0000-4000-8000-000000000040',
  sessionId: '10000000-0000-4000-8000-000000000041',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

describe('default private live-session reader', () => {
  it.each([false, null, undefined, 'true'])(
    'rejects non-true helper results before reading or changing an owner (%s)',
    async (live) => {
      const queries: ReturnType<PgDialect['sqlToQuery']>[] = [];
      const dialect = new PgDialect();
      const execute = vi.fn(async (statement: SQL) => {
        queries.push(dialect.sqlToQuery(statement));
        return { rows: live === undefined ? [] : [{ live }] };
      });
      const transaction = vi.fn(
        async (
          operation: (tx: { execute: typeof execute }) => Promise<unknown>,
        ) => operation({ execute }),
      );
      const legacy = vi.fn();
      const service = new ManagedIdentityService(
        { transaction } as unknown as NodePgDatabase,
        async () => identity,
        legacy,
      );
      await expect(
        service.exchange('synthetic-token', {
          deviceId: '10000000-0000-4000-8000-000000000042',
        }),
      ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
      expect(queries).toHaveLength(2);
      expect(queries[1]).toMatchObject({
        sql: 'select justgo_auth_private.is_live_session_v1($1::uuid,$2::uuid) as live',
        params: [identity.sessionId, identity.authUserId],
      });
      expect(legacy).not.toHaveBeenCalled();
    },
  );
});
