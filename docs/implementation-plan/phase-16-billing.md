<a id="phase-16"></a>

# Phase 16 plan, paid subscriptions through Superwall

JustGO goes paid after the free launch, with a hard paywall. Starting a challenge needs a subscription. Recovery, settings, legal pages, data export and deletion stay free.
Superwall's paywall editor shows the paywall and buys through StoreKit. The JustGO API decides access, and it verifies every purchase with Apple.
The offer is Annual US$59.99 with a 7-day free trial, preselected, and Monthly US$12.99 with no trial. Free-launch users get the same paywall and trial.
Guests can buy without signing in. Their subscription moves into the account they later sign in to.
The program enforces one rule. No client flag, Superwall status or webhook payload unlocks paid use until the API has confirmed the subscription with Apple.
PRs in order are P16-1 to P16-12. Appendix E keeps the nine subscription rules and the decisions in force.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-full.md` with the JustGO limits in `AGENTS.md`. Agents merge through `pnpm run merge:pr` once one independent verifier posts a covering verdict. Anthony's items are the owner steps in **Arm the program** and the review-gated PRs P16-9, P16-10 and P16-11, which stop at merge-ready until he has looked.

Where this skeleton says swarm, JustGO runs one verifier per PR (`AGENTS.md`, Git and autonomy). That verifier runs the ten live lanes below as its checklist.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to Anthony, then stop. Start execution only on his explicit go.
- [ ] Confirm the free launch has shipped and Anthony has said payments may start. Phase 16 never blocks the free launch.
- [ ] Read these at program start. Re-read them at every tick.
  - [ ] `git show origin/main:AGENTS.md`
  - [ ] `git show origin/main:docs/implementation-plan/phase-16-billing.md`
  - [ ] `git show origin/main:.claude/skills/verify-justgo/SKILL.md`
  - [ ] `pstack/skills/poteto-mode/playbooks/autopilot-full.md`, `pstack/skills/poteto-mode/playbooks/opening-a-pr.md` and `pstack/skills/poteto-mode/playbooks/shipping.md` from the installed pstack plugin.
- [ ] Anthony finishes the owner steps. Each box names its evidence.
  - [ ] Paid Apps agreement, tax and banking are active in App Store Connect Business. Evidence is the agreement status in `docs/operations/APPLE_SETUP.md`.
  - [ ] JustGO is enrolled in the App Store Small Business Program. Evidence is Apple's acceptance email date in `docs/operations/APPLE_SETUP.md`.
  - [ ] The subscription group `JustGO Pro` holds `com.anthonyyoo.justgo.pro.annual` (US$59.99, 7-day free trial) and `com.anthonyyoo.justgo.pro.monthly` (US$12.99). Prices for CA and UK come from Apple's price table. Evidence is the product list in `docs/operations/APPLE_SETUP.md`.
  - [ ] An In-App Purchase key exists. Its key ID and issuer ID are recorded, and the `.p8` file stays in his password manager. Evidence is the key ID in `docs/operations/APPLE_SETUP.md`, with no secret.
  - [ ] Anthony can open the Superwall project, and the app and the In-App Purchase key are connected there. Evidence is a screenshot with keys masked.
  - [ ] Superwall answers in writing on the fee basis, a DPA, deleting one user's data, appAccountToken from `identify()`, and which events `eventTrackingBehavior` keeps. Evidence is the reply saved under `.local/phase-16/`.
- [ ] Answer every unproven question in Appendix A by prototype before **Spawn owners**. Record the branch, the SHA and the evidence there.
- [ ] On Anthony's go, arm the audit tick as `/loop 1h` with the tick prompt below. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On Anthony's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle that `pstack/skills/poteto-mode/playbooks/autopilot-full.md` names. Each owner works in its own worktree and branch.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges.
  - [ ] P16-1, P16-2, P16-7 and P16-12 are independent and first. All branch from `main`.
  - [ ] P16-3 after P16-1.
  - [ ] P16-4 after P16-2 and P16-3.
  - [ ] P16-5 after P16-4.
  - [ ] P16-6 after P16-4.
  - [ ] P16-8 after P16-2 and P16-5.
  - [ ] P16-9 after P16-7 and P16-8.
  - [ ] P16-10 after P16-9.
  - [ ] P16-11 after P16-6 and P16-9.
- [ ] Hold the file boundaries. API PRs touch only `apps/api/**`, `packages/contracts/**` and the docs they make necessary. Mobile PRs touch only `apps/mobile/**` and their docs. P16-12 touches only `docs/legal/**`, `docs/operations/**`, the legal reader and `scripts/quality/policy-copy.test.mjs`.
- [ ] Hold the review gate. P16-9, P16-10 and P16-11 change an interaction. They wait for Anthony's review in chat with screenshots and a video before merge.
- [ ] Keep every paid path behind `BILLING_ENABLED` on the API and the matching mobile flag until #110 passes. Free access stays the default.

### PR mechanics, for every PR

- [ ] Use `gh` for every PR operation.
- [ ] Open the PR ready, never draft, per **Opening a PR**, with `gh pr create --base main`. The description has the sections Why, What changed, Scope, Tradeoffs, Blast Radius and Verification, in that order.
- [ ] Run the checks that `AGENTS.md` **Choosing checks** names for the change once before the PR-facing push. Push with hooks on.
- [ ] Remove dead code and needless comments before each commit.
- [ ] Triage every review comment on its merits. A finding without a shown failure is a note.
- [ ] Merge `main` in before the code-ready report. Merge it again only at merge prep, on a conflict, on a CI failure that comes from `main`, or when a known change to the same files lands.

### Verdict and merge, for every PR

- [ ] One verifier that did not write the PR runs at the code-ready head. Start it with the brief from `node scripts/quality/verify-batch.mjs --brief <n>`. The verifier hook picks its model. It reads CI for the full suites, runs the focused tests, runs the ten live lanes and the perf block, and posts the verdict in the format `AGENTS.md` defines.
- [ ] Only a shown failure blocks. A `FAIL` names the failing command on a `Failure shown:` line. Anything else is a note and the verdict is `PASS+NOTES`. A failure on trunk behavior in a lane marked `Regression lane against trunk.` is recorded against trunk and does not block the PR. A PR gets at most two fix rounds, each with a fresh verifier.
- [ ] Merge only through `pnpm run merge:pr <n> --head <head-sha> --auto`, armed at open and after each push. A verdict carries across a merge from `main` only when `verdict-patch.mjs` says `carries` or `docs-tests-only`.

### Boot recipe, for every live lane

API lanes run against loopback `justgo_test` and the fixture API. Web lanes drive the app through `verify-justgo` in the built-in browser pane. Native lanes drive a development build in the iOS Simulator through the simulator control tool, with the StoreKit configuration file from P16-7 attached.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Run `pnpm run db:local` and `pnpm run db:migrate`, then start the API and the app the way `verify-justgo` describes. For native lanes, build the development client with `pnpm --filter @justgo/mobile run ios` and wait for the first screen.
- [ ] Deliver input only through `verify-justgo`, the simulator tool or `curl` against the loopback API. Read the database read-only with `psql` on `justgo_test`.
- [ ] Save every screenshot or response to `.local/phase-16/<pr-id>/lane-<n>/<slug>` and return the paths with the report.

## Split the API schema into a folder (P16-1)

**Depends on.** None.

**Files.**

- [ ] Delete `apps/api/src/db/schema.ts`.
- [ ] Create `apps/api/src/db/schema/identity.ts`, `schema/catalog.ts`, `schema/activity.ts` and `schema/index.ts`.
- [ ] Edit `apps/api/drizzle.config.ts` and every import of the old path.

**Build.**

- [ ] Move each table, policy and helper into the file for its area with no change to any definition. `schema/index.ts` re-exports all of them. Keep the move in its own commit.

**You see.**

- [ ] `pnpm --filter @justgo/api exec drizzle-kit generate` prints `No schema changes, nothing to migrate`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `scripts/backups/ledger-coverage.test.mjs` reads the new folder and still passes. Run `pnpm run test:architecture`.
- [ ] API typecheck and tests pass. Run `pnpm --filter @justgo/api run typecheck && pnpm --filter @justgo/api run test`.
- [ ] Database suites pass. Run `pnpm run test:db`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Run `pnpm run db:migrate` on a fresh `justgo_test` at trunk and head and dump `pg_dump --schema-only`. Save `schema-diff.txt`. Pass when the two dumps are identical.
- [ ] Lane 2. Run `drizzle-kit generate` at the head. Save `generate.txt`. Pass when it reports no changes.
- [ ] Lane 3. Call `GET /v1/access` as a guest. Save `guest-access.json`. Pass when it returns `free_beta` as on trunk.
- [ ] Lane 4. Sign in a fixture account and call `GET /v1/sessions/current`. Save `session.json`. Pass when the response matches trunk.
- [ ] Lane 5. Upload one completion for a fixture account and read it back from `justgo.completions`. Save `completion-row.txt`. Pass when the row exists with the fixture owner.
- [ ] Lane 6. Run delete-all for a fixture account. Save `epoch.txt`. Pass when `data_epoch` rose by one.
- [ ] Lane 7. Read the guest catalog. Save `catalog.json`. Pass when it lists the same cards as trunk.
- [ ] Lane 8. Run the private-schema sweep in `managed-session-check.integration.test.ts`. Save `sweep.txt`. Pass when it passes.
- [ ] Lane 9. Run `node scripts/backups/ledger-coverage.test.mjs` through `node --test`. Save `ledger.txt`. Pass when it passes.
- [ ] Lane 10. Open the web app through `verify-justgo`, start and finish one challenge. Save `challenge-done.png`. Pass when the success screen shows.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. API cold typecheck time in seconds.
- [ ] Probe. Run `pnpm --filter @justgo/api run typecheck` three times each at trunk and head, interleaved.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Fail when the head median is more than 10% above trunk.

**Review gate.** None. P16-1 is not review-gated.

**Merge.**

- [ ] A covering verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] `main` merged in after the verdict, with `verdict-patch.mjs` saying `carries`.
- [ ] The owner merges through `pnpm run merge:pr`.

## Let the access contract carry a paid source (P16-2)

**Depends on.** None.

**Files.**

- [ ] Edit `packages/contracts/src/access.ts` and `packages/contracts/src/access.test.ts`.
- [ ] Edit the mobile readers of `hasVerifiedAccess()` and their tests.

**Build.**

- [ ] Widen `accessResponseSchema.source` to `free_beta`, `subscription` and `guest_subscription`, and add the verified `expiresAt` and the product ID for paid sources.
- [ ] Replace the 60-second freshness cutoff in `hasVerifiedAccess()` with the verified expiry, as rule 3 says.
- [ ] Keep installed free builds working. The API keeps sending `free_beta` while `BILLING_ENABLED` is off, and the PR records the update path for old builds once it is on.

**You see.**

- [ ] A `subscription` response with a future `expiresAt` passes `hasVerifiedAccess()` an hour after `checkedAt`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `access.test.ts` gains cases for each source, an expired subscription, a missing expiry and the old 60-second case. Run `pnpm --filter @justgo/contracts run test`.
- [ ] Root build and typecheck pass. Run `pnpm run build:contracts && pnpm run typecheck`.
- [ ] OpenAPI tests pass. Run `pnpm --filter @justgo/api exec vitest run tests/http/openapi.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Call `GET /v1/access` as a guest at trunk and head. Save `access-trunk-head.json`. Pass when both return `free_beta`.
- [ ] Lane 2. Feed a `subscription` response with a future expiry to the contract parser in a Node REPL. Save `parse-sub.txt`. Pass when it parses and is verified.
- [ ] Lane 3. Feed an expired `subscription`. Save `parse-expired.txt`. Pass when it is not verified.
- [ ] Lane 4. Feed a `guest_subscription`. Save `parse-guest.txt`. Pass when it parses.
- [ ] Lane 5. Feed an unknown source. Save `parse-unknown.txt`. Pass when parsing fails.
- [ ] Lane 6. Open the web app as a guest and start a challenge. Save `guest-start.png`. Pass when the challenge starts.
- [ ] Lane 7. Sign in a fixture account in the web app and start a challenge. Save `account-start.png`. Pass when it starts.
- [ ] Lane 8. Open the generated OpenAPI document. Save `openapi-access.json`. Pass when the access schema lists the three sources.
- [ ] Lane 9. Run the exported-web smoke. Save `exported-web.txt`. Pass when `pnpm run test:exported-web` passes.
- [ ] Lane 10. Run the saved journeys. Save `journeys.txt`. Pass when `pnpm run test:journey` passes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Median time of 10,000 `accessResponseSchema.parse` calls.
- [ ] Probe. A Node script times the loop at trunk and head, interleaved three times.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Fail when the head is more than 20% slower.

**Review gate.** None. P16-2 is not review-gated.

**Merge.**

- [ ] A covering verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] `main` merged in after the verdict, with `verdict-patch.mjs` saying `carries`.
- [ ] The owner merges through `pnpm run merge:pr`.

## Add the billing tables (P16-3)

**Depends on.** P16-1.

**Files.**

- [ ] Create `apps/api/src/db/schema/billing.ts` and the next migration under `apps/api/drizzle/`.
- [ ] Edit `apps/api/tests/db/fixtures/applied-migration-hashes.json`, `scripts/backups/snapshot.mjs` and `docs/operations/APPLE_SETUP.md`.

**Build.**

- [ ] Add `justgo.app_store_subscriptions`, keyed by Apple's original transaction ID, with the owner user ID (null for a guest purchase), product, environment, verified expiry, revocation time, the latest transaction ID and the appAccountToken.
- [ ] Add `justgo.billing_events`, keyed by the Superwall event ID, so a redelivered event is a no-op.
- [ ] Force RLS on both tables, grant only to `justgo_runtime`, and list them in the recovery ledger or as dump-only.

**You see.**

- [ ] `\d justgo.app_store_subscriptions` in `psql` shows forced RLS and no grant to `anon`, `authenticated` or `PUBLIC`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] The private-schema sweep covers the new tables. Run `pnpm run test:db`.
- [ ] `migration-metadata.test.ts` lists the migration under `unapplied`. Run `pnpm --filter @justgo/api run test`.
- [ ] Ledger coverage passes. Run `pnpm run test:architecture`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Trunk has no billing tables, so record that and migrate a trunk database forward to the head. Save `migrate-forward.txt`. Pass when the migration applies with no error and existing rows survive.
- [ ] Lane 2. As `justgo_runtime` with no owner context, select from both tables. Save `rls-empty.txt`. Pass when zero rows return.
- [ ] Lane 3. As `anon`, select from both tables. Save `anon-denied.txt`. Pass when permission is denied.
- [ ] Lane 4. Insert two events with the same Superwall ID. Save `dedupe.txt`. Pass when the second insert conflicts.
- [ ] Lane 5. Insert a guest subscription with a null owner. Save `guest-row.txt`. Pass when it saves.
- [ ] Lane 6. Run the identity purge for a fixture account that owns a subscription row. Save `purge.txt`. Pass when the row follows the ledger rule that the PR documents.
- [ ] Lane 7. Run `reconcileLedger` after a restore. Save `ledger-restore.txt`. Pass when the billing rows come back as the ledger lists.
- [ ] Lane 8. Run delete-all for that account. Save `delete-all.txt`. Pass when the subscription row stays, since access survives delete-all.
- [ ] Lane 9. Try to change a user ID that owns a subscription. Save `id-immutable.txt`. Pass when `users_id_immutable` refuses it.
- [ ] Lane 10. Start a challenge in the web app. Save `challenge.png`. Pass when it starts as on trunk.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time for `pnpm run db:migrate` on a fresh database.
- [ ] Probe. Run it three times each at trunk and head, interleaved, on a dropped and recreated `justgo_test`.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Fail when the head median is more than 2 seconds above trunk.

**Review gate.** None. P16-3 is not review-gated.

**Merge.**

- [ ] A covering verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] `main` merged in after the verdict, with `verdict-patch.mjs` saying `carries`.
- [ ] The owner merges through `pnpm run merge:pr`.

## Verify a purchase with Apple (P16-4)

**Depends on.** P16-2 and P16-3.

**Files.**

- [ ] Create `apps/api/src/billing/apple.ts`, `apps/api/src/billing/verify.ts` and their tests under `apps/api/tests/billing/`.
- [ ] Edit `packages/contracts/src/` for the request and response, `apps/api/src/config.ts` and `apps/api/src/build-app.ts`.

**Build.**

- [ ] Add `POST /v1/billing/verifications`. The phone sends the transaction ID that Superwall's purchase or restore produced. The server asks the App Store Server API for that transaction through `outboundFetch()`, before any owner transaction opens, and checks Apple's signature.
- [ ] For a signed-in owner, accept the transaction only when its appAccountToken is empty or equals the owner ID, then save it under that owner. For a guest, save it with no owner and return a `guest_subscription` access response.
- [ ] Read the Apple key from function secrets through `config.ts`. Keep the route off unless `BILLING_ENABLED` is on.

**You see.**

- [ ] A sandbox transaction ID returns `status: verified`, `source: subscription` and the Apple expiry.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/api/tests/billing/verify.test.ts` covers a valid signature, a forged signature, a wrong environment, a token for another owner, a revoked transaction and Apple returning 5xx. Run `pnpm --filter @justgo/api exec vitest run tests/billing`.
- [ ] `owner-transaction.test.ts` still refuses I/O inside an owner transaction. Run `pnpm run test:edge`.
- [ ] Database cases for both owner paths. Run `pnpm --filter @justgo/api run test:db:file tests/billing/verify.integration.test.ts`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. Apple is replaced by a loopback stub that signs with a test chain.

- [ ] Lane 1. Regression lane against trunk. Trunk has no verification route, so record the 404 there and gate a full verification at the head. Save `verify-ok.json`. Pass when the head returns verified access and the row exists.
- [ ] Lane 2. Post a transaction whose signature fails. Save `forged.json`. Pass when the API refuses it and writes nothing.
- [ ] Lane 3. Post a transaction whose token names another owner. Save `wrong-owner.json`. Pass when the API refuses it.
- [ ] Lane 4. Post as a guest. Save `guest.json`. Pass when the response is `guest_subscription` and the row has no owner.
- [ ] Lane 5. Make the stub return 503. Save `apple-down.json`. Pass when the API returns 503 `UNAVAILABLE` and writes nothing.
- [ ] Lane 6. Make the stub redirect. Save `redirect.json`. Pass when the API fails without following it.
- [ ] Lane 7. Post the same transaction twice. Save `replay.json`. Pass when both succeed and one row exists.
- [ ] Lane 8. Post a revoked transaction. Save `revoked.json`. Pass when access is not granted.
- [ ] Lane 9. Turn `BILLING_ENABLED` off. Save `flag-off.json`. Pass when the route is absent.
- [ ] Lane 10. Grep the API log for the transaction and key material. Save `log-scan.txt`. Pass when no key and no signed payload appear.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Server time for one verification against the loopback stub, excluding the stub's own delay.
- [ ] Probe. Trunk has no route, so time 50 head requests and, interleaved, 50 `GET /v1/access` requests at trunk and head as the end-to-end baseline.
- [ ] Baseline. Record the trunk `GET /v1/access` p95 first.
- [ ] Rule. Fail when verification p95 exceeds 300 ms or the head `GET /v1/access` p95 is more than 10% above trunk.

**Review gate.** None. P16-4 is not review-gated.

**Merge.**

- [ ] A covering verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] `main` merged in after the verdict, with `verdict-patch.mjs` saying `carries`.
- [ ] The owner merges through `pnpm run merge:pr`.

## Read access from verified subscriptions (P16-5)

**Depends on.** P16-4.

**Files.**

- [ ] Create `apps/api/src/access/paid-access.ts` and its tests.
- [ ] Edit `apps/api/src/build-app.ts` to pick paid or free access by `BILLING_ENABLED`.

**Build.**

- [ ] `createPaidAccess()` returns the guest reader, the entitlement reader and the upload eligibility reader from the saved Apple rows.
- [ ] Upload eligibility follows rule 9. A completion started while a verified subscription covered it stays eligible after expiry.
- [ ] Delete-all keeps access, because rows belong to the owner, not the data epoch.

**You see.**

- [ ] With the flag on, an owner with no row gets `unpaid`, and an owner with an unexpired row gets `verified` until its expiry.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `paid-access.test.ts` covers no row, a valid row, an expired row, a revoked row and a row for another owner. Run `pnpm --filter @justgo/api exec vitest run tests/access`.
- [ ] The rule 9 upload cases and the delete-all access case in `sync.integration.test.ts` pass with the flag on. Run `pnpm run test:db`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. With the flag off, call `GET /v1/access` as a guest and an account at trunk and head. Save `flag-off.json`. Pass when both return `free_beta`.
- [ ] Lane 2. With the flag on, call it for an owner with no row. Save `unpaid.json`. Pass when it returns `unpaid`.
- [ ] Lane 3. Seed a valid row and call it. Save `paid.json`. Pass when it returns `verified` with the row's expiry.
- [ ] Lane 4. Seed an expired row. Save `expired.json`. Pass when it returns `unpaid`.
- [ ] Lane 5. Upload a completion started inside the covered period after expiry. Save `late-upload.json`. Pass when the upload succeeds.
- [ ] Lane 6. Upload a completion started after expiry. Save `uncovered-upload.json`. Pass when the upload is refused.
- [ ] Lane 7. Run delete-all, then call access. Save `after-delete-all.json`. Pass when access stays verified.
- [ ] Lane 8. Read another owner's access through a forged request field. Save `forged-owner.json`. Pass when only the bearer's owner is read.
- [ ] Lane 9. As a guest with the flag on and no guest subscription, read the guest catalog. Save `guest-catalog.json`. Pass when it returns 403 `ACCESS_REQUIRED`.
- [ ] Lane 10. Stop the database and call access. Save `db-down.json`. Pass when it returns 503 `UNAVAILABLE`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. p95 of `GET /v1/access` for a signed-in owner.
- [ ] Probe. 200 requests each at trunk and head with the flag on at head, interleaved in batches of 20.
- [ ] Baseline. Record the trunk p95 first.
- [ ] Rule. Fail when the head p95 is more than 15 ms above trunk.

**Review gate.** None. P16-5 is not review-gated.

**Merge.**

- [ ] A covering verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] `main` merged in after the verdict, with `verdict-patch.mjs` saying `carries`.
- [ ] The owner merges through `pnpm run merge:pr`.

## Receive Superwall webhooks and repair from Apple (P16-6)

**Depends on.** P16-4.

**Files.**

- [ ] Create `apps/api/src/billing/webhook.ts`, `apps/api/src/billing/repair.ts` and their tests.
- [ ] Edit `apps/api/src/build-app.ts`, `docs/operations/APPLE_SETUP.md` and `docs/operations/SERVER_RELEASES.md`.

**Build.**

- [ ] Add `POST /v1/billing/superwall-events`. Check the Svix signature and timestamp before reading the body, save the event ID once, and then confirm the subscription with Apple, as P16-4 does. The webhook payload never grants access by itself.
- [ ] Add a scheduled repair that re-reads from Apple each subscription whose expiry has passed or whose last event failed, with bounded batches and a checkpoint.
- [ ] Record the webhook URL, the signing secret's name and the schedule in the operations docs, with no secret.

**You see.**

- [ ] A signed `renewal` event moves the saved expiry forward after Apple confirms it.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `webhook.test.ts` covers a valid signature, a bad signature, an old timestamp, a duplicate event, out-of-order renewal and expiration, a refund and Apple down. Run `pnpm --filter @justgo/api exec vitest run tests/billing`.
- [ ] Repair cases resume from the checkpoint after a crash. Run `pnpm run test:db`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. Apple and Svix signing use loopback test keys.

- [ ] Lane 1. Regression lane against trunk. Trunk has no webhook route, so record the 404 and gate a signed renewal at the head. Save `renewal.json`. Pass when the expiry moves forward.
- [ ] Lane 2. Send an unsigned event. Save `unsigned.json`. Pass when it is refused and nothing is saved.
- [ ] Lane 3. Send a signed event with a stale timestamp. Save `stale.json`. Pass when it is refused.
- [ ] Lane 4. Send the same event twice. Save `duplicate.json`. Pass when one event row exists and both calls return 2xx.
- [ ] Lane 5. Send expiration before renewal for the same period. Save `out-of-order.json`. Pass when the final expiry matches Apple.
- [ ] Lane 6. Send a refund. Save `refund.json`. Pass when access ends once Apple confirms the revocation.
- [ ] Lane 7. Send an event whose payload claims a later expiry than Apple returns. Save `lying-payload.json`. Pass when Apple's expiry wins.
- [ ] Lane 8. Kill the repair job mid-batch and rerun it. Save `repair-resume.txt`. Pass when it resumes from the checkpoint and repeats no completed row.
- [ ] Lane 9. Make Apple return 503 during an event. Save `apple-down.json`. Pass when the API returns non-2xx so Superwall retries.
- [ ] Lane 10. Grep logs for the signing secret and payload. Save `log-scan.txt`. Pass when neither appears.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Server time to process one webhook against the loopback Apple stub, and repair time per 100 subscriptions.
- [ ] Probe. Trunk lacks both, so time 50 head webhooks and one repair over 100 seeded rows, interleaved with 50 `GET /v1/access` calls at trunk and head.
- [ ] Baseline. Record the trunk `GET /v1/access` p95 first.
- [ ] Rule. Fail when webhook p95 exceeds 500 ms, repair of 100 rows exceeds 30 seconds, or access p95 regresses more than 10%.

**Review gate.** None. P16-6 is not review-gated.

**Merge.**

- [ ] A covering verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] `main` merged in after the verdict, with `verdict-patch.mjs` saying `carries`.
- [ ] The owner merges through `pnpm run merge:pr`.

## Install Superwall in the app (P16-7)

**Depends on.** None.

**Files.**

- [ ] Edit `apps/mobile/package.json`, `pnpm-lock.yaml` and `apps/mobile/app.config.ts`.
- [ ] Create `apps/mobile/src/app-support/billing/superwall.ts` and its test.
- [ ] Create a StoreKit configuration file for simulator testing.

**Build.**

- [ ] Add `expo-superwall` at the version the prototype proved on Expo SDK 58.
- [ ] Configure it once at startup with the public API key and `eventTrackingBehavior: 'superwallOnly'`, or `'none'` if the prototype shows paywalls and purchases still work with it.
- [ ] Call `identify()` with the owner ID on account change, and `reset()` on logout. A guest stays anonymous. Never send onboarding answers, journal text or reflections as user attributes.

**You see.**

- [ ] The development build launches in the simulator with Superwall configured and no crash.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `superwall.test.ts` pins the tracking option and checks that `identify()`, `reset()` and attribute calls carry only the owner ID. Run `pnpm --filter @justgo/mobile run test --runTestsByPath src/app-support/billing/superwall.test.ts`.
- [ ] Full check with online Expo Doctor. Run `pnpm run check`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Build and launch trunk and head in the simulator. Save `launch-trunk-head.png`. Pass when both reach the first screen.
- [ ] Lane 2. Sign in a fixture account. Save `identify.png`. Pass when the debug log shows one `identify` with the owner ID and nothing else.
- [ ] Lane 3. Log out. Save `reset.png`. Pass when the log shows `reset`.
- [ ] Lane 4. Stay a guest. Save `guest.png`. Pass when no `identify` call happens.
- [ ] Lane 5. Capture the network with the simulator proxy while opening the app. Save `network.txt`. Pass when Superwall requests carry no journal or onboarding text.
- [ ] Lane 6. Start and finish a challenge. Save `challenge.png`. Pass when it works as on trunk, since no gate exists yet.
- [ ] Lane 7. Run the web export. Save `export-web.txt`. Pass when `export:web` succeeds and the web bundle loads no Superwall native module.
- [ ] Lane 8. Run the token canary test. Save `canary.txt`. Pass when `AppProvider.token-canary.test.tsx` passes.
- [ ] Lane 9. Run `analytics-packages.test.mjs`. Save `analytics.txt`. Pass when it passes and the PR records the decision on listing Superwall.
- [ ] Lane 10. Kill the app during launch three times. Save `relaunch.png`. Pass when it opens each time.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Cold start to first screen in the simulator, and the iOS app binary size.
- [ ] Probe. Five cold starts each at trunk and head, interleaved, timed from launch to the first screen's accessibility label.
- [ ] Baseline. Record the trunk median and size first.
- [ ] Rule. Fail when the head median is more than 300 ms slower or the binary grows by more than 8 MB.

**Review gate.** None. P16-7 is not review-gated.

**Merge.**

- [ ] A covering verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] `main` merged in after the verdict, with `verdict-patch.mjs` saying `carries`.
- [ ] The owner merges through `pnpm run merge:pr`.

## Save verified access on the phone (P16-8)

**Depends on.** P16-2 and P16-5.

**Files.**

- [ ] Create `apps/mobile/src/app-support/access/paid-access.ts` and its test.
- [ ] Edit `apps/mobile/src/app-support/access/admission.ts` and the providers that hydrate access.

**Build.**

- [ ] Save the API-verified status, expiry and last check time, scoped to the account, as rule 2 says. Switch it on account change.
- [ ] Use an unexpired saved value at once, offline too (rule 3). Refresh on open, foreground and reconnect when missing or older than five minutes, coalesced (rule 4). No polling (rule 6).
- [ ] Keep access on network failure before expiry (rule 7). At expiry require an online check (rule 8).
- [ ] `canStartChallenge()` reads this snapshot when the paid flag is on, and returns true when it is off.

**You see.**

- [ ] With the flag on and a saved unexpired snapshot, the app starts a challenge in airplane mode.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `paid-access.test.ts` mounts the real provider with a controllable vault, `fetch`, AppState and fake clock, and covers rules 2 to 8 and an account switch. Run `pnpm --filter @justgo/mobile run test --runTestsByPath src/app-support/access/paid-access.test.ts`.
- [ ] Mobile typecheck and lint. Run `pnpm --filter @justgo/mobile run typecheck && pnpm run lint`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe, on the web app with the fixture API.

- [ ] Lane 1. Regression lane against trunk. With the flag off, start a challenge at trunk and head. Save `flag-off.png`. Pass when both start.
- [ ] Lane 2. Flag on, verified fixture account. Save `verified-start.png`. Pass when the challenge starts.
- [ ] Lane 3. Flag on, unpaid fixture account. Save `unpaid-blocked.png`. Pass when starting is refused.
- [ ] Lane 4. Verified account, then block the API and reload. Save `offline-start.png`. Pass when the challenge still starts.
- [ ] Lane 5. Advance the fixture clock past expiry while offline. Save `expired-offline.png`. Pass when starting is refused.
- [ ] Lane 6. Switch from a verified account to an unpaid one. Save `switch.png`. Pass when the second account is refused.
- [ ] Lane 7. Wait six minutes in the foreground with the network log open. Save `no-poll.txt`. Pass when no access request is made.
- [ ] Lane 8. Background and foreground after six minutes. Save `foreground-refresh.txt`. Pass when exactly one request is made.
- [ ] Lane 9. Open settings, legal pages, export and delete as an unpaid account. Save `free-areas.png`. Pass when every one opens.
- [ ] Lane 10. Upload an earlier completion after expiry. Save `late-upload.png`. Pass when it syncs.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from app open to an enabled start button for a verified account.
- [ ] Probe. Ten web reloads each at trunk and head, interleaved, timed from navigation start to the button's enabled state.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Fail when the head median is more than 100 ms slower.

**Review gate.** None. P16-8 is not review-gated.

**Merge.**

- [ ] A covering verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] `main` merged in after the verdict, with `verdict-patch.mjs` saying `carries`.
- [ ] The owner merges through `pnpm run merge:pr`.

## Show the hard paywall and verify each purchase (P16-9)

**Depends on.** P16-7 and P16-8.

**Files.**

- [ ] Create `apps/mobile/src/app-support/billing/paywall.ts` and its test.
- [ ] Edit the challenge start path and `apps/mobile/src/app-support/billing/superwall.ts`.

**Build.**

- [ ] When `canStartChallenge()` refuses, register the Superwall placement `start_challenge`, gated in the dashboard. Superwall shows the paywall Anthony designs in its editor.
- [ ] After `purchased` or `restored`, send the transaction to `POST /v1/billing/verifications` at once, bypassing the five-minute threshold (rule 5). Unlock only on a verified response. Show an honest pending state while it runs.
- [ ] A cancelled or failed purchase returns to the previous screen with nothing unlocked.

**You see.**

- [ ] In the simulator with the StoreKit file, buying the annual plan shows the trial and then starts the challenge after the API verifies it.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `paywall.test.ts` covers purchased, cancelled, pending, failed, restored, verification refused and verification unavailable. Run `pnpm --filter @justgo/mobile run test --runTestsByPath src/app-support/billing/paywall.test.ts`.
- [ ] Affected journeys. Run `pnpm run test:journey`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe, in the iOS Simulator with the StoreKit file.

- [ ] Lane 1. Regression lane against trunk. Trunk has no paywall, so record that and gate the flow at the head. A guest taps start, sees the paywall, buys the annual plan and starts the challenge. Save `guest-buy.png`. Pass when the challenge starts after verification.
- [ ] Lane 2. A signed-in account buys monthly. Save `account-buy.png`. Pass when the row has the owner ID.
- [ ] Lane 3. Cancel the purchase sheet. Save `cancel.png`. Pass when nothing unlocks.
- [ ] Lane 4. Make the API refuse verification. Save `refused.png`. Pass when the app explains it and stays locked.
- [ ] Lane 5. Block the API during verification. Save `pending.png`. Pass when the app shows pending and unlocks once the API returns.
- [ ] Lane 6. Restore on a fresh install. Save `restore.png`. Pass when access returns after verification.
- [ ] Lane 7. Check the paywall for price, period, trial terms, auto-renew text, Terms of Use, Privacy Policy and Restore. Save `disclosures.png`. Pass when every item is visible.
- [ ] Lane 8. Use VoiceOver on the paywall. Save `voiceover.png`. Pass when every button has a label.
- [ ] Lane 9. Turn the paid flag off. Save `flag-off.png`. Pass when no paywall shows.
- [ ] Lane 10. Kill the app after purchase and before verification, then reopen. Save `crash-resume.png`. Pass when verification completes and no second purchase is asked.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from tapping start to the paywall on screen, and from purchase success to the challenge starting.
- [ ] Probe. Trunk has no paywall, so time ten head runs of each and, interleaved, ten trunk and head runs of tapping start with the flag off.
- [ ] Baseline. Record the trunk flag-off start time first.
- [ ] Rule. Fail when the paywall takes more than 1.5 seconds, the unlock after purchase more than 3 seconds against the loopback API, or the flag-off start regresses more than 10%.

**Review gate.** Anthony reviews before merge.

- [ ] Copy lane 1, 4, 5 and 7 screenshots into `.local/phase-16/media/P16-9-review-<slug>.png`.
- [ ] Record a 30 to 60 second simulator video of a guest buying and starting a challenge. Save it as `.local/phase-16/media/P16-9-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator, Anthony, to approve.

**Merge.**

- [ ] A covering verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] `main` merged in after the verdict, with `verdict-patch.mjs` saying `carries`.
- [ ] The owner merges through `pnpm run merge:pr` after Anthony's approval.

## Build onboarding from the Gleam reference (P16-10)

**Depends on.** P16-9.

**Files.**

- [ ] Create `apps/mobile/src/features/onboarding/` with its screens, state and tests.
- [ ] Edit the root stack, `scripts/quality/routes.test.mjs` and the welcome route.

**Build.**

- [ ] Add short question blocks about where the person wants to start, a starting-point playback, and a commitment pledge, as `.local/phase-16/gleam-analysis.md` recommends. Keep the answers on the phone only.
- [ ] End onboarding at the `onboarding_complete` placement, which shows the same paywall.
- [ ] Skip what the analysis rejects. No attribution question, no gender question, no invented scores or reviews, and no outcome promises.

**You see.**

- [ ] A new install walks the questions, shows the starting point and lands on the paywall.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Component tests cover each screen with role and label queries, back navigation and saved answers. Run `pnpm --filter @justgo/mobile run test --runTestsByPath src/features/onboarding`.
- [ ] Route tests pass. Run `pnpm run test:architecture`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe, on the web app and in the simulator.

- [ ] Lane 1. Regression lane against trunk. Trunk opens to the access gate and welcome. Record that and gate a first launch at the head. Save `first-launch.png`. Pass when onboarding ends at the paywall.
- [ ] Lane 2. Answer every question and go back twice. Save `back.png`. Pass when the answers stay.
- [ ] Lane 3. Kill the app halfway and reopen. Save `resume.png`. Pass when it resumes at the same screen.
- [ ] Lane 4. Finish onboarding with an existing subscription. Save `subscribed.png`. Pass when no paywall shows.
- [ ] Lane 5. Read the network log through onboarding. Save `network.txt`. Pass when no answer leaves the phone.
- [ ] Lane 6. Use the largest text size. Save `large-text.png`. Pass when nothing is clipped.
- [ ] Lane 7. Turn on Reduce Motion. Save `reduced-motion.png`. Pass when animations are replaced.
- [ ] Lane 8. Use VoiceOver through the pledge. Save `voiceover.png`. Pass when every control is reachable and named.
- [ ] Lane 9. Sign in from onboarding. Save `sign-in.png`. Pass when recovery and sign-in stay reachable without paying.
- [ ] Lane 10. Run on the smallest supported iPhone size. Save `small-screen.png`. Pass when every screen fits.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from cold start to the first onboarding screen, and frame drops during transitions.
- [ ] Probe. Five cold starts each at trunk and head, interleaved, timed to the first interactive screen. Record transitions with the performance monitor.
- [ ] Baseline. Record the trunk median to the welcome screen first.
- [ ] Rule. Fail when the head median is more than 200 ms slower or any transition drops below 50 fps.

**Review gate.** Anthony reviews before merge.

- [ ] Copy lane 1, 2 and 6 screenshots into `.local/phase-16/media/P16-10-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of onboarding from first launch to the paywall. Save it as `.local/phase-16/media/P16-10-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator, Anthony, to approve.

**Merge.**

- [ ] A covering verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] `main` merged in after the verdict, with `verdict-patch.mjs` saying `carries`.
- [ ] The owner merges through `pnpm run merge:pr` after Anthony's approval.

## Add subscription settings and deletion handling (P16-11)

**Depends on.** P16-6 and P16-9.

**Files.**

- [ ] Create `apps/mobile/src/features/settings/subscription/` with its row, screen and tests.
- [ ] Edit `apps/mobile/src/app-support/identity/deletion/` and `apps/api/src/identity/` for the deletion step.

**Build.**

- [ ] Settings shows the plan and renewal date, a Manage Subscription button that opens Apple's page, and Restore Purchases.
- [ ] Account deletion keeps the notice that deleting does not cancel the Apple subscription, and asks Superwall to delete that user's data by the method Superwall confirmed.
- [ ] A guest who signs in hands the guest subscription to the account during #492 adoption, and the API saves the owner on that row.

**You see.**

- [ ] Settings shows `Annual, renews <date>` for a subscribed account.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Settings tests cover subscribed, trial, expired and guest states. Run `pnpm --filter @justgo/mobile run test --runTestsByPath src/features/settings/subscription`.
- [ ] Deletion and adoption cases. Run `pnpm --filter @justgo/mobile run test --runTestsByPath src/app-support/identity/deletion src/app-support/providers/activity-runtime.managed.test.ts`.
- [ ] API adoption and deletion cases. Run `pnpm run test:db`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe.

- [ ] Lane 1. Regression lane against trunk. Open settings at trunk and head. Save `settings.png`. Pass when every trunk row is still there and the head adds the subscription row.
- [ ] Lane 2. Tap Manage Subscription. Save `manage.png`. Pass when Apple's subscription page opens.
- [ ] Lane 3. Tap Restore Purchases with a sandbox subscription. Save `restore.png`. Pass when the API verifies it.
- [ ] Lane 4. Buy as a guest, then sign in. Save `adopt.png`. Pass when the account has access and the row has the owner.
- [ ] Lane 5. Sign in to a second account on the same phone. Save `second-account.png`. Pass when the restore rules in the PR decide the owner and no private history moves.
- [ ] Lane 6. Delete a subscribed account. Save `delete-notice.png`. Pass when the notice says the subscription is not cancelled.
- [ ] Lane 7. Check the Superwall deletion request after deletion. Save `superwall-delete.txt`. Pass when it ran after the owner transaction and its failure did not block deletion.
- [ ] Lane 8. Run delete-all on a subscribed account. Save `delete-all.png`. Pass when access stays.
- [ ] Lane 9. Use VoiceOver on the subscription screen. Save `voiceover.png`. Pass when every control is named.
- [ ] Lane 10. Open settings offline. Save `offline.png`. Pass when the saved plan shows and Manage stays usable.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time to render the settings screen.
- [ ] Probe. Ten opens each at trunk and head, interleaved.
- [ ] Baseline. Record the trunk median first.
- [ ] Rule. Fail when the head median is more than 50 ms slower.

**Review gate.** Anthony reviews before merge.

- [ ] Copy lane 1, 4 and 6 screenshots into `.local/phase-16/media/P16-11-review-<slug>.png`.
- [ ] Record a 30 to 60 second video of settings, restore and deletion. Save it as `.local/phase-16/media/P16-11-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator, Anthony, to approve.

**Merge.**

- [ ] A covering verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] `main` merged in after the verdict, with `verdict-patch.mjs` saying `carries`.
- [ ] The owner merges through `pnpm run merge:pr` after Anthony's approval.

## Update the privacy policy, data inventory and App Privacy answers (P16-12)

**Depends on.** None.

**Files.**

- [ ] Edit `docs/legal/PRIVACY_POLICY_DRAFT.md`, the data inventory and `scripts/quality/policy-copy.test.mjs`.
- [ ] Edit `docs/operations/APPLE_SETUP.md` for the App Privacy answers.

**Build.**

- [ ] Name Superwall as a processor, what it receives (purchase history, the owner ID, device and usage events at the chosen tracking level), why, how long, and how deletion works.
- [ ] Add Purchases and, when tracking is on, Product Interaction under App Functionality and Analytics. Nothing is used for tracking.
- [ ] Add the Terms of Use (Apple's standard EULA) and Privacy Policy links the paywall needs.

**You see.**

- [ ] `pnpm run build:legal` shows the new Superwall section on the Privacy page.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Doc links and policy copy pass. Run `node --test scripts/quality/doc-links.test.mjs scripts/quality/policy-copy.test.mjs`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe, on the built legal pages in the browser pane.

- [ ] Lane 1. Regression lane against trunk. Build the legal pages at trunk and head. Save `privacy-diff.png`. Pass when only the billing sections changed.
- [ ] Lane 2. Read the processor section. Save `processor.png`. Pass when it names Superwall and Apple.
- [ ] Lane 3. Read the retention section. Save `retention.png`. Pass when billing retention is stated.
- [ ] Lane 4. Read the deletion section. Save `deletion.png`. Pass when it says deleting does not cancel the subscription.
- [ ] Lane 5. Follow every link on the Privacy page. Save `links.txt`. Pass when none is broken.
- [ ] Lane 6. Open the page on a phone-width viewport. Save `mobile.png`. Pass when nothing scrolls sideways.
- [ ] Lane 7. Run `pnpm run build:legal --production`. Save `production.txt`. Pass when it refuses unapproved metadata until Anthony approves.
- [ ] Lane 8. Compare the App Privacy answers with the data inventory. Save `labels.txt`. Pass when they match.
- [ ] Lane 9. Read the Terms link. Save `terms.png`. Pass when it opens Apple's standard EULA.
- [ ] Lane 10. Use VoiceOver on the page. Save `voiceover.png`. Pass when headings are in order.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Built Privacy page size in bytes.
- [ ] Probe. Run `pnpm run build:legal` at trunk and head and measure the output file.
- [ ] Baseline. Record the trunk size first.
- [ ] Rule. Fail when the head page is more than 50% larger.

**Review gate.** None. P16-12 is not review-gated. Anthony approves the legal text through the legal approval flow in `docs/legal/`.

**Merge.**

- [ ] A covering verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] `main` merged in after the verdict, with `verdict-patch.mjs` saying `carries`.
- [ ] The owner merges through `pnpm run merge:pr`.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] Gate #110 passes on a physical iPhone with sandbox purchase, restore, cancel, expiry and refund, and its evidence is linked on the issue.
- [ ] With Anthony's go, set `BILLING_ENABLED` on staging, run the sandbox checks there, and file a `gate` issue for each deferred hosted or device check.
- [ ] Update `AGENTS.md` and the owning operations docs to the implemented billing rules.
- [ ] Reply to Anthony with the report `pstack/skills/poteto-mode/playbooks/autopilot-full.md` names.

## Appendix A. Prototype evidence

No prototype has run yet. Each question below stays unproven until a throwaway branch answers it, with the branch, SHA and evidence recorded here.

1. Does `expo-superwall` build and run on Expo SDK 58 and React Native 0.88 in a development build? Superwall documents Expo SDK 53 and up and iOS 16.4 for SDK 56 and up. JustGO already targets iOS 16.4.
2. With `identify()` given the owner UUID, does Superwall pass it to StoreKit as the appAccountToken? Its webhook docs hint at UUID user IDs reaching the store, but no page says so.
3. Does the purchase or restore result, or `getCustomerInfo()`, give the phone the transaction ID that P16-4 needs?
4. With `eventTrackingBehavior` at `none` or `superwallOnly`, do gated paywalls, purchases and webhooks still work?
5. Does Apple's App Store Server Library, or a WebCrypto check of the signed chain, run in the pinned Supabase Edge runtime under `pnpm run test:edge`?
6. Does a StoreKit configuration file work with an Expo development build in the simulator, so native lanes run without sandbox accounts?
7. Can a Superwall paywall show Apple's required disclosures and a trial reminder, and can Superwall delete one user's data?

## Appendix B. Alternatives rejected

- JustGO's own paywall screen with Superwall's purchase API. It avoids the 1% fee and keeps tracking off, but Anthony chose Superwall's paywall editor on 2026-11-19 for design and testing in the dashboard. This replaces the October 28 decision to use JustGO's own billing screen.
- RevenueCat. It has a server subscriber API and signed webhooks, but Anthony chose Superwall on 2026-11-19, keeping the October 28 choice.
- `expo-iap` with only Apple on the server. It adds no processor and no fee, but loses the paywall editor Anthony wants.
- Trusting Superwall's subscription status or webhook payload for access. Neither is signed by Apple, so the API confirms every change with Apple.
- Pointing App Store Server Notifications at the JustGO API. Superwall needs that URL for its own revenue records, so JustGO receives Superwall's webhook and confirms with Apple.
- Creating a server identity for guests. Guests have none today, so a guest purchase is keyed by Apple's original transaction ID and gets its owner on sign-in.
- A free grace period or lifetime free access for free-launch users. Anthony chose the same paywall and trial for everyone.

## Appendix C. Risks

- Superwall's 1% fee applies to revenue through its paywalls, above the free tier. Watch it in P16-9 and confirm the basis in writing first.
- Superwall's paywalls need its event tracking, which is close to the product analytics `AGENTS.md` keeps for Phase 17. P16-7 and P16-12 must name exactly what is sent, and the analytics rule may need a recorded exception.
- A guest transaction ID that leaks could be claimed by someone else before the guest signs in. P16-4 watches for a transaction already bound to another owner.
- Installed free builds accept only `free_beta`. When `BILLING_ENABLED` turns on, old builds may stop working. P16-2 records the update path.
- Apple App Review guideline 3.1.2 requires the price, period, trial terms, auto-renew text, Terms and Privacy on the paywall. P16-9 lane 7 checks it before submission.
- Apple App Review guideline 5.1.1 rejects forced sign-in before purchase. Guest purchase covers it.
- No control skill drives native purchases end to end on a physical phone. Native lanes run in the simulator with a StoreKit file, and #110 covers the physical phone.

## Appendix D. Links and reading list

- `AGENTS.md`, especially Rules and what enforces them, Security and privacy, and Git and autonomy.
- `docs/operations/APPLE_SETUP.md` for the App Store Connect app, products and keys.
- `docs/operations/ACCOUNT_SYNC_SETUP.md` for sign-in and adoption.
- `.local/phase-16/gleam-analysis.md` for the onboarding and paywall reference. Copy it there from the brainstorm notes before P16-10 starts.
- Superwall Expo docs at https://superwall.com/docs/expo/quickstart/install and webhooks at https://superwall.com/docs/integrations/webhooks/v2.
- Apple App Store Server API at https://developer.apple.com/documentation/appstoreserverapi.
- Apple App Review Guidelines at https://developer.apple.com/app-store/review/guidelines/.
- Gate issues #110, #105 and #118.
- Keep a decision trail at `.local/decision-trails/phase-16.tsv`.

## Appendix E. Decisions and subscription rules in force

Decisions.

- Provider. Superwall (Anthony, 2026-10-28, confirmed 2026-11-19). If a prototype in Appendix A fails, ask Anthony before switching provider.
- Paywall. Hard, shown by Superwall's paywall editor (Anthony, 2026-11-19). Recovery, settings, legal pages, data export and deletion stay reachable without paying.
- Offer. Annual US$59.99 with a 7-day free trial, preselected, and Monthly US$12.99 with no trial. No weekly plan. CA and UK prices come from Apple's price table (Anthony, 2026-11-19).
- Free-launch users. Same paywall and trial as new users. Their history and journal stay (Anthony, 2026-11-19).
- Guests. Can buy without signing in. The subscription moves into the account they later sign in to (Anthony, 2026-11-19).
- Reference. Onboarding and paywall follow the Gleam app's screens, adapted as the Gleam analysis says (Anthony, 2026-11-19).
- Keep out. No Stripe checkout, Redis or always-on worker. No client premium flag. No private-history recovery from a receipt. No provider call inside a database transaction. General analytics stays in Phase 17.

The nine subscription rules.

1. **First use.** Verify subscription access through the API before unlocking paid features. A missing verification cannot unlock first use offline.
2. **Remember verification.** Save the API-verified status, expiry and last successful check time on the phone, scoped to the account. Switch or clear it when the account changes. Never reuse another account's access or trust a client premium flag.
3. **Immediate access.** On open, use a still-valid saved verification at once, offline too. Validity depends on the verified expiry, not on a freshness cutoff or a failed background query.
4. **Background refresh.** On open, foreground return or reconnection, check when verification is missing or the last successful check is more than five minutes old. Coalesce overlapping triggers. A network failure never replaces a still-valid saved verification.
5. **Purchase and restore.** Verify through the API at once after a purchase or restore, bypassing the five-minute threshold. Keep honest pending states.
6. **No constant polling.** The free launch removed 30-second access requests and the one-minute cutoff on 2026-11-17. Do not bring them back. Five minutes passing alone triggers neither a request nor a block.
7. **Network failure before expiry.** Keep paid use from the still-valid saved verification.
8. **At the saved expiry.** Require an online check before paid use continues. A verified renewal extends access. With none, paid features lock. There is no offline grace period and no exception for finishing a challenge in progress (Anthony, 2026-09-21). Saved reps and reflections stay.
9. **Upload earlier reps after expiry.** Reps recorded while verified access was valid upload after expiry, with authentication and ownership checks. Earlier-upload eligibility stays separate from unlocking new paid activity.
