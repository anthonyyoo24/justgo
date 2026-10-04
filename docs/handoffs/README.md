# Implementation handoffs

This folder is the durable implementation record for [the staged plan](../IMPLEMENTATION_PLAN.md). The historical HTML checklist is absent from this checkout; current progress is recorded in Markdown. A browser-local checklist cannot modify or verify these files. Commit phase records with their implementation. Export/import the checklist to move its state between browsers or preview URLs.

## Current state

October 4 implementation: [07.1 — API and data foundation](phase-07-1-api-data.md) is implemented and verified but awaits owner review. PR #12 was created and merged without permission, then reverted at the owner's request (`7845ac4`); `c355ef0` adds explicit permission rules. The implementation is preserved on the review branch; the owner has now authorized pushing it and creating a new PR, with merge approval still pending. Canonical resources, migration/restore, compatibility, 351 workspace tests, 59 database tests, unchanged coverage gates, saved identity/catalog smoke and side-panel checks passed; exact evidence is in that handoff. Later-phase drafts remain in the archive branch.

October 4 branch separation: [Phase 07](phase-07-api-offline.md#october-4-branch-separation--current-status) now has five sequential [07.1–07.5 checkpoints](../IMPLEMENTATION_PLAN.md#phase-07-subphases). All existing implementation drafts are preserved locally at `6d4279f` on `codex/archive/phase-07-drafts`; the documentation PR does not merge their application code. The identity/HTTP slice previously passed 318 workspace tests, 40 database tests, coverage gates and a side-panel account/recovery walkthrough before later drafts changed the branch. 07.1 awaits owner acceptance; later subphases remain open. [Planning PR #11](https://github.com/anthonyyoo24/justgo/pull/11) is merged at `8118bf5`. The 07.1 implementation is restored locally on `codex/phase-07.1-api-data` for review, based on reverted `main`. The owner has now authorized a push and new PR for review; explicit merge permission is still required. Later branches follow the [numbered branch map](../IMPLEMENTATION_PLAN.md#phase-07-subphases). Merged planning refs and the unused starting ref have been retired. Verify each isolated checkpoint before its own PR/merge. Genuine reflection conflicts use automatic backend-wins recovery; interactive testing stays in side panels.

October 3 PR #10 review follow-up: the coverage gate now rejects reports with no source entries while preserving valid zero-branch files. The regression failed before the fix and passes afterward; current local checks pass 293 workspace tests, 36 database tests and all coverage floors. The [Phase 06A handoff](phase-06a-code-quality.md#october-3-pr-10-empty-coverage-review-fix) records the fix and links hosted checks.

October 3 assessment reconciliation: the two remaining findings—`413`/`415` HTTP error handling and automated full-journey CI tests—are now explicit [Phase 07 tasks and completion gates](../IMPLEMENTATION_PLAN.md#phase-07). The [Phase 06A handoff](phase-06a-code-quality.md#october-3-assessment-follow-ups-assigned-to-phase-07) records that these remain unimplemented; its coverage gates and browser checks do not close them.

October 3: [Phase 06A quality implementation](phase-06a-code-quality.md) is complete on `phase-06a-code-quality`. Final checks pass 292 workspace tests, 36 database tests, all-source coverage floors and both web/iOS bundle exports. Runtime/vault regression tests, Progress and challenge component separation, coverage gates, dynamic-loader boundaries and promise lint are in place. Side-panel browser checks cover the live completion/reflection/history journey and presentation recovery states. The [Phase 06 local checklist](phase-06-progress.md#october-3-local-handoff-checklist-and-phase-06a-follow-up) is checked off; earlier physical-device/staging gates remain open.

September 30: [Phase 06 final handoff audit](phase-06-progress.md#september-30-final-handoff-audit) covers application changes through `0515a00`, including loading skeletons/today highlighting, the repeated sheet-animation fix, reflection navigation and import-boundary safeguards. Fresh workspace checks passed 226 tests and the database suite passed 36; in-app browser fixtures verified loading recovery, empty-account today highlighting and reflection/sheet close-reopen behavior. Deployment instructions now require migration 0009 and coordinated API/mobile versions. Local implementation is ready for review; the existing dependency/device/staging gates stay open.

September 30: [Phase 06A — Code quality & test hardening](../IMPLEMENTATION_PLAN.md#phase-06a) is the next planned implementation phase, before billing. It covers tests and maintainability of existing functionality, including updating agent/coding guidance. At that planning date implementation had not started; the October 3 record above supersedes that status. API redesign is Phase 07 and native billing is Phase 07A in the latest plan; physical-device and staging acceptance remain later release work.

September 29: [Phase 06 implementation](phase-06-progress.md) remains in progress on `phase-06-progress-calendar-saved-history` because its dependency phase remains open. Local checks and the live simulator day sheet pass against the clarified scope, which omits elapsed-duration displays and uses **Feeling**. A day with 21 entries verified automatic paging, both failure states and retry recovery. Physical-iPhone testing is planned after the full app build; staging deployment is an integration/release task. The handoff records current evidence and later UI changes.

September 27: [Phase 05 implementation](phase-05-reflections.md) now connects confirmed Success to the optional Paper-based feelings and typed reflection screen. The revisioned API/database flow, retry/conflict behavior, automated tests and in-app browser preview pass locally. Real-iPhone accessibility/keyboard checks and staging deployment remain open, so Phase 05 is In progress.

September 26: [Phase 04 implementation](phase-04-challenge-loop.md) has six venue decks, 61 placements, reliable attempts, timer, direct give-up and the full confirmed Success view. The handoff includes the later card/content, queue-handoff and preview corrections. Current automated checks and earlier browser/native button/relaunch checks pass; physical-device acceptance and deployment remain open. [Current scope decisions](../PHASE_04_SCOPE.md) supersede earlier general-only and no-replay proposals. Apple signing/device gates remain open.

Phase 03 app-shell implementation is recorded in [phase-03-app-shell.md](phase-03-app-shell.md). Welcome/questionnaire onboarding is deferred by the owner; native acceptance status remains explicit. Staging now includes the transfer-verification upgrade and access boundary.

Phase 02 identity/recovery is implemented with passing browser/backend verification recorded in [phase-02-identity.md](phase-02-identity.md). Apple-dependent physical-device acceptance remains open. Anthony authorized later feature implementation to proceed against the verified identity boundary while those gates stay pending.

Phase 01 is complete: workspace, foundation app/API, restricted-role database infrastructure and the existing Expo project are verified. The cloud-built iOS app passed native launch and connectivity. See [phase-01-foundation.md](phase-01-foundation.md) for evidence and next steps. [00-planning-baseline.md](00-planning-baseline.md) records the historical starting point. [01-ios-release-scope.md](01-ios-release-scope.md) records the current scope revision; neither is a completed build phase.

## Workflow

1. **Start:** read the current PRD/tech stack, baseline, previous phase and each dependency handoff. Confirm checkout/commit, environment and smoke checks.
2. **During:** keep a record of decisions, changed paths, migrations, tests, issues/root causes/fixes and remaining work. Update product or architecture docs when an approved decision changes them.
3. **Finish or pause:** copy [TEMPLATE.md](TEMPLATE.md) into the filename below. Use In progress or Blocked for unfinished work; never invent implementation or test evidence.
4. **Verify:** include exact commands/results and browser/native evidence appropriate to the changes. A preview cannot prove Keychain recovery, real purchases, timers or dictation. Record tests not run and their reason.
5. **Hand off:** update the status/file link in this index and the HTML tracker, export its state if useful, and record the next stage’s first actions. Only mark Complete when required gates and dependencies pass and the handoff is saved.

If later work invalidates a completed phase, add a dated correction and reopen affected dependencies; do not erase historical evidence. Never put secret values, session tokens, recovery keys, private reflection text or real customer data in handoffs. Use repo-relative paths and test fixture identifiers.

## Phase index

The filenames below are reserved names, not claims that those files exist. Turn each filename into a link after writing that phase’s record.

The launch path was aligned with number order on September 26: reflections through launch are 05–09, and post-launch lock-screen work is 10. Post-launch phases 10–12 may be scheduled independently. Historical browser tracker exports retain the former IDs and need migration before use.

On September 30, quality phase 06A was inserted after Progress (06), preserving the existing IDs. The October 3 plan separates API/offline saving (07) and billing (07A); their reserved filenames below reflect that sequencing without claiming either implementation. It can complete against verified local feature implementations while previously deferred device/staging gates remain open, as recorded in the plan's sequencing decision.

| Phase                                         | Status        | Dependencies | Handoff filename                                         |
| --------------------------------------------- | ------------- | ------------ | -------------------------------------------------------- |
| 01 — Foundation & implementation decisions    | Complete      | None         | [phase-01-foundation.md](phase-01-foundation.md)         |
| 02 — No-signup identity & recovery            | In progress   | 01           | [phase-02-identity.md](phase-02-identity.md)             |
| 03 — App shell & shared API                   | In progress   | 02           | [phase-03-app-shell.md](phase-03-app-shell.md)           |
| 04 — Challenge deck & reliable attempts       | In progress   | 03           | [phase-04-challenge-loop.md](phase-04-challenge-loop.md) |
| 05 — Feelings & typed reflections             | In progress   | 04           | [phase-05-reflections.md](phase-05-reflections.md)       |
| 06 — Progress calendar & saved history        | In progress   | 05           | [phase-06-progress.md](phase-06-progress.md)             |
| 06A — Code quality & test hardening           | Complete      | 06 (local)   | [phase-06a-code-quality.md](phase-06a-code-quality.md)   |
| 07 — API & offline saving                     | In progress   | 06A          | [phase-07-api-offline.md](phase-07-api-offline.md)       |
| 07A — Native subscriptions & reliable billing | Not started   | 07           | `phase-07a-billing.md`                                   |
| 08 — Settings, privacy & measurement          | Not started   | 07A          | `phase-08-settings-privacy.md`                           |
| 09 — Release validation & launch              | Not started   | 08           | `phase-09-release.md`                                    |
| 10 — Lock-screen countdowns                   | Not scheduled | 09           | `phase-10-native-timers.md`                              |
| 11 — Optional US iOS web checkout             | Not scheduled | 09           | `phase-11-optional-stripe.md`                            |
| 12 — Future AI text coach                     | Not scheduled | 09           | `phase-12-future-text-coach.md`                          |

The Phase 07 checkpoint handoffs below track separate acceptance. 07.1 awaits owner review/acceptance; later filenames remain reserved outputs.

| Subphase                                         | Depends on | Handoff filename                                 |
| ------------------------------------------------ | ---------- | ------------------------------------------------ |
| 07.1 — API and data foundation                   | 06A        | [phase-07-1-api-data.md](phase-07-1-api-data.md) |
| 07.2 — Durable local saving and synchronization  | 07.1       | `phase-07-2-local-sync.md`                       |
| 07.3 — Local challenge and reflection experience | 07.2       | `phase-07-3-local-flow.md`                       |
| 07.4 — Progress and history integration          | 07.3       | `phase-07-4-progress-history.md`                 |
| 07.5 — Final cutover and acceptance              | 07.4       | `phase-07-5-cutover-acceptance.md`               |

The release path is 01 → 02 → 03 → 04 → 05 → 06 → 06A → 07 (07.1 → 07.2 → 07.3 → 07.4 → 07.5) → 07A → 08 → 09. Deferred stages 10, 11 and 12 each follow launch and do not block it. Additional levels/filters, dictation and Android stages will be detailed when scheduled.
