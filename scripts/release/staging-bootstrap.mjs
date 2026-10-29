import { appendFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildStagingWorker } from './staging-worker-build.mjs';
import { cloudflareRequest, workerProbe } from './staging-cloudflare.mjs';
import { privateCommand, validateHyperdrive } from './staging-api-runner.mjs';
import {
  cloudflareTarget,
  isVersionId,
  releaseBindings,
  releaseContext,
  requireRelease,
  stagingRunnerFailureCode,
  stagingTarget,
  StagingRunnerFailure,
  validateBindingPreservation,
  validateDeployment,
  validateFoundation,
  validateProbe,
  validateStagingEnvironment,
  validateVersion,
  versionOrigin,
} from './staging-api.mjs';

const validationId = '00000000-0000-4000-8000-000000000000';

/** Secret JSON stays in memory; source and provider identities cannot be supplied by it. */
export function bootstrapBindings(raw, target, context) {
  try {
    requireRelease(
      typeof raw === 'string' && Buffer.byteLength(raw) <= 64 * 1024,
      'STAGING_BOOTSTRAP_BINDINGS_REQUIRED',
    );
    const value = JSON.parse(raw);
    requireRelease(
      value &&
        Object.keys(value).sort().join(',') === 'secrets,vars' &&
        value.secrets &&
        !Array.isArray(value.secrets) &&
        value.vars &&
        !Array.isArray(value.vars),
      'STAGING_BOOTSTRAP_BINDINGS_REQUIRED',
    );
    const bindings = [
      ...Object.entries(value.secrets).map(([name, text]) => ({
        name,
        type: 'secret_text',
        text,
      })),
      ...Object.entries(value.vars).map(([name, text]) => ({
        name,
        type: 'plain_text',
        text,
      })),
    ];
    requireRelease(
      bindings.every(
        (binding) =>
          typeof binding.text === 'string' &&
          binding.text.length > 0 &&
          !releaseBindings.includes(binding.name),
      ) &&
        typeof value.secrets.BETA_ACCESS_GRANTS === 'string' &&
        typeof value.secrets.BETA_ACCESS_WINDOW === 'string',
      'STAGING_BOOTSTRAP_BINDINGS_REQUIRED',
    );
    bindings.push(
      ...Object.entries({
        NODE_ENV: 'production',
        APP_ENVIRONMENT: 'staging',
        MANAGED_AUTH_ENABLED: 'true',
        SUPABASE_URL: 'https://kmcpcauaxlgpevkkenwd.supabase.co',
        JUSTGO_SOURCE_SHA: context.sha,
        API_SENTRY_RELEASE: context.sha,
        JUSTGO_RELEASE_RUN_ID: context.runId,
        JUSTGO_RELEASE_RUN_ATTEMPT: context.attempt,
      }).map(([name, text]) => ({ name, type: 'plain_text', text })),
      { name: 'HYPERDRIVE', type: 'hyperdrive', id: target.hyperdriveId },
    );
    // Reuse the deployed binding allowlist, including duplicates and mandatory secrets.
    validateVersion({ id: validationId, resources: { bindings } }, target);
    return bindings;
  } catch {
    throw new StagingRunnerFailure('STAGING_BOOTSTRAP_BINDINGS_REQUIRED');
  }
}

/** The executable runs with --import tsx; unit tests replace this external-I/O seam. */
export async function withBootstrapDatabase({ env, bindings }, upload) {
  const { Client } = await import('pg');
  const {
    assertReleaseLease,
    hostedMigrationOptions,
    requireVerifiedTls,
    watchReleaseConnection,
    withStagingBootstrap,
  } = await import('../../apps/api/scripts/staging-release-guard.ts');
  const { readWorkerConfig } =
    await import('../../apps/api/src/db/worker-database.ts');
  try {
    readWorkerConfig({
      ...Object.fromEntries(
        bindings
          .filter((binding) => 'text' in binding)
          .map((binding) => [binding.name, binding.text]),
      ),
      // Validate the actual runtime settings without opening a database connection.
      HYPERDRIVE: {
        connectionString:
          'postgres://justgo_runtime:validation@bootstrap.hyperdrive.local/postgres?sslmode=disable',
      },
    });
  } catch {
    throw new StagingRunnerFailure('STAGING_BOOTSTRAP_BINDINGS_REQUIRED');
  }
  const connection = new Client(
    hostedMigrationOptions(env.MIGRATION_DATABASE_URL, env.DATABASE_CA_CERT),
  );
  const watch = watchReleaseConnection(connection);
  try {
    await connection.connect();
    requireVerifiedTls(connection);
    return await withStagingBootstrap(
      connection,
      {
        migrationsFolder: fileURLToPath(
          new URL('../../apps/api/drizzle', import.meta.url),
        ),
        migrationsSchema: 'drizzle',
      },
      () =>
        upload({
          signal: watch.signal,
          assertLease: () => assertReleaseLease(connection),
        }),
    );
  } finally {
    try {
      await connection.end();
    } finally {
      watch.stop();
    }
  }
}

