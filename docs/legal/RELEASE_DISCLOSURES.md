# Release-disclosure preparation

Technical classifications rechecked October 27, 2026 against actual signed build 5 and current Apple/Google guidance. These are proposed, unpublished App Store Connect answers; the signed artifact evidence is recorded in the [beta guide](../operations/TESTFLIGHT_BETA.md). Guest-local use, disclosed automatic first-sign-in adoption, optional managed account journal synchronization, optional private CloudKit and unified data controls materially change the earlier completion-only assessment. External publication still depends on the concrete provider-arrangement and native-payload gates below; any changed public wording requires owner review. The worksheet records those separately evidenced operations without treating them as external-beta clearance. App Store Connect now holds an unpublished draft with 13 categories selected and 11 fully configured: all confirmed categories are Linked, have the purposes below and declare no tracking. Crash Data and Other Diagnostic Data remain Set Up because their identity-linkage answers are unfinished; Publish remains disabled. The approved Privacy URL is saved. The draft was reloaded to verify persistence. See [inventory](DATA_INVENTORY.md) and [review](LEGAL_REVIEW.md).

## App Privacy worksheet

Final answers must describe the actual release configuration under [Apple’s definitions](https://developer.apple.com/app-store/app-privacy-details/), including SDK partners. The on-device exclusion applies only to device-only processing; optional sign-in does not exclude synchronized content from disclosure. User-selected files, private CloudKit and JustGO account copies have different roles. Do not treat private access as anonymity or end-to-end encryption.

| Actual data                                                    | Candidate category / purpose                                                              | Required verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local guest UUID and device-only history                       | Assess on-device exclusion for genuinely phone-only processing                            | Continue must not create server/Auth accounts. Disclosed first sign-in automatically adopts unowned phone entries and synchronizes them. Check CloudKit/file destinations separately.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Canonical account and provider subject ID                      | User ID; App Functionality/security; linked                                               | Verify managed Auth/provider mapping, no authorization by email or file identity, retained security records and logout/deletion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Provider email/basic profile, where supplied                   | Email Address/name or relevant category under actual fields and provider role             | Apple requests no profile scopes; Google/Supabase tokens may still supply fields. Inspect actual permitted flow without retaining real profile data in artifacts. No blanket no-email claim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| App-generated device/session ID                                | Device ID if it meets Apple’s definition; App Functionality/security                      | Compare actual identifier to definition; not IDFA. Tokens excluded from download/logs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Completed challenge, selected venue, original start/zones/date | Product Interaction and relevant user-content category; linked App Functionality          | Venue is a selected category, not GPS. Signed-in full-history sync and explicit import restore use stable IDs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Signed-in reflection text and preserved versions               | Other User Content; linked App Functionality                                              | Dedicated private journal sync carries text through API/storage. Earlier completion-only clearance is insufficient.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Signed-in feeling choices                                      | Recommended Health; App Functionality; Linked; no tracking                                | The intentional five-choice retrospective feeling prompt (Compared to before the challenge) requests emotional-state information. Apple's definition is not limited to HealthKit or diagnosis; its [wellbeing guidance](https://developer.apple.com/videos/play/wwdc2024/10109/) supports this recommendation. Generic reflection writing remains Other User Content. This is a classification recommendation, not an Apple ruling or a conclusion that the app provides regulated healthcare.                                                                                                                                                                                                    |
| Optional private CloudKit history/journal                      | Assess developer/Apple roles under actual private-database flow                           | Off by default; separate Apple account/container. Verify provisioning, account isolation, conflicts, deletion of previously associated copies even when OFF, pending unavailable-account cleanup and permanent account purge on device. No end-to-end encryption claim.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Manual restorable ZIP / selected import                        | Assess actual destination role and explicit synchronization after import                  | Readable file, user-selected Files/iCloud Drive/share; account import requires same owner; guest file can be explicitly added. No credentials or raw queues.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Support email/messages/attachments                             | Email Address, Customer Support and applicable requested content                          | User composed; no automatic attachments. Run the [support procedure](../operations/SUPPORT.md) and verify any exemption criteria rather than assuming optional means exempt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Infrastructure metadata                                        | Relevant diagnostics/device/location category if actual use meets definition              | Provider network/security processing is separate from disabled analytics; no app body logging does not prove no infrastructure metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Sentry errors                                                  | Crash Data and Other Diagnostic Data; App Functionality; no tracking; proposed Not Linked | Build 5 enables the reviewed allowlisted reporter and its symbols match Sentry; API reporter is deployed under the approved notice. JS final transport and native event reconstruction remove persistent identity/content. The owner has skipped the deliberate crash test; fatal crash/restart acceptance stays unverified. Not Linked remains proposed and is not entered as a confirmed Apple answer. A future controlled non-fatal native event can inspect the shared filtering/envelope path without crashing, but does not establish fatal cache/restart behavior. No such test build or event has been performed. Both diagnostics categories remain unfinished in the saved Apple draft. |
| Analytics/advertising                                          | Disabled in launch candidate                                                              | Recheck actual SDK/provider independent use before final no-tracking/ATT answers. Continue is not ATT permission; add an ATT prompt only if the submitted SDKs or data use count as tracking under Apple's definition. Phase 17 owns later activation.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Purchases/subscriptions                                        | Inactive beta; later Purchases/identifiers assessment                                     | 16/14 validates actual billing SDK/offer/retention and updated public notices before paid launch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### Shipped Google sign-in declarations

Actual build 5's GoogleSignIn privacy manifest and the [current official manifest](https://github.com/google/GoogleSignIn-iOS/blob/main/GoogleSignIn/Sources/Resources/PrivacyInfo.xcprivacy) agree on this proposed partner disclosure baseline. All categories declare Linked and no tracking.

| Categories                                         | Purposes                        |
| -------------------------------------------------- | ------------------------------- |
| Name, Email Address, Phone Number, Coarse Location | App Functionality               |
| User ID, Other Data Types                          | App Functionality and Analytics |
| Device ID, Other Usage Data                        | Analytics                       |

The app requests no phone/GPS permission or extra Google scopes. These partner declarations are separate from disabled JustGO product analytics; the shorter [Google disclosure guide](https://developers.google.com/identity/sign-in/ios/app-privacy) does not establish that this shipped configuration collects fewer categories. Do not publish a blanket No Analytics answer. Sentry's remaining Not Linked evidence is a native payload gate, not a classification decision that the owner must make by intuition.

No GPS, IDFA advertising, contacts, camera, microphone or health-framework access is included by the current scope. Actual binary/privacy manifests and enabled integrations must substantiate the release answer. Apple/Google Auth is a new native/provider boundary; browser fixtures do not establish device behavior.

## Metadata and reviewer information

| Item                      | Candidate answer / open gate                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public Privacy/Terms URLs | Existing public Privacy/Terms URLs are configured. Privacy update 2026-10-27-essential-errors is owner-approved, effective October 27, published and verified against the approved generated bytes. Terms remains 2026-10-25-beta, effective October 25. App Privacy answers and signed-phone link acceptance remain open; do not submit localhost/protected preview URLs.                                                                                 |
| Operator / age / license  | Youngshin Yoo, Ontario, Canada; 18+; supplementary service Terms and Apple standard EULA. Actual operator eligibility, questionnaire/higher override and App Store configuration remain Phase 14.                                                                                                                                                                                                                                                          |
| Regions                   | Initial paid release excludes EU, UK, Norway, Iceland and Liechtenstein by owner decision. Complete Apple's trader-status declaration before submission even without EU storefronts; publish EU trader contacts only before an EU expansion. Other regions still need applicable review of renewed private cloud processing, provider arrangements and request/deletion handling. No settings changed.                                                     |
| Review access             | Describe guest entry and optional Apple/Google sign-in, eligible test admission and production purchase guards. Prepare safe reviewer access without a real user’s history; no key/code UI.                                                                                                                                                                                                                                                                |
| Account/data controls     | Settings → Account has verified Apple/Google login-method switches, Log out and red Delete account. Data has iCloud Sync, Download/Import and Delete all my data. Both deletions reuse confirmation with distinct wording. Logout retains the same editable journal. Local history/data navigation remains available without fresh challenge admission; cloud operations require authorized connectivity.                                                  |
| Account deletion          | Confirmed action revokes sessions, deletes active account/journal/completions and managed Auth user, and clears owned local data plus previously associated app-managed iCloud copies even when OFF. Unavailable associated Apple accounts leave durable pending cleanup. User files remain; disconnected-device/provider-backup limits apply. No Apple/Google account deletion or subscription cancellation. Security records contain no journal content. |
| Support URL/contact       | Existing email only, selected URL still pending. Verify published support page/contact and any applicable address/phone. Never infer a home address or auto-attach private data.                                                                                                                                                                                                                                                                           |
| TestFlight / paid release | Hosted managed Auth/provider configuration, exact audiences, guest test window, private-content provider clearance and actual binary remain open. No staging observation transfers automatically to production.                                                                                                                                                                                                                                            |

## App Review assessment

On October 20, 2026, the review kept Apple's standard EULA, the supplementary
service Terms, the 18+ audience and the individual operator. The Terms keep
Apple's precedence for the app license, and no conflict was found. This is a
compatibility assessment, not an App Review ruling. Use the standard EULA unless
a reviewed custom one is supplied, and do not treat its technical-data clause as
privacy consent. Guideline 5.1.1(ix) expects a legal entity for regulated fields
or sensitive information. The optional, nonclinical journal supports the
individual-operator approach, but the guideline has no journal-specific line
that settles it.

Guideline 5.1.1(i) expects the policy to confirm that recipients protect data
the same way. The provider list alone does not say that. Once every provider
that handles journal data has an arrangement that supports it, Anthony reviews
adding this sentence to the Privacy Policy
([#124](https://github.com/anthonyyoo24/justgo/issues/124)):

> We require service providers that handle personal information for us to
> protect it consistently with this policy and applicable requirements.

Do not add it while any journal provider's processor or sensitive-data scope is
unresolved. Vercel's is unresolved
([#123](https://github.com/anthonyyoo24/justgo/issues/123)). The sentence is a
conditional correction, not a current safeguard, and it authorizes no provider
agreement.

## Regional assessment

These notes cover the intended storefronts after the initial exclusions. They
are not a legal opinion or proof of worldwide compliance.

- **Canada.** OPC guidance on
  [meaningful consent](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/)
  calls for a contextual sensitivity assessment, and journal text is sensitive.
  The Privacy Policy separates phone-only use, account sync, private CloudKit and
  user-chosen files. Each choice covers only its disclosed purpose and permits no
  profiling, advertising or AI use of the journal. OPC
  [cross-border guidance](https://www.priv.gc.ca/en/privacy-topics/airports-and-borders/gl_dab_090127/)
  allows accountable outsourcing for the disclosed purpose, so Canada-only
  hosting and separate transfer consent are not required. Not asking for a name
  does not make the journal anonymous. No rule found requires publishing a home
  address.
- **UK, Norway, Iceland and Liechtenstein.** Anthony excluded these at first on
  October 20, 2026, and that choice is settled. Before any UK or EEA
  availability, resolve any required representative, purpose-specific lawful
  bases, transfer safeguards and the full
  [required privacy information](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/).
  A contract basis for requested storage does not replace a
  [special-category condition](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-conditions-for-processing/)
  when journal text reveals health or beliefs. Do not invent lawful bases or
  representative contacts, and do not restore legal tracking.
- **United States.** The app offers no diagnosis, HealthKit, health scores or
  health inference. Ordinary completion data is not health data, but journal
  text can reveal health. Washington's My Health My Data Act
  ([RCW 19.373.010](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.010))
  covers access, retention and processing, so device-only processing is not an
  exemption by itself. Confirm the operator's role for the local store and
  manual files separately from signed-in sync and private CloudKit. Nevada
  ([NRS 603A](https://www.leg.state.nv.us/NRS/NRS-603A.html)) ties health data to
  identifying health status. The lack of health inference matters, but it is not
  a blanket clearance. If Washington applies, its separate prominent notice
  ([RCW 19.373.020](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.020)) is
  an open question, and Nevada's notice and request rules (NRS 603A.495 and
  .505–.520) need their own check
  ([#96](https://github.com/anthonyyoo24/justgo/issues/96)). The
  requested-service provision
  ([RCW 19.373.030](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.030))
  may cover necessary requested actions. Broad Terms agreement does not replace
  consent where consent is separately required. Do not claim that disclosed
  sign-in, the Terms links or the absence of HealthKit supply every needed
  permission. Bring any needed notice or consent change to Anthony as concrete
  wording; do not add a checkbox or acceptance tracking on your own.
- **California.** No known facts meet the
  [CCPA thresholds](https://www.cppa.ca.gov/faq.html). Ordinary mobile
  privacy-policy duties still apply.

## Required release evidence

- Fresh owner review of changed Privacy/Terms/disclosures and eligible commercial hosting/processor scope for **normal private account journal traffic**, Supabase Auth profile/session processing, private CloudKit and recovery copies. Earlier completion-only clearance is insufficient; no provider contact/acceptance/purchase is implied.
- Approved coordinated server/mobile rollout and narrowly scoped legacy-server reset evidence, preserving existing phone journals. No Recover earlier option or legacy journal endpoint. Provider backup expiry and stale-snapshot deletion-ledger replay remain separate requirements.
- Actual iPhone Apple/Google sign-in, cancel, expiry/refresh/revocation, verified login-method switches, linking/unlinking with final-method protection, hidden authenticated legacy linking and account switching. Verify disclosed automatic adoption and interrupted source retirement, the same editable journal after logout, and same-account synchronization of those edits without copying another account's data. Verify OS-backed token atomicity/lock/storage errors on the installed binary.
- CloudKit container/capability/provisioning, off-by-default behavior, guest and account collections, Apple-account changes, conflicts, quota/network/relaunch, reset generation and permanent account closure/purge. Test enable → disable → delete → enable and previously associated copies, with unavailable-account cleanup pending across relaunch and a successful retry. CloudKit is not Files/iCloud Drive or system backup.
- SQLite/WAL/SHM and app temporary-file protection/lock/system-backup behavior; Files save/share/pick/cancel; bounded import preview, wrong-owner rejection, duplicate IDs, conflicting writing, preference durability and cleanup after lost acknowledgements.
- Delete all across phone/cloud/previously associated app-managed iCloud copies while keeping account/login methods; explicit later restore and stale-device fences. Delete account includes managed Auth deletion retry, provider session revocation, source-retirement protection and a fresh empty phone journal after completed cleanup. User-saved files remain separate; neither action deletes the Apple/Google account or cancels a subscription.
- Actual privacy manifests/required-reason APIs for pinned SDKs, secure connections, VoiceOver/large text/focus and usable anonymous legal links from the signed iPhone. Local web/native exports do not satisfy these device gates.
- Separate Sentry, billing and Phase 17 analytics activation reviews remain open. Document viewing/Continue is not analytics permission or a restored legal-version gate.

Sources: [Apple privacy labels](https://developer.apple.com/app-store/app-privacy-details/), [privacy guidelines](https://developer.apple.com/app-store/review/guidelines/#privacy), [age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/), [EU trader information](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/), [license setup](https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement/).

## Phase 15 provider change candidate

Local Hono/Workers and encrypted R2 recovery tooling is implemented; the deployed
Vercel API and published October 27 Privacy Policy remain unchanged. Cloudflare
would process ordinary API/legal connection metadata and signed-in journal
requests; R2 would store encrypted app/Auth snapshots and deletion/revocation
records. Encryption does not remove those copies from the inventory or prove
Not Linked. No new product analytics or mobile data collection is added.

The [exact notice candidate](CLOUDFLARE_NOTICE_REVIEW.md) and
[backup policy](../operations/CLOUDFLARE_BACKUPS.md) require approval and actual
account/configuration/expiry evidence before publication. Supabase consent and
copy retention, Sentry diagnostic disclosure and device acceptance remain open
Phase 14 responsibilities. No Apple answers or public notices were changed.
