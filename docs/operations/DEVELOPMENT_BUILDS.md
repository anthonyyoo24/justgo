# JustGO Dev on a physical iPhone

JustGO Dev is a separate development app that installs beside TestFlight and
loads JavaScript from Metro on the Mac. The manual `development-ios.yml`
workflow builds it on GitHub's `macos-26` runner and hosts the IPA with
`eas upload`. Nothing goes to the App Store or TestFlight.

## When to use Dev and when to use TestFlight

Test JavaScript-only changes in JustGO Dev, loaded from Metro on the Mac. That
covers screens, copy, navigation, providers and data logic. A change reaches
the phone in minutes and needs no build. Agents start and stop the development
server themselves. Anthony only opens JustGO Dev on the phone.

Build a new Dev binary, with Anthony's go, only when native code or native
configuration changes. A TestFlight build is needed only for:

- native modules, config plugins, `app.config.ts`, entitlements, permissions,
  icons or fonts, and Expo SDK or native package upgrades, which also need a new
  Dev binary first;
- the release build's own setup, such as the `preview` EAS environment, the
  `beta` profile, the production bundle ID, CloudKit container, Keychain and
  Sentry delivery;
- release acceptance and the `gate` issues that name a TestFlight build.

To tell whether a change is JavaScript-only, compare `apps/mobile/package.json`,
`app.config.ts`, `plugins/`, `modules/` and the lockfile's native packages
between the installed Dev binary's source and the change. If none differ, Metro
can serve it.

## App and data boundaries

| Setting                    | JustGO Dev                         | TestFlight                     |
| -------------------------- | ---------------------------------- | ------------------------------ |
| Bundle ID                  | `com.anthonyyoo.justgo.dev`        | `com.anthonyyoo.justgo`        |
| URL scheme                 | `justgo-dev`                       | `justgo`                       |
| Private CloudKit container | `iCloud.com.anthonyyoo.justgo.dev` | `iCloud.com.anthonyyoo.justgo` |
| EAS environment/profile    | development/development            | preview/beta                   |

Both use Apple team `NPDYTJS425` and Expo project `@anthonyyoos-team/justgo`
(`53cf0560-8ab5-446a-9bc6-deb193b337b5`). Phone storage, Keychain and CloudKit
are separate. Both apps use the same staging API and Auth project, so **signing
into the same account shares server history and account deletion.** Use a
disposable Apple or Google account and synthetic writing for sync and deletion
tests.

## Account configuration

These live outside the repository. Keep them when you change anything else.

- **Apple.** The Dev App ID has Sign in with Apple, grouped under the TestFlight
  app, and the Dev CloudKit container, which only it uses. Its Production
  environment has the private schema from
  [account sync setup](ACCOUNT_SYNC_SETUP.md), with `JustGoValue.value` as
  Encrypted String and no public access. Ad hoc profile `6934C4555G` covers the
  Dev bundle and Anthony's registered iPhone, signed by distribution certificate
  `GTLA7CW372`.
- **Google.** Project `justgo-512319` has the iOS client **JustGO Dev iPhone**
  for the Dev bundle. Dev rejects the TestFlight iOS client and its scheme.
- **Supabase.** The US project `gcjmvtsisivxxorstvkb` accepts Apple audiences
  `com.anthonyyoo.justgo,com.anthonyyoo.justgo.dev`. Its Google client list
  keeps the web client first, then the TestFlight iOS client, then the Dev
  client. Read back on 2026-11-15. Change these only with Anthony's go.
- **EAS `development` environment.** It names the Dev bundle and container, the
  Dev Google iOS client and its reversed scheme, the web client, the staging
  API `https://gcjmvtsisivxxorstvkb.supabase.co/functions/v1/api`, the Auth
  origin and publishable key of the same project, the notice URLs, and Sentry
  off. It holds no secrets. The `preview` and `production` environments are
  separate.

To set up signing again, run this from `apps/mobile` with the pinned EAS CLI.
It is interactive and compiles nothing:

```sh
EXPO_NO_DOTENV=1 eas env:exec development 'eas credentials:configure-build --platform ios --profile development' --non-interactive
```

## Build and install

1. Get Anthony's go. Use a reviewed tag on `main` whose Foundation main-push
   checks passed. A current TestFlight tag works.
2. Dispatch **iPhone development build** from `main` with that tag.
3. The run waits on the `testflight-beta` environment. Approve it for that run
   only. It shares that environment's concurrency group with the TestFlight
   job, so one waits for the other.
4. The job summary shows the installation URL. Anthony opens it on the iPhone
   and installs **JustGO Dev** beside TestFlight.

The job inspects the signed IPA's identity, profile, callbacks, Keychain,
CloudKit, permissions, fonts and icon, and masks device identifiers. If an
upload's outcome is uncertain, check the existing uploaded builds before you
retry.

The current Dev binary is 0.1.0 (3), built from tag
`testflight-beta-2026-11-15-3` on 2026-11-15 in
[run 43749549470](https://github.com/anthonyyoo24/justgo/actions/runs/43749549470).

## Run the development server

From `apps/mobile`, pull the public environment once, and again after each EAS
change:

```sh
EXPO_NO_DOTENV=1 eas env:pull development --path .env.development.local --non-interactive
```

From the repository root, start Metro:

```sh
pnpm run dev:mobile --clear
```

The launcher refuses to start unless the pulled file and the pinned profile
name the US staging API and Auth origin above. It reads only the ignored
`.env.development.local`, never the release `.env.local`, and serves on LAN
port 8081 with scheme `justgo-dev`. Add `--web` for a browser preview.

Put the phone and the Mac on the same Wi-Fi, open JustGO Dev, and scan the
**server** QR code, which differs from the installation QR code. If the phone
cannot reach Metro, allow JustGO Dev's Local Network access in iOS Settings.
JavaScript changes reload. After you change provider lifecycle effects, fully
reload the app. After a configuration or module-path change, restart with
`--clear`.

Browser, simulator and component checks cannot prove native launch
configuration, notched-layout insets or `DayEntryList` scrolling. Check them on
the phone, and file each deferred check as a `gate` issue.

## Expo SDK and native package upgrades

Dependabot skips every package the Expo SDK pins or that ships native code, and
`wrangler`, which the staging release script pins. The skip list in
`.github/dependabot.yml` is generated by `scripts/quality/dependabot-skip.mjs`
from `node_modules/expo/bundledNativeModules.json` and the installed packages'
native files. `scripts/quality/dependabot-skip.test.mjs` fails when it drifts.

Those packages move together, as one scoped task per SDK:

1. Read the Expo upgrade guide for the target SDK.
2. From `apps/mobile`, run `pnpm exec expo install expo@~<sdk>.0.0 --fix`. Update
   native packages outside Expo's list, such as Google sign-in and
   `react-native-pulsar`, by hand.
3. Run `node scripts/quality/dependabot-skip.mjs --write` from the root.
4. Run the full `pnpm run check`, then build Dev and check it on the phone. A
   JavaScript export does not prove a native upgrade.

To rebuild a local native project, run `pnpm exec expo prebuild --platform ios`
from `apps/mobile`, then `pod install` from `apps/mobile/ios`, even when
dependencies are unchanged, then rebuild. The generated Podfile keeps Expo
modules building from source, and `apps/mobile/app.config.test.ts` pins
Sentry's static linkage.
