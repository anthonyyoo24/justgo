import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

// Dedicated loopback-only PostgreSQL cluster; never touches an existing server.
const folder = resolve('.local');
const data = resolve(folder, 'postgres');
const bin = process.env.JUSTGO_PG_BIN ?? '/opt/homebrew/opt/postgresql@17/bin';
const run = (command, args) =>
  execFileSync(resolve(bin, command), args, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
mkdirSync(folder, { recursive: true, mode: 0o700 });
if (!existsSync(data))
  run('initdb', [
    '-D',
    data,
    '-U',
    'postgres',
    '--auth-local=trust',
    '--auth-host=trust',
    '--encoding=UTF8',
    '--locale=C',
  ]);
if (process.argv.includes('--stop')) {
  run('pg_ctl', ['-D', data, 'stop', '-m', 'fast']);
  console.info('JustGO local database stopped');
  process.exit(0);
}
try {
  run('pg_ctl', ['-D', data, 'status']);
} catch {
  run('pg_ctl', [
    '-D',
    data,
    '-l',
    resolve(folder, 'postgres.log'),
    '-o',
    '-p 54329 -h 127.0.0.1 -k /tmp',
    'start',
  ]);
}
const pool = new pg.Pool({
  connectionString: 'postgresql://postgres@127.0.0.1:54329/postgres',
});
try {
  const db = await pool.query(
    "select 1 from pg_database where datname = 'justgo_test'",
  );
  if (!db.rowCount) await pool.query('create database justgo_test');
} finally {
  await pool.end();
}
const admin = new pg.Pool({
  connectionString: 'postgresql://postgres@127.0.0.1:54329/justgo_test',
});
try {
  const role = await admin.query(
    "select 1 from pg_roles where rolname = 'justgo_runtime'",
  );
  if (!role.rowCount) {
    await admin.query(readFileSync('apps/api/scripts/provision.sql', 'utf8'));
    const runtimePassword = randomBytes(32).toString('hex');
    const migrationPassword = randomBytes(32).toString('hex');
    await admin.query(
      `alter role justgo_runtime password '${runtimePassword}'; alter role justgo_migrator password '${migrationPassword}';`,
    );
    const env = `DATABASE_URL=postgresql://justgo_runtime:${runtimePassword}@127.0.0.1:54329/justgo_test\nMIGRATION_DATABASE_URL=postgresql://justgo_migrator:${migrationPassword}@127.0.0.1:54329/justgo_test\nDATABASE_SSL=disable\nDATABASE_POOL_MAX=1\nCORS_ORIGINS=http://localhost:8081\nPORT=3000\n`;
    writeFileSync(resolve(folder, 'database.env'), env, { mode: 0o600 });
  }
  if (!existsSync('apps/api/.env'))
    writeFileSync(
      'apps/api/.env',
      readFileSync(resolve(folder, 'database.env')),
      { mode: 0o600 },
    );
  if (!existsSync('apps/mobile/.env'))
    writeFileSync(
      'apps/mobile/.env',
      'EXPO_PUBLIC_API_URL=http://localhost:3000\n',
      { mode: 0o600 },
    );
} finally {
  await admin.end();
}
console.info(
  'JustGO local database ready on 127.0.0.1:54329. Existing .env files were preserved. Run npm run db:migrate.',
);
