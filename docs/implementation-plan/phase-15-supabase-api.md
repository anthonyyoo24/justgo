<a id="phase-15"></a>

# Phase 15 plan to move the API to one Supabase Edge Function

**Status.** By November 6, 2026, Anthony had confirmed Supabase Edge Functions as the API host and retired the Cloudflare Workers rollout. This plan is planning only. Execution starts on Anthony's explicit go.

The last recorded deploys put the API on two staging hosts. Vercel has the old Fastify build for TestFlight build 5, and a Cloudflare Worker has Hono for the beta profile. No production API exists. This plan moves main's Hono API to one Edge Function named `api` in the existing JustGo project, for Anthony's builds now and for outside beta testers later. The rule is that no step may weaken account ownership, deletion, local retention or recovery, and every hosted step waits for Anthony's go. A runtime trial decides whether the port proceeds. The PRs, in order, are P15-1 and P15-2 (trials), P15-3, P15-4 and P15-5 (removals and recovery), P15-6 (entry), P15-7 (mobile base path), P15-8 (release lane), P15-9 (hosted acceptance), P15-10 (notices) and P15-11 (switch and retire). Appendix A records why, and the [analysis on #171](https://github.com/anthonyyoo24/justgo/pull/171#issuecomment-6695056934) holds the full citations.

## How to read this

One box is one unit of work. Every box names the evidence that checks it. A nested box is a sub-step of the box above it. Check a box only when its evidence exists, a file, a log line, a screenshot, a test run, or a SHA. The body is a how-to. The appendices explain and record.

