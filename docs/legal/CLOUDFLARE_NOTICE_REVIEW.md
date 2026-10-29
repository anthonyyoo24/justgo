# Cloudflare notice candidate — approval pending

This is the exact replacement wording proposed for the Phase 15 cutover. It is
not published, does not change the approved October 27 Privacy Policy, and has
no effective date yet. Apply it only after the account, services, retention and
cutover facts below are accepted. Terms need no hosting-related change.

## Proposed Privacy replacements during the transition

Use the transition wording while supported old builds still send traffic to
Vercel. Publish it only after the described Cloudflare services are operating and
the complete notice is approved. This allows the new TestFlight build to link to
an accurate notice before the old builds retire.

Replace the Vercel paragraph in **How we use information** with:

> Cloudflare hosts these legal pages. Older versions of JustGO may open legal
> pages hosted by Vercel. When you visit a page, its hosting provider receives
> ordinary connection information, such as your IP address, requested page and
> browser information. We do not add product analytics or tracking cookies to
> these pages. The providers describe their handling of service and network
> information in the [Cloudflare Privacy Policy](https://www.cloudflare.com/privacypolicy/)
> and [Vercel Privacy Notice](https://vercel.com/legal/privacy-notice).

Replace the Vercel provider bullet with these two bullets:

> **Cloudflare** hosts these public legal pages and the API that processes
> authenticated account data, including synchronized feelings and reflections.
> Its Hyperdrive service connects the API to our database. Cloudflare R2 stores
> encrypted recovery copies of our application and authentication databases and
> records needed to preserve deletions and revoked access after a restore.

> **Vercel** continues to host the API used by older versions of JustGO during
> this transition. When those versions synchronize an account, Vercel processes
> the synchronized account data, including feelings and reflections. Vercel also
> hosts the older legal-page addresses.

Keep Supabase as the database/Auth provider, and add after the provider list:

> Our primary database remains in Canada Central. Cloudflare requests, connection
> information and support operations may be processed outside Canada. Database
> placement does not mean all processing or recovery copies stay in Canada.

Add to **Retention and deletion**, only after scheduled copies are operating,
the proposed seven-day policy is approved and configured expiry is verified:

> We make encrypted database recovery copies nightly and copy deletion and
> revoked-access records hourly. These copies are scheduled to expire seven days
> after creation; the storage provider's lifecycle deletion normally completes
> within the following day. They are unavailable through the app and are used
> only for recovery. We reapply current deletions and revocations before making a
> restored service available. If we cannot establish the current deletion record,
> we keep the restored service closed. Nightly recovery copies may not contain
> changes made since the last successful copy. Account users must sign in again
> after a service restore. Encryption does not make the app's ordinary
> signed-in synchronization end-to-end encrypted. Other providers' recovery copies
> follow their own applicable retention and deletion processes.

Do not publish a guaranteed eight-day maximum: Cloudflare describes normal
lifecycle timing, not an absolute erasure deadline. Confirm the applicable
deletion duties and evidence before accepting this wording. See the
[backup guide](../operations/CLOUDFLARE_BACKUPS.md) and
[R2 lifecycle documentation](https://developers.cloudflare.com/r2/buckets/object-lifecycles/).
Hourly copying leaves a gap after the last copy; this text does not promise
recovery of every newly written record or a complete ledger after total loss.

## Final wording after retirement

Once all old builds are retired and Vercel API traffic has stopped, remove the
Vercel API statement from the provider list. If old legal URLs still serve or
redirect through Vercel, retain its legal-hosting disclosure. Removing Vercel
entirely requires evidence that both its API and legal-hosting roles have ended.
At that point replace the transition hosting paragraph with:

> When you visit these legal pages, Cloudflare receives ordinary connection
> information, such as your IP address, requested page and browser information.
> We do not add product analytics or tracking cookies to these pages. Cloudflare
> describes its handling of service and network information in its
> [Privacy Policy](https://www.cloudflare.com/privacypolicy/).

Review and approve this later complete notice and effective date separately.

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

- Confirm the actual customer/account and applicable
  [Cloudflare DPA v6.4](https://cf-assets.www.cloudflare.com/slt3lc6tev37/1TTgT35GoUNlKZYGuKWBFy/4e7dfc8cf402419a9b1cf624291fc69f/cloudflare_customer_dpa-v6.4_april_3_2026.pdf)
  for Workers, Hyperdrive and R2. Public terms alone are not account evidence.
- Approve exact retention/locks, key custody, region/access configuration and
  the recovery tradeoffs in the backup guide. Record tested lifecycle/permission
  behavior; do not infer it from a policy file.
- Follow the [cutover checklist](../operations/CLOUDFLARE_CUTOVER.md), using the
  two-provider transition wording before the new build ships. Until old builds
  stop sending private traffic to Vercel, a notice naming Cloudflare alone would
  be incomplete. Keep any surviving Vercel legal-hosting role disclosed afterward.
- Approve the final complete Privacy text, version and effective date, then set
  its existing approval metadata and `<!-- deployment-host: cloudflare -->`.
  The legal Worker build rejects publication without both approvals. Separately
  authorize publication and anonymous phone verification of the resulting URLs.
