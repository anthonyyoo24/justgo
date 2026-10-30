import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { backupRoleQuery, verifyBackupRole } from './backup-role.mjs';

/**
 * Build valid catalog metadata with targeted overrides for privilege-drift cases.
 * This isolates verifier decisions; the local rehearsal separately exercises SQL ACLs.
 */
function approvedRole(overrides = {}) {
  return {
    role: 'justgo_backup',
    session_role: 'justgo_backup',
    login: true,
    inherit: true,
    superuser: false,
    create_database: false,
    create_role: false,
    replication: false,
    bypass_rls: true,
    connection_limit: 2,
    defaults: [
      'default_transaction_read_only=on',
      'statement_timeout=5min',
      'idle_in_transaction_session_timeout=12min',
      'search_path=pg_catalog',
    ],
    memberships: [
      { role: 'pg_read_all_data', inherit: true, set: false, admin: false },
    ],
    reader_has_memberships: false,
    owns_objects: false,
    table_writes: false,
    column_writes: false,
    sequence_writes: false,
    schema_create: false,
    database_create: false,
    definer_execution: false,
    session_limits: true,
    ...overrides,
  };
}
const verify = (role) =>
  verifyBackupRole({ query: async () => ({ rows: [role] }) });
const rejected = { message: 'Backup role privileges are not restricted' };

test('accepts exactly the dedicated inherited project reader without SET or ADMIN', async () => {
  let queries = 0;
  await verifyBackupRole({
    query: async (sql, parameters) => {
      queries++;
      assert.equal(sql, backupRoleQuery);
      assert.deepEqual(parameters, [false]);
      return { rows: [approvedRole()] };
    },
  });
  assert.equal(queries, 1);
  await verify(approvedRole({ defaults: approvedRole().defaults.reverse() }));
});

test('only a complete staging policy enables the parameter and all other drift remains rejected', async () => {
  const policy = {
    version: 1,
    approvalReference: 'synthetic-staging-cron-delete-approval',
    accountId: 'a'.repeat(32),
    bucket: 'justgo-test',
    environment: 'staging',
    jurisdiction: 'default',
    backupDays: 7,
    ledgerDays: 7,
    lockDays: 7,
    ageRecipient: `age1${'a'.repeat(58)}`,
    sourceHost: 'db.kmcpcauaxlgpevkkenwd.supabase.co',
    sourceDatabase: 'postgres',
    sourceProjectRef: 'kmcpcauaxlgpevkkenwd',
    allowCronJobRunDetailsDelete: true,
  };
  let calls = 0;
  const client = {
    query: async (_sql, parameters) => {
      calls++;
      assert.deepEqual(parameters, [true]);
      return { rows: [approvedRole()] };
    },
  };
  await verifyBackupRole(client, policy);
  assert.equal(calls, 1);
  for (const invalid of [
    { allowCronJobRunDetailsDelete: true },
    { ...policy, environment: 'production' },
    { ...policy, sourceProjectRef: 'a'.repeat(20) },
  ])
    await assert.rejects(verifyBackupRole(client, invalid));
  assert.equal(calls, 1);
  await assert.rejects(
    verifyBackupRole(
      { query: async () => ({ rows: [approvedRole({ table_writes: true })] }) },
      policy,
    ),
    rejected,
  );
});

test('rejects missing, duplicate, extra, transitive and elevated reader memberships', async (t) => {
  const allowed = approvedRole().memberships[0];
  for (const [name, memberships] of [
    ['missing', []],
    ['legacy no-membership role', undefined],
    ['duplicate grants', [allowed, allowed]],
    ['runtime membership', [allowed, { ...allowed, role: 'justgo_runtime' }]],
    ['migrator membership', [allowed, { ...allowed, role: 'justgo_migrator' }]],
    ['managed administrator', [{ ...allowed, role: 'supabase_auth_admin' }]],
    ['write-all substitute', [{ ...allowed, role: 'pg_write_all_data' }]],
    ['no inheritance', [{ ...allowed, inherit: false }]],
    ['SET enabled', [{ ...allowed, set: true }]],
    ['ADMIN enabled', [{ ...allowed, admin: true }]],
    ['unknown SET', [{ ...allowed, set: undefined }]],
    ['unknown ADMIN', [{ ...allowed, admin: undefined }]],
    ['string inheritance', [{ ...allowed, inherit: 'true' }]],
    ['malformed membership', [null]],
    ['malformed list', { 0: allowed, length: 1 }],
  ])
    await t.test(name, () =>
      assert.rejects(verify(approvedRole({ memberships })), rejected),
    );
  await assert.rejects(
    verify(approvedRole({ reader_has_memberships: true })),
    rejected,
  );
});

