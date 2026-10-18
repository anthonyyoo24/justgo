# Phase 04 — Challenge deck & reliable attempts

## Summary and status

**Status:** Implementation merged; remaining native/device/release acceptance
stays open under the approved sequencing exception. The original Phase 04 deck,
attempts, timer and Success implementation was verified locally and in the
simulator. Phase 07 subsequently replaced server queues/active-attempt recovery
with memory-owned browsing and local completion saves. Its
[cutover handoff](phase-07-5-cutover-acceptance.md) owns that protocol’s evidence.

[Phase 04](../implementation-plan/phase-04-challenge-loop.md) owns the bounded
phase scope; [CHALLENGES.md](../product/CHALLENGES.md) now owns the consolidated
current scope and catalog, replacing `PHASE_04_SCOPE.md`. Dependencies are
[identity](phase-02-identity.md) and the [app shell](phase-03-app-shell.md).

## Decisions and why

- Anthony approved Streets, Park, Gym, Cafe, Bookstore and Bars & Clubs with
  manual venue pills, independent cycling decks and Streets on fresh launch.
  Shared content does not couple ordering across venue placements. There is no
  GPS selection, All/Anywhere option, personal server queue or per-skip request.
- The reviewed catalog has 61 placements and 58 shared active challenges; Gym
  has eleven cards and each other venue ten. Keep the reviewed wording and
  five-minute duration. Subtext, hints, extra illustration/safety fields and
  level progression are outside this version; Level 1 history remains.
- The original 39O Café design without subtext and with the stack fanning right
  is selected. [CHALLENGES.md](../product/CHALLENGES.md#deck-and-motion) owns the
  motion decision; [CHALLENGE_FIDELITY.md](../design/CHALLENGE_FIDELITY.md) owns
  measured visual guidance.
- A repeat after cycling earns a separate rep; retrying one completion cannot
  create another. Minor wording changes are visible in history; substantial
  activity changes require a new challenge ID. Retain inactive historical content.

## Behavior that changed

Phase 04 introduced the live six-venue deck, a bounded native card window,
shared gesture/button actions, the five-minute active view, direct Give up and
the full Paper-derived Success view. The presentation preview shares those views
but makes no authenticated domain writes.

The current flow captures challenge/start/time zone/duration in React memory.
Settings and tabs disappear while active; only Completed/Give up exit. Zero waits
for an explicit outcome. Start/Give up write no attempt, and a fresh mount/account
switch/process restart discards unfinished activity. Completed saves one stable
UUID through the account journal before Success, with background upload. Phase 05
added optional Reflection; Phase 07 integrated local saving and Progress.

The original migrations 0004–0006 established the catalog and immutable revision
history, including the shorter BC-10 copy. They remain registered migration
history. Migration 0013 coordinated their contraction; retired server queue,
start/finish and revision APIs are not the current contract. Preserve the
canonical boundaries in [APP_SHELL.md](../architecture/APP_SHELL.md).

## Invariants to preserve

- Accounts own their deck state, pending completion and saved records; account
  changes cancel/fence stale callbacks and cannot publish another account’s data.
- Venue order is process memory and each placement advances independently.
  A venue change cannot restart an active attempt.
- The four-card animation window preserves the outgoing card and its color until
  the destination covers it. Buttons and gestures share one controller; duplicate
  input cannot advance twice. Hidden rear cards stay outside accessibility.
- Completed retains one UUID through uncertain saves. Do not show Success before
  the repository accepts the completion or describe memory-only activity as saved.
- Only completed attempts earn reps; reflection choice never changes credit.
  New catalog content needs a rendered two-to-four-line audit at normal text size,
  not only a character limit. Preview repetition cannot establish live variety.
- Keep accessible action alternatives, Reduce Motion and reachable small-screen
  controls. Essential recovery/export/deletion stay outside paid-access guards.

## Problems that could recur

- Queue-driven remounts and premature source clearing previously flashed the old
  card or Home during navigation. Stable animated identity and retained outgoing
  content protect the handoff; inspect native frames when changing it.
- A full-screen native active view initially measured safe areas too late,
  hiding the title and shifting content. Use already measured root insets for
  the first visible layout and apply each inset once; later fixes are in the
  [07.5 handoff](phase-07-5-cutover-acceptance.md) and
  [Phase 08 closeout](phase-08-settings-privacy.md).
- Browser-native text/layout behavior differs. Original normal-size simulator
  checks covered the full catalog, while automated Simulator drags did not prove
  touch quality. Keep physical and accessibility gates explicit.
- Historical handoffs described server-confirmed active attempts and immutable
  challenge revisions. Phase 07’s contraction supersedes that design; do not
  restore the retired writes or deploy an old client/API against current schema.

## Setup or environment changes

No new setup is introduced by this documentation consolidation. Follow
[FOUNDATION.md](../operations/FOUNDATION.md) for local database, migration and
API setup and [TESTING.md](../operations/TESTING.md) for the isolated journey
harness. The fixture API is restricted to loopback `justgo_test`; never deploy
its entitlement adapter. Environment names include `DATABASE_URL`,
`MIGRATION_DATABASE_URL` and `EXPO_PUBLIC_API_URL`, without committed values.

Apply registered forward migrations in order; do not edit historical migrations
or reset shared activity. The later [test-server handoff](phase-13-test-server.md)
records hosted migration through 0013 and identity preservation. The current
[Phase 08 open gates](phase-08-settings-privacy.md#open-gates) own the remaining
hosted rollout; the original Phase 04 staging requirement is not a request to
redeploy an obsolete schema. Reuse compatible installed development binaries for
JavaScript changes; native dependency/configuration changes require their own
build and acceptance evidence.

## Open gates

| Gate                                                                       | Owner                                               | Required phase          | Done when                                                                                                                       |
| -------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Native/physical challenge touch, interruption and accessibility acceptance | Implementation owner and Anthony                    | 13                      | First/repeated gestures, Reduce Motion, VoiceOver, large text and background/lock behavior verified on the beta/release surface |
| Earlier identity and app-shell device matrix                               | Anthony and implementation owner                    | 13                      | Two-iPhone recovery/reinstall, Keychain account preservation and relevant shell accessibility evidence recorded                 |
| Coordinated current staging and release acceptance                         | Implementation owner, Anthony authorizes deployment | 13                      | Current API/mobile/schema and preserved history verified under Phase 08/test-server rollout gates                               |
| Paid-access provider acceptance                                            | Billing implementation owner and Anthony            | 07A, before paid launch | Provider-backed purchase/restore/expiry policy passes the billing and release gates                                             |

## Final verification

September 27, 2026: the original Phase 04 implementation passed `npm run check`,
`npm run test:db -w @justgo/api`, `npm run export:web -w @justgo/mobile`,
`npm run export:ios -w @justgo/mobile` and
`npm run doctor -w @justgo/mobile`. Database coverage exercised independent venue
cycling, same-input retries, deliberate repeats, concurrency, owner isolation and
access rejection. A content comparison matched all 61 reviewed placements.
No inspected hosted CI link was recorded for that final local run.

Original in-app browser verification covered six venues, gesture/button flow,
failure/retry, narrow-screen controls and Success navigation. The retained iPhone
17/iOS 26.4 simulator verified the normal-size catalog, timer recovery under the
then-current server protocol and repeated Success/back navigation. Those checks
are historical evidence, not acceptance of the later local-save protocol or a
physical-device pass. Later protocol verification belongs to the linked Phase 07
handoffs; Phase 08 records subsequent owner-reported phone acceptance.

Phase 08A consolidates documentation only here. It adds no browser/device result
and closes none of the remaining release gates.
