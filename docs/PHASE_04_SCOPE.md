# Phase 04 — Current scope decisions

Updated September 24, 2026. The six venues, cycling stacks, no-subtext presentation and 39O animation below supersede the September 21 grouped-venue/no-replay proposal.

Owner: Anthony. Status: implemented locally; physical-device acceptance and deployment remain open. See the [phase 04 handoff](handoffs/phase-04-challenge-loop.md).

This update supersedes the earlier general-only/no-venue scope in the PRD, tech stack, design guide and historical handoffs. The implementation plan links here so later work does not revive those exclusions.

## Approved venues

Anthony finalized these six venues in the challenge discussion:

- Streets
- Park
- Gym
- Cafe
- Bookstore
- Bars & Clubs

Pills across the top filter the offered challenges; allow horizontal scrolling when needed. Selection is manual, not GPS. Each user has an independent ordered stack per venue. Skipped/completed cards move to that venue's back and can recur after cycling. Shared challenge content can appear in separate venue-card placements; advancing one placement never advances another venue's copy. A venue change never restarts an active attempt. No additional Anywhere or All option has been approved. Implementation default: Streets for a new account; persist the last manual selection per account.

## Challenge loop and content

Phase 04 builds the deck, active challenge screen, confirmed completion/Success, give-up confirmation and database/API behavior. Acceptance saves one attempt with its server start/deadline; navigation and relaunch preserve it. Zero awaits an explicit outcome. Reflections remain phase 06, full Progress phase 07, and payments phase 08.

Author-facing challenge content is recorded in [CHALLENGES.md](CHALLENGES.md): 61 reviewed venue cards. Use that document as a human-readable reference for entering database content; no separate JSON catalog/import workflow or admin dashboard is required. Do not show challenge subtext in this version; an optional nullable model field may remain for future use, and the document's earlier subtext drafts do not make it required UI. No separate hints, per-challenge illustration requirements or safety-guideline fields are required. Existing general respectful-content principles are unchanged.

Use five minutes for all current challenges. Retain a per-revision duration, initially 300 seconds, so a future duration change does not alter existing attempts. Differing durations are not part of this version.

The “3 / 12” indicator means completed challenges toward the next level. Omit the indicator/progress line at launch because levels are deferred. Keep stable Level 1 history without thresholds or progression. There is no ordinary exhausted state: the venue stack cycles. An empty venue says “More small steps soon. There are no challenges here yet. Try another venue.” Small queues render only their real cards. Each accepted repetition gets a new attempt; retries of the same save cannot create another rep or queue advance.

## Approved 39O deck and motion

Use the original [39O Café screen without subtext](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/OMO-0) and its stack fanning to the right. The bottom-edge variant is not selected. Preserve its styling and shadow depth while applying the current venue and level-indicator decisions.

The front card follows the thumb and tilts; a cancelled swipe settles back. On a committed swipe it flies offscreen, the middle card slides left/up and straightens into the front position, and the rear card moves into the tilted middle position. A fourth card starts concealed behind the rear card and fans out to the right just before the other cards settle. Overlap these movements, initially targeting about 300 ms after release; refine the timing in a working prototype. Avoid a pronounced bounce. The incoming card carries the departing card's color but the next queued challenge's content.

Use the existing React Native/Expo stack with Gesture Handler, Reanimated and Worklets; no extra swipe/deck library is needed. X/heart buttons share the gesture animation controller, duplicate actions cannot advance twice, and persisted attempts remain governed by server confirmation/recovery. Start with sample cards and the iOS simulator alongside development, then connect venue queues and the real challenge flow. Verify browser/simulator behavior and physical-iPhone touch feel, including reduced motion and accessible alternatives. Full implementation details and acceptance checks are in [Phase 04 of the implementation plan](IMPLEMENTATION_PLAN.md#phase-04).

## Access and development testing

On confirmed expiry of paid access, lock paid functionality; there is no special allowance to finish an attempt or save a reflection. Already saved records are retained. Recovery and existing always-available account/data controls remain accessible. Implement actual payments and provider-state testing in phase 08.

Before billing, exercise the real challenge loop with isolated local/test entitlement fixtures and disposable data. The existing presentation-only preview must not acquire domain writes or become a production access bypass.

## Physical devices

Anthony reports Apple Developer enrollment complete. Permanent identifier, team/signing access and physical-device acceptance remain unverified; see [APPLE_SETUP.md](APPLE_SETUP.md). The previously approved sequencing exception still allows feature implementation. Recommend a small physical-device smoke check once the challenge loop works, and retain the complete two-iPhone recovery/accessibility/release acceptance gates.
