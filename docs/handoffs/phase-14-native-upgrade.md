# Phase 14 prerequisite — SDK 58 native upgrade

## Status and integration boundary

Implemented locally on `codex/phase-14-native-upgrade`; signed development build
installed on the registered iPhone. Physical runtime acceptance is still open.
This is the separate STK-2 prerequisite, not Phase 14 release closeout.

The branch starts at Phase 13 integration `32c66ff`, preserved separately on
`codex/phase-13-integration`. Its tree exactly matches reviewed candidate
`a3a3be2`; #44 merged to `main`, while #43 merged to the foundation branch after
that merge. Remote `main` remains `f7c7a69` and lacks the second part. Local `main`
tracks the remote; no changes have been pushed and no new PR has been created.
Finish that integration separately with the owner's specific Git authorization
before publishing an upgrade-only PR. Reviewed Phase 13 hosted checks do not
establish hosted acceptance of this SDK branch.

## Runtime and compatibility changes

- Expo 58.0.17, React Native 0.88.0 and React 19.3.0, with Expo's compatible
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
finished October 23, 2026 at 20:54:04 UTC, using pinned invocation EAS CLI 25.3.0.
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
Keychain authorization; actual credential continuity still requires device proof.
IPA SHA-256: `9e198ca6fa38049df344051ff566cf60e68a11ea0557cb8b5dbd9177ad27142d`.
Installation through `devicectl` succeeded in place without uninstalling or
clearing phone data. The first launch attempt was refused by iOS because the
phone was locked; the SDK 58 LAN Metro server is ready and Anthony has been asked
to unlock it. No native runtime result is claimed from that attempt.
Generated SDK 57 native output was retained under ignored
local storage; the fresh SDK 58 prebuild includes SceneDelegate.

## Verification and dependency health

Final local full `check` passes: online Doctor 20/20, all source/test/journey
typechecks, lint (zero errors, 176 existing warnings), formatting, 270 tooling,
180 API unit, 1,537 mobile and 35 contract tests. Full coverage includes 272 API
unit/database/helper/migration cases and passes all aggregate/critical floors:
mobile 88.90% branches / 94.74% lines, API 88.59% / 96.22%, contracts 100% / 100%.
The database service was started after an initial connection-refused coverage
attempt; the complete final run passes against isolated loopback `justgo_test`.
Root `npm ci` reproduces the locked dependency layout, including CLI/Jest core
resolution. All 43 saved journeys pass after replacing hidden-text matching in
the startup regression with accessible heading/control assertions. The ordinary
production web/iOS JavaScript exports and independent static/no-API-traffic web
smoke pass. Sentry's
optional internal Router-store import emits an upstream Metro resolution warning;
its guarded fallback is present, tracing is disabled, and actual diagnostics
journeys/exported-web runtime pass without a browser error. No resolver alias or
warning suppression was added.

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

The implementation owner and Anthony must verify the installed client launches
the current native bundle, preserves account/history and Keychain access, and
recheck affected scenes/lifecycle, keyboard, gestures/haptics, Files I/O,
SQLite durability and iCloud on the phone. An in-place install is not that proof.
The broader owner-deferred Phase 13 offline/provider/multi-device/Files/deletion
matrix and all [Phase 14 release gates](../implementation-plan/phase-14-release.md)
remain open. Ordinary diagnostics and product analytics remain disabled; signed
crash/restart payload/cache/header/symbolication acceptance precedes diagnostics
activation. Publication also requires owner Git permission and exact candidate
hosted checks; release/distribution permissions remain separate.
