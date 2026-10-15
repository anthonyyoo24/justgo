# JustGO Privacy Policy Draft

**Review draft prepared October 9, 2026. Not approved for publication.** This draft describes the intended initial iOS release. Bracketed review notes identify choices or behavior that must be settled before publication. Current implementation and planned services are recorded in the [data inventory](DATA_INVENTORY.md).

**Effective date:** [Set when the reviewed policy is published]

## Who operates JustGO

JustGO is operated by Youngshin Yoo in Canada. For privacy questions or requests, contact [anthonyyoo24@gmail.com](mailto:anthonyyoo24@gmail.com).

[REVIEW: Add any legally required public contact address, applicable representative details and regional notices after confirming the operator's province and intended distribution.]

JustGO is intended for adults aged 18 and older in countries and regions where it is available. It provides practice prompts and a private journal.

## Your account and recovery

JustGO creates an account without requiring an email address, password or social login. We use random account and device identifiers to keep your records connected to your account. These identifiers are persistent; your data is not anonymous simply because you do not provide a name.

The app uses securely stored credentials to connect to your account. Recovery credentials may synchronize between approved Apple devices through iCloud Keychain, depending on your Apple settings and availability. Recovery keys and device transfer provide other recovery options. The server stores digests of authentication secrets with related expiry and revocation information.

Keep recovery keys private. A purchase receipt can restore eligible paid access, but does not by itself recover your private journal.

## Information you save

When you complete a challenge, JustGO records the challenge, the venue category you selected, its start time, time zone and activity date. You can choose to save a feeling response and typed reflection. You can also leave these optional responses blank.

Submitted activity is saved on your phone and uploaded to your account so it can appear in Progress and be recovered on another device. Recovery restores uploaded history; activity still waiting to upload may exist only on the original phone. Unsubmitted screen input and unfinished challenge activity are not a cloud backup.

We process your saved content to provide the journal, display Progress and synchronize accepted changes. Other app users cannot view your journal through their accounts. The cloud journal is not end-to-end encrypted: the service and its authorized providers process stored content to operate it.

Your Reduce Motion and Haptics choices are saved locally on this phone. We also read the phone's accessibility setting so the app can respect it. These preferences are not sent to our servers or analytics services.

## Optional analytics

[REVIEW: The following wording applies only after Phase 08 implements and verifies both choices. If analytics remains disabled, replace this section with the actual disabled behavior.]

General usage analytics is off unless you enable it. If you enable it, we share limited events with PostHog to understand use of features such as challenge completion and Progress. These events can use a pseudonymous identifier linked to your account.

Sharing feeling codes or coarse reflection-length categories requires a separate choice. These categories describe approximate word counts, not the words you wrote. We do not send raw reflection text, recovery credentials, support messages or payment details to analytics, and we do not record replay videos of your app sessions.

You can change either choice in Settings. Turning analytics off stops future optional analytics sharing without preventing cloud saving or eligible paid access. [REVIEW: Specify treatment of previously collected events and verify vendor retention and deletion.]

## Security and technical information

We process authentication and limited technical information to keep accounts secure, limit abuse and operate the service. This includes session status, request identifiers and safe failure information. Network providers may process IP addresses and connection/request metadata. The app's identity rate limits use keyed hashes of addresses rather than storing raw addresses in their rate-limit records.

Application logs exclude journal text, authentication secrets and request bodies. [REVIEW: Verify hosting logs and any enabled crash/performance service; add its actual fields, purposes, retention and privacy basis before enabling it.]

## Support and feature suggestions

If you email us for help or to suggest a feature, we receive your email address and the content and attachments you choose to send. We use them to respond and manage the request. The app does not automatically attach your journal, history or recovery information. Please do not send passwords or recovery keys.

Our support inbox uses Google Gmail, and your message also passes through your email provider.

## Service providers and international processing

We use service providers to host and operate JustGO. These include Vercel for the API and Supabase for database hosting. Apple provides the device and optional iCloud Keychain services used for recovery. PostHog receives optional analytics only when enabled as described above.

[REVIEW: Finalize the active-provider list for the beta or paid release. Add Apple/RevenueCat subscription processing and Upstash billing delivery only when active. Confirm contracts, subprocessors and actual regions. Remove providers that are not enabled.]

Information may be processed outside your country, including in Canada and countries where our active providers operate. It can be subject to the laws and lawful access requirements of those countries. [REVIEW: Identify actual processing locations and applicable international-transfer safeguards. Do not imply that all data stays in Canada.]

## Retention and deletion

[REVIEW: This section is proposed release behavior. Account deletion and local cleanup are implemented locally; native acceptance, hosted rollout, final retention periods and backup handling remain unaccepted. See the Phase 08 account-deletion handoff.]

We retain your personal journal while your account exists. You can request deletion directly in the app through Settings → Delete account. Deletion revokes account access and removes associated journal records and account data, subject to the limited retention described below.

Some data may remain temporarily in restricted backups until they expire. We may retain limited security records to prevent revoked credentials from recreating an account, and records necessary to satisfy legal obligations. These exceptions do not permit continued ordinary use of deleted journal content.

[REVIEW: State the deletion completion period, backup expiry, vendor cleanup period, analytics retention, support retention and the exact purpose/duration of each security or legal exception. Explain how pending cleanup is shown to the user.]

Removing the app from your phone does not delete your cloud account. When paid subscriptions are offered, deleting your app account does not cancel an Apple subscription; cancellation is managed through Apple.

## Your privacy choices and requests

You can choose whether to submit a feeling or reflection. Settings → Export my data creates a ZIP with your saved activity and reflections, including changes waiting to upload from your current phone. Choose where to save or share this private file. Exporting does not delete your data. [REVIEW: Export is implemented locally; verify physical-iPhone delivery before publication. Optional analytics choices remain unimplemented. In-app deletion requires native-build/device acceptance and hosted rollout before publication. Verify these paths before describing them as available.]

Contact us with questions or requests to access, correct or delete personal information. We may need to verify that a request concerns your account, without asking you to email a recovery secret. Depending on the laws that apply, you may also have rights to portability, restriction or objection, to withdraw consent, and to complain to a privacy regulator. [REVIEW: Add applicable legal bases, regional rights, complaint contacts and response periods for worldwide distribution.]

## Users under 18

JustGO is intended for adults 18 and older. If you believe someone under 18 has provided personal information through JustGO, contact us so we can review and address it.

[REVIEW: Align eligibility, age-related product behavior and the App Store rating. The app does not currently verify date of birth or collect identity documents.]

## Changes to this policy

We will update this policy when our practices change and show the effective date of the revised version. Where a change requires a new choice or notice, we will provide it before the new processing begins.
