import type { PoolConfig } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  Pool: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  applyMigrations: vi.fn(),
}));
vi.mock('pg', async (importOriginal) => ({
  ...(await importOriginal<typeof import('pg')>()),
  Pool: database.Pool,
}));
vi.mock('../../scripts/migration-runner.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../scripts/migration-runner.js')
  >()),
  applyMigrations: database.applyMigrations,
}));

const runtimeUrl =
  'postgresql://justgo_runtime:fixture@127.0.0.1:5432/justgo_test';
const migrationUrl =
  'postgresql://justgo_migrator:fixture@127.0.0.1:5432/justgo_test';
let previousExitCode: typeof process.exitCode;

beforeEach(() => {
  previousExitCode = process.exitCode;
  process.exitCode = undefined;
  for (const [key, value] of Object.entries({
    NODE_ENV: 'test',
    APP_ENVIRONMENT: 'production',
    PORT: '3000',
    DATABASE_URL: runtimeUrl,
    MIGRATION_DATABASE_URL: migrationUrl,
    DATABASE_SSL: 'disable',
    DATABASE_POOL_MAX: '5',
    BETA_ACCESS_GRANTS: '[]',
    BETA_ACCESS_WINDOW: 'null',
  }))
    vi.stubEnv(key, value);
  database.Pool.mockImplementation(function () {
    return { query: database.query, end: database.end };
  });
  database.query.mockResolvedValue({
    rows: [{ current_user: 'justgo_migrator' }],
  });
  database.end.mockResolvedValue(undefined);
  database.applyMigrations.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  process.exitCode = previousExitCode;
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

function expectFailure(diagnostic: Record<string, string>) {
  expect(process.exitCode).toBe(1);
  expect(console.error).toHaveBeenCalledExactlyOnceWith(
    'Migration failed. Check the migration connection and reviewed SQL; credentials have been omitted.',
    { event: 'migration_failed', ...diagnostic },
  );
  expect(console.info).not.toHaveBeenCalled();
}

describe('migration CLI setup and cleanup', () => {
  it.each([undefined, runtimeUrl])(
    'requires a separate migration URL before constructing a pool (%s)',
    async (url) => {
      vi.stubEnv('MIGRATION_DATABASE_URL', url);
      await import('../../scripts/migrate.js');
      expectFailure({ reason: 'separate_connection_required' });
      expect(database.Pool).not.toHaveBeenCalled();
      expect(database.applyMigrations).not.toHaveBeenCalled();
      expect(database.end).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['PORT', '0'],
    ['MIGRATION_DATABASE_URL', 'private invalid connection URL'],
    ['BETA_ACCESS_GRANTS', 'private invalid grant configuration'],
  ])(
    'reports rejected %s configuration without its value',
    async (key, value) => {
      vi.stubEnv(key, value);
      await import('../../scripts/migrate.js');
      expectFailure({ reason: 'invalid_configuration' });
      expect(database.Pool).not.toHaveBeenCalled();
      expect(database.applyMigrations).not.toHaveBeenCalled();
      expect(database.end).not.toHaveBeenCalled();
    },
  );

  it.each([{ rows: [{ current_user: 'private_wrong_role' }] }, { rows: [] }])(
    'rejects an unverified migrator role and closes its pool',
    async (result) => {
      database.query.mockResolvedValue(result);
      await import('../../scripts/migrate.js');
      expectFailure({ reason: 'migrator_role_required' });
      expect(database.query).toHaveBeenCalledExactlyOnceWith(
        'select current_user',
      );
      expect(database.applyMigrations).not.toHaveBeenCalled();
      expect(database.end).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it('omits unexpected driver details while retaining an allowlisted SQLSTATE', async () => {
    database.query.mockRejectedValue(
      Object.assign(new Error(`private SQL and ${migrationUrl}`), {
        code: '28P01',
        detail: 'private credentials',
        reason: 'invalid_configuration',
      }),
    );
    await import('../../scripts/migrate.js');
    expectFailure({ sqlState: '28P01' });
    expect(database.applyMigrations).not.toHaveBeenCalled();
    expect(database.end).toHaveBeenCalledExactlyOnceWith();
  });

  it('handles a constructor failure without leaking it or attempting pool cleanup', async () => {
    database.Pool.mockImplementation(() => {
      throw new Error(`private SQL and ${migrationUrl}`);
    });
    await import('../../scripts/migrate.js');
    expectFailure({});
    expect(database.applyMigrations).not.toHaveBeenCalled();
    expect(database.end).not.toHaveBeenCalled();
  });

  it('preserves migration file diagnostics and closes the pool on migration failure', async () => {
    const { MigrationFailure } =
      await import('../../scripts/migration-runner.js');
    database.applyMigrations.mockRejectedValue(
      new MigrationFailure(
        '0002_second',
        Object.assign(new Error(`private SQL and ${migrationUrl}`), {
          code: '42501',
        }),
      ),
    );
    await import('../../scripts/migrate.js');
    expectFailure({ migration: '0002_second.sql', sqlState: '42501' });
    expect(database.end).toHaveBeenCalledExactlyOnceWith();
  });

  it('uses the migrator connection and one-slot pool, verifies its role, then migrates and closes', async () => {
    await import('../../scripts/migrate.js');
    expect(database.Pool).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining<Partial<PoolConfig>>({
        connectionString: migrationUrl,
        max: 1,
        ssl: false,
      }),
    );
    expect(database.query).toHaveBeenCalledExactlyOnceWith(
      'select current_user',
    );
    expect(database.applyMigrations).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ query: database.query, end: database.end }),
      {
        migrationsFolder: expect.stringMatching(/\/apps\/api\/drizzle\/?$/),
        migrationsSchema: 'drizzle',
      },
    );
    expect(database.query).toHaveBeenCalledBefore(database.applyMigrations);
    expect(database.applyMigrations).toHaveBeenCalledBefore(database.end);
    expect(database.end).toHaveBeenCalledExactlyOnceWith();
    expect(console.info).toHaveBeenCalledExactlyOnceWith('Migrations applied');
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });
});
