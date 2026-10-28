import { describe, expect, it } from 'vitest';
import { readConfig } from '../../src/config.js';

const dsn = `https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/4512345678901234`;
const release = 'b'.repeat(40);

describe('API diagnostic configuration', () => {
  it('disables delivery by default and ignores dormant provider values', () => {
    expect(readConfig({}).API_SENTRY).toBeNull();
    expect(
      readConfig({
        API_SENTRY_DSN: 'private-invalid',
        API_SENTRY_RELEASE: 'private-invalid',
      }).API_SENTRY,
    ).toBeNull();
  });

  it.each(['staging', 'production'])(
    'accepts canonical US ingestion and a reviewed source in %s',
    (environment) => {
      expect(
        readConfig({
          APP_ENVIRONMENT: environment,
          API_SENTRY_ENABLED: 'true',
          API_SENTRY_DSN: dsn,
          API_SENTRY_RELEASE: release,
        }).API_SENTRY,
      ).toEqual({
        dsn,
        endpoint:
          'https://o123.ingest.us.sentry.io/api/4512345678901234/envelope/',
        environment,
        release: `justgo-api@${release}`,
      });
    },
  );

  it.each([
    undefined,
    '',
    dsn.replace('https:', 'http:'),
    dsn.replace('.us.', '.de.'),
    dsn.replace('sentry.io', 'sentry.io.private.example'),
    dsn.replace('sentry.io', 'example.com'),
    dsn.replace('@', ':private@'),
    dsn.replace('@', '%40'),
    dsn.replace('sentry.io/', 'sentry.io:443/'),
    dsn.replace('o123', 'o0123'),
    `${dsn}/`,
    `${dsn}?private=value`,
    `${dsn}#private`,
    `${dsn}\n`,
    `${dsn}/other`,
    dsn.replace('4512345678901234', 'private'),
  ])(
    'fails closed for an invalid enabled DSN without disclosing its contents',
    (value) => {
      expect(() =>
        readConfig({
          API_SENTRY_ENABLED: 'true',
          API_SENTRY_DSN: value,
          API_SENTRY_RELEASE: release,
        }),
      ).toThrow('Invalid API Sentry configuration');
    },
  );

  it.each([
    undefined,
    '',
    'private',
    'a'.repeat(39),
    'a'.repeat(41),
    'A'.repeat(40),
    `${release}\n`,
  ])('requires an exact reviewed source release', (value) => {
    expect(() =>
      readConfig({
        API_SENTRY_ENABLED: 'true',
        API_SENTRY_DSN: dsn,
        API_SENTRY_RELEASE: value,
      }),
    ).toThrow('Invalid API Sentry configuration');
  });

  it('rejects ambiguous activation and invalid optional deployed source identity', () => {
    expect(() => readConfig({ API_SENTRY_ENABLED: '1' })).toThrow(
      'Invalid API environment configuration',
    );
    expect(readConfig({ JUSTGO_SOURCE_SHA: release }).JUSTGO_SOURCE_SHA).toBe(
      release,
    );
    for (const value of ['private', `${release}\n`, 'A'.repeat(40)])
      expect(() => readConfig({ JUSTGO_SOURCE_SHA: value })).toThrow(
        'Invalid API environment configuration',
      );
  });
});
