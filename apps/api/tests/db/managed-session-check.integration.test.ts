import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { localTestDatabaseUrl } from '../../scripts/local-test-database.js';
import { checkManagedSessionHelper } from '../../src/db/managed-session-check.js';

const url = localTestDatabaseUrl(process.env.JUSTGO_TEST_ADMIN_DATABASE_URL);
if (url.username !== 'postgres' || process.env.DATABASE_SSL !== 'disable')
  throw new Error(
    'Session-helper fixtures require the isolated postgres operator',
  );
const pool = new Pool({ connectionString: url.toString(), ssl: false, max: 1 });
let client: PoolClient | undefined;
const owner = randomUUID();
const otherOwner = randomUUID();
const ids = Array.from({ length: 4 }, () => randomUUID());
const helper = 'justgo_auth_private.is_live_session_v1';
const operator = readFileSync(
  new URL('../../scripts/managed-auth/session-check-v1.sql', import.meta.url),
  'utf8',
);
const readiness = () =>
  checkManagedSessionHelper({
    query: (text: string) => client!.query(text),
  } as unknown as Pool);

beforeAll(async () => {
  client = await pool.connect();
  await client.query('begin');
  const existing = await client.query<{ occupied: boolean }>(`select
    to_regnamespace('auth') is not null
    or to_regnamespace('justgo_auth_private') is not null as occupied`);
  if (existing.rows[0]?.occupied)
    throw new Error('Session-helper fixtures refuse pre-existing Auth schemas');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    if (
      !(await client.query('select 1 from pg_roles where rolname=$1', [role]))
        .rowCount
    )
      await client.query(`create role ${role} nologin`);
  }
  await client.query(`create schema auth authorization postgres;
    create table auth.sessions (
      id uuid primary key, user_id uuid not null,
      not_after timestamptz, private_fixture text,
      session_id uuid, auth_user_id uuid
    );
    grant select (id,user_id,not_after) on auth.sessions to justgo_runtime;`);
  for (let index = 0; index < ids.length; index++)
    await client.query(
      `insert into auth.sessions(id,user_id,not_after,private_fixture) values ($1,$2,
      case $3::integer when 0 then null when 1 then now()+interval '1 hour'
        when 2 then now()-interval '1 second' else now() end,'synthetic')`,
      [ids[index], owner, index],
    );
  // The fixture owns the outer transaction, including roles/schemas. Only remove
  // the operator script's two transaction delimiters; execute its actual DDL.
  expect(operator.match(/^begin;$/gm)).toHaveLength(1);
  expect(operator.match(/^commit;$/gm)).toHaveLength(1);
  await client.query(
    operator.replace(/^begin;$/m, '').replace(/^commit;$/m, ''),
  );
});
beforeEach(async () => {
  await client!.query('savepoint session_check_case');
});
afterEach(async () => {
  await client!.query('rollback to savepoint session_check_case');
});
afterAll(async () => {
  try {
    if (client) await client.query('rollback');
  } finally {
    client?.release();
    await pool.end();
  }
});