The program runs `pstack/skills/poteto-mode/playbooks/autopilot-full.md` from the installed pstack plugin. An agent merges a verified PR that touches no [Agent-effort](../../AGENTS.md#agent-effort) path. P15-3, P15-4, P15-5, P15-6, P15-7, P15-8, P15-10 and P15-11 are Anthony's items and stop at merge-ready. P15-1 and P15-2 are prototypes and never merge. Only their docs PRs, which record the results, merge.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

This plan replaces the paused [Cloudflare plan](phase-15-cloudflare-api.md), which stays until P15-11 deletes it. Phase 16 remains billing. Phase 14 privacy, release and device gates stay open.

## Program checklist

### Arm the program

- [ ] State the protocol and this plan to Anthony, then stop. Start execution only on Anthony's explicit go.
- [ ] Read these from trunk at program start. Re-read them at every tick.
  - [ ] `git show origin/main:AGENTS.md`
  - [ ] `git show origin/main:docs/implementation-plan/phase-15-supabase-api.md`
  - [ ] `git show origin/main:.claude/skills/verify-justgo/SKILL.md`
  - [ ] `git show origin/main:docs/operations/SERVER_RELEASES.md`
  - [ ] The installed pstack plugin's `skills/poteto-mode/playbooks/autopilot-full.md`, `skills/poteto-mode/playbooks/opening-a-pr.md`, `skills/swarm/SKILL.md` and `skills/interrogate/SKILL.md`. pstack is a plugin, so these files are not in this repository.
- [x] Get Anthony's decisions before dependent work starts. He made all five in the planning session on November 6, 2026.
  - [x] Production arrangement. Phase 15 releases staging only. Production uses the same release lane in a later approved step.
  - [x] Legal page hosting. The legal pages stay on Vercel, because they carry no account data. Edge Functions rewrite HTML to plain text without a custom domain.
  - [x] Backups. R2, the backup clock Worker and the Cloudflare account that holds them stay.
  - [x] Plan tier. The project stays on Supabase Free. Before any purchase, present the limits and the spend-cap behavior.
  - [x] Local tools. Edge runtime lanes run in GitHub Actions, and nothing new is installed on the Mac.
- [ ] While backups are paused, the backup clock's November 29 token expiry needs no renewal. Renew it with the R2 credentials when backups resume.
- [ ] Backups are paused. On November 6, 2026, Anthony set `JUSTGO_BACKUPS_ENABLED` to `paused` because staging holds only test data. Before outside testers store real journals, renew the R2 credentials and the backup clock token, set the variable back to `approved`, confirm one nightly and one hourly run succeed, record the new expiry dates on issue #77, then close it.
- [ ] On Anthony's go, arm the audit tick as `/loop 1h` with the tick prompt below. Never leave the cadence to memory.
- [ ] Use this tick prompt, verbatim. "Re-read the execution playbook from trunk. Audit the operation against it and fix drift in this tick. Probe every active lane and judge progress by side effects only. Stand down a stuck lane and dispatch its replacement now. Then post a short status message to the operator in chat only when the audit found a tracked change that no earlier status message reported, such as a PR opened, a code-ready head, a round launched or closed, a verdict, a merge, a stuck agent and the action taken, a blocker added or cleared, or a decision only the operator can make. Name every such change and nothing else. Do not repeat a table, the merged list, or an unchanged blocker. If the audit found none, end the turn with no reply text. Either way, log this tick's row in your decision trail. The row names the items reported, or none."
- [ ] On Anthony's hold or stand-down, send every owner a zero-writes order at once.

### Spawn owners

- [ ] Spawn one owner per PR with the full lifecycle that `playbooks/autopilot-full.md` names. In Claude Code an owner is an `Agent` with `isolation: "worktree"`. Owners of PRs on Agent-effort paths run at `xhigh` effort, and so does the P15-1 owner, because its trial branch touches `apps/api/scripts/`.
- [ ] Follow this dependency graph. Start dependent work only after its parent merges or reports the named result.
  - [ ] P15-1, P15-3 and P15-4 are independent and first. All three branch from `main`.
  - [ ] P15-2 after P15-1 reports `Decision: go`.
  - [ ] P15-5 after P15-2 reports `Decision: go`. It deletes the only working staging deploy lane, so it waits until the port is certain.
  - [ ] P15-7 after P15-1 reports `Decision: go`. It branches from `main`.
  - [ ] P15-6 after P15-2 reports `Decision: go` and P15-5 merges.
  - [ ] P15-8 after P15-6 merges.
  - [ ] P15-9 after P15-7 and P15-8 merge.
  - [ ] P15-10 after P15-9 merges.
  - [ ] P15-11 after P15-10 merges.
- [ ] Hold the file boundaries.
  - [ ] P15-3 touches only `apps/api/vercel.json`, `.vercelignore`, `scripts/release/vercel-cli/`, the `onVercel` code, the `VERCEL` legal-draft gates, and their tests and docs.
  - [ ] P15-5 touches only the API Worker code, its scripts, tests, CI step and docs. It never touches `scripts/backups/clock/`, `sites/legal/` or `.github/workflows/staging-health.yml`.
  - [ ] P15-7 touches only `apps/mobile/src/lib/network/`, `scripts/development/`, the fixture API prefix and their tests.
  - [ ] P15-3 and P15-5 can both edit `apps/api/tests/http/routing.test.ts`. Whichever lands second rebases onto the first.
- [ ] Hold the review gate. P15-10 changes what users read. It waits for Anthony's review in chat with screenshots and a video before merge.
- [ ] Hold Anthony's hosted gates. Every deploy, `supabase secrets set`, provider setting change, new build and notice publication waits for his go. These happen in P15-2, P15-8, P15-9 and P15-11.

### PR mechanics, for every PR

- [ ] Resolve the forge once. Use `gh` unless `command -v origin` succeeds and Origin resolves the repository. Record any fallback to `gh`. Never require `gt`.
- [ ] Open the PR ready, never draft, per **Opening a PR**. Run `gh pr create --base <base-branch>`. A stack child targets its parent branch.
- [ ] Run the checks that the [check matrix](../../AGENTS.md#choosing-checks) names for the touched paths once before the PR-facing push. Run one heavy check at a time on the 8 GB Mac. Push with hooks on.
- [ ] Run `/deslop` before each commit when `cursor-team-kit` is installed, and run `/no-comments` before review.
- [ ] Triage every bot and security-review comment per pstack's `references/bugbot-triage.md`.
- [ ] Run `/pstack:interrogate` before calling P15-3, P15-4, P15-5, P15-6, P15-7, P15-8 or P15-11 verified. Each touches an Agent-effort path.
- [ ] Rebase onto current trunk before the code-ready report and babysit. Keep that merge base in fix rounds. Rebase again only at merge prep, on a `git merge-tree` conflict with trunk, on a CI failure that comes from a change on trunk, or when a known concurrent change to the same files lands.

### Verdict and merge, for every PR

- [ ] A full swarm runs once, at the code-ready head. Another full swarm runs only for new behavior, a redesign, or a large new diff. A rebase, a merge-conflict resolution, or a minor fix gets a single verifier at the new head, and a wording-only change gets none. Run each full swarm per pstack's `skills/swarm/SKILL.md`. One gates lane. The ten live lanes from the PR's **Verify, live** block. The perf lane from its **Verify, perf** block. Two or more audit lanes, each with its own focus, that read the diff and the receipts and distrust the PR body. The root audits the receipts in the merge-ready report before the verdict.
- [ ] Judge every finding by the execution playbook's blocking rule. The verdict is clean when none blocks. A failure on trunk behavior in a lane marked `Regression lane against trunk.` is recorded against trunk and does not block the PR. A new head gets a fresh verdict, except for results that stay valid under the patch-id rule in pstack's `playbooks/shipping.md`.
- [ ] Post each verdict as a PR comment whose verdict line has the form that [AGENTS.md](../../AGENTS.md#git-and-autonomy) gives, with each SHA in backticks. The `sections` check parses only that form. The verifier is a separate Claude agent that did not write the PR, and the comment says so.
- [ ] Merge only on green CI plus a clean verdict at the exact head. After a rebase, run `node scripts/quality/verdict-patch.mjs check <verdict-base> <verdict-head>`. `carries` and `docs-tests-only` keep the verdict. `re-verify` needs a new one. An agent squash-merges its own PR when the PR touches no Agent-effort path. Anthony merges the rest.

### Boot recipe, for every live lane

Each live lane runs at the PR head in its own worktree. On the 8 GB Mac, lanes run one at a time against one local stack. Edge runtime lanes run in GitHub Actions, as Anthony decided on November 6, 2026.

- [ ] `git fetch origin <head-branch> && git checkout <head SHA>`.
- [ ] Start the database with `LC_ALL=en_US.UTF-8 npm run db:local`, then run `npm run db:migrate`.
- [ ] For an app lane, run `.claude/skills/verify-justgo/bin/verify serve`, then wait for `.claude/skills/verify-justgo/bin/verify doctor` to report `"state": "serving"`. For a function lane, start the bundle on the Edge runtime (the P15-1 trial script, or `npm run test:edge -- --serve` after P15-6) and wait for `/ready` to return 200.
- [ ] Deliver input only through `curl`, the `verify-justgo` drives or the built-in browser pane. The read-only diagnostics are `verify doctor`, `/health`, `/ready` and SQL readback through `npm run test:db:file -w @justgo/api`.
- [ ] Run a hosted lane only after Anthony's go for that PR. Never send a fixture proof to a hosted API.
- [ ] Save every receipt to `.local/swarm/<pr-id>/lane-<n>/<slug>` and return the paths with the report. Mask tokens and private text before you save.
- [ ] Stop the stack with `.claude/skills/verify-justgo/bin/verify stop`, and compare doctor counts before and after.

## Run the local runtime trial (P15-1)

**Depends on.** None.

**Files.**

- [ ] Create the throwaway branch `phase15/edge-trial` from `main`. Never merge it.
- [ ] Create `apps/api/src/edge.ts`, `supabase/config.toml`, `supabase/functions/api/index.ts` and `supabase/functions/api/deno.json` on that branch.
- [ ] Create `apps/api/scripts/edge-trial.ts` on that branch. Port the route sequence and database readback from `apps/api/scripts/workers-smoke.ts:248-340`.
- [ ] Create a worst-case sync fixture on that branch with 50 journal versions of 50 parents each, close to the 4 MiB body bound.
- [ ] Create a workflow on that branch, triggered by `push` to `phase15/edge-trial`, that runs the trial in a pinned `supabase/edge-runtime` image against `justgo_test`. It uploads the report, receipts and CPU profiles as a workflow artifact. Download the artifact to `.local/edge-trial/`.
- [ ] Record whether the pinned image enforces the hosted 2 s CPU limit. If it does not, the CPU rule reads the profiles, and P15-2 and P15-9 confirm on the hosted function.

**Build.**

- [ ] Bundle `apps/api/src/edge.ts` with esbuild into one ESM file. Reuse the contracts alias in `scripts/release/staging-worker-build.mjs:132-138`. Record the bundle size.
- [ ] Serve the bundle with `Deno.serve`. Strip the `/api` function prefix once before `app.fetch`.
- [ ] Map `JUSTGO_AUTH_PUBLISHABLE_KEY` and `JUSTGO_AUTH_SECRET_KEY` into the existing `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_AUTH_SECRET_KEY` config fields. Leave `readConfig` unchanged.
- [ ] Build the app and a one-connection `pg` pool once per worker.
- [ ] On the Edge entry, time ten `select 1` round trips inside one transaction after one untimed query, and record the median. P15-2 repeats this probe on the hosted function.
- [ ] Run `pg` both bundled with a `node:buffer` banner and external as an `npm:` import. Record which one works.
- [ ] If `pg` fails over TLS or inside a transaction, repeat the trial with `drizzle-orm/postgres-js` and record the difference.

**You see.**

- [ ] `.local/edge-trial/report.md` lists every lane with pass or fail, the bundle size, CPU and wall time per route, the query count of the worst-case sync, the loopback median of ten timed `select 1` round trips, and one decision line, `Decision: go` or `Decision: stop`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `npm run test -w @justgo/api` passes on the trial branch, which shows the trial entry changed no shared code.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes run the bundle on the Edge runtime in CI against `justgo_test`.

- [ ] Lane 1. Regression lane against trunk. Run the trial route sequence on the trunk Node entry and on the head Edge entry. Save `route-sequence.json`. Pass when every status and body matches apart from request IDs.
- [ ] Lane 2. Request `GET /api/health` and `GET /api/ready` on the Edge entry. Save `ready.json`. Pass when `/ready` returns 200 after readiness confirmed `justgo_runtime`, the `justgo` schema and the live-session helper.
- [ ] Lane 3. Read the guest catalog with no bearer. Save `guest-catalog.json`. Pass when it returns 200 with the seeded challenges.
- [ ] Lane 4. Send 20 interleaved attempt writes from two fixture users. Save `owner-isolation.json`. Pass when each user reads back only their own attempts and SQL readback shows no cross-owner row.
- [ ] Lane 5. Read the second user's attempt with the first user's bearer. Save `cross-account.json`. Pass when the status matches the Node entry's and no row changes.
- [ ] Lane 6. Throw from a trial-only failpoint after `set_config` inside a write. Save `rollback.json`. Pass when the API returns its typed 5xx body and SQL readback shows no partial row.
- [ ] Lane 7. Create a loopback legacy session and two concurrent transfers with the same code, which take `pg_advisory_xact_lock`. Save `xact-locks.json`. Pass when one transfer succeeds and the other waits, then fails with the Node entry's status.
- [ ] Lane 8. Decode a managed token payload with a stubbed Auth endpoint, and decode a progress cursor. Save `buffer-paths.json`. Pass when both decode with no `ReferenceError` for `Buffer`.
- [ ] Lane 9. Post the worst-case journal sync batch. Save `worst-sync.json`. Pass when it returns 200, the saved count matches the batch, and the report records CPU ms, wall ms and the query count.
- [ ] Lane 10. Trigger a server error with diagnostics on and a stub Sentry endpoint. Save `sentry-envelope.json`. Pass when the envelope reaches the stub with no request body, token or reflection text.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. CPU ms and wall ms per request for `/health`, the guest catalog, an attempt write and the worst-case journal sync, plus the sync's query count.
- [ ] Probe. Run one request script against the trunk Node entry and the head Edge entry, alternating, for 20 rounds each. Capture CPU profiles from the inspector port.
- [ ] Baseline. Record the trunk Node numbers first.
- [ ] Rule. The trial fails if the worst-case sync takes more than 1,000 ms of CPU or 5,000 ms of wall time at loopback, or if a small route's p95 CPU is more than twice trunk's. If only the sync fails, add a plan section that batches the parent checks in `apps/api/src/data-sync/journal.ts`, and land it before P15-6.

**Review gate.** None. P15-1 is not review-gated.

**Merge.**

- [ ] Never merge `phase15/edge-trial`. Keep the branch and its SHA for Appendix A.
- [ ] Open a docs-only PR that records the report in Appendix A and the decision in this plan. An agent merges it after an independent verdict.
- [ ] On `Decision: stop`, present the failed lanes to Anthony and stop the program.

## Run the hosted runtime trial (P15-2)

**Depends on.** P15-1 with `Decision: go`, and Anthony's go for a trial deploy to the JustGo project.

**Files.**

- [ ] Edit `supabase/config.toml` on `phase15/edge-trial` to add `[functions.justgo-trial]` with `verify_jwt = false`.
- [ ] Create a trial-only route on that branch that returns the client-address headers the function receives, the result of `show statement_timeout` inside a transaction, and the median of ten timed `select 1` round trips inside one transaction after one untimed query. It never merges.
- [ ] Set `statement_timeout` in `poolOptions` to 4,321 ms on that branch only, so the probe can tell the pool value from the role's 5 s default.

**Build.**

- [ ] With Anthony's go, set `DATABASE_URL` to the pooler user `justgo_runtime.<project-ref>` on port 6543, and set `DATABASE_CA_CERT` to the Supabase root CA.
- [ ] With Anthony's go, deploy the trial bundle as `justgo-trial` from a workflow on the trial branch. The workflow installs Supabase CLI 3 through the SHA-pinned `supabase/setup-cli` action and runs `--remote <ref> --yes`. Anthony stores the Supabase access token in a protected GitHub environment.
- [ ] After the lanes, delete the `justgo-trial` function with Anthony's go. Keep the secrets only if Anthony approves them for P15-8.

**You see.**

- [ ] `.local/edge-trial/hosted-report.md` lists every hosted lane with pass or fail, the chosen client-address header, the region decision and one decision line.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `npm run test -w @justgo/api` still passes on the trial branch after the hosted changes.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes call the hosted `justgo-trial` function from the Mac.

- [ ] Lane 1. Regression lane against trunk. Request `GET /health` and `GET /ready` on the serving Worker and on `justgo-trial`. Save `hosted-ready.json`. Pass when both return 200 and the function's readiness confirms `justgo_runtime` over verified TLS.
- [ ] Lane 2. Request `GET /health` with no `Authorization` and no `apikey` header, then send a protected request with an invalid bearer. Save `gateway-pass.json`. Pass when Hono answers both, the second with the API's typed `UNAUTHORIZED` body, not a gateway 401.
- [ ] Lane 3. Read `show statement_timeout` from the trial route. Save `statement-timeout.json`. Pass when the report records the value. `4321ms` means the pooler accepted the pool setting, any other value means it ignored it, and a connection error means it rejected it and triggers the Appendix C fallback. After a rejection, redeploy the trial without the option, with Anthony's go, and rerun lanes 1, 2 and 4 to 10.
- [ ] Lane 4. Send forged `x-forwarded-for`, `x-real-ip` and `cf-connecting-ip` headers to the trial route. Save `client-address.json`. Pass when one header always carries the Mac's real address, whatever the client sends. Record that header.
- [ ] Lane 5. Send a canary request with a fake bearer, a canary header and canary body text, then read the Invocations view and the edge logs. Save `log-canary.json`. Pass when no bearer, header value or body text appears in any log. If any appears, stop and present it to Anthony.
- [ ] Lane 6. Wait 15 minutes idle, then time the first request and 50 warm requests. Save `cold-warm.json`. Pass when the numbers meet the perf rule.
- [ ] Lane 7. Repeat lane 6 with `x-region: ca-central-1`, and read `x-sb-edge-region` on every response. Save `region-pin.json`. Pass when the report records both regions and the latency difference, and names the region decision.
- [ ] Lane 8. Read the guest catalog 20 times. Save `guest-hosted.json`. Pass when every read returns the seeded catalog and release identity headers that name the trial source SHA.
- [ ] Lane 9. Send 1, 4 and 6 MiB bodies to an unauthenticated POST route. Save `body-limit.json`. Pass when the report records which sizes reach Hono and which the gateway rejects.
- [ ] Lane 10. Read back the deploy and `supabase secrets list` in the workflow. Save `deploy-readback.json`. Pass when the function `version` and the bundle hash match the build, and the receipt holds no secret value.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Cold and warm wall ms for `/health` and the guest catalog measured from the Mac, and the function's per-query database latency, the median of the trial route's ten timed `select 1` round trips.
- [ ] Probe. Alternate requests between the serving Worker and `justgo-trial` for 50 rounds after the idle wait in lane 6.
- [ ] Baseline. Record the Worker's warm p50 and p95 first.
- [ ] Rule. The trial fails if the function's warm p95 for the guest catalog exceeds 300 ms or its first request after idle exceeds 2,000 ms. It also fails if the predicted hosted wall time of the worst-case sync exceeds 8,000 ms. The prediction is the P15-1 loopback sync wall time plus the P15-1 query count times the difference between the hosted and loopback `select 1` medians. Hosted requests need a genuine account, so P15-9 measures that sync directly.

**Review gate.** None. P15-2 is not review-gated.

**Merge.**

- [ ] Never merge `phase15/edge-trial`.
- [ ] Open a docs-only PR that records the hosted report in Appendix A and the decision in this plan. An agent merges it after an independent verdict.
- [ ] On `Decision: stop`, present the failed lanes to Anthony and stop the program.

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

- [ ] `apps/api/tests/identity/identity.test.ts` keys a managed-auth rate bucket by the supplied client address and ignores `x-vercel-forwarded-for`. Run `npm run test -w @justgo/api -- tests/identity/identity.test.ts`.
- [ ] Run `npm run typecheck -w @justgo/api`, `npm run lint` and `npm run test:architecture`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes drive the Node fixture API and Expo web.

- [ ] Lane 1. Regression lane against trunk. Run `verify drive welcome challenge progress account data` at trunk and at head. Save `drive-summary.json`. Pass when the same drives pass on both.
- [ ] Lane 2. Send 121 managed sign-in requests from one address to the Node fixture API. Save `rate-one.json`. Pass when request 121 returns 429 with `Retry-After`.
- [ ] Lane 3. Repeat lane 2 with a different forged `x-vercel-forwarded-for` value on every request. Save `rate-forged.json`. Pass when request 121 still returns 429.
- [ ] Lane 4. Start `apps/api/src/server.ts` in development with `VERCEL=1` and the loopback `justgo_test` settings, not the fixture API, which refuses `VERCEL`. Save `vercel-env.json`. Pass when the development legal draft routes answer as they do without the variable.
- [ ] Lane 5. Request `/health` and `/ready` on the Node entry with `JUSTGO_SOURCE_SHA` set. Save `node-ready.json`. Pass when both return 200 with the release identity headers.
- [ ] Lane 6. Accept a challenge as a guest in the built-in browser pane. Save `guest.png`. Pass when the deck shows `Accept challenge` and the attempt saves.
- [ ] Lane 7. Download the complete data export in the pane. Save `export.png`. Pass when the export finishes and doctor counts return to the baseline after cleanup.
- [ ] Lane 8. Run `npm run test:journey -- e2e/provider-sign-in.spec.ts`. Save `provider-sign-in.txt`. Pass when the journey passes.
- [ ] Lane 9. Run `npm run export:web -w @justgo/mobile`, then `npm run test:exported-web`. Save `exported-web.txt`. Pass when the smoke passes.
- [ ] Lane 10. Search `apps`, `scripts` and `.github`, outside `apps/api/tests/`, for `onVercel`, `x-vercel-forwarded-for`, `vercel.json`, `.vercelignore` and `vercel-cli`. Save `vercel-audit.txt`. Pass when nothing matches, or only the `VERCEL_|vercel-cli` assertion in `scripts/quality/staging-api-workflow.test.mjs`.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time from starting the Node fixture API to its first 200 from `/ready`, in ms.
- [ ] Probe. Start and stop the API five times at trunk and five times at head, alternating.
- [ ] Baseline. Record trunk first.
- [ ] Rule. Head fails if its median exceeds trunk's by more than 10 percent.

**Review gate.** None. P15-3 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA, after `/pstack:interrogate`, because the PR touches `apps/api/src/identity/`.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] Anthony merges. The owner stops at merge-ready.

## Land the parked recovery checks (P15-4)

**Depends on.** None.

**Files.**

- [ ] Create a branch from `main` and cherry-pick `b27ba34`, `0ccaaa4`, `a9f3a43` and `5966a16` from `codex/phase15-real-recovery`. Leave the parked branch unchanged.
- [ ] Edit the planned `docs/checks/phase-15-rollout-review.md`, which `a9f3a43` adds, to drop its Workers rows.
- [ ] Drop the `docs/handoffs/phase-15-cloudflare-api.md` hunk of `a9f3a43` unless it records backup or recovery evidence.
- [ ] Edit `docs/operations/CLOUDFLARE_BACKUPS.md` to record the backup clock activation, the clock token expiry and the renewed R2 credential dates.

**Build.**

- [ ] Keep the restore hooks and preserved object owners in `scripts/backups/rehearse.mjs` and `scripts/backups/restore-local.mjs`.
- [ ] Keep `scripts/backups/recovery-auth-acceptance.mjs` on the Node `buildRuntimeApp`.
- [ ] Make CI run `scripts/backups/recovery-auth-acceptance.test.mjs`.
- [ ] If P15-3 merged first, delete the `onVercel` argument from `scripts/backups/recovery-auth-acceptance.mjs`.

**You see.**

- [ ] `npm run test:backup:recovery` reports the restored-writing check before the deletion acceptance, and passes.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Run `node --test scripts/backups/recovery-auth-acceptance.test.mjs scripts/backups/backups.test.mjs`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes run the local recovery rehearsal against loopback databases only.

- [ ] Lane 1. Regression lane against trunk. Run `npm run test:backup:recovery` at trunk and at head. Save `rehearsal.txt`. Pass when both pass and head adds the restored-writing and owner checks.
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

- [ ] Metric. Wall time of `npm run test:backup:recovery`.
- [ ] Probe. Run it three times at trunk and three times at head, alternating.
- [ ] Baseline. Record trunk first.
- [ ] Rule. Trunk lacks the new checks. Head fails if they add more than 5 minutes to the median on the Mac.

**Review gate.** None. P15-4 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA, after `/pstack:interrogate`, because the PR touches `scripts/backups/`.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] Anthony merges. The owner stops at merge-ready.

## Remove the API Worker and its release lane (P15-5)

**Depends on.** P15-2 with `Decision: go`.

**Files.**

- [ ] Delete `apps/api/src/worker.ts`, `apps/api/src/db/worker-database.ts`, `apps/api/src/http/worker-router.ts` and `apps/api/cloudflare-config.mjs`, with their tests.
- [ ] Delete `apps/api/scripts/workers-smoke.ts`, `workers-smoke-entry.ts`, `workers-smoke-preflight.ts`, `workers-outbound-smoke.ts` and `workers-cpu-profile.ts`, with their tests.
- [ ] Delete `scripts/release/staging-cloudflare.mjs`, `staging-worker-build.mjs`, `staging-bootstrap.mjs`, `staging-promotion.mjs` and `staging-abandoned-version.mjs`, with their tests.
- [ ] Delete `.github/workflows/staging-api.yml`. P15-8 adds the Supabase workflow.
- [ ] Edit `scripts/release/staging-api.mjs`, `scripts/release/staging-api-deployment.mjs`, `scripts/release/staging-api-runner.mjs`, `scripts/release/staging-public-probes.mjs`, `scripts/release/staging-local.mjs`, `apps/api/scripts/local-staging-release.ts`, `apps/api/tests/http/routing.test.ts` and every other caller that the deletions break.
- [ ] Edit `apps/api/package.json`, the root `package.json`, `.github/workflows/ci.yml`, `scripts/quality/ci-workflow.test.mjs`, `scripts/quality/staging-api-workflow.test.mjs` and delete `scripts/quality/cloudflare-config.test.mjs`.
- [ ] Edit `AGENTS.md`, `docs/architecture/IDENTITY.md` and `docs/operations/SERVER_RELEASES.md`.

**Build.**

- [ ] Delete the Workers fetch entry, the Hyperdrive adapter with `LOCK_DATABASE_URL` and `needsDirectTransaction`, and the per-invocation router.
- [ ] Delete every step that calls Cloudflare. Keep `apps/api/scripts/staging-release-guard.ts`, `validateProbe` and `scripts/release/staging-public-probes.mjs` with their tests.
- [ ] Move the `wrangler` devDependency to the root manifest, because `scripts/backups/clock/` still deploys with it.
- [ ] Leave `scripts/backups/clock/`, `sites/legal/wrangler.json` and `.github/workflows/staging-health.yml` unchanged. The backup clock and the serving Worker still run.
- [ ] Delete the `release:staging:local` script from the root manifest. P15-8 adds it back for Supabase.
- [ ] Say in `AGENTS.md` and `SERVER_RELEASES.md` that no staging deploy lane exists until P15-8.

**You see.**

- [ ] `rg -n 'worker\.js|worker-database|worker-router|cloudflare-config|staging-cloudflare|test:workers' apps scripts .github package.json` prints nothing.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Run `npm run test -w @justgo/api`, `npm run test:architecture` and `node --test scripts/release/*.test.mjs scripts/backups/clock/worker.test.mjs`.
- [ ] Run the full `npm run check`, because a dependency moved.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes drive the Node fixture API, Expo web and the backup clock build.

- [ ] Lane 1. Regression lane against trunk. Run `verify drive welcome challenge progress account data` at trunk and at head. Save `drive-summary.json`. Pass when the same drives pass on both.
- [ ] Lane 2. Run `npm run test:journey -- e2e/local-sync.spec.ts`. Save `local-sync.txt`. Pass when the journey passes.
- [ ] Lane 3. Run `npm run test:journey -- e2e/account-deletion.spec.ts`. Save `account-deletion.txt`. Pass when the journey passes.
- [ ] Lane 4. Run `npm run test:journey -- e2e/identity-catalog.spec.ts`. Save `identity-catalog.txt`. Pass when the journey passes.
- [ ] Lane 5. Request `/ready` on the Node fixture API. Save `node-ready.json`. Pass when it returns 200.
- [ ] Lane 6. Run `npx wrangler deploy --dry-run --config scripts/backups/clock/wrangler.json`. Save `clock-dry-run.txt`. Pass when the clock still builds with the moved dependency and nothing deploys.
- [ ] Lane 7. Run `npm run test:backup:recovery`. Save `recovery.txt`. Pass when the rehearsal passes through the Node app.
- [ ] Lane 8. Run `npm run` to list the root scripts. Save `staging-lane.txt`. Pass when `release:staging:local` is absent.
- [ ] Lane 9. Search the code for imports of every deleted module. Save `removed-imports.txt`. Pass when nothing imports a deleted module.
- [ ] Lane 10. Read `AGENTS.md` and `SERVER_RELEASES.md` at head. Save `docs-audit.txt`. Pass when neither tells an agent to deploy a Worker.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of the CI `checks` job.
- [ ] Probe. Read the job durations of the latest trunk run and the head run with `gh run view`.
- [ ] Baseline. Record trunk first.
- [ ] Rule. Head fails if its `checks` job takes more than 10 percent longer than trunk's.

**Review gate.** None. P15-5 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA, after `/pstack:interrogate`, because the PR touches `scripts/release/` and identity docs.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] Anthony merges. The owner stops at merge-ready.

