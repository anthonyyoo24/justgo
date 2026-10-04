# Testing and quality safeguards

Read [AGENTS.md](../AGENTS.md) before editing and the applicable phase handoff.
The [Phase 06A handoff](handoffs/phase-06a-code-quality.md) records the measured
baseline, changes and browser evidence. Tests protect current behavior; Phase 07
owns API/offline changes and Phase 07A owns billing.

## Commands

Use the pinned Node/npm versions in README. Run heavy commands sequentially on
the development Mac.

```sh
npm run check
npm run db:local
npm run db:migrate
npm run test:db
npm run test:coverage
npm run export:web -w @justgo/mobile
npm run export:ios -w @justgo/mobile
```

`check` builds contracts, typechecks, lints, checks formatting and runs architecture,
API unit, mobile component/controller and contract tests. `test:db` exercises real
PostgreSQL transactions, ownership, isolation, idempotency, reflections and history,
then runs the isolated migration/restoration rehearsal.
It refuses non-loopback hosts and databases other than the disposable `justgo_test`.
Never point fixtures at staging/production or real private data.

For quick feedback, pass `-- --runTestsByPath src/...test.tsx` to the mobile test
script or `-- path/to/test.ts` to the API/contracts Vitest scripts. Run focused
checks during each extraction and the full commands before handoff.

`test:coverage` builds contracts, runs each workspace sequentially and enforces
`scripts/coverage-thresholds.json` through `coverage:check`. The API coverage run
includes the database suites and migration rehearsal plus unit tests, so it requires the same migrated
local database. Individual workspace `test:coverage` commands produce reports;
run the root command for the combined gate. Reports are ignored generated output
under `coverage/{mobile,api,contracts}/`: HTML, LCOV and count-based JSON summaries.
CI runs the same gate after provisioning/migrations and uploads reports even on
failure. The V8 provider is pinned to the existing Vitest version; Jest uses its
existing Istanbul support. No production dependency was changed.

Both database tests and API coverage require `DATABASE_URL` for the restricted
runtime role, `MIGRATION_DATABASE_URL` for fixture setup/cleanup, and the local SSL
setting. CI reuses one database environment mapping for migrations/database tests
and coverage, so those steps cannot drift apart. Ignored local `.env` files are
absent from a fresh runner: check each new CI command's full prerequisites and
inspect the hosted result for the pushed commit before calling its gate verified.
Keep the loopback/test-database safeguards enabled.

## Coverage policy

All `src/**/*.ts` / mobile `src/**/*.tsx` production files are included, even when
not imported by tests. Only test files and declaration-only `.d.ts` files are
excluded within those trees. Route wiring, development previews, API bootstrap
and the Drizzle schema stay visible, including zeros. Configuration, build scripts,
SQL, assets and Swift are outside this JavaScript coverage metric; use architecture
tests, database tests, bundle exports and native/device evidence for those areas.
No blanket 100% goal or ignore-coverage pragmas are used.

| Workspace             | Branch floor | Line floor | Statement floor | Function floor |
| --------------------- | -----------: | ---------: | --------------: | -------------: |
| Mobile                |          79% |        85% |             84% |            80% |
| API (unit + database) |          82% |        84% |             83% |            76% |
| Contracts             |          95% |        95% |             95% |            95% |

Floors were selected from the fresh 06A baseline/final runs with less than one
percentage point of branch headroom. Critical-file floors apply independently:
provider and native vault 95% branches/lines; account client 85% branches / 95%
lines; HTTP 82% / 94%; Progress as a group 90% / 92%. Existing controllers also
have separate floors so higher presentation coverage cannot hide regressions.
Database service branch floors are 85% for identity/challenges and 95% for
reflections/history. The JSON file owns exact thresholds.

The checker uses covered/total counts (not rounded percentages), weights grouped
files by branch count and fails when a critical path or all source entries are
missing. Zero-total metrics are valid only in a report containing source files;
an empty report cannot satisfy the gate. Its own tests protect those failure
modes. Keep these floors or ratchet them upward as behavior
coverage improves. A moved file must update its selector. Explain any justified
threshold/exclusion change in the handoff/PR with before/after reports; do not lower
floors to make failing changes pass. Review uncovered _behaviors_, not just totals:
executing a Zod schema declaration can give full line coverage without testing its
validation. Contract validation and owner-isolation tests remain required evidence.

## Async tests and UI evidence

Provider tests mount the actual provider, identity/controller and account client,
using controlled vault/fetch/native AppState doubles. Fake timers control polling
and expiry; unmount/cancel/clear and flush queued callbacks before restoring them.
Progress query tests retain one controllable promise for a request and await the
visible result. Before changing an account's transport fixture, await its previous
focus refresh; observe the new account's request before resolving it and assert
the new account's distinct totals. Fake timers control scheduled TanStack
notifications; drain them inside async React `act` after unmount/cancel/clear,
before restoring the global notifier and real timers. Do not suppress console
warnings or use arbitrary waits.
Keychain adapter tests prove JavaScript payload validation and module/error wiring;
they do not prove native entitlements, Apple synchronization or physical recovery.

After tests pass, verify affected UI with Browser Use in the in-app side panel and
fix/retest issues. Honor task-specific browser preferences; when the owner requests
side-panel-only testing, document unavailable capabilities instead of switching
to an outside Chrome window. Use the isolated `dev:challenges` entrypoint for live disposable
accounts and `/preview` for named loading/error presentation fixtures. Preview data
never creates user activity or grants production access. Record actual viewport,
flow, fixtures, failures and recovery; keep automated/browser/native claims separate.
The earlier physical-device and staging gates remain in their original handoffs.

