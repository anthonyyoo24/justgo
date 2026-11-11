# Working on JustGO

The agent process is pstack (in Claude Code, `/pstack:poteto-mode`). Where pstack
and this file disagree, follow pstack. The Git and autonomy rules below still hold.
This file holds what pstack cannot know about JustGO: the repository map, where
each fact lives, the rules and what enforces them, and the owner's permissions.

## Repository map and common commands

- `apps/mobile` (`@justgo/mobile`): Expo app. `apps/api` (`@justgo/api`): API
  and database. `packages/contracts` (`@justgo/contracts`): shared Zod contracts.
  `e2e/`: saved Playwright journeys. `scripts/quality` and `scripts/journeys`:
  architecture, coverage and journey tooling. `.claude/skills/verify-justgo`: the
  skill that starts, drives and checks the running app.
- Use the pinned Node and pnpm versions from the root manifests and `.nvmrc`.
  Corepack provides pnpm (`corepack enable pnpm` once per machine). Install a
  checkout or worktree with `pnpm install --frozen-lockfile`. Every worktree
  then links its `node_modules` from the one shared pnpm store, so a new
  worktree adds almost no disk.
- pnpm passes the words after a script name straight to the script, so leave
  out the `--` that npm needed. `pnpm run build:legal --production` is right.
  `pnpm run build:legal -- --production` hands the script a literal `--`.
- Before you change Expo, React Native or native code, read the docs for the
  `expo` version in `apps/mobile/package.json` at
  `docs.expo.dev/versions/v<major>.0.0/`. Your training data may describe an older
  SDK. A native module or configuration change needs a new binary, and a
  JavaScript export does not prove native modules, Keychain behavior or device
  acceptance.
- To run one test file, pass `--runTestsByPath src/<path>.test.tsx` to the
  mobile `test` script, or `<path>` to the API and contracts scripts.

