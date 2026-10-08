# App shell and shared API

Phase 03 established navigation and account/network infrastructure. Anthony deferred welcome screens and questionnaire onboarding on September 17, 2026; no onboarding state or answer collection is implemented. Phase 07.3 integrates the account activity repository, local challenge/completion/reflection flow and saving feedback. The local 07.4 implementation adds Progress reconciliation and inline day-entry reflection editing; billing remains 07A.

## Implemented folder responsibilities

The October 6 dedicated cleanup groups existing modules without changing product
behavior in two stacked PRs. [Foundation PR #18](https://github.com/anthonyyoo24/justgo/pull/18)
organizes tooling, API tests, contracts and documentation while retaining the
merged-07.3 mobile source/artwork paths. [Mobile PR #19](https://github.com/anthonyyoo24/justgo/pull/19)
then moves challenge previews to `dev/previews/challenges/`, groups Challenges into
`deck/`, `active/` and `success/`, activity into `persistence/` and `sync/`, and
Progress into `calendar/` and `day-details/`. Native/web adapter families remain
colocated. [FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md) describes the final structure
after both PRs; the [cleanup handoff](../handoffs/project-folder-cleanup.md) records
stage-specific verification.

The October 5 owner-approved cleanup places the startup gate in
`app-support/access/AccessScreen.tsx` and app/account/foreground composition in
`app-support/providers/AppProvider.tsx`. Feature screens consume the provider hooks;
shared components/lib/theme/platform and the data layer cannot import app support.
App support composes features but cannot import route implementations.
Account/recovery screens, session coordination and the typed Keychain adapter
live in `app-support/identity/`; the Swift module remains under `modules/`.

Development screen fixtures and their tests live in `dev/previews/`. Only the
guarded `app/preview.tsx` route loads them from production source; both route and
fixture still check `__DEV__`. Shared `components/NavigationLink.tsx` owns text-link
styling and the Settings variant. Access and Settings keep their own screen styles.
The unused Foundation screen and Shell Home/Focused placeholders are removed;
their historical implementation evidence remains in earlier handoffs. Route paths,
access policy and foreground behavior are unchanged. The
[07.2 handoff](../handoffs/phase-07-2-local-sync.md) records checks and browser evidence.

## Routes and access

- `/`: restore the real account, then check `/v1/access`. Loading, unavailable and unpaid have distinct UI. Only a fresh, unexpired server verification admits the paid routes.
- `/(tabs)` and `/progress`: Home uses the downloaded catalog and local venue/start/countdown/completion state. Progress uses independent canonical summary/calendar/day reads and the shared repository's local activity overlay. Current-month counts and today's downloaded pages survive offline; other days and months require a connection.
- `/success` and `/reflection`: guarded focused routes read a completed attempt from the current account’s repository. There is no server success lookup or reflection draft recovery/autosave. Visiting a URL cannot fabricate a completion. Only explicit reflection submissions enter the journal; empty Skip sends nothing.
- `/settings` and `/recovery`: reachable regardless of paid access. The recovery route exposes Account / Recovery keys / Device transfer / Manage devices directly, with Return-key submission and automatic keyboard insets. It shares the one app-level identity controller; it does not create another vault or account.
- `/preview`: development-only presentation fixture. It has no domain queries or writes and never changes an account's entitlement. The route guard and module load both require `__DEV__`. There is no runtime flag, API parameter or production environment switch that unlocks it.

`AccessService` calls `IdentityService.withSession` and passes the same verified owner transaction into an entitlement reader. The default reader returns **unavailable** until phase 07A implements a verified billing projection. Tests inject readers only into isolated app instances. Mobile accepts a verification for at most 60 seconds and never past its expiry; checks repeat every 30 seconds and on foreground. A failed recheck closes access. Future premium mutation endpoints must enforce their own server entitlement checks; a navigation guard is not authorization.

Settings currently offers the existing recovery tools and an honest analytics-off notice. Privacy/export/deletion, reminders, billing purchases and final Settings rows remain later work.

## Request and state rules

`lib/network/http.ts` is the shared transport, including identity requests. It validates HTTPS (development loopback only may use HTTP), strict response schemas and typed errors. Tokens are restricted to headers/bodies. It never logs response bodies or transport messages. The full HTTP operation, including body parsing, has a maximum ten-second deadline and supports cancellation even if a transport ignores AbortSignal.

`lib/network/account-client.ts` owns the domain-request policy: at most two sends within one ten-second total budget, covering either a transient read retry or authentication replay. Writes never replay after a network/uncertain failure. The transport supports explicit GET/POST/PATCH/DELETE methods; both retry layers classify a read by the resolved GET method, so a bodyless DELETE cannot be retried as a read. Oversized-body and unsupported-media responses retain typed 413/415 failures and do not enter outage retries. Rate-limit, validation, conflict and revoked-session errors never trigger transient retries. An authentication replay reuses the original serialized body. Concurrent expired-session responses share one recovery operation; an already-rotated token is reused and there is no recursive recovery loop. The identity controller's persisted proposals preserve recovery/renewal idempotency. Shared renewal has its own ten-second deadline, independent of individual request deadlines, and releases its cached promise on timeout. Identity actions also bound their I/O and release the busy state on timeout; late API results cannot resume the expired action. Native storage calls remain serialized even after timeout because native writes cannot be cancelled safely. A timed-out write invalidates the in-memory state so retry reads the durable pending intent before continuing. If native storage never returns, retries report storage unavailable rather than starting overlapping writes.

TanStack Query 5.103.1 has query and mutation retries disabled, with in-memory caches only. Requests consume its abort signal. Query keys begin with `['account', userId, ...]`. Account loss or switching synchronously increments a generation, aborts pending requests and clears all queries/mutations before the next account appears. A late response is rejected even if the transport ignores cancellation. Account-local form state should be keyed/reset at the same boundary when those features are implemented. Automatic same-account expired-session recovery preserves the owner boundary; explicit recovery still clears it.

`stableAction(id, input)` snapshots a user action for manual retries. Generate its ID once, retain the action through an uncertain response, and enforce owner/matching-input idempotency in each future consuming endpoint. This helper alone is not server deduplication.

`lib/telemetry.ts` accepts only a small event-name allowlist and a consent state. It has no exporter or payload API. Nothing is transmitted, even with granted consent, until phase 08 approves privacy choices and provider configuration. Account changes reset consent.

## Phase 07 identity resource cutover

The first Phase 07 slice replaces `/v1/identity/*` action paths with the session, device, credential and transfer resources documented in [IDENTITY.md](IDENTITY.md#api-contracts). API/mobile contracts and callers move together. Persisted identity intents and secure proofs remain compatible; an old running client must update with the API. This slice does not implement the planned offline challenge/reflection flow or change access verification.

## Contracts and extension points

`packages/contracts/src/access.ts` owns the access response and freshness predicate. `/openapi.json` serves OpenAPI 3.1 generated from the strict Zod access and identity contracts, including the transfer inspection/approval distinction. Add new contracts to `.vercelignore`'s exact upload allowlist before deploying.

Routes stay thin. Shared visual components use `theme/tokens.ts`; tab artwork uses the extracted Paper SVG paths. Navigation has no animation, so reduced-motion users receive the same behavior. Screen content scrolls with safe areas and scalable text. Do not use reference screenshots as screen backgrounds or treat their sample data as approved product content.

References checked: [Expo 57](https://docs.expo.dev/versions/v57.0.0/), [protected routes](https://docs.expo.dev/router/advanced/protected/), [query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation), [query retries](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries), [Zod JSON Schema](https://zod.dev/json-schema). Use only SDK 57 APIs; the newer `redirectTo` and SDK 58 custom-navigator APIs are not used.

## Maintainer entrypoints after Phase 06A

Follow [root coding instructions](../../AGENTS.md) and [testing guidance](../operations/TESTING.md).
`ProgressScreen` owns account-scoped selection and editing; `useProgressReads`
owns independent queries and repository acceptance. `ProgressView` composes
`ProgressCalendar` (summary/calendar), `DaySheet` (modal/paging/retry) and
`ProgressEntryRow` (metadata/reflection expansion). Each owns its related styles.
`DayReflectionEditor` renders the Paper textbox/actions and `useDayReflection`
reuses the existing reflection controller for explicit saves and guarded closes.
`ChallengeScreen` owns deck orchestration; `ActiveChallenge` owns the countdown and
outcome controls; `SuccessScreen` owns the confirmed-result route. The shared
feeling choices come from the versioned contracts. No route or persistence policy
changed in this refactor. App-provider and vault adapter tests cover their real
JavaScript wiring; native Keychain behavior still needs its separate device gates.

## Phase 07.1 API compatibility boundary

The API now exposes canonical catalog, completed-attempt and inline-reflection
resources plus independent Progress summary/calendar/day reads. The local 07.4
Progress caller consumes those canonical reads. Legacy presentation fixtures and
backend compatibility routes remain until 07.5. Challenge/completion/reflection callers use the
canonical catalog and local repository flow. Legacy completion/final-reflection
writes mirror canonical columns in the same transaction; new records appear in
legacy Progress with their actual start timestamp and nullable obsolete fields.
No fake completion timestamp or revision/card identity is added. The Progress
row uses canonical `startedAt` with its frozen display time zone; legacy presentation
fixtures still allow unknown old timestamps.

The mobile identity transport is already on noun resources. Generic HTTP calls
support GET/POST/PATCH/DELETE, omit JSON content type for bodyless requests, and
retry only eligible GET failures; 413/415 remain permanent request failures.
The offline journal and local challenge/completion/reflection flow are wired in
07.2/07.3. The [07.4 handoff](../handoffs/phase-07-4-progress-history.md) records
Progress cache/reconciliation and local verification. The [07.1 handoff](../handoffs/phase-07-1-api-data.md)
owns the temporary compatibility inventory, database rehearsal and current test
evidence. Full product-document reconciliation is assigned to 07.5.

## Phase 07.2 local persistence boundary

The shared activity repository, AsyncStorage adapter, Zustand live state and
ordered sender are implemented under `data/activity`. This data module owns local
saving, cached activity and upload coordination for the user-facing features.
Features may import data; data uses shared infrastructure/contracts and cannot
import routes, app-support, developer code, features, components or theme. Shared
components/lib/theme/platform cannot import routes, app-support, developer code, data
or features. The journal now also retains a nullable compact current-month
reconciliation baseline, with a default for previously stored envelopes.
07.3 wires challenge/completion/reflection screens and provider/lifecycle
coordination into this boundary. 07.4 composes local/backend Progress through
`data/activity/progress/progress.ts` and independent read/cache helpers in the
same `progress/` folder. Storage adapters and serialized writes live under
`data/activity/persistence/`; delivery, transport and retry scheduling live under
`data/activity/sync/`. Repository, account ownership, schemas and submission rules
stay at the activity root. The
[07.2 handoff](../handoffs/phase-07-2-local-sync.md) records version/durability rules,
retry/recovery interfaces, test evidence and open native checks. HTTP now preserves
validated reflection-conflict data and Retry-After; normal uploads have one retry
owner and use the existing coordinated authentication boundary.

## Phase 07.3 runtime and saving presentation

`app-support/providers/activity-runtime.ts` composes account repositories, storage
and the account-bound transport. `AppProvider` synchronizes identity before feature
controllers, forwards foreground/connectivity changes and disposes listeners,
controllers and senders on unmount. Native connectivity uses NetInfo; the web
adapter listens to browser online/offline events. Parked repositories preserve
memory-only submissions for same-account recovery while the process survives.
`useJournal` and `useActivityState` expose the current repository/live state.

`features/challenges/controller.ts` owns a focused Zustand store for downloaded
venue decks, cycling and accepted completion context. `useActiveChallenge` owns
unfinished activity in React state inside the account-keyed Home feature. Start
captures a frozen card, timestamp and time zone; the deadline is derived from start
plus original duration. `ActiveChallenge` samples the clock once per second and
immediately on foreground; it never depends on a background interval. A fresh
mount/account change resets unfinished activity. `ActiveChallengeModal` covers
navigation full screen, omits Settings and accepts only Completed/Give up. Native
modal input isolation and the web inert/ARIA adapter keep underlying navigation
unavailable. Its saving surface retains warnings/details/dismissal, with page links
deferred until the challenge ends. The modal closes when Success takes focus;
Give up returns to the existing venue/deck without a saved attempt.
Completed creates one UUID and awaits repository saving. Ordinary local success
never waits for HTTP. `features/reflections/controller.ts` owns React-form state,
validation, dirty-close choices and newer-input protection; explicit submissions
use the repository’s serialized write/fallback and ordered sender.

`app-support/saving/SavingFeedback.tsx` owns the shell and covering-sheet feedback
hosts; `SavingNotice.tsx` owns truthful loss-risk/intervention presentation. Warnings
reserve layout space and permit dismissal without stopping recovery. Full recovery
shows one account-scoped confirmation, including after dismissal. Authentication,
unreadable storage and rejected records remain discoverable outside the editor;
invalid reflection requests open retained input for an explicit correction.
Genuine revision conflicts adopt backend data automatically, without a chooser.
No generic Progress sync-status feature or placeholder support action is added.
`platform/Toast` uses Sonner Native on iOS and the documented Sonner web adapter.
Native keyboard/modal/VoiceOver/durability evidence remains open; bundle exports
and web screenshots are separate evidence. See the [07.3 handoff](../handoffs/phase-07-3-local-flow.md).

## Phase 07.4 Progress composition

`ProgressRefresh` receives the runtime from `AppProvider`, preloads summary,
current-month counts and today's pages, and refreshes reads after upload settlement
and reconnection. Its shared activity subscription is independent of provider
context, avoiding an import cycle. Summary/calendar acceptance rejects obsolete
account, period and generation responses; unknown create outcomes block aggregate
refreshes without blocking local progress or day lookups.

The summary and current-month baseline add only their not-yet-covered local IDs.
Rows merge by attempt ID, and lower reflection revisions cannot erase confirmed
writing. Before pruning an uploaded older-day edit, its canonical reflection
moves into the account's in-memory query pages. Backend-wins conflict results can
replace optimistic text there. Downloaded older history is never persisted and is
hidden offline; an active older-day editor can retain its own accepted input.
See the [07.4 handoff](../handoffs/phase-07-4-progress-history.md) for verification
and the native/release gates that remain open.
