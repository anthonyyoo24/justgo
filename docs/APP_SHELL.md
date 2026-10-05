# App shell and shared API

Phase 03 implements navigation and account/network infrastructure. Anthony deferred welcome screens and questionnaire onboarding on September 17, 2026. There is no onboarding state, answer collection, persistence or Zustand dependency. Challenge content/actions, reflections, history and billing arrive in their consuming phases.

## Routes and access

- `/`: restore the real account, then check `/v1/access`. Loading, unavailable and unpaid have distinct UI. Only a fresh, unexpired server verification admits the paid routes.
- `/(tabs)` and `/progress`: Home/Progress shells. No invented challenges, activity counts, history or mutation buttons.
- `/success` and `/reflection`: guarded focused route shells. They require future completed-attempt context; visiting a URL cannot fabricate a completion or save a reflection.
- `/settings` and `/recovery`: reachable regardless of paid access. The recovery route exposes Account / Recovery keys / Device transfer / Manage devices directly, with Return-key submission and automatic keyboard insets. It shares the one app-level identity controller; it does not create another vault or account.
- `/preview`: development-only presentation fixture. It has no domain queries or writes and never changes an account's entitlement. The route guard and module load both require `__DEV__`. There is no runtime flag, API parameter or production environment switch that unlocks it.

`AccessService` calls `IdentityService.withSession` and passes the same verified owner transaction into an entitlement reader. The default reader returns **unavailable** until phase 07A implements a verified billing projection. Tests inject readers only into isolated app instances. Mobile accepts a verification for at most 60 seconds and never past its expiry; checks repeat every 30 seconds and on foreground. A failed recheck closes access. Future premium mutation endpoints must enforce their own server entitlement checks; a navigation guard is not authorization.

Settings currently offers the existing recovery tools and an honest analytics-off notice. Privacy/export/deletion, reminders, billing purchases and final Settings rows remain later work.

## Request and state rules

`lib/http.ts` is the shared transport, including identity requests. It validates HTTPS (development loopback only may use HTTP), strict response schemas and typed errors. Tokens are restricted to headers/bodies. It never logs response bodies or transport messages. The full HTTP operation, including body parsing, has a maximum ten-second deadline and supports cancellation even if a transport ignores AbortSignal.

`lib/account-client.ts` owns the domain-request policy: at most two sends within one ten-second total budget, covering either a transient read retry or authentication replay. Writes never replay after a network/uncertain failure. The transport supports explicit GET/POST/PATCH/DELETE methods; both retry layers classify a read by the resolved GET method, so a bodyless DELETE cannot be retried as a read. Oversized-body and unsupported-media responses retain typed 413/415 failures and do not enter outage retries. Rate-limit, validation, conflict and revoked-session errors never trigger transient retries. An authentication replay reuses the original serialized body. Concurrent expired-session responses share one recovery operation; an already-rotated token is reused and there is no recursive recovery loop. The identity controller's persisted proposals preserve recovery/renewal idempotency. Shared renewal has its own ten-second deadline, independent of individual request deadlines, and releases its cached promise on timeout. Identity actions also bound their I/O and release the busy state on timeout; late API results cannot resume the expired action. Native storage calls remain serialized even after timeout because native writes cannot be cancelled safely. A timed-out write invalidates the in-memory state so retry reads the durable pending intent before continuing. If native storage never returns, retries report storage unavailable rather than starting overlapping writes.

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

Follow [root coding instructions](../AGENTS.md) and [testing guidance](TESTING.md).
`ProgressScreen` owns account-scoped queries; `ProgressView` composes
`ProgressCalendar` (summary/calendar), `DaySheet` (modal/paging/retry) and
`ProgressEntryRow` (metadata/reflection expansion). Each owns its related styles.
`ChallengeScreen` owns deck orchestration; `ActiveChallenge` owns the countdown and
outcome controls; `SuccessScreen` owns the confirmed-result route. The shared
feeling choices come from the versioned contracts. No route or persistence policy
changed in this refactor. Runtime/provider and vault adapter tests cover their real
JavaScript wiring; native Keychain behavior still needs its separate device gates.

## Phase 07.1 API compatibility boundary

The API now exposes canonical catalog, completed-attempt and inline-reflection
resources plus independent Progress summary/calendar/day reads. Existing mobile
challenge/reflection/history features still use explicitly named `Legacy*`
contracts and retained routes until 07.3–07.5. Legacy completion/final-reflection
writes mirror canonical columns in the same transaction; new records appear in
legacy Progress with their actual start timestamp and nullable obsolete fields.
No fake completion timestamp or revision/card identity is added. The Progress
row uses its compatibility `activityAt` value, falling back to the old completed
value for older responses.

The mobile identity transport is already on noun resources. Generic HTTP calls
support GET/POST/PATCH/DELETE, omit JSON content type for bodyless requests, and
retry only eligible GET failures; 413/415 remain permanent request failures.
The offline journal, local completion flow, banners/toasts and Progress cache
remain subsequent checkpoints. The [07.1 handoff](handoffs/phase-07-1-api-data.md)
owns the temporary compatibility inventory, database rehearsal and current test
evidence. Full product-document reconciliation is assigned to 07.5.

## Phase 07.2 local persistence boundary

The shared activity repository, AsyncStorage adapter, Zustand live state and
ordered sender are implemented under `data/activity`. This data module owns local
saving, cached activity and upload coordination for the user-facing features.
Features may import data; data uses shared infrastructure/contracts and cannot
import routes, features, components or theme. Shared components/lib/theme/platform
cannot import data or feature code. The stored journal envelope is unchanged.
Existing app screens still use the temporary compatibility flow. 07.3 owns
provider/lifecycle/screen wiring and warning/toast presentation; 07.4 owns Progress
composition. The
[07.2 handoff](handoffs/phase-07-2-local-sync.md) records version/durability rules,
retry/recovery interfaces, test evidence and open native checks. HTTP now preserves
validated reflection-conflict data and Retry-After; normal uploads have one retry
owner and use the existing coordinated authentication boundary.
