import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { afterEach, expect, it } from 'vitest';
import { localTestDatabaseUrl } from '../../scripts/local-test-database.js';
import { rehearse } from '../../../../scripts/backups/rehearse.mjs';

const adminUrl = localTestDatabaseUrl(
  process.env.JUSTGO_TEST_ADMIN_DATABASE_URL,
);
const restoreName = () => `justgo_restore_${randomBytes(6).toString('hex')}`;
const killedRunDatabase = restoreName();
const manualRestoreDatabase = restoreName();
const failedSetup = 'Recovery rehearsal failed during isolated setup';

async function asAdmin<T>(run: (admin: Client) => Promise<T>) {
  const admin = new Client({ connectionString: adminUrl.href, ssl: false });
  await admin.connect();
  try {
    return await run(admin);
  } finally {
    await admin.end();
  }
}

const leaveKilledRun = () =>
  asAdmin(async (admin) => {
    await admin.query(
      await readFile(
        new URL('../../../../scripts/backups/backup-role.sql', import.meta.url),
        'utf8',
      ),
    );
    await admin.query(
      `create database ${killedRunDatabase} template template0`,
    );
    await admin.query(
      `comment on database ${killedRunDatabase} is 'justgo recovery rehearsal'`,
    );
  });

const leftovers = () =>
  asAdmin(async (admin) => ({
    role: (
      await admin.query("select 1 from pg_roles where rolname='justgo_backup'")
    ).rowCount,
    databases: (
      await admin.query<{ datname: string }>(
        "select datname from pg_database where datname like 'justgo\\_restore\\_%' order by datname",
      )
    ).rows.map(({ datname }) => datname),
  }));

afterEach(() =>
  asAdmin(async (admin) => {
    for (const name of [killedRunDatabase, manualRestoreDatabase])
      await admin.query(`drop database if exists ${name} with(force)`);
    await admin.query('drop role if exists justgo_backup');
  }),
);

it('drops the role and marked databases a killed run left, keeps an unmarked restore, then passes (#217)', async () => {
  await leaveKilledRun();
  await asAdmin((admin) =>
    admin.query(`create database ${manualRestoreDatabase} template template0`),
  );
  await rehearse(process.env);
  expect(await leftovers()).toEqual({
    role: 0,
    databases: [manualRestoreDatabase],
  });
}, 120_000);

it('leaves the resources of a rehearsal that still runs', async () => {
  await leaveKilledRun();
  await asAdmin(async (running) => {
    await running.query(
      "select pg_advisory_lock(hashtextextended('justgo recovery rehearsal', 0))",
    );
    await expect(rehearse(process.env)).rejects.toThrow(failedSetup);
  });
  expect(await leftovers()).toEqual({
    role: 1,
    databases: [killedRunDatabase],
  });
}, 120_000);

it('refuses an administrator outside loopback justgo_test before it connects', async () => {
  await expect(
    rehearse({
      ...process.env,
      JUSTGO_TEST_ADMIN_DATABASE_URL:
        'postgresql://postgres@db.example.invalid:5432/justgo_test',
    }),
  ).rejects.toThrow('dedicated loopback justgo_test');
});
