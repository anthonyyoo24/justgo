# Privacy Policy — managed sync candidate, unpublished

<!-- legal-version: 2026-10-25-managed-sync-candidate -->
<!-- publication-status: owner-review-required -->
<!-- effective-date: pending -->

Readability and competitor approach reconciled October 25, 2026 against the managed-sync data inventory. Earlier owner approval and the completion-only provider assessment do not cover optional managed sign-in, private account synchronization or CloudKit. Fresh owner/public-text and provider review is required. This document does not establish hosted rollout, provider suitability, legal-site publication or signed-device acceptance. The effective date remains pending. The static site renders only the marked public block; review metadata remains internal. See [LEGAL_REVIEW.md](LEGAL_REVIEW.md).

<!-- public:start -->

# Privacy Policy

## About this policy

JustGO helps adults aged 18 and older practice everyday challenges and keep a private record of their activity. This policy explains what information we handle, why we use it and how you can manage it.

You choose where your saved challenge history, feelings and reflections go:

- **Without sign-in:** your journal stays on your phone unless you enable iCloud Sync or save or share a data file.
- **With an account:** Before signing in with Apple or Google, we explain that your history and journal synchronize through JustGO's cloud service. Your first successful sign-in automatically adds existing phone entries that do not belong to another JustGO account.
- **With iCloud Sync:** a separate choice, off by default, synchronizes the selected journal through your private Apple CloudKit database. You do not need a JustGO account for this choice.
- **With a downloaded file:** you choose where to save or share a readable copy. The destination handles that copy under its own settings and practices.

Product analytics and automatic crash reporting are disabled. The sections below explain each choice, the providers involved and how to delete data.

JustGO is operated by Youngshin Yoo in Ontario, Canada. For privacy questions, requests or support, email [anthonyyoo24@gmail.com](mailto:anthonyyoo24@gmail.com). We do not sell your personal information.

## Guest use and optional accounts

Continuing without sign-in creates a random local collection identifier and does not create a JustGO server account. Signing in connects this journal to your account after the cloud-storage explanation. Data already associated with a different JustGO account stays separate.

Optional sign-in uses Apple or Google through Supabase Auth. The provider and authentication service process the provider account identifier, authentication tokens and information the provider supplies, which may include an email address or basic profile information. JustGO uses verified identity to connect the correct account; an email address supplied by someone else does not grant account access. Apple and Google also process sign-in under their own terms and privacy practices.

When signed in, your completed challenges, selected venue category, original start time, time zones, activity date, saved feelings and reflection text synchronize with your JustGO account. A venue is a category you select, not a GPS location. You can leave feelings and reflections blank. Differing saved versions can be retained to protect your writing from being overwritten.

Signing out stops JustGO account synchronization and keeps the same saved journal visible and editable on the phone. Signing back into the same account synchronizes changes saved while signed out. Signing into another account does not automatically copy the previous account’s data. Settings → Account shows your verified Apple and Google login methods; you can connect another method or disconnect one while keeping at least one available. Disconnecting a method does not delete your journal or your Apple or Google account. When upgrading an older installation, JustGO may use its existing protected account access to connect that account to your verified sign-in; you do not need to enter a recovery key or transfer code in the new account screens.

## Information kept on your phone

The phone stores saved history, feelings and reflections, including their challenge and historical date context. A completion or reflection waiting to synchronize may exist only on that phone. Unsaved editor input and unfinished challenges are not included in recovery or downloads.

Your last venue, shuffled challenge order and current card stay on the phone. Haptics and the app’s Reduce Motion preference are also local preferences and can be included in a requested data file. The phone’s system motion accessibility setting takes priority.

Losing the phone, deleting the app or clearing its data can lose information that has not been synchronized or preserved in a usable file. Signing in cannot recover guest writing that you kept only on a different phone.

## Optional iCloud Sync

