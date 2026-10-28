import { Pool, type PoolConfig } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Config } from '../config.js';
import { checkManagedSessionHelper } from './managed-session-check.js';

export function poolOptions(config: Config): PoolConfig {
  if (!config.DATABASE_URL) throw new Error('Database is not configured');
  const url = new URL(config.DATABASE_URL);
  // Prevent pg connection-string parameters from overriding certificate checks.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
    url.searchParams.delete(key);
  return {
    connectionString: url.toString(),
    ssl:
      config.DATABASE_SSL === 'disable'
        ? false
        : {
            rejectUnauthorized: true,
            ...(config.DATABASE_CA_CERT ? { ca: config.DATABASE_CA_CERT } : {}),
          },
    max: config.DATABASE_POOL_MAX,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
    query_timeout: 6000,
    application_name: 'justgo-api',
  };
}

export function createDatabase(config: Config) {
  const pool = new Pool(poolOptions(config));
  // Do not log errors containing SQL, connection strings or private data.
  pool.on('error', () => {
    console.error(JSON.stringify({ event: 'database_pool_error' }));
  });
  return { pool, db: drizzle(pool) };
}

type Transaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

/** Pass only an identity derived from a verified server session, never a request field. */
export async function withOwner<T>(
  db: NodePgDatabase,
  verifiedUserId: string,
  operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
  const userId = z.uuid().parse(verifiedUserId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return operation(tx);
  });
}

export async function checkDatabase(pool: Pool): Promise<void> {
  const result = await pool.query<{
    role_ok: boolean;
    foundation_ok: boolean;
  }>(`
    select current_user = 'justgo_runtime'
      and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb
      and not pg_has_role(current_user, 'justgo_migrator', 'MEMBER')
      and not has_schema_privilege(current_user, 'justgo', 'CREATE') as role_ok,
      has_schema_privilege(current_user, 'justgo', 'USAGE')
      and to_regclass('justgo.device_sessions') is not null
      and to_regclass('justgo.recovery_credentials') is not null
      and justgo.current_user_id() is null as foundation_ok
    from pg_roles where rolname = current_user
  `);
  const row = result.rows[0];
  if (!row?.role_ok || !row.foundation_ok)
    throw new Error('Database readiness check failed');
}

const managedRelations = {
  users: {
    columns: {
      data_epoch: ['integer', true],
      data_deleted_at: ['timestamp with time zone', false],
    },
    grants: ['select', 'insert', 'update'],
  },
  managed_auth_accounts: {
    columns: { auth_user_id: ['uuid', true], user_id: ['uuid', true] },
    grants: ['select', 'insert'],
  },
  managed_auth_sessions: {
    columns: {
      id: ['uuid', true],
      auth_user_id: ['uuid', true],
      user_id: ['uuid', true],
      device_id: ['uuid', true],
      expires_at: ['timestamp with time zone', true],
      revoked_at: ['timestamp with time zone', false],
    },
    grants: ['select', 'insert', 'update'],
  },
  journal_versions: {
    columns: {
      user_id: ['uuid', true],
      version_id: ['uuid', true],
      attempt_id: ['uuid', true],
      parents: ['uuid[]', true],
      feeling_scale_version: ['integer', true],
      reflection: ['jsonb', true],
      context: ['jsonb', false],
    },
    grants: ['select', 'insert', 'delete'],
  },
  deleted_completion_ids: {
    columns: { user_id: ['uuid', true], attempt_id: ['uuid', true] },
    grants: ['select', 'insert'],
  },
  managed_auth_deletions: {
    columns: {
      user_id: ['uuid', true],
      auth_user_id: ['uuid', true],
      requested_at: ['timestamp with time zone', true],
      completed_at: ['timestamp with time zone', false],
    },
    grants: ['select', 'insert', 'update'],
  },
} as const;

type ManagedRelation = {
  name: string;
  kind: string;
  rls: boolean;
  forced: boolean;
  columns: Record<string, [string, boolean]>;
  select: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
};

/** Probe the deployed managed schema as the runtime role, without reading private rows. */
export async function checkManagedAuthDatabase(pool: Pool): Promise<void> {
  const schema = await pool.query<ManagedRelation>(
    `select c.relname as name,c.relkind as kind,
      c.relrowsecurity as rls,c.relforcerowsecurity as forced,
      jsonb_object_agg(a.attname,jsonb_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull)) as columns,
      has_table_privilege(current_user,c.oid,'SELECT') as select,
      has_table_privilege(current_user,c.oid,'INSERT') as insert,
      has_table_privilege(current_user,c.oid,'UPDATE') as update,
      has_table_privilege(current_user,c.oid,'DELETE') as delete
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    where n.nspname='justgo' and c.relname=any($1::text[])
    group by c.oid`,
    [Object.keys(managedRelations)],
  );
  if (
    !Object.entries(managedRelations).every(([name, expected]) => {
      const relation = schema.rows.find((row) => row.name === name);
      return (
        relation?.kind === 'r' &&
        relation.rls &&
        relation.forced &&
        expected.grants.every((grant) => relation[grant]) &&
        Object.entries(expected.columns).every(
          ([column, [type, notNull]]) =>
            relation.columns?.[column]?.[0] === type &&
            relation.columns[column]?.[1] === notNull,
        )
      );
    })
  )
    throw new Error('Managed Auth database readiness check failed');
  // Hosted Auth ACLs are internal; only the audited private capability is used.
  await checkManagedSessionHelper(pool);
}
