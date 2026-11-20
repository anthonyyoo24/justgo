# Phase 16 Appendix A: Superwall prototype results (2026-11-19)

- Branch: `proto/phase16-superwall` (local only, not pushed).
- Worktree: `/Users/anthonyyoo/Documents/apps/justgo/.claude/worktrees/proto-superwall`.
- Commit: `55dca0b4`, based on origin/main `481e1bcf`. It was committed with hooks off because the prototype code is not lint-clean. Do not merge it.
- Versions: expo-superwall 1.8.0, which pins SuperwallKit 4.18.3 (`node_modules/expo-superwall/ios/SuperwallExpo.podspec`). 1.9.0 was released 2026-11-19, under a day ago, and was not tried.
- Evidence files are in the worktree under `proto/`. Logs are in the scratchpad at `/private/tmp/claude-501/-Users-anthonyyoo-Documents-apps-justgo/e3c48832-94e7-43b9-8526-f4c87f7598b5/scratchpad/logs/`, which a reboot can clear.
- In the citations below, `SK/` means `apps/mobile/ios/Pods/SuperwallKit/Sources/SuperwallKit/`, and `EXS/` means `node_modules/expo-superwall/ios/`. Both are under the worktree.

## Q1. Does expo-superwall install and build on SDK 58 / RN 0.88? **Yes** (simulator, Debug)

### Install
- Ran `pnpm add expo-superwall@1.8.0` in apps/mobile. It printed `ERR_PNPM_IGNORED_BUILDS: expo-superwall@1.8.0`.
- That postinstall only checks the Expo version. Running it by hand (`scripts/check-expo-version.js`) exited 0.
- A real PR must add `expo-superwall` to `allowBuilds` or accept skipping it.

### Prebuild and pods
- `expo prebuild --platform ios --clean` succeeded. Its own pod step failed on a CocoaPods UTF-8 locale error (`Encoding::CompatibilityError`).
- `LANG=en_US.UTF-8 pod install` then printed "Pod installation complete! 134 dependencies, 152 total pods". This included SuperwallKit 4.18.3, Superscript and SuperwallExpo.
- `apps/mobile/ios/` is gitignored (root `.gitignore` line 14), so no generated native files are tracked.

### Build
- `xcodebuild -scheme JustGO -configuration Debug -sdk iphonesimulator` printed `** BUILD SUCCEEDED **`, exit 0. Wall time was 666 s on this 8 GB Mac.
- The only Superwall warnings are inside SuperwallKit: deprecations, an unused value and Swift 6 notes. Summary: `proto/q1/build-summary.txt`.

### Run
- The app was installed on an iPhone simulator (iOS 26) and loaded through Metro (`expo start --dev-client --localhost`). No .env file was used, so nothing reached hosted JustGO.
- The bundle loaded (2962 modules), and JS logged `[Superwall] Initialized listeners`.
- Welcome rendered with the overlay showing `SW configured=true loading=false error=none`. Screenshot: `proto/q1/q1-welcome-configured.png`.
- Wiring: one `SuperwallProvider` in `apps/mobile/src/app/_layout.tsx` with the placeholder key `pk_placeholder_prototype`.

### Not tried
- `expo run:ios` itself. I ran the same xcodebuild by hand to keep it to one long build.
- A Release build, EAS, and a physical device.

### Observed on the network
With the placeholder key and the default `eventTrackingBehavior` (`all`), the app contacted:
- `api.superwall.me/api/v1/static_config`
- `collector.superwall.me/api/v1/events` (analytics sent at startup)
- `subscriptions-api.superwall.com/.../redeem` (after `identify`)

## Q2. Does `identify(uuid)` set StoreKit's `appAccountToken`? **Yes** (read in source, not seen in a real transaction)

