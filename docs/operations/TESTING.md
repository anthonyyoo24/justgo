# Testing and quality safeguards

This guide owns the test commands, the CI gates and the proof standard. The
[`verify-justgo` skill](../../.claude/skills/verify-justgo/SKILL.md) owns how to
start, drive, check and clean up the running app, and its feature map holds the
per-feature recipes and traps. PR descriptions record actual results. Open gates
are GitHub issues labeled `gate` (`gh issue list --label gate`).

## Proving a change works

Prove a change on the real surface it affects, not on a proxy. For a user-facing
change, drive the app through `verify-justgo`. For an API or data change, read the
result back from the database or the response. A passing typecheck or a mocked
component test does not prove the app behaves.

Script the check when you can, so a reviewer can rerun it. Run the same check on
the old code and the new code. The check must fail or show
the defect before the change and pass after it. Give each claim one verdict:

- **Verified.** The check ran on the real surface and showed the claimed behavior.
- **Not verified.** The check ran and showed something else.
- **Inconclusive.** The check could not run or could not tell, for example because
  the surface needs a physical phone. Say what blocked it.

Name the surface in the verdict. Web evidence from the browser build, a saved
journey or an export does not prove native behavior. Browser, export and component
checks cannot establish Keychain, SQLite or AsyncStorage durability, the OS
lifecycle, gestures, the software keyboard, VoiceOver, native Apple or Google
OAuth, hosted Auth revocation or deletion, or real CloudKit sync. Keychain tests
prove JavaScript schema and error wiring only. Files, iCloud Drive and multi-device
CloudKit checks stay physical-device gates in
[account/sync setup](ACCOUNT_SYNC_SETUP.md) and the
[rollout runbook](LOCAL_JOURNAL_ROLLOUT.md#device-and-manual-file-acceptance).
Automated simulator testing resumes through the
[`verify-justgo` Native section](../../.claude/skills/verify-justgo/SKILL.md#native)
and [#114](https://github.com/anthonyyoo24/justgo/issues/114). That path is
unproven until one mapped feature is driven on a simulator. Keep the Playwright
journeys, the web adapters and the fixture safeguards until a native drive proves
the same app, API and database cases and passes hosted CI.

### Writing tests

Write a failing test first when a cheap test path exists: the closest unit,
component, integration or journey test that already covers the code path. Run it
before the fix and confirm it fails for the intended reason. When no cheap path
exists, use the closest executable check instead, such as a `verify-justgo` drive
or a database read-back, and say why. Prefer no new test over a bad test.

A test must fail when the behavior breaks and keep passing when only the internals
change. Assert what a caller, a user or another service can observe, such as return
values, errors, stored state and requests sent. Do not assert private helpers, call order or
data the test built itself.

When behavior depends on storage, transport, time or randomness, control it through
the code's existing seam, such as the vault, `fetch`, AppState or a clock. The test
then controls failures, timing and retries without replacing the domain logic under
test. Add a small interface only where no seam exists.

## Choosing checks

Use the pinned Node and npm versions from the root manifests and `.nvmrc`. Classify
the behavior and boundary that changed, not the directory.

| Change                       | Checks                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation only           | Scoped formatting and `node --test scripts/quality/doc-links.test.mjs`. No app tests, builds or UI checks.                                                                                                          |
| Contained code change        | Focused tests for the changed behavior and its consumers, affected workspace typechecks, `npm run lint` and changed-file formatting. Affected saved journeys, and a `verify-justgo` drive for a user-facing change. |
| Contracts, tsconfig, ESLint  | Also `npm run build:contracts && npm run typecheck` from the root, which covers every workspace and the journeys. The same applies to changes in `e2e/support`.                                                     |
| API, shared protocol or data | Also `npm run test:db` against loopback `justgo_test`, including ownership, replay, failure and migration cases. A mobile UI or navigation change alone does not change this boundary.                              |
| Dependencies, Expo or native | Full `npm run check`, with its online Expo Doctor, plus the native build and device acceptance the change affects.                                                                                                  |
| Release build                | Full `npm run check` with online Doctor, the saved journeys and exports, `test:db`, and the open hosted, staging and physical-device gates.                                                                         |

Before pushing, run the checks for the touched paths on the committed head. CI
runs the full set on every pull request. Run the full `npm run check`, with its
online Doctor, when dependencies, Expo or native configuration change, and before
a release build. Expand the local checks for a concrete failure or an explicit
owner request, and state the trigger.

Run one heavy check at a time on the owner's 8 GB Mac. Do not repeat a passed
check that a broader command already ran unless its inputs changed or a failure
needs investigation.

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
| `npm run test:coverage`                | Optional all-source workspace coverage reports, including database suites; no pass/fail threshold         |
| `npm run test:journey`                 | Saved actual-app/API/database browser and repository journeys                                             |
| `npm run test:migrations`              | Standalone preservation/restoration rehearsal                                                             |
| `npm run build:legal`                  | Build local static legal candidates; `-- --production` refuses unapproved source/date metadata            |
| `npm run export:web -w @justgo/mobile` | Cold web export                                                                                           |
| `npm run test:exported-web`            | Smoke the existing production web export without API/database traffic                                     |
| `npm run export:ios -w @justgo/mobile` | Cold iOS JavaScript/assets export                                                                         |

For focused tests, pass `-- --runTestsByPath src/...test.tsx` to the mobile test
script, or `-- path/to/test.ts` to the API and contracts Vitest scripts. The API
`test` script skips database cases. To run one, use
`node --env-file-if-exists=.env ../../node_modules/vitest/vitest.mjs run tests/<area>/<file>.integration.test.ts -t '<name>'`
from `apps/api`. Legal-reader regressions run with
`node --test sites/legal/*.test.mjs` and are part of `test:architecture`. The
local output of `npm run build:legal` still needs a readability and navigation
check in the built-in browser pane.

## Type environments

Mobile `typecheck` regenerates the Expo route declarations before it checks
`tsconfig.json` and `tsconfig.tests.json`, so stale ignored `.expo/` output cannot
make a clean checkout pass. Mobile source sees React, React Native and Expo types
only. Jest globals and Node APIs belong to the separate test program.

Relative imports in API and contracts TypeScript use `.js` for NodeNext. Metro app
imports omit the extension so platform resolution can pick native or web adapters.
Node tooling names the real runtime extension (`.mjs`, or `.ts` when Node runs it
directly). Import contracts through `@justgo/contracts`.

## Isolated database environment

Database tests, API coverage and journeys need `DATABASE_URL` for the restricted
`justgo_runtime` role, `MIGRATION_DATABASE_URL` for fixture setup and cleanup, and
`DATABASE_SSL=disable`. They refuse non-loopback hosts, databases other than
`justgo_test`, and URLs with query parameters or fragments, through the shared
`localTestDatabaseUrl` guard. Use disposable synthetic data only. Never point
fixtures at staging, production or private accounts. If `npm run db:local` stops
with "postmaster became multithreaded", rerun it with `LC_ALL=en_US.UTF-8`.

Use PostgreSQL 17 client tools, including `pg_dump` and `psql`. `JUSTGO_PG_BIN`
selects their directory when they are not on PATH or in the Apple Silicon Homebrew
location. CI runners cannot rely on ignored `.env` files or earlier build output, so
supply the full database mapping to migrations, database coverage and journeys.

The Auth-session helper integration test also needs `JUSTGO_TEST_ADMIN_DATABASE_URL`
for a `postgres` connection to loopback `justgo_test` with SSL disabled. `db:local`
and the CI database jobs supply it; add it to older local `.env` files. The test runs
the real operator SQL inside a rollback-only transaction and never targets hosted
Auth. Never deploy this URL on Workers, Vercel or mobile.

## Coverage reports

`npm run test:coverage` is an optional diagnostic with no pass/fail threshold. It
builds contracts and runs each workspace's coverage script in sequence. API
coverage includes the database suites and the migration rehearsal, so prepare the
local test database first. Reports are ignored output under
`coverage/{mobile,api,contracts}/`, with HTML, LCOV and JSON summaries.

## Component and provider tests

React Native Testing Library 14 makes `render`, `renderHook`, events, `act`,
rerenders and unmounts asynchronous. Await them and Router test navigation. SDK 58
web stacks keep inactive screens in the DOM, so assert the active screen through
role and name queries rather than text.

Provider tests mount the real provider, controller and client with controllable
vault, fetch and AppState boundaries, and fake timers for expiry and polling.
Unmount, cancel, clear and flush queued callbacks before restoring real timers.
Drain TanStack notification timers inside async `act` before restoring the global
notifier. Progress account-switch tests await the old account's focus refresh
before replacing its transport fixture, observe the new account's request before
resolving it, and assert distinct totals. Never suppress unexpected warnings or
add waits to hide a race.

## Saved journeys

`npm run test:journey` runs the Playwright journeys against the real browser app,
the fixture API and the disposable database. The
[`verify-justgo` skill](../../.claude/skills/verify-justgo/SKILL.md) describes the
wrapper's guards, ports, fixture accounts, request fence, dated seeding and
cleanup. Install the pinned browser with `npx playwright install chromium`, then
run the suite or one spec:

```sh
npm run test:journey -- e2e/data-export.spec.ts
```

Failures write `.local/journey-results` and `.local/journey-report`. Traces,
videos and automatic screenshots are off because they retain credentials; only
masked failure screenshots are kept. CI requires a nonempty report `index.html`
and uploads the report and attachments. Journey builds run the real Sentry SDK
with a fake ingestion key and intercept hosted Sentry requests. A probe against
the real provider uses disposable synthetic errors only, with ordinary delivery
disabled.

## Workers runtime and encrypted recovery

`npm run test:workers` starts the pinned Wrangler/workerd entrypoint against
loopback `justgo_test`. It checks readiness, an authenticated database read and
write, idempotent completion replay and the safe error envelope, then cleans up its
owner and process. It refuses occupied ports; `JUSTGO_WORKERS_TEST_PORT` selects
another loopback port. This is local runtime evidence, not hosted Hyperdrive, CPU
or account acceptance.

`npm run profile:workers` is a separate profiling run of 200 synthetic `/health`
requests, with a loopback inspector on port 9230 (`JUSTGO_WORKERS_INSPECTOR_PORT`).
It writes mode-0600 profiles under `.local/workers/profiles/` and skips the
functional smoke. Local profiles find hotspots; they do not establish hosted CPU
savings.

`npm run test:backup:recovery` uses PostgreSQL 17 and `age` to create isolated
`justgo_restore_<id>` databases, encrypt a stale snapshot and a newer ledger,
restore and reconcile them, and check that revoked and deleted credentials stay
rejected. It removes its keys, ciphertext, roles and databases, needs the loopback
test admin URL and refuses hosted targets. Synthetic Auth fixtures do not prove
that a real Supabase Auth dump restores. See
[Cloudflare backups](CLOUDFLARE_BACKUPS.md) for operational limits.

## Production exported-web smoke

```sh
npm run export:web -w @justgo/mobile
npm run test:exported-web
```

The smoke serves `apps/mobile/dist/` from its own loopback server on
`127.0.0.1:8093` (`JUSTGO_EXPORTED_WEB_PORT`) and never reuses a running server.
Its request fence rejects every `/v1` request, so it needs no API, database or
account. It checks supporting routes, unknown-link recovery, absent development
controls, browser errors and asset failures. Reports go to
`.local/exported-web-report/` and `.local/exported-web-results/`. Run it before
`export:ios`, which replaces the same `dist/` output. Sentry's optional Router-store
import logs an expected Metro resolution warning; do not alias or suppress it.

## Native CloudKit regressions

The private CloudKit bridge has a dependency-free SwiftPM target, run in CI's
`native-icloud` job:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer swift test \
  --package-path apps/mobile/modules/justgo-icloud \
  --scratch-path .local/justgo-icloud-swift --jobs 1
```

It compiles production CloudKit code against controllable I/O and covers byte
bounds, generation and account fences and sanitized cursor errors. It excludes the
Expo bridge and never contacts CloudKit, so a signed build and phone checks still
verify those boundaries.

## File moves and bundle checks

Every move updates imports, dynamic loaders, test discovery, fixtures, assets,
packaging and upload allowlists, scripts and documentation links in the same
change. Keep tests and native/web adapter pairs beside their owner.

For a small move within the same resolver and packaging rules, run the affected
tests, typechecks and import, discovery and packaging checks. Cold-bundle an
affected platform only when those checks cannot establish module or asset
resolution. Large moves, and moves that affect adapter resolution, entrypoints,
shared assets or packaging, need cold web and iOS exports, with the exported-web
smoke between them.

After source or asset moves, restart the owned Metro server with `--clear` and
reload the installed development app. A separate successful export does not
refresh that server's live module graph. Keep moves and functional changes in
separate commits.

## Migration preservation rehearsal

`test:db` includes `test:migrations`. The rehearsal builds the early migrations in
a unique disposable schema in loopback `justgo_test`, seeds synthetic history,
saves a SQL snapshot, applies each later migration with its comparisons, restores
the snapshot with `psql` and reapplies the forward chain. It verifies clean-database
installation and the immutable hashes of applied migrations, and its teardown
leaves application state intact and writes no credentials or private content. It
is a local and CI acceptance tool, not deployment authorization. The
[cutover runbook](FOUNDATION.md#phase-07-coordinated-cutover-and-old-clients), the
[Phase 13 rollout](LOCAL_JOURNAL_ROLLOUT.md) and
[account setup](ACCOUNT_SYNC_SETUP.md) own hosted changes.

## Continuous integration

CI runs on pull requests and pushes to `main`, cancels superseded PR runs and keeps
each main commit's result. A first `changes` job decides whether the app jobs run.
A pull request whose changed files are all Markdown runs only `static`, which
includes the doc-link check and the legal-draft tests; every other pull request and
every push to `main` runs all six producer jobs:

- `static`: pinned actionlint, online Doctor, contracts, type, lint, format and
  tooling checks, and the API production-dependency audit.
- `unit`: mobile, contracts and API unit suites with coverage.
- `database`: isolated PostgreSQL, migrations, every API integration suite
  including the migration rehearsal, then `test:workers` and
  `test:backup:recovery`.
- `journeys`: isolated PostgreSQL and the saved journeys.
- `exports`: production web export, its static smoke, then iOS export.
- `native-icloud`: the Swift CloudKit regressions on macOS.

The final `checks` job runs even when a producer fails, is skipped or is cancelled,
and any such result fails the aggregate status. The one exception is an app job
that `changes` skipped for a Markdown-only pull request. Suites execute once rather than being
repeated by root coverage or database commands. The `unit` and `database` jobs
upload their coverage reports as diagnostic artifacts when their collection step
executed, including failures; missing reports then fail upload. The workflow and
setup actions own exact job limits, versions and prerequisites. A local pass does
not establish a hosted pass, so inspect the pushed commit's run before marking a
gate verified. For stacked pull requests, each branch's own run is its evidence.

External GitHub Actions use commit SHA pins with version comments. Dependabot
checks npm and Actions weekly and groups compatible npm minor and patch updates;
npm majors need manual scope and native acceptance. Update exact package pins and
the root lockfile together, and never hide live Doctor metadata changes with
offline mode or exclusions. The audit gate covers API production dependencies:

```sh
npm run audit:api
```

It projects the API's production graph from the shared lockfile into a temporary
workspace and fails closed on manifest or lock drift. No advisory is filtered. It
does not cover mobile or tooling dependencies. CodeRabbit's docstring-coverage
percentage is not a repository gate.
