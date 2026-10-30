-- OPERATOR CANDIDATE ONLY. Review the actual Supabase role capabilities and
-- obtain separate approval before running on a hosted project. No passwords.
-- Supabase supports pg_read_all_data + BYPASSRLS for managed Auth backups.
-- This can read every project schema/view (including future ones), even though
-- the job exports only justgo, auth and drizzle. It is not absolute read-only
-- isolation: PUBLIC functions remain callable and read-only defaults can change.
-- Do not grant ownership, writes, extra memberships or private helper execution.
create role justgo_backup login nosuperuser nocreatedb nocreaterole inherit
  noreplication bypassrls connection limit 2;
grant pg_read_all_data to justgo_backup with admin false, inherit true, set false;
alter role justgo_backup set default_transaction_read_only = on;
alter role justgo_backup set statement_timeout = '5min';
alter role justgo_backup set idle_in_transaction_session_timeout = '12min';
alter role justgo_backup set search_path = pg_catalog;
-- No direct Auth grants or managed-role membership: Supabase does not support
-- them for custom roles. Do not change global PUBLIC ACLs to make verification pass.
-- Run verifyBackupRole as this login before any snapshot; fail closed on drift.
