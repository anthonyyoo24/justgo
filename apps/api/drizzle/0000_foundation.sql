-- No domain tables in phase 01. Each later feature supplies its own RLS policy.
create function justgo.current_user_id() returns uuid
language sql stable security invoker
set search_path = pg_catalog
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
revoke all on function justgo.current_user_id() from public;
--> statement-breakpoint
grant execute on function justgo.current_user_id() to justgo_runtime;
