# Phase 04 — Current scope decisions

Scope approved September 24, 2026; current behavior reconciled October 8 after Phase 07. The Phase 04 handoff preserves the earlier server-backed implementation evidence. The six venues, cycling stacks, no-subtext presentation and 39O animation below supersede the September 21 grouped-venue/no-replay proposal.

Owner: Anthony. Status: implemented locally; physical-device acceptance and deployment remain open. See the [phase 04 handoff](../handoffs/phase-04-challenge-loop.md).

This update supersedes the earlier general-only/no-venue scope in the PRD, tech stack, design guide and historical handoffs. The implementation plan links here so later work does not revive those exclusions.

## Approved venues

Anthony finalized these six venues in the challenge discussion:

- Streets
- Park
- Gym
- Cafe
- Bookstore
- Bars & Clubs

Pills across the top filter the offered challenges; allow horizontal scrolling when needed. Selection is manual, not GPS. Each user has an independent ordered stack per venue. Skipped/completed cards move to that venue's back and can recur after cycling. Shared challenge content can appear in separate venue-card placements; advancing one placement never advances another venue's copy. A venue change never restarts an active attempt. No additional Anywhere or All option has been approved. Current default: Streets on fresh launch. Selection and each venue's cycling order remain in memory and reset on a fresh launch; no server preferences, personal queues or per-skip requests remain.

## Challenge loop and content

Phase 04 originally built the deck/server-backed loop; Phase 07 replaces that persistence protocol. Start immediately captures challenge/start/time zone/duration in React memory. Give up sends no write. Completed creates one UUID and awaits phone saving before Success, with background create upload; reflections and Progress are now integrated. The full-screen active view hides Settings/tabs and exits only through Completed/Give up. Lock/background retains it while alive, but a fresh mount/account switch/process restart discards unfinished activity. Zero still awaits an outcome. Payments remain Phase 07A.

Author-facing challenge content is recorded in [CHALLENGES.md](CHALLENGES.md): 61 reviewed venue cards. Use that document as a human-readable reference for entering database content; no separate JSON catalog/import workflow or admin dashboard is required. Do not show challenge subtext in this version; an optional nullable model field may remain for future use, and the document's earlier subtext drafts do not make it required UI. No separate hints, per-challenge illustration requirements or safety-guideline fields are required. Existing general respectful-content principles are unchanged.

Use five minutes for all current challenges. Keep duration on the stable challenge record, initially 300 seconds, and capture the original duration for the active countdown. Minor wording edits appear in existing history; substantially different activities use a new challenge ID. Inactive content remains for history/pending references. Differing durations are not part of this version.

The “3 / 12” indicator means completed challenges toward the next level. Omit the indicator/progress line at launch because levels are deferred. Keep stable Level 1 history without thresholds or progression. There is no ordinary exhausted state: the venue stack cycles. The old empty-venue copy is retired by Phase 07's fixed nonempty venue catalog; render only genuine downloaded cards. Each deliberately completed repetition gets a new attempt UUID; retries of the same save cannot create another rep. Catalog configuration validates all six nonempty venues; initial catalog misses have loading/failure/offline presentation rather than a normal empty-venue state.

## Approved 39O deck and motion

Use the original [39O Café screen without subtext](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/OMO-0) and its stack fanning to the right. The bottom-edge variant is not selected. Preserve its styling and shadow depth while applying the current venue and level-indicator decisions.

The front card follows the thumb and tilts; a cancelled swipe settles back. On a committed swipe it flies offscreen, the middle card slides left/up and straightens into the front position, and the rear card moves into the tilted middle position. A fourth card starts concealed behind the rear card and fans out to the right just before the other cards settle. Overlap these movements, initially targeting about 300 ms after release; refine the timing in a working prototype. Avoid a pronounced bounce. The incoming card carries the departing card's color but the next queued challenge's content.

Use the existing React Native/Expo stack with Gesture Handler, Reanimated and Worklets; no extra swipe/deck library is needed. X/heart buttons share the gesture animation controller, duplicate actions cannot advance twice, and completion saving uses the serialized account journal and ordered background sender. Slow phone writes have delayed accessible feedback; ordinary uploads do not gate navigation. Start with sample cards and the iOS simulator alongside development, then verify the memory-owned venue decks and real completion/reflection/Progress flow. Verify browser/simulator behavior and physical-iPhone touch feel, including reduced motion and accessible alternatives. Full implementation details and acceptance checks are in [Phase 04 of the implementation plan](../IMPLEMENTATION_PLAN.md#phase-04).

## Access and development testing

The confirmed Phase 07A rules lock ordinary paid use at the saved verified expiry until an online check succeeds, retain earlier valid saved access through transient check failures, and permit authenticated uploads of earlier valid-access reps against server-verified coverage. Already saved/pending activity retains its app-account ownership. Recovery and always-available account/data controls remain accessible. Current production access stays unavailable until Phase 07A connects provider verification; local Phase 07 upload tests use isolated coverage fixtures.

Before billing, exercise the real challenge loop with isolated local/test entitlement fixtures and disposable data. The existing presentation-only preview must not acquire domain writes or become a production access bypass.

## Physical devices

Anthony reports Apple Developer enrollment complete. Permanent identifier, team/signing access and physical-device acceptance remain unverified; see [APPLE_SETUP.md](../operations/APPLE_SETUP.md). The previously approved sequencing exception still allows feature implementation. Recommend a small physical-device smoke check once the challenge loop works, and retain the complete two-iPhone recovery/accessibility/release acceptance gates.
