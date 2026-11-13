<a id="phase-15a"></a>

# Phase 15A plan to move the database and API to Supabase us-east-1

**Status.** Planned on November 13, 2026. Nothing in this plan has run. Anthony settled its [decisions](#decisions) on November 13. Each hosted step still waits for his go. It changes no provider, secret, build or database by itself.

This plan moves JustGO's Supabase database, Auth and the `api` Edge Function from project `kmcpcauaxlgpevkkenwd` in Canada Central (`ca-central-1`) to a new Supabase project in us-east-1 (North Virginia). The new project becomes the one the app uses. The Canada project stays until the app works on the new one, then Anthony deletes it.

## Anthony's decisions

Anthony made these choices on November 13, 2026. The plan follows them.

- **Region.** Move to the United States. The main market is U.S. users, and Canada was never a deliberate choice.
- **Plan.** "we're using the free plan for now"
- **Role.** "we would be using the us project for production"
- **Canada.** "we would remove it after we finish the us database and it works with th eapp"
- **Free slots.** On November 13 the organization's active projects were JustGo (`ca-central-1`) and content-machine (`ca-central-1`), so both free slots were taken. Asked whether content-machine may be paused when the move starts, Anthony answered "Yes, pause it then".

## Why us-east-1

The function must run next to the database. A worst-case sync makes about 2,800 queries, and Phase 15 measured a hosted `select 1` median of 2.987 ms with both in Canada Central ([Appendix A of Phase 15](phase-15-supabase-api.md#appendix-a-prototype-evidence)). A cross-region hop multiplies that cost.

Supabase runs a function in the region closest to the caller unless the request pins one. Its [regional invocation list](https://supabase.com/docs/guides/functions/regional-invocation) includes us-east-1 and does not include us-east-2. So us-east-1 is the only U.S. East region where the app can pin the function next to the database. Build 8 sends the pin from PR #479's code, changed to `us-east-1`.

## What moves and what stays

| Item                              | Today                                                                                                 | After the move                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Database, Auth and `api` function | Project `kmcpcauaxlgpevkkenwd`, `ca-central-1`, pooler `aws-0-ca-central-1.pooler.supabase.com`       | A new free project in `us-east-1`. Its pooler host is the one its dashboard shows. |
| Release lane                      | `.github/workflows/staging-api.yml`, environment `justgo-staging`, pinned to the Canada ref           | The same lane and environment, pinned to the new ref                               |
| `APP_ENVIRONMENT`                 | `staging`                                                                                             | `staging`, until #106 introduces production                                        |
| Backups                           | R2 bucket `justgo-staging-backups`, prefixes `staging/database/` and `staging/ledger/`, source Canada | Same bucket and prefixes, source the new project ([decision 3](#decisions))        |
| Readiness monitor                 | Sentry monitor 10773615 on the Canada `/ready`                                                        | The same monitor on the new `/ready`                                               |
| TestFlight                        | Build 7, no region pin, Canada URL                                                                    | Build 8, `x-region: us-east-1`, new URL                                            |
| Legal notices                     | Database in Canada Central                                                                            | Database and server in the United States, with a U.S. storage disclosure           |
| Data                              | Anthony's test data                                                                                   | Starts empty. The phone carries its data over ([Data](#data)).                     |

## Naming and selection

The new project keeps every "staging" name for now. The lane, the `justgo-staging` GitHub environment, `APP_ENVIRONMENT=staging`, the `STAGING_*` secrets and the backup prefixes stay as they are. Two facts force this.

- `apps/api/src/config.ts` throws "Beta access is allowed only in staging" when beta grants or a window are set outside staging. The free beta needs that window.
- `functionSecretRules` in `scripts/release/staging-api.mjs` accepts only `APP_ENVIRONMENT=staging`.

Renaming everything to "production" is #106's work, and it should happen once, with the launch cutover, not halfway now. The plan selects the new project by changing the one pinned ref and pooler host everywhere the code names them. After the move, `git grep -n kmcpcauaxlgpevkkenwd` returns only history lines in docs.

A separate test project can come later as a second target with its own ref, GitHub environment, credentials and backup policy. [SERVER_RELEASES.md](../operations/SERVER_RELEASES.md) and [CLOUDFLARE_BACKUPS.md](../operations/CLOUDFLARE_BACKUPS.md) already require that for production. Making the pinned ref a per-environment value is that later PR's job, not this move's.

## Data

**Recommendation.** Start the new database empty. Carry Anthony's phone data with the app's own export and import.

- The app keeps data on the phone first. Canada holds only Anthony's test data.
- A database copy would also have to move Auth users, identities and provider links between projects, a separate and riskier procedure. Without them it would copy deletion receipts and tombstones whose subjects do not exist in the new Auth.
- The new project creates new Auth users, so Anthony's account gets a new id on first sign-in. Data owned by the old account on the phone may not adopt into the new account by itself. The export ZIP and Settings import avoid that question. Import runs through `ActivityRuntime.importData()` and uploads through `/v1/completion-restores`.
- Canada's final backup at [US-6](#us-6) keeps the old server copy until its R2 retention ends.

The alternative is a `pg_dump` of the `justgo` schemas into the new project after migrations. It is listed as [decision 7](#decisions).

## How to read this

One box is one unit of work. Every box names the check that proves it. Check a box only when that evidence exists, such as a receipt line, a query result, a screenshot or a SHA.

Each step names **Who.** Anthony does every dashboard click, every password and secret, every protected-environment approval and every deletion. Agents write the code PRs, run read-only checks, and dispatch a lane run only after Anthony's go for that run. No agent enters a password, a key or a token.

Each step has a **Rollback.** Until [US-10](#us-10), Canada keeps serving build 7 unchanged, so the rollback for every step is to stop and keep using Canada.

**Freeze.** From [US-3](#us-3) until [US-5](#us-5) passes, no PR that adds a migration under `apps/api/drizzle/` merges. The new project then starts from exactly the 26 migrations that Canada holds.

## The steps

<a id="us-1"></a>

### US-1. Preconditions

**Who.** Agent checks. Anthony confirms the dashboard facts.

- [ ] Gate #476 is closed with a passing first scheduled nightly backup from November 14 at 04:43 UTC. Check `gh issue view 476`.
- [ ] Issue #474, the R2 credential renewal due by November 20 at 15:39 UTC, is done or scheduled. It happens whatever this move does. The renewal is independent of the move if [decision 3](#decisions) keeps the bucket and prefixes, because the uploader is scoped to those.
- [ ] Anthony pauses content-machine, as he approved ([decision 2](#decisions)). Then the Supabase organization's project list shows JustGo in Canada as the only active free project. The free plan allows two. If another active free project has appeared, Anthony pauses it or decides otherwise before US-2.
- [ ] `apps/api/tests/db/fixtures/applied-migration-hashes.json` on `main` lists 26 applied migrations, 0000 to 0025, and an empty `unapplied`. Check `git show origin/main:apps/api/tests/db/fixtures/applied-migration-hashes.json`.
- [ ] No open PR adds a migration. Check `gh pr list --search 'drizzle in:files'` and read the file lists.
- [ ] PR A (first-release path) has merged. See [PR split](#pr-split).
- [ ] Anthony has approved this plan and answered decisions 1 to 10.

**Rollback.** Nothing has changed.

<a id="us-2"></a>

### US-2. Create the project

**Who.** Anthony.

- [ ] Create a new project in the existing organization, on the free plan, region **East US (North Virginia)**, named as [decision 1](#decisions) says.
- [ ] Generate the database password in the dashboard and store it where the Canada one is kept. It never goes into chat, an issue or a file in the repository.
- [ ] Turn off the Data API's exposure of everything but what [ACCOUNT_SYNC_SETUP.md](../operations/ACCOUNT_SYNC_SETUP.md#keep-private-tables-off-the-data-api) allows, before any schema exists.
- [ ] Give the agent the new project ref, the session pooler host and the transaction pooler host from the dashboard's Connect panel. None of these is a secret.

**Check.**

- [ ] Project Settings shows region `us-east-1` and the free plan. Anthony sends a screenshot with no keys on it.
- [ ] `curl -s -o /dev/null -w '%{http_code}' https://<new-ref>.supabase.co/auth/v1/health` answers, which proves the ref is live. A 401 without an API key is expected.
- [ ] The pooler host matches `aws-<n>-us-east-1.pooler.supabase.com`. Do not assume the `aws-0` prefix.

**Rollback.** Anthony deletes the empty project.

<a id="us-3"></a>

### US-3. Roles, session helper and lane target

**Who.** Anthony runs the SQL and sets the secrets. Agents write PR B.

**Depends on.** US-2, PR A merged, the freeze in force.

- [ ] Anthony runs `apps/api/scripts/provision.sql` in the new project's SQL editor as `postgres`. It creates `justgo_migrator`, `justgo_runtime`, the `justgo` and `drizzle` schemas, and the Supabase migration `foundation_roles`. It sets no passwords, by design.
- [ ] Anthony sets the `justgo_migrator` and `justgo_runtime` passwords with a secure prompt, as [SERVER_RELEASES.md](../operations/SERVER_RELEASES.md) describes for Canada.
- [ ] Anthony runs `apps/api/scripts/managed-auth/session-check-v1.sql` as `postgres`, as [ACCOUNT_SYNC_SETUP.md](../operations/ACCOUNT_SYNC_SETUP.md) describes. It needs only the `justgo_runtime` role, and the first release's `/ready` probe in US-5 needs it.
- [ ] Anthony runs `scripts/backups/backup-role.sql` as `postgres` and sets the `justgo_backup` password.
- [ ] PR B merges. It repins the release lane and guard to the new ref and pooler host. Canada releases stop from this point, which the freeze already covers.
- [ ] Anthony updates the `justgo-staging` environment. Set the variable `SUPABASE_PROJECT_REF` to the new ref. Replace `MIGRATION_DATABASE_URL` with the session pooler on port 5432 as `justgo_migrator.<new-ref>`. Keep or replace `DATABASE_CA_CERT` after checking that the new pooler presents a chain it signs.
- [ ] Nobody runs `pnpm run db:migrate` against the new project. The first release in US-5 applies the migrations, and it needs an empty history.

**Check.**

- [ ] The session-check checks pass. The helper returns false for random UUIDs, and direct Auth reads and writes fail for `justgo_runtime`.
- [ ] `select to_regclass('drizzle.__drizzle_migrations')` returns null, so no migration has run.

**Rollback.** Revert PR B and restore the old `justgo-staging` values. Canada never changed. Anthony may delete the new project and start US-2 again.

<a id="us-4"></a>

### US-4. Auth providers

**Who.** Anthony. Agents compare the settings with the runbook.

**Depends on.** US-2.

- [ ] Apple provider on. The bundle ID `com.anthonyyoo.justgo` is the Client ID and token audience. Users without email allowed. Nonce validation on. Native sign-in needs no secret.
- [ ] Google provider on, with the existing web client ID and secret from project `justgo-512319` and the iOS client ID as an extra audience. Skip nonce checks on, for Google only, as the accepted exception in [ACCOUNT_SYNC_SETUP.md](../operations/ACCOUNT_SYNC_SETUP.md) records.
- [ ] Add the new project's `https://<new-ref>.supabase.co/auth/v1/callback` to the Google web client's authorized redirect URIs. Keep the Canada callback until US-10.
- [ ] Manual identity linking on. Site URL and redirect allowlist copied from Canada, as [ACCOUNT_SYNC_SETUP.md](../operations/ACCOUNT_SYNC_SETUP.md#link-identities-and-allow-browser-origins) lists them.
- [ ] Create the server Auth secret key with hard-deletion permission for `SUPABASE_AUTH_SECRET_KEY`.

**Check.**

- [ ] Anthony walks the Auth Providers and URL Configuration pages of both projects side by side and confirms each row of the ACCOUNT_SYNC_SETUP table matches.
- [ ] The real sign-ins run at [US-8](#us-8), because only a build that points at the new project can prove them.

**Rollback.** Turn the providers off and remove the new callback. Canada Auth is untouched.

<a id="us-5"></a>

### US-5. Function secrets and first release

**Who.** Anthony sets the secrets, approves the waiver and dispatches the run. The run applies migrations, so an agent's go for a code-only deploy does not cover it.

**Depends on.** US-3 and US-4.

- [ ] Anthony rebuilds `STAGING_FUNCTION_SECRETS` for the new project. The runtime `DATABASE_URL` uses the transaction pooler on port 6543 as `justgo_runtime.<new-ref>`, with `DATABASE_SSL=verify-full`. The other values copy from Canada, except long random keys, which are new.
- [ ] Anthony dispatches the `secrets` operation. With no `api` it probes nothing. The lane refuses `SUPABASE_*` names, so Anthony sets `SUPABASE_AUTH_SECRET_KEY` and `BETA_ACCESS_WINDOW` in the function's secret store the way he did on Canada. All secrets must be set before the next box, because the candidate's `/ready` probe needs them.
- [ ] Anthony approves a test-data waiver for the first release, bound to the new project, the empty history and `"previousApiSha": "none"` ([decision 8](#decisions)). The new database holds no data, so a recovery attestation has nothing to prove.
- [ ] Anthony reviews the pending SQL and its plan digest, then dispatches one `migrate-deploy` through PR A's path. It applies 0000 to 0025 as `justgo_migrator`, deploys `api-candidate`, probes it, then creates `api`. There is no migrate-only run. Once any migration is applied, the lane refuses `none`, so migrations and the first deploy must be one run.
- [ ] Anthony recreates the retention job, after the release because it reads the migrated tables. Enable `pg_cron`, then schedule `justgo-identity-retention` hourly at minute 17 exactly as [TESTFLIGHT_BETA.md](../operations/TESTFLIGHT_BETA.md) describes it. That SQL is not in the repository. PR B adds it as `apps/api/scripts/beta-identity-retention.sql` (planned), copied from the Canada job's definition, so the next project does not depend on a description.
- [ ] Anthony repoints Sentry uptime monitor 10773615 to `https://<new-ref>.supabase.co/functions/v1/api/ready`. The free Sentry plan includes only that one monitor, so Canada goes unmonitored from here. Anthony is its only user.

**Check.**

- [ ] The `staging_supabase_release` receipt names the new ref, the source SHA, `previousApiSha` `none` with no previous version, and candidate and serving versions.
- [ ] Anthony runs `select hash, created_at from drizzle.__drizzle_migrations order by created_at` and pastes the result. The agent compares each row's hash and `when` with `applied-migration-hashes.json`. All 26 match in order.
- [ ] `git diff origin/main -- apps/api/tests/db/fixtures/applied-migration-hashes.json` is empty. The fixture records migration files, and the same files applied to a new database leave it unchanged.
- [ ] Anthony runs the hosted catalog query from gate #212 on the new project. No `justgo` schema, table, column or routine grants anything to `anon`, `authenticated`, `PUBLIC` or any role but its owner and `justgo_runtime`. Every `justgo` table forces RLS.
- [ ] `select jobname, schedule from cron.job` shows `justgo-identity-retention` at `17 * * * *`.
- [ ] `curl -s https://<new-ref>.supabase.co/functions/v1/api/ready` returns exactly `{"status":"ready"}`.
- [ ] `curl -sI -H 'x-region: us-east-1' https://<new-ref>.supabase.co/functions/v1/api/health` shows `x-sb-edge-region: us-east-1` and the expected `x-justgo-source-sha`.
- [ ] Record which region serves the same request without the header. Any region but `us-east-1` shows why build 8 needs the pin.
- [ ] `GET /v1/access` with a fresh guest grants the free beta, which proves `BETA_ACCESS_WINDOW`.
- [ ] The Sentry monitor shows a passing check on the new URL.
- [ ] **Perf.** Thirty warm guest catalog requests with the pin. The p50 stays near Phase 15's 91 ms and the p95 near its 137 ms. A much larger number means the function is not next to the database.

**Rollback.**

- If the run fails before its migrations commit, fix the cause and run it again.
- If it fails after they commit, the project holds migrations and no `api`, and the lane refuses every later run with `serving_function_missing`. Recovery is operator work outside the lane. Since the project holds no data, Anthony deletes it, creates a new empty one and repeats US-2 to US-5. The new project has a new ref, so PR B's pins change again.
- After a passing run, delete the new `api` and `api-candidate` functions, or leave them, since no build points at them. Point the Sentry monitor back to Canada.

<a id="us-6"></a>

### US-6. Repoint the backups

**Who.** Anthony switches the secrets and the policy. Agents write PR C and read the receipts.

**Depends on.** US-5 and gate #476 passed.

- [ ] Anthony dispatches one final Canada run of `database-backups.yml` for both kinds, database and ledger. Record both receipts.
- [ ] Anthony sets `JUSTGO_BACKUPS_ENABLED` to anything but `approved`, so no scheduled run fires between the merge and the new policy.
- [ ] PR C merges. It moves the cron-history DELETE exception and the rehearsal pin to the new ref.
- [ ] Anthony writes and approves a new backup policy with the new `sourceHost`, `sourceProjectRef` and an `approvalReference` that names this plan. He replaces `BACKUP_POLICY_JSON`, `BACKUP_POLICY_SHA256`, `BACKUP_DATABASE_URL` (as `justgo_backup.<new-ref>` on the session pooler, port 5432) and, if US-3 changed it, `BACKUP_DATABASE_CA_CERT`.
- [ ] Anthony sets `JUSTGO_BACKUPS_ENABLED` back to `approved` and dispatches one run of each kind.
- [ ] The backup clock Worker needs no change, because it dispatches the workflow and names no project.

**Check.**

- [ ] The final Canada receipts name `kmcpcauaxlgpevkkenwd@` in their source.
- [ ] The first new receipts name `<new-ref>@<new-pooler-host>/postgres` in their source.
- [ ] The next hourly ledger run at minute 23 passes on its own.
- [ ] A restore rehearsal from the first new database backup passes into loopback `justgo_test`, as [CLOUDFLARE_BACKUPS.md](../operations/CLOUDFLARE_BACKUPS.md) describes.

**Rollback.** Revert PR C, restore the old policy and secrets, and re-enable. The R2 objects are unchanged.

<a id="us-7"></a>

### US-7. EAS variables and build 8

**Who.** Agents write PR D. Anthony changes EAS and dispatches the build.

**Depends on.** US-5, and PR E merged with Anthony's approval. The pages publish in this step, just before the build.

- [ ] PR D merges. It points every API and Auth origin at the new project and sends `x-region: us-east-1` from `apiRegionHeaders`, reusing #479's code and tests.
- [ ] Anthony sets `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the EAS `development` and `preview` environments to the new project's values. The Google client IDs do not change.
- [ ] Anthony publishes the approved [US-9](#us-9) pages. The live Privacy page shows the new notice version.
- [ ] Before installing build 8, Anthony exports his data from build 7 in Settings and keeps the ZIP.
- [ ] Anthony dispatches the TestFlight workflow for build 0.1.0 (8) from a reviewed tag. Its preflight refuses any API URL but the new one and any notice version but the published one.

**Check.**

- [ ] The preflight log names the new API URL and the new notice version.
- [ ] The exported JavaScript bundle of build 8 contains the new origin and `us-east-1`, and does not contain `kmcpcauaxlgpevkkenwd`. Check with `grep -c` on the export.
- [ ] Anthony's Mac reads `x-sb-edge-region: us-east-1` on a request that build 8's code path sends, through the verify-justgo region drive #479 added.

**Rollback.** Expire build 8 in App Store Connect and reinstall build 7, which still points at Canada. Revert PR D and the EAS values.

<a id="us-8"></a>

### US-8. Phone checks

**Who.** Anthony on the iPhone. Agents prepare the steps and record evidence on each gate.

**Depends on.** US-7.

- [ ] Sign in with Apple on build 8. A new account is created in the new project.
- [ ] Import the build 7 export ZIP in Settings. The completions and journal entries appear, then reach the server.
- [ ] Sign in with Google on a second install or after sign-out. Apple and Google stay separate accounts, as P15-9 lane 4 required.
- [ ] Rerun gate #451. The iPhone and the web app show the same writing.
- [ ] Rerun gate #452. Offline writes sync on reconnect.
- [ ] Rerun gate #453. The account deletion receipt retries.
- [ ] **Perf.** Rerun P15-9 lane 3 with the same 23.7 MB archive. All 14 sync POSTs return 200 and the slowest stays under the 8,000 ms limit. Phase 15 measured 1,098 ms. The first request after 15 minutes idle stays under 2,000 ms.

**Check.**

- [ ] Anthony runs `select count(*) from justgo.completions` and the journal count in the new SQL editor. They match the counts in the export.
- [ ] Each gate issue gets a comment with the build, the project ref and the result, and closes with a link to its evidence. A failing gate stays open and blocks US-10.
- [ ] The Sentry API project shows no new issue from build 8's runs.

**Rollback.** Reinstall build 7. Canada still holds its data.

<a id="us-9"></a>

### US-9. Legal update and publication

**Who.** Agents draft PR E. Anthony approves the wording and publishes the pages.

**Depends on.** Nothing for the drafts. Publication happens in US-7, right before build 8 is dispatched, because the TestFlight preflight needs the published notice version.

- [ ] PR E rewrites the region paragraph of [PRIVACY_POLICY_DRAFT.md](../legal/PRIVACY_POLICY_DRAFT.md). It replaces "Our primary database remains in Canada Central" and #479's Canada sentence with one that says the database and the server run in the United States, in Supabase's us-east-1 region in Virginia.
- [ ] It adds the U.S. storage disclosure. Canadian federal privacy law expects a business that stores personal information abroad to tell users so, and to say the information may be accessed by that country's courts, law enforcement and national security authorities under its laws. The existing sentence on foreign lawful access stays and names the United States.
- [ ] It updates [DATA_INVENTORY.md](../legal/DATA_INVENTORY.md), [RELEASE_DISCLOSURES.md](../legal/RELEASE_DISCLOSURES.md) and [SUPABASE_NOTICE_REVIEW.md](../legal/SUPABASE_NOTICE_REVIEW.md) wherever they name Canada Central or `ca-central-1` as the database region. The operator's Ontario address stays.
- [ ] It records Anthony's approval in [APPROVALS.md](../legal/APPROVALS.md) and a new notice version, such as `2026-11-<dd>-us-east`.
- [ ] It notes that a lawyer should review the cross-border wording before the paid launch.
- [ ] It adds no Quebec-specific text or transfer assessment ([decision 6](#decisions)).
- [ ] Anthony publishes the pages only together with build 8, never earlier while build 7 still points at Canada. The published notice version becomes `BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION`, which PR D sets.

**Check.**

- [ ] `pnpm run build:legal --production` passes with the approved metadata, then the built pages read correctly in the browser pane.
- [ ] `pnpm run test:architecture` passes, including `scripts/quality/policy-copy.test.mjs` and the legal reader tests.
- [ ] `git grep -n -i 'canada central' docs/legal` returns nothing but history lines.
- [ ] The live Privacy page shows the new version and the U.S. paragraph.

**Rollback.** Before publication, nothing is public. After publication, republish the previous version only together with a return to build 7.

<a id="us-10"></a>

### US-10. Retire Canada

**Who.** Anthony, on an explicit go given at this step. Agents check and record.

**Depends on.** US-6 to US-9 all passed, and every gate in US-8 closed.

- [ ] Anthony confirms the app works on the new project and gives an explicit go to delete Canada. Approval of this plan does not count.
- [ ] Anthony expires build 7 in App Store Connect, so no installed build points at Canada.
- [ ] Anthony reads in the Canada SQL editor that no completion or journal row is newer than the final US-6 backup. If one is, it is test data that build 8 already holds, or Anthony runs one more manual export before deleting.
- [ ] Anthony decides how long to keep Canada's final backup ([decision 9](#decisions)). R2 retention removes it after the policy's `backupDays` unless he keeps a copy.
- [ ] Anthony removes the Canada callback from the Google web client.
- [ ] Anthony deletes the Canada project in the Supabase dashboard. This frees the second free slot.
- [ ] PR F records the retirement in this plan and in the runbooks, and closes the plan.

**Check.**

- [ ] `curl -s -o /dev/null -w '%{http_code}' https://kmcpcauaxlgpevkkenwd.supabase.co/functions/v1/api/health` no longer returns 200.
- [ ] `git grep -n kmcpcauaxlgpevkkenwd` returns only history lines.
- [ ] The Supabase project list shows one active project, in us-east-1.

**Rollback.** None after deletion. Until the deletion, reinstalling build 7 and reverting PRs B, C and D brings Canada back.

## Free-plan limits

- **Two active projects.** During the overlap, Canada and the new project use both slots. US-1 checks for a third.
- **Pause after one week without activity.** A paused project stops sign-in and sync for every user. The Sentry monitor calls `/ready` every minute, which queries the database through the session-check helper. The hourly ledger backup and the hourly retention job also reach the database. Supabase does not document which traffic counts as activity, so this guard is unproven.
  - **Proof.** After eight days, Anthony reads the project status. It must show Active with no pause warning. A pause email from Supabase is a failure.
  - **Trigger.** [TESTFLIGHT_BETA.md](../operations/TESTFLIGHT_BETA.md#supabase-pro-upgrade-triggers) already lists a pause as a trigger to ask for Pro. This plan proposes one more, which is decision 4. Upgrade before the first outside tester stores real journals, because a free project has no automatic backups and can pause.
- **500 MB database.** Starting empty, the new project starts far from the 400 MB trigger.
- **500,000 Edge Function invocations a month.** The Sentry monitor uses about 44,600. Each sync uses one per request.
- **No automatic backups.** R2 covers recovery, as before.

## PR split

Each PR is small and lands on its own, from `main`, with one verifier. None is stacked.

| PR                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Merges at        | Notes                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| This PR               | The plan and its README link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Anthony's review | Docs only. Not armed.                                                                                                                                                                                                             |
| A, first-release path | The lane can migrate an empty project with no `api` function, and then deploy a first `api`. It binds `previousApiSha` to a fixed "none" marker that it accepts only when the applied history is empty and no `api` exists. It keeps every refusal for a project that has either. Tests in `scripts/release/staging-supabase.test.mjs` and `apps/api/tests/scripts/staging-release.test.ts`.                                                                                                                 | Before US-3      | PR #482. With no `api` the lane reads `previousApiSha` as `none`. The guard accepts it only while no migration is applied, and reads a missing Drizzle journal as empty. So the first release is one `migrate-deploy`. Sensitive. |
| B, release target     | Repins `stagingProjectRef` in `scripts/release/staging-supabase.mjs`, `stagingProject` and the pooler host in `apps/api/scripts/staging-release-guard.ts`, and the URL in `.github/workflows/staging-health.yml`. Adds the retention job SQL. Removes the dead `withStagingBootstrap` from `apps/api/scripts/staging-release-guard.ts`, which nothing but its own tests calls. Updates [SERVER_RELEASES.md](../operations/SERVER_RELEASES.md).                                                               | US-3             | Sensitive. Ends Canada releases.                                                                                                                                                                                                  |
| C, backup source      | Moves the cron-history exception in `scripts/backups/configuration.mjs` and the pin in `scripts/backups/rehearse.mjs` to the new ref. Updates [CLOUDFLARE_BACKUPS.md](../operations/CLOUDFLARE_BACKUPS.md).                                                                                                                                                                                                                                                                                                  | US-6             | Sensitive.                                                                                                                                                                                                                        |
| D, app target and pin | Repins `apps/mobile/eas.json`, `scripts/release/check-beta.mjs`, `scripts/development/configuration.mjs`, `scripts/development/test-environment.mjs`, `.github/workflows/testflight-beta.yml` and `.github/workflows/development-ios.yml`. Adds `x-region: us-east-1` from #479. Sets the new notice version. Updates [TESTFLIGHT_BETA.md](../operations/TESTFLIGHT_BETA.md), [DEVELOPMENT_BUILDS.md](../operations/DEVELOPMENT_BUILDS.md) and [ACCOUNT_SYNC_SETUP.md](../operations/ACCOUNT_SYNC_SETUP.md). | US-7             | Sensitive. Needs the published notice.                                                                                                                                                                                            |
| E, notices            | The legal changes in US-9.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Before US-7      | Sensitive. Waits for Anthony's approval of the wording.                                                                                                                                                                           |
| F, retirement         | Records US-10 and removes the last Canada references that are not history. Updates `sites/legal/build.test.mjs` and [TERMS_DRAFT.md](../legal/TERMS_DRAFT.md) if either still names the old ref.                                                                                                                                                                                                                                                                                                             | After US-10      | Docs and tests.                                                                                                                                                                                                                   |

Each code PR runs the checks its row in [AGENTS.md](../../AGENTS.md#choosing-checks) names. Each PR updates every test that pins the old ref, such as `scripts/release/staging-supabase.test.mjs`, `scripts/release/check-beta.test.mjs`, the backup tests, `scripts/quality/staging-health-workflow.test.mjs`, `scripts/quality/testflight-workflow.test.mjs`, `apps/api/tests/http/edge.test.ts`, `apps/api/tests/scripts/staging-release.test.ts` and `apps/api/tests/scripts/staging-function-secrets.test.ts`. Run `git grep -n kmcpcauaxlgpevkkenwd` before opening each PR, and account for every hit.

PR #479 adds the region pin with `ca-central-1` and a Canada Privacy sentence. That sentence would never be true for a published build after this move. [Decision 5](#decisions) closes #479 and carries its code into PR D.

## Order

1. US-1, with PR A merged.
2. US-2, then US-3 and US-4 in either order.
3. US-5.
4. US-6.
5. PR E drafted early. Anthony approves its wording any time before US-7.
6. US-7, with the notice published at the same time.
7. US-8.
8. US-10, on Anthony's go, then PR F.

This plan sits before the external free beta in the [release order](README.md#release-order). Outside testers then store their journals in the U.S. project from the start, and the Canada project never holds anyone's real data.

<a id="open-decisions"></a>

## Decisions

Anthony settled these on November 13, 2026. For the recommended choices he answered "for the other decisions i agree".

1. **Dashboard name.** "JustGo US". The ref, not the name, selects the project.
2. **A third free project.** Anthony pauses content-machine at US-1 ("Yes, pause it then"). Any other active free project found then is paused before US-2 too.
3. **Backups bucket.** Keep `justgo-staging-backups` and the `staging/` prefixes, with a new policy that names the new source. The #474 renewal then carries over unchanged. #106 can split out a `justgo-production-backups` bucket with the rest of the production naming.
4. **Supabase Pro.** Upgrade to Pro before the first outside tester stores a real journal, because a free project can pause and has no automatic backups. Until then the free plan stays, as Anthony chose.
5. **PR #479.** Closed. Its code and tests carry into PR D with `us-east-1`.
6. **Legal wording.** PR E drafts the U.S. Privacy paragraph and the U.S. storage disclosure, and Anthony approves the final text before publication. A lawyer reviews the cross-border wording before the paid launch at the latest. No Quebec text or Quebec transfer assessment: "we are not going to mention quebec".
7. **Data.** Start empty and carry the phone data with export and import.
8. **First-migration waiver.** Approved in principle: one test-data waiver bound to the new ref and the empty history. It is not a recovery attestation and binds to one plan and one day, recorded when US-5 runs.
9. **Canada's final backup.** R2 retention removes it. No copy is kept on the Mac.
10. **Naming.** Keep every "staging" name until #106, as [Naming and selection](#naming-and-selection) explains.

## Risks

| Risk                                                             | Where it shows      | Guard                                                                                       |
| ---------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| The first deploy has no path to an empty project                 | US-5                | PR A, with tests for an empty project and refusals for every other state                    |
| The first release fails after its migrations commit              | US-5                | Delete and recreate the empty project, as US-5's rollback says                              |
| The free project pauses                                          | Any time after US-5 | Daily traffic from the monitor, backups and retention. Proof after eight days. Decision 4.  |
| A migration merges during the move and lands on one project only | US-3 to US-5        | The freeze                                                                                  |
| Phone data does not reach the new account                        | US-8                | Export before build 8, import after sign-in, count readback                                 |
| The function runs away from the database                         | US-5, US-8          | `x-region: us-east-1` in build 8, the region readback, the perf checks                      |
| Google sign-in fails on the new callback                         | US-8                | The new callback added at US-4 and kept with the old one until US-10                        |
| The notice names the wrong country for a published build         | US-9                | Publication only with build 8, `BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION` in the preflight |
| Canada is deleted before the app works                           | US-10               | Every US-8 gate closed and Anthony's explicit go at that step                               |
