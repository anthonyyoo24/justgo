<a id="phase-07a"></a>

# Phase 07A — Native subscriptions & reliable billing

**Status:** Local implementation prepared; activation and external/native billing acceptance wait until after the free beta.

## Outcome

Verified native purchases unlock promptly, still-valid saved verification permits offline paid use, earlier valid-access activity can synchronize after expiry, and later subscription changes recover reliably.

## Decisions in force

- Dependencies: 07.5 and the completed Phase 07 umbrella acceptance checks.
- Acceptance: PRD AC-03 · Tech acceptance 6, 14–17, plus all nine confirmed subscription rules below. Align older access-freshness requirements after implementation under the approved documentation sequence.
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

1. **First use:** successfully verify subscription access through the API before unlocking paid features. A missing verification cannot unlock first use offline.
2. **Remember verification:** persist the API-verified status, expiry and last successful check time on the phone, scoped to the account. Clear/switch the applicable snapshot when the account changes; do not reuse another account's access or treat an invented client premium flag as verification.
3. **Immediate access:** on opening the app, hydrate and use still-valid saved verification immediately, including offline. Access validity depends on the verified expiry, not a one-minute freshness cutoff or whether a background query has an error.
4. **Background refresh:** on app opening, foreground return or reconnection, check when verification is missing or the last successful check is more than five minutes old. When online, refresh without delaying access supported by an unexpired saved verification. Successful checks update the persisted information; coalesce overlapping event triggers. Missing verification remains locked until verified, and network failure must not replace a still-valid saved verification with an unavailable result.
5. **Purchase/restore:** verify immediately through the API after purchase or restore, bypassing the five-minute refresh threshold. Preserve the existing honest purchase/restore pending behavior; the no-network-save-state decision concerns completion/reflection uploads, not payment verification.
6. **No constant polling:** remove the current 30-second mobile access requests and one-minute freshness-based access cutoff. Five minutes passing alone triggers neither a request nor an access block. This mobile policy does not remove the separately planned backend webhook/reconciliation schedules.
7. **Network failure before expiry:** continue paid use from the still-valid saved verification. A failed network check alone must not close paid navigation before its verified expiry.
8. **At the saved expiry:** require an online check before continuing paid use, regardless of the five-minute refresh threshold. A verified renewal updates the saved expiry and extends access; otherwise paid features remain locked. Do not invent an offline grace period or assume an unverified renewal. Existing local reps and submitted reflections remain saved.
9. **Upload earlier reps after expiry:** automatically upload reps recorded while verified access was valid, with authentication and ownership checks, even after access expires. Do not let a current-paid-access requirement prevent these earlier records from synchronizing. Separate earlier-upload eligibility from unlocking new paid activity, and finalize the server-side eligibility representation during implementation. Preserve dependent submitted reflection uploads under the completion/reflection ordering rules.

## Implement

For every code slice, write/run relevant tests and verify affected UI in the in-app browser, honoring the owner's side-panel preference when considering any browser fallback. Native sandbox purchase/restore verification is additionally required where a browser cannot establish store behavior. This plan records work; it does not claim those checks passed.

1. **Establish the billing baseline and configuration.** Read the Phase 07 handoff, verify its access/eligibility seams and preserved local records, and complete the App Store Connect/RevenueCat setup begun in Phase 01. Verify current compatible native SDKs, provider contracts, sandbox/environment isolation, account/customer binding and production scheduler/queue limits before adding dependencies or enabling live integrations. Reuse Phase 07 resource-only conventions.
   **Verify:** products/entitlements/customer IDs map correctly without secrets in source/docs; no production fixture bypass; the baseline and remaining native/staging gates are recorded.

2. **Implement verification contracts, storage and provider coverage.** Add the shared access/read/verification schemas, account-scoped `:access` hydration, provider adapters and billing customer/subscription/entitlement/event schema/migrations. Preserve server-verified subscription coverage for earlier valid-access uploads. Introduce shared short-lived refresh claims/fencing across immediate, job and reconciliation paths; fetch provider state outside database transactions. Connect Phase 07's authenticated eligibility seam to real verified coverage.
   **Verify:** forged client access flags, wrong ownership/account, failed provider calls, interrupted commits and stale concurrent responses cannot grant or regress access; existing journal entries survive unavailable/revoked access; earlier completed reps and dependent reflection uploads retain eligibility after expiry. Reported starts outside verified account coverage or implausibly in the future are rejected, while valid earlier starts are accepted regardless of delayed upload; deliberate offline backdating retains the explicitly accepted trust limitation.

