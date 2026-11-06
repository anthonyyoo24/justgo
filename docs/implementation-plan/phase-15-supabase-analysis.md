# Why Phase 15 moves the API to one Supabase Edge Function

This note records the analysis behind the
[Phase 15 Supabase plan](phase-15-supabase-api.md). It is a dated record, not a
live status page. Agents read the repository at `main` commit `ce611dd` and the
Supabase documentation on November 6, 2026. Every `path:line` citation points at
that commit. Each claim says whether it was read in a file, measured with a
command, or inferred. Nothing here called a hosted service.

Anthony paused the Cloudflare rollout on November 2 and has since confirmed
Supabase Edge Functions as the API host. The Cloudflare Workers rollout is
retired. The plan owns the work. This note owns the reasons.

## The short version

- No production API exists. Two staging APIs share the one Supabase project. A
  Vercel deployment still serves the old Fastify build to TestFlight build 5,
  and a Cloudflare Worker serves Hono to the beta build profile.
- Keep Hono. The port replaces one entry file. The routes, contracts, domain
  services, `pg` and Drizzle stay.
- The Hyperdrive work already made the managed request paths safe for a
  transaction pooler. The direct lock connection that existed only for
  Hyperdrive can go.
- The open questions are runtime facts that only a trial can settle. The main
  ones are `pg` over Deno's TLS, the `Buffer` global, the gateway's JWT check and
  client address, what the platform logs, and the wall time of the largest sync.
- Retiring the API Worker must not retire the separate backup clock Worker or
  the R2 backups.

## What the code is today compared with each plan

### The Cloudflare work is on main

PR #73 squash-merged the whole rollout branch as `50194ee` on November 4
(measured with `git log`). The handoff still calls it local
(`docs/handoffs/phase-15-cloudflare-api.md:9-11`). The table sorts what landed
by what happens to it on Supabase.

| Code on main                                                                                                                                                                                    | Treatment on Supabase                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hono app, routes, middleware, contracts and domain services (`apps/api/src/build-app.ts`, `apps/api/src/http/app.ts`)                                                                           | Keep, apart from the Vercel code that the Shared composition row names.                                                                                                                                                     |
| Node entry and listener (`apps/api/src/server.ts`, `apps/api/src/http/node-server.ts`)                                                                                                          | Keep for tests, local development and the fixture API.                                                                                                                                                                      |
| Shared composition (`apps/api/src/runtime-app.ts:17-98`)                                                                                                                                        | Keep. Drop `onVercel` (`runtime-app.ts:24`, `:42`) and the `VERCEL` legal-draft gates (`runtime-app.ts:47`, `build-app.ts:89`).                                                                                             |
| Workers entry (`apps/api/src/worker.ts`)                                                                                                                                                        | Delete. Copy its safe startup failure (`worker.ts:102-126`) and injected dependencies (`worker.ts:30-36`) into the new entry.                                                                                               |
| Hyperdrive adapter, `LOCK_DATABASE_URL` and `needsDirectTransaction` (`apps/api/src/db/worker-database.ts`)                                                                                     | Delete. Hyperdrive only.                                                                                                                                                                                                    |
| `WorkerRouter` (`apps/api/src/http/worker-router.ts:17-39`)                                                                                                                                     | Delete if the trial confirms one app per worker. It saved the per-request route compile that `worker.ts:67-70` paid.                                                                                                        |
| Wrangler configuration (`apps/api/cloudflare-config.mjs`)                                                                                                                                       | Delete. Keep its reason for turning off platform logs, because invocation logs include URLs (`cloudflare-config.mjs:26-27`).                                                                                                |
| Workers smoke and profiler (`apps/api/scripts/workers-smoke.ts`, `workers-cpu-profile.ts`), `test:workers` (`apps/api/package.json:19-20`) and its CI step (`.github/workflows/ci.yml:128-129`) | Port the route sequence and database readback (`workers-smoke.ts:248-340`) to an Edge Functions smoke. Delete the rest.                                                                                                     |
| Release lane (`scripts/release/staging-cloudflare.mjs`, `staging-worker-build.mjs`, and `staging-api-deployment.mjs:47-271`)                                                                    | Replace the Worker upload and promotion. Keep the database guard (`apps/api/scripts/staging-release-guard.ts`), probe validation (`scripts/release/staging-api.mjs:397-444`) and release identity headers (`app.ts:92-93`). |
| Bundle audit and contracts alias (`scripts/release/staging-worker-build.mjs:15-74`, `:132-138`)                                                                                                 | Keep for the Edge Functions bundle.                                                                                                                                                                                         |
| Backups through GitHub Actions, `pg_dump`, `age` and R2 (`scripts/backups/`)                                                                                                                    | Keep. Only the R2 endpoint, policy fields and credential minting are Cloudflare-specific (`scripts/backups/configuration.mjs:20-23`, `:79-81`).                                                                             |
| Backup clock Cron Worker (`scripts/backups/clock/wrangler.json:1-14`)                                                                                                                           | Keep. It is not part of the API.                                                                                                                                                                                            |

