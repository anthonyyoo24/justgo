---
name: verify-delete-all-retry
description: Recheck that one JustGO delete-all intent resets the server at most once and that a retry finishes the deletion, by running every bounded schedule of crashes, lost acknowledgements and other-device writes or deletes against the real CloudDataCoordinator. Use before you merge a change to the delete-all path (deleteData or the deleting branch of run in apps/mobile/src/data/cloud/coordinator.ts, the clearing path of run, apps/api/src/data-sync/deletion.ts or epoch.ts, AccountRepository clearData or observeDataEpoch, ActivityRuntime.deleteAllData or mergeGuestData), when the check fails, or when asked whether a delete-all retry can lose data.
---

# Verify the delete-all retry

## What it checks

**Property.** One delete-all intent resets the server at most once, so a lost acknowledgement, an app crash at any await, or another device's write or delete can never make a retry delete activity written after the intent's reset. Once crashes stop, a retry finishes the deletion and clears local data. The property also holds when an ordinary sync runs between attempts of a pending intent, such as the sync that `ActivityRuntime.mergeGuestData` runs through `adoptData` ([issue #156](#issue-156)).

**Harm.** A second reset deletes completions and private journal entries that the user wrote after the deletion, on this or another device, and that loss cannot be recovered.

The check reports a counterexample for each of three invariants:

1. This device's requests reset the server at most once, and that reset carries the `deletionEpoch` that the intent first persisted in `justgo:v1:<account>:cloud-sync`.
2. This device never deletes a completion that another device wrote after this device's reset.
3. After the last retry, `completedDeletionId` is the intent, `deleting` and `clearing` are false, `delete-all-pending` is gone, a restarted `AccountRepository` holds no local completions or journal entries, and the server epoch is above the captured epoch. Every completion and journal version that the server held when the runtime persisted the intent is gone from the server. A retry that met no crash or interference must succeed, and every call must settle.

`docs/architecture/ACTIVITY_DATA.md` states the same rule in its "Deletion epochs" table, in the row for a lost reset acknowledgement.

## Run it

From the repository root:

```sh
pnpm --filter @justgo/mobile run test --runTestsByPath src/data/cloud/coordinator-deletion.model.test.ts
```

The file holds two tests. The exploration covers 6,607 schedules at the sync commit and took 22 to 27 seconds on an 8 GB Mac, depending on load. Before it offered an ordinary sync, it covered 4,137 schedules in 13 to 16 seconds, and CI ran it in 21 seconds against its 60-second timeout. The other test replays the issue #156 schedule. The full mobile suite and CI run both.

## How it works

This is bounded exhaustive exploration of the real client against a model of the server, not a proof. TLC needs a Java runtime that this Mac does not have, and a Jest check runs the real coordinator in the existing CI with no new tool.

- The test seeds a phone that completed one challenge, wrote one reflection and synchronized at epoch 0.
- Each schedule first lets another device write or delete. It then persists the intent under `delete-all-pending`, as `ActivityRuntime.deleteAllData` does, and records which completions and journal versions the server holds at that moment.
- It then runs what `ActivityRuntime.deleteAllData` runs next: the real `CloudDataCoordinator.deleteData(intent)`, then the real `AccountRepository.clearData()`, then the removal of `delete-all-pending`. It leaves out the iCloud step (`ICloudDataCoordinator.deletePreviouslySyncedData`) between `deleteData` and `clearData`. The repository and `LocalJournalRepository` run over `MemoryStorage` and the memory journal backend from `apps/mobile/test-support/`.
- The fake transport talks to the `Server` class in the test. `Server.deleteData` follows `DeleteDataService.delete` in `deletion.ts` branch by branch. The `data_epoch === expectedEpoch + 1 && data_deleted_at` branch returns the earlier result, `requireDataEpoch` rejects any other epoch, and the rest tombstones, deletes and sets `data_epoch + 1`. `Server.putCompletions` follows the epoch fence and tombstone check of `completions.ts`.
- The schedule picks one option at each choice point:
  - Before the runtime persists the intent, and before each transport call, another device may write a completion at the current epoch, or delete all data at the current epoch through the same compare-and-set. These may repeat at one point.
  - At `deleteData`, `putCompletions` and `putVersions`, the app may crash before the request reaches the server. Or the server applies the call and the response is lost, so the client gets `ApiError('NETWORK')`.
  - Before each storage write or removal that changes the stored value, and before the local journal's `deleteOwned` while it holds entries, the app may crash.
  - Before each retry, the phone may run one ordinary `CloudDataCoordinator.synchronize()` on the current app instance, as `ActivityRuntime.mergeGuestData` does through `adoptData`. The transport calls and storage writes of that sync are choice points too.
- A crash freezes that app instance for good. The runtime then builds a fresh `AccountRepository` and `CloudDataCoordinator` over the same storage, journal and server, and runs the whole sequence again with the saved intent. After an error, it runs the sequence again on the same instance.
- When `deleteData` resets the server, `run()` has already cleared local data before the runtime's `clearData` runs, so those writes change nothing and offer no crash point. After an ordinary sync downloads newer server data, the runtime's `clearData` clears that data, and its writes are crash points. They would also become crash points if `run()` marked the intent complete before it cleared local data. The runtime's `clearData` then finishes the job, and the check passes, as it does in the real app.
- Each schedule has at most 2 faults (crashes or lost acknowledgements), 2 other-device events and 1 ordinary sync. The test walks every combination depth first and replays each schedule from the seed.
- Four reductions keep the count small without losing a reachable state. Another device acts only before the intent is persisted or just before a transport call. The phone sees the server only through the transport, and invariant 3 compares the end state with the server at the moment of the intent. A read offers no crash or lost acknowledgement, because neither changes durable state, so the next write's crash point reaches the same state. A crash is offered only before a write that changes state, because a crash before a no-op write leaves the same state as a crash at the next write. An ordinary sync is offered only while the stored metadata has `deleting` false. With `deleting` stored, the sync runs the same deleting branch as the retry that follows, and the retry's save of `deleting` changes nothing.

## Read a failure

The failure lists each broken invariant once, with its shortest schedule (fewest events, then fewest steps) as numbered steps. For example, this is the whole schedule for invariant 1 with the second scratch edit below:

```text
Invariant 1: this device reset the server from epochs [0, 1] but the intent captured epoch 1
  1. ActivityRuntime.deleteAllData persists the intent under delete-all-pending
  2. save cloud-sync deleting=true deletionId=intent
  3. completions(null) -> dataEpoch 0
  4. deleteData(0) -> server resets epoch 0 to 1, but the response is lost (NETWORK)
  5. deleteAllData fails with NETWORK and runs again with the saved intent
  6. completions(null) -> dataEpoch 1
  7. deleteData(1) -> server resets epoch 1 to 2
  8. save cloud-sync deletionEpoch=1 epoch=2 clearing=true
  9. setItem data-epoch 2
  10. deleteOwned local journal
  11. setItem journal with 0 completions
  12. save cloud-sync deleting=false deletionId=null deletionEpoch=null clearing=false completedDeletionId=intent
  13. removeItem delete-all-pending
```

Replay the steps against the code. Each `save cloud-sync` line is a `this.save` call in `coordinator.ts`, each `setItem` or `removeItem` line is a storage write, each call with parentheses is a transport request, and each "another device" line is a server-only event. A write that changes nothing gets no line. The steps after an `ActivityRuntime.mergeGuestData` line belong to that ordinary sync, up to the line that says the sync finishes or fails, or that the app restarts.

- If every step can happen in the real code and against `deletion.ts`, it is a bug. Report the schedule and the harm. Do not weaken an invariant, the bounds or the server model to make it pass, and do not change product code unless the owner asks.
- If a step cannot happen, the harness is wrong. Examples are a `Server` transition that `deletion.ts` forbids, or a crash point inside a step that is atomic in the code. Fix the harness and say what was wrong.
- `Replay diverged` means the delete path is no longer deterministic under the harness, for example a timer, a random ID or an unordered iteration. Give it a seam. It is not a property failure.
- `never settled` means a call waited on something the harness never resolves, such as a timer or a native module. Give it a seam.
- A failing `reached` assertion means the exploration no longer reaches an injection point, for example because deletion moved to a new transport method or storage key. Until you update the harness, a pass proves nothing.

## Issue #156

`ActivityRuntime.mergeGuestData` builds a fresh `CloudDataCoordinator`, and its `adoptData` calls `synchronize()` without checking `delete-all-pending`. Before the fix, when the epoch had moved since the deletion, that sync took the clearing path in `run()` and saved `emptyMetadata()`, which dropped `completedDeletionId`. The next `deleteData` with the same intent then reset the server again.

The clearing path now keeps the deletion fields. The exploration then found a second schedule: the app crashed inside that sync's clear and left `clearing` true next to the finished intent. The old `!metadata.clearing` condition in `deleteData` then reset the server again. `deleteData` now returns for a finished intent, and if a clear is pending it first finishes the clear through `synchronize()`.

The `it` case at the end of the test file replays the guest-merge schedule against the coordinator. The case `finishes a delete-all intent with one reset after guest adoption syncs another device deletion (issue #156)` in `apps/mobile/src/app-support/providers/activity-runtime.managed.test.ts` drives the same schedule through `ActivityRuntime.mergeGuestData`.

## Show it can still fail

After you change the harness or the covered code, apply one scratch edit to `apps/mobile/src/data/cloud/coordinator.ts`, run the command, and confirm that it fails. Then restore the file with `git checkout -- apps/mobile/src/data/cloud/coordinator.ts` and confirm that it passes. Never commit a scratch edit.

| Scratch edit                                                                                                                                             | Breaks | Shortest schedule at the sync commit                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In `run()`, drop the `if (metadata.deletionEpoch === null)` guard, so every run captures and saves the page epoch                                        | 1, 2   | `deleteData(0)` resets 0 to 1 and the response is lost. The retry reads epoch 1, saves `deletionEpoch=1`, and `deleteData(1)` resets again. With another device's write at epoch 1 first, that write is deleted.                                         |
| In `run()`, remove `await this.save(metadata)` inside that guard, so `deletionEpoch` persists only after the reset                                       | 1, 2   | `deleteData(0)` resets 0 to 1 and the response is lost. The retry still has no `deletionEpoch`, reads epoch 1 and resets again.                                                                                                                          |
| In `run()`, replace the `page.dataEpoch > metadata.deletionEpoch` skip with an unconditional `deleteData` call                                           | 3      | After the phone saves `deletionEpoch=0`, another device deletes twice. `deleteData(0)` gets `DATA_EPOCH_CHANGED`, and so does every retry, so the deletion never finishes.                                                                               |
| In `deleteData()`, add `deletionEpoch: metadata.deletionEpoch ?? metadata.epoch,` to the `save` call, so the intent captures the last synchronized epoch | 3      | Another device deletes all data at epoch 0 and writes completion 501 at epoch 1. The runtime persists the intent and the phone saves `deletionEpoch=0`. `completions(null)` returns epoch 1, so the phone skips the reset, and 501 stays on the server.  |
| In `run()`, build the clearing metadata from `emptyMetadata()` alone, so the clear drops `completedDeletionId`                                           | 1, 2   | The intent finishes, and the app crashes before it removes `delete-all-pending`. After the restart, an ordinary sync meets another device's deletion at epoch 1 and clears with `completedDeletionId=null`. The retry captures epoch 2 and resets again. |
| In `deleteData()`, return for a finished intent only when `clearing` is false, as the code did before issue #156                                         | 1, 2   | As in the row above, but the app crashes inside the sync's clear after it saves `clearing=true`. The retry finds `clearing` true, captures epoch 2 and resets again.                                                                                     |
| In `deleteData()`, remove the `synchronize()` call for a finished intent                                                                                 | 3      | The same crash as in the row above. The retry returns at once, so `clearing` stays true after the deletion finishes.                                                                                                                                     |

## Coverage and sync

The sync commit is `0555c8b89d92e0815959669ef0fc5daaba5a7e39`. At this commit the exploration was confirmed to describe this code:

- `deleteData`, `run`, `load`, `save`, `synchronize` and `launch` in `apps/mobile/src/data/cloud/coordinator.ts` run as real code. `run` takes its deleting branch, and during an ordinary sync its ordinary path, including the clearing path.
- `hydrate`, `observeDataEpoch`, `clearData` and `snapshotData` in `apps/mobile/src/data/activity/repository.ts` run as real code. During an ordinary sync, `mergeCompletions`, `snapshotJournal` and `mergeSyncedJournal` run too.
- `clear`, and during an ordinary sync `mergeSynced`, in `apps/mobile/src/data/journal/repository.ts` run as real code.
- `Server.deleteData` models `DeleteDataService.delete` in `apps/api/src/data-sync/deletion.ts`.
- `Server` models `requireDataEpoch` in `apps/api/src/data-sync/epoch.ts`.
- `Server.putCompletions` models the epoch fence and tombstone check of `CompletionRestoreService.restore` in `apps/api/src/data-sync/completions.ts`. `Server.putVersions` models the epoch fence of `apps/api/src/data-sync/journal.ts`.
- The test models `deleteAllData` in `apps/mobile/src/app-support/providers/activity-runtime.ts`. It persists the intent first, then runs `deleteData`, `clearData` and the removal of `delete-all-pending`, and reuses the intent on every retry. It leaves out the iCloud step. The ordinary sync and the issue #156 case model the `synchronize()` call that `mergeGuestData` reaches through `adoptData`.

Before you trust a pass, run `git diff 0555c8b89d92e0815959669ef0fc5daaba5a7e39 -- <the files above>`. Read each change and decide whether the harness still describes it. `/pstack:maintain-formal-verification-skill` is the full upkeep loop. Move the sync commit only after you have confirmed that the harness describes the code at the new commit, rerun the check, and shown one scratch edit still failing.

When a change to the covered code is intended:

- A new storage write or a new `deleteData` or `completions` call on the delete path becomes a choice point with no harness change. Rerun and read the new schedules.
- A new state-changing transport method or storage key on the delete path needs a crash point and a `reached` entry.
- A change to `deletion.ts`, `epoch.ts` or the completion fence needs the matching change in `Server`, line for line.
- A new step in `ActivityRuntime.deleteAllData` needs the matching step in the test's `deleteAllData`.
- A change to what delete-all promises changes an invariant. Cite the evidence (the docs table, tests or commit message) and record the old and new wording in the PR.

## Not covered

- The real PostgreSQL transaction. `Server.deleteData` is one atomic step, and `pnpm run test:db` covers the SQL.
- Journal-version uploads from other devices.
- iCloud deletion (`ICloudDataCoordinator.deletePreviouslySyncedData`), which runs between `deleteData` and `clearData` in the runtime.
- An ordinary sync that runs at the same time as `deleteData`. The exploration runs the sync only between attempts. `mergeGuestData` builds its own coordinator over the same `cloud-sync` key, so two coordinators could save that key in an interleaved order.
- The rest of the guest handover, and account switches during a deletion.
- Storage write failures such as `ENOSPC`, and local journal transaction commits as crash points. The delete path commits none at the sync commit.
- More than one intent, more than 2 faults, more than 2 other-device events, or more than 1 ordinary sync. On the earlier, smaller harness, three faults took 61 seconds and three other-device events took 35 seconds.
