# Cloudflare notice candidate — wording approved, publication pending

Anthony approved the complete simplified public Privacy wording and remaining
recovery wording on October 30, 2026 (America/Toronto), including signing in again
after a restore. This Phase 15 cutover candidate is not published, does not change
the approved October 27 Privacy Policy, and has no effective date yet. Apply it
only after the remaining account, services, retention and cutover evidence is
verified and its date/version and publication are approved. Terms need no
hosting-related change. A complete Cloudflare-only Privacy candidate, unchanged
Terms copy, rendered review and conditional publication/EAS inputs are prepared in ignored
`.local/phase15-cloudflare/rollout/notice-review/`. Proposed version
`2026-10-30-cloudflare` now has `owner-approved` wording status, with a pending
date and no Cloudflare deployment approval marker; publication remains blocked.
The version is date-dependent: approve the actual publication date and matching
version before publication rather than backdating it.

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
Complete all required operational/account approvals, the final publication
date/version and authorization, and legal-artifact preflight before retirement.
In the prepared coordinated cutover, retire old builds and Vercel API/legal
roles, immediately publish and verify the Cloudflare-only notice and unchanged
Terms, then update App Store Connect and EAS URLs. Anthony accepts the brief
legal-URL gap under the
[October 31 decision](../DECISIONS.md#october-31-local-recovery-key-custody-and-coordinated-cutover).
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

## Approval evidence required

- The [Self-Serve Subscription Agreement](https://www.cloudflare.com/terms/)
  §6.1 expressly incorporates the DPA for its EU/UK and CCPA personal-data
  categories. The [DPA v6.4](https://www.cloudflare.com/cloudflare-customer-dpa/),
  effective April 3, 2026, defines applicable data-protection laws broadly in
  §1.1(c), and §9.1 gives its processing terms precedence over conflicting main
  terms. Their interaction for Canadian/PIPEDA data remains a scope question;
  do not describe the DPA as conclusively limited to EU/UK/California data.
- Account evidence reviewed October 30, 2026: the signed-in account's
  **Manage account → Configurations → Preferences → Data processing addendum**
  section states that the DPA is incorporated into the Self-Serve Subscription
  Agreement. Its Review link points to the current DPA above. No separate
  acceptance control or outstanding DPA action was displayed. The readback is
  retained in ignored `.local/phase15-cloudflare/rollout/notice-review/cloudflare-dpa-account-evidence.json`.
  This records Cloudflare's account-context incorporation notice, not a separate
  signature or acceptance receipt. Do not assign Anthony a nonexistent
  dashboard acceptance step.
- Cloudflare's [Singapore PDPA FAQ](https://www.cloudflare.com/trust-hub/singapore-pdpa/)
  also describes DPA incorporation for all customers. These statements support
  broad coverage; separate written confirmation of PIPEDA applicability to this
  account is not recorded. Resolve and document the contractual scope before
  hosted private-journal processing through Workers, Hyperdrive or R2; the
  account notice does not by itself mark the earlier coverage gate passed.
- Anthony requested further work on this account item October 30. His earlier
  instruction not to contact Cloudflare remains in force; he explicitly declined
  sending Cloudflare emails. A private clarification is retained unsent in the local
  review package. No agreement was accepted, support request submitted or
  approved launch region changed.
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
  stays disabled. Preserve the
  [recorded decision](../DECISIONS.md#october-28-phase-15-runtime-and-recovery-implementation)
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