### Vercel leftovers are still on main

- `apps/api/vercel.json:3` says `"framework": "fastify"`. The file has not
  changed since `fe0fa01` on September 17 (measured).
- `onVercel` reads `x-vercel-forwarded-for` for rate limits
  (`apps/api/src/identity/address.ts:3-10`, set at `apps/api/src/server.ts:11`).
- `scripts/release/vercel-cli` is unused. Only `.github/dependabot.yml:11` still
  updates it (read).
- `.vercelignore` is still checked by `scripts/quality/contract-upload.test.mjs:18`
  (read).

### What the Supabase plan assumed that the code contradicts

- The plan asks to reconcile "the current phase branch"
  (`phase-15-supabase-api.md:45-51`). That branch merged as #73. Only the four
  recovery commits on `codex/phase15-real-recovery` remain unmerged (measured).
- The plan asks the trial to prove locks through a direct or pooler connection (`:88-93`). Managed requests
  take none. Only legacy bootstrap and transfers call `pg_advisory_xact_lock`
  (`apps/api/src/identity/service.ts:322`, `:549`, `:627`), and managed mode
  rejects those requests (`apps/api/src/identity/routes.ts:72-79`). The managed
  path holds a `FOR UPDATE` owner lock (`apps/api/src/identity/managed-service.ts:55`)
  and a transaction-local owner setting (`apps/api/src/db/client.ts:51`).
- The plan maps only `SUPABASE_AUTH_SECRET_KEY` around the reserved `SUPABASE_`
  prefix (`:83-86`). `SUPABASE_PUBLISHABLE_KEY` is reserved too
  (`apps/api/src/config.ts:36-37`).
- The plan keeps "retained R2 and static roles" on Cloudflare (`:216-217`). No
  legal page was ever published on Cloudflare. The legal pages are on Vercel
  (`docs/legal/APPROVALS.md:8`). The plan's "retire Workers" would also stop the
  backup clock Worker.
- The plan keeps the last Cloudflare artifact for recovery (`:200-201`). The
  API Worker is a retired target. The Node entry is the fallback.
- The plan does not flag `Buffer`. The managed verifier decodes every token with
  it (`apps/api/src/identity/managed-verifier.ts:69`), and progress cursors use it
  (`apps/api/src/progress/service.ts:26`, `:152`). If Deno does not expose the
  global to bundled code, the verifier's `catch` turns every signed-in request
  into `UNAUTHORIZED` (`managed-verifier.ts:87-89`). That outcome is inferred.
- `docs/architecture/TECH_STACK.md:64-66` says identity transactions with
  advisory locks use a separate direct connection. The code sends only loopback
  legacy requests there (`worker-database.ts:159-166`, `worker.ts:79-81`).
  `docs/architecture/IDENTITY.md:82-91` is correct.

## What production runs today

