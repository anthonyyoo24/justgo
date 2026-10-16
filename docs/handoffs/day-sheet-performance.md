# Day-sheet performance — October 10, 2026

## Snapshot

- **Status:** owner-authorized local integration into
  `codex/phase-08-settings-privacy`; no Git publication. October 12 integration
  evidence is recorded below; October 10 measurements describe the original fix.
- **Scope:** Phase 07.4 Progress follow-up. Anthony initially requested an
  investigation, then authorized the fix in a separate worktree while retaining
  the original checkout for other work.
- **Branch / baseline:** `codex/day-sheet-performance` from
  `e146adc95dd67cf5efa0fb46c07cb24165711228`; local commits are retained for review.
- **Worktree:** `/Users/anthonyyoo/.codex/worktrees/day-sheet-performance/justgo`.
- **Dependencies:** [07.4 history and motion handoff](phase-07-4-progress-history.md),
  [implemented app shell](../architecture/APP_SHELL.md) and
  [testing guidance](../operations/TESTING.md).
- **Environment:** installed Expo SDK 57 development client, React 19.2.3,
  iPhone 17 / iOS 26.5 Simulator. Existing native binary reused without a rebuild.

## Finding and change

**October 14 PR #25 follow-up:** The
[review correction](phase-08-settings-privacy.md)
also fills a viewport when eight initial rows do not create scrolling. It uses
fresh measurements for each batch and preserves the existing draft/scroll-ahead
behavior. Earlier native timings below describe the original optimization;
they are not new measurements of this visibility correction.

The 41-attempt day initially mounted every row, every hidden reflection form and
every motion adapter. Opening an editor then rendered all 41 rows three times.
The reflection controller subscription also invalidated the Progress owner on
each input/dismissal change. Opening a two-attempt day did much less work.

| Owner                                              | Change                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `day-details/entries/DayEntryList.tsx`             | Mount eight initial rows and add batches ahead of scrolling. Finish rendering the loaded page before delegating backend pagination. Preserve visited rows until closure.                                                                    |
| `DaySheet.tsx` / `ProgressEntryRow.tsx`            | Stable ID callbacks read current action handlers; memoized rows compare every display field, callbacks, selection and editor identity. Equivalent repository overlays do not force every row to render.                                     |
| `SlidingEntryDetails.tsx`                          | Mount and measure only an opened panel; retain its outgoing animation, release it afterward and handle cancellation before the first layout. Preserve saved-to-Edit resizing and reduced motion.                                            |
| `DayReflectionEditor.tsx` / `useDayReflection.tsx` | Subscribe within the connected editor. Session, accepted-input ownership, adoption, pinning, account fencing and focus remain above the list.                                                                                               |
| Component tests / `e2e/progress-flow.spec.ts`      | Cover initial mounting, selected-row updates, current callbacks, draft retention, reopening, paging/retry and cancellation. Saved journeys scroll to later rows; a new 41-attempt journey keeps and saves a draft after full-day scrolling. |

No dependencies, native configuration, API contracts, migrations or persistence
policy changed. Editing and explicit saves continue through the existing
reflection controller and account repository.

An initial FlatList attempt reduced first mounting but expanding an animated row
created gaps in its cached/estimated positions. The native list then mounted the
remaining rows despite the small viewport. A temporary runtime probe confirmed
the render range growing through all 41 rows at a stationary scroll offset.
The chosen progressive list avoids that estimation problem and keeps the active
input mounted. It bounds opening cost, but memory still grows with visited rows;
it does not promise constant memory for arbitrarily large histories.

The 41-attempt saved journey exposed a second boundary: a backend page can arrive
while scrolling is already at the bottom, without another scroll event. The list
now fills from the arriving page immediately when it was filling ahead, with
component regressions for successful pagination and retry. Ordinary initial
opening still mounts only eight rows.

## Native measurements

React DevTools backend profiling through the development client's Hermes
inspector recorded component durations and render counts, without modifying app
source or saving reflection text in profiles. The original two/41-attempt
investigation profiles were copied into ignored local diagnostic storage.

