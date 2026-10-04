import assert from 'node:assert/strict';
import test from 'node:test';
import { journeyEnvironment } from '../e2e/environment.ts';

const fixture = {
  DATABASE_URL:
    'postgresql://justgo_runtime:fixture@127.0.0.1:5432/justgo_test',
  MIGRATION_DATABASE_URL:
    'postgresql://justgo_migrator:fixture@127.0.0.1:5432/justgo_test',
  DATABASE_SSL: 'disable',
};

test('journey fixtures accept only the dedicated loopback database and isolated roles', () => {
  assert.equal(journeyEnvironment(fixture).runtimeUrl, fixture.DATABASE_URL);
  for (const patch of [
    { VERCEL: '1' },
    { NODE_ENV: 'production' },
    { DATABASE_URL: undefined },
    { MIGRATION_DATABASE_URL: 'invalid' },
    {
      DATABASE_URL: fixture.DATABASE_URL.replace('127.0.0.1', 'db.example.com'),
    },
    {
      MIGRATION_DATABASE_URL: fixture.MIGRATION_DATABASE_URL.replace(
        'justgo_test',
        'justgo',
      ),
    },
    { DATABASE_URL: fixture.DATABASE_URL.replace('postgresql:', 'https:') },
    {
      DATABASE_URL: fixture.DATABASE_URL.replace('justgo_runtime', 'postgres'),
    },
    { MIGRATION_DATABASE_URL: fixture.DATABASE_URL },
    {
      MIGRATION_DATABASE_URL: fixture.MIGRATION_DATABASE_URL.replace(
        '5432',
        '6543',
      ),
    },
    { DATABASE_SSL: 'verify-full' },
    { DATABASE_URL: fixture.DATABASE_URL + '?host=db.example.com' },
    {
      MIGRATION_DATABASE_URL: fixture.MIGRATION_DATABASE_URL + '?user=postgres',
    },
    { MIGRATION_DATABASE_URL: fixture.MIGRATION_DATABASE_URL + '?port=5433' },
    { DATABASE_URL: fixture.DATABASE_URL + '#unreviewed' },
  ])
    assert.throws(
      () => journeyEnvironment({ ...fixture, ...patch }),
      /Journey fixtures require/,
    );
});