The brief assumed production runs the old Fastify build. The repository shows
something narrower.

- **No production API exists.** Production is not provisioned
  (`docs/operations/SERVER_RELEASES.md:55-59`). The `production` build profile
  sets no API URL (`apps/mobile/eas.json:61-65`).
- **Vercel serves staging on Fastify.** Vercel's production slot at
  `justgo-two.vercel.app` serves application staging. Its last recorded deploy is
  source `311f073` from October 27, which is Fastify 5.12.7 (measured with
  `git show 311f073:apps/api/package.json`). TestFlight build 5 and the Dev profile
  call it (`apps/mobile/eas.json:17`, `docs/operations/TESTFLIGHT_BETA.md:24-26`).
- **Main dropped Fastify on October 28.** Commit `b3ff19b` replaced Fastify with
  Hono, and PR #61 merged it as `52a991b` on October 29 (measured). Nothing on main
  deploys to Vercel. The staging workflow uses only Cloudflare credentials, and
  `scripts/quality/staging-api-workflow.test.mjs:46` fails if it mentions
  `VERCEL_` or `vercel-cli`.
- **The Worker serves staging on Hono.** Its last recorded release is source
  `a082087` from November 2 (`docs/handoffs/phase-15-cloudflare-api.md:5-23`).
  That commit is not on main, and its API source differs from `50194ee` in three
  files (measured). The beta build profile, the beta preflight and the TestFlight
  workflow accept only the Worker URL (`apps/mobile/eas.json:48`,
  `scripts/release/check-beta.mjs:17`).
- **Main's API has no recorded release** on any host (inferred from the handoff
  and the diff above).

### What this means for the cutover

Build 5 and the Dev build would change framework and host at once if they were
pointed at Supabase. The beta profile would change host only. Hono has already
passed genuine Apple and Google sign-in on the Worker
(`docs/handoffs/phase-15-cloudflare-api.md:5-12`). Anthony confirmed that the app
has no outside users (`docs/operations/CLOUDFLARE_CUTOVER.md:14-15`), so the risk is
to Anthony's own test data and to telling a framework fault from a host fault.

The plan lowers that risk in five ways.

1. Build 5 is never redirected. A new build replaces it after the hosted
   candidate passes, and Vercel keeps serving until then.
2. The two changes get separate evidence. CI and the saved journeys already run
   Hono on Node. The trials run the same requests on the Edge runtime, so a
   difference points at the runtime, not the framework.
3. Main is released to staging under a candidate function name first, so the
   serving function changes only after the candidate passes its probes.
4. Staging acceptance runs on main, not on `a082087`.
5. Production stays out of Phase 15 unless Anthony asks for it. Once staging
   passes, production uses the same release lane in a separately approved step.

Deploying Hono to Vercel first was rejected. Vercel's DPA prohibits sensitive data,
which is why the API left it (`docs/implementation-plan/phase-15-cloudflare-api.md:19-21`).

## Keep Hono

The framework choice is settled by what the code already is and by what
Supabase documents.

| Option                        | Fit for this API                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Hono (keep)                   | Already the app. Uses web `Request` and `Response`. Supabase's routing guide and Hono's own Supabase guide run it with `Deno.serve(app.fetch)`. |
| Fastify                       | Built on Node's HTTP server. It would need an adapter on `Deno.serve` and a second port of every route. Main removed it.                        |
| Express                       | Same Node HTTP dependency as Fastify.                                                                                                           |
| Oak                           | Deno-native, but a rewrite of every route and middleware.                                                                                       |
| `@supabase/server` middleware | Public beta, and it expects Supabase Auth JWTs or API keys. JustGO uses its own device sessions (`apps/api/src/http/bearer.ts`).                |

The dependencies tell the same story.

