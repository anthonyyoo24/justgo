import { describe, expect, it } from 'vitest';
import { StagingRunnerFailure } from '../../../../scripts/release/staging-api-runner.mjs';
import { stagingReleaseDiagnostic } from '../../scripts/staging-release-diagnostic.js';
import { StagingReleaseFailure } from '../../scripts/staging-release-guard.js';

describe('public staging release failure diagnostics', () => {
  it.each([
    'STAGING_COMMAND_FAILED',
    'STAGING_BASELINE_CHANGED',
    'STAGING_DATABASE_LEASE_LOST',
    'STAGING_SOURCE_NOT_CLEAN',
    'STAGING_PROMOTION_UNCONFIRMED',
  ])(
    'logs the exact branded %s classification without its mutable message',
    (code) => {
      const error = Object.assign(new StagingRunnerFailure(code), {
        message: 'PRIVATE_PROVIDER_CREDENTIAL',
        code: 'PRIVATE_PROVIDER_CREDENTIAL',
        stdout: 'PRIVATE_PROVIDER_CREDENTIAL',
        stderr: 'PRIVATE_PROVIDER_CREDENTIAL',
      });
      expect(JSON.stringify(stagingReleaseDiagnostic(error))).toBe(
        `{"event":"staging_release_failed","code":"${code}"}`,
      );
    },
  );

  it.each([
    new Error('PRIVATE_PROVIDER_CREDENTIAL'),
    new Error('STAGING_PROMOTION_UNCONFIRMED'),
    new SyntaxError('Unexpected token PRIVATE_PROVIDER_CREDENTIAL'),
    {
      message: 'PRIVATE_PROVIDER_CREDENTIAL',
      code: 'PRIVATE_PROVIDER_CREDENTIAL',
    },
    { message: 'STAGING_BASELINE_CHANGED', code: 'STAGING_BASELINE_CHANGED' },
    { promotionPhase: 'public-probes', causeCode: 'STAGING_HEALTH_FAILED' },
    Object.create(StagingRunnerFailure.prototype) as unknown,
    undefined,
    null,
  ])('drops untrusted provider, JSON and lookalike error text', (error) => {
    expect(JSON.stringify(stagingReleaseDiagnostic(error))).toBe(
      '{"event":"staging_release_failed"}',
    );
  });

  it('logs only trusted promotion phase and inner code despite mutable public fields', () => {
    const cause = Object.assign(
      new StagingRunnerFailure('STAGING_READINESS_FAILED'),
      {
        message: 'PRIVATE_PROVIDER_CREDENTIAL',
      },
    );
    const error = Object.assign(
      new StagingRunnerFailure('STAGING_PROMOTION_UNCONFIRMED', {
        phase: 'public-probes',
        cause,
      }),
      {
        promotionPhase: 'PRIVATE_PROVIDER_CREDENTIAL',
        causeCode: 'PRIVATE_PROVIDER_CREDENTIAL',
        message: 'PRIVATE_PROVIDER_CREDENTIAL',
      },
    );
    expect(stagingReleaseDiagnostic(error)).toEqual({
      event: 'staging_release_failed',
      code: 'STAGING_PROMOTION_UNCONFIRMED',
      promotionPhase: 'public-probes',
      causeCode: 'STAGING_READINESS_FAILED',
    });
  });

  it('preserves phase without exposing unbranded provider error properties', () => {
    const error = new StagingRunnerFailure('STAGING_PROMOTION_UNCONFIRMED', {
      phase: 'deployment-readback',
      cause: {
        code: 'STAGING_PROVIDER_REQUEST_FAILED',
        message: 'PRIVATE_PROVIDER_CREDENTIAL',
      },
    });
    expect(stagingReleaseDiagnostic(error)).toEqual({
      event: 'staging_release_failed',
      code: 'STAGING_PROMOTION_UNCONFIRMED',
      promotionPhase: 'deployment-readback',
    });
  });

  it('keeps the existing database reason and validated SQLSTATE without query or credential details', () => {
    const error = Object.assign(
      new StagingReleaseFailure('restricted_migrator_required'),
      {
        cause: {
          code: '08006',
          query: 'PRIVATE_PROVIDER_CREDENTIAL',
          detail: 'PRIVATE_PROVIDER_CREDENTIAL',
        },
      },
    );
    expect(JSON.stringify(stagingReleaseDiagnostic(error))).toBe(
      '{"event":"staging_release_failed","reason":"restricted_migrator_required","sqlState":"08006"}',
    );
    expect(
      stagingReleaseDiagnostic({
        code: '08006',
        detail: 'PRIVATE_PROVIDER_CREDENTIAL',
      }),
    ).toEqual({
      event: 'staging_release_failed',
      sqlState: '08006',
    });
  });
});
