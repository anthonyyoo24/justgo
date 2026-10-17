<a id="phase-16"></a>

# Phase 16 — Optional US iOS web checkout

**Status:** Not scheduled

## Outcome

Eligible users can purchase on the web using the same authenticated app identity.

## Decisions in force

- Dependencies: 14
- Acceptance: PRD §4.3, §9 · Tech §8; acceptance 7, 14–17
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Recheck current Apple/storefront rules, Stripe/RevenueCat integration and checkout data requirements. Approve rollout scope before building; keep native checkout as fallback and a server disable switch.
- Add server-allowlisted checkout creation bound to the user, verified Stripe subscription webhooks, RevenueCat mapping and app-return entitlement refresh. Support refunds, delayed payment, cancellation, portal routing and duplicate-subscription prevention.
- Reuse billing reconciliation and privacy controls. Measure conversion, refunds and net revenue for eligible visitors before expanding.

## Keep out

- No GPS/IP eligibility guess, credentials in checkout URLs, access granted by redirect, assumed LTV uplift or Android alternative billing.

## Ready to hand off when

- [ ] Optional scope is approved and current storefront/integration rules are verified.
- [ ] Eligible/ineligible flows, forged redirects/webhooks, delayed payment, return/restore, refund/cancel and duplicate subscriptions pass.
- [ ] Rollout/rollback, provider reconciliation and measurement evidence are recorded.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; link it from the handoff index.

## Open gates for Phase 14

Not a first-release gate; schedule separately after launch.
