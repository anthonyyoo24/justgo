# Phase 08 settings and privacy handoff

The October 14 [account-deletion implementation](phase-08-account-deletion.md)
is developed in a separate worktree from the combined Phase 08 checkpoint. It
adds confirmation, atomic server removal/revocation and resumable phone cleanup.
Its local evidence and outstanding native-build/retention/rollout gates are owned
by that handoff; wider Phase 08 acceptance remains open.

The October 14 [reflection keyboard correction](phase-08-reflection-keyboard.md)
was developed in a separate Phase 08 worktree with its own development server.
Anthony confirmed it works on his physical iPhone and authorized local integration
into Phase 08. Its handoff owns implementation and combined-verification evidence;
the existing Settings work is preserved. Its original dependency-check blocker
is superseded by the fourth-review integration below, which retains merged main's
reviewed Expo patches and passes fresh root checks. Native/release acceptance
remains separate from those code checks.

**Date:** October 14, 2026\
**Status:** Most Settings/contact, recovery, preference and direct-export slices implemented; Anthony is working on deletion; remaining Phase 08 acceptance and diagnostics stay open. Analytics and legal scope now have separate phases.\
**Branch:** codex/phase-08-settings-privacy, based on the merged Phase 07.5 baseline. Native billing remains preserved on codex/phase-07a-native-billing at 4d5c9f2.

## October 14 local main integration

Anthony authorized merging GitHub's latest `main` into this branch locally,
without a push or new PR. The clean working branch started at `90d0efb`;
the fetched main is `8fdfd2c`, which includes merged PRs #22–25.

The four conflicted files retain both sets of completed work and evidence:

- The plan keeps the owner-approved Phase 09 analytics, Phase 10 legal and
  Phase 11 release sequence, plus main's early-signing/post-free-beta billing
  correction. Haptics remains Phase 08. Main's dependency alignment is retained;
  its native/build/device acceptance remains open under Phase 11.
- This handoff and its index retain the receiving-transfer/scope-split records
  and all four published PRs' review/verification records. Historical review
  notes referring to release Phase 09 use the numbering before the split;
  current release ownership is Phase 11.
- The identity journey keeps this branch's transfer/cancellation/centered-spinner
  cases and Troubleshooting heading check, together with main's enabled-link
  readiness and retrying geometry assertion at the unchanged one-pixel limit.

Main's measured day-list fix, regression tests, dependency pins/lockfile and CI
artifact checks are retained. Account-deletion work remains in its separate
worktree. Verification for this combined local candidate is recorded below;
this integration does not close physical-device, deletion or release gates.

Combined-candidate verification:

- Clean `npm ci` and fresh online `npm run check`: **pass**, Expo Doctor
  **21/21**, contracts build, TypeScript, lint, formatting, **186 tooling**,
  **54 API unit**, **700 mobile across 80 suites** and **25 contract** tests.
- `npm run db:migrate` and `npm run test:db`: **pass**, **60 database cases**
  and the separate migration/restoration rehearsal. The task owns a new loopback
  `justgo_test` cluster on **54333**, with restricted runtime/migrator roles;
  the deletion worktree's database, environment files and servers are untouched.
- Full `npm run test:coverage`: **pass**, all existing workspace/critical-file
  floors. Mobile **97.18% lines / 92.07% branches**, API **95.20% / 90.90%**,
  contracts **100% / 100%**. No floor or assertion is lowered.
- The first saved-journey launch stopped before tests because the ignored local
  runner imposed `NODE_ENV=test` on Expo. Removing that runner-only override
  restores Playwright's existing explicit test API/development Metro setup;
  no tracked harness or application change is needed.
- The combined **30-case** journey run then passes **24 cases**, including the
  transfer/cancellation cases, and fails the last six after exhausting the shared
  fixture server's **120-request identity allowance**. Its largest run-owned
  bucket reaches **127**. This is test-to-test budget leakage, not a reason to
  raise the production limit. A separately reviewable local fixture-isolation
  correction and full rerun are required before publication.
- Markdown validation checks **27 changed documents** and **475 local references**
  with **no introduced missing files/anchors**. Five existing missing historical
  anchors/screenshots remain outside this merge; the phase-scope/anchor checks pass.

Logs and the changed-directory inventory remain ignored under
`.local/phase-08-main-merge/`.

### Journey allowance isolation follow-up

The main integration is committed locally as `dc5b6e2`. Its combined saved suite
exposed a fixture-isolation problem: the new transfer journeys and existing
recovery cases share one loopback identity budget across the whole run. This
follow-up is kept separately reviewable from the merge.

The existing loopback-only fixture server's read-only account registry now also
identifies its two hashed identity/recovery buckets. Before each database-backed
case, the privileged fixture resets only those run-owned buckets. It validates the
strict registry shape and retains the existing loopback/database/role guards,
account-allocation registry, failure-closed cleanup and all request limits.
Production routing, rate-limit code and thresholds are unchanged; the server's
HMAC secret is never returned. The deployable API still has no fixture registry.

Two saved regressions verify the unchanged 120-request general limit, its 429
response and Retry-After value, a fresh subsequent allowance and preservation of
an unrelated bucket. The existing outsider-account cleanup cases remain intact.
With just the reset removed temporarily, the new case fails early with 429
instead of 401, reproducing the cross-case leak; the correction is restored
byte-for-byte afterward. With isolation enabled, all **four focused cases pass**.
The testing guide records these boundaries.

Fresh `npm run check` **passes** after the fixture correction, with online Expo
Doctor **21/21** and the same **186 tooling**, **54 API unit**, **700 mobile**
and **25 contract** tests. The complete saved app/API/database suite now passes
**32/32** in one run, including the two new isolation regressions, both transfer
journeys and the retained day-list/large-day regressions. No selectors, existing
assertions, retries or production limits were relaxed. The original shared-limit
failure, failing-before probe and passing runs are retained in the ignored logs.

Cold `npm run export:web -w @justgo/mobile -- --clear --max-workers 1` and the
equivalent iOS export both **pass**. These are JavaScript bundle checks, not native
builds. The database/coverage results above cover the merged production source;
the follow-up changes only the local fixture, saved tests and documentation.

Interactive verification stays entirely in the **in-app side panel**, using one
registry-owned disposable account at **390 × 844**. The connected hub and
Troubleshooting layouts are visually correct; Refresh account, Renew this session
and Recover an existing account each have a measured left edge of **73 px**.
The receiving-transfer confirmation retains the recovery form and hides the
originating action; Cancel restores it. The preview uses the same guarded database
environment and IPv4-first DNS setting as the saved suite after correcting its
initial launcher configuration. No product source is changed for this walkthrough.
The temporary tab is closed, the viewport override reset, its one fixture account
removed and task-owned API/Metro/database stopped. Existing deletion-worktree
servers and its database remain running and untouched. No new native/phone or
hosted-CI acceptance is claimed.

The combined diff against fetched main is **52 files**, including the separately
reviewable fixture correction. Reviewed full directory inventories for the merge's
changed paths and the added fixture changes, including `apps/api/scripts` and
`e2e/support`. Existing responsibility groups remain navigable and no folder moves
are needed. The main merge and this correction stay local; no push or PR is made.

## October 14 scope split and phase renumbering

Anthony requested moving analytics and legal work into separate whole-number phases and confirmed shifting later phases by two numbers:

