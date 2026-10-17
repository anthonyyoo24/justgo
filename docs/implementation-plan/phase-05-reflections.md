<a id="phase-05"></a>

# Phase 05 — Feelings & typed reflections

**Status:** In progress

## Outcome

A completed attempt can have optional private feedback and typed reflection text.

## Decisions in force

- Dependencies: 04
- Acceptance: PRD AC-09–11, 17 · Tech acceptance 5, 8–9, 17
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Offer five labeled relative feelings without preselection and optional multiline reflection text. Feeling-only, text-only and both are allowed; missing feeling differs from neutral.
- Keep Skip for an empty reflection and Save Reflection when input exists. Empty Back/X skips; dirty Back/X offers save, keep editing or discard and skip. Phase 09 removes only the post-challenge top exit.
- Explicit submission saves locally before ordinary navigation and synchronizes through the owning attempt with revision/replay protection; unfinished typing is not an automatic cloud submission. Genuine revision conflicts adopt the latest backend version under Phase 07's rule without deleting completion credit.
- Retain newer input through pending saves, account changes and recovery. Use the normal keyboard; custom dictation, audio capture and microphone permissions remain deferred.

## Keep out

- No before/after clinical measurement, separate anxiety/confidence scales, day notes, raw audio storage or AI voice coach.
- No unapproved feeling-only/text-only behavior or final-save success while part of the feedback was lost.

## Ready to hand off when

- [x] Reflection optionality and dismissal rules are approved; feeling-only/text-only/both cases match that decision and missing differs from neutral.
- [x] Explicit local submission, consistent feeling/text saves, dirty-input retry and server-wins genuine revision conflicts pass locally; skipped reflection keeps credit.
- [ ] Real iPhone text entry, keyboard avoidance, long input, dismissal and screen-reader behavior pass; no custom microphone prompt or Dictate control is shipped.
- [x] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; link it from the handoff index.

## Open gates for Phase 11

- Physical-iPhone long text entry, software-keyboard layout, dismissal, screen-reader behavior and staging integration.
- Preserve typed reflection and completion credit across storage/network failure.
