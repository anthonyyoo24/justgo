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
- Focused checks: `npm run test -w <workspace>`, `npm run typecheck -w <workspace>`,
  `npm run lint`. Broader gates: `npm run check`, `npm run test:db`,
  `npm run test:journey`. `npm run test:coverage` is an optional report.
- Pick the checks for a change from
  [Choosing checks](docs/operations/TESTING.md#choosing-checks). Write tests as
  [Writing tests](docs/operations/TESTING.md#writing-tests) describes.
- On the owner's 8 GB Mac, run heavy builds and checks one at a time and reuse
  existing tools and caches. Native signing or build upgrades need a separate task.

## Where facts live

- [The implementation plan](docs/implementation-plan/README.md) owns phase scope
  and sequencing. When a task names a phase, read that phase before you edit.
  Change the plan only when scope or a decision changes.
- The [identity boundary](docs/architecture/IDENTITY.md),
  [activity data](docs/architecture/ACTIVITY_DATA.md) and
  [app shell](docs/architecture/APP_SHELL.md) guides own the domain safety
  invariants: hydration, account deletion and credential preservation, lifecycle
  and clock coordination, and native modal, animation and list behavior. Read the
  owner before you change that behavior.
- The [tech stack](docs/architecture/TECH_STACK.md) and
  [folder structure](docs/architecture/FOLDER_STRUCTURE.md) guides describe the
  implemented boundaries and paths.
- [Testing guidance](docs/operations/TESTING.md) owns the commands, the CI gates
  and the proof standard. [`verify-justgo`](.claude/skills/verify-justgo/SKILL.md)
  owns how to start, drive and check the app.
- Open gates are GitHub issues labeled `gate` (`gh issue list --label gate`). File
  each deferred device, hosted or staging check as one, and each approved deferral
  of a review finding as an issue. Close each with a link to its evidence.
- Put a lasting invariant, trap or setup step in the doc that owns it. Put a fact
  outside the repo, such as a provider setting, a legal approval or an account
  fact, in the operations or legal doc that owns it.

## Rules and what enforces them

A check fails the build when its rule breaks. A written rule is a judgment call
that no check catches. When an agent repeats a mistake, run `/pstack:correct`. It
fixes the mistake at the highest level that works and updates this table.

| Rule                                                                                                                                                                                                                                                                           | Enforced by                                                                                                                                                                                                                                                                                                                                                            | Kind                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Workspaces and mobile folders import each other only in the allowed directions, including through re-exports, `import()` and `require()`. The lint error names the broken direction. The [folder structure guide](docs/architecture/FOLDER_STRUCTURE.md) lists the directions. | `justgo/import-boundaries` in `eslint.config.mjs`, defined in `scripts/quality/import-boundaries.mjs`, with cases in `scripts/quality/import-boundaries.test.mjs`                                                                                                                                                                                                      | lint                    |
| Import contracts through `@justgo/contracts`, not a subpath. The API's `@justgo/contracts/openapi` import is the one exception.                                                                                                                                                | `justgo/import-boundaries`                                                                                                                                                                                                                                                                                                                                             | lint                    |
| TypeScript is strict.                                                                                                                                                                                                                                                          | `strict` in `tsconfig.base.json` and `apps/mobile/tsconfig.json`, checked by `npm run typecheck`                                                                                                                                                                                                                                                                       | type                    |
| Await each promise or handle its failure. Use `void` only for background work whose failure is already handled.                                                                                                                                                                | `@typescript-eslint/no-floating-promises`, `no-misused-promises` and `await-thenable`, with the promise-lint cases in `import-boundaries.test.mjs`                                                                                                                                                                                                                     | lint                    |
| Switches are exhaustive, code throws only `Error` values, and type assertions and union members are necessary.                                                                                                                                                                 | `@typescript-eslint/switch-exhaustiveness-check`, `only-throw-error`, `no-unnecessary-type-assertion` and `no-redundant-type-constituents`, with cases in `scripts/quality/lint-rules.test.mjs`                                                                                                                                                                        | lint                    |
| Mobile tests await async Testing Library queries and utilities.                                                                                                                                                                                                                | `testing-library/await-async-queries`, `await-async-utils`, `no-await-sync-queries` and `no-promise-in-fire-event`, with cases in `lint-rules.test.mjs`                                                                                                                                                                                                                | lint                    |
| Every owner path in the folder guide exists, and the approved mobile groups stay listed. The route tree matches the root stack.                                                                                                                                                | `scripts/quality/folder-structure.test.mjs` and `scripts/quality/routes.test.mjs`                                                                                                                                                                                                                                                                                      | test                    |
| New code goes with the owner of its responsibility.                                                                                                                                                                                                                            | [Placement and move rules](docs/architecture/FOLDER_STRUCTURE.md#placement-and-move-rules)                                                                                                                                                                                                                                                                             | written                 |
| Local links in tracked Markdown point at files that exist.                                                                                                                                                                                                                     | `scripts/quality/doc-links.test.mjs`                                                                                                                                                                                                                                                                                                                                   | test                    |
| CI keeps its job shape, SHA pins and prerequisites, and no job relies on ignored `.env` files.                                                                                                                                                                                 | `scripts/quality/ci-workflow.test.mjs` and actionlint in the CI `static` job                                                                                                                                                                                                                                                                                           | test, CI                |
| Tests, journeys and drives use only loopback `justgo_test` and synthetic fixtures. No fixture request reaches a hosted API.                                                                                                                                                    | The `localTestDatabaseUrl` guard in `apps/api/scripts/local-test-database.ts`, the loopback guards in `e2e/support/environment.ts` and the request fence in `e2e/support/fixtures.ts`. Their tests are `apps/api/tests/db/rehearsal-target.test.ts`, `e2e/network-isolation.spec.ts`, `e2e/cleanup-isolation.spec.ts` and `scripts/journeys/journey-command.test.mjs`. | architecture, test      |
| Prove a user-facing change on the running app. Interactive checks use the built-in browser pane, not an outside Chrome window.                                                                                                                                                 | [`verify-justgo`](.claude/skills/verify-justgo/SKILL.md) drives and its doctor                                                                                                                                                                                                                                                                                         | skill                   |
| Use current Expo APIs.                                                                                                                                                                                                                                                         | `npm run typecheck` against the installed packages, Expo Doctor in `npm run check` and the CI `static` job, and the saved journeys. [`apps/mobile/AGENTS.md`](apps/mobile/AGENTS.md) covers the judgment calls.                                                                                                                                                        | type, CI, test, written |
| Diagnostics carry no private text.                                                                                                                                                                                                                                             | The Sentry payload tests in `apps/mobile/src/app-support/diagnostics/event.test.ts`. [Security and privacy](#security-and-privacy) covers the rest.                                                                                                                                                                                                                    | test, written           |
| Screens stay accessible.                                                                                                                                                                                                                                                       | Role and accessible-name queries in component tests, journeys and drives fail when a queried label goes missing. [Accessibility](#accessibility) covers the rest.                                                                                                                                                                                                      | test, written           |

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
[Proving a change works](docs/operations/TESTING.md#proving-a-change-works)
describes.

## Git and autonomy

Agents work in pstack's model: small stacked PRs, reversible work without asking,
and a stop before anything irreversible. Only Anthony merges.

- **Small stacked PRs.** Each PR is narrow, verified and lands on its own; a child
  PR targets its parent's branch. A phase is a stack of PRs, not one consolidated PR.
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
- **Only Anthony merges.** Agents stop at merge-ready, never merge a PR and never
  enable auto-merge. Green CI and agent verdicts do not replace his review.

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
