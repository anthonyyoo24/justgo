# Working on JustGO

Read the requested phase in `docs/IMPLEMENTATION_PLAN.md` and its dependency
handoffs before editing. The plan owns sequencing and approved future changes;
`docs/APP_SHELL.md` and `docs/TECH_STACK.md` describe the implemented boundaries.
Keep phase scope bounded and preserve existing behavior unless the task changes it.
Directory instructions (especially `apps/mobile/AGENTS.md`) also apply.

This file is the shared coding standard for future features and fixes, not only
cleanup phases. Read [testing guidance](docs/TESTING.md) before code changes for
the applicable commands and evidence requirements. Keep detailed architecture in
the linked architecture docs and phase-specific work/evidence in the plan and
handoffs; avoid copying competing versions of these rules into every directory.

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

## Enforced code boundaries

- Use strict TypeScript and shared Zod runtime validation at trust boundaries.
  Import contracts through `@justgo/contracts`. API and mobile must not import
  each other's implementations. Shared mobile components/lib/theme/platform
  must not import routes, runtime, developer, feature or data code. Mobile
  `src/runtime` owns app providers and startup/access coordination; it may compose
  features/data/shared code, while feature screens may consume runtime providers.
  Runtime must not import route implementations. Mobile `src/data` owns shared app
  data and synchronization; features may import it, while data must not import
  routes, runtime, developer code, features, UI components or theme. Data may use
  shared lib/platform infrastructure and public contracts. `src/dev` owns developer
  fixtures; only the guarded `app/preview.tsx` route may load it from production
  source. Runtime tests may exercise routes and preview loading. These rules include
  re-exports, `import()` and `require()`; literal asset loading remains permitted.
- Await promises or explicitly handle their failures. Use `void` only for a
  deliberate background operation whose failure is already handled; explain
  non-obvious ownership of errors. Do not suppress async warnings or broad lint
  rules to make checks pass.

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
  and coverage floors to make a failing change pass. Run the applicable coverage
  gate and review important uncovered branches, not only the percentage.
- After relevant tests pass, test affected UI with Browser Use in the in-app
  side panel. Honor the owner's browser preference; do not switch to an outside
  Chrome window when side-panel-only testing was requested. Fix failures and
  repeat. Use disposable local fixtures only. A one-off browser walkthrough is
  not a saved end-to-end regression test or a CI gate; report each separately.
- Before handoff run `npm run check` and, for backend/shared boundaries or a phase
  closeout, `npm run test:db` against the dedicated loopback `justgo_test` database.
  Follow `docs/TESTING.md` for coverage commands and regression thresholds.
  Keep earlier physical-device/staging gates open until evidenced.
- When changing CI, verify each command's prerequisites without relying on ignored
  `.env` files or existing local artifacts. Reuse common test configuration across
  related steps. Inspect hosted checks for the pushed commit before marking a new
  CI gate verified; a local pass does not establish a hosted pass. Record failures
  and their fixes in the handoff.
- Work in small reviewable changes. Update the phase handoff, plan and handoff
  index with actual commands/results, UI evidence and remaining work. Do not
  put secrets, real private reflections or credentials in logs or handoffs.
- Before claiming completion, reconcile the agreed requirements and relevant
  review findings with the implementation. Each must have passing evidence or
  an explicit, approved deferral with an owner/phase and an open task. Do not
  silently drop a finding when moving work between phases. Record recurring
  coding lessons here; keep individual bug tasks and test results in the plan
  and handoffs. Keep automated checks in CI as enforcement alongside this guide.
- On the owner's 8 GB Mac, run heavy builds/checks sequentially and reuse existing
  tools/caches. Native signing/build upgrades require a separate task.
