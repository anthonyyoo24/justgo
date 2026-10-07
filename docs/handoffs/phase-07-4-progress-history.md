# Phase 07.4 — Progress and history integration

**Status:** Local implementation on `codex/phase-07.4-progress-history`, awaiting
Anthony's review. Started October 7 from clean `main` `09754e9`, whose approved
code baseline is `6780406`. Changes remain local; no push, PR or merge was
requested or performed. Publication and merge still require separate permission.

**Dependencies:** Read the [07.1 contracts/API](phase-07-1-api-data.md),
[07.2 repository/sender](phase-07-2-local-sync.md),
[07.3 runtime/feedback](phase-07-3-local-flow.md) and
[07.3A stopped checkpoint](phase-07-3a-testing-checkpoint.md).
07.3A remains deferred; its experimental code, native harness and CI migration
were not resumed. Existing browser/lower-level coverage and CI remain intact.

## Implemented behavior and owners

- `data/activity/progress.ts` owns local/backend summary, calendar and day
  composition. `useProgressReads.ts` owns the three independent canonical reads;
  `progress-read-cache.ts` preserves confirmed day edits in online query pages.
- `app-support/providers/ProgressRefresh.tsx` preloads summary/current month/today
  and refreshes after upload settlement and reconnection. It receives runtime
  dependencies directly. `activity-hooks.ts` shares context-free subscriptions.
- `features/progress/ProgressScreen.tsx` owns selected month/day and editing.
  `DayReflectionEditor.tsx` renders the textbox/actions; `useDayReflection.tsx`
  uses the existing `ReflectionController`, repository, sender and saving host.
  No second upload queue or automatic draft submission was added.
- Add/Edit saves text explicitly, preserves the original feeling, guards dirty
  closes and newer typing, prevents duplicate submissions, and exposes delayed
  saving feedback. Empty text-only edits cannot be submitted from either Save
  surface; text can be cleared when the retained feeling keeps the reflection valid.
- Independent unavailable states keep usable summary/calendar/day data visible.
  Available entries have no partial-history notices. An account change disposes
  the previous editor and fences its reads and callbacks.

## Paper design evidence

