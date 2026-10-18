# Working on JustGO

Read the requested phase from [the implementation plan](docs/implementation-plan/README.md)
and its dependency handoffs before editing. Consult `docs/DECISIONS.md` for the
recorded decisions in force. The phase files own sequencing and approved future changes;
`docs/architecture/APP_SHELL.md` and `docs/architecture/TECH_STACK.md` describe the implemented boundaries.
Keep phase scope bounded and preserve existing behavior unless the task changes it.
Directory instructions (especially `apps/mobile/AGENTS.md`) also apply.

Reuse already-read guidance when the checkout, relevant instructions and tool
versions are unchanged and the context is available. Reread changed or newly
relevant sections; always verify the current environment and served code.

This file is the shared coding standard for future features and fixes, not only
cleanup phases. Read [testing guidance](docs/operations/TESTING.md) before code changes for
the applicable commands and evidence requirements. Keep detailed architecture in
the linked architecture docs and phase-specific scope in the plan and results/evidence in
handoffs; avoid copying competing versions of these rules into every directory.

## Repository map and common commands

- `apps/mobile` (`@justgo/mobile`): Expo app. `apps/api` (`@justgo/api`): API
  and database. `packages/contracts` (`@justgo/contracts`): shared Zod contracts.
  `e2e/`: saved Playwright journeys. `scripts/quality` and `scripts/journeys`:
  architecture, coverage and journey tooling.
- Focused checks: `npm run test -w <workspace>`, `npm run typecheck -w <workspace>`,
  `npm run lint`. Broader gates: `npm run check`, `npm run test:coverage`,
  `npm run test:db`, `npm run test:journey`. See
  [testing guidance](docs/operations/TESTING.md) for when each applies.
