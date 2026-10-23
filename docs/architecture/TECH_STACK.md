# Implemented technology stack

This document describes installed technologies and server/storage boundaries.
[APP_SHELL.md](APP_SHELL.md) owns mobile runtime composition and navigation;
[ACTIVITY_DATA.md](ACTIVITY_DATA.md) owns activity contracts, phone saving and
reconciliation. The [implementation plan](../implementation-plan/README.md) owns
sequencing and approved future changes. Verification results and open release
gates belong in the [handoff index](../handoffs/README.md). Phase 13's optional
accounts and cloud sync describe the local implementation candidate; hosted
services and installed clients retain earlier behavior until separately approved
rollout. [ACCOUNT_SYNC_SETUP.md](../operations/ACCOUNT_SYNC_SETUP.md) lists the
provider, private live-session helper and server-only deletion prerequisites.

## Workspaces and runtimes

The npm workspace contains the Expo application in `apps/mobile`, the Fastify API
in `apps/api`, and public Zod contracts in `packages/contracts`. Node 24 and npm 11
are pinned through the root manifest, `.nvmrc` and lockfile. Use the lockfile and
workspace manifests for exact package versions; Expo's online compatibility
recommendations are checked separately by the pinned Doctor command.

| Responsibility                   | Installed technology                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Mobile runtime                   | Expo SDK 57, React 19.2, React Native 0.86, strict TypeScript                                 |
| Navigation and native builds     | Expo Router, development client, EAS configuration, Continuous Native Generation              |
| Native gestures and motion       | Gesture Handler, Reanimated 4, compatible Worklets                                            |
| UI, art and detail sheets        | React Native StyleSheet/tokens, SVG, Expo Image/Font, Gorhom Bottom Sheet, safe-area context  |
| Remote reads                     | TanStack Query 5, account-scoped in-memory queries                                            |
| Live activity state              | Zustand 5 without persistence middleware                                                      |
| Completion/cache persistence     | AsyncStorage 2.2 with versioned completion/catalog/deck-preference envelopes                  |
| Private journal persistence      | Expo SQLite 57.0.4 with per-account databases; IndexedDB development-browser adapter          |
| Connectivity and saving feedback | NetInfo, Sonner Native and the Sonner web adapter                                             |
| Optional account sign-in         | Supabase Auth, native Expo Apple Authentication and original Google Sign-In integration       |
| Managed session storage          | Chunked Expo SecureStore; legacy Swift Keychain proofs retained for internal migration        |
| Optional personal cloud copy     | Local Swift Expo module using Apple's private CloudKit database                               |
| Haptics                          | Pulsar 1.7, gated behind the iPhone TurboModule and saved installation preference             |
| Complete data download/import    | fflate ZIP, Expo FileSystem/native sharing, DocumentPicker import, browser Blob/file adapters |
| API                              | Fastify 5, Node.js, TypeScript, Helmet, CORS and redacted Pino diagnostics                    |
| Database                         | PostgreSQL, Drizzle ORM and `pg`                                                              |
| Shared contracts                 | Zod 4 request/response schemas, types and OpenAPI 3.1                                         |
| Automated checks                 | Jest/jest-expo and React Native Testing Library; Vitest; Playwright; Node test runner         |

The app targets iOS first. Web adapters support previews and browser journeys;
Android release remains deferred. A successful JavaScript export does not prove
native module availability, Keychain behavior or device acceptance. Native module
or configuration changes require a compatible new binary; EAS Update applies
only to JavaScript/assets compatible with the installed runtime.

## API hosting and database access

The API has a standalone server entrypoint and a Vercel Functions adapter. Durable
state stays in PostgreSQL; function instances cannot own persistent queues or
recurring application work. Hosting configuration, environment setup and rollout
procedures live in [FOUNDATION.md](../operations/FOUNDATION.md).

Supabase hosts PostgreSQL and supplies optional Apple/Google Auth. Mobile uses
the Auth SDK for provider sessions and calls Fastify for application data; it
never accesses private database tables directly. Serverless connections use a small reused
`pg` pool and the configured transaction-pooler connection. Migrations use the
separate migrator connection and role. Keep account context transaction-local;
never retain a transaction across provider calls. Live Auth session checks use a
postgres-owned private boolean helper; the restricted runtime role receives only
schema USAGE and function EXECUTE, without direct Auth access. Hard Auth deletion
uses a separate server-only administrative SDK client. Neither capability is a
mobile database grant.

