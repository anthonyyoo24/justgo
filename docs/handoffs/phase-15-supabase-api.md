# Phase 15 handoff for the Supabase API

This handoff records the Phase 15 hosted window of November 12, 2026, in which P15-2 and P15-9 ran together under the [fast path](../implementation-plan/phase-15-supabase-api.md#fast-path). The [Supabase plan](../implementation-plan/phase-15-supabase-api.md) owns scope and order. Its Appendix A holds the evidence summary. This file holds the receipts. Times are UTC. The raw receipts stay in the coordinating checkout under `.local/p15-9/` and, for P15-2, in the `p15-trial` worktree under `.local/swarm/p15-2/`.

## Current status

The `api` Edge Function serves staging from `main` at `c8d6295c41d683c01c5a1ba98e873dfcdf68b7f1`. No build points at it yet. The API Worker still serves the beta profile, and the Vercel API still serves TestFlight build 5 and the Dev profile. P15-11 switches the builds.

P15-2 ended with `Decision: stop` because the perf rule's prediction failed. Anthony then chose to go ahead with Supabase, and P15-9 lane 3 measured the hosted sync directly. Every P15-9 lane that ran passed, except that the CPU half of the perf rule is Inconclusive.

## Serving release

| Item             | Value                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source SHA       | `c8d6295c41d683c01c5a1ba98e873dfcdf68b7f1`, tag `staging-supabase-2026-11-12-2`                                                                                                                               |
| Deploy run       | [43255502203](https://github.com/anthonyyoo24/justgo/actions/runs/43255502203), code-only, no pending migrations                                                                                              |
| Function version | `api` version 1. The same run deployed `api-candidate` as version 2.                                                                                                                                          |
| Upload           | 2,206,518 bytes, SHA-256 `dc33730605d3394c34829d680ceb25406b4d5e0650201db1209d59c2eacb98f4`                                                                                                                   |
| Previous host    | The Worker at `abea5f56a2bab436f7750192643e0a335a213f29`                                                                                                                                                      |
| Readback         | `/health` and `/ready` returned 200 with `x-justgo-source-sha` naming `c8d6295c`, and `/ready` returned `{"status":"ready"}`                                                                                  |
| Migrations       | 0024 and 0025 applied by the [migrate-deploy run](https://github.com/anthonyyoo24/justgo/actions/runs/43253293118) at 15:58, under Anthony's owner test-data waiver                                           |
| Secrets          | [Run 43251988505](https://github.com/anthonyyoo24/justgo/actions/runs/43251988505) set 10 names. [Run 43254426042](https://github.com/anthonyyoo24/justgo/actions/runs/43254426042) re-set them after the fix |

The release took three steps.

1. Anthony chose the owner test-data waiver ("option 2"), because staging holds only test data and backups are paused. PR #446 added it. The migrate-deploy run applied 0024 and 0025 and reported `staging_database_verified`. Its health check then failed with `x-justgo-startup-stage: configuration`, so it did not deploy `api`.
2. The cause was the `DATABASE_SSL` secret, set to `true`. `apps/api/src/config.ts` accepts only `verify-full` or `disable`. Anthony re-set it to `verify-full`, and the secrets operation ran again.
3. The code-only deploy above found no pending migrations and served `/health` and `/ready`.

Before the waiver run, a manual check found 0024 and 0025 compatible with the live Worker, which shares the database. Both add only `AFTER UPDATE` triggers, and the API code only increments `data_epoch` and never updates `users.id`.

## P15-2 hosted runtime trial

`justgo-trial` deployed from `phase15/edge-trial` at `a39d9d508d3b76a997c177a9e3cd0cf638c58024` in [run 43164993608](https://github.com/anthonyyoo24/justgo/actions/runs/43164993608), as function version 1. The lanes ran from the Mac at about 06:02. [Run 43248129302](https://github.com/anthonyyoo24/justgo/actions/runs/43248129302) deleted the function, and its `/health` then returned 404.

| Check     | Verdict      | Evidence                                                                                                                                                                |
| --------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lane 1    | Pass         | Worker and function `/health` and `/ready` returned 200.                                                                                                                |
| Lane 2    | Pass         | `/health` with no `Authorization` or `apikey` returned 200. An invalid bearer returned the API's 401 `UNAUTHORIZED`.                                                    |
| Lane 3    | Pass         | `show statement_timeout` returned `5s`, not the pool's `4321ms`. The pooler ignores the pool setting, and the role's 5 s default applies.                               |
| Lane 4    | Pass         | `cf-connecting-ip` kept one public address through every forged request. `x-real-ip` was absent at the gateway.                                                         |
| Lane 5    | Pass         | The [log scan run](https://github.com/anthonyyoo24/justgo/actions/runs/43165904280) read 63 rows, found the path marker and found no bearer, header or body canary.     |
| Lane 6    | Pass         | The first request after 15 idle minutes took 525 ms. The warm guest catalog p95 over 50 requests was 89 ms.                                                             |
| Lane 7    | Deferred     | Region pin, deferred by the fast path. Gate #449.                                                                                                                       |
| Lane 8    | Pass         | 20 of 20 catalog reads returned 200 with 61 cards, and the paired `/health` reads named `a39d9d50`.                                                                     |
| Lane 9    | Deferred     | Body-size limits, deferred by the fast path. Gate #450.                                                                                                                 |
| Lane 10   | Pass         | The workflow read back version 1, and a repeat deploy of the same build changed nothing. The receipt holds secret names only.                                           |
| Perf rule | Fail         | Predicted worst-case sync 8,999 ms against an 8,000 ms limit. Warm catalog p95 84 ms and first request after idle 525 ms met their limits.                              |
| CPU limit | Inconclusive | No worker reached 2,700 ms of total burn, so per-worker CPU accounting could not be observed. All back-to-back burns returned 200. This check sits beside the decision. |

The prediction is the P15-1 loopback sync plus its query count times the extra latency per query: 985 + 2,812 × (2.987 − 0.137) = 8,999 ms. The hosted `select 1` median was 2.987 ms. The perf probe alternated 50 rounds between the Worker and `justgo-trial`. The function's warm catalog p50 was 74 ms and its p95 84 ms. The Worker's `/health` p50 was 50 ms and its p95 73 ms. All 50 Worker catalog reads failed, so the baseline has no Worker catalog figure.

The report ended with `Decision: stop`. The program stopped and presented the failure to Anthony, who chose to go ahead with Supabase. The prediction assumes every query pays the full extra round trip, so P15-9 lane 3 measured the real sync instead.

PR #448 ([merged as `fdd410d`](https://github.com/anthonyyoo24/justgo/pull/448)) makes the Edge entry read `cf-connecting-ip`. The function still serves `c8d6295c`, which reads `x-real-ip`, so every caller shares one rate-limit bucket until the next release.

## P15-9 hosted acceptance

| Check      | Verdict      | Evidence                                                                                                                                                                                                                                      |
| ---------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lane 1     | Pass         | At 16:27 the public probes passed on the Worker, which names `abea5f56`, and on the function, which names `c8d6295c`, main's SHA then.                                                                                                        |
| Lane 2     | Pass         | `/health`, `/ready`, the guest catalog and `/openapi.json` returned 200. Warm guest catalog p50 91 ms and p95 137 ms over 30 requests. Release identity headers come only on `/health` and `/ready`, as `apps/api/src/http/app.ts` sets them. |
| Lane 3     | Pass on wall | Anthony imported the worst-case archive on the iPhone with no error. The archive has 260 completions and 260 journal entries with 10,000-character reflections, 23.7 MB. The CPU part is Inconclusive. See the perf section.                  |
| Lanes 4, 5 | Pass         | Anthony's report is the evidence, and no screenshots were taken. Guest writing moved into Apple. Apple never showed Google's import, and Google never showed Apple's attempt.                                                                 |
| Lane 6     | Deferred     | Two-device writing. Gate #451.                                                                                                                                                                                                                |
| Lane 7     | Deferred     | Offline write and reconnect. Gate #452.                                                                                                                                                                                                       |
| Lane 8     | Deferred     | Account deletion and receipt retry. Gate #453.                                                                                                                                                                                                |
| Lane 9     | Pass         | 780 log rows from 16:00 to 21:00 hold only request start and finish lines with method, status and cursor query strings. No token, body or writing appears.                                                                                    |
| Lane 10    | Deferred     | Backup and ledger runs, until backups resume. Gate #454.                                                                                                                                                                                      |

In lanes 4 and 5, one Google account first showed no imported history. That was a different Google account. The original Google account showed the import. Two Google accounts are two JustGO accounts by design.

Lane 9 found four 401 responses, two on `GET /v1/completion-restores` and two on `GET /v1/journal-sync`. They match polls after a sign-out or switch revoked their session. An agent read the logs in Anthony's Supabase dashboard, with his yes.

### Perf

| Metric                   | Value                                                                         | Limit    | Verdict      |
| ------------------------ | ----------------------------------------------------------------------------- | -------- | ------------ |
| Slowest sync batch, wall | 1,098 ms. 7 completion and 7 journal POSTs from 19:42:50 to 19:43:02, all 200 | 8,000 ms | Pass         |
| Sync batch CPU           | Not in the function logs                                                      | 1,000 ms | Inconclusive |
| First request after idle | 603 ms after about 15 min 20 s idle, at 16:43                                 | 2,000 ms | Pass         |

A request's CPU time is at most its wall time, so only the 1,098 ms batch could exceed the CPU limit. Gate #455 tracks the reading. The logs give wall time as `request completed` minus `incoming request`. Invocations per day were not recorded.

## Answers to the Appendix A questions

1. Yes. `/ready` returned 200 through the transaction pooler on both functions, and readiness fails on any role but `justgo_runtime`. `api` runs with `DATABASE_SSL=verify-full`.
2. The pooler ignores the `statement_timeout` connection setting. The role's 5 s default applies.
3. P15-1 answered it.
4. Yes. P15-2 lane 2.
5. `cf-connecting-ip`. P15-2 lane 4.
6. No. P15-2 lane 5 and P15-9 lane 9 found none.
7. The slowest hosted sync batch took 1,098 ms of wall time. CPU is not measured.
8. Not answered. Gate #449.
9. Not answered. Gate #450.
10. The `api` upload is 2,206,518 bytes. The first request after idle took 525 ms on `justgo-trial` and 603 ms on `api`.

## Still to do

- Set `BETA_ACCESS_WINDOW` and the beta grants for `api` before P15-11. The `api` secrets operation set neither, so `api` uses the 72-hour window that `justgo-trial` left behind.
- Release `fdd410d` or later to `api` before P15-11, so rate limits key on `cf-connecting-ip`.
- Retarget gate issues #79, #81, #84 and #99 to the function, and narrow #103 and #118. This handoff does not change them.
- The trial left the project secrets `JUSTGO_SOURCE_SHA` and `JUSTGO_TRIAL_KEY_SHA256`. No function reads them now. No workflow unsets secrets, so they stay until someone removes them by hand.
- Run the deferred checks in gates #449 to #455 before the first outside tester joins, except #454, which waits until backups resume. A P15-11 iPhone lane can cover #451, #452 or #453.
