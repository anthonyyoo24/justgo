# JustGO legal review and publication

Phase [12](../implementation-plan/phase-12-legal-documents.md) owns legal text, Terms/Privacy presentation, public hosting and disclosure preparation. This record separates researched requirements, verified implementation and unresolved approval. It is not a legal opinion or evidence of worldwide compliance.

## Current review package

Prepared October 18 and revised October 20, 2026: [inventory](DATA_INVENTORY.md), [Privacy Policy candidate](PRIVACY_POLICY_DRAFT.md), [Terms candidate](TERMS_DRAFT.md), [release-disclosure worksheet](RELEASE_DISCLOSURES.md) and the [local static site](../../sites/legal/README.md). October 9 drafting/research is retained in the initial source history and primary references below. The October 18 pass reconciles it with Phases 08–11; the October 19 pass adapts the public presentation after competitor research. October 20 records the owner-directed EU/UK/non-EU EEA exclusions, declined Vercel email, current provider terms/settings and bounded Apple/regional assessments. The only public-text adjustment in this review clarifies the existing supplementary relationship to Apple's standard license; processing claims and service activation remain unchanged.

Youngshin Yoo confirmed Ontario, Canada on October 18. The existing temporary public privacy/support contact is anthonyyoo24@gmail.com (owner-selected October 9). The intended audience remains adults 18+. Anthony's October 20 directions exclude EU countries, the UK, Norway, Iceland and Liechtenstein from the initial paid App Store release, superseding the October 19 worldwide target; applicable review for actual distribution and processing remains open. No public address, telephone or representative has been supplied. Do not infer permission to publish a home address. On October 19 Anthony selected Vercel with an automatically assigned `.vercel.app` address; a custom domain is not needed now. Anthony approved both public documents on October 19; the effective date, final version identifiers and actual published URLs remain pending.

Terms and Privacy retain their document labels independently of account behavior. Anthony’s later October 19 direction removes all document-view/agreement receipts, accepted-version persistence and legal acceptance APIs. Continue performs ordinary account creation. Historical agreement records are removed through forward migration 0018 without changing journal or identity data. Public publication/effective dates remain pending; a document label is not a per-user acceptance record.

Both public text blocks are free of internal review placeholders. Review/publication metadata lives outside them. `npm run build:legal` produces plain local Privacy and Terms pages; approval status, versions and pending dates stay in source metadata. A production build refuses unapproved metadata or a missing effective date. No final public URL is invented or set in the app. The Terms & Privacy entry has no development notice; guarded API fallback pages retain their own development label. Production has no fallback to those pages or Apple's EULA for the JustGO service terms.

Anthony confirmed paid access from the first public App Store release on October 19.
The approved text describes the earlier free beta; 07A/13 must update it for the
actual paid offer, billing processing and enabled providers before store launch.
Commercial hosting must be eligible before that rollout, not after customers
arrive. The initial release excludes EU App Store countries, the UK, Norway,
Iceland and Liechtenstein by the October 20 owner directions. Apple's trader-status declaration remains required; verified
public EU trader contacts are deferred until any later EU expansion. Apple permits
an address or P.O. box plus phone/email for individual traders; paid access and
intended commercialization are relevant to the owner's trader self-assessment.
No private address or number may be inferred or published. Phase 13 must set and
verify actual country availability; no App Store setting was changed here.

Anthony chose to wait until closer to launch to pay for hosting and keep the
website local. Publication is therefore owner-deferred. Keep the approved text,
selected Vercel-generated address and pending effective dates; resume public-site,
link and release rollout work in Phase 13 preparation when he is ready.
No legal-site deployment or paid-plan purchase is authorized. The separately
approved test-API repair above does not change this publication deferral. Existing
regional, provider and native conditions remain open before their dependent release/use.

## Review outcomes and remaining conditions