Phase 07.1 is split for review. **07.1A** retains application/unit/component,
database, migration-restoration and coverage gates. The **07.1B** saved app/API
journey is on `codex/phase-07.1b-journey-ci`, now authorized for a separate PR
against `main` after the owner merged A through PR #13.
Its root `e2e/` files, environment-guard test, runner, Playwright dependency,
journey typecheck/scripts and browser CI/artifact steps move together. They are
not part of A; `npm run test:journey` is available only on B. No review filters or
coverage floors were weakened to meet the file limit.

B must verify clean service startup/cleanup, disposable accounts/access fixtures,
masked failure artifacts and the actual identity-renewal/catalog/Progress smoke,
then verify its published CI step on the pushed revision. Full completion,
reflection and offline/history journeys remain 07.2–07.5. A one-off side-panel
walkthrough and A's lower-level tests do not replace B's saved journey gate.
Complete both A and B before proceeding to 07.2. The existing mobile Maestro
launch flow is unchanged.

## Saved app/API journey foundation (07.1B)

The owner merged A through PR #13 at `806f57f` and authorized B's push and PR
against updated `main`. The B diff contains only its harness, CI and documentation.
B still requires owner review and separate merge approval. Historical combined
verification does not establish B acceptance.

Use Node 24 and the root lockfile, PostgreSQL 17 tools (including `pg_dump` and
`psql`), and the dedicated database prepared by `npm run db:local`. Install the
pinned Playwright Chromium once with `npx playwright install chromium`; Linux
CI uses `npx playwright install --with-deps chromium`. Then run:

```sh
npm run test:journey
```

The wrapper validates the loopback `justgo_test` database, restricted runtime and
migration roles, local SSL setting and nonproduction environment **before**
migration or service startup. It builds contracts, applies migrations, starts the
isolated fixture API on 127.0.0.1:3000 and Expo on 127.0.0.1:8081, runs the saved
test and shuts its services down. Keep both ports free; it refuses to reuse an
unknown running server. Local settings come from the ignored `apps/api/.env`;
CI supplies the same explicit database mapping used by database/coverage tests.

The saved case creates and renews a real disposable account in the app, opens its
challenge deck and Progress, and checks the database. Fixture cleanup deletes
only accounts identified by this test's bootstrap session UUIDs. The dedicated
fixture server grants isolated test access and upload eligibility; deployed API
startup has no such provider. Browser storage remains memory-only in 07.1.

This automated browser runs headlessly. Interactive walkthroughs use the Codex
side panel, under the same fixture API/Expo configuration. These are separate
evidence types; neither proves native Keychain behavior. No external browser
window is required. Later subphases extend this harness with local storage,
controlled failures, completion/reflection and Progress assertions.

Failure output is under `.local/journey-results` and `.local/journey-report`.
Network traces, videos and automatic screenshots are disabled because they can
retain credentials. The fixture captures a masked UI screenshot on failure;
never add real account data or token logging. Both test failure and service
startup failure make the command fail. CI uploads these artifacts and enforces
the saved smoke step alongside the existing checks. CI also requires a nonempty
`.local/journey-report/index.html`, preventing a report-directory mismatch from
silently dropping the HTML report and its screenshot attachments.

## Migration preservation rehearsal (07.1)

`npm run test:migrations` runs the standalone rehearsal; `test:db` includes it.
It builds migrations 0000–0009 in a uniquely named disposable schema within
`justgo_test`, compares the restored Drizzle metadata with PostgreSQL, seeds
synthetic history and creates a temporary SQL snapshot with PostgreSQL 17
`pg_dump`. It verifies expansion 0010, compatibility index 0011 and historical
blank-text normalization 0012, rehearses the unregistered contraction, restores
the snapshot using `psql`, reapplies the migrations and compares preserved
history again. Normalization preserves nonblank text, receipts, revisions and
timestamps, and rejects invalid blank-only/no-feeling submissions atomically. Its schema and snapshot are removed after the test. Production
`justgo`/Drizzle migration state is not reset. The contraction SQL under
`apps/api/scripts/rehearsals` is not a deployable migration; 07.5 owns its final
review and acceptance. Set `JUSTGO_PG_BIN` when PostgreSQL 17 tools are not on
PATH or in the standard Apple Silicon Homebrew directory.

## Enforced code boundaries

`justgo/import-boundaries` covers static imports, named/star re-exports, dynamic
`import()`, literal `require()` and TypeScript import assignments. It resolves
relative traversal before checking app/shared boundaries. Computed loader paths
must be made literal so they can be reviewed. Literal asset imports, Jest factories
and the development-only preview remain allowed. Architecture fixtures exercise
both allowed and rejected paths and fail on parser errors.

Production TypeScript uses project-aware `no-floating-promises`,
`no-misused-promises` (including void UI handlers) and `await-thenable`. `void` marks
intentional background work; it does not handle rejection. Controllers catch and
publish their UI errors, and TanStack queries retain their own retry/error state.
Document that ownership at non-obvious call sites; do not add broad disables.

References: [Vitest coverage](https://vitest.dev/guide/coverage.html),
[typescript-eslint promise handling](https://typescript-eslint.io/rules/no-floating-promises/),
[misused promises](https://typescript-eslint.io/rules/no-misused-promises/), and
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).
