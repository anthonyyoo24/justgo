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

The prepared `.github/workflows/testflight-beta.yml` is manual only; tag pushes
do not build/upload. Use this order:

1. Configure `testflight-beta` with Anthony as a required reviewer and `main` as
   its allowed deployment branch. Actual protection is checked before any Expo
   token step; absent/unreadable protection fails closed. YAML alone is insufficient.
2. The owner-approved Expo robot `justgo-beta-builder` uses Developer access
   (publish/view the organization's projects), and its validated token is stored
   only as `EXPO_TOKEN` in this protected environment. It is not a project-scoped
   token or the owner's personal session. Rotate/revoke it in Expo when retiring
   the automation; never copy it into source or logs. Verify/configure remote App
   Store distribution credentials with the owner: the current valid certificate
   has an ad hoc profile only, with no App Store profile or assigned submission
   API key. Keep signing credentials out of the repository.
3. Obtain the specific Git/build authorization, publish a reviewed tag on `main`,
   and wait for successful Foundation **main push** checks on its exact SHA.
4. Dispatch from `main` with that tag and operation `build`. Review the immutable
   candidate SHA in the validation summary before approving the environment job.
   The job builds without uploading and records the EAS build ID.
5. Inspect the actual signed IPA: source provenance, identity/entitlements, store
   distribution, embedded JavaScript/local artwork/Inter, public configuration,
   privacy manifests and absence of development/fixture behavior. Ad hoc device
   checks are preliminary; exports do not establish the installed TestFlight build.
6. Verify App Store Connect has no unintended automatic tester distribution.
   Obtain separate upload authorization, then dispatch `submit` with the same tag
   and **exact** EAS ID, never `--latest`. The guard checks project, owner, bundle,
   platform, distribution, profile, completion status and commit metadata. Matching
   SHA metadata alone does not certify a manually built dirty archive.
7. After Apple processes the uploaded build, perform the actual TestFlight phone
   acceptance below. Submission disables EAS's automatic tester-group setup. Groups/invitations,
   external Beta App Review and public App Store submission remain separate actions.

The owner-selected navy GO mark on cream is configured as an opaque 1024-pixel
store icon at `apps/mobile/assets/brand/justgo-app-icon.png`; the existing branded
splash is retained. Inspect the icon in the next signed binary alongside the
native font/splash acceptance. See [icon provenance](../../design/source/app-icon.md).

Environment protection and the owner-approved robot token are configured. The
published tag, hosted workflow execution, App Store signing/submission credentials,
signed beta build and upload remain open. PR #49 must be reviewed and merged
before the main-only workflow can run. Local workflow tests do not establish a
hosted pass.

The approved notices are hosted at [Privacy](https://justgo-legal.vercel.app/privacy/)
and [Terms](https://justgo-legal.vercel.app/terms/), with both URLs set in EAS
preview. The actual remote-environment preflight passes. App Store Connect's
Privacy Policy URL is saved; App Privacy disclosures are still uncompleted and
must match the signed binary before publication. Full native link acceptance is
separate from anonymous browser HTTPS checks.

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
