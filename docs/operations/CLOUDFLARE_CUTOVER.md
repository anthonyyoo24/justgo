# Cloudflare cutover and acceptance

The local Hono/Workers candidate does not move the deployed Vercel API, change
installed clients, enable backups or publish notices. The
[Phase 15 handoff](../handoffs/phase-15-cloudflare-api.md) owns evidence and open
gates; [server releases](SERVER_RELEASES.md) owns the reviewed deployment lane.

## Account and service preparation

1. Anthony confirms the customer/account and Cloudflare DPA version/applicability
   for Workers, Hyperdrive and R2. Anthony subsequently signed in on October 28;
   authenticated inspection confirmed Workers Free, existing R2 activation and
   no Worker/Hyperdrive resources. Anthony then separately approved the empty
   private `justgo-staging-backups` bucket, which was created and verified.
   No agreement was accepted by the agent; customer/DPA approval and the
   remaining JustGO setup remain separate gates.
2. Separately approve initial Worker/bootstrap, R2 payment-method/service setup,
   restricted credentials and the [backup policy](CLOUDFLARE_BACKUPS.md). Start
   with Workers Free. Do not create a paid subscription implicitly.
3. Use separate staging and production Workers, Hyperdrive configurations and
   credentials. Configure the direct Supabase restricted role as the
   `LOCK_DATABASE_URL` secret; all other data requests use `HYPERDRIVE` with
   caching disabled. The direct connection preserves advisory-lock transactions
   unsupported by Hyperdrive. Keep verified TLS, the five-connection Hyperdrive
   soft limit, transaction-local account context and five-second statement limits.
4. Configure existing Auth/deletion and Sentry secrets with `wrangler secret`.
   Do not put secrets in Wrangler JSON, shell arguments, CI artifacts or mobile.
   Disable automatic request logs, Logpush and tails. The application rebuilds
   safe console/Sentry events and does not log raw URLs, credentials or journals.
5. Approve the initial baseline Worker separately. The ordinary release lane
   requires a known existing baseline and stops on an unknown latest version.
   Then use the protected lane to upload/probe a no-traffic candidate and promote
   one exact version. Do not point clients at an ad hoc development upload.

The reviewed candidate target is
`https://justgo-api-staging.anthonyyoo24.workers.dev`, based on the verified
account subdomain and fixed staging Worker name. Beta configuration now selects
that exact origin, but no Worker/Hyperdrive deployment or hosted acceptance is
recorded. The protected local bootstrap credential is separate from the eventual
release and backup credentials; consult the handoff for its current status and
expiry before setup.

## Hosted measurements and recovery acceptance

Record source/version, plan, region, sample size, warm/cold distribution and
concurrency. Run a bounded disposable cohort against both approved origins;
include health/readiness, guest catalog, managed exchange, authenticated history,
completion, journal upload/download and deletion. Do not send private fixtures
or real journal bodies through the old Vercel API. Use synthetic content only
under a separately approved hosted rehearsal with run-owned cleanup.

Measure end-to-end p50/p95 per route and obtain actual Worker CPU from Cloudflare
analytics; wall time or local workerd is not CPU evidence. Check transaction
rollback, owner isolation, concurrent exchange/lock behavior, cancellation and
`statement_timeout` under hosted Hyperdrive, plus aggregate direct/Hyperdrive
connections. Local emulation cannot establish hosted pooling behavior.

[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
currently includes 100,000 daily Free requests and 10 ms CPU per invocation;
Paid starts at US$5/month and requires approval. Check the separate
[Hyperdrive allowance](https://developers.cloudflare.com/hyperdrive/platform/pricing/)
and [R2 storage/operation pricing](https://developers.cloudflare.com/r2/pricing/)
against measured traffic, encrypted snapshot sizes and retained ledger volume.
Assign Anthony usage/budget alerts before activation; free allowances are not a
zero-cost guarantee. Supabase Free upgrade triggers remain in the phase plan.

Run an actual scheduled nightly dump and hourly ledger upload with immutable
readback, failed/missed-run alerts and tested key retrieval. Rehearse a current
full hosted app/Auth dump in isolated local Postgres, including required Auth
roles/extensions/ACLs. The synthetic rehearsal is regression evidence, not that
provider-specific acceptance. Establish a writer-fenced current ledger including
Auth activity before reopening a restore. A missing post-copy ledger leaves the
service closed; accept that availability tradeoff explicitly or approve a
separate durable deletion design before external use.

## Mobile, notices and old-build retirement

1. Review the [transition notice candidate](../legal/CLOUDFLARE_NOTICE_REVIEW.md),
   which names both Cloudflare and Vercel while old builds still use Vercel.
   Approve the complete text/date and separately authorize legal-site publication
   once its described services are operating. The static Worker config keeps
   `/privacy/` and `/terms/` stable; verify their actual HTTPS contents anonymously.
   Retention wording waits for approved policy and verified scheduled copies.
2. Accept the actual staging Worker before building the candidate already
   configured for its exact origin. Update EAS preview
   `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_TERMS_URL` to the verified
   Cloudflare legal addresses, and the protected
   `BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION` to the exact published Privacy
   version. The beta guard requires the Privacy source's approved metadata and
   explicit Cloudflare host marker. Preserve the fixture public-environment
   adapter and request-origin fence.
3. Separately authorize the exact-source TestFlight build and upload. Verify
   the physical iPhone smoke, account continuity, offline journal, managed
   sync/deletion and legal links; preserve Phase 14's explicit device deferrals
   until actual evidence or owner disposition. No deliberate crash test or
   simulator CI is added. Use `diagnostics=true` for both build and submit to
   retain build 5's approved essential-error reporting; the workflow's default
   remains off. Follow the exact artifact checks in [TestFlight beta](TESTFLIGHT_BETA.md).
4. Proposed internal-only retirement window: retire build 5 within seven days
   after the replacement passes owner acceptance. This is a proposal, not an
   approved deadline. Confirm all old internal builds are expired/removed and
   users have installed the replacement before declaring private traffic moved.
   Include the separate installed Dev build and its Vercel-pinned configuration
   in this inventory; migrating beta alone does not retire Dev account traffic.
   Resolve a separate Dev migration or retirement before claiming that all
   private traffic has moved.
   Aggregate old-route traffic evidence must establish that payloads stopped
   reaching Vercel. Running both APIs, returning an error or redirecting requests
   through Vercel does not establish this.
5. Obtain separate Vercel API retirement approval, then remove its credentials,
   deployment config and obsolete tooling. Old legal URLs may continue serving
   static content or redirect under an approved disposition. Keep Vercel's
   legal-hosting role in the notice for as long as those addresses remain in use;
   approve its final removal only after both provider roles have ended.
   Update Sentry uptime
   monitor 10773615 and the manual readiness workflow to the actual Worker
   `/ready`, then verify failure/recovery delivery. The existing monitor continues
   checking the deployed Vercel service until this switch is approved.

External testers remain blocked until these Phase 15 gates and the independent
Phase 14 privacy/device decisions have recorded outcomes. No Git publication,
deployment, new native build, purchase or invitation is authorized by this guide.