| Command                                       | Purpose                                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter <workspace> run test`          | Workspace unit, component and contract tests. The API default skips database cases.                                                                                 |
| `pnpm --filter <workspace> run typecheck`     | Focused TypeScript. Mobile regenerates its Expo route types first.                                                                                                  |
| `pnpm run lint`                               | Repository lint and dependency-direction rules                                                                                                                      |
| `pnpm run test:architecture`                  | Tooling, boundary, fixture, legal-reader and quality regressions                                                                                                    |
| `pnpm run check`                              | Online Expo Doctor, contracts build, all typechecks, lint, format, architecture and workspace tests                                                                 |
| `pnpm run db:local`                           | Prepare the isolated loopback PostgreSQL roles and database                                                                                                         |
| `pnpm run db:migrate`                         | Apply registered migrations through the migrator connection                                                                                                         |
| `pnpm run test:db`                            | Real database services and policies, plus the migration rehearsal                                                                                                   |
| `pnpm --filter @justgo/api run test:db:file`  | One database test file: `tests/<area>/<file>.integration.test.ts`, optional `-t '<name>'`. First run `db:local` (keeps an existing `.env`), then `db:migrate`.      |
| `pnpm run test:journey`                       | Saved Playwright journeys against the real app, the fixture API and the disposable database                                                                         |
| `pnpm run test:coverage`                      | Optional report with no threshold. It includes the database suites, so prepare the local database first. Output goes to ignored `coverage/{mobile,api,contracts}/`. |
| `pnpm --filter @justgo/mobile run export:web` | Cold web export. `export:ios` is the iOS one.                                                                                                                       |
| `pnpm run test:exported-web`                  | Smoke the existing web export with no API or database traffic                                                                                                       |
| `pnpm run build:legal`                        | Build the local legal pages, then check their reading and navigation in the built-in browser pane. `--production` refuses unapproved source or date metadata.       |

### Choosing checks

Classify the behavior and boundary that changed, not the directory.

| Change                                       | Checks                                                                                                                                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation only                           | Changed-file formatting and `node --test scripts/quality/doc-links.test.mjs`. No app tests, builds or UI checks.                                                                                                     |
| Contained code change                        | Focused tests for the changed behavior and its consumers, affected workspace typechecks, `pnpm run lint` and changed-file formatting. Affected saved journeys, and a `verify-justgo` drive for a user-facing change. |
| Contracts, tsconfig, ESLint or `e2e/support` | Also `pnpm run build:contracts && pnpm run typecheck` from the root, which covers every workspace and the journeys.                                                                                                  |
| API, shared protocol or data                 | Also `pnpm run test:db` against loopback `justgo_test`, with ownership, replay, failure and migration cases. A mobile UI or navigation change alone does not cross this boundary.                                    |
| Dependencies, Expo or native                 | Full `pnpm run check` with its online Expo Doctor, plus the native build and device acceptance the change affects.                                                                                                   |
| Release build                                | Full `pnpm run check`, the saved journeys and exports, `test:db`, and the open hosted, staging and physical-device gates.                                                                                            |

Before pushing, run the checks for the touched paths on the committed head. CI
runs the full set on every pull request that changes more than Markdown. A local
pass does not prove a hosted pass, so read each stacked branch's own CI run. Expand
the local checks for a concrete failure or an explicit owner request, and state
the trigger.

Reuse existing tools and caches. Do not rerun a passed check that a broader
command already ran unless its inputs changed or a failure needs investigation.
Native signing or build upgrades need a separate task.

Its shell is zsh, and some searches there fail silently. Quote glob arguments such
as `--include='*.ts'`, or an unquoted one aborts the command. `git grep -E '\bword\b'`
matches nothing on macOS, so use `git grep -w` or `-P` for word boundaries. Treat an
empty search as unproven until a second method agrees.

## Proving a change works

pstack's `prove-it-works` principle and `tdd` skill set the method. JustGO adds
these rules:

- Drive a user-facing change through `verify-justgo`. Read an API or data change
  back from the database or the response.
- Give each claim one verdict and name its surface. **Verified** means the check
  ran on the real surface and showed the claimed behavior. **Not verified** means
  it ran and showed something else. **Inconclusive** means it could not run or
  could not tell, for example because the surface needs a physical phone. Say what
  blocked it. The `verify-justgo` Gotchas list what browser evidence cannot prove.
- If two runs of the same check disagree, the claim is Inconclusive until you can
  explain the difference. Do not keep the passing run. When a change makes the
  code under test match `main`, a pass proves nothing unless the run shows which
  code it served, or it first failed at the same level.
- Keep the Playwright journeys, the web adapters and the fixture safeguards until a
  native drive proves the same app, API and database cases and passes hosted CI.
- When behavior depends on storage, transport, time or randomness, control it
  through the existing seam, such as the vault, `fetch`, AppState or a clock. The
  test then controls failures, timing and retries without replacing the domain
  logic. Add a small interface only where no seam exists.
- In mobile provider tests, mount the real provider, controller and client. Give
  them a controllable vault, `fetch` and AppState, and use fake timers for expiry
  and polling. Before you restore real timers, unmount, cancel and clear the
  queries, flush queued callbacks, and drain TanStack notification timers inside
  an async `act`. In an account-switch test, await the old account's refresh
  before you replace its transport fixture. Observe the new account's request
  before you resolve it, and assert distinct totals. Do not add waits to hide a
  race.

## Where facts live

- [The implementation plan](docs/implementation-plan/README.md) owns phase scope
  and sequencing. When a task names a phase, read that phase before you edit.
  Change the plan only when scope or a decision changes. Keep a task's scope
  bounded, and preserve existing behavior unless the task changes it.
- The domain safety invariants have three owners. Read the owner before you
  change that behavior. [IDENTITY.md](docs/architecture/IDENTITY.md) owns account
  transitions, account deletion and credential preservation.
  [ACTIVITY_DATA.md](docs/architecture/ACTIVITY_DATA.md) owns saving, sync and
  deletion epochs. [APP_SHELL.md](docs/architecture/APP_SHELL.md) owns runtime
  hydration and effect restarts, guest adoption stages, and native modal and list
  behavior.
- No doc owns clock coordination. In `apps/mobile/src`,
  `app-support/providers/activity-runtime.ts` rolls the journal day at minute
  boundaries and local midnight through the injected `JournalClock`.
  `app-support/access/verification/policy.ts` defines `serverClockOffset`.
  It and `useAccessState.ts` beside it apply the server clock offset.
  Their tests sit beside them.
- The workspace manifests, `.nvmrc` and the lockfile own the stack and its
  versions, and `scripts/quality/ci-workflow.test.mjs` owns the CI shape. The
  source tree is the path map, and
  [Placement and move rules](#placement-and-move-rules) say where new code goes.
- Each operations doc owns the local rehearsals for its area.
- Open gates are GitHub issues labeled `gate` (`gh issue list --label gate`). File
  a `gate` issue for each deferred device, hosted or staging check. File an issue
  for each approved deferral of a review finding. Close each with a link to its
  evidence.
- File a bug you find outside your task as an issue with its reproduction. Label
  it `bug` and exactly one of these:
  - `agent-fix`: a failing test reproduces the bug and the fix needs no product
    decision. Commit the test with the issue number in its title or in the
    comment directly above it, or attach the test to the issue. Jest
    workspaces write it as `it.failing` or `test.failing`, and Vitest
    workspaces (`apps/api`, `packages/contracts`) as `it.fails` or `test.fails`.
  - `needs-decision`: the bug has more than one reasonable fix, and the choice
    is a product decision. Anthony picks, and the issue then becomes `agent-fix`.
  - `blocked`: the fix needs a physical phone, a provider setting or a deploy.
- A run with a decision trail records each filed bug in a row whose phase is
  `bug`, whose evidence is the issue URL and whose result is the issue's label. A
  bug that gets no label takes the result `skip: <reason>`. A later `bug` row
  replaces an earlier one that names the same issue, or that has the same
  evidence text when it names none. The Stop hook blocks until the latest row for
  each bug has a label or a skip reason.
- Agents in interactive sessions fix `agent-fix` issues. The nightly claude.ai
  cloud routine, with a builder and a separate verifier for each fix, has been
  paused since 2026-11-10, so filing an issue does not queue a fix.
  [Nightly agent-fix](docs/operations/NIGHTLY_AGENT_FIX.md) owns its status,
  setup, connectors, prompt and trial limits. During the trial it opens PRs and merges
  nothing. After the trial its PRs follow the [merge rules](#git-and-autonomy).
- [TestFlight beta](docs/operations/TESTFLIGHT_BETA.md) owns the product stage and
  user count. Check it before you call anything urgent.
- Put a lasting invariant, trap or setup step in the doc that owns it. Put a fact
  outside the repo, such as a provider setting, a legal approval or an account
  fact, in the operations or legal doc that owns it.

## Placement and move rules

- Choose the product capability or supporting job before creating files, and
  name the folder after it. Add a subfolder for a cohesive group. Avoid empty
  future folders and automatic `components/hooks/services` layers.
- In mobile `src/`, `features/<name>/` holds one product capability with its
  screens, components, hooks, domain logic, API functions and tests.
  `app-support/` holds app-wide coordination (providers, startup, access,
  identity, sessions and account recovery) with its screens. `data/` holds shared
  persistence, cached activity and synchronization. `components/`, `lib/`,
  `theme/` and `platform/` hold reusable UI, general helpers, design tokens and
  platform adapters. Routes in `app/` stay thin. Developer fixtures stay in `dev/`.
- Keep `api.ts` modules wire-only. The controller, provider or query that calls
  one keeps hydration, clocks, cursor validation, account fencing and cache
  acceptance.
- Keep tests beside their owner and native and web adapter pairs together. API
  integration tests live under `apps/api/tests/`, grouped by capability (such as
  `identity/`) or by layer (`db/`, `http/`, `scripts/`).
- A move updates imports, dynamic loaders, Jest and coverage selectors, fixture
  seams, assets, packaging and deployment allowlists, scripts and docs together.
  Use import-aware rewrites, and keep move-only work in its own commit.
- For a small move within the same resolver and packaging rules, run the affected
  tests, typechecks, and import, discovery and packaging checks. Cold-bundle a
  platform only when those cannot prove module or asset resolution. A large move,
  or one that changes adapter resolution, entrypoints, shared assets or
  packaging, needs cold web and iOS exports with the exported-web smoke between
  them. Then follow the Metro restart in the `verify-justgo` Gotchas.
- Before you open the PR, review the complete file list of each touched
  directory. Keep organization within the task's responsibility and record
  unrelated cleanup separately. Preserve unrelated retained code and existing
  test and boundary safeguards.

## Rules and what enforces them

When a checked rule breaks, its check stops the work. A lint, type or test check
fails CI, the trail hook blocks the run from finishing, and branch protection
blocks the merge. A written rule is a judgment call that no check catches. When
an agent repeats a mistake, run `/pstack:correct`. It fixes the mistake at the
highest level that works and updates this list.

- Workspaces and mobile folders import each other only in the allowed directions, including through re-exports, `import()` and `require()`. The lint error names the broken direction.
  - Enforced by (lint): `justgo/import-boundaries` in `eslint.config.mjs`, defined in `scripts/quality/import-boundaries.mjs`, with cases in `scripts/quality/import-boundaries.test.mjs`
- Import contracts through `@justgo/contracts`, not a subpath. The API's `@justgo/contracts/openapi` import is the one exception.
  - Enforced by (lint): `justgo/import-boundaries`
- Features import only the public data modules (the progress reads and the backup formats) and only the `AccountRepository` and `DeckPreferences` types, not storage, sync or cloud internals. Provider modules and the modules `AppProvider` imports never import `AppProvider`. Each lint error names the fix.
  - Enforced by (lint, written): `justgo/import-boundaries`, with the allowed modules in `scripts/quality/import-boundaries.mjs` and cases in `import-boundaries.test.mjs` and `lint-rules.test.mjs`. Only review catches a feature that writes around the data owners through `lib/network/account-client`, `platform/icloud` or a storage package such as AsyncStorage, and a cycle back to `AppProvider` through a middle module.
- No `justgo` schema, table, column or routine grants anything to `anon`, `authenticated`, `PUBLIC` or any role but its owner and `justgo_runtime`. Every `justgo` table forces RLS. The Auth-session helper is the only `SECURITY DEFINER` routine, and no view runs with definer rights. The helper stays `STABLE` and returns one boolean.
  - Enforced by (test): The private-schema sweep in `apps/api/tests/db/managed-session-check.integration.test.ts` runs in `pnpm run test:db` after every migration and the helper script. The same file pins `/ready` to the helper body, volatility, boolean result and `justgo_runtime`-only access. Gate #212 covers hosted catalogs.
- TypeScript is strict.
  - Enforced by (type): `strict` in `tsconfig.base.json` and `apps/mobile/tsconfig.json`, checked by `pnpm run typecheck`
- No update lowers an account's `data_epoch` or changes its id, so a stale device cannot re-upload data that delete-all removed.
  - Enforced by (database, test, written): The `data_epoch_never_decreases` trigger from `apps/api/drizzle/0024_data_epoch_never_decreases.sql` and the `users_id_immutable` trigger from `apps/api/drizzle/0025_users_id_immutable.sql`, which refuses any change to a user id, with their cases in `apps/api/tests/data-sync/sync.integration.test.ts`. A migration that disables or replaces a trigger, or deletes and re-inserts a user row, is caught only in review
- Await each promise or handle its failure. Use `void` only for background work whose failure is already handled.
  - Enforced by (lint): `@typescript-eslint/no-floating-promises`, `no-misused-promises` and `await-thenable`, with the promise-lint cases in `import-boundaries.test.mjs`
- API code reaches another service only through `outboundFetch()`. It keeps redirects manual, so a secret or bearer never follows a `Location`, and fails a 3xx as `UNAVAILABLE` without reading its body.
  - Enforced by (lint, test, written): `no-restricted-globals` (`fetch`, `global`, `globalThis`, `self`, `window`) and `no-restricted-imports` (`undici` and its subpaths, `node-fetch`, `cross-fetch`, `http`, `https`, `node:http`, `node:https`, and `@supabase/*` outside `managed-deletion.ts`) in `apps/api/src`, with cases in `lint-rules.test.mjs`. The 3xx, passthrough and redirect-mode cases in `apps/api/tests/http/outbound-fetch.test.ts`, redirect cases in each caller's test, and `test:workers`. Dynamic `import()`, `eval`, other Node network modules such as `node:http2` and `node:net`, and other HTTP packages are caught only in review.
- Switches are exhaustive, code throws only `Error` values, and type assertions and union members are necessary.
  - Enforced by (lint): `@typescript-eslint/switch-exhaustiveness-check`, `only-throw-error`, `no-unnecessary-type-assertion` and `no-redundant-type-constituents`, with cases in `scripts/quality/lint-rules.test.mjs`
- Stored identity digests stay lowercase-hex SHA-256 of the raw secret or code. A new algorithm, encoding, case or input form locks out legacy installations and stops revoked-proof tombstones and deletion receipts from matching.
  - Enforced by (test): Known-answer tests for `digest` in `apps/api/tests/identity/identity.test.ts` and for the deletion-receipt match in `apps/mobile/src/app-support/identity/deletion/cleanup.test.ts`
- Scripts read changed paths and patch ids only through `changedPaths()` and `patchIdOf()`, which always use `-z --no-renames` and `--verbatim`.
  - Enforced by (architecture, lint): `scripts/quality/git.mjs`, the `no-restricted-syntax` entry for `scripts/**/*.mjs` in `eslint.config.mjs`, and its case in `scripts/quality/lint-rules.test.mjs`
- API source (`apps/api/src`) sets RLS context only by calling `setTransactionContext()`, which is always transaction-local. Only identity services and the guest catalog import it, with a static import, and none re-export, bind or pass it on. Never write `app.*` settings with `SET`, `set_config` or a `-c` connection option.
  - Enforced by (lint, test, written): `justgo/rls-context` in `scripts/quality/rls-context.mjs` and `justgo/import-boundaries`, with cases in `scripts/quality/lint-rules.test.mjs` and `import-boundaries.test.mjs`. `apps/api/tests/db/database.integration.test.ts` proves the next transaction sees no owner. API tests that call `set_config` on their own `pg` clients, SQL built at runtime or read from a file, and exported wrappers are review calls.
- Mobile tests await async Testing Library queries and utilities.
  - Enforced by (lint): `testing-library/await-async-queries`, `await-async-utils`, `no-await-sync-queries` and `no-promise-in-fire-event`, with cases in `lint-rules.test.mjs`
- Native SQLite journal files run in WAL mode. Web IndexedDB writes both journal stores in one `readwrite` transaction with `{ durability: 'strict' }`, so a committed save survives power loss.
  - Enforced by (test): `apps/mobile/src/data/journal/storage.test.ts` reads `PRAGMA journal_mode` from the saved file, and `storage.web.test.ts` checks the transaction IndexedDB receives. Each write opens a new connection that keeps the compiled FULL `synchronous` default, and `app.config.test.ts` fails when an `expo-sqlite` plugin entry sets `customBuildFlags`.
- The route tree matches the root stack.
  - Enforced by (test): `scripts/quality/routes.test.mjs`
- The Motion and Haptics providers render only in the root layout, above `AppProvider`, because both preferences belong to the installation, not to an account. Navigation keeps protected history private. The root keeps its explicit `access` anchor, the `access` gate stays first and unguarded, an unknown link's Go home enters `/access`, the challenge routes share a group with no nested layout, and every `app/account/` route but `sign-in` only redirects to `/recovery`.
  - Enforced by (test, written): `scripts/quality/routes.test.mjs` checks the provider nesting across mobile source, the gate's position and the missing `(challenge)` layout. `apps/mobile/src/app-support/AccountToolRedirects.test.tsx` opens each old account route and expects `/recovery`. `NavigationRoutes.test.tsx` fails without the anchor or with `access` under a guard, and it and `fallbacks/RouteFallbacks.test.tsx` fail when Go home leaves `/access`. Only review catches key, code or transfer UI added outside `app/account/`.
- Applied migrations stay immutable. `apps/api/tests/db/fixtures/applied-migration-hashes.json` lists every `apps/api/drizzle/meta/_journal.json` entry in order. An entry sits under `unapplied` until a hosted database runs it, then under `applied` with its SHA-256 and journal `when`.
  - Enforced by (test, written): `apps/api/tests/db/migration-metadata.test.ts`. Only review catches an entry left under `unapplied` after a hosted run, one moved back to `unapplied`, or a migration edited together with its pin. `apps/api/scripts/staging-release-guard.ts` still refuses a changed applied migration at deploy.
- New code goes with the owner of its responsibility.
  - Enforced by (written): [Placement and move rules](#placement-and-move-rules)
- Do not disable a lint rule inline, weaken the lint config, silence an unexpected warning or remove an assertion to make a check pass.
  - Enforced by (test, written): `scripts/quality/lint-rules.test.mjs` and `scripts/quality/import-boundaries.test.mjs` fail when a rule they cover is turned off: the promise, exhaustive-switch, throw, type-assertion, redundant-union, deprecated-API, git-output, React and Testing Library rules and `justgo/import-boundaries`. Inline suppressions (8 in 4 files today), silenced warnings and removed assertions are caught only in review.
- Local links and `.md` file mentions in tracked Markdown, backticked or plain, point at files that exist. A line that says "git history" may name a deleted file, and a line marked "(planned)" may name a file the plan will create.
  - Enforced by (test): `scripts/quality/doc-links.test.mjs`, with `outsideRepoPrefixes` for pstack and `.local/` paths that name no tracked folder
- CI keeps its job shape, SHA pins and prerequisites, and no job relies on ignored `.env` files.
  - Enforced by (test, CI): `scripts/quality/ci-workflow.test.mjs` and actionlint in the CI `static` job
- Each external action's SHA pin is followed by its release version, as in `# v7.0.1`. Expo Doctor runs live in `pnpm run check` and the CI `static` job, so no offline mode, skipped check or exclusion hides a metadata finding.
  - Enforced by (test, written): The pin case in `scripts/quality/ci-workflow.test.mjs` reads every workflow and composite action and fails on a pin with no `# vX.Y.Z` comment. Its Expo Doctor case fails when a workflow or action names `EXPO_OFFLINE`, `EXPO_NO_DEPENDENCY_VALIDATION` or an `EXPO_DOCTOR_*` variable. The doctor case in `scripts/quality/mobile-verification.test.mjs` runs the `doctor` script against a fake `expo-doctor` and fails on any argument or `EXPO_*` variable besides `EXPO_NO_CACHE=1`, and on `expo.doctor` or `expo.install.exclude` in `apps/mobile/package.json`. Only review catches a version comment that names the wrong release for its SHA.
