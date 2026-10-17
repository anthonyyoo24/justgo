import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const boundaries = vi.hoisted(() => ({
  createDatabase: vi.fn(),
  Pool: vi.fn(),
}));
vi.mock('../../../src/db/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/db/client.js')>()),
  createDatabase: boundaries.createDatabase,
}));
vi.mock('pg', async (importOriginal) => ({
  ...(await importOriginal<typeof import('pg')>()),
  Pool: boundaries.Pool,
}));

beforeEach(() => {
  for (const [name, value] of Object.entries({
    NODE_ENV: 'test',
    APP_ENVIRONMENT: 'production',
    DATABASE_URL: 'postgresql://justgo_runtime:fixture@localhost/justgo_test',
    MIGRATION_DATABASE_URL:
      'postgresql://justgo_migrator:fixture@localhost/justgo_test',
    DATABASE_SSL: 'disable',
    BETA_ACCESS_GRANTS: '[]',
    BETA_ACCESS_WINDOW: 'null',
  }))
    vi.stubEnv(name, value);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

for (const variable of ['DATABASE_URL', 'MIGRATION_DATABASE_URL']) {
  it.each([
    '/justgo_test?host=remote.example',
    '/justgo_test?dbname=another_database',
    '/justgo_test?user=another_role',
    '/justgo_test#private-target',
    '/another_database/justgo_test',
  ])(
    `rejects an overridden ${variable} target %s before creating pools`,
    async (path) => {
      vi.stubEnv(variable, `postgresql://fixture:private@localhost${path}`);
      await expect(import('./identity.js')).rejects.toThrow(
        'Disposable test tooling requires a plain connection to dedicated loopback justgo_test',
      );
      expect(boundaries.createDatabase).not.toHaveBeenCalled();
      expect(boundaries.Pool).not.toHaveBeenCalled();
    },
  );
}