/** First upload only. Existing/uncertain Workers are never overwritten or repaired. */
export async function bootstrapStagingWorker({
  env = process.env,
  root = process.cwd(),
  run = privateCommand,
  request = cloudflareRequest,
  probe = workerProbe,
  build = buildStagingWorker,
  withDatabase = withBootstrapDatabase,
  summary = (text) => {
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, text);
  },
} = {}) {
  const context = releaseContext(env);
  requireRelease(
    env.RELEASE_OPERATION === 'bootstrap' &&
      env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
      !env.MIGRATION_PLAN_SHA256 &&
      !env.STAGING_RECOVERY_ATTESTATION,
    'INVALID_STAGING_RELEASE_CONTEXT',
  );
  const target = cloudflareTarget(env);
  const bindings = bootstrapBindings(
    env.STAGING_BOOTSTRAP_BINDINGS,
    target,
    context,
  );
  const childEnv = { ...env };
  for (const name of [
    'STAGING_BOOTSTRAP_BINDINGS',
    'CLOUDFLARE_API_TOKEN',
    'MIGRATION_DATABASE_URL',
    'DATABASE_CA_CERT',
  ])
    delete childEnv[name];
  const command = (binary, args) =>
    run(binary, args, { cwd: root, env: childEnv });
  const source = async () => {
    requireRelease(
      (await command('git', ['rev-parse', 'HEAD'])).trim() === context.sha &&
        !(await command('git', ['status', '--porcelain'])).trim(),
      'STAGING_SOURCE_NOT_CLEAN',
    );
  };
  const github = async (path) => {
    try {
      return JSON.parse(
        await command('gh', [
          'api',
          '--method',
          'GET',
          `repos/${stagingTarget.repository}/${path}`,
        ]),
      );
    } catch {
      throw new StagingRunnerFailure('STAGING_COMMAND_FAILED');
    }
  };
  await source();
  validateFoundation(
    await github(
      `actions/workflows/ci.yml/runs?head_sha=${context.sha}&event=push&branch=main&per_page=1`,
    ),
    context.sha,
  );
  validateStagingEnvironment(
    await github('environments/justgo-staging'),
    await github('environments/justgo-staging/deployment-branch-policies'),
    stagingTarget.reviewer,
  );
  let attempted = false;
  try {
    return await withDatabase(
      { env, bindings },
      async ({ signal, assertLease }) => {
        const alive = () =>
          requireRelease(!signal?.aborted, 'STAGING_DATABASE_LEASE_LOST');
        const api = (path, options = {}) => {
          alive();
          return request(target, path, {
            token: env.CLOUDFLARE_API_TOKEN,
            signal,
            ...options,
          });
        };
        const empty = async () =>
          requireRelease(
            (await api('/settings', { allowMissing: true })) === null,
            'STAGING_BOOTSTRAP_REQUIRES_EMPTY_WORKER',
          );
        const hyperdrive = async () =>
          validateHyperdrive(
            await api(`/hyperdrive/configs/${target.hyperdriveId}`),
            target,
          );
        await empty();
        await hyperdrive();
        requireRelease(
          (await api('/workers/subdomain')).subdomain === target.subdomain,
          'STAGING_WORKER_CONFIGURATION_MISMATCH',
        );
        const directory = mkdtempSync(
          join(env.RUNNER_TEMP, 'justgo-worker-bootstrap-'),
        );
        try {
          const buildEnv = { ...childEnv };
          delete buildEnv.GH_TOKEN;
          delete buildEnv.GITHUB_TOKEN;
          const bundle = await build({
            root,
            directory,
            target,
            context,
            env: buildEnv,
            signal,
            run: (binary, args, options = {}) =>
              run(binary, args, { ...options, env: buildEnv }),
          });
          const configuration = bundle.configuration;
          const form = new FormData();
          form.set(
            'metadata',
            JSON.stringify({
              main_module: 'worker.js',
              bindings,
              compatibility_date: configuration.compatibility_date,
              compatibility_flags: configuration.compatibility_flags,
              placement: {
                mode: 'targeted',
                region: configuration.placement.region,
              },
              observability: { enabled: false },
              logpush: false,
              tail_consumers: [],
              annotations: {
                'workers/tag': context.sha,
                'workers/message': `JustGO bootstrap ${context.sha} GitHub ${context.runId}/${context.attempt}`,
              },
            }),
          );
          form.set(
            'worker.js',
            new Blob([bundle.content], {
              type: 'application/javascript+module',
            }),
            'worker.js',
          );
          await source();
          await empty();
          await hyperdrive();
          await assertLease();
          alive();
          attempted = true;
          const uploaded = await api(
            '?excludeScript=true&bindings_inherit=strict',
            { method: 'PUT', body: form },
          );
          // The legacy upload field is a version UUID (as in pinned Wrangler), not a deployment UUID.
          const rawId = uploaded?.deployment_id;
          const id =
            typeof rawId === 'string' && /^[a-f0-9]{32}$/.test(rawId)
              ? rawId.replace(
                  /^(........)(....)(....)(....)(............)$/,
                  '$1-$2-$3-$4-$5',
                )
              : rawId;
          requireRelease(isVersionId(id), 'STAGING_BOOTSTRAP_UNCONFIRMED');
          const readback = async (preview) => {
            const deployed = validateDeployment(await api('/deployments'));
            requireRelease(
              deployed.versionId === id &&
                (await api('/versions')).items?.[0]?.id === id,
              'STAGING_BOOTSTRAP_UNCONFIRMED',
            );
            const version = validateVersion(
              await api(`/versions/${id}`),
              target,
              preview ? context : undefined,
            );
            requireRelease(version.id === id, 'STAGING_BOOTSTRAP_UNCONFIRMED');
            validateBindingPreservation({ bindings }, version);
            for (const name of releaseBindings)
              requireRelease(
                version.bindings.find((binding) => binding.name === name)
                  ?.text ===
                  bindings.find((binding) => binding.name === name)?.text,
                'STAGING_BOOTSTRAP_UNCONFIRMED',
              );
            const settings = await api('/settings');
            requireRelease(
              settings?.observability?.enabled === false &&
                settings.logpush !== true &&
                !(settings.tail_consumers?.length > 0),
              'STAGING_WORKER_CONFIGURATION_MISMATCH',
            );
            return deployed;
          };
          await readback(false);
          const route = await api('/subdomain');
          if (route?.enabled !== true || route.previews_enabled !== true) {
            await assertLease();
            // Route setup is separate from code upload; this request is also sent once only.
            await api('/subdomain', {
              method: 'POST',
              body: JSON.stringify({ enabled: true, previews_enabled: true }),
            });
          }
          const routeReadback = await api('/subdomain');
          requireRelease(
            routeReadback?.enabled === true &&
              routeReadback.previews_enabled === true,
            'STAGING_WORKER_CONFIGURATION_MISMATCH',
          );
          await readback(true);
          for (const origin of [versionOrigin(id, target), target.origin]) {
            for (const [path, kind] of [
              ['/health', 'health'],
              ['/ready', 'ready'],
              ['/v1/journal-sync?limit=1', 'unauthorized'],
              ['/v1/completion-restores?limit=1', 'unauthorized'],
            ]) {
              alive();
              validateProbe(
                await probe(origin, path, { signal }),
                kind,
                context.sha,
              );
            }
          }
          await hyperdrive();
          await assertLease();
          alive();
          const deployed = await readback(true);
          const receipt = {
            sourceSha: context.sha,
            deploymentId: deployed.id,
            versionId: id,
            uploadSha256: bundle.uploadSha256,
            runId: context.runId,
            runAttempt: context.attempt,
          };
          summary(
            `Initial staging Worker verified: \`${context.sha}\` → version \`${id}\`, deployment \`${deployed.id}\`. No automatic rollback is performed.\n`,
          );
          return receipt;
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      },
    );
  } catch (error) {
    if (attempted)
      throw new StagingRunnerFailure('STAGING_BOOTSTRAP_UNCONFIRMED');
    throw error;
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    console.info(JSON.stringify(await bootstrapStagingWorker()));
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'staging_bootstrap_failed',
        code: stagingRunnerFailureCode(error) ?? 'STAGING_RUNNER_FAILED',
      }),
    );
    process.exitCode = 1;
  }
}