- **`pg` and Drizzle.** Supabase's Postgres guide shows supabase-js, Deno Postgres
  and Drizzle with Postgres.js, not `pg`. Deno's `node:tls` honors a custom `ca`
  (denoland/deno#20362, closed June 3, 2026), so `npm:pg` with the existing
  `ssl: { rejectUnauthorized: true, ca }` should verify the Supabase CA. That is
  inferred. If it fails, the fallback is `drizzle-orm/postgres-js`. The fallback
  changes the `NodePgDatabase` types that `withOwner` uses
  (`apps/api/src/db/client.ts:41-54`), so it is contained but not free.
- **Sentry.** The API has no Sentry SDK. Its envelope sender uses `fetch`
  (`apps/api/src/http/server-error-reporter.ts`), and only `Buffer.byteLength` at
  `:123` needs a check. Supabase's Sentry example warns that `@sentry/deno` shares
  scope across concurrent requests, so keep the current sender.
- **Contracts.** API and contracts files import `.ts` files through `.js`
  specifiers, which Deno does not resolve by default. Bundle the API with esbuild,
  a root devDependency, and reuse the Workers build's contracts alias.

## Risks and gaps in the Supabase plan

### Transactions through the pooler

Supabase recommends the transaction pooler on port 6543 for Edge Functions. The
direct connection is IPv6 only without a paid add-on. Transaction mode loses
session state between transactions (Supabase "Connecting to Postgres" guide).
JustGO keeps all of its state inside transactions, so the managed paths should be
safe. That is inferred, and the trial must show it.

- Every `set_config` passes `true` and is transaction-local
  (`apps/api/src/db/client.ts:51`, `apps/api/src/identity/service.ts:66`,
  `apps/api/src/identity/managed-service.ts:25`, `apps/api/src/access/guest.ts:32`).
- `pg_advisory_xact_lock` and `FOR UPDATE` release at commit.
- `pg` sends unnamed prepared statements unless a query has a `name`, and no
  query in `apps/api/src` has one (read).
- `poolOptions` sends `statement_timeout` as a connection setting
  (`apps/api/src/db/client.ts:26`). Supabase's timeouts guide says that does not
  work on port 6543. The role already sets a 5-second timeout
  (`apps/api/scripts/provision.sql:12`), and Vercel used port 6543 with the same
  pool (`apps/api/.env.example:1`). So the pooler accepted or ignored the setting.
  The trial must show which. If the pooler rejects it, drop the pool option.
- `SUPABASE_DB_URL` is the platform's own connection, not `justgo_runtime`. The
  function needs its own `DATABASE_URL` with the pooler user
  `justgo_runtime.<project-ref>`. Readiness already fails on any other role
  (`apps/api/src/db/client.ts:61-69`).
- One worker can serve several requests, so the pool can live at module scope
  with one connection. How long idle sockets survive is not documented.

### CPU, memory and wall time

Supabase allows 2 seconds of CPU and 256 MB of memory per request, and I/O wait
does not count against CPU. The Worker's dashboards measured CPU from p50
15.14 ms to p999 58.49 ms, aggregates that include public checks
(`docs/handoffs/phase-15-cloudflare-api.md:126-128`, `:217-219`). Nobody has measured sync,
import or export on any host.

The bigger risk is wall time, not CPU. A worst-case journal sync is about 2,800
sequential queries in one transaction while it holds the owner row lock. That is
50 versions with up to 50 parents each (`apps/api/src/data-sync/journal.ts:84-149`,
bounds at `packages/contracts/src/data-sync.ts:110-127`). The figure is inferred.
The mobile client gives up after 10 seconds (`apps/mobile/src/lib/network/http.ts:116-122`).
Hyperdrive measured an 18.48 ms mean query latency
(`docs/handoffs/phase-15-cloudflare-api.md:197-201`), which would put that batch
near 50 seconds. Supabase runs a
function in the region nearest the caller unless the request pins one. Memory is
not a concern. Export pages by 50 (`apps/api/src/account-export/service.ts:37-41`),
and a 4 MiB body parses to tens of megabytes (inferred).

### Secrets and configuration

- Custom secrets cannot start with `SUPABASE_`, and `config.ts:35-37` reads three
  such names. `SUPABASE_URL` is injected for the same project. Map the other two
  from permitted names in the entry, and leave `readConfig` unchanged.
- A secret change takes effect without a deploy. Treat `supabase secrets set` as a
  deploy step that needs Anthony's go.
- `verify_jwt` is on by default. It would reject `/health`, `/ready`, guest routes
  and preflight requests before Hono runs, because JustGO's bearer is not a
  Supabase JWT. Set `verify_jwt = false` for the function and keep all
  authentication in Hono. Whether the gateway then needs an `apikey` header is
  unclear.

### Client address and rate limits

Under `Deno.serve`, `http/app.ts:81-83` falls back to `127.0.0.1` for every
caller. All managed sign-ins would then share one bucket of 120 per 10 minutes
(`apps/api/src/identity/managed-routes.ts:19-26`). The entry must pass a
`clientAddress`. Supabase documents no client-address header. Gateway logs record
`cf-connecting-ip` and `x-real-ip`, and a Supabase discussion reports that a
client-set `x-forwarded-for` passes through. The trial must send forged headers
and record what the function sees.

### Cold starts

Supabase recommends one function for related routes to cut cold starts. No
cold-start time or bundle size was ever measured for the Worker. The trial
measures both, and the bundle must stay under the 20 MB CLI limit.

### Platform logs and privacy

Supabase's logging guide says the Invocations view shows request and response
headers and bodies. Its log field reference lists no body field. The Worker turned
platform logs off for this reason (`apps/api/cloudflare-config.mjs:26-27`), and
Supabase documents no way to do that. The hosted trial must send a synthetic
canary request and read what the logs keep. Stored `Authorization` headers or
bodies would break the no-private-text rule, and Anthony would need to decide
before any real journal traffic.

### Backups, R2 and issue #77

- Backups run on GitHub Actions and write encrypted dumps to R2 over its S3 API.
  They do not use the API Worker or Hyperdrive (read, `scripts/backups/`).
- The backup clock Worker starts the nightly and hourly runs
  (`scripts/backups/clock/worker.mjs:42-75`). Since November 3 it has started a
  nightly copy at 04:43 UTC each day, while GitHub's own schedule ran hours late,
  and on November 5 GitHub's schedule ran only 3 of 24 hourly copies (measured
  with `gh run list`). Main's docs never record that it was
  switched on. Only the parked branch's review records it, and the review says its
  GitHub token stops passing the clock's expiry check at 23:40 UTC on November 29.