`src/db/schema.ts` describes the private `justgo` schema, foreign keys, constraints
and row-level security. Runtime `justgo_runtime` has restricted privileges;
`justgo_migrator` handles schema/maintenance work. Authenticated services execute
through `IdentityService.withSession`, with the verified owner and domain operation
in the same transaction. A route guard or caller-supplied UUID cannot authorize
access. Database tests exercise those policies with the actual runtime role.

<a id="4-frictionless-identity-and-recovery"></a>

## Identity and account lifecycle

Guest entry creates a durable phone collection without creating an Auth or JustGO
account. Optional Apple/Google sign-in uses Supabase Auth; a verified subject maps
through `managed_auth_accounts` to one canonical JustGO owner. Each protected
operation checks the verified provider token, live Auth session, registered app
session, revocation and owner deletion under the existing transaction boundary.
Public IDs, editable metadata, email matching and purchase identity cannot prove
ownership. Signed-in history and private journal synchronize together. Before
sign-in the app discloses cloud storage and automatic adoption of unowned phone
entries. First sign-in performs that adoption without a separate merge choice;
durable handover state preserves the source until target acceptance and then
retires it. Logout keeps the same visible, editable journal and stops JustGO
uploads. Returning to the same account synchronizes intervening edits; selecting
another account never makes the prior account's writing a guest upload source.
There is no permanent guest-data selector. Apple/Google login-method switches use
freshly verified provider identities, preserve the canonical owner during
linking/unlinking and protect the final usable provider method.

Managed sessions use OS-backed SecureStore, with bounded chunks and an atomic
manifest. The older Swift Keychain adapter and custom proof tables remain for
authenticated legacy linking and pending deletion, while managed mode retires
public key/code administration. Linking preserves the old canonical owner and
revokes its old proofs atomically. Locked/unavailable storage is a retry state,
never permission to create a replacement account. [IDENTITY.md](IDENTITY.md) owns
the protocol, migration, revocation and deletion invariants.