- Deletion receipts, subject tombstones, deleted IDs and revoked proof digests survive the identity purge and a restore. Every schema table, and every column of a ledger table, is either replayed by the recovery ledger or listed as dump-only.
  - Enforced by (test): `scripts/backups/ledger-coverage.test.mjs` checks `ledgerTables`, `dumpOnlyTables` and `dumpOnlyLedgerColumns` in `scripts/backups/snapshot.mjs` against `schema.ts`. `apps/api/tests/db/recovery-ledger.integration.test.ts` runs one tombstone per ledger table through the purge and `reconcileLedger`.
- Tests, journeys and drives use only loopback `justgo_test` and synthetic fixtures. No fixture request reaches a hosted API.
  - Enforced by (architecture, test): The `localTestDatabaseUrl` guard in `apps/api/scripts/local-test-database.ts`, the loopback guards in `e2e/support/environment.ts` and the request fence in `e2e/support/fixtures.ts`. Their tests are `apps/api/tests/db/rehearsal-target.test.ts`, `e2e/network-isolation.spec.ts`, `e2e/cleanup-isolation.spec.ts` and `scripts/journeys/journey-command.test.mjs`.
- A download reads every completion and version page against one data epoch, asking for each page with the previous page's cursor. It fails on a changed epoch, a repeated cursor or more than 50,000 records across both kinds, and then writes nothing locally and uploads nothing.
  - Enforced by (test): The download cases in `apps/mobile/src/data/cloud/coordinator.test.ts` serve pages from a fake that checks each requested cursor and has no extra page. Each fault, including an epoch change inside one kind, a cursor cycle and a server that keeps paging, rejects with no storage write, no local change and no upload. Exactly 50,000 records pass the cap and reach the first local write.