- Issue #77's deadlines have passed, yet all 115 backup runs since 12:53 UTC on
  November 2 succeeded (measured with `gh run list`). The credentials were renewed
  (inferred). The issue and `docs/operations/CLOUDFLARE_BACKUPS.md:250` and
  `:313-317` still show the old dates.
- The Cloudflare account stays for R2 and the backup clock. Supabase Free has no
  accessible backups (`docs/legal/DATA_INVENTORY.md:184`), and Supabase backups
  would drop the hourly encrypted deletion ledger that restore replays.

### Legal and privacy notices

- The Cloudflare notice candidate describes Cloudflare as the API server
  (`docs/legal/CLOUDFLARE_NOTICE_REVIEW.md:42-44`) and Hyperdrive with caching off
  (`:175-177`). Both clauses go. The R2 wording stays (`:44-46`, `:61-69`).
- The published policy names Vercel for the legal pages and the API
  (`docs/legal/PRIVACY_POLICY_DRAFT.md:73`, `:95`).
- The provider review for journal traffic
  ([#95](https://github.com/anthonyyoo24/justgo/issues/95)) must be restated for
  Supabase Edge Functions, including where functions run and what their logs keep.
- Edge Functions rewrite HTML responses to plain text without a custom domain, so
  the legal pages cannot move to a function. Where they live is a separate
  decision.

### Release and rollback

- A deploy replaces the serving code for new requests. Supabase documents no
  staged rollout, traffic split or rollback. Rollback means redeploying the
  previous tagged source.
- The release lane needs a candidate function name that is probed before the
  serving deploy, the serving source SHA from `/health` recorded as
  `previousApiSha`, a bundle hash, and Supabase CLI 3 syntax (`--remote`, `--yes`).
- The existing rules hold. No automatic rollback (`SERVER_RELEASES.md:246-248`),
  and no traffic rollback across a schema change (`SERVER_RELEASES.md:292-296`).
- Installed builds embed the API URL. A server rollback cannot reroute them.

### Open gates

Twelve open `gate` issues mention Cloudflare, Workers, Hyperdrive, Vercel or R2:
#77, #79, #81, #84, #99, #102, #103, #104, #105, #118, #123 and #124. None closes
because Workers retired. #79, #81, #84 and #99 hold evidence from the Worker and
need retargeting. #103 and #118 narrow. No gate tracks the Supabase workload
measurement yet.

### The parked recovery branch

`codex/phase15-real-recovery` holds four commits on top of the merged rollout
branch (measured). None depends on Workers.

- `b27ba34` adds restore hooks and keeps object owners.
- `0ccaaa4` adds a local Auth and API recovery acceptance check through the Node
  `buildRuntimeApp`.
- `a9f3a43` adds a review document. Its recovery procedure and clock evidence
  stay. Its Workers rows go.
- `5966a16` proves restored writing exists before account deletion through the
  real sync and delete routes.

The branch can land on its own now. It touches backup scripts, so Anthony merges it.

## Improvements over the earlier plan

- Run one function and strip the `/api` prefix in the entry before `app.fetch`.
  Hono's `basePath` would leave the prefix in `context.req.path`, which
  `http/app.ts:90` and the startup-failure handler compare against bare paths.
- Build the app once per worker and delete `WorkerRouter`.
- Delete the Hyperdrive direct-lock connection instead of porting it.
- Map secret names in the entry and leave `readConfig` alone.
- Keep the hand-rolled Sentry sender, and send its flush through
  `EdgeRuntime.waitUntil`.
- Support a base path in the mobile client instead of a proxy. Keep the access
  store keyed by origin, so `app-support/access/` does not change.
- Pin the function region to the database's region only if the trial shows the
  distance matters.
- If the worst-case sync misses its budget, batch the parent checks in
  `data-sync/journal.ts` into one query. That lowers wall time on every host.
- Remove the unused Vercel leftovers first. Remove the Workers code once the hosted
  trial says go, because it holds the only working staging deploy lane.
- Run the Edge runtime smoke in CI, where Docker exists. The owner's Mac has no
  Docker, Deno or Supabase CLI (measured with `command -v`).

## Sources

Agents read these Supabase pages on November 6, 2026.

- [Edge Functions](https://supabase.com/docs/guides/functions),
  [routing](https://supabase.com/docs/guides/functions/routing),
  [gateway authentication](https://supabase.com/docs/guides/functions/auth-headers),
  [Postgres from functions](https://supabase.com/docs/guides/functions/connect-to-postgres),
  [secrets](https://supabase.com/docs/guides/functions/secrets),
  [limits](https://supabase.com/docs/guides/functions/limits),
  [deploy](https://supabase.com/docs/guides/functions/deploy),
  [regional invocation](https://supabase.com/docs/guides/functions/regional-invocation),
  [logging](https://supabase.com/docs/guides/functions/logging) and
  [background tasks](https://supabase.com/docs/guides/functions/background-tasks).
- [Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres),
  [timeouts](https://supabase.com/docs/guides/database/postgres/timeouts) and the
  [Sentry example](https://supabase.com/docs/guides/functions/examples/sentry-monitoring).
- [Hono on Supabase Edge Functions](https://hono.dev/docs/getting-started/supabase-functions)
  and [denoland/deno#20362](https://github.com/denoland/deno/issues/20362).
- The Supabase CLI 3.0.0 release notes of November 2, 2026, read through `gh api`.