- JS `identify` calls `SuperwallExpoModule.identify` (`node_modules/expo-superwall/build/src/useSuperwall.js:140-144`).
- That calls `Superwall.shared.identify(userId:options:)` (`EXS/SuperwallExpoModule.swift:149-155`).
- `SK/Identity/IdentityManager.swift:35-43` returns `UUID(uuidString: appUserId)` when the user ID parses as a UUID. Otherwise it falls back to Superwall's alias UUID:
  ```swift
  var appAccountToken: UUID? {
    if let appUserId = appUserId, let uuid = UUID(uuidString: appUserId) { return uuid }
    else { return UUID(uuidString: aliasIdWithoutPrefix) }
  }
  ```
- StoreKit 2, the default (`SK/Config/Options/SuperwallOptions.swift:131`), uses it at `SK/StoreKit/Transactions/Purchasing/StoreKit 2/ProductPurchaserSK2.swift:91-92`: `if let appAccountToken = identityManager.appAccountToken { options.insert(.appAccountToken(appAccountToken)) }`
- StoreKit 1 uses it at `.../StoreKit 1/ProductPurchaserSK1.swift:84`: `payment.applicationUsername = identityManager.appAccountToken?.uuidString`.
- **Caveat:** a guest who is not identified still gets a token, Superwall's random alias UUID. The server must treat an unknown token as "no JustGO account", not as an error.
- **Caveat:** `identify` with a different user than the current one calls `Superwall.shared.reset(duringIdentify: true)` (`SK/Identity/IdentityManager.swift:214-251`).

## Q3. Can the phone get the App Store transaction ID? **Yes** (read in source, not seen at runtime; see Q6)

- `purchase()` resolves only `{type: purchased|cancelled|pending|failed}` (`EXS/Json/PurchaseResult+Json.swift:33-44`). **No ID.**
- `restorePurchases()` resolves only `{result, errorMessage}` (`EXS/Json/RestorationResult+Json.swift:25-32`). **No ID.**
- `getCustomerInfo().subscriptions[].transactionId` does carry it:
  - The JSON is built at `EXS/Json/CustomerInfo+Json.swift:7,19`.
  - The ID is StoreKit 2 `String(Transaction.id)` (`SK/StoreKit/Products/Receipt Manager/EntitlementProcessor.swift:159-160, 470-472`).
  - The type is declared at `build/src/SuperwallExpoModule.types.d.ts:379`.
- The `transactionComplete` Superwall event, through `useSuperwallEvents({ onSuperwallEvent })`, carries `transaction.storeTransactionId`, `originalTransactionIdentifier` and `appAccountToken`:
  - `EXS/Json/SuperwallPlacementInfo+Json.swift:64-75`
  - `EXS/Json/StoreTransaction+Json.swift:11,12,21`
  - `SK/StoreKit/Transactions/StoreTransaction/SK2StoreTransaction.swift:33,35,44`
  - The `transaction` field is optional there.
- Plan impact: read the ID from the `transactionComplete` event, or from `getCustomerInfo()` after `purchase()` resolves. Nothing exposes the signed JWS itself, so the server must fetch it by ID from the App Store Server API.

## Q4. With `eventTrackingBehavior` set to `none` or `superwallOnly`, do paywalls, purchases and server data still work? **Partly** (read in source)

### Paywalls and purchases
- Paywall loading is not gated by tracking. `getConfig` and `getPaywall` are at `SK/Network/Network.swift:83,179`, and triggering is independent of tracking (`SK/Analytics/Internal Tracking/Tracking.swift:135-139`).
- On-device purchase handling is also ungated (`SK/StoreKit/Transactions/TransactionManager.swift:793-845`).

### `none`
- `PlacementsQueue.trackingAllowed` returns false, so nothing is enqueued, and `flushInternal` drops everything (`SK/Storage/PlacementsQueue.swift:101-121`).
- So the SDK sends no transaction events to Superwall.
- Install attribution matching is also skipped (`SK/Superwall.swift:619`).

### `superwallOnly`
- Blocks only TriggerFire, UserAttributes and user `track` calls (`SK/Storage/PlacementsQueue.swift:101-115`, `SK/Config/Options/EventTrackingBehavior.swift:10-42`).
- Internal transaction events still go to `/events`. They are enqueued at `TransactionManager.swift:1158-1172` and flushed at `PlacementsQueue.swift:133-134`.

