---
name: verify-delete-all-retry
description: Recheck that one JustGO delete-all intent resets the server at most once and that a retry finishes the deletion, by running every bounded schedule of crashes, lost acknowledgements and other-device writes or deletes against the real CloudDataCoordinator. Use before you merge a change to the delete-all path (deleteData or the deleting branch of run in apps/mobile/src/data/cloud/coordinator.ts, apps/api/src/data-sync/deletion.ts or epoch.ts, AccountRepository clearData or observeDataEpoch, ActivityRuntime.deleteAllData), when the check fails, or when asked whether a delete-all retry can lose data.
---

# Verify the delete-all retry

## What it checks

**Property.** One delete-all intent resets the server at most once, so a lost acknowledgement, an app crash at any await, or another device's write or delete can never make a retry delete activity written after the intent's reset. Once crashes stop, a retry finishes the deletion and clears local data.

**Harm.** A second reset deletes completions and private journal entries that the user wrote after the deletion, on this or another device, and that loss cannot be recovered.

The check reports a counterexample for each of three invariants:

1. This device's requests reset the server at most once, and that reset carries the `deletionEpoch` that the intent first persisted in `justgo:v1:<account>:cloud-sync`.
2. This device never deletes a completion that another device wrote after this device's reset.
3. After the last retry, `completedDeletionId` is the intent, `deleting` and `clearing` are false, `delete-all-pending` is gone, a restarted `AccountRepository` holds no local completions or journal entries, and the server epoch is above the captured epoch. A retry that met no crash or interference must succeed, and every call must settle.

`docs/architecture/ACTIVITY_DATA.md` states the same rule in its "Deletion epochs" table, in the row for a lost reset acknowledgement.

## Run it

From the repository root:

```sh
npm run test -w @justgo/mobile -- --runTestsByPath src/data/cloud/coordinator-deletion.model.test.ts
```

At the sync commit it explored 2,797 schedules in about 8 seconds, and the Jest run took about 10 seconds on an 8 GB Mac. The full mobile suite and CI run it too.

## How it works

This is bounded exhaustive exploration of the real client against a model of the server, not a proof. TLC needs a Java runtime that this Mac does not have, and a Jest check runs the real coordinator in the existing CI with no new tool.

- The test seeds a phone that completed one challenge, wrote one reflection and synchronized at epoch 0. It then persists the intent under `delete-all-pending`, as `ActivityRuntime.deleteAllData` does before it calls `deleteData`.
- Each schedule runs the real `CloudDataCoordinator.deleteData(intent)` with a real `AccountRepository` and `LocalJournalRepository`, over `MemoryStorage` and the memory journal backend from `apps/mobile/test-support/`.
- The fake transport talks to the `Server` class in the test. `Server.deleteData` follows `DeleteDataService.delete` in `deletion.ts` branch by branch. The `data_epoch === expectedEpoch + 1 && data_deleted_at` branch returns the earlier result, `requireDataEpoch` rejects any other epoch, and the rest tombstones, deletes and sets `data_epoch + 1`. `Server.putCompletions` follows the epoch fence and tombstone check of `completions.ts`.
- The schedule picks one option at each choice point:
  - Before each transport call, another device may write a completion at the current epoch, or delete all data at the current epoch through the same compare-and-set. These may repeat at one point.
  - At `deleteData`, `putCompletions` and `putVersions`, the app may crash before the request reaches the server. Or the server applies the call and the response is lost, so the client gets `ApiError('NETWORK')`.
  - Before each storage write or removal that changes the stored value, and before the local journal's `deleteOwned` while it holds entries, the app may crash.
- A crash freezes that app instance for good. The runtime then builds a fresh `AccountRepository` and `CloudDataCoordinator` over the same storage, journal and server, and calls `deleteData(intent)` again. After an error, the runtime calls `deleteData(intent)` again on the same instance. After success, it removes `delete-all-pending`, which is also a crash point.
- Each schedule has at most 2 faults (crashes or lost acknowledgements) and 2 other-device events. The test walks every combination depth first and replays each schedule from the seed.
- Three reductions keep the count small without losing a reachable state. Another device acts only just before a transport call, because the phone sees the server only through the transport. A read offers no crash or lost acknowledgement, because neither changes durable state, so the next write's crash point reaches the same state. A crash is offered only before a write that changes state, because a crash before a no-op write leaves the same state as a crash at the next write.

## Read a failure

The failure lists each broken invariant once, with its shortest schedule (fewest events, then fewest steps) as numbered steps. For example, with the second scratch edit below:

```text
Invariant 1: this device reset the server from epochs [0, 1] but the intent captured epoch 1
  1. save cloud-sync deleting=true deletionId=intent
  2. completions(null) -> dataEpoch 0
  3. deleteData(0) -> server resets epoch 0 to 1, but the response is lost (NETWORK)
  4. deleteData(intent) fails with NETWORK; the runtime retries it
  5. completions(null) -> dataEpoch 1
  6. deleteData(1) -> server resets epoch 1 to 2
```

