import { rootCertificates } from 'node:tls';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Client } from 'pg';
import {
  hostedMigrationOptions,
  requireVerifiedTls,
  stagingProject,
  migrationPlan,
  pendingMigrations,
  requireRecoveryAttestation,
  type MigrationEntry,
  watchReleaseConnection,
  assertReleaseLease,
  migrationEntries,
  withStagingRelease,
} from '../../scripts/staging-release-guard.js';
import { stagingProjectRef } from '../../../../scripts/release/staging-supabase.mjs';

const sha = 'a'.repeat(40),
  previous = 'b'.repeat(40);
const entries: [MigrationEntry, MigrationEntry] = [
  { tag: '0000_first', when: '1', hash: 'c'.repeat(64) },
  { tag: '0001_second', when: '2', hash: 'd'.repeat(64) },
];
const applied = [{ created_at: '1', hash: entries[0].hash }];
const now = Date.parse('2026-10-27T12:00:00Z');
function attestation() {
  const plan = migrationPlan(entries, applied, sha, previous);
  return {
    version: 1,
    project: stagingProject,
    sourceSha: sha,
    previousApiSha: previous,
    historyDigest: plan.historyDigest,
    planDigest: plan.digest,
    backupSha256: 'e'.repeat(64),
    backupVerifiedAt: new Date(now - 60_000).toISOString(),
    restoreVerifiedAt: new Date(now - 30_000).toISOString(),
    ledgerVerifiedAt: new Date(now - 20_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    offMacCopyVerified: true,
    deletionEpochAuthLedgerVerified: true,
    isolatedRestoreVerified: true,
    backwardCompatibleWithPreviousApi: true,
  };
}
describe('staging migration target and recovery fences', () => {
  it('handles private idle-client errors and end events by aborting release work', () => {
    for (const event of ['error', 'end']) {
      const emitter = new EventEmitter();
      const watcher = watchReleaseConnection(emitter as unknown as Client);
      expect(() =>
        emitter.emit(event, new Error('private connection credentials')),
      ).not.toThrow();
      expect(watcher.signal.aborted).toBe(true);
      watcher.stop();
      expect(emitter.listenerCount('error')).toBe(0);
      expect(emitter.listenerCount('end')).toBe(0);
    }
  });
  it('requires an actual advisory lock held by the same live backend', async () => {
    const client = {
      query: async () => ({ rows: [{ held: false }] }),
    } as unknown as Client;
    await expect(assertReleaseLease(client)).rejects.toMatchObject({
      reason: 'staging_release_lease_lost',
    });
  });
  it('requires this project session pooler, restricted role, explicit verified TLS and trusted CA', () => {
    // The guard and the release lane must name the same project.
    expect(stagingProject).toBe(stagingProjectRef);
    const good = `postgresql://justgo_migrator.${stagingProject}:private-fixture@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;
    expect(
      hostedMigrationOptions(good, rootCertificates[0]).ssl.rejectUnauthorized,
    ).toBe(true);
    for (const value of [
      undefined,
      good.replace('5432', '6543'),
      good.replace(stagingProject, 'other'),
      good.replace('justgo_migrator', 'postgres'),
      good.replace('aws-1-us-east-1.pooler.supabase.com', '127.0.0.1'),
      // The retired Canada project's pooler and ref.
      good.replace('aws-1-us-east-1', 'aws-0-ca-central-1'),
      good.replace(stagingProject, 'kmcpcauaxlgpevkkenwd'),
      `${good}?sslmode=disable`,
      `${good}#override`,
    ])
      expect(() => hostedMigrationOptions(value, rootCertificates[0])).toThrow(
        'Staging release guard failed',
      );
    for (const ca of [undefined, 'private-invalid-ca'])
      expect(() => hostedMigrationOptions(good, ca)).toThrow(
        'Staging release guard failed',
      );
    for (const stream of [
      {},
      { encrypted: true, authorized: false },
      { encrypted: false, authorized: true },
    ])
      expect(() =>
        requireVerifiedTls({ connection: { stream } } as unknown as Client),
      ).toThrow();
    expect(() =>
      requireVerifiedTls({
        connection: { stream: { encrypted: true, authorized: true } },
      } as unknown as Client),
    ).not.toThrow();
  });
  it('requires the complete immutable applied prefix, rejecting gaps, edits and future migrations', () => {
    expect(pendingMigrations(entries, applied)).toEqual([entries[1]]);
    for (const history of [
      [{ created_at: '1', hash: '0'.repeat(64) }],
      [{ created_at: '2', hash: entries[1].hash }],
      [...applied, ...applied],
      [
        ...applied,
        { created_at: '2', hash: entries[1].hash },
        { created_at: '3', hash: 'f'.repeat(64) },
      ],
    ])
      expect(() => pendingMigrations(entries, history)).toThrow();
    expect(migrationPlan(entries, applied, sha, previous).digest).not.toBe(
      migrationPlan(entries, [], sha, previous).digest,
    );
    expect(migrationPlan(entries, applied, sha, previous).digest).not.toBe(
      migrationPlan(entries, applied, previous, sha).digest,
    );
  });
  it('binds a first release to the none marker only while the applied history is empty', () => {
    const first = migrationPlan(entries, [], sha, 'none');
    expect(first.pending).toEqual(entries);
    expect(first.digest).not.toBe(
      migrationPlan(entries, [], sha, previous).digest,
    );
    expect(() => migrationPlan(entries, applied, sha, 'none')).toThrow(
      expect.objectContaining({ reason: 'serving_function_missing' }),
    );
    expect(() =>
      migrationPlan(
        entries,
        entries.map(({ when, hash }) => ({ created_at: when, hash })),
        sha,
        'none',
      ),
    ).toThrow(expect.objectContaining({ reason: 'serving_function_missing' }));
    for (const marker of ['', 'NONE', 'None', ' none', 'none\n', 'null'])
      expect(() => migrationPlan(entries, [], sha, marker)).toThrow(
        expect.objectContaining({ reason: 'invalid_release_source' }),
      );
    expect(() => migrationPlan(entries, [], 'none', previous)).toThrow(
      expect.objectContaining({ reason: 'invalid_release_source' }),
    );
  });
  it('accepts a first-release waiver only when it names the none marker', () => {
    const plan = migrationPlan(entries, [], sha, 'none');
    const waiver = {
      kind: 'test-data-waiver',
      version: 1,
      project: stagingProject,
      sourceSha: sha,
      previousApiSha: 'none',
      historyDigest: plan.historyDigest,
      planDigest: plan.digest,
      testDataOnly: true,
      ownerApprovedAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
    };
    expect(() =>
      requireRecoveryAttestation(
        JSON.stringify(waiver),
        plan,
        sha,
        'none',
        now,
      ),
    ).not.toThrow();
    for (const previousApiSha of [previous, undefined, null, ''])
      expect(() =>
        requireRecoveryAttestation(
          JSON.stringify({ ...waiver, previousApiSha }),
          plan,
          sha,
          'none',
          now,
        ),
      ).toThrow(
        expect.objectContaining({
          reason: 'current_test_data_waiver_required',
        }),
      );
  });
  it('requires explicit source/schema/plan/compatibility-bound current recovery proof; nothing defaults to approved', () => {
    const plan = migrationPlan(entries, applied, sha, previous);
    expect(() =>
      requireRecoveryAttestation(
        JSON.stringify(attestation()),
        plan,
        sha,
        previous,
        now,
      ),
    ).not.toThrow();
    for (const raw of [undefined, 'private-invalid', 'null', '{}'])
      expect(() =>
        requireRecoveryAttestation(raw, plan, sha, previous, now),
      ).toThrow();
    for (const change of [
      { project: 'other' },
      { sourceSha: previous },
      { previousApiSha: sha },
      { historyDigest: 'f'.repeat(64) },
      { planDigest: 'f'.repeat(64) },
      { backupSha256: 'invalid' },
      { offMacCopyVerified: false },
      { deletionEpochAuthLedgerVerified: false },
      { isolatedRestoreVerified: false },
      { backwardCompatibleWithPreviousApi: false },
      { backupVerifiedAt: new Date(now - 25 * 60 * 60_000).toISOString() },
      { restoreVerifiedAt: new Date(now + 1).toISOString() },
      { expiresAt: new Date(now - 1).toISOString() },
      { ledgerVerifiedAt: 'invalid' },
    ])
      expect(() =>
        requireRecoveryAttestation(
          JSON.stringify({ ...attestation(), ...change }),
          plan,
          sha,
          previous,
          now,
        ),
      ).toThrow();
  });
  it('accepts a test-data waiver only for this plan, for one day, and never mixed with a partial recovery proof', () => {
    const plan = migrationPlan(entries, applied, sha, previous);
    const waiver = {
      kind: 'test-data-waiver',
      version: 1,
      project: stagingProject,
      sourceSha: sha,
      previousApiSha: previous,
      historyDigest: plan.historyDigest,
      planDigest: plan.digest,
      testDataOnly: true,
      ownerApprovedAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 60_000).toISOString(),
    };
    expect(() =>
      requireRecoveryAttestation(
        JSON.stringify(waiver),
        plan,
        sha,
        previous,
        now,
      ),
    ).not.toThrow();
    for (const change of [
      { kind: 'other' },
      { version: 2 },
      { project: 'other' },
      { sourceSha: previous },
      { previousApiSha: sha },
      { historyDigest: 'f'.repeat(64) },
      { planDigest: 'f'.repeat(64) },
      { testDataOnly: false },
      { testDataOnly: 'true' },
      { ownerApprovedAt: new Date(now - 25 * 60 * 60_000).toISOString() },
      { ownerApprovedAt: new Date(now + 1).toISOString() },
      { ownerApprovedAt: 'invalid' },
      { expiresAt: new Date(now - 1).toISOString() },
      {
        ownerApprovedAt: new Date(now - 60_000).toISOString(),
        expiresAt: new Date(now + 24 * 60 * 60_000).toISOString(),
      },
    ])
      expect(() =>
        requireRecoveryAttestation(
          JSON.stringify({ ...waiver, ...change }),
          plan,
          sha,
          previous,
          now,
        ),
      ).toThrow();
    // A real recovery proof that names the waiver kind is judged as a waiver.
    expect(() =>
      requireRecoveryAttestation(
        JSON.stringify({ ...attestation(), kind: 'test-data-waiver' }),
        plan,
        sha,
        previous,
        now,
      ),
    ).toThrow();
  });
});

