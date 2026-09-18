# JustGO — Implementation Plan

**Version:** 3 · Updated September 17, 2026  
**Status:** Phase 01 complete. Phase 02 identity is implemented with passing browser/backend checks; native recovery smoke has passed and physical-device acceptance remains pending. See the [phase 02 handoff](handoffs/phase-02-identity.md).  
**Tracker:** This Markdown file is authoritative. The historical HTML companion is not present in this checkout.  
**Sources:** [PRD](PRD.md) · [Tech stack](TECH_STACK.md)  
**Handoffs:** [Index](handoffs/README.md) · [Template](handoffs/TEMPLATE.md) · [Planning baseline](handoffs/00-planning-baseline.md)

This is the Markdown companion to the saved HTML plan: nine iOS release stages and three deferred stages. Each phase defines what to implement, what to exclude, its completion checks and the context to hand forward.

**First release:** iOS, one general easy Level 1 challenge collection, the in-app timer, Success, typed reflections, the full Progress summary/calendar/day sheet, native subscriptions, and essential Settings/privacy/recovery.

**Deferred:** Welcome screens and questionnaire onboarding (owner decision September 17), Levels and progression rules, venue/category filters, custom dictation, lock-screen display, Android release, Stripe and AI coaching. Stable challenge/revision/Level 1 history is kept now; thresholds and how prior completions count are decided later.

Phase IDs stay stable: phase 05 (lock-screen display) moves after launch and no longer blocks billing. Tracker v2 uses separate browser storage and rejects v1 exports so old completion checks cannot imply completion under the revised scope. Phase 01 is complete; see the stage table for current implementation status.

## How to use this plan

- Build each slice through the database, API and UI it needs; introduce tables and indexes with their consuming feature.
- Run relevant tests and UI verification during every phase. Phase 10 integrates and releases work already verified in its own stage.
- Mark a phase complete only after its checks and dependency phases pass, and its handoff is saved with evidence.
- **September 17 sequencing exception:** Anthony approved implementing phase 02 while Apple enrollment/signing and physical-iPhone recovery acceptance remain pending. Phase 03 and later feature implementation may proceed after the backend/client identity checks pass. Keep phase 02 open and retain those device gates before valuable-data external testing and release.
- **September 17 scope revision:** Anthony deferred welcome/questionnaire onboarding and authorized phase 02 follow-up plus phase 03 app-shell work. Build the existing screens first; onboarding is not a prerequisite for this phase. Paid access remains phase 08.
- Update this file and the handoff index when recording progress. The HTML checklist is browser-local; it does not automatically update this Markdown file or the handoffs. Export/import the HTML checklist to move it between browsers.
- Keep scope changes synchronized between the HTML and Markdown plans. Saved handoffs and actual implementation/test evidence remain authoritative.

## Stage overview

