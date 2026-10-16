import { describe, expect, it } from 'vitest';
import { readConfig } from '../../src/config.js';
import {
  readBetaAccessWindow,
  readBetaGrants,
} from '../../src/access/beta-access.js';

const grant = {
  userId: '00000000-0000-4000-8000-000000000001',
  startsAt: '2026-10-01T00:00:00.000Z',
  expiresAt: '2026-11-01T00:00:00.000Z',
};
describe('operator beta configuration', () => {
  it('defaults to production with no grants and requires explicit staging', () => {
    expect(readConfig({})).toMatchObject({
      APP_ENVIRONMENT: 'production',
      BETA_ACCESS_GRANTS: [],
      BETA_ACCESS_WINDOW: null,
    });
    expect(() =>
      readConfig({ BETA_ACCESS_GRANTS: JSON.stringify([grant]) }),
    ).toThrow('only in staging');
    expect(
      readConfig({
        APP_ENVIRONMENT: 'staging',
        BETA_ACCESS_GRANTS: JSON.stringify([grant]),
      }).BETA_ACCESS_GRANTS,
    ).toEqual([grant]);
  });
  it('requires explicit staging for bounded automatic test access', () => {
    const window = { startsAt: grant.startsAt, expiresAt: grant.expiresAt };
    expect(() =>
      readConfig({ BETA_ACCESS_WINDOW: JSON.stringify(window) }),
    ).toThrow('only in staging');
    expect(
      readConfig({
        APP_ENVIRONMENT: 'staging',
        BETA_ACCESS_WINDOW: JSON.stringify(window),
      }),
    ).toMatchObject({ BETA_ACCESS_WINDOW: window, BETA_ACCESS_GRANTS: [] });
    expect(readBetaAccessWindow('null')).toBeNull();
  });
  it.each([
    'not json',
    '{}',
    '[]',
    JSON.stringify({ startsAt: grant.startsAt }),
    JSON.stringify({ startsAt: 'not-a-date', expiresAt: grant.expiresAt }),
    JSON.stringify({ startsAt: grant.expiresAt, expiresAt: grant.startsAt }),
    JSON.stringify({ startsAt: grant.startsAt, expiresAt: grant.startsAt }),
    JSON.stringify({
      startsAt: grant.startsAt,
      expiresAt: grant.expiresAt,
      premium: true,
    }),
  ])(
    'rejects invalid automatic access windows without exposing values',
    (value) => {
      expect(() => readBetaAccessWindow(value)).toThrow(
        /^Invalid beta access window configuration$/,
      );
    },
  );
  it.each([
    'not json',
    '{}',
    JSON.stringify([{ ...grant, userId: 'not-a-uuid' }]),
    JSON.stringify([{ ...grant, expiresAt: grant.startsAt }]),
    JSON.stringify([{ ...grant, revokedAt: '2026-09-01T00:00:00.000Z' }]),
    JSON.stringify([{ ...grant, premium: true }]),
    JSON.stringify([grant, grant]),
  ])('rejects invalid grants without exposing their values', (value) => {
    expect(() => readBetaGrants(value)).toThrow(
      /^Invalid beta access configuration$/,
    );
  });
  it('rejects unknown application environments', () => {
    expect(() => readConfig({ APP_ENVIRONMENT: 'public' })).toThrow(
      'Invalid API environment',
    );
  });
});
