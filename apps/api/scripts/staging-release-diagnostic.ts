import { stagingRunnerFailureCode } from '../../../scripts/release/staging-api-runner.mjs';
import { sqlState } from '../src/http/diagnostics.js';
import { StagingReleaseFailure } from './staging-release-guard.js';

/** Only our branded runner codes, existing DB reasons and SQLSTATE are public. */
export function stagingReleaseDiagnostic(error: unknown) {
  const code = stagingRunnerFailureCode(error);
  const state = sqlState(error);
  return {
    event: 'staging_release_failed',
    ...(code ? { code } : {}),
    ...(error instanceof StagingReleaseFailure ? { reason: error.reason } : {}),
    ...(state ? { sqlState: state } : {}),
  };
}
