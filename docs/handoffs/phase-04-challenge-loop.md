# Phase 04 — Challenge deck & reliable attempts

## Snapshot

- **Status:** In progress — implementation and local verification complete; physical-device acceptance and staging deployment remain open. Phases 02/03 device gates remain open under the approved sequencing exception.
- **Updated / author:** September 24, 2026 / Codex, implementing Anthony’s request.
- **Scope:** [Plan phase 04](../IMPLEMENTATION_PLAN.md#phase-04), [current scope decisions](../PHASE_04_SCOPE.md), [61 reviewed placements](../CHALLENGES.md).
- **Dependencies:** [Phase 02](phase-02-identity.md), [phase 03](phase-03-app-shell.md).
- **Checkout:** `main`, starting commit `0248178ac8de2071d5decdfa5f8ce431e1787800`; work is uncommitted. Existing owner edits to product/design/Apple/planning documents and generated design references were preserved.
- **Environment:** Node 24/npm 11, Expo 57.0.24 / React Native 0.86.3, PostgreSQL 17 local `justgo_test`. Existing EAS development binary `dev.justgo.foundation` on iPhone 17 Simulator / iOS 26.4. No dependency or native-configuration changes; no new binary built.
- **Result:** Six independent cycling venue decks, skip/accept, a recoverable server-deadline timer, confirmed give-up and Success now use real authenticated local API/database data. Normal deployed entitlement behavior remains closed until verified billing.

### Visual fidelity follow-up — September 24

The initial visual reconstruction was insufficient: generic headings/pills,
replacement venue SVGs, regular rounded panels and a tall labeled navigation bar
did not preserve the Paper references. The implementation now uses original
extracted artwork/flourishes, compact icon pills with separate 44pt touch targets,
a centered Bodoni 72 header, a reconstructed uneven peach panel, the exact timer
SVG, and a 50pt icons-only navigation row plus the device inset once. Cards use a fixed 220 × 310 frame (scaled for the viewport), smaller regular
20/23 challenge type, and an intrinsic peach text panel. Front, queued and active
faces share one coordinate system so the flourish does not jump on promotion.
Resting back cards have clean paper edges and reveal their text during swiping.
An absolute-fill native View sizes the peach/timer SVGs correctly on iOS. Backend/attempt behavior is unchanged. The browser pass also caught a render-time
notification from unrelated access-cache events; the challenge cache subscription
now projects only its own account-scoped data updates/removals, with a regression
test and a clean Settings → Preview → Exit replay.

[CHALLENGE_FIDELITY.md](../CHALLENGE_FIDELITY.md) records the measured specification,
font/contour reconstruction boundaries, source JSX, asset extraction and verification.
The development preview has all six reference texts, long/short-copy cases and
an isolated active challenge. `npm run check` passes with 82 mobile, 8 API and 8
contract tests; web/iOS production exports pass. Browser visual/flow checks pass
at reference and phone sizes. The iPhone 17 Simulator is now accessible: reference/long/short copy, button-driven
handoffs and active challenge were checked, exposing and verifying a native SVG
viewport fix. Native touch drags and Dynamic Type/VoiceOver remain unverified;
Computer Use drags did not advance the deck. Browser drag and native buttons pass.

## What changed

| Path                                                                  | Behavior                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/challenges.ts`, `openapi.ts`                  | Strict six-venue, queue, start/skip/finish, attempt and recovery contracts; `ACCESS_REQUIRED` error.                                                                                                                          |
| `apps/api/drizzle/0004_challenge_loop.sql`                            | Stable Level 1, six venues, 58 immutable content revisions and 61 placements; per-account preference/queue/skip receipts and attempts; RLS, ownership, references, one-active constraint and indexes.                         |
| `apps/api/drizzle/0005_complete_attempt_fields.sql`                   | Requires non-null ending/elapsed fields for terminal outcomes; prevents SQL CHECK’s null semantics from permitting incomplete outcomes.                                                                                       |
| `apps/api/src/challenges/{service,routes}.ts`                         | Authenticated, entitlement-checked queue/state/attempt endpoints, owner-serialized writes and matching-input idempotency.                                                                                                     |
| `apps/api/scripts/challenge-dev.ts`                                   | Isolated, loopback-only development entrypoint supplying test entitlements against `justgo_test`; refuses Vercel/production/remote database targets.                                                                          |
| `apps/mobile/src/features/challenges/`                                | Native card window with original decorative artwork and SVG panel shapes, shared gesture/button animation, queue/action controller, deadline timer, confirmation and Success.                                                 |
| `apps/mobile/src/features/shell/AppProvider.tsx`, Home/Success routes | Account clearing, foreground recovery, focused-route refresh and confirmed-result navigation. TanStack Query owns account-scoped server data; the controller keeps transient pending actions and a React snapshot projection. |
| `ScreenPreview.tsx`, `DeckPreview.tsx`                                | Isolated sample deck for presentation/motion; no authenticated domain writes.                                                                                                                                                 |
| `theme/tokens.ts`, `docs/DESIGN.md`                                   | Central card palette/shadow and the user’s seven Paper references; native reconstruction uses real text/vector components.                                                                                                    |
| Tests and documentation                                               | Database concurrency/isolation tests, client failure/recovery and deck tests, synchronized scope/tracker/handoff and local fixture instructions. Generated `output/` design artifacts are excluded from source formatting.    |

### API

Every route below requires the current bearer session and verified server entitlement. Owner IDs, start/deadline timestamps and completion dates cannot be supplied by the client.

- `GET /v1/challenges/state`: selected venue, active attempt, latest outcome and database clock time.
- `GET /v1/challenges/queue/:venue`: ordered placements plus queue version.
- `POST /v1/challenges/venue`: persist manual selection.
- `POST /v1/challenges/skip`: action UUID plus placement/revision/venue/version; rotate once without an attempt.
- `POST /v1/challenges/start`: attempt UUID plus the same selection; persist one active attempt and its original server deadline.
- `POST /v1/challenges/finish`: attempt UUID, `completed` or `given_up`, and named IANA time zone.
- `GET /v1/challenges/attempt/:id`: owner-scoped confirmed result, used by Success.

Conflicting input/state returns 409; invalid contracts 400; an unknown/other-owner attempt 404; confirmed unpaid access 403; unavailable verification 503. Identity session errors preserve the existing shared renewal/revocation behavior.

## Decisions and invariants

- Approved venues: Streets, Park, Gym, Cafe, Bookstore and Bars & Clubs. Implementation default is Streets; persist later manual selection. No GPS or All/Anywhere option.
- Reviewed text matches all 61 document placements exactly. Identical wording shares a stable challenge/revision (58 revisions); variant wording stays distinct. All revisions use 300 seconds and null subtext. No level indicator, threshold, category expansion or progression tables.
- Queue order belongs to `(user_id, venue_id)`. Skip, completion and give-up move only that placement to the back. Repeating after cycling is a new acceptance/UUID. Retry receipts survive queue cycling and prevent a second rotation.
- Acceptance does not advance the queue. Start and finish transactions lock the account, recheck session/access and enforce matching input. A partial unique index also allows only one active attempt per user.
- Published revisions are immutable in PostgreSQL, including against migration-role accidental edits/deletes. Future content changes add a revision and repoint a placement; historical attempts retain their old revision.
- Start and deadline derive from one database timestamp. Zero clamps the display and awaits an explicit outcome. Navigation/relaunch never creates a replacement start. Completion freezes the database ending timestamp, supplied named IANA zone and local date; elapsed seconds include background time and time after zero.
- Reps are distinct completed attempts. No aggregate counter exists yet. Give-up earns no rep. Finish replay with a different outcome or time zone conflicts.
- Pending mutations retain exact IDs/payloads across manual retry in memory. Unknown outcomes lock alternate actions and offer Retry save. On relaunch, canonical active/latest-outcome state resolves saved activity; the last-completion link can reopen Success. There is no offline journal or durable mutation queue.
- TanStack query keys are account scoped. Active/queue data stays in memory for the account session so cache garbage collection cannot clear an unattended timer. Account changes clear cache/actions and reject late results.
- Empty copy: “More small steps soon. There are no challenges here yet. Try another venue.” Only actual cards render for small queues.
- Success reads the attempt from the server and displays completed outcomes only. Continue currently returns Home; phase 06 connects the real Reflection flow.
- Confirmed paid expiry blocks every paid challenge read/write, even finish. Existing records remain; essential identity/recovery controls are unchanged.

### Card motion

Three visible native cards and at most one incoming card. Distance threshold 80 points; velocity threshold 650 with matching direction and more than 12 points of travel. Post-release timing is 300 ms; cancelled swipes settle in 220 ms. Positions use 12-point horizontal / 9-point vertical / 4-degree increments. Each remaining card moves separately; the incoming card reveals during the overlap and carries the departing color with the next queued content. Buttons share this path. Reduce Motion suppresses travel/tilt; explicit buttons and front-card screen-reader text remain available. Back cards are hidden from accessibility. A focus/venue/version change cancels the outgoing component before it can submit an interrupted action.

## Problems encountered and fixes

- PostgreSQL/Drizzle raw result timestamps are strings on this path; normalize through `Date` before ISO serialization.
- PostgreSQL array parameters needed explicit JSON-to-text-array conversion for queue storage.
- A persistent static identity-test rate bucket made repeated database suites eventually hit 429; each integration run now has an independent test rate key.
- A horizontal React Native ScrollView expanded venue pills vertically; explicit height and flex sizing fixed it.
- An empty string conditional inside a View produced browser text-node errors; use a boolean conditional. Transient Fast Refresh import errors cleared after the token module was complete.
- Clock-offset changes between renders could briefly show 05:01; cap remaining seconds to the immutable duration. Added a regression test.
- Terminal SQL CHECK fields needed explicit non-null checks; migration 0005 and a database rejection test cover this.
- Named-zone validation rejects numeric offsets accepted by modern Intl; database local-date semantics remain unambiguous.
- Success result state is keyed to its route attempt ID, so loading/failure for a new ID cannot retain the previous celebration; regression tests cover route changes and non-completed outcomes.
- Decorative medal uses centered placement and multiply blending; use Image’s resizeMode prop to avoid the browser deprecation warning.

## Verification evidence

| Command / scenario                            | Environment                                                  | Actual result                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run db:migrate`                          | Local PostgreSQL 17, migration role                          | Migrations 0004 and 0005 applied. No staging/production migration.                                                                                                                                          |
| `npm run check`                               | Workspace                                                    | Passed: contract build, strict typecheck, ESLint, formatting, 75 mobile tests, 8 API unit tests and 8 contract tests.                                                                                       |
| `npm run test:db -w @justgo/api`              | Restricted runtime role, uniquely owned disposable fixtures  | 28 tests passed: 7 challenge tests plus 21 existing database/identity tests.                                                                                                                                |
| Content comparison                            | Read-only comparison of migration seed against CHALLENGES.md | All 61 placement texts match exactly; 58 unique immutable revisions.                                                                                                                                        |
| Production exports                            | Expo web/iOS, one Metro worker                               | Web and iOS production exports both passed (`--max-workers 1`); no native binary rebuilt.                                                                                                                   |
| Six venues and persistence                    | In-app browser, 390×844                                      | All six load; a Cafe skip remains advanced after other venue selections.                                                                                                                                    |
| Gesture/button flow                           | In-app browser                                               | Short drag cancels; committed left drag skips; right drag accepts; button actions enter the same flow.                                                                                                      |
| Network failure/retry                         | In-app browser + deliberately stopped local fixture API      | Failed start shows Retry save with alternate actions disabled; restarting the API and retrying starts one active attempt.                                                                                   |
| Give-up / completion                          | Browser and iOS Simulator                                    | Keep trying preserves the active card; confirmed give-up returns the next card without Success; completed outcome opens confirmed Success and Continue returns to the next card.                            |
| Deadline / canonical recovery                 | iOS Simulator                                                | Switching Progress/Home preserves the running timer; reaching zero remains active; terminating/relaunching the app restores the same expired card at 00:00; explicit completion then succeeds.              |
| Small viewport                                | In-app browser, 320×568                                      | Card/text scroll and both actions/last-completion link remain reachable.                                                                                                                                    |
| Reduced motion / accessibility / interruption | Component/model tests                                        | Button exclusion, hidden back-card text, one-card window, cancelled-threshold model, color/pose math, and navigation before action handoff are covered. This is not physical-device accessibility evidence. |

Database coverage includes full stack cycling without attempts; independent shared placements; concurrent identical retries and competing device starts; exactly one completed rep/rotation; mismatched outcomes/time zones; deliberate repeats; after-zero elapsed time/local date; cross-account RLS and paid-expiry rejection. Client tests cover lost start/finish responses, stable retry bodies, one in-flight intent, canonical conflicts and account-change fencing.

One earlier full mobile run timed out in the existing identity-screen suite while native/bundler work was busy; the focused suite and subsequent full run passed without timeout relaxation. The retained development binary was used for native UI checks; production exports do not substitute for a fresh release-like binary.

Native drag automation did not produce a touch swipe in Simulator, so native touch quality is **not verified**. Physical iPhone gestures, VoiceOver, dynamic type, Reduce Motion and lock/background lifecycle remain open. These are carried to release acceptance; no physical-device completion claim is made. No new test screenshots were written to the repository; UI screenshots and accessibility state were inspected in this task.

## Setup, data and operations

1. `npm ci`, `npm run db:local`, `npm run db:migrate`.
2. Run `npm run dev:challenges -w @justgo/api` instead of the normal API command for disposable local UI tests; run `npm run dev:web` or the existing development-client Metro command.
3. Create/recover a disposable account through the existing identity flow. The test server binds only `127.0.0.1:3000`; a physical phone needs an independently arranged reachable test environment, not a relaxed production entitlement guard.
4. Existing environment names remain `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `EXPO_PUBLIC_API_URL`; no new secret, feature flag, library or payment dependency.
5. Database tests refuse remote/non-`justgo_test` targets and clean only their own user fixtures. UI fixture accounts remain disposable local records; do not test with valuable personal history.
6. Before deployment, apply reviewed migrations in order with the migration role, deploy the API/contracts/mobile changes, and verify against a separately provisioned test entitlement reader. The ordinary API still returns unavailable until phase 08 supplies verified billing. Never deploy the local fixture entrypoint.
7. Prefer forward migrations/content revisions. Do not delete/rewrite attempts or immutable revisions to roll back a UI release. Older clients continue using existing identity/access endpoints; new challenge clients require migration 0004–0005 and the new routes.
8. Owner/end-time and owner/active indexes support recovery and future bounded history queries. Phase 07 must add measured date/history indexes for its actual query shape; no premature aggregate or level-credit schema was added.

## Remaining work and next phase

| Item                                                                                                                                                     | Owner / gate                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Physical-iPhone gesture/timing, VoiceOver, large text, Reduce Motion and background/lock smoke; two-iPhone recovery/signing acceptance from phases 02/03 | Owner/device testing before external valuable-data testing and release                    |
| Apply migrations and deploy to the chosen staging environment; keep any test entitlement arrangement isolated                                            | Deployment follow-up, before external testing                                             |
| Reflection save/dismissal choices and real Success → Reflection continuation                                                                             | Phase 06                                                                                  |
| Progress aggregates/history and duration formatting                                                                                                      | Phase 07; use completed attempt rows and frozen local date, never count saves/acceptances |
| RevenueCat/native subscription provider state                                                                                                            | Phase 08; retain immediate paid-expiry lock                                               |

Phase 06 should begin with the existing attempt contract and owner-scoped attempt lookup, decide reflection save/dismissal semantics, then introduce only its feedback/reflection schema. Rerun `npm run check` and `npm run test:db`, and smoke a start → completion → confirmed Success before adding feedback. Preserve immutable revision/Level 1/venue history, matching-input retries, one active attempt and the distinction between a deliberate repetition and a retry.

## Record updates

Implementation plan, scope decisions, handoff index, PRD, tech stack, design guide, decision register and README are synchronized. The historical HTML tracker is absent, so no browser-local completion state was claimed. Phase 04 remains in progress because device/dependency gates and deployment remain open.
