import { describe, expect, it } from 'vitest';
import {
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
      ['POST', '/v1/auth/session'],
      ['POST', '/v1/%61uth/session'],
      ['POST', '/v1/%73essions'],
      ['POST', '/v1/auth/session/'],
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
});
