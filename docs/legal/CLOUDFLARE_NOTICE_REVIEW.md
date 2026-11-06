# Cloudflare notice candidate — wording approved, publication pending

**Superseded for the API.** Do not publish this candidate. Its clauses that name
Cloudflare as the API server and Hyperdrive no longer apply, because the API
moves to Supabase Edge Functions. The R2 backup wording still applies. The
[Supabase plan](../implementation-plan/phase-15-supabase-api.md) prepares the
replacement notice in its P15-10.

Anthony approved the complete simplified public Privacy wording and remaining
recovery wording on October 30, 2026 (America/Toronto), including signing in again
after a restore. This Phase 15 cutover candidate is not published, does not change
the approved October 27 Privacy Policy, and has no effective date yet. Apply it
only after the remaining services, retention and cutover evidence is
verified and its date/version and publication are approved. Terms need no
hosting-related change. A complete Cloudflare-only Privacy candidate, unchanged
Terms copy, rendered review and conditional publication/EAS inputs are prepared in ignored
`.local/phase15-cloudflare/rollout/notice-review/`. Proposed version
`2026-10-30-cloudflare` now has `owner-approved` wording status, with a pending
date and no Cloudflare deployment approval marker; publication remains blocked.
The version is date-dependent: approve the actual publication date and matching
version before publication rather than backdating it. Anthony accepted the
current-account/DPA/private-journal assessment on November 1; that disposition
does not establish the remaining operating or publication facts.

Keep connection-product names, copy schedules and restore steps in the
[cutover guide](../operations/CLOUDFLARE_CUTOVER.md) and
[backup guide](../operations/CLOUDFLARE_BACKUPS.md). The public wording retains
provider roles, processing locations, retention and meaningful recovery limits.

## Approved Privacy wording for full cutover

Anthony confirmed there are no actual app users and selected a full Cloudflare
switch. The next public notice therefore has no Vercel transition disclosure.
Publish it only after the described services are operating and the owner-only
old TestFlight/Dev builds and Vercel API/legal hosting roles have been retired.
The current published policy remains unchanged until that cutover is verified.

Replace the hosting paragraph in **How we use information** with:

> When you visit these legal pages, Cloudflare receives ordinary connection
> information, such as your IP address, requested page and browser information.
> We do not add product analytics or tracking cookies to these pages. Cloudflare
> describes its handling of service and network information in its
> [Privacy Policy](https://www.cloudflare.com/privacypolicy/).

Replace the former hosting-provider bullet with:

> **Cloudflare** hosts these public legal pages and the server that handles
> synchronized account data, including feelings and reflections. It connects the
> server to our database and stores encrypted backups of account, journal and
> sign-in information, along with records used to preserve deletions and revoked
> sign-in access after recovery.

Keep Supabase as the database/Auth provider, and add after the provider list:

> Our primary database remains in Canada Central. Cloudflare requests, connection
> information and support operations may be processed outside Canada. Database
> placement does not mean all processing or recovery copies stay in Canada.

Add to **Retention and deletion** only after scheduled copies are operating and
the remaining publication requirements are met. Anthony's October 30 approval
includes this complete recovery wording and the requirement to sign in again
after a restore. Seven-day retention/protection/expiry was separately approved
October 30; configuration readback and actual lock enforcement passed.
Asynchronous object deletion has not yet been observed:

> We make encrypted backups for service recovery. They are scheduled to expire
> seven days after creation; automatic deletion normally completes within the
> following day, but this is not a guaranteed deadline. These backups are
> unavailable through the app and used only for recovery. Before a restored
> service reopens, we make sure deleted information and revoked sign-in access
> stay unavailable. If we cannot confirm this, we keep that restored service
> closed. Backups may not include changes made since the last successful copy.
> Account users must sign in again after a service restore. Backup encryption
> does not make ordinary account synchronization end-to-end encrypted.

Use this plain-language replacement for the provider-recovery paragraph:

> Other providers' backups may retain older information under their own retention
> and deletion processes. Deleting active records does not immediately erase
> every provider backup.

Do not publish a guaranteed eight-day maximum: Cloudflare describes normal
lifecycle timing, not an absolute erasure deadline. Confirm the applicable
deletion duties and evidence before publishing this approved wording. See the
[backup guide](../operations/CLOUDFLARE_BACKUPS.md) and
[R2 lifecycle documentation](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
Hourly copying leaves a gap after the last copy; this text does not promise
recovery of every newly written record or a complete ledger after total loss.

## Cutover and publication point

Existing owner-only binaries retain their embedded old addresses. Replace or
retire them; a source/configuration edit cannot change an installed binary.
There is no external cohort requiring a grace period. The full cutover ends
both Vercel API processing and legal-page hosting, with no legacy redirect role.
Complete all remaining operational approvals, the final publication
date/version and authorization, and legal-artifact preflight before retirement.
In the prepared coordinated cutover, retire old builds and Vercel API/legal
roles, immediately publish and verify the Cloudflare-only notice and unchanged
Terms, then update App Store Connect and EAS URLs. Anthony accepted the brief
legal-URL gap on October 31, 2026.
This sequence does not establish that cutover has happened or authorize provider
actions through this documentation update.

## App Privacy and inventory assessment

The local port adds no product data categories, tracking SDKs or analytics.
Cloudflare replaces the API/legal processor and R2 adds recovery storage for
already-collected account, journal and Auth data. Existing linked account/history/
Health/Other User Content assessments still apply. Encryption alone does not
remove recovery copies from the inventory or establish Not Linked. Verify actual
Cloudflare network/security use and retention before publishing Apple answers.
The two unfinished Sentry diagnostic categories, Supabase consent/provider-copy
questions and native evidence remain Phase 14 work.

## Accepted account and service assessment

Anthony accepted proceeding on this reviewed assessment on November 1, 2026
(America/Toronto), including the residual contractual interpretation. This acceptance
settles this account/DPA/sensitive-content gate for the current consumer service;
it does not establish worldwide compliance or close the operating, publication
or independent Phase 14 gates.

- Personal customer Youngshin Yoo is confirmed. The
  [Self-Serve Subscription Agreement](https://www.cloudflare.com/terms/)
  preamble permits a personal counterparty. Its §6.1 supplies an express
  conditional incorporation trigger for EU/UK and CCPA data, without saying
  that these are the only covered jurisdictions. Account evidence reviewed
  October 30, 2026: the signed-in account's
  **Manage account → Configurations → Preferences → Data processing addendum**
  section states that the DPA is incorporated into the Self-Serve Subscription
  Agreement. Its Review link points to DPA v6.4. No separate
  acceptance control or outstanding DPA action was displayed. The readback is
  retained in ignored `.local/phase15-cloudflare/rollout/notice-review/cloudflare-dpa-account-evidence.json`.
  This is an incorporation notice, not a separate signature. Cloudflare's
  [Singapore PDPA FAQ](https://www.cloudflare.com/trust-hub/singapore-pdpa/)
  also describes incorporation for all customers; no additional dashboard
  acceptance step is shown.
- The [DPA v6.4](https://www.cloudflare.com/cloudflare-customer-dpa/), effective
  April 3, 2026, has broad applicability and law/data/service definitions in its
  opening terms and §§1.1(c), (l), (o). Section 9.1 gives its processing terms
  priority over conflicting main terms. Together with actual incorporation,
  these support the accepted Canadian/PIPEDA reading. Precedence alone would
  not establish incorporation. Annex 1 contemplates sensitive content and
  safeguards; it is not permission to disregard service-use restrictions.
- The [Developer Platform terms](https://www.cloudflare.com/service-specific-terms-developer-platform/)
  cover Workers, Hyperdrive and R2. Section 8(c)'s sensitive-disclosure wording
  is read with Cloudflare's current [abuse approach](https://www.cloudflare.com/trust-hub/abuse-approach/),
  which places that wording within harmful, illegal or rights-violating content.
  The accepted assessment supports lawful, authorized private journal sync and
  encrypted recovery storage; it finds no blanket prohibition on that flow.
  This is an interpretation, not an express private-journal safe harbor.
- No non-commercial-only or ordinary consumer-journal enterprise requirement was
  found in the applicable Free/service terms. SSA §2.2.1(i)'s HIPAA-PHI restriction
  is distinct; Cloudflare's [US privacy FAQ](https://www.cloudflare.com/trust-hub/us-privacy-compliance/)
  limits BAAs to enterprise customers. [HHS guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/cell-phone-hipaa/index.html)
  distinguishes independent personal-use apps from covered-entity/business-associate
  services. The present consumer app is assessed on that basis, not as a regulated
  healthcare service. PlanetScale's separate sensitive-data restriction does not
  apply to the external Supabase database merely because Hyperdrive connects it.

There is no separate provider confirmation of Canadian applicability, negotiated
exception or new agreement. Anthony accepts the residual interpretation; external
counsel or Cloudflare correspondence is not an added prerequisite. The no-contact
instruction remains in force. Reassess if terms or the actual service materially
change. Workers Free remains selected; this assessment makes no purchase or
technical-capacity claim.

## Remaining publication evidence

- Verify region/access configuration and the remaining operational recovery
  requirements in the backup guide.
  Seven-day staging retention/locks/expiry and the small-beta fail-closed limit
  are already approved; do not reopen those choices. Lock enforcement and
  configuration readback passed, while actual asynchronous expiry remains
  unobserved. Anthony chose protected Mac key custody locally outside CI, without
  a USB-retrieval prerequisite, and owns manual credential renewal. Actual hosted
  recovery-copy decryption, renewal execution and complete operational recovery
  remain open; isolated hosted archive compatibility does not close them.
- The Cloudflare database-connection disclosure assumes Hyperdrive query caching
  stays disabled. Preserve that setting
  and verify provider readback under [server releases](../operations/SERVER_RELEASES.md).
- Follow the [full-cutover checklist](../operations/CLOUDFLARE_CUTOVER.md).
  Prepare all approvals and preflighted legal assets before retirement, then
  retire owner-only old builds and both Vercel API/legal hosting roles before
  immediately publishing/verifying the Cloudflare-only notice and updating
  ASC/EAS URLs. The brief legal-URL gap is accepted; there is no external-user
  grace period or retained legal redirect. Verify retirement rather than
  inferring it from the text edit.
- The complete simplified public Privacy text and remaining recovery wording
  were approved October 30, 2026 (America/Toronto), including the exact sentence:
  “Account users must sign in again after a service restore.” Unchanged wording needs no repeat
  approval. The effective date, matching version and publication remain pending;
  this approval establishes no account or operational recovery evidence. Before
  ending Vercel hosting, set the approved date/version and
  `<!-- deployment-host: cloudflare -->`, complete artifact preflight, and obtain
  publication and anonymous phone-verification authorization for the coordinated
  cutover. Do not publish the final Cloudflare-only notice before Vercel's roles end.
- Operations: the release owner should watch Cloudflare's
  [sub-processor list](https://www.cloudflare.com/gdpr/subprocessors/). DPA §4.4
  requires notice at least 30 days before new or replacement sub-processors
  begin processing; objections must be made in writing within 10 days of notification.
