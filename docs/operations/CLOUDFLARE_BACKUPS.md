# Encrypted Cloudflare recovery copies

Phase 15 supplies local backup, upload, ledger and restore tooling. Anthony approved
creation of the empty private `justgo-staging-backups` bucket; its creation and
disabled public access are verified. Hosted backups, role grants, retention/lock
configuration, policy approval and monitor activation have **not** occurred.
The [Phase 15 plan](../implementation-plan/phase-15-cloudflare-api.md) owns these
approvals; the [Phase 14 handoff](../handoffs/phase-14-release.md) preserves the
independent privacy and device gates. This guide does not authorize those actions.
A local `age` identity has been prepared in ignored `.local/phase15-cloudflare/`
storage with mode `0600`, and a synthetic encryption/decryption round trip passed.
This is preparation only: independent offline primary/recovery custody, authorized
retrieval and decryption of an actual hosted recovery copy remain unverified.

## Implemented boundary

`scripts/backups/run.mjs` runs one `database` or `ledger` copy. The protected
`database-backups` GitHub environment holds dedicated credentials and approved
policy bytes. The workflow refuses to run until the repository variable
`JUSTGO_BACKUPS_ENABLED` is `approved`; merging its YAML does not enable copying.
It runs on main only, serializes jobs and never uploads GitHub artifacts. Nightly
copies are scheduled at **04:43 UTC**; ledger copies at **23 minutes past each
hour**. These are fixed UTC schedules, independent of daylight saving time.

The runner verifies the approved policy digest, exact database host/name, TLS CA,
read-only backup role and complete registered migration hashes. It opens a
read-only repeatable-read transaction. A nightly `pg_dump` uses that exported
snapshot and includes `justgo`, `auth` and the `drizzle` migration journal. Its
custom-format output goes directly through `age`; only ciphertext is written to
the private temporary directory. Dump ownership is omitted for the isolated local
restore; ACLs and RLS policies are retained. No private key is present in CI.

The hourly JSON ledger is captured from one database snapshot and encrypted through
the same pipe. It contains:

- Every owner's creation/deletion receipt, data epoch and data deletion time.
- Recovery credential digests and revocations, device/session revocations and
  rotations, and transfer expiry/cancellation/redemption state.
- Immutable managed subject mappings, app sessions and Auth cleanup outbox state.
- Deleted completion IDs, plus current Auth subject/session IDs and refresh-token
  revocation metadata.

The ledger contains sensitive identity metadata and must remain encrypted. It does
not select attempts, private journal versions or reflection text. Its current
serialized JSON limit is 64 MiB; reaching that limit fails the job and needs
an explicit scaling review. The nightly stream is bounded to a 2 GiB encrypted
single object at upload; current Free database capacity is much smaller.

Before upload, read-only Cloudflare calls verify the exact prefix lock and expiry
rules and reject enabled public `r2.dev` or custom domains. The uploader accepts
only locally signed R2 temporary credentials allowing `PutObject` and `HeadObject`
for the approved environment's `database/` and `ledger/` prefixes. It sends one
conditional PUT to a unique key, then checks ciphertext size/hash through HEAD.
An uncertain PUT receives no automatic second mutation. The runner always removes
its temporary ciphertext and prints only object identity, ciphertext checksum and
non-private release/snapshot metadata.

[Cloudflare temporary credentials](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/)
support action-scoped JWTs. A normal Object Read & Write credential is broader;
it is deliberately not accepted by this runner. The parent credential must remain
outside CI. Bucket administration and lifecycle changes require a separate owner
credential; the uploader must not be able to edit locks or public access.

## Decisions prepared for Anthony

The following values are proposals, not approvals or published retention promises:

