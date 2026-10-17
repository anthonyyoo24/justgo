<a id="phase-09"></a>

# Phase 09 — App continuity & Reflection exit

**Status:** Implemented locally; native acceptance open

## Outcome

Venue decks shuffle once per account on this phone and resume with their saved order and last selected venue. The post-challenge Reflection screen has one bottom exit.

## Decisions in force

- Dependencies: 08 and 08A, including account isolation, the existing reflection keyboard fix and the implemented folder structure.
- Preserve the October 15 product decisions and the [October 17 phase split](../DECISIONS.md#october-17-phase-09-split-and-renumbering).
- These product changes are independent of analytics, provider setup and onboarding acceptance.

## Implement

<a id="phase-09-app-changes"></a>

1. **Shuffled, saved venue decks.**
   - When an account first has the catalog on this phone, shuffle each venue's placements once, using an injected random source so tests control the order.
   - Save each venue's card order and current front card on the phone, scoped to the account beside the downloaded catalog. Skip, give up and completion keep rotating the saved order as today; on relaunch each venue resumes at the same card.
   - When a catalog refresh adds placements, insert them at random positions in the saved order; drop removed or inactive placements. Never fabricate cards.
   - Missing, unreadable or invalid saved state falls back to a fresh shuffle without blocking Home. Saving this state is best effort: a failed write keeps the in-memory deck working and never shows the saving or loss-risk banner.
   - An account change loads only that account's saved order.
2. **Saved last venue.** Save the selected venue with the deck state. Relaunch opens on it; new accounts and missing or unknown saved values open on Streets.
3. **Reflection exit.** Remove the top Back/X control from the post-challenge Reflection screen. The bottom action (Skip with no input, Save Reflection otherwise) becomes the only exit; the screen's swipe-back gesture is already disabled. Remove the Save / Keep editing / Discard prompt that only Back/X reached. Verify the bottom action stays visible and reachable with the keyboard open on the smallest supported iPhone and at large text sizes. The Progress day-sheet editor keeps its existing dirty-close prompt.
4. **Documentation.** Update PRD §5.1 (deck order and venue persist instead of resetting on a fresh launch, with the one-time shuffle), PRD §5.4 (bottom action is the only exit), the venue-stack line in `docs/product/CHALLENGES.md`, and the data inventory (deck and venue state stays on the phone and is not uploaded or sent to analytics).

## Keep out

- No analytics activation, acceptance page, crash SDK, cloud synchronization of deck preferences or change to saved activity/upload safeguards.
- The Progress day-sheet editor keeps its existing dirty-close prompt.

## Ready to hand off when

- [x] Saved shuffle, front card and last venue survive relaunch and remain isolated across accounts; new accounts default to Streets.
- [x] Catalog additions/removals/inactive placements reconcile correctly; missing, unreadable or invalid state falls back safely and failed writes leave Home usable without saving/loss-risk banners.
- [ ] Post-challenge Reflection has no top Back/X or associated discard prompt; Skip/Save remains reachable with the keyboard open on the smallest supported iPhone and at large text sizes. Progress editing and reduced-motion behavior remain intact.
- [x] Focused tests, required phase checks and in-app browser verification pass; record native/device evidence and any explicitly approved release deferral accurately.
- [x] Update the named product/inventory docs and save the phase handoff with final evidence and remaining gates; link it from the handoff index.

## Open native acceptance

- Phase 09 still requires its smallest-supported iPhone software-keyboard/large-text check. Browser/component evidence passes but does not establish native behavior; no new deferral is approved. See the [handoff](../handoffs/phase-09-app-continuity.md#open-gates).

## Open gates for Phase 14

- Recheck persistence, Reflection keyboard/accessibility and native navigation on the signed beta/release build; preserve earlier device gates until evidenced.
