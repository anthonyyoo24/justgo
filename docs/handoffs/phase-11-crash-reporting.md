# Phase 11 — App crash and error reporting

## Summary and status

**Status:** Implemented locally; reporting scope approved. Notices/activation and
signed-build acceptance remain open. [Plan](../implementation-plan/phase-11-crash-reporting.md).
Depends on [Settings/privacy](phase-08-settings-privacy.md) and
[Terms & Privacy entry](phase-10-acceptance.md). Product analytics remains deferred.

## Decisions and why

- Use Expo 57's supported Sentry React Native 7.11.0 / Cocoa 8.58.0. Do not bypass
  Expo dependency validation to install a newer major SDK.
- Rebuild allowlisted JS and native events instead of relying on default PII
  options. Native crashes do not pass through JavaScript `beforeSend`.
- Anthony approved minimal essential diagnostics under the Privacy Policy on
  October 18, including startup before onboarding acceptance. The implementation
  already supports this without legal receipts or document-view tracking. Keep ordinary delivery
  disabled until Phase 12 completes matching notices/provider review and Phase 13
  verifies the signed build; those gates remain separate from the owner scope choice.

## Behavior that changed

Diagnostics starts before Router, captures global unhandled errors/rejections and
reports the root ErrorBoundary once per Error instance. Recovery UI stays generic.
The independent final JS transport strips extra envelope items, bounds requests
and isolates provider failures. An idempotent iOS config plugin installs an early
native allowlist with explicit enabled/off behavior. Metro emits debug IDs; the
official build plugin prepares symbol uploads. Development Settings offers synthetic
checks through the guarded preview route; production exposes neither control.

The [app-shell boundary](../architecture/APP_SHELL.md#app-error-reporting) owns the
implementation invariants and the [inventory](../legal/DATA_INVENTORY.md#sentry-diagnostic-boundary)
owns allowed fields, local cache, provider facts and privacy-request limits.

## Invariants to preserve

No account IDs, journal text, feelings, credentials, raw messages, request metadata,
breadcrumbs, replay, performance events or attachments may enter exported events.
Keep both native and JS allowlists; JS must not reinitialize Cocoa. Reporting cannot
block product saves/access/recovery or become a condition for them. Do not connect
this provider to the dormant analytics exporter or backfill activity.

## Problems that could recur

- An OTA environment flag cannot disable baked native reporting. Rebuild the
  binary for native enable/off changes; the Sentry project key can stop ingestion
  separately in an incident.
- Native crash files can contain original details locally before scrubbed delivery
  on restart. Native/device inspection is required before launch.
- Cocoa 8.58 has no attachment-aware send callback. Automatic attachment features
  are disabled and attachment size is zero; adding manual attachment APIs needs
  renewed review.
- Native envelope headers are built after event filtering. They contain random
  trace ID, public ingestion key, configured release/environment and SDK metadata.
  Native user/segment/replay scope or manual span APIs need renewed review; signed
  payload inspection must check headers as well as event bodies.
- Development stack paths are dropped. Generic browser delivery does not establish
  that signed-build source maps/dSYMs resolve useful native/JS crash locations.
- Expo development error overlays/toasts are separate from release recovery UI.
  Browser identity is memory-only and remounting the root returns to Welcome.

## Setup or environment changes

Use the public settings in [the mobile environment example](../../apps/mobile/.env.example):
`EXPO_PUBLIC_SENTRY_ENABLED`, `EXPO_PUBLIC_SENTRY_DSN` and
`EXPO_PUBLIC_SENTRY_ENVIRONMENT` (`development`, `staging` or `production`).
Only this US project ingestion DSN is accepted. Keep `SENTRY_ENVIRONMENT`, when
provided, consistent. The actual public DSN lives in local fixture configuration;
the ordinary `.env.local` remains unchanged/disabled.

Release symbol uploads need a private `SENTRY_AUTH_TOKEN` in the build environment;
never put it in public Expo variables or plugin options. No token was created and
no repository integration was authorized. Native rebuild/signing is a separate
task. Native reporting-enabled Release builds must retain required symbol uploads.
Debug and reporting-disabled builds skip uploads; enabled Release builds fail
without a token and do not accept upload-bypass flags.
Use the existing [testing commands and fixture guards](../operations/TESTING.md).
Journeys force a fake DSN and intercept hosted Sentry requests; real-provider probes
use only disposable synthetic errors. No real account/reflection content was sent.

## Open gates

| Gate                                        | Owner                                  | Required phase        | Done when                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approved diagnostics notices and activation | Anthony / legal reviewer               | 12, before activation | Review the approved minimal Policy-only startup diagnostics, reconcile notices/versions and provider settings, then enable after signed-build acceptance. |
| Provider retention and privacy requests     | Anthony / legal reviewer               | 12                    | Verify actual subscription/retention and request/deletion process; disclose US processing and local native crash cache.                                   |
| Native build, redaction and recovery        | Release implementation owner           | 13                    | Compile the reviewed plugin, crash/restart a signed iOS build, inspect native and JS exports, verify exclusions and usable recovery.                      |
| Symbolication and release identity          | Release implementation owner / Anthony | 13                    | Supply private upload credential and verify matching JS source maps/native dSYMs for the actual signed build, including cached crashes after upgrade.     |
| Release/provider outage and operations      | Release implementation owner           | 13                    | Verify signed-build outage/offline behavior, version changes, monitoring/alerts and operational quotas.                                                   |

## Final verification

October 18, 2026: focused configuration/sanitizer/transport/startup/error-boundary
tests and real-SDK browser error/rejection journeys passed. An isolated in-app
walkthrough verified error → generic recovery screen → Retry → usable Welcome;
its run-owned synthetic accounts were removed. Synthetic envelopes reached Sentry
issue `JUSTGO-MOBILE-1`; stored JSON showed IP null and no request, breadcrumbs or
extra context. No simulator, native compilation, signed-device result or hosted CI
result is claimed.

| Verification                                                                     | Actual result                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                  | Passed: online Expo Doctor 21/21, root contracts/types, lint/format, 250 architecture/tooling checks, 110 API tests, 1,058 mobile tests and 34 contracts tests. Existing lint warnings remain. |
| `npm run test:db`                                                                | Passed: 80 integration tests and the migration/restoration rehearsal against guarded loopback `justgo_test`.                                                                                   |
| `npm run test:coverage`                                                          | Passed all workspace and critical-behavior floors; mobile branches 92.56%, lines 97.10%. Exclusions/thresholds were not weakened.                                                              |
| `JUSTGO_JOURNEY_API_PORT=4311 JUSTGO_JOURNEY_APP_PORT=8091 npm run test:journey` | All 42 saved journeys passed, including real SDK errors/rejections, provider 503 recovery, account isolation, saving, export and deletion. Hosted Sentry ingestion was intercepted.            |
| `npm run export:web -w @justgo/mobile` and `npm run test:exported-web`           | Passed ordinary production export and smoke; diagnostics controls absent, no API traffic or browser/asset failures.                                                                            |
| `npm run export:ios -w @justgo/mobile`                                           | Passed iOS JavaScript/assets export; this is not a native compilation or device test.                                                                                                          |
| Updated exported-web assertion                                                   | Focused journey TypeScript, lint and formatting passed after adding the diagnostics-control exclusion.                                                                                         |

Reviewed complete file lists in touched directories. Diagnostics and native plugin
tests remain beside their owners; no further folder moves were needed. Local
Markdown destinations/anchors and changed-file formatting passed.
