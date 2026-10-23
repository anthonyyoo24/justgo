# Testing and quality safeguards

[AGENTS.md](../../AGENTS.md) owns coding/verification rules. This guide owns the
commands, isolated environments and evidence types used to enforce them.
The [handoff index](../handoffs/README.md) records actual results and open gates;
[the plan](../implementation-plan/README.md) owns future acceptance work.
Documentation-only changes do not require code tests or UI checks.

## Choosing checks

Use the pinned Node/npm versions from the root manifests and `.nvmrc`. Run heavy
commands sequentially on the development Mac. During a slice, run inexpensive
focused tests/typechecks for the changed behavior and affected consumers; correct
failures before extending the implementation. Review important uncovered branches
without automatically collecting whole-project coverage after every edit.

Choose the scope before running checks. Classify the actual behavior and boundary
changed, rather than the directory, phase label or presence of a handoff edit.
A routine follow-up does not reopen phase closeout.

| Change                               | Default verification                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Documentation only                   | Scoped formatting, local links and consistency with the owning rules; no app tests, builds or UI checks.                                                                                                                                                                                                                                                                                                                                         |
| Routine contained fix                | Meaningful regression tests for affected behavior, success/failure cases and consumers; affected workspace typechecks, repository lint and changed-file formatting. Run saved critical journeys affected by the change; add one grouped in-app walkthrough for UI behavior changes.                                                                                                                                                              |
| Boundary or configuration change     | Widen checks to the affected consumers and boundary failures. Contracts, tsconfig, ESLint or `e2e/support` changes require the root contracts build and all-workspace typecheck. Backend/shared protocol or data-boundary changes require `test:db` against loopback `justgo_test`, including applicable ownership, replay, failure and migration/policy cases. Dependency/native changes retain applicable Doctor, build and device acceptance. |
| Actual phase closeout or publication | Full `check`, full coverage and applicable saved journeys/exports; `test:db` at phase closeout and for backend/shared boundaries. Publication also requires fresh online dependency validation and Doctor immediately before pushing. Keep required hosted, staging and physical-device gates.                                                                                                                                                   |

Routine fixes do not automatically run the full root suite, Doctor, aggregate
coverage, database suites, all journeys or both platform exports. Expand for a
concrete failure, affected boundary/configuration, explicit owner request or
required phase/publication gate; briefly state the trigger without adding an
approval checkpoint. Keep meaningful regression coverage, thresholds and affected
consumers intact. After the scoped checks, relevant UI verification, fixture
cleanup and changed-directory review pass, finish without optional extra checks.