test('rejects identity drift, privileged attributes, ownership and effective mutation privileges', async (t) => {
  for (const [name, value] of [
    ['role', 'postgres'],
    ['role', 'justgo_runtime'],
    ['session_role', 'postgres'],
    ['login', false],
    ['inherit', false],
    ['bypass_rls', false],
    ['superuser', true],
    ['create_database', true],
    ['create_role', true],
    ['replication', true],
    ['owns_objects', true],
    ['table_writes', true],
    ['column_writes', true],
    ['sequence_writes', true],
    ['schema_create', true],
    ['database_create', true],
    ['definer_execution', true],
    ['connection_limit', -1],
    ['connection_limit', 3],
    ['session_limits', false],
  ])
    await t.test(`${name}=${value}`, () =>
      assert.rejects(verify(approvedRole({ [name]: value })), rejected),
    );
});

test('fails closed on every missing metadata field and malformed provider rows', async () => {
  for (const name of Object.keys(approvedRole())) {
    const role = approvedRole();
    delete role[name];
    await assert.rejects(verify(role), rejected);
  }
  for (const rows of [
    undefined,
    null,
    [],
    [null],
    [approvedRole(), approvedRole()],
    { length: 1 },
  ])
    await assert.rejects(
      verifyBackupRole({ query: async () => ({ rows }) }),
      rejected,
    );
});

test('requires all persistent defaults and rejects extra or duplicated settings', async () => {
  const expected = approvedRole().defaults;
  for (const defaults of [
    null,
    [],
    expected.slice(1),
    [...expected, 'role=postgres'],
    expected.map((value) => value.replace('read_only=on', 'read_only=off')),
    expected.map((value) => value.replace('5min', '0')),
    expected.map((value) => value.replace('pg_catalog', 'public')),
    [expected[0], expected[0], expected[2], expected[3]],
  ])
    await assert.rejects(verify(approvedRole({ defaults })), rejected);
});

test('inventory covers effective column/sequence writes and definer execution across every schema', () => {
  assert.match(
    backupRoleQuery,
    /has_table_privilege\(r\.oid,c\.oid,case when c\.oid='pg_catalog\.pg_settings'::regclass\s+then 'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'\s+when \$1::boolean and c\.oid=to_regclass\('cron\.job_run_details'\)\s+then 'INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'\s+else 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN' end\)/,
  );
  assert.match(
    backupRoleQuery,
    /has_any_column_privilege\(r\.oid,c\.oid,case when c\.oid='pg_catalog\.pg_settings'::regclass\s+then 'INSERT,REFERENCES' else 'INSERT,UPDATE,REFERENCES' end\)/,
  );
  assert.match(
    backupRoleQuery,
    /has_sequence_privilege\(r\.oid,c\.oid,'USAGE,UPDATE'\)/,
  );
  // AND predicates may be reordered before the kind filter on correlated plans.
  assert.match(
    backupRoleQuery,
    /case when c\.relkind='S'\s+then has_sequence_privilege\([^)]*\) else false end/,
  );
  assert.match(backupRoleQuery, /has_schema_privilege\(r\.oid,oid,'CREATE'\)/);
  assert.match(
    backupRoleQuery,
    /pg_shdepend[\s\S]*refobjid=r\.oid and deptype='o'/,
  );
  assert.match(backupRoleQuery, /select proowner from pg_proc/);
  assert.match(
    backupRoleQuery,
    /owned where owner in \(r\.oid, 'pg_read_all_data'::regrole\)/,
  );
  assert.doesNotMatch(backupRoleQuery, /subconninfo|umoptions/);
  assert.match(backupRoleQuery, /p\.prosecdef[\s\S]*has_function_privilege/);
  assert.doesNotMatch(backupRoleQuery, /nspname in|lo_create\(/);
});

test('provisioning and rehearsal use only the approved reader membership and retain export schemas', async () => {
  const role = await readFile(
    new URL('./backup-role.sql', import.meta.url),
    'utf8',
  );
  assert.match(
    role,
    /login nosuperuser nocreatedb nocreaterole inherit\s+noreplication bypassrls connection limit 2/,
  );
  assert.match(
    role,
    /grant pg_read_all_data to justgo_backup with admin false, inherit true, set false;/,
  );
  assert.equal((role.match(/^grant /gm) ?? []).length, 1);
  assert.doesNotMatch(role, /grant (?:usage|select|create)|password\s+'/i);
  const rehearsal = await readFile(
    new URL('./rehearse.mjs', import.meta.url),
    'utf8',
  );
  assert.match(
    rehearsal,
    /readFile\(new URL\('\.\/backup-role\.sql', import\.meta\.url\), 'utf8'\)/,
  );
  const snapshot = await readFile(
    new URL('./snapshot.mjs', import.meta.url),
    'utf8',
  );
  assert.deepEqual(
    [...snapshot.matchAll(/'--schema=([^']+)'/g)].map((match) => match[1]),
    ['justgo', 'auth', 'drizzle'],
  );
  assert.match(snapshot, /await verifyBackupRole\(client, policy\)/);
  assert.ok(
    snapshot.indexOf('await verifyBackupRole(client, policy)') <
      snapshot.indexOf('age = spawn(ageBin'),
  );
});
