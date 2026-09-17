# Apple, Expo and RevenueCat setup

Started September 17, 2026. Owner: **Anthony**. Apple Developer setup has **not been started**. Anthony has created the Expo project `justgo` (`53cf0560-8ab5-446a-9bc6-deb193b337b5`); that existing ID is saved in the mobile configuration. CLI authentication and `eas init` / `eas project:info` verified the link to `@anthonyyoos-team/justgo` on September 17, 2026. This records the work early; it does not assert enrollment, signing or store readiness.

| Item                                                                                  | Status                                                        | Required by                  |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------- |
| Choose individual or organization enrollment                                          | Owner decision pending                                        | Physical-device distribution |
| Apple Account access and Developer Program enrollment                                 | Not started                                                   | Device distribution / 08     |
| Identity/business verification and agreements                                         | Owner must complete                                           | Distribution/sales           |
| Banking and tax information                                                           | Owner must complete; never put values in this repo            | Sales                        |
| Reserve permanent bundle ID                                                           | Pending; `dev.justgo.foundation` is local-only and unreserved | 02 device identity tests     |
| App Store Connect app record                                                          | Pending enrollment and bundle ID                              | 08                           |
| Expo account/team and EAS project                                                     | Linked and remotely verified: @anthonyyoos-team/justgo        | EAS development build        |
| Signing access and physical iPhone registration                                       | Pending                                                       | 02                           |
| Existing JustGO RevenueCat project access                                             | Mentioned by plan; access/configuration not verified here     | 08                           |
| Connect RevenueCat iOS app, store credentials                                         | Pending Apple app/product setup                               | 08                           |
| Subscription group/products, pricing/trials                                           | Owner product decision pending                                | 08                           |
| Product → entitlement → offering/paywall mapping                                      | Pending agreed offer                                          | 08                           |
| Sandbox purchase and restore                                                          | Not run; no purchase code in 01                               | 08                           |
| Release-like build, TestFlight, App Review metadata and first subscription submission | Future release work                                           | 10                           |

Next owner actions: choose enrollment type and start [Apple enrollment](https://developer.apple.com/programs/enroll/), choose the permanent identifier, then configure signing for the linked Expo project. Set `IOS_BUNDLE_IDENTIFIER` in the appropriate EAS environment. Do not create another Expo project. Keep credentials in provider secret storage, never in `EXPO_PUBLIC_*` or checked-in files.

An unsigned simulator build can verify this phase's launcher without enrollment. It cannot prove iCloud Keychain sharing, reinstall/two-iPhone recovery or real purchases. The permanent identifier/access group must be settled before identity testing on physical phones. [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) and [iOS submission](https://docs.expo.dev/submit/ios/) describe distinct build and store steps.