## Add the Edge Functions entry and its CI smoke (P15-6)

**Depends on.** P15-2 with `Decision: go`, and P15-5 merged.

**Files.**

- [ ] Create `apps/api/src/edge.ts` and `apps/api/tests/http/edge.test.ts`.
- [ ] Create `supabase/config.toml`, `supabase/functions/api/index.ts` and `supabase/functions/api/deno.json`.
- [ ] Create `apps/api/scripts/edge-build.mjs` and `apps/api/scripts/edge-smoke.ts`.
- [ ] Edit `apps/api/package.json`, the root `package.json`, `.github/workflows/ci.yml` and `scripts/quality/ci-workflow.test.mjs`.
- [ ] Edit `apps/api/src/db/client.ts`, `apps/api/src/identity/managed-verifier.ts`, `apps/api/src/progress/service.ts` and `apps/api/src/http/server-error-reporter.ts` only where P15-1 or P15-2 recorded a failure.
- [ ] Edit `docs/architecture/IDENTITY.md`.

**Build.**

- [ ] `edge.ts` exports `createEdgeHandler` with injected configuration, database and app, the shape of the deleted `createWorker` in `git show ce611dd:apps/api/src/worker.ts`.
- [ ] The handler strips the `/api` function prefix once, then calls `app.fetch`.
- [ ] The handler maps `JUSTGO_AUTH_PUBLISHABLE_KEY` and `JUSTGO_AUTH_SECRET_KEY` into the existing config fields. It never reads `SUPABASE_DB_URL`.
- [ ] The handler builds the app and a one-connection pool once per worker, and passes `clientAddress` from the header that P15-2 recorded.
- [ ] A startup failure returns the same safe body and `x-justgo-startup-stage` header as `worker.ts:102-126` at `ce611dd`.
- [ ] Server error reports flush through `EdgeRuntime.waitUntil`.
- [ ] `supabase/config.toml` sets `verify_jwt = false` for `api`.
- [ ] `edge-build.mjs` bundles `edge.ts` with esbuild, writes the bundle's SHA-256, and fails above 5 MB. Port the input and output checks of `validateWorkerBundle` (`scripts/release/staging-worker-build.mjs:15-74` at `ce611dd`), which reject untracked, ignored, non-production and secret-like inputs and unexpected output files.
- [ ] `npm run test:edge` runs the smoke route sequence against the bundle in the pinned Edge runtime image and `justgo_test`. CI runs it where the Workers step was.

