<a id="phase-15"></a>

# Phase 15 plan to move the API to one Supabase Edge Function

**Status.** By November 6, 2026, Anthony had confirmed Supabase Edge Functions as the API host and retired the Cloudflare Workers rollout. P15-1 recorded `Decision: stop` on November 7 (#218). P15-3 (#201), P15-4 (#203) and P15-7 (#264, #265) have merged. On November 11, 2026, Anthony overrode the stop and chose the [fast path](#fast-path), which sets the order of the remaining work. On November 12, 2026, the hosted window ran P15-2 and P15-9, and the `api` function now serves staging, at `fdd410d` since that evening. On November 13, 2026, P15-11 switched TestFlight to build 7, which uses the function, expired builds 3, 4 and 5, deleted the API Worker and its Hyperdrive configuration, and paused the Vercel API project. [Appendix A](#appendix-a-prototype-evidence) records the receipts.

The last recorded deploys put the API on two staging hosts. Vercel has the old Fastify build for TestFlight build 5, and a Cloudflare Worker has Hono for the beta profile. No production API exists. This plan moves main's Hono API to one Edge Function named `api` in the existing JustGo project, for Anthony's builds now and for outside beta testers later. The rule is that no step may weaken account ownership, deletion, local retention or recovery, and every hosted step waits for Anthony's go. The steps are P15-1 and P15-2 (trials), P15-3, P15-4 and P15-5 (removals and recovery), P15-6 (entry), P15-7 (mobile base path), P15-8 (release lane), P15-9 (hosted acceptance), P15-10 (notices) and P15-11 (switch and retire). The fast path below runs them in a different order. Appendix A records why, and the [analysis on #171](https://github.com/anthonyyoo24/justgo/pull/171#issuecomment-6695056934) holds the full citations.

## Fast path

On November 11, 2026, Anthony chose the fastest path that keeps every critical check. It overrides P15-1's `Decision: stop`, which failed only the rule that a small route's CPU stays within twice trunk's, a ratio that garbage-collection pauses drove ([Appendix A](#appendix-a-prototype-evidence)). Every P15-1 lane passed. Where a section below disagrees with this one, this one wins.

1. **PR 1, entry and release lane.** P15-6 absorbs P15-8. One PR adds the Edge entry, its CI smoke and the Supabase staging lane, reusing the `phase15/edge-trial` code. It replaces the Worker's deploy lane but keeps the Worker code, and the deployed Worker keeps serving the beta profile.
2. **Hosted window.** On one go from Anthony that names the deploy, the secrets and the trial function's deletion, run P15-2 and P15-9 together. Deploy `api` from `main` through the new lane, deploy `justgo-trial` for its probe route, run the kept lanes, then delete `justgo-trial`. No build points at the function yet, so a failure reaches no user. On a failure, stop and present it to Anthony. One docs PR records the result.
3. **PR 2, switch.** P15-11 points the Dev and beta profiles at the function. Anthony ships a new TestFlight build and checks it on the iPhone. The Worker and the Vercel API stay until that build passes.
4. **Cleanup and notices.** P15-5 then removes the Worker code. P15-10 updates the notices before the first outside tester joins.

**Kept.** The hosted query speed and the predicted worst-case sync, the log canary, the forged client-address check, the cold start, Anthony's sign-in on the iPhone, one independent verifier per PR, CI's security tests, Anthony's go before every hosted step, and the R2 backups.

**Deferred, not dropped.** P15-2 lanes 3, 7 and 9 (the pooler `statement_timeout`, the region pin and the body-size limits) run before the first outside tester joins. P15-9 lanes 5 to 8 run there too, except where P15-11's iPhone lanes cover them. P15-9 lane 3, the worst-case import on the iPhone, runs in the hosted window only when P15-2 predicts a worst-case sync above 4,000 ms. P15-9 lane 10 waits until backups resume.

**Dropped.** The hourly `/loop` audit tick, and the rule that a small route's CPU stays within twice trunk's. P15-6 uses a fixed CPU limit instead.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-full.md` from the installed pstack plugin. An agent merges each verified PR, including those that touch an [Agent-effort](../../AGENTS.md#agent-effort) path, as Anthony decided on November 10, 2026. P15-10 still waits for his review of the notices, and P15-3 for his Vercel check, before merge. P15-1 and P15-2 are prototypes and never merge. Only their docs PRs, which record the results, merge.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

This plan replaces the paused Cloudflare plan, which P15-11 deleted. Git history keeps it. Phase 16 remains billing. Phase 14 privacy, release and device gates stay open.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to Anthony, then stop. Start execution only on Anthony's explicit go.
- [ ] Read these from trunk at program start. Re-read them before each PR.
  - [ ] `git show origin/main:AGENTS.md`
  - [ ] `git show origin/main:docs/implementation-plan/phase-15-supabase-api.md`
  - [ ] `git show origin/main:.claude/skills/verify-justgo/SKILL.md`
  - [ ] `git show origin/main:docs/operations/SERVER_RELEASES.md`
  - [ ] The installed pstack plugin's `skills/poteto-mode/playbooks/autopilot-full.md` and `skills/poteto-mode/playbooks/opening-a-pr.md`. pstack is a plugin, so these files are not in this repository.
- [x] Get Anthony's decisions before dependent work starts. He made all five in the planning session on November 6, 2026.
  - [x] Production arrangement. Phase 15 releases staging only. Production uses the same release lane in a later approved step.
  - [x] Legal page hosting. The legal pages stay on Vercel, because they carry no account data. Edge Functions rewrite HTML to plain text without a custom domain.
  - [x] Backups. R2, the backup clock Worker and the Cloudflare account that holds them stay.
  - [x] Plan tier. The project stays on Supabase Free. Before any purchase, present the limits and the spend-cap behavior.
  - [x] Local tools. Edge runtime lanes run in GitHub Actions, and nothing new is installed on the Mac.
- [x] The backup clock token was renewed on November 13, 2026. The new token stops passing the clock's expiry check at 23:40 UTC on December 12, 2026.
- [x] Backups resumed on November 13, 2026. The R2 credentials and the clock token were renewed, `JUSTGO_BACKUPS_ENABLED` went back to `approved`, and one database run and one ledger run passed. The [backup runbook](../operations/CLOUDFLARE_BACKUPS.md#credential-dates) and issue #77 record the new expiry dates. The R2 credentials expire on November 20, 2026, and gate #474 tracks the next renewal.
- [ ] On Anthony's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle that `playbooks/autopilot-full.md` names. In Claude Code an owner is an `Agent` with `isolation: "worktree"`. Owners run at `high` effort, the cap that [Agent effort](../../AGENTS.md#agent-effort) sets, including the P15-1 owner whose trial branch touches `apps/api/scripts/`.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges or reports the named result.
  - [x] P15-1, P15-3, P15-4 and P15-7 are done.
  - [x] P15-6, which carries P15-8, branches from `main` now. It merged as #445.
  - [x] The hosted window, P15-2 and P15-9 together, after P15-6 merges and on Anthony's go. It ran on November 12, 2026, and #456 recorded it.
  - [x] P15-11 after the hosted window passes and its docs PR merges. #462 to #464 switched the builds, and build 7 passed on November 13, 2026. Lanes 4, 5, 6 and 10 and the perf rule stay unchecked, because they passed on Anthony's report alone, were skipped or wait for the first clock-dispatched nightly database run (#476).
  - [ ] P15-5 after the new TestFlight build passes P15-11. Build 7 passed, so P15-5 can run.
  - [ ] P15-10 after P15-9 merges, and before the first outside tester joins. It does not block P15-11 or P15-5.
- [ ] Hold the file boundaries.
  - [ ] P15-3 touches only `apps/api/vercel.json`, `.vercelignore`, `scripts/release/vercel-cli/`, the `onVercel` code, the `VERCEL` legal-draft gates, and their tests and docs.
  - [ ] P15-5 touches only the API Worker code, its scripts, tests, CI step and docs. It never touches `scripts/backups/clock/`, `sites/legal/` or `.github/workflows/staging-health.yml`.
  - [ ] P15-7 touches only `apps/mobile/src/lib/network/`, `scripts/development/`, the fixture API prefix and their tests.
  - [ ] P15-6 keeps the Worker code, its smoke scripts and `scripts/backups/clock/`. It replaces only the Worker's staging deploy lane.
  - [ ] P15-3 and P15-5 can both edit `apps/api/tests/http/routing.test.ts`. Whichever lands second rebases onto the first.
- [ ] Hold the review gate. P15-10 changes what users read. It waits for Anthony's review in chat with screenshots and a video before merge.
- [ ] Hold Anthony's hosted gates. Every deploy, `supabase secrets set`, provider setting change, new build and notice publication waits for his go. These happen in the hosted window (P15-2, P15-8 and P15-9), in P15-11 and in P15-10.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Use `gh` unless `command -v origin` succeeds and Origin resolves the repository. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, per **Opening a PR**. Run `gh pr create --base <base-branch>`. A stack child targets its parent branch.
- [ ] Run the checks that the [check matrix](../../AGENTS.md#choosing-checks) names for the touched paths once before the PR-facing push. Push with hooks on.
- [ ] Run `/deslop` before each commit when `cursor-team-kit` is installed, and run `/no-comments` before review.
- [ ] Triage every bot and security-review comment per pstack's `references/bugbot-triage.md`.
- [ ] Rebase onto current trunk before the code-ready report and babysit. Keep that merge base in fix rounds. Rebase again only at merge prep, on a `git merge-tree` conflict with trunk, on a CI failure that comes from a change on trunk, or when a known concurrent change to the same files lands.

### Verdict and merge, for every PR

- [ ] One verifier runs at the code-ready head, per [Git and autonomy](../../AGENTS.md#git-and-autonomy). It re-runs the gates, runs the live lanes from the PR's **Verify, live** block and the perf lane from its **Verify, perf** block, then reads the diff and the receipts and distrusts the PR body. Each fix round gets a fresh verifier at the new head. A rebase or merge-conflict resolution gets one unless its verdict carries under the rule below, and a wording-only change gets none. A full swarm, per pstack's `skills/swarm/SKILL.md`, runs only when Anthony asks for one. The root audits the receipts in the merge-ready report before the verdict.
- [ ] Judge every finding by the execution playbook's blocking rule. The verdict is clean when none blocks. A failure on trunk behavior in a lane marked `Regression lane against trunk.` is recorded against trunk and does not block the PR. A new head gets a fresh verdict, except for results that stay valid under the patch-id rule in pstack's `playbooks/shipping.md`.
- [ ] Post each verdict as a PR comment whose verdict line has the form that [AGENTS.md](../../AGENTS.md#git-and-autonomy) gives, with each SHA in backticks. The `verdict` check parses only that form. The verifier is a separate Claude agent that did not write the PR, and the comment says so.
- [ ] Merge only on green CI plus a clean verdict at the exact head. After a rebase, run `node scripts/quality/verdict-patch.mjs check <verdict-base> <verdict-head>`. `carries` and `docs-tests-only` keep the verdict. `re-verify` needs a new one. An agent merges its own PR through `pnpm run merge:pr`, Agent-effort paths included.

### Boot recipe, for every live lane

Each live lane runs at the PR head in its own worktree. Lanes run one at a time against one local stack. Edge runtime lanes run in GitHub Actions, as Anthony decided on November 6, 2026.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Start the database with `pnpm run db:local`, then run `pnpm run db:migrate`.
- [ ] For an app lane, run `.claude/skills/verify-justgo/bin/verify serve`, then wait for `.claude/skills/verify-justgo/bin/verify doctor` to report `"state": "serving"`. For a function lane, start the bundle on the Edge runtime (the P15-1 trial script, or `pnpm run test:edge --serve` after P15-6) and wait for `/ready` to return 200.
- [ ] Deliver input only through `curl`, the `verify-justgo` drives or the built-in browser pane. The read-only diagnostics are `verify doctor`, `/health`, `/ready` and SQL readback through `pnpm --filter @justgo/api run test:db:file`.
- [ ] Run a hosted lane only after Anthony's go for that PR. Never send a fixture proof to a hosted API.
- [ ] Save every receipt to `.local/swarm/<pr-id>/lane-<n>/<slug>` and return the paths with the report. Mask tokens and private text before you save.
- [ ] Stop the stack with `.claude/skills/verify-justgo/bin/verify stop`, and compare doctor counts before and after.

## Run the local runtime trial (P15-1)

**Depends on.** None.

**Result.** `Decision: stop` on November 7, 2026. All ten lanes passed and the worst-case sync met its bound, but the health route's p95 CPU on the Edge runtime was more than twice trunk's. [Appendix A](#appendix-a-prototype-evidence) holds the evidence, including how the failing route depends on the CPU reading.

**Files.**

- [x] Create the throwaway branch `phase15/edge-trial` from `main`. Never merge it.
- [x] Create `apps/api/src/edge.ts`, `supabase/config.toml`, `supabase/functions/api/index.ts` and `supabase/functions/api/deno.json` on that branch.
- [x] Create `apps/api/scripts/edge-trial.ts` on that branch. Port the route sequence and database readback from `apps/api/scripts/workers-smoke.ts:248-340`.
- [x] Create a worst-case sync fixture on that branch with 50 journal versions of 50 parents each, close to the 4 MiB body bound.
- [x] Create a workflow on that branch, triggered by `push` to `phase15/edge-trial`, that runs the trial in a pinned `supabase/edge-runtime` image against `justgo_test`. It uploads the report, receipts and CPU profiles as a workflow artifact. Download the artifact to `.local/edge-trial/`.
- [x] Record whether the pinned image enforces the hosted 2 s CPU limit. If it does not, the CPU rule reads the profiles, and P15-2 and P15-9 confirm on the hosted function.

**Build.**

- [x] Bundle `apps/api/src/edge.ts` with esbuild into one ESM file. Reuse the contracts alias in `scripts/release/staging-worker-build.mjs:132-138`. Record the bundle size.
- [x] Serve the bundle with `Deno.serve`. Strip the `/api` function prefix once before `app.fetch`.
- [x] Map `JUSTGO_AUTH_PUBLISHABLE_KEY` and `JUSTGO_AUTH_SECRET_KEY` into the existing `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_AUTH_SECRET_KEY` config fields. Leave `readConfig` unchanged.
- [x] Build the app and a one-connection `pg` pool once per worker.
- [x] On the Edge entry, time ten `select 1` round trips inside one transaction after one untimed query, and record the median. P15-2 repeats this probe on the hosted function.
- [x] Run `pg` both bundled with a `node:buffer` banner and external as an `npm:` import. Record which one works.
- [x] If `pg` fails over TLS or inside a transaction, repeat the trial with `drizzle-orm/postgres-js` and record the difference.

**You see.**

- [x] `.local/edge-trial/report.md` lists every lane with pass or fail, the bundle size, CPU and wall time per route, the query count of the worst-case sync, the loopback median of ten timed `select 1` round trips, and one decision line, `Decision: go` or `Decision: stop`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `npm run test -w @justgo/api` passes on the trial branch, which shows the trial entry changed no shared code.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes run the bundle on the Edge runtime in CI against `justgo_test`.

- [x] Lane 1. Regression lane against trunk. Run the trial route sequence on the trunk Node entry and on the head Edge entry. Save `route-sequence.json`. Pass when every status and body matches apart from request IDs.
- [x] Lane 2. Request `GET /api/health` and `GET /api/ready` on the Edge entry. Save `ready.json`. Pass when `/ready` returns 200 after readiness confirmed `justgo_runtime`, the `justgo` schema and the live-session helper.
- [x] Lane 3. Read the guest catalog with no bearer. Save `guest-catalog.json`. Pass when it returns 200 with the seeded challenges.
- [x] Lane 4. Send 20 interleaved attempt writes from two fixture users. Save `owner-isolation.json`. Pass when each user reads back only their own attempts and SQL readback shows no cross-owner row.
- [x] Lane 5. Read the second user's attempt with the first user's bearer. Save `cross-account.json`. Pass when the status matches the Node entry's and no row changes.
- [x] Lane 6. Throw from a trial-only failpoint after `set_config` inside a write. Save `rollback.json`. Pass when the API returns its typed 5xx body and SQL readback shows no partial row.
- [x] Lane 7. Create a loopback legacy session and two concurrent transfers with the same code, which take `pg_advisory_xact_lock`. Save `xact-locks.json`. Pass when one transfer succeeds and the other waits, then fails with the Node entry's status.
- [x] Lane 8. Decode a managed token payload with a stubbed Auth endpoint, and decode a progress cursor. Save `buffer-paths.json`. Pass when both decode with no `ReferenceError` for `Buffer`.
- [x] Lane 9. Post the worst-case journal sync batch. Save `worst-sync.json`. Pass when it returns 200, the saved count matches the batch, and the report records CPU ms, wall ms and the query count.
- [x] Lane 10. Trigger a server error with diagnostics on and a stub Sentry endpoint. Save `sentry-envelope.json`. Pass when the envelope reaches the stub with no request body, token or reflection text.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. CPU ms and wall ms per request for `/health`, the guest catalog, an attempt write and the worst-case journal sync, plus the sync's query count.
- [x] Probe. Run one request script against the trunk Node entry and the head Edge entry, alternating, for 20 rounds each. Capture CPU profiles from the inspector port.
- [x] Baseline. Record the trunk Node numbers first.
- [x] Rule. The trial fails if the worst-case sync takes more than 1,000 ms of CPU or 5,000 ms of wall time at loopback, or if a small route's p95 CPU is more than twice trunk's. If only the sync fails, add a plan section that batches the parent checks in `apps/api/src/data-sync/journal.ts`, and land it before P15-6.

**Review gate.** None. P15-1 is not review-gated.

**Merge.**

- [x] Never merge `phase15/edge-trial`. Keep the branch and its SHA for Appendix A.
- [ ] Open a docs-only PR that records the report in Appendix A and the decision in this plan. An agent merges it after an independent verdict.
- [ ] On `Decision: stop`, present the failed lanes to Anthony and stop the program.

## Run the hosted runtime trial (P15-2)

**Depends on.** P15-6 merged, with P15-8's lane, and Anthony's one go for the hosted window, which P15-2 shares with P15-9.

**Fast path.** Run lanes 1, 2, 4, 5, 6, 8 and 10 and the perf rule in the hosted window. Lanes 3, 7 and 9 run before the first outside tester joins. P15-6 picks the client-address header before this trial runs, so lane 4 confirms that choice. A different header gets a fix PR before P15-11. On November 12, 2026, lane 3 also ran in the window. [Appendix A](#p15-2-hosted-runtime-trial) records the result.

**Files.**

- [x] Edit `supabase/config.toml` on `phase15/edge-trial` to add `[functions.justgo-trial]` with `verify_jwt = false`.
- [x] Create a trial-only route on that branch that returns the client-address headers the function receives, the result of `show statement_timeout` inside a transaction, and the median of ten timed `select 1` round trips inside one transaction after one untimed query. It never merges.
- [x] Set `statement_timeout` in `poolOptions` to 4,321 ms on that branch only, so the probe can tell the pool value from the role's 5 s default.

**Build.**

- [x] With Anthony's go, set `DATABASE_URL` to the pooler user `justgo_runtime.<project-ref>` on port 6543, and set `DATABASE_CA_CERT` to the Supabase root CA.
- [x] With Anthony's go, deploy the trial bundle as `justgo-trial` from a workflow on the trial branch. The workflow installs Supabase CLI 3 through the SHA-pinned `supabase/setup-cli` action and runs `--remote <ref> --yes`. Anthony stores the Supabase access token in a protected GitHub environment.
- [x] After the lanes, delete the `justgo-trial` function with Anthony's go. Keep the secrets only if Anthony approves them for P15-8.

**You see.**

- [x] `.local/edge-trial/hosted-report.md` lists every hosted lane with pass or fail, the chosen client-address header, the region decision and one decision line.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `pnpm --filter @justgo/api run test` still passes on the trial branch after the hosted changes.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes call the hosted `justgo-trial` function from the Mac.

- [x] Lane 1. Regression lane against trunk. Request `GET /health` and `GET /ready` on the serving Worker and on `justgo-trial`. Save `hosted-ready.json`. Pass when both return 200 and the function's readiness confirms `justgo_runtime` over verified TLS.
- [x] Lane 2. Request `GET /health` with no `Authorization` and no `apikey` header, then send a protected request with an invalid bearer. Save `gateway-pass.json`. Pass when Hono answers both, the second with the API's typed `UNAUTHORIZED` body, not a gateway 401.
- [x] Lane 3. Read `show statement_timeout` from the trial route. Save `statement-timeout.json`. Pass when the report records the value. `4321ms` means the pooler accepted the pool setting, any other value means it ignored it, and a connection error means it rejected it and triggers the Appendix C fallback. After a rejection, redeploy the trial without the option, with Anthony's go, and rerun lanes 1, 2 and 4 to 10.
- [x] Lane 4. Send forged `x-forwarded-for`, `x-real-ip` and `cf-connecting-ip` headers to the trial route. Save `client-address.json`. Pass when one header always carries the Mac's real address, whatever the client sends. Record that header.
- [x] Lane 5. Send a canary request with a fake bearer, a canary header and canary body text, then read the Invocations view and the edge logs. Save `log-canary.json`. Pass when no bearer, header value or body text appears in any log. If any appears, stop and present it to Anthony.
- [x] Lane 6. Wait 15 minutes idle, then time the first request and 50 warm requests. Save `cold-warm.json`. Pass when the numbers meet the perf rule.
- [ ] Lane 7. Repeat lane 6 with `x-region: ca-central-1`, and read `x-sb-edge-region` on every response. Save `region-pin.json`. Pass when the report records both regions and the latency difference, and names the region decision.
- [x] Lane 8. Read the guest catalog 20 times. Save `guest-hosted.json`. Pass when every read returns the seeded catalog and release identity headers that name the trial source SHA.
- [ ] Lane 9. Send 1, 4 and 6 MiB bodies to an unauthenticated POST route. Save `body-limit.json`. Pass when the report records which sizes reach Hono and which the gateway rejects.
- [x] Lane 10. Read back the deploy and `supabase secrets list` in the workflow. Save `deploy-readback.json`. Pass when the function `version` and the bundle hash match the build, and the receipt holds no secret value.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Metric. Cold and warm wall ms for `/health` and the guest catalog measured from the Mac, and the function's per-query database latency, the median of the trial route's ten timed `select 1` round trips.
- [x] Probe. Alternate requests between the serving Worker and `justgo-trial` for 50 rounds after the idle wait in lane 6.
- [ ] Baseline. Record the Worker's warm p50 and p95 first.
- [ ] Rule. The trial fails if the function's warm p95 for the guest catalog exceeds 300 ms or its first request after idle exceeds 2,000 ms. It also fails if the predicted hosted wall time of the worst-case sync exceeds 8,000 ms. The prediction is the P15-1 loopback sync wall time plus the P15-1 query count times the difference between the hosted and loopback `select 1` medians. Hosted requests need a genuine account, so P15-9 measures that sync directly.

**Review gate.** None. P15-2 is not review-gated.

**Merge.**

- [ ] Never merge `phase15/edge-trial`.
- [ ] Open one docs-only PR that records the hosted report in Appendix A, the P15-9 receipts and the decision in this plan. An agent merges it after an independent verdict.
- [x] On `Decision: stop`, present the failed lanes to Anthony and stop the program.

## Remove the Vercel API leftovers (P15-3)

**Depends on.** None.

**Files.**

- [ ] Delete `apps/api/vercel.json`, `.vercelignore`, `scripts/release/vercel-cli/` and `scripts/quality/contract-upload.test.mjs`, which tests only `.vercelignore`.
- [ ] Edit `apps/api/src/server.ts`, `apps/api/src/runtime-app.ts`, `apps/api/src/build-app.ts`, `apps/api/src/identity/address.ts`, `apps/api/src/identity/routes.ts` and `apps/api/src/identity/managed-routes.ts`.
- [ ] Edit `apps/api/tests/identity/identity.test.ts`, `apps/api/tests/http/routing.test.ts`, `apps/api/tests/http/legal-drafts.test.ts` and `.github/dependabot.yml`.

**Build.**

- [ ] Delete the `onVercel` option and the `x-vercel-forwarded-for` reader. Rate limits use the `clientAddress` that the entry supplies.
- [ ] Keep every other Vercel mention. That covers the `VERCEL` refusals in `apps/api/scripts/challenge-dev.ts` and `scripts/release/staging-local.mjs`, the Vercel legal URLs, the Dev profile's Vercel API URL in `apps/mobile/eas.json` and `.github/workflows/development-ios.yml`, and `apps/api/.env.example`. P15-11 changes the API URLs.
- [ ] Delete both `VERCEL` gates on the development legal drafts, in `apps/api/src/runtime-app.ts:44-47` and `apps/api/src/build-app.ts:86-91`, and the `vercel: '1'` case in `apps/api/tests/http/legal-drafts.test.ts`.
- [ ] Keep the forged `x-vercel-forwarded-for` header in the adapter-address test in `apps/api/tests/http/routing.test.ts`. It shows that the header is ignored.
- [ ] If P15-4 merged first, delete the `onVercel` argument from `scripts/backups/recovery-auth-acceptance.mjs`. If P15-3 merged first, P15-4 deletes it.
- [ ] Before merge, Anthony confirms in the Vercel dashboard that Git deployments are off for the `justgo` project, so the merge cannot start a deploy.

**You see.**

- [ ] `rg -n 'onVercel|x-vercel-forwarded-for|vercel-cli' apps scripts .github -g '!apps/api/tests/**'` matches nothing, or only the `VERCEL_|vercel-cli` assertion in `scripts/quality/staging-api-workflow.test.mjs` if P15-5 has not removed it, and `apps/api/vercel.json` and `.vercelignore` are gone.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/api/tests/identity/identity.test.ts` keys a managed-auth rate bucket by the supplied client address and ignores `x-vercel-forwarded-for`. Run `pnpm --filter @justgo/api run test tests/identity/identity.test.ts`.
- [ ] Run `pnpm --filter @justgo/api run typecheck`, `pnpm run lint` and `pnpm run test:architecture`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes drive the Node fixture API and Expo web.

- [ ] Lane 1. Regression lane against trunk. Run `verify drive welcome challenge progress account data` at trunk and at head. Save `drive-summary.json`. Pass when the same drives pass on both.
- [ ] Lane 2. Send 121 managed sign-in requests from one address to the Node fixture API. Save `rate-one.json`. Pass when request 121 returns 429 with `Retry-After`.
- [ ] Lane 3. Repeat lane 2 with a different forged `x-vercel-forwarded-for` value on every request. Save `rate-forged.json`. Pass when request 121 still returns 429.
- [ ] Lane 4. Start `apps/api/src/server.ts` in development with `VERCEL=1` and the loopback `justgo_test` settings, not the fixture API, which refuses `VERCEL`. Save `vercel-env.json`. Pass when the development legal draft routes answer as they do without the variable.
- [ ] Lane 5. Request `/health` and `/ready` on the Node entry with `JUSTGO_SOURCE_SHA` set. Save `node-ready.json`. Pass when both return 200 with the release identity headers.
- [ ] Lane 6. Accept a challenge as a guest in the built-in browser pane. Save `guest.png`. Pass when the deck shows `Accept challenge` and the attempt saves.
- [ ] Lane 7. Download the complete data export in the pane. Save `export.png`. Pass when the export finishes and doctor counts return to the baseline after cleanup.
- [ ] Lane 8. Run `pnpm run test:journey e2e/provider-sign-in.spec.ts`. Save `provider-sign-in.txt`. Pass when the journey passes.
- [ ] Lane 9. Run `pnpm --filter @justgo/mobile run export:web`, then `pnpm run test:exported-web`. Save `exported-web.txt`. Pass when the smoke passes.
- [ ] Lane 10. Search `apps`, `scripts` and `.github`, outside `apps/api/tests/`, for `onVercel`, `x-vercel-forwarded-for`, `vercel.json`, `.vercelignore` and `vercel-cli`. Save `vercel-audit.txt`. Pass when nothing matches, or only the `VERCEL_|vercel-cli` assertion in `scripts/quality/staging-api-workflow.test.mjs`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from starting the Node fixture API to its first 200 from `/ready`, in ms.
- [ ] Probe. Start and stop the API five times at trunk and five times at head, alternating.
- [ ] Baseline. Record trunk first.
- [ ] Rule. Head fails if its median exceeds trunk's by more than 10 percent.

**Review gate.** None. P15-3 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] The owner merges through `pnpm run merge:pr`, per [Git and autonomy](../../AGENTS.md#git-and-autonomy).

## Land the parked recovery checks (P15-4)

**Depends on.** None.

**Files.**

- [ ] Create a branch from `main` and cherry-pick `b27ba34`, `0ccaaa4`, `a9f3a43` and `5966a16` from `codex/phase15-real-recovery`. Leave the parked branch unchanged.
- [ ] Edit the planned `docs/checks/phase-15-rollout-review.md`, which `a9f3a43` adds, to drop its Workers rows.
- [ ] `a9f3a43` also edits a Phase 15 file that no longer exists. Drop that hunk, and move any backup or recovery evidence in it to `docs/operations/CLOUDFLARE_BACKUPS.md`.
- [ ] Edit `docs/operations/CLOUDFLARE_BACKUPS.md` to record the backup clock activation, the clock token expiry and the renewed R2 credential dates.

**Build.**

- [ ] Keep the restore hooks and preserved object owners in `scripts/backups/rehearse.mjs` and `scripts/backups/restore-local.mjs`.
- [ ] Keep `scripts/backups/recovery-auth-acceptance.mjs` on the Node `buildRuntimeApp`.
- [ ] Make CI run `scripts/backups/recovery-auth-acceptance.test.mjs`.
- [ ] If P15-3 merged first, delete the `onVercel` argument from `scripts/backups/recovery-auth-acceptance.mjs`.

**You see.**

- [ ] `pnpm run test:backup:recovery` reports the restored-writing check before the deletion acceptance, and passes.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Run `node --test scripts/backups/recovery-auth-acceptance.test.mjs scripts/backups/backups.test.mjs`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes run the local recovery rehearsal against loopback databases only.

- [ ] Lane 1. Regression lane against trunk. Run `pnpm run test:backup:recovery` at trunk and at head. Save `rehearsal.txt`. Pass when both pass and head adds the restored-writing and owner checks.
- [ ] Lane 2. Restore a local dump and list object owners. Save `owners.txt`. Pass when every restored object keeps its original owner role.
- [ ] Lane 3. Run the Auth and API recovery acceptance against the restored loopback target. Save `auth-acceptance.json`. Pass when sign-in, read and deletion succeed through the Node app.
- [ ] Lane 4. Write a journal entry, back up, then restore. Save `restored-writing.json`. Pass when the restored database holds the entry before deletion acceptance starts.
- [ ] Lane 5. Delete an account after the snapshot, then restore and replay the deletion ledger. Save `ledger-replay.json`. Pass when the account stays deleted.
- [ ] Lane 6. Run the acceptance while the recovery fence is closed. Save `fence-closed.json`. Pass when the fence blocks the acceptance until it opens.
- [ ] Lane 7. Apply `scripts/backups/recovery-target-access.sql` and list the runtime role's grants. Save `grants.txt`. Pass when the role gains no grant beyond its normal set.
- [ ] Lane 8. Run the acceptance twice. Save `idempotent.json`. Pass when the second run converges with no new rows.
- [ ] Lane 9. Stop the acceptance midway, then run it again. Save `crash-retry.json`. Pass when the second run finishes and cleanup leaves no fixture rows.
- [ ] Lane 10. Run `verify doctor` before and after the lanes. Save `doctor.json`. Pass when the user and attempt counts match.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `pnpm run test:backup:recovery`.
- [ ] Probe. Run it three times at trunk and three times at head, alternating.
- [ ] Baseline. Record trunk first.
- [ ] Rule. Trunk lacks the new checks. Head fails if they add more than 5 minutes to the median on the Mac.

**Review gate.** None. P15-4 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] The owner merges through `pnpm run merge:pr`, per [Git and autonomy](../../AGENTS.md#git-and-autonomy).

## Remove the API Worker and its release lane (P15-5)

**Depends on.** P15-11, once the new TestFlight build reaches the function and Anthony has deleted the Worker. On the fast path this is cleanup after the switch.

**Files.**

- [ ] Delete `apps/api/src/worker.ts`, `apps/api/src/db/worker-database.ts`, `apps/api/src/http/worker-router.ts` and `apps/api/cloudflare-config.mjs`, with their tests.
- [ ] Delete `apps/api/scripts/workers-smoke.ts`, `workers-smoke-entry.ts`, `workers-smoke-preflight.ts`, `workers-outbound-smoke.ts` and `workers-cpu-profile.ts`, with their tests.
- [ ] Delete `scripts/release/staging-cloudflare.mjs`, `staging-worker-build.mjs`, `staging-bootstrap.mjs`, `staging-promotion.mjs` and `staging-abandoned-version.mjs`, with their tests.
- [ ] Keep `.github/workflows/staging-api.yml`, which P15-6 already turned into the Supabase lane.
- [ ] Edit `scripts/release/staging-api.mjs`, `scripts/release/staging-api-deployment.mjs`, `scripts/release/staging-api-runner.mjs`, `scripts/release/staging-public-probes.mjs`, `scripts/release/staging-local.mjs`, `apps/api/scripts/local-staging-release.ts`, `apps/api/tests/http/routing.test.ts` and every other caller that the deletions break.
- [ ] Edit `apps/api/package.json`, the root `package.json`, `.github/workflows/ci.yml`, `scripts/quality/ci-workflow.test.mjs`, `scripts/quality/staging-api-workflow.test.mjs` and delete `scripts/quality/cloudflare-config.test.mjs`.
- [ ] Edit `AGENTS.md` and `docs/operations/SERVER_RELEASES.md`.

**Build.**

- [ ] Delete the Workers fetch entry, the Hyperdrive adapter with `LOCK_DATABASE_URL` and `needsDirectTransaction`, and the per-invocation router.
- [ ] Delete every step that calls Cloudflare. Keep `apps/api/scripts/staging-release-guard.ts`, `validateProbe` and `scripts/release/staging-public-probes.mjs` with their tests.
- [ ] Move the `wrangler` devDependency to the root manifest, because `scripts/backups/clock/` still deploys with it.
- [ ] Leave `scripts/backups/clock/`, `sites/legal/wrangler.json` and `.github/workflows/staging-health.yml` unchanged. The backup clock still runs.
- [ ] Keep the `release:staging:local` script, which P15-6 moved to Supabase.
- [ ] Remove what is left of the Worker lane from `AGENTS.md` and `SERVER_RELEASES.md`.

**You see.**

- [ ] `rg -n 'worker\.js|worker-database|worker-router|cloudflare-config|staging-cloudflare|test:workers' apps scripts .github package.json` prints nothing.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Run `pnpm --filter @justgo/api run test`, `pnpm run test:architecture` and `node --test scripts/release/*.test.mjs scripts/backups/clock/worker.test.mjs`.
- [ ] Run the full `pnpm run check`, because a dependency moved.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes drive the Node fixture API, Expo web and the backup clock build.

- [ ] Lane 1. Regression lane against trunk. Run `verify drive welcome challenge progress account data` at trunk and at head. Save `drive-summary.json`. Pass when the same drives pass on both.
- [ ] Lane 2. Run `pnpm run test:journey e2e/local-sync.spec.ts`. Save `local-sync.txt`. Pass when the journey passes.
- [ ] Lane 3. Run `pnpm run test:journey e2e/account-deletion.spec.ts`. Save `account-deletion.txt`. Pass when the journey passes.
- [ ] Lane 4. Run `pnpm run test:journey e2e/identity-catalog.spec.ts`. Save `identity-catalog.txt`. Pass when the journey passes.
- [ ] Lane 5. Request `/ready` on the Node fixture API. Save `node-ready.json`. Pass when it returns 200.
- [ ] Lane 6. Run `pnpm exec wrangler deploy --dry-run --config scripts/backups/clock/wrangler.json`. Save `clock-dry-run.txt`. Pass when the clock still builds with the moved dependency and nothing deploys.
- [ ] Lane 7. Run `pnpm run test:backup:recovery`. Save `recovery.txt`. Pass when the rehearsal passes through the Node app.
- [ ] Lane 8. Run `pnpm run` to list the root scripts. Save `staging-lane.txt`. Pass when `release:staging:local` is present and no root script but the backup clock's names Cloudflare.
- [ ] Lane 9. Search the code for imports of every deleted module. Save `removed-imports.txt`. Pass when nothing imports a deleted module.
- [ ] Lane 10. Read `AGENTS.md` and `SERVER_RELEASES.md` at head. Save `docs-audit.txt`. Pass when neither tells an agent to deploy a Worker.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of the CI `checks` job.
- [ ] Probe. Read the job durations of the latest trunk run and the head run with `gh run view`.
- [ ] Baseline. Record trunk first.
- [ ] Rule. Head fails if its `checks` job takes more than 10 percent longer than trunk's.

**Review gate.** None. P15-5 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] The owner merges through `pnpm run merge:pr`, per [Git and autonomy](../../AGENTS.md#git-and-autonomy).

## Add the Edge Functions entry and its CI smoke (P15-6)

**Depends on.** P15-7 merged, which it is. On the fast path it no longer waits for P15-2 or P15-5.

**Fast path.** This PR also carries P15-8's files, build steps and unit checks, so one verifier reviews the entry and the lane together. P15-8's lanes that deploy, and its perf probe, run in the hosted window after merge. A failure there gets a fix PR before P15-11.

**Files.**

- [ ] Create `apps/api/src/edge.ts` and `apps/api/tests/http/edge.test.ts`.
- [ ] Create `supabase/config.toml`, `supabase/functions/api/index.ts` and `supabase/functions/api/deno.json`.
- [ ] Create `apps/api/scripts/edge-build.mjs` and `apps/api/scripts/edge-smoke.ts`.
- [ ] Edit `apps/api/package.json`, the root `package.json`, `.github/workflows/ci.yml` and `scripts/quality/ci-workflow.test.mjs`.
- [ ] Edit `apps/api/src/db/client.ts`, `apps/api/src/identity/managed-verifier.ts`, `apps/api/src/progress/service.ts` and `apps/api/src/http/server-error-reporter.ts` only where P15-1 recorded a failure.
- [ ] Add the Edge smoke beside `test:workers` in each `AGENTS.md` rule that names it, such as the `outboundFetch()` row. P15-5 removes the Worker names.

**Build.**

- [ ] `edge.ts` exports `createEdgeHandler` with injected configuration, database and app, the shape of the deleted `createWorker` in `git show ce611dd:apps/api/src/worker.ts`.
- [ ] The handler strips the `/api` function prefix once, then calls `app.fetch`.
- [ ] The handler maps `JUSTGO_AUTH_PUBLISHABLE_KEY` and `JUSTGO_AUTH_SECRET_KEY` into the existing config fields. It never reads `SUPABASE_DB_URL`.
- [ ] The handler builds the app and a one-connection pool once per worker, and passes `clientAddress` from the header the `phase15/edge-trial` branch reads. P15-2 lane 4 confirms it in the hosted window.
- [ ] A startup failure returns the same safe body and `x-justgo-startup-stage` header as `worker.ts:102-126` at `ce611dd`.
- [ ] Server error reports flush through `EdgeRuntime.waitUntil`.
- [ ] The Edge smoke drives managed sign-in and account deletion, and runs `checkWorkerOutboundAdapters()` from `apps/api/scripts/workers-outbound-smoke.ts`, so it proves that `outboundFetch()` is refused inside an `IdentityService` transaction and sends after it on Deno. If P15-2 falls back to `drizzle-orm/postgres-js`, retype `ownerTransactions()` for that database.
- [ ] `supabase/config.toml` sets `verify_jwt = false` for `api`.
- [ ] `edge-build.mjs` bundles `edge.ts` with esbuild, writes the bundle's SHA-256, and fails above 5 MB. Port the input and output checks of `validateWorkerBundle` (`scripts/release/staging-worker-build.mjs:15-74` at `ce611dd`), which reject untracked, ignored, non-production and secret-like inputs and unexpected output files.
- [ ] `pnpm run test:edge` runs the smoke route sequence against the bundle in the pinned Edge runtime image and `justgo_test`. CI runs it where the Workers step was.

**You see.**

- [ ] The CI log of `pnpm run test:edge` lists each route with its status and ends with `edge smoke passed`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/api/tests/http/edge.test.ts` covers the prefix strip, the secret mapping, the client address, a forged `x-forwarded-for` and the safe startup failure. Run `pnpm --filter @justgo/api run test tests/http/edge.test.ts`.
- [ ] Run `pnpm --filter @justgo/api run typecheck`, `pnpm run lint`, `pnpm run test:architecture` and `pnpm run test:db`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes run the bundle in the pinned Edge runtime image against `justgo_test`.

- [ ] Lane 1. Regression lane against trunk. Trunk lacks the Edge entry, so run the smoke route sequence on the trunk Node entry and on the head Edge entry. Save `route-parity.json`. Pass when statuses and bodies match apart from request IDs.
- [ ] Lane 2. Start the Edge entry with a `DATABASE_URL` for a role other than `justgo_runtime`. Save `wrong-role.json`. Pass when `/ready` returns 503 and the body names no role or URL.
- [ ] Lane 3. Start the Edge entry without `JUSTGO_AUTH_SECRET_KEY`. Save `startup-failure.json`. Pass when the response carries `x-justgo-startup-stage: configuration` and no secret name or value.
- [ ] Lane 4. Send 20 interleaved attempt writes from two fixture users. Save `owner-isolation.json`. Pass when SQL readback shows no cross-owner row.
- [ ] Lane 5. Read the second user's attempt with the first user's bearer. Save `cross-account.json`. Pass when the status matches the Node entry's.
- [ ] Lane 6. Write an attempt, then send the exact retry. Save `idempotent-retry.json`. Pass when the retry returns the first result and SQL readback shows one row.
- [ ] Lane 7. Post the worst-case journal sync batch. Save `worst-sync.json`. Pass when it meets the perf rule.
- [ ] Lane 8. Delete all data, drop the response, then retry. Save `delete-retry.json`. Pass when the retry returns the same receipt and the data epoch advances once.
- [ ] Lane 9. Send managed sign-in requests from two addresses in the recorded header. Save `rate-buckets.json`. Pass when each address gets its own bucket and a forged `x-forwarded-for` changes neither.
- [ ] Lane 10. Trigger a server error with diagnostics on and a stub Sentry endpoint. Save `sentry-envelope.json`. Pass when the envelope arrives with no body, token or reflection text.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. CPU ms and wall ms per request for `/health`, the guest catalog, an attempt write and the worst-case sync, plus the bundle size in bytes.
- [ ] Probe. Run the P15-1 request script against the trunk Node entry and the head Edge entry, alternating, for 20 rounds.
- [ ] Baseline. Record the trunk Node numbers first.
- [ ] Rule. Head fails if the worst-case sync exceeds 1,000 ms of CPU or 5,000 ms of wall time, if a small route's p95 worker thread CPU exceeds 50 ms, or if the bundle exceeds 5 MB. The fixed 50 ms limit replaces the twice-trunk rule. It is a fortieth of the 2,000 ms runtime limit, and P15-1's worst small route measured 7.85 ms.

**Review gate.** None. P15-6 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] The owner merges through `pnpm run merge:pr`, per [Git and autonomy](../../AGENTS.md#git-and-autonomy).

## Support a base path in the mobile API client (P15-7)

**Depends on.** P15-1 with `Decision: go`.

**Files.**

- [ ] Edit `apps/mobile/src/lib/network/http.ts` and `apps/mobile/src/lib/network/http-protocol.test.ts`.
- [ ] Edit `scripts/development/configuration.mjs` and `scripts/development/metro-configuration.test.mjs`.
- [ ] Edit `apps/api/scripts/challenge-dev.ts` so the fixture API can serve under an optional path prefix for drives.

**Build.**

- [ ] `apiOrigin` keeps its origin checks. A new helper returns the origin plus a normalized path prefix with no trailing slash.
- [ ] `request` builds the target from that prefix. It fences on the origin and on `<prefix>/v1/`, and it still rejects `#`, `..` segments and every other origin.
- [ ] The access store stays keyed by origin, so `apps/mobile/src/app-support/access/` does not change.
- [ ] `configuration.mjs` adds a `--supabase` Dev target that points at `https://kmcpcauaxlgpevkkenwd.supabase.co/functions/v1/api`.

**You see.**

- [ ] With the prefixed fixture API, the browser's network log shows sync requests to `/functions/v1/api/v1/journal-sync`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `http-protocol.test.ts` covers an empty prefix, `/functions/v1/api`, a trailing slash, `..` traversal, another origin, a query string that contains `/v1/`, and cancellation. Run `pnpm --filter @justgo/mobile run test --runTestsByPath src/lib/network/http-protocol.test.ts`.
- [ ] Run `pnpm --filter @justgo/mobile run typecheck` and `pnpm run lint`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes drive Expo web in the built-in browser pane against the fixture API at the root and under the prefix.

- [ ] Lane 1. Regression lane against trunk. Run `verify drive welcome challenge progress account data` at trunk and at head with no prefix. Save `drive-root.json`. Pass when the same drives pass on both.
- [ ] Lane 2. Run the same drives at head against the prefixed fixture API. Save `drive-prefix.json`. Pass when they pass and every API request path starts with `/functions/v1/api/v1/`.
- [ ] Lane 3. Accept a challenge as a guest with the prefix. Save `guest-prefix.png`. Pass when the attempt saves.
- [ ] Lane 4. Open the progress calendar with the prefix. Save `progress-prefix.png`. Pass when the month loads and its request keeps its query string.
- [ ] Lane 5. Point the base URL at a prefixed port with nothing listening. Save `offline.png`. Pass when the app keeps the local journal and shows its usual retry feedback.
- [ ] Lane 6. Write offline, then reconnect to the prefixed fixture API. Save `queued-sync.png`. Pass when the queued write syncs.
- [ ] Lane 7. Download the complete data export with the prefix. Save `export-prefix.png`. Pass when the export finishes.
- [ ] Lane 8. Delete all data with the prefix. Save `delete-prefix.png`. Pass when local and server data clear and doctor counts return to the baseline.
- [ ] Lane 9. Set the base URL with a trailing slash. Save `trailing-slash.json`. Pass when no request path contains `//`.
- [ ] Lane 10. Run `pnpm --filter @justgo/mobile run export:web`, then `pnpm run test:exported-web`. Save `exported-web.txt`. Pass when the smoke passes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of the `account data` drive.
- [ ] Probe. Run it three times at trunk and three times at head, alternating.
- [ ] Baseline. Record trunk first.
- [ ] Rule. Head fails if its median exceeds trunk's by more than 10 percent.

**Review gate.** None. P15-7 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] The owner merges through `pnpm run merge:pr`, per [Git and autonomy](../../AGENTS.md#git-and-autonomy).

## Release staging through Supabase Edge Functions (P15-8)

**Depends on.** Nothing on the fast path. Its work lands in the P15-6 PR, and its lanes that deploy run in the hosted window.

**Files.**

- [ ] Create `scripts/release/staging-supabase.mjs` and `scripts/release/staging-supabase.test.mjs`.
- [ ] Edit `scripts/release/staging-api.mjs`, `scripts/release/staging-local.mjs` and `apps/api/scripts/local-staging-release.ts`.
- [ ] Create `.github/workflows/staging-api.yml` and edit `scripts/quality/staging-api-workflow.test.mjs`.
- [ ] Pin Supabase CLI 3 in `.github/workflows/staging-api.yml` through the SHA-pinned `supabase/setup-cli` action, not as a devDependency, so nothing new installs on the Mac.
- [ ] Rewrite `docs/operations/SERVER_RELEASES.md` for the Supabase lane, and edit `AGENTS.md` where it names the staging lane.

**Build.**

- [ ] Before a deploy, the lane reads the serving source SHA from `/health` and records it as `previousApiSha`.
- [ ] The lane builds the bundle and records its SHA-256.
- [ ] The lane deploys the bundle as `api-candidate` with `--remote <ref> --yes` and runs `validateProbe` against it.
- [ ] Only after the candidate passes does the lane deploy the same bundle as `api` and read back `/health`, the source SHA and the function `version`.
- [ ] The lane keeps the database guard in `apps/api/scripts/staging-release-guard.ts` and holds its lock through the serving deploy.
- [ ] The lane runs in GitHub Actions. `release:staging:local` dispatches the staging workflow with `gh workflow run` and waits for its receipt, so the Mac runs no deploy.
- [ ] `supabase secrets set` runs only as a named lane step with its own receipt.
- [ ] The recreated workflow test keeps its `VERCEL_|vercel-cli` assertion.
- [ ] Rollback is the same lane run on the previous tag. The runbook says so and keeps the rule against rolling back across a schema change.

**You see.**

- [ ] A local dry run prints each step and ends with `dry run, no deploy`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `staging-supabase.test.mjs` covers an unchanged serving SHA, a failed candidate probe, a lost deploy response, a secret change without a deploy, and a rollback to the previous tag. Run `node --test scripts/release/staging-supabase.test.mjs`.
- [ ] Run `node --test scripts/quality/ci-workflow.test.mjs scripts/quality/staging-api-workflow.test.mjs` and `pnpm run test:architecture`, because the workflow changed.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. Lanes 1 to 3 are local dry runs. Lanes 4 to 10 deploy to the JustGo project and run only after Anthony's go.

- [ ] Lane 1. Regression lane against trunk. Trunk has no staging deploy lane after P15-5, so record that and run the head lane as a dry run. Save `dry-run.txt`. Pass when every step prints and nothing contacts Supabase.
- [ ] Lane 2. Run the dry run from a dirty worktree. Save `dirty.txt`. Pass when the lane refuses before it builds.
- [ ] Lane 3. Run the dry run on an untagged commit. Save `untagged.txt`. Pass when the lane refuses.
- [ ] Lane 4. Deploy a tagged `main` to `api-candidate`. Save `candidate.json`. Pass when the candidate probe passes and `api` is untouched.
- [ ] Lane 5. Let the lane deploy the same bundle to `api`. Save `serving.json`. Pass when `/health` names the tagged SHA and the function version matches the receipt.
- [ ] Lane 6. Probe `/health` every second during lane 5. Save `swap-probe.json`. Pass when no probe fails.
- [ ] Lane 7. Run the lane with a wrong expected source SHA. Save `wrong-sha.json`. Pass when the lane stops before the serving deploy.
- [ ] Lane 8. Roll back with the lane on the previous tag. Save `rollback.json`. Pass when `/health` names the previous SHA.
- [ ] Lane 9. Stop the CLI after the upload, then rerun the lane. Save `lost-response.json`. Pass when the rerun reads back the serving state before it deploys again.
- [ ] Lane 10. Read the release receipts from lanes 4 to 9. Save `receipts.json`. Pass when no receipt holds a secret value or a connection string.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Lane time from start to serving readback, and the count of failed probes during the swap.
- [ ] Probe. Run the lane on two consecutive tags after Anthony's go.
- [ ] Baseline. Trunk has no lane. Record that.
- [ ] Rule. Head fails if a run takes more than 15 minutes or any swap probe fails.

**Review gate.** None. P15-8 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] The owner merges through `pnpm run merge:pr`, per [Git and autonomy](../../AGENTS.md#git-and-autonomy).

## Record hosted staging acceptance (P15-9)

**Depends on.** P15-6 merged, with P15-8's lane, and Anthony's one go for the hosted window, which P15-9 shares with P15-2.

**Fast path.** Run lanes 1, 2, 4 and 9 and the perf rule in the hosted window. Lane 3 runs there only when P15-2 predicts a worst-case sync above 4,000 ms. Lanes 5 to 8 run before the first outside tester joins, except where P15-11 lanes 4 to 6 cover them. Lane 10 passed on November 13, 2026, after backups resumed. P15-2's docs PR records these receipts too.

**Files.**

- [x] Record the acceptance receipts in [Appendix A](#appendix-a-prototype-evidence).

**Build.**

- [x] Release `main` to the `api` function through the P15-8 lane.
- [x] Anthony runs the Dev build with `--supabase` on the iPhone for the phone lanes.
- [ ] Retarget gate issues #79, #81, #84 and #99 to the function. Narrow #103 and #118. File one `gate` issue for each hosted check that cannot run yet. The new gates are filed as #449 to #455. The retargeting and narrowing are still to do.

**You see.**

- [x] Appendix A lists each lane's receipt, the serving source SHA and the function version.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] Run `node --test scripts/quality/doc-links.test.mjs` and check formatting of the changed files.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. Lanes 1, 2, 9 and 10 run from the Mac. Lanes 3 to 8 run on the iPhone with genuine disposable accounts, and Anthony drives them.

- [x] Lane 1. Regression lane against trunk. Run the public probes against the serving Worker and the function. Save `public-probes.json`. Pass when both pass and the function names main's SHA.
- [ ] Lane 2. Request `/health`, `/ready`, the guest catalog and `/openapi.json` on the function. Save `public-routes.json`. Pass when all return 200, and `/health` and `/ready` carry release identity headers. `apps/api/src/http/app.ts` sets those headers only on `/health` and `/ready`.
- [ ] Lane 3. Import the prepared worst-case archive on the iPhone. Save `worst-import.png`. Pass when every sync batch finishes with no timeout and meets the perf rule. Ran on November 12, 2026. Wall time passed, CPU is Inconclusive (#455), and no screenshot was saved.
- [ ] Lane 4. Sign in with Apple as a guest with writing, sign out, then return to the same account. Save `apple-signin.png`. Pass when the account shows only its own writing. Passed on November 12, 2026, on Anthony's report, with no screenshot.
- [ ] Lane 5. Sign in with Google, then switch accounts. Save `google-switch.png`. Pass when the second account never shows the first account's writing. Passed on November 12, 2026, on Anthony's report, with no screenshot.
- [ ] Lane 6. Save writing on the iPhone and load it in Expo web against the function. Save `two-device.png`. Pass when both show the same entries.
- [ ] Lane 7. Write offline on the iPhone, then reconnect. Save `offline-reconnect.png`. Pass when the queued writes sync.
- [ ] Lane 8. Delete the account, then retry the receipt after Auth erasure. Save `delete-account.png`. Pass when the retry returns the same receipt and iCloud cleanup leaves nothing.
- [x] Lane 9. Read the function logs for the lane 3 to 8 window. Save `logs-review.json`. Pass when no token, body or reflection text appears.
- [x] Lane 10. Read the next nightly backup and hourly ledger runs. Save `backup-runs.json`. Pass when both succeed after the release. Passed on November 13, 2026, after backups resumed. The database copy was a manual dispatch of the nightly workflow, and the clock dispatched ledger run [43472290285](https://github.com/anthonyyoo24/justgo/actions/runs/43472290285).

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall ms per sync batch, CPU ms where the dashboard reports it, the cold first request after idle, and invocations per day.
- [x] Probe. Read execution times from the function logs for lanes 3 to 8, and time the first request after 15 minutes idle.
- [ ] Baseline. Trunk lacks the function. Record that.
- [ ] Rule. Acceptance fails if any sync batch exceeds 8,000 ms of wall time or 1,000 ms of CPU, or the first request after idle exceeds 2,000 ms.

**Review gate.** None. P15-9 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries` or `docs-tests-only`.
- [ ] The owner squash-merges its own docs PR on green CI.

## Update the notices for Supabase Edge Functions (P15-10)

**Depends on.** P15-9 merged. It must merge before the first outside tester joins, and it does not block P15-11 or P15-5.

**Files.**

- [ ] Edit `docs/legal/PRIVACY_POLICY_DRAFT.md`, `docs/legal/DATA_INVENTORY.md` and `docs/legal/RELEASE_DISCLOSURES.md`.
- [ ] Create `docs/legal/SUPABASE_NOTICE_REVIEW.md` (planned) from the provider-neutral parts of `docs/legal/CLOUDFLARE_NOTICE_REVIEW.md`, which P15-11 deleted. Git history keeps it at `e2ab966`.
- [ ] Edit `docs/legal/APPROVALS.md` only after Anthony approves the text.

**Build.**

- [ ] Name Supabase as the API host, with the function region and the log retention that P15-2 and P15-9 recorded.
- [ ] Keep Cloudflare R2 for encrypted backups, and keep Vercel for the legal pages until Anthony moves them.
- [ ] Restate the provider review in issue #95 for journal traffic through Edge Functions.

**You see.**

- [ ] `pnpm run build:legal` builds the candidate pages with the new wording.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Run `node --test sites/legal/build.test.mjs scripts/quality/doc-links.test.mjs`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes read the locally built legal pages in the built-in browser pane.

- [ ] Lane 1. Regression lane against trunk. Build the legal pages at trunk and at head. Save `legal-diff.txt`. Pass when only the provider sections and date metadata differ.
- [ ] Lane 2. Open the Privacy page at 390x844. Save `privacy-mobile.png`. Pass when the Supabase section reads fully with no horizontal scroll.
- [ ] Lane 3. Open the Privacy page at 200 percent text zoom. Save `privacy-zoom.png`. Pass when no text is clipped.
- [ ] Lane 4. Move through the Privacy page with the keyboard. Save `privacy-keyboard.png`. Pass when every link is reachable and focus is visible.
- [ ] Lane 5. Open the Terms page. Save `terms.png`. Pass when it is unchanged apart from date metadata.
- [ ] Lane 6. Run `pnpm run build:legal --production` without approval metadata. Save `production-refusal.txt`. Pass when the build refuses.
- [ ] Lane 7. Open the legal links from Expo web. Save `in-app-legal.png`. Pass when each link opens the built page.
- [ ] Lane 8. Search the built pages for Workers and Hyperdrive. Save `stale-terms.txt`. Pass when neither word appears.
- [ ] Lane 9. Search the built pages for R2. Save `r2-wording.txt`. Pass when the approved R2 backup wording remains.
- [ ] Lane 10. Compare the processors in the policy with `docs/legal/DATA_INVENTORY.md`. Save `inventory.txt`. Pass when every processor appears in both.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `pnpm run build:legal`.
- [ ] Probe. Run it three times at trunk and three times at head, alternating.
- [ ] Baseline. Record trunk first.
- [ ] Rule. Head fails if its median exceeds trunk's by more than 20 percent.

**Review gate.** The operator reviews before merge.

- [ ] Copy the lane 2 and lane 7 screenshots into `.local/swarm/P15-10/review/`.
- [ ] Record a 30 to 60 second video of the built pages in the pane. Save it as `.local/swarm/P15-10/review/P15-10-review.mp4`.
- [ ] Post the screenshots and the video in chat. Stop at merge-ready. Wait for the operator, Anthony, to approve the text and its publication.

**Merge.**

- [ ] Clean verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries` or `docs-tests-only`.
- [ ] The owner merges after Anthony approves the text. Publication waits for his separate go.

## Switch builds to the function and retire the old hosts (P15-11)

**Depends on.** The hosted window passed and its docs PR merged, and Anthony's go for each provider action. On the fast path it no longer waits for P15-10.

**Files.**

- [x] Edit `apps/mobile/eas.json`, `scripts/release/check-beta.mjs`, `scripts/release/check-beta.test.mjs`, `.github/workflows/testflight-beta.yml` and `scripts/quality/testflight-workflow.test.mjs`.
- [x] Edit `.github/workflows/staging-health.yml` and `scripts/quality/staging-health-workflow.test.mjs`.
- [x] Edit `scripts/development/configuration.mjs` to make `--supabase` the Dev default and delete the Vercel and Cloudflare targets.
- [x] Edit `docs/operations/TESTFLIGHT_BETA.md` and `docs/operations/DEVELOPMENT_BUILDS.md`.
- [x] Before deleting, move the facts that outlive Phase 15 into the docs that keep them. The November 1 Cloudflare account and DPA acceptance, from the notice review's accepted account and service assessment, goes to the "Provider agreements" section of `docs/legal/DATA_INVENTORY.md`, and `CLOUDFLARE_BACKUPS.md` links to it there.
- [x] Delete `docs/operations/CLOUDFLARE_CUTOVER.md`, `docs/implementation-plan/phase-15-cloudflare-api.md` and `docs/legal/CLOUDFLARE_NOTICE_REVIEW.md`. Git history keeps them.
- [x] Update the links to them in `docs/implementation-plan/README.md`, `docs/operations/SERVER_RELEASES.md`, `docs/operations/CLOUDFLARE_BACKUPS.md`, `docs/operations/TESTFLIGHT_BETA.md`, `docs/legal/APPROVALS.md`, `docs/legal/DATA_INVENTORY.md`, `docs/legal/RELEASE_DISCLOSURES.md` and `sites/legal/README.md`.

**Build.**

- [x] Point the Dev and beta profiles at `https://kmcpcauaxlgpevkkenwd.supabase.co/functions/v1/api`.
- [x] Let `check-beta.mjs` accept that base path in place of its `pathname === '/'` rule.
- [x] Point `staging-health.yml` at the function's `/ready`. Anthony points the Sentry uptime monitor there too.
- [x] Anthony ships a TestFlight build from the beta profile and retires build 5. Installed builds reach the function only through this separately approved build. A redirect from Vercel would not prove that private request payloads stopped reaching Vercel.
- [x] After the new build passes, Anthony deletes the `justgo-api-staging` Worker and its Hyperdrive configuration, and turns off the Vercel API project. The Vercel project `justgo` is paused, not deleted, so it can be resumed.
- [x] Keep the backup clock Worker, R2 and the Cloudflare account.

**You see.**

- [x] The installed TestFlight build's requests reach `/functions/v1/api/v1/`, and the Worker URL returns no JustGO response. Build 7 embeds only the function URL (lane 2), and the Worker returns Cloudflare's 1042 error (lane 8).

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [x] `check-beta.test.mjs` accepts the function URL and rejects the Worker URL, another project and any other path. Run `node --test scripts/release/check-beta.test.mjs`.
- [x] Run `pnpm run test:architecture` and the full `pnpm run check`, because the Expo configuration changed.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. Lanes 1 to 3 run locally. Lanes 4 to 10 run on the iPhone or against hosted services after Anthony's go.

- [x] Lane 1. Regression lane against trunk. Run `node scripts/release/check-beta.mjs` on the trunk and head configurations. Save `check-beta.txt`. Pass when trunk accepts the Worker URL and head accepts only the function URL.
- [x] Lane 2. Run `pnpm --filter @justgo/mobile run export:ios` and search the bundle for API URLs. Save `bundle-url.txt`. Pass when only the function URL appears.
- [x] Lane 3. Run the `staging-health.yml` check logic locally against the function. Save `health-check.json`. Pass when it reports ready.
- [ ] Lane 4. Sign in with Apple on the new TestFlight build. Save `tf-apple.png`. Pass when the journal loads. Passed on November 13, 2026, on Anthony's report, with no screenshot by his choice.
- [ ] Lane 5. Save writing on the new build and load it on a second device. Save `tf-sync.png`. Pass when both show the entry. Anthony skipped it on November 13, 2026. Gate #451 stays open.
- [ ] Lane 6. Delete the account on the new build. Save `tf-delete.png`. Pass when the deletion receipt completes. Passed on November 13, 2026, on Anthony's report, with no screenshot by his choice.
- [x] Lane 7. Open the Sentry uptime monitor. Save `uptime.png`. Pass when it targets the function and its latest check passed.
- [x] Lane 8. After the Worker deletion, request the Worker's `/ready`. Save `worker-gone.txt`. Pass when no JustGO response returns.
- [x] Lane 9. After the Vercel API retirement, request `https://justgo-two.vercel.app/ready` and the legal pages. Save `vercel-gone.txt`. Pass when no JustGO API response returns and the legal pages still load.
- [ ] Lane 10. Read the next nightly backup and hourly ledger runs. Save `backups-after.json`. Pass when both succeed from the backup clock. Backups resumed on November 13, 2026, and clock ledger run [43472290285](https://github.com/anthonyyoo24/justgo/actions/runs/43472290285) passed. The first clock-dispatched nightly database run is due at 04:43 UTC on November 14, and gate #476 tracks it.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time on the iPhone from app launch to the first successful journal sync.
- [ ] Probe. Launch build 5 and the new build five times each, alternating, before build 5 retires.
- [ ] Baseline. Record build 5 first.
- [ ] Rule. The new build fails if its median exceeds build 5's by more than 1,000 ms. Passed on Anthony's report that launch to first sync on build 7 was fine. No timings were recorded, and build 5 has expired, so the probe and baseline cannot run.

**Review gate.** None. P15-11 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] The owner merges through `pnpm run merge:pr`, per [Git and autonomy](../../AGENTS.md#git-and-autonomy).

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] The `AGENTS.md` rules list, `SERVER_RELEASES.md`, the root `README.md` and the implementation plan index describe the implemented state.
- [ ] Every gate issue that names Workers, Hyperdrive or the Vercel API is closed with its evidence or retargeted.
- [ ] Reply to Anthony with the report that `playbooks/autopilot-full.md` names.

## Appendix A. Prototype evidence

No prototype ran while this plan was written. The Mac has no Deno, Supabase CLI or container runtime (measured with `command -v`), and the brief put the trial first in the plan. P15-1 and P15-2 are the prototypes. Their docs PRs fill this appendix with the trial branch, its SHA and the reports.

The trials settle these questions, which the documentation leaves open.

1. Does `npm:pg` verify the Supabase CA through the transaction pooler as `justgo_runtime.<project-ref>`?
2. Does the pooler accept, ignore or reject the `statement_timeout` connection setting?
3. Does bundled code see a `Buffer` global?
4. Does the gateway pass a request with no `apikey` when `verify_jwt` is off?
5. Which client-address header can the client not forge?
6. Do the Invocations view or edge logs keep bearer tokens, header values or bodies?
7. What CPU and wall time does the worst-case journal sync take?
8. How much does pinning the region to `ca-central-1` change latency?
9. What body size does the gateway pass?
10. What is the bundle size and the cold start time?

Reading settled the rest. The [analysis on #171](https://github.com/anthonyyoo24/justgo/pull/171#issuecomment-6695056934) cites each answer at `ce611dd`.

- No production API exists. The `production` profile sets no API URL. Vercel's slot at `justgo-two.vercel.app` serves staging on Fastify `311f073` to TestFlight build 5 and the Dev profile. The Worker serves staging on Hono `a082087`, which is not on main, to the beta profile. Main's API has no recorded release.
- Managed requests take no advisory locks. Only legacy bootstrap and transfers call `pg_advisory_xact_lock`, and managed mode rejects them. The managed path holds a `FOR UPDATE` owner lock and a transaction-local owner setting.
- The transaction pooler should be safe. Every `set_config` is transaction-local, no query in `apps/api/src` names a prepared statement, and the `justgo_runtime` role already sets a 5 second `statement_timeout`.
- `SUPABASE_DB_URL` is the platform's own connection, not `justgo_runtime`. The function needs its own `DATABASE_URL` with the pooler user `justgo_runtime.<project-ref>`, because readiness fails on any other role.
- `config.ts` reads three `SUPABASE_` names, a prefix custom secrets cannot use. `SUPABASE_URL` is injected. The entry maps the other two from permitted names.
- `verify_jwt` is on by default and would reject `/health`, `/ready`, guest routes and preflights, because JustGO's bearer is not a Supabase JWT.
- Under `Deno.serve`, `http/app.ts` falls back to `127.0.0.1` for every caller, so the entry must pass a `clientAddress`.
- The backups run on GitHub Actions and write to R2. They use neither the API Worker nor Hyperdrive. The backup clock Worker is separate and stays.
- Keep the hand-rolled Sentry sender. Supabase's example warns that `@sentry/deno` shares scope across concurrent requests.
- The Worker dashboards showed CPU from p50 15.14 ms to p999 58.49 ms, aggregates that include public checks, and Hyperdrive measured an 18.48 ms mean query. At that latency the worst-case sync, inferred at about 2,800 sequential queries, would take about 50 seconds. Nobody has measured sync on any host.
- Twelve open `gate` issues name Cloudflare, Workers, Hyperdrive, Vercel or R2. They are #77, #79, #81, #84, #99, #102, #103, #104, #105, #118, #123 and #124. #79, #81, #84 and #99 hold Worker evidence and need retargeting.

### P15-1 local runtime trial

P15-1 ran on November 7, 2026, from the throwaway branch `phase15/edge-trial` at `d0c2f229ba57dc6f3c2c06baa2289bcef79a386f`. The [final workflow run](https://github.com/anthonyyoo24/justgo/actions/runs/42379458521), attempt 2, served the bundle on `supabase/edge-runtime:v1.78.0@sha256:0d21a556a2bf1c090d4558f3fcf2897b93de46036f0e8a973444c614ecca2d91`. The Supabase CLI pins that image for local serving, and it reports Deno 2.1.4 compatibility with V8 11.6. The run used a loopback Postgres 17 `justgo_test` on the runner, local Auth and Sentry stubs, no repository secrets and no hosted project. Its artifact holds the report, one receipt per lane, 160 CPU profiles and the raw samples. The coordinating worktree keeps a copy, with the report at `.local/edge-trial/report.md`.

The same run passed `npm run test -w @justgo/api` with 498 tests in 39 files. `apps/api/src` and `packages/contracts` on the trial branch match `main` apart from the new `apps/api/src/edge.ts`, so the trunk Node entry and the trial's Node entry run the same code.

The report ends with `Decision: stop`. Every lane passed and the worst-case sync met its bound. The health route failed the rule that a small route's p95 CPU stays within twice trunk's, because 6 of 20 Edge health requests took 5 to 8 ms of worker thread CPU. The timed pass took no profiles, so a garbage-collection pause is the inferred cause. Each of the six coincided with 14.5 to 20.4 ms of CPU on V8's garbage-collection helper threads. Of the other 14, one coincided with 9.0 ms on those threads and the rest with at most 0.38 ms. Trunk had one request like the six, with 21.1 ms on its helper threads.

#### Lanes

The trial ran every lane on three builds of the bundle.

| Build                                                                                                             | Result                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pg` bundled, with a banner that imports `Buffer`, `process`, the timers and `createRequire` from `node:` modules | All ten lanes pass.                                                                                             |
| `pg` external as `npm:pg@8.23.1` through `deno.json`, with a `createRequire` banner only                          | Lanes 2, 3 and 7 pass. Every managed request returns 401 `UNAUTHORIZED`, so lanes 1, 4, 5, 6, 8, 9 and 10 fail. |
| `pg` external as `npm:pg@8.23.1`, with a banner that also imports `Buffer` from `node:buffer`                     | All ten lanes pass.                                                                                             |

The report and the decision use the bundled build. Its lanes showed the following.

- Lane 1. The trunk Node entry and the head Edge entry return the same status and body on all 14 steps of the route sequence. The comparison ignores request IDs, `checkedAt` times and the user ID that the server allocates. SQL readback shows one attempt and one journal version on both entries.
- Lane 2. `/ready` returns 200. It returns 503 after the runtime role loses `EXECUTE` on the live-session helper, and 200 again after the grant returns.
- Lane 3. The guest catalog returns all 61 seeded cards in the seeded order.
- Lane 4. All 20 interleaved writes return 201. Each user reads back only their own 10 attempts, and SQL shows no cross-owner row.
- Lane 5. The first user's three requests that target the second user's attempt return 200, 200 and 410 on both entries. They leak no ID and change no row.
- Lane 6. The failpoint after the attempt insert returns the typed 503 `UNAVAILABLE` body. SQL shows no row, `/ready` stays 200, and the same write then returns 201.
- Lane 7. Both concurrent transfers wait on `pg_advisory_xact_lock`. One returns 200 and the other returns 409, as on the Node entry, and one row exists.
- Lane 8. The managed token payload decodes to the expected session ID, and the progress cursor encodes and decodes with no `ReferenceError`.
- Lane 9. The 4,154,082-byte batch of 50 versions with 50 parents each returns 200 with 50 saved, after 985 ms of wall time and 2,812 queries. It ran under the CLI's 2,000 ms CPU limit. The lanes container used the `per_request` policy, not the `per_worker` policy in the trial's `supabase/config.toml`.
- Lane 10. The Sentry stub receives one envelope for the 503. It holds no bearer token, token payload, reflection text, attempt ID or user ID.

An extra probe connected with `DATABASE_SSL=verify-full` to a Postgres that serves a certificate from a throwaway CA. Readiness, a managed session and a write transaction passed on both builds that pass the lanes. `pg` did not fail over TLS or inside a transaction, so the trial did not try `drizzle-orm/postgres-js`.

#### Perf

The probe alternated 20 rounds between the trunk Node entry and the head Edge entry, after 5 untimed warm-up rounds on each. Round 1 started with trunk Node. CPU is the on-CPU time of the thread that runs the app's JavaScript, read from `/proc/<pid>/task/<tid>/schedstat` around each unprofiled request. On Node that is the main thread. On Edge it is the user worker thread, whose CPU clock the runtime's own limit reads. The client timed the wall time of the same requests.

| Route           | Trunk CPU p95 ms | Edge CPU p95 ms | CPU bound ms | Trunk wall p95 ms | Edge wall p95 ms | Result |
| --------------- | ---------------- | --------------- | ------------ | ----------------- | ---------------- | ------ |
| `/health`       | 0.96             | 7.85            | 1.93         | 3.8               | 9.7              | Fails  |
| Guest catalog   | 1.46             | 2.80            | 2.93         | 3.6               | 9.2              | Passes |
| Attempt write   | 4.59             | 6.04            | 9.17         | 11.9              | 15.6             | Passes |
| Worst-case sync | 316              | 523             | 1,000        | 704               | 918              | Passes |

- The sync's wall bound is 5,000 ms. The sync sends 2,812 queries.
- The Edge health median is 1.18 ms against 0.81 ms on trunk. Its p95 falls in a second group of samples, 5 to 8 ms, that carry a garbage-collection pause. The CPU profiles of the same route show `(garbage collector)` samples of 2.8 to 9.9 ms in 6 of 20 Edge health requests, and 2 smaller ones on trunk.
- Each entry's turn starts with health, so a health request often follows a 4 MiB sync, the largest allocator in the script. The pauses collect garbage from earlier requests. The pauses are small against the 2,000 ms limit, but the rule compares p95 with trunk's, and trunk has one such outlier per run.
- Two other runs with the same measurement reported `Decision: go`. [Run 42378770410](https://github.com/anthonyyoo24/justgo/actions/runs/42378770410) at `de2507d` saw one pause in 20 Edge health requests. Attempt 1 of the final run, on the same SHA, also said go, and its samples were lost when attempt 2 started. A p95 of 20 samples falls in the pause group once two or more requests pause. Run 42378770410's profiled pass shows garbage-collection time in 6 of 20 Edge health profiles, the same rate as the final run, so its single pause in the unprofiled pass was a low draw. Across the two kept runs 7 of 40 Edge health requests paused, which puts the p95 in the pause group. If Anthony wants a stable verdict, the perf auditor suggests a randomized route order, at least 100 rounds, a count of the requests that coincide with a pause, and a timed pass without the inspector.
- Every CPU reading fails the trial, but the failing route depends on the reading. Whole-process CPU also counts the trial's gateway stand-in, the inspector server and Tokio threads on Edge. Before the first run the owner chose it as the fallback for profiles without `(idle)` samples, and it fails health and the guest catalog in every run. In the final run it also fails the attempt write, at a p95 of 11.06 ms against twice trunk's, 9.25 ms. The Edge profiles held no `(idle)` samples, so Edge profile time includes waiting on Postgres. Read as CPU, the profiles pass the small routes and put the sync at a 1,032 ms p95, which is the case the rule answers with a batching section. The owner switched to the worker thread clock after the first runs because it is the clock the runtime's limit reads.
- The sync spends about 0.18 ms of Edge worker CPU per query, against 0.10 ms on Node. The profiles put that time in socket writes and reads through Deno's `node:net` layer, `Buffer` conversions and garbage collection.
- The loopback median of ten timed `select 1` round trips in one transaction was 0.244 ms on the first probe and 0.137 to 0.156 ms on four more.

#### CPU limit

The pinned image enforces a CPU limit only when the main service passes one to `EdgeRuntime.userWorkers.create`. The Supabase CLI's local serve passes a 1,000 ms soft limit and a 2,000 ms hard limit with the `per_worker` policy. With those limits and the `per_request` policy, a request that burns 2,500 ms of CPU returns 546 after 2,006 ms, and a 1,500 ms burn returns 200. Under `per_worker` the runtime adds up CPU across a worker's requests, so a 500 ms burn followed by a 1,500 ms burn ends in 546. With no limits set, a 2,500 ms burn returns 200. The perf probe ran with no limits and one long-lived worker, and it read CPU from the worker thread. P15-2 and P15-9 confirm the hosted limit.

#### Answers from P15-1

1. Partly. Bundled `pg` and `npm:pg` both verify a custom CA with `verify-full` on the Edge runtime. P15-2 still checks the Supabase CA through the transaction pooler as `justgo_runtime.<project-ref>`.
2. P15-2 answers it.
3. No. `typeof globalThis.Buffer` is `undefined` in a user worker. `process` is an object and `global` is undefined. Without a `node:buffer` import, every managed request returns 401 `UNAUTHORIZED`, which is the Appendix C risk. A `Buffer` import in the bundle banner fixes it with no change to shared code.
4. P15-2 answers it.
5. P15-2 answers it. The trial entry passed the fixed address `unknown` to every rate limit.
6. P15-2 answers it. Lane 10 shows that the API's own Sentry envelope carries no body, token or reflection text.
7. At loopback the p95 is 523 ms of Edge worker CPU and 918 ms of wall time. P15-2 predicts the hosted wall time, and P15-9 measures it.
8. P15-2 answers it.
9. P15-2 answers it for the gateway. The local runtime passed the 4,154,082-byte body to the worker.
10. The production entry bundles to 2,197,373 bytes with `pg` bundled and to 2,014,633 bytes with `npm:pg`, under the 5 MB server-side cap. On the runner the first request to a new worker took 540 ms. P15-2 measures the hosted cold start.

### P15-2 hosted runtime trial

P15-2 ran on November 12, 2026, in the hosted window it shares with P15-9. `justgo-trial` deployed from `phase15/edge-trial` at `a39d9d508d3b76a997c177a9e3cd0cf638c58024` in [run 43164993608](https://github.com/anthonyyoo24/justgo/actions/runs/43164993608), and [run 43248129302](https://github.com/anthonyyoo24/justgo/actions/runs/43248129302) deleted it after the lanes. The [log scan run](https://github.com/anthonyyoo24/justgo/actions/runs/43165904280) read 63 rows and found no bearer, header or body canary.

- Lanes 1, 2, 3, 4, 5, 6, 8 and 10 passed. The fast path deferred lanes 7 and 9, now gates #449 and #450.
- Lane 3 read `show statement_timeout` as `5s`. The pooler ignores the pool setting, and the `justgo_runtime` role's 5 s default applies.
- Lane 4 chose `cf-connecting-ip`. The gateway sends no `x-real-ip`, which the Edge entry read until PR #448.
- Lane 6 took 525 ms for the first request after 15 idle minutes, and the warm guest catalog p95 over 50 requests was 89 ms.
- The perf rule failed on the prediction. The hosted `select 1` median was 2.987 ms, so the predicted worst-case sync is 985 + 2,812 × (2.987 − 0.137) = 8,999 ms, above the 8,000 ms limit.
- The CPU-limit check was Inconclusive, because no worker reached 2,700 ms of total burn.

The report ended with `Decision: stop`. Anthony then chose to go ahead with Supabase, and P15-9 lane 3 measured the hosted sync directly.

### P15-9 hosted acceptance

P15-9 ran on November 12, 2026, against the `api` function at version 1, serving `c8d6295c41d683c01c5a1ba98e873dfcdf68b7f1` from [deploy run 43255502203](https://github.com/anthonyyoo24/justgo/actions/runs/43255502203). The [migrate-deploy run](https://github.com/anthonyyoo24/justgo/actions/runs/43253293118) before it applied migrations 0024 and 0025 under Anthony's owner test-data waiver. Its upload was 2,206,518 bytes.

- Lanes 1, 2 and 9 passed. The warm guest catalog p50 was 91 ms and the p95 137 ms over 30 requests. Release identity headers come only on `/health` and `/ready`, by design.
- Lane 3 imported a 23.7 MB archive of 260 completions and 260 journal entries with 10,000-character reflections on the iPhone. The 14 sync POSTs all returned 200, and the slowest took 1,098 ms of wall time against the 8,000 ms limit. The function logs carry no CPU time, so the 1,000 ms CPU part is Inconclusive (#455).
- Lanes 4 and 5 passed on Anthony's report, with no screenshots. Apple and Google stayed separate accounts.
- The first request after about 15 minutes 20 seconds idle took 603 ms against the 2,000 ms limit.
- Lanes 6, 7 and 8 are deferred to gates #451, #452 and #453.
- Lane 10 waited on #454 until backups resumed. On November 13, 2026, database run [43467724155](https://github.com/anthonyyoo24/justgo/actions/runs/43467724155) (manual dispatch) and ledger runs [43467743601](https://github.com/anthonyyoo24/justgo/actions/runs/43467743601) (manual) and [43472290285](https://github.com/anthonyyoo24/justgo/actions/runs/43472290285) (clock) succeeded, and a read-only R2 HEAD matched each object's size, checksum and seven-day expiry.

The release took three steps. Anthony chose the owner test-data waiver, because staging held only test data and backups were paused, and PR #446 added it. The migrate-deploy run applied 0024 and 0025, but its health check failed, because the `DATABASE_SSL` secret was `true` and `apps/api/src/config.ts` accepts only `verify-full` or `disable`. Anthony re-set it to `verify-full`, [run 43254426042](https://github.com/anthonyyoo24/justgo/actions/runs/43254426042) re-set the secrets, and the code-only deploy found no pending migrations and served `/health` and `/ready`. Before the waiver run, a manual check found 0024 and 0025 compatible with the live Worker, which shares the database, because both add only `AFTER UPDATE` triggers.

Later that day, [run 43300067542](https://github.com/anthonyyoo24/justgo/actions/runs/43300067542) released `fdd410d` to `api` as version 2, so rate limits key on `cf-connecting-ip`. Anthony set `BETA_ACCESS_WINDOW` (November 1 to December 31, 2026) in the Supabase dashboard's function secrets. It is not in the `STAGING_FUNCTION_SECRETS` bundle, and the secrets operation never unsets a name, so it stays.

In lanes 4 and 5, one Google account first showed no imported history. It was a different Google account, and two Google accounts are two JustGO accounts by design. Lane 9 found four 401 responses on `GET /v1/completion-restores` and `GET /v1/journal-sync`, which match polls after a sign-out or switch revoked their session.

The trials answered the questions above.

1. Yes. `/ready` returned 200 through the transaction pooler on both functions, with `DATABASE_SSL=verify-full`.
2. The pooler ignores it, and the role's 5 s default applies.
3. P15-1 answered it.
4. Yes, in P15-2 lane 2.
5. `cf-connecting-ip`, in P15-2 lane 4.
6. No, in P15-2 lane 5 and P15-9 lane 9.
7. The slowest hosted sync batch took 1,098 ms of wall time. CPU is not measured.
8. Not answered. Gate #449.
9. Not answered. Gate #450.
10. The `api` upload was 2,206,518 bytes. The first request after idle took 525 ms on `justgo-trial` and 603 ms on `api`.

### P15-11 switch and retirement

#462 pointed the beta and Dev profiles, the beta preflight and the staging health check at the function, #463 dropped the Cloudflare host marker from the preflight, and #464 fixed the EAS upload. TestFlight build 0.1.0 (7) came from tag `testflight-beta-2026-11-12-3` at `e2ab966807cbba64e0302f13f3ee8f0624825829`, with diagnostics on. Its [build run](https://github.com/anthonyyoo24/justgo/actions/runs/43336256436) resolved `EXPO_PUBLIC_API_URL` to the function from the profile over the EAS preview value, and the inspection step passed. Its [upload run](https://github.com/anthonyyoo24/justgo/actions/runs/43340902735) succeeded. On November 13, 2026, with Anthony's go, build 5 expired in TestFlight, the API Worker and its Hyperdrive configuration were deleted, and the Vercel API project was paused.

- Lane 1 passed in #462. Trunk's preflight accepted the Worker URL and rejected the function URL, and the head's preflight did the reverse.
- Lane 2 passed. With the beta profile's variables and `EXPO_NO_DOTENV=1`, a local `export:ios` of `e2ab966` embeds `https://kmcpcauaxlgpevkkenwd.supabase.co/functions/v1/api` and neither `justgo-two.vercel.app` nor any `workers.dev` host. The bundle's `http://localhost:3000` comes from Expo Router's URL helper, and its `.vercel.app` fragments name no JustGO host.
- Lane 3 passed. `GET https://kmcpcauaxlgpevkkenwd.supabase.co/functions/v1/api/ready` returned 200 `{"status":"ready"}` in #462 and again at 15:52:48 UTC on November 13.
- Lanes 4 and 6 passed on build 7 on Anthony's report, with no screenshots by his choice. Lane 5 was skipped, and gate #451 stays open.
- Lane 7 passed. Sentry uptime monitor [10773615](https://anthony-corp.sentry.io/monitors/10773615/) targets `https://kmcpcauaxlgpevkkenwd.supabase.co/functions/v1/api/ready` and was renamed to match. A test check passed, and every check-in from 15:29 to 15:38 UTC returned HTTP 200.
- Lane 8 passed. At 15:48:13 UTC, `GET https://justgo-api-staging.anthonyyoo24.workers.dev/ready` returned 404 with body `error code: 1042`, after the Worker and the Hyperdrive configuration `justgo-staging` (`43680896c69f4596804be7fba6bf9f0d`) were deleted. The backup clock Worker has no bindings and stays.
- Lane 9 passed. At 15:49:11 UTC, `https://justgo-two.vercel.app/ready` returned 503 `DEPLOYMENT_PAUSED`, and `https://justgo-legal.vercel.app/privacy/` and `/terms/` returned 200. The Vercel project `justgo` is paused, not deleted. The same three requests returned the same results at 15:52:48 UTC.
- Lane 10 is half done. Clock ledger run [43472290285](https://github.com/anthonyyoo24/justgo/actions/runs/43472290285) passed on November 13. The first clock-dispatched nightly database run is due at 04:43 UTC on November 14, and gate #476 tracks it.
- Perf passed on Anthony's report that launch to first sync was fine. No timings were recorded.

Anthony also expired builds 3 and 4 that day. App Store Connect shows builds 3, 4 and 5 Expired and build 7 Ready to Submit, in the Owner validation group only.

## Appendix B. Alternatives rejected

- **Resume the Worker.** Anthony retired it.
- **Deploy Hono to Vercel first.** It would split the framework change from the host change, but Vercel's DPA prohibits sensitive data, and build 5 serves no outside users.
- **Another framework.** Fastify and Express need Node's HTTP server. Oak means rewriting every route. `@supabase/server` expects Supabase Auth JWTs or API keys. Hono already runs on `Deno.serve`.
- **A proxy at a path-free host.** It would spare the mobile change, but it brings back a second provider and another place to trust forwarded headers.
- **Hono `basePath`.** It leaves the prefix in `context.req.path`, which the release identity and startup-failure paths compare against bare paths.
- **Supabase backups in place of R2.** Supabase Free has none, Pro costs money, and they drop the hourly encrypted deletion ledger that restore replays.
- **Rename the config fields to `JUSTGO_` names everywhere.** That touches `.env` files, scripts and the release guard. One mapping in the entry is enough.
- **Postgres.js from the start.** It changes every `NodePgDatabase` signature. Keep `pg` unless the trial fails it.
- **One PR for the whole port.** AGENTS.md asks for small PRs, and the trials must be able to stop the port before code lands.
- **Separate PRs for the entry (P15-6) and the release lane (P15-8).** Rejected for speed on November 11, 2026. Neither serves a user until P15-11, so one review covers both.
- **Remove the Worker (P15-5) before the port.** Rejected for speed and safety on November 11, 2026. The Worker keeps serving the beta profile until the new build passes.

## Appendix C. Risks

| Risk                                                                          | PR            | What the owner watches                                                                        |
| ----------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `pg` cannot verify the Supabase CA on Deno                                    | P15-1, P15-2  | P15-2 lane 1. The fallback is `drizzle-orm/postgres-js`.                                      |
| Bundled code has no `Buffer`, so every managed request returns `UNAUTHORIZED` | P15-1         | Lane 8. Import `node:buffer` or use web base64url helpers.                                    |
| The pooler rejects the `statement_timeout` connection setting                 | P15-2         | P15-2 lane 3 found that the pooler ignores it, so the role's 5 s default applies.             |
| The worst-case sync outlasts the 10 second client deadline                    | P15-1, P15-9  | P15-1 at loopback, a P15-2 prediction, and P15-9 hosted. Batch the parent checks if it fails. |
| A forged header defeats identity rate limits                                  | P15-2, P15-6  | P15-2 lane 4 and P15-6 lane 9.                                                                |
| Platform logs keep tokens or private text                                     | P15-2, P15-9  | P15-2 lane 5 stops the program until Anthony decides.                                         |
| A deploy or a secret change replaces serving code at once, with no rollback   | P15-8         | Candidate first, readback, and rollback by redeploying the previous tag.                      |
| The backup clock token stops passing its expiry check on December 12          | Arm, P15-4    | Renewed on November 13, 2026. Renew it again before December 12 at 23:40 UTC.                 |
| Retiring Workers stops the backups                                            | P15-5, P15-11 | The file boundary. The backup clock, R2 and the Cloudflare account stay.                      |
| A Git-connected Vercel project deploys on merge                               | P15-3         | Anthony confirms Git deployments are off before merge.                                        |
| The Free project pauses after a week without activity                         | P15-9         | Record the pause behavior and what the app shows.                                             |
| Installed builds keep their embedded API URL                                  | P15-11        | Build 5 keeps Vercel until the new build passes.                                              |
| Edge runtime lanes cannot run on the 8 GB Mac                                 | P15-1, P15-6  | They run in CI.                                                                               |
| The first hosted deploy has no previous tag to roll back to                   | P15-6, P15-9  | No build points at the function until P15-11, so a failed deploy reaches no user.             |
| The Worker needs a fix after P15-6 replaced its deploy lane                   | P15-6         | The Worker serves only Anthony's beta profile. Redeploy it from the commit before P15-6.      |

## Appendix D. Links and reading list

- Read Appendix A before any PR. The [analysis on #171](https://github.com/anthonyyoo24/justgo/pull/171#issuecomment-6695056934) holds the citations behind this plan.
- Before you edit, read the [AGENTS.md rules list](../../AGENTS.md#rules-and-what-enforces-them). It owns the invariants this plan must keep.
- Read [SERVER_RELEASES.md](../operations/SERVER_RELEASES.md) and [CLOUDFLARE_BACKUPS.md](../operations/CLOUDFLARE_BACKUPS.md) before P15-4, P15-5 and P15-8.
- P15-11 deleted the Cloudflare plan, the cutover checklist and the Cloudflare notice review. Git history keeps them at `e2ab966`.
- Run pstack's `how` skill before P15-6 and P15-8.
- Keep a decision trail per PR at `.local/decision-trails/phase-15-<pr-id>.tsv`, per pstack's `show-me-your-work` skill and the Stop hook in `.claude/hooks/require-trail-review.mjs`.
- Recheck these Supabase references before P15-1. Agents read them on November 6, 2026. [Functions](https://supabase.com/docs/guides/functions), [routing](https://supabase.com/docs/guides/functions/routing), [gateway authentication](https://supabase.com/docs/guides/functions/auth-headers), [Postgres from functions](https://supabase.com/docs/guides/functions/connect-to-postgres), [secrets](https://supabase.com/docs/guides/functions/secrets), [limits](https://supabase.com/docs/guides/functions/limits), [deploy](https://supabase.com/docs/guides/functions/deploy), [regional invocation](https://supabase.com/docs/guides/functions/regional-invocation), [logging](https://supabase.com/docs/guides/functions/logging), [function pricing](https://supabase.com/docs/guides/functions/pricing), [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum) and [data residency](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq).
