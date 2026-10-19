# JustGO legal review and publication

Phase [12](../implementation-plan/phase-12-legal-documents.md) owns legal text, Terms/Privacy presentation, public hosting and disclosure preparation. This record separates researched requirements, verified implementation and unresolved approval. It is not a legal opinion or evidence of worldwide compliance.

## Current review package

Prepared October 18 and revised October 19, 2026: [inventory](DATA_INVENTORY.md), [Privacy Policy candidate](PRIVACY_POLICY_DRAFT.md), [Terms candidate](TERMS_DRAFT.md), [release-disclosure worksheet](RELEASE_DISCLOSURES.md) and the [local static site](../../sites/legal/README.md). October 9 drafting/research is retained in the initial source history and primary references below. The October 18 pass reconciles it with Phases 08–11; the October 19 pass adapts the public presentation after competitor research.

Youngshin Yoo confirmed Ontario, Canada on October 18. The existing temporary public privacy/support contact is anthonyyoo24@gmail.com (owner-selected October 9). The intended audience remains adults 18+, with worldwide availability confirmed by Anthony on October 19 and regional review still open. No public address, telephone or representative has been supplied. Do not infer permission to publish a home address. On October 19 Anthony selected Vercel with an automatically assigned `.vercel.app` address; a custom domain is not needed now. Anthony approved both public documents on October 19; the effective date, final version identifiers and actual published URLs remain pending.

Terms and Privacy retain their document labels independently of account behavior. Anthony’s later October 19 direction removes all document-view/agreement receipts, accepted-version persistence and legal acceptance APIs. Continue performs ordinary account creation. Historical agreement records are removed through forward migration 0018 without changing journal or identity data. Public publication/effective dates remain pending; a document label is not a per-user acceptance record.

Both public text blocks are free of internal review placeholders. Review/publication metadata lives outside them. `npm run build:legal` produces plain local Privacy and Terms pages; approval status, versions and pending dates stay in source metadata. A production build refuses unapproved metadata or a missing effective date. No final public URL is invented or set in the app. The Terms & Privacy entry has no development notice; guarded API fallback pages retain their own development label. Production has no fallback to those pages or Apple's EULA for the JustGO service terms.

Anthony confirmed paid access from the first public App Store release on October 19.
The approved text describes the earlier free beta; 07A/13 must update it for the
actual paid offer, billing processing and enabled providers before store launch.
Commercial hosting must be eligible before that rollout, not after customers
arrive. Worldwide is the confirmed target; the individual operator's public EU
trader contact details and final declaration remain open. Apple permits an address
or P.O. box plus phone/email for individual traders; paid access and intended
commercialization are relevant to the owner's actual trader self-assessment.
Anthony confirmed the public address/phone are not ready yet. Suitable contacts
and Apple's actual verification remain a before-EU-distribution requirement when
listing as a trader; no private address or number may be inferred or published.

Anthony chose to wait until closer to launch to pay for hosting and keep the
website local. Publication is therefore owner-deferred. Keep the approved text,
selected Vercel-generated address and pending effective dates; resume public-site,
link and release rollout work in Phase 13 preparation when he is ready.
No legal-site deployment or paid-plan purchase is authorized. The separately
approved test-API repair above does not change this publication deferral. Existing
regional, provider and native conditions remain open before their dependent release/use.

## Review outcomes and remaining conditions

