# Phase 07.5 — Final cutover and acceptance

## Snapshot

- **Status:** Implemented locally for owner review. Automated/browser acceptance
  passes; current native verification, publication and hosted acceptance remain
  open. The Phase 07 umbrella is not marked complete.
- **Updated:** October 8, 2026.
- **Branch/base:** `codex/phase-07.5-cutover-acceptance`, created from clean `main`
  at `8dfb44d`, the owner's Phase 07.4 / PR #20 merge.
- **Authorization:** Anthony requested a new branch and Phase 07.5 implementation,
  with multiple agents where useful. No push, PR, merge or external deployment
  is authorized for this phase.
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
| Native simulator                     | Existing QA simulator is shut down. Boot permission requested under the installed iOS debugger skill; no new native claim.                                                                                                                                                                                    |
| Hosted CI                            | Not run for this unpublished branch; separate publication permission and revision-specific hosted results are required.                                                                                                                                                                                       |

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
All run-owned browser tabs and API/Metro services were stopped; no fixture listener
remains on ports 3000/8081.

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

The iOS debugger's boot requirement is explicit: “If none are booted, ask the user
to boot one (do not boot automatically unless asked).” The existing JustGO QA
simulator (`F0926FE3-5692-4241-B6C8-C5C4F9C6422E`, iOS 26.5) is shut down; the
boot question is pending. No app/container/Keychain reset, reinstall, signing
upgrade or new native binary was performed. Resume save/relaunch and
Keychain/AsyncStorage checks on that existing device once boot is authorized;
record them here without closing the physical-device gates below.

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
