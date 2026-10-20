# Phase 12 — Legal documents and release disclosures

## Summary and status

**Status:** Approved local text and verified local implementation prepared;
publication/paid hosting are owner-deferred until closer to launch. Public-hosting
acceptance and applicable regional/provider release conditions remain open. The
[phase plan](../implementation-plan/phase-12-legal-documents.md) owns acceptance.
Depends on the implemented boundaries and evidence in
[08](phase-08-settings-privacy.md), [09](phase-09-app-continuity.md),
[10](phase-10-acceptance.md) and [11](phase-11-crash-reporting.md).

## Decisions and why

Anthony confirmed Youngshin Yoo in Ontario, Canada. Retain the existing temporary
privacy/support email. No public address, phone, domain, regional restriction,
plan upgrade or publication was selected by that confirmation. The earlier
seven-day backup target requires Pro; the actual current Supabase organization is
Free. No seven-day guarantee was placed in the candidate. The October 19 public rewrite
uses How We Feel and Stoic as organization references while retaining JustGO
phone-and-cloud storage, recovery/deletion and actual service states. It does not
copy their local-only, provider, retention, AI or paid-service claims.

The public documents describe the current test/free-beta candidate truthfully:
ordinary Sentry reporting and product analytics remain disabled. The narrow
startup Sentry scope was owner-approved in Phase 11, but matching notices, lawful
basis/permission, provider agreements/retention and signed-build acceptance remain
separate prerequisites. Calling diagnostics essential is not a substitute for
those requirements. No extra onboarding prompt or collection was introduced.

The Phase 12 technical review retains the static public API description [SEC-4].
It publishes contracts rather than private records or credentials, and ownership/
authentication remain the security boundary. Hiding it offers no replacement for
those checks. This is a bounded engineering decision with no route behavior change;
it does not imply public hosting/content approval.

The SEC-5 assessment retains iOS Data Protection as the current baseline. The
earlier blanket recommendation for a second lock before beta was too strong; no
concrete finding currently requires an added vault. Phase 13 must inspect actual
signed-build file protection and backup exclusion/failure behavior and remediate
a specific gap if found. No MMKV migration or additional vault was implemented.

## Behavior that changed

- Terms & Privacy now explicitly describes uploads for account recovery, optional
  feelings/reflections and the no-sale assurance.
  The owner removed the onboarding Sentry paragraph, Analytics section and
  development-release notice; the linked policy retains the full processing
  explanation. The existing screen, two-line agreement, errors and bottom action
  remain.
- Starting acceptance or a preparation retry clears document-opening feedback
  and invalidates pending document failures. Older native link responses cannot
  replace a later save error or the feedback for a newer document action.
- Public documents retain their own version labels and pending effective dates.
  The later October 19 owner decision removes per-account legal/view receipts,
  accepted-version persistence, acceptance endpoints and reacceptance gates.
  Continue performs ordinary account creation, preserving exact-proof retries.
  The [Phase 10 handoff](phase-10-acceptance.md) owns the removal and its rollout.
- Guarded development legal routes describe the original-phone pending-upload
  limit and the actual diagnostics/analytics gates. Production
  still does not expose those development pages.
- Privacy/Terms public text was rewritten from the existing drafts and verified
  inventory, with Ontario operator, actual retained security identifiers,
  retryable local cleanup, local/device protection limits and honest provider/
  backup scope. Internal decisions and placeholders remain outside public blocks.
- `sites/legal/` generates two document pages, `/privacy/` and `/terms/`, with the
  base address rendering Privacy directly. The owner removed the Legal landing
  page, top tabs and visible preview/version/pending-date metadata. Footer links
  connect the documents. Responsive system typography and keyboard navigation
  remain, with no browser JavaScript, remote fonts, embeds or analytics. Only marked
  public content renders; source approval/date metadata, independent document-label
  validation, safe links and production-build checks remain in place.
- The [disclosure worksheet](../legal/RELEASE_DISCLOSURES.md) prepares App Privacy,
  age/operator/support/EULA information and preserves actual signed-binary/App
  Store submission gates in Phase 13. [LEGAL_REVIEW](../legal/LEGAL_REVIEW.md)
  records current Apple/regulator research and concrete publication blockers.

## Invariants to preserve

Saving, synchronization, recovery, export, deletion and access verification remain
independent of vendor failures. No user journal data or account identifier goes to
Sentry; ordinary delivery remains off. No PostHog exporter or historical backfill
exists. The removed legal receipt helper is not an activation policy. Phase 14 must review
its actual permission/collection design before any delivery and must not silently
restore the rejected tracking or gating mechanism. Continue and old receipts are
not authorization. Independent privacy restrictions remain preserved.

