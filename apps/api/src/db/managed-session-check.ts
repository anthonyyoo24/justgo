import type { Pool } from 'pg';

// Keep this versioned body aligned with scripts/managed-auth/session-check-v1.sql.
// Readiness compares executable source rather than trusting a comment/version tag.
export const managedSessionCheckBody = `select exists (
  select 1 from auth.sessions as session
  where session.id = $1
    and session.user_id = $2
    and (session.not_after is null or session.not_after > pg_catalog.now())
);`;

type SessionCheck = {
  body: string;
  owner: string;
  language: string;
  security_definer: boolean;
  strict: boolean;
  volatility: string;
  configuration: string[] | null;
  arguments: string[] | null;
  boolean_result: boolean;
  schema_owner: string;
  schema_acl_ok: boolean;
  function_acl_ok: boolean;
  runtime_usage: boolean;
  runtime_execute: boolean;
  runtime_create: boolean;
  other_roles_exposed: boolean;
  runtime_owner_access: boolean;
  runtime_auth_access: boolean;
};

const normalizedSql = (value: string) => value.trim().replace(/\s+/g, ' ');

/** Validate the private capability without selecting any Auth rows. */
export async function checkManagedSessionHelper(pool: Pool): Promise<void> {
  const result = await pool.query<SessionCheck>(`select
    p.prosrc as body, pg_get_userbyid(p.proowner) as owner,
    l.lanname as language, p.prosecdef as security_definer,
    p.proisstrict as strict, p.provolatile as volatility,
    p.proconfig as configuration, p.proargnames as arguments,
    p.prorettype='pg_catalog.bool'::regtype and not p.proretset
      and p.prokind='f' and p.pronargdefaults=0 as boolean_result,
    pg_get_userbyid(n.nspowner) as schema_owner,
    not exists (
      select 1 from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) as a
      where a.grantee<>n.nspowner and (
        a.grantee<>(select oid from pg_roles where rolname='justgo_runtime')
        or a.privilege_type<>'USAGE' or a.is_grantable
      )
    ) as schema_acl_ok,
    not exists (
      select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) as a
      where a.grantee<>p.proowner and (
        a.grantee<>(select oid from pg_roles where rolname='justgo_runtime')
        or a.privilege_type<>'EXECUTE' or a.is_grantable
      )
    ) as function_acl_ok,
    has_schema_privilege(current_user,n.oid,'USAGE') as runtime_usage,
    has_function_privilege(current_user,p.oid,'EXECUTE') as runtime_execute,
    has_schema_privilege(current_user,n.oid,'CREATE') as runtime_create,
    exists (
      select 1 from pg_roles r
      where r.oid<>p.proowner and r.rolname<>'justgo_runtime' and not r.rolsuper
        and (
          (has_schema_privilege(r.oid,n.oid,'USAGE')
            and has_function_privilege(r.oid,p.oid,'EXECUTE'))
          or pg_has_role(r.oid,'justgo_runtime','USAGE')
          or pg_has_role(r.oid,'justgo_runtime','SET')
        )
    ) as other_roles_exposed,
    pg_has_role(current_user,p.proowner,'MEMBER') as runtime_owner_access,
    exists (
      select 1 from pg_class c join pg_namespace a on a.oid=c.relnamespace
      where a.nspname='auth' and c.relname='sessions' and (
        has_schema_privilege(current_user,a.oid,'USAGE')
        or has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or exists (
          select 1 from pg_attribute col where col.attrelid=c.oid
            and col.attnum>0 and not col.attisdropped
            and has_column_privilege(current_user,c.oid,col.attnum,'SELECT,INSERT,UPDATE,REFERENCES')
        )
      )
    ) as runtime_auth_access
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_language l on l.oid=p.prolang
  where p.oid=to_regprocedure('justgo_auth_private.is_live_session_v1(uuid,uuid)')`);
  const helper = result.rows[0];
  if (
    !helper ||
    helper.owner !== 'postgres' ||
    helper.schema_owner !== 'postgres' ||
    helper.language !== 'sql' ||
    !helper.security_definer ||
    !helper.strict ||
    helper.volatility !== 's' ||
    helper.configuration?.join('\n') !== 'search_path=""' ||
    helper.arguments?.join(',') !== 'session_id,auth_user_id' ||
    !helper.boolean_result ||
    !helper.schema_acl_ok ||
    !helper.function_acl_ok ||
    !helper.runtime_usage ||
    !helper.runtime_execute ||
    helper.runtime_create ||
    helper.other_roles_exposed ||
    helper.runtime_owner_access ||
    helper.runtime_auth_access ||
    normalizedSql(helper.body) !== normalizedSql(managedSessionCheckBody)
  )
    throw new Error('Managed Auth database readiness check failed');
}