| Metric for the 41-attempt day                               |                                        Before |                    Final profile |
| ----------------------------------------------------------- | --------------------------------------------: | -------------------------------: |
| DaySheet first render                                       |                                    511.368 ms |                        47.703 ms |
| DaySheet render work across Add activation                  |                            375.471–377.775 ms |                        35.319 ms |
| Row renders across Add activation                           |                                  123 (41 × 3) |            2 (selected row only) |
| Rows mounted on initial open / after Add                    |                                       41 / 41 |                            8 / 8 |
| Sheet, row and calendar renders while typing the test draft | Broad owner subscription in the original code | 0; only connected editor updates |

The final native profile ran after a fresh worktree bundle load with the mirror
stopped. These are inclusive React render durations, not input-to-pixel latency,
animation frame-rate measurements or release/physical-iPhone results. They are
individual development captures and vary with host load. The small-day baseline
was 28.032 ms on repeat opening. Earlier intermediate captures with the mirror
and competing simulator activity were variable and are not the final comparison.

## Verification

Focused component suites cover the five affected owners; the final combined run
passed all 87 cases. An earlier combined run hit one existing five-second test
timeout under host load; the full 19-case ProgressScreen suite and final combined
run passed with the unchanged timeout. A paging test consumes rendered local
rows before requesting another backend page. Final coverage review strengthened
the existing animation test to verify retention during close, cancelled-close
fencing after reopening and release after successful completion. No assertions,
timeouts or coverage thresholds were weakened.

Interactive side-panel browser verification used a new disposable account on
the worktree's loopback fixture server. Add, typing, Save, saved Edit, Cancel and
dirty-close Keep editing passed. Native side-panel mirroring showed the final
41-attempt sheet, scrolling through row 41 and back with the unsaved synthetic
draft retained. Native typing focused the input and updated only its subtree;
Keep editing retained the input. The synthetic native draft was discarded without
submitting a reflection. The simulator was reconnected to the original Metro
server after the checks, and scoped mirror helpers/temporary tabs were closed.

Final automated evidence:

- `npm run check`: passed fresh online Expo Doctor **21/21**, contracts build,
  workspace/journey typechecking, lint, formatting and **744 tests** (architecture
  180, API unit 45, mobile 499, contracts 20).
- `npm run test:coverage`: passed **613 tests** (API 94 including database and
  migration suites, mobile 499, contracts 20), with every all-source and critical
  coverage floor intact. Mobile: **91.29% branches / 95.83% lines**; API:
  **89.80% / 94.58%**; contracts: **100% / 100%**. The new progressive list has
  full branch/line coverage. No standalone `test:db` was needed for this
  mobile-only follow-up; database behavior still ran within coverage.
- Saved Progress suite: **9/9 passed**, Chromium **390 × 844**, reduced motion,
  real disposable API/database assertions. This includes the new 41-attempt
  draft/save journey, Add/Edit/restart, offline cached paging, lost responses,
  account recovery/revocation, memory-only recovery, rejection and older-day
  Add/Edit after pruning. A prior focused four-case run also passed.

The default journey ports were occupied by the original checkout, so a disposable
copy of the saved Progress suite used changed loopback ports **3003/8083** and
the existing guarded `justgo_test` fixtures. The final nine-case run enabled the
existing web-only journal failure seam and let Playwright own and shut down both
worktree services. The command was:

```sh
node --env-file-if-exists=apps/api/.env node_modules/@playwright/test/cli.js test \
  --config .local/day-sheet-performance/journeys/playwright.config.ts
```

No original development server was stopped, no migration was run by that copied
harness and cleanup authority stayed with accounts allocated by the worktree
fixture server. The full cross-feature default `npm run test:journey` was not run;
all saved cases in the affected Progress suite were run. Current-revision hosted
CI remains unevidenced until separately authorized publication.

The first new 41-attempt case assumed Save would automatically expand row 1
after cancelling a pending selection of row 2. The existing selection behavior
leaves row 1 collapsed in that sequence, so the case now explicitly activates
View Reflection and verifies the saved text and database value. The later real
page-arrival stall was fixed in the list and covered by successful final journeys.

