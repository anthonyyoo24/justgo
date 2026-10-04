# Phase 06A — Code quality & test hardening

## Snapshot

- **Status:** Complete.
- **Updated / author:** October 3, 2026 / Codex.
- **Scope:** [Phase 06A](../IMPLEMENTATION_PLAN.md#phase-06a); existing phases 02–06 behavior only.
- **Dependency:** [Phase 06](phase-06-progress.md), locally verified. Earlier physical-device and staging gates remain release work.
- **Checkout:** `phase-06a-code-quality` (originally created as `codex/phase-06a-code-quality`), based on clean `main` at `d0b59ad`. No pre-existing local changes at the implementation baseline.
- **Concurrent work:** Phase 07 planning confirmations added in another chat during this work were preserved. Phase 06A did not implement those decisions.
- **Environment:** Node 24.18.0 / npm 11.16.0; existing Expo SDK 57 pins; dedicated local PostgreSQL 17 `justgo_test`.
- **References read:** root/mobile agent instructions, README, APP_SHELL, TECH_STACK, phase 05/06 handoffs and [versioned Expo 57 documentation](https://docs.expo.dev/versions/v57.0.0/).

## Baseline and bounded worklist

Before application edits, `npm run check` passed 226 tests (12 architecture,
8 API unit, 197 mobile, 9 contract) with no async warning in this run.
`npm run test:db` passed 36 tests in five suites after local setup/migration.
Fresh all-source coverage included unimported production files. API service
coverage includes actual database tests, not only mocked route tests. The mobile
coverage baseline exposed the intermittent Progress query failure/warning even
though the first standard check passed; the fixes below address its cause.

- [x] Protect actual runtime/provider initialization, account/cache boundaries,
      session coordination, access freshness and AppState handling.
- [x] Test JavaScript Keychain adapter validation, native calls/errors and the
      explicitly nonpersistent web vault with controlled doubles.
- [x] Separate Progress calendar/summary, sheet and rows with local styles;
      preserve paging, retries, accessibility and animations. Resolve the intermittent
      query-test act warning with awaited behavior/cleanup; inspect pointerEvents.
- [x] Review identity/controller, challenge/deck and reflection responsibilities;
      extract only cohesive pieces with a concrete maintenance benefit. Defer API or
      persistence redesign to 07 and document candidate decisions.
- [x] Add reproducible all-source coverage and CI reports/thresholds; strengthen
      dynamic import/require boundaries and targeted promise lint with rule tests.
- [x] Verify presentation failure states and the real disposable-account journey
      challenge → completion → reflection → Progress in the in-app browser.
- [x] Finish durable root agent/testing guidance, plan/index and Phase 06 checklist.

## Decisions and invariants

Current routes, contracts, schema, server-confirmed completion and reflection
behavior stay intact. Phase 07 owns the accepted API/offline redesign and Phase
07A owns native subscriptions. No new native binary, physical-device acceptance,
staging deployment, provider integration or product feature is part of 06A.

## Verification evidence

| Command                                                                                                                                                   | Final result                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                                                                                           | Passed contracts build, workspace typechecks, ESLint, Prettier and 292 tests: 54 architecture/safeguard, 8 API unit, 37 mobile suites / 217 tests, 13 contract tests. No unexpected asynchronous warning. |
| `npm run test:db`                                                                                                                                         | Passed 5 suites / 36 PostgreSQL integration tests, through migration 0009.                                                                                                                                |
| `npm run test:coverage`                                                                                                                                   | Passed all three workspace reports and independent global/critical-path floors; includes 44 API tests (8 unit + 36 database), 217 mobile and 13 contract tests.                                           |
| `npm run export:web -w @justgo/mobile -- --output-dir /tmp/justgo-phase06a-export-web`; corresponding `export:ios` with `/tmp/justgo-phase06a-export-ios` | Both passed with existing Expo 57.0.26 pins. Exports do not prove native device behavior.                                                                                                                 |

October 3 pre-PR audit: `npm run check`, `npm run test:db` and
`npm run test:coverage` were rerun and reproduced the results above, including
unchanged coverage percentages and no unexpected asynchronous warnings.
`npm run doctor -w @justgo/mobile` also passed all 21 checks. Corrected the current
branch name, billing-phase labels and browser-fallback instructions to honor
side-panel-only requests. The Phase 06 local checklist is checked; the Phase 07
assessment follow-ups and device/staging gates below remain open.

### Coverage before and after

| Workspace               | Lines before → after | Branches before → after | Statements before → after | Functions before → after |
| ----------------------- | -------------------- | ----------------------- | ------------------------- | ------------------------ |
| Mobile                  | 80.24% → 86.06%      | 77.27% → 79.69%         | 78.69% → 84.38%           | 75.38% → 80.65%          |
| API, including database | 84.11% → 84.11%      | 82.58% → 82.58%         | 83.89% → 83.89%           | 76.85% → 76.85%          |
| Contracts               | 100% → 100%          | 100% → 100%             | 100% → 100%               | 100% → 100%              |

Provider and vault now have 100% line/branch coverage through actual runtime wiring
and controlled native-module tests. Percentages do not establish correctness by
themselves: additional contract tests exercise feeling choices, strict fields, bounds,
invalid submissions and revision validation despite already full schema coverage.
Uncovered bootstrap/configuration adapters and route wiring remain visible in
the report, rather than being excluded to inflate the score.

`docs/TESTING.md` explains the all-source include patterns, scope/exclusions,
commands, error ownership and threshold policy. `scripts/coverage-thresholds.json`
owns the global and critical-path floors. The checker independently evaluates
global and selected files/groups using weighted covered/total counts; five tests
protect regression detection, missing paths and misleading rounded percentages.
The mobile global branch floor is 79%; API is 82%; contracts are 95%. Critical
provider/vault floors are 95% and Progress has a 90% branch floor. Controller and
API service floors preserve the existing, behavior-oriented integration coverage.
Raise floors as coverage improves; document any future justified change.

Generated reports live under ignored `coverage/{mobile,api,contracts}/` (HTML,
LCOV and JSON summaries); CI now collects/enforces and uploads them. The sole
added dependency is dev-only `@vitest/coverage-v8@5.0.1`, matching existing Vitest.
No production dependencies or native versions changed. Local command logs are
temporary `/tmp/justgo-phase06a-*.log`; the recorded results here are the durable
evidence. Hosted CI results are tracked on the Phase 06A pull request; local
checks do not establish a hosted CI pass.

### October 3 PR #10 CI environment repair

The first [PR run](https://github.com/anthonyyoo24/justgo/actions/runs/37160224543)
and [push run](https://github.com/anthonyyoo24/justgo/actions/runs/37160217877)
passed workspace checks and all 36 database tests, then failed API coverage before
its five database suites could run. The added coverage step supplied
`DATABASE_URL` but omitted `MIGRATION_DATABASE_URL`, which those suites also need
for isolated fixture setup/cleanup. The local ignored `.env` supplied both and hid
the omission from local verification. Mobile and contract coverage tests passed;
the combined coverage gate and later exports/Doctor did not run on these failed
hosted jobs.

Explicitly clearing `MIGRATION_DATABASE_URL` locally reproduced the same five
suite-initialization failures. The workflow now reuses the migration/database
step's complete environment mapping for coverage through a YAML anchor/alias.
Database safeguards, coverage floors and assertions are unchanged. Root agent and
testing guidance now require checking CI prerequisites without local configuration
and inspecting hosted results for the pushed commit. Hosted repair results are
tracked in [PR #10 checks](https://github.com/anthonyyoo24/justgo/pull/10/checks);
local verification alone does not establish a hosted pass.

Repair verification also reproduced an intermittent Progress account-switch test
failure locally. Its fixture now awaits the first account's focus refresh before
replacing the transport, observes the new account's fetch before resolving it and
asserts distinct new-account totals after loading ends. Fake timers control query
notifications, which are drained inside async `act` after unmount/cancel/clear and
before restoring the global notifier and real timers. All original isolation
assertions remain; no timeout or coverage requirement was increased. This only
changes test synchronization, not application UI or account behavior.

The repaired local `npm run check` passes all 292 tests plus typechecks, lint and
formatting; `npm run test:db` passes all 36 tests. `CI=1 npm run test:coverage`
passes all workspace/critical-path floors with unchanged reported percentages.
No unexpected asynchronous warning appeared. The parsed workflow's two database
steps also resolve to the same complete environment mapping.

### Browser evidence

All completed UI checks used Browser Use in the Codex in-app side panel, served by
Metro on port 8081 and the isolated local `dev:challenges` API on port 3000.
Presentation fixtures were checked at 390 × 844 (and the initial default
1280 × 720); the live journey used 1280 × 720. Temporary viewport overrides were
reset. No production access was enabled.

| Flow / fixture                                      | Observed result                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disposable local account, `/recovery`               | Created a private test account, renewed its session, returned to the live app and saw an empty calendar with today's marker and zero confirmed totals.                                                                                                                                                                                                                    |
| Live challenge → completion → reflection → Progress | Accepted a challenge, observed the timer, completed through server-confirmed Success, continued to reflection, selected a feeling and entered synthetic fixture text. Close offered save/keep editing/discard; keep editing preserved the form. Saving returned Home; Progress showed the one saved rep on October 3, with the correct feeling and expandable saved text. |
| `/preview?progressState=loading`                    | Accessible loading/skeleton state changed to the loaded calendar; active day opened, reflection expanded, sheet closed/reopened.                                                                                                                                                                                                                                          |
| `/preview?progressState=error`                      | Unavailable metrics/dates did not imply zero activity; Retry restored counts/day actions. Day opening and reflection expansion still worked afterward.                                                                                                                                                                                                                    |
| `/preview?progressDayState=initial-error`           | Full-sheet error/Retry recovered the first three fixture entries.                                                                                                                                                                                                                                                                                                         |
| `/preview?progressDayState=load-more-error`         | Six entries stayed visible with the later-page failure. Retry cleared the failure and retained all six after the fixture correction below.                                                                                                                                                                                                                                |
| Month navigation / sheet reopening                  | Next month displayed October's empty-month state, preserving all-time summary; close/reopen and read-only reflection expansion worked.                                                                                                                                                                                                                                    |

The previously observed `pointerEvents` warning was traced to decorative Progress
props and replaced with style properties. No new runtime error/deprecation was
observed in the final checks; the reused tab's console still retained the earlier
warning timestamp. A screenshot of the verified fixture is saved locally at
`.local/phase-06a/progress-reflection.png` and shared in the implementation chat.
It contains only synthetic fixture content.

Reduced-motion sheet open/close and reflection/skeleton behavior are verified by
component tests; the in-app browser does not expose media emulation. A temporary
Chrome fallback tab was opened while investigating that capability, then closed
when Anthony requested side-panel-only testing; no Chrome UI pass is claimed.
No native source changed. No simulator, physical-iPhone, native Keychain or staging
acceptance is claimed in 06A; those earlier release gates remain open.

## Changed responsibilities and candidate decisions

| Paths / candidate                                                                | Result and rationale                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/mobile/src/features/shell/AppProvider.test.tsx`                            | Ten actual-provider tests cover startup, unavailable storage, account loss/switch cache and mutation clearing, shared session renewal, access freshness/expiry/error/retry, AppState privacy/refresh and cleanup. Uses real identity/controller, account client and HTTP parsing with controlled fetch/vault/clock/native doubles.                                                                                                   |
| `apps/mobile/src/features/identity/vault.test.ts`, `vault.ts`, `storage.ts`      | Eight adapter tests cover valid/corrupt payloads, native arguments/errors/module absence and the isolated nonpersistent web fallback. Both `add` paths now validate credential payloads before writing. No Keychain persistence semantics changed.                                                                                                                                                                                   |
| `apps/mobile/src/features/progress/`                                             | `ProgressView` composes `ProgressCalendar`, `DaySheet` and `ProgressEntryRow`; each owns its styles and local helpers. Query/cache orchestration stays in `ProgressScreen`. Existing paging, animation race, retries, labels and account-boundary tests remain.                                                                                                                                                                      |
| Identity controller/screen                                                       | Retained the cohesive persisted recovery state machine and existing presentation boundary. Further decomposition around persistence/account ownership depends on Phase 07; new provider/vault tests protect the seams now. No speculative storage layer added.                                                                                                                                                                       |
| Challenge screen/deck                                                            | Extracted `ActiveChallenge` timer presentation and `SuccessScreen` from `ChallengeScreen`; updated route/preview/test imports. Retained the deck's coupled gesture/animation engine and controller orchestration. Existing gesture, timer and success tests protect the extractions.                                                                                                                                                 |
| Reflection view/controller                                                       | Reused the contract's `feelingChoices` instead of duplicate values/labels. Retained the coupled editor/layout and controller boundaries. Intentional void UI callbacks document that the controller catches errors and owns busy/retry state. Offline/reflection resource changes remain Phase 07.                                                                                                                                   |
| `eslint.config.mjs`, `scripts/import-boundaries*`                                | One boundary rule covers static import/re-export, dynamic import, literal require and TS import assignment, with normalized relative paths and forbidden/permitted fixtures. Computed module paths must be literal/reviewable; assets, Jest/native factories and guarded previews remain allowed. Production TypeScript enables project-aware floating/misused promise and await-thenable rules, with failing/passing rule fixtures. |
| Workspace scripts/configs, `scripts/check-coverage*`, `.github/workflows/ci.yml` | Reproducible reports/gates and failure tests, database-backed API coverage, CI artifact collection. All production TypeScript source remains in coverage, including unimported files.                                                                                                                                                                                                                                                |
| Root/mobile `AGENTS.md`, README, `docs/TESTING.md`, APP_SHELL, TECH_STACK        | Shared coding/test standards are discoverable from the root and linked from setup/architecture guidance. Exact-version Expo guidance remains in the mobile instructions. Product/API redesign specifications are preserved for their separate phase.                                                                                                                                                                                 |

## Issues found and fixed

- The Progress skeleton test replaced its resolver on repeated focus requests,
  leaving a prior request unresolved. Keep one controlled promise, await the
  rendered account transition and unmount/cancel/clear queries during cleanup.
  TanStack's scheduled notifications run inside `act` and the test override is
  restored afterward. No console suppression or larger arbitrary timeouts.
- Provider polling/freshness tests need fake timers plus unmount/cancel/clear and
  pending callback flushing; early experiments left timers alive. Final full and
  coverage runs exit normally with no unexpected asynchronous warnings.
- The native vault accepted unchecked credential writes although reads/state
  writes validated payloads. Invalid input now fails before the native call; the
  memory implementation follows the same contract.
- Day-sheet opening/closing still animated under reduced motion. It now moves
  directly to the end state and closes immediately; tests verify no timing call
  and preserve repeated-layout/show protection.
- The presentation preview's later-page Retry reset six entries back to three.
  Its explicit loaded state now retains all six; a regression assertion and
  side-panel recheck both pass. This was fixture state, not an API paging change.

## Next phase and remaining gates

### October 3 durable coding-standard clarification

The root `AGENTS.md` now explicitly states all eight agreed principles: single
responsibility, dependency inversion, KISS/YAGNI, DRY, contract consistency,
reliable state transitions, security/privacy/observability, and accessibility
with measured performance. Focused components, meaningful tests, regression tests
for bugs and requirement-by-requirement closeout apply during future feature work,
not just refactoring phases. Detailed commands remain in `docs/TESTING.md`;
mobile instructions retain their exact-version Expo requirement. Both guides
honor the owner's side-panel testing preference and distinguish browser checks
from saved CI journeys. This guidance update does not implement the outstanding
Phase 07 HTTP or end-to-end CI tasks below.

### October 3 assessment follow-ups assigned to Phase 07

Phase 06A completed its bounded quality work, but two recommendations from the
earlier assessment remained outstanding. Anthony explicitly assigned both to
[Phase 07](../IMPLEMENTATION_PLAN.md#phase-07); they are not Phase 07A billing work:

- [ ] Correct oversized-body and unsupported-content-type responses to retain
      `413` and `415` instead of `503 UNAVAILABLE`, with API parser/error-handler
      and client retry regression tests. Phase 07 task 2 and its completion
      checklist now include this fix.
- [ ] Commit automated challenge → completion → reflection → Progress journeys,
      including recovery and failure/retry scenarios, and make them a CI gate.
      Phase 06A performed browser checks and added coverage gates; it did not
      expand the existing launch/account-refresh smoke test into an automated
      full-journey CI suite. Phase 07 task 10 and its completion checklist own it.

Start Phase 07 from this handoff and its latest accepted plan, settling any
remaining product recommendations there. Keep controllers and adapters easy to
substitute while implementing its approved resource/API/offline redesign; update
contracts, callers, tests and documentation together. Existing server-confirmed
completion behavior is intentionally preserved by 06A tests until 07 changes it.
Phase 07A owns native subscriptions. Neither phase's implementation was started.

The Phase 06 handoff now explicitly checks off its locally completed work and
these quality follow-ups. Phase 06 remains In progress only because the earlier
dependency/physical-device/staging gates are still open. Do not infer release
acceptance from JavaScript adapter doubles, browser fixtures or bundle exports.
