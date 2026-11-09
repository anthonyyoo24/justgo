with scoped_schemas as (
  select oid, nspname, nspowner, nspacl
  from pg_catalog.pg_namespace
  where nspname in ('auth', 'justgo', 'drizzle')
), object_rows as (
  select jsonb_build_object('kind', 'schema', 'schema', n.nspname) as descriptor,
    n.nspowner as owner_oid,
    coalesce(n.nspacl, pg_catalog.acldefault('n'::"char", n.nspowner)) as acl
  from scoped_schemas n
  union all
  select jsonb_build_object('kind', 'relation', 'schema', n.nspname,
    'name', c.relname, 'relationKind', c.relkind,
    'rowSecurity', c.relrowsecurity, 'forceRowSecurity', c.relforcerowsecurity),
    c.relowner,
    coalesce(c.relacl, pg_catalog.acldefault(
      case when c.relkind = 'S' then 's'::"char" else 'r'::"char" end,
      c.relowner))
  from pg_catalog.pg_class c join scoped_schemas n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
  union all
  select jsonb_build_object('kind', 'column', 'schema', n.nspname,
    'relation', c.relname, 'name', a.attname),
    c.relowner, coalesce(a.attacl, '{}'::pg_catalog.aclitem[])
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join scoped_schemas n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm', 'f')
    and a.attnum > 0 and not a.attisdropped
  union all
  select jsonb_build_object(
    'kind', case when p.prokind = 'p' then 'procedure' else 'function' end,
    'schema', n.nspname, 'name', p.proname,
    'procedureKind', p.prokind, 'securityDefiner', p.prosecdef,
    'argumentTypes', coalesce((
      select jsonb_agg(jsonb_build_object('schema', tn.nspname, 'name', t.typname)
        order by args.ordinality)
      from unnest(p.proargtypes::oid[]) with ordinality args(type_oid, ordinality)
      join pg_catalog.pg_type t on t.oid = args.type_oid
      join pg_catalog.pg_namespace tn on tn.oid = t.typnamespace
    ), '[]'::jsonb)),
    p.proowner, coalesce(p.proacl, pg_catalog.acldefault('f'::"char", p.proowner))
  from pg_catalog.pg_proc p join scoped_schemas n on n.oid = p.pronamespace
  union all
  select jsonb_build_object('kind', 'enum', 'schema', n.nspname,
    'name', t.typname, 'labels', (
      select jsonb_agg(e.enumlabel order by e.enumsortorder)
      from pg_catalog.pg_enum e where e.enumtypid = t.oid
    )),
    t.typowner, coalesce(t.typacl, pg_catalog.acldefault('T'::"char", t.typowner))
  from pg_catalog.pg_type t join scoped_schemas n on n.oid = t.typnamespace
  where n.nspname = 'auth' and t.typtype = 'e'
), policies as (
  select jsonb_build_object('kind', 'policy', 'schema', n.nspname,
    'relation', c.relname, 'name', p.polname,
    'command', case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
      when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL' end,
    'permissive', p.polpermissive,
    'roles', (
      select jsonb_agg(roles.name order by roles.name collate "C")
      from (
        select case when r.role_oid = 0 then 'PUBLIC'
          else pg_catalog.pg_get_userbyid(r.role_oid)::text end as name
        from unnest(p.polroles) r(role_oid)
      ) roles
    ),
    'using', pg_catalog.pg_get_expr(p.polqual, p.polrelid),
    'withCheck', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)) as object
  from pg_catalog.pg_policy p
  join pg_catalog.pg_class c on c.oid = p.polrelid
  join scoped_schemas n on n.oid = c.relnamespace
), normalized as (
  select descriptor, descriptor || jsonb_build_object(
    'owner', pg_catalog.pg_get_userbyid(owner_oid),
    'acl', coalesce((
      select jsonb_agg(jsonb_build_object(
        'grantee', case when a.grantee = 0 then 'PUBLIC'
          else pg_catalog.pg_get_userbyid(a.grantee)::text end,
        'grantor', pg_catalog.pg_get_userbyid(a.grantor),
        'privilege', a.privilege_type, 'grantable', a.is_grantable
      ) order by
        (case when a.grantee = 0 then 'PUBLIC'
          else pg_catalog.pg_get_userbyid(a.grantee)::text end) collate "C",
        pg_catalog.pg_get_userbyid(a.grantor)::text collate "C",
        a.privilege_type collate "C", a.is_grantable)
      from pg_catalog.aclexplode(case when pg_catalog.cardinality(acl) > 0
        then acl else null::pg_catalog.aclitem[] end) a
    ), '[]'::jsonb)
  ) as object
  from object_rows
  union all
  select object, object from policies
)
select jsonb_build_object(
  'observedAt', pg_catalog.statement_timestamp(),
  'database', pg_catalog.current_database(),
  'metadata', jsonb_build_object(
    'format', 'justgo-reviewed-access', 'version', 2,
    'schemas', jsonb_build_array('auth', 'drizzle', 'justgo'),
    'searchPath', pg_catalog.current_setting('search_path'),
    'relationKinds', jsonb_build_array('S', 'f', 'm', 'p', 'r', 'v'),
    'scopeNotes', jsonb_build_array(
      'Owners and normalized direct ACLs; NULL ACLs expanded to catalog defaults.',
      'All non-dropped user-column ACLs; table grants are represented separately.',
      'Function signatures use type namespace/name, independent of OIDs and search_path.',
      'Auth enum labels included; indexes/TOAST/default ACLs/global memberships excluded.',
      'RLS policies: command, permissive flag, sorted roles and USING/WITH CHECK text.',
      'Policy text depends on search_path; capture source and target with an empty one.',
      'justgo_auth_private is excluded: archives omit it; API readiness checks the helper.',
      'No function bodies, settings, keys, tokens, identity rows or writing.'
    ),
    'objects', coalesce(jsonb_agg(object order by descriptor::text collate "C"), '[]'::jsonb)
  )
) as reviewed_access
from normalized;
