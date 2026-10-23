import { Pool } from 'pg';
import { readConfig } from '../src/config.js';
import { poolOptions } from '../src/db/client.js';
import { createManagedAuthDeletion } from '../src/identity/managed-deletion.js';
import { retryManagedAuthDeletions } from './auth-deletion-cleanup.js';

let pool: Pool | undefined;
try {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL)
    throw new Error('Separate operator connection required');
  const config = readConfig({
    ...process.env,
    DATABASE_URL: url,
    DATABASE_POOL_MAX: '1',
  });
  if (!config.SUPABASE_URL || !config.SUPABASE_AUTH_SECRET_KEY)
    throw new Error('Auth deletion credentials required');
  pool = new Pool(poolOptions(config));
  if (
    (await pool.query<{ current_user: string }>('select current_user')).rows[0]
      ?.current_user !== 'justgo_migrator'
  )
    throw new Error('Operator role required');
  const result = await retryManagedAuthDeletions(
    pool,
    createManagedAuthDeletion(
      config.SUPABASE_URL,
      config.SUPABASE_AUTH_SECRET_KEY,
    ),
  );
  console.info(JSON.stringify({ event: 'managed_auth_cleanup', ...result }));
  if (result.failed) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ event: 'managed_auth_cleanup_failed' }));
  process.exitCode = 1;
} finally {
  await pool?.end();
}
