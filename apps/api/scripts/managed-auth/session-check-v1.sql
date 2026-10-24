-- Run as the project postgres operator after the managed-schema migrations.
-- Hosted Supabase cannot grant custom roles USAGE on its managed auth schema:
-- https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema
-- This private capability exposes only a boolean, never Auth records or tokens.
-- Do not add justgo_auth_private to the Data API's exposed schemas.
begin;

do $$ begin
  if current_user <> 'postgres' then
    raise exception 'The managed session helper requires the postgres operator';
  end if;
end $$;

create schema if not exists justgo_auth_private authorization postgres;
do $$ begin
  if (select pg_get_userbyid(nspowner) from pg_namespace
      where nspname='justgo_auth_private') <> 'postgres' then
    raise exception 'Unexpected managed session helper schema owner';
  end if;
end $$;

-- These arguments come only from the API's verified Auth JWT, never request
-- parameters. auth.uid() is inappropriate for this direct backend SQL session:
-- no PostgREST JWT context is installed, and the trusted API already has both IDs.
create or replace function justgo_auth_private.is_live_session_v1(
  session_id uuid, auth_user_id uuid
) returns boolean
language sql stable strict security definer
set search_path = ''
as $session_check$
select exists (
  select 1 from auth.sessions as session
  where session.id = $1
    and session.user_id = $2
    and (session.not_after is null or session.not_after > pg_catalog.now())
);
$session_check$;
alter function justgo_auth_private.is_live_session_v1(uuid,uuid) owner to postgres;

revoke all on schema justgo_auth_private from public, anon, authenticated, service_role, justgo_runtime;
revoke all on function justgo_auth_private.is_live_session_v1(uuid,uuid)
  from public, anon, authenticated, service_role, justgo_runtime;
grant usage on schema justgo_auth_private to justgo_runtime;
grant execute on function justgo_auth_private.is_live_session_v1(uuid,uuid) to justgo_runtime;

-- Retire the earlier direct-column setup; this helper replaces that access.
revoke select (id,user_id,not_after) on auth.sessions from justgo_runtime;
revoke select on auth.sessions from justgo_runtime;
commit;
