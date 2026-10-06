# Phase 07.3A — Browser testing removal assessment

**Assessed:** October 6, 2026, on `codex/phase-07.3-local-flow`, after checkpoint
`25e2f8c`. **Status:** planning inventory; no app, test runner, dependency or CI
code has been removed. Implement after reviewed/finished 07.3 and before 07.4,
under [the 07.3A plan](../IMPLEMENTATION_PLAN.md#phase-07-3a).

## Finding and removal rule

JustGO can retire its browser UI testing setup after equivalent native coverage
and hosted simulator CI pass. Some files currently run under Playwright but test
repositories, real API/database behavior or fixture safety rather than web UI.
Preserve those behaviors in a browser-independent runner before deleting their
current wrappers. Native modal, storage, connectivity and toast implementations
remain necessary. Keep unit/component/API/database checks and coverage floors.

The inventory below comes from reading the tracked harness/configuration and
searching app source for `.web` modules, browser globals, platform branches,
Playwright imports and their consumers. Refresh it against the accepted 07.3
revision before implementation; later edits may add consumers or test cases.
Paths in the tables are relative to the repository root.

## Remove entire files after replacement coverage passes

| File                                                             | Current responsibility                                                                | Removal prerequisite                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/platform/modals/useModalIsolation.web.ts`       | Sets DOM `inert`/`aria-hidden` on background siblings while the active modal is open. | Native modal/navigation/accessibility isolation verified; remove the caller wiring below.                 |
| `apps/mobile/src/platform/modals/useModalIsolation.web.test.tsx` | Browser DOM isolation/restoration tests using jsdom.                                  | Native isolation coverage replaces the browser-only rule.                                                 |
| `apps/mobile/src/platform/modals/useModalIsolation.ts`           | Native no-op accompanying the web hook. It does not implement iOS isolation.          | Remove hook import/call/ref from `ActiveChallengeModal.tsx`; retain native Modal and accessibility scope. |
| `apps/mobile/src/platform/toast/Toast.web.tsx`                   | Browser Sonner host and recovery notification adapter.                                | Native Sonner host/journey verification passes; keep `Toast.tsx`.                                         |
| `apps/mobile/src/platform/toast/Toast.web.test.tsx`              | Tests the browser Sonner host adapter.                                                | Preserve native toast tests and warning/recovery behaviors.                                               |
| `apps/mobile/src/platform/connectivity/connectivity.web.ts`      | Browser `online`/`offline` event adapter added for web journeys.                      | Native NetInfo reconnect coverage passes; keep `connectivity.ts`.                                         |
| `apps/mobile/src/platform/connectivity/connectivity.web.test.ts` | Tests browser event handling/cleanup.                                                 | Native listener and lifecycle coverage remains.                                                           |
| `apps/mobile/test-support/journey-storage.ts`                    | Exposes browser-only `globalThis.justgoJournalFaults` blocked/full-write controls.    | Guarded native test-build/runner fault controls and retained lower-level failure tests replace it.        |
| `e2e/playwright.config.ts`                                       | Chromium settings, Expo web/API startup and HTML reports.                             | Native runner owns equivalent startup, failure reporting and cleanup.                                     |
| `e2e/local-flow.spec.ts`                                         | Nine browser challenge/completion/reflection and failure/recovery cases.              | Each behavior mapped to native journeys or retained focused tests; real database assertions preserved.    |
| `e2e/identity-catalog.spec.ts`                                   | Browser account renewal/catalog/Progress smoke.                                       | Actual iOS identity/catalog/current Progress smoke passes. New Progress integration remains 07.4.         |

## Migrate these responsibilities before retiring their current files

| File                                            | Required disposition                                                                                                                                                                                                             |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/local-sync.spec.ts`                        | Keep its three real repository/transport/API/database tests, lost-acknowledgement replay, fallback/conflict recovery and measured serialization bounds in a browser-independent runner. This is not expendable browser coverage. |
| `e2e/cleanup-isolation.spec.ts`                 | Preserve rejected and accepted bootstrap cleanup-isolation regressions, including proof that pre-existing accounts survive teardown. Replace `page.evaluate` with runner HTTP requests and retain fixture-registry ownership.    |
| `e2e/network-isolation.spec.ts`                 | Preserve non-loopback connection rejection checks for the fixture API and replacement Metro/test services. Replace Playwright assertions and adjust service ports as needed.                                                     |
| `e2e/support/fixtures.ts`                       | Extract database role checks, transactional registry-owned cleanup and pool lifetime into shared runner fixtures. Replace browser page/screenshot handling with credential-safe native artifacts.                                |
| `e2e/support/environment.ts`                    | Preserve loopback `justgo_test`, restricted runtime/migration roles, same database/port, SSL and nonproduction checks. Relocate shared guard/API URL if useful; remove the browser app URL after its consumers migrate.          |
| `e2e/support/activity-entry.ts`                 | Keep or replace the production repository/transport entrypoint for retained Node integration tests. Remove only if the new runner loads those modules directly.                                                                  |
| `scripts/journeys/build-journey-repository.mjs` | Keep/adapt if the Node runner still needs the bundled repository entrypoint; remove after proving the replacement loader works. Its value is not limited to browser testing.                                                     |
| `scripts/journeys/run-journey.mjs`              | Replace Playwright launch with native/independent-runner orchestration. Preserve pre-start environment validation, contract build/migration, failure exit codes and cleanup ownership.                                           |
| `scripts/journeys/journey-environment.test.mjs` | Keep guard regressions and update imports if the guard moves. Do not delete safety coverage with `e2e/support/environment.ts`.                                                                                                   |
| `scripts/journeys/journey-metro.test.mjs`       | Replace web resolver assertions with native test-seam exclusion/guard regressions. Retire the old file only when equivalent protection exists for the replacement mechanism.                                                     |
| `e2e/tsconfig.json`                             | Replace browser-specific typechecking after retained TypeScript integration/fixture files have an explicit typecheck owner.                                                                                                      |
| `e2e/package.json`                              | Reassess the ESM package boundary after moving retained files. Delete only if the remaining runner does not require it.                                                                                                          |

## Edit these files; keep their native/shared responsibilities

| File                                                                   | Browser-specific change / retained responsibility                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/features/challenges/active/ActiveChallengeModal.tsx`  | Remove `useModalIsolation` import/call, browser-only surface ref/`useRef` import and portal-isolation comment after removing the hook. Keep opaque `overFullScreen` Modal, blocked incidental dismissal, `accessibilityViewIsModal`, native safe area and saving surface.                          |
| `apps/mobile/metro.config.mjs`                                         | Remove the web-only `JUSTGO_JOURNEY_FIXTURES` resolver, root `e2e/support/environment.ts` import and unused path plumbing. Retain normal Expo configuration or a guarded native-only test-build seam if needed.                                                                                    |
| `apps/mobile/src/app-support/identity/vault.ts`                        | Remove production web selection of `createMemoryVault` after native identity coverage passes. Keep native Keychain validation/error handling.                                                                                                                                                      |
| `apps/mobile/src/app-support/identity/vault.test.ts`                   | Retire only the web-selection case; keep native module, payload, corruption and failure tests at existing coverage floors.                                                                                                                                                                         |
| `apps/mobile/src/app-support/identity/storage.ts`                      | Retain schemas/interfaces and `createMemoryVault`, which identity/provider component tests already use. Update the browser-only comment or relocate the test helper with its consumers; do not delete the file or helper wholesale.                                                                |
| `apps/mobile/src/features/progress/day-details/DaySheet.tsx`           | Retire web-only title-width `onLayout`, `dayTitleWeb` styling and web animation-driver branches. Preserve native title measurement, sheet/gesture/animation behavior and accessibility.                                                                                                            |
| `apps/mobile/src/features/progress/day-details/DaySheet.test.tsx`      | Update assertions only as affected by native simplification; keep existing sheet behavior/regressions.                                                                                                                                                                                             |
| `apps/mobile/src/features/progress/calendar/ProgressSkeleton.tsx`      | Simplify the web animation-driver condition after native verification; keep shimmer, cleanup and reduced-motion behavior.                                                                                                                                                                          |
| `apps/mobile/src/features/progress/calendar/ProgressSkeleton.test.tsx` | Preserve shimmer/cleanup/reduced-motion tests; update only affected platform assertions.                                                                                                                                                                                                           |
| `apps/mobile/src/features/challenges/challenge-design.ts`              | Remove the web font fallback branch, retaining native challenge artwork/typography.                                                                                                                                                                                                                |
| `apps/mobile/src/theme/tokens.ts`                                      | Remove web CSS font-family fallbacks; preserve native fonts and all shared design tokens.                                                                                                                                                                                                          |
| `apps/mobile/app.config.ts`                                            | Remove the web platform entry and development-preview configuration after web testing retires. Preserve iOS bundle identity, Expo project, plugins and signing configuration.                                                                                                                      |
| `apps/mobile/package.json`                                             | Remove `web`/`export:web`, browser Sonner and unnecessary direct `react-dom`/`react-native-web` declarations after dependency/peer review. Extend `test:native`; keep `sonner-native`, Expo, React Native, NetInfo and AsyncStorage.                                                               |
| `package.json`                                                         | Retire direct `@playwright/test` and `dev:web`; replace `test:journey`/`typecheck:journey` with documented native/retained integration commands. Keep `check`, coverage and database gates; remove `esbuild` only if no replacement bundler consumer remains.                                      |
| `package-lock.json`                                                    | Regenerate through npm after the dependency changes. Transitive DOM/jsdom/web packages required by Expo/Jest are not automatically removable just because their names mention browsers.                                                                                                            |
| `.github/workflows/ci.yml`                                             | Replace Chromium installation, Playwright suite/report uploads and web export with verified native CI. Keep existing repository checks, PostgreSQL roles/migrations/restoration, coverage, iOS export and Expo doctor; configure native execution on macOS/Xcode or a supported simulator service. |

## Keep these files and behaviors

| Files / responsibility                                                                                                                                                   | Assessment                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/platform/toast/Toast.tsx`, `Toast.test.tsx`, `connectivity.ts`, `connectivity.test.ts`                                                                  | Native notification/connectivity implementations and their tests.                                                                                                                                                                               |
| `apps/mobile/src/data/activity/persistence/storage.ts`, `storage.test.ts` and repository/sender/transport tests                                                          | Real AsyncStorage adapter and essential controlled failure/retry/state tests. The adapter comment can lose its web reference; the implementation stays.                                                                                         |
| `apps/mobile/e2e/launch.yaml`, `apps/mobile/native-command.test.ts`                                                                                                      | Existing native starting point and command validation; extend instead of replacing unnecessarily.                                                                                                                                               |
| `apps/mobile/test-support/journal.ts`, `challenge-catalog.ts`                                                                                                            | Browser-independent repository/catalog fixtures; retain controlled storage/time/randomness seams.                                                                                                                                               |
| `apps/mobile/src/dev/previews/ScreenPreview.tsx`, `ScreenPreview.test.tsx`, `apps/mobile/src/app/preview.tsx`, `apps/mobile/src/dev/previews/challenges/preview-copy.ts` | Guarded developer previews can run natively. Browser retirement does not imply their removal.                                                                                                                                                   |
| `apps/api/scripts/challenge-dev.ts`, `local-test-database.ts`, `fixture-shutdown.ts`, `apps/api/tests/harness/challenge-fixture.test.ts`                                 | Disposable real-API fixtures and safety/lifetime checks useful for native testing. Adjust browser-only fixture origins if appropriate, retaining isolation and no deployed access bypass.                                                       |
| `apps/api/package.json`                                                                                                                                                  | Preserve `dev:challenges` or adapt its name/command for native fixtures. It is not a browser implementation.                                                                                                                                    |
| `apps/api/tests/app.test.ts`, `identity.integration.test.ts` and API origin enforcement                                                                                  | Preserve server contract/security tests, no-store responses and fixture-registry isolation. CORS tests are not browser UI tests; do not remove API policy as incidental testing cleanup.                                                        |
| `apps/mobile/src/app-support/providers/AppProvider.test.tsx`, identity controller/screen tests                                                                           | Retain real provider/identity wiring and memory-vault test injection.                                                                                                                                                                           |
| `apps/mobile/jest.config.cjs`, `eslint.config.mjs`, architecture checks, coverage configuration                                                                          | Shared checks remain. Review moved test paths without dropping files or weakening floors.                                                                                                                                                       |
| Native feature components and accessibility props                                                                                                                        | `aria-hidden`, `aria-checked`, `aria-selected`, `pointerEvents` and CSS-looking React Native styles are not sufficient evidence that code is browser-only. Preserve supported native behavior and verify platform semantics before changing it. |
| Historical screenshots, browser handoffs and reports                                                                                                                     | Preserve prior evidence and its limitations. Generated `.local/` reports remain local. The three current PNG screenshots remain uncommitted at the owner's request.                                                                             |

## Coverage mapping to carry into implementation

| Current cases                 | Replacement owner                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One `identity-catalog` case   | Native account renewal/catalog/Progress smoke, with database assertions.                                                                                                                                                                                                                                |
| Nine `local-flow` cases       | Native challenge → Success → reflection flows, offline/reconnect/relaunch, local/cloud/memory-only saving, duplicate taps/delayed spinners, account/session recovery, correction, cache failure and exclusive active navigation. Keep focused lower-level race/failure tests alongside native journeys. |
| Three `local-sync` cases      | Browser-independent production repository/transport + real API/database runner, retaining failure controls and measured limits.                                                                                                                                                                         |
| Two `cleanup-isolation` cases | Browser-independent fixture safety regressions for rejected and accepted pre-existing account proofs.                                                                                                                                                                                                   |
| One `network-isolation` case  | Browser-independent loopback listener regression for replacement services.                                                                                                                                                                                                                              |

The existing 16 cases must remain accounted for after migration. Add native
Keychain/AsyncStorage durability and native lifecycle checks rather than treating
browser reloads as equivalent. Capture targeted transition recordings for the
first/repeated completion flicker; eventual screen assertions alone can miss a
brief incorrect frame. Physical-device VoiceOver, recovery, motion and release
checks remain explicitly owned by their existing handoffs/Phase 09.

## Documentation to reconcile during 07.3A

Update active instructions and current-state descriptions in `AGENTS.md`,
`README.md`, `docs/operations/TESTING.md`, `docs/architecture/TECH_STACK.md`, `docs/architecture/APP_SHELL.md`,
`docs/operations/FOUNDATION.md`, `docs/architecture/IDENTITY.md`,
`docs/architecture/FRONTEND_ARCHITECTURE_LEARNING_MAP.md`, `docs/design/CHALLENGE_FIDELITY.md` and
`docs/product/PHASE_04_SCOPE.md` where they prescribe web previews/checks. Update
`docs/handoffs/TEMPLATE.md` to distinguish saved native journeys, interactive
native checks and physical-device evidence. Keep implemented architecture docs
accurate until the migration actually changes those boundaries.

Update `docs/IMPLEMENTATION_PLAN.md`, `docs/handoffs/README.md` and the current
Phase 07 umbrella/07.2/07.3 handoffs with dated supersession/next actions. Preserve
historical browser verification in prior handoffs, release-scope/baseline records
and `docs/checks/plan-check-results.md`; it remains evidence of what was tested
then, not proof of native behavior now. Save actual migration evidence in the
reserved `docs/handoffs/phase-07-3a-native-testing.md` when work starts.

## Acceptance evidence required before removal

- Every critical behavior above has passing replacement coverage and a recorded
  retained/removed disposition; no useful repository or fixture regression is lost.
- The documented native suite runs against a clean app/API/disposable database,
  preserves safe cleanup and artifacts, fails on a controlled assertion regression
  and passes the required native CI gate for the authorized pushed revision,
  confirmed in hosted check results.
- After removal, dependency installation, typecheck/lint/format, workspace/database
  checks, unchanged coverage gates, iOS export and affected native journeys pass.
- The normal native bundle contains no browser DOM adapters or fault controls;
  remaining native/device/staging evidence gaps are stated explicitly.
- Re-scan tracked source/configuration for removed imports, commands and web-only
  branches. Document any necessary retained transitive dependencies with reasons.

This assessment records intended changes. It does not authorize pushing, opening
a PR, merging, upgrading signing/build configuration or deleting simulator data.

## Planning-edit verification

The documentation/source-path check passed for 158 local Markdown links and 49
explicit assessed source paths, plus the new phase anchor and release sequence.
Prettier checks pass for the seven changed Markdown files. No application tests
or UI checks were rerun for this documentation-only edit; existing implementation
evidence remains in the 07.3 handoff. No browser code has been removed.
