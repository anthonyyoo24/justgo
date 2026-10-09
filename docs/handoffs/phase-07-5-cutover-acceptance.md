# Phase 07.5 — Final cutover and acceptance

## Snapshot

- **Status:** Published for owner review in [PR #21](https://github.com/anthonyyoo24/justgo/pull/21).
  Automated/browser acceptance passes; current native verification and hosted
  acceptance remain open. The Phase 07 umbrella is not marked complete.
- **Updated:** October 8, 2026.
- **Branch/base:** `codex/phase-07.5-cutover-acceptance`, created from clean `main`
  at `8dfb44d`, the owner's Phase 07.4 / PR #20 merge.
- **Authorization:** Anthony requested a new branch and Phase 07.5 implementation,
  with multiple agents where useful, and explicitly authorized pushing this branch
  and creating its PR on October 8. Merge and external deployment remain separate
  owner decisions.
- **Dependencies:** [07.1 API/data](phase-07-1-api-data.md),
  [07.1B journey/CI](phase-07-1b-journey-ci.md),
  [07.2 local synchronization](phase-07-2-local-sync.md),
  [07.3 local flow](phase-07-3-local-flow.md),
  [07.4 Progress](phase-07-4-progress-history.md) and the
  [Phase 07 umbrella](phase-07-api-offline.md).
  [07.3A](phase-07-3a-testing-checkpoint.md) remains deferred.

## Cutover and retained behavior

- Register `0013_attempt_resources_contract` after immutable migrations 0000–0012.
  Stop old writers, lock both representations, normalize blank text consistently,
  reconcile late submitted reflections and compare historical dates, display
  zones, ownership, content and revisions before removing compatibility storage.
- Remove separate reflections/actions, challenge revisions, personal deck queues,
  preferences/skips, unfinished/given-up attempts and obsolete lifecycle columns.
  Retain stable challenge IDs, inactive historical challenge records, captured
  starts, frozen historical activity dates, Level 1 context and the legacy display
  time zone where the original start zone is unknown.
- Keep `attempt_patch_receipts`: a repeated explicit submission returns its
  original acknowledgement without applying the reflection twice. Canonical
  resources, strict contracts/OpenAPI, runtime schema, seeds and callers agree.
  Retired product routes return 404 and cannot write removed state.
- Mobile Progress fixtures and display types use captured starts and only submitted
  or absent feedback. The open “1 days” finding is fixed for current/best streaks.
  Side-panel verification also found and fixed “1 reps this month”; zero and
  multiple values retain plural copy. Both singular failures have regression
  evidence, followed by passing zero/one/multiple cases.
- Keep all coverage floors. The removed reflection service's **95% branch / 99%
  line** gate follows `src/attempts/patch.ts`; the removed Progress service's
  **95% / 96%** gate follows `src/progress/resources.ts`. Identity, challenge,
  mobile, contracts and global floors are unchanged. Retired contract files are
  removed from the exact deployment upload allowlist.

## Saved journey acceptance

The retained app/repository/API/database suite grows from 21 to 24 cases, adding:

- Actual-app completion and reflection with lost HTTP acknowledgements, immutable
  retry payloads, one rep/receipt/revision, Progress visibility and same-account
  reload recovery.
- Offline completion and explicit reflection, immediate local Progress visibility,
  reconnection/upload and saved-history recovery.
- Self-device revocation through the resource API, denied access from the revoked
  session and recovery of the same account's saved history.

The runner checks loopback ports **before** running migrations and still refuses
unknown-server reuse at startup. A real-listener tooling regression protects this
ordering. Cleanup owns only UUIDs allocated by the isolated fixture server and uses
canonical tables. Failure screenshots mask credentials/text inputs; no network
traces, videos or real private data are captured.

## Verification evidence

Evidence is stored only in ignored `.local/phase-07-5/` or the named ignored logs.
Heavy checks run sequentially on the owner's 8 GB Mac.

| Check                                | Result                                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streak-copy regression before fix    | Reproduced `1 days` in the current streak.                                                                                                                                                                                                                                                                    |
| Focused mobile checks                | 63 cases pass across Progress view/row/calendar and guarded developer preview; no unexpected warnings.                                                                                                                                                                                                        |
| Mobile TypeScript                    | Pass after replacing legacy fixture imports and narrowing submitted/absent presentation state.                                                                                                                                                                                                                |
| `npm run check`                      | Pass: fresh online Expo Doctor 21/21, contracts build, workspace/journey types, lint, format, architecture boundaries and 662 tests (180 tooling, 45 API, 417 mobile, 20 contracts).                                                                                                                          |
| `npm run test:db`                    | Pass: 48 API/database/identity cases plus the complete registered-migration rehearsal. Fresh rerun includes canonical-record preservation assertions.                                                                                                                                                         |
| `npm run test:coverage`              | Pass: 94 API, 417 mobile and 20 contract cases. All existing global/critical floors pass; mobile 94.84% lines / 90.43% branches, API 94.58% / 89.8%, contracts 100% / 100%.                                                                                                                                   |
| `npm run test:journey`               | Pass: 24 saved app/API/database/repository journeys; ignored API/mobile environment files absent during the clean run, explicit guarded settings used, fixtures cleaned and services stopped.                                                                                                                 |
| Controlled journey assertion failure | Root command exits 1 for the deliberate fixture assertion, generates a nonempty HTML report and a visually verified masked screenshot, then restores source/environment bytes and modes.                                                                                                                      |
| Cold exports                         | Web and Hermes iOS exports pass with `--clear --max-workers 1` into ignored phase evidence directories.                                                                                                                                                                                                       |
| Interactive side-panel browser       | Pass at 390 × 844: challenge → completed rep → explicit feeling/text → Save → Progress → captured start → View/Edit/Save, one rep, both `1 day` streaks and `1 rep this month`. One nonfatal web `pointerEvents` deprecation appeared during navigation; no browser error was observed or warning suppressed. |
| Native simulator                     | Owner-authorized boot/launch now passes: the installed app renders Home in the live side-panel mirror. Full native save/relaunch/Keychain/AsyncStorage acceptance remains open.                                                                                                                               |
| Hosted CI                            | PR #21 is published; revision-specific Foundation push/PR checks are running. The publication section records fresh local verification.                                                                                                                                                                       |

The final source includes the monthly-copy correction. Full workspace/coverage
checks, cold exports and the clean 24-case saved journey suite were repeated
after it. The focused 63-case suite and live side-panel check also include it. Independent read-only cross-reviews found no
actionable backend migration/replay/ownership or mobile/journey issues.

The pre-contraction backup and history projection are protected local files.
Stopped-writer contraction preserves the existing **18 QA accounts, 102 completed
attempts and 14 PATCH receipts**, including original IDs, owners, starts, dates,
submitted text/feelings/revisions, Level 1 context and inactive history. The
journey runs retain those counts, and the one registry-owned browser account was
removed transactionally afterward; existing QA accounts were not cleanup targets.
The automated/browser acceptance services and tabs were stopped after verification.
The later owner testing session below intentionally starts and retains fresh
API/Metro/mirror services.

The retained long-offline measurement submits 10 completions and 10 maximum-length
reflections: **314,654 encoded bytes**, **0.286459 ms serialization** and
**53.551083 ms total saves**, within the saved 400,000-byte / 100-ms serialization
budgets. This is repository/browser evidence, not a native device performance claim.

Logs: `.local/phase-07-5/{check,test-db,coverage,export-web,export-ios}.log`,
`journey-final.log` and `journey-final-evidence.json`; the deliberately failed run
is retained in `journey-assertion-failure.log`, `assertion-failure-evidence.json`
and `assertion-failure-report/`. The final report's `journal-measurement`
attachment and extracted `journal-measurement.json` own the measurement. Browser screenshots and cleanup results stay in
the ignored evidence directory. No credentials or real private reflections are
added to committed artifacts.

## October 8 owner simulator session

Anthony requested the simulator for testing after local implementation. The
existing QA device (`F0926FE3-5692-4241-B6C8-C5C4F9C6422E`, iOS 26.5) was booted
with command-scoped full Xcode tooling. Its system UI stalled on the first boot;
restarting the same device recovered it. No device/app/container/Keychain erase,
reinstall, signing upgrade or new native binary was performed.

The local fixture API uses dedicated loopback `justgo_test`. Metro uses native
production storage/connectivity adapters, one worker, the current Phase 07.5
source and `NODE_OPTIONS=--dns-result-order=ipv4first`, matching the installed
client's `127.0.0.1:8081` address. Its initial IPv6-only listener was corrected
before accepting launch. The installed `dev.justgo.foundation` connects through
the existing development-client URL. A live side-panel simulator frame confirms
Home and its challenge content; the temporary simulator/tools panels are closed.

API on `127.0.0.1:3000`, Metro on `127.0.0.1:8081`, and the UDID-scoped mirror at
`http://localhost:3200` are intentionally left running for Anthony. The mirror tab
is retained as a deliverable. Logs and Home screenshot remain ignored under
`.local/phase-07-5/owner-simulator-*`. This verifies launch/readiness only: no new
rep/reflection was submitted and full native save/relaunch, Keychain/AsyncStorage,
software-keyboard and physical-device acceptance remain open. Boot permission
is now granted; the earlier pending boot question no longer applies.

## October 8 accept-entry flicker

Anthony reported intermittent flicker when accepting a challenge. The challenge
entry code was unchanged from merged 07.4. The native recording reproduces the
earlier open 07.3 safe-area/title observation: the first active frame hides the
title beneath the status bar, then the whole content moves downward after native
inset measurement. At 256-pixel recording width, the timer's top moves from
42 to 81 pixels between 6.1917 and 6.3033 seconds (about 112 ms).

`ActiveChallengeModal` now reads the existing root safe-area values before the
full-screen iOS/web portal and applies all four paddings to its outer View immediately.
`ChallengeLayout` accepts an explicit edge override; the modal passes no edges
to avoid a second native measurement. The opaque `overFullScreen` presentation,
modal isolation, saving feedback and explicit outcome controls remain intact.
The accepted deck also holds its departed card while covered: unchanged queue
turn no longer triggers the failed-action return animation during presentation.
An unconfirmed action still restores the card; Give up advances/unlocks the
existing deck. No dependency, binary, timer delay or account/storage change.

Independent review caught Android's different dialog bounds: default system-bar
insetting need not match the root. Its original bottom-edge SafeAreaView/default
inner edges are preserved, with no root padding added. The platform regression
fails before that containment and passes afterward; Android device acceptance
remains separate.

Verification distinguishes the evidence types:

- Regression run against the previous source: 3 expected failures / 34 passes.
  Final focused deck/layout/active-flow suite: **44/44**. Coverage includes first
  render and reactive safe-area spacing, no duplicate insets, covered normal and
  reduced-motion settlement, and unconfirmed-action restoration.
- Fresh final `npm run check`: **667** cases (180 tooling, 45 API, 422 mobile, 20
  contracts), online Expo Doctor **21/21**, types, lint, formatting and boundaries.
- Fresh final mobile coverage: **422** cases, **94.85% lines / 90.49% branches**.
  `npm run coverage:check` passes all unchanged global/critical floors. Unchanged
  API/contracts reports retain the earlier full phase coverage evidence.
- Native recording: first acceptance after a bundle reload and two repeated
  button acceptances, across three card themes, keep the timer at **81–140 pixels**
  from their first active sample through settled samples; title/card positions
  remain stable. Each Give up returns a usable deck. These are one-off native
  recordings, not a saved visual CI test or a new-binary/device acceptance gate.
  A final iOS reload/Accept/Give-up recording also verifies the same entry layout
  after platform containment; its later blue Refreshing overlay is development
  tooling during the checks, separate from acceptance presentation.
- Actual browser app in the side panel (1053 × 1247): two accept/Give-up entries
  preserve the dialog, background input isolation and distinct challenge text,
  with no console warnings/errors. The single newly allocated registry-owned
  account was removed transactionally; existing QA identities/activity remain.

Native mirror pointer drags did not commit a gesture in this automation session;
the recorded entry checks use the equivalent Accept button path. XcodeBuildMCP's
AX tools could not resolve the host's Command Line Tools selector; its recorder
could not save an output path, so command-scoped full Xcode `simctl` recording and
AVFoundation extraction supplied evidence. No global Xcode setting was changed.
Captured warm sequences also contain 5–13 ms artwork/texture arrival samples
without a layout jump; this does not prove every intermediate capture sample is
a physical display frame. Owner swipe review and physical-device/VoiceOver/full
native save-relaunch gates remain open. Earlier Completed/Success mixed-sample
observations are not closed by this entry fix.

Ignored evidence: `accept-{before,after}.mov`, their `*-frames/` manifests/contact
sheets, `accept-timer-layout-measurement.json`, `accept-regression-before.log`,
`accept-focused-final.log`, `accept-check-final.log`, `accept-mobile-coverage-final.log`,
`accept-coverage-gate-final.log`, `accept-android-regression-before.log`,
`accept-final.mov`, `accept-final-frames/`, `accept-layout-comparison.png`,
`accept-web-active.png` and `accept-web-cleanup.json`
under `.local/phase-07-5/`. API/Metro/mirror remain running with the updated native
bundle for owner testing. No rep/reflection was submitted by these walkthroughs.

## October 8 publication verification

Anthony explicitly authorized pushing this branch and creating its PR. The branch
is published in [PR #21](https://github.com/anthonyyoo24/justgo/pull/21) against `main`. A clean,
detached checkout of `dcd00c2` passed `npm ci` and `npm run check`: fresh online
Expo Doctor **21/21**, contract build, all types, lint, formatting, boundaries and
**667 tests** (180 tooling, 45 API, 422 mobile, 20 contracts). This rechecks the
final cutover and flicker-fix source without ignored local environment files or
existing dependency/build artifacts. The publication documentation changes no
product code. Standalone online Doctor passed **21/21** immediately before the
initial push and is repeated before the publication-handoff follow-up push.

Logs remain ignored under `.local/phase-07-5/publication-{install,check,doctor}.log`.
Earlier database, coverage, saved journey, export and UI evidence above remains
applicable to the unchanged product source. Revision-specific hosted results must
be inspected on the PR; native swipe review, full native/device acceptance and
owner merge approval remain open.

## Release rollout and repair

Phase 09 owns external integration/deployment. Before accepting contraction on a
valuable database: retire/block incompatible API/mobile writers, take and verify
a protected restorable backup, pause writes, apply reviewed 0013, and accept the
canonical API/mobile together. Old identity action and challenge/reflection/deck
routes are unsupported; do not silently route them into a second protocol.

The disposable migration rehearsal must prove clean 0000–0013 installation,
historical preservation, late-writer reconciliation, atomic comparison failure,
RLS/ownership, restoration of a pre-contraction snapshot and forward repair.
After new canonical data is accepted, repair with a new reviewed forward migration;
do not reset the database or revert blindly to legacy writers. Restore a protected
snapshot only within a stopped-write recovery procedure that preserves/replays
later accepted canonical work.

## Billing handoff and open acceptance

Phase 07A connects the existing authenticated/owner-checked earlier-upload
eligibility seam to server-verified provider coverage. It also owns native
purchase/restore, persisted access verification, all nine subscription rules,
provider notifications and scheduled repair. Phase 07.5 adds no production paid
access bypass, subscription policy change or live provider configuration.

Keep the owner-approved 07.3A deferral and earlier physical-device, Keychain/iCloud,
backup, actual radio, software keyboard, VoiceOver/focus, scaled-text/reduced-motion,
staging and release gates explicit. Native simulator evidence, when available,
does not close physical-device or new-binary acceptance. Phase 08 owns the working
support destination; Phase 09 owns physical-device and release integration.

Local implementation is not full phase acceptance until required evidence and
owner review are reconciled. No publication or merge is implied by passing tests.