Permanent deletion/revocation tombstones include pseudonymous identifiers, dates
and digests; they contain no journal content but are not anonymous. Local cleanup
can remain pending after server deletion. Do not promise remote wiping of an
offline second phone or exported copies. Current AsyncStorage uses iOS Data
Protection but no additional app-controlled encrypted journal vault; no encryption
migration was performed.

## Problems that could recur

- Account protocol changes require a coordinated API/mobile rollout; document
  labels do not. Deploy code that no longer uses the legal table before removing
  it. Preserve exact-proof retries and credential/journal data; never reset an
  account to hide a mismatch. See the Phase 10 handoff for migration 0018.
- The first longer Sentry paragraph pushed I Accept 33 pixels below the required
  smallest-viewport position. The saved geometry assertion caught it. Wording
  was shortened; font sizes, spacing and assertion tolerances were preserved.
- An intended Free Sentry plan does not determine retention while the account is
  on Business trial; the plan at ingestion matters. No provider agreement was
  accepted. Do not use a policy rewrite as evidence of permission or safeguards.
- Test/staging Canada configuration does not establish a production region or
  backup plan. Internal review records identify the current test setup; publication must
  reconcile the actual beta/release configuration. Public prose omits test tiers
  and makes no fixed backup-period or completed-contract promise.
- Local source approval metadata is a build guard, not approval itself. Update
  its status only after actual owner review. The reader's plain presentation
  does not establish publication or finalize effective dates.

## Setup or environment changes

Run `npm run build:legal` for ignored static output in `sites/legal/dist/`.
`npm run build:legal -- --production` intentionally refuses the current pending
effective dates. Site regressions are part of `test:architecture`. Explicit HTTP
legal-reader URLs on private LAN/loopback hosts are accepted only in development
for phone testing; release URLs still require HTTPS. The ignored mobile environment
now points both legal links at the local static reader. Serve only the generated
output and restart Metro after configuration
changes; [the reader README](../../sites/legal/README.md) records the setup.
The static-reader setup changes no package dependency, lockfile, database migration,
native module, hosted project or account plan. The separate tracking-removal
migration is described below. The protected API upload boundary remains intact.

The earlier October 19 matching-version test deployment is historical. Anthony
later directed removal of all legal-view/agreement recording and version gates.
The [Phase 10 handoff](phase-10-acceptance.md) records the compatible API rollout and
forward 0018 removal of only the legal receipt table, preserving all identity and
journal data. This is independent of publishing the local legal website.

October 18 provider reads: Supabase connector showed the JustGo test project in
Canada Central and its organization on Free. The side-panel Sentry settings showed
US region, Business trial (13 days remaining), no payment method, DPA “Review and
Accept” and aggregated identifying-data reuse off. Vercel project settings showed
Hobby with no available configured log drain. Provider defaults are documented in
the inventory; final infrastructure/agreements/retention still require review.
Only settings were inspected; no real journal, account proofs or request logs were
read and no provider configuration was changed.

