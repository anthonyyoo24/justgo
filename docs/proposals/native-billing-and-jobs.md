# Native billing and managed jobs proposal

**Status:** Not implemented. [Phase 16](../implementation-plan/phase-16-billing.md)
owns acceptance and activation. This document keeps the technical design. It
does not establish purchased access, provider integration, or hosted scheduling.
Revalidate provider SDKs, quotas, prices, and policies before implementation.

**Provider change:** [Phase 16](../implementation-plan/phase-16-billing.md) uses
Superwall instead of RevenueCat (Anthony, October 28, 2026). RevenueCat names
below describe the original design. Apply the same rules through Superwall's
compatible subscriber endpoint, signed webhooks, and Expo SDK, with its
pre-activation checks.

[APP_SHELL.md](../architecture/APP_SHELL.md#access-verification) describes the
current access boundary. Account activity uploads keep their own phone journal
and sender. Billing jobs do not replace them.

## Planned billing persistence

| Table                            | Main fields                                                                                                                                                                                                                                                                        | Relationship or rule                                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `billing_customers`              | `user_id`, RevenueCat ID, optional Stripe customer ID, last and next verification timestamps, verification dispatch status and message ID, refresh claim token, generation, and expiry                                                                                             | Unique provider bindings created before purchase. Supports reconciliation even when no webhook was recorded, and coordinates concurrent refreshes. |
| `subscriptions`                  | `id`, `user_id`, provider, provider subscription or transaction ID, product, status, period end, environment                                                                                                                                                                       | Preserve separate Apple, Google, and Stripe subscriptions. Never collapse them into one boolean.                                                   |
| `entitlements`                   | `user_id`, entitlement key, active state and expiry, verification timestamp                                                                                                                                                                                                        | Rebuildable projection of verified RevenueCat state that API guards use                                                                            |
| `billing_events`                 | provider, provider event ID, environment, customer reference, allowlisted replay data, received and processed timestamps, processing status, processing attempt count, dispatch status and claim expiry, QStash message ID, last and next dispatch timestamps, redacted error code | Unique pair of provider and event ID. Durable receipt and business outcome. Dispatch fields recover failed or uncertain QStash handoffs.           |
| `idempotency_records` (optional) | `user_id`, endpoint, request key, payload digest, stored result                                                                                                                                                                                                                    | Add only when existing records cannot identify an action or preserve its required retry result. The same key with a different payload is rejected. |
| `checkout_sessions` (optional)   | `id`, `user_id`, provider session ID, approved price, status, expiry                                                                                                                                                                                                               | Bind web checkout to the authenticated app account without asking the browser to log in                                                            |

Safe retries are required. A separate table of request receipts is not. Use the
completed-attempt UUID for creation replay and targeted PATCH receipts for
explicit reflections. Phase 16 will use provider event IDs for duplicate billing
notifications. Reuse backend retry-handling logic across applicable operations.
Do not create `idempotency_records` until an operation requires it, and do not
record every API request there.

QStash is selected for billing jobs. `billing_events` is the durable billing
receipt and handoff record. QStash manages delivery attempts, and PostgreSQL
records whether the business update succeeded. A generic `outbox_jobs` table, a
Redis service, a Celery installation, and a continuously running worker server
are not required. Other features can reuse QStash when they have a concrete need
for deferred work, as Managed delivery and recovery below describes.

## Managed delivery and recovery

A job is a task, and its handler is our processing code. QStash stores a pending
delivery and calls a protected HTTP endpoint in the same Fastify API deployed on
Vercel. Vercel runs the TypeScript handler when called. Upstash operates QStash,
so we do not deploy a separate Redis instance or continuously running worker
server. This design supports short tasks that need reliable retries as well as
deferred work. [QStash overview](https://upstash.com/docs/qstash/overall/getstarted).

| Action                                                | Initial execution model                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Completed reps and explicit reflections               | Phone journal first, then an ordered background HTTP sender. No QStash job or server upload outbox.                                    |
| Deferred onboarding                                   | Its future API transaction policy is approved separately                                                                               |
| Custom reflection dictation (deferred)                | Foreground speech recognition when implemented. No background queue needed.                                                            |
| Future text coach reply                               | Interactive streaming request. An ordinary reply needs no queue.                                                                       |
| Purchase and restore access verification              | Immediate authenticated API request to verify RevenueCat state. Do not wait for a queue or scheduled recovery.                         |
| Subscription notifications                            | Durable event receipt, then QStash delivery to our Vercel handler                                                                      |
| Billing handoff repair and missed-notification checks | Vercel Cron selects due records and accounts. QStash delivers the individual refresh jobs.                                             |
| Product analytics after onboarding acceptance         | Accepted-scope, best-effort delivery with stable event IDs. No queue required.                                                         |
| Deletion and retention                                | Bounded operations or provider retention settings. If vendor cleanup needs deferred retries, use QStash with a durable cleanup status. |

### Subscription-event flow

1. RevenueCat sends an event such as a renewal, expiration, or refund. The ingress endpoint authenticates the webhook and validates its environment and customer mapping. It then commits the event's unique provider and event reference and minimal replay context to `billing_events`. If durable capture fails, return a failure so the provider can retry.
2. Publish the stored event reference to QStash and await acceptance. Return a successful HTTP response to RevenueCat after QStash accepts the reference, or immediately if this event was already processed. A pending duplicate still needs a confirmed handoff. Do not discard it just because its database row exists. If publishing fails or its outcome is unknown, preserve the dispatch status and return a retryable failure. Recording the QStash message ID helps tracing, but a lost acknowledgement can still cause duplicate delivery.
3. QStash calls our billing-job endpoint. Verify its delivery signature with the SDK and the raw request body, load the event from PostgreSQL, and fetch the customer's current subscription state from RevenueCat. Keep queue payloads to references and job metadata. Exclude reflection text, audio, payment details, and credentials. Publishing credentials stay on the server. [QStash security](https://upstash.com/docs/qstash/features/security).
4. In a short transaction, save the verified subscription and entitlement projection and mark the event processed together. Return HTTP success to QStash only after that transaction commits, or when an already-processed duplicate needs no work. A temporary failure returns a non-success response so QStash can retry with backoff. Configure and test the delivery timeout, the retry count and delays, and exhausted-retry handling explicitly. [QStash retries](https://upstash.com/docs/qstash/features/retry).

These are subscription-state notifications. The stores and payment providers handle customer card charges, not our queue. Fetching the current RevenueCat state stops an old event from being applied blindly as the newest subscription state. A cancellation request does not necessarily end access immediately. Use the verified entitlement and expiry.

QStash delivers at least once, so database constraints and idempotent processing stay necessary. Use an expiring, per-customer refresh claim in PostgreSQL, with a generation token for fencing, across **all** refresh paths: jobs, immediate purchase checks, and reconciliation. Acquire the claim in a short transaction, release the connection before the provider call, and allow only the current claim holder to commit its result. Claim expiry allows recovery after a function terminates. Fencing rejects late results from an expired holder. An overlapping refresh retries or reloads fresh verified state. The claim and its fencing stop concurrent fetches from overwriting a newer projection with an older response. [Delivery guarantees](https://upstash.com/docs/qstash/features/at-least-once).

Set a shared QStash flow-control key for billing work, with measured concurrency and rate limits that leave database and provider capacity for interactive requests. QStash automatically starts eligible waiting deliveries within those limits. Its short deduplication window does not replace permanent provider-event uniqueness. After exhausted retries, alert on the failed delivery, retain the unresolved business record, and support replay after diagnosis. Observe the plan's dead-letter retention rather than treating that queue as permanent storage. [Flow control](https://upstash.com/docs/qstash/features/flowcontrol), [deduplication](https://upstash.com/docs/qstash/features/deduplication), [dead-letter queue](https://upstash.com/docs/qstash/features/dlq).

### Scheduled recovery and reconciliation

Implement both checks in Phase 16 before launch:

- **Handoff repair:** Initially, run a protected Vercel Cron endpoint every five minutes. It finds due unpublished or uncertain handoffs and confirmed stalled deliveries, and publishes a bounded batch of references to QStash. A pending job still within its normal retry schedule is not automatically republished every five minutes. Exhausted failures follow the alert-and-replay policy above. Use dispatch claims, next-dispatch timestamps, and a saved scan checkpoint so overlapping or interrupted runs cannot repeatedly flood the queue.
- **Provider reconciliation:** On that recovery cadence, enqueue targeted checks for stale, failed, recently purchased, or near-expiry accounts. Also run a daily rotating scan of known billing accounts with a saved checkpoint. Reconciliation asks RevenueCat for current state even when a notification never reached us and no `billing_events` row exists to retry. The customer mapping, created before purchase, makes those accounts discoverable. Track pending verification dispatches on the customer record, coalesce duplicate checks, and advance the freshness timestamp only after a successful verified update. Set batch sizes and the full-scan freshness target against provider quotas and measured account volume. Do not fetch every user's status every five minutes.

The five-minute interval is a recovery opportunity. It is not the normal purchase-access path or a guarantee during an outage. QStash cannot repair a job that was never successfully handed to it, and it cannot discover an entirely missing provider notification on its own. Scheduled runs can also fail, overlap, or be missed. Preserve checkpoints and claims, alert on missed scheduler heartbeats, and resume due work on the next run. [Vercel Cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

For this cadence, budget for a Vercel plan that supports frequent cron runs. Hobby restricts each cron job to once a day and is for personal, non-commercial use. During development, start with QStash's free allowance if it is enough. Then select a production plan from measured delivery attempts, retries, concurrency, and retention needs. QStash, Vercel execution, and PostgreSQL have separate usage limits, capacity limits, and costs. Nothing here implies unlimited scaling or a zero-configuration capacity guarantee. [Vercel Cron plans](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Hobby scope](https://vercel.com/docs/plans/hobby), [QStash pricing](https://upstash.com/pricing/qstash).

Do not treat an unawaited promise, an in-memory timer, or a post-response callback as durable execution. Other features can use this delivery infrastructure when needed. Weekly summaries, bulk exports, and queued AI replies are not assumed product requirements.

## Native purchase and restore

This section is the Phase 16 billing design, not implemented paid access. Use `react-native-purchases` and `react-native-purchases-ui` after account bootstrap or recovery, with the hard paywall before the paid app. Questionnaire onboarding remains deferred.

The current mobile guard still checks `/v1/access` every 30 seconds with a 60-second freshness window, and closes when a recheck fails. Production access returns unavailable until a verified provider reader is connected. The nine confirmed [Phase 16 subscription rules](../implementation-plan/phase-16-billing.md) will replace those current rules with:

- Persisted account status, expiry, and check time.
- Event-driven checks after five minutes.
- Valid saved access through network failures.
- Immediate purchase and restore checks.
- Online verification at expiry.
- Owner-checked earlier uploads.

Do not read Phase 07 local-saving acceptance as completed billing. Restore Purchases, subscription management, privacy and terms, recovery, and data controls stay reachable when unpaid.

After anonymous account bootstrap, configure RevenueCat with the backend-assigned stable customer ID. “No signup” does not mean RevenueCat must generate an unrelated identity on every installation. Both recovered iPhones use the same app account and billing mapping, and their sessions stay independent.

The app can show RevenueCat SDK purchase state promptly, but API premium guards use server-verified entitlements. After a purchase or restore, call an authenticated API endpoint that immediately fetches current subscription information **from RevenueCat** and updates PostgreSQL. Do not wait for a webhook, a QStash job, or a five-minute recovery run to unlock a successful purchase. Use short, bounded retries for temporary verification or save failures. Show an honest purchased-but-still-verifying state with retry and restore access. Never prompt the user to purchase again to fix synchronization. Never accept a client `is_premium` flag or a success URL as proof. Normal API guards can use sufficiently fresh stored verification rather than calling RevenueCat on every request. [RevenueCat customer information](https://www.revenuecat.com/docs/customers/customer-info).

**Immediate-access fallback to evaluate before enabling:** If authentication and account mapping still work, RevenueCat has just confirmed access on the server, and only saving the billing projection fails, evaluate authorizing the current operation from that fresh verified result while repair remains pending. Define a short freshness limit and test revocation and expiry handling before release. The fallback does not make an unavailable database usable for saving challenges or reflections, and it does not mark an unsaved billing update processed. Do not extend access indefinitely based on client state or an old successful check. If fresh verification is unavailable, report the temporary failure and provide a bounded retry path.

Authenticated webhooks feed the durable QStash flow in Managed delivery and recovery above for renewals, refunds, expirations, and other subscription changes. Keep pending and failed event records and periodic provider reconciliation even with managed delivery. Provider retries are useful but finite. [RevenueCat webhooks](https://www.revenuecat.com/docs/integrations/webhooks).

Use a restore policy that is compatible with accountless use, and test its transfer implications. Restoring a store purchase may restore paid access to a recovered or new app account. It must not automatically disclose a previous account's journal. Private history requires its recovery credential. Also prevent automatic billing alias or transfer events from silently merging private user records. [RevenueCat restore behavior](https://www.revenuecat.com/docs/projects/restore-behavior).