**You see.**

- [ ] The CI log of `npm run test:edge` lists each route with its status and ends with `edge smoke passed`.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `apps/api/tests/http/edge.test.ts` covers the prefix strip, the secret mapping, the client address, a forged `x-forwarded-for` and the safe startup failure. Run `npm run test -w @justgo/api -- tests/http/edge.test.ts`.
- [ ] Run `npm run typecheck -w @justgo/api`, `npm run lint`, `npm run test:architecture` and `npm run test:db`.

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
- [ ] Rule. Head fails if the worst-case sync exceeds 1,000 ms of CPU or 5,000 ms of wall time, if a small route's p95 CPU exceeds twice trunk's, or if the bundle exceeds 5 MB.

**Review gate.** None. P15-6 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA, after `/pstack:interrogate`, because the entry changes how sign-in and owner context run.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] Anthony merges. The owner stops at merge-ready.

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

- [ ] `http-protocol.test.ts` covers an empty prefix, `/functions/v1/api`, a trailing slash, `..` traversal, another origin, a query string that contains `/v1/`, and cancellation. Run `npm run test -w @justgo/mobile -- --runTestsByPath src/lib/network/http-protocol.test.ts`.
- [ ] Run `npm run typecheck -w @justgo/mobile` and `npm run lint`.

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
- [ ] Lane 10. Run `npm run export:web -w @justgo/mobile`, then `npm run test:exported-web`. Save `exported-web.txt`. Pass when the smoke passes.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of the `account data` drive.
- [ ] Probe. Run it three times at trunk and three times at head, alternating.
- [ ] Baseline. Record trunk first.
- [ ] Rule. Head fails if its median exceeds trunk's by more than 10 percent.

