# Implemented technology stack

This guide names the installed technologies and why the hosting and database
boundaries look the way they do. The lockfile and workspace manifests own exact
versions. [IDENTITY.md](IDENTITY.md) owns accounts, sessions, deletion and
database grants. [ACTIVITY_DATA.md](ACTIVITY_DATA.md) owns activity data and
synchronization. [APP_SHELL.md](APP_SHELL.md) owns the mobile runtime lifecycle,
navigation, access and error-reporting rules.
[ACCOUNT_SYNC_SETUP.md](../operations/ACCOUNT_SYNC_SETUP.md) lists the provider
settings. Open release gates are
[`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate).

## Workspaces and runtimes

The npm workspace holds the Expo app in `apps/mobile`, the Hono API in `apps/api`
and the public Zod contracts in `packages/contracts`. The root manifest, `.nvmrc`
and the lockfile pin Node 24 and npm 11.

| Responsibility                   | Installed technology                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| Mobile runtime                   | Expo SDK 58, React 19, React Native 0.88, strict TypeScript                                   |
| Navigation and native builds     | Expo Router, development client, EAS configuration, Continuous Native Generation              |
| Native gestures and motion       | Gesture Handler, Reanimated 4, compatible Worklets                                            |
| UI, art and detail sheets        | React Native StyleSheet/tokens, SVG, Expo Image/Font, Gorhom Bottom Sheet, safe-area context  |
| Remote reads                     | TanStack Query 5, account-scoped in-memory queries                                            |
| Live activity state              | Zustand 5 without persistence middleware                                                      |
| Completion/cache persistence     | AsyncStorage 2 with versioned completion/catalog/deck-preference envelopes                    |
| Private journal persistence      | Expo SQLite 58 with per-account databases; IndexedDB development-browser adapter              |
| Connectivity and saving feedback | NetInfo, Sonner Native and the Sonner web adapter                                             |
| Optional account sign-in         | Supabase Auth, native Expo Apple Authentication and original Google Sign-In integration       |
| Managed session storage          | Chunked Expo SecureStore; legacy Swift Keychain proofs retained for internal migration        |
| Optional personal cloud copy     | Local Swift Expo module using Apple's private CloudKit database                               |
| Haptics                          | Pulsar 1, gated behind the iPhone TurboModule and saved installation preference               |
| Complete data download/import    | fflate ZIP, Expo FileSystem/native sharing, DocumentPicker import, browser Blob/file adapters |
| Error reporting                  | Sentry React Native 8 (Cocoa 9) for errors only; built-in `fetch` on the API                  |
| API                              | Hono 4, Workers / Node adapters, TypeScript and structured allowlisted diagnostics            |
| Database                         | PostgreSQL, Drizzle ORM and `pg`                                                              |
| Shared contracts                 | Zod 4 request/response schemas, types and OpenAPI 3.1                                         |
| Automated checks                 | Jest/jest-expo and React Native Testing Library; Vitest; Playwright; Node test runner         |

The app targets iOS first. Web adapters serve previews and browser journeys, and
the Android release stays deferred. A JavaScript export does not prove native
modules, Keychain behavior or device acceptance. A native module or configuration
change needs a new binary, because EAS Update ships only JavaScript and assets
that the installed runtime supports.
[APP_SHELL.md](APP_SHELL.md#app-error-reporting) explains why iOS Expo modules
compile from source.

## API hosting and database access

The API's Node entrypoint (`src/server.ts`) and Workers entrypoint
(`src/worker.ts`) share one Hono runtime. Anthony retired the Workers rollout,
and the [Phase 15 plan](../implementation-plan/phase-15-supabase-api.md) moves
the API to one Supabase Edge Function. Until that plan's last PR, two staging
hosts serve the API against the one Supabase project. Vercel serves the old
Fastify source `311f073` to installed build 5 and the Dev profile, and the
Worker serves Hono to the beta profile. No production API is provisioned.
[Server releases](../operations/SERVER_RELEASES.md) owns hosted configuration.

Supabase hosts PostgreSQL and the optional Apple and Google Auth. Mobile uses the
Auth SDK only for provider sessions and reaches application data only through the
Hono API, never through database tables.

- Node reuses a small `pg` pool. Workers open a one-connection pool per request,
  and Hyperdrive pools upstream with query caching off.
- Managed requests take no advisory locks. Only legacy bootstrap and transfer
  requests do, and the Worker sends those to a direct connection only against
  loopback `justgo_test`. [IDENTITY.md](IDENTITY.md) owns the details.
- The restricted `justgo_runtime` role serves requests. Migrations use a separate
  connection and the `justgo_migrator` role.
- Hard Auth deletion uses a separate server-only administrative client. Neither it
  nor the live-session helper gives mobile a database grant.

Authenticated services run through `IdentityService.withSession`, which keeps the
verified owner and the domain operation in one transaction.
[IDENTITY.md](IDENTITY.md) owns the transaction, grant and retention rules.

## HTTP contracts and diagnostics

Only the API imports `@justgo/contracts/openapi`, so mobile never loads the
generated document. When a contract changes, change route validation, statuses,
client parsing and OpenAPI together. `apps/api/tests/http/openapi.test.ts` checks
only that documented methods match registered routes. Invalid requests keep their
4xx status, and transient service failures return 503.

Sentry projects `anthony-corp` / `justgo-api` and `anthony-corp` /
`justgo-mobile` are in the US region. Delivery is off in both until matching
notices, provider review and signed-build or hosted acceptance (gates
[#92](https://github.com/anthonyyoo24/justgo/issues/92) for mobile and
[#93](https://github.com/anthonyyoo24/justgo/issues/93) for the API).
[APP_SHELL.md](APP_SHELL.md#app-error-reporting) has the reporting rules and the
owner's approved scope.

## Access and disabled integrations

Access is an injected verified-owner boundary whose default provider is
unavailable. Signing in grants no entitlement.
[APP_SHELL.md](APP_SHELL.md#access-verification) has the guest, beta and
upload-eligibility rules. `useAccessState` and `serverClockOffset` in
`apps/mobile/src/app-support/access/verification/` own the access poll, which
runs every 30 seconds, the verification lifetime and the server clock alignment.

Superwall billing is unbuilt.
[Phase 16](../implementation-plan/phase-16-billing.md) owns its scope, and its
technical design is redone when the phase starts.

Product analytics is uninstalled and stays disabled through beta and paid launch.
[Phase 17](../implementation-plan/README.md#unscheduled-roadmap) must review the
real permission and collection design before activation. Continue and old legal
receipts grant no analytics permission, so do not restore the removed tracking or
version gates.

Questionnaire onboarding, reminders, custom dictation, lock-screen display and
progression stay deferred. A plan that names them does not mean their
dependencies, tables or behavior exist.

## CI and dependencies

A first `changes` job decides whether the app jobs run, so a pull request that
changes only Markdown runs only `static`. The `checks` job accepts those skips and
fails on any other failed, skipped or cancelled job.
`scripts/quality/ci-workflow.test.mjs` owns the rest of the job shape and the SHA
pins. Write each action's version in a comment after its SHA. A local pass does
not prove a hosted pass, so read each stacked branch's own run.

Never hide a live Expo Doctor metadata change with offline mode or exclusions.
`npm run audit:api` covers only the API's production graph, not mobile or tooling
dependencies. CodeRabbit's docstring-coverage percentage is not a repository gate.
