<a id="phase-12"></a>

# Phase 12 — Legal documents & release disclosures

**Status:** Local legal preparation handed off; public publication/paid hosting remain owner-deferred. New Phase 13 owns local journal storage, manual backup/restore and the resulting notice revisions. Phase 14 retains publication and release verification. Existing approved text describes the current cloud implementation until Phase 13 is verified. See the [handoff](../handoffs/phase-12-legal-documents.md).

## Outcome

Approved public Privacy Policy/Terms and release-disclosure preparation accurately describe the free beta and its enabled services.

## Decisions in force

- Dependencies: 08 for verified data-control/retention behavior, 09 for local deck/venue facts, 10 for onboarding acceptance and 11 for Sentry diagnostic collection/provider configuration. Product analytics stays disabled through beta and paid launch; deferred Phase 15 does not block this phase. Review can begin alongside implementation; final notices must describe the verified release behavior.
- Anthony approved minimal essential Sentry diagnostics under the Privacy Policy before onboarding acceptance on October 18. Review matching notices, provider settings and applicable requirements for that scope before activation; no legal receipt is recorded or used to gate this narrow diagnostics path.
- On October 19 Anthony selected Vercel with an automatically assigned `.vercel.app` address for the legal reader. No custom domain is needed now. The text is approved; final effective versions/date and publication verification remain open. No paid-plan purchase is authorized.
- On October 19 Anthony approved the drafted Privacy Policy/Terms. His October 20 directions exclude EU App Store countries, the UK, Norway, Iceland and Liechtenstein from the initial paid release, superseding the earlier worldwide target. Do not request those settled choices again. Phase 14 must apply/verify the actual country selection; EU public trader contacts are deferred until any EU expansion. Final publication metadata and applicable regional/provider conditions remain open.
- Anthony then chose to keep the site local and wait until closer to launch to pay for hosting. Preserve publication, public-link checks and the matching API/mobile rollout as open Phase 14 preparation when he is ready; keep the effective date pending. This is an explicit publication deferral, not passing public-hosting evidence or approval to purchase a plan.
- Anthony later rejected receipt/version tracking on October 19. The Terms page now provides ordinary links and Continue-based account creation, with no legal-view/agreement record, acceptance request or version-driven gate. The earlier matching-version test-server repair is superseded by the removal described in the Phase 10 handoff. The legal website remains local; public links and release verification remain open.
- The owner also requested plain document pages: remove the Legal landing page, top tabs and visible approval/preview/version/pending-date metadata. Keep `/privacy/` and `/terms/`, render Privacy at the base address, and retain source approval/date validation internally.
- October 20 review outcomes are recorded in [LEGAL_REVIEW](../legal/LEGAL_REVIEW.md): retain the standard Apple license/18+/individual-operator assessment; clarify the license relationship; leave only specific provider, sensitive-data and territorial conditions open. Vercel's sensitive-data restriction is separate from its paid-plan coverage. The later owner reply explicitly excludes the UK/non-EU EEA initially and declines the Vercel email; retain the draft unsent and defer those regional expansion requirements. JustGO's project-specific future model-training sharing was disabled and verified; team defaults/other projects were left alone. No provider contact, App Store configuration change or new collection workflow occurred.
- Acceptance: PRD §8, AC-15–16 · applicable privacy and iOS release-disclosure acceptance
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Continue from the existing [data inventory](../legal/DATA_INVENTORY.md), [Privacy Policy draft](../legal/PRIVACY_POLICY_DRAFT.md), [Terms draft](../legal/TERMS_DRAFT.md) and [review checklist](../legal/LEGAL_REVIEW.md); retain the earlier drafting/research evidence. Resolve the review notes with the owner and applicable reviewer rather than claiming worldwide sufficiency from a draft.
- Resolve operator/jurisdiction/contact details, individual-versus-legal-entity eligibility, regional rights/processing/transfer/provider-agreement review, intended 18+ treatment and Terms/Apple EULA compatibility. Record decisions and any remaining release conditions with an owner and Phase 14 gate.
- Reconcile collection, providers/regions, purposes, consent, export, deletion/revocation, pending cleanup and retention/backup behavior with the verified implementations. Phase 08 owns deletion/storage mechanics, Phase 10 acceptance and Phase 11 app diagnostics; this phase documents those results without inventing a deletion deadline or retention guarantee. Describe PostHog product analytics as disabled for launch, keeping its future scope in Phase 15.
- Align the Terms & Privacy page, development document routes and public notices with actual collection. Keep ordinary links and Continue-based account creation without legal-view/agreement tracking or accepted-version gates. Public document labels are independent of account behavior. Product analytics remains disabled; future activation requires a separately reviewed permission/collection design. Preserve recovery, retry and saving safeguards.
- Reconcile the backup wording with the actual selected plan. The current Free project has no included automatic daily Supabase backups; the earlier seven-day target requires a configured Pro project and is not a current guarantee or purchase authorization. Actual launch infrastructure/restore acceptance remains in Phase 14.
- Write the retention section from the recorded owner decision [retention defaults](../DECISIONS.md#october-16-codebase-assessment-follow-up): immediate deletion of account activity; permanent minimal pseudonymous deletion/revocation records with no journal/reflection content; honest treatment of operational copies/backups; short server-log retention without private content in application logs; support emails deleted after 12 months unless still open; and verified Sentry retention before activation. Do not promise a PostHog retention period while collection is disabled; Phase 15 must review and configure it before activation.
- Prepare final readable public text, remove draft/review placeholders, set the approved version/effective date and obtain owner content review. Follow the [publication sequence](../legal/LEGAL_REVIEW.md#publication-sequence).
- Prepare a simple public static site with stable HTTPS Privacy/Terms routes and the selected host/domain. Publish only after the separate owner content/hosting approval, preserve protected API preview settings and verify anonymous phone access. Configure and verify Settings/legal links, including existing link-opening failure feedback and relevant native surfaces.
- Prepare App Privacy, age/eligibility, contact/support and Terms/EULA disclosure answers from the actual inventory and enabled vendors. Phase 14 verifies the final signed bundle's privacy manifests/required-reason APIs and tracking/ATT assessment, and enters/submits final App Store metadata. Record discrepancies as open release tasks, not completed disclosure evidence.
- Keep the free-beta notices accurate while billing is inactive. When 07A activates, reconcile the paid offer, billing providers, subscription-management/deletion explanation and any changed collection before Phase 14 paid launch. Future analytics/vendor changes require revisiting the notice and consent, rather than silently reusing old wording.
- Record the technical assessments from the codebase review: retain the static `/openapi.json` description [SEC-4] and the current iOS Data Protection baseline [SEC-5]. No additional journal vault is an established default requirement. Phase 14 must verify actual signed-build file protection and backup exclusion/failure behavior; address concrete gaps if found. See the [October 19 review](../DECISIONS.md#october-19-phase-12-public-drafts-and-local-protection-review).

## Keep out

- No implementing account deletion/analytics anew, unverified provider or legal guarantees, unnecessary new onboarding/identity collection, or enabling extra services through policy wording.
- No TestFlight/App Store submission, signing changes or billing activation. Public-site and Git publication retain their existing separate approval requirements.

## Ready to hand off when

- [ ] Inventory and approved Privacy Policy/Terms match the verified beta behavior; draft placeholders and unresolved publication-blocking decisions are removed or explicitly resolved.
- [x] The concise Terms-page summary and document links align with the reviewed public notices and preserve ordinary account creation/recovery without legal tracking. The linked Privacy Policy explains actual processing and disabled analytics/diagnostics; the owner removed those sections and the development-release notice from entry. Phase 15 must review any future permission/collection design. Public publication and signed-release verification remain open.
- [x] Operator/contact, eligibility/regional, provider, retention/deletion and Terms/EULA review outcomes are recorded in the October 20 review, with specific unresolved conditions and owners. This records the assessment; it does not close the remaining publication/territorial/provider conditions. Final-build/paid-stage tasks remain in Phase 14/07A.
- [ ] Public hosting/content publication is authorized and both stable HTTPS pages are readable without login; in-app links and failure handling have passing evidence on the applicable surfaces.
- [x] Release-disclosure preparation is consistent with the inventory/public notices; final signed-bundle and App Store submission checks remain explicitly assigned to Phase 14.
- [x] Billing-activation notice/disclosure updates are recorded as a 07A/14 pre-paid-launch gate, without blocking honest free-beta documents on inactive billing.
- [x] Local-preparation handoff and index record approved source text, actual evidence and owned open gates. Publication URLs/effective dates remain owner-deferred to Phase 14; local-journal implementation and revised notices belong to Phase 13.

## Handoff to Phases 13 and 14

- Phase 13 implements the owner's October 20 local-only feelings/text decision
  and manual iCloud Drive backup/restore, then reconciles entry copy, privacy
  sources and provider/regional assessments with actual behavior. No app storage
  change, new public claim or deletion of legacy cloud content happened here.
- Supabase API migration is no longer the planned prerequisite: verify the
  reduced Vercel/Supabase processing after Phase 13. Retain the alternative
  assessment if a concrete remaining hosting condition requires it.
- Keep the prepared consumer-health supplement conditional on reassessment of
  actual local processing and residual online data; do not automatically add a
  third public page. Legacy cloud copies retain their applicable removal/expiry
  obligations. Support and general provider safeguards remain relevant.

### Open release gates for Phase 14

- Verify published disclosures against the signed bundle and any activated billing/provider changes.
- Verify the Phase 13 post-cutover payloads, historical-copy handling and matched
  public notices before real testers. Preserve JustGO's opt-out and no-contact
  direction. Commercial plan eligibility is separate from private journal flow.
- Complete the resulting applicable regional/request/provider conditions from
  Phase 13's reassessment. UK/non-EU EEA expansion remains deferred; preserve the
  credential safeguards and absence of legal tracking.
- Verify the selected launch backup configuration/retention and final App Store privacy/manifest/eligibility answers. The existing paid-launch Pro requirement remains in Phase 14; no plan upgrade is authorized here.