Account deletion authenticates ownership without requiring paid access. It removes
personal activity and the managed Auth profile while retaining deletion receipts,
canonical subject/proof tombstones and the durable Auth cleanup status needed to
prevent resurrection and support same-proof retries. Provider I/O follows the
owner transaction; final success requires hard Auth deletion and its durable
acknowledgement. A bounded operator retry handles abandoned pending erasures.
Mobile persists deletion intent and the confirmed receipt,
stops uploads, drains accepted writes and cleans only the selected account.
Both data deletion and account deletion include previously associated app-managed
iCloud copies even when Sync is OFF. An unavailable associated Apple account leaves
durable pending cleanup; toggling sync cannot discard it. Saved deletion receipts
and copied-source retirement resume before normal Auth initialization, including
after the managed Auth user has been erased. User-exported files remain external.
Native cleanup capability is checked before the destructive request. The
[backup/restore checklist](../operations/FOUNDATION.md#backup-restore-checklist)
preserves deletion after restoring an older backup.

The invoker-rights `justgo.purge_expired_identity_records` function bounds identity
retention cleanup, with `PUBLIC` execution revoked and migrator-only access.
Creating the function does not schedule it. Hosted scheduling and backup-policy
confirmation remain open gates in the [Phase 08 handoff](../handoffs/phase-08-settings-privacy.md#open-gates).

<a id="3-architecture-and-storage-boundaries"></a>

## Activity and phone storage

`levels`, `challenges`, `venues` and `venue_cards` hold the stable Level 1 content
and six venue decks. `attempts` stores completed reps with frozen start/date
attribution. Migration 0019 freezes the legacy private write columns; the
owner-approved 0020 reset clears only old server inline reflections/receipts,
preserving accounts, completion history and phone journals. Dedicated
`journal_versions` stores signed-in immutable private versions with parent IDs and
historical context. Journal-only restored entries do not fabricate completion
rows or reps. Ordinary completion reads/exports project no private fields.
There are no active-attempt, server countdown, personal deck queue or generic
server outbox tables; the focused Auth deletion outbox has its own responsibility.

| Data                                                            | Current owner                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Managed provider credentials and frozen deletion bearer         | OS-backed SecureStore, separate from journal/export files                   |
| Legacy migration proofs and pending proposals                   | Existing Swift Keychain adapter                                             |
| Venue choice and cycling order                                  | Versioned account AsyncStorage deck preferences                             |
| Unfinished countdown                                            | Account-owned memory                                                        |
| Downloaded catalog                                              | Versioned account AsyncStorage catalog                                      |
| Completed reps, create operations and reconciliation metadata   | Serialized account AsyncStorage completion envelope plus live state         |
| Saved feelings/text, historical context and legacy alternatives | Account SQLite database, independent of caches and cloud acknowledgement    |
| Latest summary/current-month counts/today's downloaded pages    | Bounded snapshots in the completion envelope                                |
| Complete guest/signed-out collection                            | Durable local completion envelope and journal under the original owner      |
| Signed-in completion history and journal versions               | PostgreSQL with authenticated owner isolation, reconciled with local copies |
| Optional iCloud copy                                            | Private CloudKit database, collection-separated and off by default          |
| Complete downloaded snapshots                                   | User-selected Files/iCloud Drive destination; data-only versioned ZIP       |
| Reduce Motion and Haptics preferences                           | Installation AsyncStorage, independent of accounts                          |

[ACTIVITY_DATA.md](ACTIVITY_DATA.md) defines transactional private saving/imports,
completion retries, pruning, timestamp trust and aggregate consistency. SQLite
keeps durable writing; signed-in synchronization uploads immutable private
versions to JustGO and downloads both history and journal on returning sign-in.
Each account's deletion epoch and record tombstones fence stale-device uploads.
Only an explicitly confirmed import can intentionally restore deleted IDs.
Ordinary phone-source adoption uses normal writes, persists stable version IDs
before upload and skips tombstoned records without merging rejected writing locally.
Per-epoch tombstone receipts and confirmed remote records let retries progress
without repeating already resolved work; the source remains until adoption succeeds.
Download/Import covers history, writing, alternatives and supported preferences
in one data-only file. It cannot authenticate an account. Manual files remain
snapshots; optional CloudKit sync is a separate additional copy.

SQLite is loaded lazily and fails visibly on an older native binary without its
module. A failed local save is not replaced by a cloud-only save. The browser adapter and Node
SQLite adapter tests do not prove iOS protection, system-backup behavior or Files
delivery. A compatible new native binary and signed-device acceptance remain
separate Phase 14 work; no added encrypted-vault architecture is claimed.

## HTTP contracts and diagnostics

Public strict schemas are imported through `@justgo/contracts`; the apps do not
import one another's implementation. Shared errors and health/readiness schemas
live in their own modules. The generated document has the API-only
`@justgo/contracts/openapi` entry, so importing mobile contracts does not load it.
Contracts builds clean `dist` before compiling both entries. `/openapi.json`
documents the versioned identity, access, catalog, activity, Progress, complete
history restore, private journal sync and deletion resources. Managed-mode
OpenAPI omits retired key/code administration.
Contract changes must keep route validation, statuses, response parsing and
OpenAPI aligned in the same change.

The API applies a default 32 KiB body bound and a dedicated 4 MiB sync-batch bound,
with ten-second request/connection timeouts,
server-generated request IDs, no-store responses, explicit CORS origins/methods
and Helmet headers. Versioned failures use a safe typed envelope with a request
ID. Malformed, oversized and unsupported-media requests retain client-error
statuses; transient service failures become unavailable responses. Secret-bearing
URLs, request/response bodies and private reflections are excluded from logs.
Identity rate limits return the real integer seconds remaining in the database
bucket through Retry-After. Shared HTTP errors, bearer parsing, input validation
and allowlisted diagnostics live in the API http owner. SQLSTATE diagnostics
expose only validated five-character codes through wrapped driver failures.
Migration setup failures add fixed allowlisted reason codes, without exposing
environment values or driver messages.
The mobile HTTP client fetches the exact admitted URL. It accepts JSON media
types before reading a body and treats malformed/proxy responses as unavailable;
only transport failures are network errors. Typed JSON errors retain their
request IDs, conflict data and Retry-After, within the original cancellation/
timeout and single-GET-replay budget. Unvalidated proxy bodies cannot revoke
credentials or extend upload cooldowns through their headers.
`/health` checks process availability; `/ready` checks the database and returns
503 when unavailable. Managed readiness also checks the narrow Auth session read
privileges; enabling managed mode requires Auth URL/public configuration and a
server-only administrative deletion secret. Actual hosted provider/admin behavior
still requires separate acceptance.

<a id="9-analytics-and-sensitive-data"></a>

## Current access and disabled integrations

Access is an injected verified-owner boundary. Its default provider is unavailable;
explicit operator-configured staging beta grants can supply bounded coverage.
Guest access uses its own verified boundary: a bounded staging beta window can
enable the catalog without account creation, while production denies it until
verified guest purchase coverage exists. Local guest writing is still available;
provider sign-in does not bypass entitlement.
The current mobile guard polls every 30 seconds, accepts verification for at most
60 seconds and never past expiry, and closes after failed verification.
[APP_SHELL.md](APP_SHELL.md#access-verification) explains its clock alignment and
separation from earlier-upload eligibility.

RevenueCat purchase/paywall/restore, provider-backed billing records, QStash and
billing schedules are unbuilt. Their technical design lives in
[native-billing-and-jobs.md](../proposals/native-billing-and-jobs.md), with scope
owned by [Phase 07A](../implementation-plan/phase-07a-billing.md). The optional
[Stripe checkout](../proposals/optional-stripe-checkout.md) and future
[text coach](../proposals/future-text-coach.md) are separate proposals.

Product analytics remains uninstalled and disabled. Sentry React Native 7.11.0
(Expo 57's supported version, Cocoa 8.58.0) is installed for errors only under
`anthony-corp` / `justgo-mobile` in the US region. The ordinary app environment
keeps delivery disabled pending matching notices/provider review and signed-build
acceptance. Anthony approved the minimal Policy-only startup scope before app
entry; this is not permission collected through Continue or document viewing. Synthetic
browser delivery and stored IP redaction were verified; native compilation,
crash/restart delivery and symbolication remain Phase 14 gates. See the
[diagnostics boundary](APP_SHELL.md#app-error-reporting) and
[Phase 11 handoff](../handoffs/phase-11-crash-reporting.md). The current
telemetry helper has an event-name allowlist, account-reset consent and no exporter
or payload API. [Phase 10](../implementation-plan/phase-10-acceptance.md) owns the
Terms & Privacy entry links and ordinary Continue, with no legal
view/acceptance receipts or version-driven navigation.
[Phase 15](../implementation-plan/phase-15-analytics.md) owns post-paid-launch
analytics and the approved event allowlist, and
[Phase 11](../implementation-plan/phase-11-crash-reporting.md) owns app crash reporting;
[Phase 12](../implementation-plan/phase-12-legal-documents.md) owns final legal
notices, document labels and public destinations. Product analytics stays disabled
through beta and paid launch. Phase 15 must review its actual permission/collection
design before activation; Continue and historical legal receipts grant no analytics
permission, and the removed tracking/version gates must not be restored by
assumption. Historical migration 0017 remains; migration 0018 drops only its legal
receipt table and preserves the independent analytics restriction marker. Activity
creation acknowledgements and durable account-deletion confirmations remain;
legacy inline private receipts are reset only by the approved forward migration.
Questionnaire onboarding, reminders, custom
dictation, lock-screen display and progression remain deferred; their existence
in a plan must not be read as installed dependencies, tables or behavior.

## Development and quality boundaries

[FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md) owns paths and responsibilities;
[AGENTS.md](../../AGENTS.md) owns coding standards. Import-boundary tests enforce
workspace separation and mobile routes/app-support/features/data/shared/developer
directions, including dynamic imports and re-exports. Native/web adapter pairs and
tests stay with their owner. Tooling and generated build output must follow moves.

[TESTING.md](../operations/TESTING.md) owns commands, coverage floors, isolated
fixtures and evidence requirements. PostgreSQL ownership/migration tests, saved
app/API/database journeys, bundle exports, interactive browser checks and native
checks prove different boundaries. Hosted results must be inspected for the
actual published commit; local checks do not establish hosted acceptance.