**Review gate.** None. P15-7 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA, after `/pstack:interrogate`, because the fixture prefix touches `apps/api/scripts/`.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] Anthony merges. The owner stops at merge-ready.

## Release staging through Supabase Edge Functions (P15-8)

**Depends on.** P15-6 merged.

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
- [ ] Run `node --test scripts/quality/ci-workflow.test.mjs scripts/quality/staging-api-workflow.test.mjs` and `npm run test:architecture`, because the workflow changed.

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
- [ ] Baseline. Trunk has no lane. Record that, and record the Worker lane's last duration from the handoff as context only.
- [ ] Rule. Head fails if a run takes more than 15 minutes or any swap probe fails.

**Review gate.** None. P15-8 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA, after `/pstack:interrogate`, because the PR touches `scripts/release/` and a staging workflow.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] Anthony merges. The owner stops at merge-ready.

## Record hosted staging acceptance (P15-9)

**Depends on.** P15-7 and P15-8 merged, and Anthony's go for each hosted step.

**Files.**

- [ ] Create the planned `docs/handoffs/phase-15-supabase-api.md` with the acceptance receipts.
- [ ] Edit `docs/implementation-plan/README.md` to point Phase 15 at the new handoff.

**Build.**

- [ ] Release `main` to the `api` function through the P15-8 lane.
- [ ] Anthony runs the Dev build with `--supabase` on the iPhone for the phone lanes.
- [ ] Retarget gate issues #79, #81, #84 and #99 to the function. Narrow #103 and #118. File one `gate` issue for each hosted check that cannot run yet.

