# Activity data, saving and synchronization

[IDENTITY.md](IDENTITY.md) owns account access and [APP_SHELL.md](APP_SHELL.md)
owns runtime composition. This guide keeps the data rules that no check enforces
and the reasons behind them. Tests own the limits, error codes, file format and
iCloud protocol. `packages/contracts/src/openapi.ts` lists the routes. Open device
and hosting checks are
[`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate).

## Ownership and durable saving

Every saved collection has a stable UUID and one owner, either a guest or an
account. Guest use creates no JustGO account and sends no journal or history to
JustGO. Signing out stops account uploads and keeps the same editable journal
bound to its owner. Signing back in to that account syncs the later local edits.
Another account never inherits those entries.

Each kind of data has one owner module.

| Module           | Owns                                                                              |
| ---------------- | --------------------------------------------------------------------------------- |
| `data/activity/` | Completion history and shared live state                                          |
| `data/journal/`  | Private entries and preserved alternatives, in SQLite on iOS and IndexedDB on web |
| `data/cloud/`    | JustGO synchronization and the optional iCloud copy                               |
| `data/backup/`   | Portable file formats                                                             |

Features cannot run their own save or upload queues, and they cannot write around
these modules. No lint rule checks this yet, so review has to catch it.

Only Completed creates a rep. Its UUID is generated once before saving and reused
through every retry, so a retry cannot create a second rep. The start time and
time zone captured at Start fix `activityDate`, and a later save, upload, import
or trip never moves it.

Private writing has no network fallback and no draft autosave, so the phone holds
the only copy until sync. Native SQLite runs with WAL, `synchronous = FULL` and
exclusive transactions, and web IndexedDB writes both stores in one
strict-durability transaction. No test checks these settings, so review has to
catch a change.

Native SQLite loads lazily through a literal `require` that stays in the main
bundle, so opening saved data never depends on a separate development
split-bundle request. A failed hydration keeps only a fixed stage identifier in
live state, never a raw exception or journal text, and keeps the first failing
stage until a successful preparation clears it.

Managed guest and account modes keep complete completion history on the phone
and never prune it into a bounded cache. Progress totals, calendars, streaks and
day rows derive from unique saved completion IDs. The bounded aggregate cache
remains only for legacy senders.

### Guest source handover

The sign-in disclosure is the only way guest data enters an account. After it,
the unconsumed guest source moves into the verified account collection and the
source is retired. There is no guest-data selector. The identity controller
persists the `guestAdoption` stage, and the activity runtime copies and cleans up
the source.

| Stage      | Entered when                                                     | Rules                                                                                                                                                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pending`  | Sign-in maps the account after the disclosure                    | Accepted source writes and coordinator work drain before the copy. Cached destination coordinators are discarded so their old epoch metadata cannot clear new account writing. A source write fence holds until the destination is durably selected. A failure keeps the source and its retry state, never an empty journal. |
| `copied`   | The copy finished and the account collection is durably selected | Source erasure runs, and resumes after a restart. Ordinary guest iCloud delivery stays blocked so the retiring source is not uploaded again.                                                                                                                                                                                 |
| `consumed` | Source erasure finished                                          | A crash or retry cannot adopt the source twice or reopen it as an independent journal.                                                                                                                                                                                                                                       |

Before the copy, the target reconciles its cloud history and deletion epoch.
Deleted IDs stay deleted, and independent undeleted records proceed. A parked
guest source may be adopted while a different account is selected, and that
account's data stays isolated. Older managed state with an unknown stage goes
through the disclosure again before its earlier excluded guest writing is copied.

A guest source with a previously synced iCloud copy also runs an iCloud handover
during `pending`, even with sync off. The handover keeps its own record, with the
stages `copying`, `resetting`, `purging` and `complete`. Once it records the
destination, ordinary guest iCloud delivery fails with `HANDOVER_PENDING` until
source erasure. The old copy is reset and purged only after the destination
durably accepts the copied snapshot.

## Account synchronization

A JustGO download reads every completion and version page against one data
epoch. The download fails when a page reports a different epoch, when a cursor
repeats, or when it passes 50,000 records. Private fingerprints stay in the
owner's sync metadata and never enter diagnostics.

## Deletion epochs

Each account has a data epoch. Delete all my data advances it, and every device
and the iCloud copy fence their work against it.

| Event                                                 | Rule                                                                                                                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delete all starts                                     | A durable operation UUID is recorded before remote work. New local writes and imports are blocked while it is pending.                                      |
| The reset acknowledgement is lost                     | The retry reuses the original expected epoch and generation. It never resets newly created remote data.                                                     |
| Local data is cleared                                 | Only through the coordinated operation. The pending intent is removed afterward.                                                                            |
| A device sees a newer epoch                           | It discards obsolete local copies before any upload. It keeps the record of a finished delete-all, so a retry of that intent never resets the server again. |
| A signed-out collection sees a newer iCloud epoch     | It adopts the verified epoch.                                                                                                                               |
| A signed-in collection sees a future iCloud epoch     | Sync fails for reconciliation instead of uploading.                                                                                                         |
| The reset outcome is uncertain, or history is unknown | The user decides. Sync offers no destructive escape and does not re-upload deleted entries.                                                                 |

Delete all my data erases the current local collection, its JustGO account data
and its previously associated iCloud copies. Access and purchase entitlement
stay. [IDENTITY.md](IDENTITY.md) owns account deletion. External downloads and
provider retention copies follow the
[rollout runbook](../operations/LOCAL_JOURNAL_ROLLOUT.md).

## Optional iCloud copy

The `justgo-icloud` Expo module keeps an extra copy of the selected collection in
the user's private CloudKit database, independent of JustGO sign-in. On October
23 the owner replaced the earlier clear-and-sync design. Removing JustGO's iCloud
data in Apple Settings is a cloud-only action and never authorizes erasing phone
entries.

## Compatibility

Older senders keep bounded create retry and backoff for their original
protocol, and paid admission still gates starting a challenge. Applied migrations
stay immutable.
Migrations 0019 to 0023 and their matching API and mobile changes ship together in
one approved coordinated rollout with deletion- and revocation-aware restoration,
as the [rollout runbook](../operations/LOCAL_JOURNAL_ROLLOUT.md) describes.

`DeckPreferencesStorage` is best-effort local state. Deck and venue preferences
stay on this phone and never enter uploads, iCloud, downloads or analytics. A
preference failure never reaches journal saving or reports private data loss.
