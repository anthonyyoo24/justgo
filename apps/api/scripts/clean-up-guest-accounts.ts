import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readConfig } from '../src/config.js';
import { poolOptions } from '../src/db/client.js';
import { cleanUpGuestAccounts } from './guest-account-cleanup.js';

let pool: Pool | undefined;
try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--dry-run'))
    throw new Error('Unknown argument');
  const dryRun = args.includes('--dry-run');
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL)
    throw new Error('Separate operator connection required');
  pool = new Pool(
    poolOptions(
      readConfig({ ...process.env, DATABASE_URL: url, DATABASE_POOL_MAX: '1' }),
    ),
  );
  if (
    (await pool.query<{ current_user: string }>('select current_user')).rows[0]
      ?.current_user !== 'justgo_migrator'
  )
    throw new Error('Operator role required');
  const userIds = await cleanUpGuestAccounts(drizzle(pool), { dryRun });
  console.info(
    JSON.stringify({
      event: 'guest_account_cleanup',
      dryRun,
      count: userIds.length,
      userIds,
    }),
  );
} catch {
  console.error(JSON.stringify({ event: 'guest_account_cleanup_failed' }));
  process.exitCode = 1;
} finally {
  await pool?.end();
}