| Decision                      | Proposed policy                                                                                                | Tradeoff / acceptance still required                                                                                                                                                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup and ledger retention   | Seven days for each, in a private dedicated R2 bucket                                                          | Retain the ledger at least as long as any snapshot it must reconcile. Confirm deletion duties and public wording before copying real data.                                                                                                                                        |
| Lock duration and expiry      | Seven-day prefix locks; lifecycle expiry at day seven                                                          | Locks protect retained ciphertext from overwrite/delete by the uploader. R2 lifecycle removal is asynchronous, typically within 24 hours of expiry, and is not a strict maximum. Verify actual deletion behavior and wording before acceptance.                                   |
| Ordinary-write recovery point | Up to 24 hours of new activity since the nightly snapshot may be lost                                          | Hourly identity ledgers do not back up new journals. Anthony must accept the data-loss tradeoff.                                                                                                                                                                                  |
| Recovery time                 | Candidate operator target of four hours                                                                        | Not measured for the actual hosted Auth schema or a provider incident; the synthetic local rehearsal is not an operational RTO measurement.                                                                                                                                       |
| Current deletion ledger       | Obtain a final ledger after fencing all API, maintenance and Auth/provider mutations                           | An hourly copy alone can miss later deletions. When the source is lost and those later changes cannot independently be established, **keep recovered writers closed**. An independently recoverable gap-free deletion mechanism is still an open acceptance item.                 |
| Restored sessions             | Invalidate every restored legacy/app/Auth session and Auth refresh token; cancel pending transfers             | Users must authenticate again. Retain recovery digests and their revocations; do not recreate deleted owners or use an old transfer to recover access. This is an explicit recovery-policy approval.                                                                              |
| Key custody                   | Owner-held offline `age` identity, protected primary and recovery copies, separately controlled restore access | Anthony chooses the storage locations and authorized people. Loss of every key copy makes the backups unusable. Actual retrieval/decryption must be demonstrated without disclosing the key.                                                                                      |
| Upload-token renewal          | Maximum seven-day derived credential; Anthony or a named operator renews by day five                           | Parent key remains offline. The runner rejects tokens with less than 20 minutes remaining, and failed/missed jobs alert through the configured monitor. Day-five renewal is a required operator responsibility; no external reminder or automatic issuer is created by this code. |
| Alert ownership               | Owner email for separate database and ledger Sentry Cron monitors                                              | Propose a 20-minute schedule grace and 20-minute maximum runtime. Confirm delivery, missed-run behavior, post-trial availability and any cost before relying on them.                                                                                                             |

The seven-day upload-token lifetime is the local minting policy, not an established
Cloudflare maximum. Scheduled copying is unattended only while its credentials
remain valid. Fully unattended renewal would need an approved online issuer with
access to the parent signing secret; a longer lifetime would also change the
proposed policy. Neither change is implemented or approved. Keep the parent secret
outside CI and assign a real renewal operator before activation.

The ledger gap is an availability limit, not permission to restore deleted data.
If the source is lost after the last hourly copy, later deletions or revocations
may be unknowable and recovery must remain closed indefinitely. The candidate
four-hour recovery target cannot cover that case. A faster schedule or an outbox
stored only in the lost database cannot close the gap. Operational acceptance
needs either an explicitly accepted inability to reopen in that case, or an
approved scope change for independently durable deletion/revocation records before
those changes are acknowledged, covering app, maintenance and Auth/provider paths.
The latter requires new implementation and evidence; hourly copies do not supply it.

