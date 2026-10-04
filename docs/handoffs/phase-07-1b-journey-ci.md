# Phase 07.1B — Saved app/API journey and CI

## Snapshot

- **Status:** Fresh local checks passed; push and PR authorized. Owner review and
  separate merge approval remain open. No auto-merge is authorized.
- **Branch:** `codex/phase-07.1b-journey-ci`, rebased onto updated `main` at `806f57f`.
- **Dependency:** The owner merged 07.1A through [PR #13](https://github.com/anthonyyoo24/justgo/pull/13),
  including the cancellation rate-limit fix. B's PR targets `main` and contains
  only B's changes. Both slices must be accepted before 07.2.
- **Source:** Combined implementation `065846c`, retained in the verified local
  `.local/phase-07/pre-a-b-split.bundle`. No functionality is discarded by splitting.
- **Environment:** Node 24.18.0 / npm 11.16.0, Playwright 1.63.0, existing Expo 57
  pins and PostgreSQL 17 loopback `justgo_test`.

## Implemented boundary

B adds the six root `e2e/` files, journey environment regression test and runner,
Playwright development dependency/lockfile, root journey/typecheck scripts,
and CI browser install, actual app/API smoke and masked-artifact upload steps.
The existing mobile Maestro launch flow is unchanged.

The saved smoke creates and renews a disposable app account, opens its challenge
deck and Progress, asserts database state and cleans only its own fixture accounts.
Guards require the dedicated loopback `justgo_test` database, isolated runtime
and migration roles and a nonproduction environment. No real credentials or
private reflections belong in artifacts. API fixture guards/shutdown helpers,
migration restoration and PostgreSQL 17 tooling were accepted in A.

## Verification

Fresh B verification against merged `main` at `806f57f`:

- `npm ci`: clean lockfile install and contracts build passed using existing caches.
- `npm run check`: passed build, workspace/journey types, lint, formatting and
  351 tests (56 safeguards, 45 API unit, 229 mobile, 21 contracts).
- `npm run test:db`: passed 59 product cases and one migration/restoration case
  against dedicated loopback `justgo_test` through migration 0012.
- `npm run test:coverage`: unchanged global/critical floors passed; API 95.71%
  lines / 91.15% branches, mobile 87.98% / 80.35%, contracts 100% / 100%.
- `npm run test:journey`: one saved account/renewal/challenge-deck/Progress test
  passed with real API/database fixtures. Both fixture services stopped afterward.
- Failure probe: temporarily changed the final database count assertion from
  zero to one. The command exited 1 at that assertion and produced the configured
  masked screenshot. Restored the assertion and reran successfully. Database
  account count returned to the original 17 disposable accounts after failures
  and the final pass; no fixture listener remained on ports 3000 or 8081.
- The failure probe caught an HTML reporter path error: Playwright resolves its
  output folder relative to the config directory, so the initial report was in
  `e2e/.local/journey-report`, outside CI's upload path. Corrected it to the root
  `.local/journey-report` and repeated the failure probe and normal run. CI now
  asserts that `.local/journey-report/index.html` exists and is nonempty after
  the smoke, so that artifact-path regression fails the hosted gate.
- The code/harness diff against `main` is 16 files. Hosted B results remain
  pending until the pushed revision runs; inspect its actual workflow before
  claiming the CI gate passed.

The clean install reported 65 dependency audit findings (15 moderate, 50 high)
and pending install-script policy notices for esbuild/fsevents. This PR does not
remediate those dependencies or claim an audit pass. Expo also reported that the
local `simctl` command was unavailable; headless web runs passed, and no native
verification is claimed.

The harness/code/config originated in previously verified combined source
`065846c`; those earlier checks are historical and do not substitute for B's
independent results. A's latest checks passed 350 workspace tests, 60 database
and migration cases and unchanged coverage requirements.

Automated browser tests run headlessly. Interactive verification stays in Codex
side panels. B changes the test harness and CI only, with no production UI
behavior changes; no new interactive walkthrough or native evidence is claimed.

## Remaining work

- Publish B's separately authorized PR against `main` and record actual hosted
  results. Passing checks do not authorize merging; leave the PR for owner review.
- Extend the smoke to full completion/reflection/offline/reconciliation journeys
  in 07.2–07.5. This foundation is not the final full-journey acceptance gate.
- Native/device/staging checks remain open in their existing phase handoffs.
