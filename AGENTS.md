# Working on JustGO

The agent process is pstack (in Claude Code, `/pstack:poteto-mode`). Where pstack
and this file disagree, follow pstack. The Git and autonomy rules below still hold.
This file holds what pstack cannot know about JustGO: the repository map, where
each fact lives, the rules and what enforces them, and the owner's permissions.
Directory instructions, such as `apps/mobile/AGENTS.md`, also apply.

## Repository map and common commands

- `apps/mobile` (`@justgo/mobile`): Expo app. `apps/api` (`@justgo/api`): API
  and database. `packages/contracts` (`@justgo/contracts`): shared Zod contracts.
  `e2e/`: saved Playwright journeys. `scripts/quality` and `scripts/journeys`:
  architecture, coverage and journey tooling. `.claude/skills/verify-justgo`: the
  skill that starts, drives and checks the running app.
- Use the pinned Node and npm versions from the root manifests and `.nvmrc`.
- To run one test file, pass `-- --runTestsByPath src/<path>.test.tsx` to the
  mobile `test` script, or `-- <path>` to the API and contracts scripts.

| Command                                | Purpose                                                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test -w <workspace>`          | Workspace unit, component and contract tests. The API default skips database cases.                                                                                 |
| `npm run typecheck -w <workspace>`     | Focused TypeScript. Mobile regenerates its Expo route types first.                                                                                                  |
| `npm run lint`                         | Repository lint and dependency-direction rules                                                                                                                      |
| `npm run test:architecture`            | Tooling, boundary, fixture, legal-reader and quality regressions                                                                                                    |
| `npm run check`                        | Online Expo Doctor, contracts build, all typechecks, lint, format, architecture and workspace tests                                                                 |
| `npm run db:local`                     | Prepare the isolated loopback PostgreSQL roles and database                                                                                                         |
| `npm run db:migrate`                   | Apply registered migrations through the migrator connection                                                                                                         |
| `npm run test:db`                      | Real database services and policies, plus the migration rehearsal                                                                                                   |
| `npm run test:db:file -w @justgo/api`  | One database test file: `-- tests/<area>/<file>.integration.test.ts`, optional `-t '<name>'`. First run `db:local` (keeps an existing `.env`), then `db:migrate`.   |
| `npm run test:journey`                 | Saved Playwright journeys against the real app, the fixture API and the disposable database                                                                         |
| `npm run test:coverage`                | Optional report with no threshold. It includes the database suites, so prepare the local database first. Output goes to ignored `coverage/{mobile,api,contracts}/`. |
| `npm run export:web -w @justgo/mobile` | Cold web export. `export:ios` is the iOS one.                                                                                                                       |
| `npm run test:exported-web`            | Smoke the existing web export with no API or database traffic                                                                                                       |
| `npm run build:legal`                  | Build the local legal pages, then check their reading and navigation in the built-in browser pane. `-- --production` refuses unapproved source or date metadata.    |

### Choosing checks

Classify the behavior and boundary that changed, not the directory.

| Change                                       | Checks                                                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation only                           | Changed-file formatting and `node --test scripts/quality/doc-links.test.mjs`. No app tests, builds or UI checks.                                                                                                    |
| Contained code change                        | Focused tests for the changed behavior and its consumers, affected workspace typechecks, `npm run lint` and changed-file formatting. Affected saved journeys, and a `verify-justgo` drive for a user-facing change. |
| Contracts, tsconfig, ESLint or `e2e/support` | Also `npm run build:contracts && npm run typecheck` from the root, which covers every workspace and the journeys.                                                                                                   |
| API, shared protocol or data                 | Also `npm run test:db` against loopback `justgo_test`, with ownership, replay, failure and migration cases. A mobile UI or navigation change alone does not cross this boundary.                                    |
| Dependencies, Expo or native                 | Full `npm run check` with its online Expo Doctor, plus the native build and device acceptance the change affects.                                                                                                   |
| Release build                                | Full `npm run check`, the saved journeys and exports, `test:db`, and the open hosted, staging and physical-device gates.                                                                                            |

Before pushing, run the checks for the touched paths on the committed head. CI
runs the full set on every pull request that changes more than Markdown. Expand
the local checks for a concrete failure or an explicit owner request, and state
the trigger.

On the owner's 8 GB Mac, run one heavy check or build at a time and reuse existing
tools and caches. Do not rerun a passed check that a broader command already ran
unless its inputs changed or a failure needs investigation. Native signing or build
upgrades need a separate task.

## Proving a change works

pstack's `prove-it-works` principle and `tdd` skill set the method: prove the change
on the real surface with a check that fails before it and passes after it, write a
failing test first when a cheap test path exists, and prefer no new test over a bad
one. JustGO adds these rules:

- Drive a user-facing change through `verify-justgo`. Read an API or data change
  back from the database or the response.
- Give each claim one verdict and name its surface. **Verified** means the check
  ran on the real surface and showed the claimed behavior. **Not verified** means
  it ran and showed something else. **Inconclusive** means it could not run or
  could not tell, for example because the surface needs a physical phone; say what
  blocked it. The `verify-justgo` Gotchas list what browser evidence cannot prove.
- Keep the Playwright journeys, the web adapters and the fixture safeguards until a
  native drive proves the same app, API and database cases and passes hosted CI.
- When behavior depends on storage, transport, time or randomness, control it
  through the existing seam, such as the vault, `fetch`, AppState or a clock. The
  test then controls failures, timing and retries without replacing the domain
  logic. Add a small interface only where no seam exists.

## Where facts live

- [The implementation plan](docs/implementation-plan/README.md) owns phase scope
  and sequencing. When a task names a phase, read that phase before you edit.
  Change the plan only when scope or a decision changes. Keep a task's scope
  bounded, and preserve existing behavior unless the task changes it.
- The [identity boundary](docs/architecture/IDENTITY.md),
  [activity data](docs/architecture/ACTIVITY_DATA.md) and
  [app shell](docs/architecture/APP_SHELL.md) guides own the domain safety
  invariants: hydration, account deletion and credential preservation, lifecycle
  and clock coordination, and native modal, animation and list behavior. Read the
  owner before you change that behavior.
- The [tech stack](docs/architecture/TECH_STACK.md) guide describes the
  implemented boundaries. The source tree is the path map, and
  [Placement and move rules](#placement-and-move-rules) say where new code goes.
- This file owns the commands, the check matrix and the proof standard.
  [`verify-justgo`](.claude/skills/verify-justgo/SKILL.md) owns how to start, drive
  and check the app, including the saved journeys and the exported-web smoke. The
  tech stack guide describes CI, and the operations docs own their own local
  rehearsals.
- Open gates are GitHub issues labeled `gate` (`gh issue list --label gate`). File
  each deferred device, hosted or staging check as one, and each approved deferral
  of a review finding as an issue. Close each with a link to its evidence.
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
- Keep tests beside their owner and native/web adapter pairs together. API
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
- Before opening the PR, review the complete file list of each touched directory. Keep
  organization within the task's responsibility and record unrelated cleanup
  separately. Preserve unrelated retained code and existing test and boundary
  safeguards.

## Rules and what enforces them

A check fails the build when its rule breaks. A written rule is a judgment call
that no check catches. When an agent repeats a mistake, run `/pstack:correct`. It
fixes the mistake at the highest level that works and updates this table.

| Rule                                                                                                                                                                                                                                                                                        | Enforced by                                                                                                                                                                                                                                                                                                                                                                              | Kind                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Workspaces and mobile folders import each other only in the allowed directions, including through re-exports, `import()` and `require()`. The lint error names the broken direction.                                                                                                        | `justgo/import-boundaries` in `eslint.config.mjs`, defined in `scripts/quality/import-boundaries.mjs`, with cases in `scripts/quality/import-boundaries.test.mjs`                                                                                                                                                                                                                        | lint                    |
| Import contracts through `@justgo/contracts`, not a subpath. The API's `@justgo/contracts/openapi` import is the one exception.                                                                                                                                                             | `justgo/import-boundaries`                                                                                                                                                                                                                                                                                                                                                               | lint                    |
| TypeScript is strict.                                                                                                                                                                                                                                                                       | `strict` in `tsconfig.base.json` and `apps/mobile/tsconfig.json`, checked by `npm run typecheck`                                                                                                                                                                                                                                                                                         | type                    |
| Await each promise or handle its failure. Use `void` only for background work whose failure is already handled.                                                                                                                                                                             | `@typescript-eslint/no-floating-promises`, `no-misused-promises` and `await-thenable`, with the promise-lint cases in `import-boundaries.test.mjs`                                                                                                                                                                                                                                       | lint                    |
| Switches are exhaustive, code throws only `Error` values, and type assertions and union members are necessary.                                                                                                                                                                              | `@typescript-eslint/switch-exhaustiveness-check`, `only-throw-error`, `no-unnecessary-type-assertion` and `no-redundant-type-constituents`, with cases in `scripts/quality/lint-rules.test.mjs`                                                                                                                                                                                          | lint                    |
| Mobile tests await async Testing Library queries and utilities.                                                                                                                                                                                                                             | `testing-library/await-async-queries`, `await-async-utils`, `no-await-sync-queries` and `no-promise-in-fire-event`, with cases in `lint-rules.test.mjs`                                                                                                                                                                                                                                  | lint                    |
| The route tree matches the root stack.                                                                                                                                                                                                                                                      | `scripts/quality/routes.test.mjs`                                                                                                                                                                                                                                                                                                                                                        | test                    |
| New code goes with the owner of its responsibility.                                                                                                                                                                                                                                         | [Placement and move rules](#placement-and-move-rules)                                                                                                                                                                                                                                                                                                                                    | written                 |
| Do not disable a lint rule inline, weaken the lint config, silence an unexpected warning or remove an assertion to make a check pass.                                                                                                                                                       | `scripts/quality/lint-rules.test.mjs` and `scripts/quality/import-boundaries.test.mjs` fail when a rule they cover is turned off: the promise, exhaustive-switch, throw, type-assertion, redundant-union, React and Testing Library rules and `justgo/import-boundaries`. Inline suppressions (12 in 6 files today), silenced warnings and removed assertions are caught only in review. | test, written           |
| Local links in tracked Markdown point at files that exist.                                                                                                                                                                                                                                  | `scripts/quality/doc-links.test.mjs`                                                                                                                                                                                                                                                                                                                                                     | test                    |
| CI keeps its job shape, SHA pins and prerequisites, and no job relies on ignored `.env` files.                                                                                                                                                                                              | `scripts/quality/ci-workflow.test.mjs` and actionlint in the CI `static` job                                                                                                                                                                                                                                                                                                             | test, CI                |
| Tests, journeys and drives use only loopback `justgo_test` and synthetic fixtures. No fixture request reaches a hosted API.                                                                                                                                                                 | The `localTestDatabaseUrl` guard in `apps/api/scripts/local-test-database.ts`, the loopback guards in `e2e/support/environment.ts` and the request fence in `e2e/support/fixtures.ts`. Their tests are `apps/api/tests/db/rehearsal-target.test.ts`, `e2e/network-isolation.spec.ts`, `e2e/cleanup-isolation.spec.ts` and `scripts/journeys/journey-command.test.mjs`.                   | architecture, test      |
| Prove a user-facing change on the running app. Interactive checks use the built-in browser pane, not an outside Chrome window.                                                                                                                                                              | [`verify-justgo`](.claude/skills/verify-justgo/SKILL.md) drives and its doctor                                                                                                                                                                                                                                                                                                           | skill                   |
| Use current Expo APIs.                                                                                                                                                                                                                                                                      | `npm run typecheck` against the installed packages, Expo Doctor in `npm run check` and the CI `static` job, and the saved journeys. [`apps/mobile/AGENTS.md`](apps/mobile/AGENTS.md) covers the judgment calls.                                                                                                                                                                          | type, CI, test, written |
| Diagnostics carry no private text.                                                                                                                                                                                                                                                          | The Sentry payload tests in `apps/mobile/src/app-support/diagnostics/event.test.ts`. [Security and privacy](#security-and-privacy) covers the rest.                                                                                                                                                                                                                                      | test, written           |
| Screens stay accessible.                                                                                                                                                                                                                                                                    | Role and accessible-name queries in component tests, journeys and drives fail when a queried label goes missing. [Accessibility](#accessibility) covers the rest.                                                                                                                                                                                                                        | test, written           |
| Long or step-away runs keep a decision trail at `.local/decision-trails/<run>.tsv` and end with an audit and a separate review in `<run>.review.md`.                                                                                                                                        | The Claude Code Stop hook `.claude/hooks/require-trail-review.mjs` (PR #127)                                                                                                                                                                                                                                                                                                             | hook                    |
| Hand work to another session with a brief that names the goal and points at the PRs and the decision trail (pstack's session-pickup playbook). Pause with pstack's pause-safely playbook: a `wip:` commit and a short resume note that points at the trail. Keep no standing handoff files. | Nothing; a judgment call.                                                                                                                                                                                                                                                                                                                                                                | written                 |
| Changes reach `main` only through a PR that passes `checks` and `sections`.                                                                                                                                                                                                                 | Branch protection on `main`, which also binds admins and blocks force-pushes and branch deletion                                                                                                                                                                                                                                                                                         | GitHub                  |
| Agents follow the [effort](#agent-effort) and [merge](#git-and-autonomy) rules.                                                                                                                                                                                                             | Nothing. Agents act through Anthony's GitHub account and a PR needs no approval, so review catches a break.                                                                                                                                                                                                                                                                              | written                 |

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

Agents work in pstack's model: small PRs, reversible work without asking,
and a stop before anything irreversible. Agents merge verified PRs (pstack's
Autopilot-full).

- **Small PRs.** Each PR is narrow, verified and lands on its own. Start each PR
  from `main`. Stack one on another only when it needs that PR's change, and then
  it targets that PR's branch. A phase is several small PRs, not one consolidated PR.
  Parallel agents each get their own worktree and branch, with one owner per branch.
- **Act without asking** on reversible work: commit, push your own branches, open
  ready (not draft) PRs, update them, reply to review threads, create or update
  GitHub issues, and rebase or `--force-with-lease` push your own unshared PR branches.
- **Stop and ask first** before irreversible work: force-pushing a shared branch
  (`main`, or a branch someone else works on), deploying, deleting data, or sending
  messages to users. Here "deploy" includes staging deploys, migrations against
  any database other than the local `justgo_test`, production releases, TestFlight
  or App Store submissions, and settings changes in outside services (Supabase,
  Cloudflare, Sentry, App Store Connect). With Anthony's go, a code-only staging test may deploy a committed branch
  through `npm run release:staging:local`; that go does not cover migrations,
  production releases or merges.
- **Do not contact providers.** Do not contact Vercel, Cloudflare or other providers
  about JustGO without Anthony's explicit instruction.
- **Never push to `main`.** Changes reach `main` only through a merged PR.
- **Merge only what is verified.** An agent may merge a PR, or arm GitHub
  auto-merge on it, once CI is green and an independent verdict from an agent that
  did not write it covers the current head. Green CI alone is not a verdict. Land
  stacks bottom-up, one PR at a time, and stop at the first PR without a verdict
  (pstack's Shipping playbook).
- **Anthony merges the sensitive areas.** PRs that touch the paths in
  [Agent effort](#agent-effort) (sign-in and identity, account data and
  deletion, migrations, release and backup scripts) stop at merge-ready for
  Anthony. He can also hold any PR, and a hold stops every merge until he lifts it.
- **A verdict covers a patch, not a commit.** Each verdict comment names the base
  and head it ran on. After a rebase or retarget, run
  `node scripts/quality/verdict-patch.mjs check <verdict-base> <verdict-head>`.
  `carries` keeps the verdict. `docs-tests-only` keeps it, and the listed files
  still get a review. `re-verify` needs a new verdict. CI always reruns.

## Agent effort

- Subagents and helpers run at `medium` effort or higher, never `low`.
- Use `xhigh` for work that touches sign-in and identity, account data and
  deletion, database migrations, or release and backup scripts. These live mainly
  in `apps/api/src/{identity,access,account-export,data-sync}/`,
  `apps/api/src/http/bearer.ts`, `apps/api/src/db/{schema,managed-session-check}.ts`,
  `apps/api/drizzle/`, `apps/api/scripts/`, `apps/mobile/src/app-support/{identity,access}/`,
  `apps/mobile/src/app/account/`, `apps/mobile/src/data/{backup,cloud}/`,
  `apps/mobile/src/data/activity/sync/`, `scripts/release/`, `scripts/backups/` and the
  release, staging and backup workflows in `.github/workflows/`.
- Run `/pstack:interrogate` on every PR that touches those areas before calling
  it verified.
- Only Claude models are available here. Where pstack asks for a reviewer, judge
  or verifier from a different model family, use a separate Claude agent and say
  so in its verdict.

## Temporary worktree cleanup

- Clean up with pstack's worktree-cleanup playbook
  (`poteto-mode/playbooks/worktree-cleanup.md`). A temporary task worktree may be
  retired once its work is verified on the PR branch that carries it, or on
  `main`. It need not wait for the PR to merge into `main`.
- Anthony authorizes removal of eligible temporary task worktrees once the
  playbook's checks pass and no uncommitted, untracked or ignored unique material
  or active use remains. This standing permission applies only to JustGO. It does
  not authorize branch deletion or removal of a worktree still in use. Merge and
  archive approvals remain separate.
