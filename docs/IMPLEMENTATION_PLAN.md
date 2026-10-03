# JustGO — Implementation Plan

**Version:** 20 · Updated October 3, 2026

**Status:** Phase 01 complete. Phase 02 identity is implemented with passing browser/backend checks; native recovery smoke has passed and physical-device acceptance remains pending. See the [phase 02 handoff](handoffs/phase-02-identity.md).  
Phase 04 implementation now passes local automated/browser checks and native button/relaunch checks; physical-device acceptance and deployment remain open. See the [phase 04 handoff](handoffs/phase-04-challenge-loop.md).
Phase 06 Progress/history passes local automated and simulator checks, including a live day with 21 entries, automatic paging and both retry states. Physical-device acceptance is scheduled for release validation after the app is built; staging deployment is an integration/release task. See the [phase 06 handoff](handoffs/phase-06-progress.md).
The next implementation phase is [06A — Code quality & test hardening](#phase-06a), planned before API/offline changes and billing. It covers existing functionality; implementation has not started.

**Tracker:** This Markdown file is authoritative. The historical HTML companion is not present in this checkout.  
**Sources:** [PRD](PRD.md) · [Tech stack](TECH_STACK.md)  
**Handoffs:** [Index](handoffs/README.md) · [Template](handoffs/TEMPLATE.md) · [Planning baseline](handoffs/00-planning-baseline.md)

This authoritative Markdown plan contains eleven iOS release stages, including the quality phase 06A and separate billing phase 07A, and three deferred stages. Each phase defines what to implement, what to exclude, its completion checks and the context to hand forward.

**First release:** iOS, one easy Level 1 challenge collection with manual venue filtering, the in-app timer, Success, typed reflections, the full Progress summary/calendar/day sheet, native subscriptions, and essential Settings/privacy/recovery.

**Deferred:** Welcome screens and questionnaire onboarding (owner decision September 17), Levels and progression rules, additional category filters, custom dictation, lock-screen display, Android release, Stripe and AI coaching. Stable challenge/revision/Level 1 history is kept now; thresholds and how prior completions count are decided later.

**September 26 numbering correction:** The launch path now runs in number order, 01–09. Former phases 06–10 are now 05–09; the deferred lock-screen phase moves from 05 to 10. Post-launch phases 10–12 may be scheduled independently. Historical browser tracker exports use the former IDs and must not be imported without an explicit migration. Phase 01 is complete; see the stage table for current implementation status.

**September 30 quality-phase insertion:** Anthony approved planning code-quality and test hardening as the next phase after the local Progress implementation. Use 06A between 06 and 07 to preserve existing phase IDs and handoff references. API route and persistence redesign is being discussed separately; it is outside this phase's scope.

**October 1 API discussion record:** Anthony requested that confirmed API/persistence decisions be retained for Phase 07 while the discussion continues. The Phase 07 decision record below captures those confirmations and leaves unresolved choices explicitly pending. It changes planned future behavior, not the currently implemented Phase 04–06 behavior. Phase 06A still preserves current interfaces. Finalize the remaining choices and Phase 07 tasks in this plan before dependent implementation; do not use older recovery/draft/server-deck requirements to undo the recorded confirmations. The October 2 documentation sequence below replaces the earlier requirement to reconcile the other specifications before implementation.

**October 2 supersession:** Anthony selected immediate device-persisted completion/reflection flows using AsyncStorage, with offline recording from locally available challenges/data and automatic background uploads. This replaces the earlier server-confirmed Success gate, network loading/error states for uploads, manual Retry buttons and pending-upload Home notices. Persist downloaded challenges, progress summaries, loaded months and fetched day details; hydrate available data on launch and refresh/save it in the background when online. No exhaustive day prefetch is requested, pending uploads must never be evicted, and uncached offline months/day details need visible connection-required states. API paths identify resources rather than actions. The latest reflection decision replaces separate reflection resources/table/routes: migrate feeling/text/revision onto attempts and use PATCH /v1/attempts/:id for initial reflection submission and later text edits. Return nested reflection content or null; keep existing feelings unchanged and retain revision protection. Challenge content revision references/table are also scheduled for removal under the live-wording/stable-challenge-ID rule. The current Phase 07 record below is authoritative for this planned behavior. Phase 06A still preserves the implementation it is refactoring.

**October 2 planning/documentation sequence:** Anthony selected separate Progress summary and month-calendar endpoints. Finalize the decisions and ordered Phase 07 implementation plan first, implement and verify that settled plan next, then align the PRD, tech stack, decision register, design/app-shell/scope/identity guidance, learning map and relevant handoffs with the actual result. Only this plan is being updated during the current discussion; the other documents remain descriptions of the existing implementation until the end-of-phase reconciliation. Shared runtime contracts/OpenAPI and their callers must still change together with the API implementation. Recommendations below remain proposals until accepted; this sequencing does not authorize beginning application/schema implementation during the discussion.

**October 3 confirmations:** Anthony accepted the summary/calendar/day endpoint paths below; reflection patches that preserve feelings, check the expected revision and recognize repeated submissions; retaining the complete downloaded challenge catalog/latest summary with measured limits for older history caches; coordination of local/backend progress without duplicate counts or regression; validation before submission with rejected content retained for correction; and preserving existing historical activity dates while applying the start-date rule to new reps. Later October 3 decisions below settle subscription behavior and exclude a multi-phone reflection conflict workflow. Actual local-storage failure handling remains under discussion. These confirmations update the Phase 07 plan only.

**October 3 subscription and scope update:** Anthony approved all nine subscription rules recorded below: first API verification; account-scoped saved status/expiry/last-check time; immediate access from still-valid saved verification; event-driven checks when missing or more than five minutes old; immediate purchase/restore verification; no 30-second polling or one-minute cutoff; retained valid access through network failures; online renewal verification at expiry; and authenticated, owner-checked uploads of earlier valid-access reps after expiry. Do not build a two-phone conflict chooser/merge workflow. Preserve the already-approved revision/replay protection and ordered uploads within one device. Anthony is considering narrower offline history support. His latest proposal adds the saved Progress summary, current month's calendar counts and today's day-sheet activity to offline challenge/completion/reflection recording; other months/day details require a connection. This limited current-period cache is a proposal, not yet a replacement for the previously confirmed broader downloaded-history persistence. The earlier alternative making all Progress online-only was not selected.

**October 3 implementation-plan draft (before the billing split below):** Anthony requested recommended solutions and concrete implementation tasks. The combined Phase 07 draft included a proposed technical design and twelve ordered steps with verification. The draft uses limited current-period offline Progress and an inline local-storage failure fallback as recommendations awaiting review. Routine contract/storage/migration choices are specified as an engineering baseline; they do not require the owner to choose arbitrary field names. No application, dependency or database changes have begun, and the approved plan-first/implementation/documentation sequence remains in force.

**October 3 billing-phase separation:** Anthony requested a separate phase for native billing. Phase 07 now contains the API, data-model, client-state and offline-saving redesign only. Phase 07A — Native subscriptions & reliable billing follows 07 and precedes 08; it owns purchases/restore, all nine confirmed subscription rules, subscription notifications, QStash delivery and scheduled billing recovery. Existing later phase IDs remain unchanged. The combined twelve-step draft is split into ten Phase 07 steps and five Phase 07A steps below. Phase 07 uses isolated access/provider test seams; production paid access and verified earlier-upload eligibility are connected and accepted in 07A, with no production bypass. Earlier references to billing in Phase 07 are superseded by this split. Only this plan changes now; reconcile the handoff index and other documents with each implemented phase under the approved documentation sequence. The new handoff placeholders replace the uncreated `phase-07-billing.md` placeholder; no saved handoff is renamed. This planning edit does not authorize application/schema implementation.

## How to use this plan

- Build each slice through the database, API and UI it needs; introduce tables and indexes with their consuming feature.
- Run relevant tests and UI verification during every phase. Phase 09 integrates and releases work already verified in its own stage.
- **September 29 validation timing:** Anthony will do physical-iPhone acceptance after the full app is built, during release validation. Earlier feature phases use local automated checks and the iOS simulator; carry device-specific VoiceOver, large-text, gesture and recovery checks to Phase 09. Stage the integrated API/mobile build before release, without treating staging as a Phase 06 feature gate.
- **September 30 quality-phase sequencing:** Phase 06A may start and complete against verified local implementations from phases 02–06 while their previously deferred physical-device and staging gates remain open. Preserve those gates in their original handoffs and Phase 09; they do not block 06A. Phase 07 implementation follows the 06A handoff.
- Mark a phase complete only after its checks and dependency phases pass, and its handoff is saved with evidence.
- **September 17 sequencing exception:** Anthony approved implementing phase 02 while Apple enrollment/signing and physical-iPhone recovery acceptance remain pending. Phase 03 and later feature implementation may proceed after the backend/client identity checks pass. Keep phase 02 open and retain those device gates before valuable-data external testing and release.
- **September 17 scope revision:** Anthony deferred welcome/questionnaire onboarding and authorized phase 02 follow-up plus phase 03 app-shell work. Build the existing screens first; onboarding is not a prerequisite for this phase. Paid access is now Phase 07A under the October 3 phase split.
- **September 21 scope revision:** Venue selection/filtering is included in phase 04: Street & Park, Gym, Café & Bookshop, Bar & Party, and Errands & Transit. The level-progress indicator is omitted until levels ship. See [current phase 04 decisions](PHASE_04_SCOPE.md), which supersede the earlier general-only scope. Anthony reports Apple Developer enrollment complete; signing/device verification remains open.
- **September 24 phase 04 revision:** The current venues are Streets, Park, Gym, Cafe, Bookstore, and Bars & Clubs, with independent cycling stacks and top venue pills. Use the original 39O fanned deck, omit challenge subtext, and implement the gesture/motion specification below with the existing libraries. These decisions supersede the earlier grouped venues and no-replay rules for phase 04.
- Update this file and the handoff index when recording progress. The historical HTML checklist is absent from this checkout and cannot update this Markdown file or the handoffs.
- If the HTML checklist is restored, migrate its phase IDs and saved exports before using it. Saved handoffs and actual implementation/test evidence remain authoritative.

## Stage overview

| Phase                                                       | Outcome                                                                                                         | Depends on | Status        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------- | ------------- |
| [01 — Foundation & implementation decisions](#phase-01)     | A reproducible workspace and a clear list of decisions to settle before each feature.                           | None       | Complete      |
| [02 — No-signup identity & recovery](#phase-02)             | A real account survives supported recovery paths, without exposing another person’s history.                    | 01         | In progress   |
| [03 — App shell & shared API](#phase-03)                    | The app restores the right account and provides consistent navigation and network behavior.                     | 02         | In progress   |
| [04 — Challenge deck & reliable attempts](#phase-04)        | Browse → accept → complete or give up works against real cloud data exactly once.                               | 03         | In progress   |
| [05 — Feelings & typed reflections](#phase-05)              | A completed attempt can have optional private feedback and typed reflection text.                               | 04         | In progress   |
| [06 — Progress calendar & saved history](#phase-06)         | Users can view the full Progress summary/calendar and read day details and saved reflections.                   | 05         | In progress   |
| [06A — Code quality & test hardening](#phase-06a)           | Existing code is easier to understand and change, with meaningful regression tests and durable coding guidance. | 06 (local) | Not started   |
| [07 — API & offline saving](#phase-07)                      | Completions/reflections display after local saving and synchronize reliably through resource APIs.              | 06A        | Not started   |
| [07A — Native subscriptions & reliable billing](#phase-07a) | Verified purchases unlock promptly, and later subscription changes recover reliably.                            | 07         | Not started   |
| [08 — Settings, privacy & measurement](#phase-08)           | Users control recovery, private data and preferences; useful measurement respects their choices.                | 07A        | Not started   |
| [09 — Release validation & launch](#phase-09)               | The complete paid product is verified, operable and ready for store submission.                                 | 08         | Not started   |
| [10 — Lock-screen countdowns](#phase-10)                    | The same accepted challenge is visible on supported lock screens without a JavaScript background timer.         | 09         | Not scheduled |
| [11 — Optional US iOS web checkout](#phase-11)              | Eligible users can purchase on the web using the same authenticated app identity.                               | 09         | Not scheduled |
| [12 — Future AI text coach](#phase-12)                      | A separately approved text coach uses bounded, permitted context in the existing backend.                       | 09         | Not scheduled |

Release order: 01 → 02 → 03 → 04 → 05 → 06 → 06A → 07 → 07A → 08 → 09. Apple account and purchase-product preparation starts during 01 alongside development. Lock-screen timers (10), Stripe (11) and coaching (12) follow release when scheduled; none blocks the first submission or depends on another later phase.

## Decisions to settle before dependent work

These remain open in PRD §13. Resolve each with the product owner and update the PRD and relevant handoff. Foundation and identity work can proceed while later content decisions are being made.

| Decision                        | Before phase                | What needs an answer                                                                                                                                       |
| ------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding content              | Deferred                    | Welcome/questionnaire flow deferred by Anthony; revisit scope and designs separately. No phase 03 gate.                                                    |
| Launch catalog                  | 04                          | Settled: CHALLENGES.md supplies 61 placements in six venues; five minutes, no displayed subtext. Seeded by phase 04. CURRICULUM.md remains a future draft. |
| Deck counter                    | 04                          | Settled: omit level progress; each venue cycles. New accounts start in Streets. Empty venues offer another venue; see PHASE_04_SCOPE.md.                   |
| Future levels                   | Later; not a launch blocker | Thresholds, unlocking/skipping, historical-credit policy and later taxonomy; retain Level 1 history now without implementing progression.                  |
| Reflection save & dismissal     | Approved September 27       | Feeling-only/text-only/both; empty bottom action and empty Back/X skip; dirty Back/X offers save, keep editing or discard and skip.                        |
| Reading saved reflections       | 06                          | Per-attempt detail/expansion and whether editing/deletion is offered there.                                                                                |
| Apple account & offer           | Start in 01; ready for 07A  | Enrollment status, bundle ID/app record, subscription product IDs/pricing/trials and RevenueCat mapping. Finalize paywall and expiry behavior before 07A.  |
| Supporting designs & formatting | Relevant phase              | Home color variants, Settings rows, reminder defaults, duration rounding and small-screen/accessibility states.                                            |

## App Store setup — start alongside development

| When                                | Work                                                                                                                                                                                                                                                                                                                                                                            | Finish line                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 01, in parallel               | Choose individual or organization enrollment; begin/confirm Apple Developer membership and account access. Owner completes required identity/business verification, paid-app agreement, banking and tax details.                                                                                                                                                                | Record status and outstanding items; Apple verification does not prevent local development. Membership and agreements must be ready for distribution/sales. |
| Phase 01 onward; ready for 07A      | Reserve a stable bundle identifier, create the App Store Connect app record and Expo/EAS project, configure signing access. In the existing JustGO RevenueCat project, connect the iOS app/store credentials, create the agreed App Store subscription group/products, and map product → entitlement → offering/paywall. Keep secret credentials out of docs and mobile source. | Matching identifiers and configured sandbox purchase path; final offer decisions settled before billing validation.                                         |
| After the full app build, during 09 | Use physical iPhones for release acceptance. Produce a release-like EAS build and upload using EAS Submit; test the processed build in TestFlight.                                                                                                                                                                                                                              | Purchase/restore, recovery, challenge loop and Progress pass on the actual binary. External testers may need beta review.                                   |
| Phase 09                            | Complete App Store metadata, current screenshots, icon, privacy disclosures/policy, support URL, age/content declarations, subscription information and review notes explaining no-signup access. Give reviewers the access needed to inspect the paid app. Submit the first subscription with the app version when required.                                                   | Select the tested build and explicitly submit in App Store Connect for App Review; choose the intended release control and address review feedback.         |
| After approval/release              | Verify the public listing and purchase/restore flow. Complete the separate hackathon submission using its current rules and required demo/assets.                                                                                                                                                                                                                               | Record the submitted entry and released build. Do not assume later app updates will be included in judging without checking the event rules.                |

EAS builds/signs the app and uploads it to App Store Connect/TestFlight. It does not replace Apple membership or automatically complete listing/review submission. Recheck current requirements during setup; build queues, account verification and review times vary. References: [Expo iOS submission](https://docs.expo.dev/submit/ios/), [Apple enrollment](https://developer.apple.com/programs/enroll/), [first in-app purchase submission](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase).

## Initial iOS release — eleven stages

<a id="phase-01"></a>

### Phase 01 — Foundation & implementation decisions

**Status:** Complete  
**Depends on:** None  
**Acceptance references:** PRD §§2, 10, 13 · Tech §§2, 3, 12

**Outcome:** A reproducible workspace and a clear list of decisions to settle before each feature.

#### Implement

- Create the root npm workspace: apps/mobile, apps/api and packages/contracts, alongside docs. Add strict TypeScript, one lockfile, lint/format commands, CI and environment examples without secrets.
- Scaffold Expo development builds and a Fastify health endpoint on Vercel. Configure PostgreSQL, Drizzle migrations, a separate migration connection, a small reused runtime pool, restricted roles and transaction-local ownership policies.
- Record the compatible Expo/React Native/Reanimated/Worklets/sheet versions, Node LTS and minimum iOS version; record Android constraints without implementing Android yet. Add mobile/API/database/native test harnesses and redacted diagnostics.
- Use the selected Paper screens as the visual reference; extract usable illustrations/icons/fonts and record reusable color, type and spacing values. Adapt only the approved scope changes (no Levels navigation or Dictate button; manual venue filters now belong to phase 04); keep the Progress content. Record remaining decisions with their blocking phases.
- Create `docs/DESIGN.md`: a concise design guide identifying the authoritative Paper screens, typography, colors, spacing and shared component styles. Document design decisions and unresolved details.
- Create `apps/mobile/src/theme/tokens.ts`: Define typed, reusable colors, typography, spacing and corner radii from the approved screens for app components to import. Keep these values authoritative in code; no separate JSON token file is needed initially.
- Begin the Apple/RevenueCat setup checklist below in parallel. Record account access and outstanding verification; do not wait until the app is finished to start enrollment or product setup.

#### Keep out of this phase

- Do not build every schema or screen upfront, or provision coach/Stripe infrastructure.
- Do not introduce a code/ wrapper, Supabase Auth, direct client database access, or a second styling framework.

#### Ready to hand off when

- [x] A clean checkout can install, type-check, lint and run starter tests using documented commands.
- [x] An iOS development build launches; a deployed staging API can reach PostgreSQL through the intended runtime role.
- [x] Version matrix, environment setup, final-design references and decision owners are recorded.
- [x] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Workspace commands, versions/OS targets, safe environment variable names, deployment entrypoints, migration procedure, design guide and token-file locations, and open decision register.

**Handoff file to create:** `handoffs/phase-01-foundation.md`

**Working notes / blocker:** See [phase 01 handoff](handoffs/phase-01-foundation.md). The EAS simulator build launched on iPhone 17 / iOS 26.4 and its connection check passed. Deployed API health/readiness and the existing Expo project link are verified. No phase 01 exit gates remain open.

<a id="phase-02"></a>

### Phase 02 — No-signup identity & recovery

**Status:** In progress — implementation built; physical-device acceptance pending  
**Depends on:** 01  
**Acceptance references:** PRD AC-01 · Tech acceptance 1–4, 17

**Outcome:** A real account survives supported recovery paths, without exposing another person’s history.

#### Implement

- Implement users, devices, hashed recovery credentials and expiring independent device sessions. Store the recovery secret before idempotent bootstrap; add recovery, renewal, revocation, rate limits and ownership checks.
- Build the Swift synchronizing-Keychain module and secure per-device session storage. Handle locked storage, delayed iCloud sync, revoked credentials and two concurrent devices without silently creating or merging accounts.
- Implement optional recovery-key and existing-device transfer APIs plus minimal test UI, including code expiry, one-use redemption and existing-device approval. Validate these fallbacks on iPhones; Android recovery implementation is deferred.
- Keep platform access behind typed adapters. Native timer and speech-recognition spikes are deferred with their features; do not add them to identity acceptance.

#### Keep out of this phase

- No signup, email, SMS, OAuth or identity inferred from store purchases.
- No unconditional cross-device recovery promise, shared rotating session token, silent account merge or polished Settings screen yet.

#### Ready to hand off when

- [ ] Real iPhone reinstall, two-iPhone recovery, disabled/delayed sync and credential failures behave as specified; limitations are recorded.
- [ ] iPhone recovery-key/transfer, replay/expiry/revocation, lost bootstrap responses and concurrent sessions are tested.
- [x] Two-user API/database isolation passes under the actual runtime role; Keychain configuration and fallback limitations are recorded.
- [x] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Identity endpoints and schema, native setup, device/OS test matrix, recovery failure behavior, remaining platform limits and minimal setup instructions.

**Saved handoff:** [handoffs/phase-02-identity.md](handoffs/phase-02-identity.md)

**Working notes / blocker:** See [phase-02-identity.md](handoffs/phase-02-identity.md). Apple enrollment, permanent identifier/signing and two-iPhone validation remain deferred by the owner’s September 17 sequencing decision. Later implementation may proceed against the verified identity contract while this phase remains open; external testing with valuable data and release still require device acceptance.

<a id="phase-03"></a>

### Phase 03 — App shell & shared API

**Status:** Implemented — full accessibility/device acceptance pending  
**Depends on:** 02  
**Acceptance references:** PRD AC-02, 17 · Tech acceptance 8, 10, 16, 17

**Outcome:** The app restores the right account and provides consistent navigation and network behavior.

#### Implement

- Build Router entry gates, Home/Progress tabs, Settings access and focused Success/Reflection routes. Use the agreed feature folders, shared accessible components and typed platform adapters.
- Implement shared Zod/OpenAPI contracts and HTTP client: typed errors, bounded timeouts, one retry policy, coordinated session renewal, account-scoped query keys, cancellation and stale-response protection.
- Defer onboarding, welcome screens, questionnaires, onboarding tables and Zustand. Build from the existing approved core screen references. React owns local UI; TanStack Query owns server data. Feature content/actions arrive in their consuming phases.
- Establish a server entitlement-check boundary and unavailable/unpaid/verified navigation states. Use explicitly isolated test fixtures until phase 07; no production billing bypass. Add consent-aware telemetry interfaces with export disabled until choices exist.

#### Keep out of this phase

- No onboarding/welcome flow, persistent query cache, offline journal database, duplicate server-state stores or fabricated challenge/history data. No billing implementation before phase 07A.
- No assumption that timeout means a write failed; do not stack transport retries under TanStack retries.

#### Ready to hand off when

- [x] Home/Progress tabs, Settings/recovery access and guarded Success/Reflection route shells work; no onboarding or welcome flow is introduced.
- [x] API tests cover typed errors, retry budgets, stable action IDs, coordinated renewal and late responses after account changes.
- [ ] Navigation, keyboard, screen-reader labels and reduced motion work on iOS; expired/unverified access has no release bypass.
- [x] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Route/gate map, shared component conventions, contracts/error codes, retry/renewal rules, account clearing, entitlement gates and deferred feature boundaries.

**Saved handoff:** [handoffs/phase-03-app-shell.md](handoffs/phase-03-app-shell.md)

**Working notes / blocker:** See the saved handoff for browser/backend/native evidence. Onboarding is deferred, not a blocker. Phase 02 physical-device acceptance remains open under the approved sequencing exception.

<a id="phase-04"></a>

### Phase 04 — Challenge deck & reliable attempts

**Status:** Implemented locally — device acceptance and deployment pending

**Depends on:** 03  
**Acceptance references:** PRD AC-04–06, 08–09 · Tech acceptance 5, 12–13, 16–17

**Outcome:** Browse → accept → complete or give up works against real cloud data exactly once.

#### Implement

- Create one stable Level 1 record, the six approved venues, and the reviewed challenge content from [CHALLENGES.md](CHALLENGES.md) in the database. This document is a human-readable reference; no separate JSON catalog/import workflow or content-management dashboard is required. Preserve immutable revisions with challenge text, optional nullable subtext and duration, initially 300 seconds. Do not display subtext in this version. No per-challenge illustration, separate hint or safety-guideline field is required. Add attempts preserving challenge/revision/level and venue-card context. Do not create unrelated categories, level progress, credit events or a completion threshold.
- Build top venue pills and a filtered challenge deck with prefetching, left/X replacement, right/heart acceptance and accessible button alternatives. Use Streets, Park, Gym, Cafe, Bookstore, and Bars & Clubs. Omit the level-progress indicator. Each user has an independent ordered stack per venue: skipped and completed cards go to the back of that venue's stack and can recur after cycling through it. Shared challenge content uses separate venue-card placements; moving one does not move its counterpart in another venue. Avoid immediate replaced/given-up repeats while alternatives exist; venue switching cannot reset an active attempt.
- Implement client-generated attempt IDs, matching-input retries, one active attempt, server start/deadline and canonical recovery. Navigation, locking and relaunch preserve the attempt; zero awaits an outcome.
- Implement confirmed completion/give-up, preserving the original Level 1/revision and frozen completion date/time zone. Derive reps from distinct completed attempts: a deliberate repeat has a new attempt ID, while retrying a save cannot create another rep or rotate the queue again. Show Success after confirmation. There is no level advancement at launch.

#### Approved card design and animation — September 24

- **Reference:** Keep the original [39O Café screen without challenge subtext](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/OMO-0), including its right-fanned stack, card proportions, palette and shadow depth. The bottom-edge stack experiment is not the chosen design. Apply the six-venue/no-level-indicator scope above rather than copying the reference's older labels and progress line. Rebuild cards as separate native components; the composed Paper image is a visual reference, not a single animated screenshot.
- **Existing stack:** React Native + Expo + TypeScript, `react-native-gesture-handler` 2.32.0, `react-native-reanimated` 4.5.1 and `react-native-worklets` 0.10.1 are already declared in the mobile package. GestureHandlerRootView is already wired at the app root. Use these dependencies; no additional deck/swipe library is required. Versions describe the current checkout, not a request to upgrade packages.
- **Structure:** Build a custom challenge deck with three visible cards and one incoming card concealed behind the rear card. Define front/middle/rear positions using horizontal/vertical offsets, rotation and shadow. Keep stable venue-card identities and a separate rotating color sequence; prepare incoming content before revealing it. Only this small visible window needs rendering, not the entire venue collection.
- **Drag:** Gesture Handler tracks thumb translation and release velocity. Reanimated shared values and animated transforms make the front card follow the thumb and tilt continuously on the native UI thread. On release, use distance/velocity thresholds to either commit the swipe or settle the card back. Tune thresholds in the prototype; a cancelled gesture must not advance the queue or create an attempt.
- **Committed swipe:** The departing front card continues offscreen. The middle card moves slightly left/up and rotates to the front card's upright position. The rear card moves left/up into the middle position and retains that position's slight tilt. Animate each card into its own next position rather than translating the remaining stack as one group.
- **Incoming rear card:** Start it concealed/aligned behind the old rear card, then slide it right and rotate it into the exposed rear position as the other cards approach their final positions. Overlap the motions; do not wait for the whole stack to stop before revealing it. Start with roughly 300 ms for the post-release transition and refine in the simulator/device. Favor a restrained slide/rotation and settle, without a pronounced pop or bounce. Use timing/spring animations and a short relative delay on one coordinated transition progress value.
- **Colors and content:** Preserve each moving card's color during the transition. The incoming rear card uses the departing front card's color, so the three colors cycle. It contains the next queued challenge, not an immediate visual repeat of the dismissed challenge; the dismissed/completed challenge belongs at the end of the full venue queue. Account for genuinely small/empty queues without inventing duplicate selectable cards.
- **Actions and state:** X/heart buttons use the same animation controller as their corresponding swipes. Allow one committed action at a time and finalize each visual queue advance once, preventing rapid taps/swipes from skipping extra cards. Keep visual motion separate from persisted attempts: left/X never creates an attempt, and right/heart enters the active screen only after the server confirms the attempt/deadline. Handle failed or uncertain starts through the canonical retry/recovery flow, without falsely completing or permanently losing the selected card. Reconcile venue changes, navigation and interrupted animations with the correct venue queue and active attempt. Provide a reduced-motion variant and screen-reader/button access.

#### Implementation and verification order

1. Build the 39O card/deck component with sample challenges in an isolated development/test harness. Keep the iOS simulator open alongside development and use Fast Refresh to tune offsets, tilt, shadow, release thresholds and overlapping timing. Existing presentation-only previews must remain free of domain writes.
2. Connect the tested deck to real venue queues, prefetching, persisted ordering, acceptance and the active challenge flow. Do not perform frame-by-frame network writes. Exercise the loop with the existing isolated test entitlement fixtures while payments remain phase 07.
3. Add meaningful automated coverage for queue rotation, independent shared venue placements, color cycling, cancelled gestures, duplicate actions, failed/uncertain saves and recovery. Verify actual motion and buttons in the browser and iOS simulator; automated component tests alone do not establish animation quality. Use a physical iPhone to judge touch responsiveness, smoothness and reduced motion before release.

#### Keep out of this phase

- No separate replay mode, levels/progression UI, favorites, GPS, adaptive recommendations, points or daily completion cap. Ordinary venue-stack cycling is included.
- No attempt on browse/left swipe, automatic failure at zero, or success/progress before server confirmation.

#### Ready to hand off when

- [x] Reviewed content and venue-selection rules are recorded; all six venues filter correctly, per-user stacks cycle independently, shared placements stay independent, and empty/small queues are handled without claiming an undefined level threshold was reached.
- [ ] The 39O deck follows the thumb, cancels cleanly, flies out and advances/straightens/reveals the next cards with overlapping motion and rotating colors. Buttons, rapid input, venue changes, interrupted motion and reduced-motion/screen-reader alternatives pass browser/simulator checks; record physical-iPhone motion evidence or carry it explicitly to the release gate.
- [x] Lost start/completion responses and simultaneous device requests return the original result with one attempt and one completed rep; conflicts are rejected.
- [ ] The full loop, direct give-up, zero, relaunch and switching tabs preserve the correct attempt and deadline.
- [x] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Content/revision schema, endpoint contracts, attempt state transitions, retry keys, Level 1 history, independent venue-queue rules, card color/motion settings, test fixtures and data/query indexes.

**Saved handoff:** [handoffs/phase-04-challenge-loop.md](handoffs/phase-04-challenge-loop.md)

**Working notes / blocker:** The full local loop, database concurrency/isolation, browser gestures/buttons and native button flow, zero and relaunch are verified. Native touch gestures could not be established through Simulator computer automation; physical-iPhone motion, VoiceOver, large text, Reduce Motion and lock/background checks remain explicit release gates alongside phases 02/03. Migrations 0004–0006 are applied locally, not staging. Streets is the initial venue; empty copy and retry behavior are recorded in the handoff. Production access remains closed until verified billing.

<a id="phase-05"></a>

### Phase 05 — Feelings & typed reflections

**Status:** In progress

**Depends on:** 04  
**Acceptance references:** PRD AC-09–11, 17 · Tech acceptance 5, 8–9, 17

**Outcome:** A completed attempt can have optional private feedback and typed reflection text.

#### Implement

- Build the five labeled relative feeling choices with no preselection and optional reflection text. The bottom action is **Skip** when both fields are empty and **Save Reflection** when either has input. Empty Back/X skips; dirty Back/X offers save, keep editing or discard and skip. Continue from Success to the same attempt.
- Add versioned feedback/reflection records and consistent final saves; separate cloud autosaved drafts from submitted feedback. Keep unsaved edits visible, reject revision conflicts and preserve already-earned completion credit.
- Use the normal keyboard and multiline text input. Custom dictation, its button, speech-recognition packages and microphone permission are deferred.

#### Keep out of this phase

- No before/after clinical measurement, separate anxiety/confidence scales, day notes, raw audio storage or AI voice coach.
- No unapproved feeling-only/text-only behavior or final-save success while part of the feedback was lost.

#### Ready to hand off when

- [x] Reflection optionality and dismissal rules are approved; feeling-only/text-only/both cases match that decision and missing differs from neutral.
- [x] Draft/final state, consistent feeling/text saves, dirty-input retry and concurrent-device edit conflicts pass locally; skipped reflection keeps credit.
- [ ] Real iPhone text entry, keyboard avoidance, long input, dismissal and screen-reader behavior pass; no custom microphone prompt or Dictate control is shipped.
- [x] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Feeling schema/version, draft/final contract, conflict behavior, iPhone keyboard/device results and the agreed dismissal flow.

**Handoff file to create:** `handoffs/phase-05-reflections.md`

**Working notes / blocker:** Local API/database, component and browser-preview checks pass. See the [Phase 05 handoff](handoffs/phase-05-reflections.md). Real-iPhone input/accessibility acceptance and staging deployment remain open; the linked Paper file allowed MCP basic info but required edit access for live layer/screenshot inspection.

<a id="phase-06"></a>

### Phase 06 — Progress calendar & saved history

**Status:** In progress

**Depends on:** 05

**Acceptance references:** PRD AC-13–14, 17 · Tech acceptance 5, 9, 12–13, 17

**Outcome:** Users can view the full Progress summary/calendar and read day details and saved reflections.

#### Implement

- Preserve the full P37 Progress content: current/best streak, all-time reps, navigable month/year calendar, per-day counts, monthly reps and active days. Do not replace it with a simple history list or implement Levels here.
- Build current/best streak, all-time reps, month navigation, monthly reps/active days and per-date counts using frozen local completion dates/time zones.
- Build the scrollable chronological day sheet with completion time, five feeling labels or an accessible Not recorded state, plus the approved per-attempt reflection-reading interaction. Do not store or display elapsed durations or a day-level rep total.
- Choose pagination/caching and indexes for the actual history queries now; verify them on representative data. Preserve original content revisions, Level 1 context and dirty edits.

#### Keep out of this phase

- No feeling heatmap, chart library, day note, standalone journal destination, practice replay or automatic adoption of every draft course.
- No fabricated zero totals on API failures or credit awarded by skips.

#### Ready to hand off when

- [x] The full Progress summary/calendar and tappable day sheet match the clarified references in local browser/simulator checks, with honest empty/error states and no Day note block.
- [x] Streaks, monthly totals and ordered day entries pass midnight, DST, travel, missing feedback and multi-completion cases.
- [x] Read-only saved reflection scope is agreed and implemented; verify automatic paging beyond 20 day entries and local sheet scrolling/close/accessibility labels. Carry physical-iPhone VoiceOver, text scaling and gesture acceptance to Phase 09.
- [x] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Aggregation definitions, query/index evidence, paging/cache choices, date semantics and saved-reflection interaction.

**Saved handoff:** [handoffs/phase-06-progress.md](handoffs/phase-06-progress.md)

**Working notes (September 30 final handoff audit):** Local implementation through `0515a00` is ready for review, including loading skeletons, today highlighting without reps and the repeated day-sheet animation fix. Fresh workspace checks passed 226 tests and 5 database suites / 36 tests; in-app browser fixtures verified loading recovery, empty-account today highlighting, reflection expansion and sheet close/reopen. The sheet’s **Feeling** label and omission of elapsed-duration fields/displays and the day-level rep total match PRD §5.7 / AC-14. September 29 simulator evidence covers a live 21-entry day, automatic paging and both Retry states. Staging requires migrations through 0009 and coordinated API/mobile versions. Physical-iPhone acceptance remains in Phase 09, and staging belongs to integration/release validation. Earlier dependency gates stay recorded in their own handoffs; Phase 06A may proceed against verified local behavior under the approved sequencing decision. See the handoff for exact evidence and limits.

<a id="phase-06a"></a>

### Phase 06A — Code quality & test hardening

**Status:** Not started

**Depends on:** 06 (verified local implementation under the September 30 sequencing decision)

**Acceptance references:** Existing implemented behavior from phases 02–06; repository coding, test and UI-verification instructions. This phase adds no product features or physical-device acceptance gates.

**Outcome:** Existing code is easier to understand, test and maintain. Important behavior has meaningful regression coverage, large components have clear responsibilities, and future agents can find the agreed coding standards in repository instructions.

#### Implement

1. **Refresh the baseline and choose bounded work.** Read applicable `AGENTS.md` files, project setup/architecture guidance and the relevant phase handoffs before editing. Record the checkout, existing changes, current test results, coverage gaps and concrete refactor candidates. Run `npm run check` and `npm run test:db` against the dedicated local test database. Collect mobile, API and contract coverage across production source, including files not imported by tests. Distinguish unit, component, integration and UI evidence; identify gaps by behavior and risk, not just by filenames or line counts.
2. **Protect important behavior before refactoring.** Add tests for the real app runtime/provider wiring: initialization, account changes, cache clearing, session coordination, access freshness and foreground/background handling. Test the existing JavaScript secure-storage adapter's payload validation, native-module calls and failure handling with controlled test doubles. Preserve existing identity, ownership-isolation, retry, completion and history tests. Recheck the previously reported Progress `act(...)` warning; it did not reproduce in the Phase 06 closeout. If it recurs, resolve it with correct asynchronous assertions and cleanup rather than suppressing console output. Review the documented browser `pointerEvents` deprecation warning. Fix confirmed regressions in the affected existing behavior and rerun its checks.
3. **Refactor Progress first, in small steps.** Separate the calendar/summary, day sheet and entry rows where they have independent responsibilities. Keep related styles and helpers close to their components; extract reusable icons or motion helpers only when doing so improves understanding. Preserve existing rendering, loading/error/empty states, month changes, paging, sheet behavior, reflection expansion, accessibility labels and reduced motion. Add or update relevant tests, then verify each affected UI flow before proceeding.
4. **Review the other maintenance hotspots.** Assess the identity controller/screen, challenge deck/screen and reflection view based on their responsibilities and change risk. Split presentation from orchestration and extract cohesive pieces when justified; keep storage, networking, time and randomness easy to control in tests. Reuse repeated rules when they represent the same behavior. Preserve enforced feature/shared-code boundaries, strict TypeScript and shared runtime validation. Do not split files merely to hit a line limit or add abstraction layers without a concrete benefit. If a candidate depends on an unresolved API decision, leave that candidate open and continue independent quality work.
5. **Improve automated safeguards.** Add reproducible coverage commands/reporting and CI collection for mobile, API and contracts, including database-backed service coverage where applicable. Choose and document meaningful branch thresholds and exclusions after reviewing the fresh baseline, with stronger protection for critical behavior and an explicit approach to preventing coverage regressions. Avoid a blanket 100% target or tests that only mirror implementation. Extend the existing import-boundary checks to dynamic `import()` and `require()` calls; preserve permitted asset, test and app-preview requires. Add forbidden and permitted cases to `scripts/import-boundaries.test.mjs`, and update its assertions to cover the added rules. Introduce targeted type-aware lint rules for unsafe promise/async handling where they add value; document intentional fire-and-forget behavior instead of broad lint disables.
6. **Verify existing user journeys and maintain guidance.** Exercise the implemented challenge → completion → reflection → Progress flow and relevant recovery/failure paths with disposable local data and the existing isolated test-access setup. For every code change, write or update relevant tests and run them, then use Browser Use in the in-app browser to test affected UI behavior; use Computer Use in Google Chrome if the in-app browser is unavailable or has issues. Fix failures and repeat until tests and affected UI pass. Reuse an existing simulator development build only when an affected native behavior needs verification that a browser cannot provide; physical iPhones and new signing/build work are outside this phase.
7. **Make coding standards durable for future agents.** Review and update `AGENTS.md` and other repository files consulted before code changes, including README/setup, architecture guidance, this plan and relevant handoffs. Add a root `AGENTS.md` if the shared standards are not already recorded in one, and keep directory-specific instructions focused on actual local requirements. Record expectations for clear responsibilities, existing import boundaries, strict typing/runtime validation, meaningful tests, dependency seams, small reviewable changes and required browser UI verification. Preserve the existing mobile instruction to consult exact versioned Expo documentation before coding. Keep one clear source for shared standards and link to it from other guidance; reconcile conflicting or stale instructions. Verify that the resulting instructions are discoverable before the next coding task. Updating agent/instruction files is a phase deliverable, not a reminder left only in chat.

#### Implementation and verification order

- **First batch:** refresh the baseline, record the worklist and initial coding standards in the handoff and agent/setup guidance before application edits, add runtime/storage regression tests and clean up asynchronous test warnings. Do not infer that an untested file needs a standalone unit test if its behavior is better covered through an integration test.
- **Second batch:** refactor Progress with its tests and browser checks. Review the smaller maintenance candidates after this establishes the pattern; preserve behavior during each extraction.
- **Final batch:** finish justified extractions, coverage/lint safeguards and existing-journey verification; reconcile repository coding guidance with the final responsibilities and commands. Complete the handoff with before/after evidence and explicitly deferred API-dependent candidates.
- Run focused tests while changing each area. Run the full workspace and database checks after affected shared boundaries change and before handoff; do not treat the earlier assessment as a current pass.

#### Keep out of this phase

- API route renaming, HTTP-contract redesign, schema/persistence changes, or decisions about local versus backend ownership of attempts, venue queues and reflections. Those belong to the separate API discussion. Preserve current behavior and interfaces throughout this phase.
- New billing/paywall, onboarding, levels, Android, dictation, analytics exporters or other unimplemented features. Missing tests for future features are not gaps in this phase.
- Physical-device release acceptance, staging/production deployment, store submission, provider integration work, native signing/build upgrades, and full production load/security campaigns. Existing device and release gates remain in Phase 09 and their original handoffs.
- A new offline sync engine, state-management framework, broad dependency upgrade, wholesale architecture rewrite, arbitrary file-size target, or blanket coverage goal. Use the current tools unless a demonstrated test requirement calls for a small, documented addition.

#### Ready to hand off when

- [ ] A fresh baseline and final evidence are recorded; meaningful runtime/provider and storage-adapter tests cover the selected critical gaps, existing implemented behavior remains protected, and `npm run check` plus `npm run test:db` pass with no unexplained asynchronous test warnings.
- [ ] Progress responsibilities are separated and the agreed maintenance worklist is completed or explicitly deferred with reasons. Import boundaries, strict typing, current contracts and product behavior remain intact; affected browser UI checks pass, including applicable loading/error/retry and reduced-motion cases. Chrome fallback or any limited simulator verification is recorded accurately.
- [ ] Coverage reports include all relevant production source, and CI enforces the documented thresholds/exclusions and selected type-aware lint rules. Existing user-journey checks pass using isolated fixtures; the evidence distinguishes automated, browser and simulator checks and makes no physical-device claims.
- [ ] Repository agent/coding guidance is updated and discoverable, this plan and the handoff index agree, and the phase handoff records changed paths, tests, UI evidence, coverage changes, preserved decisions and remaining work before billing. Earlier physical-device/staging gates and API decisions retain their separate owners and phases.

**Carry forward:** Refactored component/controller responsibilities, dependency interfaces, critical behavior tests, coverage commands/baselines/thresholds, lint decisions, agent instruction locations, browser verification evidence and deferred API-dependent work.

**Handoff file to create:** `handoffs/phase-06a-code-quality.md`

**Working notes / blocker:** Planning approved September 30; implementation has not started. The September 30 assessment recorded 222 standard tests plus 36 PostgreSQL integration tests passing, mobile line coverage of 80.24% and branch coverage of 77.23%, uncovered app-provider/storage-adapter wiring, and an unexpected Progress test warning. These are historical assessment results, not a phase completion or current-check claim. The later Phase 06 closeout passed 226 workspace tests and 36 database tests without reproducing the asynchronous warning; it also recorded a browser `pointerEvents` deprecation warning. The subsequent PR #8 Expo patch-version repair again passed the tests but reproduced the asynchronous warning, so its cleanup remains in this phase. Refresh coverage and checks when starting this phase; source changes since either assessment require a fresh baseline. API design is being discussed in a separate chat; only work directly dependent on an unresolved decision waits for it.

<a id="phase-07"></a>

### Phase 07 — API & offline saving

**Status:** Not started  
**Depends on:** 06A

**Acceptance references:** The confirmed API/persistence requirements below govern this redesign. Billing acceptance is owned by Phase 07A. Align older product/technical acceptance lists after each implementation under the approved documentation sequence.

**Outcome:** Challenge completions and submitted reflections save locally and display immediately, pending uploads synchronize reliably, and Progress reads avoid unnecessary summary work.

#### API and persistence discussion record — October 1–3

**Status:** Confirmed product changes, a proposed technical design and ordered implementation tasks are recorded for Phase 07. Review the remaining product recommendations before implementation; engineering details below are the proposed baseline rather than additional product approval questions. Implement/verify the settled plan next and reconcile the other documents afterward. Recording these decisions authorizes updates to this plan, not application/schema implementation. Native billing is owned by the separate Phase 07A below. General PostHog activation remains scheduled in Phase 08 unless explicitly rescheduled.

**Confirmed changes to include in Phase 07**

- [ ] Use resource-only API paths: HTTP methods express operations; do not put action names such as addReflection, draft, final, skip or revoke into the redesigned paths. Use PATCH /v1/attempts/:id for initial reflection submission and later edits to its text; leave any existing feeling unchanged and retain the reflection revision check. Initial submission may include optional feeling/text; later text edits must not alter a recorded feeling. Remove all separate reflection API routes and update mobile clients, contracts/OpenAPI, services, CORS method configuration and tests together, including the wider resource-only route audit for identity endpoints. The attempt-patch route replaces the earlier /v1/reflections and nested reflection write proposals. Nested paths may describe actual resource relationships; nesting itself does not violate this rule.
- [ ] Migrate the separate reflections table's appropriate saved data onto owner-matched attempts as reflection_feeling, reflection_text and reflection_revision, verifying content, ownership and revision preservation before dropping the old table. Return each attempt's reflection as a nested object containing its submitted feeling/text and revision, or null when content is absent. Retrieve reflection content through attempt/history responses, with no independent reflection ID, table, GET route or creation endpoint. Update history queries to project these attempt columns instead of joining reflections; remove obsolete reflection-table/state logic throughout API/mobile/contracts/OpenAPI/seeds/tests and future documentation. Preserve feeling-only, text-only and both. Settle legacy draft/skipped and retry-receipt migration below rather than silently treating drafts as submitted content or dropping relevant saved data.
- [ ] Send a nested reflection patch with the expected reflection revision. An attempt without a submitted reflection starts at revision 0; the first accepted submission becomes revision 1 and later accepted text edits increment it. Omitted feeling preserves the existing feeling, and later edits cannot change it. Reject a genuinely stale edit rather than silently overwriting newer backend writing. Assign each explicit submission a stable retry identity, separate from the attempt UUID, and recognize repeated delivery/lost acknowledgements without applying that submission or incrementing its revision twice. Preserve a newer local edit when an older submission is acknowledged. Finalize field names and retry-identity placement during implementation; these are not additional reflection resources.
- [ ] Keep multi-phone editing conflict resolution out of scope. Do not build a two-phone version chooser, merge screen or parallel-reflection history. Retain revision/replay checks, ordered per-attempt uploads and protection against older acknowledgements replacing newer writing on the same device; excluding multi-phone coordination does not remove these already-approved retry safeguards. Finalize unexpected stale-revision recovery as an upload/reconciliation detail rather than expanding into a multi-device feature.
- [ ] Move selected venue and each venue's cycling card order to in-memory frontend state. Reset them on a fresh launch; do not persist or synchronize them between devices. Keep challenge content/stable IDs in the backend, with locally available content persisted for offline recording. Remove per-skip API writes, the post-skip canonical-state lookup, deck skip receipts and queue-version checks used to coordinate server-owned browsing. Remove backend-owned selected-venue/preferences and personal queue behavior, with an explicit migration and API/mobile rollout plan.
- [ ] Keep app navigation and temporary flow context in the client, across all requests rather than only pagination. Each request identifies the target resource and supplies its relevant filters, submitted values and any cursor/expected revision explicitly; do not have the backend infer the selected venue/current card/active challenge/current page from remembered UI context. Anthony's use of stateless here concerns this general request behavior, not removal of authentication, saved product records, ownership checks or revision/replay protection. Current Progress day reads already carry a self-contained date/position cursor; retain that property while removing the already-superseded server-owned venue/deck and active-challenge/reflection-draft workflows.
- [ ] Remove `challenge_revisions`, attempt/card `revision_id` references and challenge-content revision logic throughout the API, mobile app, contracts/OpenAPI, seeds, migrations, tests and future-facing documentation. Move the required instruction/configuration/level metadata onto stable challenge records and link attempts/venue placements to `challenge_id`. Do not copy original instruction text onto attempts. Minor wording edits update the challenge and appear in old history when content refreshes; a substantially different activity receives a new challenge ID. Stop offering removed challenges by marking them inactive while retaining their rows for historical references. This replaces exact original-wording preservation; preserve saved attempts, account ownership and the still-approved level context during migration.
- [ ] Start challenges immediately in memory, without a required start API save. Give up creates no backend attempt. Store only completed challenges in attempts; remove active/given-up statuses, server active-attempt recovery, the one-active-attempt-per-account rule and the backend start/deadline lifecycle. Keep consent-aware start/give-up analytics independent of product saving.
- [ ] On a fresh launch, discard an unfinished challenge and show the Home deck; starting again is explicit. Locking/backgrounding while the process remains alive retains the in-memory countdown end time and recomputes remaining time on return. Do not require a running JavaScript background interval. Zero still awaits a deliberate outcome.
- [ ] Capture the exact start timestamp and phone's time zone on Start in memory. On saving a new completed rep, send those original values and have the backend derive/freeze `activity_date` from `started_at` in `start_time_zone`. Use those same original values for the day-sheet time. Do not attribute new activity to completion/reflection-save/upload time, measure elapsed duration, or require a separate product completion timestamp. Preserve existing historical activity dates as recorded; do not recalculate old reps onto different calendar days. Apply the new start-date rule to new reps only. Update day/streak/month queries, chronological history/display wording, contracts and tests accordingly. The existing server start/deadline and completion-time requirements are scheduled for removal; client-captured start metadata is attached to a completed record only when it is saved. Finalize legacy timestamp/time-zone mapping and operational timestamp naming without changing historical dates.
- [ ] Generate the client attempt UUID once when Completed is tapped, before persisting or sending the completion. Preserve that same UUID through retries and relaunch recovery. Existing starts already use UUIDs with matching-retry protection; move ID generation/protection to the completion-only create flow rather than creating an ID on Start or every request. Enforce ownership, database uniqueness and rejection of conflicting ID reuse.
- [ ] Use Zustand for shared in-memory venue/deck, active challenge/countdown and completion-flow state, as explicitly selected by Anthony. Keep component inputs/dialogs in React and motion in Reanimated; TanStack Query fetches/caches backend data. AsyncStorage owns device-persisted completed records, explicitly submitted reflections and locally available challenge/history data; compose those with backend data for the displayed view. A fresh launch still resets browsing/unfinished activity. Document the local/remote reconciliation boundary and avoid blindly copying the entire server query cache into Zustand or letting a refetch hide pending local records.
- [ ] Persist downloaded challenges, progress summaries, loaded calendar months and fetched day details using AsyncStorage. On launch, display the same account's saved data as soon as local hydration makes it available; when online, refresh from the backend and update the saved copy. Do not prefetch every calendar day. Offline, display available cached entries and local completed records normally, without a notice that additional entries may exist or require a connection. Show a connection-required state only when the person requests information not available locally. Do not mistake an unavailable lookup for a successfully loaded empty history result. Keep completeness/pagination bookkeeping internal; it does not justify a warning on an available view. Keep venue selection, cycling order and unfinished challenges memory-only despite persisting challenge content.
- [ ] Show a visible connection-required state in the Progress calendar or day sheet only when the requested month/day/detail/page is unavailable locally and the device is offline. If available entries can be displayed, show them without an incomplete-history or "connect to load the remaining entries" notice. A later request for unavailable information can show the offline message then. Do not present an unavailable lookup as zero progress or leave it loading indefinitely. Retry missing reads when connectivity returns. Choose final copy/layout during UI implementation, using wording such as "You're offline. Connect to load this day/month." Only use offline wording when the cause is known; completion/reflection upload failures still remain background work without save-error UI.
- [ ] Treat each supported venue as having its defined, fixed nonempty set of challenges. Validate that catalog/seed configuration supplies the expected challenges for every venue; do not add a normal "No challenges available for this venue" product state. Remove the current empty-venue presentation when implementing the new deck loading flow. This clarification does not change the genuine zero-completion state in history.
- [ ] Adjust challenge-fetch loading behavior separately from background completion/reflection uploads. Keep cached cards visible and usable while refreshing; do not disable the deck or replace it with a full-screen loader merely because a refresh is running. With no local challenges, show initial fetching and a load-failure/offline state if that first download fails; a fresh install or cleared local data is the ordinary scenario. After challenges have been downloaded and persisted, an unsuccessful background refresh keeps those cards available without a blocking load-failure screen. Do not design around normally empty venues, and do not leave an offline cache miss loading indefinitely. Finalize cold-start loading/error presentation below.
- [ ] Use AsyncStorage for this approved scope. Retain the complete downloaded challenge catalog and latest account summary; keep older loaded months/day details under measured size/count limits finalized during implementation. Evict only eligible older confirmed cache entries; removing a downloaded cache entry does not delete backend history. Never evict pending uploads or their required local attempt/reflection data as ordinary cache cleanup. After acknowledgement, clear the upload marker and retain the confirmed local entry under the finalized cache retention policy. Verify storage size, serialization and responsiveness; cache limits reduce storage pressure but cannot guarantee that the device will always have writable space.
- [ ] On Completed, generate the UUID, persist the completed rep using AsyncStorage and immediately show Success based on that local save. Send its API create request in the background; do not wait for backend confirmation. Success Continue only navigates. On Save Reflection, persist the explicitly submitted feeling/text on the local attempt, update the displayed entry/continue the flow immediately and send PATCH /v1/attempts/:id in the background. Later text edits follow the same local-first patch flow. Skip reflection returns Home without a request and leaves reflection null; any independent completion upload may still be pending. Starting/giving up still creates no backend attempt. These behaviors supersede server-confirmed navigation and network loading/error/manual-retry UI.
- [ ] Retain completed attempts and submitted reflections persistently on the device, including after failed uploads or termination, and restore them for the same account. AsyncStorage persistence must succeed before treating the record as durably saved; a Zustand memory update or successful HTTP response alone does not complete the local persistence/reconciliation step. Persist the displayed record and recoverable upload intent consistently, with restart recovery for interrupted updates. On backend success, replace/reconcile the pending local version with confirmed backend data and clear only that acknowledged upload operation. Never clear a newer local edit because an older response arrived. Preserve the confirmed local record for offline display rather than deleting the only device copy.
- [ ] Support offline completion/reflection recording and display using locally available challenges and history. Persist downloaded content/data needed for that availability; never fabricate uncached challenges/history. Send pending completion creates before dependent reflection PATCH operations for those attempts, and preserve the ordering/revision dependencies of later text edits. Merge/deduplicate records by the same stable attempt ID locally and remotely across storage, API responses, day history and progress. Coordinate upload acknowledgements, aggregate refreshes and local overlays so confirmation/refetch cannot duplicate reps or erase locally recorded activity: a backend total of 10 plus one new local completion displays 11, and remains 11 after upload rather than displaying 12 or regressing to 10 when an older response arrives. Finalize the reconciliation mechanism in the implementation breakdown.
- [ ] Retain unsuccessful uploads and retry automatically in the background. Anthony accepted one immediate attempt plus two transient-failure retries after approximately 2 and 5 seconds, then pausing that cycle without deleting its record. Restart bounded attempts on real connectivity restoration, app restart or foreground return; coalesce triggers, respect cooldown/server Retry-After and allow one sender per pending operation. Known offline state waits for reconnect. Keep transport/TanStack retry layers from multiplying this policy. Do not assume the app can execute uploads while its process is terminated; persisted records resume on a later launch. Permanent rejection and reflection edit conflicts require a separately finalized reconciliation policy, not an endless timed retry or silent data loss.
- [ ] Validate reflection input before submission. If the backend permanently rejects submitted content, retain it locally for correction rather than repeatedly sending unchanged invalid input or deleting the writing. Automatic transient-failure retries do not apply to an unchanged validation rejection. Finalize how correction is presented separately from the superseded network loading/error UI.
- [ ] Remove reflection debounce autosaves and cloud draft/final/skipped lifecycle distinctions. Send feeling/text only on explicit Save Reflection. Unsaved editor content stays in memory; a saved attempt exposes submitted reflection content or null. Keep feeling-only, text-only and both, plus the existing dirty-close Save/Keep editing/Discard choice. Never treat time since the last keystroke as submission.
- [ ] Remove `feeling_version` from reflection storage/contracts and history projections. Retain stable, descriptive feeling codes; label wording changes must not silently redefine the meaning of a saved code.
- [ ] Do not add network loading/failure states, Saving spinners, Couldn't save/Retry copy, manual save-retry buttons, Failure pages or pending-upload Home notices for completion/reflection uploads in the challenge → completion → reflection flow. The October 2 decision supersedes the earlier October 1 approvals/proposals for those save states. Navigation/display follows successful local recording; network uploads/retries remain background work. This does not remove initial loading/unavailable states for fetching content that is not on the device. Local storage failure, authorization rejection and edit conflicts are distinct unresolved cases, not permission to restore the superseded network-gated save flow.
- [ ] Add reflection submission and editing from an attempt in the calendar day sheet. Support Add reflection for missing content and Edit reflection for saved content, both through PATCH /v1/attempts/:id with immediate local persistence/display and background uploading. Existing reflection edits change text only; do not offer feeling changes in that edit flow. Retain reflection_revision on the attempt to protect newer backend writing from stale delayed saves. This extends the earlier read-only Phase 06 scope. Do not introduce a day-level note or assume deletion controls were requested.
- [ ] Remove the standalone attempt lookup used by Success (`GET /v1/challenges/attempt/:id`) and its mandatory UI caller. Use in-memory/saved-create-response data for Success and attempts returned by the day query for history. The confirmed history resource is `GET /v1/attempts?date=YYYY-MM-DD`, returning that day's individual attempts and nested reflections with no status filter. Keep pagination and owner-scoped access.
- [ ] Separate Progress account-summary reads from month-calendar reads using the confirmed paths `GET /v1/progress/summary?timeZone=America/Toronto` and `GET /v1/progress/calendar?month=2026-10` (query values vary with the requested time zone/month). Use independently cached, account-scoped queries; load both when needed on entering Progress, and request only the month calendar when changing months. Do not fetch/recalculate overall totals/streaks merely because month selection changes. Overall summary contains total reps/current and best streaks; calendar contains the requested month's daily completion counts and monthly figures without duplicated account-wide aggregates. Refresh relevant reads after confirmed completions and on appropriate online refresh/day-rollover triggers, preserving immediate local progress while uploads/refetches are pending. Day details remain the paged attempt/history query. Finalize response field names/freshness in the task breakdown rather than reopening the accepted routes or decision to split.
- [ ] On a fresh launch, retry pending completed reps independently of unsubmitted reflection input. If the person explicitly tapped Save Reflection and its request is awaiting confirmation, preserve/retry that exact submitted feeling/text instead of replacing it with null. Never upload unsaved editor input. Local pending-save records are transport/recovery state, not active/given-up domain attempt statuses. The bounded retry policy above is confirmed; rejection/conflict resolution remains pending below.
- [ ] After implementing and verifying the finalized Phase 07 changes, reconcile `PRD.md` sections 5.1–5.7, 6–7, relevant acceptance criteria and time-to-completion analytics wording; `TECH_STACK.md` state ownership, data model, reflection saving, safe retries, lifecycle/time and future lock-screen assumptions; `DECISIONS.md`, `DESIGN.md`, `APP_SHELL.md`, `PHASE_04_SCOPE.md`, affected identity/API guidance and the frontend learning map; this plan's prior-phase requirements; and affected handoff/README guidance. Preserve historical implementation/test evidence while labeling requirements superseded by Phase 07. This post-implementation documentation task replaces the earlier pre-implementation consolidation requirement. Keep shared runtime contracts/OpenAPI and client/server callers synchronized during implementation, not deferred until this documentation pass.

**Billing boundary:** The nine confirmed subscription rules are preserved in [Phase 07A](#phase-07a). Phase 07 builds authenticated uploads, ownership/replay checks and the eligibility interface using isolated test providers. Native purchases, access refresh/expiry behavior, billing records, webhooks, QStash and billing schedules belong to 07A. That phase connects verified subscription coverage and proves earlier valid-access reps and dependent reflections still upload after expiry; production access remains closed until integration passes.

**Review status — product recommendations and engineering validation**

- Offline history scope: Anthony's latest proposal persists the downloaded challenge catalog, account-scoped subscription verification, pending completed reps/submitted reflections, latest Progress summary, current month's calendar counts and today's available attempt/reflection details. Offline day-sheet activity is limited to today; other days and other months require a connection even if previously viewed online. Older history queries use in-memory caching without accumulating durable month/day copies. This would supersede the earlier broad downloaded-history cache scope, while retaining offline recording, immediate local display, online calendar Add/Edit reflection, same-ID reconciliation and background retries. Separate disposable confirmed current-period caches from pending uploads; earlier pending records remain protected across day/month changes until acknowledged and no dependent operation needs them. Until this limited current-period scope is explicitly selected, the earlier confirmed broader cache scope remains recorded. Do not treat the question as approval.
- Local-storage failure recommendation: clear only disposable confirmed Progress detail caches and retry once. If writing still fails, retain the input/completion on the current screen with "Couldn't save on this phone. Try again." and a local-write retry using the same ID. No false durable Success, separate Failure page or network-save gate. This proposed exceptional presentation awaits review; ordinary background HTTP failures still have no save-error UI.
- The technical design and ten ordered Phase 07 tasks below now specify the baseline for the previously open API/storage/migration/reconciliation details. Validate/refine these mechanics during their implementation slices without asking the owner to choose field names. The remaining engineering bullets describe verification work, not additional product approval gates. Routine cache limits and compatibility versions require implementation measurements/current documentation; provider/cron settings belong to Phase 07A.
- AsyncStorage/reconciliation details: finalize account-scoped keys, hydration, consistent record-plus-upload persistence, acknowledgement recovery, measured history-cache limits and handling of actual device-storage failures. Persistence categories, retaining the complete downloaded catalog/latest summary and never evicting pending uploads are confirmed. Do not persist browsing/current countdown/editor drafts. Earlier pending-only/local-cache prohibitions are superseded. Keep credentials in secure storage. Finalize the mechanism by which TanStack remote reads and Zustand/local records feed the approved displayed view without duplicate counts or regression, and verify storage size, serialization and responsiveness. Local-write recovery/presentation remains pending; cache cleanup must not sacrifice pending entries.
- Fetch-state presentation: choose the cold-start challenge loader, read-failure/retry copy and any unobtrusive refresh indication, plus the final calendar/day-sheet offline layout. Each venue's nonempty challenge set, usability of cached cards during refresh and no partial-history/remaining-entry notice are confirmed. A requested lookup unavailable locally needs a visible connection-required message when offline rather than a fabricated empty result. The no-network-loading/error rule applies to completion/reflection uploads, not to fetching missing content.
- Exceptional uploads: validation before submission, retention for correction, no endless retries of unchanged invalid content and exclusion of a multi-phone conflict workflow are confirmed. Finalize correction presentation, ordered single-device edit/revision recovery and authentication recovery without losing pending writing. A background network error does not interrupt the flow. Preserve the earlier-upload eligibility seam for the confirmed subscription policy in Phase 07A; account-scoped verification hydration, refresh coalescing and expiry enforcement are implemented and accepted there.
- Reflection PATCH details: attempt columns, nested reflection-or-null responses, removal of separate reflection routes/table, PATCH /v1/attempts/:id, the nested patch/expected-revision approach, unchanged feelings, stale-edit rejection and stable per-submission replay recognition are confirmed. Finalize field names, expected-revision/retry-identity placement, defaults/absence handling, successful response projection and the replay storage/acknowledgement mechanism. Protect unrelated immutable attempt fields. Define feeling-only/text-only edge cases and ordering of multiple offline edits without introducing a feeling-edit feature. Removal of feeling_version is confirmed. No separate reflection resource ID or POST is needed; the submission's retry identity identifies an operation, not another reflection.
- Progress query details: the three read routes above and their summary/calendar/day responsibilities are confirmed. Finalize exact response fields, account/month/time-zone cache keys, summary freshness, day rollover, mutation invalidation and the mechanism coordinating acknowledgements with aggregate refreshes. The no-double-count/no-regression behavior is accepted; do not simply add every locally stored rep to a backend total, since most confirmed local entries are already included. New activity stays on its frozen start date; historical dates remain unchanged.
- Migration/rollout: preserve completed records/account ownership, stable challenge IDs and existing historical activity dates. Deliberately migrate canonical challenge instruction/configuration out of revisions and redirect attempt/venue references, then remove revision logic/table. Migrate saved reflection feeling/text/revision onto owner-matched attempts and verify the transfer before dropping reflections. Determine how existing active/given-up rows, draft/skipped reflection rows, legacy reflection action receipts, legacy timestamp/time-zone fields and older clients are retired or migrated without moving old reps to different calendar days. Keep relevant repeated-delivery protection while removing obsolete draft/final/skip action logic. Inactive challenge rows stay readable in history; exact old wording is no longer required. Do not destructively rewrite existing records during this discussion.

**Examples of confirmed choices and recommendations for remaining details**

- Confirmed PATCH approach, illustrative field names: a first submission could carry `{expectedReflectionRevision: 0, reflection: {feeling: 'a_little_better', text: 'I said hello.'}}`; a later edit could carry `{expectedReflectionRevision: 1, reflection: {text: 'I said hello and asked a question.'}}`. The first accepted save returns revision 1, then a later edit returns revision 2. Stable per-submission retry identity recognizes repeated delivery without incrementing again. Field names/identity placement and multiple-offline-edit handling still need implementation design; the user need not choose arbitrary JSON names.
- Confirmed cache/reconciliation approach: keep the complete downloaded challenge catalog/latest summary, bound older confirmed month/day caches using implementation measurements and never evict pending uploads. Backend total 10 plus one new local completion displays 11, and remains 11 through upload/refetch. Exact retention budgets and the reconciliation mechanism remain to be finalized.
- Cache-cleanup proposal if full downloaded-history caching is retained: keep an account-scoped index of evictable month/day cache keys, their approximate stored size and last-viewed time, separately from challenges, verification, pending uploads and required local content. When saving downloaded history, check the measured size/count budget and remove the least recently viewed eligible entries until within it; reconcile the index after interrupted writes during hydration. Avoid clearing all AsyncStorage. For an actual local-write failure, remove only eligible disposable cache entries and retry the write once; if it still fails, retain the in-memory input and do not claim durable success. Exact limits, cleanup/index implementation and local-failure presentation remain proposals to finalize. A phone full of unrelated content can still prevent writing.
- Latest offline-scope recommendation, awaiting Anthony's choice: support offline challenge/completion/reflection recording plus the latest downloaded Progress summary, current month's calendar counts and today's available day-sheet attempts/reflections. Month counts do not imply storing individual attempt/reflection details for every day. Populate/refresh only these current-period views in the background while online, using the separate existing summary/calendar/day resource design and day pagination; do not prefetch every day's history. Incorporate locally completed reps/submitted reflections immediately and deduplicate them against backend acknowledgements/refetches. Other months and other day sheets require a connection and use in-memory query caches. On day/month rollover, switch date-keyed disposable caches to the new period and remove obsolete confirmed cache copies; never remove earlier pending uploads or content required by dependent operations. If new-period data has not been downloaded, display available local entries normally and show a connection-required state only for requested unavailable information, without fabricating a successful empty result or adding partial-history notices. This is simpler than retaining arbitrary historical months/days, but still needs summary reconciliation, date rollover and measured storage/performance checks. Today's details and unsent records are not guaranteed to have a fixed size. Keep the previous online-only-Progress alternative as discussion history, not an approved scope.
- Migration explanations: keep completed reps and explicitly submitted reflection content/revisions associated with the same account/attempt IDs, then retire obsolete lifecycle rows/tables after validating the transfer. Do not convert given-up or active attempts into completed reps or unsubmitted drafts into submitted reflections. Anthony confirmed preserving existing historical calendar dates; only new completions use the start timestamp/start time zone rule. Old rows captured the time zone at completion, so do not invent an original start time zone or recalculate their historical dates. Verify counts, date preservation, owner isolation, feeling/text/revisions and challenge links before dropping obsolete tables; settle legacy timestamp mapping, old-client rollout and receipt handling in the migration tasks.

#### Proposed technical design — October 3 review draft

This is the recommended implementation baseline, not a claim that application changes are implemented or every product recommendation is approved. It assumes Anthony selects offline recording plus the latest summary, current month's calendar and today's day sheet. The local-storage failure presentation below also awaits review. Use the engineering choices here to make implementation concrete; adjust a routine internal detail when tests or measurements justify it, while preserving the confirmed behavior and documenting the adjustment in the handoff.

##### 1. Local saving and a failed device write

- Await the device write before navigating to Success or leaving an explicitly submitted reflection. This is a local storage operation; do not wait for an HTTP response or display a network Saving state.
- First failure: discard only disposable, backend-confirmed downloaded day/month cache payloads and obsolete period caches, retaining the compact summary/reconciliation metadata, challenge catalog, verification, pending uploads and content needed by dependent operations. Retry the same local write once, with the same completion UUID or submission ID. Do not clear all AsyncStorage or delete a pending rep to make room for another.
- If the retry fails, keep the completion or reflection input in memory on the current screen. Proposed inline copy: "Couldn't save on this phone. Try again." The existing primary action retries the local write; it does not generate another rep. A confirmed storage-full error may additionally suggest freeing device storage. Do not show a separate Failure page or claim the data is durable. A completed challenge is no longer eligible for Give up while this local save is being resolved.
- Reflection input remains editable. A genuinely new explicit submission receives a new submission ID; retries of an unchanged submission preserve its immutable payload/ID. Serialize repository operations so an acknowledgement cannot race a newer save. Optional cache-write failure must not block already available challenges or discard the previously committed journal.
- Background HTTP failures still follow the confirmed quiet upload/retry policy. A failed acknowledgement write leaves the older durable upload intent available for safe replay; never delete that intent only in memory and assume recovery is complete. These rules protect persisted content; memory-only input still cannot survive termination when device persistence has failed.

##### 2. Resource contracts

Use shared strict Zod schemas in `packages/contracts`, update generated OpenAPI and mobile callers with their API slice, and derive the account from the bearer session. Do not accept user/account IDs, attempt status, finish/deadline values or challenge revisions in the public write payloads.

| Method and resource                                  | Request/response baseline                                                                                                                                                                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /v1/challenges                                   | Download the active Level 1 catalog for all venues in one request. Return stable challenge/placement IDs, venue positions, instruction/subtext, duration and level context. Venue selection and cycling require no further request. |
| POST /v1/attempts                                    | Create one completed rep using the client UUID and captured start values. Return 201 for creation or 200 for a matching repeat; a conflicting reuse of the same account/UUID returns 409.                                           |
| PATCH /v1/attempts/:id                               | Submit reflection or edit text using `submissionId`, `expectedReflectionRevision` and a nested `reflection` patch. Return the canonical attempt plus acknowledgement of that submission.                                            |
| GET /v1/progress/summary?timeZone=America/Toronto    | Return `today`, `timeZone`, `totalReps`, `currentStreak`, `bestStreak` and compact streak context for current-period offline calculation. No selected-calendar-month parameter.                                                     |
| GET /v1/progress/calendar?month=2026-10              | Return `month`, `monthlyReps`, `activeDays` and `days: [{date,reps}]`. Derive monthly figures from these counts; omit overall totals/streaks.                                                                                       |
| GET /v1/attempts?date=2026-10-03&limit=20&cursor=... | Return `date`, `totalReps`, `entries` containing canonical attempts/nested reflections, and `nextCursor`. Keep the existing limit range 1–50 and self-contained date/start-time/UUID cursor.                                        |

Proposed completion payload; IDs below are placeholders, not seed changes:

```json
{
  "id": "<attempt UUID generated on Completed>",
  "challengeId": "<stable catalog challenge ID>",
  "venue": "gym",
  "startedAt": "2026-10-03T14:00:00.000Z",
  "startTimeZone": "America/Toronto"
}
```

First reflection submission:

```json
{
  "submissionId": "<UUID generated for this explicit save>",
  "expectedReflectionRevision": 0,
  "reflection": { "feeling": "a_little_better", "text": "I said hello." }
}
```

Later text edit:

```json
{
  "submissionId": "<different UUID for this edit>",
  "expectedReflectionRevision": 1,
  "reflection": { "text": "I said hello and asked a question." }
}
```

- Canonical attempt fields: `id`, `challengeId`, `venue`, `levelId`, `instruction`, `startedAt`, `startTimeZone`, `displayTimeZone`, `activityDate`, and `reflection: null | {feeling,text,revision}`. Instruction is projected from the current linked challenge, not copied into the attempts table. `startTimeZone` is nullable only for migrated legacy records; `displayTimeZone` provides their historical display fallback. New records return the captured start zone for both.
- Keep the existing descriptive feeling codes and 10,000-character text limit. Normalize blank text consistently. Initial submission must contain a feeling, nonblank text, or both. A later edit omits feeling and cannot change a recorded feeling, including changing a text-only reflection into a feeling reflection. Clearing text is allowed if a saved feeling remains; do not turn a text-only reflection into an empty/deleted reflection because deletion was not requested. Validate on the phone and again in the API.
- A PATCH acknowledgement identifies the `submissionId` and applied revision. The server checks a matching receipt before the expected revision, so retrying a successful request with a lost response works. Reject altered payload reuse or a genuinely stale revision. Return only owner-scoped current data; applying an older acknowledgement must not replace a newer local reflection.
- Keep identity behavior intact while renaming action paths. Proposed noun-resource mapping: session creation/recovery/renewal/transfer redemption through typed POST /v1/sessions requests; bearer-identified GET /v1/sessions/current; devices and credentials through their collections and DELETE /:id with existing soft-revocation semantics; POST /v1/transfers, POST /v1/transfer-inspections and POST /v1/transfer-approvals for the existing proof/approval flow. Keep secrets in request bodies rather than new URL parameters. Validate every old caller and recovery proof against this mapping before cutover. Excluding multi-phone reflection editing does not remove account transfer/recovery.

##### 3. Database model and migration sequence

- Retain the existing account-scoped attempt key `(user_id,id)`, account ownership and stable challenge/venue/Level 1 references. Move instruction/subtext/duration/level metadata onto challenges, add an active flag, and point venue placements to challenge IDs. Keep referenced inactive challenge/placement rows. Pending completions must not be rejected solely because a previously downloaded challenge became inactive or its minor wording changed.
- Attempts retain captured `started_at`, frozen `activity_date`, `start_time_zone` for new rows, nullable legacy display-zone metadata for old rows, and `reflection_feeling`, `reflection_text`, `reflection_revision`. No domain status, queue version, challenge revision, deadline, elapsed duration or product finish timestamp remains. Keep the owner/date/start-time/UUID history index; retain appropriate foreign-key indexes and owner RLS under the actual runtime role.
- Use narrowly scoped `attempt_patch_receipts` for repeated reflection delivery. Refactor the existing reflection action receipt mechanism rather than add a generic receipt/outbox framework. Store account/attempt/submission identity, normalized payload digest and applied reflection revision; do not duplicate reflection text/instruction in receipt payloads. A matching repeat acknowledges the prior application and can project the current canonical attempt. This is an internal replay record, not a separate reflection resource/table.
- **Expand:** add new columns/constraints and canonical challenge fields while existing data remains readable. Audit completed counts, owner/ID/date sets, submitted reflection content/revisions, inactive references and any challenge whose live venue placements point at conflicting revisions. Choose the canonical current catalog explicitly; do not select arbitrary wording based on an ID sort.
- **Backfill:** preserve every completed attempt's ID/owner and existing calendar date. Copy only submitted reflection feeling/text and its saved revision onto the matching owner/attempt. New missing reflections use revision 0; preserve positive legacy submitted revisions rather than resetting them to 1. Draft/skipped content does not become submitted feedback. Keep old server start timestamps; original start zones are unknown, so leave the new start zone null and preserve the old stored zone only as a legacy display fallback. Do not recalculate historical dates or invent the original zone.
- **Cut over:** finalize the backfill with old writers stopped, update API/contracts/mobile together and prevent older clients from writing through retired protocols. Locally test the whole migration sequence; release coordination/minimum-client compatibility belongs in the rollout runbook. Do not introduce fake finish/deadline values just to satisfy old lifecycle constraints.
- **Contract:** after comparison tests and caller cutover, remove active/given-up rows, obsolete statuses/columns/constraints/indexes, personal queues/preferences/skips, old reflection rows/routes and challenge revisions. Retire legacy draft/final/skip receipts only after their protocol is no longer accepted; the new PATCH receipt mechanism remains. Keep a recoverable pre-migration snapshot and test restoration. Do not edit already-applied migration history or guess a new migration number; follow the repository's Drizzle migration workflow and applicable implementation instructions.

##### 4. Phone storage and state ownership

Use a small persistence repository with two account-scoped versioned keys in Phase 07, for example `justgo:v1:<accountId>:catalog` and `:journal`. Phase 07A adds the `:access` verification snapshot through the same repository. Credentials remain in the existing secure-storage adapter.

- `catalog`: downloaded active challenges/venue placements and fetch metadata. Replace the downloaded catalog on a successful refresh; do not save venue selection or cycling order.
- `journal`: one JSON envelope containing local completed attempts/submitted reflection views, immutable queued operation payloads, acknowledgement/reconciliation metadata, a local change generation, and optional summary/current-month/today snapshots with date/time-zone/pagination metadata. Saving the display entry and its upload intent in this one envelope avoids two independent writes that can leave only one persisted. Acknowledgement plus aggregate reconciliation also uses this envelope. Do not assume a multi-key batch write is a database transaction.
- Serialize writes through one repository per account. Zustand exposes hydrated local records/flow state; screens cannot mutate the persisted journal independently. Keep editor drafts/dialogs in React and active countdown/browsing in a memory-only Zustand slice. TanStack owns remote queries; selectors compose remote data with the journal rather than copying every query into Zustand.
- Hydrate/validate/version the saved envelope before using it. A malformed disposable download can be fetched again; preserve/quarantine an unreadable pending journal instead of resetting it and losing records. Cancel account-bound reads/uploads on account changes, clear in-memory views and hydrate the correct account. Never upload an old account's journal using a new account's session.
- Prune confirmed local entries only after they are no longer needed by the current flow, today's view, dependent uploads or aggregate reconciliation. Earlier pending entries remain across day/month rollover. Do not accumulate downloaded old months/day details under the proposed limited cache. Measure single-envelope serialization, write latency and size with representative offline queues and long reflections; internal key partitioning may be refined if measurements require it, without weakening consistent saves/recovery.

##### 5. Upload ordering and retries

- Generate the attempt UUID once on Completed. Generate a submission UUID once per explicit reflection save/edit. Persist immutable operation payloads before sending; unsubmitted typing and Skip create no reflection operation.
- Use one account-bound sender, one operation in flight per attempt and ordered create → first reflection PATCH → later text PATCH. A queued edit can depend on the preceding submission's acknowledgement; bind its expected backend revision when that dependency is resolved, persist the bound payload, and reuse it unchanged on retries. Do not send the next dependent operation before the acknowledgement is durably recorded.
- Follow the confirmed immediate attempt plus approximately 2-second and 5-second transient retries, then pause. Reconnect/restart/foreground restarts a bounded cycle, with coalescing, cooldown and Retry-After. Known offline state waits. Disable independent mutation retries that would multiply this policy. Sending is opportunistic while the app can run; there is no terminated-process execution guarantee.
- Treat timeouts/lost responses as unknown outcomes: replay the same completion UUID or reflection submission ID. A matching create/receipt confirms it without another rep or revision increment. Persist an acknowledgement before clearing the pending marker. Overlay any newer queued reflection over an older canonical response.
- A 401 uses the existing serialized session renewal/recovery flow and pauses if the same account cannot be authenticated. Permanent validation/revision/ownership rejection stops transient retries, retains the local content and emits redacted diagnostics. Use frontend validation/correction when the relevant editor is opened; do not invent a network Retry page or multi-phone merge feature. An unexpected stale PATCH is never silently rebased over different server text.
- Earlier valid-access reps can upload after subscription expiry. Validate eligibility using account-owned, server-verified subscription coverage for the recorded start period rather than a current-paid guard or a client premium boolean. Keep this permission separate from starting new paid activity and preserve ordered dependent reflection uploads. Phase 07 builds/tests this eligibility boundary through isolated provider fixtures; actual verification/coverage recording and end-to-end expiry acceptance belong to Phase 07A, not assumed to exist today. Keep production access closed until that integration passes.

##### 6. Progress reconciliation and the limited cache

- Day rows merge by attempt UUID, with the latest explicitly submitted local reflection taking precedence until its operation is acknowledged. No extra attempt GET is needed. Preserve existing self-contained pagination, start-time ordering and backend current wording.
- Persist a server aggregate baseline and a separate set of local reps not yet covered by that baseline. Count only that set as an addition; retaining a confirmed row on the phone is not a reason to add it again. Keep acknowledgement/rebase markers separate from the domain attempt object.
- For summary/month aggregates, do not install a new response while relevant completion creates have unknown outcomes. Drain/replay those creates first. Capture the local change generation when starting a refresh; discard aggregate results if a new local completion arrived in the meantime. After all relevant creates are acknowledged, a fresh response can replace the baseline and remove the included additions in the same journal write. If refresh fails, keep the existing baseline/additions. Thus 10 + 1 remains 11 before upload, after acknowledgement and after refresh. Day-list reads can still merge by ID while uploads are pending.
- Summary additions cover account totals; month additions cover only their frozen activity dates. Recalculate monthly reps and active days from known day counts plus additions. Provide compact summary streak context for the current month: its month key, the consecutive run ending immediately before that month and the best run before it. Combine that with known current-month active dates/local additions to calculate streaks across the boundary. If required historical/date context is unavailable, retain the last verified streak figures until a coherent refresh instead of inventing an exact result. Test delayed previous-month uploads and time-zone/day rollover explicitly.
- While online and access permits, hydrate then refresh/preload the latest summary, current month and today's day query in the background; fetch only today's required pages, not every calendar day. Cache all available today pages under one date with their cursor/completeness metadata. Online older history uses ordinary in-memory queries. Under this draft scope, offline older months/day sheets show the connection-required state, and the available today view has no partial-history notice.
- At midnight/month rollover, select cache keys matching the new local date/month and update streak context where known. Remove obsolete confirmed detail snapshots; never remove pending activity, remap its frozen dates or label yesterday's cache as today. An unavailable new-period query is not a successful empty response. Available local today entries remain visible normally.

Technical references for this design: [HTTP PATCH and conditional/atomic application](https://www.rfc-editor.org/rfc/rfc5789.html#section-2), [PostgreSQL snapshot isolation](https://www.postgresql.org/docs/current/transaction-iso.html), and [AsyncStorage's persistent key-value API](https://github.com/react-native-async-storage/async-storage). These support implementation mechanics; product policies above come from the confirmed decision record or explicitly marked recommendations.

**Final review and verification for the Phase 07 implementation breakdown**

- Review the recorded confirmations and two remaining product recommendations with Anthony, then reconcile the scope wording and freeze the technical baseline/ordered tasks below before application changes. Do not redo already confirmed subscription, resource, start-date, local-save or multi-phone decisions.
- Write/run relevant tests and verify affected UI with Browser Use in the in-app browser; use Computer Use in Google Chrome if needed. Include local skip/start/give-up behavior, explicit resource/filter/value requests without backend UI-flow context, background versus fresh-launch countdown behavior, start-date/midnight/time-zone attribution, UUID retries/lost responses, immediate locally persisted completion/reflection/calendar edits with no network-gated UI, attempt reflection-column migration and nested/null projection, initial/text-only attempt PATCH preserving existing feeling and revision/replay protection, removal of separate reflection routes/callers, resource routes/CORS, the expected nonempty catalog in every venue, first-download failure versus usable cached challenges after failed refresh, cached summary/month/day display without partial-history warnings, offline messages only for requested unavailable lookups, bounded cache storage/performance without evicting pending uploads, airplane-mode recording from available data, restart/foreground/reconnect uploads, ordered completion/reflection-patch/edit delivery, account isolation, stale edit/acknowledgement handling, local/remote progress deduplication and revised challenge-content history behavior. Fix failures and repeat until affected behavior passes. Documentation-only recording does not claim those implementation checks have run.

#### Implement

Execute the following steps after the Phase 06A handoff and review of the two product recommendations. The order is concrete; this is still a review draft, not authorization to begin application/schema changes in this discussion. For every code slice, write/run its relevant tests and verify affected UI in the in-app browser, using Chrome fallback as instructed. Use isolated access/provider fixtures until live billing is wired; never introduce a production premium bypass.

1. **Freeze scope and establish the implementation baseline.** Reconcile the chosen offline cache and local-storage failure behavior with the confirmed checklist, remove superseded scope wording, read the 06A handoff and refresh relevant tests. Inventory old routes/callers, migration state, saved data and any deployed old client; create the migration/rollout checklist. Use exact versioned Expo documentation when choosing compatible AsyncStorage, Zustand and connectivity dependencies. RevenueCat dependencies belong to Phase 07A. Do not reopen settled product decisions.
   **Verify:** every confirmed change has an implementation/test owner in this task list; approved-versus-proposed behavior is unambiguous; baseline commands and existing changes are recorded.

2. **Define the shared runtime contracts and resource map.** Implement the proposed completion, nested reflection PATCH, canonical attempt, catalog, summary/month/day schemas, typed errors and OpenAPI. Preserve the text limit/feeling codes, owner-derived identity and self-contained cursors. Map identity action routes to noun resources while preserving their existing proofs/soft revocation. Prepare API/eligibility test doubles and matching mobile request types alongside each consuming slice.
   **Verify:** malformed dates/zones/UUIDs, unknown immutable write fields, empty reflection, altered feeling, text limits, cursor/date mismatch and typed acknowledgement responses are covered; CORS permits the selected methods; no standalone reflection or mandatory attempt GET enters the new contract.

3. **Build and dry-run the migration sequence.** Add canonical challenge fields/active references, completed-only attempt fields, inline reflection columns, replay receipt support and history indexes. Backfill completed IDs/owners/dates and submitted content/revisions, retain legacy display-zone information and prepare the final removal migration separately. Record canonical wording selection and before/after comparison queries. Preserve a restorable local fixture/snapshot before retiring anything.
   **Verify:** submitted feeling-only/text-only/both survive; drafts/skips never become submissions; historical dates/counts/owners/challenge references stay correct; obsolete active/given-up rows cannot become reps; runtime-role isolation, indexes and snapshot restoration pass.

4. **Implement the catalog and attempt write API.** Add catalog reads, completion-only POST and initial/text-only PATCH using the shared contracts and transaction-scoped ownership. Use matching UUID creation retries and scoped PATCH receipts; derive activity dates from the submitted start zone, and project current challenge wording. Introduce the earlier-upload authorization boundary with an isolated verified-coverage provider until billing is connected. No server-selected card, active lifecycle or per-skip write is used by the new endpoints.
   **Verify:** same-ID/repeated-submission/lost-response requests do not duplicate reps/revisions; changed payload reuse and stale revisions fail safely; first reflection and edits preserve feelings; midnight/time-zone attribution, inactive referenced challenges and cross-account denial pass database integration tests.

5. **Implement the persistence repository and local failure fallback.** Add compatible AsyncStorage/Zustand dependencies, versioned account-scoped catalog/journal adapters, schema-validated hydration and serialized envelope updates. Persist each local attempt/submission and its upload instructions together; keep credentials secure and countdown/editor drafts out of the envelope. Add the reviewed disposable-cache cleanup/one-retry/inline local-error behavior.
   **Verify:** a failed initial write, failed retry, failed acknowledgement write, interrupted write/relaunch, optional cache failure and account switch preserve the last committed content; no false Success or unqueued local record appears; pending data is never pruned. Browser-test both completion and reflection local-error paths; verify native durability with an appropriate simulator build when browser storage cannot establish it.

6. **Implement the ordered background sender.** Add a single account-bound coordinator for creates and dependent reflection/edit operations, durable acknowledgements, immutable IDs/payloads, serialized session renewal and the confirmed bounded retry triggers. Disable overlapping retry layers. Stop transient retries for permanent invalid requests and preserve their data/diagnostics without network-save failure UI.
   **Verify:** airplane mode, timeouts, lost acknowledgements, termination before/after response, two rapid explicit edits, repeated reconnect/foreground events, Retry-After and old-account responses preserve ordering and exactly one rep. Dependent PATCH never runs before its create/preceding submission is durably confirmed.

7. **Wire the challenge → Success → reflection flow to local state.** Replace server browsing/active controllers with the focused Zustand flow, local venue/deck cycling, captured start values and an in-memory countdown deadline. Create the UUID only on Completed and navigate after the local write; persist reflection only on explicit submission and send nothing on Skip. Remove autosave/draft/recovery/version/success-lookup callers, network loading/failure/retry screens and the normal empty-venue state. Preserve dirty-close choices and consent-aware analytics interfaces; PostHog exporting remains Phase 08.
   **Verify:** skip/start/give-up send no product mutation; all venue catalogs are populated; failed refresh leaves downloaded challenges usable; first-download failure has a recovery state; fresh launch resets unfinished activity; lock/background recomputes the countdown; completion/reflection proceed immediately offline with no HTTP gating.

8. **Implement split Progress reads, local reconciliation and calendar editing.** Replace the combined/day routes with independent summary/calendar/attempt queries using consistent aggregate snapshots and start-time pagination. Add Add/Edit reflection to day entries. Implement same-ID row merging, baseline-plus-additions totals, generation-fenced refreshes, streak context and the reviewed summary/current-month/today cache, including rollover and unavailable-read presentation.
   **Verify:** switching months does not query/recalculate the summary; 10 + 1 stays 11 through acknowledgement/refresh/restart; stale responses and older reflection acknowledgements cannot regress display; current-month counts/today pages survive offline; older history obeys the chosen connection rule; midnight/month/time-zone rollover and earlier pending dates are correct; available entries have no partial-history notices.

9. **Complete caller/protocol cutover and remove obsolete implementation.** Re-run the backfill comparison with legacy writers stopped, finalize new constraints and remove old tables/columns/routes/callers, including separate reflections, revisions, queues/preferences/skips, active lifecycle and legacy draft/final/skip receipts. Preserve new targeted PATCH replay support. Record coordinated API/mobile migration order and old-client handling for release integration; do not deploy externally just to complete this documentation task.
   **Verify:** clean-database and representative existing-database migrations pass; legacy product routes cannot write obsolete state; account recovery/revocation/transfer still passes through noun routes; source/contracts/seeds/tests contain no accidental dependency on removed tables/fields; completed history dates/content survive the final contract migration.

10. **Finish integration verification, reconcile documentation and hand off.** Run the affected workspace/database checks and full implemented user journeys, perform measured storage/serialization/queue tests, repair failures and repeat. Update PRD, tech stack, decisions, design/app-shell/scope/identity guidance, architecture learning map, relevant README/handoffs and prior-phase supersession references to the actual result. Preserve historical test evidence and carry physical-device/staging release gates forward. Save `handoffs/phase-07-api-offline.md` with actual migration/contracts/retry/cache choices and the billing integration boundary, test evidence, issues and next steps.
    **Verify:** acceptance checks below pass; documentation matches code rather than the draft; no pending uploads are lost under the chosen retention policy; code/UI/native evidence is distinguished accurately and remaining release gates are named.

#### Keep out of this phase

- Native purchase/paywall/restore implementation, subscription refresh/expiry policy, provider billing records/webhooks, QStash and scheduled billing recovery. These belong to Phase 07A; recorded subscription decisions remain intact there.
- No production premium bypass, Stripe checkout, generic server outbox or continuously running worker for phone uploads. Keep existing authentication/ownership checks and isolated development/test access boundaries.
- General PostHog activation remains Phase 08. Earlier physical-device/staging gates remain in Phase 09.

#### Ready to hand off when

- [ ] API/local-save workstreams pass the recorded completion, reflection, offline/cache/retry, start-date, resource-contract and migration checks; split Progress queries do not refetch overall summary on month changes or double-count local completions.
- [ ] Authenticated earlier-upload eligibility and access seams have tested isolated provider fixtures and documented production integration requirements for Phase 07A; no live provider/paid-access completion claim or production bypass is introduced.
- [ ] Shared contracts/mobile/API are cut over together, completed historical dates/content survive migration, and no obsolete route/table/caller remains in the implemented product flow.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; reconcile implemented API/offline guidance and the handoff index under the approved documentation sequence.

**Carry forward:** Final resource contracts and migration/rollout evidence; state ownership, start-date attribution, reflection PATCH/revision/replay rules, AsyncStorage cache limits and upload/reconciliation behavior, offline/read states and test evidence; tested access/earlier-upload eligibility interfaces and isolated fixture boundaries to connect in Phase 07A.

**Handoff file to create:** `handoffs/phase-07-api-offline.md`

**Working notes / blocker:** Phase 07 implementation has not started. The API/persistence confirmations, proposed technical design and ten ordered tasks with verification are recorded. Review limited offline Progress (summary/current month/today) and the exceptional inline local-storage failure fallback, then reconcile the scope wording/freeze the baseline before implementation. The earlier broader cache scope remains the confirmation record until that review; the online-only-Progress alternative was not selected. Routine implementation mechanics and measured limits are engineering work, not repeated owner approval questions. Implement/verify next and reconcile affected documents afterward. Phase 06A remains separate and preserves current behavior. Native billing and all nine subscription rules are owned by Phase 07A, with no implementation started.

<a id="phase-07a"></a>

### Phase 07A — Native subscriptions & reliable billing

**Status:** Not started
**Depends on:** 07

**Acceptance references:** PRD AC-03 · Tech acceptance 6, 14–17, plus all nine confirmed subscription rules below. Align older access-freshness requirements after implementation under the approved documentation sequence.

**Outcome:** Verified native purchases unlock promptly, still-valid saved verification permits offline paid use, earlier valid-access activity can synchronize after expiry, and later subscription changes recover reliably.

**Scope and sequencing:** This is new billing implementation, separated from API/offline refactoring at Anthony's request on October 3. Complete Phase 07 first; reuse its account-scoped persistence and eligibility interfaces. Complete 07A before Phase 08 subscription-management/vendor-cleanup integration and before Phase 09 paid-product release validation. No application/schema work is authorized by this planning edit. Preserve the subscription rules already decided; QStash remains the existing planned delivery choice, not a requirement for Phase 07 phone uploads.

**Confirmed subscription behavior — October 3**

1. **First use:** successfully verify subscription access through the API before unlocking paid features. A missing verification cannot unlock first use offline.
2. **Remember verification:** persist the API-verified status, expiry and last successful check time on the phone, scoped to the account. Clear/switch the applicable snapshot when the account changes; do not reuse another account's access or treat an invented client premium flag as verification.
3. **Immediate access:** on opening the app, hydrate and use still-valid saved verification immediately, including offline. Access validity depends on the verified expiry, not a one-minute freshness cutoff or whether a background query has an error.
4. **Background refresh:** on app opening, foreground return or reconnection, check when verification is missing or the last successful check is more than five minutes old. When online, refresh without delaying access supported by an unexpired saved verification. Successful checks update the persisted information; coalesce overlapping event triggers. Missing verification remains locked until verified, and network failure must not replace a still-valid saved verification with an unavailable result.
5. **Purchase/restore:** verify immediately through the API after purchase or restore, bypassing the five-minute refresh threshold. Preserve the existing honest purchase/restore pending behavior; the no-network-save-state decision concerns completion/reflection uploads, not payment verification.
6. **No constant polling:** remove the current 30-second mobile access requests and one-minute freshness-based access cutoff. Five minutes passing alone triggers neither a request nor an access block. This mobile policy does not remove the separately planned backend webhook/reconciliation schedules.
7. **Network failure before expiry:** continue paid use from the still-valid saved verification. A failed network check alone must not close paid navigation before its verified expiry.
8. **At the saved expiry:** require an online check before continuing paid use, regardless of the five-minute refresh threshold. A verified renewal updates the saved expiry and extends access; otherwise paid features remain locked. Do not invent an offline grace period or assume an unverified renewal. Existing local reps and submitted reflections remain saved.
9. **Upload earlier reps after expiry:** automatically upload reps recorded while verified access was valid, with authentication and ownership checks, even after access expires. Do not let a current-paid-access requirement prevent these earlier records from synchronizing. Separate earlier-upload eligibility from unlocking new paid activity, and finalize the server-side eligibility representation during implementation. Preserve dependent submitted reflection uploads under the completion/reflection ordering rules.

- Confirmed subscription example: after an API check verifies access through October 20, using downloaded challenges without reception on October 10 remains allowed. Opening/foregrounding/reconnecting checks in the background only when missing or more than five minutes since the last successful verification; the passage of five minutes alone does nothing. At October 20's exact saved expiry, paid use waits for an online check, even if the last check was recent. Earlier valid-access reps remain saved and may upload with authentication/ownership checks after expiry. Purchase/restore checks are immediate. This replaces the former short-freshness/failed-recheck gate and supersedes the earlier unapproved offline-access/upload policy.

#### Proposed integration design

- Implement the nine confirmed rules using persisted account-scoped verification, event-triggered refresh eligibility, an expiry check and immediate purchase/restore checks. Five-minute freshness and verified expiry are separate values. No interval polling or five-minute timer starts a check. Coalesce the same account's overlapping checks and ignore results from an old account/verification generation.
- Configure RevenueCat with the backend's stable account/customer binding before purchase; build the native products/paywall, restore and management controls. Keep honest purchase/restore verification states and unpaid recovery/legal/data access. Private history recovery remains an identity function, not a store-receipt recovery shortcut.
- Implement provider adapters plus planned billing customer/subscription/entitlement/event records. Preserve server-verified coverage needed for earlier uploads, successful-check timestamps and refresh claim token/generation/expiry. Network/provider calls occur outside database transactions; apply current provider state in short fenced commits shared by purchase, webhook/job and reconciliation paths.
- Authenticate notifications, durably record provider/environment/event identity, publish a minimal QStash reference and handle lost/failed handoffs. Signed job delivery reads that record, fetches current provider state and records the business outcome; a duplicate or older event must not regress access. Store no reflection content in jobs/telemetry.
- Keep the existing selected five-minute handoff repair/targeted reconciliation and daily rotating provider scan, with due-work indexes, claim expiry, checkpoints, bounded batches/concurrency, missed-run/exhaustion alerts and controlled replay. Verify current provider/cron eligibility, compatible SDKs and production limits/costs during implementation before enabling schedules; no plan price is assumed here.

#### Resource and persistence integration

| Method and resource           | Request/response baseline                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET /v1/access                | Read the account's API-verified access information.                                                                                                                                              |
| POST /v1/access-verifications | Check access through the API, with immediate provider verification after purchase/restore. Return the authoritative status, expiry and check time used by the nine confirmed subscription rules. |

- Billing notifications/jobs use noun resources such as billing events/deliveries; keep provider/QStash/scheduler authentication separate from device sessions. Resolve the platform-required scheduler adapter method in its integration slice, without introducing user-facing action paths or changing the selected billing recovery architecture.
- `access`: API-verified status, expiry and last successful check time. An unavailable network result cannot erase a still-valid verified snapshot. An authoritative unpaid/revoked result does update access.
- Add the account-scoped `justgo:v1:<accountId>:access` adapter through the Phase 07 repository. Keep verification separate from journal upload intent; deleting or locking access must not erase pending reps/reflections. Implement the exact saved expiry, event-triggered refresh and immediate purchase/restore rules, not the superseded 30-second polling/one-minute cutoff.
- Keep shared strict runtime contracts/OpenAPI, provider adapters and mobile callers synchronized in their implementation slices. Provider/QStash credentials remain server-side; native build/signing and compatible RevenueCat dependencies are verified here.

#### Final review and verification

- Verify all nine subscription rules: first-use verification, persisted account isolation and immediate unexpired hydration, five-minute event-driven checks and trigger coalescing, immediate purchase/restore verification, no 30-second polling or one-minute cutoff, no request/block merely because five minutes passes, network failure before expiry, exact expiry/renewal locking, preserved local entries and authenticated owner-checked synchronization of earlier reps after expiry. Include single-device queued reflection edits/lost acknowledgements without building a multi-phone merge workflow.

#### Implement

For every code slice, write/run relevant tests and verify affected UI in the in-app browser, using Chrome fallback as instructed. Native sandbox purchase/restore verification is additionally required where a browser cannot establish store behavior. This plan records work; it does not claim those checks passed.

1. **Establish the billing baseline and configuration.** Read the Phase 07 handoff, verify its access/eligibility seams and preserved local records, and complete the App Store Connect/RevenueCat setup begun in Phase 01. Verify current compatible native SDKs, provider contracts, sandbox/environment isolation, account/customer binding and production scheduler/queue limits before adding dependencies or enabling live integrations. Reuse Phase 07 resource-only conventions.
   **Verify:** products/entitlements/customer IDs map correctly without secrets in source/docs; no production fixture bypass; the baseline and remaining native/staging gates are recorded.

2. **Implement verification contracts, storage and provider coverage.** Add the shared access/read/verification schemas, account-scoped `:access` hydration, provider adapters and billing customer/subscription/entitlement/event schema/migrations. Preserve server-verified subscription coverage for earlier valid-access uploads. Introduce shared short-lived refresh claims/fencing across immediate, job and reconciliation paths; fetch provider state outside database transactions. Connect Phase 07's authenticated eligibility seam to real verified coverage.
   **Verify:** forged client access flags, wrong ownership/account, failed provider calls, interrupted commits and stale concurrent responses cannot grant or regress access; existing journal entries survive unavailable/revoked access; earlier completed reps and dependent reflection uploads retain eligibility after expiry.

3. **Implement native purchases and the nine subscription rules.** Finish App Store Connect/RevenueCat product configuration, stable customer mapping, paywall, purchase/restore/management controls and server provider verification. Implement persisted status/expiry/check time, immediate unexpired hydration, event-driven five-minute refresh and exact expiry locking. Record server-verified coverage and connect the earlier-rep upload boundary so expiry does not strand valid existing records. Keep purchase/restore verification pending states distinct from quiet journal uploads.
   **Verify:** sandbox purchase/restore/cancel/expire/refund and recovered account mapping work; five minutes passing causes no request/block; network failure before expiry does not close access; purchase/restore bypasses the threshold; expiry requires renewal verification; earlier authenticated owner-checked reps/reflections upload afterward; an old account response or forged client premium flag cannot unlock another account.

4. **Implement durable billing delivery and scheduled repair.** Add customer/subscription/entitlement/event data, authenticated webhook receipt, QStash publication/signed handling and shared fenced provider refresh. Implement the existing five-minute repair/targeted reconciliation and daily rotating scan with bounded work, checkpoints, claim expiry, exhaustion/missed-run alerts and replay. Check current provider quotas, SDK/cron eligibility and production costs before configuring live schedules.
   **Verify:** duplicate/out-of-order notifications, failed/lost publish acknowledgement, termination, unavailable database/provider, invalid signatures/environments, overlapping purchase/job/cron refreshes and stale claims cannot regress entitlements or falsely mark work processed. Missing notifications and interrupted/missed schedules resume from durable state.

5. **Verify integrated billing, reconcile its guidance and hand off.** Run all nine subscription checks plus the full Phase 07 offline recording/upload flow with real sandbox verification and controlled provider failures. Run affected workspace/database tests and browser/native checks; fix failures and repeat. Update billing/access sections of PRD, tech stack, decisions, app-shell/identity/setup guidance, handoff index and this plan to the implemented result, preserving historical evidence and deferred release gates. Save `handoffs/phase-07a-billing.md` with exact mappings (no secrets), contracts/migrations, subscription/cache policy, queue/cron configuration, failure/replay runbook, test evidence and next steps.
   **Verify:** no valid earlier activity is stranded by expiry, no subscription failure deletes local history, immediate purchase verification does not wait for a queued job, and documentation distinguishes implemented behavior from pending native/staging release validation.

#### Keep out of this phase

- No Stripe checkout, Redis, Celery, continuously running worker or generic idempotency/outbox table without a concrete need. Queue delivery is for backend billing work; phone reps/reflections retain Phase 07's AsyncStorage sender.
- No waiting for a queue to grant a verified purchase, client premium flags, private-history recovery from a receipt, or holding database transactions during provider calls.
- No reopening settled API/offline decisions or adding a multi-phone reflection conflict workflow. General analytics activation remains Phase 08; release deployment/submission remains Phase 09.

#### Ready to hand off when

- [ ] Sandbox native purchase/restore/cancel/expire/refund works on iOS; successful payment uses immediate verification and never asks for duplicate purchase.
- [ ] All nine subscription rules pass automated/UI checks, including immediate saved access, event-only five-minute refresh, network failures before expiry, renewal checks at expiry and earlier-rep uploads after expiry without a new paid-access unlock.
- [ ] Duplicate/out-of-order events, failed/uncertain handoffs, termination, stale claims and overlapping refreshes cannot regress entitlements or lose business state.
- [ ] Missing notifications, exhausted delivery, overlapping/missed cron runs and full database outages recover or report honestly; alerts and plan/cost settings are recorded.
- [ ] Integrated Phase 07 recording/synchronization still passes with verified access and after expiry; account changes/revocation preserve pending data without granting unauthorized paid use.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; update implemented billing guidance and the handoff index.

**Carry forward:** Product/entitlement mappings (no secrets), paywall gates, all nine subscription rules, offline paid-access/restore policy, verified historical coverage and earlier-upload eligibility, billing event/claim state machines, QStash/cron configuration, failure matrix and replay runbook; browser/native evidence and remaining release gates.

**Handoff file to create:** `handoffs/phase-07a-billing.md`

**Working notes / blocker:** Phase separation is recorded October 3 at Anthony's request; implementation has not started. The nine subscription rules are confirmed and preserved verbatim. Native billing/QStash/scheduled recovery moved here from the combined Phase 07 draft, rather than being added to the API refactoring phase. Review current provider/native/scheduler compatibility and measured production capacity during implementation. Phase 08 follows this handoff; Phase 09 performs final integrated staging/physical-device/release acceptance.

<a id="phase-08"></a>

### Phase 08 — Settings, privacy & measurement

**Status:** Not started  
**Depends on:** 07A

**Acceptance references:** PRD AC-15–17 · Tech acceptance 3–4, 8–9, 17

**Outcome:** Users control recovery, private data and preferences; useful measurement respects their choices.

#### Implement

- Finish Settings with recovery-key/transfer UI, restore/manage subscription links, scoped reminder/haptic/motion preferences and privacy/terms. Schedule reminders per authorized device using cloud preferences.
- Implement authenticated export and confirmed deletion, immediate credential/session revocation, account cache clearing and durable vendor cleanup where required. Define retention/backup behavior consistent with the published policy.
- Activate explicit PostHog events through consent-aware client/server adapters. Separate general analytics and sensitive metadata choices; use stable IDs for confirmed domain events and keep analytics failure independent of product saves.
- Finish diagnostic redaction and operational dashboards. Record metric definitions and baseline collection; do not invent conversion or wellbeing targets.

#### Keep out of this phase

- No Reset progress from the mockup, unconditional vendor forwarding, session replay/autocapture or journal/credential/audio payloads in telemetry.
- No optional-analytics requirement for paid access or cloud saves.

#### Ready to hand off when

- [ ] All required controls remain reachable when unpaid; recovery/transfer, reminder permissions and preferences work on iOS.
- [ ] Export/deletion isolate the owner, revoke credentials and document any pending cleanup; deleted identities cannot resurrect accounts.
- [ ] Declining analytics blocks client/server forwarding while the app still works; telemetry/diagnostics contain no sensitive payloads.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Settings scope, recovery/data-control flows, reminder scheduling, consent and event schemas, retention/deletion runbook and redaction evidence.

**Handoff file to create:** `handoffs/phase-08-settings-privacy.md`

**Working notes / blocker:** None recorded.

<a id="phase-09"></a>

### Phase 09 — Release validation & launch

**Status:** Not started  
**Depends on:** 08

**Acceptance references:** PRD AC-01–06, 08–11, 13–17 · applicable iOS tech acceptance

**Outcome:** The complete paid product is verified, operable and ready for store submission.

#### Implement

- Run the first-release PRD acceptance matrix and applicable iOS tech checks on release-like builds and physical iPhones. Recheck identity, in-app countdown recovery, typed reflections, full calendar/day sheet, purchases, accessibility and keyboard/sheet behavior. Deferred Android, lock-screen, dictation and level tests do not block this release.
- Load-test interactive saves/history/purchase checks together with billing bursts and reconciliation using provider test doubles. Measure database connections/CPU/locks, API latency, queue age/drain time and choose configurable capacity limits.
- Deploy the integrated API and mobile build to a non-production staging environment, applying migration 0008 after its predecessors; verify end-to-end behavior before production. Verify environment isolation, restore from backup, additive migrations/rollback, older-client compatibility, alert delivery, scheduler heartbeat and incident/replay instructions. Confirm paid-plan allowances and operating budgets.
- Follow the App Store checklist below: EAS production build/upload, TestFlight, listing/screenshots/privacy/support, reviewer access and App Review submission. Upload is not review approval. Record submission/release authorization and monitor real purchase/restore and errors after launch.

#### Keep out of this phase

- No unmeasured million-user claim, overdue launch blockers, incompatible native changes through an OTA update or new feature scope during stabilization.
- Do not count Stripe or the future coach toward MVP readiness.

#### Ready to hand off when

- [ ] All launch PRD criteria (AC-01–06, AC-08–11, AC-13–17) and applicable iOS tech checks have linked passing evidence; no unresolved launch-blocking product decisions.
- [ ] Capacity, recovery/restore, security/privacy, rollback and device coverage meet documented release targets; limitations have explicit disposition.
- [ ] Store/release checklist, operational ownership and handoffs are complete; authorized release and post-release smoke results are recorded before marking launch complete.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Release/build identifiers and commits, acceptance evidence, measured capacity/budgets, known limits, rollback/incident playbooks and post-release verification.

**Handoff file to create:** `handoffs/phase-09-release.md`

**Working notes / blocker:** None recorded.

## Optional work after launch

These stages do not count toward first-release readiness. Lock-screen display is deferred until scheduled; Stripe and coaching need separate feature approval. Levels/filters, custom dictation and Android also remain deferred; write their detailed phases when their product rules and target platforms are settled. None is a prerequisite for launch.

<a id="phase-10"></a>

### Phase 10 — Lock-screen countdowns

**Status:** Not scheduled  
**Depends on:** 09

**Acceptance references:** PRD AC-06–07, 17 · Tech acceptance 9, 12, 17

**Outcome:** The same accepted challenge is visible on supported lock screens without a JavaScript background timer.

#### Implement

- When scheduled after launch, validate the current iOS Live Activity approach in a development build and connect it to the saved deadline. Add an Android chronometer only when Android is itself scheduled; do not require Android to ship the iOS enhancement.
- Implement start/update/end and tap-to-resume behavior, with minimal nonsensitive display data and reconciliation when the app foregrounds.
- Keep zero clamped and awaiting outcome; stop the display after confirmed completion/give-up. Handle notification denial, OS dismissal, unsupported versions, force-quit behavior and stale displays after another device acts.

#### Keep out of this phase

- No continuously running JS loop, per-second API requests, backend expiry job or assumed immediate cross-device lock-screen updates.
- No treating display dismissal, navigation or force-quit as giving up.

#### Ready to hand off when

- [ ] Real-device lock, background, reopen and zero behavior on the platforms being released use the original deadline; device/OS evidence is saved.
- [ ] Confirmed completion/give-up ends the display; lost responses and cross-device stale displays reconcile safely.
- [ ] Permission denial, dismissal and unsupported-device paths retain a usable in-app countdown; native limitations are documented.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Native module/library configuration, OS support, permission behavior, lifecycle integration and real-device recordings/results.

**Handoff file to create:** `handoffs/phase-10-native-timers.md`

**Working notes / blocker:** None recorded.

<a id="phase-11"></a>

### Phase 11 — Optional US iOS web checkout

**Status:** Not scheduled  
**Depends on:** 09

**Acceptance references:** PRD §4.3, §9 · Tech §8; acceptance 7, 14–17

**Outcome:** Eligible users can purchase on the web using the same authenticated app identity.

#### Implement

- Recheck current Apple/storefront rules, Stripe/RevenueCat integration and checkout data requirements. Approve rollout scope before building; keep native checkout as fallback and a server disable switch.
- Add server-allowlisted checkout creation bound to the user, verified Stripe subscription webhooks, RevenueCat mapping and app-return entitlement refresh. Support refunds, delayed payment, cancellation, portal routing and duplicate-subscription prevention.
- Reuse billing reconciliation and privacy controls. Measure conversion, refunds and net revenue for eligible visitors before expanding.

#### Keep out of this phase

- No GPS/IP eligibility guess, credentials in checkout URLs, access granted by redirect, assumed LTV uplift or Android alternative billing.

#### Ready to hand off when

- [ ] Optional scope is approved and current storefront/integration rules are verified.
- [ ] Eligible/ineligible flows, forged redirects/webhooks, delayed payment, return/restore, refund/cancel and duplicate subscriptions pass.
- [ ] Rollout/rollback, provider reconciliation and measurement evidence are recorded.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Eligibility policy/date, account/provider mappings, feature flag, additional tests, support/rollback steps and measured results.

**Handoff file to create:** `handoffs/phase-11-optional-stripe.md`

**Working notes / blocker:** None recorded.

<a id="phase-12"></a>

### Phase 12 — Future AI text coach

**Status:** Not scheduled  
**Depends on:** 09

**Acceptance references:** PRD §9 · Tech §10; acceptance 11, 16–17

**Outcome:** A separately approved text coach uses bounded, permitted context in the existing backend.

#### Implement

- Approve the feature, choose/evaluate a provider/model, and add user-owned conversations/messages/request records only now. Keep context permissions separate from analytics consent.
- Retrieve bounded history, challenge/category/progression aggregates and permitted saved reflections with owner checks. Implement authenticated streaming, stable request keys, durable concurrent usage reservations, timeouts and uncertain-outcome recovery.
- Add chat UI, usage limits/cost monitoring, disable switch, response-quality/safety evaluations and context/message deletion. Validate real-device streaming and provider retention disclosures.

#### Keep out of this phase

- No voice coach, unlimited journal export to a model, unrestricted SQL, vector database or agent framework without demonstrated need.
- No queue for ordinary interactive replies; this phase is independent of Stripe and can be scheduled first.

#### Ready to hand off when

- [ ] Feature scope/provider/privacy decisions are approved; quality/context evaluation meets documented targets.
- [ ] Real-device streams, duplicate sends, interruption/cancellation, unknown outcomes and concurrent allowance enforcement pass.
- [ ] Cross-user/context-consent isolation, deletion, prompt-injection handling, latency and cost limits are verified.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Provider/prompt versions, context policy, streaming protocol, usage/recovery states, evaluations, cost budgets and release controls.

**Handoff file to create:** `handoffs/phase-12-future-text-coach.md`

**Working notes / blocker:** None recorded.

## Handoff workflow

### At the end of every phase

1. Copy [TEMPLATE.md](handoffs/TEMPLATE.md) to the phase filename shown in the tracker.
2. Record exactly what shipped: file paths, commits, contracts, migrations, behavior and important decisions.
3. Explain issues, root causes, fixes, verification and remaining risks. Include exact commands, device/build details and evidence links.
4. Update the [handoff index](handoffs/README.md), identify unfinished work and write the next stage’s first steps. Then update/export this tracker.

### At the start of the next phase

- Read the PRD, tech stack, [scope revision](handoffs/01-ios-release-scope.md), historical [planning baseline](handoffs/00-planning-baseline.md), previous handoff and all dependency handoffs.
- Verify the recorded commit/environment and rerun the relevant smoke checks. Do not rely on chat memory.
- Resolve blockers that affect this phase. Keep unrelated decisions open with an owner and deadline phase.
- Use repo-relative links; record secret names and provisioning instructions, never secret values or private journal data.

Partial work still gets a handoff marked In progress or Blocked. Do not label an untested native feature complete because its browser preview passed.

## Repository structure

One repository rooted at `justgo/`, with documentation alongside application code. This structure is implemented by phase 01; see README and the foundation handoff.

```text
justgo/
├── apps/
│   ├── mobile/          # Expo app + native adapters
│   └── api/             # Fastify + billing jobs + migrations
├── packages/
│   └── contracts/       # Shared public schemas/types
├── docs/
│   ├── IMPLEMENTATION_PLAN.html
│   ├── IMPLEMENTATION_PLAN.md
│   ├── PRD.md
│   ├── TECH_STACK.md
│   ├── screen-refs/     # Inspiration; not final UI authority
│   ├── handoffs/        # Durable phase context
│   └── checks/          # This document’s validation
├── .github/workflows/
├── package.json
├── package-lock.json
├── tsconfig.base.json
├── .gitignore
└── README.md
```

### Working rules

- Tests live with the feature; native end-to-end flows live under mobile. Native capabilities require development builds and real-device evidence.
- For code changes, run relevant tests and inspect affected UI in the in-app browser, using Chrome if unavailable. Add native verification where a browser cannot validate behavior.
- PRD owns product behavior; tech stack owns architecture. Current explicit five-choice feelings, general challenge scope, Level 1 context and optional helper fields must be reflected in contracts.
- No local journal/offline sync, replay, day notes, surprise Settings features or draft curriculum expansion.
- Recheck provider APIs, compatibility and plan limits when implementing. This is a work sequence, not a provisioning action or delivery-date promise.

## Verification and tracking limits

- The saved baseline contains no completed application phases. Browser test fixtures are not implementation evidence.
- Browser checklist controls cannot verify handoff files or test results. Keep the full context in Markdown handoffs, including partial work when a phase is paused.
- Provider APIs, native compatibility, pricing and plan limits must be rechecked during implementation. This plan does not provision services or promise delivery dates or throughput.
- [Planning artifact verification](checks/plan-check-results.md) records checks of the HTML tool only.
- [Database connection reference](https://supabase.com/docs/guides/database/connecting-to-postgres).