Ignored evidence is under `.local/day-sheet-performance/`: `final-focused.log`,
`final-animation-test.log`, `final-check.log`, `final-coverage.log`,
`final-progress-journeys.log`, `final-progressive-big-*.json`, simulator mirror
screenshots and temporary profiling/harness scripts. None is committed visual
evidence. Native profiles used the cached 41-attempt day; backend page-arrival
regressions have component/browser evidence separately.

## Remaining acceptance

Anthony authorized the local merge into Phase 08 on October 12. Owner review and
separate permissions for push, PR and any subsequent merge remain open.
Existing Phase 11 physical-iPhone, software-keyboard layout, VoiceOver, large-text
and release performance acceptance remain open. This scoped fix does not close
those gates or advance the rest of Settings/privacy work.

Preserve the draft controller above the list and the existing native reveal/focus
handoff when changing this screen. Re-run the 41-attempt journey, focused Progress
tests and native initial-open/Add/scroll checks for future list changes.

## Owner testing setup — October 10

At Anthony's request, the installed simulator app was reconnected to this
worktree's Metro server on **8083**, using the already-running original fixture
API on **3000**. The original Metro on 8081 remains running. No native rebuild or
account reset was required. Progress loaded the existing 58 total reps and
41-attempt October 10 day; Add opened and focused the empty reflection input,
then Cancel returned to the sheet without saving. The app was left on that sheet
and the worktree Metro was left running for owner testing.

```sh
EXPO_NO_TELEMETRY=1 EXPO_NO_DOTENV=1 \
  EXPO_PUBLIC_API_URL=http://127.0.0.1:3000 \
  npm run start -w @justgo/mobile -- --localhost --port 8083 --max-workers 1
```

Ignored evidence: `user-testing-metro.log` and `user-testing-ready.png`. The
simulator's inspector connection on 8083 confirmed it was running the worktree
bundle. The initial MCP simulator discovery failed because the system's selected
developer tools lack `simctl`; command-scoped `DEVELOPER_DIR` selected the existing
Xcode without changing global configuration.

## Owner-authorized folder organization — October 10

Anthony authorized the proposed grouping and local commits. The performance fix
is retained in `2dc17b9` (`Improve day-sheet rendering for large attempt histories`),
followed by a separate organization commit. Sheet orchestration and sheet motion
remain at the `day-details/` root. `entries/` owns the progressive list, rows,
expanding details and browser/native motion pair; `reflection-editor/` owns the
inline form and editor-session hook. All four existing tests remain beside their
owners. Ten files moved; no product behavior or test assertions changed.

Import-aware rewrites updated relative imports, test mocks/`requireActual` and
the reflection-pencil asset path, including preview and Progress consumers.
Existing recursive test, coverage and architecture paths already include both
subdirectories. Current architecture/owner documentation now points at the new
paths; dated historical cleanup inventories retain their original paths.

Verification after the moves:

- Focused sheet, row, native motion, editor-session, Progress screen/view and
  preview suites: **7 suites / 101 tests passed**.
- `npm run check`: fresh online Expo Doctor **21/21**, builds, typechecking,
  lint, formatting and **744 tests passed**.
- `npm run test:coverage`: **613 tests passed** and every coverage floor passed;
  mobile remained **91.29% branches / 95.83% lines**, API **89.80% / 94.58%** and
  contracts **100% / 100%**.
- Cold `export:web` and `export:ios` with `--clear --max-workers 1`: both passed,
  including the moved reflection-pencil asset. These are JavaScript/asset
  exports, not a new native binary build.
- Saved Progress suite on the same disposable loopback harness: **9/9 passed**,
  including 41-attempt scrolling with draft retention and an explicit save.
  Playwright shut down its own API and web services after the run; original
  checkout services on 3000/8081 remained running.
- After restarting this worktree's Metro on **8083** with `--clear`, the existing
  installed simulator app reloaded successfully. Its inspector connection on
  8083 confirmed the worktree bundle. Progress retained 58 total reps; the
  41-attempt October 10 sheet opened with eight initial rows, Add focused the
  empty input with Save disabled, and Cancel returned to the sheet. No reflection
  was submitted. Metro remains running and the sheet is open for owner testing.
  Native screenshots are ignored `native-add.png` and `native-ready.png`.

