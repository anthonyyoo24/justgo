import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const stagingTarget = Object.freeze({
  repository: 'anthonyyoo24/justgo',
  environment: 'justgo-staging',
  reviewer: '51426358',
});

const failureCodes = new Set([
  'STAGING_RUNNER_FAILED',
  'INVALID_STAGING_RELEASE_CONTEXT',
  'INVALID_LOCAL_STAGING_CONTEXT',
  'FOUNDATION_MAIN_PUSH_REQUIRED',
  'STAGING_OWNER_MAIN_PROTECTION_REQUIRED',
  'INVALID_API_UPLOAD',
  'API_UPLOAD_PATH_MISMATCH',
  'UNSAFE_API_UPLOAD',
  'INVALID_STAGING_PROBE',
  'INVALID_STAGING_PROBE_HEADERS',
  'STAGING_AUTH_FENCE_FAILED',
  'STAGING_RUNTIME_IDENTITY_MISMATCH',
  'STAGING_HEALTH_FAILED',
  'STAGING_READINESS_FAILED',
  'INVALID_STAGING_GUARD_ARGUMENTS',
  'STAGING_COMMAND_FAILED',
  'STAGING_DATABASE_LEASE_LOST',
  'STAGING_SOURCE_NOT_CLEAN',
  'STAGING_SOURCE_NOT_TAGGED',
  'INVALID_RELEASE_SOURCE',
  'STAGING_SUPABASE_CONFIGURATION_REQUIRED',
  'STAGING_SUPABASE_DEPLOY_UNCONFIRMED',
  'STAGING_SUPABASE_SECRETS_REJECTED',
  'STAGING_SUPABASE_SECRETS_UNCONFIRMED',
  // One per rule in functionSecretRules, so a refusal names its field.
  ...[
    'NODE_ENV',
    'APP_ENVIRONMENT',
    'MANAGED_AUTH_ENABLED',
    'DATABASE_SSL',
    'IDENTITY_RATE_LIMIT_KEY',
    'LOG_LEVEL',
    'API_SENTRY_ENABLED',
    'API_SENTRY_DSN',
    'IDENTITY_SESSION_HOURS',
    'IDENTITY_TRANSFER_MINUTES',
    'IDENTITY_RECOVERY_RATE_LIMIT',
    'ACTIVITY_WRITE_RATE_LIMIT',
    'ACCOUNT_EXPORT_RATE_LIMIT',
    'BETA_ACCESS_WINDOW',
    'BETA_ACCESS_GRANTS',
  ].map((name) => `STAGING_SUPABASE_SECRET_${name}_INVALID`),
]);
const trustedFailures = new WeakMap();

/** A closed diagnostic vocabulary, independent of any provider error text. */
export class StagingRunnerFailure extends Error {
  constructor(code) {
    const safeCode = failureCodes.has(code) ? code : 'STAGING_RUNNER_FAILED';
    super(safeCode);
    trustedFailures.set(this, { code: safeCode });
  }
}

export function stagingRunnerFailureCode(error) {
  return trustedFailures.get(error)?.code;
}

export function requireRelease(condition, code) {
  if (!condition) throw new StagingRunnerFailure(code);
}
/**
 * `previousApiSha` when the project has no `api` function yet. The database
 * guard accepts it only while the applied migration history is empty.
 */
export const noPreviousApi = 'none';
export function isSourceSha(value) {
  return (
    typeof value === 'string' &&
    value.length === 40 &&
    /^[a-f0-9]{40}$/.test(value)
  );
}
export function releaseContext(env = process.env) {
  requireRelease(
    env.GITHUB_ACTIONS === 'true' &&
      env.GITHUB_REPOSITORY === stagingTarget.repository &&
      env.GITHUB_REF === 'refs/heads/main' &&
      isSourceSha(env.RELEASE_SHA) &&
      /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') &&
      /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? '') &&
      ['deploy', 'migrate-deploy', 'secrets'].includes(env.RELEASE_OPERATION),
    'INVALID_STAGING_RELEASE_CONTEXT',
  );
  return {
    sha: env.RELEASE_SHA,
    runId: env.GITHUB_RUN_ID,
    attempt: env.GITHUB_RUN_ATTEMPT,
  };
}
export function validateFoundation(value, sha) {
  const run = value?.workflow_runs?.[0];
  requireRelease(
    isSourceSha(sha) &&
      run?.head_sha === sha &&
      run.head_branch === 'main' &&
      run.event === 'push' &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'FOUNDATION_MAIN_PUSH_REQUIRED',
  );
}
export function validateStagingEnvironment(environment, policies, reviewerId) {
  const reviews = environment?.protection_rules?.filter(
    (rule) => rule.type === 'required_reviewers',
  );
  requireRelease(
    environment?.name === stagingTarget.environment &&
      environment.deployment_branch_policy?.custom_branch_policies === true &&
      reviews?.length === 1 &&
      reviews[0].reviewers?.length === 1 &&
      reviews[0].reviewers[0].type === 'User' &&
      String(reviews[0].reviewers[0].reviewer?.id) === reviewerId &&
      reviewerId === stagingTarget.reviewer &&
      policies?.total_count === 1 &&
      policies.branch_policies?.length === 1 &&
      policies.branch_policies[0].name === 'main' &&
      policies.branch_policies[0].type === 'branch',
    'STAGING_OWNER_MAIN_PROTECTION_REQUIRED',
  );
}

