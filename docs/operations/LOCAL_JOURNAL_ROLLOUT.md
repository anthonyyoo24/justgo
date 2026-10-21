# Account and journal rollout

Phase 13 implements a local candidate for optional Apple/Google accounts, local
guest use, signed-in JustGO synchronization, optional CloudKit and complete data
controls. The authorized October 21 staging rollout applied migrations 0019–0023,
configured native providers and submitted the configured internal iPhone build.
Follow [account setup](ACCOUNT_SYNC_SETUP.md) for current API/build status and retain the
[Phase 14](../implementation-plan/phase-14-release.md) acceptance gates.

## Coordinated rollout

1. Inventory deployed versions, schema, affected row counts and retained provider
   copies without recording private text or credentials. Keep a protected restorable
   snapshot and reconcile deletion/revocation records during any restore.
2. Rehearse registered migrations 0019–0023 on disposable data. 0019 preserves legacy
   instruction/private bytes and freezes old private writes. 0020 implements the
   owner-approved reset of old server reflections/receipts only. 0021 adds managed
   Auth ownership, journal versions, epochs/tombstones; 0022 adds orphan historical
   context; 0023 adds durable Auth deletion cleanup. Never rewrite applied migrations.
3. Obtain authorization for the actual hosted cutover. The earlier server-only reset
   excludes accounts, challenge history and all phone data. Verify scope/counts before
   executing it; local migration tests are not evidence of hosted removal.
4. Configure Supabase Auth, Apple/Google clients, the private live-session helper and
   CloudKit as documented. Keep server admin credentials off the phone. Match
   client/API enablement; do not ship working-looking provider buttons without setup.
5. Prepare a separately authorized signed native build containing Google/Apple Auth,
   SQLite, DocumentPicker and the CloudKit module/capabilities. Existing development
   builds do not establish configured provider/CloudKit behavior or signed-device
   acceptance of this revision.
6. Retire incompatible clients under an approved maintenance/update plan. There is
   no automatic in-app forced upgrade system. Old private PATCH remains 410 before
   body parsing, but hosts can still receive bytes sent by an old app; verify clients
   actually stopped using that protocol.
7. Verify guest no-upload, both providers, authenticated legacy linking, returning
   sync, full offline history, logout ownership, complete file import/export and
   both deletion flows on the staged binary. Reopen traffic only after acceptance.

Do not restore an older private-writing API against new grants. Repair forward
while incompatible traffic is closed. Database restoration uses the existing
[deletion/revocation checklist](FOUNDATION.md#backup-restore-checklist) plus managed
Auth revocations, canonical owner links, data epochs/tombstones and pending Auth
cleanup. A database snapshot must not reopen deleted accounts or restore erased
journal records. The cleanup command is an operator tool; no recurring schedule
is installed by local implementation.

## Phone preservation and cloud disclosure

Legacy phone hydration preserves current/cached/submitted private versions locally
before retiring obsolete private retries. Failure retains the original source.
There is no Recover earlier journal option or legacy-cloud preservation endpoint.
Guest Continue creates local storage only. Before provider sign-in, explain that
JustGO will store challenge history and private writing in its cloud and first
sign-in automatically adds unowned phone entries. There is no unchecked merge
choice. Do not treat provider sign-in as iCloud permission. Logout retains the same
visible, editable journal and stops JustGO uploads; returning to the same account
synchronizes edits saved while signed out. Remove the old View guest data path.
Other accounts' writing must remain isolated. On upgraded installations, adopt
any unconsumed parked guest source only through this disclosed sign-in flow.
Keep durable pending/copied/consumed handover state, preserve source data until
target acceptance, and complete source retirement before exposing account deletion.
Ordinary adoption must skip deleted IDs and preserve differing writing; it must
never use the explicit-import restoration permission.

## Retained copies

Delete-all uses persistent operation identity and epoch/generation fences to prevent
stale-device resurrection. Account deletion also closes access and removes the Auth
user, with durable retry if external deletion fails. Both actions include previously
associated app-managed iCloud copies even after Sync is turned OFF. If the relevant
Apple account or iCloud service is unavailable, keep cleanup durably pending and
retry when available; do not report completed cleanup or silently reset that state.
Only an explicit file import can restore deleted records. Retired guest sources
must not restore deleted writing. External files are under the user's control.

Record live deletion and expiry separately for provider backups, paused-project
recovery copies and operator snapshots. The planned Pro seven-day backup target is
not evidence of today's Free retention or every recovery-copy expiry. Signed-in
journal sync reopens private-data processing/provider conditions; use the current
[legal review](../legal/LEGAL_REVIEW.md), not the superseded local-only assessment.

## Device and manual-file acceptance

On a compatible signed iPhone build verify real Apple/Google login, cancellation,
refresh/revocation, verified Apple/Google login-method switches, linking/unlinking,
final-method protection, logout with continued editing, and returning account data. Verify
SQLite relaunch/interruption/phone-full behavior, Data Protection/system backup of
database/WAL/SHM, secure token storage size/failures and temporary-file cleanup.

Test Files save/import/cancellation, iCloud Drive destination, repeated and conflicting
imports, guest import and same-account restoration. A downloaded file does not grant
account access. Test actual CloudKit with two devices: enable/disable, offline edits,
concurrent versions, full/unavailable iCloud, changed Apple account, reset/retry and
account closure. Browser mocks/Swift typechecking cannot establish these behaviors.

Previously associated app-managed iCloud copies and account cloud data must follow
the promised deletion flow. Test enable → disable → delete → enable on both devices,
deletion after an Apple-account change, unavailable-account pending cleanup across
relaunch and successful retry. User downloads remain. Keep paid-access,
accessibility, inherited device and public-policy/provider gates open until their
required evidence exists.
