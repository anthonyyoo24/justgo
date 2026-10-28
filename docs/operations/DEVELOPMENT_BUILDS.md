# JustGO Dev on a physical iPhone

The manual `development-ios.yml` workflow prepares an independent development app
alongside TestFlight. It compiles on GitHub's standard `macos-26` runner with
Xcode 26.6/EAS 25.3.0. Compilation does not consume Expo cloud-build allowance.
`eas upload` hosts the finished IPA using the separate uploaded-build allowance;
there is no App Store/TestFlight submission.

Keep the app's source-build setting when generating a native project. The
generated Podfile properties disable precompiled Expo modules, and the SDK
template forces that setting off even if the incoming EAS environment enables
it. React Native core retains its matching prebuilt framework; ExpoModulesJSI
builds its framework against the current Pods headers. This policy requires a
new binary; Metro reloads and JavaScript exports do not validate it. See the
[native linkage policy](../architecture/APP_SHELL.md#app-error-reporting).

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
the Dev bundle ID as another callback; the inspector checks these two callbacks
and its dedicated Google scheme.

Phone storage, default Keychain groups and private CloudKit containers are
separate. Both apps use the existing staging API/Auth. **Signing into the same
account shares server history and account-deletion effects.** Use disposable
accounts for destructive testing. Separate app IDs do not create a separate backend.

## One-time configuration

Preserve the existing app, provider clients/secrets, nonce settings and EAS
preview environment. The separate app installs without deleting TestFlight.

1. Register the Dev bundle in the existing Apple team with Sign in with Apple,
   grouped under the existing primary app for shared staging account identity.
   Append the Dev audience to Supabase Apple, keeping existing IDs and nonce
   validation. A browser Services ID, if present, remains first. Native token
   sign-in requires no new browser OAuth secret.
2. Create a dedicated **iOS** client for the Dev bundle in Google project
   `justgo-512319`. Keep the existing web/server client first in Supabase's
   accepted Google client list and append the new iOS client. Preserve the
   approved Google-only nonce setting, secret, scopes and test-user allowlist.
   Dev rejects the original iOS client and its callback scheme.
3. Assign the Dev CloudKit container only to the Dev App ID. Deploy the private
   encrypted schema from [account sync setup](ACCOUNT_SYNC_SETUP.md) in both
   environments: `JustGoCollection` and `JustGoValue`, with `JustGoValue.value`
   created as **Encrypted String**. Grant no public access. Ad hoc distribution
   requires **Production** CloudKit.
4. Update only EAS's **development** environment with the Dev bundle/container,
   dedicated Google iOS client/reversed scheme, existing staging API/Auth public
   inputs, existing web client and approved notice URLs. Disable ordinary Sentry
   delivery. Keep provider/server secrets out of public mobile variables.
5. Configure a new ad hoc profile for the Dev App ID and registered iPhone using
   the existing distribution certificate. Preserve the TestFlight profile. With
   pinned EAS installed, from `apps/mobile`:

   ```sh
   EXPO_NO_DOTENV=1 eas env:exec development 'eas credentials:configure-build --platform ios --profile development' --non-interactive
   ```

   The child credential setup is interactive and performs no cloud compilation.
   Verify its registered phone/capabilities; automated builds freeze credentials.

Account/Git changes retain their applicable owner approvals. References:
[variants](https://docs.expo.dev/build-reference/variants/),
[Apple](https://supabase.com/docs/guides/auth/social-sign-in/auth-apple),
[Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google),
[internal distribution](https://docs.expo.dev/build/internal-distribution/),
[upload command](https://docs.expo.dev/eas/cli/#eas-upload).

## Build and install

Complete publication checks and obtain separate push/PR/merge permissions under
[AGENTS.md](../../AGENTS.md). The owner reviews before authorizing merge. Publish
a reviewed tag on `main`, wait for its exact Foundation main-push checks, then
dispatch **iPhone development build** from `main` with that tag.

The job reuses the existing `testflight-beta` environment's protected token and
owner approval, and shares signing concurrency with the beta job. No new
repository-wide token or paid/larger runner is needed. It inspects actual signed
identity, ad hoc provisioning, native launchers, callbacks, Keychain, CloudKit,
Apple permissions, fonts and icon without logging device IDs or profile contents.
EAS itself prints device identifiers during ad hoc credential preparation. Before
that command, the workflow reads registered devices into its private temporary
folder and masks their identifiers/names in GitHub. Missing, malformed or capped
device lists stop before the signing summary; the existing cleanup removes the file.

`manifest.json` records the source/tag, workflow/run/attempt and IPA SHA-256/size.
The exact file is verified again before `eas upload`. `install.json` must contain
one installation URL for the existing Expo project; the job summary shows it.
IPA/public receipts remain as a GitHub artifact for seven days. Signing files and
temporary keychains are cleaned on failure and success. The TestFlight metadata
gate stays separate; archive extraction/signature/cleanup code is shared.

Open the new installation URL or its QR on the registered iPhone and install
**JustGO Dev** alongside TestFlight. Check Developer Mode if requested. If upload
has an uncertain outcome, inspect existing uploaded builds before retrying;
another upload can consume another slot. A link does not establish installation.

## Run the development server

Pull the configured public environment once and again after provider changes.
From `apps/mobile`:

```sh
EXPO_NO_DOTENV=1 eas env:pull development --path .env.development.local --non-interactive
```

From the repository root:

```sh
npm run dev:mobile -- --clear
```

The launcher reads only ignored `.env.development.local`, validates the Dev
identity/provider pairing and sets `EXPO_NO_DOTENV=1`. It never falls back to
release `.env.local`. Metro uses one worker, LAN port 8081 and explicit scheme
`justgo-dev`; add `--web` for a browser preview. `npm run dev:web` is unchanged.

Use the same Wi-Fi on phone and Mac and scan the current **server** QR. This
differs from the **installation** QR. Ordinary UI/JS changes reload; native
module/configuration changes require another Dev binary. Restart with `--clear`
after configuration/module-path changes and verify the iOS manifest's LAN host.

## Configured account prerequisites

The October 26 setup registered the Dev App ID under the existing team and grouped
its Apple sign-in identity with the original primary app. Supabase Apple retains
the original audience and now also accepts the Dev bundle. The dedicated Google
client **JustGO Dev iPhone** is registered for that bundle/team in `justgo-512319`;
Supabase retains the web client first and original iOS client, with the Dev client
appended. Existing provider secrets, email options and nonce settings are unchanged.
Console readback and the public Auth settings endpoint confirm configured
providers; actual native sign-in is still unverified.

The separate container is assigned only to the Dev App ID. The existing schema
definitions were imported without records and deployed to its Production
environment. Production readback confirms `JustGoValue.value` is Encrypted String;
both custom types grant only creator writes, with no public custom-type access.
The original app/container were preserved.

Ad hoc profile `6934C4555G` is active for the Dev bundle and the existing registered
iPhone, using the existing distribution certificate `GTLA7CW372`. EAS reports all
credentials ready. Only the development environment was updated; before/after
comparisons verified preview and production variables unchanged. The remote and
pulled local Dev public configurations pass preflight. Keep the new signing
profile separate from the TestFlight profile; freeze credentials during builds.

## Acceptance still required

[PR #54](https://github.com/anthonyyoo24/justgo/pull/54) publishes the workflow for
owner review. The first hosted Dev compile/upload awaits that review and separate
merge approval. Record the actual build/run, inspected digest and installation URL
after success. Verify side-by-side install, both providers' first/returning
sign-in/cancellation, retained TestFlight data, Dev-container iCloud round trip and
live Metro on the phone. Account configuration, plugin introspection and browser
previews do not establish native acceptance or close Phase 14 gates.
