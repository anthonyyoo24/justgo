import { describe, expect, it } from 'vitest';
import {
  createWorkerDatabase,
  hyperdrivePoolOptions,
  needsDirectTransaction,
  readWorkerConfig,
} from '../../src/db/worker-database.js';

const local =
  'postgresql://justgo_runtime:synthetic@127.0.0.1:54329/justgo_test';
const bindings = {
  HYPERDRIVE: { connectionString: local },
  LOCK_DATABASE_URL: local,
  NODE_ENV: 'production',
  APP_ENVIRONMENT: 'staging',
  DATABASE_SSL: 'disable',
  JUSTGO_SOURCE_SHA: 'a'.repeat(40),
  IDENTITY_RATE_LIMIT_KEY: 'synthetic-test-only-key-with-32-characters',
};
const wrapped = `postgresql://${'b'.repeat(32)}:${'c'.repeat(32)}@${'d'.repeat(32)}.workers.alt:5432/${'e'.repeat(32)}?sslmode=disable`;
const virtual = wrapped.replace(
  `${'d'.repeat(32)}.workers.alt`,
  'fixture.hyperdrive.local',
);
const hostedBindings = {
  ...bindings,
  HYPERDRIVE: { connectionString: wrapped },
  LOCK_DATABASE_URL:
    'postgresql://justgo_runtime:synthetic@db.fixture.supabase.co:5432/postgres',
  DATABASE_SSL: 'verify-full',
  MANAGED_AUTH_ENABLED: 'true',
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable-key',
  SUPABASE_AUTH_SECRET_KEY: 'synthetic-auth-secret-with-at-least-32-characters',
};
describe('Worker database boundary', () => {
  it('bounds per-request connections and SQL deadlines without overriding binding transport', () => {
    expect(hyperdrivePoolOptions(local)).toMatchObject({
      max: 1,
      statement_timeout: 5000,
      query_timeout: 6000,
    });
    expect(hyperdrivePoolOptions(local)).not.toHaveProperty('ssl');
    for (const invalid of [
      'https://example.com',
      local + '?host=other',
      local + '#ignored',
    ])
      expect(() => hyperdrivePoolOptions(invalid)).toThrow();
  });
  it('accepts workerd virtual transport parameters without allowing origin TLS overrides', () => {
    const virtual =
      local.replace('127.0.0.1', 'fixture.hyperdrive.local') +
      '?sslmode=disable';
    expect(hyperdrivePoolOptions(virtual).connectionString).toBe(virtual);
    expect(
      readWorkerConfig({
        ...bindings,
        HYPERDRIVE: { connectionString: virtual },
      }).config.DATABASE_URL,
    ).toBe(virtual);
    for (const invalid of [
      local + '?sslmode=disable',
      virtual + '&host=remote.invalid',
      virtual + '&sslmode=disable',
      virtual.replace('sslmode=disable', 'sslmode=require'),
    ])
      expect(() => hyperdrivePoolOptions(invalid)).toThrow(
        'Invalid Hyperdrive binding',
      );
  });
  it('isolates the database binding from unrelated environment URLs', () => {
    const settings = readWorkerConfig({
      ...bindings,
      DATABASE_URL: 'postgresql://postgres@remote.invalid/db',
    });
    expect(settings.config.DATABASE_URL).toBe(local);
    expect(settings.lockConfig.DATABASE_URL).toBe(local);
    expect(
      readWorkerConfig({
        ...bindings,
        HYPERDRIVE: {
          connectionString: local.replace(
            '127.0.0.1',
            'fixture.hyperdrive.local',
          ),
        },
      }).config.DATABASE_SSL,
    ).toBe('verify-full');
  });
  it('accepts hosted wrapped transport without confusing opaque credentials with the origin', () => {
    expect(hyperdrivePoolOptions(wrapped).connectionString).toBe(wrapped);
    const settings = readWorkerConfig(hostedBindings);
    expect(settings.config.DATABASE_URL).toBe(wrapped);
    expect(settings.lockConfig.DATABASE_URL).toBe(
      hostedBindings.LOCK_DATABASE_URL,
    );
    expect(settings.databaseName).toBe('postgres');
  });
  it('accepts observed opaque virtual credentials and derives origin identity from the direct connection', () => {
    const settings = readWorkerConfig({
      ...hostedBindings,
      HYPERDRIVE: { connectionString: virtual },
    });
    expect(settings.connectionString).toBe(virtual);
    expect(settings.config.DATABASE_URL).toBe(virtual);
    expect(settings.lockConfig.DATABASE_URL).toBe(
      hostedBindings.LOCK_DATABASE_URL,
    );
    expect(settings.databaseName).toBe('postgres');
    expect(new URL(virtual).username).not.toBe('justgo_runtime');
    expect(new URL(virtual).pathname).not.toBe('/postgres');
  });
  it('rejects malformed virtual options before allowing opaque origin identity', () => {
    for (const connectionString of [
      virtual.replace('sslmode=disable', 'sslmode=require'),
      virtual + '&sslmode=disable',
      virtual + '&host=attacker.invalid',
      virtual + '#ignored',
      virtual.replace(
        '.hyperdrive.local',
        '.hyperdrive.local.attacker.invalid',
      ),
      virtual.replace('postgresql:', 'https:'),
    ])
      expect(() =>
        readWorkerConfig({
          ...hostedBindings,
          HYPERDRIVE: { connectionString },
        }),
      ).toThrow('Invalid Hyperdrive binding');
    for (const connectionString of [
      virtual.replace('?sslmode=disable', ''),
      virtual
        .replace('fixture.hyperdrive.local', 'remote.invalid')
        .replace('?sslmode=disable', ''),
    ])
      expect(() =>
        readWorkerConfig({
          ...hostedBindings,
          HYPERDRIVE: { connectionString },
        }),
      ).toThrow('same role and database');
  });
  it('rejects malformed wrapped transports and connection option overrides', () => {
    for (const invalid of [
      wrapped.replace('postgresql:', 'postgres:'),
      wrapped.replace(':5432/', ':6543/'),
      wrapped.replace(':5432/', '/'),
      wrapped.replace('.workers.alt', '.workers.alt.attacker.invalid'),
      wrapped.replace('d'.repeat(32), 'not-a-virtual-host'),
      wrapped.replace('d'.repeat(32), 'd'.repeat(31)),
      wrapped.replace('d'.repeat(32), 'g'.repeat(32)),
      wrapped.replace('b'.repeat(32), ''),
      wrapped.replace('c'.repeat(32), ''),
      wrapped.replace('e'.repeat(32), ''),
      wrapped.replace('?sslmode=disable', ''),
      wrapped.replace('sslmode=disable', 'sslmode=require'),
      wrapped + '&sslmode=disable',
      wrapped + '&host=attacker.invalid',
      wrapped + '#ignored',
    ])
      expect(() => hyperdrivePoolOptions(invalid)).toThrow(
        'Invalid Hyperdrive binding',
      );
  });
  it.each([
    ['wrapped', wrapped],
    ['virtual', virtual],
  ])(
    'preserves hosted direct role, database, project, TLS and managed Auth requirements for %s transport',
    (_name, connectionString) => {
      for (const override of [
        {
          LOCK_DATABASE_URL: hostedBindings.LOCK_DATABASE_URL.replace(
            'justgo_runtime',
            'postgres',
          ),
        },
        {
          LOCK_DATABASE_URL: hostedBindings.LOCK_DATABASE_URL.replace(
            '/postgres',
            '/other',
          ),
        },
        {
          LOCK_DATABASE_URL: hostedBindings.LOCK_DATABASE_URL.replace(
            'db.fixture.supabase.co',
            'db.foreign.supabase.co',
          ),
        },
        {
          LOCK_DATABASE_URL: hostedBindings.LOCK_DATABASE_URL.replace(
            ':5432/',
            ':6543/',
          ),
        },
        { LOCK_DATABASE_URL: hostedBindings.LOCK_DATABASE_URL + '?host=other' },
        { DATABASE_SSL: 'disable' },
        { MANAGED_AUTH_ENABLED: 'false' },
      ])
        expect(() =>
          readWorkerConfig({
            ...hostedBindings,
            HYPERDRIVE: { connectionString },
            ...override,
          }),
        ).toThrow();
      for (const connectionString of [
        local.replace('justgo_runtime', 'postgres'),
        local.replace('justgo_test', 'other'),
      ])
        expect(() =>
          readWorkerConfig({ ...bindings, HYPERDRIVE: { connectionString } }),
        ).toThrow('same role and database');
    },
  );
  it('rejects incomplete bindings, privileged direct credentials and hosted legacy auth', () => {
    for (const override of [
      { HYPERDRIVE: undefined },
      { LOCK_DATABASE_URL: undefined },
      { LOCK_DATABASE_URL: local.replace('justgo_runtime', 'postgres') },
      { LOCK_DATABASE_URL: local + '?sslmode=disable' },
      { JUSTGO_SOURCE_SHA: undefined },
      { NODE_ENV: 'development' },
      {
        HYPERDRIVE: {
          connectionString: 'postgresql://runtime@remote.invalid/postgres',
        },
        DATABASE_SSL: 'verify-full',
      },
    ])
      expect(() => readWorkerConfig({ ...bindings, ...override })).toThrow();
  });
  it('uses direct transactions only for the complete lock-requiring HTTP operations', () => {
    for (const [method, path] of [
      ['POST', '/v1/%73essions'],
      ['POST', '/v1/sessions'],
      ['POST', '/v1/transfers'],
      ['DELETE', '/v1/transfers/record'],
    ] as const)
      expect(
        needsDirectTransaction(
          new Request('https://api.invalid' + path, { method }),
        ),
      ).toBe(true);
    for (const [method, path] of [
      ['POST', '/v1/auth/session'],
      ['POST', '/v1/%61uth/session'],
      ['POST', '/v1/auth/session/'],
      ['GET', '/v1/auth/session'],
      ['POST', '/v1/attempts'],
      ['DELETE', '/v1/account'],
      ['POST', '/v1/journal'],
      ['GET', '/ready'],
      ['POST', '/v1/transfers/record/approval'],
    ] as const)
      expect(
        needsDirectTransaction(
          new Request('https://api.invalid' + path, { method }),
        ),
      ).toBe(false);
  });
  it.each(['/v1/auth/session', '/v1/sessions', '/v1/%73essions'])(
    'keeps managed exchange and retained recovery on the Hyperdrive transport (%s)',
    async (path) => {
      const database = createWorkerDatabase(
        new Request('https://api.invalid' + path, { method: 'POST' }),
        readWorkerConfig(hostedBindings),
      );
      try {
        expect(database.pool.options.connectionString).toBe(wrapped);
        expect(database.pool.options.ssl).toBeUndefined();
      } finally {
        await database.pool.end();
      }
    },
  );
  it('retains the direct connection for the loopback legacy fixture', async () => {
    const database = createWorkerDatabase(
      new Request('https://api.invalid/v1/sessions', { method: 'POST' }),
      readWorkerConfig(bindings),
    );
    try {
      expect(database.pool.options.connectionString).toBe(local);
      expect(database.pool.options.ssl).toBe(false);
    } finally {
      await database.pool.end();
    }
  });
});
