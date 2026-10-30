import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { promoteStagingCandidate } from './staging-promotion.mjs';
import { buildStagingWorker } from './staging-worker-build.mjs';
import { cloudflareRequest, workerProbe } from './staging-cloudflare.mjs';
import {
  releaseContext,
  requireRelease,
  cloudflareTarget,
  validateDeployment,
  validateVersion,
  validateBindingPreservation,
  uploadBindings,
  versionOrigin,
  validateProbe,
  validateWorkerSettings,
  isVersionId,
  StagingRunnerFailure,
} from './staging-api.mjs';
export {
  StagingRunnerFailure,
  stagingRunnerFailureCode,
} from './staging-api.mjs';

const executeFile = promisify(execFile);
export async function privateCommand(command, args, options = {}) {
  try {
    const result = await executeFile(command, args, {
      encoding: 'utf8',
      timeout: 12 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
      ...options,
    });
    return result.stdout;
  } catch {
    throw new StagingRunnerFailure('STAGING_COMMAND_FAILED');
  }
}
export function validateHyperdrive(value, target) {
  requireRelease(
    value?.id === target.hyperdriveId &&
      value.caching?.disabled === true &&
      value.origin?.host === 'db.kmcpcauaxlgpevkkenwd.supabase.co' &&
      value.origin?.database === 'postgres' &&
      value.origin?.user === 'justgo_runtime' &&
      value.origin?.port === 5432 &&
      ['postgres', 'postgresql'].includes(value.origin?.scheme) &&
      value.mtls?.sslmode === 'verify-full' &&
      typeof value.mtls.ca_certificate_id === 'string' &&
      value.mtls.ca_certificate_id.length > 0 &&
      value.origin_connection_limit === 5,
    'STAGING_HYPERDRIVE_CONFIGURATION_MISMATCH',
  );
}
/**
 * Preflight a clean source/live baseline, or upload, probe and promote its successor.
 * Deploy requires the captured baseline and a final beforePromote lease/guard check.
 * Promotion is attempted once; uncertain results require readback, never an automatic
 * retry or rollback. Return verified provenance and remove temporary bundle files.
 */
