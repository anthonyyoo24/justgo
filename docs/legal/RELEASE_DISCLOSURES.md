# Release-disclosure preparation

Technical classifications were rechecked October 27, 2026 against actual signed build 5 and current Apple and Google guidance. These are proposed, unpublished App Store Connect answers. The [beta guide](../operations/TESTFLIGHT_BETA.md) records the signed artifact evidence. Guest-local use, disclosed automatic first-sign-in adoption, optional managed account journal synchronization, optional private CloudKit and unified data controls materially change the earlier completion-only assessment. External publication still depends on the concrete provider-arrangement and native-payload gates below. Any changed public wording requires owner review. The worksheet records those separately evidenced operations without treating them as external-beta clearance.

App Store Connect holds an unpublished draft with 13 categories selected and 11 fully configured. All confirmed categories are Linked, have the purposes below and declare no tracking. Crash Data and Other Diagnostic Data remain Set Up because their identity-linkage answers are unfinished. Publish remains disabled. The approved Privacy URL is saved, and a reload of the draft verified that it persisted. See the [inventory](DATA_INVENTORY.md) and [approvals](APPROVALS.md).

## App Privacy worksheet

Final answers must describe the actual release configuration under [Apple’s definitions](https://developer.apple.com/app-store/app-privacy-details/), including SDK partners. The on-device exclusion applies only to device-only processing. Optional sign-in does not exclude synchronized content from disclosure. User-selected files, private CloudKit and JustGO account copies have different roles. Do not treat private access as anonymity or end-to-end encryption.

| Actual data                                                         | Candidate category / purpose                                                                   | Required verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local guest UUID and device-only history                            | Assess on-device exclusion for genuinely phone-only processing                                 | Continue must not create server or Auth accounts. Disclosed first sign-in automatically adopts unowned phone entries and synchronizes them. Check CloudKit and file destinations separately.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Canonical account and provider subject ID                           | User ID. App Functionality and security. Linked.                                               | Verify managed Auth and provider mapping, no authorization by email or file identity, retained security records, and logout and deletion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Provider email/basic profile, where supplied                        | Email Address, name or another relevant category, based on the actual fields and provider role | Apple requests no profile scopes. Google and Supabase tokens may still supply fields. Inspect the actual permitted flow without retaining real profile data in artifacts. No blanket no-email claim.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| App-generated device/session ID                                     | Device ID if it meets Apple’s definition. App Functionality and security.                      | Compare the actual identifier to the definition. It is not IDFA. Tokens are excluded from download and logs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Completed challenge, selected venue, original start, zones and date | Product Interaction and the relevant user-content category. Linked App Functionality.          | Venue is a selected category, not GPS. Signed-in full-history sync and explicit import restore use stable IDs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Signed-in reflection text and preserved versions                    | Other User Content. Linked App Functionality.                                                  | Dedicated private journal sync carries text through the API and storage. Earlier completion-only clearance is insufficient.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Signed-in feeling choices                                           | Recommended Health. App Functionality. Linked. No tracking.                                    | The intentional five-choice retrospective feeling prompt (Compared to before the challenge) requests emotional-state information. Apple's definition is not limited to HealthKit or diagnosis. Its [wellbeing guidance](https://developer.apple.com/videos/play/wwdc2024/10109/) supports this recommendation. Generic reflection writing remains Other User Content. This is a classification recommendation, not an Apple ruling or a conclusion that the app provides regulated healthcare.                                                                                                                                                                                                            |
| Optional private CloudKit history/journal                           | Assess developer and Apple roles under actual private-database flow                            | Off by default. Separate Apple account and container. Verify provisioning, account isolation, conflicts, deletion of previously associated copies even when OFF, pending unavailable-account cleanup and permanent account purge on device. No end-to-end encryption claim.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Manual restorable ZIP and selected import                           | Assess actual destination role and explicit synchronization after import                       | Readable file at a user-selected Files, iCloud Drive or share destination. Account import requires the same owner. A guest file can be explicitly added. No credentials or raw queues.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Support email/messages/attachments                                  | Email Address, Customer Support and applicable requested content                               | User-composed. No automatic attachments. Run the [support procedure](../operations/SUPPORT.md) and verify any exemption criteria rather than assuming optional means exempt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Infrastructure metadata                                             | Relevant diagnostics, device or location category if actual use meets the definition           | Provider network and security processing is separate from disabled analytics. The absence of app body logging does not prove the absence of infrastructure metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Sentry errors                                                       | Crash Data and Other Diagnostic Data. App Functionality. No tracking. Proposed Not Linked.     | Build 5 enables the reviewed allowlisted reporter and its symbols match Sentry. The API reporter is deployed under the approved notice. JS final transport and native event reconstruction remove persistent identity/content. The owner has skipped the deliberate crash test. Fatal crash and restart acceptance stays unverified. Not Linked remains proposed and is not entered as a confirmed Apple answer. A future controlled non-fatal native event can inspect the shared filtering/envelope path without crashing, but does not establish fatal cache/restart behavior. No such test build or event has been performed. Both diagnostics categories remain unfinished in the saved Apple draft. |
| Analytics/advertising                                               | Disabled in launch candidate                                                                   | Recheck independent use by the actual SDKs and providers before final no-tracking and ATT answers. Continue is not ATT permission. Add an ATT prompt only if the submitted SDKs or data use count as tracking under Apple's definition. Phase 17 owns later activation.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Purchases/subscriptions                                             | Inactive in beta. Later assessment of Purchases and identifiers.                               | Before paid launch, 16/14 validates the actual billing SDK, offer, retention and updated public notices.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Shipped Google sign-in declarations

Actual build 5's GoogleSignIn privacy manifest and the [current official manifest](https://github.com/google/GoogleSignIn-iOS/blob/main/GoogleSignIn/Sources/Resources/PrivacyInfo.xcprivacy) agree on this proposed partner disclosure baseline. All categories declare Linked and no tracking.

| Categories                                         | Purposes                        |
| -------------------------------------------------- | ------------------------------- |
| Name, Email Address, Phone Number, Coarse Location | App Functionality               |
| User ID, Other Data Types                          | App Functionality and Analytics |
| Device ID, Other Usage Data                        | Analytics                       |

The app requests no phone or GPS permission and no extra Google scopes. These partner declarations are separate from disabled JustGO product analytics. The shorter [Google disclosure guide](https://developers.google.com/identity/sign-in/ios/app-privacy) does not establish that this shipped configuration collects fewer categories. Do not publish a blanket No Analytics answer. Sentry's remaining Not Linked evidence is a native payload gate, not a classification decision that the owner must make by intuition.

The current scope includes no GPS, IDFA advertising, contacts, camera, microphone or health-framework access. The actual binary, privacy manifests and enabled integrations must substantiate the release answer. Apple and Google Auth is a new native and provider boundary. Browser fixtures do not establish device behavior.

## Metadata and reviewer information

| Item                      | Candidate answer / open gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public Privacy/Terms URLs | Existing public Privacy and Terms URLs are configured. Privacy `2026-11-13-supabase-edge`, which names Supabase Edge Functions as the API host, is owner-approved, effective November 13, published that day and verified against the approved generated bytes. It replaced 2026-10-27-essential-errors. Terms remains 2026-10-25-beta, effective October 25; candidate terms-us-east-candidate, which drops the operator's name and province, is approved as text and publishes with build 8. App Privacy answers and signed-phone link acceptance remain open. Do not submit localhost or protected preview URLs. |
| Operator / age / license  | Youngshin Yoo, Ontario, Canada. 18+. Supplementary service Terms and Apple's standard EULA. Actual operator eligibility, the questionnaire and higher override, and App Store configuration remain Phase 14 work.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Regions                   | Initial paid release excludes EU, UK, Norway, Iceland and Liechtenstein by owner decision. Complete Apple's trader-status declaration before submission even without EU storefronts. Publish EU trader contacts only before an EU expansion. Other regions still need applicable review of renewed private cloud processing, provider arrangements and request/deletion handling. No settings changed.                                                                                                                                                                                                              |
| Review access             | Describe guest entry and optional Apple or Google sign-in, eligible test admission and production purchase guards. Prepare safe reviewer access without a real user’s history. No key or code UI.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Account/data controls     | Settings → Account has verified Apple and Google login-method switches, Log out and red Delete account. Data has iCloud Sync, Download, Import and Delete all my data. Both deletions reuse confirmation with distinct wording. Logout retains the same editable journal. Local history and data navigation remains available without fresh challenge admission. Cloud operations require authorized connectivity.                                                                                                                                                                                                  |
| Account deletion          | The confirmed action revokes sessions, deletes the active account, journal and completions and the managed Auth user, and clears owned local data plus previously associated app-managed iCloud copies even when OFF. Unavailable associated Apple accounts leave durable pending cleanup. User files remain. Disconnected-device and provider-backup limits apply. No Apple/Google account deletion or subscription cancellation. Security records contain no journal content.                                                                                                                                     |
| Support URL/contact       | Existing email only. The selected URL is still pending. Verify the published support page and contact, and any applicable address or phone. Never infer a home address or auto-attach private data.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| TestFlight / paid release | Hosted managed Auth and provider configuration, exact audiences, guest test window, private-content provider clearance and actual binary remain open. No staging observation transfers automatically to production.                                                                                                                                                                                                                                                                                                                                                                                                 |

## App Review assessment

On October 20, 2026, the review kept Apple's standard EULA, the supplementary
service Terms, the 18+ audience and the individual operator. The Terms keep
Apple's precedence for the app license, and no conflict was found. This is a
compatibility assessment, not an App Review ruling. Use the standard EULA unless
a reviewed custom one is supplied, and do not treat its technical-data clause as
privacy consent. Guideline 5.1.1(ix) expects a legal entity for regulated fields
or sensitive information. The optional, nonclinical journal supports the
individual-operator approach, but the guideline has no journal-specific line
that settles it. Guideline 5.1.1(ii)'s exception for diagnostics needs
compliance with the applicable law, not only calling them essential. The UK ICO
gives Sentry no automatic exemption. A proportionate technical-fault purpose can
qualify.

Guideline 5.1.1(i) expects the policy to confirm that recipients protect data
the same way. The provider list alone does not say that. Once every provider
that handles journal data has an arrangement that supports it, Anthony reviews
adding this sentence to the Privacy Policy
([#124](https://github.com/anthonyyoo24/justgo/issues/124)):

> We require service providers that handle personal information for us to
> protect it consistently with this policy and applicable requirements.

Do not add it while any journal provider's processor or sensitive-data scope is
unresolved. Supabase's sensitive-data condition is unresolved
([#95](https://github.com/anthonyyoo24/justgo/issues/95)), and Vercel's stays open
until its API project and the builds that call it are retired
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
  hosting and separate transfer consent are not required. The same guidance
  expects notice that information held in another country may be accessed by
  its courts, law enforcement and national security authorities, so the U.S.
  region candidate says so. A lawyer should review the cross-border wording
  before the paid launch. Not asking for a name
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
  may cover necessary requested actions. If Washington applies, record each
  processor agreement and its actual configuration against purpose-limited
  processing, access restrictions, request assistance and deletion
  ([RCW 19.373.060](https://app.leg.wa.gov/RCW/default.aspx?cite=19.373.060)).
  Broad Terms agreement does not replace
  consent where consent is separately required. Do not claim that disclosed
  sign-in, the Terms links or the absence of HealthKit supply every needed
  permission. Bring any needed notice or consent change to Anthony as concrete
  wording. Do not add a checkbox or acceptance tracking on your own.
- **California.** No known facts meet the
  [CCPA thresholds](https://www.cppa.ca.gov/faq.html). Ordinary mobile
  privacy-policy duties still apply.

## Required release evidence

- Fresh owner review of the changed Privacy Policy, Terms and disclosures, and of eligible commercial hosting and processor scope for **normal private account journal traffic**, Supabase Auth profile and session processing, private CloudKit and recovery copies. Earlier completion-only clearance is insufficient. No provider contact, acceptance or purchase is implied.
- Approved coordinated server and mobile rollout and narrowly scoped legacy-server reset evidence, preserving existing phone journals. No Recover earlier option or legacy journal endpoint. Provider backup expiry and stale-snapshot deletion-ledger replay remain separate requirements.
- Actual iPhone Apple and Google sign-in, cancel, expiry, refresh and revocation, verified login-method switches, linking and unlinking with final-method protection, hidden authenticated legacy linking and account switching. Verify disclosed automatic adoption and interrupted source retirement, the same editable journal after logout, and same-account synchronization of those edits without copying another account's data. Verify OS-backed token atomicity, lock and storage errors on the installed binary.
- CloudKit container, capability and provisioning, off-by-default behavior, guest and account collections, Apple-account changes, conflicts, quota, network and relaunch, reset generation and permanent account closure/purge. Test enable → disable → delete → enable and previously associated copies, with unavailable-account cleanup pending across relaunch and a successful retry. CloudKit is not Files/iCloud Drive or system backup.
- Protection, lock and system-backup behavior for SQLite, WAL, SHM and app temporary files. Files save, share, pick and cancel. Bounded import preview, wrong-owner rejection, duplicate IDs, conflicting writing, preference durability and cleanup after lost acknowledgements.
- Delete all across phone, cloud and previously associated app-managed iCloud copies while keeping the account and login methods. Explicit later restore and stale-device fences. Delete account includes managed Auth deletion retry, provider session revocation, source-retirement protection and a fresh empty phone journal after completed cleanup. User-saved files remain separate. Neither action deletes the Apple or Google account or cancels a subscription.
- Actual privacy manifests and required-reason APIs for pinned SDKs, secure connections, VoiceOver, large text, focus and usable anonymous legal links from the signed iPhone. Local web and native exports do not satisfy these device gates.
- Separate Sentry, billing and Phase 17 analytics activation reviews remain open. Document viewing and Continue are not analytics permission or a restored legal-version gate.

Sources: [Apple privacy labels](https://developer.apple.com/app-store/app-privacy-details/), [privacy guidelines](https://developer.apple.com/app-store/review/guidelines/#privacy), [age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/), [EU trader information](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/), [license setup](https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement/).

## Phase 15 provider change candidate

The API runs on the Supabase Edge Function `api`. From build 8, which sends
`x-region: us-east-1`, Supabase processes API connection metadata and signed-in
journal requests beside the database in us-east-1 (Virginia, United States).
Build 7 and earlier reach the Canada project, whose function runs in the region
closest to each request ([Phase 15A](../implementation-plan/supabase-us-move.md)). Its function logs keep method,
path, status and timing, not bodies, tokens or writing. R2 stores encrypted app
and Auth snapshots and encrypted deletion and revocation records. Encryption does
not remove those copies from the inventory or prove Not Linked. Vercel keeps only
the legal pages. No new product analytics or mobile data collection is added, so
the App Privacy categories above do not change.

The [Supabase notice](SUPABASE_NOTICE_REVIEW.md) was approved and published on
November 13, after the [backups](../operations/CLOUDFLARE_BACKUPS.md) resumed.
Supabase consent and copy retention, Sentry diagnostic disclosure and device
acceptance remain open Phase 14 responsibilities. No Apple answers were changed.
