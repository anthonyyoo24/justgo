with namespaces as (
  select oid from pg_catalog.pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema'
), relations as (
  select c.oid from pg_catalog.pg_class c where c.relnamespace in(select oid from namespaces)
), functions as (
  select oid from pg_catalog.pg_proc where pronamespace in(select oid from namespaces)
), types as (
  select oid from pg_catalog.pg_type where typnamespace in(select oid from namespaces)
), signature as (
  select jsonb_build_object(
    'server_version',current_setting('server_version_num'),
    'namespaces',(select jsonb_agg(to_jsonb(n) order by n.oid) from pg_catalog.pg_namespace n where n.oid in(select oid from namespaces)),
    'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relname,c.relnamespace,c.reltype,c.relowner,c.relam,c.relkind,c.relpersistence,c.relreplident,c.relrowsecurity,c.relforcerowsecurity,c.relacl,c.reloptions,c.relispartition,c.relpartbound) order by c.oid) from pg_catalog.pg_class c where c.oid in(select oid from relations)),
    'columns',(select jsonb_agg(to_jsonb(a) order by a.attrelid,a.attnum) from pg_catalog.pg_attribute a where a.attrelid in(select oid from relations)),
    'defaults',(select jsonb_agg(to_jsonb(d) order by d.oid) from pg_catalog.pg_attrdef d where d.adrelid in(select oid from relations)),
    'constraints',(select jsonb_agg(to_jsonb(c) order by c.oid) from pg_catalog.pg_constraint c where c.conrelid in(select oid from relations) or c.contypid in(select oid from types)),
    'indexes',(select jsonb_agg(to_jsonb(i) order by i.indexrelid) from pg_catalog.pg_index i where i.indrelid in(select oid from relations)),
    'triggers',(select jsonb_agg(to_jsonb(t) order by t.oid) from pg_catalog.pg_trigger t where t.tgrelid in(select oid from relations)),
    'rules',(select jsonb_agg(to_jsonb(r) order by r.oid) from pg_catalog.pg_rewrite r where r.ev_class in(select oid from relations)),
    'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_catalog.pg_policy p where p.polrelid in(select oid from relations)),
    'functions',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_catalog.pg_proc p where p.oid in(select oid from functions)),
    'types',(select jsonb_agg(to_jsonb(t) order by t.oid) from pg_catalog.pg_type t where t.oid in(select oid from types)),
    'enum_values',(select jsonb_agg(to_jsonb(e) order by e.oid) from pg_catalog.pg_enum e where e.enumtypid in(select oid from types)),
    'sequences',(select jsonb_agg(to_jsonb(s) order by s.seqrelid) from pg_catalog.pg_sequence s where s.seqrelid in(select oid from relations)),
    'dependencies',(select jsonb_agg(to_jsonb(d) order by d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) from pg_catalog.pg_depend d where (d.classid='pg_class'::regclass and d.objid in(select oid from relations)) or (d.classid='pg_proc'::regclass and d.objid in(select oid from functions)) or (d.classid='pg_type'::regclass and d.objid in(select oid from types))),
    'extensions',(select jsonb_agg(to_jsonb(e) order by e.oid) from pg_catalog.pg_extension e),
    'database',(select jsonb_build_array(d.datname,d.datdba,d.encoding,d.datistemplate,d.datallowconn,d.datconnlimit,d.datcollate,d.datctype,d.datcollversion,d.datacl) from pg_catalog.pg_database d where d.datname=current_database()),
    'database_role_settings',(select jsonb_agg(to_jsonb(s) order by s.setdatabase,s.setrole) from pg_catalog.pg_db_role_setting s where s.setdatabase=0 or s.setdatabase=(select oid from pg_catalog.pg_database where datname=current_database())),
    'roles',(select jsonb_agg(to_jsonb(r) order by r.oid) from pg_catalog.pg_roles r),
    'memberships',(select jsonb_agg(to_jsonb(m) order by m.oid) from pg_catalog.pg_auth_members m),
    'default_acls',(select jsonb_agg(to_jsonb(a) order by a.oid) from pg_catalog.pg_default_acl a),
    'auth_migrations',(select jsonb_agg(to_jsonb(m) order by m.version) from auth.schema_migrations m),
    'app_migrations',(select jsonb_agg(to_jsonb(m) order by m.created_at) from drizzle.__drizzle_migrations m)
  ) as body
)
select encode(sha256(convert_to(body::text,'UTF8')),'hex') as catalog_sha256,
  (select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'oid',c.oid::bigint,'kind',c.relkind,'inherited',exists(select 1 from pg_catalog.pg_inherits i where i.inhrelid=c.oid or i.inhparent=c.oid)) order by n.nspname collate "C",c.relname collate "C")
   from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname in('justgo','auth','drizzle','justgo_auth_private') and c.relkind in('r','p','f','m')) as relations
from signature;
