# Apple, Expo and Superwall setup

This page records JustGO's Apple, Expo and Superwall account facts and the owner
tasks that are still open. Other guides own the procedures:

- [JustGO Dev on a physical iPhone](DEVELOPMENT_BUILDS.md) sets up, builds and
  installs the separate development app.
- [JustGO TestFlight beta](TESTFLIGHT_BETA.md) builds and uploads store-signed
  builds and records each one.
- [Account sync setup](ACCOUNT_SYNC_SETUP.md) configures Apple and Google sign-in,
  Supabase and the CloudKit schema.

Account and outside-service changes need Anthony's go first. Anthony enters Apple
passwords and verification codes himself. Never ask for them in chat. Never put
signing keys, banking or tax values in this repository.

## Account facts

| Item                                     | Value                                                                                                                                                                                                                    | Status                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple Developer membership               | Individual, Youngshin Yoo. Team `NPDYTJS425`.                                                                                                                                                                            | Active. Renews September 19, 2027.                                                                                                                                                                              |
| Apple agreements                         | Developer Program License Agreement.                                                                                                                                                                                     | Accepted October 25. Business and paid-app declarations are open.                                                                                                                                               |
| Banking and tax                          | Owner only.                                                                                                                                                                                                              | Open. Required before sales.                                                                                                                                                                                    |
| App ID                                   | `com.anthonyyoo.justgo`, with Sign in with Apple and iCloud (CloudKit).                                                                                                                                                  | Registered. The EAS `beta` profile's `IOS_BUNDLE_IDENTIFIER`.                                                                                                                                                   |
| iCloud container                         | `iCloud.com.anthonyyoo.justgo`, assigned only to that App ID.                                                                                                                                                            | Schema deployed in Development and Production.                                                                                                                                                                  |
| JustGO Dev App ID                        | `com.anthonyyoo.justgo.dev`, with container `iCloud.com.anthonyyoo.justgo.dev`.                                                                                                                                          | Configured. See [DEVELOPMENT_BUILDS.md](DEVELOPMENT_BUILDS.md). Acceptance: [#99][g99].                                                                                                                         |
| App Store Connect app                    | `6821022390`, SKU `justgo-ios`, name **JustGo: Ditch Dating Apps**.                                                                                                                                                      | Name saved October 24.                                                                                                                                                                                          |
| Expo project                             | `@anthonyyoos-team/justgo` (`53cf0560-8ab5-446a-9bc6-deb193b337b5`).                                                                                                                                                     | Owner access verified.                                                                                                                                                                                          |
| Distribution certificate                 | `GTLA7CW372`, created by EAS.                                                                                                                                                                                            | Signs every profile below.                                                                                                                                                                                      |
| Ad hoc profile, JustGO                   | EAS-managed. Holds the registered iPhone, Sign in with Apple and iCloud.                                                                                                                                                 | Regenerated when iCloud was added.                                                                                                                                                                              |
| Ad hoc profile, JustGO Dev               | `6934C4555G`.                                                                                                                                                                                                            | Active.                                                                                                                                                                                                         |
| App Store profile                        | `U362DZ236F`.                                                                                                                                                                                                            | Used for TestFlight uploads.                                                                                                                                                                                    |
| App Store Connect API key                | `UYPTP25HP4`, Developer role, assigned in EAS.                                                                                                                                                                           | Private key file deleted after import.                                                                                                                                                                          |
| Build robot                              | Expo robot `justgo-beta-builder`, Developer access.                                                                                                                                                                      | Token stored only in the protected GitHub environment `testflight-beta`.                                                                                                                                        |
| Registered devices                       | Anthony's iPhone 15 Pro.                                                                                                                                                                                                 | UDIDs stay out of committed files.                                                                                                                                                                              |
| Legal URLs                               | [Privacy](https://justgo-legal.anthonyyoo24.workers.dev/privacy/) and [Terms](https://justgo-legal.anthonyyoo24.workers.dev/terms/). Set in EAS development and preview and as the App Store Connect Privacy Policy URL. | First published October 25 on Vercel, moved to the Cloudflare Worker `justgo-legal` (#123); [TESTFLIGHT_BETA.md](TESTFLIGHT_BETA.md) holds the current version. App Privacy questionnaire is open ([#94][g94]). |
| Superwall project                        | JustGO project.                                                                                                                                                                                                          | Access not verified. Phase 16.                                                                                                                                                                                  |
| Superwall iOS app and store credentials  | None yet.                                                                                                                                                                                                                | Waits on the App Store products. Phase 16.                                                                                                                                                                      |
| Subscription group, products, prices     | None yet.                                                                                                                                                                                                                | Owner decision on products and trials is pending. Phase 16.                                                                                                                                                     |
| Product, entitlement and paywall mapping | None yet.                                                                                                                                                                                                                | Waits on the agreed offer. Phase 16.                                                                                                                                                                            |
| Sandbox purchase and restore             | None yet.                                                                                                                                                                                                                | Not run. Phase 16, [#110][g110].                                                                                                                                                                                |

## What the API stores about purchases

Migration `0027_billing_tables` adds two tables in the private `justgo`
schema. `POST /v1/billing/verifications` writes `app_store_subscriptions`, and
no route reads `billing_events` yet. They hold no receipt, signed transaction,
key or secret.

- `app_store_subscriptions` has one row per Apple original transaction ID. It
  holds the owner's JustGO user ID (empty for a guest purchase), the product ID,
  the environment (`Production` or `Sandbox`), the verified expiry, the
  revocation time after a refund, the latest transaction ID and the
  `appAccountToken`. An owner reads only its own rows. A guest row is reached
  only through the one original transaction ID the API verified with Apple in
  that request. The owner, once set, never changes, and the API cannot delete a
  row. Delete-all and account deletion keep the row bound to its owner, so a
  deleted account's purchase never passes to someone else. The recovery ledger
  replays the table, so a restore keeps owner bindings and refunds.
- `billing_events` holds each Superwall event ID and when it arrived, so a
  redelivered event does nothing. A restore may lose recent IDs, and a
  redelivery then confirms the purchase with Apple again.

## Verifying a purchase

`POST /v1/billing/verifications` takes the transaction ID the phone got from
StoreKit, with or without a JustGO bearer. The API asks Apple's Get Transaction
Info for it before any database transaction opens, checks the signed answer
against the pinned Apple Root CA - G3 fingerprint, and refuses a different
bundle, environment or transaction ID. It stores the row by its original
transaction ID and answers with the access contract. A revoked or expired
subscription answers `unpaid`.

- A signed-in owner gets the row when the `appAccountToken` is empty or names
  them. A token that names another account answers 409, and so does a row
  another account owns.
- A guest purchase stays a guest row with no owner. When a signed-in owner sends
  a guest row whose token does not name them, the row stays a guest row and the
  answer says `guest_subscription`. Moving it into the account is the job of
  guest adoption.

The route exists only when `BILLING_ENABLED` is `true`. It is `false` by
default, and then the app stays free. With the flag on, the API refuses to start
unless every App Store Server API setting is present: `APPLE_IAP_KEY_ID`,
`APPLE_IAP_ISSUER_ID`, `APPLE_BUNDLE_ID`, `APPLE_IAP_PRIVATE_KEY` (the PKCS8
`.p8` text) and `APPLE_IAP_ENVIRONMENT` (`Production` or `Sandbox`). Keep their
values in the function secrets only. Tests use a self-made certificate chain
and a stub store from `apps/api/scripts/apple-test-store.ts`, never Apple.

## Reading access

With `BILLING_ENABLED` on, `apps/api/src/access/paid-access.ts` answers access
from the saved rows only, whatever readers the runtime passes in.

- `/v1/access` is `verified` with the row's product and expiry while the bearer
  owns an unrevoked row that has not expired, and `unpaid` otherwise. Only the
  bearer names the owner.
- An upload is eligible when its completion started before the row's expiry, or
  its revocation if earlier, so a completion made while paid still uploads after
  the subscription ends. A completion started later is refused.
- Rows belong to the owner, not to a data epoch, so delete-all keeps access.
- A guest request carries no transaction Apple confirmed, so `/v1/guest/access`
  answers `unpaid` and `/v1/guest/challenges` answers 403. A guest learns of its
  subscription only from `POST /v1/billing/verifications`.

## Owner tasks still open

- Complete banking, tax and the paid-app agreement before sales.
- In Phase 16, generate the in-app purchase key, connect the iOS app in Superwall,
  create the subscription group and products, and map them to entitlements and
  the paywall. Keep these credentials out of docs and mobile source. Prepared
  billing code does not authorize this setup.
- Pick the external beta cohort and dates ([#97][g97]).
- For the paid launch ([#107][g107], [#110][g110]), complete App Store metadata,
  current screenshots, the icon, age and content declarations, the support URL,
  subscription details and reviewer notes that explain no-signup access. Submit
  the first subscription with the app version when Apple requires it.
- After release, verify the public listing and purchase and restore. Then complete
  the hackathon submission under the event's current rules. Check those rules
  before assuming that later app updates count toward judging.

## Owner phone acceptance on record

- Phase 08, reported October 16 and recorded at closeout October 17: Anthony
  reported completing the required physical-iPhone checks, including haptics and
  account deletion.
- October 23, SDK 58 upgrade smoke on build `e9a503b3`: Anthony confirmed Home
  with the existing account and Progress history, day-sheet and editor opening
  and closing, and the expected iCloud status in Settings.
- October 22, build `1a1174d6`: a full iCloud showed the iCloud-full message.
- October 23, build `b4da28da`: iCloud sync on matched four challenge and
  journal entry pairs; off kept a fifth on the phone only; re-enabling caught up
  all five, which still matched after force-quit and reopen.

## Open gates from earlier phone testing

Each gate has an issue. Single-phone results do not close them.

- Two-phone iCloud sync, restore and Apple-account change: [#82][g82].
- External iCloud deletion keeps phone entries: [#83][g83].
- Apple and Google sign-in matrix: [#81][g81].
- Offline launch, save and reconnect: [#79][g79].
- Files download, import and deletion cleanup: [#84][g84].
- Haptics recheck on the signed beta build: [#88][g88].
- Settings rating and social rows, once their destinations exist: [#111][g111].

## Add an iPhone

Follow these steps when a new phone needs ad hoc builds. To install JustGO Dev on
a phone that is already registered, use [DEVELOPMENT_BUILDS.md](DEVELOPMENT_BUILDS.md).

1. Anthony connects and unlocks the phone, taps **Trust This Computer** and enters
   the passcode.
2. With Anthony's permission, register the phone in Apple Developer. Keep its UDID
   in ignored `.local/` files only.
3. Anthony runs `pnpm dlx eas-cli@25.3.0 device:create` from `apps/mobile`, chooses
   `anthonyyoos-team`, signs in to Apple privately and picks the registered phone
   under **Developer Portal**.
4. Regenerate the ad hoc profile of each app the phone should run, and keep the
   existing distribution certificate. For JustGO Dev, use step 5 of its one-time
   configuration. The phone runs only builds signed after this step.
5. On the phone, enable Developer Mode and restart, as
   [Expo's Developer Mode guide](https://docs.expo.dev/guides/ios-developer-mode/)
   describes. `xcrun devicectl device info details` shows the current state.
   `devicectl list devices` can still report it as disabled for a while.

## Native build rules

- Native modules, entitlements, capabilities and SDK upgrades need a new signed
  build. An OTA update or a JavaScript export cannot add them. An API URL change
  ships through JavaScript.
- Ad hoc and store builds use Production CloudKit. A build signed locally with
  Xcode development signing needs `ICLOUD_CONTAINER_ENVIRONMENT=Development`. The
  two environments hold separate records.
- The last same-identifier development build is
  [e9a503b3](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/e9a503b3-d1d9-4e69-abdf-aa7630b1888e)
  (SDK 58, October 23). It carries the CloudKit configuration and the
  `readRetainingLocal` bridge. Binaries from before SDK 58 cannot load the current
  runtime. New development testing uses JustGO Dev.
- EAS builds, signs and uploads. It does not replace Apple membership or submit
  the app for App Review. Apple's requirements and review times change, so
  recheck them at each step. See [Expo iOS submission](https://docs.expo.dev/submit/ios/),
  [Apple enrollment](https://developer.apple.com/programs/enroll/) and
  [first in-app purchase submission](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase).

[g79]: https://github.com/anthonyyoo24/justgo/issues/79
[g81]: https://github.com/anthonyyoo24/justgo/issues/81
[g82]: https://github.com/anthonyyoo24/justgo/issues/82
[g83]: https://github.com/anthonyyoo24/justgo/issues/83
[g84]: https://github.com/anthonyyoo24/justgo/issues/84
[g88]: https://github.com/anthonyyoo24/justgo/issues/88
[g94]: https://github.com/anthonyyoo24/justgo/issues/94
[g97]: https://github.com/anthonyyoo24/justgo/issues/97
[g99]: https://github.com/anthonyyoo24/justgo/issues/99
[g107]: https://github.com/anthonyyoo24/justgo/issues/107
[g110]: https://github.com/anthonyyoo24/justgo/issues/110
[g111]: https://github.com/anthonyyoo24/justgo/issues/111