| Command                                | Purpose                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run test -w <workspace>`          | Workspace unit/component/contract tests; API default excludes database integration                        |
| `npm run typecheck -w <workspace>`     | Focused TypeScript; mobile generates route types, then checks source and tests separately                 |
| `npm run lint`                         | Repository lint and dependency-direction rules                                                            |
| `npm run test:architecture`            | Tooling, boundary, fixture and quality regressions                                                        |
| `npm run check`                        | Fresh online Expo Doctor, contracts build, all typechecks, lint, format, architecture and workspace tests |
| `npm run db:local`                     | Prepare isolated local PostgreSQL roles/database                                                          |
| `npm run db:migrate`                   | Apply registered migrations using the migrator connection                                                 |
| `npm run test:db`                      | Real database services/policies plus migration/restoration rehearsal                                      |
| `npm run test:coverage`                | All-source workspace coverage, including database suites, then combined floors                            |
| `npm run test:journey`                 | Saved actual-app/API/database browser and repository journeys                                             |
| `npm run test:migrations`              | Standalone preservation/restoration rehearsal                                                             |
| `npm run build:legal`                  | Build local static legal candidates; `-- --production` refuses unapproved source/date metadata            |
| `npm run export:web -w @justgo/mobile` | Cold web export                                                                                           |
| `npm run test:exported-web`            | Smoke the existing production web export without API/database traffic                                     |
| `npm run export:ios -w @justgo/mobile` | Cold iOS JavaScript/assets export                                                                         |

Legal-reader regressions run with `node --test sites/legal/*.test.mjs` and are included
in `test:architecture`. The public Markdown blocks, independent document labels, link
safety and approval/date checks are verified without a hosted deployment. The
local static output still needs an in-app browser readability/navigation check;
that is separate from anonymous HTTPS phone verification after publication.

Pass `-- --runTestsByPath src/...test.tsx` to the mobile test script, or
`-- path/to/test.ts` to API/contracts Vitest scripts, for focused tests. A slice
changing contracts, tsconfig, ESLint configuration or `e2e/support` also runs
`npm run build:contracts && npm run typecheck` at the root, covering all consumers
and journeys. Use the scope matrix above for broader gates; editing a handoff is
not itself a phase-closeout trigger. A mobile UI/navigation fix alone does not
change a server protocol or data boundary. Earlier native/staging gates stay open
until evidenced.

Account for checks included in broader commands instead of repeating a passed
standalone check merely for final reporting. Repeat when inputs changed, results
are stale or a failure needs investigation. Required phase/publication commands
still run in full; overlapping internals do not authorize skipping their gates.

## Type and lint environments

Mobile `typecheck` generates fresh Expo route declarations before checking
`tsconfig.json` and `tsconfig.tests.json`. Generation removes the previous route
declaration and fails if Expo produces no valid replacement; ignored `.expo/`
output cannot make a clean checkout pass with stale routes. The tracked route-type
fixtures are checked by the test program.

The source program admits React, React Native and Expo types, including Expo's
public environment declarations. Jest globals and Node APIs belong to the separate
test program. Root tooling/API use the pinned Node 24 declarations; installing those
types must not make `Buffer`, `__dirname` or Jest globals available to mobile source.
The ambient-type regression checks that separation.

ESLint applies type-aware rules for promises, exhaustive switches, throwing Error
objects, unnecessary assertions and redundant unions to production TypeScript. Non-null
assertions warn. Mobile React rules protect list keys, nested component definitions
and leaked conditional rendering. Testing Library rules require awaited async
queries/utilities and reject awaited synchronous queries or promises passed to
`fireEvent`; native renderer `findByType` inspection remains synchronous. Focused
lint fixtures prove that each configured rule detects its intended failure.

Relative imports in API/contracts TypeScript use `.js` for NodeNext's emitted
modules. Metro app imports omit the extension so platform resolution can select
native/web adapters; a test may explicitly name the adapter it is exercising.
Directly executed Node tooling names the actual runtime extension (`.mjs`, or `.ts`
when Node executes that TypeScript directly). Keep public contract imports through
`@justgo/contracts`; update imports without rewriting SQL or other data strings.

Mobile Jest uses one worker locally and two in CI, configured in
`apps/mobile/jest.config.cjs`; package scripts leave that choice to Jest. Workspace
commands still run sequentially on the development Mac. Split suites keep tests
beside their owner and reusable fixtures under mobile `test-support/` or API
`tests/<capability>/fixtures/`. Preserve timer/subscription/query cleanup when
extracting fixtures. The migration rehearsal remains one ordered test.

## Isolated database environment

Database tests, API coverage and journeys require `DATABASE_URL` for the restricted
`justgo_runtime` role, `MIGRATION_DATABASE_URL` for fixture setup/cleanup, and
`DATABASE_SSL=disable`. They refuse non-loopback hosts and databases other than
`justgo_test`. Validate both URLs with the shared `localTestDatabaseUrl` guard
before creating pools; reject query parameters and fragments because connection
options can override the apparent host, database or role. Use disposable synthetic
data only; never point fixtures at staging,
production or private accounts. Keep PostgreSQL service suites serialized where
shared catalog fixtures require it.

Use PostgreSQL 17 client tools, including `pg_dump` and `psql`. `JUSTGO_PG_BIN`
selects their directory when not on PATH or in the standard Apple Silicon Homebrew
location. Fresh CI runners cannot rely on ignored `.env` files or prior generated
artifacts. Supply the full database mapping consistently to migrations, database
coverage and journeys. Inspect hosted results for the pushed commit before marking
a gate verified.

## Coverage policy

Run the full aggregate gate at actual phase closeout and before publication.
Run it earlier when coverage configuration, source inclusion/exclusion rules,
critical selectors or thresholds change in a way that can invalidate the gate,
or when an affected boundary, concrete failure or owner request requires it.
Ordinary files or branches under unchanged coverage rules do not alone trigger
whole-project coverage. Review important affected branches and use focused
coverage when needed; never exclude an affected consumer or lower a floor to
make a focused run pass.

The root coverage command builds contracts, runs workspaces sequentially and
enforces [coverage-thresholds.json](../../scripts/quality/coverage-thresholds.json).
API coverage includes unit/database suites and the migration rehearsal, so prepare
the same local database first. Individual workspace coverage scripts generate
reports; the root command applies the combined gate. Reports are ignored generated
output under `coverage/{mobile,api,contracts}/`, with HTML, LCOV and JSON summaries.
Jest uses Istanbul; Vitest's V8 provider is pinned with its Vitest version.

CI collects API unit and database coverage separately with the same Vitest source
configuration. The unit producer excludes `*.integration.test.ts`; the database
producer selects those files, including the single migration rehearsal. Each writes
its own report and Vitest execution blob. The final `checks` job requires both
nonempty blobs and merges their execution maps with Vitest without rerunning tests.
It does not add percentages or overlapping JSON summaries. Unimported production
source remains in the merged API report, and the normal global/critical checker
runs against the union together with the mobile/contracts reports. Missing producer
results or artifacts cannot make partial coverage pass.

All production `src/**/*.ts` and mobile `src/**/*.tsx` files count, including
unimported source. Only tests and declaration-only files are excluded inside those
trees. Routes, preview wiring, API bootstrap and schema remain visible, including
zeros. SQL, Swift, scripts, configuration and assets need their appropriate
database/tooling/bundle/native evidence rather than a misleading JS coverage claim.

| Workspace             | Branch floor | Line floor | Statement floor | Function floor |
| --------------------- | -----------: | ---------: | --------------: | -------------: |
| Mobile                |          79% |        85% |             84% |            80% |
| API (unit + database) |          82% |        84% |             83% |            76% |
| Contracts             |          95% |        95% |             95% |            95% |

Independent critical selectors protect the provider and native vault (95% branches/
lines), account client (85%/95%), HTTP (82%/94%), Progress as a group (90%/92%),
identity/challenge services (85% branches), retired private PATCH boundary (95%/99%) and Progress
resources (95%/96%). Controllers/storage retain their own floors. The JSON file
owns exact paths and thresholds; a move must update its selector without lowering
protection.

The checker uses covered/total counts instead of rounded percentages and weights
groups by branch counts. Missing critical paths, missing all source and empty
reports fail. Zero-total metrics are valid only with actual source entries. Do not
use ignore pragmas or reduce floors to make a failing change pass. Explain any
justified change with before/after evidence and review uncovered behavior: executing
a schema declaration does not establish input rejection or ownership isolation.

## Async tests and boundary regressions

Provider tests mount the actual provider/controller/client with controllable
vault/fetch/AppState boundaries. Fake timers govern expiry/polling. Unmount,
cancel, clear and flush queued callbacks before restoring real timers. Controllers
constructed before hydration must be tested across slow hydration and the
construction-to-subscription gap, preserving newer input.

Progress tests retain observable request promises. Await the old account's focus
refresh before replacing its transport fixture; observe the new account's request
before resolving it and assert distinct totals. Drain TanStack notification timers
inside async React `act` after unmount/cancel/clear, before restoring global notifier
state. Never suppress unexpected warnings or add arbitrary waits to hide races.

`justgo/import-boundaries` checks imports, re-exports, `import()`, literal
`require()` and TypeScript import assignments, resolving relative traversal.
Computed loader paths must become literal/reviewable. Literal assets, permitted
Jest factories and guarded previews stay allowed; fixtures fail on parser errors.
The type-aware lint rules above reject unhandled/misused promises and invalid
awaits. `void` denotes intentional background ownership; it does not catch rejection.
Controllers/query layers must already handle the failure.

Keychain tests establish JS schema/module/error wiring, not native entitlement,
iCloud synchronization or physical recovery. When switching native worktrees,
compare persisted schemas and preserve newer recovery/deletion metadata. Rejection
can surface as generic secure-storage failure; resetting Keychain or loosening
validation is not a fix. Use synthetic compatibility/account-preservation fixtures.

## Saved app/API/database journeys

The Playwright suite exercises the actual browser app/API/disposable database and
bundled production repository/transport. It covers explicit saving/Progress,
offline/reconnect, completion write-failure/cloud fallback/memory recovery, lost
completion acknowledgements, durable private saves with no cloud fallback,
ordered local reflection edits, legacy boundary regressions, aggregate reconciliation,
offline saved history, guest entry, managed sign-in/logout/account ownership,
signed-in completion/journal sync, complete data download/import and deletion.
External Apple/Google authorization is replaced only at the guarded provider
boundary; the app's managed controller, canonical API mapping, owner transactions,
database RLS and sync routes are real. No external-provider/native claim follows
from that seam. Saved journeys are distinct from presentation fixtures,
one-off interactive walkthroughs and native checks.

Install pinned Chromium with `npx playwright install chromium`; Linux CI uses the
shared setup action to install system dependencies on every run and Chromium on
browser-cache misses. Run the full root journey command or pass a saved spec, for
example:

```sh
npm run test:journey -- e2e/data-export.spec.ts
```

The wrapper validates the nonproduction loopback database/roles/SSL before any
migration or service startup. It refuses occupied fixture ports rather than reusing
an unknown server, builds contracts and the production repository bundle, migrates,
and starts its owned fixture API/Expo services. Defaults are 127.0.0.1:3000 and
127.0.0.1:8081; `JUSTGO_JOURNEY_API_PORT` and `JUSTGO_JOURNEY_APP_PORT` can select
distinct unprivileged ports. Expo uses `--localhost`; regression checks probe those
configured service ports and reject non-loopback binding. Select separate fixture
ports when a phone development server is using LAN port 8081. Startup/assertion
failures fail the command and owned services are stopped.

Do not assume CLI API overrides defeat Expo's virtual dotenv environment. Preserve
the guarded public-environment adapter and request-origin fence, and validate the
browser's resolved API origin as well as database settings. Synthetic proofs must
never reach hosted APIs. The `JUSTGO_JOURNEY_FIXTURES` Metro seam permits controlled
journal failures and the synthetic managed provider only for guarded web fixtures;
normal/native/production resolution cannot load those adapters. The fixture API
injects its run-owned provider verifier, live-session reader and hard-delete
adapter. It retains legacy endpoints only for repository compatibility tests.
Guest catalog access uses the explicit disposable fixture beta policy. There are
no product UI failure switches or production paid-access bypasses.

Completion AsyncStorage and private IndexedDB fault seams are independent. A
private commit failure must retain the editor input, report the phone save failure
and make no PATCH/fallback request. The outbound fixture fence allows only strict
completion POST payloads for attempt mutations and reports method/path without
private bodies. Managed completion import and private journal delivery use their
own strict restore/sync contracts, never the retired private PATCH. Journal adapters have transaction, rollback, account-fencing,
concurrent edit/import, deletion and relaunch regressions; native adapter tests
use Node SQLite and cannot establish iOS file protection or OS interruption.

Backup tests cover the complete versioned data-only ZIP, full history, writing,
preserved alternatives/preferences, bounds/CRC/UTF-8/schema/frozen-context and
owner validation, cancellation, missing/identical/conflicting records, rollback
and replay without duplicate reps or raw queue import. Compatible journal-only
files preserve private context without fabricating completion counts. Browser
journeys exercise downloaded files and actual IndexedDB reloads. Signed Files /
iCloud Drive, temporary-file/device-backup and actual optional private CloudKit
multi-device/account-change/quota/deletion evidence remain separate gates in
[account/sync setup](ACCOUNT_SYNC_SETUP.md) and the
[rollout runbook](LOCAL_JOURNAL_ROLLOUT.md#device-and-manual-file-acceptance).

Journey builds enable the real Sentry SDK with a fixed fake ingestion key and
intercept all hosted Sentry requests. `diagnostics.spec.ts` inspects scrubbed
payloads for route errors and unhandled rejections and verifies root recovery even
when ingestion returns 503. Unit/component suites use the explicit SDK boundary
mock; those mocks do not establish real SDK or native behavior. Any real-provider
probe must use disposable synthetic errors only, with ordinary delivery disabled.

The fixture registry owns every created account UUID independently of browser
requests and response delivery. Teardown deletes only that registry's accounts;
registry failure fails cleanup instead of trusting browser IDs. Failed creations
can leave absent rows, safely deleted as no-ops. The registry endpoint is absent
from deployable API. Managed provider fixtures retain disposable sessions/opaque
subject handles in browser sessionStorage so reload and returning sign-in can
exercise the actual controller. Only server-allocated run-owned subjects may be
selected; client UUIDs never authorize ownership or teardown. Legacy repository
fixtures retain their separate synthetic proof behavior. This is no native token
storage or real OAuth acceptance evidence.

Before each database-backed case, reset only the fixture run's three hashed rate
buckets: identity, recovery and managed Auth. Keep real limits active during each
case and retain unrelated buckets.
Cases that exhaust an identity allowance cannot contaminate the next case. No
production rate limit or cleanup authority changes.

Seed dated activity inside the browser's intended local day using
`e2e/support/seed-times.ts`; counting backward from wall-clock now crosses midnight
in UTC CI. Use deliberate previous-month fixtures when a case needs an older
month, including on the first day of a month or year. Managed full-history download
persists completion history and private versions; previously downloaded history
and guest/signed-out writing remain available offline beyond the current month.
Data never downloaded to that phone still requires a connection. Journal-only
history must not invent completion counts. Test these cases independently. Layout assertions wait for usable controls
and retry fresh geometry after navigation;
missing/detached controls keep failing. Preserve alignment limits rather than adding
sleeps or weakening assertions.

Failures produce `.local/journey-results` and `.local/journey-report`. Traces,
videos and automatic screenshots are disabled because they retain credentials;
only masked UI failure screenshots are permitted. Reports must include a nonempty
`index.html`; CI uploads report/attachments and treats missing required output as
failure. The repository bundle is rebuilt with pinned esbuild; an ignored prior
artifact is never a prerequisite.

## Production exported-web smoke

Build the ordinary production web export, then run the independent smoke suite:

```sh
npm run export:web -w @justgo/mobile
npm run test:exported-web
```

The smoke requires the resulting `apps/mobile/dist/index.html`. It starts its own
loopback static server at `127.0.0.1:8093`; `JUSTGO_EXPORTED_WEB_PORT` may select a
different unprivileged port. It never reuses an existing server. The server serves
exported assets and falls back to `index.html` for route navigation, rejecting API
paths, hidden files and paths outside the export directory. No API/database, journey
fixture flags or account creation are prerequisites.

The request fence permits only that static origin and rejects every `/v1` request.
The suite checks supporting routes, unknown-link recovery, absent development
controls, browser errors and asset failures without sending account credentials.
It has its own Playwright configuration and a five-minute suite limit; the regular
journey configuration excludes this spec and has a twenty-minute suite limit.

Reports are `.local/exported-web-report/index.html` and
`.local/exported-web-results/`. CI requires a nonempty HTML report and uploads the
report/results after the smoke, including failures. Traces, video and automatic
screenshots are off.
Run the smoke before `export:ios`, which replaces the same default `dist/` output.
This checks the exported browser app and static assets; native/device evidence
remains separate.

## Interactive browser and native evidence

After relevant tests pass, verify affected UI in the Codex in-app browser side
panel using disposable fixture accounts. Use `dev:challenges` for live isolated
flows and `/preview` for named loading/error presentations. Verify served checkout,
configuration and API origin before reusing a server. Honor side-panel-only requests;
record unavailable capabilities rather than switching browsers against preference.
Keep screenshots/recordings in ignored `.local/` unless explicitly requested for Git.

Group related affected states and screenshots into one walkthrough. Prefer the
existing guarded launchers and saved specs over building a harness for a one-off
fix. Reuse a running fixture only after verifying its ownership, current served
code, configuration and run-specific cleanup authority. Do not adopt another
run's account registry or leave accounts behind when a check fails. The saved
journey wrapper owns its service lifecycle; pass affected specs to that wrapper
rather than bypassing its database guards, request fence or teardown.

Record actual viewport, flow, fixtures, failure and recovery, keeping saved automated
journeys, one-off walkthroughs, native simulator and physical-device evidence separate.
Browser/export/component checks cannot establish Keychain/SQLite/AsyncStorage durability,
OS lifecycle, gestures, software keyboard, VoiceOver, radio/backup, native
Apple/Google OAuth, live hosted Auth revocation/deletion or actual CloudKit sync.
The native module requires a compatible signed binary, real private-container
capabilities and physical multi-device/account-change/failure/deletion checks;
in-memory cloud adapters establish domain decisions only.
Use the [move checks](#file-moves-and-bundle-checks) when module or asset paths change.

The [native-testing checkpoint](../handoffs/phase-07-3a-testing-checkpoint.md) and
[browser assessment](../checks/phase-07-3a-browser-testing-assessment.md) remain the
resume boundary for deferred native automation. Retain Playwright/web adapters,
fixture safeguards and coverage floors until a native replacement proves equivalent
actual-app/API/database cases and its authorized commit's hosted gate. Retain the
Maestro launch smoke (`APP_ID=... npm run test:native -w @justgo/mobile`) and relevant
manual simulator checks meanwhile. Device/staging gates belong in
[Phase 14](../implementation-plan/phase-14-release.md) and the applicable handoffs.

## File moves and bundle checks

Every move updates affected imports, dynamic loaders, test discovery, coverage
selectors, fixtures, assets, packaging/upload allowlists, scripts and documentation
links in the same change. Keep tests and native/web adapter pairs beside their
owner; preserve all boundary checks and coverage floors.

For a small move within the same resolver and packaging rules, run affected
tests, typechecks and import/discovery/packaging checks. Cold-bundle an affected
platform when those checks cannot establish module or asset resolution; both
platform exports are not automatic for every move.

Large moves and platform-sensitive moves affecting adapter resolution,
entrypoints, shared assets or packaging require cold web and iOS exports.
Run the production exported-web smoke after the web export, before the iOS export
replaces `dist/`. Changes to coverage inclusion/exclusion rules or selectors also
follow the coverage policy above.

After source/asset moves, restart the owned running Metro server with `--clear`
and reload the existing installed development app to clear stale module/asset
paths. A separate successful export does not refresh that server's live graph.
Keep functional changes and moves separately reviewable, and review the complete
file lists only in touched directories; unrelated cleanup remains follow-up work.

<a id="migration-preservation-rehearsal-071"></a>

## Migration preservation rehearsal

`test:db` includes the standalone `test:migrations` command. The rehearsal builds
0000–0009 in a unique disposable schema in loopback `justgo_test`, compares schema
metadata and seeds synthetic history. It saves a SQL snapshot, verifies expansion
0010, compatibility index 0011 and normalization 0012, stops legacy writes for final
comparison, and applies registered contraction 0013.

Compare completed IDs/owners/frozen dates/starts, owner-matched submitted feeling/
text/revisions and inactive references. Prove legacy removal and runtime ownership,
restore the snapshot with `psql` and reapply forward migrations/comparisons. Verify
clean-database migrations and immutable 0000–0012 hashes. Draft/skipped records and
old action receipts retire; nonblank submitted text/revisions survive and blank
text normalizes to null. Temporary schema/snapshot teardown leaves application
state intact and writes no credentials/private content to artifacts.

This is a local/CI acceptance tool, not deployment authorization. The
[cutover/old-client/restore runbook](FOUNDATION.md#phase-07-coordinated-cutover-and-old-clients)
owns operational rollout and recovery.

The forward chain verifies 0019's historical instruction snapshots, byte-preserved
old journal/receipts and private column write freeze before applying the separate
0020 owner-approved old-server-private reset. That reset preserves identity,
completion context/history and phone journals. The rehearsal then checks 0021
managed mappings/sessions/epochs/immutable private versions/tombstones, 0022
independent historical journal context and 0023 durable Auth deletion cleanup,
including clean installation through the current journal and snapshot metadata.
API integration covers real runtime-role owner isolation, immutable/idempotent
completion and version sync, epoch/tombstone rejection, orphan journal context,
legacy linking/revocation and lost-response/provider-cleanup account deletion.
Injected provider boundaries establish application behavior, not real hosted Auth
provider capability. The [Phase 13 rollout](LOCAL_JOURNAL_ROLLOUT.md) and
[account setup](ACCOUNT_SYNC_SETUP.md) keep hosted changes separately authorized.

## Publication and hosted CI

Before publication, install with `npm ci` in a clean checkout and run `npm run check`.
Doctor uses fresh online metadata (`EXPO_NO_CACHE=1`) and stops the command early
on dependency incompatibility. Recheck Doctor immediately before an authorized push
after longer sessions. Update exact package pins and the root lockfile together;
never hide live metadata changes with offline mode/exclusions. Native/device
acceptance for changed dependencies stays separate.

CI runs on pull requests and pushes to `main`, cancels superseded PR runs and keeps
each main commit's result. Five producer jobs run independently:

- `static`: online Doctor, contracts/type/lint/format/tooling checks and the API
  production-dependency audit.
- `unit`: mobile, contracts and API unit suites with coverage.
- `database`: isolated PostgreSQL setup, migrations and every API integration suite,
  including the migration rehearsal, with coverage.
- `journeys`: isolated PostgreSQL and the actual app/API/database journeys. Their
  wrapper owns migration and fixture service startup.
- `exports`: production web export, its independent static smoke, then iOS export.

The final `checks` job runs even when a producer fails, is skipped or is cancelled;
any such result fails the aggregate status. After all producers pass, it downloads
the coverage artifacts, merges the API execution maps and enforces the unchanged
all-source/global/critical floors. Suites execute once rather than being repeated
by root coverage or database commands. Coverage uploads run when their collection
step executed, including failures; missing reports then fail upload. Tooling tests
protect producer dependencies, failure handling, artifact paths and coverage union.

Local setup actions share pinned Node/npm installation, isolated database roles and
Playwright setup. Chromium binaries are cached by runner OS and installed Playwright
version; Linux system dependencies are installed even on cache hits. A cache is not
correctness evidence or a measured speed improvement. Jobs and Playwright suites
have explicit timeouts; local heavy workspace commands remain sequential.

External GitHub Actions use commit SHA pins with readable version comments.
Dependabot checks npm and Actions weekly, groups compatible npm minor/patch updates
and leaves npm major upgrades for manual scope/native acceptance. Updates do not
merge automatically. The audit gate is scoped to API production dependencies:

```sh
npm run audit:api
```

The helper projects the API's declared production graph from the shared lockfile
into a temporary workspace, preserving locked versions, integrity, nested
resolution and workspace dependencies. Normal dependencies, available optional
runtime dependencies and required peers remain included. Optional peers supplied
solely by another workspace (such as Drizzle's unused Expo SQLite driver) do not
become API roots; a provider declared or required by the API graph is included.
Manifest/lock drift and missing required packages fail closed. Ordinary npm audit
runs with the unchanged low severity threshold and propagates failures; no advisory
is filtered or ignored. This audit does not establish mobile/tooling dependency
health or inspect the deployed Vercel artifact. Those remain separate release
responsibilities.

The workflow and setup actions own exact job limits, versions and prerequisites;
clean runners must not rely on ignored environment files or existing artifacts.

For split/stacked changes, verify each exact publication candidate. Checks from a
combined feature branch do not transfer to an older branch's dependency pins or
source. Hosted acceptance requires inspecting the pushed commit's run after separately
authorized publication; local checks and prior runs cannot close it.
