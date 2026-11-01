# Foundation: setup, versions and operations

> Current setup and operations guide, established in Phase 01. See [IDENTITY.md](../architecture/IDENTITY.md) and [ACCOUNT_SYNC_SETUP.md](ACCOUNT_SYNC_SETUP.md) for optional accounts, internal legacy migration and provider/grant prerequisites. [Phase handoffs](../handoffs/README.md) record historical verification and remaining acceptance gates.

Established September 17, 2026. Start with the [README](../../README.md). The Phase 01 preview did not include account/session endpoints or permanent client credential storage; Phase 02 adds those capabilities. Phase 07 now implements challenge/completion/reflection/Progress saving and synchronization; purchases and verified production coverage remain Phase 16.

Phase 13's revised local candidate adds durable guest collections, optional managed
Apple/Google accounts, signed-in history/private-journal sync and a separate
opt-in private CloudKit copy. It does not change hosted services or installed
clients until separately approved coordinated rollout. The old public private
PATCH and key/code account UI remain retired in managed mode.

## Compatible version set

Direct dependencies use exact pins or Expo SDK-compatible patch ranges; `package-lock.json` fixes resolved versions. Use root `npm ci`, not separate workspace installs. Its prepare step builds the contracts package to JavaScript for Node; Metro uses its React Native source export. Re-run `npm run build:contracts` after editing contracts during API development.

| Component                        | Pinned version / constraint                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Node / npm                       | 24.18.0 LTS / 11.16.0; Vercel runtime 24.x                                                                           |
| TypeScript                       | 6.0.3, strict plus unchecked-index and exact-optional checks                                                         |
| Expo / React Native / React      | 58.0.20 / 0.88.0 / 19.3.0                                                                                            |
| Expo Router / development client | 58.0.27 / 58.0.16                                                                                                    |
| Reanimated / Worklets            | 4.7.1 / 0.13.0; New Architecture required                                                                            |
| Bottom sheet / Gesture Handler   | 5.2.14 / 3.3.0                                                                                                       |
| Safe area / Screens / SVG        | 5.10.1 / 4.30.0 / 15.16.0                                                                                            |
| Activity storage / state         | SQLite 58.0.14 private journal; AsyncStorage 2.2.0 completion/cache state; Zustand 5.0.15                            |
| Optional accounts                | Supabase JS 2.118.0 Auth; Expo Apple Authentication, SecureStore and original Google Sign-In                         |
| Connectivity / saving feedback   | NetInfo 12.0.1 / Sonner Native 0.27.0 / Sonner 2.0.8 web adapter                                                     |
| React Native Web                 | 0.21.4; development/browser verification only                                                                        |
| iOS                              | 16.4 minimum, Hermes; original iPhone 17 / iOS 26.4 smoke, retained Phase 07 QA device on iOS 26.5                   |
| Hono / Drizzle / pg              | 4.13.14 / 0.45.4 (kit 0.31.11) / 8.23.1                                                                              |
| PostgreSQL                       | 17 locally and in CI; Supabase staging 17.6                                                                          |
| Tests                            | Vitest / coverage-v8 5.0.5; Jest 30.5.2, jest-expo 58.0.12, React Native Testing Library 14.1.0, test-renderer 1.3.0 |

