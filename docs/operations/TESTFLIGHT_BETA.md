# JustGO TestFlight beta

This guide owns the prepared build/upload procedure. The
[Phase 14 plan](../implementation-plan/phase-14-release.md) owns acceptance;
[Apple setup](APPLE_SETUP.md) owns accounts/signing, and the
[legal review](../legal/LEGAL_REVIEW.md) owns publication/provider conditions.
Preparation does not establish signed-build acceptance or authorize distribution.

## Target and cutover status

App Store Connect app `6821022390` (SKU `justgo-ios`) is named **JustGo: Ditch
Dating Apps**. Preserve bundle `com.anthonyyoo.justgo`, Apple team `NPDYTJS425` and
Expo project `@anthonyyoos-team/justgo` (`53cf0560-8ab5-446a-9bc6-deb193b337b5`).
The installed app and Expo project retain the JustGO name/identity.

`build.beta` is a store-signed release build using EAS **preview** variables.
Its Phase 15 candidate, the beta preflight and all TestFlight workflow commands
now select `https://justgo-api-staging.anthonyyoo24.workers.dev`. This target uses
the verified Cloudflare account subdomain; no Worker or Hyperdrive deployment
has been accepted yet. Installed build 5 still uses
`https://justgo-two.vercel.app`. The separate Dev profile and its installed
build also retain their existing Vercel target pending a coordinated migration
or retirement disposition.

Store signing does not select the paid production API. Preview reuses the
verified public Auth/Google/CloudKit settings, with ordinary Sentry delivery
disabled unless the diagnostics profile is selected. Never put
private server credentials in that environment or an `EXPO_PUBLIC_` variable.
EAS is pinned to `25.3.0`; remote versions and beta/production build increments
prevent repeated store build numbers. Paid production setup remains separate.
Keep the inline CloudKit container/environment pair together: EAS evaluates the
dynamic app config once before fetching the remote preview variables.

## Optional crash-reporting profile

The ordinary `beta` and `development` profiles keep app crash reporting off.
The optional `beta-diagnostics` profile inherits the same store identity,
application-staging services and signing configuration, enabling only the existing
filtered Sentry crash/error path. Installed TestFlight build 4 remains off; this
profile requires a new signed build and does not change that installed binary.
Product analytics, replay, tracing, profiling and attachments remain disabled.

The manual workflow's `diagnostics` input defaults to `false`. Select `true` for
both the Phase 15 build run and its later submit run to retain installed build 5's
approved essential-error reporting. Selecting the default off path would change
that behavior and needs its own disposition. Preflight
requires the reviewed mobile US project DSN, staging diagnostic environment and
the approved essential-errors Privacy Policy source. Anthony approved that policy
and publication on October 27, 2026: version `2026-10-27-essential-errors`, effective
October 27. Anonymous HTTPS reads on October 27 matched the approved generated
Privacy bytes; Terms was unchanged. Those are historical build-5 receipts. The
Cloudflare candidate requires the newly approved transition notice described
below. `BETA_DIAGNOSTICS_PUBLISHED_NOTICE_VERSION` in the protected
`testflight-beta` environment must match that notice's actual published version.
Reporting-enabled builds also require
private `SENTRY_AUTH_TOKEN` there for mandatory source-map/dSYM uploads. On
October 27, the owner-approved `org:ci` token was created, verified with Sentry
CLI and stored in that protected environment; the matching published-notice
variable was also verified. Actual build 5 subsequently passed the native build
and exact symbol/provider matching described below. No upload bypass is permitted.

Manifest schema 2 records the exact selected profile and diagnostics mode alongside
the existing source/run/signature and file-hash checks. Submit must match that
mode and upload the exact verified artifact. Original schema-1 artifacts remain
valid only for the ordinary off route. The existing protected environment review
continues to approve builds and uploads separately.

Upload the reviewed store-signed artifact for internal TestFlight testing before
performing phone acceptance. Native crash/restart delivery, cache and envelope
privacy, symbolication, outage behavior and cached-crash attribution remain
unverified checks before external testing. The owner explicitly skipped the
deliberate native crash test on October 27; preserve that waiver and do not
reintroduce a crash trigger without new direction. A non-fatal event can inspect
the shared native filtering/envelope path, but not the skipped fatal cache/restart
path. An internal upload does not mark these checks passed or invite outsiders.

## Preflight and release procedure

