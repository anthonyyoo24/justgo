# JustGO — Implementation Plan

**Version:** 56 · Updated October 6, 2026

**Status:** Phase 01 complete. Phase 02 identity is implemented with passing browser/backend checks; native recovery smoke has passed and physical-device acceptance remains pending. See the [phase 02 handoff](handoffs/phase-02-identity.md).  
Phase 04 implementation now passes local automated/browser checks and native button/relaunch checks; physical-device acceptance and deployment remain open. See the [phase 04 handoff](handoffs/phase-04-challenge-loop.md).
Phase 06 Progress/history passes local automated and simulator checks, including a live day with 21 entries, automatic paging and both retry states. Physical-device acceptance is scheduled for release validation after the app is built; staging deployment is an integration/release task. See the [phase 06 handoff](handoffs/phase-06-progress.md).
[06A — Code quality & test hardening](#phase-06a) is complete. [07 — API & offline saving](#phase-07) remains in progress through [07.1–07.5](#phase-07-subphases). The owner merged 07.1A / PR #13, 07.1B / PR #14 and 07.2 / PR #15 (`8ff5d6c`). [07.3 local challenge/reflection integration](handoffs/phase-07-3-local-flow.md) is implemented and verified locally on `codex/phase-07.3-local-flow`, in [PR #16](https://github.com/anthonyyoo24/justgo/pull/16), with native durability/accessibility acceptance open and review fixes authorized. The planned testing migration 07.3A follows reviewed/finished 07.3, before Progress composition in 07.4 and final cutover in 07.5; native billing remains 07A. The earlier unapproved PR #12 merge was reverted; its history is preserved below. The owner authorized PR #16 and pushing its assessed review fixes; merge remains unapproved.

**Tracker:** This Markdown file is authoritative. The historical HTML companion is not present in this checkout.  
**Sources:** [PRD](product/PRD.md) · [Tech stack](architecture/TECH_STACK.md)\
**Handoffs:** [Index](handoffs/README.md) · [Template](handoffs/TEMPLATE.md) · [Planning baseline](handoffs/00-planning-baseline.md)

This authoritative Markdown plan contains eleven iOS release stages, including the quality phase 06A and separate billing phase 07A, and three deferred stages. Each phase defines what to implement, what to exclude, its completion checks and the context to hand forward. Phase 07 has six sequential subphases, including the testing migration 07.3A between 07.3 and 07.4; 07A and all later phase IDs remain unchanged.

**First release:** iOS, one easy Level 1 challenge collection with manual venue filtering, the in-app timer, Success, typed reflections, the full Progress summary/calendar/day sheet, native subscriptions, and essential Settings/privacy/recovery.

**Deferred:** Welcome screens and questionnaire onboarding (owner decision September 17), Levels and progression rules, additional category filters, custom dictation, lock-screen display, Android release, Stripe and AI coaching. Stable challenge/revision/Level 1 history is kept now; thresholds and how prior completions count are decided later.

**October 6 native testing migration:** Anthony approved adding [07.3A — iOS simulator testing migration](#phase-07-3a) immediately after 07.3 is reviewed and finished, before starting 07.4. Extend the existing Maestro setup to replace browser UI journeys with tests of the actual iOS app. Preserve unit/component/API/database coverage and fixture safeguards; retain the browser gate until replacement native coverage and hosted CI pass. Then remove browser-only testing code and update verification instructions. This edit schedules the work; it does not implement the migration or close existing native/device gates. Existing local changes were checkpointed first at `25e2f8c`, excluding the untracked PNG screenshots.

**September 26 numbering correction:** The launch path now runs in number order, 01–09. Former phases 06–10 are now 05–09; the deferred lock-screen phase moves from 05 to 10. Post-launch phases 10–12 may be scheduled independently. Historical browser tracker exports use the former IDs and must not be imported without an explicit migration. Phase 01 is complete; see the stage table for current implementation status.

**September 30 quality-phase insertion:** Anthony approved planning code-quality and test hardening as the next phase after the local Progress implementation. Use 06A between 06 and 07 to preserve existing phase IDs and handoff references. API route and persistence redesign is being discussed separately; it is outside this phase's scope.

**October 1 API discussion record:** Anthony requested that confirmed API/persistence decisions be retained for Phase 07 while the discussion continues. The Phase 07 decision record below captures those confirmations and leaves unresolved choices explicitly pending. It changes planned future behavior, not the currently implemented Phase 04–06 behavior. Phase 06A still preserves current interfaces. Finalize the remaining choices and Phase 07 tasks in this plan before dependent implementation; do not use older recovery/draft/server-deck requirements to undo the recorded confirmations. The October 2 documentation sequence below replaces the earlier requirement to reconcile the other specifications before implementation.

**October 2 supersession:** Anthony selected immediate device-persisted completion/reflection flows using AsyncStorage, with offline recording from locally available challenges/data and automatic background uploads. This replaces the earlier server-confirmed Success gate, network loading/error states for uploads, manual Retry buttons and pending-upload Home notices. Persist downloaded challenges, progress summaries, loaded months and fetched day details; hydrate available data on launch and refresh/save it in the background when online. No exhaustive day prefetch is requested, pending uploads must never be evicted, and uncached offline months/day details need visible connection-required states. API paths identify resources rather than actions. The latest reflection decision replaces separate reflection resources/table/routes: migrate feeling/text/revision onto attempts and use PATCH /v1/attempts/:id for initial reflection submission and later text edits. Return nested reflection content or null; keep existing feelings unchanged and retain revision protection. Challenge content revision references/table are also scheduled for removal under the live-wording/stable-challenge-ID rule. The current Phase 07 record below is authoritative for this planned behavior. Phase 06A still preserves the implementation it is refactoring.

**October 2 planning/documentation sequence:** Anthony selected separate Progress summary and month-calendar endpoints. Finalize the decisions and ordered Phase 07 implementation plan first, implement and verify that settled plan next, then align the PRD, tech stack, decision register, design/app-shell/scope/identity guidance, learning map and relevant handoffs with the actual result. Only this plan is being updated during the current discussion; the other documents remain descriptions of the existing implementation until the end-of-phase reconciliation. Shared runtime contracts/OpenAPI and their callers must still change together with the API implementation. Recommendations below remain proposals until accepted; this sequencing does not authorize beginning application/schema implementation during the discussion.

**October 3 confirmations:** Anthony accepted the summary/calendar/day endpoint paths below; reflection patches that preserve feelings, check the expected revision and recognize repeated submissions; retaining the complete downloaded challenge catalog/latest summary with measured limits for older history caches; coordination of local/backend progress without duplicate counts or regression; validation before submission with rejected content retained for correction; and preserving existing historical activity dates while applying the start-date rule to new reps. Later October 3 decisions below settle subscription behavior and exclude a multi-phone reflection conflict workflow. Actual local-storage failure handling remains under discussion. These confirmations update the Phase 07 plan only.

**October 3 subscription and scope update:** Anthony approved all nine subscription rules recorded below: first API verification; account-scoped saved status/expiry/last-check time; immediate access from still-valid saved verification; event-driven checks when missing or more than five minutes old; immediate purchase/restore verification; no 30-second polling or one-minute cutoff; retained valid access through network failures; online renewal verification at expiry; and authenticated, owner-checked uploads of earlier valid-access reps after expiry. Do not build a two-phone conflict chooser/merge workflow. Preserve the already-approved revision/replay protection and ordered uploads within one device. Anthony is considering narrower offline history support. His latest proposal adds the saved Progress summary, current month's calendar counts and today's day-sheet activity to offline challenge/completion/reflection recording; other months/day details require a connection. This limited current-period cache is a proposal, not yet a replacement for the previously confirmed broader downloaded-history persistence. The earlier alternative making all Progress online-only was not selected.

**October 3 implementation-plan draft (before the billing split below):** Anthony requested recommended solutions and concrete implementation tasks. The combined Phase 07 draft included a proposed technical design and twelve ordered steps with verification. The draft uses limited current-period offline Progress and an inline local-storage failure fallback as recommendations awaiting review. Routine contract/storage/migration choices are specified as an engineering baseline; they do not require the owner to choose arbitrary field names. No application, dependency or database changes have begun, and the approved plan-first/implementation/documentation sequence remains in force.

**October 3 billing-phase separation:** Anthony requested a separate phase for native billing. Phase 07 now contains the API, data-model, client-state and offline-saving redesign only. Phase 07A — Native subscriptions & reliable billing follows 07 and precedes 08; it owns purchases/restore, all nine confirmed subscription rules, subscription notifications, QStash delivery and scheduled billing recovery. Existing later phase IDs remain unchanged. The combined twelve-step draft is split into ten Phase 07 steps and five Phase 07A steps below. Phase 07 uses isolated access/provider test seams; production paid access and verified earlier-upload eligibility are connected and accepted in 07A, with no production bypass. Earlier references to billing in Phase 07 are superseded by this split. Only this plan changes now; reconcile the handoff index and other documents with each implemented phase under the approved documentation sequence. The new handoff placeholders replace the uncreated `phase-07-billing.md` placeholder; no saved handoff is renamed. This planning edit does not authorize application/schema implementation.

**October 3 review clarifications:** Anthony confirmed that durable downloaded history contains only the current month's calendar counts and today's available attempt/reflection details. Another day, including a different day in the current month, requires an online detail lookup; previously viewing it does not make it available offline. This supersedes broader downloaded month/day persistence and settles the limited-history recommendation below. Existing challenge-catalog/latest-summary/access persistence and protection of pending uploads remain in force. Anthony also accepted updating both billing accounts after a purchase transfer while keeping private history and eligible pending activity with their original app account. He requested recommendations about trust in offline timestamps and actual local-storage failures; those recommendations remain under review rather than newly approved behavior.

**October 3 follow-up confirmations:** Anthony reaffirmed the already-approved normal save flow: explicitly save the completion/reflection on the phone, continue immediately after that local write, and upload in the background. A temporary upload failure keeps the saved copy and resumes the confirmed bounded automatic retry process; fetching backend data alone cannot upload unsent writing. Reconcile/refetch relevant backend data after acknowledgement without deleting pending records or replacing newer local writing. Anthony accepted the offline timestamp trust policy: validate the reported start against account-owned, server-verified subscription coverage and reject implausible future starts while accepting that deliberately backdated offline activity cannot be fully disproved. He also approved the exceptional device-storage failure path: clear only disposable confirmed history caches and retry the local write once; if it still fails and the app is online, save directly to the backend with the same identity and wait for confirmed server saving before continuing. Offline or failed cloud saving retains the input on screen with "Couldn't save. Free up space or connect to the internet, then try again." Until a successful phone write or confirmed backend save, terminating the app may lose memory-only input. These confirmations supersede the pending recommendation wording in the earlier review record and authorize this plan update, not application/schema implementation.

**October 4 save-feedback review:** Anthony approved preventing repeated completion/reflection submissions while the phone write is in flight and showing subtle saving feedback only when that write takes noticeably long. Normal navigation still follows durable local saving, without waiting for uploads. He agreed that failures requiring intervention must be discoverable outside the affected editor, and acknowledged the recovery-test gap when an outage ends while the app remains open after exhausting its short retry cycle. The Phase 07 review below records these requirements and separates proposed backup visibility, recovery presentations and an additional foreground retry opportunity from approved behavior. This remains a plan-only update; application implementation has not started.

**October 4 memory-only continuation and banner follow-up:** Anthony selected a top banner that remains until manually closed while discussing continued activity when phone storage and backend saving both fail. His recovery follow-up specifies automatically closing any visible banner and showing one recovery toast once all endangered submitted content is saved, whether or not the banner was manually dismissed. Retain that activity and its pending operations in account-scoped Zustand memory, allow the flow to continue and include eligible entries in Progress. This supersedes the October 3 requirement to stay on the save screen when neither save path succeeds; ordinary phone-first saving and the exceptional online backend-save attempt remain. The warning describes the actual cause and the risk to unsaved activity only. Dismissing it does not discard records or stop recovery. The review below specifies banner recovery/dismissal behavior and safe operation/record cleanup; these are planning changes only.

**October 4 follow-up decisions:** Anthony accepted the remaining risk of losing the only device copy before upload and chose to leave backup behavior as it is; no additional backup system or backup-status UI is added to this scope. He approved sparse automatic retries with increasing cooldowns while the app stays active and online with transiently failed pending work, supplementing reconnect/restart/foreground triggers. The review record, sender design and verification below now treat that retry opportunity as confirmed. He requested explanations of validation and exceptional failures; their specific recovery presentation remains under discussion. These decisions update the plan, not application code.

**October 4 implementation start:** Anthony authorized starting Phase 07 after reading the 06A handoff, with additional agents at implementation discretion and interactive testing restricted to Codex side panels. This supersedes earlier plan-only authorization notes for Phase 07. Existing uncommitted planning edits are retained. He also selected automatic adoption of the newest backend reflection for genuine version conflicts, with no “Entry needs attention” link or manual conflict review; the detailed Phase 07 clarification below governs that case. Ordinary pending writes and older-acknowledgement protections remain in force.

**October 6 native flicker investigation:** The owner reported a possible first-run flash around Completed/Success/reflection. Recorded simulator frames reproduce Home before Success on both cold and repeated runs. An opaque `overFullScreen` active modal retains the native navigation hierarchy; three post-change runs show no separate Home frame. Brief mixed transition samples and initial modal inset settling remain open observations. The [07.3 investigation](handoffs/phase-07-3-local-flow.md#october-6-native-completion-flicker-investigation) records regression checks, frame evidence and remaining native work; full acceptance/publication remain open.

**October 6 simulator owner session:** Anthony requested launching the current app, reusing `JustGO Phase 7.2 QA` and removing other virtual devices. The other 19 devices were removed, preserving the retained device's data. Updated EAS simulator build `3d3b559b-3dd7-4319-9212-75a2d26e95c8` succeeded and was installed over the existing app. Native launch/Accept/countdown/Give up passed; Home and local API/Metro are left running for owner testing. The [07.3 handoff](handoffs/phase-07-3-local-flow.md#october-6-simulator-reuse-and-owner-test-setup) records build details and screenshots. Full native durability/lifecycle/accessibility acceptance remains open; Git publication is not authorized.

**October 6 active-flow refinement:** Anthony approved screen-owned React state for the unfinished challenge, deriving the countdown deadline from the captured start and original duration, and refreshing the clock once per second. An active challenge exits only through Completed or Give up; remove Settings and the bottom tab bar from that view and defer saving-recovery page links until it ends. Keep Zustand for venue/deck continuity, completion context and shared activity/synchronization. Commit the existing 07.3 checkpoint first (`7a74a90`), then implement these changes locally. The [07.3 handoff](handoffs/phase-07-3-local-flow.md) records fresh evidence. Git publication restrictions remain unchanged; the later simulator request above authorizes its test build/launch.

**October 5 local-flow checkpoint:** The owner requested a new branch from `main`, reading the previous handoff, and implementing 07.3. `codex/phase-07.3-local-flow` starts at local `main` `3e41330`, after the owner’s PR #15 merge at `8ff5d6c`. Provider/account/lifecycle wiring, local challenge/completion/reflection screens, loss-risk notices, Sonner Native/web adapters and saved app/API/database journeys are implemented locally. The [07.3 handoff](handoffs/phase-07-3-local-flow.md) records verification and remaining native checks. This request authorizes local implementation; Git publication and merge still require separate permission.

**October 5 local-saving checkpoint:** The owner merged 07.1B / PR #14 at `1df6406` after 07.1A / PR #13 and explicitly requested implementing 07.2 from updated `main`. `codex/phase-07.2-local-sync` now contains the locally verified repository/sender/transport boundary; the [07.2 handoff](handoffs/phase-07-2-local-sync.md) records its tests, real-transport journeys and remaining native durability evidence. Screen/lifecycle presentation remains 07.3 and Progress composition remains 07.4. Earlier B review restrictions below are historical. This request authorizes local implementation only; push, PR and merge still need separate permission.

**October 5 screen cleanup:** The owner requested removing the unused Phase 01
Foundation connection screen and its dedicated tests. The current app has no route
or consumer for it. Keep the existing developer screen previews and API health/readiness
endpoints. Access and foreground behavior remain unchanged; the [07.2 handoff](handoffs/phase-07-2-local-sync.md)
records this follow-up and its verification. Historical Phase 01 evidence remains valid.

**October 5 app structure follow-up:** The owner approved moving the startup gate
to `runtime/access/`, the app provider/foreground coordination to `runtime/providers/`,
and developer screen previews to `dev/previews/`. Shared navigation links live in
`components/`; unused Shell placeholder screens are removed. The former Access
and Shell feature folders are retired. Keep route/access/foreground/preview behavior,
all retained tests and the provider coverage floor unchanged. The [07.2 handoff](handoffs/phase-07-2-local-sync.md)
records this local refactor and its verification; 07.3 wiring and 07A billing remain
separate unfinished work.

**October 5 app-support naming follow-up:** The owner chose `app-support` for app-wide setup and coordination, replacing the `runtime` folder name, and approved moving account/recovery/session/Keychain support from `features/identity` into `app-support/identity`. Current imports, architecture rules, coverage selectors and folder guidance follow the new locations; behavior and coverage floors are preserved. This separate commit, `748a2ee`, is now published in [PR #15](https://github.com/anthonyyoo24/justgo/pull/15) following the owner's request to create the PR.

**October 5 PR #15 review fix:** Ordinary changed reflection submissions now recover a chain blocked by an invalid-request rejection through the existing correction rule. Rebase from the confirmed server revision, retain earlier writing and initial feeling, refuse unchanged rejected input and preserve stale-correction protection. Other permanent causes remain blocked with diagnostics. Corrected the two stale handoff publication lines. The [07.2 handoff](handoffs/phase-07-2-local-sync.md#october-5-pr-15-review-follow-up) records the assessment, regressions and fresh checks. This is data-layer recovery; 07.3 presentation and native durability acceptance remain open.

**October 4 implementation checkpoint split:** Anthony accepted splitting Phase 07 into 07.1 API/data foundation, 07.2 durable local saving/synchronization, 07.3 challenge/reflection experience, 07.4 Progress/history integration and 07.5 final cutover/acceptance. Update this plan before resuming application work. Preserve the verified identity/HTTP slice and all existing drafts; the split does not restart implementation or reduce agreed scope. Each subphase has a dependency, checklist and evidence handoff. The former ten task numbers remain below for traceability, with backend Progress work assigned to 07.1 and client Progress work to 07.4. These are implementation checkpoints, not five independently deployable releases or new permission gates. Build journey tests incrementally, keep destructive cleanup in 07.5, and keep native billing in 07A. This edit changes the plan only.

## How to use this plan

- Build each slice through the database, API and UI it needs; introduce tables and indexes with their consuming feature.
- Run relevant tests and UI verification during every phase. Phase 09 integrates and releases work already verified in its own stage.
- **September 29 validation timing:** Anthony will do physical-iPhone acceptance after the full app is built, during release validation. Earlier feature phases use local automated checks and the iOS simulator; carry device-specific VoiceOver, large-text, gesture and recovery checks to Phase 09. Stage the integrated API/mobile build before release, without treating staging as a Phase 06 feature gate.
- **September 30 quality-phase sequencing:** Phase 06A may start and complete against verified local implementations from phases 02–06 while their previously deferred physical-device and staging gates remain open. Preserve those gates in their original handoffs and Phase 09; they do not block 06A. Phase 07 implementation follows the 06A handoff.
- Mark a phase complete only after its checks and dependency phases pass, and its handoff is saved with evidence. For Phase 07, apply this rule separately to 07.1–07.5, including 07.3A; existing drafts in a later subphase do not satisfy an earlier checkpoint. Follow the side-panel-only verification constraint recorded below.
- **September 17 sequencing exception:** Anthony approved implementing phase 02 while Apple enrollment/signing and physical-iPhone recovery acceptance remain pending. Phase 03 and later feature implementation may proceed after the backend/client identity checks pass. Keep phase 02 open and retain those device gates before valuable-data external testing and release.
- **September 17 scope revision:** Anthony deferred welcome/questionnaire onboarding and authorized phase 02 follow-up plus phase 03 app-shell work. Build the existing screens first; onboarding is not a prerequisite for this phase. Paid access is now Phase 07A under the October 3 phase split.
- **September 21 scope revision:** Venue selection/filtering is included in phase 04: Street & Park, Gym, Café & Bookshop, Bar & Party, and Errands & Transit. The level-progress indicator is omitted until levels ship. See [current phase 04 decisions](product/PHASE_04_SCOPE.md), which supersede the earlier general-only scope. Anthony reports Apple Developer enrollment complete; signing/device verification remains open.
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
| [06A — Code quality & test hardening](#phase-06a)           | Existing code is easier to understand and change, with meaningful regression tests and durable coding guidance. | 06 (local) | Complete      |
| [07 — API & offline saving](#phase-07)                      | Completions/reflections display after local saving and synchronize reliably through resource APIs.              | 06A        | In progress   |
| [07A — Native subscriptions & reliable billing](#phase-07a) | Verified purchases unlock promptly, and later subscription changes recover reliably.                            | 07         | Not started   |
| [08 — Settings, privacy & measurement](#phase-08)           | Users control recovery, private data and preferences; useful measurement respects their choices.                | 07A        | Not started   |
| [09 — Release validation & launch](#phase-09)               | The complete paid product is verified, operable and ready for store submission.                                 | 08         | Not started   |
| [10 — Lock-screen countdowns](#phase-10)                    | The same accepted challenge is visible on supported lock screens without a JavaScript background timer.         | 09         | Not scheduled |
| [11 — Optional US iOS web checkout](#phase-11)              | Eligible users can purchase on the web using the same authenticated app identity.                               | 09         | Not scheduled |
| [12 — Future AI text coach](#phase-12)                      | A separately approved text coach uses bounded, permitted context in the existing backend.                       | 09         | Not scheduled |

Release order: 01 → 02 → 03 → 04 → 05 → 06 → 06A → 07 (07.1 → 07.2 → 07.3 → 07.3A → 07.4 → 07.5) → 07A → 08 → 09. Apple account and purchase-product preparation starts during 01 alongside development. Lock-screen timers (10), Stripe (11) and coaching (12) follow release when scheduled; none blocks the first submission or depends on another later phase.

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
- Create `docs/design/DESIGN.md`: a concise design guide identifying the authoritative Paper screens, typography, colors, spacing and shared component styles. Document design decisions and unresolved details.
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

- Create one stable Level 1 record, the six approved venues, and the reviewed challenge content from [CHALLENGES.md](product/CHALLENGES.md) in the database. This document is a human-readable reference; no separate JSON catalog/import workflow or content-management dashboard is required. Preserve immutable revisions with challenge text, optional nullable subtext and duration, initially 300 seconds. Do not display subtext in this version. No per-challenge illustration, separate hint or safety-guideline field is required. Add attempts preserving challenge/revision/level and venue-card context. Do not create unrelated categories, level progress, credit events or a completion threshold.
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

**Status:** Complete

**Depends on:** 06 (verified local implementation under the September 30 sequencing decision)

**Acceptance references:** Existing implemented behavior from phases 02–06; repository coding, test and UI-verification instructions. This phase adds no product features or physical-device acceptance gates.

**Outcome:** Existing code is easier to understand, test and maintain. Important behavior has meaningful regression coverage, large components have clear responsibilities, and future agents can find the agreed coding standards in repository instructions.

#### Implement

1. **Refresh the baseline and choose bounded work.** Read applicable `AGENTS.md` files, project setup/architecture guidance and the relevant phase handoffs before editing. Record the checkout, existing changes, current test results, coverage gaps and concrete refactor candidates. Run `npm run check` and `npm run test:db` against the dedicated local test database. Collect mobile, API and contract coverage across production source, including files not imported by tests. Distinguish unit, component, integration and UI evidence; identify gaps by behavior and risk, not just by filenames or line counts.
2. **Protect important behavior before refactoring.** Add tests for the real app runtime/provider wiring: initialization, account changes, cache clearing, session coordination, access freshness and foreground/background handling. Test the existing JavaScript secure-storage adapter's payload validation, native-module calls and failure handling with controlled test doubles. Preserve existing identity, ownership-isolation, retry, completion and history tests. Recheck the previously reported Progress `act(...)` warning; it did not reproduce in the Phase 06 closeout. If it recurs, resolve it with correct asynchronous assertions and cleanup rather than suppressing console output. Review the documented browser `pointerEvents` deprecation warning. Fix confirmed regressions in the affected existing behavior and rerun its checks.
3. **Refactor Progress first, in small steps.** Separate the calendar/summary, day sheet and entry rows where they have independent responsibilities. Keep related styles and helpers close to their components; extract reusable icons or motion helpers only when doing so improves understanding. Preserve existing rendering, loading/error/empty states, month changes, paging, sheet behavior, reflection expansion, accessibility labels and reduced motion. Add or update relevant tests, then verify each affected UI flow before proceeding.
4. **Review the other maintenance hotspots.** Assess the identity controller/screen, challenge deck/screen and reflection view based on their responsibilities and change risk. Split presentation from orchestration and extract cohesive pieces when justified; keep storage, networking, time and randomness easy to control in tests. Reuse repeated rules when they represent the same behavior. Preserve enforced feature/shared-code boundaries, strict TypeScript and shared runtime validation. Do not split files merely to hit a line limit or add abstraction layers without a concrete benefit. If a candidate depends on an unresolved API decision, leave that candidate open and continue independent quality work.
5. **Improve automated safeguards.** Add reproducible coverage commands/reporting and CI collection for mobile, API and contracts, including database-backed service coverage where applicable. Choose and document meaningful branch thresholds and exclusions after reviewing the fresh baseline, with stronger protection for critical behavior and an explicit approach to preventing coverage regressions. Avoid a blanket 100% target or tests that only mirror implementation. Extend the existing import-boundary checks to dynamic `import()` and `require()` calls; preserve permitted asset, test and app-preview requires. Add forbidden and permitted cases to `scripts/quality/import-boundaries.test.mjs`, and update its assertions to cover the added rules. Introduce targeted type-aware lint rules for unsafe promise/async handling where they add value; document intentional fire-and-forget behavior instead of broad lint disables.
6. **Verify existing user journeys and maintain guidance.** Exercise the implemented challenge → completion → reflection → Progress flow and relevant recovery/failure paths with disposable local data and the existing isolated test-access setup. For every code change, write or update relevant tests and run them, then use Browser Use in the in-app browser to test affected UI behavior; use Computer Use in Google Chrome only if the in-app browser is unavailable or has issues and that fallback honors the owner's browser preference. For side-panel-only requests, record unavailable capabilities instead of switching browsers. Fix failures and repeat until tests and affected UI pass. Reuse an existing simulator development build only when an affected native behavior needs verification that a browser cannot provide; physical iPhones and new signing/build work are outside this phase.
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

- [x] A fresh baseline and final evidence are recorded; meaningful runtime/provider and storage-adapter tests cover the selected critical gaps, existing implemented behavior remains protected, and `npm run check` plus `npm run test:db` pass with no unexplained asynchronous test warnings.
- [x] Progress responsibilities are separated and the agreed maintenance worklist is completed or explicitly deferred with reasons. Import boundaries, strict typing, current contracts and product behavior remain intact; affected browser UI checks pass, including applicable loading/error/retry and reduced-motion cases. Chrome fallback or any limited simulator verification is recorded accurately.
- [x] Coverage reports include all relevant production source, and CI enforces the documented thresholds/exclusions and selected type-aware lint rules. Existing user-journey checks pass using isolated fixtures; the evidence distinguishes automated, browser and simulator checks and makes no physical-device claims.
- [x] Repository agent/coding guidance is updated and discoverable, this plan and the handoff index agree, and the phase handoff records changed paths, tests, UI evidence, coverage changes, preserved decisions and remaining work before billing. Earlier physical-device/staging gates and API decisions retain their separate owners and phases.

**Carry forward:** Refactored component/controller responsibilities, dependency interfaces, critical behavior tests, coverage commands/baselines/thresholds, lint decisions, agent instruction locations, browser verification evidence and deferred API-dependent work.

**Saved handoff:** [handoffs/phase-06a-code-quality.md](handoffs/phase-06a-code-quality.md)

**Working notes (October 3 closeout):** Fresh baseline and final evidence are saved in the handoff. Actual provider/vault tests, separated Progress/calendar/sheet/row and challenge presentations, shared feeling choices, dynamic-loader import boundaries and selected type-aware promise rules are implemented. The Progress asynchronous test issue, decorative pointer-events warning, missing reduced-motion sheet behavior and preview paging-retry regression are fixed. Final workspace checks pass 292 tests; PostgreSQL checks pass 36. Mobile all-source coverage is 86.06% lines / 79.69% branches, with independent global/critical-path floors and CI reports for all workspaces. Web/iOS bundle exports and affected side-panel browser journeys pass. Reduced motion is covered by component tests; browser media emulation was unavailable and no Chrome, simulator or physical-device UI pass is claimed. Root/mobile agent guidance and testing documentation are updated, and the Phase 06 local handoff is checked off while earlier device/staging gates stay open. Phase 07 API/offline and Phase 07A billing decisions are preserved; neither implementation was started.

**October 3 PR #10 review follow-up:** The coverage checker now rejects reports with no source entries, including contracts reports without critical-file selectors, while preserving valid zero-branch files. A regression reproduced the original failure and now passes. Current local checks pass 293 workspace tests, 36 database tests and all coverage floors; the [handoff](handoffs/phase-06a-code-quality.md#october-3-pr-10-empty-coverage-review-fix) records the evidence and hosted checks.

<a id="phase-07"></a>

### Phase 07 — API & offline saving

**Status:** In progress; 07.1A, 07.1B and 07.2 are merged by the owner. 07.3 is open in PR #16 for owner review, with native evidence open. The owner authorized pushing the assessed review fixes; merge remains unapproved. Progress composition/cutover remain 07.4/07.5.

**Depends on:** 06A; complete 07.1–07.5 in order before 07A.

**Acceptance references:** The confirmed API/persistence requirements below govern this redesign. Billing acceptance is owned by Phase 07A. Align older product/technical acceptance lists after each implementation under the approved documentation sequence.

**Outcome:** Challenge completions and submitted reflections save locally and display immediately, pending uploads synchronize reliably, and Progress reads avoid unnecessary summary work.

#### API and persistence discussion record — October 1–3

**Status:** Confirmed product changes, a proposed technical design and ordered implementation tasks are recorded for Phase 07. The October 3 follow-up settles limited offline history and timestamp trust; the October 4 follow-up adds memory-only continuation with a dismissible warning when both saving paths fail. Engineering details below are the proposed baseline rather than additional product approval questions. Implement/verify the settled plan next and reconcile the other documents afterward. Anthony explicitly authorized starting Phase 07 on October 4; the earlier plan-only restriction is superseded for this implementation task. Native billing is owned by the separate Phase 07A below. General PostHog activation remains scheduled in Phase 08 unless explicitly rescheduled.

**Confirmed changes to include in Phase 07**

- [ ] Use resource-only API paths: HTTP methods express operations; do not put action names such as addReflection, draft, final, skip or revoke into the redesigned paths. Use PATCH /v1/attempts/:id for initial reflection submission and later edits to its text; leave any existing feeling unchanged and retain the reflection revision check. Initial submission may include optional feeling/text; later text edits must not alter a recorded feeling. Remove all separate reflection API routes and update mobile clients, contracts/OpenAPI, services, CORS method configuration and tests together, including the wider resource-only route audit for identity endpoints. The attempt-patch route replaces the earlier /v1/reflections and nested reflection write proposals. Nested paths may describe actual resource relationships; nesting itself does not violate this rule.
- [ ] Migrate the separate reflections table's appropriate saved data onto owner-matched attempts as reflection_feeling, reflection_text and reflection_revision, verifying content, ownership and revision preservation before dropping the old table. Return each attempt's reflection as a nested object containing its submitted feeling/text and revision, or null when content is absent. Retrieve reflection content through attempt/history responses, with no independent reflection ID, table, GET route or creation endpoint. Update history queries to project these attempt columns instead of joining reflections; remove obsolete reflection-table/state logic throughout API/mobile/contracts/OpenAPI/seeds/tests and future documentation. Preserve feeling-only, text-only and both. Settle legacy draft/skipped and retry-receipt migration below rather than silently treating drafts as submitted content or dropping relevant saved data.
- [ ] Send a nested reflection patch with the expected reflection revision. An attempt without a submitted reflection starts at revision 0; the first accepted submission becomes revision 1 and later accepted text edits increment it. Omitted feeling preserves the existing feeling, and later edits cannot change it. Reject a genuinely stale edit rather than silently overwriting newer backend writing. Assign each explicit submission a stable retry identity, separate from the attempt UUID, and recognize repeated delivery/lost acknowledgements without applying that submission or incrementing its revision twice. Preserve a newer local edit when an older submission is acknowledged. Finalize field names and retry-identity placement during implementation; these are not additional reflection resources.
- [ ] Keep multi-phone editing conflict resolution out of scope. Do not build a two-phone version chooser, merge screen or parallel-reflection history. Retain revision/replay checks, ordered per-attempt uploads and protection against older acknowledgements replacing newer writing on the same device; excluding multi-phone coordination does not remove these already-approved retry safeguards. For a genuine revision conflict, automatically adopt the latest owner-scoped backend reflection under the October 4 implementation clarification below; no conflict review/attention UI.
- [ ] Move selected venue and each venue's cycling card order to in-memory frontend state. Reset them on a fresh launch; do not persist or synchronize them between devices. Keep challenge content/stable IDs in the backend, with locally available content persisted for offline recording. Remove per-skip API writes, the post-skip canonical-state lookup, deck skip receipts and queue-version checks used to coordinate server-owned browsing. Remove backend-owned selected-venue/preferences and personal queue behavior, with an explicit migration and API/mobile rollout plan.
- [ ] Keep app navigation and temporary flow context in the client, across all requests rather than only pagination. Each request identifies the target resource and supplies its relevant filters, submitted values and any cursor/expected revision explicitly; do not have the backend infer the selected venue/current card/active challenge/current page from remembered UI context. Anthony's use of stateless here concerns this general request behavior, not removal of authentication, saved product records, ownership checks or revision/replay protection. Current Progress day reads already carry a self-contained date/position cursor; retain that property while removing the already-superseded server-owned venue/deck and active-challenge/reflection-draft workflows.
- [ ] Remove `challenge_revisions`, attempt/card `revision_id` references and challenge-content revision logic throughout the API, mobile app, contracts/OpenAPI, seeds, migrations, tests and future-facing documentation. Move the required instruction/configuration/level metadata onto stable challenge records and link attempts/venue placements to `challenge_id`. Do not copy original instruction text onto attempts. Minor wording edits update the challenge and appear in old history when content refreshes; a substantially different activity receives a new challenge ID. Stop offering removed challenges by marking them inactive while retaining their rows for historical references. This replaces exact original-wording preservation; preserve saved attempts, account ownership and the still-approved level context during migration.
- [ ] Start challenges immediately in memory, without a required start API save. Give up creates no backend attempt. Store only completed challenges in attempts; remove active/given-up statuses, server active-attempt recovery, the one-active-attempt-per-account rule and the backend start/deadline lifecycle. Keep consent-aware start/give-up analytics independent of product saving.
- [ ] On a fresh launch, discard an unfinished challenge and show the Home deck; starting again is explicit. Locking/backgrounding while the process remains alive retains the React-owned start values and recomputes remaining time from start plus original duration on return. Do not require a running JavaScript background interval. Zero still awaits a deliberate outcome.
- [ ] Capture the exact start timestamp and phone's time zone on Start in memory. On saving a new completed rep, send those original values and have the backend derive/freeze `activity_date` from `started_at` in `start_time_zone`. Use those same original values for the day-sheet time. Do not attribute new activity to completion/reflection-save/upload time, measure elapsed duration, or require a separate product completion timestamp. Preserve existing historical activity dates as recorded; do not recalculate old reps onto different calendar days. Apply the new start-date rule to new reps only. Update day/streak/month queries, chronological history/display wording, contracts and tests accordingly. The existing server start/deadline and completion-time requirements are scheduled for removal; client-captured start metadata is attached to a completed record only when it is saved. Finalize legacy timestamp/time-zone mapping and operational timestamp naming without changing historical dates.
- [ ] Generate the client attempt UUID once when Completed is tapped, before persisting or sending the completion. Preserve that same UUID through retries and relaunch recovery. Existing starts already use UUIDs with matching-retry protection; move ID generation/protection to the completion-only create flow rather than creating an ID on Start or every request. Enforce ownership, database uniqueness and rejection of conflicting ID reuse.
- [ ] Use Zustand for shared in-memory venue/deck and completion-flow state. The October 6 refinement supersedes its ownership of the unfinished challenge: keep captured challenge/start/time-zone values in screen-owned React state and derive the countdown deadline from the original duration, refreshing once per second. Keep component inputs/dialogs in React and motion in Reanimated; TanStack Query fetches/caches backend data. AsyncStorage owns device-persisted completed records, explicitly submitted reflections and locally available challenge/history data; compose those with backend data for the displayed view. A fresh launch still resets browsing/unfinished activity. Document the local/remote reconciliation boundary and avoid blindly copying the entire server query cache into Zustand or letting a refetch hide pending local records.
- [ ] Persist the downloaded challenge catalog, latest Progress summary, current month's calendar counts and today's available attempt/reflection details using AsyncStorage. Durable downloaded history is limited to the current month and current day. Other months and other day details, including another day within the current month, require an online lookup even if previously viewed; do not persist those detail payloads or offer them offline from in-memory query caches. On launch, display the same account's saved data as soon as local hydration makes it available; when online, refresh from the backend and update the saved copy. Do not prefetch every calendar day. Display available current-period entries and local completed records normally, without an incomplete-history notice. An unavailable lookup is not a successfully loaded empty history result. Keep completeness/pagination bookkeeping internal and venue selection, cycling order and unfinished challenges memory-only. Earlier pending uploads and content needed by dependent operations remain protected across day/month rollover.
- [ ] Show a visible connection-required state in the Progress calendar or day sheet only when the requested month/day/detail/page is unavailable locally and the device is offline. If available entries can be displayed, show them without an incomplete-history or "connect to load the remaining entries" notice. A later request for unavailable information can show the offline message then. Do not present an unavailable lookup as zero progress or leave it loading indefinitely. Retry missing reads when connectivity returns. Choose final copy/layout during UI implementation, using wording such as "You're offline. Connect to load this day/month." Only use offline wording when the cause is known; completion/reflection upload failures still remain background work without save-error UI.
- [ ] Treat each supported venue as having its defined, fixed nonempty set of challenges. Validate that catalog/seed configuration supplies the expected challenges for every venue; do not add a normal "No challenges available for this venue" product state. Remove the current empty-venue presentation when implementing the new deck loading flow. This clarification does not change the genuine zero-completion state in history.
- [ ] Adjust challenge-fetch loading behavior separately from background completion/reflection uploads. Keep cached cards visible and usable while refreshing; do not disable the deck or replace it with a full-screen loader merely because a refresh is running. With no local challenges, show initial fetching and a load-failure/offline state if that first download fails; a fresh install or cleared local data is the ordinary scenario. After challenges have been downloaded and persisted, an unsuccessful background refresh keeps those cards available without a blocking load-failure screen. Do not design around normally empty venues, and do not leave an offline cache miss loading indefinitely. Finalize cold-start loading/error presentation below.
- [ ] Use AsyncStorage for this approved scope. Retain the complete downloaded challenge catalog and latest account summary, plus only the current month's calendar counts and today's available details as downloaded history. Remove obsolete confirmed period caches on rollover; older online history uses in-memory query caches only and still requires connectivity when requested. Never evict pending uploads or their required local attempt/reflection data as ordinary cache cleanup. After acknowledgement, clear only the acknowledged upload marker and retain confirmed local entries while needed by the current flow, today's view, dependent operations or aggregate reconciliation. Verify storage size, serialization and responsiveness; today's details and pending uploads can still grow, and limited history retention cannot guarantee that the device will always have writable space.
- [ ] On Completed, generate the UUID, persist the completed rep using AsyncStorage and immediately show Success based on that local save. Send its API create request in the background; do not wait for backend confirmation. Success Continue only navigates. On Save Reflection, persist the explicitly submitted feeling/text on the local attempt, update the displayed entry/continue the flow immediately and send PATCH /v1/attempts/:id in the background. Later text edits follow the same local-first patch flow. Skip reflection returns Home without a request and leaves reflection null; any independent completion upload may still be pending. Starting/giving up still creates no backend attempt. These behaviors supersede server-confirmed navigation and network loading/error/manual-retry UI.
- [ ] Prevent duplicate taps/submissions synchronously while the same local completion or explicit reflection save is in flight, including Save from the dirty-close dialog. Repeated activation must reuse the existing operation rather than generate another ID, rep, submission or navigation. Keep the current screen stable; show subtle inline/button saving feedback only if the device write takes noticeably long, with an accessible busy state. Fast writes should not flash a spinner or incur a minimum display delay. Stop this feedback when local saving succeeds; background HTTP latency must not keep it visible or delay navigation. The exceptional backend-save attempt may remain visibly busy until its bounded outcome; stop that feedback when continuing with the memory-only warning after failure. Verify the display threshold during implementation, cancel feedback timers on completion/unmount/account changes, and preserve any newer editor input.
- [ ] In the normal save flow, retain completed attempts and submitted reflections persistently on the device, including after failed uploads or termination, and restore them for the same account. AsyncStorage persistence must succeed before normal local-save navigation; a Zustand memory update alone is not a durable save. Persist the displayed record and recoverable upload intent consistently, with restart recovery for interrupted updates. On backend success, replace/reconcile the pending local version with confirmed backend data and clear only that acknowledged upload operation. Never clear a newer local edit because an older response arrived. Preserve the confirmed local record for offline display rather than deleting the only device copy. The exceptional path below attempts backend saving when cleanup and one local-write retry have both failed; confirmed server data is recovered through online reads and does not establish a successful device cache write or guaranteed offline availability. If neither save succeeds, the October 4 exception permits continuation with shared memory and the dismissible loss-risk banner.
- [ ] Support offline completion/reflection recording and display using locally available challenges and history. Persist downloaded content/data needed for that availability; never fabricate uncached challenges/history. Send pending completion creates before dependent reflection PATCH operations for those attempts, and preserve the ordering/revision dependencies of later text edits. Merge/deduplicate records by the same stable attempt ID locally and remotely across storage, API responses, day history and progress. Coordinate upload acknowledgements, aggregate refreshes and local overlays so confirmation/refetch cannot duplicate reps or erase locally recorded activity: a backend total of 10 plus one new local completion displays 11, and remains 11 after upload rather than displaying 12 or regressing to 10 when an older response arrives. Finalize the reconciliation mechanism in the implementation breakdown.
- [ ] Retain unsuccessful uploads and retry automatically in the background. Anthony accepted one immediate attempt plus two transient-failure retries after approximately 2 and 5 seconds, then pausing that cycle without deleting its record. Restart bounded attempts on real connectivity restoration, app restart or foreground return; coalesce triggers, respect cooldown/server Retry-After and allow one sender per pending operation. The October 4 follow-up additionally approves sparse retry opportunities with increasing cooldowns while the app remains active and online with transiently failed pending work; follow the confirmed foreground-retry details below. Known offline state waits for reconnect. Keep transport/TanStack retry layers from multiplying this policy. Do not assume the app can execute uploads while its process is terminated; persisted records resume on a later launch. Permanent rejection needs cause-specific recovery; genuine reflection revision conflicts use automatic backend-wins reconciliation below, never an endless retry.
- [ ] Apply the confirmed actual device-storage failure fallback: clear only disposable backend-confirmed history caches, retry the same local write once, then attempt direct backend saving when online if the retry fails. Server confirmation establishes durable saving even if phone caching still fails. If offline or backend saving also fails, retain the submitted records and pending operations in account-scoped Zustand memory and continue the flow with the October 4 top banner; completion UI confirms the completed activity, not durable saving. The banner stays until manually dismissed or all endangered submitted content is saved, uses cause-accurate loss-risk wording and does not reappear for every new submission in the same unresolved episode. On recovery, close any visible banner and show one recovery toast whether or not it was previously dismissed. Keep retry identities and dependent write order, never evict pending data, and distinguish temporary memory from successful phone/server saving. Normal successfully persisted saves continue immediately with quiet background uploads.
- [ ] Apply the confirmed offline timestamp trust policy to earlier-upload eligibility: accept a valid client-reported start within that account's server-verified subscription coverage, reject out-of-coverage/implausible future starts and keep ordinary paid features locked at saved expiry. Accept that deliberately backdated offline activity cannot be fully disproved. Do not require an online Start or reject legitimate earlier reps merely because their upload is delayed. Phase 07 tests this boundary through isolated coverage fixtures; Phase 07A connects verified provider coverage.
- [ ] Validate reflection input before submission. If the backend permanently rejects submitted content, retain it locally for correction rather than repeatedly sending unchanged invalid input or deleting the writing. Automatic transient-failure retries do not apply to an unchanged validation rejection. Finalize how correction is presented separately from the superseded network loading/error UI.
- [ ] Exclude a definitively rejected completion from reps, calendar counts and current/best streaks, as confirmed in the October 4 follow-up. Preserve its local content for recovery and explain why it no longer counts. Temporary failures, uncertain responses and unresolved technical/authentication/coverage problems do not establish a definitive completion rejection. A rejected reflection edit does not remove credit for an accepted completion. Reconcile rejected local contributions with server aggregates without subtracting a valid accepted record or counting the same adjustment twice.
- [ ] Remove reflection debounce autosaves and cloud draft/final/skipped lifecycle distinctions. Send feeling/text only on explicit Save Reflection. Unsaved editor content stays in memory; a saved attempt exposes submitted reflection content or null. Keep feeling-only, text-only and both, plus the existing dirty-close Save/Keep editing/Discard choice. Never treat time since the last keystroke as submission.
- [ ] Remove `feeling_version` from reflection storage/contracts and history projections. Retain stable, descriptive feeling codes; label wording changes must not silently redefine the meaning of a saved code.
- [ ] Do not add network loading/failure states, Saving spinners, Couldn't save/Retry copy, manual save-retry buttons, Failure pages or pending-upload Home notices for ordinary completion/reflection uploads in the challenge → completion → reflection flow. The October 2 decision supersedes the earlier October 1 approvals/proposals for those save states. Normal navigation/display follows successful local recording; network uploads/retries remain background work. This does not remove initial loading/unavailable states for fetching missing content. Actual device-storage failure follows the approved cleanup/one-retry/online backend-save attempt below, followed by memory-only continuation and the dismissible top banner if neither durable save succeeds. Authorization rejection and edit conflicts retain their separate recovery handling; none of these exceptions restores network gating for an ordinary successfully persisted local save.
- [ ] Add reflection submission and editing from an attempt in the calendar day sheet. Support Add reflection for missing content and Edit reflection for saved content, both through PATCH /v1/attempts/:id with immediate local persistence/display and background uploading. Existing reflection edits change text only; do not offer feeling changes in that edit flow. Retain reflection_revision on the attempt to protect newer backend writing from stale delayed saves. This extends the earlier read-only Phase 06 scope. Do not introduce a day-level note or assume deletion controls were requested.
- [ ] Remove the standalone attempt lookup used by Success (`GET /v1/challenges/attempt/:id`) and its mandatory UI caller. Use in-memory/saved-create-response data for Success and attempts returned by the day query for history. The confirmed history resource is `GET /v1/attempts?date=YYYY-MM-DD`, returning that day's individual attempts and nested reflections with no status filter. Keep pagination and owner-scoped access.
- [ ] Separate Progress account-summary reads from month-calendar reads using the confirmed paths `GET /v1/progress/summary?timeZone=America/Toronto` and `GET /v1/progress/calendar?month=2026-10` (query values vary with the requested time zone/month). Use independently cached, account-scoped queries; load both when needed on entering Progress, and request only the month calendar when changing months. Do not fetch/recalculate overall totals/streaks merely because month selection changes. Overall summary contains total reps/current and best streaks; calendar contains the requested month's daily completion counts and monthly figures without duplicated account-wide aggregates. Refresh relevant reads after confirmed completions and on appropriate online refresh/day-rollover triggers, preserving immediate local progress while uploads/refetches are pending. Day details remain the paged attempt/history query. Finalize response field names/freshness in the task breakdown rather than reopening the accepted routes or decision to split.
- [ ] On a fresh launch, retry pending completed reps independently of unsubmitted reflection input. If the person explicitly tapped Save Reflection and its request is awaiting confirmation, preserve/retry that exact submitted feeling/text instead of replacing it with null. Never upload unsaved editor input. Local pending-save records are transport/recovery state, not active/given-up domain attempt statuses. The bounded retry policy above is confirmed; other rejection presentation remains pending below; revision conflicts use the confirmed backend-wins policy.
- [ ] After implementing and verifying the finalized Phase 07 changes, reconcile `PRD.md` sections 5.1–5.7, 6–7, relevant acceptance criteria and time-to-completion analytics wording; `TECH_STACK.md` state ownership, data model, reflection saving, safe retries, lifecycle/time and future lock-screen assumptions; `DECISIONS.md`, `DESIGN.md`, `APP_SHELL.md`, `PHASE_04_SCOPE.md`, affected identity/API guidance and the frontend learning map; this plan's prior-phase requirements; and affected handoff/README guidance. Preserve historical implementation/test evidence while labeling requirements superseded by Phase 07. This post-implementation documentation task replaces the earlier pre-implementation consolidation requirement. Keep shared runtime contracts/OpenAPI and client/server callers synchronized during implementation, not deferred until this documentation pass.

**Billing boundary:** The nine confirmed subscription rules are preserved in [Phase 07A](#phase-07a). Phase 07 builds authenticated uploads, ownership/replay checks and the eligibility interface using isolated test providers. Native purchases, access refresh/expiry behavior, billing records, webhooks, QStash and billing schedules belong to 07A. That phase connects verified subscription coverage and proves earlier valid-access reps and dependent reflections still upload after expiry; production access remains closed until integration passes.

**Review status — product recommendations and engineering validation**

- Offline history scope confirmed in the October 3 review: persist the downloaded challenge catalog, account-scoped subscription verification, pending completed reps/submitted reflections, latest Progress summary, current month's calendar counts and today's available attempt/reflection details. Durable downloaded history is limited to the current month and today. Another day within the current month needs an online detail lookup; other days/months require a connection even if previously viewed online. Older history queries use in-memory caching without accumulating durable month/day copies and are not exposed offline. This supersedes the earlier broad downloaded-history cache scope, while retaining offline recording, immediate local display, online calendar Add/Edit reflection, same-ID reconciliation and background retries. Separate disposable confirmed current-period caches from pending uploads; earlier pending records remain protected across rollover until acknowledged and no dependent operation needs them.
- Local-storage failure policy updated by the October 4 banner follow-up: first clear only disposable, backend-confirmed Progress detail caches and retry the same device write once. If it still fails, retain the submitted records/operations in shared memory and attempt direct backend saving when online. Confirmed backend saving establishes durability even while the local cache remains unwritable. If offline or backend saving fails, allow continued use with the dismissible top warning specified below and keep trying to save automatically. Fetching can recover previously uploaded history, but cannot save new unsent writing. Do not claim durable saving from memory alone, clear pending data, or imply that connectivity automatically fixes local storage. Termination may lose memory-only content until either a phone write or backend save succeeds.
- Offline timestamp trust policy confirmed in the October 3 follow-up: preserve offline recording and accept client-captured activity time within account-owned server-verified subscription coverage, with valid timestamp/time-zone checks and rejection of implausible future starts. Enforce saved expiry in the ordinary app and verify forged/out-of-coverage inputs. Historical coverage proves eligibility for a reported period, not when an offline activity actually happened; Anthony accepted that deliberately backdated requests cannot be fully disproved under this model. Do not add a mandatory online Start or arbitrary upload-age cutoff that would strand legitimate earlier reps. This policy makes no proof-of-capture guarantee and preserves all nine subscription rules.
- The technical design and six sequential Phase 07 subphases below, retaining the ten original task IDs for traceability, specify the baseline for the previously open API/storage/migration/reconciliation details. Validate/refine these mechanics during their implementation slices without asking the owner to choose field names. The remaining engineering bullets describe verification work, not additional product approval gates. Routine cache limits and compatibility versions require implementation measurements/current documentation; provider/cron settings belong to Phase 07A.
- AsyncStorage/reconciliation details: finalize account-scoped keys, hydration, consistent record-plus-upload persistence, acknowledgement recovery, measured current-period cache limits and implementation of the confirmed device-storage fallback. Persistence categories, retaining the complete downloaded catalog/latest summary and never evicting pending uploads are confirmed. Do not persist browsing/current countdown/editor drafts. Earlier pending-only/local-cache prohibitions are superseded. Keep credentials in secure storage. Finalize the mechanism by which TanStack remote reads and Zustand/local records feed the approved displayed view without duplicate counts or regression, and verify storage size, serialization and responsiveness. Cache cleanup must not sacrifice pending entries; distinguish confirmed cloud saving from device-cache persistence and preserve safe replay/reconciliation when a local acknowledgement cannot be written.
- Fetch-state presentation: choose the cold-start challenge loader, read-failure/retry copy and any unobtrusive refresh indication, plus the final calendar/day-sheet offline layout. Each venue's nonempty challenge set, usability of cached cards during refresh and no partial-history/remaining-entry notice are confirmed. A requested lookup unavailable locally needs a visible connection-required message when offline rather than a fabricated empty result. The no-network-loading/error rule applies to completion/reflection uploads, not to fetching missing content.
- Exceptional uploads: validation before submission, retention for correction, no endless retries of unchanged invalid content and exclusion of a multi-phone conflict workflow are confirmed. Finalize correction presentation, ordered single-device edit/revision recovery and authentication recovery without losing pending writing. A background network error does not interrupt the flow. Preserve the earlier-upload eligibility seam for the confirmed subscription policy in Phase 07A; account-scoped verification hydration, refresh coalescing and expiry enforcement are implemented and accepted there.
- Reflection PATCH details: attempt columns, nested reflection-or-null responses, removal of separate reflection routes/table, PATCH /v1/attempts/:id, the nested patch/expected-revision approach, unchanged feelings, stale-edit rejection and stable per-submission replay recognition are confirmed. Finalize field names, expected-revision/retry-identity placement, defaults/absence handling, successful response projection and the replay storage/acknowledgement mechanism. Protect unrelated immutable attempt fields. Define feeling-only/text-only edge cases and ordering of multiple offline edits without introducing a feeling-edit feature. Removal of feeling_version is confirmed. No separate reflection resource ID or POST is needed; the submission's retry identity identifies an operation, not another reflection.
- Progress query details: the three read routes above and their summary/calendar/day responsibilities are confirmed. Finalize exact response fields, account/month/time-zone cache keys, summary freshness, day rollover, mutation invalidation and the mechanism coordinating acknowledgements with aggregate refreshes. The no-double-count/no-regression behavior is accepted; do not simply add every locally stored rep to a backend total, since most confirmed local entries are already included. New activity stays on its frozen start date; historical dates remain unchanged.
- Migration/rollout: preserve completed records/account ownership, stable challenge IDs and existing historical activity dates. Deliberately migrate canonical challenge instruction/configuration out of revisions and redirect attempt/venue references, then remove revision logic/table. Migrate saved reflection feeling/text/revision onto owner-matched attempts and verify the transfer before dropping reflections. Determine how existing active/given-up rows, draft/skipped reflection rows, legacy reflection action receipts, legacy timestamp/time-zone fields and older clients are retired or migrated without moving old reps to different calendar days. Keep relevant repeated-delivery protection while removing obsolete draft/final/skip action logic. Inactive challenge rows stay readable in history; exact old wording is no longer required. Do not destructively rewrite existing records during this discussion.

**Examples of confirmed choices and recommendations for remaining details**

- Confirmed PATCH approach, illustrative field names: a first submission could carry `{expectedReflectionRevision: 0, reflection: {feeling: 'a_little_better', text: 'I said hello.'}}`; a later edit could carry `{expectedReflectionRevision: 1, reflection: {text: 'I said hello and asked a question.'}}`. The first accepted save returns revision 1, then a later edit returns revision 2. Stable per-submission retry identity recognizes repeated delivery without incrementing again. Field names/identity placement and multiple-offline-edit handling still need implementation design; the user need not choose arbitrary JSON names.
- Confirmed cache/reconciliation approach: keep the complete downloaded challenge catalog/latest summary, limit downloaded history to the current month's counts and today's details, and never evict pending uploads. Backend total 10 plus one new local completion displays 11, and remains 11 through upload/refetch. The reconciliation mechanism and current-period storage/performance measurements remain implementation work.
- Confirmed cache cleanup for an actual device-write failure: discard only backend-confirmed downloaded day/month detail payloads and obsolete period copies, then retry the same local write once. Keep challenges, access verification, compact summary/reconciliation metadata, pending uploads and required dependent content. Do not clear all AsyncStorage. If writing still fails, retain the input in memory and use the approved online backend-save fallback; offline or failed backend saving retains the input and inline retry action. Limited current-period retention does not guarantee writable storage on a full phone.
- Confirmed limited offline scope: support offline challenge/completion/reflection recording plus the latest downloaded Progress summary, current month's calendar counts and today's available day-sheet attempts/reflections. Month counts do not imply storing individual details for every day. Populate/refresh only these current-period views in the background while online, using the separate summary/calendar/day resources and day pagination; do not prefetch every day's history. Incorporate locally completed reps/submitted reflections immediately and deduplicate against backend acknowledgements/refetches. Tapping another day in the current month fetches its details only when online; other months and other day sheets also require a connection, regardless of prior viewing. On day/month rollover, switch date-keyed disposable caches to the new period and remove obsolete confirmed copies; never remove earlier pending uploads or content required by dependent operations. If new-period data has not been downloaded, display available local entries normally and show a connection-required state only for requested unavailable information, without fabricating an empty result or adding partial-history notices. Summary reconciliation, rollover and measured storage/performance checks still apply. Today's details and unsent records are not guaranteed to have a fixed size.
- Migration explanations: keep completed reps and explicitly submitted reflection content/revisions associated with the same account/attempt IDs, then retire obsolete lifecycle rows/tables after validating the transfer. Do not convert given-up or active attempts into completed reps or unsubmitted drafts into submitted reflections. Anthony confirmed preserving existing historical calendar dates; only new completions use the start timestamp/start time zone rule. Old rows captured the time zone at completion, so do not invent an original start time zone or recalculate their historical dates. Verify counts, date preservation, owner isolation, feeling/text/revisions and challenge links before dropping obsolete tables; settle legacy timestamp mapping, old-client rollout and receipt handling in the migration tasks.

#### October 4 review — saving feedback, backup limits and actionable failures

**Confirmed in this review and follow-up:** prevent duplicate local submissions and allow delayed, subtle feedback while the phone write is pending; keep ordinary successfully persisted saves independent of HTTP. Failures requiring intervention must be discoverable without relying on the user reopening a particular reflection editor. Preserve the existing distinction between unsaved memory-only input, device-persisted content and server-confirmed saving. Keep existing backup behavior and accept the remaining pre-upload device-loss risk. Add sparse active/online retries and the foreground-outage recovery scenario to sender verification. Memory-only continuation and its dismissible top banner are confirmed below; the separate actionable-record recovery surfaces/copy remain proposals. No application changes are implemented by this review.

**Backup decision — confirmed:** leave backup behavior as it is. Continue immediate uploads after durable local saving and preserve unacknowledged operations across relaunch under the existing plan. Anthony accepts that losing/deleting the only phone copy before upload can lose those records. The proposed extra Sync status, backup-specific warnings and second cloud synchronization system are not added to this scope. Existing identity/recovery and intentional account-deletion requirements remain with their owning phases; credential recovery does not recreate content that never uploaded. This decision does not remove the separately agreed discoverability of failures requiring intervention.

**Memory-only continuation — confirmed by the banner follow-up:** retain submitted completions/reflections and their pending operations in shared memory and allow continued use when cleanup/one local-write retry and the available backend-save attempt fail. Show the dismissible top warning below. A queued request survives termination only if its own persistence succeeded; putting it in Zustand cannot bypass a failed device write. Successfully persisted older records remain protected, but new memory-only content/operations can disappear on process termination. This exception replaces the earlier current-screen retention rule without changing normal phone-first saving or claiming that completing an activity proves it was saved.

**Memory-only collection and display — implementation baseline:** retain all explicitly completed attempts/submitted reflections and their operation identities in an account-scoped Zustand collection owned above individual screens, keyed by attempt UUID rather than challenge ID. Ten completed rounds produce ten entries, including deliberate repeats of the same challenge. Compose this collection with the persisted journal and remote baseline using the existing same-ID reconciliation selectors; reflect eligible temporary entries in summary/month/day counts and the applicable day sheet immediately, using the captured start date. Multiple completions on one day add multiple reps but only one active day/streak day. Preserve earlier temporary entries across navigation and period rollover while the process survives. A successful AsyncStorage write or server acknowledgement changes durability/upload metadata, rather than deleting the live display record; retain entries while the current flow, today's view, pending changes or aggregate reconciliation need them. Track the latest submitted reflection separately from its already-durable completion so saving an older version cannot conceal newer memory-only writing. Do not claim memory-only entries survive termination or fabricate missing historical context for exact streaks.

**Memory-only warning — confirmed top placement and manual dismissal:** show one account-scoped banner below the top system safe area and above the screen header/content, occupying layout space across the challenge flow and tabs. Keep it discoverable in a covering day sheet and with the reflection keyboard visible; do not cover controls. Show it when explicitly submitted content has neither confirmed phone persistence nor server saving. A successful phone write is sufficient even while offline; server-confirmed saving is sufficient even if phone storage remains unwritable. Offline status alone does not trigger it. Use an accessible Close action. It has no dismissal timer; manual dismissal or confirmed recovery closes it. Closing it neither clears records nor stops save/upload recovery. Keep dismissal across navigation and further submissions in the same unresolved episode; a later episode after recovery can show a new warning.

- **Copy when offline and storage full are both confirmed:** "Your phone is offline and storage is full. New activity could be lost if the app closes before it's saved."
- **Copy when the cause is not established:** "We can't save your new activity right now. It could be lost if the app closes before it's saved." Use similarly accurate wording when only one cause is known; never diagnose full storage from an arbitrary write failure or call a backend outage an offline phone. Previously saved progress is not described as lost. New reflection changes on a saved completion can still require this warning.
- **Recovery:** when all endangered submitted content is confirmed saved to the phone or backend, automatically close the banner if it is still visible and show one brief "Your activity is now saved" toast. Show the same single toast if the user already dismissed the banner. Do not replace the warning with a persistent success banner or repeat the toast for each saved record. Partial recovery, an acknowledgement of an older version, clearing an account/view, discarding state or rejecting a record must not announce that everything was saved. Clear stale account-specific presentation on an account change without exposing records or claiming recovery. This does not add an ordinary pending-upload notice or a separate Sync status feature.

**Toast library — Sonner Native selected October 4:** use `sonner-native` for native toast presentation. Phase 07 owns the shared toast setup and the saving-recovery confirmation above. Keep usage limited to brief recovery confirmation and minor external-link opening failures such as "Couldn't open the link. Please try again." Wire those link failures when their support/legal/subscription-management controls are implemented in the owning phase; keep the original control available. Validation stays inline, missing-content errors stay in the affected section, unresolved saving risk uses the banner, and account/payment/record-recovery issues keep their persistent surfaces. Ordinary background upload failures stay quiet; do not attach an automatic error toast to every failed API request or use promise/loading toasts for ordinary saves.

Use a shared presentation boundary for consistent styling, duplicate suppression and account-safe dismissal, with the native host in the app shell. Keep saving/retry decisions in their existing owners. Verify a compatible published Sonner Native release against the pinned Expo/React Native/Reanimated dependencies during implementation; this selection does not authorize unrelated dependency upgrades. Preserve browser verification through the library's documented platform adapter using `sonner` on web. Verify screen-reader announcements, scalable text, reduced motion, safe areas, keyboard/sheet visibility, navigation and exactly one recovery toast per resolved episode. References: [Sonner Native documentation](https://github.com/gunnartorfis/sonner-native-toasts#readme), including its web setup, and [package peer requirements](https://github.com/gunnartorfis/sonner-native-toasts/blob/main/package.json). The choice was recorded before installation. The selected packages are now installed in the unfinished Phase 07 branch; compatible runtime wiring and native/web behavior still require the 07.3 checks.

**Pending operations and cleanup — implementation baseline:** Zustand holds the live records and the structured work needed to save/upload them: operation kind, attempt/submission IDs, immutable submitted values, ordering/revision dependencies and retry/acknowledgement state. These are serializable instructions, not running HTTP requests, promises or stored credentials. The account repository updates this single live model and writes its consistent journal snapshot to AsyncStorage when possible; the sender reads the same operations rather than owning a second independent queue. Successful local persistence marks the relevant content safe on the phone but does not remove its upload operation. A matching server acknowledgement resolves only that operation, with durable acknowledgement/reconciliation before removing persisted intent in the normal path. If storage still fails, retain the information needed to reconcile the older persisted journal later. Completing an upload does not immediately delete its displayed record. The storage section below defines event-triggered record pruning; never evict unsaved records to bound memory.

**Definitively rejected completions — confirmed:** Anthony selected not counting them. Preserve the completion/reflection content for recovery, but exclude the rejected completion from total reps, day/month counts and current/best streak calculations. Keep this separate from temporary failures, unresolved request outcomes, repairable technical/authentication problems and provider-coverage uncertainty. A reflection-only rejection leaves its accepted completion credit intact. Record the rejection/reconciliation state consistently in the account journal, stop unchanged rejected/dependent uploads, and let independent eligible entries continue. Recompute affected derived progress from eligible records/baselines; never blindly decrement an aggregate that may already exclude the rejected local record. If necessary history for an exact corrected streak is unavailable, refresh the required authoritative aggregate or show that figure as unavailable rather than retaining an inflated count as current truth. Verify rejection recovery across relaunch and repeated responses; no automatic deletion of the preserved writing is authorized.

**Support destination — confirmed release requirement:** Anthony agreed that Get help must lead to a working support email or help destination before release. Phase 08 owns selecting/configuring/verifying it; this does not block the core Phase 07 saving implementation. Do not ship a placeholder or nonfunctional help action, and do not send private reflection content or credentials as diagnostics.

**Retry opportunity — confirmed:** retain the immediate attempt plus two short retries, then pause that cycle. In addition to reconnect/restart/foreground triggers, schedule sparse retry opportunities while the app is active, online and has transiently failed pending work. One account-bound coordinator owns the schedule and coalesces it with other triggers. Increase the cooldown between failed opportunities up to a finite cap, add jitter, and never retry before an applicable server Retry-After; preserve cooldown across event storms so they cannot reset the schedule into a rapid loop. At a scheduled opportunity make one due send per eligible operation through the existing ordered sender, rather than multiplying short retry bursts or creating per-screen timers. Suspend the timer when inactive/offline/empty/account-changed; resume retained work at a permitted opportunity. Exclude permanent failures and unresolved authentication, and reset backoff for resolved work. Keep clocks/randomness controllable and select/document measured delay/cap values during implementation. This is pending-upload recovery, not access-verification polling, a continuously running background worker or a terminated-process execution promise. Verify eventual upload after the backend recovers while the app stays active and online, without requiring a reconnect or navigation event.

**October 4 implementation clarification — backend wins on reflection conflicts:** Anthony rejected the proposed “Entry needs attention” link/review flow for reflection version conflicts. When replay/ordering checks establish a genuine stale reflection revision, automatically retrieve/adopt the latest owner-scoped backend reflection and its revision. Replace the conflicting local reflection and settle its superseded submission/dependency chain consistently in the journal so restart cannot replay it. Do not overwrite the backend with that stale text, ask the user to choose versions, or show a conflict attention indicator. A failed canonical fetch is not a successful resolution: retain the current local record until authoritative data can be obtained. Ordinary unsent edits still upload in order; an older successful acknowledgement or stale background read must not erase a newer local submission. Fence conflict recovery by account and operation generation so it cannot consume an unrelated edit made after recovery began. Test backend-wins resolution, replay/relaunch, unavailable canonical data and newer-input/account races. This supersedes the earlier proposal to retain conflicting text for a manual review/copy workflow.

**Other recovery presentation — pending:** The proposed generic Progress attention entry point is not approved by this clarification. Retain the existing identity recovery surface and the confirmed memory-only risk banner. For other actionable failures (such as invalid input or an unreadable journal), preserve the separately confirmed handling/discoverability requirements and finalize their cause-specific presentation before dependent UI work. Backend-wins reflection reconciliation does not manufacture missing data or turn a storage/authorization failure into a version conflict.

| Failure class in the planned save flow                                                                                                                  | Proposed explanation and recovery                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Neither local saving nor the backend fallback succeeds                                                                                                  | Retain submitted content and pending operations in account-scoped memory, allow continuation and show the confirmed dismissible top banner. Retry saving automatically. Use storage-full/offline wording only for established causes; never claim memory-only input survives a restart.                                                                                                                                          |
| Session/device authorization requires explicit recovery, or identity storage remains unavailable                                                        | Attempt ordinary session renewal automatically first. Use the existing account/recovery surface for revoked or unrecoverable sessions and persistent secure-storage problems; resume pending uploads only after proving the same account. Account retirement or loss of every recovery proof may prevent recovery; do not promise support can bypass ownership.                                                                  |
| User-correctable reflection validation rejection                                                                                                        | Preserve the submitted text/feeling and show an entry-level Review reflection action that opens the editor with the exact field problem. A corrected explicit submission gets a new identity; unchanged rejected payloads do not loop. Internal payload/immutable-field errors belong to the technical-failure case, not instructions to rewrite valid personal content.                                                         |
| Genuinely stale reflection revision after replay/ordering recovery                                                                                      | Automatically adopt the latest owner-scoped backend reflection/revision and settle the superseded conflict operations durably. No attention link, conflict chooser or review step. Retain ordinary unsent edits and protect unrelated newer input/account generations; see the confirmed backend-wins rule above.                                                                                                                |
| Confirmed rejection of the recorded activity's subscription coverage or captured time                                                                   | First reconcile account-owned provider coverage through Phase 07A. If rejection remains, explain that the saved entry could not sync and offer access review/support appropriate to the confirmed cause. Do not require renewal for a valid earlier rep, invent a past timestamp, or imply fixing the current clock proves the historical time. Missing provider data during an outage is not a permanent eligibility rejection. |
| Journal cannot be read, validated or migrated                                                                                                           | Preserve/quarantine the stored bytes; recover server-confirmed history where available. Explain that some phone-saved entries could not be opened, with technical help/recovery rather than destructive reset or reinstall advice. Disposable confirmed cache failures alone can be repaired by refetching and do not justify this warning.                                                                                      |
| App/API incompatibility or integrity failure: uncorrectable request rejection, conflicting retry-identity reuse, or a genuinely missing required record | Stop unchanged retries, retain local content and redacted diagnostic identifiers, and offer technical help; offer Update only when a compatible released update is known to resolve it. Repair/reconcile before requesting user action when safe. A duplicate matching request, lost acknowledgement, inactive retained challenge or an ordered create still awaiting delivery is not this failure class.                        |

Temporary offline/network/timeouts, rate limiting and backend outages continue quiet retries and retained local saves; they do not by themselves imply that the person must correct their entry. Do not introduce the unselected Sync status or treat elapsed pending time alone as invalid content. Initial missing-content reads and first-use/expired-access verification keep their separate loading/recovery surfaces. Capture privacy-safe counts, pending age and rejection categories during verification/operations; never include reflection content or credentials in diagnostics.

#### Proposed technical design — October 3 review draft

This is the implementation baseline for the confirmed product policies, not a claim that application changes are implemented. Anthony selected offline recording plus the latest summary, current month's calendar counts and today's day sheet, approved the offline timestamp trust policy in the October 3 review/follow-up, and extended the exceptional local-storage failure fallback with warned memory-only continuation on October 4. Use the engineering choices here to make implementation concrete; adjust a routine internal detail when tests or measurements justify it, while preserving confirmed behavior and documenting the adjustment in the handoff.

##### 1. Local saving and a failed device write

- In the normal flow, await the device write before navigating to Success or leaving an explicitly submitted reflection, then upload in the background. Do not wait for an HTTP response or display a network Saving state after a successful local write. Temporary upload failures retain the durable local copy, retry under the confirmed bounded policy, and refresh/reconcile relevant backend reads after acknowledgement; a refetch is not a replacement for sending unsent content.
- Apply the October 4 local-write interaction guard and delayed accessible saving feedback to Completed, Save Reflection, calendar edits and dirty-close Save. The no-network-spinner rule does not prohibit feedback for an unfinished device write or the exceptional confirmed-server-save fallback. Preserve stable retry identities and newer input; resolve feedback without waiting for ordinary uploads.
- First failure: discard only disposable, backend-confirmed downloaded day/month cache payloads and obsolete period caches, retaining the compact summary/reconciliation metadata, challenge catalog, verification, pending uploads and content needed by dependent operations. Retry the same local write once, with the same completion UUID or submission ID. Do not clear all AsyncStorage or delete a pending rep to make room for another.
- If the retry fails, retain the submitted completion/reflection and its pending operation in shared account-scoped memory. When online, attempt the backend-save fallback below. If offline or backend saving fails, allow navigation under the October 4 memory-only policy and show the dismissible top banner; no separate Failure page or inline manual-retry gate is required. A completed challenge is no longer eligible for Give up. Repeated activation still targets the existing completion/submission and cannot generate another rep. Saving/reconciliation proceeds independently of the banner's visibility.
- Reflection input remains editable. A genuinely new explicit submission receives a new submission ID; retries of an unchanged submission preserve its immutable payload/ID. Serialize repository operations so an acknowledgement cannot race a newer save. Optional cache-write failure must not block already available challenges or discard the previously committed journal.
- Background HTTP failures still follow the confirmed quiet upload/retry policy. A failed acknowledgement write leaves the older durable upload intent available for safe replay; never delete that intent only in memory and assume recovery is complete. These rules protect persisted content; memory-only input still cannot survive termination when device persistence has failed.
- **Confirmed exceptional backend-save fallback:** after cleanup and one failed local-write retry, an online app attempts direct API saving using the same attempt/submission identity, keeping dependent creates/patches in order and respecting authentication, ownership and upload eligibility. Await the bounded attempt's outcome; confirmed server saving allows continuation without the loss-risk warning, while a failure/timeout permits warned memory-only continuation. Keep an in-memory display when caching is still unavailable and recover uploaded data from online queries. The server-confirmed record is durable even if a device-cache write still fails; do not claim it is stored for offline use. A fetch alone cannot save new unsent content. Timeouts retain the same identity for safe replay and do not prove success. Existing persisted operations/receipts must reconcile safely when device storage becomes writable; do not discard a durable older intent merely because it was acknowledged in memory. Dependency handling may use an authoritative server acknowledgement in this exceptional path while the ordinary persisted sender still requires device-durable acknowledgement. Until confirmed server saving or a successful device write, termination can lose memory-only input; do not promise restart recovery from an unwritten journal.
- Retry phone persistence for retained memory-only content on later explicit submissions and foreground return, plus sparse increasing/capped cooldown opportunities while the app remains active with content needing a phone save. This local-storage recovery does not require connectivity; freeing space may allow saving while still offline. Coalesce it through the account repository, avoid tight write loops and keep timers cancellable/account-bound. Upload recovery uses the ordered sender and its existing network/authentication policy. A recovery write must include all retained live submissions or track exactly which versions it saved; saving one entry must not erase another or incorrectly clear the warning. Never replace newer live memory with an older hydrated journal during recovery.

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
- Keep identity behavior intact while renaming action paths. Proposed noun-resource mapping: session creation/recovery/renewal/transfer redemption through typed POST /v1/sessions requests; bearer-identified GET /v1/sessions/current; devices and credentials through their collections and DELETE /:id with existing soft-revocation semantics; POST /v1/transfers, POST /v1/transfer-inspections and POST /v1/transfer-approvals for the existing proof/approval flow; DELETE /v1/transfers/:id cancels with the code retained in the body and resource-ID/owner checks. Keep secrets in request bodies rather than new URL parameters. Validate every old caller and recovery proof against this mapping before cutover. Excluding multi-phone reflection editing does not remove account transfer/recovery.

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
- Serialize writes through one repository per account. Zustand exposes the live local records, pending structured operations and flow state in normal use as well as memory-only fallback; screens cannot mutate a competing journal/queue. The repository tracks phone-persisted and server-acknowledged versions separately from the latest live submission and writes consistent snapshots to AsyncStorage. Keep editor drafts/dialogs in React and active countdown/browsing in a memory-only Zustand slice. TanStack owns remote queries; selectors compose remote data with the local model rather than copying every query into Zustand.
- Hydrate/validate/version the saved envelope before using it. A malformed disposable download can be fetched again; preserve/quarantine an unreadable pending journal instead of resetting it and losing records. Cancel account-bound reads/uploads on account changes, hide the previous account's views and hydrate the correct account. Preserve any memory-only records in their original account partition while the process survives; switching accounts is not an eviction trigger and never transfers their content/operations to the new account. Never upload an old account's journal using a new account's session.
- **Pruning criteria:** a full local record can be removed only after the backend has confirmed its latest submitted content, its pending/dependent operations and required acknowledgement writes are settled, and the current flow, today's view and aggregate reconciliation no longer need it. Retain compact reconciliation metadata when still needed to keep totals stable. Never prune memory-only records, unuploaded changes or preserved rejected content as ordinary cache cleanup. Removing an acknowledged operation is separate from deleting its displayed record.
- **Pruning triggers:** evaluate those criteria after successful upload/aggregate reconciliation, leaving the completed challenge/reflection flow, and day/month rollover (also on the next foreground check if rollover happened while inactive). Use one repository action to remove eligible IDs from the live collection and update the persisted journal consistently; leave necessary recovery metadata intact if that write fails. Do not delete records because a timer says they are old, the banner was dismissed, or a fixed list size was reached. For example, yesterday's fully uploaded/reconciled entry can leave the local collection after it is no longer in the flow; its backend history remains accessible through online day queries. Today's entries remain, and all ten unsaved challenge rounds remain regardless of age. Apply the existing online-only rule to older downloaded history; do not promise an offline reload of a pruned record.
- Do not accumulate downloaded old months/day details under the confirmed limited cache. Measure single-envelope serialization, write latency and size with representative offline queues and long reflections; internal key partitioning may be refined if measurements require it, without weakening consistent saves/recovery.

##### 5. Upload ordering and retries

- Generate the attempt UUID once on Completed. Generate a submission UUID once per explicit reflection save/edit. Normally persist immutable operation payloads before sending; the device-write failure fallback retains those same instructions in account-scoped memory. Unsubmitted typing and Skip create no reflection operation.
- Use one account-bound sender, one operation in flight per attempt and ordered create → first reflection PATCH → later text PATCH. A queued edit can depend on the preceding submission's acknowledgement; bind its expected backend revision when that dependency is resolved, persist the bound payload, and reuse it unchanged on retries. In the normal persisted sender, do not send the next dependent operation before the acknowledgement is durably recorded on the phone. The approved device-write failure fallback may sequence dependent operations from authoritative backend acknowledgements while retaining the same retry identity and preserving existing durable intents for later reconciliation; it does not permit concurrent senders for the same attempt.
- Follow the confirmed immediate attempt plus approximately 2-second and 5-second transient retries, then pause. Reconnect/restart/foreground restarts a bounded cycle, with coalescing, cooldown and Retry-After. Apply the October 4 confirmed sparse active/online retry schedule through the same sender so recovery needs no new connectivity/navigation event. Scheduled opportunities send due work without starting additional rapid bursts; cancel/suspend their timer when work is absent or the account/app/network is ineligible. Known offline state waits. Disable independent mutation retries that would multiply this policy. Sending is opportunistic while the app can run; there is no terminated-process execution guarantee.
- Treat timeouts/lost responses as unknown outcomes: replay the same completion UUID or reflection submission ID. A matching create/receipt confirms it without another rep or revision increment. Persist an acknowledgement before clearing the pending marker. Overlay any newer queued reflection over an older canonical response.
- A 401 uses the existing serialized session renewal/recovery flow and pauses if the same account cannot be authenticated. Permanent validation/revision/ownership rejection stops transient retries, retains the local content and emits redacted diagnostics. Apply the October 4 agreed discoverability requirement using the finalized recovery presentation; editor validation alone cannot be the only way to find an actionable failure. Use the existing editor for correctable reflection input, without a generic network Retry page or multi-phone merge feature. A genuinely stale PATCH is never rebased onto different backend text: automatically adopt the latest backend reflection and settle the superseded conflict chain using the confirmed backend-wins rule.
- Earlier valid-access reps can upload after subscription expiry. Validate eligibility using account-owned, server-verified subscription coverage for the reported start period rather than a current-paid guard or a client premium boolean. Apply the confirmed timestamp/time-zone and implausible-future checks; accept the documented inability to disprove deliberate offline backdating. Do not require an online Start or an arbitrary upload-age cutoff. Keep this permission separate from starting new paid activity and preserve ordered dependent reflection uploads. Phase 07 builds/tests this eligibility boundary through isolated provider fixtures; actual verification/coverage recording and end-to-end expiry acceptance belong to Phase 07A, not assumed to exist today. Keep production access closed until that integration passes.

##### 6. Progress reconciliation and the limited cache

- Day rows merge by attempt UUID, with the latest explicitly submitted local reflection taking precedence until its operation is acknowledged. No extra attempt GET is needed. Preserve existing self-contained pagination, start-time ordering and backend current wording.
- Persist a server aggregate baseline and a separate set of local reps not yet covered by that baseline. Count only that set as an addition; retaining a confirmed row on the phone is not a reason to add it again. Keep acknowledgement/rebase markers separate from the domain attempt object.
- The same selectors include eligible memory-only submissions immediately across summary/calendar/day views. While phone writes fail, apply acknowledgement/baseline changes together in the live account model and retain the metadata needed to reconcile the last committed journal later. A storage failure must not drop the additions, block confirmed server recovery from being displayed, or make a stale disk snapshot replace newer live state. This updates the running session only; it does not establish restart recovery for unwritten state.
- Apply the confirmed rejection rule to that addition set and the displayed calendar/streak calculations: definitively rejected completions are excluded while their content remains available for recovery. Ordinary upload delays keep their local contribution. A rejected reflection PATCH cannot remove an accepted rep. Resolve uncertainty about an existing accepted completion before treating a conflicting create as rejected activity; safe same-ID replay must not reduce valid progress. Unlike regression caused by stale responses, the explained removal of definitively rejected credit is an intentional correction.
- For summary/month aggregates, do not install a new response while relevant completion creates have unknown outcomes. Drain/replay those creates first. Capture the local change generation when starting a refresh; discard aggregate results if a new local completion arrived in the meantime. After all relevant creates are acknowledged, a fresh response can replace the baseline and remove the included additions in the same journal write. If refresh fails, keep the existing baseline/additions. Thus 10 + 1 remains 11 before upload, after acknowledgement and after refresh. Day-list reads can still merge by ID while uploads are pending.
- Summary additions cover account totals; month additions cover only their frozen activity dates. Recalculate monthly reps and active days from known day counts plus additions. Provide compact summary streak context for the current month: its month key, the consecutive run ending immediately before that month and the best run before it. Combine that with known current-month active dates/local additions to calculate streaks across the boundary. If required historical/date context is unavailable, retain the last verified streak figures until a coherent refresh instead of inventing an exact result. Test delayed previous-month uploads and time-zone/day rollover explicitly.
- While online and access permits, hydrate then refresh/preload the latest summary, current month and today's day query in the background; fetch only today's required pages, not every calendar day. Cache all available today pages under one date with their cursor/completeness metadata. Another day in the current month and older history fetch details on request while online and use ordinary in-memory queries only. Offline other months/day sheets show the connection-required state even if previously viewed online; the available today view has no partial-history notice.
- At midnight/month rollover, select cache keys matching the new local date/month and update streak context where known. Remove obsolete confirmed detail snapshots; never remove pending activity, remap its frozen dates or label yesterday's cache as today. An unavailable new-period query is not a successful empty response. Available local today entries remain visible normally.

Technical references for this design: [HTTP PATCH and conditional/atomic application](https://www.rfc-editor.org/rfc/rfc5789.html#section-2), [PostgreSQL snapshot isolation](https://www.postgresql.org/docs/current/transaction-iso.html), and [AsyncStorage's persistent key-value API](https://github.com/react-native-async-storage/async-storage). These support implementation mechanics; product policies above come from the confirmed decision record or explicitly marked recommendations.

**Final review and verification for the Phase 07 implementation breakdown**

- **October 3 assessment follow-ups:** Anthony assigned the two outstanding code-quality assessment items to Phase 07: correct the API's oversized-body/unsupported-content-type error mapping and add repeatable full-journey tests that gate CI. Phase 06A added coverage gates and performed browser journey checks, but did not fix these HTTP errors or automate those journeys in CI. Task 2 in 07.1 owns the HTTP correction; the journey harness starts in 07.1, grows through 07.2–07.4 and reaches full CI acceptance in task 10 of 07.5. Phase 07A remains billing-only.
- Apply the confirmed current-month/today history scope, offline timestamp trust policy and exceptional device-storage fallback, then freeze the engineering baseline/ordered tasks below before application changes. These product choices are settled; finalizing routine implementation details does not require selecting them again. Do not redo already confirmed subscription, resource, start-date, normal local-save or multi-phone decisions.
- Write/run relevant tests and verify affected UI only in Codex side panels, as Anthony requested. Do not switch to an external browser or simulator window. If a required native capability is unavailable through a supported side-panel surface, record the open check explicitly rather than claiming browser evidence establishes native behavior. Include local skip/start/give-up behavior, explicit resource/filter/value requests without backend UI-flow context, background versus fresh-launch countdown behavior, start-date/midnight/time-zone attribution, UUID retries/lost responses, immediate locally persisted completion/reflection/calendar edits with no network-gated UI, attempt reflection-column migration and nested/null projection, initial/text-only attempt PATCH preserving existing feeling and revision/replay protection, removal of separate reflection routes/callers, resource routes/CORS, the expected nonempty catalog in every venue, first-download failure versus usable cached challenges after failed refresh, cached summary/month/day display without partial-history warnings, offline messages only for requested unavailable lookups, bounded cache storage/performance without evicting pending uploads, airplane-mode recording from available data, restart/foreground/reconnect uploads, ordered completion/reflection-patch/edit delivery, account isolation, stale edit/acknowledgement handling, local/remote progress deduplication and revised challenge-content history behavior. Fix failures and repeat until affected behavior passes. Documentation-only recording does not claim those implementation checks have run.

#### Sequential implementation checkpoints — 07.1–07.5

<a id="phase-07-subphases"></a>

The six subphases below replace the former single ten-step execution block, with 07.3A inserted on October 6 to migrate testing before further feature work. All confirmed requirements and detailed verification cases remain in scope. Original task numbers are retained to make earlier handoff references traceable; task 8 is deliberately split between backend reads in 07.1 and client integration in 07.4.

| Subphase                                                        | Owns                                                                                  | Depends on | Current status                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| [07.1 — API and data foundation](#phase-07-1)                   | Tasks 1–4, backend reads from task 8, journey-harness foundation                      | 06A        | A and B verified and merged by owner in PR #13 / PR #14                        |
| [07.2 — Durable local saving and synchronization](#phase-07-2)  | Tasks 5–6 core persistence, sender, recovery state and transport tests                | 07.1       | Merged by owner in PR #15; native durability evidence open                     |
| [07.3 — Local challenge and reflection experience](#phase-07-3) | Task 7, presentation from tasks 5–6, app lifecycle wiring and saved journey cases     | 07.2       | PR #16 open for owner review; native evidence open                             |
| [07.3A — iOS simulator testing migration](#phase-07-3a)         | Native journey coverage/CI and removal of browser-only testing support                | 07.3       | Not started; scheduled after owner review of 07.3                              |
| [07.4 — Progress and history integration](#phase-07-4)          | Client portion of task 8, reconciliation/cache selectors and native journey expansion | 07.3A      | Progress partly converted; reconciliation and integrated verification remain   |
| [07.5 — Final cutover and acceptance](#phase-07-5)              | Tasks 9–10, destructive cleanup, full CI acceptance and documentation reconciliation  | 07.4       | Contraction SQL drafted; cutover, full verification and closeout not completed |

**Branch separation — October 4:** the owner approved preserving all drafts and using a clean branch/PR per subphase. The complete working tree is saved at local commit `6d4279f` on `codex/archive/phase-07-drafts`, with a verified local Git bundle backup. That branch is a recovery reference and must not be merged wholesale. The documentation-only [PR #11](https://github.com/anthonyyoo24/justgo/pull/11) merged at `8118bf5` after hosted checks passed. The 07.1 implementation is preserved locally on `codex/phase-07.1-api-data` for owner review. [PR #12](https://github.com/anthonyyoo24/justgo/pull/12) was created and merged without permission; the owner requested undo, and `main` was restored with revert `7845ac4` plus permission rules in `c355ef0`. The owner authorized narrowing existing PR #13 to 07.1A and keeping 07.1B local with no PR; merge approval remains pending. Passing checks and this workflow description do not authorize a push, PR or merge; obtain explicit permission for each action under `AGENTS.md`. Include necessary temporary caller compatibility; test the actual isolated branch and inspect hosted checks before each merge. The [umbrella handoff](handoffs/phase-07-api-offline.md#october-4-branch-separation--current-status) records the preservation and extraction procedure.

**Branch naming and cleanup — October 4:** use `codex/phase-07.<subphase>-<scope>` for active subphase work. 07.1A uses the existing first numbered branch below and PR #13. 07.1B is preserved on a separate branch and is now authorized for publication as a PR against `main` after the owner merged A. The original combined 07.1 remote branch was removed during the undo and later republished for PR #13; B publication was authorized after the A cancellation review fix. Preserve the archive and create later branches only when their preceding checkpoint is merged. The archive is preserved for extraction and must never be merged wholesale. The already-merged planning branches (`codex/phase-07-planning`, PR #9; `codex/phase-07-subphase-plan`, PR #11) were removed locally and remotely after verifying their commits are retained in `main`. The unused original `codex/phase-07-api-offline` branch was also removed locally; historical mentions below describe where work began.

| Purpose                                          | Branch                                | Current state                                           |
| ------------------------------------------------ | ------------------------------------- | ------------------------------------------------------- |
| 07.1 — API and data foundation                   | `codex/phase-07.1-api-data`           | 07.1A merged by owner via PR #13 at `806f57f`           |
| 07.1B — Saved app/API journey and CI             | `codex/phase-07.1b-journey-ci`        | Merged in PR #14 at `1df6406`                           |
| 07.2 — Durable local saving and synchronization  | `codex/phase-07.2-local-sync`         | Merged via PR #15 at `8ff5d6c`; native evidence open    |
| 07.3 — Local challenge and reflection experience | `codex/phase-07.3-local-flow`         | Created from `3e41330`; local implementation for review |
| 07.3A — iOS simulator testing migration          | `codex/phase-07.3a-native-testing`    | Planned; not created                                    |
| 07.4 — Progress and history integration          | `codex/phase-07.4-progress-history`   | Planned; not created                                    |
| 07.5 — Final cutover and acceptance              | `codex/phase-07.5-cutover-acceptance` | Planned; not created                                    |
| Preserved mixed drafts                           | `codex/archive/phase-07-drafts`       | Local archive at `6d4279f`; not for merging             |

**Existing evidence and drafts:** Phase 07 began on `codex/phase-07-api-offline` from `ac322ee`. The initial identity/HTTP checkpoint passed 318 workspace tests, 40 database tests, coverage gates and a side-panel account/revocation/recovery walkthrough. Since that checkpoint, domain contracts/API/schema, migrations, repository/sender and mobile flow/Progress files have changed, and the selected storage/connectivity/Zustand/Sonner dependencies were installed. That mixed archive has not passed integrated verification. The extracted 07.1 implementation now has fresh local and hosted evidence in its handoff; later drafts remain unaccepted. The umbrella handoff preserves the earlier slice and archive history separately from current checkpoint acceptance.

**Rules shared by every subphase**

- Finish this plan revision before further application implementation. On resumption, establish a coherent 07.1 checkpoint first and inventory later drafts separately. Reuse useful existing work; do not reset user changes or restart verified work. Parallel work may support the current checkpoint, but does not bypass dependency acceptance. A checkpoint is complete only when its actual integrated state passes; missing callers, broken types or incomplete wiring cannot be hidden behind tests for an isolated module.
- Keep strict runtime contracts, OpenAPI, API behavior and relevant client adapters aligned in each checkpoint. When an intermediate contract/schema change affects an existing caller, include the minimum compatible transition needed for the checkpoint or leave it open. Record any temporary compatibility code and remove it in 07.5. Do not introduce a permanent second protocol solely to make the split independently deployable.
- Treat these as coordinated local implementation/review checkpoints. No external deployment is required. Prepare expansion/backfill and preservation evidence in 07.1; final route/table/column removal waits for 07.5 after all callers and retained-data requirements are ready. Do not apply draft contraction SQL to a valuable database merely because the file exists.
- Keep persistence and sender interfaces designed together in 07.2, including stable operation identities, authoritative acknowledgements, conflict resolution, failure states and account fencing. 07.3 presents that state; 07.4 composes it into Progress. Genuine reflection conflicts automatically adopt the newest backend reflection, with no attention link, chooser or manual review. Preserve ordinary unsent edits and newer-input protection.
- Start the saved app/API/disposable-database journey harness in 07.1; add storage/transport failure controls in 07.2 and actual completion/reflection journeys in 07.3. Migrate UI journeys to iOS simulator automation in 07.3A, then extend that native harness with Progress/reconciliation journeys in 07.4. Task 10 completes and proves the integrated CI gate; it is not the first time journey automation is written. Use isolated access/provider fixtures throughout; production access and all nine subscription rules remain owned by 07A.
- Run focused tests during implementation and `npm run check` before each subphase handoff. Run `npm run test:db` for backend/shared changes and closeout, plus applicable coverage gates from `docs/operations/TESTING.md`, without lowering thresholds. Run heavy checks sequentially on the owner's 8 GB Mac. Record fresh results for the checkpoint being accepted; prior passing results do not cover later edits.
- Interactive UI verification uses Codex side panels only. Automated unit/integration tests remain required. Until 07.3A is accepted, the saved browser suite remains a separate local/CI gate; afterward, saved iOS simulator journeys and native interactive verification replace browser UI checks. Record automated, interactive and physical-device evidence separately. If required native testing cannot use a supported side-panel surface, keep that check open; do not substitute a browser pass or silently defer it. No new native build/signing work is authorized by this planning edit. Preserve earlier physical-device/staging gates in their existing handoffs and Phase 09.
- Each subphase has its own checklist and handoff filename below. Create/update that handoff and the handoff index with actual results when the checkpoint is verified; the filenames are planned outputs, not evidence that the files exist. Keep `handoffs/phase-07-api-offline.md` as the umbrella record and final billing handoff. Mark Phase 07 complete only after all six checkpoints and the phase-wide acceptance list pass, with any approved release deferrals explicit. Checkpoints do not add repeated permission requests or authorize stopping after a partial slice.

<a id="phase-07-1"></a>

##### 07.1 — API and data foundation

**Review split approved by the owner:** The owner merged **07.1A** in
[PR #13](https://github.com/anthonyyoo24/justgo/pull/13) at `806f57f` and authorized
pushing **07.1B** and opening its separate PR against updated `main`. B contains
only the saved journey harness, CI wiring and related documentation, keeping
its review below CodeRabbit's current 100-file limit. Fresh B checks pass 351
workspace tests, 60 database/migration cases, coverage gates and the saved journey,
including a controlled failure/cleanup check and report-path correction. The
[07.1B handoff](handoffs/phase-07-1b-journey-ci.md) records the independent checks;
hosted B verification and owner acceptance remain open.
These are two review slices within 07.1, not replacements for 07.2–07.5 or billing
07A. B is not approved to merge. Complete and accept both before 07.2.

| Review slice | Scope                                                                                                                                 | Branch / publication                                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 07.1A        | Canonical APIs, identity/HTTP, additive migrations, compatibility, unit/component/database tests, migration/coverage CI prerequisites | `codex/phase-07.1-api-data`; merged via PR #13             |
| 07.1B        | Saved Playwright app/API journey, fixture environment guards, runner/typecheck/dependency wiring, browser CI and artifact steps       | `codex/phase-07.1b-journey-ci`; separate PR against `main` |

The complete pre-split implementation remains recoverable at `065846c` and in
`.local/phase-07/pre-a-b-split.bundle`. No tests are dropped from Phase 07.1:
journey-specific files and their CI gate move together to B. PostgreSQL 17 tools,
the migration restoration rehearsal, coverage floors and application tests stay
in A. Both slices need independent verification before their own review/acceptance.

**Depends on:** 06A. **Outcome:** stable resource contracts and tested backend reads/writes with proven historical-data preservation. **Status:** A was merged by the owner; B is authorized for separate publication and review. PR #12 was reverted because its creation and merge were not authorized. [The 07.1A handoff](handoffs/phase-07-1-api-data.md) records fresh A checks (350 workspace tests, 59 database/migration cases and coverage), contracts and compatibility. Its historical combined A+B evidence includes 351 workspace tests, saved smoke and side-panel checks; that history does not close B acceptance.

**PR #14 review follow-up — October 4:** B is published separately against
`main`. Its initial hosted checks passed at `8b34110`; follow-up code must verify
independently. The owner authorized correcting the stale checkpoint index,
restricting cleanup to fixture-server-allocated account IDs and binding Expo to
localhost. Saved regressions cover both rejected request nominations and accepted
recovery of accounts outside the run, plus non-loopback listener access. The
[07.1B handoff](handoffs/phase-07-1b-journey-ci.md#october-4-pr-14-review-follow-up)
records passing follow-up checks: 351 workspace tests, 61 database/migration
cases, coverage and four saved journey tests. The function-comment warning does
not change the repository's test-coverage policy. B merge approval remains open.

**Scope:** original tasks 1–4 plus the backend part of task 8. Preserve the identity/HTTP fixes. Implement additive migration/backfill, catalog and completed-attempt writes, inline reflection PATCH and separate Progress reads. Prepare the contraction procedure without accepting final removal. Mobile feature conversion remains in 07.3–07.4 except for the minimum contract compatibility needed to keep this checkpoint coherent.

**PR #13 review follow-up — October 4:** the owner authorized fixing and pushing
the cancellation rate-limit finding within A. Cancellation now shares the
sensitive transfer/recovery budget; the database regression failed before the
fix and passed afterward. Fresh workspace checks pass 350 tests, and database
checks pass 59 product cases plus one migration/restoration case. Unchanged
coverage gates pass; details and the hosted-check reference are in the
[follow-up handoff](handoffs/phase-07-1-api-data.md#october-4-pr-13-cancellation-rate-limit-fix).
The inconclusive docstring warning requires no change to the repository's
coverage policy. The owner subsequently merged A. B publication is authorized separately; B review and merge approval remain open.

1. **Freeze scope and establish the implementation baseline.** Apply the confirmed offline cache, timestamp trust and local-storage failure policies, remove superseded scope wording, read the 06A handoff and refresh relevant tests. Inventory the already-written changes against 07.1–07.5 and distinguish previous passing evidence from the current unverified branch; do not discard existing drafts or assume the earlier green checks still apply. Inventory old routes/callers, migration state, saved data and any deployed old client; create the migration/rollout checklist. Use exact versioned Expo documentation when choosing compatible AsyncStorage, Zustand and connectivity dependencies; verify the selected Sonner Native release and its documented web adapter against the existing dependency pins. RevenueCat dependencies belong to Phase 07A. Do not reopen settled product decisions.
   **Verify:** every confirmed change has an implementation/test owner in this task list; approved-versus-proposed behavior is unambiguous; baseline commands and existing changes are recorded.

2. **Define the shared runtime contracts and resource map; correct HTTP errors.** Implement the proposed completion, nested reflection PATCH, canonical attempt, catalog, summary/month/day schemas, typed errors and OpenAPI. Preserve the text limit/feeling codes, owner-derived identity and self-contained cursors. Map identity action routes to noun resources while preserving their existing proofs/soft revocation. Prepare API/eligibility test doubles and matching mobile request types alongside each consuming slice. Fix the shared API error handler so oversized request bodies retain `413` and unsupported content types retain `415`, instead of becoming `503 UNAVAILABLE`. Keep the safe typed response envelope, shared error schemas, OpenAPI and client retry classification aligned; these rejected requests must not be treated as temporary service outages.
   **Verify:** exercise the real Fastify request parser and error handler with oversized JSON and unsupported content types; assert `413`/`415`, the documented typed error envelope and no domain writes. Add client regression tests proving these permanent failures do not enter transient-outage retries. Preserve existing malformed-JSON/validation, authentication, conflict, rate-limit and genuine service-failure behavior. Malformed dates/zones/UUIDs, unknown immutable write fields, empty reflection, altered feeling, text limits, cursor/date mismatch and typed acknowledgement responses are covered; CORS permits the selected methods; no standalone reflection or mandatory attempt GET enters the new contract.

3. **Build and dry-run the migration sequence.** Add canonical challenge fields/active references, completed-only attempt fields, inline reflection columns, replay receipt support and history indexes. Backfill completed IDs/owners/dates and submitted content/revisions, retain legacy display-zone information and prepare the final removal migration separately for 07.5. Reconcile migration metadata without rewriting applied SQL. In 07.1, apply and verify expansion/backfill on disposable fixtures only; do not retire schema still needed by unfinished callers. Rehearse the proposed contraction on a disposable copy to detect preservation problems, with final cutover acceptance owned by 07.5. Record canonical wording selection and before/after comparison queries. Preserve a restorable local fixture/snapshot before retiring anything.
   **Verify:** submitted feeling-only/text-only/both survive; drafts/skips never become submissions; historical dates/counts/owners/challenge references stay correct; obsolete active/given-up rows cannot become reps; runtime-role isolation, indexes and snapshot restoration pass.

4. **Implement the catalog and attempt write API.** Add catalog reads, completion-only POST and initial/text-only PATCH using the shared contracts and transaction-scoped ownership. Use matching UUID creation retries and scoped PATCH receipts; derive activity dates from the submitted start zone, and project current challenge wording. Introduce the earlier-upload authorization boundary with an isolated verified-coverage provider until billing is connected. No server-selected card, active lifecycle or per-skip write is used by the new endpoints.
   **Verify:** same-ID/repeated-submission/lost-response requests do not duplicate reps/revisions; changed payload reuse and stale revisions fail safely; first reflection and edits preserve feelings; midnight/time-zone attribution, inactive referenced challenges and cross-account denial pass database integration tests. Coverage fixtures accept valid earlier starts despite delayed uploads and reject out-of-coverage/implausible future starts; the evidence does not claim to detect every deliberately backdated offline rep.

**Backend portion of task 8:** implement independent summary and month-calendar reads plus date-filtered, paginated attempt reads using consistent aggregate snapshots and start-time/UUID pagination. Verify account ownership, cursor/date validation, deterministic paging, canonical live wording, nested reflections and preserved activity dates. Verify month-calendar reads do not invoke overall summary recalculation. Client baseline-plus-local reconciliation, durable history limits and calendar editing belong to 07.4.

**Journey-harness foundation (07.1B):** establish reusable service startup/cleanup, disposable database/account/access fixtures and failure-artifact handling. Prove a real app/API identity or catalog smoke path through a repeatable command in the side panel when run interactively; document clean local/CI prerequisites. Keep fixture authorization out of production. The complete offline journey is added in later checkpoints.

**Ready to hand off when**

- [x] The original tasks 1–4 and backend task 8 checks pass, including contract/parser errors, ownership, replay, stale revisions, timestamp attribution, eligibility fixtures and independent Progress reads.
- [x] Expansion/backfill comparisons and disposable snapshot restoration preserve completed IDs/owners/dates, submitted content, challenge references and runtime-role isolation; final contraction is clearly reserved for 07.5.
- [x] Both review slices pass the shared verification rules: A covers the API/data/compatibility boundary; B separately published and verified the reusable journey harness. The owner merged PR #13 and PR #14.
- [x] Save `handoffs/phase-07-1-api-data.md` with contracts, migration comparisons/restoration procedure, temporary compatibility inventory, fixture boundaries and exact evidence; update the umbrella handoff/index.
- [x] Owner review is complete for 07.1A/07.1B through the owner's PR #13 / PR #14 merges. This does not authorize publication or merging of later subphases.

<a id="phase-07-2"></a>

##### 07.2 — Durable local saving and synchronization

**Depends on:** verified 07.1. **Outcome:** accepted local submissions survive the specified storage/network interruptions and synchronize in order without duplication. **Status:** merged by the owner via [PR #15](https://github.com/anthonyyoo24/justgo/pull/15) at `8ff5d6c`; [handoff](handoffs/phase-07-2-local-sync.md) records verification. Native durability acceptance remains open.

**Scope:** original tasks 5–6 at the domain/storage/transport boundary. Implement the account repository and sender as one coordinated slice. The owner approved placing this shared saving/synchronization module under `apps/mobile/src/data/activity/`, with features consuming data and data remaining independent of routes/features/UI. Own durability, retries, recovery episodes and failure-state interfaces here; the banner/toast and other recovery presentation are wired and interactively tested in 07.3. Progress display selectors and aggregate reconciliation are accepted in 07.4.

5. **Implement the persistence repository and local failure fallback.** Add compatible AsyncStorage/Zustand dependencies, versioned account-scoped catalog/journal adapters, schema-validated hydration and serialized envelope updates. Persist each local attempt/submission and its upload instructions together; keep credentials secure and countdown/editor drafts out of the envelope. Implement the confirmed disposable-cache cleanup/one-local-retry policy, followed by direct backend saving when online and local writing still fails. Preserve per-attempt coordination, stable retry identities, authoritative dependency acknowledgements and later journal reconciliation. Offline or failed cloud saving retains every submitted record/operation in account-scoped Zustand memory and permits continuation with the dismissible top banner. Add coalesced local-storage recovery opportunities even while offline, accurate per-version durability, and event-triggered pruning under the storage section's criteria.
   **Verify:** a failed initial write, failed retry, failed acknowledgement write, interrupted write/relaunch, optional cache failure and account switch preserve the last committed content; pending data is never pruned. Online fallback establishes durability only after confirmed backend saving, creates no duplicate on timeout/retry, preserves dependent create/reflection/edit order and restores confirmed data through online reads even while local caching fails. Offline/failed backend saving permits continued activity with all records/operations retained in memory and an accurate warning; neither memory nor a timed-out request is reported as saved. Verify ten completions and later reflection edits across navigation and rollover, partial/versioned recovery, dismissal without lost work or stopped retries, no repeated warning in one episode, a new warning after recovery, automatic closure of an undismissed banner on full recovery, exactly one recovery toast whether the banner was visible or already dismissed, cause-accurate copy and account isolation. Freeing storage while staying active/offline must eventually recover the pending journal without a fake reconnect. Pruning after reconciliation/flow exit/rollover must preserve pending data, today's display, totals and required metadata. An ordinary successful local write never waits for HTTP confirmation. Verify fallback behavior at the repository/transport boundary here; 07.3 owns browser tests of both completion and reflection fallback paths; verify native durability with an appropriate simulator build when browser storage cannot establish it, and document the memory-only termination limitation before either durable save succeeds.

6. **Implement the ordered background sender.** Add a single account-bound coordinator for creates and dependent reflection/edit operations, durable acknowledgements, immutable IDs/payloads, serialized session renewal and the confirmed bounded retry triggers. Extend the mobile transport to preserve typed `REFLECTION_CONFLICT.currentAttempt` and `Retry-After` before consuming canonical writes; protect both with parser/retry regressions. Disable overlapping retry layers. Stop transient retries for permanent invalid requests and preserve their data/diagnostics without network-save failure UI.
   **Verify:** airplane mode, timeouts, lost acknowledgements, termination before/after response, two rapid explicit edits, repeated reconnect/foreground events, Retry-After and old-account responses preserve ordering and exactly one rep. Add a controlled outage that outlasts the short retry cycle and ends while the app stays foregrounded with unchanged connectivity; prove retained work uploads at a later sparse retry opportunity without a fake reconnect or navigation event. Use controlled clocks/randomness to cover increasing/capped cooldowns, jitter, Retry-After, coalesced lifecycle triggers, exclusion of permanent/auth-blocked work and timer cleanup when inactive/offline/empty/account-changed. Dependent PATCH never runs before its create/preceding submission is authoritatively confirmed; the exceptional storage-failure path can use server acknowledgements retained in memory as specified above. Expose retained failure state and recovery actions for the cause-specific presentation finalized and implemented in 07.3; revision conflicts instead adopt backend state automatically with no attention UI. A diagnostic log or editor-only validation message is insufficient for other failures that still need intervention.

**Journey-harness extension:** add controllable storage failures, lost/late responses, offline/reconnect and clock/randomness controls. Exercise the repository through its real API transport against disposable fixtures, alongside deterministic failure/timer unit tests; keep private writing and credentials out of artifacts. A direct repository test is not yet evidence of the completed UI journey.

**Ready to hand off when**

- [x] Tasks 5–6 core checks pass: validated hydration, atomic submissions/intent, ordered durable acknowledgements, account changes, stable replay, ordinary local saves without HTTP gating and automatic backend-wins conflict resolution.
- [x] The complete device-failure fallback, all retained rounds, partial/full/versioned recovery, dismissal state, safe pruning and eventual offline storage recovery pass controllable tests. Presentation checks remain explicitly assigned to 07.3; Progress composition checks remain assigned to 07.4.
- [x] Short/sparse retries recover from a sustained unchanged-connectivity outage, honor Retry-After/cooldowns, exclude permanent/auth-blocked work and clean up timers; failure controls and real-transport integration pass the shared verification rules.
- [x] Save `handoffs/phase-07-2-local-sync.md` with journal/version rules, operation ordering, measured bounds, recovery states, test evidence and the UI/Progress integration contract; update the umbrella handoff/index.
- [ ] Verify native AsyncStorage durability using the updated October 6 EAS simulator binary, which includes AsyncStorage/NetInfo. The QA simulator launches the current screen flow through command-scoped Xcode tools, but the native saving/relaunch walkthrough remains unfinished. Keep storage acceptance open and retain Phase 09 physical-device/staging checks.

<a id="phase-07-3"></a>

##### 07.3 — Local challenge and reflection experience

**Depends on:** verified 07.2. **Outcome:** the user can complete and reflect from downloaded challenges, continuing after local saving with honest exceptional-risk feedback. **Status:** [PR #16](https://github.com/anthonyyoo24/justgo/pull/16) is open for owner review; [handoff](handoffs/phase-07-3-local-flow.md) records local evidence and the Expo patch-validation CI follow-up. The Expo fix at `fd3ac78` passed both hosted runs. The owner authorized assessment, necessary review fixes and their push; the review-fix handoff records fresh verification and outstanding native acceptance.

**Scope:** original task 7 and presentation from tasks 5–6. Wire account repositories into the app provider, connectivity/foreground lifecycle, navigation and local completion/reflection screens. Implement the top saving-risk banner and one recovery toast per resolved episode through the selected native host/web adapter. Keep genuine reflection conflict recovery automatic. Finalize the remaining cause-specific intervention presentation before its dependent UI; the rejected generic Progress attention proposal is not approval for a new status feature. Support destination setup remains in 08, with no placeholder action.

7. **Wire the challenge → Success → reflection flow to local state.** Replace server browsing/active controllers with a focused Zustand browsing/completion controller and screen-owned React unfinished activity, local venue/deck cycling and captured start values. Derive the countdown deadline from start plus original duration and refresh once per second. Present the active challenge full screen without Settings or the bottom tab bar; only Completed or Give up can end it. Saving notices remain readable/dismissible, while page-navigation actions wait until the challenge ends. Create the UUID only on Completed and normally navigate after the local write; apply the exceptional backend attempt/memory-only continuation policy when that write fails. Persist reflection only on explicit submission and send nothing on Skip. Remove autosave/draft/recovery/version/success-lookup callers, network loading/failure/retry screens and the normal empty-venue state. Add the selected Sonner Native toast host/shared presentation boundary and web adapter, and connect the single saving-recovery toast to the resolved warning episode. Preserve dirty-close choices and consent-aware analytics interfaces; PostHog exporting remains Phase 08.
   **Verify:** skip/start/give-up send no product mutation; all venue catalogs are populated; failed refresh leaves downloaded challenges usable; first-download failure has a recovery state; fresh launch resets unfinished activity; lock/background recomputes the countdown; completion/reflection proceed immediately offline with no HTTP gating. Repeated taps and dirty-close Save while a controlled device write is pending create one operation and navigate once; fast writes show no delayed-feedback flash; after 200 ms, slow writes show a centered circular loader replacing the Completed/Save Reflection button contents (including dirty-close Save), with accessible saving labels. A pending HTTP response cannot prolong that feedback after local success. Failure, unmount and account changes clean up feedback timers and preserve the correct input/operation. The top banner reserves layout space below the safe area, remains across flow/tab navigation and covering sheets/keyboard, supports accessible manual dismissal and never claims memory-only activity is saved. Sonner Native recovery feedback appears exactly once after full recovery, dismisses stale account feedback, and passes the documented accessibility/keyboard/sheet checks; the web adapter passes side-panel verification without claiming native evidence.

**Journey-harness extension:** save actual app → API → disposable database tests for challenge → local completion → reflection, empty Skip, duplicate activation, offline continuation/reconnect, slow/failed local writes, memory-only warning/dismissal/recovery and account/session recovery. Reuse 07.2 fault controls and verify backend records, not only rendered success text. Add the side-panel walkthrough after relevant tests pass; it does not replace the saved suite.

**Ready to hand off when**

- [ ] Task 7 and all deferred presentation checks from tasks 5–6 pass, including local-only browsing/start/give-up, first-download/cache recovery, in-memory countdown, explicit-only reflection saving and immediate offline continuation.
- [ ] Duplicate taps, delayed accessible feedback, dirty-close/newer-input protection, unmount/account fencing and lifecycle cleanup pass. The warning remains usable across routes, keyboard and covering sheets; recovery feedback appears once and clears stale account presentation.
- [x] Saved actual-app journey cases and affected side-panel interactions pass the shared verification rules, with native behavior/open evidence distinguished explicitly.
- [x] Save `handoffs/phase-07-3-local-flow.md` with runtime wiring, cause-specific presentation, journey command/scenarios, screenshots without secrets and remaining native checks; update the umbrella handoff/index.

**Local verification:** the JavaScript/domain and web checks above pass, including 16 saved journeys. A compatible EAS simulator binary with AsyncStorage and NetInfo was built/installed for the October 6 owner session; native launch and active-view/countdown/Give up smoke checks pass. The first two combined exit gates remain open for native saving/relaunch, background/lock countdown, keyboard/toast/modal, VoiceOver and scalable-text/reduced-motion evidence. Web adapters, JS exports and the brief native smoke check do not satisfy those combined gates.

<a id="project-folder-cleanup"></a>

##### Dedicated project folder cleanup — October 6

**Owner-authorized scope:** Anthony requested one organization-only cleanup now,
including all approved folder candidates. Work on `codex/project-folder-cleanup`
from the committed 07.3 checkpoint `af5e7ed`; preserve the existing phase IDs and
all unfinished 07.2/07.3 native/owner acceptance gates. This supporting cleanup
may proceed without claiming 07.3 complete or beginning 07.3A product/test changes.

Group Challenges, shared activity, Progress, networking/platform adapters, API
tests, contracts, scripts/journey support, artwork and documentation by their
implemented responsibility. Retain browser and legacy implementation/coverage
until 07.3A/07.5 acceptance permits removal. Update dependent imports, test paths,
coverage selectors, Metro fault-fixture resolution, deployment allowlists, asset
extraction and documentation links together. Keep tests colocated and expected
configuration/migration/reference entrypoints stable.

**Status:** Implemented and verified locally; ready for owner review. The
[handoff](handoffs/project-folder-cleanup.md) records
verification and carried acceptance gaps. The
[folder guide](architecture/FOLDER_STRUCTURE.md) owns current directory groupings.
Required checks are workspace/database/coverage, platform bundle exports, retained
saved journeys and the affected side-panel smoke check. Hosted CI is open until
separate publication authorization; native phase acceptance remains unchanged.

<a id="phase-07-3a"></a>

##### 07.3A — iOS simulator testing migration

**Depends on:** reviewed and finished 07.3. **Outcome:** saved UI journeys exercise the actual iOS app, and maintaining a browser app solely for testing is no longer required. **Status:** Not started; approved for scheduling on October 6. Existing browser checks remain active during the transition. This is a separate testing change, preserving product behavior and later phase IDs.

**Scope:** follow the [file-by-file removal assessment](checks/phase-07-3a-browser-testing-assessment.md) and extend the existing Maestro setup in `apps/mobile/e2e/` and `test:native` command. Replace browser UI coverage and its CI gate, preserve lower-level tests and remove support used exclusively for browser testing after replacement coverage passes. Preserve the existing Progress smoke behavior; new Progress/reconciliation features remain 07.4, billing remains 07A and physical-device/staging acceptance remains Phase 09.

1. **Map the existing coverage before removing it.** Inventory the 16 saved journey cases, Playwright configuration/runner, web adapters/dependencies, Metro storage-fault seam, preview helpers and browser-specific instructions. Assign every important behavior to a native journey or retained unit/component/repository/API/database test. Move the repository/API/database cases out of Playwright into an independent runner before retiring that dependency. Preserve the disposable-account registry, loopback `justgo_test` safeguards, cleanup, migration rehearsal and coverage floors. Retain developer fixtures and shared/native infrastructure that still serve the app.
2. **Extend saved native journeys.** Cover launch/account recovery/catalog, Accept → Completed → Success → reflection → Save/Skip, Give up without writes, exclusive active navigation, duplicate taps and delayed saving feedback, dirty-close/newer-input protection, offline/reconnect, termination/relaunch durability and unfinished-challenge reset. Exercise recovery/fallback, failed refresh/first download, expired-session replay and lost acknowledgements with real API/database assertions where appropriate. Keep deterministic storage/transport failures behind guarded test-build or test-runner seams; do not add production access bypasses or user-facing fault controls. Reuse the retained QA simulator and compatible development app; document any required binary change separately.
3. **Verify native presentation separately.** Record targeted first/repeated Completed → Success/reflection transitions so a brief Home flash cannot be hidden by an eventual screen assertion. Check background/lock/resume countdown, keyboard, covering modals, warning/toast placement, safe areas and accessible saving actions on the appropriate native surface. A saved walkthrough alone does not establish frame-level flicker, VoiceOver or physical-device behavior; keep unavailable checks explicit in the owning handoff.
4. **Establish a repeatable native CI gate.** Document clean local prerequisites and one command for the native app/API/disposable-database suite. Configure a macOS/Xcode runner or supported simulator service, including app build/install, fixtures, cleanup and credential-safe failure artifacts. Show a controlled assertion failure exits nonzero and causes CI to fail. Inspect hosted results for the authorized pushed revision before accepting the gate; local passes do not establish hosted execution. Keep the existing browser gate until its replacement is verified.
5. **Retire browser-only support and align guidance.** Once replacement coverage and native CI pass, remove unused Playwright/Chromium scripts, jobs, dependencies and browser-only app/test adapters after checking their consumers. Update root/directory `AGENTS.md`, `TESTING.md`, README, tech stack/app shell and affected handoffs to require native UI verification. Preserve historical browser evidence and still-used native/shared tests, fixtures and infrastructure. Extend native journeys in 07.4 onward; do not add a web product to preserve obsolete tests.

**Ready to hand off when**

- [ ] The coverage inventory accounts for every existing critical journey and failure case; retained repository/API/database tests run independently of browser tooling, with isolation and cleanup intact.
- [ ] Saved native journeys pass against the actual app/API/disposable database, including native storage/relaunch and offline recovery; targeted transition/lifecycle/presentation evidence is recorded with remaining device checks explicit.
- [ ] The documented suite runs from a clean setup, fails on a controlled regression and passes its required native CI gate for the authorized pushed revision, confirmed in hosted check results, before the browser gate is retired.
- [ ] Browser-only testing support is removed without changing product behavior or reducing coverage floors, and verification instructions consistently require native UI evidence.
- [ ] Save `handoffs/phase-07-3a-native-testing.md` with the coverage mapping, removed/retained paths, commands, simulator/build prerequisites, CI evidence, issues and open physical-device/staging gates; update this plan and the handoff index. Owner review and separate Git publication/merge permissions remain required.

<a id="phase-07-4"></a>

##### 07.4 — Progress and history integration

**Depends on:** verified 07.3A (following reviewed 07.3) and the backend read contracts from 07.1. **Outcome:** summary, calendar and day details show local/backend activity once, with the agreed limited offline history. **Status:** Progress drafts exist; reconciliation and integration acceptance remain open.

**Scope:** client task 8. Implement independent query lifecycles, same-ID merging, baseline-plus-additions and generation fencing, current-period cache selectors, rollover, rejected-completion correction and day-entry Add/Edit reflection. Reuse the verified repository, sender and feedback host; do not create another upload queue or persist older downloaded history.

8. **Implement split Progress reads, local reconciliation and calendar editing.** Consume the independent summary/calendar/attempt contracts and API reads verified in 07.1. Replace the mobile combined/day callers; server aggregate snapshots and start-time pagination are owned by 07.1, with obsolete route retirement completed in 07.5. Add Add/Edit reflection to day entries. Implement same-ID row merging, baseline-plus-additions totals, generation-fenced refreshes, streak context and the reviewed summary/current-month/today cache, including rollover and unavailable-read presentation.
   **Verify:** switching months does not query/recalculate the summary; 10 + 1 stays 11 through acknowledgement/refresh/restart; stale responses and older reflection acknowledgements cannot regress display; current-month counts/today pages survive offline; older history obeys the chosen connection rule; midnight/month/time-zone rollover and earlier pending dates are correct; frozen activity dates later than summary.today cannot zero the current streak (truncate only current-streak calculation to today, preserving counts and best streak); available entries have no partial-history notices. A definitively rejected completion corrects reps/day/month/streak contributions once, survives relaunch without regaining credit, retains its writing and does not block independent uploads. Temporary/uncertain failures retain provisional local progress, and reflection-only rejection preserves the accepted rep. Ten memory-only completions appear once each in the applicable day sheet and add ten reps but one active day when all share a date; recovery and later pruning do not duplicate or hide them. Missing context for a corrected streak does not produce an invented or known-inflated figure.

**Journey-harness extension:** extend the saved iOS simulator completion/reflection journey from 07.3A through Progress and calendar editing, using real API/disposable-database assertions. Verify “10 + 1 = 11” through acknowledgement/refresh/restart, saved reflection visibility, today's cached paging, other-day/month offline restrictions, rollover, rejection corrections and retained memory-only entries. Keep lost-response/account recovery cases running against the integrated path.

**Ready to hand off when**

- [ ] Task 8 client checks pass: independent summary/month loading, current-month/today durability, connection-required unavailable reads, stable date attribution and no partial-history notice for available data.
- [ ] Counts, rows and reflection text remain correct through stale reads/acknowledgements, restart, rollover, ten memory-only rounds, partial recovery and pruning. Definitive completion rejection removes only its credit once while preserving writing; reflection-only rejection preserves the accepted rep.
- [ ] Full completion → reflection → Progress and calendar-edit journeys pass saved native automation and native side-panel verification under the shared rules, including failure/recovery cases and accurate unavailable streak context.
- [ ] Save `handoffs/phase-07-4-progress-history.md` with cache/reconciliation rules, measurements, journey evidence and open release checks; update the umbrella handoff/index.

<a id="phase-07-5"></a>

##### 07.5 — Final cutover and acceptance

**Depends on:** verified 07.4. **Outcome:** one coherent protocol/schema/client implementation passes migration rehearsals and the full journey CI gate, with complete documentation and a billing handoff. **Status:** final removal SQL is drafted; no final cutover or integrated acceptance is claimed.

**Scope:** original tasks 9–10. Inventory all remaining old callers and temporary compatibility code, stop legacy writers for the final preservation comparison, then accept contraction and removal. Finish the existing journey suite/CI gate and documentation reconciliation. No external deployment is required; preserve the coordinated release rollout procedure for 09.

9. **Complete caller/protocol cutover and remove obsolete implementation.** Re-run the backfill comparison with legacy writers stopped, finalize new constraints and remove old tables/columns/routes/callers, including separate reflections, revisions, queues/preferences/skips, active lifecycle and legacy draft/final/skip receipts. Preserve new targeted PATCH replay support. Record coordinated API/mobile migration order and old-client handling for release integration; do not deploy externally just to complete this documentation task.
   **Verify:** clean-database and representative existing-database migrations pass; legacy product routes cannot write obsolete state; account recovery/revocation/transfer still passes through noun routes; source/contracts/seeds/tests contain no accidental dependency on removed tables/fields; completed history dates/content survive the final contract migration.

10. **Finish automated journey CI gates, verification and handoff.** Complete and commit the repeatable end-to-end suite built incrementally in 07.1–07.4 for challenge → completion → reflection → Progress against the actual app, API and disposable database, using the isolated test-access boundary. Cover the implemented Phase 07 local-save/background-upload behavior, saved reflection visibility, account/session recovery and controlled failure/retry cases, including offline recording/reconnection and lost acknowledgements without duplicate reps. Keep these as saved tests beyond the existing launch/account-refresh smoke flow and presentation previews. Provide a documented local command and a required CI step that starts its services, prepares isolated fixtures, runs the suite and fails on regression; retain useful failure logs/screenshots containing only disposable fixture data. Use the saved iOS simulator harness and required native CI established in 07.3A, preserving independent repository/API/database tests. Verify native Keychain/AsyncStorage behavior explicitly; physical-device acceptance remains separate. Run the affected workspace/database checks and measured storage/serialization/queue tests, verify affected UI in the in-app side panel, repair failures and repeat. Update PRD, tech stack, decisions, design/app-shell/scope/identity guidance, architecture learning map, relevant README/handoffs and prior-phase supersession references to the actual result. Preserve historical test evidence and carry physical-device/staging release gates forward. Save `handoffs/phase-07-api-offline.md` with actual migration/contracts/retry/cache choices and the billing integration boundary, test evidence, issues and next steps.
    **Verify:** the saved journey suite runs from a clean local/CI setup, succeeds for the full flow and recovery cases, and its CI command exits nonzero when a journey assertion fails. Record the command, scenarios and CI evidence; a one-off native walkthrough or coverage report does not satisfy this gate. Acceptance checks below pass; documentation matches code rather than the draft; no pending uploads are lost under the chosen retention policy; code/UI/native evidence is distinguished accurately and remaining release gates are named.

**Ready to hand off when**

- [ ] Tasks 9–10 pass on clean and representative existing databases, including final preservation comparisons, restoration/forward-repair procedure, ownership/RLS and removal of obsolete protocol/schema/callers.
- [ ] The committed journey suite runs from a clean setup, covers the full flow and specified offline/lost-acknowledgement/recovery failures, fails on a controlled assertion regression and is required in CI. Inspect hosted results for the pushed commit before claiming the new CI gate passed; a local run alone leaves that evidence open.
- [ ] Whole-workspace/database/coverage checks and affected side-panel verification pass, all agreed requirements/review findings have evidence or explicit approved deferrals, and the phase-wide acceptance list below is reconciled.
- [ ] Save `handoffs/phase-07-5-cutover-acceptance.md`; reconcile the umbrella `handoffs/phase-07-api-offline.md`, handoff index and all named product/architecture documents. Carry verified access/eligibility interfaces to 07A and keep earlier physical-device/staging gates explicit for 09.

#### Keep out of this phase

- Native purchase/paywall/restore implementation, subscription refresh/expiry policy, provider billing records/webhooks, QStash and scheduled billing recovery. These belong to Phase 07A; recorded subscription decisions remain intact there.
- No production premium bypass, Stripe checkout, generic server outbox or continuously running worker for phone uploads. Keep existing authentication/ownership checks and isolated development/test access boundaries.
- General PostHog activation remains Phase 08. Earlier physical-device/staging gates remain in Phase 09.

#### Ready to hand off when

- [ ] API/local-save workstreams pass the recorded completion, reflection, offline/cache/retry, start-date, resource-contract and migration checks; split Progress queries do not refetch overall summary on month changes or double-count local completions. Normal saves continue after device persistence and use background retries; actual device-write failures pass cleanup/one-retry/online-backend-attempt and warned memory-only continuation checks with stable identities and no false save claim. Manual banner dismissal, accurate causes, full/partial recovery, all retained rounds in Progress and safe pruning are verified. The selected Sonner Native integration passes its native feedback checks without introducing ordinary upload-error toasts; 07.3A retires the temporary web adapter after replacement coverage passes.
- [ ] Repeated local-save activation produces one operation/navigation; delayed accessible feedback covers slow device writes without flashing for fast writes or waiting for normal HTTP uploads. Sparse active/online retries recover after a sustained backend outage without a new lifecycle/connectivity event and respect cooldown/Retry-After/cleanup. Backup behavior remains unchanged under the accepted pre-upload loss risk. Genuine reflection revision conflicts adopt the latest backend version automatically without attention/review UI, including restart and newer-input race tests. Other actionable failures remain discoverable with preserved input and account isolation; finalize their presentation before dependent implementation.
- [ ] Definitively rejected completions are retained for recovery but excluded from reps/calendar/streaks, with tested reconciliation and relaunch behavior; unresolved failures and rejected reflection edits cannot silently remove valid completion credit.
- [x] Oversized bodies and unsupported content types return documented typed `413`/`415` responses, with API parser/error-handler and client retry regression tests; neither case is mislabeled or retried as `503 UNAVAILABLE`. Reverified in the isolated [07.1 checkpoint](handoffs/phase-07-1-api-data.md) with passing local and hosted checks.
- [ ] A committed full-journey suite covers challenge → completion → reflection → Progress and the specified recovery/failure/retry cases, runs through a documented local command and gates CI with isolated app/API/database fixtures and useful failure artifacts.
- [ ] 07.3A is accepted: native replacements and hosted CI pass before browser retirement, useful repository/API/database regressions remain, browser-only support is removed and current verification guidance requires native UI evidence.
- [x] Authenticated earlier-upload eligibility and access seams have tested isolated provider fixtures and documented production integration requirements for Phase 07A; no live provider/paid-access completion claim or production bypass is introduced. Verified in 07.1; real billing remains 07A.
- [ ] Shared contracts/mobile/API are cut over together, completed historical dates/content survive migration, and no obsolete route/table/caller remains in the implemented product flow.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; reconcile implemented API/offline guidance and the handoff index under the approved documentation sequence.

**Carry forward:** Final resource contracts and migration/rollout evidence; state ownership, start-date attribution, reflection PATCH/revision/replay rules, AsyncStorage cache limits and upload/reconciliation behavior, offline/read states and test evidence; tested access/earlier-upload eligibility interfaces and isolated fixture boundaries to connect in Phase 07A.

**Handoffs:** retain/update the umbrella `handoffs/phase-07-api-offline.md`; create the six subphase handoffs named above as their checkpoints are verified.

**Working notes / blocker:** Phase 07 started October 4 on `codex/phase-07-api-offline` from `ac322ee`. Fresh baseline checks passed 293 workspace tests and 36 database tests through migration 0009. The identity resource/HTTP slice previously passed 318 workspace tests, 40 database tests, coverage gates and a live side-panel account/revocation/recovery walkthrough. The mixed archive contains unfinished repository/sender, dependency and mobile flow/Progress drafts. The isolated 07.1 contracts/API/additive migrations and compatibility work now pass local and hosted verification; 07.2–07.5 acceptance remains open. The [Phase 07 handoff](handoffs/phase-07-api-offline.md) records the preserved draft checkpoint separately from the earlier passing evidence; update it during each implementation handoff. Anthony requested this plan revision before more implementation. The earlier unapproved 07.1 merge was reverted and its code restored on the review branch. The owner has now merged 07.1A via PR #13 and authorized a separate 07.1B PR against updated `main`. Preserve remaining archive drafts. Obtain separate permission before merging B or publishing a later-phase PR. The API/persistence confirmations and detailed original verification cases remain in scope under those checkpoints. Anthony confirmed limited offline history in the October 3 review: current-month counts and today's details, alongside the existing catalog/latest-summary/pending-data requirements. Other days, including another day within the current month, require an online lookup. The follow-up confirms normal device-first saving with background retries, accepts the documented offline timestamp trust limitation, and approves cleanup/one-local-retry/direct-online-backend-saving for actual device-storage failure. The October 4 follow-up replaces the earlier current-screen retry gate with continued activity in account-scoped Zustand memory and a top banner that stays until manually closed or all endangered submitted content is saved. Full recovery closes any visible banner and shows one recovery toast whether or not it was already dismissed. Pending operation ownership, automatic recovery, Progress inclusion and safe cleanup are specified above; no further product selection is pending for those policies. Genuine reflection revision conflicts now use the confirmed automatic backend-wins rule, with no attention/review UI. Other actionable-record recovery presentations remain to be finalized before their dependent implementation. Routine implementation mechanics, correction/revision recovery and measured limits remain engineering work. Implement/verify after the 06A handoff and reconcile affected documents afterward. Phase 06A remains separate and preserves current behavior. Native billing and all nine subscription rules are owned by Phase 07A, with no implementation started.

<a id="phase-07a"></a>

### Phase 07A — Native subscriptions & reliable billing

**Status:** Not started
**Depends on:** 07.5 and the completed Phase 07 umbrella acceptance checks.

**Acceptance references:** PRD AC-03 · Tech acceptance 6, 14–17, plus all nine confirmed subscription rules below. Align older access-freshness requirements after implementation under the approved documentation sequence.

**Outcome:** Verified native purchases unlock promptly, still-valid saved verification permits offline paid use, earlier valid-access activity can synchronize after expiry, and later subscription changes recover reliably.

**Scope and sequencing:** This is new billing implementation, separated from API/offline refactoring at Anthony's request on October 3. Complete all Phase 07 subphases through 07.5 first; read their handoffs and the umbrella acceptance record, then reuse the verified account-scoped persistence and eligibility interfaces. Complete 07A before Phase 08 subscription-management/vendor-cleanup integration and before Phase 09 paid-product release validation. No application/schema work is authorized by this planning edit. Preserve the subscription rules already decided; QStash remains the existing planned delivery choice, not a requirement for Phase 07 phone uploads.

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
- **Purchase-transfer handling confirmed in the October 3 review:** choose and document the compatible RevenueCat restore setting during billing setup. When transactions move between app accounts, refresh both the source and receiving billing identities from authoritative provider data rather than only the destination. Handle the transfer event's `transferred_from`/`transferred_to` identities explicitly, including event-specific environment validation. Apply account-scoped refresh fencing to both sides. Paid access follows the verified transfer; attempts, private reflections and earlier eligible pending uploads retain their original app-account ownership. Do not merge private records or move historical eligibility to the receiving account merely because a store purchase transfers. Verify recovery to the same app account separately from restore to a newly created account.
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

For every code slice, write/run relevant tests and verify affected UI in the in-app browser, honoring the owner's side-panel preference when considering any browser fallback. Native sandbox purchase/restore verification is additionally required where a browser cannot establish store behavior. This plan records work; it does not claim those checks passed.

1. **Establish the billing baseline and configuration.** Read the Phase 07 handoff, verify its access/eligibility seams and preserved local records, and complete the App Store Connect/RevenueCat setup begun in Phase 01. Verify current compatible native SDKs, provider contracts, sandbox/environment isolation, account/customer binding and production scheduler/queue limits before adding dependencies or enabling live integrations. Reuse Phase 07 resource-only conventions.
   **Verify:** products/entitlements/customer IDs map correctly without secrets in source/docs; no production fixture bypass; the baseline and remaining native/staging gates are recorded.

2. **Implement verification contracts, storage and provider coverage.** Add the shared access/read/verification schemas, account-scoped `:access` hydration, provider adapters and billing customer/subscription/entitlement/event schema/migrations. Preserve server-verified subscription coverage for earlier valid-access uploads. Introduce shared short-lived refresh claims/fencing across immediate, job and reconciliation paths; fetch provider state outside database transactions. Connect Phase 07's authenticated eligibility seam to real verified coverage.
   **Verify:** forged client access flags, wrong ownership/account, failed provider calls, interrupted commits and stale concurrent responses cannot grant or regress access; existing journal entries survive unavailable/revoked access; earlier completed reps and dependent reflection uploads retain eligibility after expiry. Reported starts outside verified account coverage or implausibly in the future are rejected, while valid earlier starts are accepted regardless of delayed upload; deliberate offline backdating retains the explicitly accepted trust limitation.

3. **Implement native purchases and the nine subscription rules.** Finish App Store Connect/RevenueCat product configuration, stable customer mapping, paywall, purchase/restore/management controls and server provider verification. Implement persisted status/expiry/check time, immediate unexpired hydration, event-driven five-minute refresh and exact expiry locking. Record server-verified coverage and connect the earlier-rep upload boundary so expiry does not strand valid existing records. Keep purchase/restore verification pending states distinct from quiet journal uploads.
   **Verify:** sandbox purchase/restore/cancel/expire/refund and recovered account mapping work; restoring into a different app account refreshes source and destination billing state without exposing private history or reassigning earlier pending uploads/coverage; recovery into the original account retains its mapping; five minutes passing causes no request/block; network failure before expiry does not close access; purchase/restore bypasses the threshold; expiry requires renewal verification; earlier authenticated owner-checked reps/reflections upload afterward; an old account response or forged client premium flag cannot unlock another account.

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
- [ ] Integrated Phase 07 recording/synchronization still passes with verified access and after expiry; account changes/revocation preserve pending data without granting unauthorized paid use. Purchase transfers refresh both affected billing accounts, keep private history separate and preserve original-account eligibility for earlier valid pending activity.
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
- Configure and verify the owner-selected support email or help destination before release, as confirmed in the October 4 review. Any Get help action in account/saving recovery must open this working destination; do not ship placeholder actions or automatically include private reflection content/credentials. Selecting the actual destination remains a release setup item, not a blocker for core Phase 07 implementation. Reuse the Phase 07 toast presentation for failed support/legal/subscription-management link opening, with plain-language feedback and the original action still available; account and purchase-verification failures retain their dedicated recovery UI.
- Implement authenticated export and confirmed deletion, immediate credential/session revocation, account cache clearing and durable vendor cleanup where required. Define retention/backup behavior consistent with the published policy.
- Activate explicit PostHog events through consent-aware client/server adapters. Separate general analytics and sensitive metadata choices; use stable IDs for confirmed domain events and keep analytics failure independent of product saves.
- Finish diagnostic redaction and operational dashboards. Record metric definitions and baseline collection; do not invent conversion or wellbeing targets.

#### Keep out of this phase

- No Reset progress from the mockup, unconditional vendor forwarding, session replay/autocapture or journal/credential/audio payloads in telemetry.
- No optional-analytics requirement for paid access or cloud saves.

#### Ready to hand off when

- [ ] All required controls remain reachable when unpaid; recovery/transfer, reminder permissions and preferences work on iOS.
- [ ] Get help opens the configured, working support destination from each recovery surface that offers it; no placeholder action or sensitive diagnostic payload is shipped.
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
- For code changes, run relevant tests and inspect affected UI in the in-app browser, using Chrome if unavailable only when consistent with the owner's browser preference. Add native verification where a browser cannot validate behavior.
- PRD owns product behavior; tech stack owns architecture. Current explicit five-choice feelings, general challenge scope, Level 1 context and optional helper fields must be reflected in contracts.
- Implement local journaling/offline synchronization only within the confirmed Phase 07 scope. Do not add day notes, surprise Settings features or draft curriculum expansion.
- Recheck provider APIs, compatibility and plan limits when implementing. This is a work sequence, not a provisioning action or delivery-date promise.

## Verification and tracking limits

- The saved baseline contains no completed application phases. Browser test fixtures are not implementation evidence.
- Browser checklist controls cannot verify handoff files or test results. Keep the full context in Markdown handoffs, including partial work when a phase is paused.
- Provider APIs, native compatibility, pricing and plan limits must be rechecked during implementation. This plan does not provision services or promise delivery dates or throughput.
- [Planning artifact verification](checks/plan-check-results.md) records checks of the HTML tool only.
- [Database connection reference](https://supabase.com/docs/guides/database/connecting-to-postgres).
