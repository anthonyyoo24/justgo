import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localTestDatabaseUrl } from '../../scripts/local-test-database.js';
import {
  appliedHistory,
  migrationEntries,
  migrationPlan,
  releaseLock,
  stagingProject,
  withStagingRelease,
  assertReleaseLease,
} from '../../scripts/staging-release-guard.js';

const url = localTestDatabaseUrl(process.env.MIGRATION_DATABASE_URL);
if (
  url.username !== 'justgo_migrator' ||
  process.env.DATABASE_SSL !== 'disable'
)
  throw new Error('Staging release fixtures require the isolated migrator');
const client = new Client({ connectionString: url.toString(), ssl: false });
const other = new Client({ connectionString: url.toString(), ssl: false });
beforeAll(async () => {
  await client.connect();
  await other.connect();
});
afterAll(async () => {
  await client.end();
  await other.end();
});
const sha = 'a'.repeat(40),
  previous = 'b'.repeat(40);
async function fixture(fails = false) {
  const name = `staging_release_fixture_${randomUUID().replaceAll('-', '')}`;
  const folder = await mkdtemp(join(tmpdir(), 'justgo-release-db-'));
  await mkdir(join(folder, 'meta'));
  await writeFile(
    join(folder, 'meta/_journal.json'),
    JSON.stringify({
      entries: [
        { tag: '0000_first', when: 1, breakpoints: true },
        { tag: '0001_second', when: 2, breakpoints: true },
      ],
    }),
  );
  await writeFile(
    join(folder, '0000_first.sql'),
    `create table justgo.${name} (value integer not null);`,
  );
  await writeFile(
    join(folder, '0001_second.sql'),
    fails
      ? `insert into justgo.${name} values ('private-invalid-integer');`
      : `insert into justgo.${name} values (1);`,
  );
  await client.query(
    `create table drizzle.${name} (id serial primary key,hash text not null,created_at bigint)`,
  );
  const config = {
    migrationsFolder: folder,
    migrationsSchema: 'drizzle',
    migrationsTable: name,
  };
  const now = Date.now();
  const plan = migrationPlan(migrationEntries(config), [], sha, previous);
  const proof = JSON.stringify({
    version: 1,
    project: stagingProject,
    sourceSha: sha,
    previousApiSha: previous,
    historyDigest: plan.historyDigest,
    planDigest: plan.digest,
    backupSha256: 'c'.repeat(64),
    backupVerifiedAt: new Date(now - 1000).toISOString(),
    restoreVerifiedAt: new Date(now).toISOString(),
    ledgerVerifiedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    offMacCopyVerified: true,
    deletionEpochAuthLedgerVerified: true,
    isolatedRestoreVerified: true,
    backwardCompatibleWithPreviousApi: true,
  });
  const options = {
    config,
    operation: 'migrate-deploy' as const,
    sourceSha: sha,
    previousApiSha: previous,
    expectedDatabase: 'justgo_test',
    planDigest: plan.digest,
    attestation: proof,
    now,
  };
  return {
    name,
    config,
    options,
    async cleanup() {
      await client.query(`drop table if exists justgo.${name}`);
      await client.query(`drop table drizzle.${name}`);
      await rm(folder, { recursive: true, force: true });
    },
  };
}
describe('locked staging release against disposable migration fixtures', () => {
  it('blocks pending SQL without approval/recovery evidence and releases the lock', async () => {
    const f = await fixture();
    try {
      let deployed = false;
      await expect(
        withStagingRelease(
          client,
          { ...f.options, operation: 'deploy', planDigest: undefined },
          async () => {
            deployed = true;
          },
        ),
      ).rejects.toMatchObject({
        reason: 'reviewed_pending_migration_plan_required',
      });
      await expect(
        withStagingRelease(
          client,
          { ...f.options, attestation: undefined },
          async () => {
            deployed = true;
          },
        ),
      ).rejects.toMatchObject({
        reason: 'current_deletion_safe_recovery_attestation_required',
      });
      expect(deployed).toBe(false);
      expect(await appliedHistory(client, f.config)).toEqual([]);
      expect(
        (
          await other.query('select pg_try_advisory_lock($1,$2) as locked', [
            ...releaseLock,
          ])
        ).rows[0].locked,
      ).toBe(true);
      await other.query('select pg_advisory_unlock($1,$2)', [...releaseLock]);
    } finally {
      await f.cleanup();
    }
  });
  it('commits the entire approved plan before deployment and keeps other processes locked out', async () => {
    const f = await fixture();
    try {
      let deployed = false;
      await withStagingRelease(client, f.options, async () => {
        deployed = true;
        await assertReleaseLease(client);
        expect(
          (await client.query(`select value from justgo.${f.name}`)).rows,
        ).toEqual([{ value: 1 }]);
        expect(await appliedHistory(client, f.config)).toHaveLength(2);
        await expect(
          withStagingRelease(other, f.options, async () => {}),
        ).rejects.toMatchObject({
          reason: 'another_staging_release_holds_lock',
        });
      });
      expect(deployed).toBe(true);
      await expect(assertReleaseLease(client)).rejects.toMatchObject({
        reason: 'staging_release_lease_lost',
      });
      await withStagingRelease(
        client,
        {
          ...f.options,
          operation: 'deploy',
          planDigest: undefined,
          attestation: undefined,
        },
        async () => {},
      );
      await client.query(
        `update drizzle.${f.name} set hash=$1 where created_at=1`,
        ['0'.repeat(64)],
      );
      await expect(
        withStagingRelease(
          client,
          { ...f.options, operation: 'deploy', planDigest: undefined },
          async () => {},
        ),
      ).rejects.toMatchObject({ reason: 'applied_migration_history_mismatch' });
    } finally {
      await f.cleanup();
    }
  });
  it('rolls back every pending statement and checkpoint on SQL failure without starting deployment', async () => {
    const f = await fixture(true);
    try {
      let deployed = false;
      await expect(
        withStagingRelease(client, f.options, async () => {
          deployed = true;
        }),
      ).rejects.toThrow('Migration failed');
      expect(deployed).toBe(false);
      expect(await appliedHistory(client, f.config)).toEqual([]);
      expect(
        (
          await client.query('select to_regclass($1) as target', [
            `justgo.${f.name}`,
          ])
        ).rows[0].target,
      ).toBeNull();
    } finally {
      await f.cleanup();
    }
  });
});
