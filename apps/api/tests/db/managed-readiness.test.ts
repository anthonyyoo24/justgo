import { readFileSync } from 'node:fs';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { checkManagedAuthDatabase } from '../../src/db/client.js';
import { managedSessionHelper } from './fixtures/managed-session-check.js';

type Snapshot = {
  tables: Record<
    string,
    {
      name: string;
      columns: Record<string, { type: string; notNull: boolean }>;
      isRLSEnabled: boolean;
    }
  >;
};
const snapshot = JSON.parse(
  readFileSync(
    new URL('../../drizzle/meta/0023_snapshot.json', import.meta.url),
    'utf8',
  ),
) as Snapshot;

function catalog() {
  return Object.values(snapshot.tables).map((table) => ({
    name: table.name,
    kind: 'r',
    rls: table.isRLSEnabled,
    forced: true,
    columns: Object.fromEntries(
      Object.entries(table.columns).map(([name, column]) => [
        name,
        [column.type, column.notNull] as [string, boolean],
      ]),
    ),
    select: true,
    insert: true,
    update: ![
      'managed_auth_accounts',
      'journal_versions',
      'deleted_completion_ids',
    ].includes(table.name),
    delete: table.name === 'journal_versions',
  }));
}

function probe(rows = catalog(), authAvailable = true) {
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows })
    .mockResolvedValueOnce({
      rows: authAvailable ? [managedSessionHelper()] : [],
    });
  return { query, pool: { query } as unknown as Pool };
}

describe('managed rollout database readiness', () => {
  it('accepts the registered managed schema and least-privilege operation grants', async () => {
    const { pool, query } = probe();
    await expect(checkManagedAuthDatabase(pool)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[1]).toEqual([
      expect.arrayContaining([
        'users',
        'managed_auth_accounts',
        'managed_auth_sessions',
        'journal_versions',
        'deleted_completion_ids',
        'managed_auth_deletions',
      ]),
    ]);
  });

  it.each([
    'managed_auth_accounts',
    'managed_auth_sessions',
    'journal_versions',
    'deleted_completion_ids',
    'managed_auth_deletions',
  ])(
    'rejects absent %s even when Auth privileges are available',
    async (name) => {
      const { pool, query } = probe(
        catalog().filter((row) => row.name !== name),
      );
      await expect(checkManagedAuthDatabase(pool)).rejects.toThrow(
        'readiness check failed',
      );
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['users', 'data_epoch'],
    ['users', 'data_deleted_at'],
    ['journal_versions', 'context'],
    ['managed_auth_deletions', 'completed_at'],
  ])('rejects the incomplete %s.%s migration', async (table, column) => {
    const rows = catalog();
    delete rows.find((row) => row.name === table)!.columns[column];
    await expect(checkManagedAuthDatabase(probe(rows).pool)).rejects.toThrow(
      'readiness check failed',
    );
  });

  it.each([
    ['journal_versions', 'context', 'text', false],
    [
      'managed_auth_sessions',
      'expires_at',
      'timestamp without time zone',
      true,
    ],
    ['users', 'data_epoch', 'integer', false],
  ] as const)(
    'rejects incompatible %s.%s metadata',
    async (table, column, type, notNull) => {
      const rows = catalog();
      rows.find((row) => row.name === table)!.columns[column] = [type, notNull];
      await expect(checkManagedAuthDatabase(probe(rows).pool)).rejects.toThrow(
        'readiness check failed',
      );
    },
  );

  it.each(['kind', 'rls', 'forced', 'update'] as const)(
    'rejects a managed deletion table with incompatible %s',
    async (field) => {
      const rows = catalog();
      const table = rows.find((row) => row.name === 'managed_auth_deletions')!;
      if (field === 'kind') table.kind = 'v';
      else table[field] = false;
      await expect(checkManagedAuthDatabase(probe(rows).pool)).rejects.toThrow(
        'readiness check failed',
      );
    },
  );

  it('still requires the audited private live-session capability after schema validation', async () => {
    const { pool, query } = probe(catalog(), false);
    await expect(checkManagedAuthDatabase(pool)).rejects.toThrow(
      'readiness check failed',
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
});
