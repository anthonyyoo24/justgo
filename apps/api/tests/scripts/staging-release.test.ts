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
  withStagingBootstrap,
  withStagingRelease,
} from '../../scripts/staging-release-guard.js';

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
    const good = `postgresql://justgo_migrator.${stagingProject}:private-fixture@aws-0-ca-central-1.pooler.supabase.com:5432/postgres`;
    expect(
      hostedMigrationOptions(good, rootCertificates[0]).ssl.rejectUnauthorized,
    ).toBe(true);
    for (const value of [
      undefined,
      good.replace('5432', '6543'),
      good.replace(stagingProject, 'other'),
      good.replace('justgo_migrator', 'postgres'),
      good.replace('aws-0-ca-central-1.pooler.supabase.com', '127.0.0.1'),
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
});

describe('shared release lease and first Worker migration guard', () => {
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
  it('uses the same restricted-role session and exact current history before the first upload', async () => {
    const f = fixture();
    expect(
      await withStagingBootstrap(f.client, config, async () => {
        expect(f.calls[0]).toContain('pg_try_advisory_lock');
        expect(f.calls[1]).toContain('from pg_roles');
        expect(f.calls[2]).toContain('select hash');
        expect(
          f.calls.some((query) => query.includes('pg_advisory_unlock')),
        ).toBe(false);
        return 'uploaded';
      }),
    ).toBe('uploaded');
    expect(f.calls.at(-1)).toContain('pg_advisory_unlock');
  });
  for (const failure of ['busy', 'role', 'database', 'pending', 'history'])
    it(`refuses ${failure} before first upload and releases an acquired lock`, async () => {
      const f = fixture(failure);
      let uploads = 0;
      await expect(
        withStagingBootstrap(f.client, config, async () => {
          uploads++;
        }),
      ).rejects.toThrow('Staging release guard failed');
      expect(uploads).toBe(0);
      expect(
        f.calls.some((query) => query.includes('pg_advisory_unlock')),
      ).toBe(failure !== 'busy');
      expect(
        f.calls.some((query) => /^(?:begin|insert|alter|create)/i.test(query)),
      ).toBe(false);
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
