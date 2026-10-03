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
PostgreSQL transactions, ownership, isolation, idempotency, reflections and history.
It refuses non-loopback hosts and databases other than the disposable `justgo_test`.
Never point fixtures at staging/production or real private data.

For quick feedback, pass `-- --runTestsByPath src/...test.tsx` to the mobile test
script or `-- path/to/test.ts` to the API/contracts Vitest scripts. Run focused
checks during each extraction and the full commands before handoff.

`test:coverage` builds contracts, runs each workspace sequentially and enforces
`scripts/coverage-thresholds.json` through `coverage:check`. The API coverage run
includes all five database suites plus unit tests, so it requires the same migrated
local database. Individual workspace `test:coverage` commands produce reports;
run the root command for the combined gate. Reports are ignored generated output
under `coverage/{mobile,api,contracts}/`: HTML, LCOV and count-based JSON summaries.
CI runs the same gate after provisioning/migrations and uploads reports even on
failure. The V8 provider is pinned to the existing Vitest version; Jest uses its
existing Istanbul support. No production dependency was changed.

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
files by branch count and fails when a critical path is missing. Its own tests
protect those failure modes. Keep these floors or ratchet them upward as behavior
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
visible result. TanStack notifications are wrapped with React `act` in those tests
and restored afterward. Do not suppress console warnings or use arbitrary waits.
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

The full-journey CI suite is an open Phase 07 task. Phase 06A's one-off browser
journey and passing unit/component/database suites do not substitute for it.
When that harness is implemented, new or changed critical journeys must update
its saved tests and pass the CI gate alongside the relevant lower-level tests.

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