export function productionPath(path) {
  if (
    typeof path !== 'string' ||
    path.startsWith('/') ||
    path.split('/').some((p) => !p || p === '.' || p === '..')
  )
    return false;
  if (
    /\.(?:test|spec)\.|(?:^|\/)(?:__tests__|__mocks__|test-support|dist|\.env[^/]*)(?:\/|$)|\.(?:key|pem|p8|p12|mobileprovision)$/.test(
      path,
    )
  )
    return false;
  return (
    [
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      '.npmrc',
      'tsconfig.base.json',
      'apps/api/package.json',
      'apps/api/tsconfig.json',
      'apps/mobile/package.json',
      'packages/contracts/package.json',
      'packages/contracts/tsconfig.json',
      'packages/contracts/tsconfig.build.json',
    ].includes(path) ||
    path.startsWith('apps/api/src/') ||
    path.startsWith('packages/contracts/src/')
  );
}
export function validateProbe({ status, headers, body }, kind, sha) {
  requireRelease(
    Number.isInteger(status) && status >= 100 && status <= 599,
    'INVALID_STAGING_PROBE',
  );
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    throw new StagingRunnerFailure('INVALID_STAGING_PROBE');
  }
  requireRelease(
    headers['cache-control'] === 'no-store' &&
      /^application\/json(?:;|$)/.test(headers['content-type'] ?? '') &&
      /^[a-f0-9-]{36}$/.test(headers['x-request-id'] ?? ''),
    'INVALID_STAGING_PROBE_HEADERS',
  );
  if (kind === 'unauthorized') {
    requireRelease(
      status === 401 &&
        value.code === 'UNAUTHORIZED' &&
        value.requestId === headers['x-request-id'] &&
        Object.keys(value).length === 2,
      'STAGING_AUTH_FENCE_FAILED',
    );
    return;
  }
  const endpointFailure =
    kind === 'health' ? 'STAGING_HEALTH_FAILED' : 'STAGING_READINESS_FAILED';
  // Startup failures may omit release headers. A failed endpoint is not proof
  // of identity drift; compare identity only after it reports HTTP success.
  requireRelease(status === 200, endpointFailure);
  requireRelease(
    headers['x-justgo-source-sha'] === sha &&
      headers['x-justgo-environment'] === 'staging',
    'STAGING_RUNTIME_IDENTITY_MISMATCH',
  );
  requireRelease(
    kind === 'health'
      ? value.status === 'ok' &&
          value.service === 'justgo-api' &&
          Object.keys(value).length === 2
      : kind === 'ready' &&
          value.status === 'ready' &&
          Object.keys(value).length === 1,
    endpointFailure,
  );
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    const [operation, ...paths] = process.argv.slice(2);
    const values = paths.map((path) => JSON.parse(readFileSync(path, 'utf8')));
    if (operation === 'checks' && values.length === 1)
      validateFoundation(values[0], process.env.RELEASE_SHA);
    else if (operation === 'environment' && values.length === 2)
      validateStagingEnvironment(
        values[0],
        values[1],
        process.env.EXPECTED_REVIEWER_ID,
      );
    else throw new StagingRunnerFailure('INVALID_STAGING_GUARD_ARGUMENTS');
  } catch {
    console.error('Staging release prerequisite failed.');
    process.exitCode = 1;
  }
}