Before building the Phase 15 candidate:

- Verify the actual staging Worker through its protected release lane and
  preserve its source identity and authenticated-data checks.
- Approve and publish the complete [transition notice](../legal/CLOUDFLARE_NOTICE_REVIEW.md)
  naming Cloudflare and Vercel while old builds still use Vercel. Its backup
  statements must match activated and verified recovery services. The new
  Privacy source needs approved publication/date metadata and
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
EXPO_PUBLIC_SENTRY_ENABLED=false npm exec --yes --package=eas-cli@25.3.0 -- eas env:exec preview 'RELEASE_DIAGNOSTICS=true EXPO_PUBLIC_SENTRY_ENABLED=true npm --prefix ../.. run release:beta:check' --non-interactive
```

The check verifies the explicit store profile, known staging API/Auth project,
provider/CloudKit inputs, the selected diagnostics mode, no fixture markers and public
HTTPS notice destinations. It reuses the site's production parser and Cloudflare
approval guard: pending dates, unapproved text or a missing host approval stop
the process. It prints names, never credential values.
`RELEASE_OPERATION=submit` additionally checks the App Store ID/team. A pass does
not prove hosted notices, provider suitability, native behavior or release approval.

EAS reads the app configuration to identify the project before `env:exec` fetches
preview variables. Keep the workflow's initial `EXPO_PUBLIC_SENTRY_ENABLED` false
while that configuration has no remote DSN. Each inner `env:exec` command then
applies `RELEASE_DIAGNOSTICS` after preview loads, so the preflight, native build
and upload still use the selected mode. Enabling the initial flag instead stops
project resolution before the diagnostic configuration can be fetched.

Preflight follows pinned EAS 25.3.0 iOS resolution: inherit common and iOS settings
and their environment maps first, then apply the resolved iOS overrides. Identity,
services, diagnostics and upload-bypass checks use that effective environment.
Keep CloudKit container/environment overrides paired at both common and iOS
levels. Upload credentials and publication attestation belong only to the trusted
external environment, never a committed profile environment map.

The `.github/workflows/testflight-beta.yml` is manual only; tag pushes do not
build/upload. It compiles on GitHub's standard `macos-26` runner through EAS local
builds, with Xcode 26.6, pinned Node/npm and EAS 25.3.0. This public repository's
standard runner compute is free; saved artifacts have separate storage limits.
The Expo framework, preview variables, managed signing and remote build-number
allocation remain in use. This route does not consume Expo cloud-build quota.
Install the exact EAS CLI directly in the disposable runner before invoking it.
An outer `npm exec --package=eas-cli` exports package-selection settings that break
the local builder's own nested `npx` command. The first GitHub attempt verified
tools, preview configuration and Apple profile access, but stopped at that helper
launch before compilation. Its allocated build number 2 remains consumed; never
reset the remote sequence when retrying.

Use this order:

1. Configure `testflight-beta` with Anthony as a required reviewer and `main` as
   its allowed deployment branch. Actual protection is checked before any Expo
   token step; absent/unreadable protection fails closed. YAML alone is insufficient.
2. The owner-approved Expo robot `justgo-beta-builder` uses Developer access
   (publish/view the organization's projects), and its validated token is stored
   only as `EXPO_TOKEN` in this protected environment. It is not a project-scoped
   token or the owner's personal session. Rotate/revoke it in Expo when retiring
   the automation; never copy it into source or logs. The existing App Store
   profile `U362DZ236F` and distribution certificate are configured. The approved
   Developer-role App Store Connect key `UYPTP25HP4` is assigned in EAS to the
   existing Apple team; its private file was removed after import. Keep signing
   credentials out of the repository. `--freeze-credentials` prevents automated
   provisioning-profile replacement.
3. Obtain the applicable Git/build authorization, publish a reviewed tag on `main`,
   and wait for successful Foundation **main push** checks on its exact SHA.
4. Dispatch from `main` with that tag and operation `build`, leaving `build_run_id`
   empty and `diagnostics` false unless using the optional profile above. Review
   the immutable candidate SHA before approving the environment job.
   The job compiles/signs on GitHub without uploading to Apple, verifies the signed
   app and saves `JustGO.ipa` plus `manifest.json` for seven days. Record the exact
   GitHub run ID, artifact ID and archive digest from the job summary. This route
   does not create an EAS cloud build ID.
5. Inspect the actual signed IPA: source provenance, identity/entitlements, store
   distribution, embedded JavaScript/local artwork/Inter, public configuration,
   privacy manifests and absence of development/fixture behavior. The automated
   inspector checks signature/profile, identity, Production CloudKit, Apple sign-in,
   device target, fonts, icon and embedded JavaScript. Detailed configuration and
   privacy review remain necessary; exports do not establish installed behavior.
6. Verify App Store Connect has no unintended automatic tester distribution.
   Obtain the applicable upload authorization, then dispatch `submit` with the same
   tag, diagnostics mode and exact successful GitHub `build_run_id`. The gate requires this repository's
   successful manual main workflow, current run attempt and unexpired artifact.
   It verifies GitHub's archive digest before extraction, then the manifest's source,
   tag, workflow/run identity, IPA size/hash and actual native signature/profile.
   Submission uses that verified file with `--path`, never `--latest`. Expired or
   missing artifacts require a new build with a new remote build number.
   If an upload is interrupted or its outcome is uncertain, check the EAS
   submission and Apple's existing version/build before dispatching another upload.
7. After Apple processes the uploaded build, perform the actual TestFlight phone
   acceptance below. Submission disables EAS's automatic tester-group setup. Groups/invitations,
   external Beta App Review and public App Store submission remain separate actions.

The owner-selected navy GO mark on cream is configured as an opaque 1024-pixel
store icon at `apps/mobile/assets/brand/justgo-app-icon.png`; the existing branded
splash is retained. Verify the icon on the phone alongside native font/splash
acceptance. See [icon provenance](../../design/source/app-icon.md).

Environment protection, the robot token and App Store signing/submission
credentials are configured. PR #49 merged into `main` at `04f7b20`; its first
protected cloud-build attempt stopped at Expo's exhausted free iOS allowance
before compilation. No IPA or Apple upload resulted. Remote build number 1 was
initialized; preserve automatic allocation rather than resetting it. The GitHub
Mac route replaces cloud compilation while preserving reviewed-source and
separate upload safeguards. Local workflow tests do not establish a hosted build
or signed-device acceptance.

The first successful GitHub Mac candidate is **0.1.0 (3)**, from `a380478` and
immutable tag `testflight-beta-2026-10-25-3`, after [PR #51](https://github.com/anthonyyoo24/justgo/pull/51)
and the launch fix in [PR #52](https://github.com/anthonyyoo24/justgo/pull/52).
The [build run](https://github.com/anthonyyoo24/justgo/actions/runs/40227572059)
passed native inspection and saved artifact `12611797931`. Downloaded archive and
IPA hashes matched GitHub metadata and the source/run manifest. IPA SHA-256:
`0ca3185ce8bbcd9edd5b23cc9a61af249caef82ee388ddcd2ef72dec33aabe60`.

All 14 venue/paper/Success images match source bytes; staging API/Auth, Google and
legal configuration match the reviewed environment. Hermes uses production mode,
Preview redirects and fixture markers are absent. Fonts/icon, store signing,
identity and restricted capabilities pass the automated native gate. Diagnostics
initialization is disabled; physical behavior and outbound privacy remain open.
The separate [upload run](https://github.com/anthonyyoo24/justgo/actions/runs/40229823125)
reverified provenance, hashes and signing, then successfully transferred that IPA
to Apple on October 25. Submission created no tester groups or invitations.
Apple subsequently processed build 3, and the existing internal **Owner
validation** group has one owner tester with that build installed. External
distribution and phone acceptance remain separate from successful upload.

The October 26 UI update is **0.1.0 (4)** from reviewed/merged [PR #55](https://github.com/anthonyyoo24/justgo/pull/55),
`main` commit `9bdd97734d8bc801847b28e21f8311be4d18277e` and immutable tag
`testflight-beta-2026-10-26-1`. Exact-source
[Foundation checks](https://github.com/anthonyyoo24/justgo/actions/runs/40418107224),
[GitHub Mac build](https://github.com/anthonyyoo24/justgo/actions/runs/40418884414)
and separate [upload](https://github.com/anthonyyoo24/justgo/actions/runs/40422595293)
passed. Artifact `12697329152` has archive SHA-256
`13903a5d24cb37811e1fad44b6e58b455e591c1466ace4f4ed0b3d3cc9781e24`;
the inspected IPA SHA-256 is
`0ebf9fb5b58f6fc92ff3d31b1e50afab87989fb2a607683afa3707e8b42a951d`.
Signature, identity, capabilities, staging configuration and all 14 artwork files
pass inspection. All 18 normalized privacy manifests match build 3, including
Google's eight linked data categories and Analytics purposes; this does not
establish runtime SDK behavior.

Apple processed build 4, its saved build-specific What to Test notes cover the
sheet/editor fixes, and the existing **Owner validation** group's Builds page
shows **Testing**. The group remains internal with one existing tester and manual
build distribution. No external groups, new tester invitations or external Beta
App Review request were created. Anthony deferred physical-phone checks for now;
this does not pass the complete device acceptance matrix. Later diagnostics and
server deployment evidence is recorded below; build 4's reporting mode is unchanged.

The October 27 diagnostics update is **0.1.0 (5)** from merged [PR #59](https://github.com/anthonyyoo24/justgo/pull/59), source `311f07323fdaacfe868b5a18dce4b2f516923783`, tag `testflight-beta-2026-10-27-2`.
The [GitHub Mac build](https://github.com/anthonyyoo24/justgo/actions/runs/40587250274) and separate [upload](https://github.com/anthonyyoo24/justgo/actions/runs/40591517008) succeeded. Exact IPA SHA-256 is `96ddd076399fac183b16f704d485437a4e9f720a71f72d61dbc43051eff830fa`; signature/store identity, Production CloudKit, public staging/diagnostics configuration and all 18 unchanged privacy manifests passed inspection. The main native UUID and embedded JavaScript debug ID match Sentry-stored symbols/source maps. Apple processed build `5740ba53-c8fb-406f-be28-fde95af5b6a5`; per-build and global notes are saved, and **Owner validation** shows **Testing**, still internal with one tester and manual distribution. No external review or invitations occurred. The matching [API release](https://github.com/anthonyyoo24/justgo/actions/runs/40585928393) is live and independent public health/protected-route probes passed.

Anthony subsequently reported that the TestFlight app **looks fine**. Record this as owner-reported general phone/UI smoke in the build-5 handoff context, without inferring an enumerated full test matrix. Physical offline/recovery/deletion/account-switch/two-device iCloud/accessibility checks, native crash/cache/final-envelope/symbolication and live deployed API fault-to-Sentry delivery remain open or owner-deferred. This does not close Phase 14 or external readiness.

The local builder fetches signing credentials into a run-owned private temporary
directory with restrictive permissions. Normal EAS cleanup and an `always()`
workflow cleanup remove temporary keychains and files; no signing inputs or build
working directories enter artifacts. GitHub discards the hosted machine afterward.
The successful build logged the actual keychain under the private temporary
directory, its destruction and successful final cleanup. Forced interruption was
not separately exercised.
Maintain the workflow when Xcode/runner images, Expo or signing requirements change;
GitHub maintains the underlying machines. Do not add paid/larger runners by default.

The approved notices are hosted at [Privacy](https://justgo-legal.vercel.app/privacy/)
and [Terms](https://justgo-legal.vercel.app/terms/), with both URLs set in EAS
preview for build 5. That release's remote-environment preflight passed; it does
not validate the Phase 15 candidate's new origins or notice. App Store Connect's
Privacy Policy URL is saved and needs updating to the verified Cloudflare
destination during cutover. App Privacy has 13 categories selected and
11 fully configured in an unpublished draft, verified after reload. Crash Data
and Other Diagnostic Data remain unfinished; Publish is disabled. The
[worksheet](../legal/RELEASE_DISCLOSURES.md) records the exact purposes, linkage
and remaining Sentry uncertainty before publication. Full native link acceptance is
separate from anonymous browser HTTPS checks.
The signed GoogleSignIn manifest declares eight data categories and some Analytics
purposes. Reconcile [Google's disclosure guidance](https://developers.google.com/identity/sign-in/ios/app-privacy)
with the app's used scopes and actual processing before final App Privacy answers.
The archive inspection does not establish all runtime SDK collection behavior.

## Tester and reviewer package

Start with Anthony as internal tester. Install the selected build through Apple's
TestFlight app, in place over existing phone data, then turn off the Mac's dev
server for standalone launch testing. Use disposable data for destructive cases.

- Browse venues, skip/accept, and give up: no completed rep is expected for Give up.
- Complete once, save optional feelings/reflection, and check Progress/day editing.
- After online beta approval, test offline completion/saving and saved-history
  relaunch, then reconnect and verify same-owner synchronization without duplicates.
  New starts end at server-issued expiry; saved history remains readable.
  Unfinished challenges are in-memory, not promised force-quit recovery state.
- Complete the remaining native Files/iCloud, login/logout, account isolation,
  deletion, storage protection and accessibility cases in the
  [journal rollout](LOCAL_JOURNAL_ROLLOUT.md). Earlier smoke/browser evidence is narrower.
- Report build/device/iOS, reproduction steps and connectivity. Exclude private
  writing, credentials and backup contents from screenshots or feedback.

The separate physical offline-artwork check remains owner-waived/unverified;
cold offline launch and other native acceptance remain open. Anthony deferred the
remaining physical-phone walkthrough on October 26; preserve these checks for
later acceptance rather than treating the deferral as a pass.

Beta description saved in App Store Connect on October 26:

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

These saved notes describe build 4. Update their Sentry sentence for any later
diagnostics-enabled build before its external review; purchases and product
analytics remain disabled.

The selected feedback email and privacy URL are saved. Anthony supplied the
review-contact phone directly to Apple; contact completeness and the saved notes
were verified after reload without recording private contact details. Sign-in
Required remains unchecked because guest use is available. App Privacy
disclosures remain unfinished; these saved Test Information fields do not finish
that separate questionnaire or request beta review.

Recommended external cohort: five trusted iPhone users for 14 days, starting after
readiness clears. Anthony still needs to select the actual invitees. Verify the
server access window covers the chosen dates and Apple review before inviting;
the current guest expiry is not an approved date for a future cohort.

## Remaining prerequisites

- Verify the published legal links and accessibility in the signed app. Reconcile
  any material service/provider changes before distribution; public notice
  publication is not provider/privacy release clearance.
- Resolve the existing supported-host arrangement for normal private journal
  traffic before external testers. Vercel's current DPA covers Pro/Enterprise and
  excludes specified sensitive data; Pro alone does not establish journal-content
  clearance. Preserve the declined-provider-contact direction. Supabase's
  incorporated DPA does not create a generic missing separate-signature task.
  The October 27 [operating decision](../DECISIONS.md#october-27-hosting-backups-and-simulator-test-direction)
  chose Vercel and Supabase. The October 28 [Cloudflare decision](../DECISIONS.md#october-28-cloudflare-workers-hono-and-r2-backups)
  supersedes it: Phase 15 moves the API to Cloudflare Workers and adds encrypted R2
  backups instead of Supabase Pro before outside testers. No purchase or upgrade is
  authorized now; provider suitability remains open.
- Verify the configured branded icon and native font/splash behavior on the signed
  build. Root `assets/icon.png` and `assets/splash-icon.png` remain unreferenced Expo
  placeholders.
- Confirm beta dates/invitees and the remaining [server operating controls](FOUNDATION.md#beta-operating-controls).
  Cleanup and rate limits are deployed, and the readiness monitor is active.
  The October 27 Sentry uptime monitor is active, API/mobile email alert rules are
  verified and Anthony confirmed the test email plus controlled monitor
  failure/recovery emails. The API reporter and protected code-only release lane
  are deployed/hosted-verified; actual deployed fault-to-Sentry delivery,
  migration/deploy acceptance and current backup/recovery arrangements remain
  open. Exact receipts and current concerns are consolidated in the
  [release handoff](../handoffs/phase-14-release.md).
  The October 27 owner
  direction defers the automated iOS simulator smoke test; do not implement it
  now or mark it passed. The retained Maestro launch file still targets old
  entry/account UI. His later explicit authorization covers filtered Sentry errors,
  included uptime/email alerts and protected deployment preparation; no paid
  upgrade or simulator smoke test is authorized.
- Preserve all applicable separate Git, native build, upload and distribution
  permissions and the original Phase 14 acceptance matrix.

References: [Expo profiles](https://docs.expo.dev/build/eas-json/),
[versions](https://docs.expo.dev/build-reference/app-versions/),
[TestFlight](https://docs.expo.dev/submit/testflight/),
[Apple overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/),
[GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments),
[Vercel DPA](https://vercel.com/legal/dpa),
[Supabase DPA](https://supabase.com/legal/customer-resources/data-processing-addendum).
