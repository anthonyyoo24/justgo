-- Hourly identity retention for the hosted JustGO project.
--
-- Anthony runs this once as `postgres` in the project's SQL editor, after the
-- first release has applied the migrations, because migration 0015 creates the
-- function it calls. It enables `pg_cron` and schedules
-- `justgo-identity-retention` hourly at minute 17. Each run takes the
-- `justgo_migrator` role inside its own transaction, with a five-second
-- statement limit, and removes at most one batch of 1,000 expired rate buckets
-- and 1,000 unredeemed expired transfers. It keeps journals, users, deletion
-- receipts, revoked-credential tombstones and redeemed transfers.
--
-- It adds no login, password, grant or definer function. `provision.sql`
-- already grants `justgo_migrator` to `postgres`. Scheduling the same job name
-- again replaces the job, so a rerun leaves one job. Stop it with
-- `select cron.alter_job(jobid, active := false) from cron.job
--  where jobname = 'justgo-identity-retention';`
-- and never edit the cron tables directly.
--
-- docs/operations/TESTFLIGHT_BETA.md describes the job. Any other hosted
-- schedule needs Anthony's separate approval.

do $$
begin
  if to_regprocedure('justgo.purge_expired_identity_records(integer)') is null then
    raise exception 'Apply the migrations first: justgo.purge_expired_identity_records is missing';
  end if;
  if not pg_has_role('justgo_migrator', 'member') then
    raise exception 'Run provision.sql first: postgres cannot take justgo_migrator';
  end if;
end $$;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'justgo-identity-retention',
  '17 * * * *',
  $job$
begin;
set local role justgo_migrator;
set local statement_timeout = '5s';
select justgo.purge_expired_identity_records(1000);
commit;
$job$
);

select jobname, schedule, active, username
from cron.job
where jobname = 'justgo-identity-retention';