3. **Implement native purchases and the nine subscription rules.** Finish App Store Connect/RevenueCat product configuration, stable customer mapping, paywall, purchase/restore/management controls and server provider verification. Implement persisted status/expiry/check time, immediate unexpired hydration, event-driven five-minute refresh and exact expiry locking. Record server-verified coverage and connect the earlier-rep upload boundary so expiry does not strand valid existing records. Keep purchase/restore verification pending states distinct from quiet journal uploads.
   **Verify:** sandbox purchase/restore/cancel/expire/refund and recovered account mapping work; restoring into a different app account refreshes source and destination billing state without exposing private history or reassigning earlier pending uploads/coverage; recovery into the original account retains its mapping; five minutes passing causes no request/block; network failure before expiry does not close access; purchase/restore bypasses the threshold; expiry requires renewal verification; earlier authenticated owner-checked reps/reflections upload afterward; an old account response or forged client premium flag cannot unlock another account.

4. **Implement durable billing delivery and scheduled repair.** Add customer/subscription/entitlement/event data, authenticated webhook receipt, QStash publication/signed handling and shared fenced provider refresh. Implement the existing five-minute repair/targeted reconciliation and daily rotating scan with bounded work, checkpoints, claim expiry, exhaustion/missed-run alerts and replay. Check current provider quotas, SDK/cron eligibility and production costs before configuring live schedules.
   **Verify:** duplicate/out-of-order notifications, failed/lost publish acknowledgement, termination, unavailable database/provider, invalid signatures/environments, overlapping purchase/job/cron refreshes and stale claims cannot regress entitlements or falsely mark work processed. Missing notifications and interrupted/missed schedules resume from durable state.

5. **Verify integrated billing, reconcile its guidance and hand off.** Run all nine subscription checks plus the full Phase 07 offline recording/upload flow with real sandbox verification and controlled provider failures. Run affected workspace/database tests and browser/native checks; fix failures and repeat. Update billing/access sections of PRD, tech stack, decisions, app-shell/identity/setup guidance, handoff index to the implemented result; record outcomes in the handoff and change this plan only for scope or decision changes, preserving historical evidence and deferred release gates. Save `handoffs/phase-07a-billing.md` with exact mappings (no secrets), contracts/migrations, subscription/cache policy, queue/cron configuration, failure/replay runbook, test evidence and next steps.
   **Verify:** no valid earlier activity is stranded by expiry, no subscription failure deletes local history, immediate purchase verification does not wait for a queued job, and documentation distinguishes implemented behavior from pending native/staging release validation.

## Keep out

- No Stripe checkout, Redis, Celery, continuously running worker or generic idempotency/outbox table without a concrete need. Queue delivery is for backend billing work; phone reps/reflections retain Phase 07's AsyncStorage sender.
- No waiting for a queue to grant a verified purchase, client premium flags, private-history recovery from a receipt, or holding database transactions during provider calls.
- No reopening settled API/offline decisions or adding a multi-phone reflection conflict workflow. General analytics activation remains Phase 14; release deployment/submission remains Phase 13.

## Ready to hand off when

- [ ] Sandbox native purchase/restore/cancel/expire/refund works on iOS; successful payment uses immediate verification and never asks for duplicate purchase.
- [ ] All nine subscription rules pass automated/UI checks, including immediate saved access, event-only five-minute refresh, network failures before expiry, renewal checks at expiry and earlier-rep uploads after expiry without a new paid-access unlock.
- [ ] Duplicate/out-of-order events, failed/uncertain handoffs, termination, stale claims and overlapping refreshes cannot regress entitlements or lose business state.
- [ ] Missing notifications, exhausted delivery, overlapping/missed cron runs and full database outages recover or report honestly; alerts and plan/cost settings are recorded.
- [ ] Integrated Phase 07 recording/synchronization still passes with verified access and after expiry; account changes/revocation preserve pending data without granting unauthorized paid use. Purchase transfers refresh both affected billing accounts, keep private history separate and preserve original-account eligibility for earlier valid pending activity.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; update implemented billing guidance and the handoff index.

## Open gates for Phase 13

- Real sandbox/native purchase, restore, cancellation, expiry/refund, provider transfer and signed billing-delivery acceptance.
- Activate only after the free beta; complete before paid launch.
