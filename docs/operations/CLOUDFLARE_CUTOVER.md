# Cloudflare cutover and acceptance

The staging Worker and Hyperdrive exist. The
[Phase 15 handoff](../handoffs/phase-15-cloudflare-api.md#current-status)
owns current release source, tag, CI, run, deployment/version and probe evidence.
Reconfirm the serving/latest baseline before an ordinary release; do not reuse
the consumed four-version incident opt-in. For uncertain outcomes, follow
[server releases](SERVER_RELEASES.md#failures-and-uncertain-outcomes).

Real Apple/Google sign-in, account synchronization/deletion, full-workload
performance and replacement native-build/iPhone acceptance remain open. The Sentry
uptime monitor now targets Cloudflare and normal checks pass; failure/notification
delivery remains unverified. Public route timing and active-version CPU chart
readbacks are recorded in the handoff. Anthony
confirmed there are no actual app users and selected a full Cloudflare switch,
with no external-user transition period. Existing owner-only binaries still
contain Vercel addresses until replaced or retired. The next public notice names
Cloudflare only, after Vercel API and legal hosting have ended. Scheduled backups,
actual hosted recovery-copy decryption, complete recovery/alerts/expiry and
account/privacy gates remain open. Anthony accepts protected Mac key custody
locally outside CI, without a USB-retrieval prerequisite, and owns manual
credential renewal. Backups and the proposed notice are not activated/published.
No Cloudflare email correspondence was sent. The
[October 31 decision](../DECISIONS.md#october-31-local-recovery-key-custody-and-coordinated-cutover)
also accepts the brief legal-URL gap in the prepared coordinated cutover below.
The handoff also owns current approval evidence; [server releases](SERVER_RELEASES.md)
owns the guarded lane.

## Account and service preparation

1. Anthony confirms the customer/account and Cloudflare DPA version/applicability
   for Workers, Hyperdrive and R2. Anthony subsequently signed in on October 28;
   authenticated inspection confirmed Workers Free and existing R2 activation.
   Subsequent authorized setup created the staging Worker, Hyperdrive and private
   `justgo-staging-backups` bucket; do not repeat initial resource creation.
   Personal customer Youngshin Yoo is confirmed. The account Configurations page
   now supplies a DPA-incorporation notice and links to v6.4; no separate
   acceptance action was shown. The [notice review](../legal/CLOUDFLARE_NOTICE_REVIEW.md)
   records that evidence and the unresolved SSA §6.1/PIPEDA scope question.
   Anthony requested further work October 30; no Cloudflare contact is authorized.
2. Initial bootstrap, restricted credentials and seven-day staging backup
   retention/protection/expiry have their recorded approvals and evidence in the
   [handoff](../handoffs/phase-15-cloudflare-api.md). Resolve the remaining
   [backup policy](CLOUDFLARE_BACKUPS.md) renewal and operational gates
   before their dependent actions. Workers Free remains selected; no paid
   subscription is implied.
3. Use separate staging and production Workers, Hyperdrive configurations and
   credentials. The merged compatibility fix routes managed requests and retained
   existing-proof recovery through `HYPERDRIVE`, with unique mapping/owner locks
   instead of unsupported advisory locks. `LOCK_DATABASE_URL` remains a validated
   origin reference, not a working custom-CA Worker socket; direct transport is
   retained for the loopback legacy fixture and separate release migrator only.
   Keep caching disabled, verified Hyperdrive origin TLS, the five-connection
   soft limit, transaction-local account context and five-second statement limits.
4. Configure existing Auth/deletion and Sentry secrets with `wrangler secret`.
   Do not put secrets in Wrangler JSON, shell arguments, CI artifacts or mobile.
   Disable automatic request logs, Logpush and tails. The application rebuilds
   safe console/Sentry events and does not log raw URLs, credentials or journals.
5. The initial Worker already exists. For future releases, obtain the owner's
   specific merge/tag disposition and use the ordinary protected lane against its verified
   baseline; it stops on an unknown latest version. Upload/probe a no-traffic
   candidate and promote one exact version. Do not repeat bootstrap or point
   clients at an ad hoc development upload.

The fixed staging origin is
`https://justgo-api-staging.anthonyyoo24.workers.dev`, based on the verified
account subdomain and fixed staging Worker name. Beta configuration selects that
exact origin. Require provider readback of routes/previews, disabled telemetry/
caching, origin TLS and the five-connection limit, plus public health/readiness
and unauthenticated private-route probes. Consult the handoff for actual release
acceptance and current credential status/expiry before use.

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
October 31 public probes and the active-version CPU chart exceed the Free CPU
budget; the handoff records their limits. Anthony chose to keep Workers Free;
checkout was exited without purchase. Resolve Free-plan workload suitability;
no paid subscription has been enabled.

Run an actual scheduled nightly dump and hourly ledger upload with immutable
readback, failed/missed-run alerts and actual hosted recovery-copy decryption
using the protected local key. A read-only hosted
`justgo`/`auth`/`drizzle` archive has passed isolated PostgreSQL 17 compatibility
restoration with preserved ACLs and verified private session-helper ownership/access;
it is not a writer-fenced recovery rehearsal or hosted provider acceptance.
Establish a current writer-fenced ledger including Auth activity and verify
deletion/revocation reconciliation before reopening restored account/data state.
Anthony already accepted the small-beta limit: if the post-copy deletion record
cannot be established, that old state stays closed. Independent deletion/revocation
recording is deferred, with reassessment required before paid launch or beta
expansion, whichever comes first. A clean restart remains possible, but automatic
recovery from old phones is unsupported.

## Mobile, notices and old-build retirement

1. Before retiring Vercel, accept the healthy Cloudflare Worker and backup
   operation, resolve applicable account/privacy requirements, and finish the
   [full-cutover notice package](../legal/CLOUDFLARE_NOTICE_REVIEW.md). Complete
   final date/version approval, publication and verification authorization, and
   legal-artifact preflight with the Cloudflare host marker. The complete Privacy
   wording, including retention, is already approved; its operational claims
   still require verified copies. Prepare the publication commands, verification
   steps and ASC/EAS URL updates using the complete rendered package in ignored
   `.local/phase15-cloudflare/rollout/notice-review/`.
   Prepare the replacement-build path before entering the retirement window:
   review the exact candidate and its main-CI/tag requirements, and validate the
   `beta-diagnostics` profile and actual resolved API/app-identity inputs.
   Separately prepare and review the candidate Cloudflare Privacy/Terms URLs
   with the legal package; live EAS legal variables remain unchanged until the
   URLs are verified after publication in step 3. Verify approved Expo/Apple access,
   frozen managed signing and pinned toolchain readiness. Prepare the protected
   workflow's exact build/submit inputs and artifact-provenance checks. Record
   evidence for these publication-independent checks; do not retire Vercel while
   preparation is incomplete. Final diagnostics preflight and the signed build
   still wait for actual notice publication in steps 3–4: never set a publication
   attestation early or disable diagnostics to bypass that gate.
   Inventory the owner-only
   TestFlight and Dev builds and their embedded API/legal addresses. Preserve
   owner device-local writing before build removal; no accounts or journals may
   be deleted merely because there are no external users. Keep Vercel serving
   until these prerequisites are ready.
2. In the prepared coordinated cutover, stop and retire the old
   owner-only builds, end Vercel API and legal hosting/addresses, and verify that
   no app payloads reach Vercel. An installed binary retains its embedded URLs;
   running two APIs, responding with errors or redirecting requests does not
   prove private traffic stopped. No legacy redirects or compatibility window
   are selected. Anthony accepts the brief legal-URL gap between Vercel
   retirement and verified Cloudflare publication/ASC URL updates. Existing
   conditional retirement approval remains subject to step 1; this document
   update performs no retirement or publication.
3. Immediately after Vercel's roles end, publish the approved complete Privacy
   text and unchanged Terms on Cloudflare, then verify anonymous HTTPS contents
   at `/privacy/`, `/terms/` and the root. Update App Store Connect's Privacy URL
   and EAS preview `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_TERMS_URL`,
   plus the protected `BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION`,
   to the actual verified Cloudflare destinations/version. Preserve approved
   source metadata, the Cloudflare host marker and fixture-origin safeguards.
4. After step 3, pass the complete diagnostics
   [beta preflight](TESTFLIGHT_BETA.md#preflight-and-release-procedure) using the
   actual published notice version, then build/upload the already conditionally
   authorized replacement TestFlight artifact pointing only to the accepted
   Cloudflare API and legal URLs. Pre-retirement preparation is not a completed
   signed build or phone acceptance. Internal
   upload precedes phone acceptance. Verify iPhone smoke, account continuity,
   offline journal, managed sync/deletion and legal links; preserve independent
   Phase 14 device deferrals until evidenced or expressly disposed of. Use
   `diagnostics=true` for both build and submit, retaining build 5's approved
   essential-error reporting. Add no deliberate crash test or simulator CI.
   Follow exact artifact checks in [TestFlight beta](TESTFLIGHT_BETA.md).
5. After the pre-publication retirement checks above, remove retired Vercel
   credentials, deployment configuration and obsolete tooling;
   keep historical receipts. Sentry uptime monitor 10773615 and the matching
   manual readiness workflow target Cloudflare `/ready`; normal checks pass and
   GitHub notification delivery is verified. The
   [Phase 15 handoff](../handoffs/phase-15-cloudflare-api.md#current-status)
   records final evidence. Sentry Cron delivery remains unverified. Run the
   authorized controlled backup-alert drills when their operating prerequisites
   are ready;
   do not start live missed-backup expectations while schedules remain off. The
   no-contact instruction applies to Cloudflare correspondence. Complete the
   replacement phone checks before external distribution; there is no deferred
   Vercel retirement date.

External testers remain blocked until these Phase 15 gates and the independent
Phase 14 privacy/device decisions have recorded outcomes. No Git publication,
deployment, new native build, purchase or invitation is authorized by this guide.