The October 19 published-terms review found Supabase's DPA incorporated in its
standard Terms, while Vercel's processor DPA names Pro/Enterprise and does not
establish coverage for the observed Hobby setup. Clarify the actual hosting/data
scope before real users, without assuming a paid upgrade is the only answer.
Free Supabase lacks included daily backups but can retain paused-project recovery
copies; the candidate makes no fixed expiry promise. See the
[provider review](../legal/LEGAL_REVIEW.md#hosting-agreements-and-recovery-copies)
for sources and account-specific limits. No agreement was accepted.
Vercel can supply the legal reader's `.vercel.app` address without a custom-domain
purchase. Anthony selected that Vercel-generated address on October 19 after
clarifying the initial portfolio/free-beta direction and later payment phase.
Anthony then approved both public texts and initially confirmed the worldwide App
Store target. On October 20 he excluded EU App Store countries for the initial
paid release. The actual public URLs, final publication versions/effective date and
publication remain open. Review applicable plan/data-processing terms before real-user or commercial
use; no paid upgrade is authorized.

The first public App Store release is paid, as Anthony confirmed October 19. Keep
the free TestFlight beta → 07A billing → Phase 13 paid launch sequence. A portfolio
purpose does not create an additional free public release. The October 20 owner
decision excludes EU App Store countries initially, so public EU trader contact
verification is deferred until any EU expansion. Phase 13 must apply/verify the
country selection and complete Apple's trader-status declaration. This changes
the release target only; no App Store settings or private contacts were published.

October 20 read-only checks confirm the JustGO Vercel team is still on Hobby and
the Supabase organization is still on Free. No upgrade was made or authorized.
Multiple projects can share a paid Vercel team or Supabase organization; additional
Supabase projects incur their own compute charges. Launch plan/backup choices and
the applicable provider review remain open.

Anthony chose to wait to pay for hosting and keep the website local. The source
text is approved; the reader displays only the documents and keeps review metadata in source. Leave
effective dates pending and preserve publication, public URL/link checks and the
release link/app verification in Phase 13 preparation when he is ready for hosting.
Per-account accepted-version rollout is no longer part of the design. No legal-site
deployment or paid upgrade is authorized now. This explicit publication deferral does
not close the separate provider/regional/native conditions.

## Open gates

| Gate                              | Owner / phase                                             | Required result                                                                                                                                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed journal protection [SEC-5] | Release owner / 13                                        | Verify the actual file-protection class and backup exclusion/failure behavior. Retain the current OS-backed baseline absent a concrete gap; no automatic vault requirement.                                                                                            |
| Distribution and contacts         | Anthony with applicable reviewer / 12; release owner / 13 | Initial paid target excludes EU countries; apply/verify actual App Store availability and trader declaration. Review applicable regional requirements. EU public contacts are deferred until EU expansion. Preserve intended 18+ without invented identity collection. |
| Operator/EULA/rating              | Anthony / 12–13                                           | Resolve Apple's sensitive-information/legal-entity interpretation, supplementary Terms and final higher age override in actual App Store entry.                                                                                                                        |
| Provider/logs/backups/support     | Anthony / 12–13                                           | Verify agreements, actual retention and configuration; decide backup plan and operational-copy removal; implement support retention/request process. No paid upgrade authorized.                                                                                       |
| Sentry activation                 | Anthony with applicable reviewer / 12; release owner / 13 | Resolve basis/device-access rules, DPA, trial/ingestion retention and identifiable report requests; review updated enabled-reporting policy, then signed crash/payload/cache/symbol/outage acceptance before delivery.                                                 |
| Content and public hosting        | Anthony / Phase 13 preparation                            | Owner-deferred until ready for hosting. Preserve text approval, finalize dates/versions, publish to the selected Vercel-generated address and verify anonymous HTTPS/app links. No current upgrade/legal-site deployment authorization.                                |
| Actual release disclosures        | Release owner / 13                                        | Verify signed privacy manifests/required-reason APIs, ATT/tracking, native links/accessibility and final App Store entries.                                                                                                                                            |
| Paid and future analytics scope   | 07A/13, then 14                                           | Update notices/offer/providers/labels before paid launch; future analytics requires a separately reviewed permission/collection design, with no history backfill or assumed Continue permission.                                                                       |

## Verification

Original local evidence was completed October 18–19 before the later no-recording
simplification; current removal evidence belongs to the Phase 10 handoff:

- `npm run check` passed with online Expo Doctor 21/21, all-workspace types,
  lint/format, 258 architecture/tooling tests, 110 API unit tests, 1,072 mobile
  tests and 35 contracts tests. Existing lint warnings remain; no errors.
- `test:db` passed 80 integration cases plus the migration preservation/restore
  rehearsal. All-workspace coverage and the aggregate all-source/critical floors
  passed. The initial root coverage invocation could not reach the stopped local
  PostgreSQL instance; mobile/contracts passed. After restarting the isolated
  loopback `justgo_test` database and applying migrations, the API coverage rerun
  passed all 191 tests and `coverage:check` passed. No coverage floor changed.
- Saved journeys covered 37 unaffected cases in the full run plus all five final
  acceptance cases after shortening the paragraph. The earlier full run caught
  the 320-pixel layout failure; the final focused run passed its unchanged geometry
  assertion. This is combined evidence, not a claimed final single 42/42 run.
- Production web export, its independent static smoke (one case), and iOS JS/asset
  export passed. They do not establish a native build or device acceptance.
- All nine static-reader regressions, ESLint and the local build passed. Tests
  retain public-only extraction, document-label/link safety and production refusal
  without actual approval/effective dates. Reader presentation follows the later
  owner simplification described above; routine validation stays in the task record.

Interactive side-panel evidence is separate from saved journeys. Acceptance was
checked at 320×611 and 390×844 with a 20-pixel bottom gap, current copy and guarded
loopback legal links; the privacy draft opened correctly. No interactive account
was accepted. After the public rewrite, the legal reader's Privacy and Terms pages
had no horizontal overflow at both sizes, 18-pixel body text, working cross-page
navigation and a keyboard skip link that focuses the main content. No browser
warnings/errors were observed. Static local preview is not anonymous public HTTPS
or physical-phone evidence.

The complete file lists in the touched source/documentation directories and
`sites/legal/` were reviewed. Existing responsibility groups remain coherent;
no folder moves or unrelated cleanup were needed. Formatting, local documentation
links and `git diff --check` were checked after the final documentation pass.

No hosted CI, legal-site publication, native compilation, device acceptance,
provider activation, plan upgrade, agreement acceptance or App Store submission is
claimed. The separately authorized test API deployment is evidenced above.
