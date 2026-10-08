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

## October 7 owner review — Editor delay diagnosis

Anthony requested a native comparison after noticing that opening the textbox
lags and jumps while saved reflection text expands smoothly. Two paired trials
used the same installed iPhone 17 / iOS 26.5 development app through the existing
1052×1036 side-panel mirror. Only the known synthetic QA reflection and an empty
Add input were opened; no writing was submitted or changed.

Temporary metadata-only probes measured the native row's press callback through
the animation effect, rather than browser click delivery or production latency:

| Path / stage                         |  Trial 1 |  Trial 2 |
| ------------------------------------ | -------: | -------: |
| Saved text: press → animation effect |   182 ms |   228 ms |
| Add input: press → animation effect  |   452 ms |   538 ms |
| Add preparation: awaited pin         |   143 ms |   204 ms |
| Add preparation: awaited adoption    |   162 ms |   213 ms |
| Add input: press → focus event       | 1,055 ms | 1,078 ms |

Saved text is already mounted and measured. `useDayReflection` instead awaits
`setFlowAttempt` and `adoptAttempt` before constructing the editor. Adoption
clones/notifies/persists the journal even for an unchanged already-loaded row;
these steps add work and render passes before the input can be measured.
Both reveals use the same 240 ms curve, but height/opacity/translation all run
through React Native Animated's JavaScript driver. Native `simctl` recordings
showed intermediate saved-text heights in both trials; each Add reveal had only
the final changed height. In one controlled trial with only `autoFocus` disabled,
Add regained seven intermediate/final height positions, although its first
visible frame was already about 70% expanded. This supports autofocus as a
contributor; mounting/measurement and JavaScript contention still need correction.
It does not isolate every CPU cost or establish production/device frame rates.

