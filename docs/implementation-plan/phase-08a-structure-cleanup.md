<a id="phase-08a"></a>

# Phase 08A — Structure, docs & tooling cleanup

**Status:** Published for owner review — integration and approved cleanup remain open.

## Outcome

The repository is easier and cheaper to work in. Routes, folders and documentation match how the app works today, each URL has exactly one route file, route links are type-checked, and CI is faster and does not fail without a code change. Users see no difference.

## Decisions in force

- Dependencies: 08 merged, including the account-deletion worktree, with no other feature branch open. File moves conflict with any open branch, so start only when the tree is quiet.
- Acceptance: Existing implemented behavior; [AGENTS.md](../../AGENTS.md) folder, move and verification rules; the [codebase assessment](https://claude.ai/code/artifact/f5067650-3c46-4c2e-bf14-1fcb107617ab) (bracketed IDs). This phase adds no product behavior or physical-device acceptance gates.
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

1. **Documentation first, so Phase 09 starts on the new format [DOC-1–DOC-6].**
   - Delete files that no longer work or label themselves superseded: `checks/check-plan.mjs` and `checks/plan-check-results.md` (the script reads the missing `IMPLEMENTATION_PLAN.html`; also drop that line from `.prettierignore`), `handoffs/00-planning-baseline.md`, `handoffs/01-ios-release-scope.md` and `operations/SHIPATON_PLAYBOOK.md`. Git keeps their history.
   - Create `docs/archive/`. Move handoffs whose work and gates are complete (for example Phase 01 and 06A), and `architecture/FRONTEND_ARCHITECTURE_LEARNING_MAP.md`. Keep the deferred 07.3A checkpoint and its browser assessment in place, because Phase 13's native smoke starts from them. Handoffs with open device or release gates, including the folder cleanup and day-sheet performance handoffs, move when Phase 13 closes those gates.
   - Split this plan into a `docs/implementation-plan/` folder: a `README.md` with one status line per phase, the stage table, release order, how to use the plan and the handoff workflow, plus one named file per phase (for example `phase-08-settings-privacy.md`). Every phase file has only these sections: a status line (edited in place), Outcome, Decisions in force, Implement, Keep out, Ready to hand off when, and Open gates for Phase 13.
   - While splitting, remove what is not a plan: every dated note in the header and phase sections (fold scope changes into Implement or Keep out and add a dated line to `DECISIONS.md`; progress already lives in handoffs), superseded or historical text, evidence inside spec bullets, test counts, commit SHAs, PR numbers, branch names and the missing-HTML-tracker references. Move the open-decisions table to `DECISIONS.md`, the App Store setup table to `operations/APPLE_SETUP.md` and the repository-structure section to `architecture/FOLDER_STRUCTURE.md`. Move Phase 07's settled technical design into architecture docs and archive its original API/persistence discussion record.
   - Leave a short `IMPLEMENTATION_PLAN.md` stub pointing to the new folder so existing links keep working, update the plan path in AGENTS.md, and replace AGENTS.md's rule to update "the phase handoff, plan and handoff index" with: record results in the handoff, change the plan only when scope or a decision changes, and update the index row when status changes.
   - Rewrite `architecture/APP_SHELL.md`, `architecture/FOLDER_STRUCTURE.md` and `operations/TESTING.md` to describe the current system by concern; move their per-phase evidence into handoffs. Split `architecture/TECH_STACK.md` into the implemented stack and `docs/proposals/` for unbuilt designs (Phase 07A jobs, the Stripe path, the AI coach).
   - Merge `product/PHASE_04_SCOPE.md` into `product/CHALLENGES.md` and the Phase 04 handoff. Reduce `handoffs/phase-07-api-offline.md` to an index of the 07.1–07.5 handoffs.
   - Apply the [handoff rule](../DECISIONS.md#october-16-codebase-assessment-follow-up): a handoff records only what the next phase needs. Rewrite `handoffs/TEMPLATE.md` to these sections and nothing else: Summary and status; Decisions and why; Behavior that changed; Invariants to preserve; Problems that could recur; Setup or environment changes; Open gates (one table, edited in place); Final verification (date, commands, CI link). Small UI adjustments with no lasting decision, interim test runs and coverage numbers, browser steps, screenshot paths and merge or publication bookkeeping go in commit messages or PR descriptions instead.
   - Phase 08's closing handoff already follows this rule, with the deletion and reflection-keyboard handoffs folded in. Apply the same rule to the open acceptance planning handoff (now Phase 10) before Phase 09 starts.
   - Turn `handoffs/README.md` into a table of phase, handoff, status and open gates. Add `docs/README.md` saying which file owns what. Move incident-specific lessons from AGENTS.md into the architecture document each concerns.
   - Put design material in one `design/` tree: `docs/design-source/` becomes `design/source/` (updating the scripts that read it), third-party `docs/screen-refs/` images leave Git, routine `docs/checks/` screenshots move to `.local/` unless Anthony wants them kept, and `output/` is ignored entirely [REP-1, REP-2]. Confirm whether `product/CURRICULUM.md` still matches the six venue decks; archive it if not.
2. **File-based routes [FS-1–FS-4, RTR-1, RTR-4].** Move the access gate from `app/index.tsx` to `app/access.tsx`, so Home in `(tabs)/index.tsx` is the only owner of `/` and `Stack.Protected` falls back to the gate. Replace `account/[tool].tsx` with static `recover`, `keys`, `devices`, `transfer` and `troubleshooting` files at the same URLs. Group `challenge`, `success` and `reflection` in a `(challenge)/` folder without a new layout, so URLs and native navigation are unchanged. Delete the `export-data.tsx` redirect. Keep the Phase 08 `welcome.tsx` and `delete-account.tsx` routes at their URLs, and preserve the root layout's deletion guards, which remove the deleted account's screens from Back history. Turn on `experiments.typedRoutes`, include the generated types in `tsconfig.json` and generate them in CI before typechecking. Apart from `/` → `/access` for the gate, no URL changes; freeze the route list before Phase 13.
3. **Mobile folders [MOB-1–MOB-7, FS-5].** Land the planned `features/challenges/{deck,active,success}/`, `lib/network/`, `platform/connectivity/` and `platform/modals/` groups. Move Settings to `features/settings/` and `IdentityScreen.tsx` into `app-support/identity/account/`. Rename `features/progress/calendar.ts` to `calendar-dates.ts`. Add an `api.ts` for the challenge catalog, Settings export, access check and Progress reads. In separate behavior commits, split `IdentityScreen` (transfer panel, recovery-key form, confirmation hook), key its actions by id rather than visible copy, and make its controller prop required.
4. **API, database and contracts [FS-6–FS-8, FS-10, API-1, API-2, API-4, API-5, API-8, REP-4].** Move shared request plumbing into `apps/api/src/http/` (`ApiError`, the error handler, `bearer`, one `parse`, diagnostics). Use `routes.ts` and `service.ts` in every domain, rename `privacy/` to `account-export/`, and mirror `src/` folder names in `tests/`. Give the OpenAPI document its own `@justgo/contracts/openapi` entry used only by the API, and add a test comparing registered routes with its paths. Return the real seconds left in `retry-after`; report SQLSTATE codes and the failing migration from `scripts/migrate.ts`. Move the shared error envelope and health/readiness schemas into `contracts/src/errors.ts` and `operational.ts`. Clean `contracts/dist` before each build. Leave `drizzle/` and the single `schema.ts` where they are; Phase 13's paid-launch checkpoint splits the schema when billing tables join it [FS-9].
5. **HTTP client robustness [SEC-2, SEC-3].** Fetch the URL `http.ts` validated rather than a separately concatenated string, and check status and content type before parsing JSON so edge error pages are not reported as network failures.
6. **Tooling and tests [TL-1–TL-5, TST-3–TST-6, STK-3–STK-5, REP-5, REP-6].** Adopt type-checked typescript-eslint rules one at a time, plus Testing Library and React rules, the `globals` package and a non-null-assertion warning. Give mobile app source its own types without Jest or Node, and use `@types/node` 24. Add one smoke journey against the exported web build, split the five largest test files and merge the two DeckPreview test files. Remove the Expo template `LICENSE` and unused Android icons, document one import-extension rule, and replace the per-file contracts allowlist in `.vercelignore` with a folder rule. Make the two Progress journeys that seed "yesterday" (`e2e/progress-flow.spec.ts`: today cached paging, older-day Add/Edit) pass when the browser date is the 1st of a month; they fail on that day in CI. If 08A has not started by November 1, 2026, land this fix on its own first.
7. **CI [CI-4, CI-5, STK-4].** Split the workflow into parallel jobs (static checks, unit with coverage, database, journeys, exports), cache Playwright's browser, let CI use more Jest workers, add `timeout-minutes`, pin actions to commit SHAs, configure Dependabot or Renovate, and add an audit gate scoped to `@justgo/api`. Inspect hosted runs for the pushed commit before marking these complete.
8. **Repository hygiene [REP-3].** With Anthony's approval for each deletion, remove merged local branches and archived worktrees, and resolve the stash on the preserved native-billing branch. Optional, only if measured worthwhile: a React Compiler trial and a staged-files pre-commit hook [TL-6, TL-7].

**Implementation and verification order**

- Two stacked PRs, as approved by Anthony: documentation and design-source organization first, followed by the remaining implementation against that documentation branch. Keep each comparison within CodeRabbit's 300-file review limit and merge in dependency order. Keep move-only commits separate from behavior changes, and update `architecture/FOLDER_STRUCTURE.md` alongside each move.
- For moves, use import-aware rewrites, verify with cold bundles and restart Metro with `--clear` before reloading the installed development app, as AGENTS.md requires.
- Run `npm run check` on every PR, `npm run test:db` for API and contracts steps, side-panel browser checks for route and mobile steps, and simulator checks of launch, sign-out, account switching and the first and repeated challenge flow for the route step.

## Keep out

- Product behavior, copy, design or URL changes other than the gate's move to `/access`; new features; API wire changes beyond what Phase 08's pre-merge fixes already made.
- The Expo SDK 58 / React Native 0.88 upgrade, native module changes or a new signed build; these remain a separate task before Phase 13.
- Release automation, write-route rate limits and hosted retention scheduling belong to Phase 13; app crash reporting belongs to Phase 11. Phase 08 retains diagnostic redaction and the implemented retention cleanup function.

## Ready to hand off when

- [x] Documentation matches step 1: listed files deleted or archived, the plan split with a working stub, architecture/testing docs describe the current system, the handoff index is a table and every changed internal link resolves.
- [x] Every URL has one route file, typed routes are on and checked in CI, account pages are static files, and simulator checks pass for launch, sign-out, account switching and the challenge flow.
- [x] The folder guide matches the tree on disk and an architecture test fails when a listed path is missing; moves preserve behavior with passing `npm run check`, `npm run test:db` and browser checks.
- [x] The OpenAPI document is absent from the exported iOS bundle and a test keeps its paths aligned with registered routes; shared API plumbing lives in `src/http/`.
- [ ] CI runs in parallel jobs with each suite once, timeouts, pinned actions and dependency updates, and hosted checks pass for the pushed commit.
- [x] Save the phase handoff with exact changes, verification evidence and any explicit deferrals; link it from the handoff index.

## Open gates for Phase 13

- No new physical-device acceptance gate is created. Preserve all existing release/device gates.
- Hosted CI for each authorized publication candidate and owner approval for each local branch/worktree deletion remain required.
