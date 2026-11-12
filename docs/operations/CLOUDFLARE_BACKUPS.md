# Encrypted Cloudflare recovery copies

Moving the API to Supabase Edge Functions does not change these backups. Keep R2,
the Cloudflare account and the backup clock Worker in `scripts/backups/clock/`
when the API Worker retires.

Backups are paused. On November 6, 2026, Anthony set the repository variable
`JUSTGO_BACKUPS_ENABLED` to `paused`, because staging holds only test data. The
`backup` job in `database-backups.yml` now skips on every schedule and every
clock dispatch. The last copy, ledger run
[42287912720](https://github.com/anthonyyoo24/justgo/actions/runs/42287912720),
passed at 20:23 UTC that day. Before outside testers store real journals, renew
the R2 credentials and the clock token, and set the variable back to `approved`.
Then confirm that one nightly and one hourly run succeed, and record the new
expiry dates in [Credential dates](#credential-dates) and on
[#77](https://github.com/anthonyyoo24/justgo/issues/77).

Phase 15 supplies merged backup, upload, ledger and restore tooling. Anthony
approved creating the empty private `justgo-staging-backups` bucket. Its creation
and disabled public access are verified. The dedicated reader is now
LOGIN-enabled under Anthony's accepted narrow staging exception. Actual
verified-TLS metadata and required-schema `LIMIT 0` access probes passed without
fetching private rows.

The main-only `database-backups` GitHub environment holds `BACKUP_DATABASE_URL`,
`BACKUP_DATABASE_CA_CERT`, the approved `R2_INSPECT_TOKEN`, the three derived
`R2_UPLOAD_*` secrets, and the approved `BACKUP_POLICY_JSON` and
`BACKUP_POLICY_SHA256`. The reviewed main workflow was enabled on November 2 with
`JUSTGO_BACKUPS_ENABLED=approved` after the remaining configuration checks.

A disposable encrypted R2 canary passed PUT and HEAD. GET, list and
out-of-prefix PUT and DELETE were denied. The canary was then retrieved and
decrypted with the owner's protected local key file before cleanup. Seven-day
protection and automatic expiry are approved and configured for both staging
prefixes. API readback and actual lock enforcement are verified. The two October
30 encrypted lock-test canaries contain no user data and remain until expiry. The
replacement uploader also passed October 31 synthetic-only permission checks. Its
two additional canaries become eligible for expiry November 7. Actual
asynchronous deletion has not yet been observed.

The first supervised manual encrypted database and ledger copies succeeded
through the checked exporters and R2 uploader. [Receipts](#receipts) lists
their source and object receipts. They used no private decryption identity,
established no writer fence and sent no Sentry Cron check-ins. On November 2,
manual dispatches of the actual main-branch database and ledger jobs both passed.
Both included independent R2 HEAD verification, and the ledger job included its
database-freshness check.

The first healthy Sentry check-in and a controlled failure and resolution were
observed. The short controlled incident's email was not received. A later real
missed-run incident stayed open beyond batching, and Anthony confirmed that its
backup email arrived. A verified real manual ledger catch-up cleared the monitor
and resolved the issue. [Backup clock](#backup-clock) records the scheduled runs.
Timeout-specific behavior, complete recovery and actual expiry remain open.

On November 1, Anthony accepted the current-account, DPA and
private-consumer-journal assessment with its residual interpretation. It adds no
provider-confirmation or external-counsel prerequisite. The
[Phase 15 plan](../implementation-plan/phase-15-cloudflare-api.md) owns these
approvals. The [`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate)
hold the independent privacy and device gates. This guide does not authorize
those actions.

A local `age` identity is prepared in protected local storage with mode `0600`,
and a synthetic encryption and decryption round trip passed. The owner's
standalone protected local key file also has mode `0600`. Anthony confirmed a key
copy on an encrypted USB drive. That copy was not mounted or tested. Under his
October 31 custody choice, the protected Mac copies remain local and outside CI,
without a USB-retrieval prerequisite. On November 1, owner-authorized
authenticated decryption of both initial R2-downloaded copies passed, and the
plaintext was discarded. Complete operational recovery remains unverified.
[Receipts](#receipts) lists that receipt.

## Implemented boundary

`scripts/backups/run.mjs` runs one `database` or `ledger` copy. The protected
`database-backups` GitHub environment supplies dedicated credentials and must
contain the exact approved policy bytes. The workflow refuses to run until the
repository variable `JUSTGO_BACKUPS_ENABLED` is `approved`. Merging its YAML does
not enable copying. The workflow runs on main only, serializes jobs and never
uploads GitHub artifacts. Nightly copies are scheduled at **04:43 UTC**, and
ledger copies are scheduled at **23 minutes past each hour**. Both schedules are
fixed in UTC and do not follow daylight saving time.

The runner verifies the approved policy digest, the exact database host and name,
the TLS CA, the approved backup-role permissions and the complete registered
migration hashes. It opens a read-only repeatable-read transaction. A nightly
`pg_dump` uses that exported snapshot and includes `justgo`, `auth` and the
`drizzle` migration journal. Its custom-format output goes directly through
`age`, so only ciphertext is written to the private temporary directory. The
custom-format archive keeps object owners, ACLs and RLS policies, although
`pg_dump` runs with `--no-owner`. `restore-local.mjs` drops the owners by default.
Its `preserveOwnership` option keeps them once the operator provisions the
reviewed roles. CI holds no private key.

The runner captures the hourly JSON ledger from one database snapshot and
encrypts it through the same pipe. The ledger contains:

- Every owner's creation and deletion receipt, data epoch and data deletion time.
- Recovery credential digests and revocations, device and session revocations and
  rotations, and transfer expiry, cancellation and redemption state.
- Immutable managed subject mappings, app sessions and Auth cleanup outbox state.
- Deleted completion IDs, plus current Auth subject and session IDs and
  refresh-token revocation metadata.

The ledger contains sensitive identity metadata and must remain encrypted. It does
not select attempts, private journal versions or reflection text. Its current
serialized JSON limit is 64 MiB. Reaching that limit fails the job and needs an
explicit scaling review. At upload, the nightly stream is limited to a single
encrypted object of at most 2 GiB. The current Free database capacity is much smaller.

Before upload, read-only Cloudflare calls verify the exact prefix lock and expiry
rules and reject an enabled public `r2.dev` or custom domain. The uploader accepts
only locally signed R2 temporary credentials that allow `PutObject` and
`HeadObject` for the approved environment's `database/` and `ledger/` prefixes.
It sends one conditional PUT to a unique key, then checks the ciphertext size and
hash through HEAD. An uncertain PUT gets no automatic second mutation. The runner
always removes its temporary ciphertext and prints only the object identity, the
ciphertext checksum and non-private release and snapshot metadata.

[Cloudflare temporary credentials](https://developers.cloudflare.com/r2/api/s3/temporary-credentials/)
support action-scoped JWTs. A normal Object Read & Write credential is broader, and
this runner deliberately rejects it. The parent credential must remain outside
CI. Bucket administration and lifecycle changes require a separate owner
credential. The uploader must not be able to edit locks or public access.

## Backup clock

GitHub started the native schedules hours late. A separate Cloudflare Cron Worker,
`justgo-staging-backup-clock` in `scripts/backups/clock/`, therefore dispatches
`database-backups.yml` at the same two times. Its only secret is a GitHub token
with repository Actions write access. It holds no database, R2 or recovery-key
credentials. The tracked `wrangler.json` keeps the clock disabled. The deployed
configuration holds the activation and the token expiry.

The clock's first dispatch started ledger run
[41536825031](https://github.com/anthonyyoo24/justgo/actions/runs/41536825031)
at 22:23 UTC on November 2, 2026, from deployed version
`8dcf5dc4-5fc2-413c-aaa6-9b16f4a04b6a`. Its first nightly dispatch started
database run
[41579744704](https://github.com/anthonyyoo24/justgo/actions/runs/41579744704)
at 04:43 UTC on November 3, and that run passed. Every dispatched run passed until
the November 6 pause. The ledger slot at 23:23 UTC on November 5 has no run,
and its cause is unknown. Since the pause, the clock still dispatches, and the
`backup` job skips. The [Phase 15 rollout review](../checks/phase-15-rollout-review.md)
records the activation evidence.

## Credential dates

The November 3, 2026 renewal replaced the R2 upload and inspector secrets in the
`database-backups` environment at 00:09 UTC, as
[#77](https://github.com/anthonyyoo24/justgo/issues/77) records. Copies kept
passing after the old uploader, parent and inspector expiry times on November 5,
so the runner used renewed credentials. No record holds the new expiry dates, and
the run logs do not print them.

| Credential                       | Recorded expiry or cutoff                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Derived uploader, `R2_UPLOAD_*`  | Unknown. Issue #77 reports November 9, 2026, from another tool, and nobody has checked it in Cloudflare. |
| Inspector, `R2_INSPECT_TOKEN`    | Unknown.                                                                                                 |
| R2 parent, kept local outside CI | Unknown.                                                                                                 |
| Clock GitHub token               | It stops passing the clock's expiry check at 23:40 UTC on November 29, 2026, per the rollout review.     |

The runner rejects an uploader credential with less than 20 minutes left, and the
clock applies the same margin to its token. The rollout review's renewal proposal
named November 9 expiries for the parent, the uploader and the inspector. No
record shows that the renewal used those dates. While backups are paused, none of
these credentials needs renewal. Renew all four before you set
`JUSTGO_BACKUPS_ENABLED` back to `approved`.

## Recovery decision and remaining proposals

Anthony approved these recovery decisions:

- October 29: the small-beta ledger-gap disposition below.
- October 30: seven-day staging retention, protection and automatic expiry, and
  signing in again after restoration.
- October 31: up to 24 hours of ordinary-write loss and a four-hour operator
  recovery target, subject to safe recovery. On the same day, he approved the
  owner-held `age` identity in protected local Mac storage outside CI, without a
  USB-retrieval prerequisite.

[Preparing the protected environment](#preparing-the-protected-environment)
describes the separately accepted reader exception and activation request.
Approved objectives still require operational evidence. The remaining proposals
in this table are not approvals or published promises.

| Decision                      | Policy / proposal                                                                                                                                            | Evidence / acceptance still required                                                                                                                                                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backup and ledger retention   | Approved October 30: seven days for each staging prefix in the private dedicated R2 bucket                                                                   | API readback confirms both expiry rules. Retention wording is approved. Actual asynchronous deletion, operational evidence, the effective date, a matching version and publication authorization remain pending.                                                                                        |
| Lock duration and expiry      | Approved October 30: seven-day prefix locks and lifecycle expiry at day seven                                                                                | API readback and rejection of parent-credential overwrite and DELETE passed for both prefixes. R2 removal is asynchronous, typically within 24 hours of expiry, and that time is not a strict maximum. Actual expiry has not yet been observed.                                                         |
| Ordinary-write recovery point | Approved October 31: up to 24 hours of new activity since the nightly snapshot may be lost                                                                   | Hourly identity ledgers do not back up new journals. Scheduled copies passed until the November 6 pause. Real missed-copy detection and email, and manual recovery, passed November 2. Approval does not establish achieved recovery evidence.                                                          |
| Recovery time                 | Approved October 31: operator target of four hours when safe recovery is possible                                                                            | Not measured for the actual hosted Auth schema or a provider incident. The synthetic local rehearsal is not an operational RTO measurement.                                                                                                                                                             |
| Current deletion ledger       | Obtain a final ledger after fencing all API, maintenance, Auth and provider mutations. The accepted beta fallback keeps unverified old restored state closed | Independent deletion and revocation recording is deferred for the small beta. Reassess before paid launch or beta expansion, whichever comes first. A clean restart needs a separate procedure. Automatic old-phone recovery is unsupported.                                                            |
| Restored sessions             | Invalidate every restored legacy, app and Auth session and every Auth refresh token. Cancel pending transfers                                                | Reauthentication was approved October 30 with the complete Privacy wording. Retain recovery digests and their revocations. Do not recreate deleted owners or use an old transfer to recover access. Actual app and Auth recovery still requires evidence.                                               |
| Key custody                   | Approved October 31: owner-held `age` identity in protected Mac copies locally outside CI                                                                    | USB retrieval is not a prerequisite. The owner-confirmed USB copy was not tested. Loss of every copy makes backups unusable. Actual hosted-copy decryption passed November 1. Complete app and Auth recovery remains unverified.                                                                        |
| Upload-token renewal          | Maximum seven-day derived credential. Anthony owns manual renewal by day five                                                                                | The parent key remains local and outside CI. The runner rejects tokens with less than 20 minutes remaining, and failed or missed jobs alert through the configured monitor. Day-five renewal is a required operator responsibility. This code creates no external reminder or automatic issuer.         |
| Alert ownership               | Owner email for one hourly `justgo-staging-backup-health` Sentry Cron monitor                                                                                | The engineering design uses one free Cron with 20-minute grace and runtime settings and checks both backup kinds. Real missed-run detection, owner email receipt and verified-copy recovery passed November 2. The short initial error email was not received. Timeout-specific behavior is unverified. |

The seven-day upload-token lifetime is the local minting policy, not an
established Cloudflare maximum. Scheduled copying is unattended only while its
credentials remain valid. Fully unattended renewal would need an approved online
issuer with access to the parent signing secret. A longer lifetime would also
change the proposed policy. Neither change is implemented or approved. Anthony
owns manual renewal. Keep the parent secret outside CI. The optional
[Phase 21 issuer](../implementation-plan/README.md#unscheduled-roadmap) is
deferred until accepted payments, analytics and actual App Store publication. It
does not gate Phase 15 or the first launch.

Anthony accepts the ledger gap as a recovery limit for the small beta. If the
source is lost after the last hourly copy and later deletions or revocations
cannot be established, the old restored account and data state stays closed and
may remain unrecoverable. The approved four-hour recovery target cannot cover that
case. A closed old state does not mean the service can never reopen. A clean
restart with newly authenticated accounts and new writing is possible in
principle, subject to a separately reviewed procedure. Automatic recovery from old
phones is unsupported. Reusing old identities without their deletion generations
and tombstones can upload obsolete copies. Existing account-owned imports also
require the original owner.

Independently durable recording of each deletion and revocation remains the
long-term direction, and it is explicitly deferred for this beta. Anthony and the
implementation and release owner must reassess it before paid launch or expansion
beyond the small beta, whichever comes first. A faster schedule or an outbox
stored only in the lost database cannot close the gap. The future design must
cover app, maintenance, Auth and admin paths. Anthony accepts conservative
replay of a durably saved deletion intent after an apparent database failure. That
design still needs implementation and evidence, and this acceptance does not
change the current restore checks. The table above records the recovery
objectives, reauthentication and staging retention.

[R2 bucket locks](https://developers.cloudflare.com/r2/buckets/bucket-locks/) prevent
premature deletion and overwrite, but an administrator can change the rules.
[R2 object lifecycles](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
describe asynchronous expiry. Neither mechanism justifies promising immediate
backup erasure or keeping copies beyond an approved retention policy. If real
observed expiry exceeds the approved wording, a separate privileged expiry audit
and incident response are required.

## Preparing the protected environment

The November 1 decision settles the current staging Cloudflare account and DPA
assessment. The existing staging setup, retention, key-custody and
recovery-target decisions keep their approvals. Complete the remaining
operational acceptance and protected configuration before you enable schedules.
Configure one actual source environment for each protected backup lane. When
production is introduced, it must receive its own credentials, approved policy and
lane.

1. Use the reviewed backup-reader implementation merged into `main`, including
   the narrow staging opt-in below. The earlier schema-grant-only candidate is
   superseded.

   Anthony approved Supabase's supported `BYPASSRLS` with `pg_read_all_data`
   pattern. It reads all project tables, views and sequences, including Auth and
   security catalogs, although the job exports only three schemas. Require exactly
   that inherited membership with SET and ADMIN disabled, the bounded role
   defaults, and no extra memberships, ownership, or schema or database CREATE.
   Reject data mutations apart from the explicitly accepted staging exception
   below. The verifier also checks inherited ownership of the pinned reader role
   and rejects exposed noncatalog SECURITY DEFINER routines. Standard PUBLIC
   `pg_settings` UPDATE changes session settings and has its own narrow exception.
   Read-only defaults and these guards do not make the credential absolutely
   read-only. See [Supabase's supported pattern and residual powers](https://supabase.com/kb/troubleshooting/pg_dump-fails-with-query-would-be-affected-by-row-level-security-policy).

   The default guard rejected PUBLIC `DELETE` on `cron.job_run_details`, and the
   reader was disabled. Anthony now accepts that exact scheduler-history DELETE
   capability for the small beta and requests backup activation. The opt-in is
   the optional policy field `allowCronJobRunDetailsDelete: true`. If the field is
   absent or `false`, the guard keeps rejecting. The opt-in is restricted to
   `environment: "staging"`, `sourceProjectRef: "kmcpcauaxlgpevkkenwd"`,
   `sourceDatabase: "postgres"` and the matching accepted direct or session-pooler
   source. The exact approved policy bytes and digest bind the exception, and the
   role-verification boundary must receive and revalidate that policy. Only DELETE
   on exactly `cron.job_run_details` is excepted. Other mutating privileges on that
   table, relation and column mutations elsewhere, ownership, memberships and
   privileged functions remain rejected. The exception does not grant app or Auth
   deletion or authorize deleting scheduler history.

   A rollback-only `postgres` probe could not revoke the `supabase_admin` owner's
   grant, so the existing ACLs are unchanged. The sole scheduled job runs as
   `postgres`, which has its own DELETE grant. The authorized Supabase support
   request to remove PUBLIC DELETE was submitted. The page confirmed that it was
   sent and that a ticket was logged for JustGo, but it displayed no ticket ID.
   Optional diagnostic access was off. The provider's response and removal remain
   pending. This follow-up runs alongside backups and does not block activation.
   Remove the exception after the provider's removal is verified. The reader is
   now LOGIN-enabled, and actual TLS metadata and required-schema `LIMIT 0` probes
   passed the opted-in guard without fetching private rows. This acceptance does
   not establish the remaining alert-delivery or operational recovery evidence.

2. With a separate privileged owner credential, choose and configure the actual
   bucket, location, access, lock and lifecycle settings. The read-only
   `R2_INSPECT_TOKEN` needs access, scoped to the approved account, to the bucket
   lock, lifecycle, managed-domain and custom-domain settings. Use disposable
   encrypted canaries to verify that the uploader cannot change those settings or
   delete retained objects.

   October 30 readback verified enabled Age lock rules with
   `condition.maxAgeSeconds: 604800` and enabled object-expiry rules with
   `deleteObjectsTransition.condition.maxAge: 604800` for exactly
   `staging/database/` and `staging/ledger/`. The default incomplete-multipart abort
   lifecycle rule is preserved, and public domains remain disabled. Actual
   encrypted dummy canaries on both prefixes rejected parent-credential overwrite
   and DELETE with HTTP 409 `ObjectLockedByBucketPolicy`. HEAD reported expiry at
   `2026-11-06T13:22:01Z` for the database canary and `2026-11-06T13:22:37Z` for the
   ledger canary. They contain no user data and remain under lock until expiry.
   Actual asynchronous deletion is still unobserved. Anthony approved the
   inspector's account-wide R2 read and list authority, including other buckets.
   That Admin Read Only key had the expiry `2026-11-05T23:06:08Z` and was
   stored as `R2_INSPECT_TOKEN` in the protected environment. The November 3
   renewal replaced it. See [Credential dates](#credential-dates).

3. Save the exact approved JSON in `BACKUP_POLICY_JSON` and its SHA-256 in
   `BACKUP_POLICY_SHA256`. Both are now stored in the protected environment with
   `backupDays: 7`, `ledgerDays: 7` and `lockDays: 7`. After the November 2 repair
   described below, readback matched the exact bytes and digest. The workflow
   opt-in is now `approved`. The earlier saved variable had lost one trailing
   newline, so it held 581 bytes instead of the approved 582. When you set the
   variable through a structured API body, preserve the exact bytes. Then read it
   back and run the policy verifier. Do not normalize the policy or weaken its
   raw-byte hash check. The approved SHA-256 remains
   `10ccf6587e8152c95665841324e32e682b4465be2ffb08d60a53571029cfa3c0`.

   Policy fields are `version: 1`, `approvalReference`, `accountId`, `bucket`,
   `environment` (`staging` or `production`), `jurisdiction` (`default`, `eu`,
   `us` or `fedramp`), `backupDays`, `ledgerDays`, `lockDays`, `ageRecipient`,
   `sourceHost` and `sourceDatabase`. Supabase shared session-pooler sources also
   require `sourceProjectRef`, the approved 20-character lowercase alphanumeric
   project reference. If a direct connection supplies it, the host must be exactly
   `db.<sourceProjectRef>.supabase.co`. Existing direct policies without this field
   remain supported. The recipient is public. Never put the `AGE-SECRET-KEY-...`
   identity here. A matching digest is a technical check, not evidence that
   Anthony approved a policy. The optional `allowCronJobRunDetailsDelete` field
   follows the exact staging restriction in step 1. Do not carry it into a
   production policy.

4. Configure `BACKUP_DATABASE_URL` with the exact approved host and database and
   port 5432, without query or fragment options. Direct connections use
   `justgo_backup`. Recognized Supabase shared session-pooler hosts
   (`aws-<number>-<region>.pooler.supabase.com`) require the exact login
   `justgo_backup.<sourceProjectRef>`. The connected database role must still be
   `justgo_backup` and pass the independent privilege checks. Provide the actual
   server CA as `BACKUP_DATABASE_CA_CERT`. Transaction pooler port 6543 is refused,
   because exported snapshots and dump coordination require direct or compatible
   session connections. Use the actual account's verified endpoint, not a guessed
   regional hostname. Supabase documents shared session pooling as an
   [IPv4 connection option](https://supabase.com/docs/guides/database/connecting-to-postgres).

   A read-only full hosted archive of `justgo`, `auth` and `drizzle` was encrypted
   directly through `age` and restored into an isolated local PostgreSQL 17
   database with ACLs preserved. The private session helper was reapplied, and its
   ownership and runtime-only access were verified. The disposable database,
   created roles and encrypted test archive were removed. This test proves archive
   compatibility. It does not prove writer-fenced reconciliation, provider session
   recovery or permission to reopen restored accounts. Those recovery gates remain
   open.

5. Prepare derived upload credentials locally, outside CI, with
   `node scripts/backups/mint-upload-credentials.mjs`. It needs the approved policy
   variables, `R2_PARENT_ACCESS_KEY_ID`, `R2_PARENT_SECRET_ACCESS_KEY`, an explicit
   `R2_UPLOAD_TTL_SECONDS` (1–168 hours) and `R2_CREDENTIAL_OUTPUT_FILE`. It refuses
   to run in CI and creates a new mode-0600 file instead of printing credentials.
   Transfer only its three `R2_UPLOAD_*` values into the protected environment
   secrets. Securely remove the temporary operator file. Rotate before day five,
   and test the actual permitted and denied actions. No parent key or private
   encryption identity belongs in GitHub, source, chat or logs.

   On October 31, an agent tool-output mistake exposed the original parent API
   token. Anthony approved replacing and revoking it. The old parent is revoked,
   and its derived uploader now returns HEAD 401. The replacement,
   `justgo-staging-backup-parent-rotation-2026-10-31`, kept the same bucket-only
   Object Read & Write parent scope and stayed local outside CI. It had the expiry
   `2026-11-05T17:00:00Z`. Its derived uploader permitted only PutObject and
   HeadObject on the two approved staging prefixes, with the expiry
   `2026-11-05T15:59:59Z` and the runner cutoff `2026-11-05T15:39:59Z`. The
   November 3 renewal replaced that uploader and the inspector, whose expiry was
   `2026-11-05T23:06:08Z`. The recovery key was not read or exposed and is
   unchanged.

   Scope verification passed with synthetic encrypted canaries only.
   [Receipts](#receipts) lists the final rotation and scope receipts. The two replacement canaries become
   eligible for expiry November 7, and asynchronous deletion remains unobserved.
   These synthetic scope checks do not establish operational database or ledger
   copies. [Receipts](#receipts) also lists the first supervised local copies and
   the November 2 actual main-workflow manual copies. [Backup clock](#backup-clock)
   records the scheduled copies that followed. Actual hosted-copy
   decryption passed November 1, while complete writer-fenced hosted recovery and
   email receipt remain open. The November 1 accepted provider assessment settles
   the earlier contractual-coverage gate. Anthony owns manual renewal. Parent
   revocation invalidates its derived uploader. When the parent expires, renewing
   the uploader alone is not enough. The November 3 renewal replaced the
   uploader and the inspector. [Credential dates](#credential-dates) records
   what is known about their expiry.

6. Create and verify one Sentry Cron monitor, `justgo-staging-backup-health`, with
   schedule `23 * * * *` in UTC, a check-in margin of 20 minutes, a maximum runtime
   of 20 minutes and the intended owner notification route. Configure
   `BACKUP_SENTRY_DSN`. Account inspection showed three trial days remaining,
   followed by the Developer plan with one Cron. No paid change is selected.

   The monitor exists in `justgo-api` and is assigned to Anthony. The matching
   `BACKUP_SENTRY_DSN` is stored in the protected environment. The November 2
   main-workflow ledger run supplied its first healthy check-in. A controlled
   fixed-shape error check-in created a Cron failure issue and fired the existing
   email rule. A separate operator recovery check-in resolved that test issue.
   This recovery check-in was not another backup. Anthony received the separate
   built-in test-notification email, which proves the basic route. The actual Cron
   short-lived error email was not received. A later real missed run produced the
   owner-confirmed backup email, and a verified manual copy resolved it.
   Timeout-specific behavior remains unverified. [Backup clock](#backup-clock)
   records the scheduled runs. The
   existing `JustGO API errors and recovery (email)` alert covers all issues in
   this project and notifies Anthony on new, resolved and regressed issues. No
   duplicate alert was created. An unused initial setup draft with slug
   `new-monitor` is disabled.

   Pass `GITHUB_TOKEN` with workflow permission `actions: read`. The ledger health
   check must verify trusted main-branch workflow evidence that both the actual
   database-copy job and its copy step succeeded for the required nightly slot. A
   green workflow that skipped that work is not enough. The check reports `ok`
   only after the ledger upload and this database-freshness check succeed. The
   nightly slot is 04:43 UTC, with an inclusive 40-minute deadline at 05:23. A
   missing database copy is normally caught when the 05:23 ledger run completes,
   plus any runtime, platform and notification delay. This timing is not an SLA.
   The Cron's missed-run behavior detects missing ledger jobs, including failures
   before check-in. Check-ins use the fixed shapes `in_progress`, `ok` and
   `error`, with no exception text, SQL, subjects or database URLs. Verify hosted
   check-ins and actual notification delivery. Configuration alone proves neither.

7. Anthony requested activation, and its configuration prerequisites passed on
   November 2. `JUSTGO_BACKUPS_ENABLED=approved` stayed set until the November 6
   pause. The manual database
   run [41500830932](https://github.com/anthonyyoo24/justgo/actions/runs/41500830932)
   passed before ledger run
   [41501504987](https://github.com/anthonyyoo24/justgo/actions/runs/41501504987).
   Both ran reviewed main `d66c42d`, executed the actual copy step and produced
   independently HEAD-verified encrypted R2 objects. The ledger run also verified
   recent success of the database-copy job and step, and it reported healthy Cron
   check-ins. Manual dispatch proves that the existing lane works. It does not
   prove that either scheduled event ran. The clock-dispatched runs that
   [Backup clock](#backup-clock) records show both running on time. Observe email
   receipt, missed-run behavior and actual asynchronous expiry.
   Keep their gates open until you have evidence. Do not shorten retention or
   monitoring grace to force a pass.

The GitHub runner installs `age` and PostgreSQL 17 clients with the existing PGDG
setup approach. Local `JUSTGO_PG_BIN` selects the PostgreSQL tools. A failed
dependency installation fails the job. An old local dump or ignored environment
file is never a CI prerequisite.

## Bounded source-fence preparation

`recovery-fence.mjs` prepares a bounded owned PG17 transaction. It is not a hosted
recovery command. It locks a reviewed inventory of ordinary tables and OIDs, and
it verifies the actual granted locks and transaction identity. It checks
compatibility before work, periodically and after target shutdown. Observed
drift stays fatal even if metadata later matches again. A lost connection,
cancellation, deadline or cleanup failure rejects acceptance. The receipt
describes only the finite checked interval and always keeps
`writersMayOpen: false`.

Current domain tables use SHARE. `auth.schema_migrations` uses ACCESS SHARE under
existing SELECT authority. Requiring SHARE on that registry too was an overstrict
implementation assumption. This approach requires a reviewed window that
prohibits manual DDL, Auth, config and registry changes. It also requires a
complete inspector of the catalog, private helper, ACLs, Auth version and public
keys. Registry inserts are not physically blocked, and endpoint hashes cannot
detect every change or reversal. Drift invalidates the run. Do not automatically
expand the inventory or regenerate evidence. The complete hosted inspector and
source transport, and the actual maintained fence, remain open.

The injected metadata-only inspector must use fresh reads, honor cancellation,
await all reads and issue no writes or transaction control. Work uses a separate
source reader and awaits subprocesses. Target shutdown is awaited once before
source locks are released, including on failure. `test:backup:recovery` includes
actual loopback PG17 conflict, blocked-write, post-lock freshness, registry-drift
and backend-loss controls before encrypted synthetic restoration. These checks
provide no authorization for hosted maintenance, protected-key use, restore or
reopening. See PostgreSQL's
[lock semantics](https://www.postgresql.org/docs/17/sql-lock.html) and
[transaction limits](https://www.postgresql.org/docs/17/runtime-config-client.html).

## Isolated local recovery

Before you propose a source maintenance window, complete the hosted source
inspector and transport and the isolated Auth and API acceptance target. The
bounded helper above uses SHARE on domain tables and ACCESS SHARE on the migration
registry. No new grant or provider contact is a prerequisite merely to SHARE-lock
that registry. A reviewed no-manual-change window and maintained domain locks
remain required. Existing-table locks do not prevent new relation creation or
physically pause provider migrations.

The repository's ordinary rehearsal uses synthetic Auth tables. Separately, a
matching v2.197.0 real Auth runtime with normal HTTPS validation passed session,
refresh, verifier, helper and deletion controls locally. [Receipts](#receipts) lists its
receipt. The production verifier requires an exact issuer that matches the Auth URL.
A rejection caused only by different signing keys or a different issuer does not
prove revocation. Complete the actual archive and the API and provider acceptance
with positive controls before reopening. The earlier exact-object decryption
approval authorizes no later key use, restore or opening of writers.

`scripts/backups/recovery-auth-acceptance.mjs` supplies the closed-target hooks
for that acceptance. It needs a pinned local Auth v2.197.0 service over HTTPS,
and it saves and then deletes one local completion and reflection through the
Node API. Install the session helper described below inside your own
`beforeReconcile`, after the restore, and then await the acceptance's
`beforeReconcile`. The helper needs the restored `auth.sessions`.
`scripts/backups/recovery-target-access.sql` reads object owners, ACLs, RLS flags,
RLS policies, and `justgo` trigger definitions, states and trigger function
definitions, so you can compare the source and the target. Run both captures with
an empty `search_path`, because the policy and trigger text depend on it. The
[rollout review](../checks/phase-15-rollout-review.md#coordinated-real-recovery-procedure)
holds the reviewed procedure. The complete coordinated run is still unverified.

With a separate authorized read-only recovery credential, download the selected
encrypted snapshot and the newest complete ledger. The upload token cannot GET or
list objects. Verify the object receipts and checksums. Use the owner-held key
only on the authorized recovery machine. The recovery tool does not fetch keys,
download hosted data, point an API at a restored database or open writers.

Create an empty, disposable loopback database with a unique name matching
`justgo_restore_<12 lowercase hex characters>`. The cluster must contain the
application roles that the preserved grants and policies require. Real Supabase
Auth also has managed roles, extensions, triggers and external provider
configuration. Inspect and prepare those actual dependencies under the reviewed
restore plan. Do not discard ACLs to make a restore appear successful.

The dump includes `justgo`, `auth` and `drizzle`, but not `justgo_auth_private`.
After you restore the managed schema, reapply the reviewed operator SQL
[`session-check-v1.sql`](../../apps/api/scripts/managed-auth/session-check-v1.sql)
as the isolated target's `postgres` operator. It recreates
`justgo_auth_private.is_live_session_v1(uuid,uuid)` with its fixed search path,
`postgres` ownership and restricted runtime usage and execute grants. It also
removes direct runtime access to `auth.sessions`. Keep this schema outside the
Data API's exposed schemas. Verify the actual helper and its ACL before managed
readiness or provider-session acceptance. Restoring the dump alone does not
restore this operator-managed capability.

Provide the following variables to `node scripts/backups/restore-local.mjs`:

- `JUSTGO_RESTORE_DATABASE_URL`: local `postgres` connection to that empty database.
- `RECOVERY_DATABASE_FILE` and `RECOVERY_LEDGER_FILE`: the encrypted `.age` files.
- `RECOVERY_OFFLINE_KEY_FILE`: path to the local protected identity file.
- `RECOVERY_EVIDENCE_FILE`: approved JSON evidence with `version: 1`,
  `approvalReference`, `source` (the exact receipt source identity),
  `databaseSha256`, `databaseCapturedAt`, `ledgerSha256`, `migrationDigest`,
  `writesFencedAt`, `currentLedgerConfirmedAt` and `invalidateAllSessions: true`.
- `JUSTGO_PG_BIN` and optional `AGE_BIN`: the installed local tools.

Direct receipts keep `<sourceHost>/<sourceDatabase>`. Shared session-pooler
receipts use `<sourceProjectRef>@<sourceHost>/<sourceDatabase>`, because the same
host and database pair serves multiple projects. Preserve that entire identity in
recovery evidence, and require the ledger to match it. Do not omit the project
reference or substitute a direct hostname for the recorded pooler hostname.

The evidence binds the two ciphertext files and the migration set. The ledger must
be at least as new as the backup, captured after the writer fence, and confirmed
current after capture. The operator must establish that fence for **all** app,
maintenance and Auth changes and maintain it throughout recovery. Entering
plausible timestamps is not proof. An older hourly ledger cannot authorize
reopening when later deletions may be missing.

The tool streams decryption into a transactional `pg_restore`, verifies the
current registered migration hashes and reconciles the ledger in one transaction.
It preserves subject and digest ownership, moves data epochs only forward, removes
covered activity and private versions, restores missing tombstones and revoked
proofs, reapplies Auth subject erasure, and invalidates restored sessions.
Conflicting ownership, incomplete ledgers, wrong checksums and unfamiliar
migrations fail closed. The tool deliberately does not guess how to migrate an
older backup. If the registered chain differs, a reviewed forward-migration step
is needed.

A successful result still reports `writersMayOpen: false` and
`providerAcceptanceRequired: true`. Complete the
[restore checklist](#restore-checklist), including actual isolated API and
provider checks, before you propose any separate operational cutover. After a
failed reconciliation, the target may contain the original snapshot. Keep it
isolated, and dispose of it under the approved recovery procedure.

## Restore checklist

Use this checklist for every restore, from an encrypted R2 copy or from a Supabase
provider backup. A restore must never bring back a deleted journal or revoked
access. An hourly ledger can miss deletions made after it, so recovery needs a
current, writer-fenced ledger that covers app and Auth changes. If you cannot
establish that ledger, keep writers closed. Anthony accepted this limit and the
recovery targets on October 29 and 31, as
[Recovery decision and remaining proposals](#recovery-decision-and-remaining-proposals)
records. Independent per-deletion recording is
[#119](https://github.com/anthonyyoo24/justgo/issues/119). R2 locks and lifecycle
rules and Supabase's own provider copies each carry separate deletion obligations.

### Before restoring

1. Fence all API, maintenance and Auth or provider writes, and hold the fence
   until recovery ends. Note the backup's timestamp, because ordinary writes made
   after it may be lost. Verify the ciphertext receipts and the full source
   identity, including a pooler receipt's project reference, before you use the
   owner-held recovery key.
2. With the migration role, save these rows to restricted operator storage, never
   the repository, logs or tickets:
   - Each `justgo.users` row with `deleted_at` set: `id`, `created_at`,
     `deleted_at` and `deletion_session_digest`.
   - Each `justgo.recovery_credentials` row with `revoked_at` set: `id`,
     `user_id`, `digest`, `kind` and `revoked_at`.
   - For managed accounts, every owner's current `data_epoch` and
     `data_deleted_at`, `deleted_completion_ids`, the `managed_auth_accounts`
     mappings, app-session revocations and `managed_auth_deletions` state. Include
     **Delete all my data** events on active accounts, not only deleted users.

   Save all of them, not only those after the timestamp. An older snapshot must
   never undo a later Auth, profile or activity deletion. If the current ledger
   is lost, do not reopen an older snapshot that may lack later deletions.

### Restore and reapply

3. Restore into an isolated environment, such as a new project or branch, never
   over the live database, and point no API at it. Prepare the managed Auth roles,
   extensions, grants and provider configuration without discarding ACLs. Then
   reapply `session-check-v1.sql` and verify the helper, as
   [Isolated local recovery](#isolated-local-recovery) describes.
4. Apply the current registered forward migrations to the isolated database. Then,
   in one reviewed migration-role transaction, reapply the saved deletions the way
   `apps/api/src/identity/delete-account.ts` does:
   - For each deleted account, delete its attempt patch receipts, attempts,
     journal versions, transfers, sessions and devices, and revoke its managed app
     sessions. Clear `analytics_restricted_at`, and set `deleted_at` and
     `deletion_session_digest` from the saved row. Insert the user row if the
     account is newer than the backup.
   - Revoke every saved credential. Insert missing rows, and set `revoked_at` on
     restored rows that are still active.
   - For active accounts, move deletion epochs forward only, reapply their
     deleted-ID tombstones, and remove the restored completions and journal
     versions those IDs cover. Keep pending Auth cleanup work.

   Make no provider network calls inside that transaction. If the target also
   restores Auth records, reapply hard Auth user deletion for every erased subject
   before traffic reopens. An old completed outbox marker does not prove that the
   restored Auth profile is absent. Follow
   [Pending Auth erasure operations](ACCOUNT_SYNC_SETUP.md#pending-auth-erasure-operations)
   under the restore plan, and do not trust recovered access tokens.

### Before reopening the app

5. Set `TimeZone` to UTC in both sessions before you compare text fingerprints
   between databases, because each session formats timestamps in its own time
   zone. In the restored database, confirm that every saved account has
   `deleted_at` set, `analytics_restricted_at` cleared, and no attempts, receipts,
   transfers, sessions or devices. Confirm that every saved digest exists with
   `revoked_at` set. The counts must match the saved ledger.
6. Through an API restricted to the isolated environment, confirm that:
   - Deleted disposable accounts' old recovery proofs fail, and their journal data
     is absent.
   - Managed JWTs and app sessions of deleted or revoked owners fail, and erased
     Auth profiles are absent.
   - Active accounts keep their epochs, and stale completion and private-version
     uploads fail. A confirmed explicit import is the only flow that may restore
     deleted record IDs, and only at the current epoch.

   After these checks pass, point the normal API at the restored database and
   reopen writes. In that order, no public recovery window opens during
   verification.

## Local verification and remaining evidence

Run the focused tooling regressions:

```sh
node --test scripts/backups/backups.test.mjs scripts/backups/recovery-auth-acceptance.test.mjs
```

To run the complete synthetic encrypted recovery rehearsal, first prepare the
existing isolated PostgreSQL environment, including PostgreSQL 17 client tools,
`age` and the loopback `JUSTGO_TEST_ADMIN_DATABASE_URL`
([local test database](../../README.md#start-locally)). Then run:

```sh
pnpm run test:backup:recovery
```

`apps/api/tests/db/recovery-rehearsal.integration.test.ts` runs the same
rehearsal after a killed run's leftovers, so it needs the same tools. CI runs it
in the database job, and `pnpm run test:db` leaves it out.

The rehearsal validates the loopback `justgo_test` administrator and runtime
credentials before it creates two run-owned disposable databases and a temporary
backup reader. It marks each database it creates with the comment
`justgo recovery rehearsal`, because a manual restore uses the same name pattern.
Before setup it takes a session advisory lock on the administrator connection and
refuses to start while another rehearsal holds it. A killed run's lock ends with
its session, so the rehearsal then drops the `justgo_backup` role and the marked
`justgo_restore_*` databases that the killed run left. It never drops an unmarked
database. It applies the current
migration registry, seeds synthetic app and Auth state, and verifies rejection of
an extra MAINTAIN grant and inherited ownership. It then takes a real encrypted
`pg_dump`, makes later account and data deletions and revocations, captures the
encrypted ledger and restores into the second database with the archive's object
owners. Before the ledger replay, it checks those owners and the runtime grants,
and it confirms that the restored database holds the synthetic writing that the
replay must delete. It also requires the same `recovery-target-access.sql`
output from the source and the target, and checks that a weakened policy, a
policy granted to PUBLIC, an extra grant, and a dropped, disabled, `when (false)`,
`before update` or `after insert` replacement of the `data_epoch_never_decreases`
trigger each change that output. So does a no-op body for its function. A failing
hook must not leak its message to the console or the rejected error. Actual
`IdentityService`
calls reject old recovery and session proofs. SQL assertions check missing private
history and Auth subjects, epochs and tombstones, and repeat replay. Cleanup
removes its databases, role, temporary key and ciphertext without touching
ordinary test database rows.

This rehearsal passed locally with PostgreSQL 17 and `age` 1.3.2. It establishes
actual local encryption, decryption, dump and restore, and application deletion
behavior. The small synthetic Auth tables do **not** establish recovery of the
real hosted Auth schema, session-provider behavior, role and extension
dependencies, actual hosted recovery-copy decryption, R2 expiry, scheduled
availability or an operational RTO. Those gates remain open. Hourly ledgers also
leave the post-copy gap, which is now accepted as a small-beta recovery limit with
independent recording explicitly deferred. Local tests do not replace the
reassessment before paid launch or beta expansion, and they do not establish the
deferred design.

## Receipts

These ignored receipt files sit under `.local/phase15-cloudflare/rollout/` on the
Mac that ran the October and November 2026 setup. Git does not keep them.

- First supervised copies, November 1, 2026, from `d66c42d`:
  `recovery-2026-11-01/copy-receipts.json` and `download-receipts.json`. Separate
  read-only retrieval returned identical ciphertext checksums. The authenticated
  decryption of both copies is in `recovery-2026-11-01/decryption-receipt.json`.
- First main-workflow copies, November 2, 2026, on `d66c42d`: database run
  [41500830932](https://github.com/anthonyyoo24/justgo/actions/runs/41500830932)
  and ledger run
  [41501504987](https://github.com/anthonyyoo24/justgo/actions/runs/41501504987).
  Independent HEAD checks matched 197,941 database bytes and 31,519 ledger bytes.
- Retention readback and lock enforcement: `r2-retention-verified.json` and
  `r2-retention-enforcement.json`.
- The October 31 credential rotation: `credential-rotation/rotation-complete.json`.
  The replacement uploader's scope checks:
  `iphone-readiness/rotated-uploader-scope-2026-10-31.json`.
- The read-only hosted archive restored into isolated PostgreSQL 17:
  `hosted-archive-compatibility-verified.json`.
- The real Supabase Auth v2.197.0 loopback rehearsal:
  `phone-google-2026-11-01/real-auth-service-rehearsal.json`.
