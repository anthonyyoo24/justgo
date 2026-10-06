# Phase 07.1A — API and data foundation

## Snapshot

- **Status:** 07.1A passes fresh local checks and awaits owner review through existing PR #13. Only A publication is authorized; B stays local with no PR. Neither slice is approved to merge. Native/device/staging release gates remain open.
- **Updated / author:** October 4, 2026 / Codex.
- **Scope:** [07.1A](../IMPLEMENTATION_PLAN.md#phase-07-1): tasks 1–4, backend task 8, compatibility and their unit/component/database/migration checks. The saved Playwright journey, its runner/dependency/typecheck and browser CI gate are 07.1B, preserved locally without publication. Local synchronization, new flow/history UI and final removal remain 07.2–07.5.
- **Dependency:** verified local [06A](phase-06a-code-quality.md), then documentation-only planning PR #11 at `8118bf5`.
- **Branch:** `codex/phase-07.1-api-data`. All mixed drafts remain recoverable at `6d4279f` on `codex/archive/phase-07-drafts` and in the local Git bundle recorded by the umbrella handoff.
- **Environment:** Node 24.18.0 / npm 11.16.0, existing Expo 57.0.26 pins, PostgreSQL 17 loopback `justgo_test`. No deployment or new native build/signing work.
- **Browser constraint:** all interactive verification uses Codex side panels. Automated saved browser tests run headlessly; native/device acceptance is separate.

## A/B review split and current evidence

The owner requested two sequential review slices because CodeRabbit selected
107 files from the combined PR and could not review more than 100. It also
reported unavailable review credits/capacity; reducing the file count does not
establish that account capacity is available. Do not change review filters,
purchase capacity or trigger extra reviews to work around that restriction.

- **07.1A:** Existing PR #13 and `codex/phase-07.1-api-data`; API/data/migration,
  identity/HTTP, compatibility, application tests and migration/coverage CI.
- **07.1B:** Local `codex/phase-07.1b-journey-ci`; six root `e2e/` files, the
  journey environment test and runner, Playwright/lockfile/typecheck wiring,
  browser CI/artifact steps and their documentation. No B push or PR authorized.
- **Preservation:** Combined checkpoint `065846c` and verified local Git bundle
  `.local/phase-07/pre-a-b-split.bundle`. B will be based on the isolated A branch
  so its eventual diff contains only its own slice. The older mixed archive is
  unchanged. Both A and B need acceptance before 07.2.
- **Fresh A verification:** `npm run check` passed 350 cases (55 safeguards,
  45 API unit, 229 mobile, 21 contracts); `npm run test:db` passed 58 product
  database cases plus the restoration rehearsal (59 total, through 0012).
  `npm run test:coverage` passed unchanged global/critical floors: API 95.71%
  lines / 90.70% branches; mobile 87.98% / 80.35%; contracts 100% / 100%.
  Formatting and `git diff --check` passed. The A diff has 99 files against `main`.
- **UI evidence:** No application, contract, schema, migration or application-test
  content changed in this separation (compared with `065846c`). The earlier
  side-panel evidence below applies to that unchanged UI; no new interactive
  walkthrough or native verification is claimed for the split.
- **Hosted A evidence:** The current A push/PR runs are linked from
  [PR #13 checks](https://github.com/anthonyyoo24/justgo/pull/13/checks). Inspect
  those results for the actual pushed revision before acceptance; earlier
  combined CI success is not a substitute. No merge is authorized.

## October 4 PR #13 cancellation rate-limit fix

The owner authorized fixing and pushing the assessed
[CodeRabbit cancellation finding](https://github.com/anthonyyoo24/justgo/pull/13#discussion_r4179754780).
`DELETE /v1/transfers/:id` now uses the existing sensitive pre-handler, sharing
the recovery/transfer budget (default 30 requests per address per 10 minutes)
instead of relying only on the general identity limit of 120. Existing ownership
and resource-ID checks remain in effect; missing codes, wrong IDs and another
account's transfers still return the same `404 NOT_FOUND`.

The new database regression exercises all three rejected cancellation cases,
then proves that the exhausted budget blocks valid cancellation with typed
`429 RATE_LIMITED` and `Retry-After: 600`. Transfer inspection shares that budget;
ordinary authenticated session reads remain available. The blocked cancellation
leaves the transfer intact, and cancellation from a fresh address still succeeds.
The focused regression failed before the route fix (`200` instead of `429`) and
passed afterward. Run it from `apps/api` with:

```sh
node --env-file-if-exists=.env ../../node_modules/vitest/vitest.mjs run tests/identity.integration.test.ts -t 'shares the sensitive budget'
```

Fresh follow-up verification passed:

- `npm run check`: contracts build, typechecks, lint, formatting and 350 tests
  (55 safeguards, 45 API unit, 229 mobile and 21 contracts).
- `npm run test:db`: 59 product database cases plus the migration/restoration
  rehearsal, 60 total, against dedicated loopback `justgo_test` through 0012.
- `npm run test:coverage`: all unchanged global/critical floors pass; API
  95.71% lines / 91.15% branches, mobile 87.98% / 80.35%, contracts 100% / 100%.
- The PR diff remains 99 files against `main`. Hosted checks for the follow-up
  push must be read at the pushed revision through [PR #13 checks](https://github.com/anthonyyoo24/justgo/pull/13/checks);
  these local passes do not claim a hosted result.

This backend-only change needs no interactive UI walkthrough; earlier side-panel
evidence and open native/device/staging gates are unchanged. Keep B local and
incorporate the reviewed A fixes when preparing B; no merge is authorized.

The separate [docstring warning](https://github.com/anthonyyoo24/justgo/pull/13#issuecomment-5985250582)
was assessed as requiring no change: CodeRabbit's inconclusive 80% function-comment
target is not the repository's test-coverage policy. No blanket comments were
generated and no coverage thresholds or review settings were weakened.

## Implemented boundary

Identity now uses noun resources for sessions, credentials, devices and transfers.
Persisted identity proposals/proofs remain compatible; older running clients
still require a coordinated API/mobile identity update. Legacy identity action
routes return 404. HTTP methods include PATCH/DELETE; bodyless requests omit JSON
content type. Parser failures retain typed 413/415 statuses and cannot enter the
GET transient retry path. Rate-limit responses expose Retry-After through CORS.

| New route                                  | Behavior                                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/challenges`                       | Ordered current catalog, all six venues, canonical wording and active placements.                                                                          |
| `POST /v1/attempts`                        | Completed-only, caller UUID, owner from verified session, captured start instant/zone, immutable matching replay. First creation 201; matching replay 200. |
| `PATCH /v1/attempts/:id`                   | Initial optional feeling/text or later text-only reflection; immutable feeling after submission; expected revision plus stable submission UUID.            |
| `GET /v1/progress/summary?timeZone=…`      | Overall totals/streaks, today and month-boundary streak context.                                                                                           |
| `GET /v1/progress/calendar?month=…`        | Month counts only; does not recalculate the summary.                                                                                                       |
| `GET /v1/attempts?date=…&limit=…&cursor=…` | Completed owner history, current wording, nested reflection, precise start-time/UUID pagination.                                                           |

A PATCH receipt records only owner/submission/attempt IDs, normalized input digest
and applied revision. Replay returns the current canonical attempt together with
the original acknowledgement revision, so an older retry cannot overwrite newer
content. A genuine revision conflict returns typed `REFLECTION_CONFLICT` with
the latest owner-scoped attempt. The backend-wins client reconciliation is owned
by 07.2; no attention/review UI is added here. Cross-owner requests cannot obtain
that content. Product writes serialize through the existing account lock.

Current paid access and earlier-upload eligibility are separate injected readers.
The upload reader receives the authenticated owner and submitted start instant;
07A must connect verified historical coverage without provider I/O inside the
transaction. New writes default closed without that provider. Existing accepted
UUIDs remain replayable. The future-start tolerance is five minutes. Offline
start dates are a trusted client assertion within verified coverage, not proof
that a deliberate backdate can be detected. Billing integration is not claimed.

## Temporary compatibility through 07.5

| Retained surface                                                                     | Bridge and retirement owner                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Challenge state/queue/venue/skip/start/finish/attempt routes                         | Existing app keeps its server-confirmed flow. New completed-only records are excluded from legacy lifecycle continuation. 07.3 converts callers; 07.5 removes routes.                                                                                       |
| Reflection GET/draft/final/skip routes and receipts                                  | Only final submissions mirror inline content/revision. Draft/skip never become submissions. Reads prefer canonical submissions; stale legacy input cannot replace one. Exact old receipts still replay. 07.3 converts callers; 07.5 removes storage/routes. |
| Combined Progress and `/days/:date`                                                  | Includes canonical reps using actual start timestamps and nullable obsolete metadata; old rows preserve their recorded completion display. 07.4 converts callers; 07.5 retires bridge.                                                                      |
| `Legacy*` shared schemas/types                                                       | Existing mobile imports explicitly alias these contracts. Canonical names are reserved for new consumers. Both domain protocols appear in OpenAPI, with old routes deprecated.                                                                              |
| Queues/preferences/skips, revisions, separate reflections and legacy attempt columns | Kept in the registered expansion. No final removal is authorized by 07.1 acceptance.                                                                                                                                                                        |

Mobile changes outside identity/HTTP are contract aliases and the minimum Progress
row timestamp/null-field compatibility. No AsyncStorage, Zustand, NetInfo or
Sonner dependency is introduced here. Their earlier compatibility preflight is
historical; verify exact versions again in the consuming subphase.

## Migration sequence and restoration

Registered SQL 0000–0009 is unchanged. Missing Drizzle snapshots 0007–0009 are
reconciled to the actual applied schema and checked against PostgreSQL by the
rehearsal. A metadata unit test guards both the existing SQL hashes and current
schema/snapshot equality. `0010_attempt_resources_expand` and the forward index
alignment `0011_compatibility_history_index`, followed by data-only
`0012_normalize_reflection_whitespace`, are newly registered.

Expansion selects canonical wording through live placement revisions (including
BC-10 v2), failing on ambiguous current choices instead of choosing by lexical
ID. It retains inactive historical references. Historical completed IDs, owners,
start timestamps, activity dates, challenge/level references, feelings and
revisions are preserved. Nonblank submitted text is copied byte-for-byte; 0012
normalizes whitespace-only text to null using the same character set as
JavaScript trim, keeping legacy input_method consistent. It rejects an invalid
blank-only/no-feeling submission before updates instead of silently deleting it.
Receipt payloads/digests and historical revisions/timestamps remain unchanged.
Legacy start zone is unknown, so
`start_time_zone` stays null and the old completion zone is a separate display
fallback. Drafts/skips stay unsubmitted. Active/given-up rows stay legacy-only.

Canonical rows use null obsolete lifecycle fields; no invented completion time,
card/revision or queue identity. Targeted receipts have owner RLS, an attempt
foreign key and least-privilege runtime grants. The completed history index uses `(user_id, coalesce(activity_date,
completion_date), started_at, id)` to match compatibility reads; challenge indexes
support canonical joins. 0011 changes the initial plain-date index without
rewriting already-applied 0010. Legacy completion and final-reflection writers update
canonical columns transactionally during the compatibility interval.

`npm run test:migrations` is the disposable preservation/restoration procedure:

1. Create a uniquely named schema inside the guarded loopback `justgo_test`, apply
   original 0000–0009 and compare PostgreSQL tables, columns, constraints, policies
   and indexes with the repaired snapshots.
2. Seed synthetic feeling-only, text-only, combined, draft, skip, active/given-up
   and same-UUID/different-owner history. Capture the pre-expansion SQL snapshot
   with PostgreSQL 17 `pg_dump` and compare ordered canonical ownership/content
   projections before and after 0010.
3. Rehearse `scripts/rehearsals/phase07-contraction.sql` only on that disposable
   copy; verify completed history and receipt isolation survive.
4. Restore the pre-expansion snapshot with PostgreSQL 17 `psql`, recheck the old
   schema/data, reapply expansion/index alignment/blank normalization and compare
   again. Remove only the unique rehearsal schema and its temporary snapshot.

Exact saved comparison queries are in `legacyRows` and `canonicalRows` in
[`migrations.integration.test.ts`](../../apps/api/tests/database/migrations.integration.test.ts);
they compare owner/ID/reference/date/start-zone/content/revision projections.
The test also checks counts, schema metadata, ambiguity rollback and RLS, plus
blank normalization and atomic rejection of invalid blank-only/no-feeling
submissions in both representations. Nonblank whitespace is preserved exactly;
accepted receipts and revisions/timestamps do not change.

The proposed contraction is outside the Drizzle journal and guarded by a test
DB/explicit rehearsal setting. It is not a deployment command. 07.5 must stop old
writers, compare both protocols again, generate/review final metadata and accept
removal of old state. Before a real cutover, take a protected restorable backup;
use a new forward-repair migration on failure. Do not reset a deployed database
or blindly revert to pre-07.1 app writers after accepting canonical records.
Coordinated release rollout and old-client retirement remain Phase 09 work.

## Saved journey foundation — 07.1B, local only

This section describes the preserved B implementation. The command, dependency
and CI step are absent from A and must be verified when B is authorized for review.

`npm run test:journey` validates fixture scope, builds contracts, migrates, starts
its API and Expo services, creates/renews an actual app account, opens the deck
and Progress, verifies database state, and removes only its fixture accounts.
Playwright 1.63.0 is development-only and pinned in the root lockfile. The
B's testing guide owns clean local and CI prerequisites and masked-artifact handling. Full completion/reflection,
offline/lost-acknowledgement and reconciliation journeys are added in 07.2–07.5.

## Historical combined A+B verification evidence

These checks and screenshots were recorded before the review split. A's fresh
results are recorded above; B remains a local-only review slice.

| Check                                                                                  | Result                                                                                                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                                                                        | Passed contracts build, API/mobile/contracts/journey typechecks, lint, formatting and 351 tests: 56 safeguards, 45 API unit, 229 mobile, 21 contracts. |
| `npm run test:db`                                                                      | Passed 58 product database cases in six suites plus one complete migration/restoration rehearsal (59 total), through 0012.                             |
| `npm run test:coverage`                                                                | Passed unchanged global and critical-file floors; no exclusions or thresholds lowered.                                                                 |
| `npm run test:journey`                                                                 | Passed the saved actual app/API identity-renewal/catalog/Progress smoke; services started and cleaned up by the harness.                               |
| `npm run export:web -w @justgo/mobile -- --output-dir /tmp/justgo-phase071-export-web` | Passed.                                                                                                                                                |
| Corresponding `export:ios` to `/tmp/justgo-phase071-export-ios`                        | Passed JavaScript/native-asset bundle export; not a native build.                                                                                      |
| `npm run doctor -w @justgo/mobile`                                                     | Passed all 21 checks.                                                                                                                                  |
| `git diff --check`                                                                     | Passed.                                                                                                                                                |

Coverage: mobile 87.98% lines / 80.35% branches / 86.12% statements / 82.64%
functions; API 95.71% / 90.70% / 94.90% / 96.07%; contracts 100% across all four.
API coverage now executes the declarative schema through its metadata comparison,
so the higher percentage is not a performance claim. The new attempts and split Progress resource files reached 100% measured
line/branch coverage. Remaining API gaps are in boot/configuration and defensive
error paths; mobile retains earlier route-wrapper, gesture/presentation and
interruption gaps. Ownership, replay, historical preservation and read/write
compatibility have behavior-level database evidence.

The final side-panel walkthrough at 390×844 used a disposable account: create and
renew session, load deck, accept challenge, complete, submit synthetic feeling/text,
open Progress and expand the saved reflection. A database comparison confirmed
matching canonical/legacy dates, submitted feeling/text and revisions. The preview
then showed a canonical row with null completion/card/revision fields at **12:40
PM**, alongside legacy rows at **9:15 AM** and **6:10 PM**. The test account and
servers were cleaned up, tab closed and viewport override reset. Screenshots are
local ignored evidence at `.local/phase-07/side-panel-progress.jpg` and
`.local/phase-07/side-panel-canonical-history.jpg`.

This walkthrough is separate from the saved identity/catalog test; it does not
claim a full saved offline/completion journey. Expo's optional local `simctl`
discovery reports unavailable while the web journey succeeds; native evidence
remains open. No external browser window or simulator was used.

The code was published in [PR #12](https://github.com/anthonyyoo24/justgo/pull/12)
and merged without the owner's permission. At the owner's request, revert
`7845ac4` restored `main` to its pre-07.1 files, and `c355ef0` added explicit
publication/merge permission rules to `AGENTS.md`. The implementation is preserved
locally on `codex/phase-07.1-api-data`, based on that restored `main`, for owner
review. The owner has now explicitly authorized pushing that branch and narrowing
existing PR #13 to A. Keep B local with no PR. Leave A open for review; do not merge or enable auto-merge without
separate explicit permission. The prior checks
below are verification evidence only; they are not owner acceptance.
The final implementation commit `0d750a3` passed both the hosted
[push workflow](https://github.com/anthonyyoo24/justgo/actions/runs/37229717512)
and [PR workflow](https://github.com/anthonyyoo24/justgo/actions/runs/37229720097),
including clean dependency install, PostgreSQL 17 tooling, migrations/restoration,
coverage, saved journey, both bundle exports and Expo Doctor. The earlier
`e571679` runs also passed. Any future publication or merge requires explicit owner permission;
passing checks cannot authorize it. CodeRabbit reported a skipped review (its status is not an
approval); independent agent reviews covered API/ownership/replay, migration
preservation, fixtures/CI and documents, with no remaining 07.1 blocker.

## Issues and remaining work

- Final reconciliation found legacy database constraints permit whitespace-only
  submitted text even though the old API normalizes it. Forward migration 0012
  closes that historical-data gap; its rehearsal covers spaces, control/Unicode
  whitespace, exact nonblank content and atomic rejection of invalid empty
  submissions.
- Review caught a current-streak bug when an ahead-zone rep has a frozen date
  later than the viewer’s today. Both summaries now truncate only the current
  streak calculation to today; counts, recorded dates and best streak remain
  intact. The regression uses Honolulu yesterday/today and Kiritimati tomorrow.
- Migration rehearsal caught PostgreSQL truncating a generated receipt FK name;
  the declarative schema/SQL/snapshot now use an explicit short name.
- A review found PostgreSQL connection-string query overrides could bypass a
  naive loopback URL guard. Journey/rehearsal guards now reject query strings,
  fragments and non-PostgreSQL schemes, with regression coverage.
- Initial harness runs exposed conflicting terminal-color flags and an npm 143
  shutdown diagnostic. Child environment normalization and direct fixture startup
  with awaited SIGINT/SIGTERM cleanup removed those diagnostics. Four controlled
  signal tests cover both signals, repeated signals and redacted close failures.
- Journey cleanup originally expected a nonexistent bootstrap credential ID;
  it now tracks only the actual bootstrap session UUID, avoiding credential logs.
- Await the owner's review of 07.1 and address any findings before acceptance.
  Obtain explicit permission before pushing, creating a PR or merging. After A is approved/merged and B is explicitly authorized, verify/review B.
  Proceed to 07.2 only after both slices are accepted and the owner instructs
  continuation; recover useful journal/sender drafts selectively. Do not merge the archive wholesale or remove compatibility
  before 07.5.
- Before using canonical writes, 07.2 must extend the mobile HTTP transport to
  preserve typed `REFLECTION_CONFLICT.currentAttempt` and the `Retry-After`
  header, with parsing/retry regression tests. The current strict identity-only
  error parser cannot carry that new conflict body; retained legacy callers do
  not receive it. The sender must consume both before backend-wins recovery and
  scheduled retry acceptance.
- 07.4 must apply the same current-streak rule in its local selector: ignore
  dates after summary.today only for current streak, preserving counts and best
  streak. This is part of the existing travel/rollover acceptance task.
- Keep the original device, Keychain, native accessibility/storage/gesture and
  staging gates open in their source handoffs and Phase 09. Browser evidence and
  bundle exports do not close them.
