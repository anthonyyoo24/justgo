# Encrypted Cloudflare recovery copies

Phase 15 supplies local backup, upload, ledger and restore tooling. Anthony approved
creation of the empty private `justgo-staging-backups` bucket; its creation and
disabled public access are verified. The dedicated reader is now LOGIN-enabled
under Anthony's accepted narrow staging exception. Actual verified-TLS metadata
and required-schema `LIMIT 0` access probes passed without fetching private rows.
The main-only `database-backups` GitHub environment holds `BACKUP_DATABASE_URL`,
`BACKUP_DATABASE_CA_CERT`, the approved `R2_INSPECT_TOKEN` and the three derived
`R2_UPLOAD_*` secrets, plus approved `BACKUP_POLICY_JSON` and
`BACKUP_POLICY_SHA256`; workflow opt-in remains unset. A disposable encrypted R2
canary passed PUT/HEAD, denied GET/list/out-of-prefix PUT/DELETE, and was retrieved
and decrypted with the owner's protected local key file before cleanup.
Seven-day protection and automatic expiry are approved and configured for both
staging prefixes, with API readback and actual lock enforcement verified. The two
October 30 encrypted lock-test canaries contain no user data and remain until
expiry. The replacement uploader also passed October 31 synthetic-only permission
checks; its two additional canaries become eligible for expiry November 7. Actual
asynchronous deletion has not yet been observed. Hosted database/ledger
copies, the remaining policy approvals and monitor delivery verification remain open.
The [Phase 15 plan](../implementation-plan/phase-15-cloudflare-api.md) owns these
approvals; the [Phase 14 handoff](../handoffs/phase-14-release.md) preserves the
independent privacy and device gates. This guide does not authorize those actions.
A local `age` identity has been prepared in protected local storage with mode
`0600`, and a synthetic encryption/decryption round trip passed.
The owner's standalone protected local key file also has mode `0600`. Anthony confirmed
a key copy on an encrypted USB drive; the copy was not mounted or tested. Under
the [October 31 custody decision](../DECISIONS.md#october-31-local-recovery-key-custody-and-coordinated-cutover),
the protected Mac copies remain locally outside CI, without a USB-retrieval
prerequisite. Decryption of an actual hosted database recovery copy and complete
operational recovery remain unverified.

## Implemented boundary

`scripts/backups/run.mjs` runs one `database` or `ledger` copy. The protected
`database-backups` GitHub environment supplies dedicated credentials and must
contain the exact approved policy bytes. The workflow refuses to run until the repository variable
`JUSTGO_BACKUPS_ENABLED` is `approved`; merging its YAML does not enable copying.
It runs on main only, serializes jobs and never uploads GitHub artifacts. Nightly
copies are scheduled at **04:43 UTC**; ledger copies at **23 minutes past each
hour**. These are fixed UTC schedules, independent of daylight saving time.

The runner verifies the approved policy digest, exact database host/name, TLS CA,
approved backup-role permissions and complete registered migration hashes. It opens a
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

## Recovery decision and remaining proposals

The small-beta ledger-gap disposition below is approved by the
[October 29 decision](../DECISIONS.md#october-29-small-beta-recovery-limit).
The [October 30 decision](../DECISIONS.md#october-30-seven-day-staging-backup-retention)
approves seven-day staging retention, protection and automatic expiry.
The [October 31 decision](../DECISIONS.md#october-31-recovery-targets) approves
up to 24 hours of ordinary-write loss and a four-hour operator recovery target,
subject to safe recovery; sign-in again after restoration was approved October 30.
The [October 31 custody decision](../DECISIONS.md#october-31-local-recovery-key-custody-and-coordinated-cutover)
approves the owner-held `age` identity in protected local Mac storage outside CI,
without a USB-retrieval prerequisite.
The separately accepted reader exception and activation request are described
under protected-environment setup. Approved objectives still require operational
evidence; remaining proposals below are not approvals or published promises:

| Decision                      | Policy / proposal                                                                                                                                       | Evidence / acceptance still required                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup and ledger retention   | Approved October 30: seven days for each staging prefix in the private dedicated R2 bucket                                                              | API readback confirms both expiry rules. Retention wording is approved; actual asynchronous deletion, operational evidence, effective date, matching version and publication authorization remain pending.                                                                                   |
| Lock duration and expiry      | Approved October 30: seven-day prefix locks and lifecycle expiry at day seven                                                                           | API readback and parent-credential overwrite/DELETE rejection passed for both prefixes. R2 removal is asynchronous, typically within 24 hours of expiry, and is not a strict maximum; actual expiry has not yet been observed.                                                               |
| Ordinary-write recovery point | Approved October 31: up to 24 hours of new activity since the nightly snapshot may be lost                                                              | Hourly identity ledgers do not back up new journals. Actual scheduled copies and failed/missed-copy alerts remain unverified; approval does not establish achieved recovery evidence.                                                                                                        |
| Recovery time                 | Approved October 31: operator target of four hours when safe recovery is possible                                                                       | Not measured for the actual hosted Auth schema or a provider incident; the synthetic local rehearsal is not an operational RTO measurement.                                                                                                                                                  |
| Current deletion ledger       | Obtain a final ledger after fencing all API, maintenance and Auth/provider mutations; accepted beta fallback keeps unverified old restored state closed | Independent deletion/revocation recording is deferred for the small beta. Reassess before paid launch or beta expansion, whichever comes first. Clean restart needs a separate procedure; automatic old-phone recovery is unsupported.                                                       |
| Restored sessions             | Invalidate every restored legacy/app/Auth session and Auth refresh token; cancel pending transfers                                                      | Reauthentication approved October 30 with the complete Privacy wording. Retain recovery digests and their revocations; do not recreate deleted owners or use an old transfer to recover access. Actual app/Auth recovery still requires evidence.                                            |
| Key custody                   | Approved October 31: owner-held `age` identity in protected Mac copies locally outside CI                                                               | USB retrieval is not a prerequisite. The owner-confirmed USB copy was not tested. Loss of every copy makes backups unusable; actual hosted recovery-copy decryption and complete app/Auth recovery remain unverified.                                                                        |
| Upload-token renewal          | Maximum seven-day derived credential; Anthony owns manual renewal by day five                                                                           | Parent key remains locally outside CI. The runner rejects tokens with less than 20 minutes remaining, and failed/missed jobs alert through the configured monitor. Day-five renewal is a required operator responsibility; no external reminder or automatic issuer is created by this code. |
| Alert ownership               | Owner email for one hourly `justgo-staging-backup-health` Sentry Cron monitor                                                                           | The engineering design uses one free Cron with 20-minute grace/runtime settings and checks both backup kinds. Owner notification delivery and failure/missed-run evidence remain unverified.                                                                                                 |

The seven-day upload-token lifetime is the local minting policy, not an established
Cloudflare maximum. Scheduled copying is unattended only while its credentials
remain valid. Fully unattended renewal would need an approved online issuer with
access to the parent signing secret; a longer lifetime would also change the
proposed policy. Neither change is implemented or approved. Anthony owns manual
renewal; keep the parent secret outside CI. The optional
[Phase 21 issuer](../implementation-plan/phase-21-backup-credential-issuer.md)
is deferred until accepted payments, analytics and actual App Store publication;
it does not gate Phase 15 or the first launch.

Anthony accepts the ledger gap as a recovery limit for the small beta. If the
source is lost after the last hourly copy and later deletions or revocations
cannot be established, the old restored account/data state stays closed and may
remain unrecoverable. The approved four-hour recovery target cannot cover that
case. This does not mean the service can never reopen: a clean restart with newly
authenticated accounts and new writing is possible in principle, subject to a
separately reviewed procedure. Automatic recovery from old phones is unsupported.
Reusing old identities without their deletion generations/tombstones can upload
obsolete copies; existing account-owned imports also require the original owner.

Independently durable per-deletion/revocation recording remains the long-term
direction, explicitly deferred for this beta. Anthony and the implementation/release
owner must reassess it before paid launch or expansion beyond the small beta,
whichever comes first. A faster schedule or an outbox stored only in the lost
database cannot close the gap. The future design must cover app, maintenance and
Auth/admin paths. Anthony accepts conservative replay of a durably saved deletion
intent after an apparent database failure. That design still needs implementation
and evidence; this decision does not change the current restore checks. Recovery
objectives and reauthentication are governed by the separate October 31 decision;
staging retention is governed by the October 30 decision.

[R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/) prevent
premature deletion and overwrite, but an administrator can change the rules.
[R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
describe asynchronous expiry. Neither mechanism justifies promising immediate
backup erasure or keeping copies beyond an approved retention policy. A separate
privileged expiry audit and incident response is required if real observed expiry
exceeds the approved wording.

## Preparing the protected environment

Do not enable the workflow before the Phase 15 account,
DPA, payment-method, retention, key and recovery decisions are approved. Configure
one actual source environment per protected backup lane; production must receive
its own credentials, approved policy and lane when it is introduced.

1. Use the reviewed backup-reader implementation merged into `main`, including
   the narrow staging opt-in below. The earlier schema-grant-only candidate is
   superseded.
   Anthony approved Supabase's supported `BYPASSRLS` + `pg_read_all_data` pattern.
   It reads all project tables/views/sequences, including Auth and security
   catalogs, although the job exports only three schemas. Require exactly that
   inherited membership with SET/ADMIN disabled, the bounded role defaults and
   no extra memberships, ownership or schema/database CREATE. Reject data
   mutations apart from the explicitly accepted staging exception below.
   The verifier also checks inherited ownership of the pinned reader role and
   rejects exposed noncatalog SECURITY DEFINER routines. Standard PUBLIC
   `pg_settings` UPDATE changes session settings and has its own narrow exception.
   Read-only defaults and these guards do not make the credential absolutely
   read-only. See [Supabase's supported pattern and residual powers](https://supabase.com/kb/troubleshooting/pg_dump-fails-with-query-would-be-affected-by-row-level-security-policy).

   The default guard rejected PUBLIC `DELETE` on `cron.job_run_details`, and the
   reader was disabled. Anthony now accepts that exact scheduler-history DELETE
   capability for the small beta and requests backup activation. The opt-in
   is the optional policy field `allowCronJobRunDetailsDelete: true`; absence or
   `false` keeps rejection. It is restricted to `environment: "staging"`,
   `sourceProjectRef: "kmcpcauaxlgpevkkenwd"`, `sourceDatabase: "postgres"` and the
   matching accepted direct/session-pooler source. The exact approved policy
   bytes/digest bind the exception, and the role-verification boundary must receive
   and revalidate that policy. Only DELETE on exactly `cron.job_run_details` is
   excepted. Other mutating privileges on that table, relation/column mutations elsewhere,
   ownership, memberships and privileged functions remain rejected. The exception
   does not grant app/Auth deletion or authorize deleting scheduler history.

   A rollback-only `postgres` probe could not revoke the `supabase_admin` owner's
   grant; existing ACLs are unchanged. The sole scheduled job runs as `postgres`,
   which has its own DELETE grant. The authorized Supabase support request to
   remove PUBLIC DELETE was submitted: the page confirmed sending and a ticket
   logged for JustGo, but displayed no ticket ID. Optional diagnostic access was
   off. The provider response/removal remains pending.
   This follow-up runs alongside backups and does not block activation. Remove
   the exception after the provider's removal is verified. The reader is now
   LOGIN-enabled, and actual TLS metadata/required-schema `LIMIT 0` probes passed
   the opted-in guard without fetching private rows. This acceptance does not
   establish the remaining alert-delivery or operational recovery evidence.

2. Choose and configure the actual bucket/location/access/lock/lifecycle settings
   using a separate privileged owner credential. The read-only `R2_INSPECT_TOKEN`
   needs access to bucket lock/lifecycle and managed/custom-domain settings, scoped
   to the approved account. Verify the uploader cannot change those settings or
   delete retained objects with disposable encrypted canaries.
   October 30 readback verified enabled Age lock rules with
   `condition.maxAgeSeconds: 604800` and enabled object-expiry rules with
   `deleteObjectsTransition.condition.maxAge: 604800` for exactly
   `staging/database/` and `staging/ledger/`. The default incomplete-multipart abort
   lifecycle rule is preserved; public domains remain disabled. Actual encrypted
   dummy canaries on both prefixes rejected parent-credential overwrite and DELETE
   with HTTP 409 `ObjectLockedByBucketPolicy`. HEAD reported expiry at
   `2026-11-06T13:22:01Z` for the database canary and `2026-11-06T13:22:37Z` for the
   ledger canary. They contain no user data and remain under lock until expiry;
   actual asynchronous deletion is still unobserved. Anthony approved
   the inspector's account-wide R2 read/list authority, including other buckets.
   That Admin Read Only key is active, expires `2026-11-05T23:06:08Z`, and is stored
   as `R2_INSPECT_TOKEN` in the protected environment.
3. Save exact approved JSON in `BACKUP_POLICY_JSON` and its SHA-256 in
   `BACKUP_POLICY_SHA256`. Both are now stored in the protected environment with
   `backupDays: 7`, `ledgerDays: 7` and `lockDays: 7`; readback matched the exact
   bytes and digest, and workflow opt-in remains unset.
   Policy fields are `version: 1`, `approvalReference`,
   `accountId`, `bucket`, `environment` (`staging` or `production`), `jurisdiction`
   (`default`, `eu`, `us` or `fedramp`), `backupDays`, `ledgerDays`, `lockDays`,
   `ageRecipient`, `sourceHost` and `sourceDatabase`. Supabase shared session-pooler
   sources additionally require `sourceProjectRef`, the approved 20-character
   lowercase alphanumeric project reference. If supplied for a direct connection,
   its host must be exactly `db.<sourceProjectRef>.supabase.co`; existing direct
   policies without this field remain supported. The recipient is public; never
   put the `AGE-SECRET-KEY-...` identity here. A matching digest is a technical
   check, not evidence that Anthony approved a policy. The optional
   `allowCronJobRunDetailsDelete` field follows the exact staging restriction in
   step 1; do not carry it into a production policy.
4. Configure `BACKUP_DATABASE_URL` with the exact approved host/database and port
   5432, without query/fragment options. Direct connections use `justgo_backup`;
   recognized Supabase shared session-pooler hosts
   (`aws-<number>-<region>.pooler.supabase.com`) require the exact login
   `justgo_backup.<sourceProjectRef>`. The connected database role must still be
   `justgo_backup` and pass the independent privilege checks. Provide
   the actual server CA as `BACKUP_DATABASE_CA_CERT`. Transaction pooler port
   6543 is refused; exported snapshots and dump coordination require direct or
   compatible session connections. Use the actual account's verified endpoint,
   not a guessed regional hostname. Supabase documents shared session pooling as
   an [IPv4 connection option](https://supabase.com/docs/guides/database/connecting-to-postgres).
   A read-only full hosted `justgo`/`auth`/`drizzle` archive was encrypted directly
   through `age` and restored into an isolated local PostgreSQL 17 database with
   ACLs preserved. The private session helper was reapplied and its ownership and
   runtime-only access verified. The disposable database, created roles and
   encrypted test archive were removed. This proves archive compatibility, not
   writer-fenced reconciliation, provider session recovery or permission to reopen
   restored accounts. Those recovery gates remain open.
5. Prepare derived upload credentials locally outside CI with
   `node scripts/backups/mint-upload-credentials.mjs`. It needs the approved policy
   variables, `R2_PARENT_ACCESS_KEY_ID`, `R2_PARENT_SECRET_ACCESS_KEY`, explicit
   `R2_UPLOAD_TTL_SECONDS` (1–168 hours) and `R2_CREDENTIAL_OUTPUT_FILE`. It refuses
   CI and creates a new mode-0600 file instead of printing credentials. Transfer
   only its three `R2_UPLOAD_*` values into the protected environment secrets;
   securely remove the temporary operator file. Rotate before day five and test
   the actual permitted/denied actions. No parent key or private encryption identity
   belongs in GitHub, source, chat or logs.
   On October 31, an agent tool-output mistake exposed the original parent API
   token. Anthony approved replacing and revoking it. The old parent is revoked
   and its derived uploader now returns HEAD 401. The replacement,
   `justgo-staging-backup-parent-rotation-2026-10-31`, keeps the same bucket-only
   Object Read & Write parent scope and remains local outside CI. It expires
   `2026-11-05T17:00:00Z`. Its derived uploader permits only PutObject/HeadObject
   on the two approved staging prefixes, expires `2026-11-05T15:59:59Z`, and
   stops passing the runner's 20-minute minimum at `2026-11-05T15:39:59Z`.
   The protected `R2_UPLOAD_*` secrets hold the replacement uploader. The
   unchanged inspector expires `2026-11-05T23:06:08Z`; the recovery key was not
   read or exposed and is unchanged. Scope verification passed using synthetic
   encrypted canaries only;
   the [Phase 15 handoff](../handoffs/phase-15-cloudflare-api.md#approval-and-acceptance-register)
   owns the final rotation/scope receipts. Its two replacement canaries become
   eligible for expiry November 7; asynchronous deletion remains unobserved.
   These checks do not establish operational database/ledger copies. Schedules
   remain off; actual hosted recovery-copy decryption, complete writer-fenced
   hosted recovery, alert delivery and contractual coverage remain open. Anthony
   owns manual renewal. Parent revocation invalidates its derived uploader;
   renewing the uploader alone is insufficient when its parent expires. Renew
   the inspector before its expiry to observe the November 6 retention canaries.
6. Create and verify one Sentry Cron monitor, `justgo-staging-backup-health`, with
   schedule `23 * * * *` in UTC, check-in margin 20 minutes, maximum runtime
   20 minutes and the intended owner notification route. Configure
   `BACKUP_SENTRY_DSN`. Account inspection showed three trial days remaining,
   followed by Developer with one Cron; no paid change is selected. The
   [single-monitor decision](../DECISIONS.md#october-29-single-backup-health-monitor)
   replaces the earlier two-monitor setup.
   The monitor is created in `justgo-api`, assigned to Anthony, and the matching
   `BACKUP_SENTRY_DSN` is stored in the protected environment. It is waiting for
   its first check-in; owner email delivery and failure/missed-run drills remain
   unverified. The existing `JustGO API errors and recovery (email)` alert covers
   all issues in this project and notifies Anthony on new/resolved/regressed
   issues; a duplicate alert was not created. An unused initial setup draft with
   slug `new-monitor` is disabled.

   Pass `GITHUB_TOKEN` with workflow permission `actions: read`. The ledger health
   check must verify trusted main-branch workflow evidence that both the actual
   database-copy job and its copy step succeeded for the required nightly slot;
   a green workflow with that work skipped is insufficient. It reports `ok` only
   after the ledger upload and this database-freshness check succeed. The nightly
   slot is 04:43 UTC, with a 40-minute deadline inclusive at 05:23. A missing
   database copy is normally caught at completion of the 05:23 ledger run, plus
   runtime/platform/notification delay; this is not an SLA. Missing ledger jobs,
   including failures before check-in, are detected by the Cron's missed-run
   behavior. Check-ins use fixed-shape `in_progress`, `ok` and `error`, with no
   exception text, SQL, subjects or database URLs. Verify hosted check-ins and
   actual notification delivery; configuration alone does not prove either.

7. Anthony has requested activation; once the remaining policy/configuration
   requirements are satisfied, set `JUSTGO_BACKUPS_ENABLED=approved`.
   Run a manual database copy first, then a manual ledger copy so the combined
   health check has database success evidence. Inspect the approved source SHA, verified R2
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
creating two run-owned disposable databases and a temporary backup reader.
It refuses an existing `justgo_backup` role. It applies the current migration
registry, seeds synthetic app/Auth state, verifies rejection of an extra MAINTAIN
grant and inherited ownership, takes a real encrypted `pg_dump`, makes
later account/data deletions and revocations, captures the encrypted ledger and
restores into the second database. Actual `IdentityService` calls reject old
recovery/session proofs; SQL assertions check missing private history/Auth
subjects, epochs/tombstones and repeat replay. Cleanup removes its databases, role,
temporary key and ciphertext without touching ordinary test database rows.

This rehearsal passed locally with PostgreSQL 17 and `age` 1.3.2. It establishes
actual local encryption/decryption/dump/restore and application deletion behavior.
The small synthetic Auth tables do **not** establish recovery of the real hosted
Auth schema, session-provider behavior, role/extension dependencies, actual hosted
recovery-copy decryption, R2 expiry, scheduled availability or an operational RTO.
Those gates remain open. Hourly ledgers also leave the post-copy gap, now accepted
as a small-beta recovery limit with independent recording explicitly deferred.
Local tests do not replace reassessment before paid launch or beta expansion,
or establish the deferred design.
