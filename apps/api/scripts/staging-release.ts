import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { stagingApi } from '../../../scripts/release/staging-api-runner.mjs';
import { stagingReleaseDiagnostic } from './staging-release-diagnostic.js';
import {
  hostedMigrationOptions,
  requireVerifiedTls,
  StagingReleaseFailure,
  withStagingRelease,
  watchReleaseConnection,
  assertReleaseLease,
} from './staging-release-guard.js';

let client: Client | undefined;
let watcher: ReturnType<typeof watchReleaseConnection> | undefined;
try {
  const operation = process.env.RELEASE_OPERATION;
  if (!['deploy', 'migrate-deploy'].includes(operation ?? ''))
    throw new StagingReleaseFailure('invalid_operation');
  const connection = new Client(
    hostedMigrationOptions(
      process.env.MIGRATION_DATABASE_URL,
      process.env.DATABASE_CA_CERT,
    ),
  );
  client = connection;
  const watch = watchReleaseConnection(connection);
  watcher = watch;
  await connection.connect();
  requireVerifiedTls(connection);
  await withStagingRelease(
    connection,
    {
      config: {
        migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
        migrationsSchema: 'drizzle',
      },
      operation: operation as 'deploy' | 'migrate-deploy',
      sourceSha: process.env.RELEASE_SHA ?? '',
      previousApiSha: async () => {
        const baseline = await stagingApi('preflight', {
          signal: watch.signal,
        });
        process.env.STAGING_BASELINE_ID = baseline.deploymentId;
        process.env.STAGING_BASELINE_SHA = baseline.sourceSha;
        return baseline.sourceSha;
      },
      expectedDatabase: 'postgres',
      planDigest: process.env.MIGRATION_PLAN_SHA256,
      attestation: process.env.STAGING_RECOVERY_ATTESTATION,
      onPlan: (plan) =>
        console.info(
          JSON.stringify({
            event: 'staging_migration_plan',
            historyDigest: plan.historyDigest,
            planDigest: plan.digest,
            pending: plan.pending.map((entry) => entry.tag),
          }),
        ),
    },
    async () => {
      console.info(
        JSON.stringify({
          event: 'staging_database_verified',
          sourceSha: process.env.RELEASE_SHA,
          operation,
        }),
      );
      const signal = watch.signal;
      const receipt = await stagingApi('deploy', {
        signal,
        beforePromote: async () => {
          if (signal.aborted)
            throw new StagingReleaseFailure('staging_release_lease_lost');
          await assertReleaseLease(connection);
          if (signal.aborted)
            throw new StagingReleaseFailure('staging_release_lease_lost');
        },
      });
      console.info(JSON.stringify(receipt));
    },
  );
} catch (error) {
  console.error(JSON.stringify(stagingReleaseDiagnostic(error)));
  process.exitCode = 1;
} finally {
  try {
    await client?.end();
  } catch {
    console.error('Staging release connection cleanup failed.');
    process.exitCode = 1;
  }
  watcher?.stop();
}
