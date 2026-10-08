# Testing and quality safeguards

Read [AGENTS.md](../../AGENTS.md) before editing and the applicable phase handoff.
The [Phase 06A handoff](../handoffs/phase-06a-code-quality.md) records the measured
baseline, changes and browser evidence. Tests protect current behavior; Phase 07
owns API/offline changes and Phase 07A owns billing.

## Scheduled iOS testing migration — 07.3A

Anthony approved [07.3A — iOS simulator testing migration](../IMPLEMENTATION_PLAN.md#phase-07-3a)
after reviewed/finished 07.3 and before 07.4. The
[file-by-file removal assessment](../checks/phase-07-3a-browser-testing-assessment.md)
identifies browser-only modules, tests that must move to independent runners and
native/shared code to retain, including the `useModalIsolation` hook and caller.

Extend the existing `apps/mobile/e2e/launch.yaml` Maestro setup and `test:native`
command into saved journeys against the actual iOS app/API/disposable database.
Preserve unit/component/repository/API/database tests, coverage floors and fixture
safeguards. Native storage/relaunch, lifecycle, keyboard/modal and transition
evidence must be distinguished from mocks and eventual screen assertions.

Current browser commands and UI requirements below remain active until equivalent
coverage exists and the required native CI gate passes for the authorized pushed
revision, confirmed in hosted check results. Then retire Playwright/Chromium and
unused browser-only adapters/dependencies, update `AGENTS.md` and this guide, and
use native simulator journeys/interactive checks for future UI changes. Historical
browser evidence stays intact; physical-device/staging release checks remain open.
This is a scheduled migration, not a claim that native CI or full journeys exist.

## Commands

Use the pinned Node/npm versions in README. Run heavy commands sequentially on
the development Mac.

```sh
npm run check
npm run db:local
npm run db:migrate
npm run test:db
npm run test:coverage
npm run export:web -w @justgo/mobile
npm run export:ios -w @justgo/mobile
```

`check` first runs the pinned mobile Expo Doctor with fresh online version metadata,
then builds contracts, typechecks, lints, checks formatting and runs architecture,
API unit, mobile component/controller and contract tests. `test:db` exercises real
PostgreSQL transactions, ownership, isolation, idempotency, reflections and history,
then runs the isolated migration/restoration rehearsal.
It refuses non-loopback hosts and databases other than the disposable `justgo_test`.
Never point fixtures at staging/production or real private data.

For quick feedback, pass `-- --runTestsByPath src/...test.tsx` to the mobile test
script or `-- path/to/test.ts` to the API/contracts Vitest scripts. Run focused
checks during each extraction and the full commands before handoff.

`test:coverage` builds contracts, runs each workspace sequentially and enforces
`scripts/quality/coverage-thresholds.json` through `coverage:check`. The API coverage run
includes the database suites and migration rehearsal plus unit tests, so it requires the same migrated
local database. Individual workspace `test:coverage` commands produce reports;
run the root command for the combined gate. Reports are ignored generated output
under `coverage/{mobile,api,contracts}/`: HTML, LCOV and count-based JSON summaries.
CI runs the same gate after provisioning/migrations and uploads reports even on
failure. The V8 provider is pinned to the existing Vitest version; Jest uses its
existing Istanbul support. No production dependency was changed.

Both database tests and API coverage require `DATABASE_URL` for the restricted
runtime role, `MIGRATION_DATABASE_URL` for fixture setup/cleanup, and the local SSL
setting. CI reuses one database environment mapping for migrations/database tests
and coverage, so those steps cannot drift apart. Ignored local `.env` files are
absent from a fresh runner: check each new CI command's full prerequisites and
inspect the hosted result for the pushed commit before calling its gate verified.
Keep the loopback/test-database safeguards enabled.

## Before publication

Run `npm ci` in a clean checkout and `npm run check`; CI runs the same root
command immediately after installation. Its first step is
`npm run doctor -w @justgo/mobile`, which bypasses Expo's dependency metadata
cache with `EXPO_NO_CACHE=1`. The doctor remains pinned in the root lockfile.
A failed dependency check stops the command before build/test work begins.
The command tests protect this early stop, fresh metadata and nonzero exits.

Rerun the standalone doctor immediately before an authorized push after longer
verification sessions. Review any recommended SDK patch changes, update the exact
package pins and root lockfile together, then repeat the relevant checks/exports.
The lockfile fixes installed versions, not Expo's live compatibility guidance;
a recommendation released between local verification and CI can still cause a
new failure. Do not use offline mode, dependency exclusions or validation bypasses
to hide it. Required native build/device evidence remains separate from exports.

## Coverage policy

The dedicated folder cleanup keeps the same checks and floors. Script
implementations now live in `scripts/quality/` and `scripts/journeys/`, API test
commands select their capability subfolders, and journey helpers live in
`e2e/support/`. The public-contract upload regression checks every reachable
module and its explicitly allowed parent directories. Read
[FOLDER_STRUCTURE.md](../architecture/FOLDER_STRUCTURE.md) and the
[cleanup handoff](../handoffs/project-folder-cleanup.md) for the path inventory
and evidence. Historical 07.3 browser proofs now live under
`checks/phase-07-3/browser/` and native proofs under `checks/phase-07-3/simulator/`.

All `src/**/*.ts` / mobile `src/**/*.tsx` production files are included, even when
not imported by tests. Only test files and declaration-only `.d.ts` files are
excluded within those trees. Route wiring, development previews, API bootstrap
and the Drizzle schema stay visible, including zeros. Configuration, build scripts,
SQL, assets and Swift are outside this JavaScript coverage metric; use architecture
tests, database tests, bundle exports and native/device evidence for those areas.
No blanket 100% goal or ignore-coverage pragmas are used.

| Workspace             | Branch floor | Line floor | Statement floor | Function floor |
| --------------------- | -----------: | ---------: | --------------: | -------------: |
| Mobile                |          79% |        85% |             84% |            80% |
| API (unit + database) |          82% |        84% |             83% |            76% |
| Contracts             |          95% |        95% |             95% |            95% |

Floors were selected from the fresh 06A baseline/final runs with less than one
percentage point of branch headroom. Critical-file floors apply independently:
provider and native vault 95% branches/lines; account client 85% branches / 95%
lines; HTTP 82% / 94%; Progress as a group 90% / 92%. Existing controllers also
have separate floors so higher presentation coverage cannot hide regressions.
Database service branch floors are 85% for identity/challenges and 95% for
reflections/history. The JSON file owns exact thresholds.

The provider's selector follows its current `src/app-support/providers/AppProvider.tsx`
location at the unchanged 95% branch/line floor. Identity vault/storage/controller
selectors likewise follow their moved `src/app-support/identity/` paths, with every
existing floor preserved. App-support and `dev/previews/` files
remain included in all-source coverage. The preview-route regression proves that
production rendering redirects without loading developer fixtures; import-boundary
tests cover production loaders, app-support/data/shared direction and allowed consumers.

The checker uses covered/total counts (not rounded percentages), weights grouped
files by branch count and fails when a critical path or all source entries are
missing. Zero-total metrics are valid only in a report containing source files;
an empty report cannot satisfy the gate. Its own tests protect those failure
modes. Keep these floors or ratchet them upward as behavior
coverage improves. A moved file must update its selector. Explain any justified
threshold/exclusion change in the handoff/PR with before/after reports; do not lower
floors to make failing changes pass. Review uncovered _behaviors_, not just totals:
executing a Zod schema declaration can give full line coverage without testing its
validation. Contract validation and owner-isolation tests remain required evidence.

## Async tests and UI evidence

Provider tests mount the actual provider, identity/controller and account client,
using controlled vault/fetch/native AppState doubles. Fake timers control polling
and expiry; unmount/cancel/clear and flush queued callbacks before restoring them.
Progress query tests retain one controllable promise for a request and await the
visible result. Before changing an account's transport fixture, await its previous
focus refresh; observe the new account's request before resolving it and assert
the new account's distinct totals. Fake timers control scheduled TanStack
notifications; drain them inside async React `act` after unmount/cancel/clear,
before restoring the global notifier and real timers. Do not suppress console
warnings or use arbitrary waits.
Keychain adapter tests prove JavaScript payload validation and module/error wiring;
they do not prove native entitlements, Apple synchronization or physical recovery.

After tests pass, verify affected UI with Browser Use in the in-app side panel and
fix/retest issues. Honor task-specific browser preferences; when the owner requests
side-panel-only testing, document unavailable capabilities instead of switching
to an outside Chrome window. Use the isolated `dev:challenges` entrypoint for live disposable
accounts and `/preview` for named loading/error presentation fixtures. Preview data
never creates user activity or grants production access. Record actual viewport,
flow, fixtures, failures and recovery; keep automated/browser/native claims separate.
The earlier physical-device and staging gates remain in their original handoffs.

Phase 07.1 is split for review. **07.1A** retains application/unit/component,
database, migration-restoration and coverage gates. The **07.1B** saved app/API
journey is on `codex/phase-07.1b-journey-ci`, now authorized for a separate PR
against `main` after the owner merged A through PR #13.
Its root `e2e/` files, environment-guard test, runner, Playwright dependency,
journey typecheck/scripts and browser CI/artifact steps move together. They are
not part of A; `npm run test:journey` is available only on B. No review filters or
coverage floors were weakened to meet the file limit.

B must verify clean service startup/cleanup, disposable accounts/access fixtures,
masked failure artifacts and the actual identity-renewal/catalog/Progress smoke,
then verify its published CI step on the pushed revision. Full completion,
reflection and offline/history journeys remain 07.2–07.5. A one-off side-panel
walkthrough and A's lower-level tests do not replace B's saved journey gate.
Complete both A and B before proceeding to 07.2. The existing mobile Maestro
launch flow is unchanged.

## Saved app/API journey foundation (07.1B)

The owner merged A through PR #13 at `806f57f` and authorized B's push and PR
against updated `main`. The B diff contains only its harness, CI and documentation.
B still requires owner review and separate merge approval. Historical combined
verification does not establish B acceptance.

Use Node 24 and the root lockfile, PostgreSQL 17 tools (including `pg_dump` and
`psql`), and the dedicated database prepared by `npm run db:local`. Install the
pinned Playwright Chromium once with `npx playwright install chromium`; Linux
CI uses `npx playwright install --with-deps chromium`. Then run:

```sh
npm run test:journey
```

The wrapper validates the loopback `justgo_test` database, restricted runtime and
migration roles, local SSL setting and nonproduction environment **before**
migration or service startup. It builds contracts, applies migrations, starts the
isolated fixture API on 127.0.0.1:3000 and Expo on 127.0.0.1:8081, runs the saved
test and shuts its services down. Expo starts with `--localhost`; a saved test
checks that neither service accepts connections on local non-loopback IPv4
interfaces. Keep both ports free; it refuses to reuse an
unknown running server. Local settings come from the ignored `apps/api/.env`;
CI supplies the same explicit database mapping used by database/coverage tests.

The saved case creates and renews a real disposable account in the app, opens its
challenge deck and Progress, and checks the database. Fixture cleanup deletes
only account UUIDs allocated by this run's isolated fixture API. The trusted
registry is independent of browser requests and response delivery, so rejected
requests and successful recovery of pre-existing accounts cannot nominate cleanup
targets. Its read-only endpoint is absent from the deployable API. Failed creation
transactions can leave registry UUIDs without rows; deleting those is a harmless
no-op. Registry failures fail teardown instead of falling back to browser IDs. The dedicated
fixture server grants isolated test access and upload eligibility; deployed API
startup has no such provider. Browser storage remains memory-only in 07.1.

This automated browser runs headlessly. Interactive walkthroughs use the Codex
side panel, under the same fixture API/Expo configuration. These are separate
evidence types; neither proves native Keychain behavior. No external browser
window is required. Later subphases extend this harness with local storage,
controlled failures, completion/reflection and Progress assertions.

Failure output is under `.local/journey-results` and `.local/journey-report`.
Network traces, videos and automatic screenshots are disabled because they can
retain credentials. The fixture captures a masked UI screenshot on failure;
never add real account data or token logging. Both test failure and service
startup failure make the command fail. CI uploads these artifacts and enforces
the saved smoke step alongside the existing checks. CI also requires a nonempty
`.local/journey-report/index.html`, preventing a report-directory mismatch from
silently dropping the HTML report and its screenshot attachments.

## Migration preservation rehearsal (07.1)

`npm run test:migrations` runs the standalone rehearsal; `test:db` includes it.
It builds migrations 0000–0009 in a uniquely named disposable schema within
`justgo_test`, compares the restored Drizzle metadata with PostgreSQL, seeds
synthetic history and creates a temporary SQL snapshot with PostgreSQL 17
`pg_dump`. It verifies expansion 0010, compatibility index 0011 and historical
blank-text normalization 0012, rehearses the unregistered contraction, restores
the snapshot using `psql`, reapplies the migrations and compares preserved
history again. Normalization preserves nonblank text, receipts, revisions and
timestamps, and rejects invalid blank-only/no-feeling submissions atomically. Its schema and snapshot are removed after the test. Production
`justgo`/Drizzle migration state is not reset. The contraction SQL under
`apps/api/scripts/rehearsals` is not a deployable migration; 07.5 owns its final
review and acceptance. Set `JUSTGO_PG_BIN` when PostgreSQL 17 tools are not on
PATH or in the standard Apple Silicon Homebrew directory.

## Enforced code boundaries

`justgo/import-boundaries` covers static imports, named/star re-exports, dynamic
`import()`, literal `require()` and TypeScript import assignments. It resolves
relative traversal before checking app/shared boundaries. Computed loader paths
must be made literal so they can be reviewed. Literal asset imports, Jest factories
and the development-only preview remain allowed. Architecture fixtures exercise
both allowed and rejected paths and fail on parser errors.

Production TypeScript uses project-aware `no-floating-promises`,
`no-misused-promises` (including void UI handlers) and `await-thenable`. `void` marks
intentional background work; it does not handle rejection. Controllers catch and
publish their UI errors, and TanStack queries retain their own retry/error state.
Document that ownership at non-obvious call sites; do not add broad disables.

References: [Vitest coverage](https://vitest.dev/guide/coverage.html),
[typescript-eslint promise handling](https://typescript-eslint.io/rules/no-floating-promises/),
[misused promises](https://typescript-eslint.io/rules/no-misused-promises/), and
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).

## Phase 07.2 repository and transport evidence

07.1A/07.1B are merged; the prior review-stage restrictions above are historical.
The 07.2 branch adds deterministic journal/storage/sender/transport tests to the
normal mobile test and coverage commands. The production modules and colocated
tests now live under `apps/mobile/src/data/activity/`. Boundary regressions enforce
features → data → shared infrastructure/contracts, with no data-to-UI or
shared-infrastructure-to-data dependency. `npm run test:journey` also rebuilds
`.local/journey-repository.mjs` with pinned esbuild from the production repository
and transport sources, then runs three repository/API/database cases alongside
the existing four cases. `npm ci` supplies the build dependency; no ignored local
artifact is a prerequisite. The Node bundle resolves Expo/CommonJS versus contract
ESM loader boundaries and contains no native/UI adapter.

Storage failures, offline/reconnect, dropped responses and controlled clocks/randomness
are injected at the repository/transport boundary, never exposed as production flags.
The database fixture owns cleanup for browser and repository-only tests. Safe size/
serialization measurements are attached to the HTML report. These saved cases do
not establish the new completion/reflection UI journey or native AsyncStorage
durability. 07.3 adds app integration and side-panel checks. The October 6 owner
session installed an updated EAS simulator app with AsyncStorage and NetInfo;
native saving/relaunch evidence remains open. The default tools path does not
expose `simctl`; command-scoped `DEVELOPER_DIR` selects the existing full Xcode
without changing system configuration. See the [07.2 handoff](../handoffs/phase-07-2-local-sync.md)
and [07.3 simulator setup](../handoffs/phase-07-3-local-flow.md#october-6-simulator-reuse-and-owner-test-setup).

## Phase 07.3 local app journeys and presentation

`npm run test:journey` runs nine actual-app cases in `e2e/local-flow.spec.ts`
alongside the seven existing cases. They verify local-only start/give-up, completion
and explicit reflection before HTTP acknowledgement, delayed local writes and
duplicate activation, newer typing during dirty-close Save, offline reload with
same-account recovery and empty Skip, memory-only warning/dismissal/full recovery,
expired-session replay, confirmed cloud fallback for both completion/reflection
when phone writes fail, first-download/refresh recovery, and retained rejected-reflection correction deferred until Give up, and exclusive active navigation/unfinished reload reset. Assertions use the
real disposable database. Browser identity remains memory-only; reload recovery
uses the synthetic bootstrap proof in test memory and masks credential fields in
failure artifacts. It does not establish native Keychain/AsyncStorage durability.

The journey web server sets `JUSTGO_JOURNEY_FIXTURES=1`. The separate Metro build
seam validates the existing loopback/database/role/nonproduction safeguards before
substituting the controllable journal-write adapter, only for web AppProvider.
Normal/native/production resolution remains the default. Architecture tests cover
the seam and refusal cases. There are no product UI fault controls or production
access bypasses. The existing hosted journey step already runs the full suite;
07.3’s hosted result cannot be claimed until publication is authorized and that
commit’s checks pass.

Interactive side-panel evidence lives in [the 07.3 handoff](../handoffs/phase-07-3-local-flow.md).
Only disposable registry-owned accounts were used and cleaned up. NetInfo 12.0.1,
Sonner Native 0.27.0 and Sonner 2.0.8 match the pinned stack and pass Expo doctor.
The owner-requested October 6 EAS simulator build includes AsyncStorage/NetInfo;
native launch and active countdown/Give up were checked on the reused QA device.
Keep native saving/relaunch, background/lock countdown, keyboard/toast/modal,
VoiceOver/scalable-text/reduced-motion checks open until evidenced; earlier
physical-device/staging gates remain open. The brief native smoke check and owner
manual session are separate from saved end-to-end tests and hosted CI.

## Phase 07.4 Progress evidence

`npm run test:journey` adds five cases in `e2e/progress-flow.spec.ts` to the
16 retained cases: 10 + 1 reconciliation through acknowledgement/restart with
inline Add/Edit; today's paging/offline cache and older-history restrictions;
ten memory-only completions/recovery; definitive rejection retaining submitted
writing through restart; and historical Add/Edit after accepted-record pruning.
Repository/component tests cover independent reads, rollover, stale revisions,
generation/account fences, streak context and dirty-close/save races. The fixture
API uses a unique identity rate namespace per run; actual rate limits remain intact.

The [07.4 handoff](../handoffs/phase-07-4-progress-history.md) records the final
21-case pass, coverage and serialization measurements. Side-panel browser checks
and the existing native app's simulator Add/Edit/save/relaunch are separate
evidence. Native hardware-keyboard HID typing does not establish software-keyboard
layout or physical-device/VoiceOver/radio/backup acceptance. 07.3A remains deferred;
retained browser CI runs this extended suite; Anthony authorized Phase 07.4
publication on October 8, and its published-revision hosted result still needs
inspection. 07.5 owns final cutover and integrated acceptance.
