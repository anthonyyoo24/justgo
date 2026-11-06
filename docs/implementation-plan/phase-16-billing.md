<a id="phase-16"></a>

# Phase 16 — Native subscriptions & reliable billing

**Status:** Local implementation prepared. Activation and external and native billing acceptance wait until after the free beta.

## Outcome

Verified native purchases unlock promptly. Still-valid saved verification permits offline paid use. Earlier valid-access activity can synchronize after expiry. Later subscription changes recover reliably.

## Decisions in force

- Dependencies: 07.5 and the completed Phase 07 umbrella acceptance checks.
- Acceptance: PRD AC-03, Tech acceptance 6 and 14–17, and all nine confirmed subscription rules below. After implementation, align older access-freshness requirements under the approved documentation sequence.
- Preserve the open [`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate).
- Provider: Superwall replaces RevenueCat (Anthony, October 28, 2026) because its subscription infrastructure has no revenue fee. Use JustGO's own billing screen, not Superwall paywalls. Superwall paywalls cost 1% of paywall-attributed revenue above US$10,000 a month. Paywall experiments need a separate decision from Anthony. Before activation, verify these:
  - A Superwall DPA.
  - Purchases and restores with `isExternalDataCollectionEnabled: false`.
  - Sandbox expiry, grace, refund and restore through the compatible subscriber endpoint.
  - Webhook signature and replay handling.

  If a check fails, ask Anthony before reverting to RevenueCat.

1. **First use:** successfully verify subscription access through the API before unlocking paid features. A missing verification cannot unlock first use offline.
2. **Remember verification:** persist the API-verified status, expiry and last successful check time on the phone, scoped to the account. When the account changes, clear or switch the applicable snapshot. Do not reuse another account's access, and do not treat an invented client premium flag as verification.
3. **Immediate access:** when the app opens, hydrate and use still-valid saved verification immediately, including offline. Access validity depends on the verified expiry. It does not depend on a one-minute freshness cutoff or on whether a background query has an error.
4. **Background refresh:** on app opening, foreground return or reconnection, check when verification is missing or the last successful check is more than five minutes old. When online, refresh without delaying access that an unexpired saved verification supports. Successful checks update the persisted information. Coalesce overlapping event triggers. Missing verification stays locked until verified. A network failure must not replace a still-valid saved verification with an unavailable result.
5. **Purchase/restore:** verify through the API immediately after a purchase or restore. This check bypasses the five-minute refresh threshold. Preserve the existing honest pending behavior for purchase and restore. The no-network-save-state decision concerns completion and reflection uploads, not payment verification.
6. **No constant polling:** remove the current 30-second mobile access requests and the one-minute freshness-based access cutoff. Five minutes passing alone triggers neither a request nor an access block. This mobile policy does not remove the separately planned backend webhook and reconciliation schedules.
7. **Network failure before expiry:** continue paid use from the still-valid saved verification. A failed network check alone must not close paid navigation before its verified expiry.
8. **At the saved expiry:** require an online check before paid use continues, regardless of the five-minute refresh threshold. A verified renewal updates the saved expiry and extends access. Without one, paid features stay locked. Do not invent an offline grace period or assume an unverified renewal. Expiry has no exception for finishing an in-progress challenge or its reflection (Anthony, September 21, 2026). The free-beta rule that lets an admitted challenge finish does not carry over to paid access. Existing local reps and submitted reflections stay saved.
9. **Upload earlier reps after expiry:** automatically upload reps recorded while verified access was valid, with authentication and ownership checks, even after access expires. Do not let a current-paid-access requirement stop these earlier records from synchronizing. Keep earlier-upload eligibility separate from unlocking new paid activity. Finalize the server-side representation of eligibility during implementation. Preserve dependent submitted reflection uploads under the completion and reflection ordering rules.

## Implement

For every code slice, write and run relevant tests and verify affected UI in the in-app browser. Honor the owner's side-panel preference when considering any browser fallback. Where a browser cannot establish store behavior, native sandbox verification of purchase and restore is also required. This plan records work. It does not claim those checks passed.

1. **Establish the billing baseline and configuration.** Verify Phase 07's access and eligibility seams and preserved local records. Complete the App Store Connect and Superwall setup (Superwall replaces RevenueCat, as the provider rule above says). Before adding dependencies or enabling live integrations, verify current compatible native SDKs, provider contracts, sandbox and environment isolation, account-to-customer binding, and production scheduler and queue limits. Reuse Phase 07 resource-only conventions.
   **Verify:** products, entitlements and customer IDs map correctly, with no secrets in source or docs. No production fixture bypass exists. The baseline and the remaining native and staging gates are recorded.

2. **Implement verification contracts, storage and provider coverage.** Add the shared access, read and verification schemas, account-scoped `:access` hydration, provider adapters, and the billing customer, subscription, entitlement and event schema and migrations. Preserve server-verified subscription coverage for earlier valid-access uploads. Introduce shared short-lived refresh claims and fencing across the immediate, job and reconciliation paths. Fetch provider state outside database transactions. Connect Phase 07's authenticated eligibility seam to real verified coverage. When the billing tables join `apps/api/src/db/schema.ts`, split it into `schema/identity.ts`, `schema/catalog.ts`, `schema/activity.ts`, `schema/billing.ts` and an `index.ts`. Point `drizzle.config.ts` at the folder, and confirm that the split alone generates no migration [FS-9].
   **Verify:** forged client access flags, wrong ownership or account, failed provider calls, interrupted commits and stale concurrent responses cannot grant or regress access. Existing journal entries survive unavailable or revoked access. Earlier completed reps and dependent reflection uploads retain eligibility after expiry. The server rejects reported starts outside verified account coverage or implausibly in the future. It accepts valid earlier starts regardless of delayed upload. Deliberate offline backdating keeps the explicitly accepted trust limitation.

3. **Implement native purchases and the nine subscription rules.** Finish the App Store Connect and Superwall product configuration, stable customer mapping, paywall, purchase, restore and management controls, and server provider verification. Implement the persisted status, expiry and check time, immediate unexpired hydration, event-driven five-minute refresh and exact expiry locking. Record server-verified coverage and connect the earlier-rep upload boundary so expiry does not strand valid existing records. Keep pending states for purchase and restore verification distinct from quiet journal uploads.
   **Verify** these behaviors:
   - Sandbox purchase, restore, cancel, expire and refund work, and so does recovered account mapping.
   - Restoring into a different app account refreshes source and destination billing state without exposing private history or reassigning earlier pending uploads or coverage.
   - Recovery into the original account retains its mapping.
   - Five minutes passing causes no request or block.
   - Network failure before expiry does not close access.
   - Purchase and restore bypass the threshold.
   - Expiry requires renewal verification.
   - Earlier authenticated, owner-checked reps and reflections upload afterward.
   - An old account response or a forged client premium flag cannot unlock another account.

4. **Implement durable billing delivery and scheduled repair.** Add customer, subscription, entitlement and event data, authenticated webhook receipt, QStash publication with signed handling, and shared fenced provider refresh. Implement the existing five-minute repair and targeted reconciliation, and the daily rotating scan. Give them bounded work, checkpoints, claim expiry, alerts for exhaustion and missed runs, and replay. Before configuring live schedules, check current provider quotas, SDK and cron eligibility, and production costs.
   **Verify:** none of these can regress entitlements or falsely mark work processed: duplicate or out-of-order notifications, a failed or lost publish acknowledgement, termination, an unavailable database or provider, invalid signatures or environments, overlapping purchase, job and cron refreshes, and stale claims. Missing notifications and interrupted or missed schedules resume from durable state.

5. **Verify integrated billing, reconcile its guidance.** Run all nine subscription checks and the full Phase 07 offline recording and upload flow, with real sandbox verification and controlled provider failures. Run the affected workspace and database tests and the browser and native checks. Fix failures and repeat. Update the billing and access sections of the PRD, the tech stack, and the app-shell, identity and setup guidance to the implemented result. Change this plan only for scope or decision changes, and keep deferred release gates as `gate` issues. Put exact mappings without secrets, contracts and migrations, subscription and cache policy, queue and cron configuration, and the failure and replay runbook in the owning operations or architecture docs. Put test evidence in the PR descriptions.
   **Verify:** expiry strands no valid earlier activity, no subscription failure deletes local history, immediate purchase verification does not wait for a queued job, and the documentation distinguishes implemented behavior from pending native and staging release validation.

## Keep out

- No Stripe checkout, Redis, Celery, continuously running worker, or generic idempotency or outbox table without a concrete need. Queue delivery is for backend billing work. Phone reps and reflections keep Phase 07's AsyncStorage sender.
- No waiting for a queue to grant a verified purchase, no client premium flags, no private-history recovery from a receipt, and no holding database transactions during provider calls.
- No reopening settled API and offline decisions, and no multi-phone reflection conflict workflow. General analytics activation remains Phase 17. Release deployment and submission remain Phase 14.

## Ready to hand off when

- [ ] Sandbox native purchase, restore, cancel, expire and refund work on iOS. A successful payment uses immediate verification and never asks for a duplicate purchase.
- [ ] All nine subscription rules pass automated and UI checks. These include immediate saved access, event-only five-minute refresh, network failures before expiry, renewal checks at expiry, and earlier-rep uploads after expiry without a new paid-access unlock.
- [ ] Duplicate or out-of-order events, failed or uncertain handoffs, termination, stale claims and overlapping refreshes cannot regress entitlements or lose business state.
- [ ] Missing notifications, exhausted delivery, overlapping or missed cron runs and full database outages recover or report honestly. Alerts and the plan and cost settings are recorded.
- [ ] Integrated Phase 07 recording and synchronization still pass with verified access and after expiry. Account changes and revocation preserve pending data without granting unauthorized paid use. Purchase transfers refresh both affected billing accounts, keep private history separate, and preserve original-account eligibility for earlier valid pending activity.
- [ ] Deleting an account with an active sandbox subscription removes the billing provider's customer data, and the deletion flow still explains that deleting does not cancel the Apple subscription.
- [ ] Record exact changes, issues and fixes, and test evidence in the PR descriptions. File remaining gates as `gate` issues, and update implemented billing guidance.

## Open gates for Phase 14

- Real sandbox and native acceptance of purchase, restore, cancellation, expiry and refund, provider transfer, and signed billing delivery.
- Activate only after the free beta. Complete before paid launch.
