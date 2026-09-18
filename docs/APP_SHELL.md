# App shell and shared API

Phase 03 implements navigation and account/network infrastructure. Anthony deferred welcome screens and questionnaire onboarding on September 17, 2026. There is no onboarding state, answer collection, persistence or Zustand dependency. Challenge content/actions, reflections, history and billing arrive in their consuming phases.

## Routes and access

- `/`: restore the real account, then check `/v1/access`. Loading, unavailable and unpaid have distinct UI. Only a fresh, unexpired server verification admits the paid routes.
- `/(tabs)` and `/progress`: Home/Progress shells. No invented challenges, activity counts, history or mutation buttons.
- `/success` and `/reflection`: guarded focused route shells. They require future completed-attempt context; visiting a URL cannot fabricate a completion or save a reflection.
- `/settings` and `/recovery`: reachable regardless of paid access. The recovery route exposes Account / Recovery keys / Device transfer / Manage devices directly, with Return-key submission and automatic keyboard insets. It shares the one app-level identity controller; it does not create another vault or account.
- `/preview`: development-only presentation fixture. It has no domain queries or writes and never changes an account's entitlement. The route guard and module load both require `__DEV__`. There is no runtime flag, API parameter or production environment switch that unlocks it.

`AccessService` calls `IdentityService.withSession` and passes the same verified owner transaction into an entitlement reader. The default reader returns **unavailable** until phase 08 implements a verified billing projection. Tests inject readers only into isolated app instances. Mobile accepts a verification for at most 60 seconds and never past its expiry; checks repeat every 30 seconds and on foreground. A failed recheck closes access. Future premium mutation endpoints must enforce their own server entitlement checks; a navigation guard is not authorization.

Settings currently offers the existing recovery tools and an honest analytics-off notice. Privacy/export/deletion, reminders, billing purchases and final Settings rows remain later work.

## Request and state rules

`lib/http.ts` is the shared transport, including identity requests. It validates HTTPS (development loopback only may use HTTP), strict response schemas and typed errors. Tokens are restricted to headers/bodies. It never logs response bodies or transport messages. The full HTTP operation, including body parsing, has a maximum ten-second deadline and supports cancellation even if a transport ignores AbortSignal.

`lib/account-client.ts` owns the domain-request policy: at most two sends within one ten-second total budget, covering either a transient read retry or authentication replay. Writes never replay after a network/uncertain failure. Rate-limit, validation, conflict and revoked-session errors never trigger transient retries. An authentication replay reuses the original serialized body. Concurrent expired-session responses share one recovery operation; an already-rotated token is reused and there is no recursive recovery loop. The identity controller's persisted proposals preserve recovery/renewal idempotency.

TanStack Query 5.103.1 has query and mutation retries disabled, with in-memory caches only. Requests consume its abort signal. Query keys begin with `['account', userId, ...]`. Account loss or switching synchronously increments a generation, aborts pending requests and clears all queries/mutations before the next account appears. A late response is rejected even if the transport ignores cancellation. Account-local form state should be keyed/reset at the same boundary when those features are implemented. Automatic same-account expired-session recovery preserves the owner boundary; explicit recovery still clears it.

`stableAction(id, input)` snapshots a user action for manual retries. Generate its ID once, retain the action through an uncertain response, and enforce owner/matching-input idempotency in each future consuming endpoint. This helper alone is not server deduplication.

`lib/telemetry.ts` accepts only a small event-name allowlist and a consent state. It has no exporter or payload API. Nothing is transmitted, even with granted consent, until phase 09 approves privacy choices and provider configuration. Account changes reset consent.

## Contracts and extension points

`packages/contracts/src/access.ts` owns the access response and freshness predicate. `/openapi.json` serves OpenAPI 3.1 generated from the strict Zod access and identity contracts, including the transfer inspection/approval distinction. Add new contracts to `.vercelignore`'s exact upload allowlist before deploying.

Routes stay thin. Shared visual components use `theme/tokens.ts`; tab artwork uses the extracted Paper SVG paths. Navigation has no animation, so reduced-motion users receive the same behavior. Screen content scrolls with safe areas and scalable text. Do not use reference screenshots as screen backgrounds or treat their sample data as approved product content.

References checked: [Expo 57](https://docs.expo.dev/versions/v57.0.0/), [protected routes](https://docs.expo.dev/router/advanced/protected/), [query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation), [query retries](https://tanstack.com/query/latest/docs/framework/react/guides/query-retries), [Zod JSON Schema](https://zod.dev/json-schema). Use only SDK 57 APIs; the newer `redirectTo` and SDK 58 custom-navigator APIs are not used.
