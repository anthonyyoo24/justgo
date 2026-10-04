# Phase 07.1 — API and data foundation

## Snapshot

- **Status:** Locally verified; pull request and hosted CI acceptance pending.
- **Updated / author:** October 4, 2026 / Codex.
- **Scope:** [07.1](../IMPLEMENTATION_PLAN.md#phase-07-1): tasks 1–4, backend task 8 and saved journey foundation. Local synchronization, new flow/history UI and final removal remain 07.2–07.5.
- **Dependency:** verified local [06A](phase-06a-code-quality.md), then documentation-only planning PR #11 at `8118bf5`.
- **Branch:** `codex/phase-07.1-api-data`. All mixed drafts remain recoverable at `6d4279f` on `codex/archive/phase-07-drafts` and in the local Git bundle recorded by the umbrella handoff.
- **Environment:** Node 24.18.0 / npm 11.16.0, existing Expo 57.0.26 pins, PostgreSQL 17 loopback `justgo_test`. No deployment or new native build/signing work.
- **Browser constraint:** all interactive verification uses Codex side panels. Automated saved browser tests run headlessly; native/device acceptance is separate.

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
schema/snapshot equality. `0010_attempt_resources_expand` and the forward index alignment
`0011_compatibility_history_index` are newly registered.

Expansion selects canonical wording through live placement revisions (including
BC-10 v2), failing on ambiguous current choices instead of choosing by lexical
ID. It retains inactive historical references. Historical completed IDs, owners,
start timestamps, activity dates, challenge/level references and submitted
feeling/text/revisions are copied exactly. Legacy start zone is unknown, so
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
   schema/data, reapply expansion/index alignment and compare again. Remove only the unique
   rehearsal schema and its temporary snapshot.

The proposed contraction is outside the Drizzle journal and guarded by a test
DB/explicit rehearsal setting. It is not a deployment command. 07.5 must stop old
writers, compare both protocols again, generate/review final metadata and accept
removal of old state. Before a real cutover, take a protected restorable backup;
use a new forward-repair migration on failure. Do not reset a deployed database
or blindly revert to pre-07.1 app writers after accepting canonical records.
Coordinated release rollout and old-client retirement remain Phase 09 work.

## Saved journey foundation

`npm run test:journey` validates fixture scope, builds contracts, migrates, starts
its API and Expo services, creates/renews an actual app account, opens the deck
and Progress, verifies database state, and removes only its fixture accounts.
Playwright 1.63.0 is development-only and pinned in the root lockfile. The
[testing guide](../TESTING.md#saved-appapi-journey-foundation-071) owns clean local
and CI prerequisites and masked-artifact handling. Full completion/reflection,
offline/lost-acknowledgement and reconciliation journeys are added in 07.2–07.5.

## Verification evidence

| Check                                                                                  | Result                                                                                                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check`                                                                        | Passed contracts build, API/mobile/contracts/journey typechecks, lint, formatting and 351 tests: 56 safeguards, 45 API unit, 229 mobile, 21 contracts. |
| `npm run test:db`                                                                      | Passed 58 product database cases in six suites plus one complete migration/restoration rehearsal (59 total), through 0011.                             |
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

Hosted CI results and PR URL will be recorded before checkpoint acceptance.

## Issues and remaining work

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
- Inspect the pushed commit’s hosted checks and review before marking this
  checkpoint complete. The local gates and side-panel checks above passed.
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