Used the actual local Paper MCP endpoint to read its required guide, selected
nodes, JSX, computed styles and screenshots from the
[owner's file](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0).
Selected `OYK-0` / `OYQ-0`: **Textbox 02 / SOFT FILL — Add / Edit**.
The existing Progress layout is retained with the selected inline design:
`#F8EEEA` fill, radius 10, padding 14, 76-point minimum textbox,
Inter 15/21, “What stood out to you?”, Cancel and the 130 × 36 dark Save pill.
Saved text expands with a separate Edit action. Feelings remain display-only.

Browser proofs at 390 × 844:
[Add](../checks/phase-07-4/browser/add-reflection.jpg),
[Edit](../checks/phase-07-4/browser/edit-reflection.jpg),
[saved text](../checks/phase-07-4/browser/saved-reflection.jpg).
Paper reads/screenshots remain in ignored `.local/phase-07-4/`; no Paper nodes
were modified or third-party bitmap screens shipped as UI.

## Cache and reconciliation contract

1. Summary totals add only eligible IDs not covered by the accepted summary.
   Current-month counts independently add their uncovered IDs. Acknowledgement
   alone does not remove additions; accepted aggregate snapshots rebase them.
   Unknown create outcomes block aggregate acceptance, and generation, account,
   date and time-zone fences reject obsolete responses.
2. Summary, current-month counts and today's downloaded pages are durable.
   A nullable `calendarBaseline` keeps compact reconciliation through disposable
   cache cleanup and defaults safely for older journal envelopes. Rollover clears
   obsolete month/day caches while retaining submitted pending activity.
3. Other months and days are online-only, even after being viewed. Their query
   pages stay in memory. Older-month snapshots from before a new local generation
   become unavailable until a current snapshot arrives. Frozen activity dates
   determine attribution, including an earlier month or a date ahead of today.
4. Day rows merge by attempt ID and preserve higher reflection revisions and
   later downloaded pages. Pagination tracks the cursor, avoiding a stall when a
   page overlaps cached rows. An explicit older-day edit temporarily pins its
   repository row; confirmed edits move to the in-memory day cache before pruning.
   Backend-wins conflict corrections can replace optimistic cached text.
5. Definitive ineligible/invalid/missing creates lose only their provisional
   credit once, keep submitted writing and do not block independent uploads.
   Temporary/uncertain failures keep provisional progress; reflection-only
   rejection keeps the accepted rep. Missing corrected streak context displays
   an unavailable value. Current streak ends today/yesterday; future frozen dates
   still retain total/month/best-streak credit.
6. Ten retained memory-only completions remain ten distinct rows/reps, with one
   active day when their dates match. Recovery, acknowledgement, rebasing and
   pruning do not double-count them. An active historical editor can keep its own
   accepted input offline; closing it restores the normal online-only lookup.

## Verification

Final October 7 closeout ran sequentially on the owner's 8 GB Mac. Logs are
ignored under `.local/phase-07-4/`; no coverage threshold or CI policy changed.

| Command                                | Final result                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                        | Passed: Doctor 21/21, formatting/lint/types, 175 architecture/tooling + 45 API + 380 mobile + 21 contract cases = 621.                            |
| `npm run test:db`                      | Passed against dedicated loopback `justgo_test`: 60 database + 1 migration/restoration cases.                                                     |
| `npm run test:coverage`                | Passed all existing global/critical floors. Mobile branches/lines 89.50% / 94.31%; Progress 90.93% / 93.65%; API 91.19% / 95.71%; contracts 100%. |
| `npm run export:web -w @justgo/mobile` | Passed cold web bundle/export.                                                                                                                    |
| `npm run export:ios -w @justgo/mobile` | Passed cold iOS Hermes bundle/export; this is not a new native binary.                                                                            |
| `npm run test:journey`                 | Passed 21/21 actual app/repository/API/disposable-database cases, including five Progress cases. Hosted CI remains unverified for this branch.    |

The five saved Progress cases cover 10 + 1 through acknowledgement/restart and
inline Add/Edit; today's 21-row paging/offline cache and older-history restrictions;
ten memory-only completions/recovery; definitive rejection with retained writing
through restart; and older-day Add/Edit after accepted-record pruning. Existing
lost-response/session/account/recovery/cleanup cases remain in the full suite.
Lower-level tests cover rollover, stale generations/revisions, independent query
failures, corrected unavailable streaks, backend-wins cache repair and editor races.

The final long-offline fixture measured **314,654 encoded bytes**, **0.274 ms**
JSON serialization and **53.952 ms** for all local saves: ten 10,000-character
reflections / 20 queued operations. Existing regression budgets remain under
400,000 bytes and under 100 ms for serialization. The suite also verifies recovery
and ten database reps. Measurements are attached to the ignored journey HTML
report; they describe this fixture, not a general device-performance guarantee.
Expo's web fixture startup logged the host's missing default `simctl` path;
the 21 browser cases passed, and native evidence below used command-scoped Xcode.

Interactive browser verification passed Add → dirty Cancel → Keep editing →
Save → Edit → Save. The refreshed final bundle passed Add/Edit again with no
browser warnings/errors. The initial live check found an Edit hit-target overlap
and a provider import cycle; both were repaired. CI-mode Metro held the old bundle
until a restart with `--clear`; final proof images use the refreshed bundle.
Two registry-owned disposable browser accounts and their two reps were removed
transactionally. All 18 pre-existing database accounts were preserved.

Manual native verification used the existing signed JustGO app, iPhone 17 / iOS
26.5 QA simulator `F0926FE3-5692-4241-B6C8-C5C4F9C6422E`, production native
adapters and the Codex side-panel mirror. No new build, signing change, simulator
erase, Keychain reset, outside simulator window or deferred testing pilot was used.
Existing QA history increased **11 → 12 reps**, **2 → 3 active days/streak days**
after one synthetic completion. Feeling-only save → inline Add → dirty-close /
Keep editing → Save → Edit → Save passed; database text/revision **3** and the
original feeling were confirmed. Reading only this fixture's native AsyncStorage
journal confirmed its saved text, phone version and summary total 12. Termination /
relaunch preserved the account, total and edited text; the refreshed final bundle
also verified saved text, prefilled Edit and clean Cancel.

Native proofs:
[Add](../checks/phase-07-4/native/add-reflection.jpg),
[Edit](../checks/phase-07-4/native/edit-reflection.jpg),
[relaunch](../checks/phase-07-4/native/relaunch-reflection.jpg).
The retained QA account/container and its one added synthetic rep remain intact.
Task API/Metro/mirror services and temporary browser tabs were stopped; the
previously booted simulator was retained. AX snapshotting returned no native
children, and MCP's host Xcode path was Command Line Tools. Command-scoped full
Xcode plus the installed debugger's HID helper enabled typing, with all visual
inspection in the side panel. No global Xcode selection changed.

## Failures caught and repaired

- Saved text intercepted Edit taps: the action now renders above the text; the
  saved app journey caught the failure and subsequently passed.
- A test backend treated explicit `null` text as unchanged. It now distinguishes
  null from an omitted field; feeling-preserving text clearing is covered.
- An older-day confirmed edit disappeared after pruning and a stale read. A
  regression failed before the fix and passes with canonical query reconciliation;
  the saved suite now includes historical Add/Edit and online-only presentation.
- Repeated fixture runs shared a durable identity rate namespace. A repeat run
  returned an unexpected bootstrap error without a captured code; the namespace
  was made unique per run while preserving actual rate limits, and safe HTTP/code
  diagnostics were added. Subsequent full runs passed. No production rate policy
  or assertion/coverage threshold was weakened.

## October 7 owner review — Edit pencil

Anthony found that the saved reflection's Edit action lacked its pencil icon.
The action now reuses the existing decorative pencil beside Edit, with horizontal
spacing and enough reserved text space to prevent overlap. The whole icon/label
pair retains the single accessible Edit action and its 44-point minimum height.

Anthony requested separate local commits. The original Phase 7.4 implementation
is `ed03103`; the pencil correction, regression and proof are in `1e65db3`.

A regression failed on the missing image before the fix. The updated Progress
view/screen checks pass **48/48**; fresh `npm run check` passes **622 cases**,
including **381 mobile cases** and Doctor **21/21**. Fresh mobile coverage and
`npm run coverage:check` pass unchanged floors, with the same mobile coverage
measurements as the original closeout above. Database contracts were unchanged;
the earlier database and 21-journey evidence remains the phase baseline.

The running native app refreshed through Metro. Side-panel verification confirmed
the pencil appears left of Edit; tapping the pencil opens the existing synthetic
QA reflection, and clean Cancel returns without changing it.
[Updated native action](../checks/phase-07-4/native/edit-pencil.jpg).
The existing simulator/account is retained, and API/Metro/mirror services are now
left running for Anthony's testing. The earlier shutdown note describes the
initial verification session. No publication or deferred 07.3A work occurred.

## October 7 owner review — Add plus

Anthony requested the original plus beside Add reflection. Paper action group
`OXF-0` contains the 13×13 SVG with path `M8 2v12M2 8h12`, 1.5-point ink stroke
and rounded caps. The Add action now uses that shape; View/Hide/Edit retain their
pencils. The decorative icon remains inside the existing single accessible action.
This follow-up is committed locally as `d8ee855`.

The new regression caught the pencil mismatch before the change. Focused Progress
view/screen checks pass **49/49**; fresh `npm run check` passes **623 cases**,
including **382 mobile cases** and Doctor **21/21**. Fresh mobile coverage is
**89.52% branches / 94.31% lines**. `npm run coverage:check` passes all unchanged
global/critical floors, using the fresh mobile report and the existing unchanged
API/contracts reports. Database and saved journey checks were not rerun for this
icon-only correction; their earlier phase evidence remains the baseline.

Side-panel verification of the running native app confirmed the plus appears
beside Add reflection, tapping it opens the empty textbox, and clean Cancel
returns to the row. No reflection was submitted during this check.
[Native Add action](../checks/phase-07-4/native/add-plus.jpg).
The existing simulator and API/Metro/mirror remain running for Anthony's testing.
The software-keyboard/device and other release gates below remain open.

## October 7 owner review — Whole row and editor motion

Anthony requested whole-row Add taps and a textbox that slides out like saved
reflection text. The existing title/ordinal/feeling/metadata handler remains one
accessible row action, with its hit area extended through the 12-point vertical
padding. Tapping an open editor's row still uses the existing dirty-close guard.

`SlidingEntryDetails.tsx` now owns the shared measured-height expansion for saved
text and Add/Edit editors. It preserves the existing 240 ms opening / 230 ms
closing curves, opacity and 12-point vertical slide. Editor replacement resizes
from the visible saved section's height while revealing the textbox. Reduced
motion applies the final state directly; cleanup stops both animations, and
collapsed content cannot receive taps or accessibility focus. The editor unmounts
on close while its empty space collapses, preserving controller disposal.

The new padding/motion regressions failed before the change; **58 focused
Progress row/view/screen cases pass**. They cover header descendants, measured
opening/closing, unchanged/empty measurements, animation cancellation, reduced
motion, saved-text-to-Edit resizing and dirty row-close protection.

Fresh `npm run check` passes **628 cases** (175 architecture/tooling, 45 API,
387 mobile and 21 contracts), including Doctor **21/21**. Fresh mobile coverage
is **89.88% branches / 94.42% lines**; `npm run coverage:check` passes every
unchanged global/critical floor using that report and the existing unchanged
API/contracts reports. One full run exceeded the existing 5-second timeout in the
feeling-preserving creation/clearing test. Its unchanged targeted run passed,
followed by the passing full check and coverage runs; no timeout or assertion was
weakened. Database and saved journeys remain the earlier phase evidence and were
not rerun for this presentation-only follow-up.

Side-panel checks of the installed native app confirmed title/padding taps open
the empty Add textbox, clean Cancel restores the row, and Edit loads only the
known synthetic QA reflection. No writing was submitted or changed. The mirror
briefly showed delayed frames/device metadata during the full checks; after it
recovered, the final endpoints were verified again.
[Add endpoint](../checks/phase-07-4/native/row-add-editor.jpg),
[Edit endpoint](../checks/phase-07-4/native/row-edit-editor.jpg).
These screenshots verify the native endpoints; automated assertions verify the
animation settings. They do not establish frame-rate or software-keyboard/device
acceptance. Existing API/Metro/mirror services remain running for Anthony.

## Open review and release checks

- Anthony's code/design review and permission for any commit publication/PR/merge.
  Hosted CI is unverified for this unpushed branch.
- Software-keyboard sheet layout, physical-device storage/Keychain/iCloud/backup,
  actual radio connectivity, VoiceOver/focus, large text/reduced motion and the
  earlier native transition/safe-area checks remain owned by Anthony / native
  acceptance before release. This simulator used hardware-keyboard HID input;
  its absence of an on-screen keyboard does not verify that layout.
- The pre-existing metric suffix still renders “1 days”; singular copy remains
  an open Progress polish finding for owner review / 07.5 acceptance.
- 07.3A native automation/hosted CI remains deferred. 07.5 owns final obsolete
  schema/routes/fixtures removal, full documentation reconciliation and the
  integrated CI closeout. Billing remains 07A and staging/release remains 09.