describe('real PostgreSQL private Auth-session capability', () => {
  it('installs the exact postgres-owned restricted helper and accepts runtime readiness', async () => {
    await client!.query('set local role justgo_runtime');
    await expect(readiness()).resolves.toBeUndefined();
    const direct = await client!.query<{ allowed: boolean }>(`select
      has_column_privilege(current_user,c.oid,'id','SELECT')
      or has_column_privilege(current_user,c.oid,'user_id','SELECT')
      or has_column_privilege(current_user,c.oid,'not_after','SELECT') as allowed
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='auth' and c.relname='sessions'`);
    expect(direct.rows[0]?.allowed).toBe(false);
  });

  it('checks the exact verified subject/session pair, null bounds and strict expiry without exposing records', async () => {
    await client!.query('set local role justgo_runtime');
    const live = async (id: string | null, subject: string | null) =>
      (
        await client!.query<{ live: boolean | null }>(
          `select ${helper}($1::uuid,$2::uuid) as live`,
          [id, subject],
        )
      ).rows[0]?.live;
    expect(await live(ids[0]!, owner)).toBe(true);
    expect(await live(ids[1]!, owner)).toBe(true);
    expect(await live(ids[2]!, owner)).toBe(false);
    expect(await live(ids[3]!, owner)).toBe(false);
    expect(await live(ids[0]!, otherOwner)).toBe(false);
    expect(await live(randomUUID(), owner)).toBe(false);
    expect(await live(null, owner)).toBeNull();
    expect(await live(ids[0]!, null)).toBeNull();
    // Request-like SQL settings cannot replace the server-verified arguments.
    await client!.query("select set_config('request.jwt.claim.sub',$1,true)", [
      owner,
    ]);
    expect(await live(ids[0]!, otherOwner)).toBe(false);
  });

  it('denies direct Auth reads/writes and private-helper creation to runtime', async () => {
    await client!.query('set local role justgo_runtime');
    for (const statement of [
      'select id,user_id,not_after from auth.sessions',
      'delete from auth.sessions',
      'create table justgo_auth_private.forbidden(id integer)',
    ]) {
      await client!.query('savepoint denied_operation');
      await expect(client!.query(statement)).rejects.toMatchObject({
        code: '42501',
      });
      await client!.query('rollback to savepoint denied_operation');
    }
  });

  it('denies helper access to public, anonymous, authenticated and service roles', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const grant = await client!.query<{ usage: boolean; execute: boolean }>(
        `select
        has_schema_privilege($1,'justgo_auth_private','USAGE') as usage,
        has_function_privilege($1,'${helper}(uuid,uuid)','EXECUTE') as execute`,
        [role],
      );
      expect(grant.rows[0]).toEqual({ usage: false, execute: false });
      await client!.query('savepoint denied_role');
      await client!.query(`set local role ${role}`);
      await expect(
        client!.query(`select ${helper}($1,$2)`, [ids[0], owner]),
      ).rejects.toMatchObject({ code: '42501' });
      await client!.query('rollback to savepoint denied_role');
    }
    const publicGrant = await client!.query<{
      exposed: boolean;
    }>(`select exists (
      select 1 from pg_proc p,
      lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid='${helper}(uuid,uuid)'::regprocedure and a.grantee=0
    ) as exposed`);
    expect(publicGrant.rows[0]?.exposed).toBe(false);
  });

  it('fails runtime readiness for altered body, search path, owner, permissions or missing helper', async () => {
    for (const change of [
      `create or replace function ${helper}(session_id uuid,auth_user_id uuid)
        returns boolean language sql stable strict security definer
        set search_path='' as 'select true;'`,
      `alter function ${helper}(uuid,uuid) set search_path=public`,
      `alter function ${helper}(uuid,uuid) security invoker`,
      `alter function ${helper}(uuid,uuid) owner to justgo_migrator`,
      `grant execute on function ${helper}(uuid,uuid) to public`,
      `grant execute on function ${helper}(uuid,uuid) to service_role`,
      'grant create on schema justgo_auth_private to justgo_runtime',
      'grant justgo_runtime to authenticated with inherit true, set false',
      'grant justgo_runtime to anon with inherit false, set true',
      'grant postgres to justgo_runtime with inherit false, set true',
      'grant usage on schema auth to justgo_runtime',
      'grant select (private_fixture) on auth.sessions to justgo_runtime',
      `revoke execute on function ${helper}(uuid,uuid) from justgo_runtime`,
      `drop function ${helper}(uuid,uuid)`,
    ]) {
      await client!.query('savepoint altered_helper');
      await client!.query(change);
      await client!.query('set local role justgo_runtime');
      await expect(readiness()).rejects.toThrow('readiness check failed');
      await client!.query('rollback to savepoint altered_helper');
    }
  });
});
