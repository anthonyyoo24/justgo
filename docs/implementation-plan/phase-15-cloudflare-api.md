<a id="phase-15"></a>

# Phase 15 — Cloudflare API hosting & R2 backups

**Status:** Implementation merged; hosted rollout in progress. Hosted/privacy/device
acceptance remains open before outside testers store real journals. See the
[implementation handoff](../handoffs/phase-15-cloudflare-api.md).

## Outcome

The API runs on Cloudflare Workers with a Hono HTTP layer instead of Fastify on
Vercel. Encrypted nightly database backups and a frequent deletion-ledger copy in
Cloudflare R2 replace the planned Supabase Pro upgrade. The database stays on the
Supabase Free plan until an upgrade trigger below is reached.

## Decisions in force

- [October 28 decision](../DECISIONS.md#october-28-cloudflare-workers-hono-and-r2-backups):
  move off Vercel because its DPA prohibits sensitive data and Hobby bars commercial
  use. Fastify does not run on Workers, so the HTTP layer moves to Hono.
  The decision supersedes the October 27 hosting and Supabase Pro backup choices.
- Dependencies: Phase 14 internal beta and its delivered staging API. It must close
  before the Phase 14 external free beta; Phase 16 billing builds on the Hono API.
- Unchanged: Supabase Postgres and Auth (Canada Central), Drizzle schema and
  migrations, Zod contracts, domain services, `pg_cron`, Sentry projects and the
  mobile app apart from its API and legal-page addresses.
- Preserve the [identity boundary](../architecture/IDENTITY.md),
  [activity architecture](../architecture/ACTIVITY_DATA.md),
  [server release safeguards](../operations/SERVER_RELEASES.md) and the
  [backup restore checklist](../operations/FOUNDATION.md#backup-restore-checklist).
- Cost: start on Workers Free. Workers Paid (US$5/month) is expected if measured
  CPU exceeds 10 ms per request, and needs Anthony's approval. R2 stays within its
  10 GB free allowance, but enabling it requires a payment method on the account.
- No account creation, purchase, DNS change, deployment, migration, notice
  publication or Vercel deletion is authorized by the plan itself. Each needs
  Anthony's separate approval when reached.

## Remaining decisions and approvals

Workers/Hono, R2, nightly backups, hourly ledger copies, `age` encryption and
continued Supabase Free use are selected. Do not reopen those choices as
unanswered questions. Resolve the items below before their dependent action,
record the final choice and evidence in this phase's handoff, and preserve the
separate Git/release permissions. The implementation owner handles routine
engineering choices; bring Anthony concrete policy/cost/legal tradeoffs and
restricted actions, rather than asking for approval at every implementation step.

| Item                                         | What remains to be resolved                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Owner / completion point                                                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare account and DPA                   | Verify the actual customer/account and applicability of the reviewed DPA v6.4 to Workers, Hyperdrive and R2. Prepare any binding acceptance for Anthony; the public agreement alone is not account evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Implementation/privacy owner investigates; Anthony handles required acceptance before hosted private-data processing.                                                                               |
| Account setup, costs and operating budget    | Obtain the applicable account/R2 payment-method approval. Measure CPU, requests, Hyperdrive and storage/operation use against current included allowances; present any required Workers Paid or other paid-service choice with its actual cost. Set budget/usage-alert ownership. Free is the starting choice, not a guarantee of zero future charges. Supabase Pro is reconsidered only at the recorded triggers below.                                                                                                                                                                                                                                                       | Implementation owner prepares measurements; Anthony approves setup/spending before enabling the dependent service or paid plan.                                                                     |
| Backup retention and deletion                | The [October 30 decision](../DECISIONS.md#october-30-seven-day-staging-backup-retention) approves seven-day retention, protection and automatic expiry for both staging prefixes. API readback and parent-credential overwrite/DELETE rejection passed. Approved policy bytes/digest are stored, but workflow opt-in remains unset. Complete public Privacy wording is approved; actual asynchronous expiry, operational evidence, effective date, matching version and publication authorization remain open.                                                                                                                                                                 | Implementation owner verifies actual expiry and backup operation; Anthony/privacy owner owns separate notice publication approval.                                                                  |
| Backup reader authority                      | The [October 29 decision](../DECISIONS.md#october-29-dedicated-backup-reader) accepts supported project-wide read access and the staging-only DELETE exception for exactly `cron.job_run_details`. The reader is LOGIN-enabled and hosted metadata/access probes passed. Supabase has received the removal request; its response and removing the exception after verified grant removal remain open alongside backups.                                                                                                                                                                                                                                                        | Implementation owner verifies source publication before activation and owns the provider follow-up; the support response is not an activation prerequisite.                                         |
| Recovery goals and complete deletion records | The [October 29 decision](../DECISIONS.md#october-29-small-beta-recovery-limit) accepts keeping unverified old restored state closed for the small beta; independent per-deletion/revocation recording is explicitly deferred. A clean restart needs a separate procedure; automatic old-phone recovery is unsupported. The [October 31 recovery-target decision](../DECISIONS.md#october-31-recovery-targets) accepts up to 24 hours of ordinary-write loss and a four-hour operator recovery target when safe recovery is possible. Actual scheduled copies, hosted alert delivery and failure/missed-run verification, and complete app/Auth recovery evidence remain open. | Anthony and implementation/release owner reassess the deferred design before paid launch or expansion beyond the small beta, whichever comes first; release owner proves current app/Auth recovery. |
| Encryption-key custody and restore access    | The [October 31 custody decision](../DECISIONS.md#october-31-local-recovery-key-custody-and-coordinated-cutover) selects an owner-held `age` private key in protected local Mac storage outside CI. USB/off-Mac retrieval and verification are not prerequisites. Verify operational decryption and complete recovery without putting the private key, credentials or private data in source/CI/chat artifacts.                                                                                                                                                                                                                                                                | Anthony owns the key/access policy; implementation/release owner verifies actual recovery before relying on backups.                                                                                |
| Old-build and Vercel retirement              | Full cutover selected October 30: no actual app users/external cohort, so no compatibility grace period or retained legal redirects. The [October 31 decision](../DECISIONS.md#october-31-local-recovery-key-custody-and-coordinated-cutover) accepts a brief legal-URL interruption in a prepared, coordinated cutover. Complete approvals, artifacts and publication preflight first; replace/retire owner-only builds and end Vercel API/legal roles, verify private-traffic cutoff, then immediately publish/verify Cloudflare legal pages and update Apple/EAS URLs. Preserve account/journal data and device gates.                                                      | Implementation/release owner executes the concrete cutover under existing approvals; Anthony supplies required phone acceptance and specific Git permissions.                                       |
| Changed notices and disclosure evidence      | Complete Cloudflare/R2, retention and cross-border Privacy wording was approved October 30. Effective date, matching version, publication authorization and the App Privacy assessment remain open. Keep unchanged Supabase consent/provider and Sentry native-linkage questions assigned to Phase 14 rather than declaring them cleared by this migration.                                                                                                                                                                                                                                                                                                                    | Implementation/privacy owner prepares remaining disclosure/publication evidence; Anthony approves date/version and publication before outside testing.                                              |

Carry the unresolved Phase 14 decisions forward through the
[release handoff](../handoffs/phase-14-release.md#decisions-still-required-and-next-sequence):
Supabase/private-journal notice and consent requirements; evidence-based Sentry
and Apple diagnostic disclosures plus any post-trial cost; disposition of deferred
phone/recovery/accessibility gates; and actual external testers/dates/distribution
approval. Phase 15 preserves monitoring and error filters but does not settle
those independent privacy/device questions. The deliberate crash test remains
skipped, simulator CI remains deferred, and Vercel contact remains declined.
Dependency-advisory remediation stays an owned Phase 14 task; paid offer,
Superwall/billing and paid-launch decisions belong to Phase 16 and the later
Phase 14 paid checkpoint.

## Implement

**Hono API**

- Port the Fastify layer (`build-app.ts`, `server.ts`, `http/` and each feature's
  `routes.ts`, about 970 lines and 34 routes) to Hono. Keep paths, methods, status
  codes, response bodies, headers and the OpenAPI document identical, so the
  existing contract tests pass unchanged.
- Recreate each hook as Hono middleware: security headers, CORS, request IDs, body
  size limits, request timeouts, bearer parsing, the error envelope, not-found
  handling and the scrubbed 5xx Sentry reporter. Keep known client errors distinct
  from service failures.
- Replace Pino with structured console logging that keeps the current redaction
  rules. Never log credentials, recovery secrets or reflection text.
- Run the same Hono app in Node for tests, `test:db` and local development. Move the
  19 test files from `app.inject` to `app.request`, using a small shared helper
  rather than rewriting assertions.
- Add a Workers-runtime smoke test (`wrangler dev` or the Workers Vitest pool) that
  covers startup, one database read, one authenticated write and an error envelope.

**Workers runtime and database**

- Connect `pg` and Drizzle through Hyperdrive to the existing Supabase database.
  Check connection limits, supported transactions, owner locks and statement timeouts
  under Hyperdrive. Fix any query that relied on a long-lived Node pool.
- Keep hosted managed requests and retained existing-proof recovery on Hyperdrive
  using supported transactions, unique mapping and owner locks. Managed readiness
  verifies the active connection's actual role, database, schema and helper. Keep
  legacy direct advisory-lock transactions confined to loopback fixtures and each
  transaction on one connection; the release lease retains its separate direct connection.
- Place the Worker near Canada Central (Smart Placement or a placement hint) and
  measure p50/p95 latency and CPU per route against the current Vercel API.
- Store secrets with `wrangler secret`. Keep staging and production as separate
  Workers with separate database credentials; preserve the public-environment
  adapter and request fence so fixture proofs never reach a hosted API.

**Release pipeline**

- Rebuild the approval-gated GitHub release lane for Workers: upload a version
  without traffic, probe that version's preview URL, then deploy it. Keep the
  protected environment, the source SHA binding, the migration plan digest, the
  recovery attestation, the advisory lock and the read-back after an uncertain
  promotion. Never roll back automatically across a schema change.
- Use a Cloudflare API token restricted to this account's Workers and R2 backup
  bucket. Replace the Vercel-specific scripts and their tests (about 1,800 lines).
- Point the Sentry uptime monitor at the new `/ready` endpoint.

**R2 backups**

- Nightly GitHub Actions job: `pg_dump` the `justgo` and Supabase `auth` schemas
  with the least-privileged role that can read them, encrypt with `age` to a public key whose private
  key Anthony holds in protected local Mac storage outside CI, and upload to an R2
  bucket with an object lock.
  The upload token can write but not delete. Expire backups with a lifecycle rule
  whose period matches the approved retention policy and reviewed public wording.
  Staging now has approved seven-day protection and expiry on both backup prefixes;
  actual expiry observation remains open.
- Hourly job: copy the deletion, epoch, Auth and revocation ledger named in the
  restore checklist to a separate R2 prefix, encrypted the same way.
- Alert through Sentry or email when either job fails or misses its schedule.
- Rehearse a restore into local Postgres (the Free plan allows only two projects):
  restore the latest backup, reapply the newer ledger, and confirm that disposable
  deleted accounts stay deleted and their old credentials are rejected.
- Update `SERVER_RELEASES.md` and the restore checklist so R2 backups and the ledger
  supply the recovery attestation.

Automatic credential issuance is [optional Phase 21](phase-21-backup-credential-issuer.md#phase-21),
after accepted billing, analytics and actual App Store publication; it is not a
Phase 15 or first-launch gate. Anthony owns manual renewal until that separately
approved replacement is active; the owner-held Mac key and local parent stay outside CI.

Deferred beta recovery work:

- [ ] Implementation owner follows the submitted Supabase request to remove PUBLIC
      DELETE on `cron.job_run_details`. Once the provider's removal is verified,
      remove both the staging policy opt-in and the code exception through review.
      This follow-up runs alongside backups and does not delay activation.
- [ ] Anthony and the implementation/release owner must reassess independent
      per-deletion/revocation recording before paid launch or expansion beyond the
      small beta, whichever comes first. The long-term design must cover app,
      maintenance and Auth/admin paths. Conservative replay of a durably recorded
      deletion intent after an apparent database failure is accepted for that future
      design. This is an owned follow-up, not an implemented guarantee or a requirement
      to reopen an unsafe backup during the beta.

**Cutover**

- Move the static legal site (`sites/legal`) and API fully to Cloudflare. The
  [October 30 owner-only cutover decision](../DECISIONS.md#october-30-owner-only-full-cloudflare-cutover)
  selects no external-user grace period or retained legacy redirects.
- Accept the healthy Worker and recovery operation. Prepare the replacement
  TestFlight build with only verified Cloudflare API and legal URLs, complete the
  legal package and date/version/publication approvals, and pass publication
  preflight before ending Vercel hosting. In the coordinated cutover, replace/retire
  owner-only TestFlight and Dev builds, end Vercel API/legal hosting and verify
  private-traffic cutoff, then immediately publish/verify Cloudflare legal pages
  and update App Store Connect/EAS URLs. Anthony accepts the brief legal-URL gap
  under the [October 31 decision](../DECISIONS.md#october-31-local-recovery-key-custody-and-coordinated-cutover).
  An old binary is not updated by changing configuration. Preserve Supabase
  accounts and journal data. Remove Vercel credentials and configuration at retirement.
- Update the Privacy Policy, data inventory, legal review and App Privacy answers
  for the completed Cloudflare/R2 setup and processing outside Canada. The next
  public notice contains no Vercel transition wording. Complete Privacy wording is
  approved; publish only with approved date/version and publication authorization
  after both former hosting roles have ended.
- Update `TECH_STACK.md`, `APP_SHELL.md` and the operations guides once the cutover
  lands.

## Supabase Pro upgrade triggers

Stay on the Free plan until one of these is close, then ask Anthony to approve Pro
(US$25/month): database size near 400 MB of the 500 MB limit; monthly egress near
5 GB; a pause or capacity incident; or revenue that comfortably covers the cost.
R2 backups continue after an upgrade.

## Keep out

- No change to the database provider, Auth, schema or contracts as part of the move.
- No move to D1, KV, Durable Objects or Queues. Phase 16 decides separately whether
  Cron Triggers or Queues replace QStash.
- No Cloudflare rate limiting yet; API-6 stays a Phase 14 task.
- No unencrypted backup, backup key in the repository or CI logs, or backup older
  than the published retention period.

## Ready to hand off when

- [ ] Anthony has confirmed that Cloudflare's DPA covers this account and recorded its version.
- [x] The full suite, coverage floors, database/migration checks, contract tests and Workers smoke pass locally on the Hono API. Exact merged-main CI passed; the handoff records the evidence without repeating overlapping wrappers.
- [x] The staging Worker served reviewed source through the approval-gated lane, and normal uptime-monitor checks pass. Managed-account, performance, backup and device acceptance remain separate open gates.
- [ ] Measured latency and CPU are recorded, and the Workers plan choice is approved.
- [ ] A nightly backup and an hourly ledger copy have run on schedule, and the local restore rehearsal kept deleted accounts deleted.
- [ ] A physical iPhone running a TestFlight build against the Workers API passed the Phase 14 smoke journeys.
- [ ] Updated notices are approved and published after Vercel API/legal hosting and owner-only old-build use are retired; no transition period or legacy redirects remain.
- [ ] Every item in the remaining-decision register has a recorded result or explicit owner/phase disposition; separate Phase 14 gates remain visible and no unverified check is reported as passed.
- [x] The handoff records the changes, problems, verification and remaining gates; the handoff index links it.

## Open gates for Phase 14

The external free beta waits for this phase. The Supabase sensitive-data consent
clause and the signed-in journal provider assessment remain Phase 14 gates.
