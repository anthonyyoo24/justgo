import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { ManagedIdentityService } from '../../src/identity/managed-service.js';

const identity = {
  authUserId: '10000000-0000-4000-8000-000000000050',
  sessionId: '10000000-0000-4000-8000-000000000051',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

function firstMappingFailure(failure?: Error) {
  const dialect = new PgDialect();
  const execute = vi.fn(async (statement: SQL) => {
    const { sql } = dialect.sqlToQuery(statement);
    if (sql.startsWith('select deleted_at,data_epoch'))
      return { rows: [{ deleted_at: null, data_epoch: 0 }] };
    if (sql.startsWith('insert into justgo.managed_auth_accounts') && failure)
      throw failure;
    return { rows: [] };
  });
  const transaction = vi.fn(
    async (operation: (tx: { execute: typeof execute }) => Promise<unknown>) =>
      operation({ execute }),
  );
  const verify = vi.fn(async () => identity);
  const allocate = vi.fn(() => '10000000-0000-4000-8000-000000000052');
  const service = new ManagedIdentityService(
    { transaction } as unknown as NodePgDatabase,
    verify,
    vi.fn(),
    async () => true,
    allocate,
  );
  return { service, verify, allocate, transaction };
}

describe('bounded first-mapping retry', () => {
  it('stops after one retry when another mapping conflict occurs', async () => {
    const { service, verify, allocate, transaction } = firstMappingFailure();
    await expect(
      service.exchange('synthetic-token', { deviceId: identity.sessionId }),
    ).rejects.toBeInstanceOf(Error);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(allocate).toHaveBeenCalledTimes(2);
  });

  it.each([
    { code: '23505', constraint: 'managed_auth_owner_uq' },
    { code: '57014' },
  ])('does not retry an unrelated database failure (%j)', async (details) => {
    const failure = Object.assign(
      new Error('synthetic database failure'),
      details,
    );
    const { service, verify, transaction } = firstMappingFailure(failure);
    await expect(
      service.exchange('synthetic-token', { deviceId: identity.sessionId }),
    ).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledOnce();
    expect(verify).toHaveBeenCalledOnce();
  });
});
