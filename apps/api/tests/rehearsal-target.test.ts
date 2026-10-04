import { expect, it } from 'vitest';
import { localTestDatabaseUrl } from '../scripts/local-test-database.js';

it.each([
  undefined,
  'not-a-url-private',
  'https://localhost/justgo_test',
  'postgresql://remote.example/justgo_test',
  'postgresql://localhost/valuable',
  'postgresql://localhost/justgo_test?host=remote.example',
  'postgresql://localhost/justgo_test?dbname=valuable',
  'postgresql://localhost/justgo_test?user=postgres',
  'postgresql://localhost/justgo_test#private',
])('rejects unsafe migration target without exposing its input', (value) => {
  expect(() => localTestDatabaseUrl(value)).toThrow(
    'plain connection to dedicated loopback justgo_test',
  );
  try {
    localTestDatabaseUrl(value);
  } catch (error) {
    expect(String(error)).not.toContain(value ?? 'undefined');
  }
});
it.each(['localhost', '127.0.0.1'])(
  'accepts the dedicated test database at %s',
  (host) => {
    expect(
      localTestDatabaseUrl(
        `postgresql://justgo_migrator:fixture@${host}:54329/justgo_test`,
      ).hostname,
    ).toBe(host);
  },
);