Settings → Data provides a separate iCloud Sync choice, off by default. If enabled and available, it synchronizes the selected collection’s saved challenge history, feelings and reflections through a private CloudKit database associated with your Apple account. This can be used without a JustGO sign-in. CloudKit is separate from JustGO account synchronization, iCloud Drive files and iPhone system backup.

Apple handles the private iCloud copy under your Apple account and settings. Availability depends on your Apple account, device, network and storage. Turning synchronization off stops further synchronization; it does not by itself erase the existing iCloud copy. Changing Apple accounts does not authorize combining unrelated copies. We do not promise end-to-end encryption or a particular system-backup behavior for these copies.

## Downloading and importing data

Settings → Data → Download my data creates a restorable ZIP with saved challenge history, all current and preserved alternative journal entries, historical context, and Haptics and Reduce Motion preferences. It excludes passwords, authentication tokens, account sessions and unsaved input. You choose a destination through Files or sharing, including iCloud Drive. The file is readable private content and is not password protected by JustGO; use a destination you trust.

A signed-in account download first synchronizes with the cloud and needs a working connection. A guest or signed-out download contains the selected phone collection; a signed-out account download may omit newer cloud changes. Each file is a snapshot, and later changes need another download. Concurrent changes on another device may arrive after it is created.

Import data validates the file and shows a preview before you confirm. Account-owned files require sign-in to the same account; possession of a file does not authenticate you. A guest file may be added to the currently selected collection after confirmation. Identical records do not create extra completions, and differing journal versions are preserved. Restoring an account’s data can send the validated records through account synchronization, and enabled iCloud Sync can synchronize imported data. Older supported journal-only files restore writing rather than a complete account history.

## Security and recovery

Native sign-in tokens use the operating system’s protected credential storage. The service verifies live sessions and ownership before providing account data. Provider sign-in restores the corresponding uploaded account data; downloaded files and private iCloud copies are separate recovery sources. Reinstalling or restoring a purchase does not itself authenticate a JustGO account.

We use protected connections and account access controls. JustGO and its service providers can process synchronized account content, including feelings and reflections. It is not an end-to-end encrypted service. No storage or transmission method eliminates every security risk. Keep your phone, Apple or Google account and downloaded files secure, and never email authentication secrets to us.

## How we use information

We use this information to save and display your activity, synchronize the copies you choose, authenticate accounts, preserve differing writing, create or import requested files, prevent abuse and respond to support or privacy requests. Application logs exclude journal text, authentication secrets and request bodies. Abuse controls use protected address hashes rather than raw IP addresses in those records.

Hosting and network providers also process connection and request information, which may include IP addresses, request paths and browser or device information. That processing is separate from product analytics.

## Analytics and crash reporting

Product analytics and ordinary automatic crash reporting are disabled. We do not send journal content, feelings or reflection-length analytics to PostHog or Sentry. We do not use cross-service advertising tracking.

Before enabling additional collection, we will review its purpose and providers, update the relevant notices and obtain any permission required by law. We will not replay earlier activity into analytics. Continuing through Terms & Privacy or opening a document does not record an agreement, accepted legal version or analytics permission.

## Support

If you email us, we receive your address and the message and attachments you choose to send. We use them to respond and manage the request. JustGO does not automatically attach your journal or credentials. Please do not send passwords, tokens or other authentication secrets.

## Service providers and international processing

- **Vercel** hosts the API that processes authenticated account data, including synchronized feelings and reflections.
- **Supabase** provides managed authentication and hosts account, completion and journal records.
- **Apple** provides Apple sign-in, protected native credential storage and optional private CloudKit synchronization. Apple also handles files you choose to save to iCloud Drive under your Apple settings.
- **Google** provides Google sign-in. **Google Gmail** hosts the support inbox; messages also pass through your email provider.
- Other file destinations you choose handle the copies you save or share with them.

