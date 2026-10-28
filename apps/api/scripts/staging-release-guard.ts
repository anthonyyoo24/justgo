import { createHash, X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Client, PoolClient } from 'pg';
import { readMigrationFiles, type MigrationConfig } from 'drizzle-orm/migrator';
import { applyMigrations } from './migration-runner.js';

export const stagingProject = 'kmcpcauaxlgpevkkenwd';
export const releaseLock = [1246187347, 1413564229] as const;
export class StagingReleaseFailure extends Error {
  constructor(readonly reason: string) {
    super('Staging release guard failed');
  }
}
function ensure(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new StagingReleaseFailure(reason);
}
export function hostedMigrationOptions(
  value: string | undefined,
  ca: string | undefined,
) {
  try {
    const url = new URL(value ?? '');
    ensure(
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
        decodeURIComponent(url.username) ===
          `justgo_migrator.${stagingProject}` &&
        Boolean(url.password) &&
        url.hostname === 'aws-0-ca-central-1.pooler.supabase.com' &&
        url.port === '5432' &&
        url.pathname === '/postgres' &&
        !url.search &&
        !url.hash,
      'wrong_hosted_target',
    );
    ensure(
      ca && !ca.includes('PRIVATE KEY') && new X509Certificate(ca).ca,
      'trusted_ca_required',
    );
    return {
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: true as const, ca },
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
      query_timeout: 6000,
      application_name: 'justgo-staging-release',
    };
  } catch (error) {
    if (error instanceof StagingReleaseFailure) throw error;
    throw new StagingReleaseFailure('invalid_hosted_connection');
  }
}
export function requireVerifiedTls(client: Client) {
  const connection = client as unknown as {
    connection?: { stream?: { encrypted?: boolean; authorized?: boolean } };
  };
  ensure(
    connection.connection?.stream?.encrypted === true &&
      connection.connection.stream.authorized === true,
    'verified_tls_required',
  );
}
export type MigrationEntry = { tag: string; when: string; hash: string };
export type AppliedMigration = { created_at: string; hash: string };
export function migrationEntries(config: MigrationConfig): MigrationEntry[] {
  const journal = JSON.parse(
    readFileSync(join(config.migrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as { entries: { tag: string; when: number }[] };
  const files = readMigrationFiles(config);
  ensure(
    journal.entries.length === files.length && files.length > 0,
    'invalid_migration_registry',
  );
  return journal.entries.map((entry, index) => {
    const file = files[index];
    ensure(
      file &&
        /^\d{4}_[a-z0-9_]+$/.test(entry.tag) &&
        Number.isSafeInteger(entry.when) &&
        entry.when === file.folderMillis &&
        (index === 0 ||
          entry.when > Number(journal.entries[index - 1]?.when)) &&
        /^[a-f0-9]{64}$/.test(file.hash),
      'invalid_migration_registry',
    );
    return { tag: entry.tag, when: String(entry.when), hash: file.hash };
  });
}
export function pendingMigrations(
  entries: MigrationEntry[],
  applied: AppliedMigration[],
) {
  ensure(
    applied.length <= entries.length &&
      applied.every((row, index) => {
        const entry = entries[index];
        return (
          entry !== undefined &&
          row.created_at === entry.when &&
          row.hash === entry.hash
        );
      }),
    'applied_migration_history_mismatch',
  );
  return entries.slice(applied.length);
}
export function migrationPlan(
  entries: MigrationEntry[],
  applied: AppliedMigration[],
  sourceSha: string,
  previousApiSha: string,
) {
  ensure(
    /^[a-f0-9]{40}$/.test(sourceSha) && /^[a-f0-9]{40}$/.test(previousApiSha),
    'invalid_release_source',
  );
  const pending = pendingMigrations(entries, applied);
  const historyDigest = createHash('sha256')
    .update(JSON.stringify(applied))
    .digest('hex');
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        project: stagingProject,
        sourceSha,
        previousApiSha,
        historyDigest,
        pending,
      }),
    )
    .digest('hex');
  return { pending, historyDigest, digest };
}
export function requireRecoveryAttestation(
  raw: string | undefined,
  plan: ReturnType<typeof migrationPlan>,
  sourceSha: string,
  previousApiSha: string,
  now = Date.now(),
) {
  let proof: Record<string, unknown>;
  try {
    proof = JSON.parse(raw ?? 'null') as Record<string, unknown>;
  } catch {
    throw new StagingReleaseFailure('recovery_attestation_required');
  }
  const date = (key: string) =>
    typeof proof?.[key] === 'string' ? Date.parse(proof[key]) : NaN;
  const fresh = (key: string) =>
    Number.isFinite(date(key)) &&
    date(key) <= now &&
    now - date(key) <= 24 * 60 * 60_000;
  ensure(
    proof?.version === 1 &&
      proof.project === stagingProject &&
      proof.sourceSha === sourceSha &&
      proof.previousApiSha === previousApiSha &&
      proof.historyDigest === plan.historyDigest &&
      proof.planDigest === plan.digest &&
      typeof proof.backupSha256 === 'string' &&
      /^[a-f0-9]{64}$/.test(proof.backupSha256) &&
      fresh('backupVerifiedAt') &&
      fresh('restoreVerifiedAt') &&
      fresh('ledgerVerifiedAt') &&
      date('restoreVerifiedAt') >= date('backupVerifiedAt') &&
      date('ledgerVerifiedAt') >= date('backupVerifiedAt') &&
      date('expiresAt') > now &&
      date('expiresAt') <= date('backupVerifiedAt') + 24 * 60 * 60_000 &&
      proof.offMacCopyVerified === true &&
      proof.deletionEpochAuthLedgerVerified === true &&
      proof.isolatedRestoreVerified === true &&
      proof.backwardCompatibleWithPreviousApi === true,
    'current_deletion_safe_recovery_attestation_required',
  );
}
type Connection = Client | PoolClient;
/** Idle pg errors/end are handled without ever logging the provider exception. */
export function watchReleaseConnection(client: Connection) {
  const controller = new AbortController();
  const lost = () => controller.abort();
  client.on('error', lost);
  client.on('end', lost);
  return {
    signal: controller.signal,
    stop() {
      client.off('error', lost);
      client.off('end', lost);
    },
  };
}
export async function assertReleaseLease(client: Connection) {
  const result = await client.query<{ held: boolean }>(
    `select exists (
    select 1 from pg_locks where locktype='advisory' and pid=pg_backend_pid()
    and classid=$1::oid and objid=$2::oid and objsubid=2 and granted
  ) as held`,
    [...releaseLock],
  );
  ensure(result.rows[0]?.held === true, 'staging_release_lease_lost');
}
const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
export async function appliedHistory(
  client: Connection,
  config: MigrationConfig,
) {
  const schema = config.migrationsSchema ?? 'drizzle';
  const table = config.migrationsTable ?? '__drizzle_migrations';
  const result = await client.query<AppliedMigration>(
    `select hash, created_at::text from ${identifier(schema)}.${identifier(table)} order by created_at, id`,
  );
  return result.rows;
}
export async function withStagingRelease<T>(
  client: Connection,
  options: {
    config: MigrationConfig;
    operation: 'deploy' | 'migrate-deploy';
    sourceSha: string;
    previousApiSha: string | (() => Promise<string>);
    expectedDatabase: string;
    planDigest?: string | undefined;
    attestation?: string | undefined;
    now?: number;
    onPlan?: (plan: ReturnType<typeof migrationPlan>) => void;
  },
  deploy: () => Promise<T>,
): Promise<T> {
  const lock = await client.query<{ locked: boolean }>(
    'select pg_try_advisory_lock($1,$2) as locked',
    [...releaseLock],
  );
  ensure(lock.rows[0]?.locked === true, 'another_staging_release_holds_lock');
  try {
    const role = await client.query<{
      role_ok: boolean;
      database: string;
    }>(`select current_database() as database,
      current_user='justgo_migrator' and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb as role_ok
      from pg_roles where rolname=current_user`);
    ensure(
      role.rows[0]?.role_ok === true &&
        role.rows[0].database === options.expectedDatabase,
      'restricted_migrator_required',
    );
    const previousApiSha =
      typeof options.previousApiSha === 'function'
        ? await options.previousApiSha()
        : options.previousApiSha;
    const entries = migrationEntries(options.config);
    const plan = migrationPlan(
      entries,
      await appliedHistory(client, options.config),
      options.sourceSha,
      previousApiSha,
    );
    options.onPlan?.(plan);
    if (plan.pending.length) {
      ensure(
        options.operation === 'migrate-deploy' &&
          options.planDigest === plan.digest,
        'reviewed_pending_migration_plan_required',
      );
      requireRecoveryAttestation(
        options.attestation,
        plan,
        options.sourceSha,
        previousApiSha,
        options.now,
      );
      await applyMigrations(client, options.config);
      ensure(
        pendingMigrations(entries, await appliedHistory(client, options.config))
          .length === 0,
        'migration_checkpoint_unconfirmed',
      );
    } else
      ensure(
        options.operation === 'deploy' && !options.planDigest,
        'code_only_deploy_required',
      );
    // Keep this same locked session alive through candidate build, probes and promotion.
    return await deploy();
  } finally {
    await client.query('select pg_advisory_unlock($1,$2)', [...releaseLock]);
  }
}
