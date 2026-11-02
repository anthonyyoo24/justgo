import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Client } from 'pg';
import {
  localReleaseArguments,
  localReleaseConfiguration,
  localBuildEnvironment,
  localStagingContext,
  localStagingApi,
  prepareLocalBundle,
  runLocalPublicationChecks,
  assertLocalSource,
} from '../../../scripts/release/staging-local.mjs';
import { requireRelease } from '../../../scripts/release/staging-api-runner.mjs';
import {
  hostedMigrationOptions,
  requireVerifiedTls,
  withStagingRelease,
  watchReleaseConnection,
  assertReleaseLease,
} from './staging-release-guard.js';
import { stagingReleaseDiagnostic } from './staging-release-diagnostic.js';

/** Code-only owner-local release; no GitHub commands, migrations or secret uploads. */
export async function runLocalStagingRelease(args = process.argv.slice(2)) {
  const options = localReleaseArguments(args);
  const configuration = localReleaseConfiguration(options.credentials);
  const context = await localStagingContext(options.sha);
  const root = process.cwd();
  const directory = resolve(root, '.local/phase15-cloudflare/local-releases');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const env = {
    ...localBuildEnvironment(configuration),
    RUNNER_TEMP: directory,
  };
  let client: Client | undefined;
  let watcher: ReturnType<typeof watchReleaseConnection> | undefined;
  let databaseVerified = false;
  let checks: string[] | null = null;
  const work = async () => {
    const baseline = await localStagingApi('preflight', {
      context,
      env,
      root,
      signal: watcher?.signal,
    });
    if (!options.deploy) {
      const bundle = await prepareLocalBundle(context, env, root, {
        signal: watcher?.signal,
      });
      if (client && watcher) {
        watcher.signal.throwIfAborted();
        await assertReleaseLease(client);
      }
      return { baseline, bundle };
    }
    requireRelease(
      databaseVerified && client && watcher,
      'LOCAL_STAGING_DATABASE_CONNECTION_REQUIRED',
    );
    const locked = client;
    const watch = watcher;
    return localStagingApi('deploy', {
      context,
      root,
      env: {
        ...env,
        STAGING_BASELINE_ID: baseline.deploymentId,
        STAGING_BASELINE_SHA: baseline.sourceSha,
      },
      signal: watch.signal,
      beforePromote: async () => {
        watch.signal.throwIfAborted();
        await assertReleaseLease(locked);
        watch.signal.throwIfAborted();
      },
    });
  };
  let result;
  try {
    if (options.deploy) {
      requireRelease(
        configuration.MIGRATION_DATABASE_URL,
        'LOCAL_STAGING_DATABASE_CONNECTION_REQUIRED',
      );
      checks = await runLocalPublicationChecks(root);
      await assertLocalSource(context.sha, { root });
    }
    if (!configuration.MIGRATION_DATABASE_URL) {
      requireRelease(
        !options.deploy,
        'LOCAL_STAGING_DATABASE_CONNECTION_REQUIRED',
      );
      result = await work();
    } else {
      const connection = new Client(
        hostedMigrationOptions(
          configuration.MIGRATION_DATABASE_URL,
          configuration.DATABASE_CA_CERT,
        ),
      );
      client = connection;
      watcher = watchReleaseConnection(connection);
      await connection.connect();
      requireVerifiedTls(connection);
      result = await withStagingRelease(
        connection,
        {
          config: {
            migrationsFolder: fileURLToPath(
              new URL('../drizzle', import.meta.url),
            ),
            migrationsSchema: 'drizzle',
          },
          operation: 'deploy',
          sourceSha: context.sha,
          expectedDatabase: 'postgres',
          previousApiSha: async () =>
            (
              await localStagingApi('preflight', {
                context,
                env,
                root,
                signal: watcher?.signal,
              })
            ).sourceSha,
        },
        async () => {
          databaseVerified = true;
          return work();
        },
      );
    }
    const receipt = {
      recordedAt: new Date().toISOString(),
      provenance: 'Local',
      sourceSha: context.sha,
      localRunId: context.runId,
      operation: options.deploy ? 'deploy' : 'prepare',
      databaseVerified,
      publicationChecks: checks ?? [],
      deployReady: databaseVerified && checks !== null,
      deployed: options.deploy,
      missing: databaseVerified ? [] : ['MIGRATION_DATABASE_URL'],
      ...result,
    };
    writeFileSync(
      resolve(directory, `${context.runId}.json`),
      `${JSON.stringify(receipt, null, 2)}\n`,
      { mode: 0o600, flag: 'wx' },
    );
    return receipt;
  } finally {
    try {
      await client?.end();
    } finally {
      watcher?.stop();
    }
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    const receipt = await runLocalStagingRelease();
    console.info(JSON.stringify(receipt));
    if (!receipt.databaseVerified) process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        ...stagingReleaseDiagnostic(error),
        event: 'LOCAL_STAGING_RELEASE_FAILED',
        rawErrorsSuppressed: true,
      }),
    );
    process.exitCode = 1;
  }
}
