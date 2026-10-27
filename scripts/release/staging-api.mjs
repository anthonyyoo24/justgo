import { createHash } from 'node:crypto';
import { readFileSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const stagingTarget = Object.freeze({
  repository: 'anthonyyoo24/justgo',
  project: 'prj_j3ubtzyuYsCbpuGjKNmm5dLB8YZB',
  team: 'team_fAS7k1lpUEvk1jtNAz0SJhnq',
  scope: 'anthony-youngshin-yoos-projects',
  alias: 'justgo-two.vercel.app',
  environment: 'justgo-staging',
  reviewer: '51426358',
});

const failureCodes = new Set([
  'STAGING_RUNNER_FAILED',
  'INVALID_STAGING_RELEASE_CONTEXT',
  'FOUNDATION_MAIN_PUSH_REQUIRED',
  'STAGING_OWNER_MAIN_PROTECTION_REQUIRED',
  'INVALID_API_UPLOAD',
  'API_UPLOAD_PATH_MISMATCH',
  'UNSAFE_API_UPLOAD',
  'API_UPLOAD_HASH_MISMATCH',
  'WRONG_STAGING_DEPLOYMENT',
  'UNSAFE_DEPLOYMENT_URL',
  'STAGING_DEPLOYMENT_PROVENANCE_MISMATCH',
  'INVALID_CANDIDATE_RECEIPT',
  'INVALID_STAGING_PROBE',
  'INVALID_STAGING_PROBE_HEADERS',
  'STAGING_AUTH_FENCE_FAILED',
  'STAGING_RUNTIME_IDENTITY_MISMATCH',
  'STAGING_READINESS_FAILED',
  'INVALID_STAGING_GUARD_ARGUMENTS',
  'STAGING_COMMAND_FAILED',
  'STAGING_VERCEL_TOKEN_REQUIRED',
  'STAGING_EXISTING_BYPASS_SECRET_REQUIRED',
  'STAGING_DATABASE_LEASE_LOST',
  'STAGING_BASELINE_SOURCE_REQUIRED',
  'STAGING_SOURCE_NOT_CLEAN',
  'STAGING_BASELINE_CHANGED',
  'PINNED_VERCEL_REQUIRED',
  'STAGING_PROJECT_CONFIGURATION_MISMATCH',
  'CANDIDATE_RECEIPT_PROVENANCE_MISMATCH',
  'STAGING_ALIAS_CHANGED_DURING_CANDIDATE_BUILD',
  'STAGING_ALIAS_CHANGED_BEFORE_PROMOTION',
  'STAGING_PROMOTION_UNCONFIRMED',
]);
const trustedFailures = new WeakMap();

/** A closed diagnostic vocabulary, independent of any provider error text. */
export class StagingRunnerFailure extends Error {
  constructor(code) {
    const safeCode = failureCodes.has(code) ? code : 'STAGING_RUNNER_FAILED';
    super(safeCode);
    trustedFailures.set(this, safeCode);
  }
}

export function stagingRunnerFailureCode(error) {
  return trustedFailures.get(error);
}

export function requireRelease(condition, code) {
  if (!condition) throw new StagingRunnerFailure(code);
}
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
      ['deploy', 'migrate-deploy'].includes(env.RELEASE_OPERATION),
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
      'package-lock.json',
      '.npmrc',
      'tsconfig.base.json',
      'apps/api/package.json',
      'apps/api/tsconfig.json',
      'apps/api/vercel.json',
      'apps/mobile/package.json',
      'packages/contracts/package.json',
      'packages/contracts/tsconfig.json',
      'packages/contracts/tsconfig.build.json',
    ].includes(path) ||
    path.startsWith('apps/api/src/') ||
    path.startsWith('packages/contracts/src/')
  );
}
export function validateUpload(manifest, tracked, root) {
  requireRelease(
    manifest?.framework?.slug === 'fastify' &&
      Array.isArray(manifest.files) &&
      manifest.files.length > 0,
    'INVALID_API_UPLOAD',
  );
  const expected = tracked.filter(productionPath).sort();
  const actual = manifest.files.map((file) => file.path).sort();
  requireRelease(
    JSON.stringify(actual) === JSON.stringify(expected),
    'API_UPLOAD_PATH_MISMATCH',
  );
  for (const file of manifest.files) {
    requireRelease(
      productionPath(file.path) && lstatSync(resolve(root, file.path)).isFile(),
      'UNSAFE_API_UPLOAD',
    );
    requireRelease(
      /^[a-f0-9]{40}$/.test(file.sha ?? '') &&
        createHash('sha1')
          .update(readFileSync(resolve(root, file.path)))
          .digest('hex') === file.sha,
      'API_UPLOAD_HASH_MISMATCH',
    );
  }
  return createHash('sha256')
    .update(
      JSON.stringify(
        manifest.files
          .map(({ path, sha }) => ({ path, sha }))
          .sort((a, b) => a.path.localeCompare(b.path)),
      ),
    )
    .digest('hex');
}
export function validateDeployment(value, context) {
  requireRelease(
    value?.projectId === stagingTarget.project &&
      value.ownerId === stagingTarget.team &&
      /^dpl_[A-Za-z0-9]+$/.test(value.id ?? '') &&
      value.target === 'production' &&
      value.readyState === 'READY' &&
      value.public !== true &&
      JSON.stringify(value.regions) === JSON.stringify(['yul1']),
    'WRONG_STAGING_DEPLOYMENT',
  );
  const url = new URL(`https://${value.url}`);
  requireRelease(
    /^justgo-[a-z0-9]+-anthony-youngshin-yoos-projects\.vercel\.app$/.test(
      url.hostname,
    ) &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password,
    'UNSAFE_DEPLOYMENT_URL',
  );
  if (context)
    requireRelease(
      isSourceSha(context.sha) &&
        value.meta?.justgoSourceSha === context.sha &&
        value.meta?.githubCommitSha === context.sha &&
        value.meta?.justgoRunId === context.runId &&
        value.meta?.justgoRunAttempt === context.attempt,
      'STAGING_DEPLOYMENT_PROVENANCE_MISMATCH',
    );
  return value;
}
/** CLI messages and next-command suggestions are untrusted and never executed. */
export function candidateReceipt(output) {
  let receipt;
  try {
    receipt = JSON.parse(output);
  } catch {
    throw new StagingRunnerFailure('INVALID_CANDIDATE_RECEIPT');
  }
  const value = receipt?.deployment;
  requireRelease(
    receipt?.status === 'ok' &&
      /^dpl_[A-Za-z0-9]+$/.test(value?.id ?? '') &&
      value?.readyState === 'READY' &&
      value?.target === 'production' &&
      typeof value?.url === 'string' &&
      /^https:\/\/justgo-[a-z0-9]+-anthony-youngshin-yoos-projects\.vercel\.app$/.test(
        value.url,
      ),
    'INVALID_CANDIDATE_RECEIPT',
  );
  return { id: value.id, url: value.url };
}
export function validateProbe({ status, headers, body }, kind, sha) {
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
  requireRelease(
    status === 200 &&
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
    'STAGING_READINESS_FAILED',
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
