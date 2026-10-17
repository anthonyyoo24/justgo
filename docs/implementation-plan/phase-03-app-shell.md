<a id="phase-03"></a>

# Phase 03 — App shell & shared API

**Status:** Implemented — full accessibility/device acceptance pending

## Outcome

The app restores the right account and provides consistent navigation and network behavior.

## Decisions in force

- Dependencies: 02
- Acceptance: PRD AC-02, 17 · Tech acceptance 8, 10, 16, 17
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Build Router entry gates, Home/Progress tabs, Settings/recovery and focused challenge, Success and Reflection routes; preserve account-deletion Back-history guards.
- Use shared strict runtime contracts and one bounded HTTP retry/renewal policy, account-scoped query keys, cancellation and stale-response protection.
- Keep product state with its owner: React for local presentation, TanStack Query for independent server reads, and the Phase 07 account-scoped activity store/journal for persisted submissions.
- Keep onboarding/questionnaires deferred. The Phase 08 post-deletion welcome is recovery/navigation, not onboarding.
- Enforce server-authorized access with no production fixture bypass; telemetry stays non-exporting until Phase 11.

## Keep out

- No questionnaire onboarding, fabricated product data, production access bypass or overlapping retry budgets.
- Do not treat a timed-out write as rejected or duplicate the account-scoped activity owner.

## Ready to hand off when

- [x] Home/Progress tabs, Settings/recovery access and guarded Success/Reflection route shells work; questionnaire onboarding remains deferred and the Phase 08 post-deletion welcome remains isolated.
- [x] API tests cover typed errors, retry budgets, stable action IDs, coordinated renewal and late responses after account changes.
- [ ] Navigation, keyboard, screen-reader labels and reduced motion work on iOS; expired/unverified access has no release bypass.
- [x] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; link it from the handoff index.

## Open gates for Phase 14

- Native navigation, software keyboard, screen-reader focus/labels, scalable text and reduced motion.
- Preserve Phase 02 recovery gates and staging/environment isolation.