**You see.**

- [ ] The handoff lists each lane's receipt, the serving source SHA and the function version.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Run `node --test scripts/quality/doc-links.test.mjs` and check formatting of the changed files.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. Lanes 1, 2, 9 and 10 run from the Mac. Lanes 3 to 8 run on the iPhone with genuine disposable accounts, and Anthony drives them.

- [ ] Lane 1. Regression lane against trunk. Run the public probes against the serving Worker and the function. Save `public-probes.json`. Pass when both pass and the function names main's SHA.
- [ ] Lane 2. Request `/health`, `/ready`, the guest catalog and `/openapi.json` on the function. Save `public-routes.json`. Pass when all return 200 with release identity headers.
- [ ] Lane 3. Import the prepared worst-case archive on the iPhone. Save `worst-import.png`. Pass when every sync batch finishes with no timeout and meets the perf rule.
- [ ] Lane 4. Sign in with Apple as a guest with writing, sign out, then return to the same account. Save `apple-signin.png`. Pass when the account shows only its own writing.
- [ ] Lane 5. Sign in with Google, then switch accounts. Save `google-switch.png`. Pass when the second account never shows the first account's writing.
- [ ] Lane 6. Save writing on the iPhone and load it in Expo web against the function. Save `two-device.png`. Pass when both show the same entries.
- [ ] Lane 7. Write offline on the iPhone, then reconnect. Save `offline-reconnect.png`. Pass when the queued writes sync.
- [ ] Lane 8. Delete the account, then retry the receipt after Auth erasure. Save `delete-account.png`. Pass when the retry returns the same receipt and iCloud cleanup leaves nothing.
- [ ] Lane 9. Read the function logs for the lane 3 to 8 window. Save `logs-review.json`. Pass when no token, body or reflection text appears.
- [ ] Lane 10. Read the next nightly backup and hourly ledger runs. Save `backup-runs.json`. Pass when both succeed after the release.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall ms per sync batch, CPU ms where the dashboard reports it, the cold first request after idle, and invocations per day.
- [ ] Probe. Read execution times from the function logs for lanes 3 to 8, and time the first request after 15 minutes idle.
- [ ] Baseline. Trunk lacks the function. Record the Worker's figures from the handoff as context only.
- [ ] Rule. Acceptance fails if any sync batch exceeds 8,000 ms of wall time or 1,000 ms of CPU, or the first request after idle exceeds 2,000 ms.

