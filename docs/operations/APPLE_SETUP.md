# Apple, Expo and RevenueCat setup

Started September 17, 2026. Owner: **Anthony**. **October 11 verification:** The signed-in Apple Developer side panel confirms an active individual membership for Youngshin Yoo, team `NPDYTJS425`, renewing September 19, 2027. Apple already has the explicit JustGo identifier `com.anthonyyoo.justgo`; Expo's development environment already has that matching `IOS_BUNDLE_IDENTIFIER`. The existing Expo project `justgo` (`53cf0560-8ab5-446a-9bc6-deb193b337b5`) and owner access to `@anthonyyoos-team/justgo` were reverified through EAS CLI and the side panel. Anthony's iPhone was registered with Apple with his explicit permission and imported into Expo by Anthony. EAS created a distribution certificate and an ad hoc provisioning profile containing that phone. The first physical development build **succeeded** and Anthony reports installation and development-launcher opening. Developer Mode and live phone bundle loading are verified. The current hosted application-staging API is reachable, the owner-confirmed account has a private 30-day test grant, and physical feature acceptance is in progress.

| Item                                                                                  | Status                                                                                                                                                                                                                     | Required by                  |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Choose individual or organization enrollment                                          | Individual; team `NPDYTJS425`, verified October 11                                                                                                                                                                         | Physical-device distribution |
| Apple Account access and Developer Program enrollment                                 | Active membership and website access verified October 11                                                                                                                                                                   | Device distribution / 09     |
| Identity/business verification and agreements                                         | Owner must complete                                                                                                                                                                                                        | Distribution/sales           |
| Banking and tax information                                                           | Owner must complete; never put values in this repo                                                                                                                                                                         | Sales                        |
| Reserve permanent bundle ID                                                           | `com.anthonyyoo.justgo` registered; matching EAS development variable verified                                                                                                                                             | 02 device identity tests     |
| App Store Connect app record                                                          | Verified app `6821022390`, SKU `justgo-ios`, matching bundle; owner-selected name **JustGo: Ditch Dating Apps** saved October 24                                                                                           | Free beta / 14               |
| Public beta legal notices                                                             | [Privacy](https://justgo-legal.vercel.app/privacy/) and [Terms](https://justgo-legal.vercel.app/terms/) published October 25; EAS preview links and Apple Privacy Policy URL saved; App Privacy questionnaire remains open | Free beta / 14               |
| Protected build automation                                                            | Owner-approved Developer robot `justgo-beta-builder`; validated token stored only in GitHub `testflight-beta` environment; main-only workflow remains unmerged                                                             | Free beta / 14               |
| Store signing and upload authentication                                               | October 25 EAS inventory: valid distribution certificate/ad hoc profile; no App Store provisioning profile or assigned submission API key                                                                                  | Free beta / 14               |
| Expo account/team and EAS project                                                     | Linked and remotely verified: @anthonyyoos-team/justgo                                                                                                                                                                     | EAS development build        |
| Signing access and physical iPhone registration                                       | First iPhone registered with Apple/Expo; signed physical development build succeeded October 11                                                                                                                            | 02                           |
| Existing JustGO RevenueCat project access                                             | Mentioned by plan; access/configuration not verified here                                                                                                                                                                  | 07A                          |
| Connect RevenueCat iOS app, store credentials                                         | Pending Apple app/product setup                                                                                                                                                                                            | 07A                          |
| Subscription group/products, pricing/trials                                           | Owner product decision pending                                                                                                                                                                                             | 07A                          |
| Product → entitlement → offering/paywall mapping                                      | Pending agreed offer                                                                                                                                                                                                       | 07A                          |
| Sandbox purchase and restore                                                          | Not run; no purchase code in 01                                                                                                                                                                                            | 07A                          |
| Release-like build, TestFlight, App Review metadata and first subscription submission | Beta source/configuration prepared; no store build or upload yet. Paid submission follows accepted 07A                                                                                                                     | 14                           |

**October 12 haptics build:** The owner-authorized updated internal development build [e48faabd](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/e48faabd-d7e2-4b6e-ac34-e08d9087fce9) succeeded. Its signed app includes native haptics and the existing Keychain module; team/app identity and the registered iPhone provisioning were verified. SDK patches now pass Expo Doctor 21/21. Install this build over the existing app, then reconnect to the running development server. Actual installation and tactile feedback acceptance remain open. See the [build handoff](../handoffs/phase-08-settings-privacy.md).

**Earlier Phase 13 journal development binary:** Anthony authorized the updated iPhone build [fa3414c1](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/fa3414c1-dbef-46b2-aa40-e3859744f70d), which finished on October 20. Its downloaded IPA contains SQLite, DocumentPicker and the existing Keychain module, with the unchanged `com.anthonyyoo.justgo` identifier, team and registered-iPhone provisioning. Native compilation required static-framework linkage for the pinned Sentry scope API; privacy safeguards remain intact and diagnostics remain disabled. Installation and Phase 13 physical storage/Files acceptance remain unverified. That build predates the revised managed Apple/Google Auth, SecureStore and CloudKit module/capability changes. It is not a compatible acceptance binary for the expanded scope. The matching local API is required until separately approved hosted cutover; existing hosted services retain earlier behavior.

**October 21 revised development binary:** Anthony authorized [967b34cf](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/967b34cf-7a97-4268-88b7-5a2c77dc2feb), which finished successfully. The downloaded signed IPA includes SQLite, DocumentPicker, Keychain, the CloudKit module, Apple Authentication, SecureStore and Google Sign-In. It preserves the existing bundle ID/team and registered iPhone; EAS enabled Sign in with Apple and refreshed the existing ad hoc profile. Fresh `npm run check` passed, including Expo Doctor 21/21. This is a guest/data-controls testing binary: actual provider configuration, Google's native URL scheme and CloudKit container/entitlements remain pending and will require another compatible native configuration/build. Native compilation does not establish provider or iCloud behavior. The development server uses the matching local LAN API with bounded staging guest admission; hosted services were not updated. Install over the existing app to preserve phone data. Installation and physical acceptance remain open.

The earlier IPA reports `cloudKitConfigured=false` and predates the current
native conditional-reset bridge. It is superseded for login testing by the
configured build below; CloudKit capability/device acceptance remains separate.

**Configured provider build:** The authorized internal development build
[87bc28d0](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/87bc28d0-8c0e-4936-8222-d918d362b8ab)
succeeded October 21. Signed IPA inspection confirms the existing bundle/team,
registered iPhone, Sign in with Apple entitlement, exact Google reversed-client
URL scheme, Apple/Google modules, SecureStore, SQLite, Files/Keychain and current
`resetIfUnchanged` bridge. The native providers, public development inputs and
matching staged API are configured. Its CloudKit container remains unconfigured;
this build does not establish working iCloud Sync. Install over the existing app,
then use the restarted Metro server on the same Wi-Fi. Real sign-in, installation,
secure storage and logout/deletion acceptance remain open.

## Revised Phase 13 native prerequisites

**SDK 58 replacement client:** Development build
[e9a503b3](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/e9a503b3-d1d9-4e69-abdf-aa7630b1888e)
finished October 23 and was installed in place on the registered iPhone through
`devicectl`. It upgrades Expo to 58 / React Native 0.88 / React 19.3 and includes
the new scene lifecycle. Signed IPA verification confirms the existing bundle/team,
registered device, Apple/Google configuration, approved CloudKit-only Production
container and mandatory `readRetainingLocal` bridge. The default per-app Keychain
identity is preserved. After unlocking, the app launched successfully and loaded
the current iOS bundle from Metro without a reported JavaScript error. Anthony
confirmed Home with the existing account and Progress history, normal day-sheet/
editor opening and closing, and expected iCloud status in Settings → Data.
This basic upgrade smoke does not close the extended Keychain, Files, lifecycle,
accessibility or multi-device matrix. Earlier SDK 57 binaries cannot load the new
runtime. Use the current SDK 58 Metro server with a cleared cache. Exact build,
source/archive attribution, checks and remaining gates are in the separate
[native-upgrade handoff](../handoffs/phase-14-native-upgrade.md). Earlier phone
evidence below remains historical, not automatic acceptance of this SDK.

**Configured iCloud testing binary:** The internal development build
[1a1174d6](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/1a1174d6-160a-48ef-8a0e-4ffccfbc1590)
finished successfully. Downloaded IPA/signature inspection confirms the approved
container, `CloudKit` service, Production environment and matching provisioning
permissions for the registered iPhone. The current native writer/conditional-reset
bridge, Apple/Google providers, Google URL scheme, secure session storage,
SQLite, Files and Keychain are present. The code signature verifies. This build
also collects individual CloudKit save/delete failures so storage-quota errors
can reach the concise storage-full message. Its compiled callback imports differ
from the previous iCloud binary; registered devices and Keychain access are preserved.
Fresh `npm run check` and all 23 native Swift regressions passed before that
build. It is installed on Anthony's phone. Actual upload/readback matched one
challenge/journal pair; with sync off, a new pair stayed only on the phone while
the existing cloud pair remained. After re-enabling, restarting and saving another
entry, all three local challenge/journal pairs matched iCloud. The actual
storage-full condition also reached the concise iCloud-full message. These checks
do not establish the deferred offline/multi-device/account-change/deletion matrix.

**Historical recovery build, superseded October 23:** Development
build [3cbc873a](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/3cbc873a-ea18-4cf7-b309-c62ed87ace05), from source `b6c75d5`, finished successfully on October 22 at
23:11:58 UTC. Fresh online Expo Doctor passes 21/21. The downloaded IPA's signature
verifies; inspection confirms bundle `com.anthonyyoo.justgo`, team `NPDYTJS425`,
container `iCloud.com.anthonyyoo.justgo`, CloudKit/Production, registered-phone
provisioning, retained Keychain access, Apple entitlement and Google URL scheme.
The full provisioning profile is unchanged from the installed `1a1174d6` binary.
The actual Mach-O contains the `readGuarded` bridge and `ZONE_RECOVERY_REQUIRED`
code. Expo showed Succeeded with Install available, and the supplied QR was decoded
and verified against this exact build's installation URL.

Build `1a1174d6` remains the binary for the earlier installed-phone evidence.
Anthony rejected the recovery-clearing behavior in `3cbc873a`; do not install it
as the acceptance candidate for the revised behavior. The historical build's
inspection does not establish the October 23 bridge or physical behavior.

**Revised build inspected and exercised on the phone; external deletion/restore acceptance deferred:** Development build
[b4da28da](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/b4da28da-e425-4e5a-83fd-d734b87f39c4),
from source `4a9f10f`, finished successfully on October 23. The downloaded IPA
passed `codesign --verify --deep --strict`; its actual Mach-O contains
`readRetainingLocal`, with `readGuarded` absent. Inspection confirms bundle
`com.anthonyyoo.justgo`, team `NPDYTJS425`, container
`iCloud.com.anthonyyoo.justgo`, matching Info.plist container and CloudKit-only
Production entitlements. Registered-phone provisioning, profile and Keychain
permissions are unchanged from `1a1174d6`; Apple sign-in and Google's URL scheme
remain present. The installation QR was decoded against this exact build URL.
The phone Metro uses the matching staged API. The updated adapter requires
native `readRetainingLocal`, which also certifies fixed real-deletion markers.
An older binary cannot supply this through an OTA or development-server update;
its cloud data operations are rejected safely. The compatible `readRetainingLocal`
bridge has now been successfully exercised on the phone. Sync on matched four
challenge/journal pairs; off kept a fifth only on the phone, without diagnostic
uploads/deletions or changing the off preference. Re-enable caught up all five,
and they still matched with sync enabled/idle after force-quit and reopen.

Deleting JustGO data through Apple Settings or an encrypted-data reset retains
the phone's journal/challenge entries and saved sync preference. Enabled ordinary
sync may recreate missing iCloud storage and upload those entries; off stops
ordinary uploads and preserves local entries. There is no Clear older copy and
sync action. Genuine in-app Delete all my data/Delete account and authenticated
account epochs remain authoritative. An unfinished legacy recovery clear is
canceled only without a real deletion/cleanup or account-epoch clear to finish.
Anthony explicitly deferred external cloud deletion/recreation and second-phone
restore. These remain unverified before release under Anthony, the implementation
owner and the Phase 14 release owner; the single-phone results do not establish
them. Focused revision checks
passed 145 distinct JavaScript tests across seven suites, 30 Swift tests, mobile
source/tests typechecks, changed-file ESLint and online Expo Doctor 21/21. The
live side-panel walkthrough was blocked by browser-tool URL security policy and
is not counted as verified UI or device evidence.

Anthony explicitly deferred the remaining manual offline/reconnect, two-device,
extended provider-continuity and native Download/Import/deletion checks from the
October 22 local closeout. These remain unverified pre-release gates with Anthony,
the implementation owner and Phase 14 release owner. The routine iCloud fix used
focused native/adapter/coordinator/UI checks at his request. Subsequent PR
publication preparation passed broader checks, coverage, 43 saved journeys and
exports/smoke. The API audit scope correction passes locally; exact hosted results
are recorded on PR #43. Mobile/tooling advisories remain separate pre-release work. See the
[current publication evidence](../handoffs/phase-13-local-journal.md#pr-publication-validation).
These checks do not accept the deferred native cases.

**Configured private iCloud:** Anthony approved assigning
`iCloud.com.anthonyyoo.justgo` to the existing App ID/team. The iCloud capability
with CloudKit is saved, and the existing ad hoc provisioning profile was
regenerated for the registered phone without replacing the distribution
certificate. `JustGoCollection` and `JustGoValue` are deployed in both Development
and Production; `JustGoValue.value` is Encrypted String. The app writes private
custom zones only, with no public read/create grants for these types.

Local phone and EAS development configuration pair
`EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER=iCloud.com.anthonyyoo.justgo` with
`ICLOUD_CONTAINER_ENVIRONMENT=Production`. The internal ad hoc build uses the
Production schema; a local Xcode development signing task would need Development
instead. These environments have separate records. The fixture simulator profile
does not inherit device CloudKit access. The focused native config mod preserves
the environment after DocumentPicker's automatic entitlement mod while keeping
the service `CloudKit`; do not enable unrelated CloudDocuments storage to work
around that plugin. Generated config verifies this pair alongside the existing
Apple entitlement and Google URL scheme. Final signed IPA inspection and real
device acceptance are separate evidence.

Reuse the existing app, team and Expo project. Follow
[ACCOUNT_SYNC_SETUP.md](ACCOUNT_SYNC_SETUP.md) for exact public Auth/Google/CloudKit
environment names, Supabase provider/manual-link setup, private live-session
capability and server-only Auth deletion. The subsequent authorized rollout
supersedes the earlier missing-provider/grant audit: native Apple/Google are enabled,
0019–0023 applied, restricted-runtime readiness passes, and matching local/EAS
public Auth/Google inputs are present. Real provider/device acceptance remains
required. CloudKit configuration and any later signing/build changes retain their
existing owner authorization boundaries.

For native Apple sign-in, enable Supabase's Apple provider with
`com.anthonyyoo.justgo` as an accepted client ID/token audience and preserve team
`NPDYTJS425`. The native ID-token flow does not require a browser Services ID or a
`.p8`-generated client secret. Browser Apple OAuth is separately configured with
its Services ID, approved callback and rotating server-side secret; when both are
enabled, the Services ID comes first in Supabase's Client IDs list. See
[Supabase Apple sign-in](https://supabase.com/docs/guides/auth/social-login/auth-apple)
and the provider checklist in ACCOUNT_SYNC_SETUP.md.

The native config adds Apple sign-in, SecureStore, the original Google Sign-In
plugin when its approved reversed-client URL scheme is configured, and a focused
private CloudKit module. Configure the approved iCloud container and its private
database capabilities under the existing team using
`EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER` paired with
`ICLOUD_CONTAINER_ENVIRONMENT=Development|Production`. Verify the container association,
`JustGoCollection`/`JustGoValue` record schema and matching development/production
CloudKit environment. Confirm generated iCloud container/CloudKit entitlements
and the provisioning profile, including Sign in with Apple/iCloud, before
building. An OTA update or JavaScript export cannot add modules, the current
conditional-reset/`readRetainingLocal` bridges or capabilities. Keep unavailable states visible until
the configuration and device checks pass.

On a compatible signed build, verify both provider sign-ins/cancellation/refresh,
hidden Apple email, verified linked-method switches, linking/unlinking and the
last-method guard. Both methods may be on; Log out is separate from unlinking.
Verify existing-owner migration and automatic adoption of unowned phone writing
after the sign-in disclosure, including interruption and relaunch. There is no
optional merge step or View guest data selector. Logout must leave the same
journal editable offline, and returning sign-in to that owner resumes complete
history/writing synchronization. A different account must not receive the former
owner's writing. Exercise secure-session size/locked-device/interrupted-save
behavior and account deletion with a lost response after the real Auth profile is
erased. Browser fixtures and mocks do not close these gates.

Use two physical devices for actual opt-in private CloudKit synchronization,
concurrent journal versions, an unavailable/full iCloud account, Apple account
change, toggling off with local retention and cross-device deletion propagation.
Guest-to-account handover must include an associated guest iCloud copy and retire
it only after durable destination verification. Test a source write arriving
between read and conditional reset, a lost reset response and restart during
cleanup. Preserve internal owner isolation while showing one continuous journal.
Data/account deletion must clean previously associated copies even with sync off;
ordinary sync stays off. If a previously used Apple account is unavailable, retain
pending cleanup and do not claim full erasure. Verify retries cannot restore
deleted source writing or upload it to another owner.

Saving a downloaded ZIP to Files / iCloud Drive is a snapshot and does not verify
the iCloud Sync toggle. Complete Download my data / Import data checks must
include older challenge history, feelings, reflections, alternatives and supported
preferences without duplicate reps. Verify the confirmation modal for both Delete
all my data and Delete account: the former retains JustGO login methods, while the
latter also removes the JustGO account/Auth profile. Neither removes the user's
Apple/Google account. User-saved files remain under the user's control after app
deletion.

Next steps before release: resolve the owner-deferred checks for external iCloud
deletion retaining phone entries while the
toggle governs ordinary re-upload and for second-phone restore, then complete the owner-deferred
provider/native/iCloud matrix.
Container/schema setup and the named single-phone sync checks above are complete.
Install over the existing app to preserve phone data, and connect to the matching
API/development server. Developer
Mode was verified on the earlier installed build. An API address change alone is
delivered through JavaScript and does not require a native build; the CloudKit
bridge/capability changes above do. See the [Expo device-build walkthrough](https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/).
Reuse the confirmed `IOS_BUNDLE_IDENTIFIER` and existing Expo project. Keep secret
credentials in provider secret storage, never in `EXPO_PUBLIC_*` or checked-in
files.

An unsigned simulator build can verify this phase's launcher without enrollment. It cannot prove iCloud Keychain sharing, reinstall/two-iPhone recovery or real purchases. The permanent identifier/access group must be settled before identity testing on physical phones. [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) and [iOS submission](https://docs.expo.dev/submit/ios/) describe distinct build and store steps.

For full physical app testing, make the matching API reachable from the phone; simulator localhost is not a phone-accessible backend. Building and installing the development launcher can proceed independently when authorized. Start with one iPhone for launch/layout/gesture/timer checks. Use two iPhones for managed sign-in/history/journal synchronization and the actual CloudKit matrix above. Legacy recovery/transfer evidence remains historical/internal migration coverage. The full acceptance pass remains required before release; enrollment alone does not close any device test gate.

## First physical-phone testing checklist

1. **Already verified:** Apple membership, the registered app identifier, the linked Expo project and the matching development bundle-identifier variable. App Store Connect and TestFlight submission are not required for this internal development install.
2. **Anthony:** Connect and unlock the iPhone, accept Trust This Computer and enter its passcode on the phone. The October 11 discovery saw an iPhone 15 Pro running iOS 26.6.2, initially unpaired. Device discovery alone does not establish trust or Developer Mode.
3. **Already done with Anthony's permission:** Register that phone with Apple Developer. The side panel showed Registration Complete. Its UDID is not recorded in committed documentation; discovery and confirmation evidence remain in ignored `.local/phase-08/` files.
4. **Done by Anthony:** Run `npx eas-cli@24.11.0 device:create`, choose `anthonyyoos-team`, authenticate privately with Apple, then choose Developer Portal and the existing registered iPhone. EAS CLI subsequently verified one registered physical iPhone. No password or verification code was requested in chat.
5. **Done by agent:** EAS reused Anthony's authenticated Apple session, generated the distribution certificate and created a provisioning profile including the selected iPhone. No existing credential was deleted; no signing secret was copied into source.
6. **Done by agent:** Fresh `npm run check` passed, including online Expo Doctor. EAS archive inspection found the export implementation and custom Keychain module, with no private environment files, local test data or signing credentials. Build `1500d7ee-c49a-4047-b88a-278eccdc21bc` used the `development` profile and **finished successfully at 14:25:51 UTC on October 11**. Cloud compilation avoided a local Xcode build. It includes this branch's uncommitted export code; the dashboard's HEAD commit label does not imply that only committed source was uploaded.
7. **Installed; Developer Mode verified:** Anthony reports the installed JustGO opens to its development launcher. The downloaded IPA was inspected: its bundle ID/team/version match and its provisioning profile includes the connected iPhone. USB trust is paired. The first USB launch was rejected because Developer Mode was disabled; after Anthony enabled it and restarted, `devicectl device info details` confirmed enabled and the app launch succeeded. The older list-devices result briefly retained stale disabled metadata. See [Expo's instructions](https://docs.expo.dev/guides/ios-developer-mode/) for the phone-side setting/restart steps.
8. **Hosted prerequisite implemented:** Anthony approved bringing forward the existing test-server update. The [server handoff](../handoffs/phase-14-test-server.md) records the protected backup/restoration, unchanged migrations through 0013, identity preservation and explicit operator approval of his confirmed phone account. `https://justgo-two.vercel.app` is the application-staging API, hosted on the existing Vercel project's stable production slot. Existing preview protection remains unchanged; no fixture or bypass secret is exposed. This is test infrastructure, not a paid production release.
9. **Phone connected:** After Anthony enabled/retried JustGO Local Network access on the same Wi-Fi, Metro received the iOS bundle request and he confirmed Settings opened. The exact cause of the earlier offline error was not isolated. Only the separate one-worker LAN session on port 8084 was restarted with `EXPO_PUBLIC_API_URL=https://justgo-two.vercel.app`; the phone loaded the updated bundle and created its real private account. Anthony confirmed the displayed account reference before operator approval. Existing simulator/worktree processes were not stopped. Mac and phone must remain connected for live refresh.
10. **Together:** Use disposable entries to verify the Phase 08 checklist below, fix failures and repeat the affected checks. JavaScript/UI edits usually reuse the installed build; new native libraries, native configuration or SDK changes need another compatible build. The final release-like/staging acceptance pass remains separate.

### Hosted test backend prerequisite

The initial October 11 inventory found that the existing Vercel preview ran the older Phase 02 API. The existing Canadian Supabase project `JustGo` (`kmcpcauaxlgpevkkenwd`) is on the free organization plan. It was paused; reactivation reached `ACTIVE_HEALTHY`. No schema or account data was changed. It has four applied migrations (0000–0003), four accounts and only the identity tables; it has no challenge/attempt/reflection tables. A successful native build does not update that server.

The concrete backend work needed before full phone testing is:

1. Preserve the existing identity history with a protected, restorable backup and the [coordinated cutover checks](FOUNDATION.md#phase-07-coordinated-cutover-and-old-clients); review maintenance before applying the registered 0004–0013 migrations. Never reset shared staging or discard its four accounts.
2. Implement the already planned server-authorized free tester access in non-production, with explicit admission and expiry, real session ownership, upload eligibility and unchanged production defaults. The current deployed server defaults to unavailable access; deployment alone would leave challenge testing blocked. Keep purchases disabled and preserve tester history. Do not reuse the local fixture or add a client premium flag.
3. Prepare a reviewed mobile-reachable HTTPS API route and matching Vercel preview deployment while preserving existing deployment protection. Keep database credentials and any provider secrets server-side. This route/access configuration still needs selecting; no public endpoint or bypass was created during build setup.
4. Verify staged readiness, identity, account isolation, tester access, saved activity and export, then supply its URL to the separate phone Metro session and run the actual device checks. Record this as earlier owner-device preparation for Phase 14's hosted beta prerequisites; it does not complete the beta or paid-launch gates.

Anthony subsequently approved this prerequisite. The [test-server handoff](../handoffs/phase-14-test-server.md) records the completed backup/restoration, migration through 0013, matching protected preview and stable test API, credential fencing of old deployments, private test grant and current verification. The installed native binary was reused. Broader beta/device, durable offline admission, recovery and release gates remain open.

### Historical Phase 08 phone-check reference

These labels describe the earlier accepted build. The revised candidate uses
Account and Data → Download my data/Import data; its new native/provider checks
are listed above and in ACCOUNT_SYNC_SETUP.md.

- **Export my data:** Save the ZIP to Files, open it and check CSV/JSON contents. Open an email draft from the share sheet with the ZIP attached, cancel without losing data, retry export and check temporary-file cleanup. Actual sending is an owner action, using disposable data only.
- **Get help and Suggest a feature:** Open separate drafts to the configured inbox with the correct subjects and no automatic private attachments, then return to the app. Include support links in account/saving-recovery tools.
- **Reduce Motion:** Toggle it, relaunch and verify it is remembered. Verify the phone's own Reduce Motion setting overrides the app and that cards, Progress sheets, reflection panels, loading and toasts remain usable.
- **Settings:** Check safe areas, scrolling, Back navigation, large text and VoiceOver. Exercise the existing Account & recovery entry; the full older Keychain/reinstall/two-device recovery matrix is an additional release gate.
- **Challenge transition fixes made during this branch:** Check first and repeated Accept → challenge and Completed → Success transitions for flashes on the physical phone.

Anthony reported completing Phase 08's required physical-iPhone checks, including haptics and account deletion. Haptics acceptance covers Accept, Completed, feeling selections, the enable preview and the remembered Off preference after relaunch. See the [Phase 08 handoff](../handoffs/phase-08-settings-privacy.md) for the owner-reported acceptance and retained Phase 14 checks on the actual beta/release build. Analytics implementation remains Phase 15. App Store and social links remain unavailable until destinations exist; those do not have a working phone flow to accept today.

## Release setup sequence

| When                                       | Work                                                                                                                                                                                                                                                                                                                          | Finish line                                                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 01, in parallel                      | Choose individual or organization enrollment; begin/confirm Apple Developer membership and account access. Owner completes required identity/business verification, paid-app agreement, banking and tax details.                                                                                                              | Record status and outstanding items; Apple verification does not prevent local development. Membership and agreements must be ready for distribution/sales.                                                |
| Phase 01 onward; ready for free beta       | Reserve a stable bundle identifier, create the App Store Connect app record and Expo/EAS project, and configure signing access. RevenueCat/store-credential connection, purchase-key generation, subscription-product creation and offering/paywall mapping wait for the post-beta 07A row below.                             | Matching app identifiers and signing access for the free beta build.                                                                                                                                       |
| Phase 12                                   | Prepare reviewed Privacy Policy/Terms and disclosure answers for the implemented configuration; keep publication owner-deferred.                                                                                                                                                                                              | Local legal preparation and named open publication/release gates are handed off.                                                                                                                           |
| Phase 13                                   | Implement durable guest writing, optional Apple/Google accounts, signed-in history/journal sync, separate opt-in private CloudKit and complete Download/Import; revise notices and App Privacy preparation.                                                                                                                   | Local candidate and matching privacy sources are ready for review; real provider, signed native/iCloud and hosted rollout gates remain explicit.                                                           |
| Phase 14, before testers                   | With publication approval, finalize effective dates, publish the revised legal pages and verify public/app links; complete final signed-build disclosures.                                                                                                                                                                    | Accessible notices and metadata match the actual beta/release build.                                                                                                                                       |
| Phase 14 free beta, before 07A             | Use physical iPhones for core-app acceptance. Produce a release-like EAS build and upload using EAS Submit; test the processed build in TestFlight with explicit server-authorized free tester access.                                                                                                                        | Recovery, challenge loop, Progress and Settings pass on the signed free-beta binary. External testers may need beta review; purchase/restore acceptance follows in 07A.                                    |
| After the free beta checkpoint, during 07A | Generate the Apple purchase key, connect the iOS app/store credentials in the existing JustGO RevenueCat project, create the agreed App Store subscription group/products, and map product → entitlement → offering/paywall. Keep secret credentials out of docs and mobile source.                                           | Matching billing identifiers and configured sandbox purchase path; final offer decisions settled before billing validation. Earlier local billing-code preparation does not authorize this external setup. |
| Phase 14 paid launch, after accepted 07A   | Complete App Store metadata, current screenshots, icon, privacy disclosures/policy, support URL, age/content declarations, subscription information and review notes explaining no-signup access. Give reviewers the access needed to inspect the paid app. Submit the first subscription with the app version when required. | Select the tested build and explicitly submit in App Store Connect for App Review; choose the intended release control and address review feedback.                                                        |
| After approval/release                     | Verify the public listing and purchase/restore flow. Complete the separate hackathon submission using its current rules and required demo/assets.                                                                                                                                                                             | Record the submitted entry and released build. Do not assume later app updates will be included in judging without checking the event rules.                                                               |

EAS builds/signs the app and uploads it to App Store Connect/TestFlight. It does not replace Apple membership or automatically complete listing/review submission. Recheck current requirements during setup; build queues, account verification and review times vary. References: [Expo iOS submission](https://docs.expo.dev/submit/ios/), [Apple enrollment](https://developer.apple.com/programs/enroll/), [first in-app purchase submission](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase).
