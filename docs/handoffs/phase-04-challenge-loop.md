# Phase 04 — Challenge deck & reliable attempts

## Snapshot

- **Status:** In progress — implementation and local verification complete; physical-device acceptance and staging deployment remain open. Phases 02/03 device gates remain open under the approved sequencing exception.
- **Updated / author:** September 27, 2026 / Codex, audited against the current Phase 04 branch after the September 25–27 follow-ups.
- **Scope:** [Plan phase 04](../IMPLEMENTATION_PLAN.md#phase-04), [current scope decisions](../PHASE_04_SCOPE.md), [61 reviewed placements](../CHALLENGES.md).
- **Dependencies:** [Phase 02](phase-02-identity.md), [phase 03](phase-03-app-shell.md).
- **Checkout:** `phase-04-challenge-loop`. Phase 04 was first handed off in `27c0064`; later commits include the card/content, success-navigation, deck-link and action-opacity corrections below.
- **Environment:** Node 24/npm 11, Expo 57.0.25 / React Native 0.86.3, PostgreSQL 17 local `justgo_test`. Existing EAS development binary `dev.justgo.foundation` on iPhone 17 Simulator / iOS 26.4. The Expo, build-properties, linking and router patch pins were updated after PR review; no new binary was built.
- **Result:** Six independent cycling venue decks, skip/accept, a recoverable server-deadline timer, direct give-up and confirmed Success use real authenticated local API/database data. The development preview uses presentation-only cards and the same full Success view. Normal deployed entitlement behavior remains closed until verified billing.

### Current UI and content — September 26

The initial visual reconstruction was insufficient: generic headings/pills,
replacement venue SVGs, regular rounded panels and a tall labeled navigation bar
did not preserve the Paper references. The implementation uses original extracted
artwork/flourishes, compact icon pills with separate 44pt touch targets, a centered
Bodoni 72 header, an uneven text panel, the original timer outline, and a 50pt
icons-only navigation row plus the device inset once. The current front, queued and
active cards share a fixed 220 × 273 frame before viewport scaling, 20/23 challenge
type, and matching surface/panel/artwork color variants. The text panel hugs short
copy; tighter interior spacing fits four normal-size lines without clipping. Both
bottom deck buttons were moved 8pt lower. Original illustration crops were aligned
per venue; the page/light-card color and texture were corrected. An absolute-fill
native View sizes the panel/timer SVGs correctly on iOS.

The 61 database placements and eight preview examples were checked on the iPhone 17
Simulator on September 26: each rendered in two to four lines inside its panel.
The catalog has ten placements per venue except Gym's eleven. The live queue rotates
all of them; the preview has three deliberately repeating fixtures per venue and
must not be used to assess live catalog variety. A new content batch needs a native
rendered-line audit at the standard font size, not a character-count-only check.
BC-10 was shortened in forward migration `0006_bc10_copy.sql`, retaining its v1
revision for history. The long preview example was shortened too.

The full Success view now matches the selected Paper layout: 262 × 246 illustration,
centered Baskerville heading and Inter message, and a bottom Continue button,
scaled from the 320pt reference. A confirmed live completion opens this same view
from the server-confirmed finish result while an owner-scoped lookup refreshes it;
Continue returns Home. The preview opens it on
Completed and returns to the preview on Continue, without saving activity.
The challenge cache subscription projects only its own account-scoped data
updates/removals, avoiding unrelated access-cache render notifications.

[CHALLENGE_FIDELITY.md](../CHALLENGE_FIDELITY.md) retains measured specifications,
source JSX and dated visual checks, including earlier 220 × 310 measurements that
describe the superseded layout. Browser drag and native buttons were exercised.
Native touch drags, Dynamic Type and VoiceOver remain unverified; Computer Use
drags did not advance the deck.

## What changed

| Path                                                                  | Behavior                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/challenges.ts`, `openapi.ts`                  | Strict six-venue, queue, start/skip/finish, attempt and recovery contracts; `ACCESS_REQUIRED` error.                                                                                                                          |
| `apps/api/drizzle/0004_challenge_loop.sql`                            | Stable Level 1, six venues, 58 immutable content revisions and 61 placements; per-account preference/queue/skip receipts and attempts; RLS, ownership, references, one-active constraint and indexes.                         |
| `apps/api/drizzle/0005_complete_attempt_fields.sql`                   | Requires non-null ending/elapsed fields for terminal outcomes; prevents SQL CHECK’s null semantics from permitting incomplete outcomes.                                                                                       |
| `apps/api/drizzle/0006_bc10_copy.sql`                                 | Adds `bc-10-v2` and points BC-10 at the shorter reviewed text; preserves `bc-10-v1` for historical attempts.                                                                                                                  |
| `apps/api/src/challenges/{service,routes}.ts`                         | Authenticated, entitlement-checked queue/state/attempt endpoints, owner-serialized writes and matching-input idempotency.                                                                                                     |
| `apps/api/scripts/challenge-dev.ts`                                   | Isolated, loopback-only development entrypoint supplying test entitlements against `justgo_test`; refuses Vercel/production/remote database targets.                                                                          |
| `apps/mobile/src/features/challenges/`                                | Native card window with original art and SVG panels, shared gesture/button animation, queue/action controller, deadline timer, direct outcome actions and the Paper-aligned `SuccessView`.                                    |
| `apps/mobile/src/features/shell/AppProvider.tsx`, Home/Success routes | Account clearing, foreground recovery, focused-route refresh and confirmed-result navigation. TanStack Query owns account-scoped server data; the controller keeps transient pending actions and a React snapshot projection. |
| `ScreenPreview.tsx`, `DeckPreview.tsx`, `preview-copy.ts`             | Isolated three-card-per-venue sample deck for presentation/motion, including long/short copy and the full Success view; no authenticated domain writes.                                                                       |
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
- Reviewed current text matches all 61 document placements exactly. Migration 0004 seeded 58 revisions; migration 0006 adds `bc-10-v2`, leaving 59 stored revisions with 58 currently referenced by placements. Historical BC-10 attempts keep v1. Identical wording otherwise shares a stable challenge/revision; variant wording stays distinct. All revisions use 300 seconds and null subtext. No level indicator, threshold, category expansion or progression tables.
- Queue order belongs to `(user_id, venue_id)`. Skip, completion and give-up move only that placement to the back. Repeating after cycling is a new acceptance/UUID. Retry receipts survive queue cycling and prevent a second rotation.
- Acceptance does not advance the queue. Start and finish transactions lock the account, recheck session/access and enforce matching input. A partial unique index also allows only one active attempt per user.
- Published revisions are immutable in PostgreSQL, including against migration-role accidental edits/deletes. Future content changes add a revision and repoint a placement; historical attempts retain their old revision.
- Start and deadline derive from one database timestamp. Zero clamps the display and awaits an explicit outcome. Navigation/relaunch never creates a replacement start. Completion freezes the database ending timestamp, supplied named IANA zone and local date. The elapsed-seconds storage described in this original handoff was removed by the September 29 scope change and migration 0009.
- Reps are distinct completed attempts. No aggregate counter exists yet. Give-up earns no rep. Finish replay with a different outcome or time zone conflicts.
- Pending mutations retain exact IDs/payloads across manual retry in memory. Unknown outcomes lock alternate actions and offer Retry save. On relaunch, canonical active/latest-outcome state resolves saved activity. The deck has no last-completion link; an owner-scoped completed attempt can still load through the Success route by ID. There is no offline journal or durable mutation queue.
- TanStack query keys are account scoped. Active/queue data stays in memory for the account session so cache garbage collection cannot clear an unattended timer. Account changes clear cache/actions and reject late results.
- Empty copy: “More small steps soon. There are no challenges here yet. Try another venue.” Only actual cards render for small queues.
- The production deck receives each venue's full queue (ten cards, Gym eleven) and renders a four-card window. The three rotating preview fixtures are independent of that queue. Check production variety through the authenticated route or database, not the preview.
- Give up is a direct save, with no confirmation panel. While a finish is being saved, both outcome controls retain their normal appearance but reject duplicate input. The active card remains visible until the confirmed rotated queue is available; on a queue-fetch failure, Retry save keeps the original outcome and time zone.
- Success reads the attempt from the server and displays completed outcomes only. Continue currently returns Home; phase 05 connects the real Reflection flow.
- Confirmed paid expiry blocks every paid challenge read/write, even finish. Existing records remain; essential identity/recovery controls are unchanged.

### Card motion

Three visible native cards and at most one incoming card. Distance threshold 80 points; velocity threshold 650 with matching direction and more than 12 points of travel. Post-release timing is 300 ms; cancelled swipes settle in 220 ms. Positions use 12-point horizontal / 9-point vertical / 4-degree increments. Each remaining card moves separately; the incoming card reveals during the overlap and carries the departing color with the next queued content. A keyed card layer survives queue promotion; the deck remains mounted across queue versions for the same account/venue/focus and rebases motion only after the acknowledged queue version renders. A failed save settles the same card back. Buttons share the gesture path and stay opaque during the temporary input lock. Reduce Motion suppresses travel/tilt; explicit buttons and front-card screen-reader text remain available. Back cards are hidden from accessibility. Focus or venue changes cancel an outgoing action.

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
- The prior deck remounted on each queue version and reset animation before React showed the new queue, causing a flash of the old card. Stable card layers and version-acknowledged motion remove that handoff; regressions cover delayed updates, failed saves and rapid input.
- The finish response previously exposed the just-ended card while the rotated queue was still loading. The controller now publishes the outcome and next queue together, including during recovery; the accepted surface/panel/artwork theme follows into the active card.
- The preview’s Completed action previously returned to the deck without showing Success. The preview and live route now share `SuccessView`; the preview still makes no domain writes.
- A confirmed completion cleared the active card before the navigation effect opened Success, leaving one render of the next deck visible. The challenge screen now holds the finished card and its original color until the Success route takes over. The destination uses the matching server-confirmed result while its owner-scoped lookup runs. Route regressions cover both gaps.
- Continue returns to the deck without a last-completion link. A focused-route refresh briefly blocks deck actions; those controls now retain full opacity instead of flashing pale. Regression tests cover both changes.
- Returning from Success with a native back action now clears the already shown result when Home regains focus, so it does not reopen Success. Re-renders during the initial handoff keep the confirmed result available to the destination. A focus-transition regression covers both cases.

## Verification evidence

| Command / scenario                            | Environment                                                  | Actual result                                                                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local migration state                         | PostgreSQL 17 `justgo_test`                                  | Migrations 0004–0006 are present locally; the database integration test reads BC-10 as v2 and its retained v1 text. No staging/production migration.                                                           |
| `npm run check`                               | Workspace, September 27 PR review follow-up                  | Passed: contract build, strict typecheck, ESLint, formatting, 127 mobile tests, 8 API unit tests and 8 contract tests.                                                                                         |
| `npm run test:db -w @justgo/api`              | Restricted runtime role, uniquely owned disposable fixtures  | 28 tests passed September 27, including 61 placement/BC-10 v2 and historical v1 checks.                                                                                                                        |
| Content comparison                            | Read-only parse of migrations 0004/0006 and CHALLENGES.md    | All 61 current placement texts match; 59 stored revisions, 58 referenced by current cards.                                                                                                                     |
| Production exports / Expo Doctor              | Expo 57.0.25 patch pins, one Metro worker                    | Web and iOS exports passed after the review fixes; Expo Doctor passed 21/21 checks. No new native binary was built.                                                                                            |
| Six venues and persistence                    | In-app browser, 390×844                                      | All six load; a Cafe skip remains advanced after other venue selections.                                                                                                                                       |
| Gesture/button flow                           | In-app browser                                               | Short drag cancels; committed left drag skips; right drag accepts; button actions enter the same flow.                                                                                                         |
| Network failure/retry                         | In-app browser + deliberately stopped local fixture API      | Failed start shows Retry save with alternate actions disabled; restarting the API and retrying starts one active attempt.                                                                                      |
| Give-up / completion                          | Earlier browser/iOS checks and current component regressions | Direct give-up waits for the rotated queue, then returns to the next card without Success. Completed opens the confirmed full Success view; Continue returns Home to the next card.                            |
| Deadline / canonical recovery                 | iOS Simulator                                                | Switching Progress/Home preserves the running timer; reaching zero remains active; terminating/relaunching the app restores the same expired card at 00:00; explicit completion then succeeds.                 |
| Small viewport                                | Earlier in-app browser check, 320×568                        | Outer screen scroll keeps both actions reachable; normal catalog copy fits its panel.                                                                                                                          |
| Native text audit                             | iPhone 17 Simulator, September 26                            | All 61 current database placements and eight preview examples rendered in two to four lines inside the panel. This does not verify larger accessibility text.                                                  |
| Success presentation                          | Current component tests; earlier Paper comparison            | Live and preview completed paths use the same full Success view. Tests cover illustration size, centered type, bottom button, route changes and preview Continue. Physical-device visual signoff remains open. |
| Completed → Success → deck                    | Codex side-panel iPhone 17 Simulator, local fixture API      | Native frames show the active card holding until Success; Continue returns to the next deck card without the last-completion link or pale action buttons.                                                      |
| Success native back → deck → new Success      | Codex side-panel iPhone 17 Simulator, September 27           | Edge swipe from Success returned to the next deck card without reopening Success. Accepting and completing another card opened its own Success; Continue returned to the deck.                                 |
| Reduced motion / accessibility / interruption | Component/model tests                                        | Button exclusion, hidden back-card text, one-card window, cancelled-threshold model, color/pose math, and navigation before action handoff are covered. This is not physical-device accessibility evidence.    |

Database coverage includes full stack cycling without attempts; independent shared placements; concurrent identical retries and competing device starts; exactly one completed rep/rotation; mismatched outcomes/time zones; deliberate repeats; after-zero elapsed time/local date; cross-account RLS and paid-expiry rejection. Client tests cover lost start/finish responses, stable retry bodies, one in-flight intent, canonical conflicts, account-change fencing, delayed queue promotion, color preservation, direct give-up and Success preview routing.

One earlier full mobile run timed out in the existing identity-screen suite while native/bundler work was busy; the focused suite and subsequent full run passed without timeout relaxation. The retained development binary was used for native UI checks; production exports do not substitute for a fresh release-like binary.

Native deck drag automation did not produce a card swipe in Simulator, so deck touch quality is **not verified**. The Success back edge swipe above did navigate successfully. Physical iPhone gestures, VoiceOver, dynamic type, Reduce Motion and lock/background lifecycle remain open. These are carried to release acceptance; no physical-device completion claim is made. Earlier UI screenshots and accessibility state were inspected without writing new test screenshots to the repository.

## Setup, data and operations

1. `npm ci`, `npm run db:local`, `npm run db:migrate`.
2. Run `npm run dev:challenges -w @justgo/api` instead of the normal API command for disposable local UI tests; run `npm run dev:web` or the existing development-client Metro command.
3. Create/recover a disposable account through the existing identity flow. The test server binds only `127.0.0.1:3000`; a physical phone needs an independently arranged reachable test environment, not a relaxed production entitlement guard.
4. Existing environment names remain `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `EXPO_PUBLIC_API_URL`; no new secret, feature flag, library or payment dependency.
5. Database tests refuse remote/non-`justgo_test` targets and clean only their own user fixtures. UI fixture accounts remain disposable local records; do not test with valuable personal history.
6. Before deployment, apply reviewed migrations in order with the migration role, deploy the API/contracts/mobile changes, and verify against a separately provisioned test entitlement reader. The ordinary API still returns unavailable until phase 07 supplies verified billing. Never deploy the local fixture entrypoint.
7. Prefer forward migrations/content revisions. Do not delete/rewrite attempts or immutable revisions to roll back a UI release. Older clients continue using existing identity/access endpoints. Deploy migrations 0004–0006 before the current challenge client so its routes, attempt state and reviewed BC-10 copy are available.
8. Owner/end-time and owner/active indexes support recovery and future bounded history queries. Phase 06 must add measured date/history indexes for its actual query shape; no premature aggregate or level-credit schema was added.

## Remaining work and next phase

| Item                                                                                                                                                     | Owner / gate                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Physical-iPhone gesture/timing, VoiceOver, large text, Reduce Motion and background/lock smoke; two-iPhone recovery/signing acceptance from phases 02/03 | Owner/device testing before external valuable-data testing and release                    |
| Apply migrations and deploy to the chosen staging environment; keep any test entitlement arrangement isolated                                            | Deployment follow-up, before external testing                                             |
| Reflection save/dismissal choices and real Success → Reflection continuation                                                                             | Phase 05                                                                                  |
| Progress aggregates/history                                                                                                                              | Phase 06; use completed attempt rows and frozen local date, never count saves/acceptances |
| RevenueCat/native subscription provider state                                                                                                            | Phase 07; retain immediate paid-expiry lock                                               |

Phase 05 should begin with the existing attempt contract and owner-scoped attempt lookup. Decide whether Continue opens the optional Reflection view directly and how skip/save/discard behave, then add only the feedback/reflection schema and versioned draft/final saves. Keep completion credit independent of whether a reflection is saved, and preserve the five unselected feeling choices, optional text and conflict/retry behavior specified in the plan. Reuse the shared `SuccessView` and link any new route to the same confirmed attempt ID; the current Continue action returns Home. Rerun `npm run check` and `npm run test:db`, then smoke start → completion → confirmed Success → Reflection and direct give-up separately. Preserve immutable revision/Level 1/venue history, matching-input retries, one active attempt, and the distinction between a deliberate repetition and a retry. The physical-device and staging gates above remain open while Phase 05 work begins.

## Record updates

Implementation plan, scope decisions, handoff index, PRD, tech stack, design guide, decision register and README are synchronized. This September 26 audit corrected the scope's give-up wording, the plan's local migration note and the handoff index's date. The historical HTML tracker is absent, so no browser-local completion state was claimed. Phase 04 remains in progress because device/dependency gates and deployment remain open.
