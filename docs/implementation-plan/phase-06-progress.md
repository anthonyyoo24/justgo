<a id="phase-06"></a>

# Phase 06 — Progress calendar & saved history

**Status:** In progress

## Outcome

Users can view the full Progress summary/calendar and read day details and saved reflections.

## Decisions in force

- Dependencies: 05
- Acceptance: PRD AC-13–14, 17 · Tech acceptance 5, 9, 12–13, 17
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Preserve the full P37 Progress content: current/best streak, all-time reps, navigable month/year calendar, per-day counts, monthly reps and active days. Do not replace it with a simple history list or implement Levels here.
- Build current/best streak, all-time reps, month navigation, monthly reps/active days and per-date counts using frozen local challenge-start dates/time zones.
- Build the scrollable chronological day sheet with captured challenge-start time, five feeling labels or an accessible Not recorded state, plus the approved per-attempt reflection-reading interaction. Do not store or display elapsed durations or a day-level rep total.
- Keep the day sheet content-sized with bounded continuous resizing from its top grip. Dragging retains the released height and stops at a measured minimum showing the full first attempt row; only the overlay and X are sheet dismissal controls, preserving the dirty-reflection guard. Keep list scrolling independent and the full editor/actions visible above the keyboard.
- Choose pagination/caching and indexes for the actual history queries now; verify them on representative data. Preserve live challenge wording, stable challenge/Level 1 history and dirty edits.

## Keep out

- No feeling heatmap, chart library, day note, standalone journal destination, practice replay or automatic adoption of every draft course.
- No fabricated zero totals on API failures or credit awarded by skips.

## Ready to hand off when

- [x] The full Progress summary/calendar and tappable day sheet match the clarified references in local browser/simulator checks, with honest empty/error states and no Day note block.
- [x] Streaks, monthly totals and ordered day entries pass midnight, DST, travel, missing feedback and multi-completion cases.
- [x] Saved reflection reading and text-editing scope is agreed and implemented; verify automatic paging beyond 20 day entries and local sheet scrolling/close/accessibility labels. Carry physical-iPhone VoiceOver, text scaling and gesture acceptance to Phase 14.
- [x] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; link it from the handoff index.

## Open gates for Phase 14

- Physical-iPhone VoiceOver, scalable text, sheet gestures, keyboard and paging on representative days.
- Verify the final continuous-resize minimum/maximum, overlay/X dismissal, keyboard-first downward gesture and retained editor on the physical iPhone; earlier feedback on the preceding drag behavior does not establish this final policy's acceptance.
- Integrated staging/API acceptance and earlier dependency gates.
