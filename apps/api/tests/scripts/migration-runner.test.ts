import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NodePgClient } from 'drizzle-orm/node-postgres';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyMigrations,
  migrationDiagnostic,
} from '../../scripts/migration-runner.js';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders
      .splice(0)
      .map((folder) => rm(folder, { recursive: true, force: true })),
  );
});
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'justgo-migration-unit-'));
  folders.push(folder);
  await mkdir(join(folder, 'meta'));
  await writeFile(
    join(folder, 'meta/_journal.json'),
    JSON.stringify({
      entries: [
        { tag: '0001_first', when: 1, breakpoints: true },
        { tag: '0002_second', when: 2, breakpoints: true },
      ],
    }),
  );
  for (const tag of ['0001_first', '0002_second'])
    await writeFile(join(folder, `${tag}.sql`), 'select 1;');
  return { migrationsFolder: folder, migrationsSchema: 'drizzle' };
}
function connection(
  options: {
    failStatement?: number;
    failSetup?: boolean;
    failCommit?: boolean;
    applied?: number;
  } = {},
) {
  const calls: { text: string; params: unknown[] }[] = [];
  let statements = 0;
  const query = vi.fn(
    async (input: { text: string }, params: unknown[] = []) => {
      const text = input.text;
      calls.push({ text, params });
      if (
        (options.failSetup && text.startsWith('CREATE SCHEMA')) ||
        (options.failCommit && text === 'commit') ||
        (text === 'select 1;' && ++statements === options.failStatement)
      )
        throw Object.assign(
          new Error('private SQL, parameters and credentials'),
          { code: '42501', detail: 'private owner' },
        );
      return {
        rows:
          text.startsWith('select id, hash, created_at') && options.applied
            ? [{ created_at: options.applied }]
            : [],
      };
    },
  );
  // The fixture implements just the pg query boundary used by a single client.
  return { client: { query } as unknown as NodePgClient, calls };
}

describe('migration diagnostics without changing Drizzle execution', () => {
  it('preserves SQL, hashes, order and one transaction for all pending files', async () => {
    const config = await fixture();
    const { client, calls } = connection();
    await applyMigrations(client, config);
    expect(calls.filter(({ text }) => text === 'select 1;')).toHaveLength(2);
    expect(calls.filter(({ text }) => text === 'begin')).toHaveLength(1);
    expect(calls.filter(({ text }) => text === 'commit')).toHaveLength(1);
    expect(calls.filter(({ text }) => text === 'rollback')).toHaveLength(0);
    expect(
      calls
        .filter(({ text }) => text.startsWith('insert into'))
        .map(({ params }) => params),
    ).toEqual([
      [createHash('sha256').update('select 1;').digest('hex'), 1],
      [createHash('sha256').update('select 1;').digest('hex'), 2],
    ]);
  });
  it('identifies the second file even when its SQL is identical, with one rollback', async () => {
    const config = await fixture();
    const { client, calls } = connection({ failStatement: 2 });
    const error = await applyMigrations(client, config).catch(
      (failure: unknown) => failure,
    );
    expect(migrationDiagnostic(error)).toEqual({
      event: 'migration_failed',
      migration: '0002_second.sql',
      sqlState: '42501',
    });
    expect(calls.filter(({ text }) => text === 'begin')).toHaveLength(1);
    expect(calls.filter(({ text }) => text === 'rollback')).toHaveLength(1);
    expect(calls.some(({ text }) => text === 'commit')).toBe(false);
    expect(JSON.stringify(migrationDiagnostic(error))).not.toContain('private');
  });
  it('attributes failure to the actual pending file after an existing checkpoint', async () => {
    const config = await fixture();
    const { client, calls } = connection({ applied: 1, failStatement: 1 });
    const error = await applyMigrations(client, config).catch(
      (failure: unknown) => failure,
    );
    expect(migrationDiagnostic(error).migration).toBe('0002_second.sql');
    expect(calls.filter(({ text }) => text === 'select 1;')).toHaveLength(1);
  });
  it('does not blame the last file when transaction commit fails', async () => {
    const config = await fixture();
    const { client } = connection({ failCommit: true });
    const error = await applyMigrations(client, config).catch(
      (failure: unknown) => failure,
    );
    expect(migrationDiagnostic(error)).toEqual({
      event: 'migration_failed',
      sqlState: '42501',
    });
  });
  it('reports a safe setup code without inventing a migration filename', async () => {
    const config = await fixture();
    const { client, calls } = connection({ failSetup: true });
    const error = await applyMigrations(client, config).catch(
      (failure: unknown) => failure,
    );
    expect(migrationDiagnostic(error)).toEqual({
      event: 'migration_failed',
      sqlState: '42501',
    });
    expect(calls.some(({ text }) => text === 'begin')).toBe(false);
    expect(migrationDiagnostic(new Error('private connection URL'))).toEqual({
      event: 'migration_failed',
    });
  });
});
