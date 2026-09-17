import { Pool, type PoolConfig } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Config } from '../config.js';

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
      and justgo.current_user_id() is null as foundation_ok
    from pg_roles where rolname = current_user
  `);
  const row = result.rows[0];
  if (!row?.role_ok || !row.foundation_ok)
    throw new Error('Database readiness check failed');
}
