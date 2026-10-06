import { afterEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  createDatabase: vi.fn(() => {
    throw new Error('Database construction must not run');
  }),
  checkDatabase: vi.fn(),
}));
vi.mock('../../src/db/client.js', () => database);
const local = 'postgresql://justgo_runtime:fixture@127.0.0.1:5432/justgo_test';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});
describe('direct disposable challenge fixture startup', () => {
  it.each([
    { DATABASE_URL: `${local}?host=untrusted.example` },
    { DATABASE_URL: `${local}?database=justgo` },
    { DATABASE_URL: `${local}?user=justgo_migrator` },
    { DATABASE_URL: `${local}#unexpected` },
    { DATABASE_URL: local.replace('justgo_runtime', 'justgo_migrator') },
    { NODE_ENV: 'production' },
    { VERCEL: '1' },
  ])(
    'rejects unsafe fixture environment before creating a database connection',
    async (overrides) => {
      const env = {
        DATABASE_URL: local,
        DATABASE_SSL: 'disable',
        NODE_ENV: 'test',
        VERCEL: '',
        IDENTITY_RATE_LIMIT_KEY: 'fixture-only-rate-key-never-deployed',
        ...overrides,
      };
      for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
      await expect(import('../../scripts/challenge-dev.js')).rejects.toThrow(
        /(fixtures require|Disposable test tooling requires)/i,
      );
      expect(database.createDatabase).not.toHaveBeenCalled();
    },
  );
});
