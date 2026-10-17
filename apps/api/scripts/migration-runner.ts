import { DrizzleQueryError } from 'drizzle-orm/errors';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';
import { NodePgSession, type NodePgClient } from 'drizzle-orm/node-postgres';
import { readMigrationFiles, type MigrationConfig } from 'drizzle-orm/migrator';
import { sqlState } from '../src/http/diagnostics.js';

const setupFailureReasons = [
  'separate_connection_required',
  'invalid_configuration',
  'migrator_role_required',
] as const;

export class MigrationSetupFailure extends Error {
  constructor(
    readonly reason: (typeof setupFailureReasons)[number],
    cause?: unknown,
  ) {
    super('Migration setup failed', { cause });
  }
}

export class MigrationFailure extends Error {
  constructor(
    readonly migration: string | undefined,
    cause: unknown,
  ) {
    super('Migration failed', { cause });
  }
}

/** Retain Drizzle's single transaction, original SQL, hashes and checkpoint semantics. */
export async function applyMigrations(
  client: NodePgClient,
  config: MigrationConfig,
) {
  let current: string | undefined;
  try {
    const journal = JSON.parse(
      readFileSync(join(config.migrationsFolder, 'meta/_journal.json'), 'utf8'),
    ) as {
      entries: { tag: string; when: number }[];
    };
    const tags = new Map(
      journal.entries.map(({ tag, when }) => {
        if (!/^\d{4}_[a-z0-9_]+$/.test(tag))
          throw new Error('Invalid migration registry');
        return [when, tag] as const;
      }),
    );
    const migrations = readMigrationFiles(config).map((migration) => {
      const tag = tags.get(migration.folderMillis);
      if (!tag) throw new Error('Migration registry mismatch');
      return {
        ...migration,
        // Drizzle reads SQL only for a pending migration. Tracking this read avoids
        // guessing from SQL text, which can be identical in different files.
        get sql() {
          current = tag;
          return migration.sql;
        },
      };
    });
    const dialect = new PgDialect();
    const session = new NodePgSession<
      Record<string, never>,
      Record<string, never>
    >(client, dialect, undefined);
    await dialect.migrate(migrations, session, config);
  } catch (cause) {
    // A transaction control failure is not attributable to the last SQL file.
    if (
      cause instanceof DrizzleQueryError &&
      /^(begin|commit|rollback)$/i.test(cause.query.trim())
    )
      current = undefined;
    throw new MigrationFailure(current, cause);
  }
}

export function migrationDiagnostic(error: unknown) {
  const code = sqlState(error);
  return {
    event: 'migration_failed',
    ...(error instanceof MigrationSetupFailure &&
    setupFailureReasons.includes(error.reason)
      ? { reason: error.reason }
      : {}),
    ...(error instanceof MigrationFailure &&
    error.migration &&
    /^\d{4}_[a-z0-9_]+$/.test(error.migration)
      ? { migration: `${error.migration}.sql` }
      : {}),
    ...(code ? { sqlState: code } : {}),
  };
}
