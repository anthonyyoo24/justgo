# Dedicated project folder cleanup — October 6

## Snapshot

- **Status:** Rebased onto owner-merged 07.3 and verified locally for the authorized push/separate PR. Earlier native acceptance remains open; cleanup merge requires owner review.
- **Branch / base:** `codex/project-folder-cleanup`, based on the committed 07.3
  checkpoint `af5e7ed` from `codex/phase-07.3-local-flow`; now rebased onto
  owner-merged `main` `6bccfde`, retaining Expo fix `fd3ac78` and review fix `cc3f0f2`.
- **Scope:** One cleanup across the approved folder candidates, including retained
  browser and legacy code. No product behavior change or planned removal.
- **Dependencies read:** [07.3](phase-07-3-local-flow.md),
  [07.2](phase-07-2-local-sync.md), [plan](../IMPLEMENTATION_PLAN.md),
  [app shell](../architecture/APP_SHELL.md),
  [tech stack](../architecture/TECH_STACK.md),
  [testing](../operations/TESTING.md) and applicable `AGENTS.md` instructions.
- **Publication:** Anthony authorized saving the diagram, rebasing, verification,
  push and a separate cleanup PR after merging 07.3. He then requested opening
  that PR in outside Chrome and using its CodeRabbit review checkbox. Cleanup
  merge, deployment and native rebuild remain outside this authorization.

## What changed

[Folder structure](../architecture/FOLDER_STRUCTURE.md) documents the complete
groupings and responsibilities. The cleanup relocates 133 existing files:

| Owner               | Grouping                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Challenges          | `deck/`, `active/`, `success/`; developer preview files move to `dev/previews/challenges/`                 |
| Shared activity     | `persistence/` and `sync/`; repository, account ownership, model and submissions remain at the root        |
| Progress            | `calendar/` UI/loading and `day-details/`; shared date helpers stay at the root                            |
| Networking/platform | `lib/network/`; platform `toast/`, `connectivity/`, `modals/`, with native/web pairs together              |
| API tests           | `activity/`, `identity/`, `database/fixtures/`, `harness/`                                                 |
| Public contracts    | canonical `activity/` and temporary `legacy/`, retaining the public package entrypoint                     |
| Tooling/journeys    | `scripts/quality/`, `scripts/journeys/`, `e2e/support/`                                                    |
| Challenge artwork   | `venues/` and `decoration/`, preserving all image bytes                                                    |
| Documentation       | `product/`, `architecture/`, `design/`, `operations/`; existing 07.3 evidence grouped by browser/simulator |

Imports, route exports, test discovery/commands, coverage selectors, Metro's
guarded storage fixture, artwork extraction destinations, deployment allowlists
and documentation links follow the new locations. Existing tests remain beside
their implementations. The explicit contract-upload regression protects every
module reachable from the public entrypoint and its parent directory allowlist.

## Decisions and invariants

- The owner explicitly requested one cleanup now; browser/legacy files are moved
  without retiring their code, dependencies or coverage. Their later removal
  remains assigned to 07.3A/07.5.
- Route names, API contracts/exports, storage keys/envelopes, state ownership,
  timers, retries, saving behavior and source artwork remain unchanged.
- Existing coverage percentages and critical-file floors are preserved; renamed
  files update their selectors rather than weakening the gate.
- Tool configuration stays at expected roots. Ordered Drizzle migrations/meta,
  phase handoffs, small cohesive features and reference collections remain flat.
- The owner merged 07.3 through PR #16; its recorded native acceptance remains
  open. This cleanup does not satisfy or supersede those phase exit gates.

## Problems encountered and fixes

- Moving `ProgressCalendar` into `calendar/` initially produced an ambiguous `.`
  import for the existing root `calendar.ts`. Typechecking caught it; the import
  now explicitly points to `../calendar`.
- Nested contract files require their parent directories in the deployment
  allowlist as well as the files. Both parents are explicitly allowed, and the
  added public-module traversal regression checks this boundary.
- An overbroad initial path rewrite also changed a dot inside a quoted SQL
  identifier in the identity migration test. The database regression caught it
  (59/60 cases passed); the exact SQL string was restored, then all 61 database/
  migration cases and fresh coverage passed. A syntax-tree audit of all 115
  changed TypeScript files found no changes beyond paths/comments/formatting;
  the additional JavaScript differences are runner/configuration/output paths.
- The retained simulator's live bundle observed intermediate file moves and
  cached old module/asset paths. Saved browser journeys passed, but its background
  requests produced old-path asset errors. Cold web/iOS exports passed; restarting
  Metro and reloading the same installed app cleared the cached error and showed
  Home with the relocated artwork. The final 16-case journey rerun paused only
  that app while the harness owned its ports; no old-asset errors recurred.
