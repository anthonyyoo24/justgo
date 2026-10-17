# Phase 09 — App continuity & Reflection exit

## Summary and status

**Status:** Implemented locally; native acceptance open. Venue decks shuffle once,
resume their saved account-owned order and front card, and remember the selected
venue on this phone. Post-challenge Reflection exits through its bottom Skip/Save
action. The [phase plan](../implementation-plan/phase-09-app-continuity.md) owns
scope; [Phase 08](phase-08-settings-privacy.md) and
[Phase 08A](phase-08a-structure-cleanup.md) retain their earlier release gates.

## Decisions and why

The October 15 product changes and
[October 17 phase split](../DECISIONS.md#october-17-phase-09-split-and-renumbering)
remain in force. These app changes do not activate analytics or add onboarding.
[ACTIVITY_DATA.md](../architecture/ACTIVITY_DATA.md#repository-and-storage-ownership)
owns the implemented persistence and reconciliation rules; the PRD owns product
behavior.

## Behavior that changed

- Challenge browsing reconciles saved placement IDs against the current catalog.
  New venues shuffle through an injected random source; refreshes preserve surviving
  order/front, insert additions behind the current front and remove absent placements.
  Skip, Give up and accepted completion persist only the affected rotation.
- `DeckPreferencesStorage` owns the optional account-scoped `:decks` envelope beside
  `:catalog` and `:journal`. It validates state, fences stale reads and serializes
  best-effort writes; identical hydrated/pending/successful snapshots avoid extra
  writes and failed snapshots remain retryable. Account deletion drains accepted
  preference work before removing its keys.
- The last venue resumes on relaunch. Missing/unknown values and new accounts start
  in Streets; invalid/unreadable state reshuffles without disabling Home.
- Post-challenge Reflection removes top Back/X and its discard dialog. The bottom
  action remains Skip when empty and Save Reflection with input. The Progress
  day-sheet editor retains its dirty-close prompt and the shared controller.

No API contract, database migration, native dependency or analytics configuration
changed.

## Invariants to preserve

- The saved deck/venue preference envelope stays on this phone and never enters
  activity uploads or analytics. Their write failures must not enter journal saving, cloud fallback or
  loss-risk presentation. Submitted activity retains its existing durability rules.
- Hydration and callbacks belong to their account generation. A late saved venue
  cannot replace a newer explicit selection. A removed active placement must not
  rotate the untouched next card when the old challenge is completed or given up.
- Unfinished challenges and unsubmitted editor input remain memory-only. Saved
  deck order does not introduce active-challenge recovery or a server queue.
- Reflection swipe-back remains disabled; keep the keyboard-aware bottom footer,
  newer-input/save protection and Progress editing behavior intact.

## Problems that could recur

Catalog updates and outcomes can arrive in either order. Always match the captured
active placement before rotating, rather than advancing whichever card happens to
be front after refresh. Optional preference persistence must remain separate from
the journal, including failures, duplicate snapshots and deletion draining.

## Setup or environment changes

None for normal development. Existing installations need no storage migration;
the new optional envelope is initialized from their downloaded catalog. The
existing signed app binary can receive the JavaScript changes through its normal
development server. Follow [TESTING.md](../operations/TESTING.md) for isolated
fixtures; the owner’s LAN development server was left running.

## Open gates

| Gate                                                                          | Owner                            | Required phase | Done when                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | -------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smallest-supported iPhone keyboard and large-text acceptance                  | Implementation owner and Anthony | 09             | On a running native simulator/device, verify the bottom Skip/Save stays visible and reachable with the software keyboard open at large text, and verify Reflection navigation |
| Signed-build persistence, accessibility and earlier device/release acceptance | Existing phase owners            | 14             | Actual beta/release evidence satisfies the phase plan and inherited handoffs                                                                                                  |

No new native deferral was approved during this implementation. The Phase 09
native check remains open; browser/component evidence does not close it.

## Final verification

October 17, 2026:

- Automated: focused changed-behavior suites pass. `npm run test:db` passes against
  isolated loopback `justgo_test`, including the migration/restoration rehearsal.
  `npm run test:coverage` passes all-source and critical-behavior floors for all
  workspaces, with 919 mobile, 180 API and 28 contract tests passing.
- Saved journeys: the full `npm run test:journey` suite passes all 34 saved
  app/API/database journeys, including deck continuity and Progress editing.
  `npm run check` passes, including fresh online Expo Doctor (21/21), all
  workspace typechecks, lint, formatting, architecture/tooling tests and unit
  suites. `npm run export:web -w @justgo/mobile`,
  `npm run test:exported-web` (one smoke journey), and
  `npm run export:ios -w @justgo/mobile` pass. Exports establish bundling, not
  native keyboard or device behavior.
- Interactive: the in-app browser walkthrough passes for deck actions and
  bottom-only Reflection at small and normal phone viewports, including a
  reduced-height save action. Disposable account/API-origin safeguards and fixture
  cleanup were checked separately from automated evidence.
- Native/device: not verified. XcodeBuildMCP could not find `simctl` through the
  selected command-line tools; the installed Xcode toolchain's read-only probe
  confirmed no booted simulator. A running simulator was requested for the native
  check. No native build, signing change or hosted acceptance was performed.
- Changed directories were reviewed and remain organized by responsibility.
  No Git push, pull request or merge was requested or performed.
