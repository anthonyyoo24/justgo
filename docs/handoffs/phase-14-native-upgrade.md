# Phase 14 prerequisite — SDK 58 native upgrade

## Status and integration boundary

Implemented on `codex/phase-14-native-upgrade` and published in PR #46. The original
SDK 58.0.17 signed client is installed on the registered iPhone; its native launch
and owner-observed basic continuity/interaction smoke pass. The current SDK 58.0.19
patch client is built and signature/configuration verified, but installation and
its own phone smoke remain pending phone availability. Broader release acceptance
remains open.
This is the separate STK-2 prerequisite, not Phase 14 release closeout.

The branch starts at Phase 13 integration `32c66ff`, preserved separately on
`codex/phase-13-integration`. Its tree exactly matches reviewed candidate
`a3a3be2`; #44 merged to `main`, while #43 merged to the foundation branch after
that merge. Remote `main` remains `f7c7a69` and lacks the second part. Local `main`
tracks the remote. Anthony authorized pushing the Phase 14 branch and opening a
single PR into `main`, carrying both the missing reviewed Phase 13 refinements
and the SDK upgrade. The preserved integration branch is a local reference;
there is no separate integration PR. Merge still requires owner review and
specific approval. Reviewed Phase 13 hosted checks do not establish hosted
acceptance of this combined candidate; inspect its own required checks.

## Runtime and compatibility changes

- Expo 58.0.19, React Native 0.88.0 and React 19.3.0, with Expo's compatible
  native packages. The exact set lives in [FOUNDATION.md](../operations/FOUNDATION.md).
  Preserve iOS 16.4, app/team identity, approved CloudKit/Production configuration,
  provider configuration and static framework linkage. SDK 57 binaries cannot
  load this runtime; install the new development client in place.
- RN strict ref-instance and keyboard-event types replace removed legacy types.
  Settings Space activation reads `nativeEvent.key`. Native file writes/reads are
  awaited before sharing, account checks and handle cleanup; delayed/rejected I/O
  regressions preserve bounds, cancellation, owner fences and cleanup.
- Router 58 has an explicit Access anchor for denied cold links and protected
  pushes. Deletion removes private routes even when a public anchor remains in
  Back history. Web previews keep synchronous single-page bundling. Retained
  inactive web screens are asserted through accessible role/name queries.
- Sentry RN 8.28.0/Cocoa 9.29.0 retains independent JS/native allowlists and
  disabled ordinary delivery. The fail-closed plugin adapts Cocoa's internal
  integrations, disabled capture sources, nullable exception fields and
  attachment-aware callback. Initialization precedes SceneDelegate startup.
  Swift contract fixtures and a real signed compile pass; they do not establish
  outbound native envelope/cache privacy or crash symbolication.
- Testing Library 14.1.0 requires `test-renderer` 1.3.0 and asynchronous test
  operations. The migration awaits render/events/act/navigation/unmount and
  preserves timing, stale-callback, cancellation and accessibility assertions.
  No coverage floor or warning assertion was weakened.

## Signed native build

[Development build e9a503b3](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/e9a503b3-d1d9-4e69-abdf-aa7630b1888e)
finished October 23, 2026, at 20:54:04 UTC, using pinned invocation EAS CLI 25.3.0.
App 0.1.0 (1), bundle `com.anthonyyoo.justgo`, team `NPDYTJS425`, existing ad hoc
profile and registered phone are preserved. EAS records parent commit `32c66ff`;
the uploaded working-tree archive contains the uncommitted SDK changes. Its 388
files were checked byte-for-byte, with no environment, credentials, generated
native output or local evidence included. Later test/JS and compatible Zod patch
changes use the development server; they do not change native module/config inputs.

The downloaded IPA passes `codesign --verify --deep --strict`. Its signed app
contains the scene manifest, Apple sign-in, Google return scheme, approved
CloudKit-only Production container and `readRetainingLocal` bridge; obsolete
`readGuarded` is absent. Application/profile identity preserves default per-app
Keychain authorization. Anthony confirmed that the existing account and Progress
history remain available after the upgrade; the extended secure-session/Keychain
matrix remains a release gate.
IPA SHA-256: `9e198ca6fa38049df344051ff566cf60e68a11ea0557cb8b5dbd9177ad27142d`.
Installation through `devicectl` succeeded in place without uninstalling or
clearing phone data. After Anthony unlocked the phone, `devicectl` successfully
launched the app into the current LAN development server. Metro built and served
the iOS bundle (2,873 modules, 23.4 seconds), the app process remained present,
and no JavaScript error was reported. The earlier locked-device launch refusal
is resolved. Anthony then confirmed Home loads with the existing account and
Progress history, a Progress day sheet/editor opens and closes normally, and
Settings → Data shows the expected iCloud status. These are owner-observed phone
smoke results, separate from process/bundle evidence; they do not establish
multi-device CloudKit, full Files flows or extended lifecycle/accessibility cases.
Generated SDK 57 native output was retained under ignored
local storage; the fresh SDK 58 prebuild includes SceneDelegate.

### Current SDK 58 patch client

