# Implemented technology stack

This document describes installed technologies and server/storage boundaries.
[APP_SHELL.md](APP_SHELL.md) owns mobile runtime composition and navigation;
[ACTIVITY_DATA.md](ACTIVITY_DATA.md) owns activity contracts, phone saving and
reconciliation. The [implementation plan](../implementation-plan/README.md) owns
sequencing and approved future changes. Verification results and open release
gates belong in the [handoff index](../handoffs/README.md).

## Workspaces and runtimes

The npm workspace contains the Expo application in `apps/mobile`, the Fastify API
in `apps/api`, and public Zod contracts in `packages/contracts`. Node 24 and npm 11
are pinned through the root manifest, `.nvmrc` and lockfile. Use the lockfile and
workspace manifests for exact package versions; Expo's online compatibility
recommendations are checked separately by the pinned Doctor command.

| Responsibility                   | Installed technology                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Mobile runtime                   | Expo SDK 57, React 19.2, React Native 0.86, strict TypeScript                                |
| Navigation and native builds     | Expo Router, development client, EAS configuration, Continuous Native Generation             |
| Native gestures and motion       | Gesture Handler, Reanimated 4, compatible Worklets                                           |
| UI, art and detail sheets        | React Native StyleSheet/tokens, SVG, Expo Image/Font, Gorhom Bottom Sheet, safe-area context |
| Remote reads                     | TanStack Query 5, account-scoped in-memory queries                                           |
| Live activity state              | Zustand 5 without persistence middleware                                                     |
| Phone activity persistence       | AsyncStorage 2.2 with explicit versioned catalog/journal/deck-preference envelopes           |
| Connectivity and saving feedback | NetInfo, Sonner Native and the Sonner web adapter                                            |
| Recovery credentials             | Local Expo Swift Keychain module and a typed identity adapter                                |
| Haptics                          | Pulsar 1.7, gated behind the iPhone TurboModule and saved installation preference            |
| Export delivery                  | fflate ZIP generation, Expo FileSystem/native sharing, browser Blob download                 |
| API                              | Fastify 5, Node.js, TypeScript, Helmet, CORS and redacted Pino diagnostics                   |
| Database                         | PostgreSQL, Drizzle ORM and `pg`                                                             |
| Shared contracts                 | Zod 4 request/response schemas, types and OpenAPI 3.1                                        |
| Automated checks                 | Jest/jest-expo and React Native Testing Library; Vitest; Playwright; Node test runner        |

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

Supabase hosts the managed PostgreSQL database. Mobile calls the API and never
accesses database tables directly; Supabase Auth is not part of the custom
credential/session system. Serverless runtime connections use a small reused
`pg` pool and the configured transaction-pooler connection. Migrations use the
separate migrator connection and role. Keep account context transaction-local;
never retain a transaction across future provider calls.

`src/db/schema.ts` describes the private `justgo` schema, foreign keys, constraints
and row-level security. Runtime `justgo_runtime` has restricted privileges;
`justgo_migrator` handles schema/maintenance work. Authenticated services execute
through `IdentityService.withSession`, with the verified owner and domain operation
in the same transaction. A route guard or caller-supplied UUID cannot authorize
access. Database tests exercise those policies with the actual runtime role.

<a id="4-frictionless-identity-and-recovery"></a>

## Identity and account lifecycle

Accounts require no email, SMS, OAuth or signup form. The backend issues opaque,
independent device sessions and verifies high-entropy recovery proofs through
one-way digests. Public IDs and purchase identity cannot recover private history.
The implemented tables are `users`, `devices`, `device_sessions`,
`recovery_credentials`, `device_transfers` and `identity_rate_buckets`.

The local Swift module separates synchronizable recovery credentials from
non-synchronizing device sessions. Locked/unavailable Keychain is a retry state,
never evidence that a new account should be created. Pending proposals preserve
proofs across uncertain API/storage outcomes; explicit keys and device transfer
provide recovery fallbacks. Synchronization can be delayed or unavailable and
requires its own device evidence. [IDENTITY.md](IDENTITY.md) owns protocol,
credential format, revocation, deletion and recovery details.

