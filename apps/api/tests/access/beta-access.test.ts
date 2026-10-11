import { describe, expect, it } from 'vitest';
import { readConfig } from '../../src/config.js';
import { readBetaGrants } from '../../src/access/beta-access.js';

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
