import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkDatabase,
  createDatabase,
  poolOptions,
  withOwner,
} from '../src/db/client.js';
import { readConfig } from '../src/config.js';

const config = readConfig();
const migrationUrl = process.env.MIGRATION_DATABASE_URL;
if (
  !config.DATABASE_URL ||
  !migrationUrl ||
  !['localhost', '127.0.0.1'].includes(new URL(config.DATABASE_URL).hostname) ||
  !['localhost', '127.0.0.1'].includes(new URL(migrationUrl).hostname)
) {
  throw new Error(
    'Database integration tests require the dedicated local test database. Run npm run db:local first.',
  );
}
const runtime = createDatabase(config);
const admin = new Pool(
  poolOptions(readConfig({ ...process.env, DATABASE_URL: migrationUrl })),
);
const table = `isolation_test_${randomUUID().replaceAll('-', '')}`;
const tableSql = sql.raw(`justgo.${table}`);
const alice = randomUUID();
const bob = randomUUID();

beforeAll(async () => {
  await admin.query(`create table justgo.${table} (id uuid primary key, user_id uuid not null, value text not null);
    alter table justgo.${table} enable row level security;
    alter table justgo.${table} force row level security;
    create policy owner_only on justgo.${table} to justgo_runtime
      using (user_id = (select justgo.current_user_id()))
      with check (user_id = (select justgo.current_user_id()));
    grant select, insert, update, delete on justgo.${table} to justgo_runtime;`);
});
afterAll(async () => {
  try {
    await admin.query(`drop table if exists justgo.${table}`);
  } finally {
    await Promise.all([admin.end(), runtime.pool.end()]);
  }
});

describe('actual restricted runtime role', () => {
  it('can read readiness but cannot create tables or assume the migration role', async () => {
    await expect(checkDatabase(runtime.pool)).resolves.toBeUndefined();
    await expect(
      runtime.pool.query('create table justgo.forbidden (id int)'),
    ).rejects.toThrow();
    await expect(
      runtime.pool.query('set role justgo_migrator'),
    ).rejects.toThrow();
  });
  it('isolates two owners and denies owner changes and unscoped reads', async () => {
    const id = randomUUID();
    await withOwner(runtime.db, alice, (tx) =>
      tx.execute(
        sql`insert into ${tableSql} values (${id}, ${alice}, 'fixture')`,
      ),
    );
    const bobRows = await withOwner(runtime.db, bob, (tx) =>
      tx.execute(sql`select * from ${tableSql}`),
    );
    expect(bobRows.rows).toHaveLength(0);
    const aliceRows = await withOwner(runtime.db, alice, (tx) =>
      tx.execute(sql`select * from ${tableSql}`),
    );
    expect(aliceRows.rows).toHaveLength(1);
    await expect(
      withOwner(runtime.db, bob, (tx) =>
        tx.execute(
          sql`insert into ${tableSql} values (${randomUUID()}, ${alice}, 'forged')`,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      withOwner(runtime.db, alice, (tx) =>
        tx.execute(
          sql`update ${tableSql} set user_id = ${bob} where id = ${id}`,
        ),
      ),
    ).rejects.toThrow();
    expect(
      (await runtime.pool.query(`select * from justgo.${table}`)).rows,
    ).toHaveLength(0);
    expect(
      (await runtime.pool.query('select justgo.current_user_id() as owner'))
        .rows[0]?.owner,
    ).toBeNull();
  });
  it('rolls back writes and resets context after failure on the same pooled connection', async () => {
    const id = randomUUID();
    await expect(
      withOwner(runtime.db, alice, async (tx) => {
        await tx.execute(
          sql`insert into ${tableSql} values (${id}, ${alice}, 'rollback')`,
        );
        throw new Error('simulated failure');
      }),
    ).rejects.toThrow('simulated failure');
    const rows = await withOwner(runtime.db, alice, (tx) =>
      tx.execute(sql`select * from ${tableSql} where id = ${id}`),
    );
    expect(rows.rows).toHaveLength(0);
    expect(
      (await runtime.pool.query('select justgo.current_user_id() as owner'))
        .rows[0]?.owner,
    ).toBeNull();
  });
  it('does not mix simultaneous owner contexts through the small pool', async () => {
    const results = await Promise.all(
      [alice, bob, alice, bob].map((id) =>
        withOwner(runtime.db, id, (tx) =>
          tx.execute(sql`select justgo.current_user_id() as owner`),
        ),
      ),
    );
    expect(results.map((result) => result.rows[0]?.owner)).toEqual([
      alice,
      bob,
      alice,
      bob,
    ]);
  });
});
