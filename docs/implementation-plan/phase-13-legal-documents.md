<a id="phase-13"></a>

# Phase 13 — Legal documents & release disclosures

**Status:** Data inventory, Privacy Policy and Terms drafts prepared — review, finalization and publication remain open

## Outcome

Approved public Privacy Policy/Terms and release-disclosure preparation accurately describe the free beta and its enabled services.

## Decisions in force

- Dependencies: 08 for verified data-control/retention behavior, 09 for local deck/venue facts, 10 for onboarding acceptance, 11 for analytics and 12 for diagnostic collection/provider configuration. Review can begin alongside implementation; final notices must describe the verified release behavior.
- Acceptance: PRD §8, AC-15–16 · applicable privacy and iOS release-disclosure acceptance
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Continue from the existing [data inventory](../legal/DATA_INVENTORY.md), [Privacy Policy draft](../legal/PRIVACY_POLICY_DRAFT.md), [Terms draft](../legal/TERMS_DRAFT.md) and [review checklist](../legal/LEGAL_REVIEW.md); retain the earlier drafting/research evidence. Resolve the review notes with the owner and applicable reviewer rather than claiming worldwide sufficiency from a draft.
- Resolve operator/jurisdiction/contact details, individual-versus-legal-entity eligibility, regional rights/processing/transfer/provider-agreement review, intended 18+ treatment and Terms/Apple EULA compatibility. Record decisions and any remaining release conditions with an owner and Phase 14 gate.
- Reconcile collection, providers/regions, purposes, consent, export, deletion/revocation, pending cleanup and retention/backup behavior with the verified implementations. Phase 08 owns deletion/storage mechanics and Phases 10–12 own acceptance, analytics enforcement and app diagnostics; this phase documents those results without inventing a deletion deadline or retention guarantee. Planned/inactive services must be described honestly.
- Before writing the backup period, confirm the production database will run on the Supabase Pro plan: Pro keeps 7 days of daily backups, which Phase 08 recorded, while Free projects have no Supabase backups.
- Write the retention section from the recorded owner decision [retention defaults](../DECISIONS.md#october-16-codebase-assessment-follow-up): immediate deletion of account activity; a permanent minimal deletion record with no personal content; deleted data leaving backups within the backup period Phase 08 confirmed; short server-log retention with no private content; support emails deleted after 12 months unless still open; and the analytics period Phase 11 configures.
- Prepare final readable public text, remove draft/review placeholders, set the approved version/effective date and obtain owner content review. Follow the [publication sequence](../legal/LEGAL_REVIEW.md#publication-sequence).
- Prepare a simple public static site with stable HTTPS Privacy/Terms routes and the selected host/domain. Publish only after the separate owner content/hosting approval, preserve protected API preview settings and verify anonymous phone access. Configure and verify Settings/legal links, including existing link-opening failure feedback and relevant native surfaces.
- Prepare App Privacy, age/eligibility, contact/support and Terms/EULA disclosure answers from the actual inventory and enabled vendors. Phase 14 verifies the final signed bundle's privacy manifests/required-reason APIs and tracking/ATT assessment, and enters/submits final App Store metadata. Record discrepancies as open release tasks, not completed disclosure evidence.
- Keep the free-beta notices accurate while billing is inactive. When 07A activates, reconcile the paid offer, billing providers, subscription-management/deletion explanation and any changed collection before Phase 14 paid launch. Future analytics/vendor changes require revisiting the notice and consent, rather than silently reusing old wording.
- Decide two open disclosure questions from the codebase assessment. First, whether production keeps publishing the full API description at `/openapi.json` [SEC-4]. Second, whether private reflections may stay in unencrypted AsyncStorage protected only by iOS default data protection, as `legal/DATA_INVENTORY.md` records, or need a Keychain-keyed encrypted journal before release [SEC-5]. Record each decision, and any implementation task it creates, with an owner phase.

## Keep out

- No implementing account deletion/analytics anew, unverified provider or legal guarantees, unnecessary new onboarding/identity collection, or enabling extra services through policy wording.
- No TestFlight/App Store submission, signing changes or billing activation. Public-site and Git publication retain their existing separate approval requirements.

## Ready to hand off when

- [ ] Inventory and approved Privacy Policy/Terms match the verified beta behavior; draft placeholders and unresolved publication-blocking decisions are removed or explicitly resolved.
- [ ] Operator/contact, eligibility/regional, provider, retention/deletion and Terms/EULA review outcomes are recorded; any final-build/paid-stage conditions have an owner and open Phase 14/07A task.
- [ ] Public hosting/content publication is authorized and both stable HTTPS pages are readable without login; in-app links and failure handling have passing evidence on the applicable surfaces.
- [ ] Release-disclosure preparation is consistent with the inventory/public notices; final signed-bundle and App Store submission checks remain explicitly assigned to Phase 14.
- [ ] Billing-activation notice/disclosure updates are recorded as a 07A/14 pre-paid-launch gate, without blocking honest free-beta documents on inactive billing.
- [ ] Save the phase handoff with approved versions/URLs, review decisions, verification evidence and remaining release conditions; link it from the handoff index.

## Open gates for Phase 14

- Verify published disclosures against the signed bundle and any activated billing/provider changes.
- Confirm production Pro backup configuration and final App Store privacy/manifest/eligibility answers.
