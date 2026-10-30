import { cronJobRunDetailsDeleteAllowed } from './configuration.mjs';

// Metadata only. Never invoke a function to test whether it can mutate data.
// PUBLIC invoker/built-in routines (for example lo_create) are residual powers;
// neither these checks nor default_transaction_read_only imply hard isolation.
// PostgreSQL's PUBLIC UPDATE on pg_settings is another interface to session SET.
// Only that UPDATE is unconditionally exempt. The approved staging policy may
// also accept DELETE on the exact cron history relation; no other write is waived.
// pg_shdepend omits dependencies on pinned predefined roles. Inspect PG17 owner
// columns too; selecting only owner OIDs avoids subscription/mapping credentials.
export const backupRoleQuery = `select
  r.rolname as role, session_user::text as session_role,
  r.rolcanlogin as login, r.rolinherit as inherit,
  r.rolsuper as superuser, r.rolcreatedb as create_database,
  r.rolcreaterole as create_role, r.rolreplication as replication,
  r.rolbypassrls as bypass_rls, r.rolconnlimit as connection_limit,
  r.rolconfig as defaults,
  coalesce((select jsonb_agg(jsonb_build_object(
    'role', granted.rolname, 'inherit', m.inherit_option,
    'set', m.set_option, 'admin', m.admin_option))
    from pg_auth_members m join pg_roles granted on granted.oid=m.roleid
    where m.member=r.oid), '[]'::jsonb) as memberships,
  exists(select 1 from pg_auth_members m join pg_roles reader on reader.oid=m.member
    where reader.rolname='pg_read_all_data') as reader_has_memberships,
  (exists(select 1 from pg_shdepend where refclassid='pg_authid'::regclass
    and refobjid=r.oid and deptype='o')
    or exists(select 1 from (
      select relowner as owner from pg_class
      union all select collowner from pg_collation
      union all select conowner from pg_conversion
      union all select datdba from pg_database
      union all select defaclrole from pg_default_acl
      union all select evtowner from pg_event_trigger
      union all select extowner from pg_extension
      union all select fdwowner from pg_foreign_data_wrapper
      union all select srvowner from pg_foreign_server
      union all select lanowner from pg_language
      union all select lomowner from pg_largeobject_metadata
      union all select nspowner from pg_namespace
      union all select opcowner from pg_opclass
      union all select oprowner from pg_operator
      union all select opfowner from pg_opfamily
      union all select proowner from pg_proc
      union all select pubowner from pg_publication
      union all select stxowner from pg_statistic_ext
      union all select subowner from pg_subscription
      union all select spcowner from pg_tablespace
      union all select cfgowner from pg_ts_config
      union all select dictowner from pg_ts_dict
      union all select typowner from pg_type
      union all select umuser from pg_user_mapping
    ) owned where owner in (r.oid, 'pg_read_all_data'::regrole))) as owns_objects,
  exists(select 1 from pg_class c where case when c.relkind in ('r','p','v','m','f')
    then has_table_privilege(r.oid,c.oid,case when c.oid='pg_catalog.pg_settings'::regclass
      then 'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
      when $1::boolean and c.oid=to_regclass('cron.job_run_details')
      then 'INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
      else 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN' end) else false end) as table_writes,
  exists(select 1 from pg_class c where case when c.relkind in ('r','p','v','m','f')
    then has_any_column_privilege(r.oid,c.oid,case when c.oid='pg_catalog.pg_settings'::regclass
      then 'INSERT,REFERENCES' else 'INSERT,UPDATE,REFERENCES' end) else false end) as column_writes,
  exists(select 1 from pg_class c where case when c.relkind='S'
    then has_sequence_privilege(r.oid,c.oid,'USAGE,UPDATE') else false end) as sequence_writes,
  exists(select 1 from pg_namespace where has_schema_privilege(r.oid,oid,'CREATE')) as schema_create,
  has_database_privilege(r.oid,current_database(),'CREATE') as database_create,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname<>'pg_catalog' and p.prosecdef
      and has_schema_privilege(r.oid,n.oid,'USAGE')
      and has_function_privilege(r.oid,p.oid,'EXECUTE')) as definer_execution,
  current_setting('default_transaction_read_only')='on'
    and current_setting('transaction_read_only')='on'
    and current_setting('search_path')='pg_catalog'
    and (select setting::int between 1 and 300000 from pg_settings where name='statement_timeout')
    and (select setting::int between 1 and 720000 from pg_settings where name='idle_in_transaction_session_timeout')
    as session_limits
from pg_roles r where r.rolname=current_user`;

const defaults = new Set([
  'default_transaction_read_only=on',
  'statement_timeout=5min',
  'idle_in_transaction_session_timeout=12min',
  'search_path=pg_catalog',
]);
const forbidden = [
  'superuser',
  'create_database',
  'create_role',
  'replication',
  'reader_has_memberships',
  'owns_objects',
  'table_writes',
  'column_writes',
  'sequence_writes',
  'schema_create',
  'database_create',
  'definer_execution',
];

/** Accept only the approved reader; missing or ambiguous metadata fails closed. */
export async function verifyBackupRole(client, policy) {
  const allowCronDelete = cronJobRunDetailsDeleteAllowed(policy);
  const { rows } =
    (await client.query(backupRoleQuery, [allowCronDelete])) ?? {};
  const role = rows?.[0];
  const membership = role?.memberships?.[0];
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    !role ||
    role.role !== 'justgo_backup' ||
    role.session_role !== 'justgo_backup' ||
    role.login !== true ||
    role.inherit !== true ||
    role.bypass_rls !== true ||
    role.connection_limit !== 2 ||
    role.session_limits !== true ||
    forbidden.some((name) => role[name] !== false) ||
    !Array.isArray(role.defaults) ||
    role.defaults.length !== defaults.size ||
    new Set(role.defaults).size !== defaults.size ||
    !role.defaults.every((setting) => defaults.has(setting)) ||
    !Array.isArray(role.memberships) ||
    role.memberships.length !== 1 ||
    membership?.role !== 'pg_read_all_data' ||
    membership.inherit !== true ||
    membership.set !== false ||
    membership.admin !== false
  )
    throw new Error('Backup role privileges are not restricted');
}