export async function stagingApi(
  operation,
  {
    env = process.env,
    run = privateCommand,
    root = process.cwd(),
    signal,
    beforePromote,
    wait = pause,
    promote = promoteStagingCandidate,
    request = cloudflareRequest,
    probe = workerProbe,
    build = buildStagingWorker,
    summary = (text) => {
      if (env.GITHUB_STEP_SUMMARY)
        appendFileSync(env.GITHUB_STEP_SUMMARY, text);
    },
  } = {},
) {
  let promotionAttempted = false;
  let directory;
  const context = releaseContext(env);
  const target = cloudflareTarget(env);
  const alive = () =>
    requireRelease(!signal?.aborted, 'STAGING_DATABASE_LEASE_LOST');
  const api = async (path, options = {}) => {
    alive();
    return request(target, path, {
      token: env.CLOUDFLARE_API_TOKEN,
      signal,
      ...options,
    });
  };
  const current = async () => validateDeployment(await api('/deployments'));
  const latestIs = async (id) => {
    const versions = await api('/versions');
    requireRelease(
      versions?.items?.[0]?.id === id,
      'STAGING_LATEST_VERSION_CHANGED',
    );
  };
  try {
    try {
      validateHyperdrive(
        await api(`/hyperdrive/configs/${target.hyperdriveId}`),
        target,
      );
      requireRelease(
        (await api('/workers/subdomain')).subdomain === target.subdomain,
        'STAGING_WORKER_CONFIGURATION_MISMATCH',
      );
      validateWorkerSettings(await api('/script-settings'));
      const subdomain = await api('/subdomain');
      requireRelease(
        subdomain?.enabled === true && subdomain.previews_enabled === true,
        'STAGING_WORKER_CONFIGURATION_MISMATCH',
      );
      const baseline = await current();
      const previous = validateVersion(
        await api(`/versions/${baseline.versionId}`),
        target,
      );
      await latestIs(previous.id);
      requireRelease(
        (
          await run('git', ['rev-parse', 'HEAD'], { cwd: root, signal })
        ).trim() === context.sha &&
          !(
            await run('git', ['status', '--porcelain'], { cwd: root, signal })
          ).trim(),
        'STAGING_SOURCE_NOT_CLEAN',
      );
      if (operation === 'preflight')
        return { deploymentId: baseline.id, sourceSha: previous.sourceSha };
      requireRelease(
        operation === 'deploy' &&
          typeof beforePromote === 'function' &&
          env.STAGING_BASELINE_ID === baseline.id &&
          env.STAGING_BASELINE_SHA === previous.sourceSha,
        'STAGING_BASELINE_CHANGED',
      );
      directory = mkdtempSync(join(env.RUNNER_TEMP, 'justgo-worker-release-'));
      const bundle = await build({
        root,
        directory,
        target,
        context,
        env,
        signal,
        run,
      });
      alive();
      requireRelease(
        (await current()).id === baseline.id,
        'STAGING_ALIAS_CHANGED_DURING_CANDIDATE_BUILD',
      );
      await latestIs(previous.id);
      const configuration = bundle.configuration;
      const metadata = {
        main_module: 'worker.js',
        bindings: uploadBindings(previous, context),
        compatibility_date: configuration.compatibility_date,
        compatibility_flags: configuration.compatibility_flags,
        placement: { mode: 'targeted', region: configuration.placement.region },
        annotations: {
          'workers/tag': context.sha,
          'workers/message': `JustGO ${context.sha} GitHub ${context.runId}/${context.attempt}`,
        },
      };
      const form = new FormData();
      form.set('metadata', JSON.stringify(metadata));
      form.set(
        'worker.js',
        new Blob([bundle.content], { type: 'application/javascript+module' }),
        'worker.js',
      );
      const uploaded = await api('/versions?bindings_inherit=strict', {
        method: 'POST',
        body: form,
      });
      requireRelease(isVersionId(uploaded?.id), 'INVALID_CANDIDATE_RECEIPT');
      const candidate = validateVersion(
        await api(`/versions/${uploaded.id}`),
        target,
        context,
      );
      requireRelease(
        candidate.id === uploaded.id,
        'CANDIDATE_RECEIPT_PROVENANCE_MISMATCH',
      );
      validateBindingPreservation(previous, candidate);
      await latestIs(candidate.id);
      requireRelease(
        (await current()).id === baseline.id,
        'STAGING_ALIAS_CHANGED_DURING_CANDIDATE_BUILD',
      );
      const check = async (origin, path, kind) => {
        alive();
        validateProbe(await probe(origin, path, { signal }), kind, context.sha);
      };
      const checkEndpoints = async (origin) => {
        await check(origin, '/health', 'health');
        await check(origin, '/ready', 'ready');
        await check(origin, '/v1/journal-sync?limit=1', 'unauthorized');
        await check(origin, '/v1/completion-restores?limit=1', 'unauthorized');
      };
      await checkEndpoints(versionOrigin(candidate.id, target));
      requireRelease(
        (await current()).id === baseline.id,
        'STAGING_ALIAS_CHANGED_BEFORE_PROMOTION',
      );
      await latestIs(candidate.id);
      validateHyperdrive(
        await api(`/hyperdrive/configs/${target.hyperdriveId}`),
        target,
      );
      await beforePromote();
      alive();
      promotionAttempted = true;
      // One mutation only. A lost response is resolved exclusively by readback.
      try {
        await promote(candidate.id, {
          target,
          token: env.CLOUDFLARE_API_TOKEN,
          signal,
        });
      } catch {
        alive();
      }
      let deployed;
      for (let attempt = 0; attempt < 30; attempt++) {
        deployed = await current();
        if (deployed.versionId === candidate.id) break;
        requireRelease(
          deployed.id === baseline.id && attempt < 29,
          'STAGING_PROMOTION_UNCONFIRMED',
        );
        await wait(2000, undefined, { signal });
      }
      validateVersion(await api(`/versions/${candidate.id}`), target, context);
      await checkEndpoints(target.origin);
      const receipt = {
        sourceSha: context.sha,
        deploymentId: deployed.id,
        versionId: candidate.id,
        previousDeploymentId: baseline.id,
        uploadSha256: bundle.uploadSha256,
        runId: context.runId,
        runAttempt: context.attempt,
      };
      summary(
        `Staging Worker verified: \`${context.sha}\` → version \`${candidate.id}\`, deployment \`${deployed.id}\`. Previous deployment: \`${baseline.id}\`. No automatic rollback is performed.\n`,
      );
      return receipt;
    } finally {
      if (directory) rmSync(directory, { recursive: true, force: true });
    }
  } catch (error) {
    if (promotionAttempted)
      throw new StagingRunnerFailure('STAGING_PROMOTION_UNCONFIRMED');
    throw error;
  }
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    console.info(JSON.stringify(await stagingApi(process.argv[2])));
  } catch {
    console.error(
      'Staging Worker release failed; inspect versions and deployment before retrying. No automatic rollback was performed.',
    );
    process.exitCode = 1;
  }
}