[R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/) prevent
premature deletion and overwrite, but an administrator can change the rules.
[R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
describe asynchronous expiry. Neither mechanism justifies promising immediate
backup erasure or keeping copies beyond an approved retention policy. A separate
privileged expiry audit and incident response is required if real observed expiry
exceeds the approved wording.

## Preparing the protected environment

Do not populate hosted secrets or enable the workflow before the Phase 15 account,
DPA, payment-method, retention, key and recovery decisions are approved. Configure
one actual source environment per protected backup lane; production must receive
its own credentials, approved policy and lane when it is introduced.

1. Review `scripts/backups/backup-role.sql` with the actual Supabase role owner.
   The candidate `justgo_backup` role has `SELECT` only on application/Auth/journal
   tables and sequences, no role memberships and read-only transactions by default.
   `BYPASSRLS` is necessary to read every FORCE-RLS row without granting write
   authority. Hosted ability to create/grant this role and read managed Auth is
   unverified. Never substitute the runtime, migrator, `postgres` or Auth admin
   credential in the scheduled runner. Re-review explicit read grants after
   future migrations; the runner fails on missing tables or access.
2. Choose and configure the actual bucket/location/access/lock/lifecycle settings
   using a separate privileged owner credential. The read-only `R2_INSPECT_TOKEN`
   needs access to bucket lock/lifecycle and managed/custom-domain settings, scoped
   to the approved account. Verify the uploader cannot change those settings or
   delete retained objects with disposable encrypted canaries.
3. Save exact approved JSON in `BACKUP_POLICY_JSON` and its SHA-256 in
   `BACKUP_POLICY_SHA256`. Policy fields are `version: 1`, `approvalReference`,
   `accountId`, `bucket`, `environment` (`staging` or `production`), `jurisdiction`
   (`default`, `eu`, `us` or `fedramp`), `backupDays`, `ledgerDays`, `lockDays`,
   `ageRecipient`, `sourceHost` and `sourceDatabase`. Supabase shared session-pooler
   sources additionally require `sourceProjectRef`, the approved 20-character
   lowercase alphanumeric project reference. If supplied for a direct connection,
   its host must be exactly `db.<sourceProjectRef>.supabase.co`; existing direct
   policies without this field remain supported. The recipient is public; never
   put the `AGE-SECRET-KEY-...` identity here. A matching digest is a technical
   check, not evidence that Anthony approved a policy.
4. Configure `BACKUP_DATABASE_URL` with the exact approved host/database and port
   5432, without query/fragment options. Direct connections use `justgo_backup`;
   recognized Supabase shared session-pooler hosts
   (`aws-<number>-<region>.pooler.supabase.com`) require the exact login
   `justgo_backup.<sourceProjectRef>`. The connected database role must still be
   `justgo_backup` and pass the independent read-only privilege checks. Provide
   the actual server CA as `BACKUP_DATABASE_CA_CERT`. Transaction pooler port
   6543 is refused; exported snapshots and dump coordination require direct or
   compatible session connections. Use the actual account's verified endpoint,
   not a guessed regional hostname. Supabase documents shared session pooling as
   an [IPv4 connection option](https://supabase.com/docs/guides/database/connecting-to-postgres).
   This routing support does not establish hosted role grants or managed Auth
   read access; both still require actual acceptance evidence.
5. Prepare derived upload credentials offline with
   `node scripts/backups/mint-upload-credentials.mjs`. It needs the approved policy
   variables, `R2_PARENT_ACCESS_KEY_ID`, `R2_PARENT_SECRET_ACCESS_KEY`, explicit
   `R2_UPLOAD_TTL_SECONDS` (1–168 hours) and `R2_CREDENTIAL_OUTPUT_FILE`. It refuses
   CI and creates a new mode-0600 file instead of printing credentials. Transfer
   only its three `R2_UPLOAD_*` values into the protected environment secrets;
   securely remove the temporary operator file. Rotate before day five and test
   the actual permitted/denied actions. No parent key or offline encryption identity
   belongs in GitHub, source, chat or logs.
6. Independently create and verify two Sentry Cron monitors, named
   `justgo-<environment>-database` and `justgo-<environment>-ledger`, with the exact
   schedules above, owner email and approved grace/runtime thresholds. Configure
   `BACKUP_SENTRY_DSN`. The runner sends bounded fixed-shape `in_progress`, `ok`
   and `error` check-ins; it never sends exceptions, SQL, subjects or database URLs.
   Preconfigured external monitors detect jobs which never start, including
   checkout/install failures or scheduler delay. The code does not create monitors
   or prove email delivery.
7. After separate activation approval, set `JUSTGO_BACKUPS_ENABLED=approved`.
   Run each kind deliberately and inspect the approved source SHA, verified R2
   object, denied overwrite/delete, retention state, check-ins and received email.
   Then observe both scheduled copies and a missed-run/failure drill. No hosted
   scheduled pass is currently recorded.

The GitHub runner installs `age` and PostgreSQL 17 clients using the existing PGDG
setup approach. Local `JUSTGO_PG_BIN` selects the PostgreSQL tools. Dependency
installation failures are failures; an old local dump or ignored environment file
is never a CI prerequisite.

## Isolated local recovery

Download the selected encrypted snapshot and newest complete ledger using a
separate authorized read-only recovery credential. The upload token cannot GET
or list objects. Verify the object receipt/checksums and use the owner-held key
only on the authorized recovery machine. The recovery tool does not fetch keys,
download hosted data, point an API at a restored database or open writers.

Create an empty, disposable loopback database with a unique name matching
`justgo_restore_<12 lowercase hex characters>`. The cluster must contain the
application roles required by the preserved grants/policies. Real Supabase Auth
also has managed roles, extensions, triggers and external provider configuration;
inspect and prepare those actual dependencies under the reviewed restore plan.
Do not discard ACLs to make a restore appear successful.

The dump includes `justgo`, `auth` and `drizzle`, but not `justgo_auth_private`.
After restoring the managed schema, reapply the reviewed operator SQL
[`session-check-v1.sql`](../../apps/api/scripts/managed-auth/session-check-v1.sql)
as the isolated target's `postgres` operator. It recreates
`justgo_auth_private.is_live_session_v1(uuid,uuid)` with its fixed search path,
`postgres` ownership and restricted runtime usage/execute grants, and removes
direct runtime access to `auth.sessions`. Keep this schema outside the Data API's
exposed schemas. Verify the actual helper and its ACL before managed readiness or
provider-session acceptance; restoring the dump alone does not restore this
operator-managed capability.

Provide the following variables to `node scripts/backups/restore-local.mjs`:

- `JUSTGO_RESTORE_DATABASE_URL`: local `postgres` connection to that empty database.
- `RECOVERY_DATABASE_FILE` and `RECOVERY_LEDGER_FILE`: the encrypted `.age` files.
- `RECOVERY_OFFLINE_KEY_FILE`: path to the local protected identity file.
- `RECOVERY_EVIDENCE_FILE`: approved JSON evidence with `version: 1`,
  `approvalReference`, `source` (the exact receipt source identity),
  `databaseSha256`, `databaseCapturedAt`, `ledgerSha256`, `migrationDigest`,
  `writesFencedAt`, `currentLedgerConfirmedAt` and `invalidateAllSessions: true`.
- `JUSTGO_PG_BIN` and optional `AGE_BIN`: the installed local tools.

Direct receipts retain `<sourceHost>/<sourceDatabase>`. Shared session-pooler
receipts use `<sourceProjectRef>@<sourceHost>/<sourceDatabase>` because the same
host/database pair serves multiple projects. Preserve that entire identity in
recovery evidence and require the ledger to match it; do not omit the project
reference or substitute a direct hostname for the recorded pooler hostname.

The evidence binds the two ciphertext files and migration set. The ledger must be
at least as new as the backup, captured after the writer fence, and confirmed
current after capture. The operator must establish that fence for **all** app,
maintenance and Auth changes and maintain it throughout recovery; entering
plausible timestamps is not proof. An older hourly ledger cannot authorize
reopening when later deletions may be missing.

The tool streams decryption into a transactional `pg_restore`, verifies the current
registered migration hashes and reconciles the ledger in one transaction. It
preserves subject/digest ownership, monotonically advances data epochs, removes
covered activity/private versions, restores missing tombstones and revoked proofs,
reapplies Auth subject erasure, and invalidates restored sessions. Conflicting
ownership, incomplete ledgers, wrong checksums and unfamiliar migrations fail
closed. It deliberately does not guess how to migrate an older backup; a reviewed
forward-migration step is needed if the registered chain differs.

A successful result still reports `writersMayOpen: false` and
`providerAcceptanceRequired: true`. Complete the
[foundation restore checklist](FOUNDATION.md#backup-restore-checklist), including
actual isolated API/provider checks, before proposing any separate operational
cutover. After failed reconciliation the target may contain the original snapshot;
keep it isolated and dispose of it under the approved recovery procedure.

## Local verification and remaining evidence

Run focused tooling regressions with:

```sh
node --test scripts/backups/backups.test.mjs
```

Run the complete synthetic encrypted recovery rehearsal with the existing isolated
PostgreSQL environment prepared:

```sh
node --env-file-if-exists=apps/api/.env --import tsx scripts/backups/rehearse.mjs
```

It validates the loopback `justgo_test` administrator/runtime credentials before
creating two run-owned disposable databases and a temporary read-only backup role.
It refuses an existing `justgo_backup` role. It applies the current migration
registry, seeds synthetic app/Auth state, takes a real encrypted `pg_dump`, makes
later account/data deletions and revocations, captures the encrypted ledger and
restores into the second database. Actual `IdentityService` calls reject old
recovery/session proofs; SQL assertions check missing private history/Auth
subjects, epochs/tombstones and repeat replay. Cleanup removes its databases, role,
temporary key and ciphertext without touching ordinary test database rows.

This rehearsal passed locally with PostgreSQL 17 and `age` 1.3.2. It establishes
actual local encryption/decryption/dump/restore and application deletion behavior.
The small synthetic Auth tables do **not** establish recovery of the real hosted
Auth schema, session-provider behavior, role/extension dependencies, key retrieval
by the owner, R2 permissions/expiry, scheduled availability or an operational RTO.
Those gates remain open. Hourly ledgers also leave the explicitly documented
post-copy gap; no successful local test closes that recovery-design requirement.
