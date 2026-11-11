# JustGO TestFlight beta

This guide owns the build and upload procedure. The
[External beta](https://github.com/anthonyyoo24/justgo/milestone/1) gates own acceptance.
[Apple setup](APPLE_SETUP.md) owns accounts and signing. The
[approval record](../legal/APPROVALS.md) and [data inventory](../legal/DATA_INVENTORY.md) own publication and provider conditions.
Preparation does not establish signed-build acceptance or authorize distribution.

## Target and cutover status

App Store Connect app `6821022390` (SKU `justgo-ios`) is named **JustGo: Ditch
Dating Apps**. Preserve bundle `com.anthonyyoo.justgo`, Apple team `NPDYTJS425` and
Expo project `@anthonyyoos-team/justgo` (`53cf0560-8ab5-446a-9bc6-deb193b337b5`).
The installed app and Expo project keep the JustGO name and identity.

As of October 30, 2026 (owner statement), JustGO has no users besides Anthony, so
cutovers need no external-user transition period. Reassess once external testers
are invited.

`build.beta` is a store-signed release build that uses EAS **preview** variables.
The beta preflight and every TestFlight workflow command still select the retired
Worker at `https://justgo-api-staging.anthonyyoo24.workers.dev`, so a beta build
made before P15-11 of the
[Phase 15 plan](../implementation-plan/phase-15-supabase-api.md) targets that
retired Worker. TestFlight submissions already need Anthony's go. Installed build 5 still
uses `https://justgo-two.vercel.app`. The Dev profile and its installed build also
keep their Vercel target until a coordinated migration or retirement.

Store signing does not select a paid production API. Preview reuses the verified
public Auth, Google and CloudKit settings. Never put private server credentials in
that environment or in an `EXPO_PUBLIC_` variable. Paid production setup is
separate. Keep the inline CloudKit container and environment pair together,
because EAS evaluates the dynamic app config once, before it fetches the remote
preview variables.

## Optional crash-reporting profile

The `beta` and `development` profiles keep app crash reporting off. The optional
`beta-diagnostics` profile keeps the same store identity, staging services and
signing, and turns on only the filtered Sentry crash and error path. Product
analytics, replay, tracing, profiling and attachments stay disabled. Native Sentry
settings are compiled into the binary, so an over-the-air JavaScript disable does
not stop native reporting in a build made with it on.

The workflow's `diagnostics` input defaults to `false`. Select `true` for both the
Phase 15 build run and its submit run, to keep build 5's approved essential-error
reporting. The default off path would change that behavior and needs its own
disposition.

The protected `testflight-beta` environment holds
`BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION`, which must match the actually
published Privacy version. It also holds the Sentry `org:ci` token that Anthony
approved on October 27, 2026, as `SENTRY_AUTH_TOKEN`, for the mandatory source-map
and dSYM uploads. The Cloudflare candidate needs the approved full-cutover notice
described below. The approved versions are in the [approval record](../legal/APPROVALS.md).

An internal TestFlight upload does not pass the open native crash, cache,
envelope and symbolication checks, or invite anyone. Gate
[#92](https://github.com/anthonyyoo24/justgo/issues/92) holds them, including
the skipped deliberate crash test. Outage behavior and cached-crash attribution
also stay unverified before external testing. The
[data inventory](../legal/DATA_INVENTORY.md) keeps the outage acceptance. Never add a crash trigger without a new owner
instruction.

## Preflight and release procedure

The three Worker and Cloudflare steps below are retired. Do not build the Phase 15
candidate from them. P15-9 to P15-11 of the
[Phase 15 plan](../implementation-plan/phase-15-supabase-api.md) replace them
with the Supabase function, its notice and the build switch. The steps stay here
as history until P15-11 rewrites this section.

Before building the Phase 15 candidate:

- Verify the actual staging Worker through its protected release lane and
  preserve its source identity and authenticated-data checks.
- Publish the complete approved [full-cutover notice](../legal/CLOUDFLARE_NOTICE_REVIEW.md)
  under the [cutover procedure](CLOUDFLARE_CUTOVER.md): complete every required
  approval and legal-artifact preflight before retiring owner-only old builds
  and Vercel API/legal roles, then immediately publish/verify Cloudflare legal
  pages and update ASC/EAS URLs. Anthony accepted the brief legal-URL gap on
  October 31, 2026.
  No external-user transition period or legacy redirect is selected; the final
  Cloudflare-only notice follows the end of Vercel's roles. Its backup statements
  must match activated and verified recovery services. The new Privacy source
  needs approved publication/date metadata and
  `<!-- deployment-host: cloudflare -->`; the existing Vercel notice does not
  authorize this build.
- Set EAS preview `EXPO_PUBLIC_PRIVACY_POLICY_URL` and `EXPO_PUBLIC_TERMS_URL`
  to the actual verified Cloudflare legal addresses, and update the protected
  `BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION` to the exact published Privacy
  version. Verify anonymous HTTPS content before treating these settings as
  publication evidence.

From `apps/mobile`, check the resolved remote public settings for the
reporting-enabled candidate:

```sh
EXPO_PUBLIC_SENTRY_ENABLED=false pnpm dlx eas-cli@25.3.0 env:exec preview 'RELEASE_DIAGNOSTICS=true EXPO_PUBLIC_SENTRY_ENABLED=true pnpm --dir ../.. run release:beta:check' --non-interactive
```

[`scripts/release/check-beta.mjs`](../../scripts/release/check-beta.mjs) owns the
checks. It prints names, never credential values. A pass does not prove hosted
notices, provider suitability, native behavior or release approval.

Keep the outer `EXPO_PUBLIC_SENTRY_ENABLED=false`. EAS reads the app config to find
the project before `env:exec` fetches the preview variables, and an enabled flag
with no remote DSN yet stops project resolution. The inner command then applies
the selected mode.

The manual [`testflight-beta.yml`](../../.github/workflows/testflight-beta.yml)
workflow compiles on GitHub's standard `macos-26` runner through EAS local builds.
Standard runner compute is free for this public repository, and this route uses no
Expo cloud-build quota. Do not add paid or larger runners by default. Maintain the
workflow when runner images, Xcode, Expo or signing requirements change. EAS
allocates build numbers remotely. Never reset the remote sequence when you retry.

Use this order:

1. Configure `testflight-beta` with Anthony as a required reviewer and `main` as
   its allowed deployment branch. The workflow checks the actual protection before
   any Expo token step. YAML alone is not protection.
2. The owner-approved Expo robot `justgo-beta-builder` has Developer access to the
   organization's projects. Its token is stored only as `EXPO_TOKEN` in this
   protected environment. It is not a project-scoped token or the owner's personal
   session. Revoke it in Expo when you retire the automation, and never copy it into
   source or logs. The App Store profile `U362DZ236F` and the distribution
   certificate are configured. The Developer-role App Store Connect key
   `UYPTP25HP4` is assigned in EAS to the Apple team, and its private file was
   deleted after import. Keep signing credentials out of the repository.
3. With Anthony's go for the build, publish a reviewed tag on `main` and wait for
   successful Foundation **main push** checks on its exact SHA.
4. Dispatch from `main` with that tag and operation `build`. Leave `build_run_id`
   empty and `diagnostics` false unless you use the optional profile above. Review
   the candidate SHA before you approve the environment job. The job signs the app
   without uploading it and saves `JustGO.ipa` and `manifest.json`. Record the
   GitHub run ID, artifact ID and archive digest from the job summary.
5. Inspect the signed IPA: source provenance, identity and entitlements, store
   distribution, embedded JavaScript, local artwork, Inter, public configuration,
   privacy manifests and the absence of development or fixture behavior. The
   automated inspector covers signature, profile, identity, Production CloudKit,
   Apple sign-in, device target, fonts, icon and embedded JavaScript. Review the
   configuration and privacy manifests yourself. Exports do not establish
   installed behavior.
6. Verify that App Store Connect has no unintended automatic tester distribution.
   With Anthony's go for the upload, dispatch `submit` with the same tag,
   diagnostics mode and exact successful `build_run_id`. An expired or missing
   artifact needs a new build with a new build number. If an upload is interrupted
   or its outcome is uncertain, check the EAS submission and Apple's builds before
   you dispatch another upload.
7. After Apple processes the build, run the TestFlight phone acceptance below.
   Groups, invitations, external Beta App Review and App Store submission are
   separate actions.

The owner-selected navy GO mark on cream is the opaque 1024-pixel store icon at
`apps/mobile/assets/brand/justgo-app-icon.png`. Gate
[#89](https://github.com/anthonyyoo24/justgo/issues/89) holds its phone check.

## Current build

The installed TestFlight build is **0.1.0 (5)**, from merged
[PR #59](https://github.com/anthonyyoo24/justgo/pull/59), source
`311f07323fdaacfe868b5a18dce4b2f516923783` and tag `testflight-beta-2026-10-27-2`.
Its [build run](https://github.com/anthonyyoo24/justgo/actions/runs/40587250274)
and [upload run](https://github.com/anthonyyoo24/justgo/actions/runs/40591517008)
succeeded. The IPA SHA-256 is
`96ddd076399fac183b16f704d485437a4e9f720a71f72d61dbc43051eff830fa`. Signature,
store identity, Production CloudKit, public staging and diagnostics configuration
and all 18 privacy manifests passed inspection. The main native UUID and the
embedded JavaScript debug ID match the symbols and source maps stored in Sentry.
The internal **Owner validation** group has one tester and manual distribution.
No external review or invitation has happened.

Anthony deferred the physical-phone walkthrough on October 26, then reported that
build 5 "looks fine". Treat that as a general smoke, not a pass of any device gate.

The legal notices for build 5 are at
[Privacy](https://justgo-legal.vercel.app/privacy/) and
[Terms](https://justgo-legal.vercel.app/terms/), and both URLs are set in EAS
preview. The App Store Connect Privacy Policy URL must move to the verified
Cloudflare address during the cutover.

## Tester and reviewer package

Start with Anthony as the internal tester. Install the selected build through
Apple's TestFlight app, over the existing phone data. Then turn off the Mac's dev
server to test a standalone launch. Use disposable data for destructive cases.

- Browse venues, skip and accept, and give up. Give up records no completed rep.
- Complete once, save optional feelings and a reflection, and check Progress and
  day editing.
- After online beta approval, test an offline completion and save, and a
  saved-history relaunch. Then reconnect and verify same-owner synchronization
  without duplicates. New starts end at the server-issued expiry, and saved history
  stays readable. Unfinished challenges live in memory and are not promised to
  survive a force quit.
- Run the remaining native Files and iCloud, login and logout, account isolation,
  deletion, storage protection and accessibility cases in the signed-build
  [`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate)
  #80 to #86.
- Report the build, device and iOS version, the reproduction steps and the
  connectivity. Keep private writing, credentials and backup contents out of
  screenshots and feedback.

Beta description saved in App Store Connect:

> JustGO offers small real-world social challenges. Choose a venue, try a
> challenge, and optionally save how it went. Progress shows completed
> challenges and saved reflections. You can use the app without signing in; optional
> Apple or Google sign-in synchronizes your account journal. This beta provides
> free access during its testing period. Purchases are disabled.

Reviewer notes saved in App Store Connect:

> Continue offers guest use without a required account. Apple/Google sign-in is
> optional for account synchronization. Private iCloud Sync is optional and off by
> default, separate from account sync and manual backup files. Purchases, JustGO
> product analytics and ordinary Sentry delivery are disabled. This build uses
> application staging with server-authorized, time-limited free beta access. Guest
> access is currently configured through November 10, 2026 at 15:23 UTC. Use
> disposable entries for testing; never use the owner's real provider credentials.

These notes describe build 4. Before the external review of a diagnostics-enabled
build, update their Sentry sentence. Purchases and product analytics stay
disabled.

The feedback email and privacy URL are saved. Anthony gave the review-contact
phone to Apple directly, so it is not recorded here. Sign-in Required stays
unchecked because guest use is available. These Test Information fields do not
finish App Privacy or request beta review.

Gate [#97](https://github.com/anthonyyoo24/justgo/issues/97) owns the cohort,
dates and invitations. To stop a tester's access, keep their `BETA_ACCESS_GRANTS`
entry and set its `revokedAt`. Do not remove the entry, because its interval keeps
the completions they started inside it uploadable.

## Beta operating controls

These controls run in the staging Supabase project and in Sentry. Their settings
live in those services, not in this repository.

### Identity retention job

The operator migration `enable_beta_identity_retention` enabled `pg_cron`. Job
`justgo-identity-retention` runs hourly at minute 17. It connects as the existing
`postgres` scheduler login, runs `SET LOCAL ROLE justgo_migrator` inside a
transaction and calls `justgo.purge_expired_identity_records(1000)` with a
five-second statement limit. To stop it, call `cron.alter_job` with the job name.
Never edit the cron tables directly. No hosted schedule runs `auth:cleanup`, and
any other hosted schedule needs Anthony's separate approval.

### Readiness monitor

Sentry uptime monitor [10773615](https://anthony-corp.sentry.io/monitors/10773615/)
checks the public staging `/ready` over HTTPS every minute, with a five-second
timeout and no account credentials. A check passes only on a successful HTTP
status with JSON `status: ready`. Three failures in a row open an issue, and one
success resolves it. The API and mobile Sentry projects email Anthony on new
issues, regressions and recoveries. Anthony confirmed receipt of the test email
and of a controlled monitor failure and recovery. The monitor uses the plan's one
included monitor.

### Supabase Pro upgrade triggers

The database stays on Supabase Free. Ask Anthony to approve Pro (US$25 a month)
when any of these happens:

- The database nears 400 MB of its 500 MB limit.
- Monthly egress nears 5 GB.
- A pause or capacity incident occurs.
- Revenue comfortably covers the cost.

## Remaining prerequisites

The [`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate)
hold every open check before external testers, including the Vercel arrangement
([#123](https://github.com/anthonyyoo24/justgo/issues/123)), App Privacy
([#94](https://github.com/anthonyyoo24/justgo/issues/94)), deployed fault delivery
to Sentry ([#93](https://github.com/anthonyyoo24/justgo/issues/93)), migration
acceptance ([#98](https://github.com/anthonyyoo24/justgo/issues/98)) and backups
([#104](https://github.com/anthonyyoo24/justgo/issues/104)). Keep each open until
its evidence lands.

Anthony's authorization covers filtered Sentry errors, the included uptime and
email alerts and protected deployment preparation. It authorizes no paid upgrade
or purchase. Uploads, TestFlight distribution and outside-service settings changes
need Anthony's go first, as the [Git and autonomy](../../AGENTS.md#git-and-autonomy)
rules say.

References: [Expo profiles](https://docs.expo.dev/build/eas-json/),
[versions](https://docs.expo.dev/build-reference/app-versions/),
[TestFlight](https://docs.expo.dev/submit/testflight/),
[Apple overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/),
[GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