describe('release lease and first-release migration guard', () => {
  const config = {
    migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    migrationsSchema: 'drizzle',
  };
  function fixture(failure?: string) {
    const calls: string[] = [];
    const history = migrationEntries(config).map((entry) => ({
      created_at: entry.when,
      hash: entry.hash,
    }));
    const client = {
      query: async (query: string) => {
        calls.push(query);
        if (query.includes('pg_try_advisory_lock'))
          return { rows: [{ locked: failure !== 'busy' }] };
        if (query.includes('from pg_roles'))
          return {
            rows: [
              {
                role_ok: failure !== 'role',
                database: failure === 'database' ? 'other' : 'postgres',
              },
            ],
          };
        if (query.includes('to_regclass'))
          return {
            rows:
              failure === 'unreadable'
                ? []
                : [{ present: failure !== 'empty' }],
          };
        if (query.startsWith('select hash'))
          return {
            rows:
              failure === 'pending'
                ? history.slice(0, -1)
                : failure === 'history'
                  ? [{ ...history[0], hash: '0'.repeat(64) }]
                  : history,
          };
        return { rows: [] };
      },
    } as unknown as Client;
    return { client, calls };
  }
  it('holds one restricted-role session and reads the current history before code-only work', async () => {
    const f = fixture();
    expect(
      await withStagingRelease(
        f.client,
        {
          config,
          operation: 'deploy',
          sourceSha: sha,
          previousApiSha: previous,
          expectedDatabase: 'postgres',
        },
        async () => {
          expect(f.calls[0]).toContain('pg_try_advisory_lock');
          expect(f.calls[1]).toContain('from pg_roles');
          expect(f.calls[2]).toContain('to_regclass');
          expect(f.calls[3]).toContain('select hash');
          expect(
            f.calls.some((query) => query.includes('pg_advisory_unlock')),
          ).toBe(false);
          return 'deployed';
        },
      ),
    ).toBe('deployed');
    expect(f.calls.at(-1)).toContain('pg_advisory_unlock');
  });
  for (const failure of ['busy', 'role', 'database', 'pending', 'history'])
    it(`refuses a code-only deploy on ${failure} and releases an acquired lock`, async () => {
      const f = fixture(failure);
      let deploys = 0;
      await expect(
        withStagingRelease(
          f.client,
          {
            config,
            operation: 'deploy',
            sourceSha: sha,
            previousApiSha: previous,
            expectedDatabase: 'postgres',
          },
          async () => {
            deploys++;
          },
        ),
      ).rejects.toThrow('Staging release guard failed');
      expect(deploys).toBe(0);
      expect(
        f.calls.some((query) => query.includes('pg_advisory_unlock')),
      ).toBe(failure !== 'busy');
      expect(
        f.calls.some((query) => /^(?:begin|insert|alter|create)/i.test(query)),
      ).toBe(false);
    });
  it('plans every migration for a first release into a project with no migrations table', async () => {
    const f = fixture('empty');
    const pending = await withStagingRelease(
      f.client,
      {
        config,
        operation: 'prepare',
        sourceSha: sha,
        previousApiSha: async () => 'none',
        expectedDatabase: 'postgres',
      },
      async (plan) => plan.pending.map(({ tag }) => tag),
    );
    expect(pending).toEqual(migrationEntries(config).map(({ tag }) => tag));
    expect(f.calls.some((query) => query.startsWith('select hash'))).toBe(
      false,
    );
    expect(f.calls.at(-1)).toContain('pg_advisory_unlock');
  });
  it('refuses a migrations table it cannot confirm absent rather than reading it as empty', async () => {
    const f = fixture('unreadable');
    let planned = false;
    await expect(
      withStagingRelease(
        f.client,
        {
          config,
          operation: 'prepare',
          sourceSha: sha,
          previousApiSha: async () => 'none',
          expectedDatabase: 'postgres',
        },
        async () => {
          planned = true;
        },
      ),
    ).rejects.toMatchObject({ reason: 'applied_migration_history_unreadable' });
    expect(planned).toBe(false);
    expect(f.calls.at(-1)).toContain('pg_advisory_unlock');
  });
  for (const failure of [undefined, 'pending'])
    it(`refuses the none marker for a project with ${failure ?? 'current'} migration history and releases the lock`, async () => {
      const f = fixture(failure);
      let deployed = false;
      for (const operation of ['deploy', 'migrate-deploy'] as const)
        await expect(
          withStagingRelease(
            f.client,
            {
              config,
              operation,
              sourceSha: sha,
              previousApiSha: async () => 'none',
              expectedDatabase: 'postgres',
              planDigest: operation === 'deploy' ? undefined : 'f'.repeat(64),
            },
            async () => {
              deployed = true;
            },
          ),
        ).rejects.toMatchObject({ reason: 'serving_function_missing' });
      expect(deployed).toBe(false);
      expect(f.calls.at(-1)).toContain('pg_advisory_unlock');
    });
  it('releases the lock after failed work and preserves ordinary code-only release behavior', async () => {
    const f = fixture();
    await expect(
      withStagingRelease(
        f.client,
        {
          config,
          operation: 'deploy',
          sourceSha: sha,
          previousApiSha: previous,
          expectedDatabase: 'postgres',
        },
        async () => {
          throw new Error('upload failed');
        },
      ),
    ).rejects.toThrow('upload failed');
    expect(f.calls.at(-1)).toContain('pg_advisory_unlock');
  });
});