Providers may process information outside Canada, including through their networks and support operations. Information processed abroad may be subject to foreign laws and lawful-access requirements. Contact us with questions about providers and international processing. We may disclose information when required by law.

## Retention and deletion

Saved phone collections remain until you delete them or remove the app’s data. Signing out keeps the selected account’s local data. Online account records remain until deleted, subject to limited security records and provider recovery copies.

Settings → Data → Delete all my data asks for confirmation, then removes the selected journal's saved challenge history, feelings and reflections from the phone, its signed-in JustGO account and app-managed iCloud copies previously associated with it, even if iCloud Sync is now off. It keeps the account and its login methods available for future use. Account data requires sign-in for cloud deletion. Devices reconcile deletion before synchronizing again. If the associated Apple account or iCloud service is unavailable, cleanup remains pending and can be retried when available. This action is distinct from closing the account.

Settings → Account → Delete account asks for confirmation, then closes the JustGO account, removes its active history and journal, revokes signed-in sessions, removes the managed authentication account, and clears that owner’s local data, sign-in credentials and previously associated app-managed iCloud copies, even if iCloud Sync is now off. The operation keeps a durable deletion result so an uncertain response or interrupted cleanup can be retried, including cleanup waiting for the associated Apple account. It does not delete your Apple or Google account or cancel an Apple subscription.

We retain limited security records, such as account and authentication identifiers, deletion/revocation dates and cryptographic digests, to prevent deleted account data or revoked sessions from becoming active again. They contain no journal content, feelings or challenge history, but persistent identifiers may still be personal information.

Provider-controlled recovery copies may retain older information under their retention processes. Before a restored service becomes active, deletion and revocation records must be reconciled so deleted data does not return. We do not promise that deleting active records immediately erases every provider backup.

Deleting the app does not close your cloud account. Neither deletion action can remotely erase user-saved files or a disconnected device immediately. Files saved to Files, iCloud Drive or another chosen destination remain under your control; protect them and delete them separately where appropriate. Operational logs are kept for troubleshooting and security under configured provider retention. Support emails are deleted after 12 months unless a request remains open or a specific legal obligation requires longer retention.

## Your choices and requests

You can continue without signing in, choose sign-in after the cloud-storage explanation, sign out while keeping the same phone journal, leave feelings and reflections blank, keep iCloud Sync off, download or import data, delete the selected journal’s data, or close the account. Account and data controls remain available independently of paid challenge access. Restoring an older file after deleting data is an explicit import choice; it does not recreate a deleted account.

Email [anthonyyoo24@gmail.com](mailto:anthonyyoo24@gmail.com) to request access, correction or deletion, or ask about processing. We may need to verify that a request concerns your account, but will not ask you to email an authentication secret. Depending on applicable law, you may also have rights to portability, restriction, objection, withdrawal of consent and a complaint to a privacy regulator. Withdrawing consent does not change the lawfulness of earlier processing. We will explain any applicable limits or necessary retention when responding. For Canadian privacy concerns, you may contact the [Office of the Privacy Commissioner of Canada](https://www.priv.gc.ca/en/report-a-concern/).

## Age and changes

JustGO is intended for adults aged 18 and older. We do not collect a birth date or identity document. If you believe someone under 18 has provided information through JustGO, contact us so we can review it.

We publish updates at this Privacy Policy address when our practices change and provide any new notice or choice required by applicable law before new processing begins.
<!-- public:end -->

## Publication conditions

This is candidate wording, not approved or public legal text. Verify the actual provider arrangements for renewed private-content processing; managed Auth account/profile retention and deletion; CloudKit container, Apple-account isolation and purge behavior; signed-iPhone token/SQLite/temporary-file protection; Files/picker restore; support procedure; regional notice requirements; and actual hosted cutover before approval. Earlier completion-only clearance does not cover this processing. Do not invent provider agreements, backup expiry, end-to-end encryption, public URLs or deployed behavior. Paid billing and future analytics need their separate notices and activation gates.