- XcodeBuildMCP could not resolve `simctl` under the system developer selection.
  Command-scoped `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` used
  the existing installed tools for inventory, app reload and screenshots. Metro
  uses `NODE_OPTIONS=--dns-result-order=ipv4first` to match the retained app's
  127.0.0.1 URL. No global tool selection, native rebuild or signing change.
- Historical `IMPLEMENTATION_PLAN.html` and three uncommitted saving-spinner PNG
  targets were already absent at the start. No replacement historical evidence
  is fabricated. Carry these artifact gaps into the existing documentation/owner
  review work; fresh cleanup evidence is recorded separately below.

## Original cleanup verification before rebasing

All heavy commands ran sequentially using the existing tools/caches. Contracts
were rebuilt from an empty `dist/` (the previous generated output is preserved
under ignored `.local/folder-cleanup-contracts-dist-before/`).

| Check                       | Result                                                                                                            | Evidence / limit                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`             | Pass: 145 architecture, 45 API unit, 346 mobile and 21 contract tests (557 total), with typecheck/lint/formatting | `.local/folder-cleanup-check.log`; final rerun passed after completing the handoff                                                                                         |
| `npm run test:db`           | Pass: 60 database cases + 1 migration/restoration rehearsal                                                       | `.local/folder-cleanup-db.log`; dedicated loopback `justgo_test`                                                                                                           |
| `npm run test:coverage`     | Pass: unchanged global and critical-file floors                                                                   | `.local/folder-cleanup-coverage.log`; mobile 88.31% branches / 93.97% lines; API 91.19% / 95.71%; contracts 100%                                                           |
| Contract upload regression  | Pass; deliberately omitting the `activity/` parent fails, restored allowlist passes                               | `.local/folder-cleanup-upload-negative.log`; no upload/deployment                                                                                                          |
| Artwork palette tests       | 4 pass                                                                                                            | `node --test scripts/design/cream-artwork.test.mjs`; all 25 moved PNG/JPEG files match their original Git bytes                                                            |
| Web/iOS bundle exports      | Both pass                                                                                                         | `.local/folder-cleanup-{web,ios}-export.log`; actual new module/asset paths bundle                                                                                         |
| `npm run typecheck:journey` | Pass with recursive support-folder inclusion                                                                      | Does not depend on helpers being imported by a root specification                                                                                                          |
| `npm run test:journey`      | Final rerun: 16 cases pass in 38.3 seconds; fixture cleanup passes                                                | `.local/folder-cleanup-journey.log`; one local Expo `simctl` discovery diagnostic from the system tool selection, resolved for native work with command-scoped Xcode tools |
| Move/reference audit        | No newly broken existing Markdown file targets; 115 changed TypeScript files retain their non-path syntax tree    | Historical missing HTML/three PNG targets above remain explicit; no new rendering or domain logic                                                                          |

The in-app side panel at **390 × 844** verified Cafe selection → Accept → exclusive
active screen with countdown/no Settings or tabs → Give up → Accept → Completed →
Success → Continue → synthetic feeling/text → Save Reflection → Progress (one rep,
one active day) → today's day sheet → expanded saved reflection. Browser warn/error
logs were empty. [Day-sheet proof](../checks/project-folder-cleanup/browser/day-details.jpg)
contains only synthetic writing. This is an interactive walkthrough, separate
from the saved 16-case suite; it does not establish native saving or accessibility.
The temporary tab closed, viewport reset and exactly one registry-owned disposable
walkthrough account was transactionally removed. The native owner identity/data
was not a cleanup target. `.local/folder-cleanup-ui-cleanup.log` records the count.

The retained iPhone 17/iOS 26.5 QA simulator loaded the new development bundle and
[Home artwork](../checks/project-folder-cleanup/simulator/home.png). Only app
reload/presentation was checked natively, with no device or activity-storage reset.
This does not close 07.2/07.3 native durability, lifecycle, keyboard/toast/modal,
VoiceOver or physical-device gates. The existing installed binary and sole virtual
device are retained, and the owner API/Metro setup is restored after verification.

## October 6 rebase onto merged 07.3

- Saved the outstanding directory diagram at `28ca041` before rebasing. The
  original cleanup and diagram commits were replayed onto `6bccfde`; their Git
  history remains recoverable and the cleanup stays in a separate branch/PR.
- Resolved six conflicted files by retaining the final 07.3 period-clock behavior,
  its tests and updated documentation while adapting imports/links to the new
  directories. Reflection hydration and fake-timer fixes remain unchanged.
- Moved the incoming mobile dependency-verification test into `scripts/quality/`
  and its two browser screenshots into `docs/checks/phase-07-3/browser/`. Updated
  relative paths, handoff links and the complete directory diagram. Both CI
  command regressions and the contract-upload regression pass after relocation.
- The merged dependency pins/lockfile and early Doctor preflight are retained;
  the cleanup does not modify the workflow or reduce any coverage floors.
- The Markdown audit found one newly added plan link in the relocated tech stack
  still pointing to its old directory; corrected it. The final audit finds no
  newly broken local Markdown targets and retains the four documented historical
  gaps. All 27 moved image files match their original bytes. The source audit of
  115 changed TypeScript files finds only relative paths/comments/formatting;
  merged timer/reflection behavior is preserved.

Current local verification after rebasing, with heavy commands sequential:

| Check                    | Actual result                                                                                                             | Evidence                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm ci`                 | Pass; installs the merged Expo pins/lockfile                                                                              | `.local/cleanup-main-install.log`                                                      |
| `npm run check`          | Pass: Doctor 21/21, typecheck/lint/format and 569 workspace cases (147 architecture + 45 API + 356 mobile + 21 contracts) | `.local/cleanup-main-check.log`                                                        |
| `npm run test:db`        | Pass: 60 database + 1 migration/restoration cases                                                                         | `.local/cleanup-main-db.log`; dedicated loopback `justgo_test`                         |
| `npm run test:coverage`  | Pass: unchanged global/critical floors; mobile 88.56% branches / 94.07% lines, API 91.19% / 95.71%, contracts 100%        | `.local/cleanup-main-coverage.log`; contracts rebuilt from empty `dist/`               |
| `npm run test:journey`   | Pass: all 16 cases in 26.7 seconds, with registry cleanup and service shutdown                                            | `.local/cleanup-main-journey.log`; command-scoped existing Xcode tools/IPv4 resolution |
| iOS export               | Pass with normal adapters and relocated assets/modules; JavaScript/Hermes evidence only                                   | `.local/cleanup-main-ios-export.log`                                                   |
| Web export               | Pass with normal adapters and relocated assets/modules                                                                    | `.local/cleanup-main-web-export.log`                                                   |
| Source/path/image audits | Pass; 115 TypeScript files, 27 byte-identical images, no new missing Markdown targets; 152 file diagram entries           | `.local/cleanup-main-{source,path}-audit.log`                                          |