| Topic                            | Verified basis / recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner and required boundary                                                                           |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Operator and contact             | Ontario and personal operator confirmed; retain existing email. Confirm any required service/business address and contact details.                                                                                                                                                                                                                                                                                                                                | Anthony / Phase 12 before publication                                                                 |
| Distribution and regional rights | Worldwide availability was confirmed October 19; applicable regional review remains open. Assess PIPEDA, relevant regional law, EU/UK purpose-specific bases, contextual journal/feeling sensitivity, rights, representatives and transfers. The generic rights paragraph is not a completed regional notice.                                                                                                                                                     | Anthony with applicable legal/privacy reviewer / Phase 12 before territorial publication/availability |
| Individual developer             | Reflections/feelings are optional and nonclinical. This supports, but does not settle, whether Apple §5.1.1(ix)'s legal-entity rule applies. Do not declare incorporation required solely because users can write private text.                                                                                                                                                                                                                                   | Anthony / Phase 12 assessment; Phase 13 App Review eligibility gate                                   |
| EU trader contacts               | Assess trader status despite the free beta and personal developer account. If a trader serves the EU, Apple requires verified public address or P.O. Box, telephone and email. No contacts were invented and no region was disabled.                                                                                                                                                                                                                              | Anthony / Phase 12 decision, Phase 13 App Store entry                                                 |
| Age / EULA                       | Preserve 18+ without new birth-date/ID collection. Review supplementary service Terms with Apple's standard EULA and local mandatory rights. Apple requires a higher rating override when the EULA minimum exceeds the calculated rating.                                                                                                                                                                                                                         | Anthony / Phase 12 content; Phase 13 actual questionnaire/override                                    |
| Sentry lawful basis              | Owner-approved narrow startup scope is a product choice, not user consent or a legal exemption. Document necessity/balancing and applicable objection rights if relying on legitimate interests; separately assess EU/UK device storage/access rules. Otherwise choose consent-based collection or keep it disabled. No new prompt or silent scope change was implemented.                                                                                        | Anthony with applicable reviewer / Phase 12 before real-user activation; signed-build gate remains 13 |
| Sentry agreements/retention      | Side-panel observations: US region; Business trial with 13 days remaining; no payment method; DPA shows “Review and Accept”; aggregated identifying-data reuse off. No agreement was accepted. Verify applicable trial/ingestion retention, agreement/transfer terms, provider backups and request handling before activating. Intended future Free/Developer status does not establish current retention.                                                        | Anthony / Phase 12; no real-user delivery until resolved                                              |
| API/database/logs                | Supabase connector confirms current test project Canada Central on Free. Recorded API function is Montréal. Vercel side-panel settings show Hobby and a Drains page offering the first drain only after upgrade. Published Hobby runtime-log retention is one hour. Final beta/production configuration, edge/firewall logs, provider agreements/subprocessors and other retention still need verification. Policy assertions cannot substitute for these checks. | Anthony / Phase 12 before publishing the promised configuration; Phase 13 actual infrastructure       |
| Backups                          | Owner asked what Pro means on October 18; upgrade remains unconfirmed. Free has no included automatic daily Supabase backups; this does not exclude provider recovery copies. The earlier 7-day Pro proposal is conditional; do not promise it or buy a plan. Restricted manual operational copies also need a removal rule and restore controls.                                                                                                                 | Anthony / Phase 12 backup decision before final wording; Phase 13 actual setup/restore acceptance     |
| Permanent security records       | Actual deletion retains pseudonymous account/credential identifiers, dates and digests permanently, without journal content. Review necessity/proportionality and request handling; do not call these anonymous or promise all account data disappears.                                                                                                                                                                                                           | Anthony / Phase 12 review; Phase 08 mechanics preserved                                               |
| Support                          | Existing decision is removal after 12 months unless a request remains open; verify the inbox process and any specific legal hold.                                                                                                                                                                                                                                                                                                                                 | Anthony / Phase 12 operational process                                                                |
| Public API description [SEC-4]   | Resolved by the Phase 12 technical review: retain static `/openapi.json`. It describes contracts and contains no account records or credentials; authentication/ownership remain the boundary. Hiding it would not establish access security. No API behavior changed.                                                                                                                                                                                            | Resolved engineering assessment / Phase 12; preserve access checks                                    |
| Local journal [SEC-5]            | Retain iOS Data Protection as the current baseline. AsyncStorage adds no separate vault; no concrete finding currently establishes a need for one. The earlier blanket pre-beta vault recommendation is withdrawn. Inspect the actual signed build's file-protection class and backup exclusion/failure behavior; remediate a specific gap if found rather than presupposing a new storage system.                                                                | Resolved Phase 12 assessment; existing native storage verification / Phase 13                         |
| Public content/hosting           | Vercel with its generated `.vercel.app` address was selected October 19. Public text was approved October 19. Anthony deferred publication/paid hosting until closer to launch; effective-date/version finalization, actual project setup and verified public URLs remain open in Phase 13 preparation. No custom domain, paid plan or deployment was created.                                                                                                    | Anthony / Phase 12 after concrete review                                                              |