| Topic                          | October 20 outcome                                                                                                                                                                                                                                                            | Remaining action / owner                                                                                                                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator, age and app license  | Ontario personal operator/email and 18+ are settled. Standard Apple EULA plus supplementary service Terms retained, with license precedence clarified. No established reason to require incorporation, birth-date collection or a custom EULA now.                            | Phase 13 verifies the real product description, default-EULA selection, rating questionnaire/override and Apple's eligibility decision.                                                                                       |
| Regional scope                 | Product review found ordinary social practice without health scoring. Unrestricted submitted text can nevertheless reveal health. Conservative consumer-health handling is recommended for US journal submissions; a supplement and request procedure are prepared below.     | Implementation owner prepares the specific controls; Phase 13 verifies provider deletion and applies the settled country exclusions. Adding a distinct health-policy link needs owner review of the prepared proposal.        |
| Provider protection            | Supabase's incorporated DPA contemplates sensitive data. Vercel Pro addresses commercial/DPA eligibility but retains its sensitive-data restriction; its HIPAA exception is not a general consumer-journal exception.                                                         | Implementation owner assesses Supabase-hosted API compatibility as an alternative before seeking a migration decision. No contact or purchase is needed for that assessment; no migration is selected.                        |
| Provider data use              | JustGO's project-specific model-training sharing was disabled October 20 and verified after reload. Team defaults/other projects were left alone. The opt-out concerns future code/chat sharing; journal-payload exclusion is not established. IP visibility remains enabled. | Preserve the opt-out. Map actual processing/logging/recovery copies for the chosen API host. Research cannot invent a Vercel exception; the alternative assessment does not depend on contacting Vercel.                      |
| Retention, backups and support | Active deletion and retryable phone cleanup are implemented. Recovery-copy expiry and actual inbox operation are unverified. The approved source overstates control over provider-copy removal; a replacement is prepared below.                                              | Implementation owner verifies provider deletion/expiry and rehearses restoration in Phase 13. Anthony operates or assigns the support inbox before users; the existing 12-month choice does not need another policy decision. |
| Sentry                         | Ordinary delivery remains off and the public policy says so. The narrow startup product scope does not settle lawful basis, DPA acceptance, ingestion retention or device-access rules.                                                                                       | Resolve these only before activation, including a matching policy update and Phase 13 signed-build checks. Disabled reporting does not require activating Sentry to finish local legal work.                                  |
| EU trader contacts             | Deferred by the owner's initial EU exclusion. No home address or phone is inferred.                                                                                                                                                                                           | Phase 13 completes Apple's declaration and actual storefront settings; verify public trader contacts before any EU expansion.                                                                                                 |
| Public API description [SEC-4] | Engineering assessment resolved: retain static `/openapi.json`; it contains contracts, not private records or credentials.                                                                                                                                                    | Preserve authentication/ownership checks. No API behavior changed.                                                                                                                                                            |
| Local journal [SEC-5]          | Engineering assessment resolved: retain iOS Data Protection. No concrete finding requires a second vault or MMKV migration.                                                                                                                                                   | Phase 13 inspects actual signed-build file protection and backup behavior, then remediates any specific gap.                                                                                                                  |
| Public hosting                 | Text approved, Vercel-generated address chosen, publication/paid hosting explicitly deferred.                                                                                                                                                                                 | Phase 13 preparation finalizes dates/URLs and verifies public HTTPS/app links when Anthony resumes hosting. No deployment or purchase authorized.                                                                             |

## Apple and regulator research

Primary guidance checked October 9 and rechecked October 18; the Apple/license,
age and focused regional assessments below were refreshed October 20, 2026:

