import { diagnosticConfiguration } from './configuration';
const dsn = `https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/4512279181459456`;
it('requires explicit enablement, environment and the configured US project', () => {
  expect(diagnosticConfiguration('true', dsn, 'staging')).toEqual({
    dsn,
    endpoint: 'https://o123.ingest.us.sentry.io/api/4512279181459456/envelope/',
    environment: 'staging',
  });
  for (const enabled of [undefined, '', 'false', '1'])
    expect(diagnosticConfiguration(enabled, dsn, 'staging')).toBeNull();
  for (const environment of [undefined, '', 'preview'])
    expect(diagnosticConfiguration('true', dsn, environment)).toBeNull();
});
it.each([
  undefined,
  '',
  'not a url',
  'http://example.com',
  dsn.replace('https:', 'http:'),
  dsn.replace('sentry.io', 'example.com'),
  dsn.replace('.us.', '.de.'),
  dsn.replace('4512279181459456', '456'),
  dsn + '?secret=no',
  dsn + '#secret',
  dsn.replace('@', ':secret@'),
  dsn.replace('.io/', '.io:444/'),
  dsn.replace('a'.repeat(32), 'bad-key'),
])('refuses invalid or redirected ingestion configuration %s', (value) => {
  expect(diagnosticConfiguration('true', value, 'staging')).toBeNull();
});
