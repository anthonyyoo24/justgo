# JustGO Dev on a physical iPhone

The manual `development-ios.yml` workflow prepares an independent development app
that installs alongside TestFlight. It compiles on GitHub's standard `macos-26`
runner with Xcode 26.6 and EAS 25.3.0. Compilation does not use the Expo
cloud-build allowance. `eas upload` hosts the finished IPA and uses the separate
uploaded-build allowance. Nothing is submitted to the App Store or TestFlight.

Keep the app's source-build setting when you generate a native project. The
generated Podfile properties disable precompiled Expo modules, and the SDK
template forces that setting off even if the incoming EAS environment enables
it. React Native core keeps its matching prebuilt framework. ExpoModulesJSI
builds its framework against the current Pods headers. This policy requires a
new binary. Metro reloads and JavaScript exports do not validate it. See the
[native linkage policy](../architecture/APP_SHELL.md#app-error-reporting).

To rebuild locally with an existing `apps/mobile/ios/` directory, use the intended
variant and public build environment for every step:

1. From `apps/mobile`, run `npx expo prebuild --platform ios`. Omit `--clean` to
   update the generated files in place.
2. From `apps/mobile/ios`, run `pod install`. Run this CocoaPods step even when
   package dependencies are unchanged.
3. Rebuild the app.

For an existing project, prebuild and `expo run:ios` can both skip CocoaPods
synchronization when dependencies are unchanged, and `expo run:ios` also skips
prebuild. The explicit steps make sure the generated settings reach the rebuilt
app.

## App and data boundaries

| Setting                    | JustGO Dev                         | TestFlight                     |
| -------------------------- | ---------------------------------- | ------------------------------ |
| Bundle ID                  | `com.anthonyyoo.justgo.dev`        | `com.anthonyyoo.justgo`        |
| URL scheme                 | `justgo-dev`                       | `justgo`                       |
| Private CloudKit container | `iCloud.com.anthonyyoo.justgo.dev` | `iCloud.com.anthonyyoo.justgo` |
| EAS environment/profile    | development/development            | preview/beta                   |

Both use Apple team `NPDYTJS425` and the existing Expo project
`@anthonyyoos-team/justgo` (`53cf0560-8ab5-446a-9bc6-deb193b337b5`). Dev has a
distinct app name and disables the generated `exp+justgo` scheme. Expo registers
the Dev bundle ID as another callback. The inspector checks these two callbacks
and its dedicated Google scheme.

Phone storage, default Keychain groups and private CloudKit containers are
separate. Both apps use the existing staging API and Auth. **Signing into the same
account shares server history and account-deletion effects.** Use disposable
accounts for destructive testing. Separate app IDs do not create a separate backend.

## One-time configuration

Preserve the existing app, provider clients and secrets, nonce settings and EAS
preview environment. The separate app installs without deleting TestFlight.

1. Register the Dev bundle in the existing Apple team with Sign in with Apple,
   grouped under the existing primary app for shared staging account identity.
   Append the Dev audience to Supabase Apple, and keep the existing IDs and nonce
   validation. If a browser Services ID is present, it stays first. Native token
   sign-in needs no new browser OAuth secret.
2. Create a dedicated **iOS** client for the Dev bundle in Google project
   `justgo-512319`. Keep the existing web/server client first in Supabase's
   accepted Google client list, and append the new iOS client. Preserve the
   approved Google-only nonce setting, secret, scopes and test-user allowlist.
   Dev rejects the original iOS client and its callback scheme.
3. Assign the Dev CloudKit container only to the Dev App ID. In both
   environments, deploy the private encrypted schema from
   [account sync setup](ACCOUNT_SYNC_SETUP.md). The schema has `JustGoCollection`
   and `JustGoValue`, with `JustGoValue.value` created as **Encrypted String**.
   Grant no public access. Ad hoc distribution requires **Production** CloudKit.
4. Update only the EAS **development** environment. Set the Dev bundle and
   container, the dedicated Google iOS client and its reversed scheme, the existing
   staging API and Auth public inputs, the existing web client and the approved
   notice URLs. Disable ordinary Sentry delivery. Keep provider and server secrets
   out of public mobile variables.
5. Configure a new ad hoc profile for the Dev App ID and the registered iPhone with
   the existing distribution certificate. Preserve the TestFlight profile. With the
   pinned EAS installed, run this from `apps/mobile`:

   ```sh
   EXPO_NO_DOTENV=1 eas env:exec development 'eas credentials:configure-build --platform ios --profile development' --non-interactive
   ```

   The child credential setup is interactive and runs no cloud compilation.
   Verify its registered phone and capabilities. Automated builds freeze
   credentials.

Account and Git changes still need the owner approvals that apply to them.
References:
[variants](https://docs.expo.dev/build-reference/variants/),
[Apple](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple),
[Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[internal distribution](https://docs.expo.dev/build/internal-distribution/),
[upload command](https://docs.expo.dev/eas/cli/#eas-upload).

## Build and install

1. Complete the publication checks, and get the separate push, PR and merge
   permissions under [AGENTS.md](../../AGENTS.md). The owner reviews before
   authorizing the merge.
2. Publish a reviewed tag on `main`.
3. Wait for that tag's exact Foundation main-push checks.
4. Dispatch **iPhone development build** from `main` with that tag.

The job reuses the existing `testflight-beta` environment's protected token and
owner approval, and shares signing concurrency with the beta job. It needs no new
repository-wide token and no paid or larger runner. It inspects the actual signed
identity, ad hoc provisioning, native launchers, callbacks, Keychain, CloudKit,
Apple permissions, fonts and icon without logging device IDs or profile contents.

EAS itself prints device identifiers during ad hoc credential preparation. Before
that command, the workflow reads the registered devices into its private
temporary folder and masks their identifiers and names in GitHub. A missing,
malformed or capped device list stops the job before the signing summary. The
existing cleanup removes the file.

`manifest.json` records the source and tag, the workflow, run and attempt, and
the IPA SHA-256 and size. The job verifies the exact file again before
`eas upload`. `install.json` must contain one installation URL for the existing
Expo project, and the job summary shows that URL. The IPA and public receipts
remain as a GitHub artifact for seven days. Signing files and temporary keychains
are cleaned on both failure and success. The TestFlight metadata gate stays
separate. The archive extraction, signature and cleanup code is shared.

Open the new installation URL or its QR code on the registered iPhone, and install
**JustGO Dev** alongside TestFlight. If requested, check Developer Mode. A
`devicectl` launch needs the phone unlocked. If the Mac cannot reach the paired
phone, install from the installation link instead. If an upload has an uncertain
outcome, inspect the existing uploaded builds before you retry, because another
upload can use another slot. A link does not establish installation.

## Run the development server

Pull the configured public environment once, and again after each provider
change. From `apps/mobile`, run:

```sh
EXPO_NO_DOTENV=1 eas env:pull development --path .env.development.local --non-interactive
```

From the repository root, run:

```sh
npm run dev:mobile -- --clear
```

For an owner-only synthetic test of the Cloudflare staging API, select it
explicitly:

```sh
npm run dev:mobile -- --cloudflare --clear
```

The launcher consumes the option before Expo starts. It first validates the
saved development environment and the pinned native profile. Then it changes
only `EXPO_PUBLIC_API_URL` to
`https://justgo-api-staging.anthonyyoo24.workers.dev`. The default command keeps
its existing Vercel API target. Identity, Auth and provider pairing, Sentry-off
mode, current legal URLs and fixture rejection stay enforced. Remote EAS settings
and release profiles do not change. Arbitrary API origins are not accepted.

The first phone screen and navigation check can use guest mode. Dev shares the
staging database. Before account synchronization or deletion checks, use a
genuinely disposable Apple or Google identity and synthetic writing. An existing secondary
provider account is enough. A new email is not required. This early test can come
before the final TestFlight and legal/Vercel retirement. It does not publish the
pending Cloudflare notice or close final native and cutover acceptance. Before
loading current source, verify that the Dev binary is compatible. The recorded
October 26 build predates the current native patches and source-build policy, and
it is not accepted as compatible.

The launcher reads only the ignored `.env.development.local`, validates the Dev
identity and provider pairing, and sets `EXPO_NO_DOTENV=1`. Expo 58's development
virtual environment still merges saved dotenv modules after that CLI setting. So
the explicit local-launcher marker selects a separate public adapter for every
Metro platform. That adapter reads the validated API, provider, diagnostics and
notice values together from Expo's runtime prelude. It exports no private values
or fixture authorization. Marked production, CI, EAS-build and fixture contexts
are rejected. Ordinary release and guarded journey resolution stay unchanged.
After you change this resolver, restart with `--clear` and verify the actual
served consumers, not only the launcher's process values. It never falls back to
the release `.env.local`. Metro uses one worker, LAN port 8081 and the explicit
scheme `justgo-dev`. Add `--web` for a browser preview. `npm run dev:web` is
unchanged.

Put the phone and the Mac on the same Wi-Fi, and scan the current **server** QR
code. This code differs from the **installation** QR code. If the phone cannot
reach Metro, allow JustGO's Local Network access in iOS Settings and retry.
Ordinary UI and JavaScript changes reload. Native module and configuration
changes require another Dev binary. After configuration or module-path changes,
restart with `--clear` and verify the LAN host in the iOS manifest.

## Configured account prerequisites

The October 26 setup registered the Dev App ID under the existing team and grouped
its Apple sign-in identity with the original primary app. Supabase Apple keeps
the original audience and now also accepts the Dev bundle. The dedicated Google
client **JustGO Dev iPhone** is registered for that bundle and team in
`justgo-512319`. Supabase keeps the web client first and the original iOS client,
with the Dev client appended. Existing provider secrets, email options and nonce
settings are unchanged. Console readback and the public Auth settings endpoint
confirm the configured providers. Actual native sign-in is still unverified.

The separate container is assigned only to the Dev App ID. The existing schema
definitions were imported without records and deployed to its Production
environment. Production readback confirms that `JustGoValue.value` is Encrypted
String. Both custom types grant only creator writes, with no public custom-type
access. The original app and container were preserved.

Ad hoc profile `6934C4555G` is active for the Dev bundle and the existing registered
iPhone, with the existing distribution certificate `GTLA7CW372`. EAS reports all
credentials ready. Only the development environment was updated. Before-and-after
comparisons verified that the preview and production variables were unchanged.
The remote and pulled local Dev public configurations pass preflight. Keep the new
signing profile separate from the TestFlight profile. Freeze credentials during
builds.

## Acceptance still required

The latest approved [Dev compile/upload](https://github.com/anthonyyoo24/justgo/actions/runs/41348697942)
succeeded from reviewed `d66c42d3daa2cc990f347fbf674b661845f1c603`, tag
`staging-cloudflare-2026-11-01`, and produced Dev 0.1.0 (2). Signed inspection,
exact upload and cleanup passed. The downloaded IPA's 31,074,881-byte size and
SHA-256 `704051dcd4c1db7adcbd3ceba7fd9d4d7711cc06fbbdc578728bcb0d375b1043`
match its source and run manifest. Its [installation page](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/c1f43ed8-066a-413e-b196-647588a1296f)
shows Succeeded and the phone QR code. This build supersedes the October 26
build-1 artifact for current testing. No older build or TestFlight installation
was retired.

Anthony reports that he scanned both the install and connect QR codes and that the
app appears to work on his iPhone. He confirms that both app variants remain
present, and he confirms signed-out guest mode. He also confirmed that a synthetic
"Phone test" reflection remains in Progress after he fully closed and reopened
Dev. These are owner-reported launch and guest-persistence results. The installed
build number was not read independently from the device. Detailed physical phone
acceptance remains open: both providers' first and returning sign-in and
cancellation, retained TestFlight data, and the Dev-container iCloud round trip.
Use a disposable provider account for synchronization and deletion checks. Local
bundle inspection, account configuration and browser previews do not establish
native acceptance or close Phase 14 gates.