The current side-panel walkthrough at **390 × 844** passes Cafe selection →
Accept → exclusive active/countdown/no Settings or tabs → Give up → Accept →
Completed → Success → Continue → synthetic feeling/text → dirty-close Keep editing
→ Save Reflection → Progress (one rep/one active day) → today's day sheet → saved
reflection. Browser warning/error logs were empty. Current local proof is
`.local/cleanup-main-day-details.png`; the earlier committed browser screenshot
above remains historical evidence. This interactive walkthrough is separate from
the 16 saved cases and does not establish native durability/accessibility. The tab
closed and viewport reset; exactly one registry-owned disposable walkthrough
account was removed under the dedicated test-database guard, preserving existing
owner accounts. See `.local/cleanup-main-ui-cleanup.log`.

The owner API/Metro setup was restored using the rebased checkout and merged
lockfile/pins, and the same installed app/sole QA simulator was relaunched without
a native rebuild or data reset. XcodeBuildMCP still cannot discover `simctl` under
the system developer selection, so command-scoped existing Xcode tools handled
pause/relaunch. Current native Home loads the relocated artwork with no old-module/asset error;
local proof is `.local/cleanup-main-native-home.png` and Metro records the current
iOS bundle in `.local/cleanup-main-ui-metro.log`. Only reload/Home presentation
was checked natively, not the still-open durability/lifecycle/accessibility gates.
Hosted results require the authorized pushed cleanup revision and will be linked
in its PR; local passes do not establish hosted execution.

## Setup, data and operations

Use the existing Node 24/npm 11 workspace, migrated loopback `justgo_test`
database, installed browser and existing development app. Heavy checks run
sequentially. No signing, database schema, deployed configuration, credentials or
owner activity is reset. Existing CI commands continue to call the root scripts;
their updated paths are verified locally; hosted evidence must come from the
authorized pushed cleanup revision.

## Remaining work and risks

- Owner review and explicit merge approval of the dedicated cleanup remain open; push/PR/review-checkbox actions are authorized.
- Carry 07.2/07.3 native saving/relaunch, background/lock, keyboard/toast/modal,
  VoiceOver/scalable-text/reduced-motion and owner review gates forward.
- Preserve the scheduled 07.3A replacement of browser UI testing, 07.4 Progress
  integration and 07.5 legacy cutover/document reconciliation.
- Hosted checks remain unverified until the authorized cleanup revision passes.

## Next phase: read this first

Use [FOLDER_STRUCTURE.md](../architecture/FOLDER_STRUCTURE.md) and the updated
[07.3A removal assessment](../checks/phase-07-3a-browser-testing-assessment.md)
for current paths. Review the 07.3 acceptance gaps before starting that migration.
Do not remove retained tests or legacy protocols merely because they now have
dedicated folders.
