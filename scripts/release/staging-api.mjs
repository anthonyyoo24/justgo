import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const stagingTarget = Object.freeze({
  repository: 'anthonyyoo24/justgo',
  worker: 'justgo-api-staging',
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
  'STAGING_CLOUDFLARE_CONFIGURATION_REQUIRED',
  'STAGING_PROVIDER_REQUEST_FAILED',
  'STAGING_VERSION_UPLOAD_UNCONFIRMED',
  'STAGING_LATEST_VERSION_CHANGED',
  'STAGING_BINDINGS_MISMATCH',
  'STAGING_WORKER_CONFIGURATION_MISMATCH',
  'STAGING_WORKER_NOT_BOOTSTRAPPED',
  'STAGING_HYPERDRIVE_CONFIGURATION_MISMATCH',
  'STAGING_DATABASE_LEASE_LOST',
  'STAGING_BASELINE_SOURCE_REQUIRED',
  'STAGING_SOURCE_NOT_CLEAN',
  'STAGING_BASELINE_CHANGED',
  'PINNED_WRANGLER_REQUIRED',
  'STAGING_PROJECT_CONFIGURATION_MISMATCH',
  'CANDIDATE_RECEIPT_PROVENANCE_MISMATCH',
  'STAGING_ALIAS_CHANGED_DURING_CANDIDATE_BUILD',
  'STAGING_ALIAS_CHANGED_BEFORE_PROMOTION',
  'STAGING_PROMOTION_UNCONFIRMED',
  'STAGING_BOOTSTRAP_UNCONFIRMED',
  'STAGING_BOOTSTRAP_REQUIRES_EMPTY_WORKER',
  'STAGING_BOOTSTRAP_BINDINGS_REQUIRED',
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
      ['deploy', 'migrate-deploy', 'bootstrap'].includes(env.RELEASE_OPERATION),
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
      'apps/api/cloudflare-config.mjs',
      'apps/api/wrangler.jsonc',
      'apps/mobile/package.json',
      'packages/contracts/package.json',
      'packages/contracts/tsconfig.json',
      'packages/contracts/tsconfig.build.json',
    ].includes(path) ||
    path.startsWith('apps/api/src/') ||
    path.startsWith('packages/contracts/src/')
  );
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function isVersionId(value) {
  return typeof value === 'string' && value.length === 36 && uuid.test(value);
}
export function cloudflareTarget(env) {
  requireRelease(
    typeof env.CLOUDFLARE_ACCOUNT_ID === 'string' &&
      /^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID) &&
      env.CLOUDFLARE_ACCOUNT_ID.length === 32 &&
      typeof env.CLOUDFLARE_WORKERS_SUBDOMAIN === 'string' &&
      env.CLOUDFLARE_WORKERS_SUBDOMAIN.length <= 63 &&
      !/[\r\n]/.test(env.CLOUDFLARE_WORKERS_SUBDOMAIN) &&
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
        env.CLOUDFLARE_WORKERS_SUBDOMAIN,
      ) &&
      /^[a-f0-9]{32}$/.test(env.STAGING_HYPERDRIVE_ID ?? '') &&
      env.STAGING_HYPERDRIVE_ID.length === 32 &&
      typeof env.CLOUDFLARE_API_TOKEN === 'string' &&
      env.CLOUDFLARE_API_TOKEN.length > 0 &&
      !/[\r\n]/.test(env.CLOUDFLARE_API_TOKEN),
    'STAGING_CLOUDFLARE_CONFIGURATION_REQUIRED',
  );
  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    worker: stagingTarget.worker,
    subdomain: env.CLOUDFLARE_WORKERS_SUBDOMAIN,
    hyperdriveId: env.STAGING_HYPERDRIVE_ID,
    origin: `https://${stagingTarget.worker}.${env.CLOUDFLARE_WORKERS_SUBDOMAIN}.workers.dev`,
  };
}
export function versionOrigin(id, target) {
  requireRelease(isVersionId(id), 'UNSAFE_DEPLOYMENT_URL');
  return `https://${id.slice(0, 8)}-${target.worker}.${target.subdomain}.workers.dev`;
}
export function validateDeployment(value) {
  const current = value?.deployments?.[0];
  requireRelease(
    isVersionId(current?.id) &&
      current.strategy === 'percentage' &&
      current.versions?.length === 1 &&
      current.versions[0].percentage === 100 &&
      isVersionId(current.versions[0].version_id),
    'WRONG_STAGING_DEPLOYMENT',
  );
  return { id: current.id, versionId: current.versions[0].version_id };
}
export const releaseBindings = Object.freeze([
  'JUSTGO_SOURCE_SHA',
  'APP_ENVIRONMENT',
  'API_SENTRY_RELEASE',
  'JUSTGO_RELEASE_RUN_ID',
  'JUSTGO_RELEASE_RUN_ATTEMPT',
]);
const secretNames = new Set([
  'IDENTITY_RATE_LIMIT_KEY',
  'SUPABASE_AUTH_SECRET_KEY',
  'LOCK_DATABASE_URL',
  'DATABASE_CA_CERT',
  'SUPABASE_PUBLISHABLE_KEY',
  'API_SENTRY_DSN',
  'BETA_ACCESS_GRANTS',
  'BETA_ACCESS_WINDOW',
]);
const textNames = new Set([
  ...releaseBindings,
  'NODE_ENV',
  'SUPABASE_URL',
  'MANAGED_AUTH_ENABLED',
  'API_SENTRY_ENABLED',
  'CORS_ORIGINS',
  'LOG_LEVEL',
  'IDENTITY_SESSION_HOURS',
  'IDENTITY_TRANSFER_MINUTES',
  'IDENTITY_RECOVERY_RATE_LIMIT',
  'ACTIVITY_WRITE_RATE_LIMIT',
  'ACCOUNT_EXPORT_RATE_LIMIT',
  'BETA_ACCESS_GRANTS',
  'BETA_ACCESS_WINDOW',
]);
export function validateVersion(value, target, context) {
  const bindings = value?.resources?.bindings;
  requireRelease(
    isVersionId(value?.id) && Array.isArray(bindings),
    'STAGING_BINDINGS_MISMATCH',
  );
  const names = new Set();
  for (const binding of bindings) {
    requireRelease(!names.has(binding.name), 'STAGING_BINDINGS_MISMATCH');
    names.add(binding.name);
    requireRelease(
      (binding.type === 'secret_text' && secretNames.has(binding.name)) ||
        (binding.type === 'plain_text' &&
          textNames.has(binding.name) &&
          typeof binding.text === 'string') ||
        (binding.type === 'hyperdrive' &&
          binding.name === 'HYPERDRIVE' &&
          binding.id === target.hyperdriveId),
      'STAGING_BINDINGS_MISMATCH',
    );
  }
  const text = (name) =>
    bindings.find((binding) => binding.name === name)?.text;
  for (const name of [
    'IDENTITY_RATE_LIMIT_KEY',
    'SUPABASE_AUTH_SECRET_KEY',
    'LOCK_DATABASE_URL',
    'SUPABASE_PUBLISHABLE_KEY',
  ])
    requireRelease(
      bindings.some(
        (binding) => binding.name === name && binding.type === 'secret_text',
      ),
      'STAGING_BINDINGS_MISMATCH',
    );
  requireRelease(
    names.has('HYPERDRIVE') &&
      text('APP_ENVIRONMENT') === 'staging' &&
      text('NODE_ENV') === 'production' &&
      text('MANAGED_AUTH_ENABLED') === 'true' &&
      isSourceSha(text('JUSTGO_SOURCE_SHA')) &&
      text('SUPABASE_URL') === 'https://kmcpcauaxlgpevkkenwd.supabase.co',
    'STAGING_BINDINGS_MISMATCH',
  );
  if (context)
    requireRelease(
      (value.metadata?.has_preview === true ||
        value.metadata?.hasPreview === true) &&
        text('JUSTGO_SOURCE_SHA') === context.sha &&
        text('API_SENTRY_RELEASE') === context.sha &&
        text('JUSTGO_RELEASE_RUN_ID') === context.runId &&
        text('JUSTGO_RELEASE_RUN_ATTEMPT') === context.attempt,
      'STAGING_DEPLOYMENT_PROVENANCE_MISMATCH',
    );
  return { id: value.id, sourceSha: text('JUSTGO_SOURCE_SHA'), bindings };
}
export function uploadBindings(baseline, context) {
  return [
    ...baseline.bindings
      .filter((binding) => !releaseBindings.includes(binding.name))
      .map((binding) =>
        binding.type === 'secret_text'
          ? { name: binding.name, type: 'inherit' }
          : binding,
      ),
    ...Object.entries({
      APP_ENVIRONMENT: 'staging',
      JUSTGO_SOURCE_SHA: context.sha,
      API_SENTRY_RELEASE: context.sha,
      JUSTGO_RELEASE_RUN_ID: context.runId,
      JUSTGO_RELEASE_RUN_ATTEMPT: context.attempt,
    }).map(([name, text]) => ({ name, type: 'plain_text', text })),
  ];
}
export function validateBindingPreservation(baseline, candidate) {
  const stable = (bindings) =>
    bindings
      .filter((binding) => !releaseBindings.includes(binding.name))
      .map(({ name, type, id, text }) => ({
        name,
        type,
        ...(id ? { id } : {}),
        ...(type === 'plain_text' ? { text } : {}),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  requireRelease(
    JSON.stringify(stable(baseline.bindings)) ===
      JSON.stringify(stable(candidate.bindings)),
    'STAGING_BINDINGS_MISMATCH',
  );
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