### Webhooks
- Superwall's docs say webhooks come from App Store Server Notifications sent to Superwall, not from the SDK. So they should still fire under either setting.
- **Unproven:** this was not run, because it needs a real Superwall project.
- `superwallOnly` stops user attributes being sent, so webhook payloads would lack attributes set by the SDK.

### Delegate
- The JS delegate still receives every event whatever the setting (`Tracking.swift:26-32`).

### Startup gap
- The default is `.all` (`SuperwallOptions.swift:366`).
- `/events` was observed being sent at startup before any change. To send nothing, the option must be passed to `configure`, not set later.

## Q5. Can the API verify an Apple signed transaction in the pinned Supabase Edge runtime? **Unproven in the pinned runtime. Yes in Node 24 and Bun 1.4.4.**

### Blocker
- This Mac has no Docker, OrbStack, Deno or supabase CLI, so `pnpm run test:edge` (`apps/api/scripts/edge-smoke.ts`) cannot run here.
- CI runs it (`.github/workflows/ci.yml:144`).

### Test chain
- A self-made chain shaped like Apple's (`proto/q5/*.pem`):
  - Root: P-384.
  - Intermediate: P-384, with OID 1.2.840.113635.100.6.2.1.
  - Leaf: P-256, with OID 1.2.840.113635.100.6.11.1.
- `leaf.key` is a throwaway test key.

### WebCrypto-only verifier (`proto/q5/webcrypto-verify.mjs`, about 190 lines)
- Uses no Node built-ins: a small DER reader, a pinned-root byte match, validity at `signedDate`, both Apple OIDs, CA basic constraints, ECDSA chain signatures and the ES256 JWS check.
- `proto/q5/run-webcrypto.mjs` output, identical on Node 24.18 and Bun 1.4.4:
  ```
  valid: ACCEPTED transactionId=2000000123456789 appAccountToken=7f1d6c2e-…
  tamperedPayload: REJECTED JWS_SIGNATURE
  unpinnedRoot: REJECTED ROOT_NOT_PINNED
  wrongBundle: REJECTED BUNDLE_ID
  chainSwappedRoot: REJECTED INTERMEDIATE_SIGNATURE
  leafAsIntermediate: REJECTED INTERMEDIATE_OID
  ```
- It bundles to 7 KB with esbuild `--platform=neutral`.

### `@apple/app-store-server-library@3.1.0`
- Called as `SignedDataVerifier([root], false, Environment.SANDBOX, bundleId).verifyAndDecodeTransaction`.
- Results on Node and Bun: valid ACCEPTED, tampered REJECTED (status 1), unpinned root REJECTED (1), wrong bundle REJECTED (3).
- With the edge-build esbuild options (esm, node platform) it bundles to 1.2 MB.
- **Concerns:**
  - It needs node:crypto `X509Certificate` (`verify`, `issuer`, `subject`), jsonwebtoken and jsrsasign, which is untested in the Deno-based edge runtime.
  - It bundles and imports `node-fetch` for OCSP. That bypasses `outboundFetch()`, and AGENTS.md bans `node-fetch` in `apps/api/src`.
- Recommendation: use the WebCrypto verifier, or vendor that approach, and prove it with a case in `test:edge` in CI.
- `Environment.LOCAL_TESTING` skips chain checks, so never use it outside tests.

## Q6. Does a `.storekit` file let a purchase complete locally in the Expo dev build? **Unproven** (blocked)

### What was set up
- `proto/q6/JustGO.storekit` (version 4) has:
  - `com.anthonyyoo.justgo.pro.annual`: US$59.99/year with a 7-day (P1W) free trial.
  - `com.anthonyyoo.justgo.pro.monthly`: US$12.99/month.
- It was copied to `apps/mobile/ios/JustGO/JustGO.storekit` and attached to the JustGO scheme's LaunchAction (`StoreKitConfigurationFileReference`).
- A temporary overlay has buy, customerInfo, restore and identify buttons (`apps/mobile/src/dev/SuperwallProto.tsx`).