Fresh publication validation picked up new SDK 58 patch recommendations for Expo,
development client, File System, Font, Image, Router and SQLite. The current lock
uses Expo 58.0.19, Router 58.0.26, development client 58.0.15 and SQLite 58.0.14.
Core 58.0.26/JSI 58.0.19 change native shared-object handling, and SQLite changes
native class registration, requiring a rebuilt client. Published native templates
and Sentry RN 8.28.0/Cocoa 9.29.0 remain unchanged; no JustGO caller or privacy-plugin
change is needed. Preserve the existing navigation, storage and device gates.

[Development build dc7a7feb](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/dc7a7feb-c0d6-47a5-bd93-a42d100c211f)
from `f32b7e3` finished October 24, 2026, at 00:27:28 UTC. The inspected archive
contains 360 source files matching the checkout byte-for-byte, excluding generated
inspection Git metadata. The downloaded app passes strict/deep signature
verification and retains the same app/version, provisioning profile, entitlements,
scene manifest, provider URL schemes and `readRetainingLocal` bridge.
IPA SHA-256: `0c074b0a1d5c4a0086619c6d14eede196138a5a8de6485c3c5842233083472a9`.
The Mac could not reach the paired phone for installation. Anthony and the
implementation owner retain in-place installation, current-bundle launch, saved
history/Progress interaction and native Files smoke as open checks for this patch
client; the earlier build's phone evidence does not establish those results.

## Verification and dependency health

Final local full `check` passes: online Doctor 20/20, all source/test/journey
typechecks, lint (zero errors, 176 existing warnings), formatting, 270 tooling,
180 API unit, 1,538 mobile and 35 contract tests. Full coverage includes 272 API
unit/database/helper/migration cases and passes all aggregate/critical floors:
mobile 88.92% branches / 94.74% lines, API 88.59% / 96.22%, contracts 100% / 100%.
The database service was started after an initial connection-refused coverage
attempt; the complete final run passes against isolated loopback `justgo_test`.
The initial upgrade passed root `npm ci`; the current patch build uses EAS
installation from the lockfile. Current CLI/Jest resolution passes the full
local check. All 43 saved journeys pass after replacing hidden-text matching in
the startup regression with accessible heading/control assertions. The ordinary
production web/iOS JavaScript exports and independent static/no-API-traffic web
smoke pass. Sentry's
optional internal Router-store import emits an upstream Metro resolution warning;
its guarded fallback is present, tracing is disabled, and actual diagnostics
journeys/exported-web runtime pass without a browser error. No resolver alias or
warning suppression was added.

The first hosted [PR #46 run](https://github.com/anthonyyoo24/justgo/actions/runs/40029145314)
on `139d27b` passed static, unit, database, exports and native CloudKit jobs.
The download-error journey failed because its late interceptor could miss an
already-started successful cloud read; the aggregate check correctly rejected
that failed producer. The follow-up isolates the previous Home document, gates
the intended Data read and injects one typed permanent failure, leaving queued
background reads healthy. A separate NETWORK component regression protects safe
feedback, zero output and retry only after another explicit press. No application
behavior, timeout, retry allowance or CI requirement was weakened. Hosted
acceptance for that follow-up passed all seven Foundation jobs on `19c2d21`
([run 40032874404](https://github.com/anthonyyoo24/justgo/actions/runs/40032874404)),
including all 43 journeys and the combined coverage gate. Later PR heads still
require their own checks.

The complete file lists in changed directories were reviewed. Existing feature,
support, platform-adapter pairs, plugin and documentation groups remain coherent;
the new SVG test fixture stays with mobile test support. No folder move is needed.

The grouped in-app browser walkthrough verified guest entry, Terms/Privacy,
Home, Settings keyboard Space activation, Data and the disabled web iCloud sheet
with its platform explanation, using the guarded local fixture/API/database.
It is separate from saved journeys and physical evidence. Browser notched
safe-area behavior remains unverified; no native safe-area workaround was added.

Compatible security patches include fflate, shell-quote, source-map-js,
Vitest/Vite and Zod 4.6.7. The Zod advisory updated October 23 required a fresh
API audit and all-consumer checks; the 87-entry API production graph passes with
zero advisories. The final root audit retains nine advisories: zero critical,
five high and four moderate. node-forge 1.4.0 propagates through Expo signing/CLI,
and CLI's separate Zod 3.25.76 remains affected by the new Zod advisory. Neither
has a compatible published fix; do not override CLI to Zod 4 or downgrade Expo
to obtain a clean audit. Drizzle-only development tooling retains moderate
esbuild advisories. The dependency/release owners must resolve these before public
release; tooling exposure has not been established non-exploitable. See
[node-forge advisory](https://github.com/advisories/GHSA-86w9-cpqp-85rv) and
[Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

## Remaining gates

The original build's basic upgrade smoke passes; the current patch client still
needs its own installation/phone smoke as recorded above. The implementation owner
and Anthony retain
extended scenes/lifecycle, keyboard/accessibility, gestures/haptics, actual Files
read/write/cancellation, SQLite interruption/durability and secure-session
acceptance for the release matrix. The confirmed account/history and expected
iCloud status do not establish those cases or a new cloud round-trip.
The broader owner-deferred Phase 13 offline/provider/multi-device/Files/deletion
matrix and all [Phase 14 release gates](../implementation-plan/phase-14-release.md)
remain open. Ordinary diagnostics and product analytics remain disabled; signed
crash/restart payload/cache/header/symbolication acceptance precedes diagnostics
activation. The authorized PR still requires exact-candidate hosted checks and
owner review/merge approval; release/distribution permissions remain separate.
