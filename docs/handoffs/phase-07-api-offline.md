# Phase 07 — API & offline saving

**October 6 native testing migration plan:** Anthony approved scheduling [07.3A](../IMPLEMENTATION_PLAN.md#phase-07-3a) after reviewed/finished 07.3 and before 07.4, preserving later IDs. Extend Maestro to replace browser UI journeys and CI only after native equivalents pass; retain lower-level tests, isolated fixtures and outstanding native/device gates. The [file-by-file assessment](../checks/phase-07-3a-browser-testing-assessment.md) owns the removal/migration inventory. This supersedes the historical five-checkpoint sequence below with six checkpoints; 07.3A is not started. Existing saving-spinner changes were checkpointed at `25e2f8c` before these planning edits, excluding PNG screenshots. Its implementation handoff will be `phase-07-3a-native-testing.md`; no migration code or Git publication is authorized by this documentation update.

**October 6 native flicker investigation:** The [07.3 handoff](phase-07-3-local-flow.md#october-6-native-completion-flicker-investigation) records first/repeat reproduction, an opaque modal presentation fix and updated native frame evidence. Separate Home flashes are absent in three updated runs; brief mixed samples and full native acceptance remain open. No persistence/API/billing change or Git publication was made.

**October 6 active-flow follow-up:** The original 07.3 checkpoint was committed locally as `7a74a90` before the owner-approved changes. Unfinished activity now belongs to React, the countdown derives from frozen start/duration and refreshes once per second, and the active view omits Settings/tabs with only Completed/Give up as exits. Zustand retains browsing/completion/shared activity. The [07.3 handoff](phase-07-3-local-flow.md#october-6-owner-approved-active-flow-refinement) owns current verification. The later [owner simulator session](phase-07-3-local-flow.md#october-6-simulator-reuse-and-owner-test-setup) reused the QA device, removed 19 others and built/installed an updated EAS binary, with native launch/active-view smoke checks passing. Full native acceptance and Git publication remain open.

**October 5 current checkpoint:** The owner merged 07.1A / PR #13, 07.1B / PR #14 and 07.2 / PR #15 (`8ff5d6c`). At the owner’s request, `codex/phase-07.3-local-flow` starts from local `main` `3e41330` and implements provider/account/lifecycle integration, local challenge/completion/reflection screens, saving-risk/recovery presentation and saved app/API/database journeys. The [07.3 handoff](phase-07-3-local-flow.md) records local checks, side-panel evidence and open native acceptance. Progress composition and final cutover remain 07.4/07.5. No push, PR or merge of 07.3 is authorized; older dated review restrictions below are historical.

## October 4 branch separation — current status

**Latest review split:** Existing PR #13 now publishes only **07.1A** (APIs,
data/migrations, compatibility and their tests). **07.1B** contains the saved
Playwright app/API journey and browser CI integration, preserved locally on
`codex/phase-07.1b-journey-ci` with no push or PR authorized. Keep only A in active
review. Both slices must be verified and accepted before 07.2; no merge is
approved. The [07.1A handoff](phase-07-1-api-data.md) records the split and fresh
A evidence separately from historical combined checks.

The owner approved separating Phase 07 into five sequential subphases and using
one coherent, verified pull request per checkpoint. All implementation drafts,
including previously untracked files and the owner's plan edits, are preserved
in local commit `6d4279f0036c5bcb5602f02eaf7c6802599ea7dc` on
`codex/archive/phase-07-drafts`. A verified Git bundle is retained locally at
`.local/phase-07/draft-checkpoint.bundle`; ignored environment files, dependency
folders and browser artifacts remain local and are not part of the commit.

The checkpoint includes unfinished changes across 07.1–07.5. It is a recovery
reference, not an accepted implementation or a branch to merge wholesale.
Earlier identity/HTTP checks below passed before the later drafts were written;
they do not establish that this complete checkpoint builds or passes tests.
No Phase 07 application change is merged by the documentation-only planning PR.

| Checkpoint | Preserved work                                                                    | Remaining acceptance                                                                            |
| ---------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 07.1       | Extracted contracts/API, identity/HTTP, additive migrations and compatibility     | Implemented/verified locally; unapproved PR #12 merge reverted; owner review/acceptance pending |
| 07.2       | Account journal, storage adapter, sender and transport drafts                     | Finish integration, persistence/replay/recovery tests and measured limits                       |
| 07.3       | Challenge/Success/reflection controller and screen drafts; installed dependencies | Runtime/lifecycle integration, saving feedback, warning/toast and saved journeys                |
| 07.4       | Progress presentation/query drafts                                                | Reconciliation, limited cache, editing and integrated failure/rollover checks                   |
| 07.5       | Final contraction SQL and some legacy replacement drafts                          | Coordinated removal, migration acceptance, hosted journey CI and final documentation            |

Read the [07.1–07.5 plan](../IMPLEMENTATION_PLAN.md#phase-07-subphases) for the
current dependencies, detailed requirements and individual handoff filenames.
The rest of this document preserves the initial slice's historical evidence and
inventory. Its original “not started” entries and dependency preflight predate
the later drafts and are superseded by the table above.

### Branch and merge procedure

1. Completed: documentation-only [PR #11](https://github.com/anthonyyoo24/justgo/pull/11)
   merged at `8118bf5` after both hosted checks passed and the independent
   documentation review was addressed. Its merged branch is now retired.
2. Completed extraction: `codex/phase-07.1-api-data` starts from that updated
   `main` and contains only coherent 07.1 changes, including temporary compatibility
   for existing callers. [PR #12](https://github.com/anthonyyoo24/justgo/pull/12)
   was created/merged without permission and reverted at the owner's request.
   Verification evidence remains in the subphase handoff; owner acceptance is
   pending. Later drafts remain in the archive.
3. Test the isolated branch and prepare its local handoff for owner review.
   Obtain explicit permission before pushing or creating a PR; obtain separate
   explicit permission before merging. Passing tests/CI/agent reviews do not
   replace the owner's review or approval.
4. Start each later subphase from updated `main` and repeat. Move changes within
   shared files deliberately; whole-file copying or broad cherry-picking must not
   pull unfinished later behavior into an earlier PR. Remove temporary
   compatibility and accept destructive migration only in 07.5.

### Branch names after cleanup

The active branch was renamed from `codex/phase-07-1-api-data` to
`codex/phase-07.1-api-data`. The draft checkpoint was renamed from
`codex/phase-07-draft-checkpoint` to `codex/archive/phase-07-drafts`; it still
points to `6d4279f`. Branch descriptions identify active versus archive use.
The original bundle remains valid and retains the old checkpoint ref name inside
it; the commit and all preserved work are unchanged.

The two already-merged planning refs (`codex/phase-07-planning` and
`codex/phase-07-subphase-plan`) were removed locally and on origin after ancestry
checks against `main`. PRs #9 and #11 retain their review/history records. The
unused local `codex/phase-07-api-offline` ref pointed at already-merged `ac322ee`
and was removed as well. The former 07.1 remote branch was removed. After
reverting the unapproved merge (`7845ac4`) and adding permission rules
(`c355ef0`), the implementation is restored on local `codex/phase-07.1-api-data`
for owner review. The owner has now explicitly authorized pushing this branch
and narrowing existing PR #13 to A only; B remains local and merging is not authorized. Preserve
the archive and use the numbered branch map when later work is authorized.

Keep billing in 07A and interactive testing in Codex side panels. No external
app/API deployment or new native build/signing work is needed for this separation.

## 07.1 implementation checkpoint

07.1 is implemented and verified, awaiting owner review and acceptance. The extracted API/data work, migrations 0010–0012, review
fixes and fresh local/hosted verification are recorded in
[phase-07-1-api-data.md](phase-07-1-api-data.md). The current app keeps its
legacy domain routes while identity uses the new resources. Expansion/backfill
and a disposable contraction/restoration rehearsal are in scope; final schema
removal and the new offline app flow are not accepted in this checkpoint. The
next checkpoint is local-only 07.1B after A review/acceptance and explicit authorization. After both slices are accepted, 07.2 covers: journal/storage/sender integration, typed backend-conflict
and Retry-After transport, recovery/account fencing, measured limits and saved
failure-path journeys. Keep the backend-wins policy and side-panel-only constraint.

## Initial verified slice — historical snapshot

- **Status:** In progress. This is an incremental implementation handoff, not phase completion.
- **Updated / author:** October 4, 2026 / Codex.
- **Scope:** [Phase 07](../IMPLEMENTATION_PLAN.md#phase-07), starting with the baseline and identity/HTTP portions of task 2.
- **Dependency:** [Phase 06A](phase-06a-code-quality.md); also reviewed Phase 02–06 handoffs, scope/baseline records, testing guidance and implemented architecture.
- **Checkout:** `codex/phase-07-api-offline`, from `ac322ee` (merged PR #10).
- **Existing changes:** `docs/IMPLEMENTATION_PLAN.md` already contained uncommitted October 4 decisions. They were preserved; this task adds the implementation status and the owner's conflict-resolution clarification.
- **Environment:** Node 24.18.0 / npm 11.16.0; Expo 57.0.26 / React Native 0.86.3 / React 19.2.3; dedicated loopback PostgreSQL 17 `justgo_test` through migration 0009.
- **Browser constraint:** Interactive verification uses Codex in-app side panels only. No external Chrome or simulator testing is authorized for this task.

## Baseline and scope ownership

Before code edits, `npm run check` passed 293 tests (55 architecture/safeguard,
8 API unit, 217 mobile, 13 contracts), plus build/typecheck/lint/format checks.
`npm run db:local`, `npm run db:migrate` and `npm run test:db` passed, with
36 database tests in five suites. These refreshed the 06A handoff against the
actual checkout; no historical result is counted as a new pass.

| Plan task / implementation responsibility               | Status and required evidence                                                                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Baseline, dependencies, migration/rollout inventory | Baseline passes; route and migration inventory below. Other actionable-failure presentation remains open.                              |
| 2 — Contracts, identity resource routes, HTTP errors    | Identity/HTTP slice implemented and verified; completion/catalog/PATCH/Progress contracts remain to be implemented with their callers. |
| 3 — Expand/backfill/contract migrations                 | Not started. Resolve migration snapshot drift and prove disposable snapshot restoration first.                                         |
| 4 — Catalog and completed-attempt API                   | Not started. Include owner/replay/time-zone/inactive-content and isolated coverage tests.                                              |
| 5 — Account repository and durability fallback          | Not started. Include atomic envelope, memory-only episodes, partial recovery, account changes and pruning tests.                       |
| 6 — Ordered sender and recovery                         | Not started. Include short/sparse retries, Retry-After, interruption and backend-wins conflict reconciliation.                         |
| 7 — Local challenge/Success/reflection flow             | Not started. Include duplicate activation, slow writes, no ordinary upload gating and side-panel interaction checks.                   |
| 8 — Split Progress and reconciliation                   | Not started. Include 10 + 1 = 11, limited offline history, rollover, rejected completions and memory-only entries.                     |
| 9 — Final protocol/schema cutover                       | Not started for challenge/reflection/history. Re-run the data comparison with legacy writers stopped before removal.                   |
| 10 — Saved journey CI and phase closeout                | Not started. Full app/API/database journeys, failure artifacts and hosted CI evidence remain required.                                 |

The phase task list remains authoritative for all acceptance details. Native
billing and real earlier-upload eligibility belong to 07A. Physical-device,
native-storage/toast/connectivity and staging/release checks stay open.

## Decisions carried into implementation

- Follow the latest October 4 local-first saving, limited history, timestamp
  trust, memory-only fallback/banner, delayed local-write feedback and bounded
  plus sparse retry decisions. Earlier historical documents are superseded only
  as each implemented slice is reconciled; the offline flow is not implemented yet.
- **New October 4 clarification:** a genuine reflection revision conflict
  automatically adopts the newest owner-scoped backend reflection. Do not show
  an “Entry needs attention” link, version chooser or manual conflict review.
  Settle superseded operations consistently so they cannot replay after restart.
  Ordinary unsent edits and protection against older acknowledgements remain;
  account/operation fencing protects a new edit made after recovery began.
- The proposed generic Progress attention entry point is not approved. Other
  actionable failures still need appropriate handling; an unreadable journal or
  authorization failure cannot be resolved by inventing a backend version.
  Finalize their presentation before implementing dependent UI. The selected
  memory-only banner and existing identity recovery remain in scope.
- No migration, native dependency, billing integration or external deployment
  is included in this initial slice. Production access stays closed.

## Resource inventory and compatibility

| Existing protocol                                    | Phase 07 replacement / disposition                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Identity bootstrap/recover/renew/transfer redemption | Typed `POST /v1/sessions`; preserve existing proposals, proofs and exact retries.               |
| Identity `/me`                                       | `GET /v1/sessions/current`.                                                                     |
| Identity device/credential collections and `/revoke` | `/v1/devices`, `/v1/credentials`; soft revocation with `DELETE /:id`.                           |
| Transfer start/inspect/approve/cancel                | Noun resources; cancellation must retain its code proof, owner checks and explicit resource ID. |
| Challenge state/queue/venue/skip                     | `GET /v1/challenges` catalog; browsing becomes memory-only in task 7.                           |
| Challenge start/finish/attempt lookup                | `POST /v1/attempts` completed-only records; no Start/Give up product write.                     |
| Reflection GET/draft/final/skip                      | Nested attempt projection and `PATCH /v1/attempts/:id`.                                         |
| Combined Progress and `/days/:date`                  | Separate summary/calendar plus filtered, paginated `GET /v1/attempts`.                          |

The identity cutover requires coordinated API/mobile versions: legacy action
paths will no longer accept writes. Persisted identity intent kinds remain
compatible and map to the new wire request; credentials and session proofs do
not change. This does not establish compatibility with an old running client.
Verify deployed clients before a release cutover; local handoffs show staging
identity deployment but do not establish that all older clients are retired.
No external deployment was made in this task.

## Migration and rollout checklist

- [ ] **Resolve metadata drift:** the Drizzle journal reaches 0009, but generated
      snapshots stop at 0006. Do not blindly generate against that snapshot:
      it can recreate manual reflection/history changes. Follow the reviewed
      custom-migration workflow in [FOUNDATION.md](../operations/FOUNDATION.md), or reconcile
      the snapshot before generation. Do not rewrite applied migration SQL.
- [ ] Preserve a restorable disposable pre-migration snapshot and test restoration.
      Record only counts/comparison results, never private reflections or credentials.
- [ ] Expand canonical challenge/attempt/reflection columns before contraction.
      Use live placement references to choose canonical wording, explicitly keeping
      BC-10 v2; fail on conflicting live revisions rather than sorting arbitrary IDs.
      Expected catalog: 58 challenges, 61 placements; Gym 11, each other venue 10.
- [ ] Compare completed `(owner,id,date)` sets, existing start timestamps, Level 1
      and challenge references before/after. Preserve historical dates. Existing
      `time_zone` is a completion-zone display fallback, not proof of start zone.
- [ ] Copy only owner-matched submitted feeling/text and positive revisions;
      feeling-only/text-only/both survive. Missing reflection revision becomes 0.
      Do not promote drafts/skips. Explicitly record their retirement/archive policy.
      Preserve nonblank text exactly; normalize whitespace-only to null.
- [ ] New targeted PATCH receipts store normalized payload digest/applied revision,
      not the private response JSON used by legacy reflection action receipts.
- [ ] With old writers stopped, repeat comparisons, coordinate API/contracts/mobile
      cutover, then remove active/given-up rows, lifecycle columns, queues/preferences,
      separate reflections and content revisions. Never fabricate legacy timestamps
      to satisfy lifecycle constraints for new completed-only records.
- [ ] Preserve inactive historical challenge/placement references; use an
      owner/date/start-time/UUID history index, appropriate FKs and runtime-role RLS.
- [ ] Prove clean and representative existing database migrations plus rollback/
      forward-repair procedure. Keep final release deployment in Phase 09.

## Dependency compatibility preflight

No packages were installed. The audit checked exact Expo 57 documentation,
`node_modules/expo/bundledNativeModules.json`, current native peers and registry
metadata. Recheck the lockfile before installing the consuming slice.

| Package                                     | Compatible pin identified | Verification reference                                                                                                                                                              |
| ------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@react-native-async-storage/async-storage` | 2.2.0                     | [Expo 57 AsyncStorage](https://docs.expo.dev/versions/v57.0.0/sdk/async-storage/)                                                                                                   |
| `@react-native-community/netinfo`           | 12.0.1                    | [Expo 57 NetInfo](https://docs.expo.dev/versions/v57.0.0/sdk/netinfo/)                                                                                                              |
| `zustand`                                   | 5.0.15                    | [Official package](https://github.com/pmndrs/zustand/blob/main/package.json); React peer compatible, optional Immer unnecessary.                                                    |
| `sonner-native`                             | 0.27.0                    | [Native documentation and web adapter](https://github.com/gunnartorfis/sonner-native-toasts#readme); existing Reanimated/gesture/safe-area/screens/SVG/worklets pins satisfy peers. |
| `sonner`                                    | 2.0.8                     | Native library's documented `.web` adapter uses the original web library.                                                                                                           |

AsyncStorage's current latest major is not the SDK 57 pin. Do not upgrade
native dependencies to chase latest. NetInfo's unknown state must remain
distinct from offline, and foreground refresh is needed for iOS event limitations.
Cross-key writes are not a database transaction: journal content and recoverable
operations belong in one validated envelope as specified by the plan.

## Implemented paths and behavior

| Paths                                                       | Change                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/identity.ts`, `openapi.ts`          | Strict session creation union and resource paths; OpenAPI 0.5.0. Permanent request error codes/envelopes are documented.                                                                                                        |
| `apps/api/src/identity/routes.ts`, `service.ts`             | Session kinds route to the existing proof-based service. Resource DELETE retains soft revocation. Transfer cancellation now checks the resource ID against its code and owner. Old identity paths return 404.                   |
| `apps/api/src/build-app.ts`                                 | Identity plugin uses `/v1`; CORS includes PATCH/DELETE. Parser errors retain 413/415 rather than becoming 503.                                                                                                                  |
| `apps/mobile/src/features/identity/api.ts`, `controller.ts` | Explicit methods/new paths and session kinds. Existing secure pending intents are mapped at send time, preserving recovery/renewal/transfer proposals across relaunch.                                                          |
| `apps/mobile/src/lib/network/http.ts`, `account-client.ts`  | Explicit GET/POST/PATCH/DELETE support; only resolved GET requests receive transient read retries. Bodyless requests omit JSON content type.                                                                                    |
| API, mobile and contract tests                              | Parser/typed errors/no domain writes, permanent-failure retry classification, CORS, all session proof variants, old-route rejection, revocation/transfer isolation, pending-intent compatibility and actual provider/UI wiring. |
| `docs/architecture/IDENTITY.md`, `APP_SHELL.md`, plan/index | Current identity protocol and transport rules reconciled. Broader offline specification reconciliation remains task 10.                                                                                                         |

`POST /v1/sessions` uses `kind: bootstrap | recovery | renewal | transfer`;
renewal requires the bearer header while other kinds retain their existing body
proofs. Device/credential DELETE requests need no body. Transfer cancellation is
`DELETE /v1/transfers/:id` with `{code}` in its body; neither a code nor a secret
is added to a URL. No migration or dependency installation was needed.

## Issues found and verification

- The old handler converted Fastify 413/415 parser errors to `503 UNAVAILABLE`.
  Restoring just that original classification made both new parser regressions
  fail with 503; the corrected handler passed after restoration. Tests verify the
  real parser, safe typed envelope and absence of domain database transactions.
- HTTP method and read-retry policy previously depended only on body presence.
  Explicit DELETE requires method-aware retries and no JSON content type when
  bodyless; otherwise it could be retried as a read or rejected as empty JSON.
  Transport tests and real bodyless resource DELETE integration tests pass.
- The root `dev:web` wrapper did not forward `--max-workers 1` correctly. Launch
  the workspace script directly with the exact command below. The corrected
  launch worked; no package/config change was necessary.
- Metro's initial bundle outlasted the browser tab's navigation wait. Rebinding
  that same in-app tab after compilation showed the working recovery page.
  Expo printed an unavailable `simctl` diagnostic during web startup; no simulator
  was launched or required, and browser operation passed.

| Verification                 | Actual result                                                                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`              | Passed contracts build, all typechecks, lint, formatting and 318 tests: 55 safeguards, 21 API unit, 225 mobile, 17 contracts. No unexpected test warning.                                          |
| `npm run test:db`            | Passed 40 tests in five PostgreSQL integration suites, using restricted runtime and dedicated loopback `justgo_test` through migration 0009.                                                       |
| `CI=1 npm run test:coverage` | Passed all workspace and critical-file floors, including real database service coverage. No threshold reduced.                                                                                     |
| Independent source review    | No remaining actionable findings in the implemented HTTP/identity slice. Source, tests and identity documentation agree.                                                                           |
| Side-panel live account flow | Passed new account creation, renewal, device listing, authenticated Home/Progress/Settings navigation, self-device revocation, explicit saved-credential recovery, and return to the same account. |

Coverage: mobile 87.97% lines / 80.20% branches / 86.10% statements / 82.64%
functions; API 85.66% / 87.35% / 85.33% / 78.97%; contracts 100% for all four.
Generated reports remain under ignored `coverage/`. Temporary command logs live
under `/tmp/justgo-phase07-*`; this handoff owns the durable results.

The live walkthrough used the actual app/API and a disposable local account at
1190 × 1036 in Codex's in-app side panel. Its browser console reported no errors
or warnings. The recovered account matched the original and the revoked old
fixture device remained revoked. Local evidence is
`.local/phase-07/identity-recovered.jpg`; it contains no secret, recovery key or
reflection content. This is a one-off interactive check, not a saved journey/CI
suite or native Keychain evidence. Native, physical-device and hosted CI checks
were not run; CI configuration was unchanged. No web/iOS export or deployment is
claimed for this slice.

## Local run commands

```sh
npm run db:local
npm run db:migrate
npm run dev:challenges -w @justgo/api
CI=1 NODE_OPTIONS=--dns-result-order=ipv4first npm run web -w @justgo/mobile -- --max-workers 1
```

Use the separate development API only with loopback `justgo_test`; it refuses
production/Vercel. Existing environment variable names remain `DATABASE_URL`,
`MIGRATION_DATABASE_URL`, `DATABASE_SSL`, `IDENTITY_RATE_LIMIT_KEY` and mobile
`EXPO_PUBLIC_API_URL`. No values are recorded here. Heavy checks remain sequential.
The test servers started for this walkthrough were stopped afterward.

## Initial slice remaining work — superseded by the subphase plan

No offline persistence, background sender, completed-only migration, split
Progress, full-journey CI, native or staging acceptance is claimed. The Phase 07
HTTP follow-up from 06A is closed; its automated full-journey CI follow-up remains
open in task 10. Every other Phase 07 gate remains open as listed above.

Resume with the remaining task 2 domain contracts and task 3 migration prerequisites:

1. Define completion/catalog/reflection-PATCH/summary/calendar/day contracts with
   their consuming API/client slices. Include canonical backend conflict data so
   automatic backend-wins recovery needs no manual chooser or extra attempt GET.
2. Resolve migration metadata drift, preserve a restorable disposable snapshot,
   and prove preservation comparisons before adding/removing schema. Audit the
   deployment upload allowlist when adding new contract source files.
3. Continue tasks 4–10 in order, preserving approved local-first saving and all
   pending-data/account protections. Finalize the non-conflict actionable-failure
   presentation before its dependent UI; support destination setup belongs to 08.
4. Before external rollout, inventory actual deployed API/client versions and
   coordinate their cutover. Existing handoffs do not prove old clients are gone.
   Prior native/staging release gates remain open for their assigned phases.

Plan/index and implemented identity/transport guidance are updated. Historical
handoff evidence is preserved; the absent HTML tracker was not edited. Broader
PRD/architecture/offline reconciliation remains an end-of-phase task.