Ignored organization evidence and temporary exports are under
`.local/day-sheet-performance/organization/`. The source diff was reviewed as
file moves, module/asset paths and formatting only. No push, PR or merge is
authorized by the local commit request.

## Phase 08 integration — October 12

Anthony explicitly requested merging `codex/day-sheet-performance` into the
currently checked-out `codex/phase-08-settings-privacy`. The destination was clean
at `be4a191`, including the completed Settings/account large-text fixes. Source
commits `2dc17b9` and `a3746f0` retain the performance implementation and folder
organization as separate changes in the merged history.

Seven conflicts were reconciled: six import/test-mock conflicts combine the
new day-detail folders with Phase 08's `platform/motion/motion` location; the
handoff index retains both branches' entries. The editor/list implementation
matches the performance branch apart from those motion paths. Phase 08 Settings,
account layouts, action indicators, export and live text-size behavior remain
intact. Saved Progress journeys retain the new 41-attempt case alongside the
updated account navigation. No dependency pins, backend behavior, contracts or
migrations changed in this integration.

Combined automated evidence:

- Focused Progress/day-detail/preview tests: **101 cases / 7 suites passed**.
- Fresh `npm run check` stops at the existing **20/21 Expo Doctor** result for
  six SDK 57 patch updates: Expo, crypto, dev client, router, splash screen and
  Jest Expo. No validation exclusion or dependency upgrade was introduced;
  publication still requires the separate dependency/native maintenance task.
- The remaining check steps ran independently and passed: contracts build,
  workspace/journey typechecks, lint, formatting and **828 tests** (architecture
  180, API unit 54, mobile 570, contracts 24).
- `npm run test:coverage`: **704 tests** (API 110 including database/migrations,
  mobile 570, contracts 24) and every all-source/critical gate passed. Mobile:
  **91.89% branches / 96.98% lines**; API: **90.61% / 95.01%**; contracts:
  **100% / 100%**. No standalone database run was required for this mobile-only
  merge; the database and migration suites ran within coverage.
- Cold web and iOS exports with `--clear --max-workers 1`: **both passed**,
  including the moved reflection-pencil asset and native/browser adapter paths.

Interactive verification stayed in the Codex side panel. A separate guarded
loopback fixture server on 3003 allocated one disposable account and seeded 41
synthetic attempts; the current combined source ran through a fresh Metro on 8083. The first open mounted eight rows. Add/typing, scrolling through all 41
rows and the real backend page boundaries, returning to the same draft,
dirty-row-switch Keep editing, Save, View, Edit and Cancel passed. Direct
owner-scoped fixture database verification confirmed **41 attempts and exactly
one saved synthetic draft**. Current account header navigation also returned to
Settings and Home correctly. The walkthrough ran at **1280 × 720** and the saved
sheet/Edit control were then checked at **390 × 844**; ignored screenshots are
`browser-verified.png` and `browser-mobile.png`.

This is one interactive browser walkthrough, not a new saved journey run or
native performance capture. Saved Progress journey source was retained and
typechecked; its CLI run was not repeated under the owner's side-panel-only
testing preference. The existing simulator was shut down at task start and was
not changed. October 10 native measurements remain historical evidence; new
physical-phone/VoiceOver/release acceptance stays open in Phase 11.

The temporary test account was cleaned up only through its server-owned registry,
and both temporary services exited successfully. The original loopback API was
left running. Development Metro servers were restarted with `--clear` on their
original ports: web **8081** with the loopback API and phone **8084** with the
existing staging API. No phone account reset or native binary change was made.

Reviewed the full contents of all touched directories, including existing files.
Progress already separates calendar, day-sheet orchestration, entries and editor
coordination; tests and motion adapter pairs remain beside their owners. Preview
files and journey support retain their existing responsibilities. Documentation
uses the established architecture/phase handoff organization. No further folder
moves are needed for this integration. Routine evidence remains ignored under
`.local/day-sheet-integration/`.
