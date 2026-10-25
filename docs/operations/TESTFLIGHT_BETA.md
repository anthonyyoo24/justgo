# JustGO TestFlight beta

This guide owns the prepared build/upload procedure. The
[Phase 14 plan](../implementation-plan/phase-14-release.md) owns acceptance;
[Apple setup](APPLE_SETUP.md) owns accounts/signing, and the
[legal review](../legal/LEGAL_REVIEW.md) owns publication/provider conditions.
Preparation does not establish signed-build acceptance or authorize distribution.

## Existing target

App Store Connect app `6821022390` (SKU `justgo-ios`) is named **JustGo: Ditch
Dating Apps**. Preserve bundle `com.anthonyyoo.justgo`, Apple team `NPDYTJS425` and
Expo project `@anthonyyoos-team/justgo` (`53cf0560-8ab5-446a-9bc6-deb193b337b5`).
The installed app and Expo project retain the JustGO name/identity.

`build.beta` is a store-signed release build using EAS **preview** variables and
the existing application-staging API `https://justgo-two.vercel.app`. Store signing
does not select the paid production API. Preview reuses the verified public
Auth/Google/CloudKit settings, with ordinary Sentry delivery disabled. Never put
private server credentials in that environment or an `EXPO_PUBLIC_` variable.
EAS is pinned to `25.3.0`; remote versions and beta/production build increments
prevent repeated store build numbers. Paid production setup remains separate.
Keep the inline CloudKit container/environment pair together: EAS evaluates the
dynamic app config once before fetching the remote preview variables.

## Preflight and release procedure

From `apps/mobile`, check the resolved remote public settings:

```sh
npm exec --yes --package=eas-cli@25.3.0 -- eas env:exec preview 'npm --prefix ../.. run release:beta:check' --non-interactive
```

The check verifies the explicit store profile, known staging API/Auth project,
provider/CloudKit inputs, disabled diagnostics, no fixture markers and public
HTTPS notice destinations. It reuses the site's production parser: pending dates
or unapproved text stop the process. It prints names, never credential values.
`RELEASE_OPERATION=submit` additionally checks the App Store ID/team. A pass does
not prove hosted notices, provider suitability, native behavior or release approval.

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
   empty. Review the immutable candidate SHA before approving the environment job.
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
   tag and exact successful GitHub `build_run_id`. The gate requires this repository's
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
Apple processing, owner phone acceptance and any later distribution remain
separate from successful upload.

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
preview. The actual remote-environment preflight passes. App Store Connect's
Privacy Policy URL is saved; App Privacy disclosures are still uncompleted and
must match the signed binary before publication. Full native link acceptance is
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
cold offline launch and other native acceptance remain open.

Beta description candidate:

> JustGo offers small real-world social challenges. Browse a venue, choose a
> challenge, and optionally record how it went. Progress shows completed
> challenges and saved reflections. You can start without signing in; optional
> Apple or Google sign-in synchronizes your account journal. This beta provides
> free access during its test period. Purchases are disabled.

Reviewer notes candidate:

> Continue offers guest use without a required account. Apple/Google sign-in is
> optional for account synchronization. The build uses isolated application staging
> with server-authorized, time-bounded beta access. Private iCloud Sync is optional
> and off by default, separate from account sync and manual files. Purchases,
> product analytics and ordinary Sentry delivery are disabled. Confirm the approved
> access window covers review before requesting external Beta App Review.

Feedback contact is the already selected `anthonyyoo24@gmail.com`. Obtain private
reviewer-contact details from the owner when needed; do not commit them. This
wording is a local candidate, not saved Apple metadata or a sent invitation.

## Remaining prerequisites

- Verify the published legal links and accessibility in the signed app. Reconcile
  any material service/provider changes before distribution; public notice
  publication is not provider/privacy release clearance.
- Resolve the existing supported-host arrangement for normal private journal
  traffic before external testers. Vercel's current DPA covers Pro/Enterprise and
  excludes specified sensitive data; Pro alone does not establish journal-content
  clearance. Preserve the declined-provider-contact direction. Supabase's
  incorporated DPA does not create a generic missing separate-signature task.
- Verify the configured branded icon and native font/splash behavior on the signed
  build. Root `assets/icon.png` and `assets/splash-icon.png` remain unreferenced Expo
  placeholders.
- Confirm beta dates/invitees and the remaining [server operating controls](FOUNDATION.md#beta-operating-controls).
  Cleanup is active; rate-limit deployment, readiness-monitor activation/email
  proof, 5xx alerts and current backup/recovery arrangements remain open.
  Protected hosted-migration/deploy automation and native UI CI smoke remain open;
  the retained Maestro launch file still targets old entry/account UI.
- Preserve all applicable separate Git, native build, upload and distribution
  permissions and the original Phase 14 acceptance matrix.

References: [Expo profiles](https://docs.expo.dev/build/eas-json/),
[versions](https://docs.expo.dev/build-reference/app-versions/),
[TestFlight](https://docs.expo.dev/submit/testflight/),
[Apple overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/),
[GitHub environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments),
[Vercel DPA](https://vercel.com/legal/dpa),
[Supabase DPA](https://supabase.com/legal/customer-resources/data-processing-addendum).