- One delete-all intent resets the server at most once, removes everything the server held when the intent was saved, and finishes on a crash-free retry. This holds when an ordinary sync, such as the one guest adoption runs, happens between attempts of a pending intent.
  - Enforced by (test): `apps/mobile/src/data/cloud/coordinator-deletion.model.test.ts` runs every schedule of up to 2 crashes or lost acknowledgements, 2 other-device events and 1 ordinary sync against `CloudDataCoordinator.deleteData`, the runtime's `clearData` and a model of `deletion.ts`. [`verify-delete-all-retry`](.claude/skills/verify-delete-all-retry/SKILL.md) owns its bounds and upkeep.
- Data actions wait for the user and managed history is kept. Returning from the owner sign-in that delete-all asks for never deletes, imports or opens a picker by itself. Leaving for Files keeps a pending pick's guest or account owner. Local and cloud modes never prune adopted earlier-day history.
  - Enforced by (test): `apps/mobile/src/features/settings/data/SettingsDataScreen.test.tsx` (sign-in return and Files trip cases) and the `local` and `cloud` rollover and relaunch case in `apps/mobile/src/data/activity/local-collections.test.ts`. Retiring the legacy mode is issue #293.
- Delete-all keeps the account signed in on its other devices and keeps its access grant, today the staging free beta, for both `/v1/access` and uploads. In managed mode the API still renews legacy sessions and replays a renewal or a pending legacy deletion under its original proof.
  - Enforced by (test): Cases in `apps/api/tests/data-sync/sync.integration.test.ts`. The devices case fails when delete-all revokes another legacy session. The access case fails when delete-all ends the account or when `/v1/access` or upload eligibility depends on cleared data. The legacy case fails when managed mode rejects renewal, renewal replay or legacy deletion, or loses the original-proof receipt.
- Guest adoption copies the source only after its accepted completions and reflections save and every stopped source or target sync settles. A completion still saving reaches the account, and its caller sees success. A reflection that fails to save fails the adoption and keeps the source for a retry. An accepted sync clear delays the copy.
  - Enforced by (test): Cases in `apps/mobile/src/app-support/providers/activity-runtime.managed.test.ts`. One fails for each await removed from `AccountRepository.withDataMigration` (accepted completions, accepted reflections) or from the `settled()` calls in `mergeGuestData` (source iCloud, target cloud and target iCloud coordinators).
- A runtime built before hydration finishes reads the current snapshot when it connects, then subscribes. Hydration or accepted input that lands between construction and connection still reaches it. Today that covers the app runtime from `createAppRuntime()`, which connects identity to the activity runtime, client and access, and the reflection controller.
  - Enforced by (test): The `connects to identity that hydrated after runtime construction` case in `apps/mobile/src/app-support/providers/AppProvider.test.tsx` fails when the runtime's `subscribe()` skips its first `sync()` or drops the identity subscription. The `reconciles saved local writing when hydration finishes before subscription` case in `apps/mobile/src/features/reflections/controller.test.ts` fails when `ReflectionController.connect()` skips its first `refresh()`. Only review catches a new runtime with this lifecycle that has no such case.
- Prove a user-facing change on the running app. Interactive checks use the built-in browser pane, not an outside Chrome window.
  - Enforced by (skill): [`verify-justgo`](.claude/skills/verify-justgo/SKILL.md) drives and its doctor
