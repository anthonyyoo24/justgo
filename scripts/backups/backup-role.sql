-- OPERATOR CANDIDATE ONLY. Review the actual Supabase role capabilities and
-- obtain separate approval before running on a hosted project. No passwords.
-- BYPASSRLS is required to back up FORCE-RLS tables without broad write policies.
-- It does not grant table access; this role receives SELECT only, no memberships.
create role justgo_backup login nosuperuser nocreatedb nocreaterole noinherit
  noreplication bypassrls connection limit 2;
alter role justgo_backup set default_transaction_read_only = on;
alter role justgo_backup set statement_timeout = '5min';
alter role justgo_backup set idle_in_transaction_session_timeout = '12min';
alter role justgo_backup set search_path = pg_catalog;
grant usage on schema justgo, auth, drizzle to justgo_backup;
grant select on all tables in schema justgo, auth, drizzle to justgo_backup;
grant select on all sequences in schema justgo, auth, drizzle to justgo_backup;
-- Repeat the explicit SELECT grants after future migrations under review.
-- Do not grant justgo_migrator, postgres, supabase_auth_admin or pg_read_all_data.
-- Do not add this role to justgo_auth_private's audited helper ACL.