- [Apple App Review §5.1.1](https://developer.apple.com/app-store/review/guidelines/#data-collection-and-storage): accessible in-app/metadata policy; collection/use, sharing, equivalent provider protection, retention/deletion, consent and withdrawal. §5.1.1(ii)'s exception requires compliance with the applicable law, not merely calling diagnostics essential. §5.1.1(ix) addresses sensitive-information/legal-entity eligibility.
- [Apple security](https://developer.apple.com/app-store/review/guidelines/#data-security) and [App Transport Security](https://developer.apple.com/news/?id=jxky8h89): protect user data and hosted connections. These sources do not prescribe a Canada-only hosting vendor or a universal additional journal-vault implementation.
- [Apple App Privacy](https://developer.apple.com/app-store/app-privacy-details/): server persistence for app functionality counts as collection; include SDK partners. Generic free-form text uses Other User Content rather than every possible topic. Feeling categories require contextual assessment. Labels, actual notices and binary behavior must agree.
- [Apple account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/): in-app deletion also applies to automatically created accounts; support email alone cannot replace it. Subscription cancellation is separate when billing is active.
- [Apple license setup](https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement/) and [standard EULA](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/): use the standard license unless a reviewed custom one is supplied; do not treat its technical-data clause as blanket privacy consent.
- [Apple age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/) and [EU trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/): final questionnaire, higher age override and applicable verified public trader contacts remain actual App Store tasks.
- [OPC PIPEDA overview](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/), [meaningful consent](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/) and [cross-border outsourcing](https://www.priv.gc.ca/en/privacy-topics/employers-and-employees/outsourcing/02_05_d_57_os_01/): assess actual commercial activity, contextual sensitivity, optional processing, accountability and foreign processing safeguards. Not requiring a name does not anonymize the journal.
- [EU GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), especially Articles 3, 6, 9, 11–13, 27–28 and 44 onward: scope, bases/special categories, identification limits, transparency, representatives, processors and transfers. [Commission grounds](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/legal-grounds-processing-data_en) and [CNIL mobile guidance](https://www.cnil.fr/sites/default/files/2025-05/recommendation-mobiles-app.pdf) support a separate necessity/terminal-access assessment.
- [ICO storage/access exceptions](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/): technical-fault prevention can qualify in a proportionate requested-service context; Sentry has no automatic blanket exemption. [ICO UK guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/) and [California applicability](https://oag.ca.gov/privacy/ccpa) are regional starting points, not assertions that every statute applies.

[Termly](https://termly.io/products/privacy-policy-generator/) and [iubenda](https://www.iubenda.com/en/privacy-and-cookie-policy-generator/) remain optional drafting resources from the earlier review. No generator output, competitor screenshot or general Terms acceptance establishes App Store approval or worldwide sufficiency.

### Apple assessment

October 20 assessment: retain Apple's standard EULA, supplementary service Terms,
18+ audience and the current individual-operator implementation assumption. The
Terms now expressly preserve Apple's precedence for the app license. No direct
conflict was found in the existing service/content/deletion provisions. This is a
reasoned compatibility assessment, not an App Review eligibility determination.
Optional, nonclinical entries support the current approach; §5.1.1(ix) does not
provide a journal-specific bright line that conclusively clears this app or
automatically requires incorporation. Actual rating/override and App Store setup
remain Phase 13 tasks; no new identity collection or custom EULA is needed now.

Section 5.1.1(i) also expects the policy to confirm comparable protection by
receiving third parties. The provider list alone does not say that. After the
actual arrangements support it, add and review this narrow public statement:

> We require service providers that handle personal information for us to protect
> it consistently with this policy and applicable requirements.

Do not insert that assurance while Vercel's processor/sensitive-data scope remains
unresolved. It is a conditional publication correction, not a current safeguard
or permission to accept a provider agreement.

### Regional assessment

The October 20 review narrows the remaining questions; it does not certify every
remaining intended country. The owner subsequently excluded the UK, Norway,
Iceland and Liechtenstein initially; their expansion requirements below are
retained for later review, not initial-release territory decisions still awaiting
an answer. No App Store setting was changed.

- **Canada:** the policy covers the operator/contact, optional cloud journal,
  purposes, recipients, foreign processing, retention and controls. OPC
  [meaningful-consent guidance](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/)
  requires a contextual sensitivity assessment. For the current requested cloud
  journal, the prominent notice explicitly identifies uploaded activity, feelings
  and reflections; fields are optional and submission is deliberate. The bounded
  assessment supports that notice plus the voluntary save action for this disclosed
  purpose. No new checkbox or receipt system is proposed. This does not authorize
  unrelated profiling, advertising or future AI use. Phase 13 verifies the actual
  notice/save flow on the signed build. [Cross-border guidance](https://www.priv.gc.ca/en/privacy-topics/airports-and-borders/gl_dab_090127/)
  allows accountable outsourcing for the disclosed purpose; Canada-only hosting
  and separate transfer consent are not universal requirements. Existing named
  operator/email is the contact; no rule identified here establishes a universal
  need to publish a home address.
- **UK / non-EU EEA — deferred expansion:** the owner explicitly excluded the UK,
  Norway, Iceland and Liechtenstein initially in his October 20 reply.
  [UK territorial scope](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/personal-information-what-is-it/who-does-the-uk-gdpr-apply-to/)
  and [EEA GDPR incorporation](https://www.efta.int/media-resources/news/general-data-protection-regulation-gdpr-entered-force-eea)
  mean EU exclusion alone does not settle these markets. If targeting rules
  apply, the ongoing journal service is difficult to classify as only occasional
  processing for the representative exception. Resolve any required UK/EEA
  representative, purpose-specific lawful bases and actual transfer safeguards
  before that availability. The generic rights paragraph is not sufficient for
  the [required privacy information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/).
  A contract basis for requested storage does not replace a separate condition
  where submitted text reveals [special-category information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-conditions-for-processing/).
  Do not invent bases/representative contacts or restore legal tracking. Review
  these requirements before any proposed expansion; the initial exclusion choice
  is settled.
- **United States:** the [PRD](../product/PRD.md), challenge catalog and reflection
  flow describe social practice, five retrospective worse/same/better choices and
  optional free text. There is no clinical score, diagnosis, HealthKit collection
  or health-based personalization. Ordinary completions and generic feeling
  choices are not automatically health records. However, linked free text can
  directly reveal mental or physical health under Washington's
  [definitions](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.010).
  **Recommended disposition:** handle submitted journal content conservatively
  under consumer-health protections without inspecting users' writing to classify
  it. This is a product risk assessment, not a finding that every entry is health
  data or an owner-approved new product feature. The concrete proposal follows.
  Necessary saving explicitly requested by the user has a
  [requested-service exception](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.030);
  purpose-limited processors are separately treated in the definitions. This does
  not itself require legal receipts, a blanket checkbox or removal of cloud saving.
  Nevada's [different health-status purpose test](https://www.leg.state.nv.us/NRS/NRS-603A.html)
  is less clearly triggered without health inference; apply the same protective
  handling to health-revealing submissions rather than claiming an exemption.
  No known facts establish a [CCPA applicability threshold](https://www.cppa.ca.gov/faq.html).
  Reassess on material business/scale changes. Separately, California's
  [mobile-policy guidance](https://oag.ca.gov/news/press-releases/attorney-general-kamala-d-harris-launches-new-tool-help-consumers-report)
  applies beyond those thresholds: finalize the effective date, explain how
  changed policies are announced, and describe actual cross-service tracking.
  No such tracking is implemented; do not invent a Do Not Track mechanism.

These research and drafting tasks belong to the implementation owner, not to
Anthony as unanswered legal questions. Provider retention facts still require
evidence, and a new hosting arrangement or public page needs the existing owner
review. UK/non-EU EEA requirements remain deferred until proposed expansion.

### Prepared consumer-health supplement

**Washington-specific proposal for owner review; not published or added to navigation.** Washington
[RCW 19.373.020](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.020)
requires its notice to have a prominent homepage link; the Attorney General's
[guidance](https://www.atg.wa.gov/protecting-washingtonians-personal-health-data-and-privacy)
explains the distinct-policy requirement. This is the specific reason to propose
one additional link despite the earlier preference for only Privacy and Terms.
The following text must use the final supported providers before publication:

> **Consumer Health Data Privacy Notice**
>
> JustGO is operated by Youngshin Yoo in Ontario, Canada. When you choose to save
> them, we collect your feeling selection and written reflection. Your writing may
> contain information about your physical or mental health. Associated challenge,
> venue category, date and account information connects an entry to your history.
> The source is information you submit through JustGO.
>
> We use this information to save, display, synchronize, recover, export and delete
> the journal you request. JustGO does not diagnose your health or use journal
> content for advertising. We do not sell it or share it with affiliates or
> non-service partners. Vercel currently runs the API and Supabase stores the
> database; they process submissions to provide those services.
>
> You may leave feelings and reflections blank. Settings provides Export my data
> and Delete account. For access, correction, deletion, withdrawal of collection
> permission or information about recipients, email anthonyyoo24@gmail.com. We
> verify account authority without asking you to email recovery secrets. To
> appeal a request decision, reply with “Privacy appeal”. If an appeal is denied,
> we explain why and provide the Washington Attorney General's complaint route.

The provider sentence above must match the final API host; it is a review
candidate, not clearance of the current Vercel arrangement. No fixed recovery-copy deadline enters public
text until a supported deletion path is evidenced. The request procedure below
must be operational before publishing its promises. This proposal does not
activate diagnostics, analytics, AI or a new consent-recording mechanism.

The quoted notice is Washington-specific. Applying the same conservative approach
in Nevada also needs the [NRS 603A.495 notice topics and .515–.520 procedure](https://www.leg.state.nv.us/NRS/NRS-603A.html):
the implementation owner prepares those adaptations, including active deletion
within 30 days after authentication and Nevada Attorney General contacts after
a denied appeal. The Washington paragraph alone does not establish Nevada
coverage, and the general request-response period does not replace that deletion
deadline. No regional drafting question is assigned to Anthony.

### Retained security records

The implementation retains account/credential identifiers, relevant timestamps
and digests so old recovery material cannot recreate a deleted account. Recovery
credentials are long-lived; expiring the markers on an arbitrary calendar date
would remove that protection. The deletion timestamp/session digest also makes a
lost-response retry return the same deletion outcome. See the
[identity boundary](../architecture/IDENTITY.md#iphone-storage-and-browser-preview)
and [deletion implementation](../../apps/api/src/identity/delete-account.ts).
No journal content is retained in these markers, and the runtime cannot delete
them. These facts support the engineering purpose, not a claim that permanent
personal-data retention is automatically proportionate in every jurisdiction.
Removing an old credential marker could allow a revoked proof to bootstrap a new
empty account; it does not by itself restore the deleted journal. Keep this
distinction when explaining the protection.

Current disposition: retain the approved limited security records for the
specific credential-reuse and deletion-retry functions above; no arbitrary expiry
is introduced. The implementation owner must reassess when those functions or
the credential protocol change. If the
credential/bootstrap protocol is later retired, review whether the corresponding
markers can be removed without resurrection or restore risk. No expiry rule,
scheduled review already in operation or schema change is claimed here.

## Hosting agreements and recovery copies

Official terms rechecked October 20 clarify the actual questions rather than
assuming every provider needs a separately signed PDF. Vercel's Terms page is
updated October 19; its DPA is dated March 17, effective March 31. Supabase's
current DPA is dated August 1, 2026.

- The separate legal reader can use Vercel's automatically assigned
  [`.vercel.app` domain](https://vercel.com/docs/domains/working-with-domains);
  buying a custom domain is optional. However, [Hobby fair use](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)
  permits only personal, non-commercial use and defines commercial use by the
  purpose of financial gain. Technical capacity for two static documents does
  not establish eligibility for a future paid app's legal site. Clarify that
  applicability or select hosting that permits the intended use before choosing
  the public destination; no upgrade or hosting purchase is authorized.
- [Supabase Terms §7(b)](https://supabase.com/terms) incorporates its
  [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum).
  The DPA forms part of the agreement and §12.2 gives agreement acceptance the
  effect of signing applicable SCCs. Confirm the actual customer/applicable
  account terms; a missing separate signature alone is not an established gap.
  The DPA has no stated Free-plan exclusion. Section 4 permits sensitive-data
  processing subject to lawful handling, notices and necessary explicit consent;
  it does not establish that JustGO's current notice resolves every sensitive
  submission. HIPAA-defined protected health information needs a separate BAA;
  an ordinary consumer journal is not automatically subject to HIPAA.
- [Vercel Terms §11.1](https://vercel.com/legal/terms) incorporates its
  [DPA](https://vercel.com/legal/dpa), but that DPA's processor application
  expressly covers Enterprise and Pro customers. The observed Hobby plan cannot
  be marked covered from incorporation alone. Clarify the applicable processor
  arrangement and Schedule 1's sensitive-data restriction for the actual journal
  scope before real-user hosting. Request-body transit is processing even when
  the database is elsewhere. A generic optional reflection is not automatically
  a special category, but users can reveal health, beliefs or other sensitive
  information. Buying Pro alone does not settle the restriction.
- Vercel's [March 2026 terms explanation](https://vercel.com/changelog/updates-to-terms-of-service-march-2026)
  describes model-training use on Hobby/trials and an opt-out. Its listed scope
  includes code/agent chats, deployment errors and aggregate traffic statistics;
  it does not establish that journal text is used for training. October 20
  side-panel team settings initially showed sharing enabled. JustGO's own
  Project Settings → Data Preferences also showed **Improve models with this
  project’s data** enabled. The narrower project opt-out was saved and verified
  disabled after reload; team settings and other projects were left alone. The
  official FAQ supports this project-level control. It prevents future sharing
  within that control's scope, not past use or all provider system-data use.
- [Supabase pricing](https://supabase.com/pricing) lists API/database log retention
  as one day on Free and seven days on Pro; Vercel's published Hobby runtime-log
  limit is one hour. These are specific log products, not an expiry promise for
  all infrastructure/security records.
- Free lacks the included automatic daily backups described in
  [Supabase's backup documentation](https://supabase.com/docs/guides/platform/backups),
  but [paused Free projects](https://supabase.com/docs/guides/platform/free-project-pausing)
  can be recovered for up to a year from retained provider backups. Do not equate
  no daily-backup entitlement with no provider copies. The candidate makes no
  fixed expiry promise, but its claim that we remove provider-controlled copies
  when no longer needed goes beyond verified operator control.

Supabase DPA §11.2's 30-day export-request window concerns agreement termination,
not expiry of a deleted user's rows in a continuing project. The published backup
access periods likewise do not establish every recovery copy's expiry. Replace the
unsupported removal assurance in the unpublished policy before publication; the
candidate below does not replace the actual deletion requirement. Keep operator exports access-restricted,
give them a purpose/expiry, and reconcile deletions/revocations before reopening a
restored database. No new backup service or purchase was selected.

Supabase's October 6 [data residency/deletion FAQ](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq)
also ties backup retention to the plan and describes project deletion within
30 days. That is useful provider evidence, but whole-project deletion is not a
per-account erasure process for an ongoing shared database. Confirm the actual
configured backup/expiry path and operator exports; do not use either the
termination window or whole-project deletion as the journal-row deadline.

### Hosting recommendation without provider contact

The research establishes a usable distinction: Supabase's DPA expressly
contemplates sensitive submissions subject to the customer's safeguards;
Vercel's standard Pro DPA prohibits sensitive Customer Data. Do not mark Pro
alone suitable for unrestricted private journals or describe this as a confirmed
violation by every ordinary reflection. Anthony declined contact; no provider
answer is being awaited as the only way forward.

Vercel does publish a [HIPAA arrangement](https://vercel.com/kb/guide/hipaa-compliance-guide-vercel)
and a [BAA that amends the service agreement](https://vercel.com/legal/baa).
It is for covered entities/business associates and HIPAA-defined PHI, not a
blanket consumer-journal exception. JustGO's facts do not establish that status;
do not recommend buying the add-on or treating ordinary Enterprise as clearance.

**Recommended alternative to assess:** iPhone → Supabase Edge Functions → the
existing private Supabase database. Official documentation supports
[API routing](https://supabase.com/docs/guides/functions/routing),
[Postgres connections](https://supabase.com/docs/guides/functions/connect-to-postgres)
and [custom handler authentication](https://supabase.com/docs/guides/functions/auth).
This can retain server-readable cloud saving, accounts and recovery without
passing journal bodies through Vercel. It is an engineering option, not a selected
host, completed migration or claim that DPA compliance is automatic. Vercel can
separately host public static legal pages on an eligible commercial plan.

The implementation owner must assess the actual Fastify/Node runtime port,
database driver/transaction compatibility, custom session authorization, request
and export limits, logging and execution region before presenting a migration
decision. Keep the restricted runtime role, transaction-local ownership and
locking; never replace them with a public service-role endpoint or move database
credentials onto the phone. A runtime port requires its own focused verification
and staging approval; this research does not authorize a deployment or purchase.

Read-only code assessment finds a **moderate runtime/HTTP port**, not a settings
toggle. Fastify lifecycle/plugins, Pino and the pinned Node dependencies need an
Edge Runtime proof. Services can retain the private schema, contracts, custom
identity, SQL and recovery rules. The current adapter is `pg` with Drizzle's
`node-postgres`, so test it before assuming Postgres.js is a drop-in replacement.
Exports are already paged JSON; the phone creates the ZIP.

Two concrete traps must be covered: custom opaque bearer tokens need verified
handler-owned authentication rather than the default Supabase-JWT gate, and the
mobile client's absolute `/v1/` URLs would discard a `/functions/v1/...` base
path. Preserve the existing origin/path fence and trusted-address rate limits.
The [runtime limits](https://supabase.com/docs/guides/functions/limits), package
bundling, verified TLS/transactions and explicit
[Canada Central invocation](https://supabase.com/docs/guides/functions/regional-invocation)
need evidence; default execution follows the caller and is not automatically in
the database region.

Before choosing migration, prove a local isolated slice against the dedicated
test database: bootstrap/retry, authenticated save/PATCH, paged export and
delete/retry, with cross-account denial, transaction rollback, concurrent writes,
oversized input and redacted errors. No code or data migration was performed in
this assessment. Hosted gateway/region/TLS proof follows only after the hosting
choice and deployment authorization.

### Specific deletion and publication preparation

The remaining tasks are concrete implementation/operations checks:

1. Record the selected processor agreement and actual configuration against
   purpose-limited processing, access restrictions, request assistance and
   deletion obligations ([Washington processor requirements](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.060)).
   Supabase's incorporated DPA covers these subjects; verify the actual account
   terms and recovery-copy path rather than requiring a separate PDF by default.
2. Inventory database recovery copies, any journal-bearing API copies and
   operator exports. For covered health submissions, [RCW 19.373.040](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.040)
   requires recipient deletion notices and permits backup deletion delay of no
   more than six months after authentication. Tombstone replay prevents restored
   active access but is not proof that archived content has been erased. Obtain
   documented expiry/deletion evidence before affected use; an accessible
   seven-day backup list or paid-plan name alone is insufficient.
3. Rehearse a stale synthetic snapshot followed by deletion and isolated restore.
   Reapply current migrations and the preserved deletion/revocation ledger;
   verify deleted journals stay absent and old recovery proofs fail before
   reopening. If the newer ledger is unavailable, keep the service closed. See
   the corrected [restore checklist](../operations/FOUNDATION.md#backup-restore-checklist).
4. Operate the request/support procedure below. Immediate active-service deletion
   and retryable local cleanup already have regression and hosted synthetic
   evidence; do not rebuild them or call them an unanswered legal question.
   Scheduled expired-transfer/rate-bucket cleanup remains a separate Phase 13
   setup task, not the mechanism that deletes journals.

Prepared corrections for the unpublished policy, alongside the health supplement:

- Replace the recovery-copy paragraph with: “Provider-controlled recovery copies
  may temporarily contain older information and follow the provider's retention
  processes. Before returning a restored service to use, we reconcile deletion
  and revocation records so deleted journals do not return to active use.”
- Describe current-phone deletion as removing the account's local journal copies
  and matching credentials. Do not imply remotely wiping exports, offline phones
  or every temporary file; an interrupted ZIP export can leave an app-cache copy
  until the next export.
- Explain that revised policies are published at the Privacy Policy address and
  that material changes receive an in-app notice before the changed processing.
  Configure that notice before making the promise; no email list exists.
- State accurately that JustGO does not use cross-service advertising tracking,
  and review any independently collected provider traffic data against the final
  hosting agreement before asserting that no third party tracks it.

These are prepared revisions, not approval to publish changed content. Keep the
existing effective date pending and source approval history intact. The current
approved block is unchanged by this research; review the prepared changes when
resuming publication rather than requesting approval of unchanged text again.

Montréal API functions and Canada Central database hosting do not establish
Canada-only processing: provider support, network/security processing and recovery
copies have separate scopes. October 20 Vercel Security & Privacy also shows IP
visibility enabled in its dashboard and drains; that is a visibility setting, not
proof of a configured drain or a universal retention period. No request logs or
private journal records were inspected.

The only account-setting change was JustGO's project-specific model-training
opt-out. No contract was accepted, plan upgraded or production configuration
established by this review. Applicable hosting terms/scope and
recovery-copy handling remain concrete pre-real-user deployment conditions; they
are not closed by a draft policy or a local test pass.

### Vercel clarification prepared for the owner

Anthony declined permission to email Vercel on October 20. The following draft
is retained **unsent**; do not contact Vercel unless he later explicitly authorizes
it. Declining contact does not resolve the provider-suitability condition. The
potential destination is **privacy@vercel.com**, published in Vercel's
[Privacy Notice contact section](https://vercel.com/legal/privacy-notice#contact-us). If later authorized, ask that team to route the scope/exception
question to an authorized privacy/contracts contact; ordinary support tickets
are paid-plan access, so no Hobby ticket entitlement is assumed. It was **not
sent**. It includes only the service design, with no journal samples, credentials,
account records or personal user data.

> JustGO is an adult consumer app for everyday social challenges, with optional
> feeling selections and free-text private reflections. It provides no diagnosis,
> treatment or health profiling. Its authenticated API would run on Vercel and
> pass submitted content to a separate Supabase PostgreSQL database. Application
> logs exclude request bodies and journal content. Users could nevertheless write
> about health, beliefs or other sensitive subjects.
>
> 1. Does this use fit DPA Schedule 1 §6.1? If not, is there an available agreement
>    or supported arrangement that permits it?
> 2. Which plan and processor terms cover that arrangement? The current test team
>    uses Hobby; we understand upgrading to Pro alone may not settle data scope.
> 3. What request-body, security-log and recovery-copy processing/retention applies,
>    including after a deletion request? Can journal request payloads enter any
>    secondary use, including model training, and which controls prevent that?

Do not admit real testers on an assumed answer. If Vercel cannot cover this scope,
evaluate another API host without changing the journal's storage model by default.
This condition does not prevent local development or synthetic tests.

## Competitor research and adaptation

Primary documents were read October 19: How We Feel's [Privacy Policy](https://howwefeel.org/privacy)
and [Terms](https://howwefeel.org/terms), plus Stoic's [Privacy Policy](https://www.getstoic.com/privacy-policy)
and [Terms](https://www.getstoic.com/terms-and-conditions). The candidate borrows
their topical organization, not their text or data-handling claims:

- Use a short opening summary, then separate journal/account information,
  information kept on the phone, technical processing, providers, retention,
  controls and contact details.
- How We Feel distinguishes local use from account/cloud processing and separates
  optional research/AI/sharing. JustGO instead uploads submitted journal data to
  its account service; it has none of those optional research/AI/social features.
- Stoic's readable sections and controls are useful examples. Its device/personal
  iCloud journal model and developer-no-access claim do not describe JustGO's cloud
  journal. Its help pages and newer AI policy also differ; do not import a broad
  no-server/no-access promise from one of them.
- Terms cover purpose, eligibility, user ownership, a limited service permission,
  availability and ending use. Retain JustGO's 18+ audience and free beta; do not
  copy foreign dispute clauses, blanket waivers, paid features or competitor
  retention periods.

Inspected Mobbin references were Stoic's [privacy reader](https://mobbin.com/screens/5e6a2d7b-cd5d-41a0-bf2e-8d285848500e)
and [Your Data flow](https://mobbin.com/flows/95f4700e-158b-43a0-b258-1bae72a831a7).
They inform readability and grouping only. A captured switch state does not
establish a default, and neither screenshots nor policies establish a storage
library or need for additional local encryption.

Public prose omits internal test tiers, synthetic-report steps and implementation
details that do not help a user understand processing or choices. Those facts
remain in the inventory and release gates. The draft makes no seven-day backup,
end-to-end encryption, completed provider-contract or worldwide-compliance promise.

## Support requests and inbox retention

The public policy's 12-month support retention rule needs an owner-run inbox
process before real-user support. This procedure is prepared; operation in the
actual Gmail inbox remains unverified:

1. Review incoming privacy requests and record the request date, type, relevant
   response deadline and status in a restricted support record. Assess the
   applicable deadline rather than promising one worldwide period. Keep journal
   contents and authentication/recovery secrets out of that record.
2. Direct users to Settings for export or account deletion where possible. For
   manual help, verify account authority through an appropriate secure process;
   never request a recovery key or session secret by email. A report cannot be
   treated as verified solely because someone supplies an account identifier.
   If a manual request cannot be verified through existing authenticated controls,
   arrange a secure authenticated support route before acting; do not invent an
   operational verification capability or collect recovery secrets as a shortcut.
   Requests can concern narrower deletion, stopping optional collection or
   recipient information, not only whole-account deletion.
3. Record the action and response, then mark the request closed. For any necessary
   legal hold or ongoing request, record the reason, owner and next review date;
   keep an exception only while needed.
4. Review the inbox monthly and remove support messages and attachments older
   than 12 months unless an ongoing request or specific legal obligation requires
   retention. Remove operator-controlled copies and check Gmail Trash expiry;
   preserve the policy's distinction between active data and provider recovery
   copies. Review exceptions again at the next monthly pass.
5. For Washington-covered requests, track 45 days from receipt; authentication
   does not restart or extend that clock. A justified one-time extension of up to
   45 additional days needs notice within the initial period. Give written reasons for
   refusals and accept appeals through the same inbox with “Privacy appeal”.
   Decide appeals within 45 days and include the
   [Attorney General complaint route](https://www.atg.wa.gov/file-complaint)
   when denied. These periods come from [RCW 19.373.040](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.040),
   not a new worldwide response guarantee. Keep the provider deletion/expiry
   record with the request, without copying journal content into the support log.
6. For Nevada-covered requests, track active deletion within 30 days of
   authentication separately from the general request clock. Follow
   [NRS 603A.510–.520](https://www.leg.state.nv.us/NRS/NRS-603A.html) for responses
   and appeals and provide [Nevada Attorney General contact information](https://ag.nv.gov/Contact/Contact/)
   after a denied appeal. Apply the stricter six-month backup target where the
   same submission is handled under the Washington proposal; Nevada's longer
   permitted backup delay does not relax the Washington condition.

The implementation owner prepares and verifies any authenticated manual-request
route. Anthony confirms who monitors the inbox and performs the prepared
procedure before claiming inbox operation has passed. No inbox access,
message deletion, outbound email or recurring automation was performed here.

## Sentry activation notice and request process

The current candidate truthfully describes disabled ordinary reporting. Do not enable Sentry against a policy that says it is off. After basis/agreements/retention and signed-build acceptance, replace that paragraph and deliberately version/review the result. Proposed collection wording for that review:

> To identify crashes and serious technical errors, JustGO sends limited technical reports to Sentry in the United States. Reports include app and operating-system versions and scrubbed technical stack information. They exclude journal text, feeling selections, account identifiers, credentials, breadcrumbs and session recordings. We do not link reports to your JustGO account. Sentry processes connection information needed for delivery; our project disables IP storage.

The final paragraph must also state verified retention, necessary event/release/SDK metadata, relevant rights/basis and the native cache limitation. Native crash files may hold original local crash details until scrubbed delivery on restart; a JS-only flag cannot disable already-enabled native capture. Phase 13 inspects the actual signed build and symbolication.

Do not collect a new account identifier merely to link reports. For a request, assess requester-provided event ID/time and technical details that can identify an issue. Sentry's [erasure guidance](https://www.sentry.help/en/articles/16187006-how-do-i-complete-a-gdpr-erasure-request-for-a-user-in-sentry) describes whole-issue deletion rather than deletion of one error event, and separate backup expiry. Verify authority and process with synthetic data before activation. Account deletion cannot automatically locate these unlinked reports. Never ask users to email recovery secrets or promise account-linked Sentry erasure. Accepting the provider DPA is a separate legally binding owner action; it was not performed.

## Publication sequence

Resume this sequence when Anthony is ready for hosting; it is currently owner-deferred.

1. Resolve the table's applicable publication blockers and review the actual free-beta collection/configuration. Keep ordinary Sentry and product analytics disabled while their activation gates are open; those gates do not require enabling either service to publish an accurate disabled-state policy. Preserve the recorded SEC-4/5 technical assessments and Phase 13 native checks.
2. Review the concrete candidate text/site and disclosure worksheet. Confirm public contacts, territories, versions and effective date; use the selected Vercel-generated address. Preserve the October 19 approval of unchanged text; review materially changed paid/vendor disclosures before use. Do not substitute automated research for applicable legal/privacy review.
3. Set approval/date metadata only after that review, regenerate/check the static output and approve the separate hosting publication. Preserve the API's protected preview settings. Inspect the upload boundary so public pages contain no internal review files or credentials.
4. Publish the standalone static directory to the approved host. Verify both stable HTTPS pages anonymously on a phone; configure `EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_POLICY_URL` only with the real verified destinations. Test Settings/acceptance opening and failures; obtain the actual signed-iPhone link/accessibility evidence in Phase 13.
5. Verify ordinary account creation/retry/recovery and data-control access without legal receipt recording or version gates. Document labels do not require an API acceptance-version rollout. Phase 13 enters App Store metadata after verifying the signed bundle's privacy manifests, required-reason APIs, SDKs, tracking/ATT assessment, rating and eligible operator.
6. Before paid launch, 07A/13 reconcile activated Apple/RevenueCat/billing delivery, offer, cancellation/deletion explanation and changed data. Before Phase 14 analytics, revisit providers, payloads, rights and the actual permission/collection design without backfilling pre-activation history. Continue or a historical receipt grants no future analytics permission; do not silently restore the rejected tracking mechanism.

No public hosting, Git publication, provider activation, plan upgrade, agreement acceptance, billing activation, native signing/upload or App Store submission is authorized by this review record. The [phase handoff](../handoffs/phase-12-legal-documents.md) records the actual implementation, checks and remaining gates.