**Review gate.** None. P15-9 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries` or `docs-tests-only`.
- [ ] The owner squash-merges its own docs PR on green CI.

## Update the notices for Supabase Edge Functions (P15-10)

**Depends on.** P15-9 merged.

**Files.**

- [ ] Edit `docs/legal/PRIVACY_POLICY_DRAFT.md`, `docs/legal/DATA_INVENTORY.md` and `docs/legal/RELEASE_DISCLOSURES.md`.
- [ ] Create the planned `docs/legal/SUPABASE_NOTICE_REVIEW.md` from the provider-neutral parts of `docs/legal/CLOUDFLARE_NOTICE_REVIEW.md`.
- [ ] Edit `docs/legal/APPROVALS.md` only after Anthony approves the text.

**Build.**

- [ ] Name Supabase as the API host, with the function region and the log retention that P15-2 and P15-9 recorded.
- [ ] Keep Cloudflare R2 for encrypted backups, and keep Vercel for the legal pages until Anthony moves them.
- [ ] Restate the provider review in issue #95 for journal traffic through Edge Functions.

**You see.**

- [ ] `npm run build:legal` builds the candidate pages with the new wording.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Run `node --test sites/legal/build.test.mjs scripts/quality/doc-links.test.mjs`.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. These lanes read the locally built legal pages in the built-in browser pane.

- [ ] Lane 1. Regression lane against trunk. Build the legal pages at trunk and at head. Save `legal-diff.txt`. Pass when only the provider sections and date metadata differ.
- [ ] Lane 2. Open the Privacy page at 390x844. Save `privacy-mobile.png`. Pass when the Supabase section reads fully with no horizontal scroll.
- [ ] Lane 3. Open the Privacy page at 200 percent text zoom. Save `privacy-zoom.png`. Pass when no text is clipped.
- [ ] Lane 4. Move through the Privacy page with the keyboard. Save `privacy-keyboard.png`. Pass when every link is reachable and focus is visible.
- [ ] Lane 5. Open the Terms page. Save `terms.png`. Pass when it is unchanged apart from date metadata.
- [ ] Lane 6. Run `npm run build:legal -- --production` without approval metadata. Save `production-refusal.txt`. Pass when the build refuses.
- [ ] Lane 7. Open the legal links from Expo web. Save `in-app-legal.png`. Pass when each link opens the built page.
- [ ] Lane 8. Search the built pages for Workers and Hyperdrive. Save `stale-terms.txt`. Pass when neither word appears.
- [ ] Lane 9. Search the built pages for R2. Save `r2-wording.txt`. Pass when the approved R2 backup wording remains.
- [ ] Lane 10. Compare the processors in the policy with `docs/legal/DATA_INVENTORY.md`. Save `inventory.txt`. Pass when every processor appears in both.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Wall time of `npm run build:legal`.
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
- [ ] Anthony merges and approves publication separately.

## Switch builds to the function and retire the old hosts (P15-11)

**Depends on.** P15-10 merged, and Anthony's go for each provider action.

**Files.**

- [ ] Edit `apps/mobile/eas.json`, `scripts/release/check-beta.mjs`, `scripts/release/check-beta.test.mjs`, `.github/workflows/testflight-beta.yml` and `scripts/quality/testflight-workflow.test.mjs`.
- [ ] Edit `.github/workflows/staging-health.yml` and `scripts/quality/staging-health-workflow.test.mjs`.
- [ ] Edit `scripts/development/configuration.mjs` to make `--supabase` the Dev default and delete the Vercel and Cloudflare targets.
- [ ] Edit `docs/operations/TESTFLIGHT_BETA.md`, `docs/operations/DEVELOPMENT_BUILDS.md` and `docs/architecture/APP_SHELL.md`.
- [ ] Before deleting, move the facts that outlive Phase 15 into the docs that keep them. The backup copy, rotation and scope receipts go to `docs/operations/CLOUDFLARE_BACKUPS.md`. The November 1 Cloudflare account and DPA acceptance, from the notice review's accepted account and service assessment, goes to the "Provider agreements" section of `docs/legal/DATA_INVENTORY.md`, and `CLOUDFLARE_BACKUPS.md` links to it there.
- [ ] Delete `docs/operations/CLOUDFLARE_CUTOVER.md`, `docs/implementation-plan/phase-15-cloudflare-api.md`, `docs/handoffs/phase-15-cloudflare-api.md` and `docs/legal/CLOUDFLARE_NOTICE_REVIEW.md`. Git history keeps them.
- [ ] Update the links to them in `docs/implementation-plan/README.md`, `docs/operations/SERVER_RELEASES.md`, `docs/operations/CLOUDFLARE_BACKUPS.md`, `docs/operations/TESTFLIGHT_BETA.md`, `docs/legal/APPROVALS.md`, `docs/legal/DATA_INVENTORY.md`, `docs/legal/RELEASE_DISCLOSURES.md` and `sites/legal/README.md`.

**Build.**

- [ ] Point the Dev and beta profiles at `https://kmcpcauaxlgpevkkenwd.supabase.co/functions/v1/api`.
- [ ] Let `check-beta.mjs` accept that base path in place of its `pathname === '/'` rule.
- [ ] Point `staging-health.yml` at the function's `/ready`. Anthony points the Sentry uptime monitor there too.
- [ ] Anthony ships a TestFlight build from the beta profile and retires build 5.
- [ ] After the new build passes, Anthony deletes the `justgo-api-staging` Worker and its Hyperdrive configuration, and turns off the Vercel API project.
- [ ] Keep the backup clock Worker, R2 and the Cloudflare account.

**You see.**

- [ ] The installed TestFlight build's requests reach `/functions/v1/api/v1/`, and the Worker URL returns no JustGO response.

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] `check-beta.test.mjs` accepts the function URL and rejects the Worker URL, another project and any other path. Run `node --test scripts/release/check-beta.test.mjs`.
- [ ] Run `npm run test:architecture` and the full `npm run check`, because the Expo configuration changed.

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked. Ten lanes on `opus high` at the PR head, per the boot recipe. Lanes 1 to 3 run locally. Lanes 4 to 10 run on the iPhone or against hosted services after Anthony's go.