### Result
- Tapping "buy annual" and "customerInfo" never resolved in about 90 s. Screenshot: `proto/q1/after-identify-buy-customerinfo.png`. `identify` resolved.

### Why (source)
- `Superwall.purchase` gets products through `products(for:)`, which first awaits a loaded Superwall config: "Await config because we must have entitlements before fetching products" (`SK/Superwall.swift:949-957`).
- `getCustomerInfo` awaits a non-placeholder customer info (`SK/Superwall.swift:1557-1573`).
- With a placeholder key, config never loads, so StoreKit is never reached.

### Also open
- A scheme StoreKit configuration normally applies only when Xcode itself launches the app. The simulator launch used here (simctl, as `expo run:ios` also uses) probably bypasses it. **Unproven.**
- `apps/mobile/ios` is regenerated by `prebuild --clean`, so a real setup needs a config plugin that copies the file and edits the scheme.

### To finish
- Use a real Superwall test project key with the two products added, and run the app from Xcode, or use `SKTestSession` in a UI test.
- Superwall's docs say local StoreKit purchases fire no webhooks.

## Q7. superwall.com/docs

### Apple disclosures on a paywall: **Partly**
- The docs cover:
  - Product price, period and trial variables in the paywall editor.
  - A Restore action.
  - An "Open URL" action for Terms and Privacy links.
- Found no documented auto-renew text variable and no App Store guideline 3.1.2 checklist. That text has to be written by hand in the paywall design. **Unproven** that the editor shows it per locale.

### Trial reminder for Expo: **Partly**
- Documented in general on the paywall-editor notifications page: a "trial started" local notification (iOS SDK 4.10.7 or later), set up per paywall in the dashboard. No Expo-specific page was found.
- Source shows how it works:
  - After `freeTrialStart` it schedules through native `UNUserNotificationCenter`, requesting `.alert/.sound/.badge` (`SK/StoreKit/Transactions/Notifications/NotificationScheduler.swift:32,61`).
  - If permission is denied, it shows its own alert (lines 81-107).
- So expo-notifications is not required.
- Reminders run only for purchases started from a Superwall paywall. `purchase()` and observer purchases use an empty `paywallInfo` with no notifications (`TransactionManager.swift:1150, 1183-1198`).

### Deleting one user's data: **Yes** (documented)
- Dashboard: "Delete user data", with a 25-day hold.
- API: `POST https://api.superwall.com/v2/applications/{application_id}/user_erasures` with body `app_user_id`. The key needs the `app_users:erase` scope.
- It does not cancel subscriptions and keeps revenue records.

## Things that affect the Phase 16 plan
1. **Purchases depend on Superwall config.** `purchase()` waits for a Superwall config. On first launch with no network, or during a Superwall outage, buying hangs. A cached config is used only in some cases (`SK/Config/ConfigManager.swift:290-334`).
2. **No signed JWS on the phone.** The server must look up the transaction by ID through the App Store Server API, or receive ASSN v2.
3. **Guests get an alias UUID as `appAccountToken`.**
4. **Tracking must be set at `configure`.** The default `all` sends `/events` at startup. Check this against the analytics rule in AGENTS.md (no analytics SDK until Phase 17) and the Privacy Policy. Superwall itself may count as an analytics or tracking SDK under that rule.
5. **Deep links go to Superwall.** `SuperwallProvider` passes every incoming non-Expo deep link, including `justgo://auth/callback`, to `SuperwallExpoModule.handleDeepLink` (`node_modules/expo-superwall/build/src/SuperwallProvider.js:101-121`). This needs a privacy review.
6. **Edge proof needs CI.** It cannot run on this Mac. Prefer the WebCrypto verifier over Apple's library, because of `node-fetch` and node:crypto X509.
7. **The README says to compile iOS on EAS.** A local Debug build did finish here (666 s, simulator closed during the build).
8. **Cleanup left for later.** The worktree, the local branch and the simulator `proto-superwall` (E0A70293-…) remain. The simulator is shut down.
