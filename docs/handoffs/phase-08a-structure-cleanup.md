# Phase 08A — Structure, docs and tooling cleanup

## Summary and status

Local implementation is ready. Owner review,
publication, hosted CI and approved repository cleanup remain open. Phase 08's
acceptance is recorded in its [handoff](phase-08-settings-privacy.md); the
[Phase 08A plan](../implementation-plan/phase-08a-structure-cleanup.md) owns scope.

## Decisions and why

- Named phase files own scope, handoffs own results, architecture guides own the
  implemented system and proposals own unbuilt designs. The original plan remains
  a compatibility index.
- Archive only handoffs whose work and gates are complete. Earlier feature,
  folder-cleanup, performance and native-testing handoffs retain their open gates.
- Keep one reviewable change per numbered step and separate moves from behavior.
  The unknown-link fix belongs to the route step so each candidate preserves entry.
- Five independent CI producers feed the existing required `checks` status.
  Merge API execution maps from disjoint unit/database suites before enforcing
  unchanged all-source and critical coverage floors. A partial producer set fails.
- Optional compiler/hook work remains conditional on measured benefit.
- Preserve native-billing work and local refs whose integration is unproven.
  The stash's unique EAS release-workflow decision is restored in DECISIONS;
  other planning content is already represented or superseded. Named deletion
  approvals remain required before dropping the stash or cleaning local refs.

## Behavior that changed

- Documentation uses concern-based owners. Source design material moves to
  `design/source`; routine evidence and third-party references stay local.
- Home alone owns `/`; `/access` is the unprotected startup gate. Account tools
  use static routes; challenge routes share a group without an extra native
  layout. Unknown-link recovery enters the gate rather than a protected route.
- Mobile feature/platform groups match the folder guide. Identity presentation
  receives its controller and separates transfer, controlled recovery input and
  confirmation ownership; actions use stable IDs. API reads sit with their owners.
- API domains own routes/services, tests mirror source owners, and shared HTTP
  plumbing is separate. OpenAPI has an API-only entry and route-alignment test.
  Rate limits return their remaining window. Diagnostics allowlist SQLSTATE and
  migration tags without changing SQL, transaction scope or migration history.
- The HTTP client fetches its admitted canonical URL. Media/status checks keep
  proxy or malformed bodies from becoming credential failures, while retaining
  validated API errors, cancellation, deadlines and bounded replay.
- Production mobile types exclude Jest/Node globals; tests use a separate program.
  Targeted typed, React and Testing Library rules guard behavior. Split suites
  retain their cases and the migration rehearsal remains ordered. Progress
  journeys exercise the previous month on every run.
- The normal exported-web smoke verifies routes/assets with zero API traffic.
  CI adds shared setup, versioned browser caching, bounded workers/timeouts,
  immutable action pins, dependency updates and an API production-only audit.

## Invariants to preserve

- Identity, deletion, activity, access, privacy and native safety rules remain in
  their architecture owners. Cleanup must preserve accepted input and credentials.
- Keep URLs/native stack behavior except the approved gate move. Deletion guards
  remove the deleted account's screens from Back history.
- Keep existing coverage floors and all production source, including untouched
  files. Merge execution maps, never overlapping coverage summaries.
- Retain fixture origin/database/account isolation and earlier device/release gates.

## Problems that could recur

- Moves require imports, loaders, assets, coverage, fixtures, deployment and links
  to change together. Cold exports do not refresh a running Metro graph; restart
  the owned server with `--clear` before reloading the installed app.
- Replacing an unknown URL with protected `/` can do nothing when access is closed;
  use the unprotected gate to resolve the current account/access destination.
- Syntax-only lint fixtures disable typed rules only when deliberately running
  without a TypeScript project. Typed negative fixtures keep those rules active.
- CI regressions must follow shared setup actions and verify the producer that
  consumes them. Missing, skipped, cancelled or failed producers cannot pass.
- Fresh Doctor/audit metadata and hosted runners remain external dependencies;
  local success does not establish hosted acceptance or a measured CI speedup.

## Setup or environment changes

- Read the [documentation map](../README.md), [folder guide](../architecture/FOLDER_STRUCTURE.md)
  and [testing guide](../operations/TESTING.md) for owners, commands and import policy.
- Design sources stay outside native uploads. Ignored evidence is not a checkout
  or CI prerequisite. Deployment includes production contract folders and excludes
  tests, fixtures, generated output and secret-bearing file patterns.
- Mobile typechecking generates ignored Expo route declarations before both
  source/test programs. Node types match Node 24; Jest uses one local worker and
  two in CI. Run the exported-web smoke before iOS export replaces its output.
- CI provisions isolated PostgreSQL 17 roles and snapshot tools explicitly, caches
  browser binaries by version and installs Linux browser dependencies on cache hits.

## Open gates

| Gate                                                         | Owner                                                               | Required step/phase | Done when                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------- |
| Publication and hosted CI for each candidate                 | Anthony authorizes each Git action; implementation owner verifies   | 08A                 | Actual authorized candidates have inspected passing hosted checks |
| Local branch/worktree deletion and billing stash disposition | Anthony approves each named deletion; implementation owner executes | 08A step 8          | Reviewed cleanup is explicitly approved and completed             |
| Earlier physical-device, staging and release acceptance      | Existing phase owners                                               | 09–11               | Original handoff/release requirements are evidenced               |

## Final verification

October 17, 2026: `npm run check` with fresh online Expo Doctor,
`npm run test:db` including the ordered migration rehearsal,
`npm run test:coverage`, `npm run test:journey`, `npm run test:exported-web`, and
cold web/iOS exports passed locally. The actual split API unit/database coverage
producers and fresh execution-map merge passed `npm run coverage:check` with all
source and existing global/critical floors retained. The scoped API audit passed.

Side-panel walkthroughs verified moved screens and production Settings/unknown-link
recovery. Installed iOS simulator checks covered launch, self-device sign-out,
account switching and first/repeated challenge flow, followed by a fresh app reload
after the clear-cache mobile-move restart. The starting account was restored.
Native bundle/source-map inspection excluded OpenAPI while retaining public contracts.
These are distinct from physical-device and hosted acceptance.

Phase 08A CI link: pending authorized publication; no hosted result is claimed.