| Phase                                                     | Outcome                                                                                                 | Depends on | Status        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- | ------------- |
| [01 — Foundation & implementation decisions](#phase-01)   | A reproducible workspace and a clear list of decisions to settle before each feature.                   | None       | Complete      |
| [02 — No-signup identity & recovery](#phase-02)           | A real account survives supported recovery paths, without exposing another person’s history.            | 01         | In progress   |
| [03 — App shell & shared API](#phase-03)                  | The app restores the right account and provides consistent navigation and network behavior.             | 02         | In progress   |
| [04 — Challenge deck & reliable attempts](#phase-04)      | Browse → accept → complete or give up works against real cloud data exactly once.                       | 03         | Not started   |
| [06 — Feelings & typed reflections](#phase-06)            | A completed attempt can have optional private feedback and typed reflection text.                       | 04         | Not started   |
| [07 — Progress calendar & saved history](#phase-07)       | Users can view the full Progress summary/calendar and read day details and saved reflections.           | 06         | Not started   |
| [08 — Native subscriptions & reliable billing](#phase-08) | A verified purchase unlocks promptly, and later subscription changes recover reliably.                  | 07         | Not started   |
| [09 — Settings, privacy & measurement](#phase-09)         | Users control recovery, private data and preferences; useful measurement respects their choices.        | 08         | Not started   |
| [10 — Release validation & launch](#phase-10)             | The complete paid product is verified, operable and ready for store submission.                         | 09         | Not started   |
| [05 — Lock-screen countdowns](#phase-05)                  | The same accepted challenge is visible on supported lock screens without a JavaScript background timer. | 10         | Not scheduled |
| [11 — Optional US iOS web checkout](#phase-11)            | Eligible users can purchase on the web using the same authenticated app identity.                       | 10         | Not scheduled |
| [12 — Future AI text coach](#phase-12)                    | A separately approved text coach uses bounded, permitted context in the existing backend.               | 10         | Not scheduled |

Release order: 01 → 02 → 03 → 04 → 06 → 07 → 08 → 09 → 10. Apple account and purchase-product preparation starts during 01 alongside development. Lock-screen timers (05), Stripe (11) and coaching (12) follow release when scheduled; none blocks the first submission or depends on another later phase.

## Decisions to settle before dependent work

These remain open in PRD §13. Resolve each with the product owner and update the PRD and relevant handoff. Foundation and identity work can proceed while later content decisions are being made.

| Decision                        | Before phase                | What needs an answer                                                                                                                                                        |
| ------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding content              | Deferred                    | Welcome/questionnaire flow deferred by Anthony; revisit scope and designs separately. No phase 03 gate.                                                                     |
| Launch catalog                  | 04                          | Easy Level 1 general challenge copy, durations, helpers, art, safety rules and a useful catalog size; no threshold or venue taxonomy. CURRICULUM.md remains a future draft. |
| Deck counter                    | 04                          | Meaning of position/denominator, reset behavior and exhausted-collection copy.                                                                                              |
| Future levels                   | Later; not a launch blocker | Thresholds, unlocking/skipping, historical-credit policy and later taxonomy; retain Level 1 history now without implementing progression.                                   |
| Reflection save & dismissal     | 06                          | Feeling-only/text-only/both, empty save, Back/X and draft handling.                                                                                                         |
| Reading saved reflections       | 07                          | Per-attempt detail/expansion and whether editing/deletion is offered there.                                                                                                 |
| Apple account & offer           | Start in 01; ready for 08   | Enrollment status, bundle ID/app record, subscription product IDs/pricing/trials and RevenueCat mapping. Finalize paywall and expiry behavior before 08.                    |
| Supporting designs & formatting | Relevant phase              | Home color variants, Settings rows, reminder defaults, duration rounding and small-screen/accessibility states.                                                             |

## App Store setup — start alongside development

| When                          | Work                                                                                                                                                                                                                                                                                                                                                                            | Finish line                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 01, in parallel         | Choose individual or organization enrollment; begin/confirm Apple Developer membership and account access. Owner completes required identity/business verification, paid-app agreement, banking and tax details.                                                                                                                                                                | Record status and outstanding items; Apple verification does not prevent local development. Membership and agreements must be ready for distribution/sales. |
| Phase 01 onward; ready for 08 | Reserve a stable bundle identifier, create the App Store Connect app record and Expo/EAS project, configure signing access. In the existing JustGO RevenueCat project, connect the iOS app/store credentials, create the agreed App Store subscription group/products, and map product → entitlement → offering/paywall. Keep secret credentials out of docs and mobile source. | Matching identifiers and configured sandbox purchase path; final offer decisions settled before billing validation.                                         |
| During development, before 10 | Use iOS development builds and physical iPhones. Produce a release-like EAS build and upload using EAS Submit; test the processed build in TestFlight.                                                                                                                                                                                                                          | Purchase/restore, recovery, challenge loop and Progress pass on the actual binary. External testers may need beta review.                                   |
| Phase 10                      | Complete App Store metadata, current screenshots, icon, privacy disclosures/policy, support URL, age/content declarations, subscription information and review notes explaining no-signup access. Give reviewers the access needed to inspect the paid app. Submit the first subscription with the app version when required.                                                   | Select the tested build and explicitly submit in App Store Connect for App Review; choose the intended release control and address review feedback.         |
| After approval/release        | Verify the public listing and purchase/restore flow. Complete the separate hackathon submission using its current rules and required demo/assets.                                                                                                                                                                                                                               | Record the submitted entry and released build. Do not assume later app updates will be included in judging without checking the event rules.                |

EAS builds/signs the app and uploads it to App Store Connect/TestFlight. It does not replace Apple membership or automatically complete listing/review submission. Recheck current requirements during setup; build queues, account verification and review times vary. References: [Expo iOS submission](https://docs.expo.dev/submit/ios/), [Apple enrollment](https://developer.apple.com/programs/enroll/), [first in-app purchase submission](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase).

## Initial iOS release — nine stages

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
- Use the selected Paper screens as the visual reference; extract usable illustrations/icons/fonts and record reusable color, type and spacing values. Adapt only the approved scope changes (no Levels navigation, filters or Dictate button); keep the Progress content. Record remaining decisions with their blocking phases.
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
- Establish a server entitlement-check boundary and unavailable/unpaid/verified navigation states. Use explicitly isolated test fixtures until phase 08; no production billing bypass. Add consent-aware telemetry interfaces with export disabled until choices exist.

#### Keep out of this phase

- No onboarding/welcome flow, persistent query cache, offline journal database, duplicate server-state stores or fabricated challenge/history data. No billing implementation before phase 08.
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

**Status:** Not started  
**Depends on:** 03  
**Acceptance references:** PRD AC-04–06, 08–09 · Tech acceptance 5, 12–13, 16–17

**Outcome:** Browse → accept → complete or give up works against real cloud data exactly once.

#### Implement

- Seed one stable Level 1 record, general easy challenges and immutable revisions with duration, optional helper, art reference and explicit unrestricted venue scope. Add attempts preserving challenge/revision/level context. Do not create categories, level progress, credit events or a completion threshold.
- Build the single general challenge deck, prefetching, left/X replacement, right/heart acceptance and accessible button alternatives. Resolve the deck indicator and avoid immediate replaced/given-up repeats while alternatives exist.
- Implement client-generated attempt IDs, matching-input retries, one active attempt, server start/deadline and canonical recovery. Navigation, locking and relaunch preserve the attempt; zero awaits an outcome.
- Implement confirmed completion/give-up, preserving the original Level 1/revision and frozen completion date/time zone. Derive reps from completed attempts; exclude completed challenge IDs across revisions. Show Success after confirmation. There is no level advancement at launch.

#### Keep out of this phase

- No completed-challenge replay, favorites, GPS, adaptive recommendations, points or daily completion cap.
- No attempt on browse/left swipe, automatic failure at zero, or success/progress before server confirmation.

#### Ready to hand off when

- [ ] Approved catalog/configuration and deck/selection rules are recorded; an exhausted collection never recycles completed content or claims an undefined level threshold was reached.
- [ ] Lost start/completion responses and simultaneous device requests return the original result with one attempt and one completed rep; conflicts are rejected.
- [ ] The full loop, give-up confirmation, zero, relaunch and switching tabs preserve the correct attempt and deadline.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Content schema/seed version, endpoint contracts, attempt state transitions, retry keys, Level 1 history and no-repeat invariants, test fixtures and data/query indexes.

**Handoff file to create:** `handoffs/phase-04-challenge-loop.md`

**Working notes / blocker:** None recorded.

<a id="phase-06"></a>

### Phase 06 — Feelings & typed reflections

**Status:** Not started  
**Depends on:** 04  
**Acceptance references:** PRD AC-09–11, 17 · Tech acceptance 5, 8–9, 17

**Outcome:** A completed attempt can have optional private feedback and typed reflection text.

#### Implement

- Build the five labeled relative feeling choices with no preselection, optional reflection text, save and the approved skip/save/discard flow. Continue from Success to the same attempt.
- Add versioned feedback/reflection records and consistent final saves; separate cloud autosaved drafts from submitted feedback. Keep unsaved edits visible, reject revision conflicts and preserve already-earned completion credit.
- Use the normal keyboard and multiline text input. Custom dictation, its button, speech-recognition packages and microphone permission are deferred.

#### Keep out of this phase

- No before/after clinical measurement, separate anxiety/confidence scales, day notes, raw audio storage or AI voice coach.
- No unapproved feeling-only/text-only behavior or final-save success while part of the feedback was lost.

#### Ready to hand off when

- [ ] Reflection optionality and dismissal rules are approved; feeling-only/text-only/both cases match that decision and missing differs from neutral.
- [ ] Draft/final state, consistent feeling/text saves, dirty-input retry and concurrent-device edit conflicts pass; skipped reflection keeps credit.
- [ ] Real iPhone text entry, keyboard avoidance, long input, dismissal and screen-reader behavior pass; no custom microphone prompt or Dictate control is shipped.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Feeling schema/version, draft/final contract, conflict behavior, iPhone keyboard/device results and the agreed dismissal flow.

**Handoff file to create:** `handoffs/phase-06-reflections.md`

**Working notes / blocker:** None recorded.

<a id="phase-07"></a>

### Phase 07 — Progress calendar & saved history

**Status:** Not started  
**Depends on:** 06  
**Acceptance references:** PRD AC-13–14, 17 · Tech acceptance 5, 9, 12–13, 17

**Outcome:** Users can view the full Progress summary/calendar and read day details and saved reflections.

#### Implement

- Preserve the full P37 Progress content: current/best streak, all-time reps, navigable month/year calendar, per-day counts, monthly reps and active days. Do not replace it with a simple history list or implement Levels here.
- Build current/best streak, all-time reps, month navigation, monthly reps/active days and per-date counts using frozen local completion dates/time zones.
- Build the scrollable chronological day sheet with completion time, elapsed duration (including background and after-zero time), five feeling labels or Not recorded, plus the approved per-attempt reflection-reading interaction.
- Choose pagination/caching and indexes for the actual history queries now; verify them on representative data. Preserve original content revisions, Level 1 context and dirty edits.

#### Keep out of this phase

- No feeling heatmap, chart library, day note, standalone journal destination, practice replay or automatic adoption of every draft course.
- No fabricated zero totals on API failures or credit awarded by skips.

#### Ready to hand off when

- [ ] The full Progress summary/calendar and tappable day sheet match the approved references, with honest empty/error states and no Day note block.
- [ ] Streaks, monthly totals and ordered day entries pass midnight, DST, travel, missing feedback and multi-completion cases.
- [ ] Saved reflection reading/edit/delete scope is agreed and implemented; long histories, sheet gestures and accessible labels work.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Aggregation definitions, query/index evidence, paging/cache choices, date semantics and saved-reflection interaction.

**Handoff file to create:** `handoffs/phase-07-progress.md`

**Working notes / blocker:** None recorded.

<a id="phase-08"></a>

### Phase 08 — Native subscriptions & reliable billing

**Status:** Not started  
**Depends on:** 07  
**Acceptance references:** PRD AC-03 · Tech acceptance 6, 14–17

**Outcome:** A verified purchase unlocks promptly, and later subscription changes recover reliably.

#### Implement

- Finish the iOS App Store Connect and RevenueCat setup begun in phase 01; configure approved products/offers and RevenueCat’s stable account mapping, restore/transfer policy and hard paywall. Add subscription management and unpaid access to recovery, legal and data controls.
- Implement immediate server verification after purchase/restore with bounded retries and honest pending states. Enforce server premium guards and approved access-expiry behavior; separately evaluate the fresh-verification fallback before enabling it.
- Add billing customer/subscription/entitlement/event records, authenticated durable webhook receipt, QStash publication and signed processing. Use provider event uniqueness, short atomic commits and per-customer refresh claims/fencing across every refresh path.
- Implement five-minute handoff repair/targeted reconciliation plus daily rotating provider checks, checkpoints, claim expiry, flow limits, exhaustion alerts and controlled replay. Verify current provider limits, cron eligibility and production costs before enabling schedules.

#### Keep out of this phase

- No Stripe checkout, Redis, Celery, continuously running worker or generic idempotency/outbox table without a concrete need.
- No waiting for a queue to grant a verified purchase, client premium flags, private-history recovery from a receipt, or holding database transactions during provider calls.

#### Ready to hand off when

- [ ] Sandbox native purchase/restore/cancel/expire/refund works on iOS; successful payment uses immediate verification and never asks for duplicate purchase.
- [ ] Duplicate/out-of-order events, failed/uncertain handoffs, termination, stale claims and overlapping refreshes cannot regress entitlements or lose business state.
- [ ] Missing notifications, exhausted delivery, overlapping/missed cron runs and full database outages recover or report honestly; alerts and plan/cost settings are recorded.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; verify its file path below.

**Carry forward:** Product/entitlement mappings (no secrets), paywall gates, restore policy, event/claim state machines, QStash and cron configuration, failure matrix and replay runbook.

**Handoff file to create:** `handoffs/phase-08-billing.md`

**Working notes / blocker:** None recorded.

<a id="phase-09"></a>

### Phase 09 — Settings, privacy & measurement

**Status:** Not started  
**Depends on:** 08  
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

**Handoff file to create:** `handoffs/phase-09-settings-privacy.md`

**Working notes / blocker:** None recorded.

<a id="phase-10"></a>

### Phase 10 — Release validation & launch

**Status:** Not started  
**Depends on:** 09  
**Acceptance references:** PRD AC-01–06, 08–11, 13–17 · applicable iOS tech acceptance

**Outcome:** The complete paid product is verified, operable and ready for store submission.

#### Implement

- Run the first-release PRD acceptance matrix and applicable iOS tech checks on release-like builds. Recheck identity, in-app countdown recovery, typed reflections, full calendar/day sheet, purchases, accessibility and keyboard/sheet behavior. Deferred Android, lock-screen, dictation and level tests do not block this release.
- Load-test interactive saves/history/purchase checks together with billing bursts and reconciliation using provider test doubles. Measure database connections/CPU/locks, API latency, queue age/drain time and choose configurable capacity limits.
- Verify environment isolation, restore from backup, additive migrations/rollback, older-client compatibility, alert delivery, scheduler heartbeat and incident/replay instructions. Confirm paid-plan allowances and operating budgets.
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

**Handoff file to create:** `handoffs/phase-10-release.md`

**Working notes / blocker:** None recorded.

## Optional work after launch

These stages do not count toward first-release readiness. Lock-screen display is deferred until scheduled; Stripe and coaching need separate feature approval. Levels/filters, custom dictation and Android also remain deferred; write their detailed phases when their product rules and target platforms are settled. None is a prerequisite for launch.

<a id="phase-05"></a>

### Phase 05 — Lock-screen countdowns

**Status:** Not scheduled  
**Depends on:** 10  
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

**Handoff file to create:** `handoffs/phase-05-native-timers.md`

**Working notes / blocker:** None recorded.

<a id="phase-11"></a>

### Phase 11 — Optional US iOS web checkout

**Status:** Not scheduled  
**Depends on:** 10  
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
**Depends on:** 10  
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