Replay the steps against the code. Each `save cloud-sync` line is a `this.save` call in `coordinator.ts`, each `setItem` or `removeItem` line is a storage write, each call with parentheses is a transport request, and each "another device" line is a server-only event.

- If every step can happen in the real code and against `deletion.ts`, it is a bug. Report the schedule and the harm. Do not weaken an invariant, the bounds or the server model to make it pass, and do not change product code unless the owner asks.
- If a step cannot happen, the harness is wrong. Examples are a `Server` transition that `deletion.ts` forbids, or a crash point inside a step that is atomic in the code. Fix the harness and say what was wrong.
- `Replay diverged` means the delete path is no longer deterministic under the harness, for example a timer, a random ID or an unordered iteration. Give it a seam. It is not a property failure.
- `never settled` means a call waited on something the harness never resolves, such as a timer or a native module. Give it a seam.
- A failing `reached` assertion means the exploration no longer reaches an injection point, for example because deletion moved to a new transport method or storage key. Until you update the harness, a pass proves nothing.

## Show it can still fail

After you change the harness or the covered code, apply one scratch edit to `run()` in `apps/mobile/src/data/cloud/coordinator.ts`, run the command, and confirm that it fails. Then restore the file with `git checkout -- apps/mobile/src/data/cloud/coordinator.ts` and confirm that it passes. Never commit a scratch edit.

| Scratch edit                                                                                           | Breaks | Shortest schedule at the sync commit                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drop the `if (metadata.deletionEpoch === null)` guard, so every run captures and saves the page epoch  | 1, 2   | `deleteData(0)` resets 0 to 1 and the response is lost. The retry reads epoch 1, saves `deletionEpoch=1`, and `deleteData(1)` resets again. With another device's write at epoch 1 first, that write is deleted. |
| Remove `await this.save(metadata)` inside that guard, so `deletionEpoch` persists only after the reset | 1, 2   | `deleteData(0)` resets 0 to 1 and the response is lost. The retry still has no `deletionEpoch`, reads epoch 1 and resets again.                                                                                  |
| Replace the `page.dataEpoch > metadata.deletionEpoch` skip with an unconditional `deleteData` call     | 3      | After the phone saves `deletionEpoch=0`, another device deletes twice. `deleteData(0)` gets `DATA_EPOCH_CHANGED`, and so does every retry, so the deletion never finishes.                                       |

## Coverage and sync

The sync commit is `49a60223bb5df085f7657ef916a94edf65414d26`. At this commit the exploration was confirmed to describe this code:

- `deleteData`, the `metadata.deleting` branch of `run`, `load`, `save`, `synchronize` and `launch` in `apps/mobile/src/data/cloud/coordinator.ts` run as real code.
- `hydrate`, `observeDataEpoch`, `clearData` and `snapshotData` in `apps/mobile/src/data/activity/repository.ts` run as real code.
- `clear` in `apps/mobile/src/data/journal/repository.ts` runs as real code.
- `Server.deleteData` models `DeleteDataService.delete` in `apps/api/src/data-sync/deletion.ts`.
- `Server` models `requireDataEpoch` in `apps/api/src/data-sync/epoch.ts`.
- `Server.putCompletions` models the epoch fence and tombstone check of `CompletionRestoreService.restore` in `apps/api/src/data-sync/completions.ts`.
- The test models `deleteAllData` in `apps/mobile/src/app-support/providers/activity-runtime.ts`. It persists the intent first, reuses it on every retry and removes `delete-all-pending` last.

Before you trust a pass, run `git diff 49a60223bb5df085f7657ef916a94edf65414d26 -- <the files above>`. Read each change and decide whether the harness still describes it. `/pstack:maintain-formal-verification-skill` is the full upkeep loop. Move the sync commit only after you have confirmed that the harness describes the code at the new commit, rerun the check, and shown one scratch edit still failing.

When a change to the covered code is intended:

- A new storage write or a new `deleteData` or `completions` call on the delete path becomes a choice point with no harness change. Rerun and read the new schedules.
- A new state-changing transport method or storage key on the delete path needs a crash point and a `reached` entry.
- A change to `deletion.ts`, `epoch.ts` or the completion fence needs the matching change in `Server`, line for line.
- A change to what delete-all promises changes an invariant. Cite the evidence (the docs table, tests or commit message) and record the old and new wording in the PR.

## Not covered

- The real PostgreSQL transaction. `Server.deleteData` is one atomic step, and `npm run test:db` covers the SQL.
- Journal-version uploads from other devices, and the ordinary sync path after the reset.
- iCloud deletion (`ICloudDataCoordinator.deletePreviouslySyncedData`) and the runtime's own `repository.clearData` after `deleteData` returns.
- The guest handover (`mergeGuestData`) and account switches during a deletion.
- Storage write failures such as `ENOSPC`, and local journal transaction commits as crash points. The delete path commits none at the sync commit.
- A concurrent `synchronize` on the same device. The runtime's `synchronizeData` returns early while `delete-all-pending` exists.
- More than one intent, more than 2 faults, or more than 2 other-device events. Three faults took 61 seconds for 16,914 schedules, and three other-device events took 35 seconds for 11,624.
