# Account and journal rollout

Phase 13 implements a local candidate for optional Apple and Google accounts,
local guest use, signed-in JustGO synchronization, optional CloudKit and complete
data controls. The authorized October 21 staging rollout applied migrations
0019–0023, configured native providers and submitted the configured internal
iPhone build. Follow [account setup](ACCOUNT_SYNC_SETUP.md) for provider settings
and the [`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate)
for API and build acceptance status. Retain the
[External beta](https://github.com/anthonyyoo24/justgo/milestone/1) acceptance gates.

## Coordinated rollout

1. Inventory deployed versions, schema, affected row counts and retained provider
   copies without recording private text or credentials. Keep a protected
   restorable snapshot, and reconcile deletion and revocation records during any
   restore.
2. Rehearse registered migrations 0019–0023 on disposable data. 0019 preserves
   legacy instruction and private bytes and freezes old private writes. 0020 runs
   the owner-approved reset of only old server reflections and receipts. 0021 adds
   managed Auth ownership, journal versions, and epochs and tombstones. 0022 adds
   orphan historical context. 0023 adds durable Auth deletion cleanup. Never
   rewrite applied migrations.
3. Get authorization for the actual hosted cutover. The earlier server-only reset
   excludes accounts, challenge history and all phone data. Verify its scope and
   counts before you run it. Local migration tests are not evidence of hosted
   removal.
4. Configure Supabase Auth, the Apple and Google clients, the private live-session
   helper and CloudKit as documented. Keep server admin credentials off the phone.
   Keep provider enablement the same in the client and the API. Do not ship
   provider buttons that look working before setup is done.
5. Prepare a separately authorized signed native build that contains Google and
   Apple Auth, SQLite, DocumentPicker, and the CloudKit module and capabilities.
   Existing development builds do not establish configured provider and CloudKit
   behavior or signed-device acceptance of this revision.
6. Retire incompatible clients under an approved maintenance or update plan. There
   is no automatic in-app forced upgrade system. The old private PATCH still
   returns 410 before body parsing, but hosts can still receive bytes that an old
   app sends. Verify that clients actually stopped using that protocol.
7. On the staged binary, verify guest use with no upload, both providers,
   authenticated legacy linking, returning sync, full offline history, logout
   ownership, complete file import and export, and both deletion flows. Reopen
   traffic only after acceptance.

Do not restore an older private-writing API against new grants. Repair forward
while incompatible traffic is closed. Database restoration uses the existing
[restore checklist](CLOUDFLARE_BACKUPS.md#restore-checklist) plus managed Auth
revocations, canonical owner links, data epochs and tombstones, and pending Auth
cleanup. A database snapshot must not reopen deleted accounts or restore erased
journal records. The cleanup command is an operator tool. The local
implementation installs no recurring schedule.

## Phone preservation and cloud disclosure

Legacy phone hydration preserves current, cached and submitted private versions
locally before it retires obsolete private retries. A failure keeps the original
source. There is no **Recover earlier journal** option or legacy-cloud
preservation endpoint. Guest **Continue** creates only local storage.

Before provider sign-in, explain that JustGO will store challenge history and
private writing in its cloud, and that the first sign-in automatically adds
unowned phone entries. There is no unchecked merge choice. Do not treat provider
sign-in as iCloud permission. Logout keeps the same visible, editable journal and
stops JustGO uploads. Returning to the same account synchronizes edits saved while
signed out. Remove the old **View guest data** path. Keep other accounts' writing
isolated.

On upgraded installations, adopt any unconsumed parked guest source only through
this disclosed sign-in flow. Keep a durable pending, copied or consumed handover
state. Preserve source data until the target accepts it, and complete source
retirement before you expose account deletion. Ordinary adoption must skip
deleted IDs and preserve differing writing. It must never use the explicit-import
restoration permission.

## Retained copies

Delete-all uses a persistent operation identity and epoch and generation fences to
stop a stale device from resurrecting data. Account deletion also closes access
and removes the Auth user, with a durable retry if external deletion fails. Both
actions include previously associated app-managed iCloud copies, even after
**Sync** is turned OFF. If the relevant Apple account or iCloud service is
unavailable, keep cleanup durably pending and retry when it is available. Do not
report the cleanup as complete or silently reset that state. Only an explicit
file import can restore deleted records. Retired guest sources must not restore
deleted writing. External files are under the user's control.

Record live deletion and expiry separately for provider backups, paused-project
recovery copies and operator snapshots. The planned Pro seven-day backup target is
not evidence of today's Free retention or of every recovery-copy expiry. Signed-in
journal sync reopens the private-data processing and provider conditions. Use the
current [data inventory](../legal/DATA_INVENTORY.md) and
[regional assessment](../legal/RELEASE_DISCLOSURES.md#regional-assessment), not
the superseded local-only assessment.

## Device and manual-file acceptance

On a compatible signed iPhone build, verify these account behaviors: real Apple
and Google login, cancellation, refresh and revocation, verified switches between
the Apple and Google login methods, linking and unlinking, final-method
protection, logout with continued editing, and returning account data. Verify
SQLite behavior on relaunch, on interruption and on a full phone. Verify Data
Protection and system backup of the database, WAL and SHM files, secure token
storage size and failures, and temporary-file cleanup.

Test save, import and cancellation in Files, the iCloud Drive destination,
repeated and conflicting imports, guest import and same-account restoration. A
downloaded file does not grant account access. Test actual CloudKit on two
devices: enabling and disabling, offline edits, concurrent versions, a full or
unavailable iCloud, a changed Apple account, reset and retry, and account
closure. Browser mocks and Swift typechecking cannot establish these behaviors.

Previously associated app-managed iCloud copies and account cloud data must follow
the promised deletion flow. On both devices, test the sequence enable, disable,
delete, enable. Also test deletion after an Apple-account change, pending cleanup
for an unavailable account across relaunch, and a successful retry. User downloads
remain. Keep the paid-access, accessibility, inherited device, and public-policy
and provider gates open until their required evidence exists.