- [ ] Lane 1. Regression lane against trunk. Run `node scripts/release/check-beta.mjs` on the trunk and head configurations. Save `check-beta.txt`. Pass when trunk accepts the Worker URL and head accepts only the function URL.
- [ ] Lane 2. Run `npm run export:ios -w @justgo/mobile` and search the bundle for API URLs. Save `bundle-url.txt`. Pass when only the function URL appears.
- [ ] Lane 3. Run the `staging-health.yml` check logic locally against the function. Save `health-check.json`. Pass when it reports ready.
- [ ] Lane 4. Sign in with Apple on the new TestFlight build. Save `tf-apple.png`. Pass when the journal loads.
- [ ] Lane 5. Save writing on the new build and load it on a second device. Save `tf-sync.png`. Pass when both show the entry.
- [ ] Lane 6. Delete the account on the new build. Save `tf-delete.png`. Pass when the deletion receipt completes.
- [ ] Lane 7. Open the Sentry uptime monitor. Save `uptime.png`. Pass when it targets the function and its latest check passed.
- [ ] Lane 8. After the Worker deletion, request the Worker's `/ready`. Save `worker-gone.txt`. Pass when no JustGO response returns.
- [ ] Lane 9. After the Vercel API retirement, request `https://justgo-two.vercel.app/ready` and the legal pages. Save `vercel-gone.txt`. Pass when no JustGO API response returns and the legal pages still load.
- [ ] Lane 10. Read the next nightly backup and hourly ledger runs. Save `backups-after.json`. Pass when both succeed from the backup clock.

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are all checked.

- [ ] Metric. Time on the iPhone from app launch to the first successful journal sync.
- [ ] Probe. Launch build 5 and the new build five times each, alternating, before build 5 retires.
- [ ] Baseline. Record build 5 first.
- [ ] Rule. The new build fails if its median exceeds build 5's by more than 1,000 ms.

**Review gate.** None. P15-11 is not review-gated.

**Merge.**

- [ ] Clean verdict at the exact head SHA, after `/pstack:interrogate`, because the PR touches release scripts and workflows.
- [ ] Review comments triaged.
- [ ] Rebased onto current trunk after the verdict, with `verdict-patch.mjs check` reporting `carries`.
- [ ] Anthony merges. The owner stops at merge-ready.

## Close the program

- [ ] Every box above is checked with its evidence.
- [ ] `IDENTITY.md`, `SERVER_RELEASES.md`, the root `README.md` and the implementation plan index describe the implemented state.
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

## Appendix C. Risks

| Risk                                                                          | PR            | What the owner watches                                                                        |
| ----------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `pg` cannot verify the Supabase CA on Deno                                    | P15-1, P15-2  | P15-2 lane 1. The fallback is `drizzle-orm/postgres-js`.                                      |
| Bundled code has no `Buffer`, so every managed request returns `UNAUTHORIZED` | P15-1         | Lane 8. Import `node:buffer` or use web base64url helpers.                                    |
| The pooler rejects the `statement_timeout` connection setting                 | P15-2         | P15-2 lane 3. Drop the pool option, because the role sets the timeout.                        |
| The worst-case sync outlasts the 10 second client deadline                    | P15-1, P15-9  | P15-1 at loopback, a P15-2 prediction, and P15-9 hosted. Batch the parent checks if it fails. |
| A forged header defeats identity rate limits                                  | P15-2, P15-6  | P15-2 lane 4 and P15-6 lane 9.                                                                |
| Platform logs keep tokens or private text                                     | P15-2, P15-9  | P15-2 lane 5 stops the program until Anthony decides.                                         |
| A deploy or a secret change replaces serving code at once, with no rollback   | P15-8         | Candidate first, readback, and rollback by redeploying the previous tag.                      |
| The backup clock token stops passing its expiry check on November 29          | Arm, P15-4    | Backups are paused. Renew the token with the R2 credentials when they resume.                 |
| Retiring Workers stops the backups                                            | P15-5, P15-11 | The file boundary. The backup clock, R2 and the Cloudflare account stay.                      |
| A Git-connected Vercel project deploys on merge                               | P15-3         | Anthony confirms Git deployments are off before merge.                                        |
| The Free project pauses after a week without activity                         | P15-9         | Record the pause behavior and what the app shows.                                             |
| Installed builds keep their embedded API URL                                  | P15-11        | Build 5 keeps Vercel until the new build passes.                                              |
| Edge runtime lanes cannot run on the 8 GB Mac                                 | P15-1, P15-6  | They run in CI. One heavy local check at a time.                                              |

## Appendix D. Links and reading list

- Read Appendix A before any PR. The [analysis on #171](https://github.com/anthonyyoo24/justgo/pull/171#issuecomment-6695056934) holds the citations behind this plan.
- Before you edit, read [IDENTITY.md](../architecture/IDENTITY.md), [ACTIVITY_DATA.md](../architecture/ACTIVITY_DATA.md) and [APP_SHELL.md](../architecture/APP_SHELL.md). They own the invariants this plan must keep.
- Read [SERVER_RELEASES.md](../operations/SERVER_RELEASES.md) and [CLOUDFLARE_BACKUPS.md](../operations/CLOUDFLARE_BACKUPS.md) before P15-4, P15-5 and P15-8.
- History only, deleted in P15-11. The [Cloudflare plan](phase-15-cloudflare-api.md), the [Cloudflare handoff](../handoffs/phase-15-cloudflare-api.md), the [cutover checklist](../operations/CLOUDFLARE_CUTOVER.md) and the [Cloudflare notice review](../legal/CLOUDFLARE_NOTICE_REVIEW.md).
- Run pstack's `how` skill before P15-6 and P15-8, and `interrogate` on every PR that touches an Agent-effort path.
- Keep a decision trail per PR at `.local/decision-trails/phase-15-<pr-id>.tsv`, per pstack's `show-me-your-work` skill and the Stop hook in `.claude/hooks/require-trail-review.mjs`.
- Recheck these Supabase references before P15-1. Agents read them on November 6, 2026. [Functions](https://supabase.com/docs/guides/functions), [routing](https://supabase.com/docs/guides/functions/routing), [gateway authentication](https://supabase.com/docs/guides/functions/auth-headers), [Postgres from functions](https://supabase.com/docs/guides/functions/connect-to-postgres), [secrets](https://supabase.com/docs/guides/functions/secrets), [limits](https://supabase.com/docs/guides/functions/limits), [deploy](https://supabase.com/docs/guides/functions/deploy), [regional invocation](https://supabase.com/docs/guides/functions/regional-invocation), [logging](https://supabase.com/docs/guides/functions/logging), [function pricing](https://supabase.com/docs/guides/functions/pricing), [project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum) and [data residency](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq).
