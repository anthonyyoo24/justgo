# Privacy Policy — free beta

<!-- legal-version: 2026-11-14-us-east -->
<!-- publication-status: owner-approved -->
<!-- effective-date: 2026-11-14 -->
<!-- diagnostics-scope: essential-errors-only -->

This is the notice for the move of the database and the `api` function to Supabase us-east-1 ([Phase 15A](../implementation-plan/supabase-us-move.md#us-9), US-9). It describes the service as it runs now, with no history of earlier hosts or regions: the database and the server run in the United States, with a U.S. storage disclosure. It also drops the operator's name and province, the Canada-only wording and the Canadian regulator link. Anthony approved this text on November 13, 2026. Anthony gave the go to publish it on November 14, 2026, and it took effect and was published that day for build 8. The [Supabase notice review](SUPABASE_NOTICE_REVIEW.md#us-region-candidate) lists its conditions. It replaced `2026-11-13-supabase-edge`, published November 13, 2026, and Git history keeps that text. The Terms drop the same operator details and published with it. The static site renders only the marked public block; review metadata remains internal. See [APPROVALS.md](APPROVALS.md).

Pending: Phase 13A PR 5 ([one journal per phone](../implementation-plan/one-person-phone.md)) rewrites the public text in plain language, organized by what is collected, why, who receives it, how long it is kept, your choices and contact, at Anthony's request on November 15, 2026. It also matches the behavior that PRs #494 and #497 shipped: import works without sign-in, and every sign-in brings the phone's journal into that account. Detail the shorter text leaves out stays in [DATA_INVENTORY.md](DATA_INVENTORY.md#detail-the-public-notices-leave-out). Anthony approves that text on its PR. The version and effective date above stay until he gives the separate go to publish it, which sets a new version and date.

<!-- public:start -->

# Privacy Policy

JustGO is a free beta app for adults aged 18 and older. It offers everyday challenges and keeps a private journal of your activity. This policy explains what information JustGO collects, why we use it, who receives it, how long we keep it and the choices you have.

We do not sell your personal information or share it for advertising. JustGO has no ads, and product analytics is turned off. Questions? Email [anthonyyoo24@gmail.com](mailto:anthonyyoo24@gmail.com).

## Information we collect

**Your journal.** The challenges you complete, the venue category you pick, dates, times and time zones, and any feelings and reflections you write. A venue is a category, not a GPS location. Feelings and reflections are optional. If an entry changes on two devices, JustGO keeps both versions so your writing isn't overwritten.

**Sign-in information.** If you sign in with Apple or Google, our sign-in service receives an account identifier, sign-in tokens and the information Apple or Google supply, which may include an email address or basic profile information.

**Error reports.** App versions with crash reporting enabled send us a limited technical report when the app crashes or hits an error, including before you sign in. A report includes the type of error, where in the code it happened, the app and system versions and the time. When our server hits an error, it sends a similar report with a request identifier and an error code. Reports never include your journal, feelings, email, account or device identifiers, or sign-in tokens. On iPhone, the original crash details can stay on your phone until the next launch, before JustGO filters what it sends.

**Connection information.** Our hosting providers receive ordinary connection information, such as your IP address, the page or request, and browser or device details. Our server logs record each request's method, path, status and timing. They do not record request bodies, sign-in tokens or journal text.

**Support emails.** If you email us, we receive your address and whatever you choose to send.

**Settings on your phone.** Your last venue, challenge order, current card, Haptics and Reduce Motion stay on your phone and are not synced.

## Where your journal is kept

You choose where your journal goes:

- **On your phone.** Without sign-in, your journal stays on your phone unless you turn on iCloud Sync or save or share a data file. JustGO does not create a server account for you.
- **In your JustGO account.** Before signing in with Apple or Google, we explain that your history and journal synchronize through JustGO's cloud service. When you sign in, the journal on this phone is saved to that account and syncs across your signed-in devices. Signing out keeps your journal on this phone.
- **In your iCloud.** iCloud Sync is a separate choice in Settings → Data, off by default. It syncs your journal through a private CloudKit database in your Apple account, with or without a JustGO account. Turning it off stops syncing but does not erase the iCloud copy.
- **In files you save.** Download my data creates a file you can save wherever you choose. The file is readable and not password protected by JustGO, so keep it somewhere safe.

Our servers and database are in the United States. We store your account, history, journal and sign-in information there, where U.S. courts, law enforcement and national security authorities may access it under U.S. law. Our service providers may also process information in other countries, under those countries' laws.

## How we use information

We use your information to save and show your journal, sync the copies you choose, sign you in, create and import the files you ask for, fix crashes and errors, prevent abuse and answer your emails. We do not use your journal for ads or analytics.

## Who receives it

Apple and Google provide Sign in with Apple and Sign in with Google. Apple also provides iCloud Sync and the secure storage on your iPhone that keeps you signed in.

We also use service providers that host our servers and database, store our encrypted backups, process error reports, host our support email and host these legal pages. These pages have no analytics or tracking cookies.

JustGO and its service providers can process synchronized account content, including feelings and reflections. JustGO is not end-to-end encrypted. A file you save to Files, iCloud Drive or another place is handled under that place's own rules. We may disclose information when the law requires it.

## How long we keep it

- **Your journal on your phone:** until you delete it or remove the app's data.
- **Your account and its journal:** until you use Delete all my data or Delete account.
- **Backups:** our encrypted backups are deleted about a week after they're made. If we ever restore one, we make sure deleted data stays deleted.
- **Error reports:** for the period set with our error-reporting provider. Reports carry no account identifier, so deleting your account can't find them. Email us the time and app version if you want us to look for one.
- **Server logs:** for a limited period set by our service plan.
- **Support emails:** 12 months, unless your request is still open or the law requires longer.
- **Security records:** after a deletion, we keep a small record, such as account identifiers and dates, so deleted data and revoked sign-ins can't come back. It contains no journal content.

Our providers' own backups follow their retention schedules.

## Your choices and rights

- Use JustGO without signing in, skip feelings and reflections, and keep iCloud Sync off.
- **Download my data** (Settings → Data) creates a file with your history, journal and preferences. Each file is a snapshot, so later changes need a new download.
- **Import data** (Settings → Data) shows a preview before you confirm. You can import a JustGO backup file without signing in. Its entries are added to the journal on this phone, and sync to your account when you’re signed in.
- **Delete all my data** (Settings → Data) removes your journal from this phone, from your account when you're signed in, and from the app's iCloud copy. Your account stays open.
- **Delete account** (Settings → Account) closes your account, removes its sign-in, and removes its journal from our servers, this phone and the app's iCloud copy. It does not delete your Apple or Google account or cancel an Apple subscription.

Files you saved elsewhere stay yours to keep or delete. Deleting the app does not close your account. Losing your phone or removing the app can lose anything that wasn't synced or saved in a file.

You can also email [anthonyyoo24@gmail.com](mailto:anthonyyoo24@gmail.com) to access, correct or delete your information, or to ask how we use it. We may need to confirm that a request is about your account, but we will never ask for a password or sign-in token. Depending on where you live, you may also have the right to move your data, restrict or object to processing, withdraw consent or complain to a privacy regulator.

## Keeping your data safe

We use protected connections and access controls, and your phone keeps sign-in tokens in its secure storage. No system is perfectly secure. Keep your phone, your Apple or Google account and your downloaded files safe, and never email us a password or sign-in token.

## Age

JustGO is for adults aged 18 and older. We don't ask for a birth date. If you believe someone under 18 has used JustGO, contact us so we can review it.

## Changes

We post updates to this policy at this address. Before we collect anything new, such as analytics, we will update this policy and ask for any permission the law requires.

## Contact

Email [anthonyyoo24@gmail.com](mailto:anthonyyoo24@gmail.com) with any privacy question or request.
<!-- public:end -->

## Distribution conditions

Before external beta distribution, verify the actual provider arrangements for private-content processing; managed Auth account/profile retention and deletion; CloudKit container, Apple-account isolation and purge behavior; signed-iPhone token/SQLite/temporary-file protection; Files/picker restore; support procedure; regional notice requirements; and actual hosted cutover. Earlier completion-only clearance does not cover this processing. Do not invent provider agreements, backup expiry, end-to-end encryption or deployed behavior. Update the public policy if the verified arrangements change its disclosures. Paid billing and future analytics need their separate notices and activation gates.
