<a id="phase-15"></a>

# Phase 15 — Lock-screen countdowns

**Status:** Not scheduled

## Outcome

The same accepted challenge is visible on supported lock screens without a JavaScript background timer.

## Decisions in force

- Dependencies: 14
- Acceptance: PRD AC-06–07, 17 · Tech acceptance 9, 12, 17
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- When scheduled after launch, validate the current iOS Live Activity approach in a development build and derive its deadline from the captured local challenge start and duration. Add an Android chronometer only when Android is itself scheduled; do not require Android to ship the iOS enhancement.
- Preserve the current local-only unfinished challenge model. Design any additional native persistence explicitly when this phase is scheduled; do not revive retired server active-attempt/Give up resources.
- Implement start/update/end and tap-to-resume behavior, with minimal nonsensitive display data and reconciliation when the app foregrounds.
- Keep zero clamped and awaiting outcome; stop the display after accepted local completion or Give up. Handle notification denial, OS dismissal, unsupported versions, force-quit behavior and stale displays when local active-challenge state is no longer available.

## Keep out

- No continuously running JS loop, per-second API requests, backend expiry job or assumed immediate cross-device lock-screen updates.
- No treating display dismissal, navigation or force-quit as giving up.

## Ready to hand off when

- [ ] Real-device lock, background, reopen and zero behavior on the platforms being released use the captured start and duration; device/OS evidence is saved.
- [ ] Accepted local completion or Give up ends the display; uncertain native display updates reconcile safely without inventing backend active attempts.
- [ ] Permission denial, dismissal and unsupported-device paths retain a usable in-app countdown; native limitations are documented.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; link it from the handoff index.

## Open gates for Phase 14

Not a first-release gate; schedule separately after launch.
