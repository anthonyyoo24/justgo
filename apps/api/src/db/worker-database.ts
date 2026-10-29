import { Pool, type PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { getPath } from 'hono/utils/url';
import { readConfig, type Config } from '../config.js';
import { createDatabase } from './client.js';

export type WorkerBindings = Record<string, unknown> & {
  HYPERDRIVE?: { connectionString: string } | undefined;
  LOCK_DATABASE_URL?: string | undefined;
};

/** The binding owns the transport to Hyperdrive; origin TLS is verified at release. */
export function hyperdrivePoolOptions(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  const parameters = [...url.searchParams.entries()];
  // workerd supplies this parameter for its virtual, platform-owned transport.
  // It is not permission to disable TLS on an arbitrary origin connection.
  const virtualTransport =
    url.hostname.endsWith('.hyperdrive.local') &&
    parameters.length === 1 &&
    parameters[0]?.[0] === 'sslmode' &&
    parameters[0]?.[1] === 'disable';
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    (url.search && !virtualTransport) ||
    url.hash
  )
    throw new Error('Invalid Hyperdrive binding');
  return {
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
    statement_timeout: 5000,
    query_timeout: 6000,
    application_name: 'justgo-worker',
  };
}

export function readWorkerConfig(bindings: WorkerBindings) {
  const connectionString = bindings.HYPERDRIVE?.connectionString;
  if (!connectionString || !bindings.LOCK_DATABASE_URL)
    throw new Error('Worker database bindings are required');
  hyperdrivePoolOptions(connectionString);
  const environment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(bindings))
    if (typeof value === 'string') environment[key] = value;
  // A direct URL secret never overrides the Hyperdrive connection for ordinary requests.
  const config = readConfig({
    ...environment,
    DATABASE_URL: connectionString,
    DATABASE_SSL: 'verify-full',
    DATABASE_POOL_MAX: '1',
  });
  const lockConfig = readConfig({
    ...environment,
    DATABASE_URL: bindings.LOCK_DATABASE_URL,
    DATABASE_POOL_MAX: '1',
  });
  const lockUrl = new URL(bindings.LOCK_DATABASE_URL);
  const bindingUrl = new URL(connectionString);
  if (lockUrl.username !== 'justgo_runtime' || lockUrl.search || lockUrl.hash)
    throw new Error(
      'Worker lock connection requires the restricted runtime role',
    );
  if (
    bindingUrl.username !== lockUrl.username ||
    bindingUrl.pathname !== lockUrl.pathname
  )
    throw new Error(
      'Worker database connections must identify the same role and database',
    );
  if (!config.JUSTGO_SOURCE_SHA || config.NODE_ENV !== 'production')
    throw new Error('Worker release identity is required');
  // Local smoke uses the same entrypoint with disposable legacy proofs. Hosted
  // targets always require managed Auth; there is no hosted fixture mode.
  if (
    !config.MANAGED_AUTH_ENABLED &&
    !(
      (new URL(connectionString).hostname === '127.0.0.1' ||
        new URL(connectionString).hostname.endsWith('.hyperdrive.local')) &&
      new URL(connectionString).pathname === '/justgo_test' &&
      lockUrl.hostname === '127.0.0.1' &&
      lockUrl.pathname === '/justgo_test'
    )
  )
    throw new Error('Hosted Workers require managed Auth');
  if (lockUrl.hostname !== '127.0.0.1') {
    if (
      !config.SUPABASE_URL ||
      lockUrl.hostname !== `db.${new URL(config.SUPABASE_URL).hostname}` ||
      lockUrl.pathname !== '/postgres' ||
      !['', '5432'].includes(lockUrl.port) ||
      lockConfig.DATABASE_SSL !== 'verify-full'
    )
      throw new Error(
        'Worker direct connection must match its Supabase project',
      );
  }
  return { config, lockConfig, connectionString };
}

/** Keep whole advisory-lock transactions on one direct connection, never split them. */
export function needsDirectTransaction(request: Request): boolean {
  const path = getPath(request).replace(/\/$/, '');
  return (
    (request.method === 'POST' &&
      ['/v1/auth/session', '/v1/sessions', '/v1/transfers'].includes(path)) ||
    (request.method === 'DELETE' && /^\/v1\/transfers\/[^/]+$/.test(path))
  );
}

export function createWorkerDatabase(
  request: Request,
  settings: { connectionString: string; lockConfig: Config },
) {
  if (needsDirectTransaction(request))
    return createDatabase(settings.lockConfig);
  // Workers sockets cannot be reused by a later request. Hyperdrive owns the
  // upstream pool; this one-connection pg pool lives only for this invocation.
  const pool = new Pool(hyperdrivePoolOptions(settings.connectionString));
  pool.on('error', () =>
    console.error(JSON.stringify({ event: 'database_pool_error' })),
  );
  return { pool, db: drizzle(pool) };
}
