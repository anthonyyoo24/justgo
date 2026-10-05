# Phase 07.2 — Durable local saving and synchronization

## Snapshot

- **Status:** [PR #15](https://github.com/anthonyyoo24/justgo/pull/15) is open for
  owner review. Native durability evidence remains open; the completed app journey
  is not yet accepted. Merge and auto-merge remain unauthorized.
- **Date:** October 5, 2026.
- **Branch/base:** `codex/phase-07.2-local-sync`, created from updated `main` at
  `1df6406` (owner's PR #14 merge), after PR #13 / `806f57f`.
- **Dependency:** [07.1A](phase-07-1-api-data.md) and
  [07.1B](phase-07-1b-journey-ci.md) are merged. Their older review restrictions are
  historical; the owner explicitly requested this local 07.2 implementation.
- **Scope:** Tasks 5–6: repository, storage, sender, typed transport and deterministic/
  real-transport failure checks. Existing app screens/controllers remain on the
  compatibility flow. 07.3 wires the repository into screens/lifecycle and implements
  presentation; 07.4 accepts Progress composition; 07.5 owns destructive cutover.

## Implemented boundary

`apps/mobile/src/data/activity/` owns the account repository and Zustand store.
`submissions.ts` owns completion/reflection domain updates, `persistence.ts` owns
serialized journal commits, `delivery.ts` owns acknowledgement/rejection/conflict
transitions, and `sender.ts` owns external delivery and retry scheduling.
`storage.ts` adapts AsyncStorage behind `JournalStorage`; tests inject controllable
storage, transport, clock and randomness. `accounts.ts` keeps one active repository
and preserves parked memory-only submissions while the process survives.
This adds no conventional login or account-switcher UI.

At the owner's request, shared saving/synchronization code moved from the feature
tree into `data/activity`; user-facing Challenges, Reflections and Progress remain
in `features`. Features may consume this data module, while data cannot import
routes/features/components/theme, and shared components/lib/theme/platform cannot
import data or features. The ESLint boundary rule enforces static imports,
re-exports and runtime loaders, including package paths and directory entrypoints.
The on-phone journal keys, schema, retry identities and behavior are unchanged;
“journal” remains the internal name of the persisted activity/upload envelope.
The coding rules, app-shell guidance, tech-stack folder tree, frontend architecture
learning map, testing guidance, phase plan and handoff index describe this placement.
The broader Phase 07 product/storage reconciliation remains assigned to 07.5.

Pinned consuming dependencies: AsyncStorage **2.2.0**, as recommended by the exact
Expo SDK 57 docs, and Zustand **5.0.15**. NetInfo/toast dependencies remain in 07.3.
The runner pins existing esbuild **0.28.2** directly for its repository bundle.
Credentials, countdowns and editor drafts are not journal data.

### Journal/version rules

- Separate `justgo:v1:<accountId>:catalog` and `:journal` keys carry explicit version
  and owner validation. The journal is one envelope containing records, immutable
  upload instructions, submission receipts, acknowledgement/reconciliation state
  and optional latest-summary/current-month/today read snapshots.
- Every record tracks the latest submitted version, phone-committed version and
  server-confirmed version independently. An older in-flight commit cannot mark
  a newer reflection safe or replace live state. Returned attempts are detached
  from the mutable internal journal.
- Submissions retain their original identity/values and predecessor acknowledgement
  revision. Repeated activation creates one operation; altered identity reuse is
  rejected. Reflection text preserves nonblank whitespace; blank text is normalized
  using the shared contract helper. Initial feeling/text and later text-only edits
  remain distinct. Only explicit submissions enter the repository.
- A corrupt, unsupported-version or wrong-owner journal is preserved/quarantined,
  with `hydrationError: unreadable`. If quarantine cannot be written, the original
  key stays protected from replacement; new accepted work can use memory/cloud
  fallback. A read failure likewise protects unknown stored content. Technical
  recovery presentation belongs to 07.3; there is no destructive reset action.
- Normal writes await the phone commit and never await HTTP. On failure, drop only
  replaceable calendar/today read snapshots, retry the same write once, then use
  the single sender for online backend fallback. Retain catalog, summary, pending
  content, rejected writing and required metadata. Timeouts do not prove durability.
- Catalog updates are serialized independently. Optional catalog-write failure keeps
  live challenges usable and does not damage the previously committed journal.

### Operation order and replay

One account-bound sender orders create → first reflection → later edits. It waits
for normal acknowledgement persistence before sending dependent work. When device
writes fail, authoritative acknowledgements retained in memory permit the approved
cloud fallback; the older committed intent remains available for safe replay.

A dependent PATCH binds to its predecessor's **applied acknowledgement revision**,
not the current reflection revision projected by a replay response. The first
reflection keeps its original initial revision. This matters when the server saved
multiple edits but the phone could not save receipts before termination: replay
reconstructs identical requests instead of changing a retry payload.

Typed `REFLECTION_CONFLICT.currentAttempt` is validated by the mobile HTTP parser.
Genuine conflicts adopt that owner-scoped backend attempt automatically and settle
superseded operations consistently. No conflict chooser/attention UI is added.
Newer submissions made after recovery started survive; absent/malformed canonical
information is not treated as successful resolution. Old-account and cancelled
responses are fenced before applying delivery results.

Permanent failures retain submitted content plus safe error/request identifiers and
stop unchanged retries. Completion eligibility rejection removes only provisional
count additions; reflection rejection retains accepted completion credit.
`correctReflection` creates a new identity for an explicit changed correction,
preserves superseded submitted values in receipts, and prevents unchanged rejected
payload replay. Ordinary changed submissions after an invalid-request rejection
use that same correction rule and rebase from the confirmed server revision;
initial reflections retain feeling when the server revision is zero. Earlier
submitted writing stays in receipts, including edits queued before the rejection.
A correction action targeting an older rejected version cannot consume newer
submitted writing; it returns a conflict. A new ordinary submission can recover
the blocked chain using the latest explicit input. Other permanent causes refuse
new submissions with a typed conflict while retaining their diagnostics for the
cause-specific recovery surface in 07.3. Session renewal uses the existing shared
AccountClient seam;
unresolved authentication pauses work, and `resumeAuthentication` resumes it only
through the same account-bound transport.

### Retry and recovery bounds

One immediate send, short delays of **2 seconds** and **5 seconds**, then sparse
opportunities starting at **30 seconds**, doubling to a **5-minute cap**, with
bounded ±20% jitter (the final delay remains capped). Retry-After seconds and HTTP
Dates are retained and can extend these delays. Event storms do not reset cooldowns.
A native timer's maximum delay is respected without sending before a long server
cooldown. One transport call has a **10-second** bound, including a transport that
ignores cancellation. No upload execution while terminated is promised.

Phone-write recovery uses the same coalesced coordinator with sparse increasing
cooldowns while active, including while offline. Timers stop when inactive or
account-changed; network timers also stop offline/empty/auth-blocked/permanently
failed. Storage recovery timers may remain offline when a phone save is still
needed. Explicit submissions also retry phone persistence.

`warning` describes one loss-risk episode with visible/dismissed state and established
storage-full/connectivity causes. It appears only after both durability paths fail,
retains all rounds across routes/rollover, and does not repeat after dismissal within
that episode. Full recovery clears it and increments `recoverySequence` exactly
once, including after dismissal. A later episode can warn again. 07.3 must render
this state and the recovery toast; no UI or native presentation evidence is claimed.

Pruning runs after reconciliation, flow exit and rollover. A record requires latest
server confirmation, settled operations/phone acknowledgements, no current-flow/
today need and no remaining aggregate additions. Pending/rejected/memory-only
content is never ordinary cache eviction. Summary/calendar refresh fences prevent
unknown creates and newer local generations from installing stale baselines.
Selectors and actual Progress integration remain 07.4.

## Verification

- `npm run check`: final run after the data-module move passed strict types, lint,
  formatting, boundaries and **467 tests** (93 safeguards, 45 API unit, 308 mobile,
  21 contracts).
- `node --test scripts/import-boundaries.test.mjs`: **86 tests** passed, including
  37 new regressions for the data/UI dependency direction, permitted consumers and
  loader/package/directory-entrypoint paths. The full check includes these cases.
- `npm run test:db`: **60 database cases plus one migration/restoration rehearsal**
  passed against loopback `justgo_test` through 0012. No migration was added.
- `npm run test:coverage`: the final full workspace run after the data-module move
  passed all existing global/critical floors, including **106 API unit/database/
  migration cases**, **308 mobile tests** and **21 contract tests**. All moved data
  files remain in all-source coverage. Final coverage: mobile **90.35% lines /
  82.23% branches**, API **95.71% / 91.19%**, contracts **100% / 100%**.
  No exclusions or thresholds changed.
- Before the data-module move, one mobile coverage run timed out at the existing 5-second limit in
  `ProgressScreen.test.tsx` (the account-change/loading case). Its isolated
  sequential rerun passed all **308 tests** in **14.938 seconds**. No test,
  assertion or timeout was changed; the earlier timeout is recorded as intermittent
  test evidence rather than attributed to an unproven cause.
- `npm run doctor -w @justgo/mobile`: **21/21 checks** passed.
- `npm run test:journey`: final run after rebuilding from `data/activity` passed
  **seven saved cases**, including the existing four
  app/identity/cleanup/listener cases and three new repository → real account
  transport → API → disposable database cases: offline/lost-response/relaunch,
  device-write failure/cloud fallback/backend-wins conflict, and ten maximum-length
  reflections. Backend rows/revisions are asserted, not only UI success text.
- The representative ten-completion/ten-10,000-character-reflection envelope passed
  **400,000 encoded-byte** and **100 ms serialization** regression budgets. These
  are measured host/harness budgets, not native latency claims or eviction limits.
  The first run measured **314,630 bytes**, **0.337 ms serialization**, and
  **104.9 ms total** for twenty local submissions using the controlled in-memory
  storage adapter. Safe metadata is attached in `.local/journey-report/index.html`.
- Deterministic tests cover ten retained rounds, partial/versioned recovery,
  warning dismissal/new episodes, unknown storage causes, offline storage recovery,
  interrupted/failed acknowledgement writes, ordered edits, unchanged-connectivity
  outages, jitter/caps/Retry-After, timer cleanup, permanent/auth failures, rejected
  completion versus reflection credit, stale reads/input and account races.
- Fixture teardown now belongs to the database fixture, so repository-only saved
  cases clean their allocated accounts even without requesting a browser page.
  Existing rejected/accepted outside-account cleanup regressions still pass.

Tests exposed and fixed JSON field-order differences incorrectly keeping clean
journals dirty, dependent revision reconstruction after unwritable receipts, and
late save results after identity deactivation. The initial Playwright loader could
not consume the Expo CommonJS/contract ESM boundary; the runner now rebuilds a
Node ESM bundle from the exact production repository/transport sources before
running saved cases. It is generated under `.local`, never reused as a prerequisite
from a previous run, and imports no native/UI module.

## 07.3/07.4 integration contract and open evidence

07.3 must activate/hydrate one repository through `AccountRepositories`, supply
`asyncStorageJournalStorage` and `createJournalTransport(client, accountId)`, forward
connectivity/foreground changes, and cancel/park it when identity changes. Subscribe
for display; use repository actions for journal mutations. Preserve same-account
memory through recovery. Use `warning`/`recoverySequence` for the banner/toast and
retain `hydrationError`, operation rejection/auth codes/request IDs for the finalized
cause-specific presentation. Bind screen feedback to local saving, fence stale
navigation, call explicit completion/reflection/correction actions, and keep Skip
and editor typing out of uploads. `remoteRefreshSequence`, aggregate fences,
current-period cache acceptance and flow/rollover actions support 07.4 reconciliation.

Native verification remains open. The default `xcode-select` path points to Command
Line Tools, so Expo/XcodeBuildMCP cannot find `simctl`. A command-only
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` override lists iOS 26.4/26.5
simulators; all were shut down. The existing `.local/phase02-simulator/JustGO.app`
and current native Podfile lock do not contain RNCAsyncStorage. There is no compatible
existing build for this new adapter. A refreshed simulator development build is
required before claiming native atomicity/durability or termination recovery.
Keep that appropriate-build/storage check open and retain physical-device/staging
acceptance in Phase 09. The root AGENTS.md reserves native signing/build upgrades
for a separate task. No global developer-tools setting, simulator boot, pod/native
build, signing or SDK upgrade was performed. Until either phone persistence or
backend saving succeeds, termination can lose memory-only writing.

No affected UI behavior was changed in 07.2, so no new side-panel walkthrough is
claimed. The saved app smoke still passes; 07.3 owns the actual completion/reflection
UI journey and interactive banner/toast verification. Hosted checks are unverified
because this branch remains local; no push, PR or merge has been authorized.

Existing dependency audit/install-script notices remain outside this phase. No
production access bypass, billing integration, deployment or schema contraction was
introduced.

## October 5 owner follow-up: retire the unused Foundation screen

The owner requested deleting `src/features/foundation/`: the former connection
screen, its health/readiness probe and their two test files (five tests). A caller
search found no route or consumer outside the folder's own tests. API `/health`
and `/ready` endpoints remain; the historical Phase 01 handoff is preserved.
Current folder guidance, the plan and handoff index record the retirement.
The existing Challenges/Success/Reflections/Progress developer previews are kept.
Access and foreground behavior were not changed, and no other feature folder was moved.

Verification after removal:

- `npm run check`: passed contracts build, workspace/journey typechecks, lint,
  formatting and **462 tests** (93 safeguards, 45 API unit, 303 mobile, 21 contracts).
- `npm run test:coverage`: passed **106 API unit/database/migration cases**,
  **303 mobile tests** and **21 contract tests**, plus every unchanged global/critical
  floor. Mobile coverage is **90.27% lines / 82.55% branches**; API remains
  **95.71% / 91.19%** and contracts **100% / 100%**. The five removed tests covered
  only the explicitly retired code; no live behavior assertion or threshold was weakened.
- One-off side-panel demonstration at **1190 × 1036** used the actual Access
  screen with controlled pending, unpaid and unavailable entitlement responses
  from an ignored, isolated loopback `justgo_test` fixture. Screenshots are
  `.local/access-screens/checking.jpg`, `subscription-required.jpg` and
  `unavailable.jpg`. The first request showed “Checking your access…”; releasing
  it as unpaid showed the subscription message; “Check access again” with an
  unavailable response showed verification/retry copy. The existing preview link
  opened the challenge deck and its Progress tab. These are browser screenshots
  of existing screens, not native billing evidence, a new Access preview route,
  or the unfinished 07.3 completion/reflection journey. Fixture accounts and
  services are cleaned after the demonstration.

Current foreground handling rechecks the stored identity session, renews it when
needed or resumes pending authentication, invalidates active account queries
(including access/visible Progress), and asks
the legacy challenge controller to refresh canonical challenge state. Leaving
the foreground hides displayed recovery keys. The 07.2 sender still awaits 07.3
lifecycle wiring; the existing access freshness/polling policy awaits 07A billing.

## October 5 owner follow-up: separate Access, runtime and developer previews

The owner approved the remaining folder recommendations after reviewing their
responsibilities. This refactor follows the Foundation retirement above and keeps
the existing product behavior. No billing feature, new access policy or 07.3
repository/lifecycle integration is introduced.

- `features/access/AccessScreen.tsx` and its tests move to `runtime/access/`.
- `features/shell/AppProvider.tsx` and its actual-runtime tests move to
  `runtime/providers/`. The provider's production implementation changes only in
  import paths; session/access/account fencing and foreground coordination are retained.
- `features/shell/ScreenPreview.tsx` and its tests move to `dev/previews/`, with
  import paths updated and every fixture/interaction retained. The guarded loader
  in `app/preview.tsx` points to the new module. Route and fixture still require
  `__DEV__`; tests additionally prove production rendering does not load the module.
- The tab-layout tests move to `runtime/TabLayout.test.tsx`, outside Expo's route tree.
- The used Settings variant and text-link styling move to
  `components/NavigationLink.tsx`. Access and Settings keep their own screen styles;
  recovery keeps its centered return link. Destinations, accessible names,
  replacement navigation and touch height are preserved.
- Delete `ShellScreens.tsx`: caller searches confirm its Home and Focused screens
  were unused; the used links/styles above are retained. Empty Access, Shell and
  Foundation feature folders are removed. No compatibility re-export shim remains.

Imports, colocated tests, current architecture/folder guidance, testing guidance,
the plan and handoff index follow the new paths. Historical handoffs retain their
original filenames/evidence. The root coding rules and ESLint now prevent shared
UI/infrastructure or data from importing runtime/developer code, prevent runtime
from importing routes, and restrict production developer-module loading to the
guarded preview route. Runtime may compose features; feature screens may consume
its provider hooks. These rules cover static imports, re-exports, `import()` and
`require()`, normalized/package paths and directory entrypoints.

Verification after the refactor:

- Focused runtime/access/preview/navigation-link/tab-layout tests: **29 passed**.
  All existing behavior cases remain. Six new mobile cases cover the shared links,
  guarded fixture loading, account initialization/connection and pending-access retry.
- `node --test scripts/import-boundaries.test.mjs`: **128 passed**, including
  **42 new runtime/developer direction and loader regressions**.
- `npm run check`: contracts build, strict workspace/journey types, lint,
  formatting and **510 tests** passed (135 safeguards, 45 API unit, 309 mobile,
  21 contracts).
- `npm run test:db`: **60 database cases plus one migration/restoration rehearsal**
  passed against dedicated loopback `justgo_test`; no migration was added.
- `npm run test:coverage`: **106 API unit/database/migration**, **309 mobile** and
  **21 contract** cases passed, with every unchanged global/critical floor.
  Mobile: **90.58% lines / 83.52% branches**; API: **95.71% / 91.19%**;
  contracts: **100% / 100%**. Only the provider selector changed to its new path:
  its floor remains **95% lines/branches**, with actual **100% / 100%** coverage.
  Runtime and developer previews remain in all-source coverage.
- `npm run test:journey`: all **seven saved cases** passed, including the real
  account renewal/catalog/Progress smoke and existing repository/real API/database
  failure cases. The harness shut down its services and cleaned its owned fixtures.
- `npm run export:web -w @justgo/mobile`: production web bundle exported successfully.
  Metro emitted color-environment notices; no warning suppression or configuration
  change was made. The saved/browser fixture startup still reports unavailable
  `simctl`; that existing native limitation remains open.
- Side-panel verification at **1280 × 720**, using the actual app with an isolated
  loopback `justgo_test` account/access fixture: account creation → recovery return
  → unavailable Access → Settings → recovery return → developer preview → accept
  → Completed → Success → Continue → Reflection → Skip → deck → Progress all worked.
  No browser error/warning entries were captured. The fixture account had **zero
  attempts** after the preview flow; its rows were cleaned and both services stopped.
  Screenshots: `.local/structure-follow-up/{access,settings,preview,success,reflection,progress}.jpg`.
  This one-off walkthrough is separate from the saved suite and establishes browser
  wiring only; it does not establish native behavior or the unfinished 07.3 app journey.

The Foundation deletion and this refactor are local, uncommitted owner-review changes
on `codex/phase-07.2-local-sync`, after the two earlier local implementation/data-folder
commits. No push, PR or merge was performed. Native durability/device/staging evidence,
07.3 integration, 07.4 Progress composition and 07A billing remain open as before.

## October 5 owner-requested simulator verification attempt

The owner requested simulator testing of the current app and Phase 07.1/07.2.
Before native interaction, ten focused mobile suites passed **95 tests**, and
`npm run test:db` passed **60 database cases plus one migration/restoration case**.
These are automated results, not native durability evidence.

XcodeBuildMCP discovery and accessibility inspection failed because the global
developer directory still points to Command Line Tools. Command-local
`DEVELOPER_DIR` overrides booted a fresh disposable iPhone 17 / iOS 26.5 simulator
named `JustGO Phase 7.2 QA`, installed the retained Phase 02 app, and launched it
against the current Metro bundle and loopback fixture API. The simulator took
about 2 minutes 30 seconds to complete first-boot migration. The native
development-client prompt and bundle-loading screen were observed; the
completion/reflection/Progress walkthrough was **not completed**. The browser
mirror displayed native frames but its input/discovery was unreliable under load.

The owner reported that the computer had become slow. Simulator first boot,
native bundling and the live mirror were running together on the 8 GB Mac. The
verification attempt ended, the created simulator was shut down, and Metro,
the fixture API and mirror were stopped. A final check found no booted simulator
and no listener on ports 3000, 8081 or 3200. The fixture registry contained zero
allocated accounts. No native rebuild, signing change or global Xcode setting
change was made. The disposable simulator remains available for reuse.

Keep native AsyncStorage durability and termination/relaunch acceptance open:
the retained binary lacks RNCAsyncStorage, and the new repository is not yet
wired into the screen flow (07.3). For the next native attempt, reuse the already
initialized test simulator and avoid running a live mirror alongside first-time
bundling. This attempt establishes no native pass for those open requirements.

### Manual simulator handoff

At the owner's explicit request, deleted only the old `iPhone 17` virtual device
(`AD9B10C7-1336-428E-AB80-C00A83AA391D`) and reused `JustGO Phase 7.2 QA`
(`F0926FE3-5692-4241-B6C8-C5C4F9C6422E`). Only the QA simulator is booted.
Started the loopback fixture API and Metro with one worker, without the live mirror.
The existing native binary loaded the current JavaScript, the developer introduction
was dismissed, and the actual challenge deck was visibly ready. Screenshot:
`.local/simulator-07-2/manual-ready.png`. Simulator/API/Metro are intentionally
left running for the owner's manual testing. This is a launch/handoff observation,
not completion of the previously unfinished native verification or the 07.3 journey.

## October 5 publication preparation

The owner explicitly authorized committing the remaining changes, updating this
handoff and pushing `codex/phase-07.2-local-sync`. PR creation was initially
authorized, then explicitly placed on hold while discussing the Identity folder.
At this checkpoint no Identity relocation was approved or included. Merge and auto-merge remained
unauthorized. The earlier local-only restrictions above describe
the state at those verification checkpoints. Keep the activity-module relocation
commit separate from the implementation, and group the subsequent runtime/developer
folder cleanup as its own reviewable change. Existing local evidence is recorded
above; hosted evidence must be checked on the published revision.

### Published commits and review state

The authorized branch push succeeded. Reviewable implementation commits are:

- `4019c51` — Phase 07.2 local saving and synchronization.
- `aad0923` — Move the shared activity data out of features.
- `1b78052` — Separate runtime/developer support, remove unused Foundation/Shell
  code, and update boundaries, tests and documentation.

The working tree was clean after the implementation push. The initial hosted
[push workflow](https://github.com/anthonyyoo24/justgo/actions/runs/37372411330)
for `1b78052` was queued when inspected; no hosted pass is claimed here.
At this checkpoint PR creation was explicitly on hold. Identity remained in `features/identity`
pending the owner's folder decision; no relocation was included. This publication
record is a separate documentation closeout commit. The current local verification
results above still apply; no product code changed after those checks.

## October 5 app-support naming and Identity placement

The owner selected `app-support` as the folder name for app setup and coordination
and requested implementing and committing the change. Renamed `src/runtime/` to
`src/app-support/` and moved all nine `features/identity/` source/test files into
`app-support/identity/`. The old directories are removed. A byte comparison against
the preceding commit confirmed all nine Identity files are unchanged. The Swift
Keychain module, secure item names, account/session behavior, provider APIs and
route paths are unchanged. Features now contain Challenges, Reflections and Progress.

Imports and Jest module mocks follow the new paths. Architecture enforcement
protects `app-support` using the previous dependency direction: support composes
features/shared infrastructure, feature screens may consume provider hooks,
support production code cannot import routes/developer fixtures, and shared/data
code cannot import support. Two additional fixtures protect provider-to-Identity
composition and data-to-Identity rejection; all loader variants remain checked.
Coverage selectors for the provider and Identity vault/storage/controller follow
their new paths without changing any floor or exclusion. Current coding/folder
guidance, testing documentation, plan and handoff index are updated. Earlier dated
handoffs and original runtime paths above preserve the historical sequence.

Verification:

- `node --test scripts/import-boundaries.test.mjs`: **134 passed**, including the
  renamed-path cases and six loader assertions from the two new fixtures.
- `npm run check`: contracts build, strict types, lint, formatting and **516 tests**
  passed: 141 safeguards, 45 API unit, 309 mobile and 21 contracts. The first check
  stopped at formatting because the longer provider coverage path needed JSON
  wrapping; formatted that file and reran the complete command successfully.
- `npm run test:coverage`: **106 API unit/database/migration**, **309 mobile** and
  **21 contract** cases passed, along with all global/critical coverage floors.
  Mobile **90.58% lines / 83.52% branches**, API **95.71% / 91.19%**, contracts
  **100% / 100%**. Critical support files remain included at unchanged thresholds.
- Side-panel browser verification at the default **1280 × 720** viewport: recovery
  rendered; Back to app returned the disconnected browser to recovery as expected;
  Settings rendered and its Account & recovery link opened the moved screen;
  developer previews loaded the challenge deck. No browser warnings/errors were
  captured. No account was created or activity submitted in this walkthrough.
  Evidence: `.local/simulator-07-2/app-support-recovery.png`. The temporary tab was
  closed; the owner's manual simulator/API/Metro setup was left running.

This follow-up was committed separately as `748a2ee` and published when the owner
subsequently requested creating the PR. Native AsyncStorage durability, 07.3 screen
integration, 07.4 Progress composition and physical-device/staging gates remain open.

## October 5 PR publication

The owner lifted the PR hold by requesting creation. Pushed `748a2ee` and opened
[PR #15](https://github.com/anthonyyoo24/justgo/pull/15) against `main`, retaining
the separate implementation and folder-change commits. The PR is attached to the
Codex chat and awaits owner review; no merge or auto-merge was authorized.

Hosted evidence is separate from the passing local checks above:

- The earlier [workflow for `9c3b727`](https://github.com/anthonyyoo24/justgo/actions/runs/37372509468)
  failed before tests ran. Its `checks` job had no steps or assigned runner, and
  GitHub reported: “The job was not acquired by Runner of type hosted even after
  multiple attempts.” This is a runner acquisition failure, not a test failure.
- The [push workflow for `748a2ee`](https://github.com/anthonyyoo24/justgo/actions/runs/37375261675)
  and [PR workflow](https://github.com/anthonyyoo24/justgo/actions/runs/37375343704)
  were queued when inspected. No hosted pass is claimed. Check the latest PR head
  before accepting the hosted gate.

The publication follow-up changes only documentation. Targeted Prettier checking
and `git diff --check` passed; the latest application verification remains the
516-test check, coverage and side-panel evidence recorded above.

## October 5 PR #15 review follow-up

Assessed all existing inline/review/conversation feedback against `af2431f`.
The owner explicitly requested fixing worthwhile issues and pushing the changes.

- [Rejected reflection chain](https://github.com/anthonyyoo24/justgo/pull/15#discussion_r4189107666):
  confirmed that an ordinary submission after `INVALID_REQUEST` was retained
  locally but permanently blocked in delivery. New changed input now uses the
  existing correction rule with a new identity and the confirmed server revision.
  Superseded writing remains in receipts, stale correction actions cannot replace
  newer writing, unchanged invalid input remains refused, and unrelated permanent
  failures do not silently become corrections. No schema or API contract changed.
- [Stale publication status](https://github.com/anthonyyoo24/justgo/pull/15#discussion_r4189107701):
  corrected the current-checkpoint lines in the 07.1B and Phase 07 umbrella handoffs
  to PR #15 awaiting review, with merge approval still pending.
- CodeRabbit's docstring-percentage warning is optional under the project's
  guidance. Kept focused comments explaining the correction/version boundary;
  no broad docstring generation or threshold/configuration change is needed.

Before the implementation fix, four focused regression cases failed: unchanged
ordinary input was incorrectly accepted, corrected writing never uploaded at
server revisions zero/one after restart, and a queued chain remained blocked.
The cases cover actual repository/sender delivery and retained receipts, not UI.
This module remains unwired to screens until 07.3, so no affected UI walkthrough
or new native evidence is claimed. The owner's manual simulator setup is retained.

Fresh verification after the fix:

- `npm run check`: **519 tests** passed (141 safeguards, 45 API unit, 312 mobile,
  21 contracts), along with strict types, lint and formatting. The first run caught
  an attempt to construct a typed error from a persisted string; use the existing
  typed `CONFLICT` for blocked non-correction causes and retain the original
  diagnostics in the journal. The complete rerun passed without weakening checks.
- `npm run test:db`: **60 database cases + 1 migration/restoration case** passed
  against the dedicated loopback `justgo_test` database.
- `npm run test:coverage`: **106 API unit/database/migration, 312 mobile and 21
  contract cases** passed; all global and critical-file floors passed unchanged.
  Mobile **90.62% lines / 83.77% branches**. The correction module covers the new
  invalid-request and other-cause paths, zero/nonzero confirmed revisions, unchanged
  refusal, duplicate submission, restart and stale-action protection.
- Final targeted Prettier checking and `git diff --check` passed after updating
  the review evidence and handoff status. No dependency or CI configuration changed.

The prior [push check](https://github.com/anthonyyoo24/justgo/actions/runs/37375713683)
and [PR check](https://github.com/anthonyyoo24/justgo/actions/runs/37375719678)
both passed at `af2431f`; this supersedes the earlier queued status for that head.
Those passes do not verify the later review fix. Inspect its latest hosted checks
after publication. Native durability, 07.3/07.4 integration and device/staging gates
remain open.
