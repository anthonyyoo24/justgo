<a id="phase-04"></a>

# Phase 04 — Challenge deck & reliable attempts

**Status:** Implemented locally — device acceptance and deployment pending

## Outcome

Browse → accept → complete or give up works against real cloud data exactly once.

## Decisions in force

- Dependencies: 03
- Acceptance: PRD AC-04–06, 08–09 · Tech acceptance 5, 12–13, 16–17
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Maintain the stable Level 1 catalog and reviewed six venues in [CHALLENGES.md](../product/CHALLENGES.md): Streets, Park, Gym, Cafe, Bookstore and Bars & Clubs. Each venue-card placement has stable identity; no displayed subtext or level progress.
- Preserve independent cycling venue queues, a bounded three-card fan with a concealed incoming card, stable content/color identity and the original approved Paper design.
- Gesture and button actions share one guarded animation controller. Cancelled drags do not advance; committed swipes coordinate departing/middle/rear/incoming movement and rotating colors. Provide reduced-motion and accessible button alternatives.
- Left/X creates no attempt. Right/heart starts a local in-app countdown; replacing/giving up does not earn a rep. Avoid an immediate repeat when alternatives exist.
- Preserve the Phase 07 device-first completion/reflection flow: one stable completion identity, frozen start-day/time-zone attribution, local persistence before ordinary navigation, idempotent background upload and honest recovery if storage fails.
- Preserve the queue through navigation focus loss and keep active-challenge behavior isolated from catalog reads. Relaunch resets an unfinished countdown under the current activity design.

## Keep out

- No separate replay mode, levels/progression UI, favorites, GPS, adaptive recommendations, points or daily completion cap. Ordinary venue-stack cycling is included.
- No attempt on browse/left swipe, automatic failure at zero, or a false claim of durable saving.

## Ready to hand off when

- [x] Reviewed six-venue catalog, independent stable placements and cycling queues are implemented.
- [x] Duplicate completion activation/replay preserves one rep and stable start-date attribution under the current activity flow.
- [ ] Native motion, gestures, interrupted transitions, background/lock and accessibility have release evidence or an explicit owned gate.
- [x] Implementation decisions and verification are saved in the phase handoff.

## Open gates for Phase 13

- Physical-iPhone swipe responsiveness, interrupted transitions, VoiceOver, large text, reduced motion, background/lock and relaunch behavior.
- Verify the matching integrated API/mobile build on staging.
