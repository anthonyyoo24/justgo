# Activity data, saving and synchronization

This describes the revised Phase 13 local implementation candidate. Hosted services
and installed clients keep their earlier behavior until the coordinated rollout.
[IDENTITY.md](IDENTITY.md) owns account access, [APP_SHELL.md](APP_SHELL.md) owns
runtime composition, and the [handoff](../handoffs/phase-13-local-journal.md) records
actual verification and open device/hosting gates.

## Ownership and durable saving

Every saved collection has a stable UUID and a guest or account owner. Guest use
creates no JustGO account and sends no journal/history to JustGO. After the sign-in
disclosure, the unconsumed guest source is adopted into the verified canonical
account collection. Successful handover retires that source; there is no guest-data
selector. Signing out stops account uploads while retaining the same editable,
owner-bound local journal. Signing back into that account synchronizes later local
edits. Another account never inherits those account-owned entries.

`data/activity/` owns completion history and shared live state. `data/journal/`
owns private entries and preserved alternatives, using SQLite on iOS and IndexedDB
on web. `data/cloud/` owns JustGO synchronization and optional iCloud coordination;
`data/backup/` owns portable file formats. Features cannot maintain competing queues
or bypass these owners. Storage, transport, time and randomness have controllable
boundaries. Credentials stay in secure identity storage, outside exported data.

Completed alone creates a rep. Its UUID is generated once before saving and reused
through retries. Start/Give up create no rep. The captured start/time zone freezes
`activityDate`; a later save, upload, import or travel cannot move it. Historical
instruction text survives catalog changes. An orphan private entry retains its
context without creating a completion or inflating counts. Timeless import/context
validation accepts equivalent ISO fractional-second formatting while retaining real
microsecond differences and rejecting inconsistent date/zone attribution.

Private entries contain owner/attempt IDs, historical context, feeling-scale version
1, feeling/text and local revision. Blank text normalizes to null; a saved entry must
retain a feeling or nonblank text. Text is limited to 10,000 characters. Progress
edits preserve feeling and cannot empty text-only entries. Explicit saves await a
local transaction. Failure retains editor input and reports the phone-storage error;
there is no private network fallback or draft autosave.

Native SQLite uses WAL, FULL synchronization and exclusive transactions. Browser
IndexedDB uses both stores in one strict-durability transaction. Serialize edits,
imports and snapshots. Invalid/unreadable private records fail without resetting
storage. Native durability, Data Protection and OS backup need signed-device proof.
A commit accepted before backgrounding may finish for its original owner; actual
account changes fence stale UI adoption and reload durable state on return.

Managed guest/account modes retain complete completion history locally. They do
not prune acknowledged history into a bounded cache. Progress totals, calendars,
streaks and day rows derive from unique saved completion IDs, with private content
joined by ID. All downloaded history remains readable offline. Local journal-only
rows never invent reps. A failed cloud read cannot replace local data with an empty
result. Legacy bounded aggregate reconciliation remains an internal compatibility
path, not the managed model.

The completion envelope is separate from the private database. Legacy phone rows,
cached private versions and submission receipts are preserved in the private store
before private queues are scrubbed. Preserve the original source through failed
migration and rollover. Retired private PATCH operations never replay.

### Guest source handover

`guestAdoption` persists `pending`, `copied` and `consumed` stages in the identity
owner. The runtime drains already accepted source writes and source/destination
coordinator work before copying. It discards cached destination coordinators so
their earlier epoch metadata cannot clear newly accepted account writing. A source
write fence spans copying through durable destination selection; failures retain
recoverable input and retry state rather than switching to an empty journal.

The target first reconciles its cloud history and deletion epoch. Adoption uses
ordinary tombstone protection, never the explicit-file `restoreDeleted` override.
Deleted IDs remain deleted, while independent undeleted records can proceed.
The guest iCloud handover binds the same destination, verifies copied snapshots,
then resets/purges the old copy with durable cursor/generation state. A disabled
sync toggle does not exempt a previously associated guest copy from this cleanup.
An unfinished handover blocks ordinary guest iCloud delivery, preventing the
retiring source from being uploaded again.

Only after the verified destination is durably selected does local source erasure
finish and mark adoption consumed. Crash/retry cannot adopt that source twice or
reopen it as an independent journal. A parked guest source may be adopted while a
different account is selected, but that account's own data stays isolated. Older
managed state with unknown adoption must pass through the disclosure again before
copying its previously excluded guest writing.

## JustGO account synchronization

