<a id="production-cutover"></a>

# Production cutover plan for the free launch (gate #106)

**Status.** Planned on November 17, 2026. Nothing here has changed a hosted service. The evidence under [Already done](#already-done) comes from read-only checks on November 17.

Gate [#106](https://github.com/anthonyyoo24/justgo/issues/106) asks for a verified production setup before real users store journals. Its source was the Phase 07 cutover in the deleted `docs/operations/FOUNDATION.md` (git history at `ad794546^`). This plan sorts each #106 item into what the free launch still needs, what is already done, and what does not apply.

## Anthony's decisions

- **Free launch.** JustGO launches free on the App Store with no external TestFlight beta (November 17).
- **One project.** The us-east-1 project `gcjmvtsisivxxorstvkb` ("JustGo US", free plan) becomes production. There is no separate production project (comment on #106, November 17).
- **Backups.** The repo's encrypted R2 backups are the accepted production backups. Gate [#104](https://github.com/anthonyyoo24/justgo/issues/104) is closed.
- **Declined.** The hourly Auth cleanup ([#536](https://github.com/anthonyyoo24/justgo/issues/536)) and the external beta cohort ([#97](https://github.com/anthonyyoo24/justgo/issues/97)).
- **Privacy Policy.** Add no technical details to it for this cutover.

## How to read this

One box is one unit of work, with the evidence that proves it. Tick a box only when that evidence exists.

Each step names **Who** and **Anthony's go**. Anthony's go is needed for any deploy, migration, function secret, deletion, App Store submission, or settings change in Supabase, Sentry, Cloudflare, Google or App Store Connect. Anthony does every dashboard click and every secret. Agents write code PRs and run read-only checks. No agent enters a password, key or token, and no secret value goes into this doc, a PR or chat.

**Labels stay "staging" for the launch.** The release lane, the `justgo-staging` GitHub environment, `APP_ENVIRONMENT=staging`, the backup bucket and prefixes, and the mobile Sentry environment all keep the name "staging". The names are labels on the one real project. Renaming them touches the release lane, the backup policy, R2 rules, a Sentry monitor and a new binary, so it waits until after launch ([PC-9 to PC-11](#after-launch)). The first App Store binary is then the exact TestFlight binary the phone checks ran on.

## Already done

Checked read-only on November 17, 2026, unless a date says otherwise.

| #106 item                           | Evidence                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolated production configuration   | Project `gcjmvtsisivxxorstvkb`, us-east-1, `ACTIVE_HEALTHY`, Postgres 17. The Canada project was deleted on November 16 ([US-10](supabase-us-move.md#us-10)).                                                                                                                       |
| No public grants on private schemas | The #212 grant sweep returned no rows. Gate [#212](https://github.com/anthonyyoo24/justgo/issues/212) is closed.                                                                                                                                                                    |
| Reviewed migrations applied         | `drizzle.__drizzle_migrations` holds 27 rows, 0000 to 0026, matching `apps/api/tests/db/fixtures/applied-migration-hashes.json` with nothing under `unapplied`. No SQL is pending.                                                                                                  |
| Restorable backup                   | The U.S. restore rehearsal passed on November 16 ([#522](https://github.com/anthonyyoo24/justgo/issues/522)). Database copy run [44178239922](https://github.com/anthonyyoo24/justgo/actions/runs/44178239922) and ledger runs 44178451337 and 44179272694 succeeded.               |
| Scheduler heartbeat                 | The backup clock Worker `justgo-staging-backup-clock` dispatches the database copy daily and the ledger hourly. The `justgo-identity-retention` job is active at minute 17 of each hour.                                                                                            |
| Readiness alert                     | `/ready` returns `{"status":"ready"}`. Sentry uptime monitor [10773615](https://anthony-corp.sentry.io/monitors/10773615/) checks it every minute, and Anthony confirmed its failure and recovery emails ([readiness monitor](../operations/TESTFLIGHT_BETA.md#readiness-monitor)). |
| Retired incompatible writers        | Canada is deleted, and the Vercel arrangement is closed ([#123](https://github.com/anthonyyoo24/justgo/issues/123)). The `api` function on the U.S. project is the only writer.                                                                                                     |
| Apple sign-in production settings   | Native Apple sign-in uses the production bundle `com.anthonyyoo.justgo` with nonce validation on. It needs no Services ID or client secret, so nothing expires ([Configure Apple sign-in](../operations/ACCOUNT_SYNC_SETUP.md#configure-apple-sign-in)).                            |

## Not applicable or deferred

| #106 item                       | Why                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinated contraction cutover | No contraction migration is pending, and no old client holds real data. For later releases the rule stays. After a contraction, never roll the old API back alone. Repair forward ([Failures](../operations/SERVER_RELEASES.md#failures-and-uncertain-outcomes)).                                                                                 |
| Retired old clients             | No one outside Anthony uses the app. TestFlight builds before build 8 pointed at the deleted Canada project.                                                                                                                                                                                                                                      |
| Paid-plan budgets               | Deferred. The database stays on Supabase Free, Sentry stays on its current plan, and billing waits for Phase 16 ([#110](https://github.com/anthonyyoo24/justgo/issues/110), [#118](https://github.com/anthonyyoo24/justgo/issues/118)). The [Pro upgrade triggers](../operations/TESTFLIGHT_BETA.md#supabase-pro-upgrade-triggers) stay in force. |
| Guarded migration release (#98) | Deferred to the first release with pending SQL, [PC-8](#pc-8). No SQL is pending, so it does not block launch.                                                                                                                                                                                                                                    |
| Renaming the staging labels     | Deferred to after launch, [PC-9 to PC-11](#after-launch).                                                                                                                                                                                                                                                                                         |

## Before launch

<a id="pc-1"></a>

### PC-1. Publish the Google consent screen

**Who.** Anthony. **Anthony's go.** Yes, a Google setting.

The consent screen is External and Testing, so only the allowlisted owner email can sign in with Google. Every other user fails.

- [ ] In [Google Auth audience](https://console.cloud.google.com/auth/audience?project=justgo-512319), choose **Publish app** to move it to In production. The scopes are `openid`, `profile` and `email` only, so Google should not ask for sensitive-scope review. If it asks for brand verification, finish it on [Branding](https://console.cloud.google.com/auth/branding?project=justgo-512319) with the app name, logo and the published [Privacy](https://justgo-legal.anthonyyoo24.workers.dev/privacy/) and [Terms](https://justgo-legal.anthonyyoo24.workers.dev/terms/) links.
- [ ] Update the Google clients row in [ACCOUNT_SYNC_SETUP.md](../operations/ACCOUNT_SYNC_SETUP.md) in the next PR that touches it.

**Check.** The audience page shows In production. A Google account that is not the owner's signs in on the TestFlight build.
**Rollback.** Back to Testing on the same page.

<a id="pc-2"></a>

### PC-2. Check Supabase Auth and Data API settings

**Who.** Anthony reads, an agent records. **Anthony's go.** Only if a setting must change.

The security advisor's one warning is leaked-password protection, which matters only when the Email provider is on. The app signs in only with Apple and Google.

- [ ] In [Auth providers](https://supabase.com/dashboard/project/gcjmvtsisivxxorstvkb/auth/providers), only Apple and Google are on. Email, Phone and anonymous sign-ins are off.
- [ ] In [Data API settings](https://supabase.com/dashboard/project/gcjmvtsisivxxorstvkb/settings/api), the exposed schemas exclude `justgo`, `justgo_auth_private` and `drizzle` (the November 10 comment on #106).

**Check.** Two screenshots or a written read-back on #106.
**Rollback.** Not needed for a read. Turn a changed setting back on the same page.

<a id="pc-3"></a>

### PC-3. Turn on API fault delivery to Sentry

**Who.** Anthony sets the secret, an agent dispatches the run and checks. **Anthony's go.** Yes, a function secrets run.

API error reporting is off (`API_SENTRY_ENABLED` defaults to `false`). Without it, a server fault reaches no one. This closes gate [#93](https://github.com/anthonyyoo24/justgo/issues/93).

- [ ] Anthony adds `API_SENTRY_ENABLED=true` and the `justgo-api` DSN from [Sentry project settings](https://anthony-corp.sentry.io/settings/projects/justgo-api/keys/) to the `STAGING_FUNCTION_SECRETS` secret in the [`justgo-staging` environment](https://github.com/anthonyyoo24/justgo/settings/environments).
- [ ] With his go, run `pnpm run release:staging:local --tag <current-tag> --operation secrets` ([Function secrets](../operations/SERVER_RELEASES.md#function-secrets)). The receipt lists names only.
- [ ] Send one controlled, sanitized 5xx and see it arrive in [`justgo-api` issues](https://anthony-corp.sentry.io/issues/?project=justgo-api) with no user data. Record the Sentry plan's quotas and retention on #93.

**Check.** The Sentry event link and the run receipt on #93.
**Rollback.** Set `API_SENTRY_ENABLED=false` and rerun `secrets`.

<a id="pc-4"></a>

### PC-4. Confirm alert and heartbeat delivery

**Who.** Anthony checks his inbox, an agent records. **Anthony's go.** No.

- [ ] The ledger copies failed hourly on November 17 from 00:23 until 21:17. Confirm the missed-run email from the `justgo-staging-backup-health` cron monitor arrived ([Sentry crons](https://anthony-corp.sentry.io/crons/)). If it did not, file a bug.
- [ ] Confirm Supabase usage emails reach Anthony for the free-plan limits ([project overview](https://supabase.com/dashboard/project/gcjmvtsisivxxorstvkb)).

**Check.** A line on #106 with the email dates.
**Rollback.** None needed.

<a id="pc-5"></a>

### PC-5. Retire the test-data waiver

**Who.** Agent PR. **Anthony's go.** No.

[SERVER_RELEASES.md](../operations/SERVER_RELEASES.md#pending-migrations-and-recovery-evidence) says to retire the test-data waiver "before outside testers store real journals". After launch the project holds real journals, so a waiver is never true again.

- [x] Remove the `test-data-waiver` path from `apps/api/scripts/staging-release-guard.ts`, its tests and the doc. A pending migration then needs a genuine `STAGING_RECOVERY_ATTESTATION` ([PC-8](#pc-8)). Done in [#540](https://github.com/anthonyyoo24/justgo/pull/540).

**Check.** The guard test that fed a waiver now fails closed. `pnpm run test:db` and the release-script tests pass on CI.
**Rollback.** Revert the PR.

<a id="pc-6"></a>

### PC-6. Decide Anthony's test accounts

**Who.** Anthony decides. **Anthony's go.** Only to delete.

[Auth users](https://supabase.com/dashboard/project/gcjmvtsisivxxorstvkb/auth/users) holds two accounts, both Anthony's (Apple and Google). Keeping them is fine. To start clean, delete each with the in-app account deletion, which leaves its receipts and tombstones, never from the dashboard.

- [ ] Anthony's answer recorded on #106.

**Check.** The answer, and the `auth.users` count after any deletion.
**Rollback.** None after a deletion. That is why it needs his go.

<a id="pc-7"></a>

### PC-7. Pick, label and submit the launch build

**Who.** Anthony submits. **Anthony's go.** Yes, App Privacy publication and App Store submission.

- [ ] Choose the binary. It is the TestFlight build that passes the phone checks #79 to #92 after the access screen is removed. A `beta` build has crash reporting off. A `beta-diagnostics` build sends app errors ([Optional crash-reporting profile](../operations/TESTFLIGHT_BETA.md#optional-crash-reporting-profile)). We recommend launching with the build the checks ran on, and choosing `beta-diagnostics` for it only if #92 can pass first.
- [ ] Finish and publish [App Privacy](https://appstoreconnect.apple.com/apps/6821022390/distribution/privacy) to match that build ([#94](https://github.com/anthonyyoo24/justgo/issues/94)).
- [ ] Submit it from [App Store Connect](https://appstoreconnect.apple.com/apps/6821022390), with the listing, screenshots and reviewer notes from [#107](https://github.com/anthonyyoo24/justgo/issues/107).

**Check.** The App Store Connect status, and the public listing once released.
**Rollback.** Remove the version from sale in App Store Connect. The server needs no change.

## After launch

<a id="pc-8"></a>

### PC-8. First migration release (#98)

**Who.** Agent with Anthony. **Anthony's go.** Yes, a hosted migration.

- [ ] Run the first release with pending SQL through `migrate-deploy` with a genuine attestation from the R2 receipts and restore ([#98](https://github.com/anthonyyoo24/justgo/issues/98)).
- [ ] Right after it, dispatch [database copy](https://github.com/anthonyyoo24/justgo/actions/workflows/database-backups.yml) by hand. On November 17 the hourly ledger failed for 21 hours because migration 0026 had no fresh database copy behind it.

**Check.** The lane receipt, the new database copy run, and the next ledger run green.
**Rollback.** Repair forward. Never downgrade the schema.

<a id="pc-9"></a>

### PC-9. Optional. Name the API environment production

**Who.** Agent PR, then Anthony. **Anthony's go.** Yes, a function secrets run.

- [ ] One PR teaches the lane `APP_ENVIRONMENT=production`. It changes `functionSecretRules` and the `x-justgo-environment` probe in `scripts/release/staging-api.mjs`, and their tests.
- [ ] With his go, set `APP_ENVIRONMENT=production` and rerun `secrets`. API Sentry events then carry `production`.

**Rollback.** Set it back to `staging` and rerun `secrets`.

<a id="pc-10"></a>

### PC-10. Optional. Rename the backups

**Who.** Agent PR, then Anthony. **Anthony's go.** Yes, Cloudflare and Sentry settings.

The policy's `environment` sets the R2 prefixes (`production/database/`, `production/ledger/`) and the cron monitor slug (`justgo-production-backup-health`). The cron-history exception in `scripts/backups/configuration.mjs` names `staging`.

- [ ] One PR updates the policy, the exception and the mint scope.
- [ ] Anthony adds lock and expiry rules for the new prefixes in [R2](https://dash.cloudflare.com/52662d8ba7ae983237860a1719c66a1e/r2/overview), creates the new cron monitor, and replaces the policy digest in the `database-backups` environment.
- [ ] The old `staging/` objects expire on their own 7-day rules.

**Rollback.** Restore the old policy and digest.

<a id="pc-11"></a>

### PC-11. Optional. Relabel the mobile build

**Who.** Agent PR, then Anthony. **Anthony's go.** Yes, a new build and App Store submission.

- [ ] Set `EXPO_PUBLIC_SENTRY_ENVIRONMENT=production` in `apps/mobile/eas.json` and `scripts/release/check-beta.mjs`, or move the submit to the `production` EAS profile with matching [EAS variables](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/environment-variables). It ships with the next app update.

**Rollback.** Ship the next build with the old label.

## Incident and replay notes

These docs already hold the procedures. Use them in this order.

1. **App down.** Monitor 10773615 emails Anthony. Read `/ready` and the function logs, then [Failures and uncertain outcomes](../operations/SERVER_RELEASES.md#failures-and-uncertain-outcomes). Redeploy the previous tag only when no migration ran.
2. **Bad release with a migration.** Repair forward with a new release. Never restore a snapshot over accepted writes.
3. **Lost or damaged data.** Follow the [restore checklist](../operations/CLOUDFLARE_BACKUPS.md#restore-checklist). Restore the database copy, replay the ledger so deletions and revocations made after it hold, and keep writers closed until the checklist passes.
4. **Backup alert.** Read the failed run in [database backups](https://github.com/anthonyyoo24/justgo/actions/workflows/database-backups.yml). After a hosted migration, the first fix is a manual database copy ([PC-8](#pc-8)).
5. **Free-plan limit.** Ask Anthony about Pro under the [upgrade triggers](../operations/TESTFLIGHT_BETA.md#supabase-pro-upgrade-triggers).

## Order

1. PC-2, PC-4 and PC-5 any time now. They need no go, except a PC-2 change.
2. PC-1, PC-3 and PC-6 with Anthony, before the launch build is submitted.
3. PC-7 last, after the phone checks pass. Close #106 with links to PC-1 to PC-7.
4. PC-8 at the first release with SQL. PC-9 to PC-11 when Anthony wants the labels.

## Risks

- **Free-project pause.** Supabase pauses free projects that sit idle. The readiness monitor and backup clock reach the project every hour or more often, so it is not idle.
- **Google review.** Publishing may trigger brand verification and a delay. Start PC-1 first.
- **Silent server faults.** Until PC-3, a server error reaches no one.
