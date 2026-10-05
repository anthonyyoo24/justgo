# Phase 07.2 — Durable local saving and synchronization

## Snapshot

- **Status:** Implemented locally for owner review. Native durability evidence remains open;
  this is not acceptance of the completed app journey or permission to publish.
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
payload replay. A correction of an older rejected version cannot consume newer
submitted writing; it returns a conflict and preserves both operations for the
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
