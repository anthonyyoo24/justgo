-- Run once as the project administrator on a NEW, dedicated database.
-- Deliberately no passwords here. Set them using a secure prompt/secret manager.
create role justgo_migrator login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role justgo_runtime login nosuperuser nocreatedb nocreaterole noinherit nobypassrls connection limit 20;
grant justgo_migrator to postgres;
create schema justgo authorization justgo_migrator;
create schema drizzle authorization justgo_migrator;
revoke all on schema justgo, drizzle from public;
grant usage on schema justgo to justgo_runtime;
revoke create on schema public from public;
alter role justgo_runtime set search_path = pg_catalog, justgo;
alter role justgo_runtime set statement_timeout = '5s';
alter role justgo_runtime set idle_in_transaction_session_timeout = '10s';
-- Per-schema default privileges cannot revoke PUBLIC EXECUTE, so each migration revokes it on its own functions.

-- Drizzle creates its journal schema with IF NOT EXISTS, which still requires database CREATE.
do $$ begin execute format('grant create on database %I to justgo_migrator', current_database()); end $$;