Account deletion authenticates ownership without requiring paid access. It removes
personal activity and live identity data while retaining the minimal deletion
receipt and revoked credential digests needed to prevent resurrection and support
same-proof retries. Mobile persists deletion intent and the confirmed receipt,
stops uploads, drains accepted writes and cleans only the selected account.
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
attribution and inline submitted reflections. `attempt_patch_receipts` records
account/submission identity, normalized input digest and applied revision for safe
PATCH replay. There are no active-attempt, server countdown, separate reflection,
personal deck queue, content revision or generic server outbox tables.

| Data                                                             | Current owner                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Secure credentials and pending identity/deletion proposals       | Keychain identity adapter                                              |
| Venue choice and cycling order                                   | Versioned account AsyncStorage deck preferences                        |
| Unfinished countdown                                             | Account-owned memory                                                   |
| Downloaded catalog                                               | Versioned account AsyncStorage catalog                                 |
| Explicitly submitted activity, immutable operations and receipts | One serialized account AsyncStorage journal plus live repository state |
| Latest summary/current-month counts/today's downloaded pages     | Bounded snapshots in that journal                                      |
| Older downloaded history                                         | Online in-memory queries                                               |
| Accepted shared history                                          | PostgreSQL, with authenticated owner isolation                         |
| Reduce Motion and Haptics preferences                            | Installation AsyncStorage, independent of accounts                     |

[ACTIVITY_DATA.md](ACTIVITY_DATA.md) defines write failure recovery, retries,
pruning, timestamp trust and aggregate consistency. PostgreSQL owns accepted
history; a phone can lose its only unuploaded copy before synchronization. The app
does not promise a backup system or persist the whole query cache.

## HTTP contracts and diagnostics

Public strict schemas are imported through `@justgo/contracts`; the apps do not
import one another's implementation. Shared errors and health/readiness schemas
live in their own modules. The generated document has the API-only
`@justgo/contracts/openapi` entry, so importing mobile contracts does not load it.
Contracts builds clean `dist` before compiling both entries. `/openapi.json`
documents the versioned identity, access, catalog, canonical activity, Progress,
export and deletion resources.
Contract changes must keep route validation, statuses, response parsing and
OpenAPI aligned in the same change.

The API applies a 32 KiB body bound and ten-second request/connection timeouts,
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
503 when unavailable.

<a id="9-analytics-and-sensitive-data"></a>

## Current access and disabled integrations

Access is an injected verified-owner boundary. Its default provider is unavailable;
explicit operator-configured staging beta grants can supply bounded coverage.
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
acceptance. Anthony approved minimal Policy-only startup diagnostics before
onboarding acceptance. Synthetic
browser delivery and stored IP redaction were verified; native compilation,
crash/restart delivery and symbolication remain Phase 13 gates. See the
[diagnostics boundary](APP_SHELL.md#app-error-reporting) and
[Phase 11 handoff](../handoffs/phase-11-crash-reporting.md). The current
telemetry helper has an event-name allowlist, account-reset consent and no exporter
or payload API. [Phase 10](../implementation-plan/phase-10-acceptance.md) owns the
implemented Terms & Privacy acceptance receipt and tested eligibility boundary, [Phase 14](../implementation-plan/phase-14-analytics.md) owns post-paid-launch analytics and the approved event allowlist, and [Phase 11](../implementation-plan/phase-11-crash-reporting.md) owns app crash reporting;
[Phase 12](../implementation-plan/phase-12-legal-documents.md) owns final legal
notices, launch acceptance wording/versions and public destinations. Product analytics stays disabled through beta and paid launch; later activation requires reviewed notices and current account-owned acceptance. Questionnaire onboarding, reminders, custom
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