- Use current Expo and library APIs.
  - Enforced by (lint, type, CI, test, written): `@typescript-eslint/no-deprecated` in `pnpm run lint`, `pnpm run typecheck` against the installed packages, Expo Doctor in `pnpm run check` and the CI `static` job, and the saved journeys. `eslint-suppressions.json` lists the deprecated calls that predate the rule, and lint fails on a new call or a stale entry. The Expo docs bullet in the [repository map](#repository-map-and-common-commands) covers the judgment calls.
- Diagnostics carry no private text.
  - Enforced by (test, written): The Sentry payload tests in `apps/mobile/src/app-support/diagnostics/event.test.ts`. [Security and privacy](#security-and-privacy) covers the rest.
- Session tokens, Supabase refresh tokens, the Apple ID token and nonce, and legacy credential secrets never reach AsyncStorage, the journal, exports or diagnostics.
  - Enforced by (test, written): `apps/mobile/src/app-support/providers/AppProvider.token-canary.test.tsx` builds the real identity factory, Supabase client and vault on mock native Keychains, then runs legacy recovery, sign-in, sync, a 401 renewal, export, an error report, sign-out, a guest adoption, a provider switch and account deletion. It fails on any 16-character run of a secret, raw or base64 in any case, in any AsyncStorage write or journal row written during the run, the export ZIP or the Sentry envelope of a hostile event. Web sessionStorage, shorter fragments and other encodings are caught only in review.
- Requests never carry a bearer secret in a path, query or cookie, and responses never carry a new one. Bearer auth uses the security scheme, so no operation declares an `Authorization` or `Cookie` header. The account deletion receipt's credential digests are the one secret-shaped response field.
  - Enforced by (test): `packages/contracts/src/openapi.test.ts` walks both generated OpenAPI documents through `$ref`, compositions, `not`, items, maps, `patternProperties` and record keys, and reads parameters and response headers given as a `$ref`, a schema or `content`. It fails on any cookie parameter, an `Authorization` or `Cookie` header parameter, a secret-named path template, path or query parameter, response header or response field at any depth, and a `secretSchema` or transfer-code pattern outside request bodies and header parameters. A secret name contains token, secret, bearer, credential, recovery, proof, password, passphrase, API key, session, JWT, nonce, authorization or cookie, or the word OTP, in any case or separator, and does not end in the word id or ids. A secret-named list of records with an `id`, such as the credential list, is checked field by field. The walk does not enter `if`, `then`, `else`, `contains`, `dependentSchemas`, `unevaluatedProperties`, callbacks or webhooks, which the generated documents do not use today. Other names, encodings and those keywords are caught only in review.
- Managed sessions are stored only through `createAuthStorage()`, in their own `WHEN_UNLOCKED_THIS_DEVICE_ONLY` keychain service. Secrets are 32 bytes from `getRandomValues` through `randomSecretHex()`, never `getRandomBytes`.
  - Enforced by (test, lint): `apps/mobile/src/platform/auth/auth-storage.test.ts` checks the options SecureStore receives, and `justgo/import-boundaries` keeps `expo-secure-store` in that adapter. `random-secret.test.ts` checks `randomSecretHex()`, including two-digit hex for bytes below 0x10. Outside the generator and tests, `no-restricted-imports` bans the `expo-crypto` random functions, `justgo/import-boundaries` allows only static `expo-crypto` imports, and `no-restricted-globals` and `no-restricted-properties` ban the global `crypto`. An alias of the global object is caught only in review. Lint cases are in `import-boundaries.test.mjs` and `lint-rules.test.mjs`.
- Mobile loads `@sentry/*` packages only in its four diagnostics modules, because a new Sentry API needs a privacy review, and Supabase only in `managed-auth.ts`, so application data goes through the API. Mobile code adds no `SafeAreaProvider`, no Zustand `persist` middleware, and no `FlatList` beside `DayEntryList`.
  - Enforced by (lint, written): `justgo/import-boundaries` keeps `@sentry/*` in `app-support/diagnostics/{event,reporter,start,transport}.ts` and `@supabase/*` in `managed-auth.ts`, and allows only static `react-native`, `react-native-safe-area-context` and `zustand/middleware` imports. `no-restricted-imports` bans the named imports from shared lists in `eslint.config.mjs` that each override repeats. In `day-details`, it bans `FlatList` from `react-native` and `react-native-gesture-handler`, and `no-restricted-properties` bans any `.FlatList` read, such as `Animated.FlatList`. Tests are exempt. Lint cases are in `import-boundaries.test.mjs` and `lint-rules.test.mjs`. Only review catches new Sentry calls inside the four diagnostics modules, Supabase table calls in `managed-auth.ts`, `SafeAreaInsetsContext.Provider`, and deep package paths such as `react-native-safe-area-context/src/...`.
- Mobile query keys come from `accountKey()`, so one account's cached data never serves another. Mobile code never calls `import()`, so opening saved data never waits on a development split-bundle request. Features and routes never clear or replace local data themselves. Only `ActivityRuntime.deleteAllData()` and `importData()` do.
  - Enforced by (lint, written): `no-restricted-syntax` in `apps/mobile`, tests exempt, flags `import()` and a `queryKey` property or a positional `QueryClient` key (`getQueryData`, `setQueryData`, `getQueryState`, `getQueryDefaults`, `setQueryDefaults`) that is not an `accountKey()` call, an array that starts by spreading one, or a variable. A key or method named by an identifier, a string or a template with no expressions counts. In `features` and `app` it also flags `clearData`, `erase`, `restoreJournal`, `mergeCompletions`, `mergeSyncedJournal`, `observeDataEpoch` and `withDataMigration` as a member, a destructured key, or any string or plain template with that exact text, which covers `Reflect.get`. The route and feature block repeats the shared mobile list in `eslint.config.mjs`. Cases are in `lint-rules.test.mjs`. Only review catches a variable that holds an unscoped key, a name built at runtime such as `'clear' + 'Data'`, `Reflect.get`, `Reflect.apply`, `.call`, `.apply` or `.bind` on a `QueryClient` method, `import()` through `eval` or `new Function`, and these data calls in `app-support`.
- Screens stay accessible.
  - Enforced by (test, written): Role and accessible-name queries in component tests, journeys and drives fail when a queried label goes missing. [Accessibility](#accessibility) covers the rest.
- A bug found outside the task is filed with `bug` and one of `agent-fix`, `needs-decision` or `blocked`. Each known-bug test (Jest `.failing` or Vitest `.fails`) names its issue as `#NNN` or the issue URL. A decision trail records each filed bug in a `bug` row.
  - Enforced by (test, hook, written): `scripts/quality/known-bugs.test.mjs` fails on a tracked known-bug test with no issue reference in its title or the comment above. The Stop hook `.claude/hooks/require-trail-review.mjs` (cases in `trail-review-hook.test.mjs`) blocks while a trail's latest `bug` row for a bug has no label or skip reason. A bug with no row, and the issue's real labels, are caught only in review.
- Long or step-away runs keep a decision trail at `.local/decision-trails/<run>.tsv` and end with an audit and a separate review in `<run>.review.md`. A run writes only to its own trail and records other sessions' events there. A block over another session's trail means the hook or the main checkout is stale, so never write into that trail.
  - Enforced by (hook, written): The Claude Code Stop hook `.claude/hooks/require-trail-review.mjs` (PR #127)
- Hand work to another session with a brief that names the goal and points at the PRs and the decision trail (pstack's session-pickup playbook). Pause with pstack's pause-safely playbook: a `wip:` commit and a short resume note that points at the trail. Keep no standing handoff files.
  - Enforced by (written): Nothing. It is a judgment call.
- Verifiers run on Opus. Only a re-check of one named, docs- or tests-only, non-sensitive PR runs on Sonnet. Decision-trail reviews and non-sensitive audits run on Sonnet. Any other `Agent` helper keeps Sonnet only when its description starts with a routine kind (Research, Inventory, Docs pass, Docs-only, Lint fix, Format, Formatting fix) or a pstack Sonnet role name, and other non-Opus models are rewritten to Opus. A hook failure blocks the call.
  - Enforced by (hook, test): The `PreToolUse` hook `.claude/hooks/verifier-model.mjs`, which rewrites the `Agent` call's `model`, with cases in `scripts/quality/verifier-model-hook.test.mjs`
- Agents never set the `model` of a session they start. A session inherits its parent's model, and Anthony picks another one himself.
  - Enforced by (hook, test): The `PreToolUse` hook `.claude/hooks/session-model-guard.mjs`, which denies a `mcp__ccd_session__start_session` call that sets `model` (a `proposal_id`-only call passes) and every `mcp__ccd_session_mgmt__set_session_model` call, with cases in `scripts/quality/session-model-guard.test.mjs`
- A session started in the main checkout runs the current hooks and settings. On `main` with no tracked changes, the checkout fast-forwards to `origin/main` at session start, and asks for a restart when the update changed `.claude/` or the root agent instructions. Otherwise it says how far behind it is and why it was not updated. It never resets, stashes or touches untracked files, never blocks a session, and leaves linked worktrees alone.
  - Enforced by (hook, test): The `SessionStart` hook `.claude/hooks/sync-main.mjs`, which stays silent when offline or up to date, with cases against temporary repositories in `scripts/quality/sync-main-hook.test.mjs`
- When a chat starts or ends in the main checkout, a detached process removes each worktree under `.claude/worktrees/` that nobody needs: unlocked, with no changes or untracked files, no unique ignored files outside `.local/` (such as a key), its HEAD on a remote branch or its PR (the branch's, or the one a `ver-<n>` or `adv-<n>` name gives) merged or closed, no open PR on its branch or HEAD, no process inside, and no file outside `node_modules` changed for 2 hours. Before each removal, `refs/archive/worktrees/<name>` keeps its HEAD and its `.local/` is copied to `.local/archived-worktrees/<name>/`. When GitHub cannot be read, it keeps everything. It never forces a removal, never deletes a branch, and logs each removal with its commit to `.local/worktree-sweep.log`.
  - Enforced by (hook, test): The `SessionStart` (`startup`) and `SessionEnd` hooks start `.claude/hooks/sweep-worktrees.mjs --detach`, with cases against temporary repositories in `scripts/quality/sweep-worktrees-hook.test.mjs`. `--dry-run` lists what it would remove.
- Changes reach `main` only through a PR that passes `checks`, `description` and `verdict`.
  - Enforced by (GitHub): Branch protection on `main`, which also binds admins and blocks force-pushes and branch deletion. The old `sections` job in `pr-description.yml` passes only when `description` and `verdict` pass, and stays until no open PR needs it
- Agents merge only through `pnpm run merge:pr <n> --head <sha> [--auto]`. PRs that share a file merge one at a time: auto-merge armed first, then the earliest PASS verdict, then the lowest number. The script refuses a merge that would newly conflict an open PR earlier in that order, and first merges the latest `main` into a branch that is behind; only a direct merge waits for its checks. `node scripts/quality/merge-order.mjs` plans the order.
  - Enforced by (hook, test): The `PreToolUse` Bash hook `.claude/hooks/merge-order-guard.mjs` denies any command whose text contains `gh pr merge` or a `pulls/<n>/merge` API path, harmless mentions included. `scripts/quality/merge-pr.mjs` checks with `git merge-tree` and `verdict-patch.mjs`, fails closed when `gh`, git or the network fails, and pins each step to its head. Cases beside it in `merge-pr.test.mjs` and `merge-order-guard.test.mjs`
- After a `PASS`, agents push nothing more to that PR but docs, tests and merges from `main`. A push that cannot wait disarms auto-merge first and carries `PUSH_AFTER_PASS=1`.
  - Enforced by (hook, test, written): The `PreToolUse` Bash hook `.claude/hooks/push-after-pass-guard.mjs` denies a `git push` that `verdict-patch.mjs` says needs `re-verify` against a `PASS` on the PR head, and a push in the same command as a commit, merge or rebase to such a PR, with cases in `scripts/quality/push-after-pass-guard.test.mjs`. It reads shell text, skipping heredoc bodies and quoted strings, and lets a push through when it cannot parse it or git, `gh` or the network fails, so review catches those.
- Review rounds end. A `FAIL` must show a failure on a `Failure shown:` line, or it is a note and the verdict is `PASS+NOTES`. No verifier starts on an open PR whose `PASS` or `PASS+NOTES` still covers its head, or that already has 3 `FAIL` verdicts. Anthony can ask for another round.
  - Enforced by (CI, hook, test, written): `scripts/quality/verdict-status.mjs` in the required `verdict` job rejects a `FAIL` with no `Failure shown:` line and says to post `PASS+NOTES`, with cases in `verdict-status.test.mjs`. The `PreToolUse` Agent hook `.claude/hooks/review-rounds-guard.mjs` denies a verifier on such a PR unless its brief has an `Another round:` line, with cases in `scripts/quality/review-rounds-guard.test.mjs`. It lets the call through when `gh`, git or the network fails. Whether a shown failure is a real defect, and whether an `Another round:` line quotes Anthony, are caught only in review.
- Small non-sensitive PRs share one verifier, at most 4 PRs and 300 lines a batch, with a verdict comment on each PR.
  - Enforced by (test, written): `scripts/quality/verify-batch.mjs` lists the batches, with cases in `scripts/quality/verify-batch.test.mjs`. Starting one verifier per batch is a judgment call.
- CodeRabbit's docstring coverage is not a repository gate, so its pre-merge check stays off.
  - Enforced by (test, GitHub, written): `scripts/quality/coderabbit-config.test.mjs` fails unless `.coderabbit.yaml` sets `reviews.pre_merge_checks.docstrings.mode` to `'off'`. Branch protection requires only the GitHub Actions `checks`, `description` and `verdict`, and `ci-workflow.test.mjs` pins the jobs `checks` needs. A required status check added in GitHub settings is caught only in review.
- Agents follow the [effort](#agent-effort) and [merge](#git-and-autonomy) rules.
  - Enforced by (written): Nothing beyond the verdict check below. Agents act through Anthony's GitHub account and a PR needs no approval, so review catches a break.
- The newest verdict covers the PR head. A commit pushed after it needs a fresh verdict, unless every file it changes is review-only in `verdict-patch.mjs` (Markdown, tests, `eslint.config.mjs` and Prettier config). Review-only files still get a review.
  - Enforced by (CI, test): The required `verdict` job in `.github/workflows/pr-description.yml` runs `scripts/quality/verdict-status.mjs`, and `.github/workflows/verdict-recheck.yml` reruns that job when Anthony's account posts or edits a verdict. Cases in `scripts/quality/verdict-status.test.mjs`. A missing or unreadable verdict fails. The format is in [Git and autonomy](#git-and-autonomy).
- A PR description has the pstack sections in order: `## Why`, `## What changed` (optional), `## Scope`, `## Tradeoffs` (optional), `## Blast Radius` (optional), `## Verification`. A bad description fails only `description`, and the hook catches it before CI does.
  - Enforced by (hook, CI, test): `descriptionProblems()` in `scripts/quality/pr-description.mjs`, run by the required `description` job. The `PostToolUse` Bash hook `.claude/hooks/pr-description-check.mjs` reads the body back with `gh pr view` after each `gh pr create` or `gh pr edit` and tells the agent to fix it, with cases in `scripts/quality/pr-description-hook.test.mjs`. A PR created outside Bash is caught only by `description`.

## Security and privacy

- Enforce authorization and ownership at server and data boundaries, validate
  external input and keep least-privilege access.
- Keep diagnostics useful through safe error codes and request identifiers. Never
  log credentials, recovery secrets or private reflection text.
- Add no production access bypasses. Keep secrets, credentials and real private
  reflections out of test artifacts, logs, issues and PR descriptions.

## Accessibility

Preserve labels, focus and keyboard behavior, scalable text, usable small-screen
layouts and reduced motion. Prove native accessibility on a native surface, as
[Proving a change works](#proving-a-change-works) describes.

## Git and autonomy

Agents work in pstack's Autopilot-full model, with these JustGO limits.

- **Small PRs.** Each PR is narrow, verified and lands on its own. Start each PR
  from `main`. Stack one on another only when it needs that PR's change, and then
  it targets that PR's branch. A phase is several small PRs, not one consolidated PR.
  Parallel agents each get their own worktree and branch, with one owner per branch.
- **PR descriptions use pstack sections**: Why, What changed, Scope,
  Tradeoffs, Blast Radius and Verification, in that order. The
  `pr-description-check` hook and the required `description` check enforce them.
- **Act without asking** on reversible work: commit, push your own branches, open
  ready (not draft) PRs, update them, reply to review threads, create or update
  GitHub issues, and rebase or `--force-with-lease` push your own unshared PR branches.
- **Stop and ask first** before irreversible work: force-pushing a shared branch
  (`main`, or a branch someone else works on), deploying, deleting data, or sending
  messages to users. Here "deploy" includes staging deploys, migrations against
  any database other than the local `justgo_test`, production releases, TestFlight
  or App Store submissions, and settings changes in outside services (Supabase,
  Cloudflare, Sentry, App Store Connect). With Anthony's go, a code-only staging
  test may deploy a committed branch through `pnpm run release:staging:local`.
  That go does not cover migrations, production releases or merges. Until P15-8
  of the [Phase 15 plan](docs/implementation-plan/phase-15-supabase-api.md) moves
  that command to Supabase, it deploys the retired Worker. Run it only when
  Anthony's go names the Worker.
- **Do not contact providers.** Do not contact Vercel, Cloudflare or other providers
  about JustGO without Anthony's explicit instruction.
- **Never push to `main`.** Changes reach `main` only through a merged PR.
- **Keep the main checkout current.** Claude Code runs the hooks and skills from
  the main checkout, not from `origin/main`. When it is on `main`, clean and nothing
  runs from it, fast-forward it with `git -C <main> pull --ff-only`. Otherwise read
  repo facts with `git show origin/main:<path>` or `git grep <pattern> origin/main`.
  When a hook or gate fires on state your session does not own, check
  `git fetch -q && git rev-list --count HEAD..origin/main` in the main checkout
  first.
- **Merge only what is verified.** An agent may merge a PR directly once CI is
  green and an independent verdict from an agent that did not write it covers the
  current head. Auto-merge follows the next bullet instead. The required `checks`,
  `description` and `verdict` hold an auto-merge until a verdict covers the head. Green CI
  alone is not a verdict. Land
  stacks bottom-up, one PR at a time, and stop at the first PR without a verdict
  (pstack's Shipping playbook). Pin every merge to the head that a verdict
  covers, fresh or carried, with `pnpm run merge:pr <n> --head <head-sha>`,
  both direct and `--auto`. It passes `--match-head-commit`, so GitHub refuses
  a head no verdict covers. Agents merge only through that script. When the PR
  is behind `main`, the script first asks GitHub to merge `main` into its branch.
  It merges rather than rebases, because the squash-merge drops the merge commit
  and nobody has to force-push. It keeps the verdict only when
  `verdict-patch.mjs` says `carries` or `docs-tests-only`, waits for `checks`,
  `description` and `verdict` on the new head, and merges pinned to that head. On `re-verify`
  it stops, and a fresh verifier reviews the new head.
- **One verifier per PR, sensitive or not.** This replaces the full swarm in
  step 4 of pstack's `autopilot-full` playbook. At the code-ready head, one Opus
  verifier that did not write the PR proves the behavior and posts the verdict.
  Each fix round gets a fresh verifier, as [Agent effort](#agent-effort) says.
  Sensitive PRs get the same one verifier. Run a swarm or `/pstack:interrogate`
  only when Anthony asks for one on that PR.
- **Review rounds end.** Only a shown defect blocks a PR: a `FAIL` names, on a
  `Failure shown:` line, the command or test that broke on the head and what it
  printed. A risk, a wording gap or a missing case with no failure shown is a
  note, so the verdict is `PASS+NOTES`. Notes never start another round. The
  PR merges, and each note goes in an issue or a follow-up PR. A PR gets at most
  two fix rounds. After a third `FAIL`, stop and bring it to Anthony with what
  still fails. Another round past these limits runs only when Anthony asks, and
  its brief carries a line `Another round: <his words>`.
- **Batch small PRs under one verifier.** Before you start verifiers, run
  `node scripts/quality/verify-batch.mjs`. It lists the open PRs that need a
  verdict and groups the small ones, at most 4 PRs and 300 changed lines a
  batch. A small PR is not a draft, touches no sensitive path and no contracts,
  database, CI, dependency, `.claude` hook, skill or settings file, lint config
  or `scripts/quality` script outside its tests, and changes at most 150 lines
  outside tests. Give each batch one Opus verifier whose description
  starts with Verify and whose brief names every PR in it. It posts a separate
  verdict comment on each PR, so a `FAIL` holds only that PR. Every other PR
  keeps its own verifier.
- **Arm auto-merge when you open a PR.** Run
  `pnpm run merge:pr <n> --head <head-sha> --auto` right after
  opening the PR, and again after each push, pinned to the new head. The
  required `verdict` check stays red until a readable `PASS` covers that head,
  so GitHub merges on its own once the verdict and CI are green. The agent does
  not wait for CI to merge. If the branch is behind `main`, `--auto` merges
  `main` in and checks the verdict as above, then arms on the new head without
  waiting for CI. Branch protection requires up-to-date branches, so on each
  push to `main` the `Update behind PRs` workflow
  (`.github/workflows/update-behind-prs.yml`) merges `main` into every armed PR
  that is behind, and rerunning the script does the same by hand. After a
  `PASS`, push nothing more to the PR. Those `main` merges are the one
  exception, and the `push-after-pass-guard` hook denies a code push to a PR
  whose head has a `PASS`. It cannot check a push in the same command as a
  commit, merge or rebase, so it denies that too: run them as separate
  commands. Put
  optional notes and later additions in a follow-up PR or issue. If a push after
  a `PASS` cannot be avoided, run `pnpm run merge:pr <n> --disable-auto` first,
  prefix the push with `PUSH_AFTER_PASS=1`, and re-arm only after a fresh verdict covers the new head. A docs- or tests-only
  push keeps `verdict` green without a review. Also disarm with
  `--disable-auto` on Anthony's hold.
- **Sensitive PRs merge like any other.** Green CI and a `PASS` or `PASS+NOTES`
  that covers the head are enough, with no wait for Anthony. He can hold any
  PR, and a hold stops every merge until he lifts it.
- **A verdict covers a patch, not a commit.** Each verdict comment names the base
  and head it ran on, and whether the change is sensitive, in two lines of this
  form. The verdict is `PASS`, `PASS+NOTES` or `FAIL`, and either line may be
  bold. A `FAIL` adds a third line with the failure it shows:

  ```text
  Verifier verdict: FAIL on base `<base-sha>`, head `<head-sha>`
  Sensitive: no
  Failure shown: `<command or test>` on the head prints `<what broke>`
  ```

  Write `Sensitive: yes` when the change touches a path in
  [`sensitive-paths`](#agent-effort), or affects sign-in, account data,
  migrations or release from outside those paths. Otherwise write
  `Sensitive: no`. This is the one place that defines the format. The required `verdict` job
  reads the newest comment from Anthony's account that mentions a verdict. It
  fails when there is none, when that comment lacks either line (a heading
  such as `## Verdict: PASS`, prose, or a verdict with no `Sensitive` line is
  unreadable), on `FAIL` (and says to post `PASS+NOTES` when the `FAIL` has
  no `Failure shown:` line), or when
  that verdict no longer covers the PR head. So every PR shows `verdict` red
  until a readable `PASS` or `PASS+NOTES` covers its head. Posting
  a fresh verdict reruns it. If that rerun does not start, run
  `gh run rerun <run-id> --failed`. After a rebase or retarget, run
  `node scripts/quality/verdict-patch.mjs check <verdict-base> <verdict-head>`.
  `carries` keeps the verdict. `docs-tests-only` keeps it, and the listed files
  still get a review. `re-verify` needs a new verdict. CI always reruns.

- **Rebase a stacked PR after its parent squash-merges with `--onto`.** Replay
  only the child's own commits with `git rebase --onto origin/main <old-parent-tip>`.
  A plain rebase replays the parent's commits, which `main` already holds as one
  squashed commit.

## Agent effort

- Subagents and helpers run at `medium` or `high` effort. Never use `low` or
  `max`. Anthony capped effort at `high` on 2026-11-07 to cut usage. `high` is
  the default, including for the sensitive areas below.
- Use `xhigh` only when Anthony asks for it on that task. When a task seems to
  need `xhigh`, say why in the conversation and wait for his choice. Never raise
  effort to `xhigh` on your own, including through pstack's step up for the
  hardest work.
- Re-verify a fix with a fresh verifier, not the one that found the problem,
  because a resumed verifier checks only its own findings. It re-reads the
  whole PR, not only the change since the last verdict.
- Verifiers run on Opus. The `PreToolUse` hook `.claude/hooks/verifier-model.mjs`
  sets the model of every verifier `Agent` call: one whose description starts
  with Verify, Verifier, Re-verify or Re-check, or whose prompt asks for a
  `Verifier verdict:` line. It picks Sonnet only for a re-check (description
  starting with Re-verify or Re-check) whose brief names exactly one PR, as
  `PR #<n>` or a PR URL, whose files on GitHub are all docs or tests by the
  `verdict-patch.mjs` rule, none on the sensitive list, and whose brief has no
  `Sensitive: yes` line. Anything else gets Opus. The hook sets the model only,
  so pass `effort: "high"` yourself. A hook that cannot run blocks the call.
- When Anthony raises usage limits or cost, offer `/pstack:setup-pstack`, which
  sets the model and effort for each pstack role.
- Start routine `Agent` helpers on Sonnet at `high` (`model: "sonnet"`) when
  pstack's per-role settings do not already cover them. This covers `Agent`
  calls only, never a session. Routine helpers are research, inventories,
  docs-only passes, and lint and formatting fixes, and that list is complete.
  Any other helper, or one you are unsure about, runs on Opus. Owners that
  change behavior stay on Opus. The verifier hook above decides each
  verifier's model, so this bullet never overrides it.
- `verifier-model.mjs` enforces that list. An `Agent` call that is not a verifier,
  trail review or audit keeps Sonnet only when its description starts with
  Research, Inventory, Docs pass, Docs-only, Lint fix, Format or Formatting
  fix. A pstack role that `~/.claude/rules/pstack-models.md` puts on Sonnet
  keeps it when the description starts with the role name: How explorer, How
  explainer, Why investigator, Reflect, Hillclimb or Arena cross-judge. The
  hook rewrites any other non-Opus `model` to Opus.
- Agents never set a session's `model`. A session inherits its parent's model,
  and Anthony picks another one himself in the app. The `PreToolUse` hook
  `.claude/hooks/session-model-guard.mjs` denies a `start_session` call that
  sets `model` and every `set_session_model` call. A saved `preset` can carry a
  model, so start a session with a preset only when Anthony names it.
- `verifier-model.mjs` also sets the model for decision-trail reviews and audits, so
  describe them that way. A description that starts with "Review" and then
  names the trail, such as "Review the P15-3 decision trail", or that starts
  with "Trail review", runs on Sonnet unless it mentions a verdict. A
  description that starts with "Audit", or with a task id such as `P15-4` and
  then "audit", runs on Sonnet. An audit runs on Opus instead when its brief
  says `Sensitive: yes` or names one PR that touches a sensitive path. With no
  single PR named, or when GitHub cannot be read, only `Sensitive: yes` keeps
  an audit on Opus, so write that line for any audit of sensitive work. Pass
  the effort yourself.
- Every turn rereads the whole context, so a long-lived session costs more per
  turn as it grows. `.claude/settings.json` sets `autoCompactWindow` to
  `233000`. Claude Code keeps about 33k of that window for output and a
  buffer, so it compacts a JustGO session at about 200k. Agents do not need to
  track their own context. A model with a smaller window keeps its own limit.
  `claude -p /autocompact` shows the window in force, and `get_usage` reports
  where auto-compact starts.
- The sensitive areas are sign-in and identity, account data and
  deletion, database migrations, and release and backup scripts.
  [`scripts/quality/sensitive-paths.mjs`](scripts/quality/sensitive-paths.mjs)
  lists their paths, and the verifier hook reads that list.
- Only Claude models are available here. Where pstack asks for a reviewer, judge
  or verifier from a different model family, use a separate Claude agent and say
  so in its verdict.

## Temporary worktree cleanup

- The `sweep-worktrees` hook in the [rules list](#rules-and-what-enforces-them)
  removes idle, finished worktrees when a chat starts or ends in the main checkout.
  For the rest, such as worktrees with uncommitted work or outside
  `.claude/worktrees/`, clean up by hand with pstack's worktree-cleanup playbook
  (`poteto-mode/playbooks/worktree-cleanup.md`). A temporary task worktree may be
  retired once its work is verified on the PR branch that carries it, or on
  `main`. It need not wait for the PR to merge into `main`.
- Anthony authorizes removal of eligible temporary task worktrees once the
  playbook's checks pass and no uncommitted, untracked or ignored unique material
  or active use remains. This standing permission applies only to JustGO. It does
  not authorize branch deletion or removal of a worktree still in use. Merge and
  archive approvals remain separate.