The MCP recording wrapper did not produce usable files (its first request also
exceeded the recorder's supported 30 FPS maximum). Command-scoped Xcode `simctl`
capture provided native evidence without changing global Xcode selection or
opening an external UI. AVFoundation decoded actual presentation timestamps;
no fixed capture rate was assumed. Ignored local evidence is under
`.local/phase-07-4/editor-motion/` (`before.mov`, `before-probes.json`,
`before-native-actions.json`, decoded frame JSON and `no-focus.mov`).
`native-comparison.gif` places short native clips side by side, approximately
aligned around the taps; use the probe table, rather than GIF alignment, for
timing comparisons.

At that diagnosis checkpoint, all diagnostic code and the temporary autofocus change were removed. App source
matches `8778f88`; this request produced diagnosis only, with no permanent app
fix or new automated-check claim. Existing simulator/API/Metro/mirror services
remain available. Follow-up owned by the current 07.4 owner review: avoid redundant
preparation for already-current local rows without bypassing newer remote data,
keep height motion off the busy JavaScript path, and coordinate focus with the
completed reveal. Cover stale/pending/account-change paths and cancelled motion,
then repeat the paired native capture and software-keyboard checks.

## October 7 owner review — Stable editor reveal and action

Anthony still observed the jump and intermittent Add/Hide text flicker. The action
now follows the explicit editing session, rather than the presence of an editor
React element. Controller and attempt ID activate together; a temporary missing
element during a refresh cannot revert Hide to Add or change the row's handler.

Already-current, confirmed and phone-durable rows open synchronously without
re-adopting/persisting the journal. Pinning remains synchronous while unrelated
pruning may finish in the background. Missing/newer/pending/memory-only rows keep
the adoption rules, and asynchronous account/close callbacks remain fenced.

Closed Add rows premeasure a lightweight form without mounting a native input.
The reveal retains that form (including saved text for Edit) until completion,
then mounts and focuses the real editor once. Replacement measurements cannot
start the reveal at the saved section's old height and restart it at the input's
height. Native height, opacity and translation now use the already-installed
Reanimated/Worklets libraries, with a 16 ms initial commit interval before the
existing 240 ms opening / 230 ms closing curves. The browser retains its
Animated adapter. Reduced motion applies endpoints directly; both adapters cancel
motion, and stale/completed-after-close callbacks cannot focus an old editor.

Early fixes shortened preparation and sometimes restored intermediate frames,
but further recordings caught cold-mount and closing jumps. Those were not used
as completion evidence. The final uninstrumented app was cold-restarted and
tested through the existing in-app native mirror, without changing saved text.
Actual presentation timestamps from `lightweight-final.mov` show:

| Native interaction           | Successive changed heights including endpoint |
| ---------------------------- | --------------------------------------------: |
| First Add after cold restart |                                            11 |
| Repeated Add                 |                                             9 |
| Saved reflection expansion   |                                            13 |
| Saved reflection → Edit      |                                            10 |
| Whole-row editor close       |                                            10 |

Both Add reveals move monotonically from sheet top 1000 to 577 at 1206×2622
capture resolution, rather than showing only the endpoint. Hide remains stable
during the editor reveal; Edit retains the known synthetic QA text and clean
Cancel restores the saved row. Native input focus follows completion, with
variable focus-delivery delay on this development simulator. These captures do
not establish production frame rates or software-keyboard/device acceptance.

[Before/after native Add recording](../checks/phase-07-4/native/editor-motion-before-after.gif),
[final Add endpoint](../checks/phase-07-4/native/motion-fixed-add.jpg),
[final Edit endpoint](../checks/phase-07-4/native/motion-fixed-edit.jpg).
The comparison clips are approximately aligned around taps; precise diagnosis
timings above came from press/effect probes, not GIF alignment. Ignored local
evidence also includes `lightweight-actions.json`, decoded `light-*/frames.json`,
intermediate recordings and check logs under `.local/phase-07-4/editor-motion/`.
All temporary app probes were removed. API/Metro/mirror and the existing native
app remain available for Anthony's review; no publication was authorized.

Regression coverage protects durable no-op adoption, newer/memory-only adoption,
blocked storage, late pruning failure, account deactivation, cancelled focus,
stable Hide/action state, premeasurement, equal-height replacement and staged
native input mounting with empty/existing text. Native adapter tests protect
UI-thread callback scheduling and cancellation; browser adapter/component tests
protect layout orchestration. Mocked tests do not establish native smoothness;
the recording above provides separate simulator evidence.

Fresh `npm run check` passes **644 cases** (175 architecture/tooling, 45 API,
403 mobile and 21 contracts), including Doctor **21/21**, typechecks, lint and
format checks. Earlier test typing/format/mock integration failures were repaired
without weakening assertions or thresholds. Fresh mobile coverage passes **403
cases** with **93.56% statements / 90.27% branches / 90.26% functions / 94.68%
lines**. `npm run coverage:check` passes every unchanged global/critical floor
using this mobile report and the existing unchanged API/contracts reports.
`npm run test:db` passed **61 database/migration cases** earlier in this follow-up;
API/contracts/database code did not change afterward. The phase's existing 21
saved journeys were retained and were not rerun for this correction.
Fresh `npm run export:web -w @justgo/mobile` and
`npm run export:ios -w @justgo/mobile` both pass, verifying the platform adapter
bundles. No native dependencies or installed binary changed. Fast Refresh during
repository/hook edits briefly retained disposed runtime state; restarting the
existing app restored normal fixture loading. Final owner testing uses that
restarted app and the retained API/Metro/mirror.

A tightened close/reopen regression caught an obsolete preparation failure
appearing on a new session for the same row. A preparation-generation guard now
discards that callback; the regression failed before the guard and passes after
it. One coverage command accidentally overlapped a still-running full check and
the existing feeling-preserving test exceeded its 5-second timeout. The duplicate
run was stopped and subsequent verification was run sequentially; no timeout was
changed.

## October 8 owner review — Placeholder alignment

Anthony reported the empty hint shifting down when the real input appeared.
The lightweight preview uses React Native Text; the iOS multiline input draws
its own placeholder through UILabel. The installed renderer applies a different
baseline treatment to these surfaces despite their matching Inter font, size,
line height and padding. The existing in-app simulator recording reproduced a
4-pixel shift at 1206×2622 native capture resolution: the hint's first ink row
moved from 57 to 61 pixels below the box's top while the box stayed stationary.

The iOS editor now keeps the same visible Text hint during and after input
mounting, using shared typography and padding. The overlay cannot intercept taps
and is hidden from accessibility; the native placeholder stays present with
transparent ink to retain its sizing/accessibility behavior. Nonempty input hides
the overlay, and clearing restores it. Browser and Android keep their existing
native placeholders. Input value, focus timing, animation, saving and dirty-close
rules are preserved. This does not add a dependency or require a new native app.

Paired uninstrumented native captures show the hint's first ink row remaining
57 pixels below the box's top through the fixed handoff. The same check was
repeated on the first opening after a cold app restart and a subsequent opening.
The box endpoint stayed at native y=1790. A native keystroke hid the hint and
enabled Save; deleting it restored the hint and disabled Save. Clean Cancel and
reopen passed. No writing was submitted, and the owner's other reflection stayed
collapsed. [Native placeholder comparison](../checks/phase-07-4/native/placeholder-handoff.png)
shows the original preview, original native hint and fixed focused input.
Cold/repeated settled-box samples all retain offset 57; moving/fading edge
samples vary by one pixel with capture rounding/antialiasing. The first diagnostic
assertion treated that variation as a shift and was corrected to compare the
stationary box through the handoff, where the original 57→61 failure occurred.
Recordings, actual-presentation-time frames, safe action metadata and pixel
measurements live in ignored `.local/phase-07-4/placeholder-alignment/`.

The empty-input regression fails against the original implementation (1 failing /
5 passing cases), then passes with the visible-hint fix. It protects the hint
through input mounting, accessibility exclusion, native placeholder semantics,
typing and clearing, plus the existing saved-text path. Two added cases protect
unchanged browser/Android behavior. The focused hook suite passes 8/8; the earlier
four affected suites passed 36/36 before those two additions.

Fresh `npm run check` passes Doctor 21/21, types/lint/format and **646 cases**:
175 architecture/tooling, 45 API, 405 mobile and 21 contracts. Fresh
`npm run test:coverage -w @justgo/mobile` passes 405 cases with **93.57% statements /
90.33% branches / 90.26% functions / 94.68% lines**. `npm run coverage:check`
passes all unchanged global/critical floors with the new mobile report and
existing unchanged API/contracts reports. Final logs are `final-check.log` and
`final-coverage.log` in the evidence directory. API/database/contracts code did
not change; their earlier database, export and saved-journey evidence remains
historical and was not rerun for this typography fix.

The existing iPhone 17 / iOS 26.5 QA device, installed app and API/Metro/mirror
remain available with the empty Add editor open. Changes stay local, with no
push/PR/merge. This check uses hardware-keyboard input; software-keyboard layout,
physical device, VoiceOver/scaled-text acceptance and hosted checks retain their
existing owners/open gates. Source behavior was verified through the live native
mirror, not inferred from component mocks or a browser app preview.

## October 8 owner review — Saved Edit flash and text shift

Anthony observed the textbox flashing white and its existing text shifting down
during Edit. The open saved panel reset its reveal progress to zero on content
replacement, exposing the white sheet while measuring/revealing the editor.
Saved text then swapped from the lightweight Text preview to TextInput, whose
iOS baseline differs. The prior empty-hint fix did not cover saved writing.

The replacement retains its existing opacity/translation and height until the
new content is measured, then smoothly resizes. The unused reveal-reset methods
were removed from both motion adapters. Saved writing now mounts in its real
input immediately, before fresh editor measurement starts the resize. It keeps
that input when an early edit clears the text; input focus still waits for
completed motion. Empty Add retains its lightweight form, stable hint and staged
input. Save, feeling preservation, dirty-close, cancellation and account fences
remain unchanged. No new dependency or native binary is required.

Native recording on the existing iPhone 17 / iOS 26.5 device, through the in-app
mirror, used only the first row's known synthetic QA reflection. Other owner
writing remained collapsed and was excluded from recordings. Before, frames
6.537 and 6.585 in `before.mov` have no filled textbox, followed by the fading
preview. With the box settled at y=1232 in the 1206×2622 capture, the text's first
ink row moves from offset 57 to 62 when the real input mounts. After, every
recorded editor frame retains the filled textbox and offset 62, including during
resizing and subsequent focus. Initial saved-text typography changes to input
typography once, with no second preview/input shift. The native resize still
shows intermediate sheet positions; this is simulator evidence, not a production
frame-rate benchmark.

[Before/after saved Edit recording](../checks/phase-07-4/native/edit-handoff-before-after.gif)
is aligned approximately around content replacement, not a precise tap-latency
comparison. Actual-time recordings, decoded frames, safe action metadata,
pixel measurements and command logs live under ignored
`.local/phase-07-4/edit-handoff/`. No temporary app instrumentation was added.

Final-source verification cold-restarted the installed app. All **33 sampled
editor frames** after the real input appeared retain a filled surface; every
settled-box sample keeps text offset 62. A native hardware keystroke enables Save,
deleting it restores the unchanged QA text/disabled Save, and clean Cancel returns
the saved reflection. The remaining empty fourth row's Add form also opens with
its stable hint and expected focus/actions. No reflection was submitted. The
existing API/Metro/mirror remain running, with that empty Add editor left open
and other writing collapsed for owner testing.

The two revised regressions fail against the preceding implementation (2 failing /
18 passing across hook/row suites). They assert visible replacement and saved
writing already in its real input, while preserving empty Add's staging. An
additional early-clear assertion caught an input unmount in the first fix (1
failing / 7 passing hook cases); dirty input now stays mounted through completion.
Final focused hook/row/motion/day-sheet/screen suites pass **42/42**. Native
adapter tests retain reduced-motion endpoints, cancellation and completion/focus
fencing; fresh/equal-height measurement and ordinary open/close tests remain.

Fresh `npm run check` passes Doctor **21/21**, types/lint/format and **646 cases**
(175 architecture/tooling, 45 API, 405 mobile and 21 contracts). Fresh
`npm run test:coverage -w @justgo/mobile` passes 405 cases with **93.55% statements /
90.28% branches / 90.23% functions / 94.67% lines**. `npm run coverage:check`
passes all unchanged global/critical floors with the new mobile and retained
unchanged API/contracts reports. Backend/database/contracts code did not change;
earlier database, bundle-export and saved-journey results are retained, not
relabeled as fresh. Final documentation formatting and `git diff --check` pass.
Changes remain local and unpublished. Existing software-keyboard, device,
VoiceOver/scaled-text and hosted acceptance gates stay open.

## Open review and release checks

- Anthony's code/design review and permission for any commit publication/PR/merge.
  Hosted CI is unverified for this unpushed branch.
- Anthony's acceptance of the updated editor reveal/action above; final simulator
  recordings now establish intermediate native heights for cold/repeated Add,
  Edit and close. Physical-device/performance and software-keyboard checks below
  remain open.
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