- Choose the verification scope before running checks, using the matrix in
  [TESTING.md](docs/operations/TESTING.md#choosing-checks). Routine fixes default to
  focused behavior/consumer checks. A follow-up fix or handoff edit does not
  reopen phase closeout. Expand for a concrete failure, affected boundary/config,
  explicit owner request or required completion/publication gate; explain the
  trigger briefly without seeking routine implementation approval.

## Owner review and Git permissions

- Obtain Anthony's explicit permission before pushing changes, creating any pull
  request (including a draft), merging any branch or PR, or enabling auto-merge.
  Permission for one action does not authorize the next action.
- Requests to implement or continue a phase, general workflow discussions and
  approval given for earlier work do not authorize publishing or merging the
  current changes. Prepare the local changes and handoff for the owner's review,
  then wait for permission for the specific Git action.
- The owner must have an opportunity to review and identify issues before a
  merge. Passing tests, green CI and agent reviews do not replace that review or
  the owner's explicit merge approval. Never merge merely to finish a phase.

## Design principles

- **Single responsibility and separation of concerns:** Keep rendering,
  orchestration, domain decisions, network/storage I/O and complex animations
  behind clear responsibilities. Build focused components from the start. When
  a component accumulates independently changing responsibilities, extract
  cohesive components/hooks/helpers as part of that feature work; keep related
  styles close. Treat growing size as a review signal, not an arbitrary line
  limit. Do not postpone necessary separation to a later cleanup phase or create
  trivial wrappers just to shrink a file.
- **Dependency inversion:** Supply storage, transport, time and randomness
  through small controllable interfaces when behavior depends on them. Reuse
  existing seams so tests can control failures, timing and retries without
  replacing the domain logic under test.
- **KISS and YAGNI:** Prefer the simplest implementation that meets the approved
  behavior. Reuse existing tools and boundaries; add abstractions only for an
  observed responsibility or maintenance problem, not hypothetical features.
- **DRY:** Share repeated rules that mean the same thing, especially validation,
  access policy and contract values. Do not combine unrelated features merely
  because their code currently looks similar.
- **Contract consistency:** Keep runtime schemas, OpenAPI, routes, HTTP statuses,
  client parsing/retry behavior and contract tests aligned in the same change.
  Follow the approved phase's API design and compatibility policy. Distinguish
  invalid client requests from transient service failures; do not turn known
  client errors into generic outages. Cover protocol boundaries with tests.
- **Reliable state transitions:** Make allowed transitions and ownership
  explicit. Preserve idempotent retries, transaction safety, cancellation and
  account-change protection. Test duplicate actions, uncertain/lost responses,
  stale callbacks and partial failures; do not lose accepted user input or apply
  an old account's response to the current account.
- **Security, privacy and observability:** Enforce authorization and ownership
  at server/data boundaries, validate external input and retain least-privilege
  access. Keep diagnostics useful through safe error codes/request identifiers;
  never log credentials, recovery secrets or private reflection text. No
  production access bypasses or sensitive data in test artifacts.
- **Accessibility and measured performance:** Preserve labels, focus/keyboard
  behavior, scalable text, usable small-screen layouts and reduced motion.
  Verify affected interactions on the appropriate browser/native surface and
  measure relevant performance before claiming an improvement. Component mocks
  and web exports cannot establish native accessibility, gestures or Keychain
  behavior; record any deferred device checks in the release handoff.

## File placement for new mobile code

The [folder structure guide](docs/architecture/FOLDER_STRUCTURE.md) describes the
implemented responsibility groups. Keep native/web adapter pairs
and tests beside their owner. File moves must update imports, command/coverage
paths, upload allowlists, fixture resolution, asset extraction and documentation
links together; organizing retained code does not authorize its removal.

Use import-aware rewrites rather than replacing arbitrary quoted fragments in
SQL or data. Use the [move checks](docs/operations/TESTING.md#file-moves-and-bundle-checks)
for small versus large/platform-sensitive moves. Restart the owned running Metro server
with `--clear` before reloading the existing installed development app: a
successful separate export does not rebuild that server's live dependency graph.
Reload the app to clear stale module/asset paths.

- **Review changed directories after the task.** Complete the requested
  implementation normally, then before handoff identify every directory where
  the task added or modified files. Review each directory's complete file list
  (not every unrelated file's contents) to see whether it has become too large
  after the changes. If sensible groups
  would improve navigation, reorganize them into responsibility-based
  subfolders without waiting for Anthony to ask. Use judgment rather than a
  fixed file-count threshold; follow the move/verification rules above and keep
  functional changes separately reviewable. Record any necessary deferral.
  Keep this review brief and include reorganization needed by the current
  responsibility; record unrelated tidying as follow-up rather than expanding a
  routine fix.
- **Choose the owner before creating files.** Identify the product capability or
  supporting responsibility the code serves, then place it with that owner.
- **Use `src/features/<name>/` for product capabilities.** Examples: Challenges,
  Reflections and Progress. Keep each feature's screens, components, hooks, domain
  logic, API functions and tests together.
- **Use `src/app-support/` for app-wide coordination.** Providers, startup, access
  checks, identity, sessions and account recovery belong here. These
  responsibilities can include their own screens.
- **Use `src/data/` for shared app data.** Shared persistence, cached activity and
  synchronization belong here. Feature-specific API functions can stay with their
  feature.
- **Use shared directories for reusable building blocks.** `src/components/` owns
  reusable UI, `src/lib/` owns general infrastructure/helpers, `src/theme/` owns
  design tokens, and `src/platform/` owns reusable platform adapters. Keep
  app-specific behavior with its owner.
- **Keep `src/app/` focused on navigation.** Route files and layouts connect
  navigation to screens. Put supporting logic, reusable components and tests in
  their owning directories outside `src/app/`.
- **Keep developer fixtures in `src/dev/`.** Sample screens, preview data and
  diagnostics belong here, with development-only access.
- **Create directories when their purpose exists.** Start with the files needed
  for implemented behavior. Add subfolders when they contain a cohesive group of
  related files. Avoid empty folders for future features or automatic
  `components/hooks/services/utils` layers.
- **Name folders after their responsibility.** Prefer recognizable product names
  or concrete supporting jobs. Keep tests and styles beside the code they support,
  and follow the existing import boundaries when choosing dependencies.

## Enforced code boundaries

- Use strict TypeScript and shared Zod runtime validation at trust boundaries.
  Import contracts through `@justgo/contracts`. API and mobile must not import
  each other's implementations. Shared mobile components/lib/theme/platform
  must not import routes, app-support, developer, feature or data code. Mobile
  `src/app-support` owns app providers, startup/access coordination and
  account/recovery support; it may compose features/data/shared code, while feature
  screens may consume app-support providers. App support must not import route
  implementations. Mobile `src/data` owns shared app
  data and synchronization; features may import it, while data must not import
  routes, app-support, developer code, features, UI components or theme. Data may use
  shared lib/platform infrastructure and public contracts. `src/dev` owns developer
  fixtures; only the guarded `app/preview.tsx` route may load it from production
  source. App-support tests may exercise routes and preview loading. These rules include
  re-exports, `import()` and `require()`; literal asset loading remains permitted.
- Await promises or explicitly handle their failures. Use `void` only for a
  deliberate background operation whose failure is already handled; explain
  non-obvious ownership of errors. Do not suppress async warnings or broad lint
  rules to make checks pass.
- Preserve the domain safety invariants in the [identity boundary](docs/architecture/IDENTITY.md),
  [activity architecture](docs/architecture/ACTIVITY_DATA.md) and
  [app shell](docs/architecture/APP_SHELL.md). These documents own hydration,
  account deletion/credential preservation, lifecycle/clock coordination and native
  modal/animation/list behavior; consult the relevant owner before changing it.

## Verification and handoff

- Write/update meaningful tests for every code change and run focused checks
  during each slice. Use unit tests for domain decisions, component tests for UI
  behavior, integration tests for runtime wiring and real API/database boundaries,
  and saved end-to-end tests for critical journeys as their harness becomes
  available. A unit test for every file is not the goal: protect important
  behavior, failure paths and boundary cases without tests that merely mirror
  implementation or depend on large snapshots. Bug fixes need a regression test
  that would catch the original failure.
- Await observable asynchronous results and clean up subscriptions, timers and
  queries. Never silence unexpected warnings, remove assertions or weaken lint
  and coverage floors to make a failing change pass. During each slice, review
  coverage of the affected behavior and important uncovered branches, not only
  the percentage; run the full `npm run test:coverage` gate at phase completion,
  before publication or when coverage configuration, source inclusion/exclusion
  rules, critical selectors or thresholds can invalidate the aggregate gate.
  Ordinary files or branches under unchanged coverage rules use focused coverage
  when needed, without lowering any floor.
- After relevant tests pass, test affected UI in the agent's in-app browser
  pane (Codex: Browser Use side panel; Claude Code: built-in browser). Honor
  the owner's browser preference; do not switch to an outside Chrome window when
  in-app-only testing was requested. Fix failures and
  repeat. Use disposable local fixtures only. A one-off browser walkthrough is
  not a saved end-to-end regression test or a CI gate; report each separately.
  Browser journeys must validate their resolved API origin as well as the local
  database: Expo's virtual environment can still prefer `.env.local` despite CLI
  overrides. Preserve the guarded public-environment adapter and request fence;
  never let fixture account proofs reach a hosted API.

- Browser layout checks must wait for usable controls after navigation/refresh
  and retry fresh geometry reads. Missing or detached elements must keep the
  assertion failing; preserve the alignment limit instead of adding sleeps or
  weakening the assertion.
- Journeys must not depend on the time of day or month. Seed dated activity
  inside the browser's intended local day (`e2e/support/seed-times.ts`); CI runs
  in UTC, so a seed counted back from "now" crosses midnight on evening pushes.
- At actual phase closeout or before publication, run `npm run check` (including
  online Expo Doctor and the full suite). Skip it for routine fixes covered by
  focused checks unless the verification matrix identifies an escalation trigger.
  Keep `npm run test:db` against dedicated loopback `justgo_test` for backend/shared
  protocol or data-boundary changes and phase closeout. A mobile UI/navigation
  change alone does not alter the server boundary. Do not repeat a passed check
  already included in a broader command unless its inputs changed or a failure
  needs investigation.
  Focused `-w <workspace>` checks miss other workspaces: when a slice touches
  `packages/contracts`, a tsconfig, ESLint config or `e2e/support`, also run
  `npm run build:contracts && npm run typecheck` from the root (all workspaces
  and journeys).
  Follow `docs/operations/TESTING.md` for coverage commands and regression thresholds.
  Keep earlier physical-device/staging gates open until evidenced.
- Before publication, run fresh online Expo validation through `npm run check`
  and rerun `npm run doctor -w @justgo/mobile` immediately before pushing.
  Installed versions are pinned by the lockfile; Expo's recommended SDK patch
  metadata can change independently. Keep dependency validation enabled and
  preserve native-build/device acceptance when dependency versions change.
- When changing CI, verify each command's prerequisites without relying on ignored
  `.env` files or existing local artifacts. Reuse common test configuration across
  related steps. Inspect hosted checks for the pushed commit before marking a new
  CI gate verified; a local pass does not establish a hosted pass. Record failures
  and their fixes in the handoff.
  After splitting or stacking PRs, verify each actual publication candidate;
  checks from the combined feature branch do not transfer to older PR branches.
- Work in small reviewable changes. A handoff records only what the next phase
  needs: decisions and why, behavior that changed, invariants to preserve,
  problems that could recur, setup or environment changes, open gates and the
  final verification run. Edit it in place rather than appending dated entries.
  Change the plan only when scope or a decision changes (and record the decision
  in `docs/DECISIONS.md`); update the handoff index row only when status changes.
  Per-change test runs, small UI adjustments, browser steps and screenshot paths
  belong in the commit message or PR description. See the
  [October 16 decision](docs/DECISIONS.md#october-16-codebase-assessment-follow-up).
  Do not put secrets, real private reflections or credentials in logs or handoffs.
- Routine follow-up fixes do not refresh all phase evidence or require a new
  handoff. Update durable behavior/invariant/setup docs and changed paths as
  needed; keep routine validation in the task/commit/PR record. Editing a handoff
  does not itself require phase-wide checks or close an existing open gate.
- Keep routine screenshots and diagnostic recordings in ignored `.local/`
  storage. Commit visual evidence only when the owner explicitly requests it.
- Before claiming completion, reconcile the agreed requirements and relevant
  review findings with the implementation. Each must have passing evidence or
  an explicit, approved deferral with an owner/phase and an open task. Do not
  silently drop a finding when moving work between phases. Record reusable coding rules here and domain/incident lessons in the owning
  architecture guide; keep open bug tasks in the plan and lasting results in
  the handoff. Keep automated checks in CI as enforcement alongside this guide.
- On the owner's 8 GB Mac, run heavy builds/checks sequentially and reuse existing
  tools/caches. Native signing/build upgrades require a separate task.