- Phase 08 keeps Settings/recovery, export/deletion, preferences, retention/backup mechanics, diagnostic redaction and operational service-health dashboards. The owner reports most work completed and deletion in progress; no new acceptance result is inferred from that report.
- [Phase 09 — Analytics & consent](../IMPLEMENTATION_PLAN.md#phase-09) owns both analytics choices, account-owned persistence/client/server enforcement, PostHog configuration/event delivery, product dashboards and measurement verification. The existing exporter remains disabled until that implementation passes.
- [Phase 10 — Legal documents & release disclosures](../IMPLEMENTATION_PLAN.md#phase-10) owns the existing inventory/Privacy Policy/Terms drafts, legal/eligibility review, approved final wording, public hosting/link verification and disclosure preparation. Phase 08 supplies actual retention/deletion behavior and Phase 09 supplies actual analytics facts.
- Former release Phase 09 is [Phase 11](../IMPLEMENTATION_PLAN.md#phase-11); lock-screen, optional US checkout and future coach phases move from 10–12 to 12–14. Billing stays 07A with activation after the free beta. Existing native/VoiceOver/two-phone/Keychain/staging/dependency and release gates remain open under the new owner phases.
- The existing hosted prerequisite is now [phase-11-test-server.md](phase-11-test-server.md). Its implementation and recorded evidence are retained. Historical branch names, `.local/` artifacts and build identifiers stay unchanged; earlier combined-scope notes below are historical for phase ownership.

Verification for this documentation-only edit:

- Prettier `--check` passes for all **25 changed Markdown files**; `git diff --check` passes.
- The Markdown consistency check passes: **16 canonical phase IDs**, including **13 release stages**, unique explicit phase anchors, matching plan/index rows, moved scope, updated release dependencies and reserved handoff names. It checks **534 local Markdown references** and finds **no introduced missing files/anchors**. Six pre-existing archived-file/anchor observations remain outside this sequencing task; no absent HTML tracker or historic screenshot is represented as newly verified. Report: `.local/phase-resequence/validation.json`; formatting log: `.local/phase-resequence/format-check.log`.
- Reviewed the full inventories of the repository root and touched `docs/`, architecture, checks, handoffs, legal, operations and product directories. Existing responsibility groups remain navigable; the phase-oriented handoff index supports the existing records, and the single handoff rename adds no files. No further folder grouping is needed.
- Application/database/UI behavior is unchanged, so code tests, database checks and browser/device walkthroughs were not run. The owner's existing implementation changes remain intact; this edit performs no provider activation, commit or Git publication.

## October 14 PR #25 review corrections

Anthony authorized fixing and pushing the remaining valid PR #25 findings
assessed against `a82d261`. The
[day-list comment](https://github.com/anthonyyoo24/justgo/pull/25#discussion_r4277323497)
identified a batch that could fit the viewport without creating the scroll
gesture required to reveal the next rows. `DayEntryList` now observes viewport
and content sizes and adds one batch when the measured rows fit. Each content
measurement identifies the rendered batch, so an old height cannot repeatedly
mount the remaining entries. Duplicate measurements do not cause updates.
Zero/unknown sizes wait; shrinking the viewport preserves visited rows.

New pages arriving after a scroll still fill ahead without another gesture.
Existing row keys, active drafts, bounded initial mounting, footer visibility
and the parent’s guarded server-pagination behavior are retained. Only loaded
local rows are revealed by measurement; no artificial scroll event or server
request is generated. The recurring measurement lesson is recorded in `AGENTS.md`.

The [version-guide comment](https://github.com/anthonyyoo24/justgo/pull/25#discussion_r4277323534)
is corrected to match the existing manifest/lockfile: Expo **57.0.29** and Router
**57.0.27**. Development client **57.0.20**, React Native **0.86.3**, React
**19.2.3** and jest-expo **57.0.6** are unchanged. No dependencies are upgraded.
CodeRabbit’s separate ESLint download failed because of its network connection;
both Foundation runs for `a82d261` ran lint successfully. No missing dependency,
validation bypass or blanket docstring quota is introduced for those warnings.

Verification:

- The new focused regressions fail against the original list: **4 fail / 1 pass**,
  reproducing the missing measurement-driven fill. After correction, all
  **69 cases across four Progress suites pass**. Cases cover layout/content event
  order, exact fit, stale/duplicate/zero measurements, viewport resize, appended
  data, retained rows/footer and scroll-driven pagination. The final duplicate
  measurement guard is included in the full root check below.
- Fresh `npm run check`: **pass**, Expo Doctor **21/21**, contracts build,
  TypeScript, lint, formatting, **186 tooling**, **54 API**, **667 mobile across
  78 suites** and **24 contract** cases.
- Full `npm run test:coverage`: **pass**, all unchanged workspace/critical-file
  floors, including the real database and migration/restoration tests. Mobile
  **97.19% lines / 92.05% branches**, API **95.01% / 90.61%**, contracts
  **100% / 100%**, using the task-owned loopback `justgo_test` cluster on 54332.
- Full saved app/API/database suite: **28/28 pass**. The new tall-view journey
  seeds nine actual attempts, opens their day and verifies Rep 9 is in the
  viewport with `scrollTop` still **0**. The retained 41-attempt scrolling/draft/
  saving case and previous recovery/network/cleanup cases also pass. The ignored
  runner moves only fixture web/CORS/network-probe configuration to 8093 to
  preserve the existing preview; every temporary edit is restored afterward.
- Interactive Browser Use in the **in-app side panel**: **pass**, with a temporary
  nine-row developer fixture at **390 × 1600**. All nine rows render without a
  scroll gesture; the measured list has `clientHeight = scrollHeight = 735`
  and `scrollTop = 0`. Resizing to **390 × 844** retains the ninth row, with
  `clientHeight = 518`, `scrollHeight = 735`, and a usable header/scroll region.
  The tab closes normally, the viewport override is reset, and the fixture is
  restored byte-for-byte before final bundle checks. This preview makes no
  account/activity writes and is separate from the saved actual-API journey.
- Cold web and iOS exports with `--clear --max-workers 1`: **pass**, after restoring
  the temporary fixtures. The list's unit coverage is **100% lines/branches**;
  existing global and critical-file floors are unchanged. Relative handoff links,
  version-guide consistency, formatting and diff checks **pass**.
- Standalone fresh online Expo Doctor immediately before the authorized push:
  **21/21 pass**. Hosted checks for the new commits remain separate from local
  evidence.

The task-owned preview and database are stopped after verification; other
workspace/phone services remain untouched. Browser/component checks do not
establish a fresh native measurement or device acceptance for this correction.

The added `DayEntryList.test.tsx` stays beside its owner in the existing entries
group and brings the PR to **71 files**. Reviewed all changed directories: root, Progress entries, `e2e`, `docs`,
`docs/operations` and `docs/handoffs`; no additional folders or moves are needed.
Logs remain ignored under `.local/phase-08/pr25-review-*` in the original checkout.
Other checkout work and broader native/release/privacy acceptance remain separate.

## October 14 fourth review preparation

Anthony merged PR #24 at `6382aed` and requested the final PR in the agreed split.
The clean, attached review checkout was reused at
`/Users/anthonyyoo/.codex/worktrees/phase8-pr3-review/justgo`; its directory name
is retained, while its checked-out branch is now
`phase8-04-haptics-performance-polish`. Local `main` was fast-forwarded from
GitHub before integrating it into that existing branch in `2ece4c9`.
The original checkout's unstaged account-transfer/planning work and the separate
account-deletion worktree were not included or modified.

The remaining diff has **70 files** relative to merged main:

- Saved Pulsar-only feedback, Batter completion, development-only comparisons,
  guarded action/lifecycle feedback and the exported preference.
- Shared accessible custom switches, steady row content and the accepted
  slide/fade animation, including both directions for Reduce Motion while the
  phone accessibility preference retains priority.
- Bounded initial day-sheet rendering, local editor subscriptions and the
  existing entries/reflection-editor responsibility groups, with the large-day
  regression journey.
- The integrated reflection-keyboard correction, keeping the writing area and
  Skip/Save footer usable in constrained layouts.

The integration preserves the merged journey timing correction, export spinner
documentation and earlier reviewed CI fixes. Documentation conflicts retain
both sets of history. Dependency conflicts retain every merged main package
pin while adding only `react-native-pulsar` 1.7.0. The regenerated lockfile's
remaining change is that dependency, not a rollback of Expo patches. Fresh
checks below supersede the keyboard checkpoint's dependency blocker; no native
build or signing work is part of this publication.

Fresh local verification:

- Clean `npm ci`: **pass**.
- `npm run check`: **pass**, fresh online Expo Doctor **21/21**, contracts build,
  TypeScript, ESLint, Prettier, **186 tooling**, **54 API**, **662 mobile across
  77 suites** and **24 contract** cases.
- `npm run test:coverage`: **pass**, all existing workspace and critical-file
  floors, including the real database suites and migration/restoration rehearsal.
  Mobile **97.18% lines / 92.02% branches**, API **95.01% / 90.61%**, contracts
  **100% / 100%**. Tests use a newly provisioned, task-owned loopback `justgo_test`
  on **54332**, with restricted runtime/migrator roles; other databases are not
  reused or modified.
- Cold `npm run export:web -w @justgo/mobile -- --clear --max-workers 1` and
  the equivalent iOS export: **pass**. These are bundle checks, not native builds.
- Full saved actual-app/API/database journeys: **27/27 pass**, including the
  new 41-attempt scrolling/draft/save case and the merged account-layout fix.
  The existing ignored local runner temporarily moves only the fixture app,
  CORS and network probe to **8093**, preserving the preview on 8081; all four
  temporary source/configuration edits are restored byte-for-byte afterward.
  API port 3000, loopback/test-database validation, isolated roles and registry
  cleanup stay enabled. `git diff` confirms only the intended handoff/plan edits
  remain after restoration.
- Interactive Browser Use in the **in-app side panel**, **390 × 844**: **pass**
  for Settings layout, Reduce Motion on/off and persistence after reload,
  development Test haptics navigation, effect selection and reload restoring
  Batter. The unsupported browser preview correctly disables playback; no native
  haptic sensation is claimed. The smoke server on **8094** uses an unreachable
  loopback API, so this walkthrough makes no product activity/account writes.
  The original motion choice and viewport are restored, and the temporary tab
  is closed. The existing web-start `simctl` discovery warning does not establish
  a native failure or native acceptance.

Task-owned fixture/Metro services and the isolated PostgreSQL cluster were
stopped after verification. The existing preview and phone servers were left
alone. Markdown formatting, added handoff links/anchors and diff checks pass.
Standalone fresh online Expo Doctor passes **21/21** immediately before the
authorized publication.
Hosted checks for the published candidate remain separate from local evidence.

Changed-directory review covers every directory in the remaining diff. Existing
Settings/export, developer haptics, platform haptics/completion, Progress entries
and reflection-editor groups keep tests and adapters with their owners. The
Challenges change extends an existing hook without adding files there. No
additional folder moves are needed for this review. Logs remain ignored under
`.local/phase-08/pr4-*` in the original checkout.

Prior owner-reported physical-iPhone haptics/toggle and keyboard evidence remains
in the individual sections. Fresh browser bundles and component checks cannot
establish native feel, VoiceOver, keyboard geometry or acceptance of updated SDK
patches. Those wider release gates stay open, along with the remaining privacy
features. This is the last PR in the review split, not Phase 08 completion.

## October 14 PR #24 review correction

Anthony authorized correcting the remaining valid review feedback and pushing
to the existing PR #24 branch. The
[export documentation finding](https://github.com/anthonyyoo24/justgo/pull/24#discussion_r4276869179)
is addressed in the testing guide, implementation plan and direct-export
handoff: Export my data keeps its label and shows a progress indicator while
busy. The October 11 record identifies the October 12 refinement that replaced
the earlier Creating export… wording, preserving the sequence of changes.
This agrees with `SettingsExportRow` and its existing busy/cancellation test.

The [journey timing finding](https://github.com/anthonyyoo24/justgo/pull/24#discussion_r4276869189)
is already fixed in `106f783`; no further test changes are needed. Both exact-head
[push](https://github.com/anthonyyoo24/justgo/actions/runs/38648084932)
and [pull-request](https://github.com/anthonyyoo24/justgo/actions/runs/38648090602)
Foundation runs passed before this documentation correction. This supersedes
the publication/hosted-verification pending status at the earlier timing-fix
preparation checkpoint below. CodeRabbit skipped its automatic re-review of
that update; these are hosted CI results, not a fresh automated code review.
The generic docstring warning remains an optional targeted-comment improvement,
not a reason to add a blanket comment quota or change test-coverage requirements.

Verification: `npm run check` **passes**, including fresh online Expo Doctor
**21/21**, contracts build, TypeScript, lint, formatting and all tooling/workspace
tests (**567 mobile**, **54 API** and **24 contract** cases). Markdown formatting,
`git diff --check` and the added relative links/heading anchors **pass**.
The ignored full-check log is `.local/pr24-ci-fix/review-docs-check.log` in the
original checkout. No product UI, database or native behavior changed, so no
additional browser/device walkthrough or database suite is claimed for this
documentation correction. Hosted results for the new commit remain a separate
publication check.

Reviewed the complete contents of `docs`, `docs/operations` and `docs/handoffs`.
No files were added; the existing responsibility groups and phase handoff index
remain navigable, so no folder moves are needed. App code, dependency versions,
native/device acceptance and the remaining privacy/release work are unchanged.

## October 14 PR #22 review corrections

Anthony authorized fixing and pushing the two documentation findings assessed
against `a522fe6`. The [billing schedule comment](https://github.com/anthonyyoo24/justgo/pull/22#discussion_r4274919498)
and [remaining motion work comment](https://github.com/anthonyyoo24/justgo/pull/22#discussion_r4274919507)
are addressed by the following corrections:

- Keep early Apple enrollment, app identifiers, Expo/EAS project and signing
  preparation available for the free beta. Schedule Apple purchase-key generation,
  RevenueCat/store-credential connection, subscription-product creation and
  offering/paywall mapping after the free beta checkpoint, during Phase 07A and
  before its billing acceptance. Distinguish the Phase 09 free-beta build checks
  from the return to Phase 09 for paid submission after accepted 07A.
- Align the plan's decision table and PRD implementation order with that same
  sequence. Local billing-code preparation remains preserved; this documentation
  correction does not authorize external provider setup.
- Remove implemented Reduce Motion behavior from open design rows. Keep remaining
  Settings/privacy and haptics design work open, and distinguish Phase 09
  physical-device/VoiceOver/text-scaling acceptance from design decisions.
- Preserve the assessment's recommendation against a blanket 80% docstring target;
  no code, test-coverage floor or CI policy changes are included.

This follow-up also publishes the previously recorded hosted CI results for
`a522fe6`. Verification is limited to Markdown consistency, relative links,
formatting and diff checks; no code tests or UI checks are required for these
documentation-only changes. The legacy `docs/checks/check-plan.mjs` targets the
absent historical HTML companion rather than the authoritative Markdown plan,
so it is not an applicable check for this correction.

Verification: Prettier checks for all four changed Markdown files and
`git diff --check` **pass**. The new relative review-handoff link and its
heading anchor **pass** validation. Manual comparison of the plan and PRD
confirms the billing and motion boundaries agree. Fresh online Expo Doctor
passes **21/21** before the authorized push; its ignored log is
`.local/pr22-ci/review-pre-push-doctor.log`.

Changed-directory review covers `docs`, `docs/product` and `docs/handoffs`.
Their existing responsibility groups remain navigable and no new files or
folder moves are needed. The approved phase sequence and remaining native,
privacy and billing acceptance gates remain open.

## October 14 PR #22 CI repair

Anthony requested identifying and fixing [PR #22](https://github.com/anthonyyoo24/justgo/pull/22)'s
failed checks and preventing recurrence. The isolated `codex/pr22-ci-fixes`
worktree starts at the PR's exact `e146adc95dd67cf5efa0fb46c07cb24165711228`
head; ongoing Phase 08 source edits and other PR checkouts are preserved.

Both [push](https://github.com/anthonyyoo24/justgo/actions/runs/38616590568/job/116033131224)
and [pull-request](https://github.com/anthonyyoo24/justgo/actions/runs/38616610799/job/116033196409)
Foundation `checks` jobs failed for the same reasons:

- `npm run check` stopped at Expo Doctor's SDK dependency validation (20/21).
  Eight exact package pins were behind fresh online recommendations.
- `Upload coverage reports` ran under unconditional `always()` despite coverage
  being skipped and failed with no files under `coverage/`.
- Database tests, coverage collection, saved journeys and both exports were
  skipped; these logs do not establish failures in those checks. CodeRabbit was
  still pending when first inspected and is not the reported Actions failure.

| Package            | PR pin  | Updated pin |
| ------------------ | ------- | ----------- |
| expo               | 57.0.27 | 57.0.29     |
| expo-constants     | 57.0.21 | 57.0.22     |
| expo-crypto        | 57.0.3  | 57.0.4      |
| expo-dev-client    | 57.0.19 | 57.0.20     |
| expo-linking       | 57.0.12 | 57.0.13     |
| expo-router        | 57.0.25 | 57.0.27     |
| expo-splash-screen | 57.0.9  | 57.0.10     |
| jest-expo          | 57.0.5  | 57.0.6      |

The root lockfile is regenerated with these pins. Coverage collection now has
an explicit step ID; upload runs after collection succeeds or fails, while
skipped/unstarted/cancelled collection does not trigger upload. Missing reports
after a completed collection still fail (`if-no-files-found: error`), and all
coverage floors and dependency validation remain enabled.

`scripts/quality/ci-artifacts.test.mjs` reads the workflow's actual condition
and exercises success/failure/skipped/cancelled/unstarted outcomes. Against the
original workflow, four of six cases failed, including the observed skipped
coverage bug. After repair, all six pass. This local condition simulation and YAML
parse do not establish hosted Actions acceptance.

The clean-checkout check also exposed five-second timeouts in two existing
Progress reflection journeys. Their repeated whole-calendar queries are now
scoped to the open day sheet, and each already located Save control is reused
within its editor. Both full add/save/edit/save and add/save/clear/save sequences
and every assertion are retained, without increasing timeouts. The 19-case
Progress file and subsequent full 496-case mobile run pass. This changes test
query cost, not app behavior. Initial regex lint findings in the new tooling test
were corrected with standard space quantifiers.

Prevention: install and run `npm run check` in each exact split/stacked PR
candidate, carry SDK maintenance through reviewed stack integration, and run
`npm run doctor -w @justgo/mobile` with fresh online metadata immediately before
an authorized push. A fixed lockfile controls installation; Expo can publish new
SDK patch recommendations independently, so an old passing result can expire.
No scheduled task or Git hook is installed by this repair.

Verification:

- Fresh `npm ci`: **pass** in the isolated PR checkout. The new workflow regression
  uses only Node built-ins and tracked source; no ignored artifact is required.
- `npm run check`: **pass**, fresh online Expo Doctor **21/21**, contracts build,
  typechecks, lint, formatting, **186** tooling cases, **45** API unit cases,
  **496** mobile cases across **63** suites and **20** contract cases.
- `npm run db:migrate` and `npm run test:db`: **pass**, **48** integration cases
  plus the migration/restoration rehearsal against loopback `justgo_test`.
- `npm run test:coverage`: **pass**, all existing floors unchanged. Mobile
  **95.76% lines / 91.24% branches**, API **94.58% / 89.80%**, contracts **100% / 100%**.
  Includes **94** API unit/database/rehearsal cases, **496** mobile and **20** contract cases.
- `npm run export:web -w @justgo/mobile` and
  `npm run export:ios -w @justgo/mobile`: **pass**. Bundles do not establish native
  runtime or device acceptance.
- `npm run test:journey -- --grep 'self-device revocation'`: **pass**, one saved
  actual-app/API/database Settings → revocation → recovery journey, preserving
  reflection/Progress. The initially reused database on port 54329 stopped after
  coverage completed, causing a connection-refused startup failure. The rerun
  used an independently provisioned clean loopback `justgo_test` cluster on 54331
  with the same isolated roles and clean migrations; fixture cleanup completed.
  The complete journey suite was not rerun for this maintenance slice.
- Interactive Browser Use in the **in-app side panel**: **pass** for Settings,
  Reduce Motion on/off, preference persistence after reload, Account & recovery
  navigation and browser Back. The fixture's original preference was restored;
  no account was created. Browser warning/error logs were empty. Metro bound the
  smoke server to IPv6 localhost, so the first IPv4 visit was refused; the
  observed `localhost:8092` address worked. No security protection was bypassed.
- The saved journey and manual Metro server reported unavailable `simctl` under
  the existing Command Line Tools selection; browser checks passed. No native
  build/signing change, device test or simulator pass is claimed.
- Temporary Metro on 8092 and the separately created PostgreSQL instance on
  54331 were stopped after verification. Other checkout services were preserved.

Logs remain ignored under `.local/pr22-ci/`. Anthony explicitly authorized
pushing the fixes on October 14. The three commits (`9b76585`, `819a061`,
`a522fe6`) were pushed to the existing `phase8-01-settings-foundation` branch
after fresh online Expo Doctor passed **21/21** immediately before publication.
The [push run](https://github.com/anthonyyoo24/justgo/actions/runs/38623306723)
and [pull-request run](https://github.com/anthonyyoo24/justgo/actions/runs/38623313914)
both completed with **success**, inspected on October 14 for exact head
`a522fe64173835f75e0b7f859a83759e16b3c529`. Root checks (Doctor **21/21**, all
**496** mobile tests), database tests, migration rehearsal, unchanged coverage
floors, coverage upload, all **24 saved journeys**, journey upload and both
exports passed. Safe summary evidence is in `.local/pr22-ci/hosted-summary.log`.
CodeRabbit's current passing status explicitly says its review was skipped and
manual review is required; no fresh automated code review is claimed.
Native build/device acceptance for the SDK
patch changes remains separate owner/Phase 09 work. No new PR, merge,
deployment or native build was performed.

Changed-directory review covers the root, `docs`, `.github/workflows`,
`scripts/quality`, `docs/operations`, `docs/handoffs`, `apps/mobile` and
`apps/mobile/src/features/progress`. Existing responsibility groups remain
navigable; only one new quality regression file is added. No folder moves are
needed for this repair.

## Current authorized work

The owner accepted the legal sequence: data checklist, policy/terms drafts, review, then hosting. After that preparation, the owner explicitly authorized the Settings UI using the Paper F1 design and agreed Phase 08 scope, starting with layout and existing recovery/support actions. This handoff covers those local changes and the legal drafts. No public site, email delivery, App Store configuration or Git publication was performed.

Youngshin Yoo is the confirmed personal operator in Canada. The owner's proposed distribution is all available App Store countries and regions for ages 18 and older. The operator's province, final territorial availability, age-related implementation and required regional notices remain review decisions.

The owner subsequently accepted separate email-draft contact actions and added App Store rating plus Instagram, TikTok and Twitter/X rows. After reviewing the combined Help & about group, the owner requested Support directly above About: Support contains Get help and Suggest a feature, while About contains rating, socials and legal links. The owner confirmed the profiles and public App Store listing are not ready; those rows remain unavailable until public destinations are configured.

On October 10 Anthony authorized implementing the first remaining slice, Reduce Motion, while keeping implementation and focused verification together within Phase 08. The October 10 haptics move to Phase 11 is historical; Anthony moved implementation and physical testing back to Phase 08 on October 12, as recorded in the follow-up below.

## Documents prepared

- [Data inventory](../legal/DATA_INVENTORY.md): current data, purposes, recipients, retention proposals, provider status and App Privacy categories to assess.
- [Privacy Policy draft](../legal/PRIVACY_POLICY_DRAFT.md): plain-language user notice, with explicit review notes for unverified or undecided release behavior.
- [Terms of Use draft](../legal/TERMS_DRAFT.md): proposed service terms alongside Apple's standard EULA, including separate beta and paid-release wording.
- [Review and publication checklist](../legal/LEGAL_REVIEW.md): owner/phase for open decisions, regional and Apple guidance, and the sequence for publishing a public static site without changing protected API deployment settings.

The drafts distinguish uploaded product data from optional analytics, persistent account identifiers from anonymous data, and phone storage from cloud recovery. They make no fixed backup/deletion deadline or claim that all providers process only in Canada. PostHog/Sentry activation and paid billing are described as planned rather than running services.

## Evidence and limits

Reviewed the current identity, activity contracts/schema, telemetry stub, safe log serializers, foundation provider setup, Phase 07.5 handoff and Phase 07A sequencing. Checked primary Apple, Canadian OPC, European Commission, ICO and California resources plus Supabase backup guidance on October 9. Production vendor settings and worldwide legal sufficiency are not verified by document drafting.

Document verification passed: `npx prettier --check` for the four legal files, this handoff, handoff index, plan and PRD; 20 internal file/anchor links resolved; review notes and provider/implementation status were reconciled. `git diff --check` passed after the final document updates. Those document-only additions required no code tests or UI checks. The subsequently authorized UI slice has its separate evidence below.

## Settings UI and contact slice

[Paper F1 reference](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/O23-0) was inspected through Paper MCP. JSX/computed styles confirm one raster image fill with no editable internal text or rows. Native reconstruction follows its cream surface, navy serif headings, white outlined groups, decorative line icons, inset dividers and centered title; measurements use existing app tokens and deliberate accessibility adaptations rather than claims of exact raster font/spacing metadata.

- `/settings` remains a secondary stack route reachable without paid access, without Home/Progress bottom tabs. Back returns to its originating screen; direct entry falls back to `/`.
- `app-support/settings/` owns layout, grouped rows and decorative icons. The route remains a thin screen export. The existing Account & recovery link opens the shared identity controller's Account / Recovery keys / Device transfer / Manage devices tools.
- Support and Feature requests open user-reviewed email drafts to `anthonyyoo24@gmail.com`, with distinct subjects and no body, attachments, history or account identifiers. The shared external-link control blocks duplicate taps while opening, restores the action after failure, displays approved toast copy and suppresses late presentation after unmount.
- The same support destination is connected to account recovery and expanded saving-recovery details. Native/web toast adapters show plain link-failure copy; covering sheets use the sheet toast channel.
- Preferences, data export/deletion and two analytics choices are visible but explicitly unavailable in this layout slice. No fake switches, consent persistence, deletion or export action is introduced. Reminders, Reset progress and inactive commercial controls are omitted. Optional analytics remain off under the existing stub.
- Privacy policy stays disabled until a valid public HTTPS destination is configured. Terms uses the existing Apple standard license fallback until the reviewed JustGO terms URL is supplied; its descriptive subtext was removed in the later owner refinement recorded below. No legal draft was published. App version comes from Expo config rather than the mockup's sample version.

Verification for this slice is recorded below. Earlier local app edits are included in the tested scope, not silently accepted as completed Phase 08 behavior.

### UI verification

- Focused mobile tests: **35 pass** across Settings route/navigation, configured and unavailable legal links, exact contact subjects/no private attachments, duplicate tap/retry/unmount handling, account and saving-recovery support, and native/web toast host wiring.
- `npm run check`: **pass**, fresh online Expo Doctor 21/21, contracts build, workspace/journey typechecks, lint, formatting, tooling/API/mobile/contracts tests. Mobile: **443 cases across 60 suites**.
- `npm run test:coverage`: **pass**, all existing global and critical floors unchanged. Mobile **95.07% lines / 90.71% branches**, API **94.58% / 89.8%**, contracts **100% / 100%**. The combined run includes the dedicated loopback database suites and migration rehearsal. Remaining Settings branches cover conditional presentation/version/developer shortcut paths; no new preference/data/consent behavior is claimed.
- `npm run test:journey -- --grep 'self-device revocation'`: **pass**, one saved actual-app/API/database journey through Settings → account tools → revocation → recovery preserving saved history. Fixture-owned account cleanup and service shutdown complete. The temporary Expo process reported unavailable `simctl` under the machine's default Command Line Tools path; the browser journey itself passed.
- Interactive Browser Use in the side panel: **pass** at **390 × 844** and **320 × 568** for upper/lower grouped layout, narrow-width wrapping/scrolling, unavailable controls, opening existing recovery, and the preview → Settings → Back return path. No browser console errors/warnings were observed. A separate attempt to open the feature-request draft was **blocked by the side-panel browser security policy**; no bypass or native alternative for that blocked mail action was attempted. Exact mail destinations, approved failure copy and retry/unmount behavior have automated evidence; actual mail opening remains a physical-phone check.
- Cold native bundle: Metro's iOS/Hermes entry returned **HTTP 200 / 10,874,469 bytes** after its cache was prepared. This proves bundling, not native UI behavior.
- Native simulator **visual evidence passes** for Settings rendering on the existing iPhone 17 / iOS 26.5 QA device: safe-area header, first groups, connected-account copy, grouped native rows and no bottom tabs were observed through the live side-panel mirror. The first client connection failed while a cold iOS bundle took about 218 seconds. Preparing the exact bundle, restarting the same simulator without erasing data and reopening the existing client produced the current Settings screen. A subsequent native screen capture confirms the Account & recovery tap reached the existing connected-account tools (Account / Recovery keys / Device transfer / Manage devices). The mirror lagged behind the actual screen and its input/device discovery was intermittent; a window-level Computer Use capture also reported no available window after the simulator restart. This limited rendering/recovery-entry evidence does not establish full native recovery, Keychain persistence, mail opening, large text or VoiceOver acceptance.
- XcodeBuildMCP could not locate `simctl` through the machine default tools path. Command-scoped `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` uses the installed Xcode without changing global configuration. No native rebuild, signing upgrade, app reinstall, data or Keychain erase was performed. Full native recovery flows, large text/VoiceOver and physical-device mail behavior remain open in Phase 08/11.
- Ignored evidence: `.local/phase-08/{check,coverage,recovery-journey}.log`, `settings-web.png`, `settings-ios.png`, `settings-recovery-ios.png` and native bundle; routine screenshots remain uncommitted.
- Manual review allocated **zero** new fixture accounts. It reused the existing nonproduction QA simulator/vault; no activity or recovery-key generation was performed. API/Metro and the scoped simulator mirror are retained for owner review; stop the mirror terminal so its UDID-scoped cleanup trap runs when review ends. These local fixture services are not the free TestFlight beta environment.
- Physical iPhone mail-draft opening, VoiceOver and large text remain release checks. Component/browser results do not establish native behavior.

### October 9 heading refinement

At Anthony's request, the Settings title and every section heading now use the existing `fontFamilies.editorial` Bodoni 72 bold treatment shared by the refined Success, Reflection and Progress headings. Sizes and line heights stay at 29/32 for the title and 23/28 for sections, with -0.5 and -0.25 tracking respectively. Paper MCP confirmed F1 remains a single raster fill; this family is a visual reconstruction rather than extracted source font metadata.

- Existing Settings behavior tests: **7 pass**. `npm run check`: **pass**, including online Expo Doctor **21/21** and mobile **443 tests / 60 suites**.
- `npm run test:coverage -w @justgo/mobile`: **pass**, **95.07% lines / 90.71% branches**. `npm run coverage:check`: **pass**, unchanged floors using the fresh mobile report and the prior verified API/contracts reports. No backend/shared behavior changed; database suites were not rerun for this typography refinement.
- Side-panel Browser Use: **pass**, upper and lower headings at **390 × 844** and **320 × 568**, with no heading overflow or browser console errors/warnings. The title's rendered width decreased from about **102.7px to 90.3px** at the same font size. Review verdict: clearer narrow serif hierarchy, preserved spacing/contrast, aligned groups and readable scrolling content without clipping. Temporary viewport overrides were reset.
- Existing iPhone 17 / iOS 26.5 simulator: **visual pass** for the updated Settings title and visible section headings after hot reload. No native build, signing change, reinstall or data erase. Physical-device large-text and VoiceOver acceptance remain open.
- Ignored evidence: `.local/phase-08/heading-refinement-{check,coverage}.log`, `settings-heading-{before,after}-web.png` and `settings-heading-after-ios.png`.

### October 9 Help & about and public destinations

This earlier review slice combined contact/information rows under Help & about: Get help, Suggest a feature, Rate on the App Store, Instagram, TikTok, Twitter / X, Privacy policy and Terms of use. The subsequent owner-requested split is recorded below. Contact actions retain distinct subjects, the same private inbox and no automatic attachments. Legal links retain the existing policy-unavailable state and identified Apple standard-license fallback.

Rating/social destinations come from `EXPO_PUBLIC_APP_STORE_ID`, `EXPO_PUBLIC_INSTAGRAM_URL`, `EXPO_PUBLIC_TIKTOK_URL` and `EXPO_PUBLIC_TWITTER_URL`. The numeric Apple ID is configured only after the public listing can accept reviews; it generates the direct Write a Review URL. This follows [Expo's explicit review-link guidance](https://docs.expo.dev/versions/v57.0.0/sdk/storereview/#ios) without a new dependency or discretionary in-app rating prompt. Legal/social links share the public HTTPS/credential validation in `lib/public-url.ts`. Unconfigured or invalid destinations stay disabled with Coming soon; configured opening failures use approved copy and permit retry.

- Focused Settings/community/legal/shared-link tests: **32 pass** across four suites. They cover four groups, unavailable rows, exact configured destinations with no account/activity data, rejected URL/store configuration, retry after each new link failure, and retained recovery/contact/legal behavior.
- `npm run check`: **pass**, online Expo Doctor **21/21**, types/lint/format/tooling/API/mobile/contracts checks; mobile **459 tests / 61 suites**.
- `npm run test:coverage -w @justgo/mobile`: **pass**, **95.09% lines / 90.78% branches**. `npm run coverage:check`: **pass**, unchanged global/critical floors with the fresh mobile report and prior verified API/contracts reports. Backend/public contracts and database behavior are unchanged; database suites were not rerun for this mobile slice.
- Browser Use in the side panel: **pass**, upper/lower layout at **390 × 844** and **320 × 568**, eight combined rows, disabled destinations, readable two-line rating label at the narrow width, scrolling/footer and no browser console warnings/errors. Temporary viewport overrides were reset and the Settings page retained for review.
- Native Computer Use on the existing iPhone 17 / iOS 26.5 QA simulator: **visual pass**, combined heading, all eight rows, outline icons, named controls and disabled states. The Simulator window was accessible during this check, after the earlier slice's intermittent failures. No native rebuild/signing/reinstall or data erase was required. Real mail, App Store/social destination opening and physical-iPhone/VoiceOver/large-text release checks remain open.
- Ignored evidence: `.local/phase-08/help-about-{check,coverage}.log`, `help-about-web.png` and `help-about-ios.png`.
- **Owner / Phase 11 setup:** Supply public profile URLs and the listing's numeric Apple ID once ready, then verify the actual destinations on a physical iPhone. These unavailable links do not establish release acceptance; this slice does not complete the other Phase 08 controls or legal publication.

### October 9 separate Support and About

At the owner's request, Settings now has five groups: Preferences, Account & data, Privacy, Support, and About. `SettingsInformationGroups` owns the two information/contact cards. Support sits directly above About and contains Get help and Suggest a feature, followed by the email privacy note. About contains rating, Instagram, TikTok, Twitter / X, Privacy policy and Terms of use. Existing destinations, unavailable states, email subjects, retry feedback, typography and navigation are preserved.

- Focused Settings/community/legal/shared-link tests: **33 pass** across four suites. The added regression verifies contact/information membership and note placement; the route test verifies heading order. The first grouping assertion scoped a React Native Text wrapper instead of the containing section; it was corrected to query the actual `SettingsGroup` and rerun successfully.
- `npm run check`: **pass**, fresh online Expo Doctor **21/21**, types/lint/format/tooling/API/mobile/contracts checks; mobile **460 tests / 61 suites**.
- `npm run test:coverage -w @justgo/mobile`: **pass**, **95.09% lines / 90.78% branches**. `npm run coverage:check`: **pass**, unchanged global/critical floors with the fresh mobile report and prior verified API/contracts reports. No backend/public-contract/database behavior changed; database and saved journey suites were not rerun for this presentation refinement.
- Interactive Browser Use in the side panel: **pass**, Support above About at **390 × 844** and **320 × 568**, separate cards and email note, wrapped labels, lower rows/footer and no console warnings/errors. Temporary viewport overrides were reset and Settings retained for review. This is separate from saved end-to-end evidence.
- Native Computer Use on the existing iPhone 17 / iOS 26.5 QA simulator: **visual pass**, separate headings/cards with the two contact controls and retained unavailable states. No native build, signing change, reinstall or data erase was needed. Physical-device mail/store/social opening, VoiceOver and large-text release acceptance remain open as previously recorded.
- Ignored evidence: `.local/phase-08/support-about-{check,coverage}.log`, `support-about-web.png` and `support-about-ios.png`.

### October 9 section descriptions removed

The owner requested removing the explanatory paragraphs below Account & data, Privacy and Support. Those three paragraphs and the now-unused section-note rendering/style are removed. All five headings and their rows remain, including recovery and Apple-license details within individual rows. The section gaps continue to use the existing spacing token. Contact destinations, privacy behavior and unavailable controls are unchanged.

- Focused Settings/community/legal/shared-link tests: **33 pass** across four suites. The route regression now asserts that all three paragraphs are absent while recovery/license row details remain; grouping, navigation, link configuration and failure/retry coverage still pass.
- `npm run check`: **pass**, fresh online Expo Doctor **21/21**, types/lint/format/tooling/API/mobile/contracts checks; mobile **460 tests / 61 suites**.
- `npm run test:coverage -w @justgo/mobile`: **pass**, **95.09% lines / 90.77% branches**. `npm run coverage:check`: **pass**, unchanged global/critical floors using the fresh mobile report and prior verified API/contracts reports.
- Interactive Browser Use in the side panel: **pass** at **390 × 844** and **320 × 568** for absent descriptions, consistent gaps between Account & data, Privacy and Support, retained row details and narrow-width wrapping. No console warnings/errors were observed; the viewport override was reset and Settings retained for review.
- This copy/layout refinement did not rerun native/device, database or saved journey checks. Earlier physical-device mail/store/social opening, VoiceOver and large-text acceptance remain open.
- Ignored evidence: `.local/phase-08/section-descriptions-{check,coverage}.log` and `section-descriptions-web.png`.

### October 9 row subtext and local commit review

The owner requested removing the Account & recovery and Terms of use subtext, then explicitly authorized appropriate local commits for all pending changes. Both rows now display only their labels. Account recovery still navigates to `/recovery`, and Terms retains its configured public URL or existing Apple standard-license fallback. The unused row-detail rendering/style and Settings screen's account-preview dependency are removed. The code and scope/verification documentation are grouped into separate local commits; no push, PR or merge was authorized or performed.

- Local code commit: `9d8065f` — `feat(mobile): refine Settings groups and community actions`. The separate documentation commit records the current scope, prior review slices and final evidence. Ignored screenshots/logs remain outside Git.
- Focused Settings/community/legal/shared-link tests: **33 pass** across four suites. The route regression asserts absence of both account-description variants and Apple-license subtext, along with the earlier section paragraphs. Recovery navigation, configured and fallback Terms destinations, unavailable ratings/socials, private contact payloads and link-opening failure/retry checks still pass.
- `npm run check`: **pass**, fresh online Expo Doctor **21/21**, types/lint/format/tooling/API/mobile/contracts checks; mobile **460 tests / 61 suites**.
- `npm run test:coverage -w @justgo/mobile`: **pass**, **95.09% lines / 90.75% branches**. `npm run coverage:check`: **pass**, unchanged global/critical floors using the fresh mobile report and prior verified API/contracts reports.
- Interactive Browser Use in the side panel: **pass** at **390 × 844** and **320 × 568** for both label-only rows, uniform row spacing, retained headings/actions, narrow-width wrapping and the footer. No console warnings/errors were observed; the viewport override was reset and Settings retained for review.
- Native/device, database and saved journey checks were not rerun for this final presentation refinement. Earlier physical-device mail/store/social opening, VoiceOver and large-text acceptance remain open. Native billing remains preserved on `codex/phase-07a-native-billing` at `4d5c9f2`.
- Ignored evidence: `.local/phase-08/settings-final-{check,coverage}.log`, `settings-final-account-web.png` and `settings-final-about-web.png`.

### October 10 challenge completion investigation

The owner reported a brief page flash after Completed on the iPhone simulator and
rejected the provisional overlay fix. Further recordings captured native mixed
frames and first-frame Success layout/artwork settling. The current iOS flow uses
one `/challenge` route with Success prepared beneath Active; Completed reveals it
in place. First/repeated final captures are clean. The [07.3 follow-up](phase-07-3-local-flow.md#october-10-native-completion-handoff-follow-up)
records final checks, diagnostic evidence and remaining owner/device acceptance.
Settings scope, preserved native billing and Git permissions remain unchanged.

### October 10 Accept and Completed verification

The owner subsequently reported Accept flicker. Native recordings reproduced an
accepted-card snapback from Home's focus-based deck key, then a separate mixed
native frame and late artwork. The current iOS flow preserves the exiting deck
and prepares an opaque Accept cover until destination layout/images and native
entry finish. The temporary cover mirrors saving warnings without duplicating
the destination toast host. Completed retains its in-place prepared Success view.
First/repeated final native recordings are clean; **471 mobile tests / 62 suites**,
the root check and unchanged coverage gate pass. The [Accept follow-up](phase-07-3-local-flow.md#october-10-accept-handoff-follow-up)
records failing-before regressions, final frame timestamps and verification limits.
This remains a local mobile fix, with owner acceptance and wider device gates open.

## October 10 haptics moved to Phase 11

Anthony requested keeping haptics implementation and its testing together in
Phase 11. Feedback, the saved Settings toggle, automated checks, physical-iPhone
acceptance and any corrections/retests are now one pre-beta Phase 11 task. Haptics
does not block Phase 08; the existing unavailable row remains unchanged. Reduce
motion remains Phase 08. The [plan](../IMPLEMENTATION_PLAN.md#phase-11) owns the
implementation scope and acceptance gate; Anthony owns physical-phone acceptance.
This is a documentation-only scheduling change, with no haptics implementation,
dependency/build change or Git publication.

Documentation verification: Prettier checks pass for the plan, tech stack, this
handoff and the index; updated link/section targets resolve and `git diff --check`
passes. This scheduling change requires no application tests or UI checks.

## October 10 Reduce Motion implementation

Settings now replaces the unavailable Reduce motion row with a working native
switch. One boolean is saved in installation-level AsyncStorage under
`justgo:reduce-motion:v1`. It survives relaunch, is available without paid access
and remains independent of accounts, recovery and journal storage. It is not
uploaded or synchronized. The data inventory and policy draft now describe this
actual local behavior; no legal document was published.

`platform/motion/MotionPreferencesProvider` combines the saved choice with React
Native's accessibility query, live changes and foreground refresh. Phone-level
Reduce Motion always wins: Settings shows the enabled, unavailable switch with
“Enabled by your phone’s accessibility setting.” Initial unresolved reads keep
motion reduced and disable input so late hydration cannot replace a newer choice.
Failed saves preserve the earlier choice and expose a retryable message. Failed
system queries keep motion reduced until an event or foreground read succeeds.
Subscriptions, stale reads and delayed saves are fenced on cleanup.

The root wraps app providers and toast hosts with this shared preference. Cards,
Progress shimmer, day-sheet slides, reflection-panel motion and native/web toast
entry/exit consume its effective flag. Reduced motion settles movement directly
without blocking Skip/Accept or sheet/reflection actions. Enabling it during a
card exit resolves the canceled animation wait; enabling it during sheet opening
or closing settles the sheet exactly once. `useDaySheetMotion` owns this animation
lifecycle separately from paging/reflection UI and rejects late close callbacks
after unmount. Existing in-place Completed → Success and prepared Accept cover
behavior is preserved; fade-only dialogs and native loading controls remain.

### Motion verification

- Focused tests: **114 pass across five suites** for motion preferences, cards,
  day sheets and actual Progress composition. Coverage includes storage validation,
  slow reads, both persisted choices, live system priority, overlapping/stale
  foreground reads, save failures/retry, duplicate input, cleanup, canceled card
  exits, swipe/cancel gestures and interrupted/late sheet callbacks.
- Browser review exposed an existing deprecated `pointerEvents` prop in the
  reflection panel. Its style now owns the same open/closed input isolation;
  the regression checks both states. The affected panel/day-sheet/Progress
  suites pass **38 cases**, and fresh browser reload/expansion produces no new
  console warnings or errors.
- Early lint feedback caught synchronous effect resets and a shared-directory
  test importing feature/app-support code. The adapter is now stable for the
  provider lifetime, unnecessary resets are removed, and integration tests live
  beside the Settings owner. Gesture mocks now forward callback arguments. No
  lint or coverage requirement was relaxed.
- One later full run hit the existing five-second timeout in Progress's
  feeling-preserving text-clear test. The unchanged 19-case Progress suite then
  passed in isolation, including that case in about two seconds. The final full
  run and coverage results are recorded below; no assertion or timeout was
  weakened.
- Final `npm run check`: **pass**, fresh online Expo Doctor **21/21**, contracts
  build, workspace/journey typechecks, lint, formatting, tooling/API/mobile/
  contracts tests. Mobile: **496 cases across 63 suites**.
- `npm run test:coverage -w @justgo/mobile`: **pass**, **95.76% lines / 91.24%
  branches**. `npm run coverage:check`: **pass**, unchanged all-source/critical
  floors using fresh mobile and prior verified API/contracts reports. The new
  provider/shared flag and switch have 100% line coverage. Important preference
  failures and animation interruption branches have focused behavioral evidence.
- Browser Use in the in-app side panel: **pass** for Settings at **390 × 844**
  and **320 × 568**, keyboard switching, both choices after reload, preview card
  advancement, day-sheet open/close and reflection expansion/hiding with normal
  and reduced motion. The pointer-events warning was reproduced and fixed;
  fresh final reload/panel review has no new warnings or errors. Metro's existing
  live watcher served the source, viewport overrides were reset, and Settings
  was retained for review. This walkthrough is separate from saved end-to-end
  evidence; browser system-media override was not tested interactively.
- Native Computer Use on the existing iPhone 17 / iOS 26.5 QA simulator verifies
  the functional switch, persistence after terminate/launch, and phone-level
  priority with the app preference off. Foregrounding after system Reduce Motion
  changes shows the explanatory disabled switch; restoring the system setting
  returns the app's saved off choice and usable control. The phone setting was
  restored to its original off value. No native rebuild, signing change,
  reinstall or account/Keychain erase occurred.
- Native synthetic preview: **pass** for Skip advancing the card with the
  preference enabled, Progress/day-sheet opening, saved reflection expansion/
  hiding and sheet closure. App and system preferences were returned to off;
  Settings remains open for review. Coordinate-based Computer Use briefly
  reported no available window; reconnecting and using the observed AX elements
  completed the walkthrough. No desktop screen recorder was used.
- XcodeBuildMCP's default `simctl` discovery remains unavailable under Command
  Line Tools. Command-scoped `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`
  uses the installed Xcode for the existing simulator without changing global
  configuration. Browser/component evidence does not establish physical-phone
  behavior.
- Manual review uses existing local QA and synthetic preview content, with zero
  new fixture accounts or recovery secrets. Backend, public contracts and
  database behavior are unchanged; database and saved journey suites are not
  rerun for this mobile-only slice. Physical-iPhone, VoiceOver and large-text
  checks remain owned by Anthony in Phase 11 before the beta. All wider prior
  recovery/device/release gates remain open. No Git publication was performed.
- Ignored evidence: `.local/phase-08/motion-{focused,progress-regression,
panel-regression,check,coverage,coverage-gate}.log`, the earlier timeout log,
  `motion-settings-web.jpg`, `motion-ios-system.png` and
  `motion-ios-reflection.png`. No screenshots or recordings are committed.
- Final documentation checks: Prettier passes, **19** added/updated internal
  links resolve, and `git diff --check` passes. Plan, product/architecture
  guidance, local-data inventory and handoff index match the implemented slice
  and retain all open acceptance/deferral records.

## October 10 data export implementation

Anthony authorized step 2 and selected a ZIP with CSV and JSON. The initial
slice opened a separate Export my data screen, available without paid access;
the October 11 follow-up below replaces it with a direct Settings action.
Export is explicit, blocks repeated taps while preparing/sharing and leaves
existing data unchanged. The original screen explained the private contents,
internet requirement and user-selected save destination. Back navigation,
account changes and route blur cancel preparation; retry, unreadable local
storage, cancellation and successful delivery have distinct feedback.

`GET /v1/account/export` authenticates every page using the existing session
transaction and owner policy. Strict shared contracts/OpenAPI reject unknown
input or response fields. The existing `(user_id,id)` primary key supports
50-attempt pages across all history, including historical timestamps, challenge
details, submitted feelings and reflection text. Account creation and registered
device metadata are included; credentials, session tokens, recovery keys and
request diagnostics are excluded. The route requires identity only and has no
entitlement check. The upload allowlist explicitly includes the new contract.

The Settings coordinator captures pending/rejected local records before reading
online pages. A challenge with an unuploaded edit retains both versions, labeled
`cloud`, `pending_upload` or `needs_attention`; exporting does not discard writing
or acknowledge operations. Invalid pages, ownership changes, cancellation and a
failed later page prevent file delivery. Another device's changes can appear
between pages; README and timestamps describe the read interval rather than
promise an atomic cross-device snapshot. Only saved/submitted content is included,
not unsaved text or challenge starts/give-ups that the product does not persist.

The archive contains `activity.csv`, `data.json` and `README.txt`. CSV includes
UTF-8 BOM, quoted fields and spreadsheet-formula protection; JSON preserves exact
Unicode, quotes and newlines. The effective Reduce Motion preference from this
installation is included. Pinned `fflate@0.8.2` creates stored ZIP entries without
native compression modules. `expo-file-system@57.0.7`, already present in the
installed development app, is now a direct dependency. iOS writes to a private
cache folder and opens the native share sheet, cleaning up after success,
dismissal or failure. A process interruption can leave a temporary file until
the next export clears the folder. The web adapter downloads a ZIP and removes
its temporary anchor/object URL. Android file sharing remains outside the first
iOS release; no rebuild, signing change or external file upload was performed.

### Export verification

- Focused mobile checks: **47 cases across five suites pass**, covering all-page
  reads, cloud/local copies, exact text and CSV escaping, rejected changes,
  unreadable hydration, failure after a successful page, invalid/cyclic pages,
  ownership and late-response fences, same-account backgrounding, repeated taps,
  retry, still-mounted route blur, account change, native cleanup and web URL
  cleanup. These adapter tests do not establish native file-provider behavior.
- Real PostgreSQL export integration: **four cases pass** for 51 rows split
  50 + 1, historical precision/legacy attribution, exact feelings/text, owner
  isolation, empty history, safe device metadata, invalid queries and
  expired/revoked/retired identities. Full `npm run test:db`: **52 cases across
  six suites plus the migration/restoration rehearsal pass**.
- The first database run found raw timestamps could be strings; normalization
  now handles both strings and `Date` values. The first full check found the new
  contract missing from the deploy allowlist; the explicit allowlist entry fixes
  it. Lint/format feedback was fixed without suppressing warnings or weakening
  checks.
- `npm run check`: **pass**, including fresh online Expo Doctor, contract build,
  workspace/journey typechecks, lint, formatting and architecture/API/mobile/
  contract tests. Mobile: **529 cases / 67 suites**; contracts: **23 / 9**.
- Fresh root `npm run test:coverage`: **pass** for every workspace and unchanged
  all-source/critical floors. Mobile: **95.89% lines / 91.25% branches**; API:
  **94.75% / 90.44%**; contracts: **100% / 100%**. Export service/routes and
  local snapshot have 100% line/branch coverage. Archive collection has 100%
  lines and 95.45% branches; UI has 97.43% lines and 91.89% branches. Native
  adapter has all lines covered; its uncovered folder-existence branches do not
  replace the tested write/share/cancellation/ownership cleanup behaviors.
- Saved app/API/database journeys: `npm run test:journey --
e2e/data-export.spec.ts` **passes both cases**. The downloaded archive contains
  all 51 historical online attempts plus a pending local reflection, with exact
  text and spreadsheet protection. The second case fails the export network
  read and downloads after an explicit retry. Database assertions verify export
  added no activity rows; the isolated server registry cleans accounts created by
  this run. Earlier saved suites were not rerun for this additive slice. This
  local result does not establish hosted CI or native platform acceptance.
- `npm run export:web -w @justgo/mobile` and `npm run export:ios -w
@justgo/mobile -- --max-workers 1`: **pass**. The export route and ZIP library
  resolve in both production bundles. Bundling is separate from actual delivery,
  installed app behavior and physical-device acceptance.
- Browser Use in the in-app side panel: an actual ZIP download was unzipped and
  its three files, exact synthetic reflection, CSV formula protection and
  credential exclusion verified. The export screen fits **390 × 844** and
  **320 × 568**, exposes honest missing-account feedback and returns to Settings.
  The viewport override was reset. The stale fixture server initially returned
  NOT_FOUND; restarting this workspace's isolated fixture API with current code
  resolved the environment mismatch. No production server or bypass was used.
- Native Computer Use on the existing iPhone 17 / iOS 26.5 QA simulator reached
  the actual ZIP share sheet and Save to Files picker. Save completion,
  cancellation and real file-provider cleanup are **not yet native acceptance
  evidence**. Anthony requested a five-minute pause while another task used the
  simulator; that pause was honored. The other task's Progress UI was then
  visible, and its Metro/API processes were left alone. This observation did
  not verify its server connection; the reconnection follow-up below corrects
  that gap. No physical-iPhone pass is claimed.
  Phase 11 still owns physical file delivery, VoiceOver and large-text checks
  before beta, alongside the wider recovery/storage/staging gates.
- The one manually created browser account contained only disposable test text;
  its exact UUID was read from this task's ZIP and removed from loopback
  `justgo_test` after verification. No native account or other task's records
  were deleted. Diagnostic ZIP/screenshot/logs stay under ignored
  `.local/phase-08/`; no private journal content, credentials or recordings are
  committed. A Simulator shortcut briefly selected screen capture during native
  navigation; it was stopped and its control confirmed inactive.
- Plan, app-shell boundaries, data inventory, policy draft, testing guidance and
  handoff index describe the implemented slice and preserve remaining gates.
  No policy was published and no Git push, PR or merge was performed.
- Final Prettier and `git diff --check`: **pass**; all four added internal links
  resolve, including this implementation section. The browser fixture API and
  live Metro preview are restored on their original 3000/8081 ports; the other
  task's 3003/8083 processes were not stopped or edited.

### Simulator connection follow-up

Anthony reported a simulator issue after the export handoff. Direct inspection
found the development client still connected to `http://127.0.0.1:8081`, with
“Could not connect to the server” over cached Progress content. The export journey
checks had restarted this preview server; restoring the process had not restored
the client connection or the other task's original server selection.

Both preview servers responded as running. The untouched 8083 process belongs to
the `day-sheet-performance` worktree. In the development launcher's Recently
opened list, selecting `http://127.0.0.1:8083` restored the app. Native Home and
Progress loaded normally; the developer menu explicitly confirmed that URL, then
was closed. Progress still displayed the existing local QA totals. No app data,
Keychain, simulator configuration or server was erased/rebuilt/restarted in this
follow-up. The simulator was left on Progress for the other task. Ignored proof:
`.local/phase-08/simulator-reconnected.png`.

This was an environment reconnection, with no application-code change. Native
inspection and final document formatting/diff checks are the applicable evidence;
the earlier export test results and open file-delivery gates remain unchanged.

### Owner preview switch to the export implementation

Anthony then explicitly requested running these changes in the simulator for
manual testing while preserving the other worktree. The development menu
confirmed the initial connection was `http://127.0.0.1:8083`. Its launcher still
listed that preview and this workspace's `http://localhost:8081`. Selecting 8081
loaded the Phase 08 app from the existing live Metro server and fixture API on 3000. Settings exposed Export my data as a link, and opening it displayed the
enabled Export ZIP action. The simulator was left on that screen for Anthony;
no export was sent or save destination chosen during this setup.

The other worktree's source and existing 8083 server were untouched; its preview
remains in the launcher's Recently opened list for switching back. No branch
merge, native rebuild, reinstall, signing change or account erase was needed.
The floating development control was moved away from the export heading.
Ignored proof: `.local/phase-08/export-ios-ready.png`. This launch/navigation
check does not close the outstanding native save/cancel/cleanup acceptance gates.

## October 11 physical-phone setup

At Anthony's request, the agent inspected Apple Developer and the existing Expo project in the Codex side panel, plus EAS CLI read-only metadata. Active individual Apple membership, the existing `com.anthonyyoo.justgo` identifier and the matching EAS development variable were verified. The setup notes previously marked these as pending; [APPLE_SETUP.md](../operations/APPLE_SETUP.md) now records current evidence and the first-phone checklist. No replacement identifier or Expo project was created.

The Mac detected Anthony's iPhone 15 Pro / iOS 26.6.2, initially unpaired. Anthony explicitly authorized submitting the phone's device name and UDID to Apple/Expo for JustGO testing. The Apple side-panel registration reached **Registration Complete**. The UDID stays out of committed documentation; ignored discovery data and `phone-registration-complete.png` record local evidence. EAS has only simulator builds and no Apple team/device registration for this Expo account yet. `eas device:create` reached Apple's password prompt; it was cancelled without requesting a password in chat. Anthony must authenticate privately in his terminal and import the already registered phone using Developer Portal.

Physical signing/build, Developer Mode, phone installation and the HTTPS test API are still open. There is no `EXPO_PUBLIC_API_URL` in the EAS development environment. The current loopback fixture cannot be exposed as a phone backend; a reviewed test API and tester-access path are necessary. No signing credential, API deployment, build upload, Git publication or physical-phone acceptance occurred. This is setup evidence, not a change to the previously recorded Phase 08/11 feature sequencing.

### Physical development build follow-up

Anthony completed Apple authentication privately in his terminal and imported the already registered iPhone into the existing Expo team. EAS CLI verified that registration. The agent reused that session, selected the existing phone and let EAS generate an Apple distribution certificate and ad hoc provisioning profile; no existing signing credential was removed. Signing secrets remain in provider-managed credential storage and were not printed or committed.

Fresh `npm run check` **passed**, including online Expo Doctor and the existing **529 mobile tests / 67 suites**. `eas build:inspect --platform ios --profile development --stage archive` verified the upload contains the current export implementation, custom Keychain module and required workspace dependencies, excluding private environment files, local test data, generated native projects and signing credentials. The completed source upload was 18.2 MB. Logs and archive inspection remain under ignored `.local/phase-08/`.

EAS build [1500d7ee-c49a-4047-b88a-278eccdc21bc](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/1500d7ee-c49a-4047-b88a-278eccdc21bc) used the physical `development` profile, `com.anthonyyoo.justgo`, version 0.1.0 (1), and **finished successfully October 11 at 14:25:51 UTC**. Both CLI status and the side-panel Succeeded/IPA/Install controls confirm the result. Its source includes the uncommitted export changes despite the dashboard displaying HEAD `e146adc*`. Compilation ran on Expo, not the 8 GB Mac. The installation QR dialog was opened for Anthony; ignored proof is `phone-build-install.png`. Phone installation/Developer Mode and real device acceptance are still pending. A subsequent USB discovery confirmed the iPhone is now paired; this does not establish app launch or Developer Mode.

Read-only backend inventory found the existing Vercel preview is still the Phase 02 API. The existing Canadian Supabase `JustGo` project is on the free organization plan and was paused. Reactivation reached `ACTIVE_HEALTHY`; no migration or account-data change occurred. Metadata verified four migrations (0000–0003), four accounts and only identity tables, with no product activity/reflection tables. The current app needs the canonical API/schema and the planned server-authorized free tester access before full phone testing. [The scoped backend preparation](../operations/APPLE_SETUP.md#hosted-test-backend-prerequisite) preserves those identities, requires backup/cutover review and an approved reachable route, and keeps deployment protection and real ownership boundaries. The loopback fixture was not exposed, no entitlement bypass or API deployment was created, and no Git publication occurred. A live API address can be supplied through Metro without rebuilding this compatible native client.

Anthony subsequently reported successful installation and opening to the development launcher. Local IPA inspection confirms the expected bundle ID/team/version, the included development launcher and a provisioning profile containing the connected iPhone. A separate LAN Metro session runs on port 8084 with one worker and no API URL while hosted setup is pending; no simulator server was restarted. Sending its URL to the phone using `devicectl` was rejected with **Developer Mode is disabled**. Anthony was given the phone-side Developer Mode/restart steps. Live bundle loading, physical Settings/export behavior and all wider device gates remain open. This is owner-reported installation and tool-observed setup evidence, not a physical feature pass.

After reactivation, authenticated `vercel curl` checks of the existing protected preview's `/health` and `/ready` returned healthy/ready JSON. This confirms the older API can reach its existing database; it does not verify the newer API/schema, mobile reachability or free tester access. Final document formatting and `git diff --check` passed. The IPA, provisioning-profile inspection, full build metadata and screenshot are confirmed ignored by Git.

After Anthony enabled Developer Mode and restarted, a fresh `devicectl device info details` confirmed **enabled**, and opening JustGO with the LAN development link succeeded. The earlier list-devices response briefly retained stale disabled metadata. Anthony reported the development launcher could not load the project, with the internet connection appearing offline. Metro remains listening on 8084 and serves its status and SDK 57 iOS manifest on the Mac; there is no observed phone bundle request. IPA inspection confirms the local-network usage notice, Bonjour discovery service and local-network transport allowance are already present. Anthony was asked to enable the phone's JustGO Local Network permission, check the same Wi-Fi and retry. App bundle loading and physical feature acceptance remain unresolved; no rebuild, network-protection change or public tunnel was made for this connection diagnosis.

### Connected phone and approved server preparation

Anthony enabled/retried Local Network on the same Wi-Fi; Metro received a real iOS bundle request and he confirmed Settings opened. The exact cause of the earlier offline error was not isolated. He explicitly approved bringing the hosted test API/schema and approved-account free access forward from Phase 11. The [server handoff](phase-11-test-server.md) records its implementation, protected backup/restoration, unchanged migrations through 0013, preserved identity history, old-writer credential fencing, stable HTTPS application-staging address and passing checks. Preview protection was preserved; no loopback fixture or public bypass was deployed.

The phone's separate Metro session on 8084 now supplies the current API URL. A real account connected, and Anthony confirmed its displayed reference before a private 30-day grant was added. The access check initially rejected a verified response because its server timestamp was 25–46 ms ahead of the phone clock. The [clock follow-up](phase-11-test-server.md#phone-clock-and-real-home-follow-up) records bounded clock alignment, expiry/freshness regressions, fresh root checks and browser verification. Anthony then confirmed that real Home shows challenge cards and Home → Settings → Back returns to Home. The original deep-linked Settings history and developer preview are separate from this confirmed normal route. The existing physical development binary was reused; no additional signing/build or Git publication occurred. Phase 08 export/support/motion and the wider physical acceptance gates remain open.

## Open Phase 08 work

Under the October 14 split, Phase 08 retains confirmed deletion and credential/cache/vendor cleanup, verified retention/backup behavior, diagnostic redaction/operational dashboards, the remaining focused haptics acceptance and phase closeout. Anthony is implementing deletion. The October 12 accessibility audit and October 13 haptics notes record later phone confirmations; do not treat the earlier implementation-only checkpoints as current failures. Broader physical-device/recovery/accessibility and release checks remain Phase 11 work. Both analytics choices/event forwarding and product measurement now belong to Phase 09; final legal review/notices/publication belong to Phase 10. None of those moved requirements is dropped or marked complete. Reminders remain deferred beyond the first release; Tminus/Lance remain excluded. Feature suggestions reuse Support's private email destination with a distinct subject and no automatic private attachments.

Before publication, resolve retention and backup behavior, provider configuration, operator/contact and regional requirements, individual-versus-legal-entity App Review eligibility, age treatment and final Terms/EULA compatibility. Review the concrete policy before creating and publishing the public site. Resume commercial activation after the free beta and reconcile the policy for the paid build.

## October 11 folder organization

Anthony approved the five Settings/platform subfolders and saving the existing
feature work before moving files. Four local commits preserve the baseline:
`238f6e3` (CSV/JSON ZIP export), `1eb95af` (approved staging test access),
`fee2a29` (bounded phone/server clock alignment), and `360e348` (shared progress
and physical-phone/server handoffs). No push, PR or merge was performed.

The separate organization slice moves 19 existing files: four into
`app-support/settings/export`, five into `app-support/settings/information`,
four into `platform/export`, four into `platform/toast`, and two into
`platform/motion`. Settings retains 15 files total and platform retains 17.
Native/web pairs and their tests stay together. Imports, route re-exports, Jest
mocks and current architecture references follow their owners. Coverage discovery
and critical thresholds remain unchanged. No dependencies, route URLs, API
contracts, stored records or product behavior changed in this slice.

An initial import-normalization attempt altered the ambiguous sibling
`../calendar` reference; its original path was restored. Formatting also caught
five longer import/mock declarations; these were formatted before the final
checks. No checks or assertions were weakened.

Verification:

- `npm run check`: passed; fresh Expo Doctor 21/21, architecture, contracts build,
  all TypeScript checks, lint, formatting, 54 API unit tests, 535 mobile tests in
  67 suites, and 24 contract tests.
- `npm run test:coverage`: passed, including real loopback database integration
  tests and migration/restoration rehearsal. All existing coverage floors pass;
  mobile lines 95.90%, branches 91.28%.
- Side-panel browser: a fresh Settings render showed the Preferences, Account &
  data, Privacy, Support and About sections. Settings → Export → Account &
  recovery → disposable local account → Export ZIP downloaded a usable archive;
  inspection found `activity.csv`, `data.json` and `README.txt`, no top-level
  credential/diagnostic fields, and the expected empty activity. Returning to
  Settings worked. This used only localhost API/database fixtures. Ignored
  evidence: `.local/phase-08/folder-export-browser.png`.
- Cold web and iOS exports passed with cleared caches and one Metro worker,
  using ignored output directories. These confirm bundle resolution, not native
  UI behavior. The phone Metro server remains on 8084. Its original background
  command has closed stdin, so its keyboard reload shortcut could not be sent;
  CoreDevice also reports the phone disconnected. Anthony should reload the
  existing installed development app when connected again to clear old module
  paths. No phone data, installation or signing configuration was reset.

Physical export delivery, support drafts, motion/system accessibility, transition
frames and wider native/beta gates remain open as recorded above. This cleanup
neither closes Phase 08 nor accepts Phase 11.

### Phone reload follow-up after folder moves

Anthony reported an error while reloading the installed phone app. The owned
8084 server log reproduced `Got unexpected undefined` from Metro's
`Graph._recursivelyCommitModule` during an incremental iOS bundle. The separate
cold exports had passed, but they had not rebuilt this still-running server's
old dependency graph. Restarting that server with `--clear` resolved the observed
bundling failure; no application code, credentials, data or installed binary was
changed. The recurring folder-move guidance in `AGENTS.md` now requires that
server restart before asking the owner to reload.

Only the verified 8084 Metro process was stopped. Its replacement uses the same
LAN address, one worker, existing public staging API URL and bundle identifier.
A scoped Xcode developer path avoids the earlier CommandLineTools/simctl warning.
A recorded terminal session keeps keyboard reload available. The separate browser
and local API servers were preserved.

The running replacement server served its iOS launch bundle with HTTP 200
(11,086,791 bytes), then served the same bundle again with HTTP 200. Its fresh
build logged 2,196 modules without the previous graph error. Ignored diagnostic
artifacts are under `.local/phase-08/phone-folder-restart*`. These are development
server checks, not physical UI evidence. Anthony was asked to tap Reload/Retry;
Anthony confirmed that the installed phone app opens normally after the restart. This closes the folder-move reload follow-up with owner-reported physical-device evidence; the other feature/device acceptance gates remain open.

## October 11 direct export from Settings

Anthony approved removing the separate export page and its explanatory copy.
Settings now starts export on one tap and opens the existing iOS share sheet or
browser ZIP download. The initial Creating export… wording was replaced by the
[October 12 action-indicator refinement](#october-12-account-action-indicators):
the Export my data label remains visible alongside a progress indicator while
busy. The later feedback refinement
below makes share-sheet dismissal quiet. Inline feedback handles successful
delivery, unreadable storage and retryable failures. The row is
disabled until preparation/sharing ends. A disconnected account opens recovery;
legacy `/export-data` links redirect to Settings.

`SettingsExportRow` replaces `ExportDataScreen` within the existing export owner.
Account-change, focus-loss, duplicate-tap and temporary-file protections are
preserved. API contracts, archive contents, stored records and dependencies are
unchanged. Account/recovery UX research was explicitly moved to a separate local
project conversation; this slice does not redesign that screen. No native
rebuild, installation, signing change, Git publication or merge occurred.

Verification:

- `npm run check`: passed, including fresh online Expo Doctor, typechecks, lint,
  formatting and all workspace/architecture tests; mobile has **536 passing
  tests in 67 suites**. Component regressions cover the direct action, busy state,
  duplicate taps, results, failures/retry, account isolation, focus cancellation,
  disconnected recovery and the compatibility redirect.
- `npm run test:coverage`: passed all existing floors, including loopback
  database integration tests. Mobile lines/branches **95.91% / 91.29%**, API
  **95.01% / 90.61%**, contracts **100% / 100%**.
- `npm run test:journey -- e2e/data-export.spec.ts`: **2/2 passed** against the
  real app/API/disposable database. The first verifies 51 historical cloud rows,
  a pending device reflection and ZIP/CSV correctness while remaining on
  `/settings`; the second verifies explicit retry after a network failure.
  The command's default Xcode tools path produced its existing `simctl` warning;
  these are browser journeys, and both completed successfully.
- Cold web and iOS exports passed with `--clear --max-workers 1` and ignored
  output folders. Side-panel verification on localhost independently confirmed
  disconnected export → recovery, disposable account creation, return to
  Settings, and direct ZIP download without an export page. Archive inspection
  found `README.txt`, `activity.csv` and `data.json`, the expected empty history
  and no top-level credential/diagnostic fields. Proof and the disposable ZIP
  are under `.local/phase-08/direct-export-browser*`.
- Both owned live Metro previews were refreshed with cleared caches. The phone
  retains port 8084, the same staging API and installed development binary. The
  fresh iOS launch bundle returned HTTP 200 (11,086,020 bytes; 2,196 modules).
  Anthony reloaded the app and **confirmed that tapping Settings → Export my
  data opens the share sheet directly without a separate page**. This is
  owner-reported physical UI evidence; Save to Files/email delivery, cancellation,
  accessibility and native cleanup remain open Phase 11 checks.

After implementation, the full contents of every changed directory were
reviewed: Settings, its export owner, route wiring, e2e, and the touched docs
directories. Settings retains six direct files and export four, with tests beside
their owner. Routes remain navigation-only; the existing e2e/support and docs
responsibility groups remain usable. No additional folder moves are needed.
The `AGENTS.md` organization rule was preserved separately during implementation
and saved in local commit `501e048` at Anthony's request.

### Share sheet dismissal and error feedback

Anthony reported that dismissing the share sheet unnecessarily showed an export
cancellation message. Dismissal now resets the row quietly, with no message or
toast, and permits another export. Actual preparation/sharing failures remain
in red inline text as **“Couldn’t export your data. Please try again.”** until retry or leaving
Settings; unreadable journal storage retains its specific recovery guidance.
Starting again clears the previous feedback, so dismissing after a failed attempt
does not bring the old error back. A persistent inline error was chosen so users
can read it and retry by tapping Export my data.

Verification:

- Focused row/platform tests: **17/17 passed**. Regressions cover quiet dismissal,
  re-exporting and clearing an earlier failure on dismissal.
- Fresh `npm run check`: passed, including online Expo Doctor **21/21** and
  **537 mobile tests / 67 suites**.
- Fresh mobile coverage plus `npm run coverage:check`: passed all unchanged
  floors; mobile lines/branches remain **95.91% / 91.29%**. The combined checker
  reused the preceding unchanged API/contracts reports.
- `npm run test:journey -- e2e/data-export.spec.ts`: **2/2 passed**, including the
  updated error copy and explicit retry through the actual app/API/database.
- Side-panel verification: briefly pausing only the owned localhost API with a
  timed resume produced the real request-timeout error beneath the export row.
  After resume, tapping the row cleared the error and downloaded the ZIP. The
  phone's separate staging API was unaffected. Ignored proof:
  `.local/phase-08/export-feedback-browser-error.png`.
- Anthony repeated the flow on his iPhone and **confirmed that closing the
  share sheet leaves no cancellation message**. This closes the quiet-dismissal
  UI check; Save to Files/email delivery, accessibility and private native-file
  cleanup remain open as recorded above.

The owned browser Metro was restored after the saved journeys. The phone Metro
served the changed row through Fast Refresh; the existing development build was
reused. No new files or dependencies were needed. The full changed-directory
inventories were reviewed again; the existing export, e2e/support and docs groups
remain appropriate, with no additional folder moves.

At Anthony's subsequent request, export errors use the app's existing dark red
(`#8B1E32`); success messages retain navy. Feedback carries its severity so both
generic failures and unreadable-data guidance receive the error color. Updated
row tests pass **11/11**, fresh `npm run check` passes **537 mobile tests / 67
suites** and online Doctor **21/21**, and fresh mobile coverage plus the combined
floor check pass (unchanged API/contracts reports reused). Side-panel testing
confirmed the real timeout error in `rgb(139, 30, 50)`, followed by a successful
retry with navy `rgb(16, 44, 73)`. Ignored proof is
`.local/phase-08/export-error-red-browser.png`. The changed directory inventories
remain appropriate. Native color appearance was not separately observed; the
previous phone confirmation of quiet dismissal and remaining device gates stand.

## October 12 account and recovery UI

Anthony authorized implementing the account/recovery proposal from the separate
Mobbin research conversation, with exactly the Settings page styling. The work
remains local on `codex/phase-08-settings-privacy`; no Git publication, native
signing/build, account reset or external deployment is included.

- `/recovery` shows the connected-account hub with Account, Recovery, Devices and
  Support sections, a private-account summary and the existing Back to app path.
  Shared `components/settings/SettingsPage`, rows and icons supply the same cream
  canvas, narrow serif headings, white cards, dividers, spacing and circular Back
  control as Settings. Secondary screens have no bottom tabs.
- Recovery keys, Move to another phone and Devices open focused `/account/[tool]`
  screens using the existing controller/API. Manual Refresh account/Renew this
  session and the account reference are under Troubleshooting. Existing automatic
  foreground/session refresh is preserved rather than replaced.
- Key/device revocation retains explicit confirmation and cancellation. This
  phone is identified and self-revocation returns to recovery. Key revocation
  preserves active device sessions. Key text is selectable and hidden when the
  page loses focus or the app backgrounds; a late response cannot redisplay it
  after leaving. Transfer code editing clears its reviewed state/verification;
  only entered verification digits are sent, with pending/invalid/expired feedback
  owned by the existing controller.
- The disconnected creation/key/transfer entry and explicit recovery of another
  existing account remain available. Recovery explains uploaded-history limits;
  account switching never merges private history. Unavailable deletion/analytics,
  billing boundaries and all earlier release/device gates remain unchanged.
- The reusable row/icon files move from Settings into `components/settings/` and
  both screens use the extracted page layout. New connected-account UI lives in
  the cohesive identity/account group with its tests. All touched directories
  were reviewed in full: Settings root is smaller, identity/account keeps UI apart
  from the existing transport/vault/controller, and routes remain thin. Remaining
  directories do not need more subdivision for this change.

Verification and device review are recorded below. Full physical recovery,
Keychain/iCloud behavior, two-phone transfer, native keyboard/VoiceOver/large text
and real support-mail delivery remain release gates in Phase 11. Browser and
component checks cannot close them. Other Phase 08 work remains open.

### Verification for the account UI

- `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run check`: passed,
  with fresh online Expo Doctor **21/21**, architecture checks, type/lint/format
  checks, **544 mobile tests / 68 suites**, 54 API unit tests and 24 contract tests.
  Final run has no lint warnings; `.local/phase-08/account-check.log`.
- `npm run test:coverage`: passed all unchanged global/critical floors and the
  dedicated loopback database/migration suites. Mobile **96.41% lines / 91.58%
  branches**, API **95.01% / 90.61%**, contracts **100% / 100%**;
  `.local/phase-08/account-coverage.log`.
- Focused Settings/account checks: **29/29** passed. The final root check also
  includes transfer-code edits clearing previously entered verification digits,
  key hiding after a late response, key/device cancellation and revocation,
  session renewal, route validation and network-error retry.
- Retained actual-app/API/database journey suite: **25 passed**, with one
  self-device recovery assertion initially finding both the visible route and a
  hidden retained recovery screen. Scope the two text assertions to visible
  elements (without dropping database/HTTP/ownership/history assertions). The
  focused self-device recovery rerun **passed 1/1**, proving session refusal,
  same-account recovery and retained reflection/Progress. Evidence is split across
  `.local/phase-08/account-journeys.log` and `account-recovery-journey.log`; this
  does not claim a fresh full 26-case green invocation or hosted CI. The first
  startup attempt found the local database stopped; `npm run db:local` restored
  the existing loopback test database and preserved ignored environment files.
- Cleared-cache, one-worker web and iOS exports passed; logs and output remain
  under ignored `.local/phase-08/account-{web,ios}-export*`. Bundling is separate
  from native UI/device acceptance.
- Codex side-panel browser, disposable local account/API on 3000 and live web
  Metro on 8081: Settings → hub → each focused page, explicit account recovery,
  nested Back navigation, transfer validation and device-removal cancellation
  were observed. Reviewed at **393 × 852** and **320 × 740**; the narrow header/row
  text wraps without horizontal overflow. No browser warning/error logs appeared.
  No key was revealed, mail sent or private owner data used. Screenshot:
  `.local/phase-08/account-recovery-browser.png`; temporary viewport override reset.
- Only the owned phone Metro was restarted with `--clear`, one worker, the same
  staging API and port **8084**. Its LAN address is now **10.0.0.200**. The fresh
  iOS/Hermes bundle returns **HTTP 200 / 11,111,158 bytes**. The installed physical
  build is reused; native layout, keyboard, key-background hiding and two-phone
  transfer have not been newly observed in this slice. Owner can reload and open
  Settings → Account & recovery to review. A reload broadcast found no connected
  native app, so Anthony must reopen/connect the installed app; it was not remotely
  verified. No reinstallation or account/data reset.

The earlier phone confirmations for direct export/quiet dismissal remain valid;
this change does not close the wider Phase 08/11 acceptance gates.

### Owner phone connection follow-up

Anthony reported that the new page does not appear on his phone. The current
8084 server serves SDK 57 at `10.0.0.200:8084`, and its iOS bundle contains the new
account hub, phone-transfer label and Troubleshooting. The server's last reload
broadcast had no connected native app; CoreDevice also reports the paired iPhone
as disconnected, so no remote phone launch or screen verification is available.
The changed Mac address/stale development connection is a possible cause, not a
confirmed phone diagnosis. A fresh Expo development-client QR was generated from
the current connection URL and decoded successfully using Apple Vision. The
owner must close/reopen the installed app with that connection on the same Wi-Fi
and confirm the page. No app data, credentials, build or signing was changed.

Anthony also asked whether Support duplicates the Settings contact flow. The
recommendation is to remove that duplicate section/Get help from the connected
hub and keep Troubleshooting under Account. This is advice only in this follow-up;
the existing Support section has not yet been changed. Disconnected recovery help
should remain reachable when needed.

Anthony subsequently confirmed “it's working now” after the fresh-connection
instructions. This is owner-reported evidence that the new Account & recovery
page opens on the installed physical iPhone build. It does not establish recovery
key hiding, keyboard/VoiceOver/large-text behavior, key/device revocation,
two-phone transfer or full recovery acceptance. Support consolidation was subsequently implemented at the owner's request; see
the refinement below.

### October 12 account row alignment and support refinement

Anthony requested left alignment/padding for Recover an existing account in
Troubleshooting and removal of duplicate Get help from the connected account
hub. The recovery link now uses the same icon/label/action row as Refresh account
and Renew this session, retaining navigation and the busy guard. Troubleshooting
moves into Account and the redundant Support group is removed. Settings support
and disconnected recovery help remain available; no email/data/recovery policy
is changed.

The existing account screen tests cover the updated groups, recovery navigation
and disconnected help. The retained identity/catalog journey compares actual
rendered label positions to catch the original flush-left link. No new files or
folder moves are needed; the full account/e2e/documentation directory inventories
remain cohesive. Verification is recorded below.

Verification for the refinement:

- Focused Settings/account tests **29/29** pass. Typechecks, lint, formatting,
  architecture tests, API unit tests and contracts pass on the unchanged installed
  dependencies. Final mobile coverage run passes **544 tests / 68 suites**, with
  **96.44% lines / 91.59% branches**; all unchanged coverage floors pass. The API
  and contract coverage reports reused here are from the earlier unchanged-source
  root coverage run, rather than claimed as new backend acceptance.
- The saved actual-app/API/database identity/catalog journey passes **1/1**,
  comparing all three visible label left edges within one pixel, opening recovery
  with Enter, returning, renewing the same account and opening the real catalog.
  It waits for the enabled link/real destination after focus refresh, preserving
  the busy guard rather than racing its replacement. Log:
  `.local/phase-08/account-polish-journey.log`.
- Side-panel browser on the disposable loopback fixture: the three labels measure
  **x = 73 px** at 393 × 852. Connected Account & recovery has no duplicate Get
  help or Support header; Troubleshooting is under Account. Recovery navigation
  and nested Back were observed. Screenshot:
  `.local/phase-08/troubleshooting-aligned-browser.png`.
  Anthony subsequently required browser testing only in the side panel. Final
  verification used the Codex in-app browser, repeated the alignment/Enter/Back
  checks and restored the temporary viewport. The saved journey above predates
  this instruction; no outside-browser journey was rerun afterward.
- Browser inspection caught the replacement Pressable-only link not responding
  to Enter. Shared settings action rows now use Expo Link for destinations and
  omit the destination while disabled. Native touch navigation and true web-anchor
  semantics share one row; plain actions retain their existing button handler.
  The unrelated motion unit suite uses a scoped router mock, as the account tests
  already do; actual browser/journey navigation exercises the real router.
- Full `npm run check` currently **fails at Expo Doctor (20/21)** because fresh
  online metadata recommends six SDK 57 patches: Expo 57.0.28, Crypto 57.0.4,
  dev-client 57.0.20, router 57.0.26, splash-screen 57.0.10 and jest-expo 57.0.6.
  Installed versions/lockfile remain unchanged. The dependency gate was not
  excluded, suppressed or called passing. Track SDK patch alignment and its native
  build/device validation separately before Git publication; native signing/build
  upgrades remain outside this UI refinement. Diagnostic log:
  `.local/phase-08/account-polish-check.log`.
- Full contents of the touched account, shared settings-component, motion-test,
  journey and documentation directories were reviewed. No files were added and
  the existing responsibility groups remain appropriate. The loopback browser
  preview is restored; the separate physical-phone Metro and staging API remain
  intact. The earlier owner confirmation covers opening the base page; this
  refinement has not yet received separate physical-phone visual confirmation.

### October 12 quiet account refresh

Anthony requested that routine account checks stop showing “Connecting securely…”
when opening account items. The controller now marks accepted automatic operations
as background work while retaining the same mutual-exclusion guard, timeout,
session verification and failure handling. Focus refreshes, connected-account
foreground checks and request-driven session repair are quiet. Manual Refresh,
Retry, renewal, key and transfer actions retain their progress feedback. Successful
automatic session repair also avoids the connection-success message; failures
remain visible. Initial/disconnected connection keeps its loading feedback.

Account tools and explicit recovery distinguish background work from deliberate
actions. The shared primary button can be disabled independently of its spinner,
so transfer/recovery controls remain guarded during a quiet refresh. A focus
refresh cannot relabel an already-running manual action as background work. Key
hiding, account ownership, storage, network contracts and native dependencies are
unchanged.

Verification:

- Before the fix, the four controlled slow-focus regressions failed with the
  unwanted message visible. Afterward, **51 tests / 4 suites** pass across account
  screens, identity presentation/controller and provider integration. They cover
  all four tool pages, quiet disabled transfer controls, manual progress, an
  overlapping focus event, retained failure/retry, background session repair and
  progress-state reset. Logs: `.local/phase-08/account-quiet-before.log` and
  `.local/phase-08/account-quiet-focused.log`.
- Typechecks, lint, formatting, **180 architecture/tooling cases**, **54 API unit
  cases** and **24 contract cases** pass. Mobile coverage passes **549 cases / 68
  suites**, **96.48% lines / 91.65% branches**. The unchanged combined/critical
  coverage floors pass; API/contract coverage reports are retained from the prior
  unchanged-source coverage run. Gate log:
  `.local/phase-08/account-quiet-coverage-gate.log`. No backend change or phase
  closeout requires a new database acceptance run in this presentation slice.
- Fresh `npm run check` stops at the same **20/21 Expo Doctor** dependency check
  described above; none of the six package pins or validation rules were changed
  or excluded. Log: `.local/phase-08/account-quiet-check.log`. Native SDK patch
  alignment/build/device verification remains the separate pre-publication task.
- All interactive testing used the Codex side panel and a disposable loopback
  account. An ignored copy of the guarded fixture server delayed session checks
  by five seconds: Troubleshooting, Recovery keys, Move to another phone and
  Devices had no loading message while guarded actions were disabled. The
  transfer action had no spinner. Manual Refresh and Retry showed progress; a
  controlled 503 remained visible and retry restored the connected screen. One
  default locator wait expired before the intentional five-second response;
  subsequent inspection confirmed normal completion with no error. The standard
  fixture server was restored, and a final manual refresh succeeded. Screenshot:
  `.local/phase-08/account-quiet-browser.png`. No outside browser, saved browser
  journey, simulator or physical-phone acceptance is claimed for this slice.
- Reviewed the full contents of touched identity, account, provider, shared
  component and documentation directories. Existing responsibility groups remain
  cohesive; no new source files or additional subfolders are needed. Both Metro
  servers remain available; no installation, signing or phone data reset occurred.
  A full reload was broadcast to the owned phone Metro after the provider effect
  change, but no native app was connected at that moment. Anthony must reopen and
  fully reload the installed development app; this is not physical verification.

### October 12 account action indicators

Anthony requested an audit after Show recovery key still displayed “Connecting
securely…”. All Account & recovery manual actions now show progress on the
initiating control. A shared identity presentation hook tracks that control and
guards late completion after unmount; the existing controller remains responsible
for serialization, ownership, failure handling and deadlines. Shared Settings
action rows accept a spinner accessory and expose busy/disabled accessibility
state. Primary/text buttons retain their labels and show only their own spinner.
Key/device revocation distinguishes full IDs even if display prefixes collide.
Confirmation closes and progress remains on the originating row. Automatic
checks remain quiet; readable errors/success guidance are retained.

The audit covers:

| Action                                              | Loading presentation                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Show recovery key                                   | Spinner on the right of its row                                                                   |
| Revoke recovery key / device                        | Spinner on the selected row after confirmation                                                    |
| Refresh account / Renew this session                | Spinner on the selected row                                                                       |
| Retry connection                                    | Its row/button remains visible with a spinner while earlier error text clears                     |
| Review transfer / Approve this device               | Spinner inside only the selected primary button                                                   |
| Transfer from another device / Start a new transfer | Spinner beside only the selected text action                                                      |
| Check approval & finish                             | Spinner inside that primary button                                                                |
| Create a private/separate account                   | Spinner inside the initiating button, which remains mounted while the request is pending          |
| Create a separate empty account                     | Spinner beside that text action after confirmation                                                |
| Recover with key / saved credential                 | Spinner on the initiating primary/text button; saved credentials use their full IDs for selection |
| Initial account connection                          | Accessible indicator with no ellipsis text                                                        |
| Export my data                                      | Existing right-hand spinner, with its label preserved rather than “Creating export…”              |

Hide key, Cancel, navigation and showing recovery options are synchronous and have
no network loader. Support/legal/social/rating controls have no ellipsis loading
text to replace; their existing busy guard/failure feedback remains. Coming soon
indicates unavailable functionality, not loading. Other feature screen-loading
headings are outside this Settings/account action audit.

Verification:

- **40 focused cases / 3 suites** pass across account actions, disconnected/explicit
  recovery and export. Controlled pending requests verify every asynchronous action
  above, one correctly located indicator, steady labels, disabled duplicate actions,
  completion, manual/focus overlap, quiet background work and retained failure/retry.
  Initial test-fixture failures revealed a constant UUID collision and incomplete
  transfer response; the fixtures now use the existing randomness seam and valid
  public contracts. A missing async `act` import was repaired; final tests release
  all pending requests and exit without unexpected warnings. Log:
  `.local/phase-08/account-indicators-focused.log`.
- Typechecks, lint, formatting, **180 architecture cases**, **54 API unit cases**
  and **24 contract cases** pass. Mobile coverage passes **561 cases / 68 suites**,
  **96.92% lines / 91.76% branches**. Combined/critical floors are unchanged and
  pass; unchanged API/contracts coverage reports are retained from the preceding
  run. Gate log: `.local/phase-08/account-indicators-coverage-gate.log`.
- Fresh `npm run check` still stops at the same six online Expo patch mismatches,
  **20/21 Doctor checks**. No dependency pins or validation exclusions changed.
  Log: `.local/phase-08/account-indicators-check.log`. The pre-publication SDK
  patch/native-build acceptance task remains open.
- Interactive verification used only the Codex side panel with disposable loopback
  accounts. An ignored copy of the guarded fixture delayed selected requests by
  two/five seconds. Creation, Show key, key revocation, Refresh, Renew, Retry,
  transfer start/restart/review/approval/completion, device revocation and export
  each displayed one correctly labeled indicator. A controlled 503 cleared the
  refresh indicator and showed a readable error; retry stayed mounted, spun and
  restored the account. One tool wait ended before its intentional five-second
  response; subsequent inspection confirmed completion. Transfer tests used two
  in-panel tabs and masked synthetic inputs; the temporary tab was closed. Key
  display was hidden before continuing; the saved image captures only its pending
  request. Screenshot: `.local/phase-08/account-action-spinner.png`.
- Restored the standard loopback fixture server and retained the owned web/phone
  Metro servers. No native rebuild, installation, device reset, saved browser
  journey or physical/VoiceOver acceptance is claimed in this slice.
- Reviewed full contents of the changed identity (ten root files), account (eight),
  export (four), shared UI/settings and documentation directories. The new hook
  belongs with identity presentation; existing responsibility groups remain
  navigable, so no further folder moves are needed. The folder/architecture guides
  reflect its ownership and steady-label export behavior.
  The phone Metro reload broadcast reported no connected app; the owner must
  reopen/reload the installed development app to review these indicators. The
  broadcast does not establish native UI acceptance.

### October 12 footer cleanup and local commits

Anthony requested appropriate local commits for the existing work and removal of
redundant footer items. The explicit `/account/recover` form no longer offers Get
help; main Settings Support remains the routine contact destination. Disconnected
Account & recovery retains its existing direct help/retry for connection failures.
The identity privacy tagline is removed. Settings ends after About, without the
JustGO/version/free-test branding or Preview app screens link. Removing that
footer also removes Settings' unused version/access subscriptions and styles;
the actual build version and guarded developer preview route are unchanged.

The previously verified source was saved before this cleanup:

- `2f8c21c` — `refactor(settings): share row and icon components`: exact moves of
  the two existing components, import-aware caller rewrites and folder guidance.
  Behavior additions remain in the following commit.
- `b42b999` — `feat(account): add focused recovery screens and action indicators`:
  shared layout, account/recovery screens, quiet automatic checks, action spinners,
  export's steady label, tests/journey wiring and actual verification/handoffs.
- The footer refinement is a separate local commit,
  `fix(settings): remove redundant recovery and settings footers`.

All commits are on `codex/phase-08-settings-privacy`. Anthony authorized local
commits; no push, PR, merge, native build or release submission is included.

Verification:

- Three removal regressions fail against the preceding UI, then **46 focused
  cases / 3 suites** pass after the cleanup. They verify that the recovery help
  and tagline are absent, Settings has no version/test/preview footer even with
  development/free-test metadata available, and the original Support/contact and
  recovery controls remain usable. Logs: `.local/phase-08/footer-cleanup-before.log`
  and `.local/phase-08/footer-cleanup-focused.log`.
- Typechecks, lint, formatting, **180 architecture/tooling cases**, **54 API unit
  cases** and **24 contract cases** pass. Mobile coverage passes **561 cases / 68
  suites**, **96.92% lines / 91.79% branches**. Unchanged combined/critical floors
  pass; unchanged API/contracts coverage reports are retained from their preceding
  run. Gate: `.local/phase-08/footer-cleanup-coverage-gate.log`.
- Fresh `npm run check` still stops at the same **20/21 Expo Doctor** result and
  six SDK patch recommendations. No pins, exclusions or validation rules changed;
  the separate patch/native validation task remains open. Log:
  `.local/phase-08/footer-cleanup-check.log`.
- Only the Codex side panel was used for interactive verification. A fully
  reloaded runtime and disposable loopback account open Settings → Account &
  recovery → Recovery keys → Recover an existing account. The form ends after
  recovery options, with no help/tagline; Back navigation works. Settings scrolls
  to Terms of use, with no version/test/preview text below About, and its two
  Support actions remain visible. Screenshots:
  `.local/phase-08/recovery-footer-removed.png` and
  `.local/phase-08/settings-footer-removed.png`. No new native/physical/VoiceOver
  acceptance, saved browser journey or database acceptance is claimed.
- Reviewed full contents of touched identity, account, Settings and documentation
  directories. This slice adds no files; the established responsibility groups
  remain navigable and no further subfolders are needed. Owned development servers
  and phone data remain intact; routine screenshots are ignored local evidence.

### October 12 account back-link removal

Anthony requested removing the bottom Back to app link from Account & recovery.
The connected hub and disconnected route now end after their existing controls.
The shared header Back behavior is unchanged: use navigation history when
available, otherwise return to Settings. The disconnected route no longer needs
an extra footer/safe-area wrapper. Support and recovery actions remain available.

Verification:

- Both removal assertions fail against the preceding UI, then all **19 account
  screen cases** pass. The existing connected Back/history test and disconnected
  fallback assertion verify that header navigation remains available. Logs:
  `.local/phase-08/account-back-link-before.log` and
  `.local/phase-08/account-back-link-focused.log`.
- Contract build, all typechecks (including saved journeys), lint and formatting
  pass. Tests pass: **180 architecture/tooling, 54 API unit, 561 mobile and 24
  contract cases**. Test log: `.local/phase-08/account-back-link-tests.log`.
  Fresh mobile coverage passes **68 suites**, with **96.92% lines**; the unchanged
  combined/critical coverage gate passes using the retained API/contracts reports
  for their unchanged source. Logs: `.local/phase-08/account-back-link-coverage.log`
  and `.local/phase-08/account-back-link-coverage-gate.log`.
- Fresh `npm run check` still stops at the existing **20/21 Expo Doctor** result
  for the same six SDK patch updates. Dependency validation stays enabled; native
  dependency maintenance remains a separate task before publication. Log:
  `.local/phase-08/account-back-link-check.log`.
- Interactive verification used only the Codex side panel and disposable loopback
  state. The connected page has no bottom link; header Back returns to Settings,
  then Home. A fresh disconnected runtime also has no link and its header Back
  returns to Settings. Screenshot: `.local/phase-08/account-back-link-removed.png`.
  Saved journey callers now use header navigation rather than the removed link;
  their source was typechecked, but those CLI journeys were not rerun under the
  owner's side-panel-only preference. No new phone, native, VoiceOver or database
  acceptance is claimed.
- Reviewed full contents of the account, route, journey/support and documentation
  directories touched by this slice. Account screens remain together, routes are
  thin, and the four journey helpers remain a small cohesive support group. No
  additional folder split is needed. Anthony subsequently authorized a local
  commit for this refinement: `fix(account): remove bottom back-to-app shortcut`.
  No push, PR or merge is authorized; physical feature acceptance remains open.

### October 12 accessibility audit

Anthony reported that phone checklist items 1–4 (latest account UI, export,
motion and support) work, and that recovery/transfer is fine. These are
owner-reported results; the individual revocation/key/transfer scenarios were
not enumerated. He then requested agent checks for larger text and control
labels. This is a testing-only follow-up, with no product-code changes or new
native build.

**Evidence:**

- `npm run test -w @justgo/mobile -- --runTestsByPath
src/app-support/settings/SettingsScreen.test.tsx
src/app-support/identity/account/AccountScreens.test.tsx
src/app-support/identity/IdentityScreen.test.tsx`: **46 cases / 3 suites pass**.
  Log: `.local/phase-08/accessibility-focused.log`. These are component/controller
  tests, not native VoiceOver or large-text acceptance.
- Only the Codex side panel was used for interactive checks. The current web
  bundle exposes named links/buttons for the account hub, recovery-key controls,
  transfer input/action, device revocation, Troubleshooting and explicit recovery.
  Settings exposes a labeled Reduce motion switch and honest unavailable rows.
  Keyboard focus progresses from Back through Reduce motion, Account & recovery,
  Export my data, Get help, Suggest a feature and Terms of use, skipping unavailable
  controls. The explicit recovery field is labeled Recovery key, uses a password
  input and is reachable with Tab. No support email was sent and no recovery key
  was revealed. Local evidence: `.local/phase-08/accessibility-browser-settings-labels.txt`.
- The existing JustGO Phase 7.2 QA / iPhone 17 / iOS 26.5 simulator was booted and
  mirrored through `serve-sim` in the side panel. XcodeBuildMCP discovery could not
  find `simctl` under the machine's default tools path; command-scoped
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` used the installed
  Xcode without changing global configuration. The installed native app reused
  the existing web Metro's iOS bundle and loopback fixture API. A separate empty
  disposable QA account connected after the earlier credential was unavailable;
  previous recovery credentials were retained. The phone server/staging account
  and other running servers were not changed.
- Native accessibility inspection confirms Settings headings, named account
  navigation, export/support/legal buttons, the motion switch and unavailable
  labels. Fresh transfer inspection confirms Back, page/group headings, Transfer
  code as a text field and Review transfer as a button. Inspector results must
  match the live frame: the helper briefly returned no data and an older Settings
  tree before the fresh app launch. Only matching snapshots are evidence. Files:
  `.local/phase-08/accessibility-native-settings-labels.txt` and
  `.local/phase-08/accessibility-native-transfer-labels.txt`.
- The native `accessibility-extra-extra-extra-large` category was confirmed with
  `simctl ui ... content_size`. Settings and Recovery keys reflow and their lower
  actions are reachable with scrolling. The transfer form was also inspected
  at `accessibility-large` after a full native reload. These are real simulator
  layouts, not CSS zoom or mock text sizes.

**Audit findings — resolved by the subsequent large-text follow-up below:**

1. At the maximum size, Settings and Recovery keys titles split within words,
   and long section headings can leave a single letter on another line. The
   header's reserved side columns reduce the available title width. Improve the
   large-text layout and recheck before marking it accepted.
2. The fixed-width Coming soon accessory becomes a narrow column with words
   broken across several lines. Adapt unavailable-row layout for large text
   while retaining the availability information.
3. Changing text size live from the largest category to `accessibility-large`
   left excess blank space in the transfer heading, explanatory card and button.
   A full native reload at the same category produced the expected compact
   measurements. Live font-size changes need investigation and retesting; no
   cause or code fix is claimed by this audit.

Screenshots: `.local/phase-08/accessibility-settings-largest.png`,
`.local/phase-08/accessibility-keys-largest.png`,
`.local/phase-08/accessibility-transfer-large.png` and
`.local/phase-08/accessibility-transfer-large-fresh.png`.
At this audit checkpoint, these findings kept the large-text gate open; the
subsequent implementation below resolves all three. Actual iPhone VoiceOver speech, focus, gestures and
full journeys remain a physical-device check. Browser keyboard checks and native
label inspection do not replace that check. The prior Expo dependency requirement
also remains open; no dependency-validation bypass was introduced.

The simulator's original `large` text category and Shutdown state were restored,
and the task-owned mirror/helper was stopped after testing. Routine evidence
remains ignored under `.local/`. The full contents of touched docs/handoffs and
docs directories remain cohesive with the existing phase index; no new files or
folder moves were needed. This records results, not a phase closeout or Git
publication.

### October 12 large-text fixes

Anthony authorized fixing the audit findings and repeating visual checks until
the layouts work. All three findings above are resolved in this follow-up:

- Enlarged Settings/account headers put Back above a full-width title instead
  of reserving side columns. Serif headings and action labels grow up to 2×;
  body descriptions retain the full selected system scale. Narrow-screen titles
  use a smaller base size. No text is truncated to hide the wrapping problem.
- Unavailable rows place Coming soon below their label at enlarged sizes, with
  no fixed narrow status column. Icons, chevrons and switches align with the
  first line; normal-size layout remains unchanged.
- Shared `components/typography/ScaledText` updates explicit font size and line
  height together from live `useWindowDimensions().fontScale`. Native Text does
  not apply the scale a second time. Metrics are memoized by style/effective
  scale; unrelated width changes reuse them. Account descriptions and shared
  action controls use this boundary without remounting forms or pending work.
  Native TextInputs retain their original platform scaling and styles; shorter
  Recovery key, Transfer code and Six digits placeholders avoid tiny native
  placeholder text at enlarged sizes.

Interactive evidence:

- Only the Codex side panel was used. The existing signed simulator client on
  JustGO Phase 7.2 QA / iPhone 17 / iOS 26.5 loaded current source from the owned
  Metro and disposable loopback API. No new binary, installation, signing or
  owner-phone/staging change was needed. No recovery key was revealed, account
  transfer/revocation submitted or support email sent during visual inspection.
- `simctl ui ... content_size` confirmed the maximum
  `accessibility-extra-extra-extra-large` setting. Settings, Account & recovery,
  Troubleshooting, Recovery keys, Recover an account, Devices and Move to another
  phone have readable headings, rows and descriptions; lower controls remain
  reachable by scrolling. Troubleshooting fits as a whole word. Transfer fields
  and buttons remain visible/reachable at maximum size.
- In the same mounted native app, maximum → accessibility-large → maximum →
  normal `large` changes reflow descriptions, cards and buttons immediately.
  The previous leftover blank spacing is gone without reloading. Normal header
  and row layouts return correctly. Native inspection corroborates control
  labels/roles; actual VoiceOver speech and gestures are not claimed.
- A fully reloaded web Settings screen also passes a 320 × 568 viewport check
  and exposes the existing names, roles and unavailable states. Browser labels
  and keyboard navigation from the audit remain separate from native evidence.
  The temporary browser viewport was restored.
- Ignored proof: `.local/phase-08/accessibility-fixed-settings-largest.png`,
  `accessibility-fixed-settings-about-largest.png`,
  `accessibility-fixed-account-largest.png`,
  `accessibility-fixed-troubleshooting-largest.png`,
  `accessibility-fixed-keys-largest.png`,
  `accessibility-fixed-recovery-largest.png`,
  `accessibility-fixed-devices-largest.png`,
  `accessibility-fixed-transfer-live-largest.png`,
  `accessibility-fixed-transfer-live-large.png`,
  `accessibility-fixed-transfer-normal.png` and
  `accessibility-fix-browser-320.png`, all under `.local/phase-08/`.

Automated verification:

- **67 focused cases / 6 suites** pass for shared typography/layout, Settings,
  account screens, disconnected recovery, external links and export. Regressions
  cover live font/line-height updates, the full-width header/status layout,
  stable metrics during unrelated dimension changes and preservation of pending
  buttons. The actual account-screen regression also retains typed transfer
  input and its enabled action after changing system scale. This input-retention
  assertion is component evidence, not a native typing/VoiceOver claim. Log:
  `.local/phase-08/accessibility-fix-focused.log`.
- Contract build, all typechecks (including saved journeys), lint and formatting
  pass. Full tests pass: **180 architecture/tooling, 54 API unit, 567 mobile / 69
  suites and 24 contract cases**. Logs:
  `.local/phase-08/accessibility-fix-other-checks.log` and
  `.local/phase-08/accessibility-fix-final-tests.log`. An unused test import and
  formatting issue were corrected before final validation. Test assertions use
  boolean identity checks instead of serializing cyclic renderer instances;
  no heap setting, assertion, warning or quality threshold was weakened.
- Fresh mobile coverage passes with **96.93% lines / 91.85% branches**. Unchanged
  combined/critical floors pass, reusing API/contracts coverage reports for their
  unchanged source. Logs: `.local/phase-08/accessibility-fix-coverage.log` and
  `.local/phase-08/accessibility-fix-coverage-gate.log`. No database, migration or
  hosted CI pass is claimed for this mobile-only slice.
  Shared typography/page/rows have 100% line coverage. Remaining branches are
  the private helper's unused default argument, a press-opacity style callback
  and an existing action callback variant; live resizing, caps and status-layout
  branches are exercised. No coverage exclusion was added.
- Fresh `npm run check` still stops at **20/21 Expo Doctor** checks, recommending
  six existing patch updates: Expo 57.0.28, crypto 57.0.4, dev-client 57.0.20,
  router 57.0.26, splash-screen 57.0.10 and jest-expo 57.0.6. Dependency validation
  remains enabled and no pins/exclusions were changed. The remaining constituent
  commands were run explicitly as recorded above; the root check is not reported
  as green. Log: `.local/phase-08/accessibility-fix-check.log`.

Reviewed the full contents of every changed directory: shared components,
settings/typography, identity/account, Settings/export and documentation. The
two-file typography responsibility has its own subfolder and colocated tests;
the existing groups remain navigable, so no additional moves are needed.
Restored the simulator's original `large` category and Shutdown state, closed
the temporary mirror tab and stopped only the task-owned helper. The existing
web, phone and API servers remain running. Actual physical-iPhone VoiceOver and
the existing dependency/native maintenance requirement remain open. This is an
accessibility fix, not Phase 08 closeout or Git publication.

## October 14 second review preparation

Anthony confirmed that PR #22 was merged and authorized updating local main,
archiving the foundation review checkout, and publishing review 2. Local `main`
now matches `348671f`. The completed foundation worktree was archived with its
merged review history preserved. Work continues in the separate
`phase8-pr2-review` worktree on `phase8-02-data-export-test-access`; the original
Phase 08 checkout, its uncommitted work and the later review branches were not
changed.

The second checkpoint incorporates current main, preserving PR #22's Expo patch
alignment, Progress test correction, CI artifact guard and reviewed guidance.
Manifest/lockfile conflicts retain the reviewed versions plus this slice's
`expo-file-system` and `fflate` dependencies. Documentation conflicts retain
both reviews' scope and evidence. No export, access or other product behavior
was changed while preparing this review. No source files were added or moved
during preparation, so no additional folder reorganization was needed.

Fresh local validation of the integrated candidate:

- `npm ci`: **pass**, including manifest/lockfile consistency.
- `npm run check`: **pass**, online Expo Doctor **21/21**, contracts build,
  TypeScript, ESLint, Prettier, **186 tooling**, **54 API**, **535 mobile** and
  **24 contract** tests.
- `npm run test:db`: **pass**, **55 tests across seven suites** against the
  dedicated loopback `justgo_test` database, plus the migration/restoration
  rehearsal. Only disposable local configuration was copied to the worktree;
  no hosted database or account was changed.
- `npm run test:coverage`: **pass**, all unchanged workspace and critical-file
  floors. This includes the authenticated export, beta-access and clock bounds.
- `npm run test:journey -- e2e/data-export.spec.ts`: **blocked**, the existing
  preview occupies port 8081. The command completed the guarded local migration
  but Playwright refused to reuse the existing preview. That server was left
  running; no saved journey pass or fresh interactive/browser/native acceptance
  is claimed. The authorized PR's hosted CI must run the clean fixture suite.

This review contains the initial export screen; the later direct Settings share
action and account/recovery refinements remain in review 3, with haptics and
subsequent polish in review 4. Existing native build/device acceptance, broader
beta/paid-launch gates, deletion, analytics and legal publication remain open.
Local passing checks do not establish hosted success or authorize merging.

## October 14 third review preparation

Anthony merged PR #23 and requested the next review. Local `main` now matches
`222d65b`; the completed export review worktree is archived. The separate
`phase8-pr3-review` worktree prepares `phase8-03-account-recovery-accessibility`
from its original `be4a191` checkpoint, incorporating current main without
rewriting history or touching the original checkout's ongoing working files.
The final haptics/performance branch remains unchanged.

The 78-file review retains the Settings-style account hub and focused tools,
direct export with quiet sharing dismissal and red errors, deliberate-action
indicators, footer cleanup, large-text fixes and responsibility-based folder
organization. PR #22's dependency/CI/Progress-test corrections and PR #23's
preparation evidence are preserved. Only documentation needed conflict
resolution; the manifest and lockfile match current main. No product behavior
was changed during this integration.

Fresh local validation:

- Clean `npm ci`: **pass**.
- `npm run check`: **pass**, fresh online Expo Doctor **21/21**, contracts build,
  TypeScript, ESLint, Prettier, **186 tooling**, **54 API**, **567 mobile across
  69 suites** and **24 contract** tests.
- `npm run test:coverage`: **pass**, all unchanged workspace and critical-file
  floors, including the database suites and migration/restoration rehearsal
  against dedicated loopback `justgo_test`. No hosted database was changed.
- Cold `npm run export:web -w @justgo/mobile` and
  `npm run export:ios -w @justgo/mobile`: **pass**, exercising the moved imports
  and assets in this exact checkout. These are JavaScript bundle checks, not a
  native build or device acceptance.
- Saved browser journeys were **not rerun locally**: the existing preview still
  occupies required port 8081 and was left running. Hosted CI must verify the
  clean fixture suite for the published head. No fresh interactive/browser/native
  acceptance is claimed by this publication task; prior evidence remains in the
  individual feature sections above.

Reviewed the contents of the changed directories. Account tools, shared
Settings/typography, Settings export/information and platform adapter groups
remain cohesive, with tests and native/web pairs beside their owners. The
import-only changes did not grow the other feature directories; no further
folder moves were needed for preparation. Logs remain ignored under
`.local/phase-08/pr3-*` in the original checkout.

Haptics, later animation/performance polish and the reflection keyboard follow-up
remain in review 4. Ongoing transfer/planning edits are excluded. Existing
physical-device, VoiceOver, dependency-native acceptance, privacy and beta/paid
release gates remain open. Local results do not establish hosted success or
authorize merging.

## October 14 PR #24 journey timing fix

Anthony requested investigating and fixing the failed Foundation check on
PR #24 at `e1b0c63`. The [pull-request run](https://github.com/anthonyyoo24/justgo/actions/runs/38645444025/job/116131020069)
passed dependency validation, types/lint/format, units, database tests and
coverage, then failed `identity-catalog.spec.ts` at its immediate non-null
bounding-box assertion. The other 25 saved journeys passed. Both exports were
skipped after the journey failure; the [same-head push run](https://github.com/anthonyyoo24/justgo/actions/runs/38645426588/job/116130960479)
passed. The masked CI screenshot shows all three labels present and aligned
after the failed measurement.

The test read geometry immediately after entering Troubleshooting. Navigation
and the automatic account refresh can change row visibility/identity between
locating text and measuring it; the recovery row gains its real Link when the
busy guard clears. A one-frame `null` measurement incorrectly failed the journey
before checking whether the controls were usable. Local repetition reproduced
the identical failure in **8 of 10** unmodified runs.

The corrected journey first awaits the enabled recovery link and its actual
destination, then polls fresh boxes for all three labels. Any missing box keeps
the assertion failing. Once all exist, the maximum left-edge spread must remain
below the original one-pixel limit. Recovery keyboard navigation, session renewal,
catalog/Progress and zero-activity database assertions are retained. The existing
test/expect timeouts, zero whole-test retries and coverage floors are unchanged.
App/CI configuration is unchanged; the recurring layout-read lesson is recorded
in `AGENTS.md`.

Local verification uses an ignored runner on web port **8093** to preserve the
existing preview on 8081. It temporarily aligns only the test-app URL, Metro
port, fixture CORS and network probe; API port 3000, loopback/test-database/role
guards and registry-owned cleanup remain enabled. Every temporary file change
is restored byte-for-byte in `finally` before final checks. The initial full
run passed 25 journeys but its network probe still targeted the existing 8081
preview; the temporary port override was corrected to probe its own 8093
fixture without disabling that assertion.

The fixed focused journey passes **10/10 repeated runs**, and the final complete
saved suite passes **26/26**, including network and cleanup isolation. Final
`npm run check` **passes**, with fresh online Expo Doctor **21/21**, contracts
build, TypeScript, lint, formatting, **186 tooling**, **54 API**, **567 mobile**
and **24 contract** tests. The temporary fixture changes are absent from the
final diff, and only the test and its guidance/evidence are retained. Existing
CI database/coverage results remain as recorded above; no separate coverage,
native or device rerun is claimed for this test-only fix. Logs, downloaded
masked CI evidence and the temporary runner remain ignored under
`.local/pr24-ci-fix/` in the original checkout. No product UI/native change,
native build or new device acceptance is included in this test-only correction.
Publication and hosted verification remain pending at this preparation checkpoint.

Changed-directory review covers the root, `e2e`, `docs` and `docs/handoffs`.
No files were added; existing fixture-support and documentation groups remain
appropriate, so no folder moves were necessary. Task-owned API/Metro services
were shut down, and the original preview and original checkout's working files
were preserved. Final Markdown formatting and diff checks pass.

### October 12 day-sheet performance integration

Anthony authorized merging `codex/day-sheet-performance` into this Phase 08
branch. The [integration record](day-sheet-performance.md#phase-08-integration--october-12)
owns combined verification and the seven conflict resolutions. Both original
performance/organization commits are retained, together with the current
Settings/account accessibility fixes. This merge does not close Phase 08's
remaining deletion, analytics, legal publication or physical acceptance work.

### October 12 haptics implementation

Anthony requested moving haptics implementation and its phone testing back from
Phase 11 to Phase 08, then implementing it. The earlier October 10 scheduling
note is historical and superseded. Phase 08 keeps physical acceptance open until
actual feedback is tested and any corrections are retested; Phase 11 only
rechecks the accepted behavior on its beta/release build.

Implemented:

- Pinned `expo-haptics` 57.0.3, the SDK 57 recommended version, in the mobile
  package and root lockfile. Its SDK/native module uses an optional import;
  current development binaries without ExpoHaptics can still load the app.
  Availability checks prevent method calls on a missing module. Web uses a
  quiet adapter, without browser vibration or permissions.
- `platform/haptics/` owns the preference/provider/context and adapters. The
  root provider sits outside account/access guards. The installation-level
  `justgo:haptics:v1` boolean defaults on, persists independently of accounts
  and paid access, and stays quiet while hydrating or saving. Invalid/unreadable
  values fail quiet with retryable inline feedback. A failed write preserves
  the previous choice. Duplicate writes are guarded synchronously.
- Settings replaces Coming soon with a labeled Haptics switch. Successful
  enabling gives a selection preview; disabling is quiet. Missing native
  capability is explained honestly. Storage failures use the existing red
  inline error color. Reduce Motion remains a separate preference.
- Accepted challenge state gives one light impact; an accepted completion gives
  one success notification, coalesced across concurrent/repeated Completed taps.
  Failed completion does not celebrate and a later accepted retry does. Feeling
  selection/clearing gives a selection tick only after the controller accepts a
  changed value. No feeling code, reflection text or account data reaches the
  adapter. There is no startup, navigation, synchronization or automatic retry
  feedback. The native adapter only plays in an active iPhone app; iOS can
  suppress feedback for system settings/Low Power Mode/camera/dictation.
- Optional feedback runs independently of product work. Both synchronous and
  asynchronous native failures are contained. A generation/preference check
  fences events after disabling, starting a preference write or unmounting;
  callbacks stay stable across preference changes. Challenge lifecycle guards
  prevent late feedback after leaving the account flow.
- ZIP JSON includes the current saved Haptics choice alongside Reduce Motion.
  Export waits for preference hydration/writes before capturing it. CSV/history,
  owner isolation, cancellation and private-file handling are unchanged. The
  data inventory and policy draft reflect local-only storage; no server schema,
  analytics event, vendor configuration or billing activation was introduced.

Interactive verification used only the Codex side panel and disposable loopback
state. A fully reloaded Settings screen exposes a usable labeled switch. Turned
it off, fully reloaded, confirmed it remains off, then restored on. Keyboard
Space also toggles the focused switch; the restored choice survives another full
reload. Export is enabled after preference hydration. No error or layout issue
appeared. Browser feedback remains quiet. Ignored proof:
`.local/phase-08/haptics-settings-browser.png`. These checks establish browser
UI/persistence, not iPhone vibration or native build acceptance.

Automated verification:

- **77 focused cases / 8 suites** pass for native/web adapters, preference/row,
  actual Settings, accepted challenge actions, reflection selections and ZIP
  collection/delivery. Tests exercise saved off/on/default/corrupt values, slow
  hydration, read/write failures and retry, duplicate writes/taps, suppressed
  feedback, synchronous/asynchronous SDK failure, missing native capability,
  background/inactive app state and delayed callbacks after unmount. The controller
  completion failure test uses its repository seam; existing storage fallback
  behavior is preserved. Log: `.local/phase-08/haptics-focused.log`.
- Two subsequent export regressions keep export disabled through preference
  hydration/writes and confirm the real ZIP contains the current Haptics value.
  Final mobile coverage passes **596 cases / 72 suites**, **97.07% lines / 91.87%
  branches**. Haptics adapters, provider, context and row have 100% line coverage;
  adapter branches are 100%, provider branches 90.56%. Remaining provider branches
  include default dependencies (exercised in the real browser) and additional
  lifecycle-fence combinations; no coverage exclusion or threshold change was
  added. Existing combined/critical floors pass using retained API/contracts
  reports for unchanged source. Logs: `.local/phase-08/haptics-final-coverage.log`
  and `.local/phase-08/haptics-final-coverage-gate.log`.
- Contract build, workspace/journey types, lint and formatting pass. The full
  workspace test run before the final two export regressions passes **180
  architecture/tooling, 54 API unit, 594 mobile and 24 contract cases**; final
  mobile coverage includes those two new cases. Logs:
  `.local/phase-08/haptics-other-checks.log` and
  `.local/phase-08/haptics-final-checks.log`. No database, migration, saved browser
  journey or hosted CI pass is claimed for this mobile-only slice.
- Cold web and Hermes iOS exports pass with `--clear --max-workers 1`, producing
  ignored `.local/phase-08/haptics-web` and `haptics-ios` output. Logs:
  `.local/phase-08/haptics-web-export.log` and `haptics-ios-export.log`.
  An iOS JavaScript bundle is not a new signed binary or tactile evidence.
- Fresh `npm run check` remains blocked by **20/21 Expo Doctor**, recommending
  the same six pre-existing SDK patch updates. The newly pinned haptics version
  passes dependency compatibility; no version exclusion or validation bypass was
  added. The other constituent commands were run separately as recorded above.
  Log: `.local/phase-08/haptics-check.log`. Native dependency alignment/build and
  device acceptance remain the next separate native-build workflow.

Reference: [Expo SDK 57 Haptics](https://docs.expo.dev/versions/v57.0.0/sdk/haptics/)
and the installed pinned module's optional-import implementation. The initial
test harness needed the existing router stub/property replacement conventions;
using the SDK's verified optional import also avoids a needless dynamic-import
Jest/runtime setup. No warning, assertion, heap setting or test configuration was
weakened to pass these checks.

Native/physical acceptance is still open:

- The installed phone development binary predates this native dependency.
  Prepare an updated signed development build through the separate authorized
  native-build/signing workflow, preserve the account and reconnect to current
  Metro. JavaScript reload alone cannot add ExpoHaptics to that binary.
- On Anthony's physical iPhone, verify light Accept, success Completed, feeling
  selection/clearing and the enable preview. Check first/repeated actions, the
  timing/strength/feel, off through relaunch, restoring on, account changes and
  independence from Reduce Motion. Check normal mode first; missing vibration
  during Low Power Mode or disabled system haptics is allowed system behavior.
  Product actions/saving must still work. Correct issues and repeat before
  marking this Phase 08 item accepted.
- A mock or simulator cannot establish tactile feel. No new EAS build/upload,
  signing change, installation, phone test or Git publication is claimed here.

Reviewed the full contents of all changed directories, including root/mobile
manifests, routes, Settings/export, Challenges, Reflections, the new haptics
family and documentation groups. Settings has six direct files and existing
export/information groups; haptics adapters/tests already form their own folder.
No challenge files were added; the existing 35-file feature's broader split
remains the previously documented separate mobile cleanup work, avoiding
conflicting duplicate moves. Other reviewed groups remain cohesive. Existing
phone/web/API servers and phone account data are preserved.

### October 12 updated physical development build

Anthony explicitly authorized preparing the updated iPhone development build
for native haptics. This is the separate native-build step requested after the
implementation checkpoint; it authorizes the internal development build, not
Git publication, TestFlight distribution or store submission.

Build preparation:

- Fresh Expo Doctor initially repeated the six SDK patch recommendations.
  Updated exact pins to Expo 57.0.28, crypto 57.0.4, dev-client 57.0.20, router
  57.0.26, splash-screen 57.0.10 and jest-expo 57.0.6, retaining haptics 57.0.3.
  Root lockfile includes the resulting Expo/router transitive updates. No SDK
  major, React Native, app identifier, iOS minimum or Keychain code change.
- Fresh `npm run check` now **passes**, including **21/21 Expo Doctor**, contract
  build, all workspace/journey types, lint/format and **180 tooling, 54 API unit,
  596 mobile and 24 contract cases**. Fresh mobile coverage passes **72 suites**,
  **97.07% lines / 91.87% branches**, and unchanged combined/critical floors pass
  using retained API/contracts reports for their unchanged source. Logs:
  `.local/phase-08/haptics-build-check.log`, `haptics-build-coverage.log` and
  `haptics-build-coverage-gate.log`. Fresh pre-dispatch Doctor also passes:
  `haptics-build-doctor-dispatch.log`. The earlier Doctor blocker is resolved
  for these pinned packages; hosted CI and physical acceptance remain separate.
- Reused the linked Expo project, `development` internal distribution profile,
  bundle `com.anthonyyoo.justgo`, Apple team `NPDYTJS425`, existing certificate
  and active ad hoc profile containing Anthony's already registered iPhone.
  `--freeze-credentials --non-interactive` prevents signing changes; no device
  registration or Apple account/password input was needed.
- The project's development environment already had the correct bundle ID but
  lacked an API URL. Added the public `EXPO_PUBLIC_API_URL` pointing to the
  existing healthy application-staging route `https://justgo-two.vercel.app`.
  No hosting/database/protection or account/test-grant configuration changed.
- Inspected the EAS archive before upload: current haptics/provider/action source,
  SDK pins, contracts and native Keychain module present; local env/credential
  files, caches and generated iOS output absent. EAS's generated shallow Git
  metadata has no credential-bearing remote. Selected source/lockfile hashes
  match the working tree. Audit: `haptics-build-source-audit.json` in ignored
  `.local/phase-08/`. The displayed Git base is `a7770a0` with uncommitted work;
  the cloud build includes the inspected working-tree haptics/pin changes.
- Submitted EAS build **e48faabd-d7e2-4b6e-ac34-e08d9087fce9**, iOS internal
  development, version 0.1.0 (1), fingerprint `9e8a73ea057b1ed3d2bc4568baa6975cadd199a2`.
  [Build page](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/e48faabd-d7e2-4b6e-ac34-e08d9087fce9)
  is open in the Codex side panel. Compilation succeeded; signed artifact
  verification is recorded below. Installation/physical acceptance remain open.
- Restarted only the owned phone/web Metro services with cleared caches and the
  patched dependencies. Phone remains on LAN 10.0.0.200:8084 with the existing
  HTTPS staging API; web remains on loopback 8081 with the unchanged local API.
  Side-panel Settings renders, toggles Haptics and retains the saved choice after
  full reload. Existing API service and native account/history remain intact.

Build result and delivery:

- EAS reports **FINISHED / Succeeded** for `e48faabd-d7e2-4b6e-ac34-e08d9087fce9`;
  the side-panel build page also shows success and its iPhone installation modal.
  The build took 6m 15s total. Downloaded its 29,979,101-byte IPA and validated
  archive paths before extraction. Ignored metadata/artifact evidence:
  `haptics-device-build-complete.json`, `haptics-device-build.ipa` and
  `haptics-device-artifact-audit.json` under `.local/phase-08/`.
- `codesign --verify --deep --strict` passes for the full extracted app bundle;
  its signature/designated requirement is valid. Displayed XML entitlements and
  decoded provisioning confirm the existing team/application identifier,
  unexpired profile and Anthony's already registered iPhone. Bundle remains
  `com.anthonyyoo.justgo`, version 0.1.0 (1), minimum iOS 16.4. The compiled
  executable contains both ExpoHaptics and JustGoKeychain native modules.
  Signature log: `haptics-device-signature.log`. No private key or device identifier
  is copied into the handoff.
- Cold web and Hermes iOS exports after SDK alignment pass with cleared caches
  and one worker. Logs: `haptics-build-web-export.log` and
  `haptics-build-ios-export.log`; ignored output is in the matching folders.
  Real side-panel Settings after the restart renders correctly, remembers off
  through reload and restores on. These are browser checks, not tactile evidence.
- The successful build's **Install** modal is open in the side panel with a QR
  code and the verified device installation URL. Proof:
  `.local/phase-08/haptics-phone-install-qr.png`. Install over the existing app,
  open JustGO and reconnect to the running phone Metro at 10.0.0.200:8084.
  The API is the existing healthy HTTPS staging service. Physical installation,
  retained-account smoke and haptic timing/strength/feel remain Anthony's next
  checks; no phone completion is claimed from artifact verification.
  The restarted phone server also serves a freshly compiled iOS bundle containing
  the haptics preference/adapter and the correct HTTPS staging API; saved audit:
  `.local/phase-08/haptics-build-phone-bundle-audit.json`.
- The native-build task changes the existing manifest/lockfile and version/setup
  guidance, with no new tracked directory or further folder moves needed. The
  reviewed directories keep the responsibility groups recorded above. No Git
  push/PR/merge, TestFlight submission, production release or account reset.

### October 13 haptics strength correction

Anthony reported that the original feedback on his physical iPhone was barely
perceptible and requested stronger haptics. The first medium-impact adjustment
also felt too weak. A subsequent heavy-impact preview was still a little weak;
Anthony clarified that Accept should stay one tap while completion should feel
more like a vibration. These are owner-reported physical observations, not
simulator evidence. Anthony then confirmed the three-pulse burst had the right
strength and requested a little more duration. Completion is extended to four
pulses with the same strength/spacing; other actions stay single taps.

Final mapping:

- Accept, feeling changes and the Settings enable preview each give one heavy
  impact, the strongest standard impact preset exposed by the installed module.
- Accepted completion gives one burst of four heavy impacts with 70 ms gaps.
  Repeated Completed taps still cannot restart the accepted completion effect.
- Every pulse rechecks the enabled/lifecycle fence, native availability and
  foreground state. Disabling feedback, unmounting or backgrounding stops the
  remaining pulses; a native rejection stops the burst and remains contained
  by the provider. The interval is bounded and tests await/consume its timers.

Only the native adapter's mapping/pattern changes. Product actions never wait
for haptics. Hydration, persisted off, failure containment and the quiet web
adapter remain intact. No new native module/dependency is added; reload the
existing haptics-enabled development build. A further EAS/signing build is
unnecessary. A more intense single tap beyond these standard presets would
require a separately scoped native implementation/build; no such change is
claimed here. See [Expo SDK 57 Haptics](https://docs.expo.dev/versions/v57.0.0/sdk/haptics/).

Regression checks protect single impacts, completion cadence, permission changes
between pulses, backgrounding during a burst, native failure and drained timers,
plus existing unavailable-module/platform/preference/action tests. Final command
results are recorded below.

- Focused final run: **40 cases / five suites pass**, including the four-pulse
  cadence and interrupted-burst regressions. Log:
  `.local/phase-08/haptics-strength-focused.log`.
- Final `npm run check`: **pass**, fresh online Expo Doctor **21/21**, contract
  build, workspace/journey types, lint/format, **180 tooling, 54 API unit,
  601 mobile / 72 suites and 24 contract cases**. Log:
  `.local/phase-08/haptics-strength-final-check.log`.
- Fresh mobile coverage: **601 cases / 72 suites pass**, **97.07% lines / 91.87%
  branches**. `npm run coverage:check` passes all unchanged global/critical
  floors using retained API/contracts reports for their unchanged source.
  Logs: `.local/phase-08/haptics-strength-coverage.log` and
  `haptics-strength-coverage-gate.log`. No database, saved browser journey,
  hosted CI or final four-pulse phone acceptance pass is claimed.

The phone Metro stays on port 8084 with the existing staging API. A fresh iOS
bundle audit uses the manifest's actual router-root configuration; its ignored
bundle and audit live under `.local/phase-08/haptics-strength-phone*`.
An initial audit omitted `transform.routerRoot` and therefore did not contain
app routes; that request was corrected before claiming delivery.

Reviewed all six files in `platform/haptics/` and the complete touched docs
folders (`docs/`, `docs/architecture/`, `docs/handoffs/`). No files or independent
responsibilities were added; existing groups remain navigable, so no folder
moves are needed. There is no layout/visual change; browser/simulator checks
cannot establish tactile strength. Final burst feel, timing and disabled/persisted
behavior still require Anthony's physical acceptance within Phase 08. No Git
publication, new native build or phase completion is claimed.

### October 13 development haptics comparison

Anthony authorized a temporary in-app screen to compare completion effects before
choosing a final Pulsar implementation. Settings → Test haptics is visible only
in development and opens `/preview?mode=haptics`, using the existing guarded
developer loader and the same Settings layout, headings and row cards.

- Choices: current four-heavy-impact Expo effect; Pulsar Bloom, Fanfare, Fizz,
  Flourish, Trumpet, Triumph, Barrage, Batter and Afterglow.
- Selecting a row is quiet. Preview plays the selected effect; the same session
  choice controls the existing accepted Completed action, including its duplicate
  prevention. Accept, feeling changes and the enable preview keep their single
  heavy Expo impact. No extra completion is written by the test screen.
- Selection is memory-only and resets on full reload. It is not exported, synced,
  logged or sent to analytics. The existing persisted Haptics boolean still applies.
- Stop, selection changes, leaving the test screen, preference writes, backgrounding
  and provider disposal stop the Pulsar engine/fence remaining Expo pulses. New
  playback stops the previous effect. Preview errors are red and retryable;
  optional native failures cannot fail a completion or preference write.
- Production ignores test selection and always uses the existing effect; neither
  the Settings row nor developer screen is available. The screen/module loading
  guards have regressions. Final effect selection and removal of the temporary
  experiment remain open before release.

Pinned `react-native-pulsar` **1.7.0** without changing the existing Expo/RN/React/
Worklets versions. Inspected its published package and official
[React Native documentation](https://docs.swmansion.com/pulsar/sdk/react-native/):
New Architecture is required, preset functions are present, stop is supported and
the bridge uses the published PulsarHaptics 1.4.0 iOS pod. The native adapter checks
`RNPulsar` before loading the enforcing SDK, so the current phone binary stays
usable. Missing-module completion falls back to the existing effect; the screen
explains the update and disables unavailable Pulsar previews. Web uses a quiet
adapter. Preset audio is explicitly disabled.

Native compilation and physical feel are separate evidence: adding this module
requires an updated signed development build under the repository's separate
native-build workflow. No signing change, cloud build, final effect selection,
TestFlight submission or Git publication has been performed in this UI slice.
The existing development app and account must be preserved during installation.

Verification:

- Final `npm run check`: passes, fresh online Expo Doctor **21/21**, contract
  build, all types/lint/format and **180 tooling, 54 API unit, 643 mobile / 77
  suites and 24 contract cases**. Log: `.local/phase-08/pulsar-test-screen-final-check.log`.
- Fresh mobile coverage passes **643 cases / 77 suites**, **97.16% lines / 92.01%
  branches**. `npm run coverage:check` passes unchanged global/critical floors,
  using retained API/contracts reports for unchanged source. Logs:
  `pulsar-test-screen-final-coverage.log` and `pulsar-test-screen-coverage-gate.log`.
- Regressions cover all preset mappings, audio disabled, older/unsupported
  modules, production guards, enabled/off/loading/writing behavior, completion
  and preview wiring, stop/background/unmount, stale failures and retry. The
  actual Expo Router/Stack test follows Settings → Test haptics → Back, using
  real navigation without API writes. Jest resolves the workspace renderer for
  hoisted Expo Router and transforms its ESM `standard-navigation` dependency;
  no assertions, coverage floors or production boundaries are weakened.
- Side-panel walkthrough at **393 × 852**: real Settings link, every choice,
  checked-state/Selected display, scrolling through Afterglow, Back, off message,
  preference restored on, full reload resetting the experiment and Space
  keyboard selection pass. The first walkthrough caught the reserved `screen`
  parameter opening the general preview; changed it to `mode` and added the
  actual-navigation regression. Also corrected the web checked label and Space
  activation, then retested. Screenshots stay ignored at
  `.local/phase-08/pulsar-test-screen.png`. Viewport override is reset afterward.
- Cold Hermes iOS export passed; this proves bundling, not native compilation or
  tactile feel. The later phone-server audit records the current development
  route/SDK bundle after the navigation/keyboard corrections. No database,
  hosted CI, saved app/API/database journey or physical effect acceptance is
  claimed for this slice.

Directory review: read the full direct inventories for `apps/mobile/`, `src/app/`,
`src/app-support/`, `src/app-support/settings/`, `src/platform/haptics/`,
`src/platform/haptics/completion/`, `src/dev/haptics/`, the repository root and
the touched plan/architecture/handoff folders. The seven completion files form
their own responsibility group, with native/web adapters and tests together;
the developer screen and its two tests form the three-file `dev/haptics/` group.
Settings retains its six direct screen/preference files and existing subgroups.
No unrelated files were moved. The existing groups remain navigable; no further
subfolders or folder-move checks are necessary.

Separate native-build follow-up under the approved testing plan:

- Inspected the exact EAS archive before submission: **252 files**, new screen,
  guarded route/provider/adapters, Pulsar 1.7.0, lockfile and existing native
  Keychain module match working source; no private env, credentials, local data
  or dependency caches. Audit: `.local/phase-08/pulsar-build-source-audit.json`.
- Submitted internal iPhone development build **3c47aa67-e706-4361-8847-e38d61458e48**,
  version 0.1.0 (1), using the existing Expo project, app identifier and frozen
  signing credentials. No device registration, signing changes, store submission
  or paid Studio license. The inspected working tree is included despite the
  older Git base. [Build page](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/3c47aa67-e706-4361-8847-e38d61458e48).
- EAS reports **FINISHED / Succeeded**. Downloaded the **30,380,086-byte** IPA,
  validated archive paths and verified the full app with
  `codesign --verify --deep --strict`. The executable contains **RNPulsar,
  PulsarHaptics, ExpoHaptics and JustGoKeychain**. App identifier, version 0.1.0
  (1), minimum iOS 16.4, Apple team and registered-device set match the existing
  app/profile. Audit: `.local/phase-08/pulsar-device-artifact-audit.json`;
  signature log: `pulsar-device-signature.log`. No identifiers or private profile
  contents are copied into the handoff.
- Restarted only the owned phone Metro with `--clear`, keeping port **8084**,
  LAN **10.0.0.200** and the existing staging API. Its fresh iOS bundle contains
  the final `mode=haptics` route, screen, presets/native adapter and HTTPS API.
  Audit: `.local/phase-08/pulsar-test-screen-phone-audit.json`. The side-panel
  web server remains on loopback 8081. Existing account/storage were not reset.
- The successful build's Install modal/QR is open in the side panel. Screenshot:
  `.local/phase-08/pulsar-phone-install-qr.png`. Install over the existing app,
  reconnect to the phone server and open Settings → Test haptics with Haptics on.
  Compare previews and real Completed feedback; test Stop, off and backgrounding.
  Physical installation/runtime/feel and the final choice remain owner checks
  within Phase 08. Compilation and a valid signature do not establish tactile
  behavior; no physical pass or release acceptance is claimed.
- A read-only EAS status command run from the repository root generated an empty
  `app.json` stub. It was not in the inspected/uploaded archive. Preserved a local
  diagnostic copy and removed only that generated stub; reran formatting and
  diff checks. Subsequent EAS commands ran in `apps/mobile/` with its existing
  project configuration. No replacement project or tracked app config change.

The temporary experiment remains an explicit pre-release cleanup/selection task.
No Git commit, push, pull request, merge, TestFlight/store submission or final
Pulsar production mapping is included in this follow-up.

### October 13 Batter default and retained development tool

Anthony selected **Batter** for completion and requested retaining **Test haptics**
as a development feature. This supersedes the earlier temporary-screen cleanup
requirement and the original Expo completion default; it does not authorize
removing Expo Haptics or changing acceptance/feeling feedback.

- `defaultCompletionHaptic` is the single configured completion default. Batter
  is selected on a fresh development session and is always used by production
  completion when Pulsar is supported. The native Pulsar adapter now supports
  release playback/stop as well as development, with audio disabled and the same
  foreground/optional-module guards.
- Development selection overrides Preview and accepted completion only for that
  session; reloading restores Batter. Production ignores selection/preview
  controls even if a stale development choice exists. Both the Settings row and
  developer route/screen remain guarded by `__DEV__`.
- The original four-impact Expo burst remains available as **Original Expo effect**
  in the development picker and as a safe missing-Pulsar fallback. Single taps
  for acceptance, feeling changes and successful enabling continue using Expo.
- The saved Haptics boolean still controls both SDKs; stop, background/disposal,
  stale-result fencing and failure isolation remain intact. No preset choice is
  persisted, exported, synchronized or sent to analytics.
- Existing Pulsar-enabled build **3c47aa67-e706-4361-8847-e38d61458e48** contains
  every required native module. This is a JavaScript change: fully reload the
  development app from the running phone Metro. No additional dependency,
  signing change, native/cloud build, Git publication or account reset.

Verification:

- Final `npm run check` passes: fresh online Expo Doctor **21/21**, contracts
  build, all types/lint/format, **180 tooling, 54 API unit, 647 mobile / 77 suites
  and 24 contract cases**. Log: `.local/phase-08/batter-default-final-check.log`.
- Fresh mobile coverage passes: **97.17% lines / 91.99% branches**. Unchanged
  global/critical floors pass using retained API/contracts reports for unchanged
  source. Logs: `batter-default-final-coverage.log` and
  `batter-default-final-coverage-gate.log` under `.local/phase-08/`.
- Regressions prove default playback without selecting a pattern, remount reset,
  ignored production overrides/previews, release SDK playback/stop, saved-off
  behavior, missing-module fallback and the retained loading/failure/cancellation
  and route guards. The development screen's reset copy derives from the same
  configured default.
- Side-panel verification at **393 × 852** passes: fresh reload selects Batter,
  Preview reflects Batter, Afterglow selection temporarily overrides it, reload
  restores Batter, and Back → Settings → Test haptics works. Original Expo effect
  remains available for comparison. Saved proof:
  `.local/phase-08/batter-default-screen.jpg`; viewport override reset afterward.
  Browser previews remain deliberately silent.
- Cold production Hermes iOS export passes with one worker; this establishes
  bundling, not signed production/native playback. Log:
  `.local/phase-08/batter-default-ios-export.log`. The current phone Metro serves
  the Batter default, final comparison copy/route and the existing HTTPS staging
  API; audit: `.local/phase-08/batter-default-phone-audit.json`. Full phone reload
  is the next owner check; no new build is required for this JavaScript change.

Directory review: all seven files in `platform/haptics/completion/`, the six
parent haptics files, the three files in `dev/haptics/`, and full touched
plan/architecture/handoff directory inventories remain cohesive. No new files,
independent responsibilities or folder moves were added. No database, hosted CI
or saved app/API/database journey pass is claimed for this mobile-only slice.

Anthony's selection records his preferred effect; automatic-default confirmation
and wider signed-production/device acceptance remain distinct open checks in
Phase 08/11. No simulator/browser/mocked-call tactile pass is claimed.

### October 13 Pulsar-only migration

Anthony authorized replacing Expo Haptics with Pulsar for every action, and
permitted saving the current work first. The existing 45-file haptics/default/tool
slice was committed locally as **baf739f** (`feat(mobile): add saved haptics and
Batter completion feedback`), keeping this migration separately reviewable.
No push, pull request or merge is authorized or performed.

- Removed `expo-haptics` from the mobile manifest and root lockfile; npm removed
  that one package. `react-native-pulsar` remains pinned at **1.7.0**, with the
  existing SDK 57 patch pins unchanged.
- The single `haptic-feedback` native/web adapter family now owns Pulsar I/O for
  both system heavy taps and named presets. Accept, changed/cleared feelings and
  successful enabling use `Presets.System.impactHeavy()`; accepted completion
  still defaults to **Batter**. Sound remains disabled.
- Removed the duplicate completion-only native/web adapters and merged their
  native guards/preset/production tests into the shared adapter regressions.
  The provider and completion hook now use one controllable adapter.
- Retained all ten developer comparison choices. The earlier **Original Expo
  effect** is now **Four heavy taps**, recreated through Pulsar at the existing
  four-tap/70 ms spacing. Production still ignores session overrides; reload
  restores Batter. The tool remains guarded in Settings, route and screen.
- Preserved saved-off behavior, quiet hydration/writes, duplicate completion
  prevention, stop/background/unmount fencing, failure containment and export
  inclusion of the boolean. Unsupported or older binaries stay usable and quiet;
  there is no remaining Expo fallback. The testing screen explains that feedback
  requires a physical iPhone and the Pulsar-enabled development build.
- Existing signed development build **3c47aa67-e706-4361-8847-e38d61458e48**
  already contains Pulsar and can run this JavaScript migration after a full
  reload. It still contains the previously compiled, now-unused Expo native
  module. A subsequent separately scheduled native build will omit that module;
  this task does not perform signing/cloud builds or claim a new binary.

Verification:

- Final `npm run check` passes: fresh online Expo Doctor **21/21**, contracts
  build, types/lint/format, **180 tooling, 54 API, 644 mobile / 75 suites and
  24 contract cases**. Log: `.local/phase-08/pulsar-only-check.log`.
- Fresh mobile coverage passes with **97.16% lines / 91.97% branches**, and the
  unchanged combined all-source/critical floors pass. API/contracts coverage
  reports are retained for their unchanged source. Logs: `pulsar-only-coverage.log`
  and `pulsar-only-coverage-gate.log` under `.local/phase-08/`.
- Regressions cover every named preset, native system heavy taps, the four-tap
  comparison and cancellation, unsupported modules/hardware, production playback
  and safe native failures. An integration regression mounts the actual provider
  with its default Pulsar adapter, verifies every product action through the
  mocked native SDK, and verifies saved-off, enable feedback and disable behavior.
  Mocks establish JavaScript wiring, not tactile strength or feel.
- Cold production Hermes iOS export passes with one worker; log:
  `.local/phase-08/pulsar-only-ios-export.log`. This establishes bundling, not
  signed native/release behavior.
- Restarted only the owned web/phone Metro servers with `--clear`, preserving
  loopback **8081**, LAN **8084** and the existing HTTPS staging API. File
  watching remains enabled. The fresh iOS bundle contains Pulsar system heavy
  taps, Batter default, Four heavy taps and the staging API, with no
  `ExpoHaptics` module or `expo-haptics/` source. Audit:
  `.local/phase-08/pulsar-only-phone-audit.json`. Both servers remain running.
- In-app side-panel verification passes at the default **1165 × 1036** viewport:
  Four heavy taps and Afterglow selection update the Preview label, reload
  restores Batter, Back returns to Settings and Test haptics reopens the picker.
  Haptics off survives browser reload; restored it to its prior on state. The
  silent browser honestly disables native preview/stop controls. Screenshot
  `.local/phase-08/pulsar-only-screen.jpg` was saved and visually inspected.
  No outside browser, simulator or real account activity was used.
- `npm ls expo-haptics --all` reports an empty dependency graph; the installed
  Pulsar version remains **1.7.0**. No API/database boundary or phase closeout
  changed, so no new database, saved journey or hosted CI acceptance is claimed.

Directory review: inspected complete contents of the repository/mobile roots,
Settings, developer haptics, platform haptics and its completion group, and the
touched plan/architecture/handoff directories. Removing four duplicated adapter
files leaves six direct platform haptics files, three completion files and three
developer haptics files. Existing responsibility groups remain clear; no new
subfolder or unrelated moves are needed.

The Pulsar-only migration was committed locally as **9e0b16c**
(`refactor(mobile): use Pulsar for all haptic feedback`).

**Owner physical-iPhone confirmation:** Anthony reloaded the app and answered
“All actions work and Off silences them” to the check covering enabling Haptics,
accepting a challenge, changing a feeling and Batter completion, followed by
turning Haptics off and repeating. These product triggers and disabled feedback
now have owner-reported physical evidence on the existing Pulsar-enabled build.
This also confirms the completion default after a full reload; it is separate
from automated/browser evidence and does not claim a new binary.

Remaining native checks in Phase 08: preference persistence across native app
relaunch, explicit feeling clearing, the comparison tool's Preview/Stop,
background interruption and return behavior. A clean native build without Expo's
unused module and broader signed release acceptance remain separately scheduled.
The owner response does not establish those unreported checks or close Phase 08.

### October 13 Settings toggle haptics gate

Anthony reported that toggling Reduce Motion still gave feedback with Haptics
off, despite the four earlier product triggers respecting the preference.

Inspection found no haptics request in the Reduce Motion row/provider. Both rows
rendered React Native's interactive `Switch`; the installed RN 0.86 Fabric
implementation creates a UIKit `UISwitch` and exposes no haptics suppression
property. The reported remaining tap is therefore attributed to the native
control, not an app event observed in a trace. No physical tap was reproduced by
Codex; only Anthony's report establishes that tactile symptom.

- Added shared `components/settings/SettingsToggleRow`: one accessible full-row
  Pressable, with a decorative 51 × 31 pill. Neither preference renders an
  interactive native Switch. Checked, disabled and busy state, hints, Enter and
  Space are retained. The controls have no animation or implicit haptics.
- Both rows use this control. Reduce Motion's input acknowledgement now requests
  `selection` through the saved Pulsar haptics gate. Off/hydration/writes fence
  it; storage errors remain owned by the motion provider. Haptics enabling still
  previews only after a successful save, and disabling remains silent.
- Preference values, system Reduce Motion priority, persistence, export schema,
  challenge/feeling/Batter feedback and development guards are unchanged.
- Updated existing row regressions to activate the accessible control through a
  press and assert its checked state. Added a real-provider integration regression
  that changes Reduce Motion with Haptics off, enables feedback, tests the input
  tap, disables it and retests. It also asserts neither row retains a native
  Switch outside the gate, protecting the source of the reported bypass.
- Shared-control regressions cover controlled state, disabled/busy input,
  native-switch absence and Space behavior, including a directly delivered
  callback while disabled. No production dependency or native build change.

Verification:

- Focused Settings/control checks pass: **52 cases / 4 suites**. Log:
  `.local/phase-08/toggle-haptics-focused.log`.
- `npm run check` passes: online Expo Doctor **21/21**, all builds/types/lint/format,
  **180 tooling, 54 API, 648 mobile / 76 suites and 24 contract cases**. Log:
  `.local/phase-08/toggle-haptics-check.log`.
- Fresh mobile coverage passes: **97.14% lines / 91.91% branches**; unchanged
  all-source/critical floors pass with retained API/contracts reports for their
  unchanged source. Logs: `.local/phase-08/toggle-haptics-coverage.log` and
  `toggle-haptics-coverage-gate.log`.
- The existing phone Metro serves both custom rows, the guarded motion input tap,
  Pulsar and the unchanged HTTPS test API, with no Expo Haptics module. Live bundle
  audit: `.local/phase-08/toggle-haptics-phone-audit.json`. The current signed
  Pulsar-enabled development build can test this JavaScript-only correction
  after a full reload; no new build is needed. Both existing servers remain
  running with file watching enabled. No account, simulator or browser was reset.
- Side-panel walkthrough passes at **1165 × 1036**: Haptics off → Reduce Motion
  on → Space off → Enter on → reload retains both independent values. Restored
  the prior browser values (Haptics on, Reduce Motion off). Both controls expose
  checked state and measure **386 × 63** full-row targets. Visually inspected
  the retained Settings typography/cards and 51 × 31 pills; no console errors.
  Screenshot: `.local/phase-08/toggle-haptics-off-screen.jpg`.
  Browser silence does not establish iPhone tactile behavior.

Directory review: inspected all five files in shared Settings components, the
six direct app-support Settings files plus existing export/information groups,
and the touched plan/architecture/handoff directories. The shared control is a
cohesive reusable Settings responsibility; no extra folders or moves are needed.

**Owner physical-iPhone retest passed:** Anthony reloaded the existing
Pulsar-enabled development app and answered “Off is silent; On gives one tap”
to the check covering Reduce Motion in both directions with Haptics off, followed
by re-enabling Haptics and checking the single input tap. This closes the reported
Reduce Motion feedback bypass with owner-reported tactile evidence. No new
binary was required. Native VoiceOver, relaunch/Stop/background and broader
release acceptance remain their distinct existing gates; this focused phone
result does not close all Phase 08 acceptance.

### October 13 toggle row opacity correction

Anthony noticed the row icon and label flickering when changing either
preference. The shared toggle introduced a whole-row alpha of **0.8** while
pressed and **0.5** while disabled. Both preference providers temporarily disable
input during every storage write, so the entire row flashed between dimmed and
normal states. These styles were introduced by the preceding toggle correction.

Removed the row's pressed/disabled opacity styling. The row, label and icon stay
fully opaque through input and saving; only the toggle value changes visually.
A permanently disabled toggle still dims its pill, without dimming the label.
Temporary saves retain their duplicate-input guard and accessible busy/disabled
state while keeping their appearance stable. Haptics gating, saved values,
keyboard behavior and system Reduce Motion priority are preserved.

A regression checks the rendered switch row's opacity through normal, disabled
saving and settled checked states, while preserving disabled-input behavior.
The existing control/provider regressions retain the haptics-off protection and
absence of interactive native switches.

Verification:

- Focused Settings/control checks pass: **35 cases / 3 suites**. Log:
  `.local/phase-08/toggle-opacity-focused.log`.
- `npm run check` passes: fresh Expo Doctor **21/21**, builds/types/lint/format,
  **180 tooling, 54 API, 649 mobile / 76 suites and 24 contract cases**. Log:
  `.local/phase-08/toggle-opacity-check.log`.
- Fresh mobile coverage **97.14% lines / 91.97% branches** and unchanged combined
  coverage floors pass. API/contracts reports are retained for unchanged source.
  Logs: `toggle-opacity-coverage.log` and `toggle-opacity-coverage-gate.log` under
  `.local/phase-08/`.
- Fresh phone Metro bundle confirms no root pressed/opacity style and confines
  dimming to a permanently disabled pill. Pulsar and the HTTPS test API remain
  present. Audit: `.local/phase-08/toggle-opacity-phone-audit.json`. The existing
  installed development build needs only a reload; no native build was started.

Side-panel verification at **1165 × 1036**: toggled Reduce Motion with a held
press, then held Haptics for 1.2 seconds and captured the screen during the hold.
Icons/text remain fully visible, both states save correctly, and computed row
opacity is **1** after both changes. Restored the original browser values
(Haptics on, Reduce Motion off). Screenshot:
`.local/phase-08/toggle-opacity-held-screen.jpg`.

Directory review: all five shared Settings component files and the existing
touched plan/architecture/handoff directory contents remain cohesive. No files,
folders, dependencies or native modules were added by this correction. No
publication, database/hosted CI or full phase acceptance is claimed.

**Owner physical-iPhone visual confirmation passed:** Anthony reloaded JustGO
and toggled Haptics and Reduce Motion, answering “Yes, the icons and text stay
steady.” This closes the reported toggle-row flicker with owner-reported device
evidence, separately from the earlier browser and automated checks. The existing
native VoiceOver, relaunch/Stop/background and broader release gates remain open.

### October 13 native-switch animation experiment

**Historical experiment, subsequently removed:** Anthony later requested undoing
this approach and animating the original custom switch. See the superseding
[custom-switch task](#october-13-custom-switch-animation-and-experiment-removal).

Anthony wants to preserve the distinctive native iPhone switch animation while
keeping Haptics off silent. He authorized trying a native-switch workaround
before changing the accepted Settings controls.

Added `NativeSwitchExperiment` beside the existing developer haptics screen.
Settings → Test haptics opens the comparison at the top of the existing guarded
preview route. Both controls are actual React Native `Switch` views on iOS:

- **Native reference:** direct native interaction with its own temporary value.
- **Tap-controlled native switch:** an accessible switch row changes a second
  temporary value. Its inner native switch receives no touch/accessibility input;
  UIKit renders its updated value. The inner switch is not disabled or given a
  custom thumb, preserving the native visual treatment for comparison.

Neither test control invokes Pulsar, writes preferences, creates activity or
persists its value. Remounting resets both. The reference may still generate
Apple's own feedback. Test taps, holds and drags with app Haptics off, comparing
the second control's animation and silence. Row-handled input can differ from
native thumb dragging; no fidelity or tactile result is assumed. Native
VoiceOver also needs checking before adopting this workaround in Settings.

The experiment and existing preview route are guarded by `__DEV__`. Browser and
Android show an honest iPhone requirement instead of a substitute animation or
nested interactive HTML input. Production Settings remains unchanged, and no
dependency, native build or signing change is needed to load the experiment.

Verification:

- Focused experiment/screen/navigation/production-guard tests pass: **18 cases /
  4 suites**. Checks cover independent/resettable values, the native input and
  accessibility barrier, unsupported platforms, production hiding, and use with
  app Haptics off without preference writes or app-feedback requests. Log:
  `.local/phase-08/native-switch-focused.log`.
- `npm run check` passes: fresh Expo Doctor **21/21**, builds/types/lint/format,
  **180 tooling, 54 API, 655 mobile / 77 suites and 24 contract cases**. Log:
  `.local/phase-08/native-switch-check.log`.
- Fresh mobile coverage **97.15% lines / 91.99% branches** and unchanged combined
  coverage floors pass. The new experiment has full line/branch coverage;
  retained API/contracts reports apply to unchanged source. Logs:
  `native-switch-coverage.log` and `native-switch-coverage-gate.log` under
  `.local/phase-08/`.
- Side-panel walkthrough at **1165 × 1036**: Settings → Test haptics displays the
  new comparison heading, explicit iPhone requirement and instructions. Existing
  effect controls remain available below. No browser imitation of UIKit is
  presented. Screenshot: `.local/phase-08/native-switch-browser.jpg`. Browser
  Settings values remain Haptics on / Reduce Motion off.
- A fresh development iOS bundle from the running phone server contains both
  native switch controls, the touch/accessibility barrier and development guard;
  the HTTPS staging API is retained. Audit:
  `.local/phase-08/native-switch-phone-audit.json`. Anthony can reload the
  existing Pulsar-enabled installed development app; no rebuild was started.

Directory review: inspected all five developer haptics files, both direct Markdown
files in `docs/` and the existing 23-file handoff directory/index. The experiment
and its tests belong beside the existing haptics tool; the existing documentation
groups remain navigable. No additional subfolders or moves are needed.

**Owner physical-iPhone result:** Anthony answered “Silent, but the animation
feels different.” This establishes owner-reported silence for the comparison,
but the proposed workaround does not satisfy the desired native animation.
Do not adopt it in Settings or treat the animation request as resolved. The
existing accepted silent Settings controls remain unchanged; the comparison
remains a development fixture. No separate gesture-by-gesture or VoiceOver
acceptance was reported.

Follow-up inspection of the installed UIKit public `UISwitch`/`UIControl` headers
and the [React Native 0.86 Switch API](https://reactnative.dev/docs/0.86/switch)
found no exposed setting for suppressing a normally interactive switch's own
haptics. This does not establish that every alternative is impossible. The tested
row-input workaround changes the normal touch path and cannot be presented as
an equivalent native interaction after this device result. Any future proposal
must preserve the agreed silence behavior or get an explicit product decision
to change it; no native implementation/build is authorized by this test result.

Only this evidence/documentation was updated after Anthony's response; no new
code or UI change was made, so code tests and browser checks were not rerun.
The existing native persistence/Stop/background and broader release gates
remain separate. No Settings replacement, publication or phase closeout is
implied by this comparison.

### October 13 custom-switch animation and experiment removal

Anthony requested using the original custom switch with a simple animation, then
explicitly asked to undo the native-switch workaround. Removed the experimental
component, its tests and the developer-screen import/render logic. The retained
Test haptics page again contains only the existing preset preview/selection
tools. A screen regression checks that no native `Switch` is rendered there.
The earlier experiment result remains historical evidence, not current code.

The shared `SettingsToggleRow` remains a custom accessible full-row Pressable
with decorative track/thumb views. A single Animated value now drives the
thumb's 20-point translation and the ink track's opacity over 200 ms with cubic
ease-out. The native driver handles iOS transform/opacity; the browser uses its
JavaScript driver. No native switch or implicit OS feedback is involved. This
implements a simple slide/fade; it does not claim to reproduce UIKit's direct
press/drag interaction.

Both Settings owners supply the effective app/system Reduce Motion choice.
When it is enabled, an in-flight transition is stopped and the accepted state
is applied immediately. Value reversals and unmount stop the previous animation.
Initial rendering and busy-only updates do not start/restart movement. Existing
checked/disabled/busy state, Enter/Space behavior, storage success/error handling
and haptics gating remain intact. Only the track and thumb animate; row icons
and text retain full opacity, including through saves.

Verification:

- Focused Settings/control/preset/navigation checks pass: **69 cases / 6 suites**.
  Tests exercise shared thumb/track progress, value reversals, cancellation,
  Reduce Motion interruption, no animation restart for busy-only changes,
  existing haptics-off gating, accessibility and keyboard input. Native frames
  are not executed by the Jest renderer. Log:
  `.local/phase-08/custom-toggle-motion-focused.log`.
- `npm run check` passes: Expo Doctor **21/21**, build/types/lint/format,
  **180 tooling, 54 API, 655 mobile / 76 suites and 24 contract cases**. The
  initial type check caught removed RN `StyleSheet.absoluteFillObject`; using
  the installed version's `StyleSheet.absoluteFill` resolved it before the
  complete rerun. Log: `.local/phase-08/custom-toggle-motion-check.log`.
- Fresh mobile coverage **97.15% lines / 91.99% branches** and all unchanged
  combined floors pass. `SettingsToggleRow` has full lines/branches/functions;
  API/contracts coverage is retained for unchanged source. Logs:
  `custom-toggle-motion-coverage.log` and
  `custom-toggle-motion-coverage-gate.log` under `.local/phase-08/`.
- Side-panel walkthrough at **1174 × 1036** confirmed removal of the native
  trial from Test haptics, then exercised both Settings controls and Space input.
  Read-only computed-style samples captured intermediate thumb translations
  from 0 to 20 and track opacity from 0 to 1; row opacity stayed 1 throughout.
  With Reduce Motion on, the Haptics switch samples changed directly between
  endpoints. These are browser observations, not native/tactile evidence or a
  performance benchmark. Frame samples:
  `.local/phase-08/custom-toggle-browser-frames.json` and
  `custom-toggle-reduced-browser-frames.json`. Restored Haptics on / Reduce
  Motion off. Screenshot:
  `.local/phase-08/custom-toggle-motion-settings.jpg`.
- Fresh phone Metro bundle confirms the native trial's module/labels are
  absent, custom animated views/native-driver selection are served and the
  HTTPS test API remains. Audit:
  `.local/phase-08/custom-toggle-motion-phone-audit.json`. Reload the existing
  installed development app to review; no new build/signing change was started.

Directory review: inspected the five shared Settings files, the six direct
app-support Settings files with their existing export/information groups, the
three remaining developer haptics files, and the existing documentation groups
in `docs/`, `docs/architecture/` and `docs/handoffs/`. The shared control remains
one focused visual/input responsibility with tests beside it. Removing the
experiment reduces developer fixture files; no new subfolders or moves are
needed.

**Owner physical-iPhone confirmation passed:** Anthony answered “Smooth; icons
steady; Off stays silent” to the check covering the custom slide/fade with Reduce
Motion off, steady row icons/text and Reduce Motion input with Haptics off. This
records owner-reported visual and tactile acceptance of this focused correction.
No code changed after the response, so tests and browser checks were not rerun.
Existing native VoiceOver, persistence/Stop/background and broader release
checks remain separate. This task does not close the phase or publish Git changes.

### October 13 Reduce Motion toggle in both directions

Anthony noticed that enabling the app's Reduce Motion preference suppressed the
toggle's own movement, while disabling it animated normally. He explicitly
requested smooth animation in both directions and side-panel verification.

Changed only the Reduce Motion row's local animation flag to depend on hydration
and the phone's preference, rather than the effective app-wide flag. Its custom
200 ms slide/fade can now finish when changing either way. The accepted app
preference still reaches all other consumers immediately; no global delay,
additional storage, timer, native switch or haptics request was introduced.
An enabled or unknown phone preference still stops movement and disables the
row. The Haptics row continues to follow the effective app/system flag.

Added an integration regression using the actual motion provider and row. It
keeps the local animation pending while asserting that the rest of the app
already observes reduced motion, verifies targets in both directions, and
checks that a live phone preference cancels movement and preserves the saved
app choice. Existing tests retain failed-save, hydration, duplicate-input,
keyboard and haptics-off coverage.

Verification:

- Focused motion/shared-toggle/haptics tests pass: **42 cases / 3 suites**. Log:
  `.local/phase-08/motion-toggle-both-directions-focused.log`.
- `npm run check` passes: Expo Doctor **21/21**, build/types/lint/format,
  **180 tooling, 54 API, 656 mobile / 76 suites and 24 contract cases**. Log:
  `.local/phase-08/motion-toggle-both-directions-check.log`.
- Fresh mobile coverage **97.15% lines / 91.99% branches** and unchanged combined
  floors pass. Motion row lines/branches/functions remain fully covered;
  API/contracts reports apply to unchanged source. Logs:
  `motion-toggle-both-directions-coverage.log` and
  `motion-toggle-both-directions-coverage-gate.log` under `.local/phase-08/`.
- Side-panel verification at **1174 × 1036** captured intermediate thumb and
  track states for both on and off, with row opacity always 1. With Reduce
  Motion enabled, the Haptics control still changed directly between endpoints.
  Space/Enter both work. Restored the original Haptics on / Reduce Motion off
  browser values. Frame samples: `.local/phase-08/motion-toggle-on-browser-frames.json`,
  `motion-toggle-off-browser-frames.json` and
  `motion-toggle-other-control-browser-frames.json`. Screenshot:
  `.local/phase-08/motion-toggle-both-directions-settings.jpg`.
- A fresh phone development bundle includes the changed local motion rule and
  custom toggle, retains the HTTPS test API and contains no native-switch trial.
  Audit: `.local/phase-08/motion-toggle-both-directions-phone-audit.json`. The
  existing installed development app needs only a reload; no new native build
  or signing change was started.

Directory review: the six direct app-support Settings files and their existing
export/information groups remain cohesive; no files were added. Existing
plan/architecture/handoff groups remain navigable. No subfolders or moves are
needed for this focused adjustment.

The requested automated and side-panel checks pass. This change was not
retested on a physical iPhone, and the existing native accessibility and release
gates remain separate. No phase closeout or Git publication is implied.

## October 14 receiving-phone transfer

Anthony authorized the fix after finding that Move to another phone instructed
users to choose a receiving action that disappeared once the new phone had
created its own private account.

- Recover an existing account now exposes Transfer from another device while
  connected, as well as the existing disconnected receiving entry. Starting from
  a connected account requires confirmation; Cancel leaves the account and its
  session intact. The later cancellation follow-up below replaces temporary
  disconnection with retaining the old account until redemption; accounts and
  saved history remain separate.
- Move to another phone gives the complete receiving path: Settings → Account &
  recovery → Recovery keys → Recover an existing account → Transfer from another
  device. Code review and entered verification digits remain on the old phone.
- The receiving code/verification/expiry and finish controls remain visible
  after starting. Transfer completion waits for the existing controller to finish
  storing the new session and loading account lists before returning to the hub.
  Navigation is tied to the selected route key rather than the lifetime of a
  child screen, so account-driven recreation is allowed but a late response
  cannot navigate after leaving that route. The controller/API, approval,
  expiration, retry identity and data partitions are unchanged.
- Component regression first failed because the connected recovery page had no
  receiving button. It now checks confirmation/Cancel, one request during repeated
  taps, loading indicators, retained original credentials, delayed list loading,
  successful completion and leaving before a late result.
- The saved two-phone journey uses two actual browser accounts, including an
  already-connected receiver. It follows the Settings path, cancels safely,
  retries a failed transfer start with the same request ID, rejects finishing
  before approval, approves from the other phone, returns to the connected hub
  and checks that both uploaded histories retain their original owner/content.
  Fixtures are restricted to loopback justgo_test and registry-owned cleanup.

Verification:

- Focused identity screens/controller: **50 tests / 3 suites pass**.
- `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run test:journey -- e2e/identity-catalog.spec.ts`: **2 saved journeys pass**, including the new two-phone recovery/approval/history-isolation case. Services stopped and registry-owned fixture accounts were cleaned up.
- Separate contracts build, TypeScript, ESLint, formatting and architecture/unit
  gates pass: **180 tooling, 54 API unit, 664 mobile / 77 suites and 24 contract
  cases**. The first normal mobile run and its focused Progress rerun timed out
  in two unchanged Progress tests; the subsequent full coverage run and a fresh
  normal mobile run both pass all 664 cases. No timeouts, assertions or thresholds
  were changed. Logs: `transfer-code-checks.log`,
  `transfer-progress-timeout-rerun.log` and `transfer-mobile-check-rerun.log` under
  `.local/phase-08/`.
- `npm run test:coverage` passes the unchanged combined/critical-file floors:
  mobile **97.19% lines / 92.05% branches**, API **95.01% / 90.61%**
  (**110 unit/database cases**, including the migration rehearsal), contracts
  **100% / 100%**. The added receiving/confirmation/completion paths have coverage;
  remaining screen misses are existing unmanaged lifecycle, separate-account,
  keyboard-submit and retry handlers. Log: `.local/phase-08/transfer-coverage.log`.
- Final side-panel walkthrough at **1280 × 720**, using a fresh cleared Metro
  bundle and two disposable accounts, follows the complete Settings path, checks
  connected-account confirmation/Cancel, displays receiving codes, rejects
  finishing before approval, approves from the other tab and returns to the
  connected account hub. The saved journeys run at **390 × 844**. Screenshots:
  `.local/phase-08/transfer-receiving-browser.jpg`,
  `transfer-confirmation-browser.jpg` and `transfer-completed-browser.jpg`.
  Neither tab reports console errors; visiting Settings emits the existing
  `pointerEvents` prop deprecation from the unchanged toggle row. Task-owned API
  and Metro services stopped; both registry-owned browser accounts were removed.
- Fresh `npm run check` stops at the existing Expo Doctor patch recommendations:
  expo 57.0.28 → 57.0.29; expo-constants 57.0.21 → 57.0.22;
  expo-linking 57.0.12 → 57.0.13; expo-router 57.0.26 → 57.0.27.
  Pins, native binaries and the validation gate are unchanged. This remains the
  separately recorded dependency maintenance task before publication.

The first saved run could not migrate because the dedicated local database was
stopped; `npm run db:local` restarted that cluster and preserved existing .env
files. Subsequent test adjustments await the quiet account check before measuring
labels and scope assertions to visible screens retained by navigation. The first
completion check exposed an early navigation/focus-lifetime mismatch; completion
now uses the active navigation route and a delayed-list regression. A cleared
owned Metro bundle was inspected to confirm it included the edited receiving UI.
Temporary diagnostics contain only navigation/connection booleans and were
removed from source. One subsequent run timed out during its first cold page load;
the warmed-cache rerun passed both cases without increasing timeouts or removing
assertions.

Directory review: identity keeps startup/controller/vault concerns beside its
existing account UI group; the eight account files stay cohesive with their screen
regressions. The E2E root remains grouped by product journeys with common helpers
under support. Existing docs/architecture/operations and phase handoff groups stay
navigable. No new files or responsibility groups require moves.

Physical two-iPhone transfer, reinstall/iCloud Keychain and broader native release
acceptance remain open. This task does not perform a native build, operate a phone
or simulator, deploy, close Phase 08, commit, push or create a PR. Logs and routine
screenshots remain ignored under `.local/phase-08/transfer-*`.

## October 14 cancel receiving transfers on exit

Anthony requested immediate cancellation whenever a receiving user leaves the
screen, presses Back, backgrounds or closes the app without completing transfer.

The current account/session, recovery-key state and credential selection remain
connected until successful redemption. Back dismisses the receiving flow to the
normal account hub. Navigation focus loss/unmount and non-active AppState cancel
through the shared controller. In-flight requests are fenced and serialized native
writes are drained before cleanup; relaunch cancels persisted transfer proposals
rather than resuming them. A completed server redemption is reconciled to the exact
saved session instead of rolled back.

The API's existing DELETE transfer resource additionally accepts the full original
receiver proposal as proof without a bearer. It locks against approval/redemption
and serializes creation; cancellation arriving before POST inserts a cancelled
tombstone, preventing delayed creation from resurrecting a code. The legacy
approving-account bearer/code body remains compatible. No migration, signing or
native bridge change is required.

Cancellation is saved in device-only secure state before delivery. Offline,
background suspension and force termination cannot guarantee immediate network
cleanup. Startup, foreground and reconnection retry it, with a pending-confirmation
notice. Abandoned credentials from legacy flows are excluded from automatic
account selection, and starting a new transfer first resolves prior cancellation.
The existing ten-minute expiry still bounds an undelivered server code.

Verification:

- Real API integration: **28 identity cases pass** for receiver/approver proof,
  cancellation before creation/approval, idempotency, rate limiting, exact proof
  rejection, approval/redemption races and completed-session reconciliation after
  code expiry. `npm run test:db` passes **60 integration cases plus the isolated
  migration/restoration rehearsal**.
- Saved browser/app/API/database journeys: **3 pass** in
  `e2e/identity-catalog.spec.ts`, covering ordinary renewal, completed two-phone
  transfer with separate histories, and Back cancelling the code, reopening the
  normal connected hub and creating a fresh transfer. Unbound cancelled proposals
  are explicitly cleaned by their own test-created IDs; account cleanup keeps the
  fixture-owned registry safeguard.
- TypeScript, ESLint, formatting and **180 architecture/tooling cases pass**.
  API coverage includes **115 unit/database cases**, contracts **25 cases**;
  final mobile coverage passes **684 cases / 78 suites**, **97.15% lines /
  91.92% branches**. API coverage is **95.20% lines / 90.90% branches**;
  contracts **100% / 100%**. The root coverage run and the final mobile refresh
  plus `npm run coverage:check` pass every unchanged global/critical floor.
  Final TypeScript, lint and whole-repository formatting checks also pass.
- `npm run check` remains blocked at fresh online Expo Doctor by the same four
  SDK 57 patch recommendations (`expo`, `expo-constants`, `expo-linking`,
  `expo-router`). Versions, lockfile, validation and coverage floors are unchanged.
  An initial full coverage run timed out in the unchanged Progress calendar test;
  the following full reruns pass without changing its timeout or assertions.
- Side-panel Browser Use passes at **390 × 844** against a fresh cleared web
  bundle with its API assignment verified as loopback-only. A disposable account
  follows Recovery keys → Recover an existing account → Transfer from another
  device → Confirm → Back, returns directly to the connected hub, then Settings
  → Account & recovery reopens that normal hub. Database inspection confirms its
  unbound code is cancelled and unredeemed. The one registry-owned account and
  that exact test-created unbound proposal were cleaned up; temporary services
  were stopped and the viewport reset. No browser errors; the existing
  `props.pointerEvents` deprecation warning remains unchanged.
  Screenshots: `transfer-cancel-entry.jpg`, `transfer-cancel-waiting.jpg`,
  `transfer-cancel-after-back.jpg` and `transfer-cancel-reopened.jpg` under
  `.local/phase-08/`. The phone Metro server is restarted with `--clear` on
  **8081**, retaining its HTTPS test API and LAN QR address. The cleared iOS
  launch bundle returns **200 / 11,447,551 characters** and contains the new
  receiving-cancellation code with the hosted API assignment. Apple Vision
  revalidates the existing QR as
  `exp+justgo://expo-development-client/?url=http%3A%2F%2F10.0.0.200%3A8081`.
  This is bundle/server evidence; no device operation, native build or new
  native acceptance is claimed.
- The initial read-only hosted OpenAPI inspection found that the test API did
  **not** yet accept receiver cancellation. This caused the owner-reported
  pending-confirmation message. The subsequently owner-approved rollout below
  resolves that server/client mismatch; physical-phone behavior remains open.

Routine evidence is ignored under `.local/phase-08/transfer-cancel-*`.

Directory review: identity keeps API/vault/controller responsibilities together,
receiving cancellation regressions have their own colocated test file, and account
presentation remains in its existing `account/` group. The API identity, contract,
provider, shared Settings, route and journey directories retain cohesive owners;
no additional folder move improves navigation for this change. Documentation
phase renumbering elsewhere in this checkout is preserved.

Remaining acceptance: verify Back, native swipe-back, lock/background, force
termination/relaunch and offline recovery on physical phones against the deployed
API. JavaScript/browser checks and hosted HTTP probes do not establish
Keychain/iCloud or OS termination delivery. No Git publication or native build
is included.

### Owner-approved hosted API rollout

Anthony explicitly approved deploying the tested API update after reporting the
pending-confirmation message. On October 14 at 23:39 UTC, Vercel deployment
`dpl_4BBEqxZmmrv5tJV2CoUwjrqPtHCw` became Ready on
<https://justgo-two.vercel.app>, replacing `dpl_ENi6zgHhmQwRLuYvBRWHq2csLyuw`.
This is the existing application-staging service in its documented production
slot, with runtime region `yul1`; no release environment or Git publication was
created.

- Cached Vercel CLI 59.22.0 refreshed its existing operator login. Dry upload
  verification allowed exactly **41 files / 705,487 bytes** of API/contract and
  workspace metadata. Every post-deployment source SHA matches that manifest;
  secrets, fixtures, migrations, docs, generated artifacts and mobile source were
  excluded. The public-contract upload regression passes.
- Project identity/root directory, the exact documented previous deployment,
  protected-deployment policy and all production environment configuration
  IDs/timestamps were checked. Sensitive values are provider-redacted; their
  configuration was unchanged since the documented staging deployment and remains
  unchanged afterward. No grants, credentials, database schema or runtime settings
  were edited.
- Live readiness **200**, unauthenticated devices/access **401**, retired identity
  route **404**, and OpenAPI includes the full receiver cancellation proof. The
  generated deployment remains protected by a **302** redirect to Vercel SSO;
  the existing public phone alias retains its normal HTTPS access. The initial
  probe expected 401, then verified the observed SSO redirect without changing
  protection.
- Live API probes pass: start → receiver cancellation; cancelled start replay
  rejected; cancellation before creation → delayed start rejected; repeated
  cancellation returns the same status. Two probe-only unbound transfer records
  remain cancelled protocol tombstones. **Zero accounts/sessions were created;
  no activity or owner-phone data was written/read.** No local fixture harness or
  admission bypass was deployed.
- Fresh `npm run check` again stops at the same four Expo patch recommendations.
  The already passing local API/mobile/contracts, database, coverage and saved
  journeys above remain the code evidence. Hosted build/deployment succeeded;
  the existing dependency/audit release follow-ups remain open without forced
  upgrades or suppression.
- The existing phone Metro server remains on **8081**. The owner can tap Retry
  connection, then Transfer from another device → Confirm; the queued cancellation
  is now accepted before a new proposal starts. Actual owner-phone confirmation
  is still pending.

Ignored deployment evidence: `transfer-cancel-deploy-{dry,before,after}.json`,
`transfer-cancel-upload-verified.json`, `transfer-cancel-hosted-smoke.json` and
`transfer-cancel-deploy{,-check}.log` under `.local/phase-08/`. No recovery secrets
or bearer values are retained in those summaries.

## October 14 receiving-confirm button loading

The centered-primary-button follow-up below supersedes the spinner placement in
this earlier refinement; its retained-page and cancellation behavior remains.

Anthony reported Confirm replacing the recovery page with text and successive
loading states. The receiving confirmation now remains visible throughout its
request. Its existing recovery form stays mounted, alternate actions stay disabled,
and only the Confirm button shows a spinner, immediately after its label. Transfer
codes and success/failure feedback appear after the action settles. Cancellation
on Back/background/unmount and the current-account connection are preserved.

`PrimaryButton` accepts an explicit trailing spinner position for this Confirm
control; existing button callers retain their previous placement. Confirmation
completion is fenced after unmount, and a failed request removes its loading state
and leaves a usable retry. No backend/shared protocol or native dependency changed;
the already deployed cancellation API remains in place.

Regression coverage first reproduced three failures in the original UI. Updated
component checks retain the same recovery input instance, find exactly one spinner
inside Confirm, block duplicate requests and cover failure/Back while starting.
The saved two-phone journey holds its transport request, verifies the spinner is
inside Confirm and geometrically to the right of the text, preserves the form,
then releases the request into its existing failure/retry/success path.

Verification:

- Focused identity/recovery components: **39 tests / 2 suites pass**, including
  request failure and Back/unmount while Confirm is loading. The original UI
  fails the three new/updated loading assertions before the fix.
- Contracts build, workspace/journey TypeScript, ESLint and formatting pass;
  **180 architecture/tooling, 54 API unit and 25 contract cases pass**.
- Full mobile coverage: **686 tests / 78 suites pass**, **97.16% lines /
  91.97% branches**. The combined coverage checker passes all unchanged floors,
  using the fresh mobile report and retained API/contracts coverage (their source
  did not change). No backend/database behavior changed in this refinement.
- Saved actual-app/API/database identity journeys: **3 pass**. The two-phone case
  holds the start request and asserts one spinner inside Confirm, its right-of-text
  position from rendered bounds, the retained recovery form and the existing
  network-failure/retry/approval/history-isolation path. Local fixture services
  stopped and their owned accounts/proposals were cleaned up.
- Side-panel Browser Use: **pass at 390 × 844**, against a cleared loopback-only
  bundle whose API assignment was verified before account creation. A disposable
  request gate holds the real start request while the screenshot shows Confirm's
  trailing spinner with the confirmation and recovery form intact. Releasing the
  gate moves directly to the code screen with no spinner; Back cancels it and
  returns to the connected hub. No browser console errors/warnings. The exact
  unbound proposal and one registry-owned account were cleaned up; services were
  stopped and the viewport reset. This timing gate exists only in an ignored
  loopback fixture; no hosted server change was made.
- Screenshots: `.local/phase-08/transfer-confirm-{before,loading,ready}.jpg`.
  Saved logs: `transfer-confirm-{before,focused,journey,check}.log` under that
  directory. The phone Metro server is restarted with `--clear` on **8081** and
  retains the deployed HTTPS API. The cleared iOS launch bundle returns **200 /
  11,448,487 characters** with the new confirmation/spinner code and hosted API
  assignment. This proves bundling; native UI/gesture/Keychain acceptance remains
  a physical-phone check.
- Fresh `npm run check` still stops at the same four online Expo SDK patch
  recommendations. Dependency versions, validation, assertions and coverage
  thresholds are unchanged; the separate code gates above pass.

Directory review: changes stay with identity presentation and its account tests,
the existing shared button and saved identity journey. These directories already
have clear responsibility groups; no new production file or folder move is needed.

## October 14 centered primary-button loading

Anthony requested the reflection-saving/challenge-completion approach for all
matching primary buttons. The shared `PrimaryButton` now replaces its visible
label with one small white centered `ActivityIndicator` while busy, then restores
the label when loading ends. Confirm uses that same behavior; the prior
trailing-spinner option is removed. Accessible button names, busy/disabled state
and duplicate-press protection remain. Settings rows and underlined actions keep
their existing presentation. The receiving confirmation and recovery form still
stay mounted until the request settles, including failure and cancellation.
No API, storage, protocol or native dependency changed.

Verification:

- The new shared-button regression fails against the former label-plus-spinner
  rendering. Focused button, account, identity, access, challenge and reflection
  suites pass: **63 tests / 6 suites**. The existing live text-size test now
  verifies the pending spinner survives resizing and the label returns with the
  latest metrics afterward.
- Contracts build, workspace/journey TypeScript, ESLint, formatting and
  **180 architecture/tooling, 54 API unit and 25 contract cases pass**. Final
  mobile TypeScript and affected-file ESLint also pass after the typography-test
  update.
- Full mobile coverage: **688 tests / 79 suites pass**, **97.16% lines /
  91.96% branches**. The combined coverage checker passes unchanged floors using
  fresh mobile coverage and retained API/contracts reports; their source did not
  change in this refinement. No separate database suite is needed for this UI
  change; saved journeys still use the real disposable loopback database.
- Saved identity journeys: **3 pass**. The two-phone case holds both Confirm and
  Review transfer requests and checks each spinner's horizontal/vertical center
  within **1.5 px**, absence of visible label text and disabled button. It retains
  the existing failed-request/retry/approval/history-isolation checks.
- Side-panel Browser Use: **pass at 390 × 844**, with the cleared bundle's
  loopback API assignment verified first. The held Confirm request shows only
  its centered spinner with the confirmation/recovery form intact. Releasing it
  opens the transfer-code screen; Back returns to the connected hub and the exact
  proposal is confirmed cancelled in the database. No console warnings/errors.
  The exact disposable transfer/device association identifies the one test
  account for cleanup; that account and the unbound cancelled proposal were
  removed. Fixture services stopped and the temporary viewport was reset.
- Screenshot: `.local/phase-08/centered-buttons-confirm.jpg`; checks and cleanup
  evidence: `centered-buttons-*.log` / `centered-buttons-cleanup.json` in that
  ignored directory. No visual evidence is committed.
- The owned phone Metro server is restarted with `--clear` on **8081**; no
  other listener remains on 8082–8085. Its iOS manifest and fresh launch bundle
  both return **200**, with **11,448,334 characters**, the deployed HTTPS API and
  the removed spinner-position override verified. This establishes bundling;
  the owner still needs to reload and inspect the physical phone. The existing
  development-client QR remains valid at `10.0.0.200:8081`.
- Fresh `npm run check` stops at the existing four online Expo patch
  recommendations (Expo, Constants, Linking and Router). Dependency validation,
  assertions and coverage floors remain unchanged; separate code gates above
  pass. Native UI/device acceptance remains open.

Directory review: inspected the shared components, colocated typography,
identity, journey, architecture, handoff and parent docs directories. The new
shared-button regression stays beside its owner; existing responsibility groups
remain clear and no folder move improves this small refinement. Earlier phase
renumbering and unrelated local changes are preserved. No Git publication or
native build is included.

## October 14 transfer confirmation link

Anthony requested hiding the originating Transfer from another device text when
its confirmation box opens on Recover an account. The link is now absent while
that confirmation is open, including Confirm loading, and returns on Cancel or
request failure. Other recovery controls and the centered spinner are unchanged.

- The updated regression fails against the original visible-link behavior.
  Focused account/identity tests: **39 pass**. Full mobile coverage: **688 tests /
  79 suites pass**, **97.16% lines / 91.97% branches**; combined unchanged coverage
  floors pass with retained API/contracts reports (their source is unchanged).
- Mobile TypeScript, affected-file ESLint and formatting pass. Fresh
  `npm run check` still stops at the same four online Expo patch mismatches;
  validation and dependency pins remain unchanged. No backend/database behavior
  changed in this presentation refinement.
- Side-panel Browser Use **passes at 390 × 844** against a verified loopback API
  bundle: open confirmation → originating link absent → Cancel → link restored.
  No console warnings/errors or transfer-start requests occurred. The single
  registry-owned disposable account was cleaned up before fixture services
  stopped; the temporary tab closed and viewport reset.
- Screenshot: `.local/phase-08/transfer-link-hidden.jpg`. Checks and cleanup
  evidence remain ignored under `.local/phase-08/transfer-link-*`. Phone Metro
  remains on **8081**; actual native presentation/VoiceOver is not claimed by the
  browser check.

Directory review: identity presentation, its colocated account tests, the plan
and handoff directories retain their existing responsibility groups. No new
production files or folder moves are needed.

## October 14 transfer return stability

Anthony authorized committing the confirmation-link refinement; it is local
commit `fdf3e3b`. He then reported shifting content when Back returns from the
receiving code screen to Account & recovery.

Two presentation changes caused the movement: cancellation immediately removed
the outgoing code card and reintroduced the recovery form during navigation;
persisting its cleanup queue inserted a temporary pending notice above the hub's
sections, then removed it after the server replied. The receiving screen now
retains its current presentation while leaving, with its actions disabled.
Controller cancellation and server invalidation still begin immediately. Focus
restores live presentation, and background/inactive clears the retained view so
codes do not remain visible there. The hub stays quiet during cleanup; a settled
pending/failure notice appears below Account, Recovery and Devices.

- The original UI fails three regressions: outgoing Back, focus-loss replacement
  and the premature pending alert. A fourth regression protects background code
  hiding during departure. Focused account/identity checks: **43 pass**.
- Mobile/journey TypeScript, affected-file ESLint and formatting pass. Full mobile
  coverage: **692 tests / 79 suites pass**, **97.17% lines / 92.03% branches**.
  Combined unchanged coverage floors pass with retained API/contracts reports;
  backend/protocol/storage behavior is unchanged.
- Saved actual-app/API/database identity journeys: **3 pass**. The cancellation
  case holds DELETE and compares rendered bounds for all three section headings
  before transfer, while cleanup is pending and after success; bounds remain
  identical and no pending alert flashes during the held request.
- Side-panel Browser Use **passes at 390 × 844**, with the loopback API assignment
  verified before fixture creation. Heading positions remain **84 / 303 / 478 px**
  before transfer, after Back with DELETE held and after release. No console
  warnings/errors. Exact cancelled-proposal ownership/status and the one fixture
  account were verified before cleanup; both were removed, fixture services
  stopped, the temporary tab closed and viewport reset.
- Evidence stays ignored under `.local/phase-08/transfer-return-*`, including
  `transfer-return-{pending,ready}.jpg`. The owned phone Metro server is restored
  on **8081** with `--clear` and the deployed HTTPS API. Its fresh iOS manifest
  and launch bundle return **200 / 11,448,878 characters**, with the new departure
  presentation and hosted API assignment verified. Browser/component checks
  do not establish native transition-frame, gesture or VoiceOver acceptance;
  Anthony still needs to reload and inspect the physical iPhone.
- Fresh `npm run check` stops at the same four Expo patch mismatches. Dependency
  validation/pins and coverage floors are unchanged. This fix remains local;
  no additional Git publication or native build is included.

Directory review: identity presentation/account tests, navigation routes, saved
journeys, the plan and handoff directories keep their existing responsibility
groups. No new production file or folder move is needed.

## October 14 receiving-code actions

Anthony authorized committing the return-stability fix; it is local commit
`fb1911c`. He then requested removing the duplicate Transfer from another device
link below the receiving code and asked whether the other transfer actions belong
there.

The active code panel now omits both the originating transfer link and Retry
connection. Check approval & finish remains the primary action and retries the
approval/session request after waiting or connection errors. Start a new transfer
remains secondary so users can replace an expired or unwanted proposal. Retry
connection remains available when creation fails before a code appears. This
changes presentation only; controller, protocol, cancellation and storage
behavior are unchanged.

- The former UI fails four regression cases: healthy code presentation plus
  pending approval, network failure and expiry. The updated tests verify that
  approval can be retried and an expired proposal can be replaced; existing
  creation-failure coverage retains Retry connection. Focused account/identity
  checks: **46 pass**.
- Mobile TypeScript and affected-file ESLint pass. Full mobile coverage:
  **695 tests / 79 suites pass**, **97.17% lines / 92.04% branches**. Combined
  unchanged global and critical coverage floors pass with retained API/contracts
  reports; their source is unchanged. No database/backend test rerun is required
  for this presentation-only change.
- Side-panel Browser Use **passes at 390 × 844** against a verified loopback API
  bundle: open receiving confirmation → Confirm → code panel with exactly the
  approval and replacement actions → Back to the normal account hub. No console
  warnings/errors. The exact proposal's cancellation and fixture-account
  ownership were verified before both were removed; temporary services and tab
  were closed and the viewport reset.
- Screenshot: `.local/phase-08/transfer-actions-code.jpg`. Regression, bundle,
  observation and cleanup evidence stays ignored under
  `.local/phase-08/transfer-actions-*`. The phone Metro server remains on **8081**;
  its iOS manifest and current bundle return **200 / 11,448,963 characters**, with
  the new visibility condition and deployed HTTPS API verified. Anthony needs to
  reload the physical iPhone; browser evidence does not establish native UI or
  VoiceOver acceptance. Existing unowned servers on 8082/8083 are untouched.
- Fresh `npm run check` still stops at the same four online Expo SDK patch
  mismatches. Dependency pins/validation and coverage floors are unchanged; the
  separate maintenance/release task remains open. Formatting and
  `git diff --check` pass. This refinement remains uncommitted for owner review;
  no Git publication, deployment or native build is included.

Directory review: the full identity and account directories, parent docs and
handoff directories retain clear existing responsibility groups. Tests remain
beside their owner; no new file or folder move is needed for these conditionals.

## October 15 Phase 09 acceptance planning

Anthony replaced the earlier two-choice analytics plan with one Terms & Privacy onboarding acceptance for the disclosed scope. Phase 09 will remove both unavailable analytics Settings rows and will not add a later analytics prompt. The [Phase 09 planning handoff](phase-09-analytics.md) owns the scope, adapted copy and retained acceptance/account/payload safeguards. Prior two-choice descriptions in this handoff remain historical implementation/planning evidence, not current Phase 09 requirements.

This follow-up updates documentation only. Existing Settings behavior, disabled telemetry, deletion work in its separate checkout and all open Phase 08/device/release gates remain unchanged. Documentation formatting/consistency/link checks apply; no code, database or UI verification is claimed.