React/React DOM and `test-renderer` have root overrides to preserve one compatible
runtime and renderer across Expo, Router and Testing Library. The SDK 58 lockfile
also hoists Expo Router/core/linking/Metro runtime so CLI route generation and Jest
resolve the same versions after root `npm ci`; do not add test-only resolution
aliases or duplicate native runtime dependencies. Expo Doctor validates the installed
native set. Recheck the [Expo 58 reference](https://docs.expo.dev/versions/v58.0.0/)
and [Reanimated compatibility table](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/)
as a set when upgrading. Do not update Worklets independently.

SDK 58 adds iOS scene lifecycle integration and requires a new development binary;
SDK 57 clients cannot load this JavaScript runtime. The signed upgrade build and
remaining device/release gates are recorded in the
[native-upgrade handoff](../handoffs/phase-14-native-upgrade.md). The iOS minimum
remains 16.4. File export/import now awaits SDK 58's asynchronous write/read APIs
before sharing, checking ownership or closing the file handle.

The October 27 patch alignment updates Expo to 58.0.20, development client to
58.0.16, File System to 58.0.12 and Router to 58.0.27. The lock also resolves
modules-core 58.0.27 and JSI 58.0.20, including native shared-object/event changes.
Sentry remains 8.28.0 with the same privacy plugin. These packages require a new
signed binary; the installed build's earlier device evidence does not establish
acceptance of this patched runtime. Preserve the owner-deferred phone checks
and separate build/deployment permissions.

The October 27 dependency audit passes the 87-entry API production graph with
zero advisories. The root graph retains seven findings (three high, four moderate)
in Expo CLI/Zod 3 and Drizzle development-tool dependencies; the patch lock now
resolves node-forge 1.4.2. Preserve SDK 58 and the current Drizzle boundary while
tracking compatible repairs before public release. Green application checks do
not close the remaining tooling-advisory or native/device gates.

Android is excluded from app platforms and has no package identifier, EAS profile, signing or test evidence. Shared dependencies do not establish Android support. When scheduled, select the SDK's Android minimum/target/compile levels, JDK/Gradle, New Architecture and recovery adapter together, and recheck current Play requirements. Do not infer an Android release promise from the Expo template.

## Environments and secrets

| Variable                                                           | Where / purpose                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `EXPO_PUBLIC_API_URL`                                              | Mobile `.env` or EAS environment; public HTTPS staging URL, loopback/LAN locally                                                           |
| `IOS_BUNDLE_IDENTIFIER`                                            | Confirmed identifier required by device/distribution EAS builds; the simulator profile explicitly uses provisional `dev.justgo.foundation` |
| `DATABASE_URL`                                                     | API `.env` / Vercel preview Secret; restricted `justgo_runtime` only                                                                       |
| `MIGRATION_DATABASE_URL`                                           | Operator's local/CI migration environment only; `justgo_migrator`; never Vercel/mobile                                                     |
| `DATABASE_CA_CERT`                                                 | API/migration environment; Supabase root certificate PEM, with verification enabled                                                        |
| `DATABASE_SSL`                                                     | `verify-full` remotely; `disable` accepted only for loopback test databases                                                                |
| `DATABASE_POOL_MAX`                                                | API; default 1, validated range 1–5                                                                                                        |
| `CORS_ORIGINS`                                                     | Explicit comma-separated browser origins; staging allows localhost:8081 for development                                                    |
| `MANAGED_AUTH_ENABLED`                                             | API only; default false until providers, private session helper, deletion secret and coordinated client rollout are ready                  |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`                         | API Auth verifier configuration; matching project origin/public key                                                                        |
| `SUPABASE_AUTH_SECRET_KEY`                                         | Server-only hard Auth deletion capability; never mobile/public env or database credentials                                                 |
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public mobile Auth configuration; no admin secret                                                                                          |
| `PORT`, `LOG_LEVEL`, `NODE_ENV`                                    | API process; 3000 / info / development defaults; production requires a database URL                                                        |

Expo project ID `53cf0560-8ab5-446a-9bc6-deb193b337b5`, owner `anthonyyoos-team`, slug `justgo` are public metadata committed in `apps/mobile/app.config.ts`. Anthony created the project; `eas init --id … --non-interactive` and `eas project:info` verified the existing link. Authenticate through `npx eas-cli@latest login`; no duplicate project is needed. Apple enrollment, permanent bundle ID and physical signing remain owner work in [APPLE_SETUP.md](APPLE_SETUP.md).

Local/staging credential files, `.env*`, `.local`, `.vercel` and generated native projects are ignored. Environment examples contain placeholders. `.vercelignore` is an explicit upload allowlist: deploy API sources, contracts and workspace package metadata only. Before deployment, inspect `npx vercel@latest deploy --dry --json`; never upload local database files, role credentials, generated iOS/Pods, design sources or mobile environment files. Keep original provisioning credentials in the owner's secret manager; ignored local copies are not disaster recovery.

## Database roles, migrations and ownership

Staging: dedicated **JustGo**, project ref `kmcpcauaxlgpevkkenwd`, Canada Central, organization **anthonyyoo corp**. Creation was owner-approved after the provider quoted $0/month. That quote is not a future budget guarantee. Production is not provisioned.

1. As an administrator, review and apply `apps/api/scripts/provision.sql` once. It creates `justgo_migrator` and `justgo_runtime`, private `justgo` and `drizzle` schemas, permissions and connection/time limits. Set random independent login passwords through a secure administrative channel. Do not put passwords in migrations.
2. Set the migration connection to direct PostgreSQL or the **session** pooler on 5432, using the migration role. Staging uses `aws-0-ca-central-1.pooler.supabase.com`, username `justgo_migrator.<project-ref>`. Supply the project's trusted CA and keep certificate/hostname verification enabled.
3. Review generated SQL and journal together. `npm run db:generate -w @justgo/api -- --name feature_name` generates later domain changes; custom migrations use Drizzle Kit's `--custom` option. `npm run db:migrate` verifies the effective migration role before applying the journal to schema `drizzle`.
4. The existing Vercel runtime uses the **transaction** pooler on 6543, username `justgo_runtime.<project-ref>`, with the separate password. The Cloudflare candidate uses Hyperdrive plus direct TLS for advisory-lock transactions, as described in [server releases](SERVER_RELEASES.md). Never use an administrator/migration database role for application queries. Managed Auth's isolated server-only admin SDK holds a deletion-capable secret, separate from the restricted database connection. Mobile calls Supabase Auth for provider sessions and the API for application data; it never connects directly to private PostgreSQL tables.

Managed mode additionally needs the versioned postgres-operator private
session-check helper in [account setup](ACCOUNT_SYNC_SETUP.md#live-auth-session-privileges).
Hosted Supabase cannot grant custom runtime roles direct Auth-schema access.
Only runtime may execute this boolean helper; it has no direct Auth-table access,
Auth writes or public application grants. Readiness checks its body, ownership,
configuration and effective privileges alongside the managed application schema.

Migration failures report only the registered SQL filename (when attributable)
and a validated SQLSTATE, without SQL, parameters or raw driver messages. The
runner preserves Drizzle's single transaction for all pending files, original
SQL/hashes and journal checkpoints; transaction-control/setup failures do not
invent a failing filename.

Staging administrative provisioning is recorded as Supabase migration `foundation_roles`. Application migration `0000_foundation.sql` was applied through Drizzle with its own journal; it creates only `justgo.current_user_id()`. Keep these responsibilities separate. Do not reapply the function SQL through a second migration runner.

The runtime role owns no schema/table, cannot bypass RLS, create roles/databases/tables, or assume the migrator. Future owner-scoped tables must enable **and force** RLS, have `USING` and `WITH CHECK` policies for `justgo_runtime`, grant only required operations, and index `user_id` alongside access-path indexes. Example policy predicate: `user_id = (select justgo.current_user_id())`. Add constraints and indexes with the consuming feature, not a speculative full schema.

The Phase 01 helper `withOwner(db, verifiedUserId, tx => …)` establishes transaction-local ownership after the caller verifies identity. For authenticated feature operations, use `IdentityService.withSession(token, callback)` as described in [IDENTITY.md](../architecture/IDENTITY.md); it verifies the active account/device/session before supplying the owner transaction. It sets `app.user_id` with transaction-local `set_config(..., true)` and executes work on that same connection. Never derive ownership from an untrusted request field, use session-level `SET`, or issue the feature query outside `tx`. A connection without ownership sees no owner data. RLS is defense in depth; it does not replace API authentication/authorization, which Phase 02 implements.

`pg` reuses one pool per warm server instance, max 1 by default, with 5-second connect/statement and 6-second query limits. There are no named prepared statements. Runtime role connection limit is 20. Transaction pooling and those caps bound individual processes; they do not establish a traffic capacity or global Vercel instance limit. Load tests, capacity alerts and budget policy are later operational work. Certificate verification must not be disabled to fix pooler TLS errors; use the dashboard connection host and the Supabase CA.

Local integration tests use a dedicated loopback-only PostgreSQL 17 cluster on 54329. They create a uniquely named fixture table as migrator, execute isolation checks as the actual runtime role, and drop that fixture. The local application catalog seed and synthetic accounts/history are disposable; no customer data belongs in this cluster. Never reset a shared environment to run tests. Use forward-repair migrations; restore and destructive rollback procedures require reviewed backups before domain data exists.

## Backup restore checklist

Use this for a restore from an encrypted R2 recovery copy or a provider backup.
The October 28 decision selects nightly application/Auth dumps and hourly ledger
copies in R2 while retaining Supabase Free. Pro is no longer the selected backup
prerequisite. [Cloudflare backups](CLOUDFLARE_BACKUPS.md) owns tooling, recorded
retention/key decisions and the guarded local restore. Actual hosted restore and
copy-expiry evidence remain open; synthetic regression success does not establish
operational recovery.

Never restore deleted journals or revoked access. An hourly ledger can be missing
later deletions. Recovery requires a current writer-fenced ledger covering app and
Auth mutations; if that record cannot be established, keep writers closed. R2
locks/lifecycle and Supabase provider copies have separate deletion obligations.
Total source loss after the last ledger copy can leave recovery closed
indefinitely. The [October 29 decision](../DECISIONS.md#october-29-small-beta-recovery-limit)
accepts this limit for the small beta; reassess independent per-deletion/revocation
recording before paid launch or beta expansion, whichever comes first.
The [October 31 recovery targets](../DECISIONS.md#october-31-recovery-targets)
accept up to 24 hours of ordinary-write loss and a four-hour operator recovery
target when safe recovery is possible. That target does not cover the ledger gap
or permit resurrecting deleted data.

The [October 31 custody decision](../DECISIONS.md#october-31-local-recovery-key-custody-and-coordinated-cutover)
accepts protected local Mac key custody outside CI without an off-Mac retrieval
prerequisite. The backup guide retains the seven-day upload-token renewal
requirement; scheduled jobs are not proof of unattended renewal or actual
recovery-copy decryption. A protected local key and synthetic round trip do not
establish actual hosted recovery-copy decryption or complete app/Auth recovery.

Before restoring:

1. Fence all API, maintenance and Auth/provider mutations and keep that fence throughout recovery. Note the backup's timestamp; ordinary writes made after it may be lost. Verify the ciphertext receipts and approved source identity before using the owner-held recovery key. Supabase shared session-pooler receipts include `<sourceProjectRef>@<sourceHost>/<sourceDatabase>`; retain the project reference when matching the ledger and recovery evidence. Direct receipts retain `<sourceHost>/<sourceDatabase>`.
2. With the migration role, save the deletions made since the backup to restricted operator storage, never the repository, logs or tickets: every `justgo.users` row with `deleted_at` set (`id`, `created_at`, `deleted_at`, `deletion_session_digest`) and every `justgo.recovery_credentials` row with `revoked_at` set (`id`, `user_id`, `digest`, `kind`, `revoked_at`). Taking all of them, not only those after the timestamp, is simplest and safe.
   For the managed candidate, also retain all owners' current `data_epoch` /
   `data_deleted_at`, `deleted_completion_ids`, immutable `managed_auth_accounts`
   mappings, app-session revocations and `managed_auth_deletions` state. This
   includes Delete all my data events on active accounts, not only deleted users.
   Preserve mapping/receipt consistency and provider subject tombstones; an older
   app-data snapshot must never undo a later Auth/profile or activity deletion.
   If the current ledger cannot be recovered after a disaster, do not reopen an
   older snapshot that may lack later deletions/revocations. The Phase 15 backup
   guide records this accepted beta limit and the future independent-record
   follow-up; scheduled copies alone do not establish a current ledger.

Restore and reapply:

3. Restore into an isolated environment (a new project or branch), never over the live database, with no API pointed at it.
   Prepare the actual managed Auth roles, extensions, grants and provider
   configuration without discarding ACLs. R2 dumps exclude `justgo_auth_private`:
   after restoring the managed schema, reapply the reviewed
   [`session-check-v1.sql`](../../apps/api/scripts/managed-auth/session-check-v1.sql)
   as the isolated target's `postgres` operator. Verify the private live-session
   helper's ownership and restricted runtime usage/execute ACL, keep its schema
   outside the Data API's exposed schemas, and preserve the ban on direct runtime
   reads of `auth.sessions` before managed readiness/provider checks.
4. Apply the current registered forward migrations to the isolated database before reconciliation. In one reviewed migration-role transaction, apply the saved deletions again, exactly as `apps/api/src/identity/delete-account.ts` does. For each deleted account, delete its attempt patch receipts, attempts, transfers, sessions and devices, clear `analytics_restricted_at`, and set `deleted_at` and `deletion_session_digest` from the saved row; insert the user row if the account is newer than the backup. Then make every saved credential revoked: insert missing rows and set `revoked_at` on restored rows that are still active.
   Include journal versions and managed app-session revocation. Reapply active
   accounts' deletion epochs monotonically and their deleted-ID tombstones, remove
   restored completion/journal versions covered by those IDs, and preserve pending
   Auth cleanup work. Do not replay provider network calls inside that transaction.
   If the restored target also restores Auth records, separately reapply hard Auth
   user deletion for every erased subject before reopening traffic; an old completed
   outbox marker cannot prove the restored Auth profile is still absent. Review
   the target project/secret and [cleanup procedure](ACCOUNT_SYNC_SETUP.md#pending-auth-erasure-operations)
   under the operator restore plan rather than trusting recovered access tokens.

Before reopening the app:

5. Confirm in the restored database that every saved account has `deleted_at` set, `analytics_restricted_at` cleared and no attempts, receipts, transfers, sessions or devices, and that every saved digest exists with `revoked_at` set. Counts must match the saved ledger.
6. Using an API restricted to the isolated environment, confirm that deleted disposable accounts' old recovery proofs are rejected and their journal data is absent. Only after these checks pass may the operator point the normal API at the restored database and reopen writes. This prevents a public recovery window during verification.
   Also prove managed JWT/app-session rejection for deleted/revoked owners, absence
   of erased Auth profiles, preserved active-account epochs and rejection of stale
   completion/private-version uploads. A confirmed explicit import is the only
   flow that may intentionally restore deleted record IDs at the current epoch.

## API deployment and diagnostics

Local entrypoints are `apps/api/src/server.ts` for Node and `apps/api/src/worker.ts`
for Workers. Both use the injected Hono app and runtime composition. The current
deployed Vercel service is still the historical build-5 staging API; no Cloudflare
rollout is implied by local source changes. Its config/credentials are retained
until approved retirement, and new releases use the protected Workers candidate
lane in [SERVER_RELEASES.md](SERVER_RELEASES.md). The
[cutover guide](CLOUDFLARE_CUTOVER.md) owns account approval, placement/CPU/latency,
mobile URLs, monitor switch and old-build retirement. Do not redeploy the old
Fastify preset with the new Hono source.

| Route         | Contract                                                      | Failure                                              |
| ------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| `GET /health` | 200 `{ "status": "ok", "service": "justgo-api" }`             | Process/platform failures only; not a database check |
| `GET /ready`  | 200 `{ "status": "ready" }` after database/role/context check | 503 `{ "status": "unavailable" }`                    |

Responses use `no-store`, security headers and server-generated request IDs. The Phase 01 connection probe validated both endpoints with an 8-second deadline. The current identity UI uses the authenticated API and its 10-second request deadline; see [IDENTITY.md](../architecture/IDENTITY.md). Readiness never returns credentials, SQL, database host or role details. Logging uses allowlisted request/response/error fields; URLs, headers, bodies and raw error messages are omitted. Identity and private reflection records now exist; diagnostics must exclude both secrets and journal contents.

The current entry flow uses ordinary Terms/Privacy links and Continue without
legal-view/agreement receipts. Build 5 and its deployed API have approved essential-error delivery;
product analytics remains disabled. Signed-in journal text now reaches the
dedicated API journal resource. The authorized staging rollout is configured for
owner testing; public distribution still requires reopened provider, retention and
privacy review. Managed `/ready` checks the private live-session capability and
application schema. Actual provider login/hard deletion requires separate staged
proof with disposable accounts.

## Beta operating controls

October 25 staging maintenance is active on the existing Supabase project. The
operator migration `enable_beta_identity_retention` enables `pg_cron`; job
`justgo-identity-retention` runs hourly at minute 17. Its connection uses the
existing `postgres` scheduler login, then executes `SET LOCAL ROLE
justgo_migrator` inside a transaction before calling
`justgo.purge_expired_identity_records(1000)`, with a five-second statement limit.
No new login secret, schema grant or definer function was introduced. A temporary
minute cadence established a successful scheduled execution before switching to
hourly; the separate initial bounded call returned zero rate buckets and zero
transfers. The existing function removes only buckets older than 30 days and
unredeemed transfers expired more than 24 hours; it preserves journals, users,
deletion/revocation records and redeemed transfers. Disable by job name through
`cron.alter_job`, not direct updates to cron tables. Security advisors report no
new finding; the pre-existing leaked-password-protection warning remains, while
the app uses Apple/Google sign-in. The October 26 audit found 34 successful
scheduled executions in the preceding 48 hours; this supplements the initial
execution proof without changing the function's deletion scope.

The API has independent per-account write/export budgets, with source defaults
of 600 new-write batches and 3,000 page reads per ten minutes through
`ACTIVITY_WRITE_RATE_LIMIT` and `ACCOUNT_EXPORT_RATE_LIMIT`. The read allowance
covers two full enumerations of the client's 50,000 combined completion/version
record limit (up to 1,001 pages each at the default page size), as needed around
an import, plus bounded read/retry headroom. Explicit lower operator overrides
can interrupt large-history synchronization and should be measured deliberately.
Completion, journal and restore batches share
the write budget; accepted identical retries remain available. Limits reuse
durable HMAC buckets inside the existing owner transaction, including pool size
one. Failed batches roll back counters and deletion remains reachable. The
October 26 audit verified source `f91db327` deployed to application staging as
`dpl_EzhBCSPwxficKtW4z6wtvv8n8gfq`, with the 600/3,000 defaults. Historical
implementation evidence is recorded on
[PR #49](https://github.com/anthonyyoo24/justgo/pull/49); tune limits from measured
beta traffic.

Sentry uptime monitor [10773615](https://anthony-corp.sentry.io/monitors/10773615/)
checks only the public staging `/ready` over HTTPS, without account credentials,
at one-minute intervals with a five-second timeout. Three consecutive failures
open an issue; one success resolves it. Assertions require a successful HTTP
status and JSON `status: ready`. The API and mobile projects have explicit owner
email rules for new issues, regressions and recovery. Anthony confirmed receipt
of the Sentry test notification on October 27. A controlled assertion-failure
rehearsal then opened [JUSTGO-API-3](https://anthony-corp.sentry.io/issues/7815386993/)
and resolved it after the normal `status: ready` assertion was restored. The API
stayed available; the alert rule recorded two triggers, and Anthony confirmed both
incident/recovery emails arrived. This proves the monitor's
failure/recovery path, not actual API downtime or an uptime SLA.
The monitor fits the included single-monitor allowance; no paid upgrade was made.

The merged `.github/workflows/staging-health.yml` removes its unreliable cron
and retains a manual readiness diagnostic/test-notification input.
GitHub remains the destination for build/test failures;
actual GitHub failure-email receipt remains unverified. The historical October 26
cron audit found gaps of up to 6.11 hours and is not a five-minute detection proof.

The API response hook records each completed 5xx response exactly once, including
direct replies: random request ID, status, `HTTP_SERVER_ERROR` classification
and optional validated PostgreSQL SQLSTATE. The new optional Sentry reporter
reconstructs only those fields with release/environment metadata, bounds delivery
and backs off on provider failures. It never forwards an exception, request body,
URL or account context. The reporter is deployed by successful GitHub run
`40585928393` from `311f073`; exact-source public readiness/authentication probes
passed. Sentry account configuration, DPA and
email test are verified. The owner-approved October 27 Privacy Policy is published
and anonymous public bytes match the reviewed source; Terms remain unchanged.
A synthetic report from the local reporter reached Sentry and its status, release
and redacted IP were verified; this was not a hosted API request. Deployed API
error delivery remains open.

[Server releases](SERVER_RELEASES.md) documents the merged manual, owner-approved
GitHub lane, reviewed source/CI checks, fixed Vercel target, candidate probes and
restricted migrator. The protected `justgo-staging` environment and its four
deployment credentials are configured. The
project-only Vercel token passed fixed-project REST reads; isolated CLI/team-cache
bootstrap and candidate probe behavior are verified without an owner login. The
code-only hosted release succeeded; no migrations were pending or written. The
pending-migration path remains unverified and requires current recovery evidence;
an old dump cannot satisfy that gate. TestFlight 0.1.0 (5) enables app reporting
and has matching uploaded symbols; build 4 remains reporting-off. See the
[current release handoff](../handoffs/phase-14-release.md) for exact receipts and
the owner-skipped native crash test.

Before external testers, retain the open deployed 5xx-to-Sentry delivery,
native diagnostics, supported private-journal processing and current
backup/recovery-copy deletion gates. The monitor assertion-failure/recovery email
rehearsal above passed; it did not take the API down. The October 21 operator snapshot
predates five current managed-Auth/journal/deletion tables and excludes the
`auth` schema. Its historical restore proof does not establish restoration of the
current schema, and earlier cutover dumps are not an unattended backup service.
There is no current full-restore, off-Mac storage or independently recoverable
deletion/epoch/Auth-ledger evidence. Storage, retention and recovery still need an
actual arrangement; local database regression tests do not establish hosted
disaster recovery. The October 27 [operating decision](../DECISIONS.md#october-27-hosting-backups-and-simulator-test-direction)
chose Vercel and Supabase; the October 28 [Cloudflare decision](../DECISIONS.md#october-28-cloudflare-workers-hono-and-r2-backups)
supersedes its hosting and backup parts. Phase 15 moves the API to Cloudflare
Workers and replaces the planned Supabase Pro upgrade with encrypted nightly R2
backups and an hourly ledger copy; the database stays on Supabase Free until an
upgrade trigger. This choice does not close the processing/recovery gates. No paid
upgrade or provider contact is authorized. The later October 27 error-alert and
release instruction authorizes that implementation separately; it does not close
the recovery or private-journal processing gates.

## Design and tests

The separate [JustGO Dev workflow](DEVELOPMENT_BUILDS.md) owns the current
side-by-side physical-phone setup and `npm run dev:mobile` launcher. Its separate
provider/signing configuration is recorded in that guide; the first GitHub-built
installation awaits owner review/merge. Historical same-identifier binaries below
are not that app.

The [design guide](../design/DESIGN.md), `design/source/` and asset README record Paper provenance, editable-source measurements and raster-only uncertainty. `apps/mobile/src/theme/tokens.ts` is the code authority. Inter font weights are bundled from their licensed package; Baskerville remains the iOS system font. The foundation preview uses an exported illustration and accessible type/button sizes; it is not an approved onboarding or Home screen.

Choose checks using the [testing scope matrix](TESTING.md#choosing-checks). Routine fixes use focused behavior/consumer checks; actual phase closeout and publication retain the full required gates. Backend/shared protocol or data-boundary changes retain the dedicated loopback database checks. File moves follow the [move and bundle policy](TESTING.md#file-moves-and-bundle-checks), rather than requiring both exports for every edit. CI enforces the required gates with PostgreSQL 17.

Native compilation runs on EAS using `development-simulator`, per the owner’s 8 GB memory constraint. Keep Simulator and local preview servers stopped during cloud compilation; launch only one simulator afterwards and reuse its binary for JS/UI changes. Preserve local Pods/DerivedData caches. Explain any EAS account/quota/configuration blocker before considering a heavy local fallback.

The EAS `development-simulator` build `2c73c1af-3d5d-4216-8f25-875c72691973` completed on September 17, 2026. Its downloaded binary passed native startup and the connection check on one iPhone 17 / iOS 26.4 simulator. The artifact remains at `.local/JustGO-eas-simulator.tar.gz`, with the extracted app at `.local/eas-simulator/JustGO.app`. Start Metro from `apps/mobile` using `NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --dev-client --localhost --max-workers 1`; the IPv4 option avoids a localhost/127.0.0.1 binding mismatch. Reuse this binary until a native dependency/configuration changes.

The Phase 02 binary and its native checks remain historical in [its handoff](../handoffs/phase-02-identity.md). The October 6 EAS simulator build and retained QA device are recorded in the [07.3 simulator setup](../handoffs/phase-07-3-local-flow.md#october-6-simulator-reuse-and-owner-test-setup); that existing binary contains AsyncStorage/NetInfo. The earlier Phase 13 physical build added SQLite/document picker. Revised optional accounts/iCloud additionally require a separately authorized compatible binary with Apple/Google, SecureStore and the CloudKit module/capabilities. JavaScript exports cannot add those modules; see [Apple setup](APPLE_SETUP.md).

The native launch harness is `apps/mobile/e2e/launch.yaml`; run it with Maestro only after installing/launching a development build and starting Metro/API. Browser verification covers the affected states and interactions, including relevant loading/disabled, success, offline failure/retry, keyboard and narrow-screen behavior. At phase closeout/release, cover the full applicable acceptance matrix. Native verification is separately recorded in the handoff; a web export proves no Keychain, purchase or device recovery behavior.

The Phase 01 `npm audit` recorded 18 moderate dependency advisories, with no high/critical findings at the recorded installation. They include transitive Expo tooling and Drizzle Kit dependencies. Review compatible upstream fixes before release; do not apply a forced Expo downgrade to silence the audit.

## Phase 07 coordinated cutover and old clients

This section records the earlier resource-protocol cutover. Phase 13's separate
[local-journal rollout](LOCAL_JOURNAL_ROLLOUT.md) owns migration 0019, private-write
retirement and its approved old-server-private reset. The revised
[account/sync setup](ACCOUNT_SYNC_SETUP.md) owns managed Auth mappings, authenticated
legacy linking and new private sync. The following Phase 07 PATCH/recovery sequence
is historical, not authorization to re-enable those retired product options.

This runbook prepares Phase 14 staging/release integration; Phase 07.5 local implementation does not deploy externally or prove that old installed clients are retired. The final public protocol is catalog/completed-attempt/reflection PATCH and independent summary/calendar/day resources, alongside noun identity resources. Old identity/product action routes return 404; no compatibility writer remains after contraction.

1. Inventory the deployed API build/schema journal and distributed mobile/native runtime versions before maintenance. Confirm the new client contains the canonical contracts/callers and the required AsyncStorage/NetInfo runtime. Block/distribute an update for older clients before reopening paid product access; there is no implemented general minimum-version endpoint or silent old-client conversion. Preserve recovery credentials and existing securely saved identity proposals.
2. Prepare a restorable pre-cutover database backup under the separate operator role, protect its private contents outside repository/log artifacts, and record only counts/comparison outcomes. Rehearse restoration and forward application on disposable data with `npm run test:migrations`; production backup/PITR and a reachable phone staging route are Phase 14 requirements. Never test by resetting shared staging or production.
3. Stop all old API writers/traffic for the final comparison. Apply the unchanged additive/backfill migrations through 0012 if missing. Compare completed `(owner,id,activity_date)` sets, original starts, Level 1/challenge/venue references, canonical catalog and owner-matched submitted feeling/text/revisions. Preserve recorded historical dates and nullable unknown start zones with their historical display fallback. Do not promote drafts/skips or invent legacy lifecycle timestamps.
4. With old writers still stopped, apply reviewed registered `0013_attempt_resources_contract.sql` using `npm run db:migrate` and the separate migration environment. It removes obsolete lifecycle, revision, queue/preferences/skips, separate reflections and action receipts; targeted `attempt_patch_receipts` remain. Repeat preservation/schema/ownership checks before opening traffic. Retain inactive historical challenge/placement references.
5. Deploy matching canonical API/contracts and distribute/reload the matching mobile client together, then run staged recovery/revocation/transfer and completion/reflection/Progress checks. Check old paths return 404 without writes and reject old public fields. Do not grant a production test entitlement or bundle a deployment-protection bypass. Phase 16 must connect real verified access/earlier-upload coverage before paid release.
6. If comparison or deployment fails, keep traffic closed. Before contraction, leave additive schema in place and repair forward. After contraction, an old API requires removed tables/columns and cannot safely be rolled back alone. Restore the protected pre-cutover snapshot only under the reviewed maintenance plan, coordinate its matching old API/client state, then repair/rehearse forward; account for writes since the snapshot before any restore. Prefer a new reviewed forward-repair migration when preserved data is sound. Never edit already-applied 0000–0012 SQL, reset shared data or delete credential history to retry.

Relaunch hydrates same-account device-persisted submissions and resumes their stable create/PATCH operations. New-device recovery restores uploaded server history, not another phone's only pending copy. Current old-client handling is coordinated release maintenance/update, not an already implemented in-app forced-upgrade system. Record actual deployed versions, backup/restore proof, comparisons and staged/device results in the release handoff before claiming rollout acceptance.
