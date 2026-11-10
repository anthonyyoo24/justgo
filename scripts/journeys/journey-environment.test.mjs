import assert from 'node:assert/strict';
import test from 'node:test';
import {
  journeyApiPath,
  journeyEnvironment,
  journeyServiceUrls,
} from '../../e2e/support/environment.ts';

test('parallel worktree journey ports remain loopback, distinct and bounded', () => {
  assert.deepEqual(journeyServiceUrls({}), {
    api: 'http://127.0.0.1:3000',
    app: 'http://127.0.0.1:8081',
  });
  assert.deepEqual(
    journeyServiceUrls({
      JUSTGO_JOURNEY_API_PORT: '3002',
      JUSTGO_JOURNEY_APP_PORT: '8083',
    }),
    { api: 'http://127.0.0.1:3002', app: 'http://127.0.0.1:8083' },
  );
  for (const value of [
    '0',
    '80',
    '65536',
    '3002.5',
    'https://example.com',
    '3002junk',
    '',
  ])
    assert.throws(() => journeyServiceUrls({ JUSTGO_JOURNEY_API_PORT: value }));
  assert.throws(() => journeyServiceUrls({ JUSTGO_JOURNEY_API_PORT: '8081' }));
});

const prefix = '/functions/v1/api';

test('a fixture API path prefix never changes the loopback host or port', () => {
  for (const value of [undefined, ''])
    assert.equal(
      journeyServiceUrls({ JUSTGO_JOURNEY_API_PREFIX: value }).api,
      'http://127.0.0.1:3000',
    );
  for (const value of [prefix, '/api', '/edge_functions/v1/api-2']) {
    const urls = journeyServiceUrls({
      JUSTGO_JOURNEY_API_PORT: '3002',
      JUSTGO_JOURNEY_APP_PORT: '8083',
      JUSTGO_JOURNEY_API_PREFIX: value,
    });
    assert.deepEqual(urls, {
      api: `http://127.0.0.1:3002${value}`,
      app: 'http://127.0.0.1:8083',
    });
    assert.equal(new URL(urls.api).origin, 'http://127.0.0.1:3002');
    assert.equal(new URL(urls.api).pathname, value);
  }
  for (const value of [
    '@hosted.example/functions/v1/api',
    ':80@hosted.example/functions/v1/api',
    '.hosted.example/functions/v1/api',
    '//hosted.example/functions/v1/api',
    'https://hosted.example/functions/v1/api',
    '/functions/v1/api@hosted.example',
    '/functions/../api',
    '/functions/%2e%2e/api',
    '/functions\\v1',
    '/functions/v1/api/',
    '/functions//api',
    '/functions/v1/api?next=/v1/',
    '/functions/v1/api#v1',
    'functions/v1/api',
    ' /functions/v1/api',
    '/',
  ])
    assert.throws(
      () => journeyServiceUrls({ JUSTGO_JOURNEY_API_PREFIX: value }),
      /Journey fixtures require a plain API path prefix/,
      value,
    );
});

test('only a URL under the fixture API base has a fixture API path', () => {
  const root = 'http://127.0.0.1:3000';
  const prefixed = `${root}${prefix}`;
  assert.equal(
    journeyApiPath(`${root}/v1/sessions?next=/v1/`, root),
    '/v1/sessions',
  );
  assert.equal(journeyApiPath(`${root}/ready`, root), '/ready');
  assert.equal(
    journeyApiPath(`${prefixed}/v1/progress/calendar?month=2026-11`, prefixed),
    '/v1/progress/calendar',
  );
  assert.equal(
    journeyApiPath(`${prefixed}/__fixtures/accounts`, prefixed),
    '/__fixtures/accounts',
  );
  for (const base of [root, prefixed])
    for (const url of [
      `https://hosted.example${prefix}/v1/sessions`,
      `http://hosted.example:3000${prefix}/v1/sessions`,
      `http://127.0.0.1:3000@hosted.example${prefix}/v1/sessions`,
      `http://127.0.0.1.hosted.example:3000${prefix}/v1/sessions`,
      `http://localhost:3000${prefix}/v1/sessions`,
      `http://127.0.0.1:3001${prefix}/v1/sessions`,
      `https://127.0.0.1:3000${prefix}/v1/sessions`,
    ])
      assert.equal(journeyApiPath(url, base), null, `${url} under ${base}`);
  for (const url of [
    `${root}/v1/sessions`,
    `${root}/functions/v1/apix/v1/sessions`,
    `${root}/functions/v1/v1/sessions`,
    `${root}/other${prefix}/v1/sessions`,
    `${prefixed}/../v1/sessions`,
    `${prefixed}/%2e%2e/v1/sessions`,
    `${root}/v1/sessions?base=${prefix}/v1/`,
    prefixed,
  ])
    assert.equal(journeyApiPath(url, prefixed), null, url);
});

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
