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

| Command                                | Purpose                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run test -w <workspace>`          | Workspace unit/component/contract tests; API default excludes database integration                        |
| `npm run typecheck -w <workspace>`     | Focused workspace TypeScript                                                                              |
| `npm run lint`                         | Repository lint and dependency-direction rules                                                            |
| `npm run test:architecture`            | Tooling, boundary, fixture and quality regressions                                                        |
| `npm run check`                        | Fresh online Expo Doctor, contracts build, all typechecks, lint, format, architecture and workspace tests |
| `npm run db:local`                     | Prepare isolated local PostgreSQL roles/database                                                          |
| `npm run db:migrate`                   | Apply registered migrations using the migrator connection                                                 |
| `npm run test:db`                      | Real database services/policies plus migration/restoration rehearsal                                      |
| `npm run test:coverage`                | All-source workspace coverage, including database suites, then combined floors                            |
| `npm run test:journey`                 | Saved actual-app/API/database browser and repository journeys                                             |
| `npm run test:migrations`              | Standalone preservation/restoration rehearsal                                                             |
| `npm run export:web -w @justgo/mobile` | Cold web export                                                                                           |
| `npm run export:ios -w @justgo/mobile` | Cold iOS JavaScript/assets export                                                                         |

Pass `-- --runTestsByPath src/...test.tsx` to the mobile test script, or
`-- path/to/test.ts` to API/contracts Vitest scripts, for focused tests. A slice
changing contracts, tsconfig, ESLint configuration or `e2e/support` also runs
`npm run build:contracts && npm run typecheck` at the root, covering all consumers
and journeys. Before phase handoff/publication, run `npm run check`, full coverage
and applicable saved journeys/exports; `test:db` is required for backend/shared
boundaries and phase closeout. Earlier native/staging gates stay open until evidenced.

## Isolated database environment

Database tests, API coverage and journeys require `DATABASE_URL` for the restricted
`justgo_runtime` role, `MIGRATION_DATABASE_URL` for fixture setup/cleanup, and
`DATABASE_SSL=disable`. They refuse non-loopback hosts and databases other than
`justgo_test`. Use disposable synthetic data only; never point fixtures at staging,
production or private accounts. Keep PostgreSQL service suites serialized where
shared catalog fixtures require it.

Use PostgreSQL 17 client tools, including `pg_dump` and `psql`. `JUSTGO_PG_BIN`
selects their directory when not on PATH or in the standard Apple Silicon Homebrew
location. Fresh CI runners cannot rely on ignored `.env` files or prior generated
artifacts. Supply the full database mapping consistently to migrations, database
coverage and journeys. Inspect hosted results for the pushed commit before marking
a gate verified.

## Coverage policy

The root coverage command builds contracts, runs workspaces sequentially and
enforces [coverage-thresholds.json](../../scripts/quality/coverage-thresholds.json).
API coverage includes unit/database suites and the migration rehearsal, so prepare
the same local database first. Individual workspace coverage scripts generate
reports; the root command applies the combined gate. Reports are ignored generated
output under `coverage/{mobile,api,contracts}/`, with HTML, LCOV and JSON summaries.
Jest uses Istanbul; Vitest's V8 provider is pinned with its Vitest version.

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
identity/challenge services (85% branches), reflection PATCH (95%/99%) and Progress
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
Production TypeScript's type-aware promise rules reject unhandled/misused promises
and invalid awaits. `void` denotes intentional background ownership; it does not
catch rejection. Controllers/query layers must already handle the failure.

Keychain tests establish JS schema/module/error wiring, not native entitlement,
iCloud synchronization or physical recovery. When switching native worktrees,
compare persisted schemas and preserve newer recovery/deletion metadata. Rejection
can surface as generic secure-storage failure; resetting Keychain or loosening
validation is not a fix. Use synthetic compatibility/account-preservation fixtures.

## Saved app/API/database journeys

The Playwright suite exercises the actual browser app/API/disposable database and
bundled production repository/transport. It covers explicit saving/Progress,
offline/reconnect, write-failure/cloud fallback/memory recovery, lost acknowledgements,
ordered reflection edits, aggregate reconciliation, limited history, account/session
recovery, export and deletion. It is distinct from presentation fixtures,
one-off interactive walkthroughs and native checks.

Install pinned Chromium with `npx playwright install chromium`; Linux CI uses
`npx playwright install --with-deps chromium`. Run the full root journey command or
pass a saved spec, for example:

```sh
npm run test:journey -- e2e/data-export.spec.ts
```

The wrapper validates the nonproduction loopback database/roles/SSL before any
migration or service startup. It refuses occupied fixture ports rather than reusing
an unknown server, builds contracts and the production repository bundle, migrates,
and starts its owned fixture API/Expo services. Defaults are 127.0.0.1:3000 and
127.0.0.1:8081; `JUSTGO_JOURNEY_API_PORT` and `JUSTGO_JOURNEY_APP_PORT` can select
distinct unprivileged ports. Expo uses `--localhost`; regression checks reject
non-loopback binding. Startup/assertion failures fail the command and owned
services are stopped.

Do not assume CLI API overrides defeat Expo's virtual dotenv environment. Preserve
the guarded public-environment adapter and request-origin fence, and validate the
browser's resolved API origin as well as database settings. Synthetic proofs must
never reach hosted APIs. The `JUSTGO_JOURNEY_FIXTURES` Metro seam permits controlled
journal failures only for guarded web fixtures; normal/native/production resolution
cannot load those fault adapters. There are no product UI failure switches or
production paid-access bypasses.

The fixture registry owns every created account UUID independently of browser
requests and response delivery. Teardown deletes only that registry's accounts;
registry failure fails cleanup instead of trusting browser IDs. Failed creations
can leave absent rows, safely deleted as no-ops. The registry endpoint is absent
from deployable API. Browser identity is memory-only; reload tests recover the
same synthetic account while the activity adapter retains its separate journal.

Before each database-backed case, reset only the fixture run's two hashed rate
buckets. Keep real limits active during each case and retain unrelated buckets.
Cases that exhaust an identity allowance cannot contaminate the next case. No
production rate limit or cleanup authority changes.

Seed dated activity inside the browser's intended local day using
`e2e/support/seed-times.ts`; counting backward from wall-clock now crosses midnight
in UTC CI and month-start dates require deliberate adjacent-month fixtures. Layout
assertions wait for usable controls and retry fresh geometry after navigation;
missing/detached controls keep failing. Preserve alignment limits rather than adding
sleeps or weakening assertions.

Failures produce `.local/journey-results` and `.local/journey-report`. Traces,
videos and automatic screenshots are disabled because they retain credentials;
only masked UI failure screenshots are permitted. Reports must include a nonempty
`index.html`; CI uploads report/attachments and treats missing required output as
failure. The repository bundle is rebuilt with pinned esbuild; an ignored prior
artifact is never a prerequisite.

## Interactive browser and native evidence

After relevant tests pass, verify affected UI in the Codex in-app browser side
panel using disposable fixture accounts. Use `dev:challenges` for live isolated
flows and `/preview` for named loading/error presentations. Verify served checkout,
configuration and API origin before reusing a server. Honor side-panel-only requests;
record unavailable capabilities rather than switching browsers against preference.
Keep screenshots/recordings in ignored `.local/` unless explicitly requested for Git.

Record actual viewport, flow, fixtures, failure and recovery, keeping saved automated
journeys, one-off walkthroughs, native simulator and physical-device evidence separate.
Browser/export/component checks cannot establish Keychain/AsyncStorage durability,
OS lifecycle, gestures, software keyboard, VoiceOver, radio/backup or physical recovery.
Large folder moves require cold web/iOS bundles and an owned Metro restart with
`--clear` before reloading the existing installed development app; an unrelated
export does not refresh its live dependency graph.

The [native-testing checkpoint](../handoffs/phase-07-3a-testing-checkpoint.md) and
[browser assessment](../checks/phase-07-3a-browser-testing-assessment.md) remain the
resume boundary for deferred native automation. Retain Playwright/web adapters,
fixture safeguards and coverage floors until a native replacement proves equivalent
actual-app/API/database cases and its authorized commit's hosted gate. Retain the
Maestro launch smoke (`APP_ID=... npm run test:native -w @justgo/mobile`) and relevant
manual simulator checks meanwhile. Device/staging gates belong in
[Phase 11](../implementation-plan/phase-11-release.md) and the applicable handoffs.

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

## Publication and hosted CI

Before publication, install with `npm ci` in a clean checkout and run `npm run check`.
Doctor uses fresh online metadata (`EXPO_NO_CACHE=1`) and stops the command early
on dependency incompatibility. Recheck Doctor immediately before an authorized push
after longer sessions. Update exact package pins and the root lockfile together;
never hide live metadata changes with offline mode/exclusions. Native/device
acceptance for changed dependencies stays separate.

CI runs on pull requests and pushes to `main`, cancels superseded PR runs and keeps
each main commit's result. The current workflow runs online Doctor/static checks,
then one all-workspace coverage run including PostgreSQL/migration suites, followed
by journeys and exports. Coverage upload runs when coverage executed, including
failures; missing reports then fail upload. Tooling tests protect the actual workflow
conditions and each suite's single-run layout. The workflow file owns current job
structure and setup prerequisites.

For split/stacked changes, verify each exact publication candidate. Checks from a
combined feature branch do not transfer to an older branch's dependency pins or
source. Hosted acceptance requires inspecting the pushed commit's run after separately
authorized publication; local checks and prior runs cannot close it.
