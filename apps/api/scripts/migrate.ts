import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { poolOptions } from '../src/db/client.js';
import { readConfig } from '../src/config.js';

const url = process.env.MIGRATION_DATABASE_URL;
if (!url || url === process.env.DATABASE_URL)
  throw new Error('A separate MIGRATION_DATABASE_URL is required');
const config = readConfig({
  ...process.env,
  DATABASE_URL: url,
  DATABASE_POOL_MAX: '1',
});
const pool = new Pool(poolOptions(config));
try {
  const role = await pool.query<{ current_user: string }>(
    'select current_user',
  );
  if (role.rows[0]?.current_user !== 'justgo_migrator')
    throw new Error('Migrations require justgo_migrator');
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    migrationsSchema: 'drizzle',
  });
  console.info('Migrations applied');
} catch {
  console.error(
    'Migration failed. Check the migration connection and reviewed SQL; credentials have been omitted.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