All authenticated resources derive ownership from the verified bearer session and
live session/deletion state. Strict schemas reject caller-selected owners. Guest
catalog/access GETs create no account and preserve paid-access policy.

| Resource                                           | Behavior                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/guest/access`, `GET /v1/guest/challenges` | Anonymous access/catalog; only explicit staging beta windows grant guest access.                                       |
| `GET /v1/challenges`                               | Authenticated catalog with ordinary access checks.                                                                     |
| `GET /v1/completion-restores`                      | Cursor-paged complete owner history plus data epoch.                                                                   |
| `POST /v1/completion-restores`                     | Bounded historical completion merge with stable IDs, expected epoch and frozen context validation.                     |
| `GET /v1/journal-sync`                             | Cursor-paged immutable private versions and epoch.                                                                     |
| `POST /v1/journal-sync`                            | Owner-isolated versions, parent ancestry and historical context; private fields are separate from completion payloads. |
| `DELETE /v1/data`                                  | Idempotent expected-epoch activity/journal reset; retains account and entitlement.                                     |
| `PATCH /v1/attempts/:id`                           | Retired with 410 before private body parsing.                                                                          |

Existing completion/progress APIs remain for compatibility; managed clients use the
full-history resources. No recovery-earlier-journal route or UI remains. Server
reflection reset is a separate forward migration, limited to old private fields and
receipts; it preserves completion history/accounts and does not touch phone writing.

The coordinator saves locally first, downloads every page against one stable epoch,
merges, then delivers missing records in bounded batches. It refuses inconsistent
pages, oversized enumerations and conflicting completion identity. Stable version
UUIDs and canonical fingerprints are persisted before delivery, so a lost response
can replay the same version. Private fingerprints remain in owner sync metadata,
never diagnostics. Immutable parent ancestry permits a known successor to replace
its ancestor only while that local version is unchanged. Concurrent writing is
preserved as alternatives instead of choosing a timestamp winner.

Synchronization is coalesced and fenced by active/online state, owner, session and
epoch. Logout aborts requests and stops account synchronization. Foreground,
reconnect and a sparse active timer retry; failures retain local data. Guest data
can enter an account only through the disclosed handover. Signed-out account
writing stays with its owner and never uses another account's credentials.

Delete-all records a durable operation UUID before remote work and blocks new local
writes/imports while pending. The JustGO reset retains its original expected epoch;
a lost acknowledgement/restart cannot turn a retry into a second reset of newly
created remote data. Clear local data only through the coordinated operation, then
remove the pending intent. Other devices observing a newer epoch discard obsolete
local copies before upload. Server tombstones reject deleted IDs from background
sync. Only an explicit validated file import uses `restoreDeleted` to restore them.

## Optional iCloud copy

The native `justgo-icloud` Expo module uses the user's private CloudKit database,
separate owner zones and encrypted record payload fields. Sync defaults off. It is
an additional copy of the selected collection, independent of JustGO login. Turning
it off stops updates and retains local data and the previous iCloud copy. Destructive
cleanup uses a bounded maintenance operation for previously associated Apple
accounts without enabling ordinary sync. It checks the recorded Apple account;
unavailable or changed accounts leave cleanup retryable. Web reports unsupported; its tests do
not simulate native acceptance. Apple account changes fail closed rather than
uploading to a new iCloud owner silently.

First activation saves off before temporarily allowing the coordinator to sync.
Only a complete successful pass can persist the version-2 enabled preference;
failure, account/visit changes or cancellation leave it off. Maintenance cannot
borrow a pending activation. Earlier enabled preferences have no success proof
and migrate to off without deleting any records. Verified enabled choices survive
later transient background failures; their errors remain inside the Settings sheet.

Uploads are bounded by both record count and serialized UTF-8 bytes. The native
writer splits oversized batches finitely and refetches the root/change tag before
every atomic attempt; successful partial delivery retains immutable IDs for retry.
Collect per-record save/delete failures together with the final operation failure
before sanitizing errors. A quota rejection must retain `QUOTA_EXCEEDED` so Settings
can explain that the user's iCloud storage is full; unknown failures stay unavailable.
Expired CloudKit cursors restart reads. For deletion and guest handover, restart
only physical cleanup once per invocation and persist the cleared cursor first;
retain the original fenced generation, reset/closure intent and accepted adoption.
Never repeat a deletion reset merely to recover pagination.

Generation-based conditional writes, stable reset IDs and per-account data epochs
prevent stale devices restoring deleted data. A newer JustGO epoch replaces stale
iCloud records without deleting fresh local history. A signed-out collection can
adopt a verified newer iCloud epoch; a signed-in unexpected future epoch fails for
reconciliation. Permanent account closure markers fence later uploads. Reset
uncertainty requires an explicit user decision. Lost reset acknowledgements retry
the original operation rather than deleting newer records.

Guarded native reads check zone existence before creation. A known generation or
the native Apple-account/collection history marker prevents a missing zone/root
from being mistaken for an empty first-use collection. `zoneNotFound` (including
Apple's encrypted-data-reset key) and `userDeletedZone` become the sanitized
`ZONE_RECOVERY_REQUIRED` code. Writes, reset, closure and purge never create a
missing root. An older bridge without guarded reads cannot sync a known generation;
Settings explains that a newer build is required.

Explicit recovery can create only an absent root/zone, never delete or replace a
live one. It writes the existing INT64 `wasReset` field as 2 (external recovery),
preserving the earlier 0/1 wire meanings and requiring no schema addition. Normal
resets retain this recovery marker. Every stale or unknown guest/account replica
requires confirmation before clearing and joining that recovered generation.
Check this before stale-epoch replacement or resumed replacement cleanup can
retain old phone writing. Persist clearing intent before clearing; lost responses
reuse the same recovered generation and preserve newer cloud writing. Pending
closure/deletion/cleanup/replacement or guest handover cannot enter ordinary zone
recovery. Account server epochs and associated Apple-account cleanup remain in
force; authenticated current server data may repopulate after the confirmed clear.

If all local history is erased and Apple returns only plain `zoneNotFound`, first
use cannot be distinguished from a historical deletion. Do not claim recovery
protection for that unknowable history. Native reset behavior is documented by
[Apple's reset-error key](https://developer.apple.com/documentation/cloudkit/ckerroruserdidresetencrypteddatakey).
A compatible signed recovery build and physical reset acceptance remain open;
Anthony deferred the other remaining manual cases in the Phase 13 plan.

## Download, import and deletion

Download produces one `justgo-data` format-1 stored ZIP: `data.json`, `journal.json`,
`activity.csv`, and `README.txt`. It includes complete completion history, current
private entries, alternatives and supported motion/haptics preferences. It excludes
credentials, sessions, upload queues and cached aggregate counts. CSV is formula
escaped and includes journal-only writing without representing it as completed reps.

The importer checks CRC/UTF-8, exact members, format, ownership, IDs, context and
bounds before preview/commit: 32 MiB archive, 50,000 combined records, 64 KiB per
record. Guest backups can move into the chosen collection; account files require
sign-in to that owner. A signed-out account collection routes to owner-bound
sign-in before opening the picker, then returns to Data for a new import action.
Possession of a file is never authentication. Legacy journal
ZIPs and older full exports preserve supported writing, including orphan/rejected
private rows, without inventing completion history. Missing entries are added;
identical imports are idempotent; conflicting versions are retained.

For a signed-in account, import reconciles current cloud state and explicitly
restores validated completion/private versions before local adoption. Partial
failures can retry stable identities. Preferences apply after data succeeds.
External saved files remain user-controlled snapshots; Files/iCloud Drive is a
possible destination, distinct from automatic CloudKit sync.

Delete all my data erases the current local collection, its JustGO account data and
its previously associated iCloud copies while retaining access and purchase entitlement. Signed-out
account data requires sign-in before remote reset. Account deletion additionally
closes access, hard-deletes the Supabase Auth user through retryable server cleanup,
and permanently fences associated iCloud account copies even with sync off. Neither
action reports completion while required cleanup is unavailable. Accepted writes drain
before local stores/preferences/temporary files are erased. External downloads and
provider retention copies require the separate disclosure/retention process in the
[rollout runbook](../operations/LOCAL_JOURNAL_ROLLOUT.md).

## Deck preferences and compatibility

`DeckPreferencesStorage` remains independent best-effort local state. Persist venue
and placement order, keep surviving cards across catalog refresh, add new cards
behind the front and rotate only the matching active front. Owner generations fence
late preference reads/writes. A preference failure cannot enter journal saving or
claim private data loss. Deletion drains writes before removing the owner's keys.

Legacy senders retain bounded create retry/backoff and coverage checks for their
original protocol. Managed complete-history restore does not re-enable old private
PATCH or remove paid admission for starting challenges. Historical migrations remain
immutable; registered 0019–0023 and matching API/mobile changes require one approved
coordinated rollout with deletion/revocation-aware restoration.