## Apple and regulator research

Primary guidance checked October 9 and rechecked October 18, 2026:

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

## Hosting agreements and recovery copies

Official terms reviewed October 19 clarify the actual questions rather than
assuming every provider needs a separately signed PDF:

- The separate legal reader can use Vercel's automatically assigned
  [`.vercel.app` domain](https://vercel.com/docs/domains/working-with-domains);
  buying a custom domain is optional. However, [Hobby fair use](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)
  permits only personal, non-commercial use and defines commercial use by the
  purpose of financial gain. Technical capacity for two static documents does
  not establish eligibility for a future paid app's legal site. Clarify that
  applicability or select hosting that permits the intended use before choosing
  the public destination; no upgrade or hosting purchase is authorized.
- [Supabase Terms §8](https://supabase.com/terms) incorporates its
  [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum).
  The DPA forms part of the agreement and §12.2 gives agreement acceptance the
  effect of signing applicable SCCs. Confirm the actual customer/applicable
  account terms; a missing separate signature alone is not an established gap.
- [Vercel Terms §10.1](https://vercel.com/legal/terms) incorporates its
  [DPA](https://vercel.com/legal/dpa), but that DPA's processor application
  expressly covers Enterprise and Pro customers. The observed Hobby plan cannot
  be marked covered from incorporation alone. Clarify the applicable processor
  arrangement and Schedule 1's sensitive-data restriction for the actual journal
  scope before real-user hosting. This is not a finding that every generic
  reflection is prohibited or an automatic authorization to buy Pro.
- Vercel's [March 2026 terms explanation](https://vercel.com/changelog/updates-to-terms-of-service-march-2026)
  describes model-training use on Hobby/trials and an opt-out. Its listed scope
  includes code/agent chats, deployment errors and aggregate traffic statistics;
  it does not establish that journal text is used for training. The actual
  account setting has not been verified. Review it before release rather than
  promising an unverified opt-out.
- [Supabase pricing](https://supabase.com/pricing) lists API/database log retention
  as one day on Free and seven days on Pro; Vercel's published Hobby runtime-log
  limit is one hour. These are specific log products, not an expiry promise for
  all infrastructure/security records.
- Free lacks the included automatic daily backups described in
  [Supabase's backup documentation](https://supabase.com/docs/guides/platform/backups),
  but [paused Free projects](https://supabase.com/docs/guides/platform/free-project-pausing)
  can be recovered for up to a year from retained provider backups. Do not equate
  no daily-backup entitlement with no provider copies. The candidate uses
  purpose-based recovery-copy wording and makes no fixed expiry promise.

No contract was accepted, account setting changed, plan upgraded or production
configuration established by this review. Applicable hosting terms/scope and
recovery-copy handling remain concrete pre-real-user deployment conditions; they
are not closed by a draft policy or a local test pass.

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
3. Record the action and response, then mark the request closed. For any necessary
   legal hold or ongoing request, record the reason, owner and next review date;
   keep an exception only while needed.
4. Review the inbox monthly and remove support messages and attachments older
   than 12 months unless an ongoing request or specific legal obligation requires
   retention. Remove operator-controlled copies and check Gmail Trash expiry;
   preserve the policy's distinction between active data and provider recovery
   copies. Review exceptions again at the next monthly pass.

Anthony must confirm the inbox owner/process and the secure route for manual
requests before claiming this operational gate has passed. No inbox access,
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
