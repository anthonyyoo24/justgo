# Repository folder structure

This guide describes the implemented tree. [The implementation plan](../implementation-plan/README.md)
owns future moves; [handoffs](../handoffs/README.md) own verification and open gates.
Tests stay beside their mobile/contracts owner; API integration tests live in capability groups under tests. Native/web adapter families stay together.

## Repository owners

| Path                   | Responsibility                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| apps/mobile/           | Expo app, product UI, local account data and native adapters.                                 |
| apps/api/              | Authenticated API, restricted database access, migrations and safe local fixture entrypoints. |
| sites/legal/           | Standalone static legal reader/build and public-text approval checks; output is ignored.      |
| packages/contracts/    | Public strict Zod contracts shared by API/mobile, with colocated validation tests.            |
| e2e/                   | Saved Playwright app/API/database journeys and shared fixtures.                               |
| scripts/quality/       | Architecture, coverage, deployment-allowlist and command safeguards.                          |
| scripts/journeys/      | Isolated journey lifecycle, environment and production-repository bundling.                   |
| scripts/design/        | Asset extraction and palette adaptation.                                                      |
| design/source/         | Preserved original design measurements, source exports and reference illustrations.           |
| design/paper-variants/ | Design variants and reconstruction source.                                                    |
| docs/                  | Concern-owned product/architecture/operations guidance, phase plans, handoffs and archives.   |
| .local/                | Ignored disposable databases, temporary fixtures, visual evidence, logs and downloads.        |

## Mobile boundaries

| Implemented path                                                 | Owner                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| apps/mobile/src/app/                                             | Route files and layouts; composition only.                                                  |
| apps/mobile/src/app/access.tsx                                   | Identity restoration and access gate at `/access`.                                          |
| apps/mobile/src/app/(tabs)/                                      | Home at `/` and Progress, with the shared tab layout.                                       |
| apps/mobile/src/app/(challenge)/                                 | Challenge, Success and reflection routes; no extra navigator/layout.                        |
| apps/mobile/src/app/account/                                     | Provider sign-in adapter and legacy account-route redirects.                                |
| apps/mobile/src/app-support/access/                              | Startup/access gate.                                                                        |
| apps/mobile/src/app-support/access/verification/                 | Owner/API-scoped beta approval, strict admission policy, persistence and query timers.      |
| apps/mobile/src/app-support/loading/                             | Shared quiet loading presentation for fonts, saved data and challenge admission.            |
| apps/mobile/src/app-support/identity/                            | Identity controller, transport, vault and storage.                                          |
| apps/mobile/src/app-support/identity/auth/                       | Managed sessions, verified provider links and durable guest-adoption lifecycle.             |
| apps/mobile/src/app-support/identity/account/                    | Managed Account, provider sign-in and disclosure screens.                                   |
| apps/mobile/src/app-support/identity/deletion/                   | Durable account-deletion workflow, cleanup and shared-modal consequence wrapper.            |
| apps/mobile/src/app-support/identity/welcome/                    | First-use/post-deletion Welcome and entry-to-deck coordination.                             |
| apps/mobile/src/app-support/acceptance/                          | Terms/Privacy links, local guest Continue and first-deck preparation cover.                 |
| apps/mobile/src/app-support/providers/                           | App, account and activity-runtime composition/lifecycle.                                    |
| apps/mobile/src/app-support/fallbacks/                           | Root crash and unknown-link recovery UI.                                                    |
| apps/mobile/src/app-support/diagnostics/                         | Optional Sentry startup, field allowlist and isolated error delivery.                       |
| apps/mobile/src/app-support/saving/                              | App-wide saving/recovery feedback.                                                          |
| apps/mobile/src/features/settings/                               | Settings screen and preference rows.                                                        |
| apps/mobile/src/features/settings/data/                          | iCloud status/enablement, owner-bound import and shared-modal Delete all data flow.         |
| apps/mobile/src/data/backup/                                     | Bounded full-data and legacy backup formats; no UI.                                         |
| apps/mobile/src/features/settings/export/                        | Export collection/coordinator and Settings action.                                          |
| apps/mobile/src/features/settings/information/                   | Support/About/legal/social destinations and failure feedback.                               |
| apps/mobile/src/features/challenges/                             | Challenge orchestration and controller.                                                     |
| apps/mobile/src/features/challenges/deck/                        | Venue tabs, artwork, deck cards and deck model.                                             |
| apps/mobile/src/features/challenges/active/                      | Active countdown, modal, native handoff and lifecycle.                                      |
| apps/mobile/src/features/challenges/success/                     | Success screen and presentation.                                                            |
| apps/mobile/src/features/reflections/                            | Post-challenge feeling/text submission and keyboard composition.                            |
| apps/mobile/src/features/progress/                               | Summary/calendar/day-detail screen and query composition.                                   |
| apps/mobile/src/features/progress/calendar/                      | Calendar presentation and loading state.                                                    |
| apps/mobile/src/features/progress/day-details/entries/           | Progressive list, row/details and native/shared entry motion.                               |
| apps/mobile/src/features/progress/day-details/reflection-editor/ | Inline text editor and session orchestration.                                               |
| apps/mobile/src/data/journal/                                    | Durable private entries, atomic edits/imports and native SQLite/browser IndexedDB adapters. |
| apps/mobile/src/data/cloud/                                      | Account/iCloud synchronization, durable guest handover and prior-copy cleanup.              |
| apps/mobile/src/data/activity/                                   | Shared account-scoped activity repository and domain submissions.                           |
| apps/mobile/src/data/activity/persistence/                       | Completion synchronization envelopes and serialized writes.                                 |
| apps/mobile/src/data/activity/sync/                              | Ordered delivery, acknowledgements, transport and retry decisions.                          |
| apps/mobile/src/data/activity/progress/                          | Independent reads, local/backend reconciliation and bounded read cache.                     |
| apps/mobile/src/components/                                      | Reusable UI, including Settings primitives and scalable text.                               |
| apps/mobile/src/components/auth/                                 | Shared Apple/Google logo presentation.                                                      |
| apps/mobile/src/components/modals/                               | Shared destructive confirmation presentation and accessible interaction isolation.          |
| apps/mobile/src/components/settings/                             | Page/group/action/switch primitives and matching data-action icons.                         |
| apps/mobile/src/lib/                                             | General reusable helpers.                                                                   |
| apps/mobile/src/lib/network/                                     | Validated HTTP, account client, public URL and deadline helpers.                            |
| apps/mobile/src/platform/                                        | Reusable native/web capability groups.                                                      |
| apps/mobile/src/platform/connectivity/                           | Native/web connection observers and tests.                                                  |
| apps/mobile/src/platform/modals/                                 | Native/web modal isolation adapters and tests.                                              |
| apps/mobile/src/platform/backup/                                 | Native Files/browser file picking and import-copy cleanup.                                  |
| apps/mobile/src/platform/export/                                 | Native share/browser download and temporary-file cleanup.                                   |
| apps/mobile/src/platform/haptics/                                | Preference/lifecycle ownership and Pulsar adapters.                                         |
| apps/mobile/src/platform/haptics/completion/                     | Batter default, session-only development override and playback cancellation.                |
| apps/mobile/src/platform/motion/                                 | Installation/system motion preferences.                                                     |
| apps/mobile/src/platform/subscriptions/                          | Native subscription-management presentation boundary.                                       |
| apps/mobile/src/platform/toast/                                  | Native/browser notification adapters.                                                       |
| apps/mobile/src/theme/                                           | Typed design tokens.                                                                        |
| apps/mobile/src/dev/                                             | Guarded presentation, haptics and synthetic diagnostics fixtures.                           |
| apps/mobile/src/dev/previews/challenges/                         | Developer-only deck and completed/give-up previews.                                         |

Wire-only `api.ts` modules live with the challenge catalog, Settings export,
app-support access and shared data/activity/progress reads. Their composing
controllers, providers and queries retain hydration, clocks, cursor validation,
account fencing and cache acceptance. `calendar-dates.ts` owns calendar/date
calculations separately from the `calendar/` presentation group.

Features may use shared data and app-support providers; data may use shared
lib/platform/contracts but imports no feature, app-support, route or visual code.
Shared components/lib/theme/platform import no app-specific owner. Production
source may load developer fixtures only through the guarded preview route.
AGENTS.md and import-boundary tests enforce these directions.

Mobile icons live in assets/. Venue artwork, cream variants and shared
texture/flourish live together in the flat assets/challenges/ directory; welcome
artwork lives in assets/illustrations/. Local Expo modules live in modules/justgo-keychain/ and
modules/justgo-subscriptions/, with private CloudKit in modules/justgo-icloud/. Generated ios/android projects are ignored; native
capability changes need a separately authorized compatible build.

## API and contracts

| Implemented path                         | Responsibility                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| apps/api/src/db/managed-session-check.ts | Private Auth helper source/ownership/effective-privilege readiness.           |
| apps/api/scripts/managed-auth/           | Versioned postgres-operator session capability; separate from app migrations. |
| apps/api/src/identity/                   | Managed Auth, owner linking/deletion and internal legacy migration.           |
| apps/api/src/access/                     | Server-authorized access and staging-only beta admission.                     |
| apps/api/src/challenges/                 | Stable catalog reads.                                                         |
| apps/api/src/attempts/                   | Canonical completion creation and retired private PATCH rejection.            |
| apps/api/src/progress/                   | Independent summary/month/day resources.                                      |
| apps/api/src/account-export/             | Owner-isolated compatibility completion export.                               |
| apps/api/src/http/                       | Shared errors, bearer/validation, response handling and safe diagnostics.     |
| apps/api/src/db/                         | Restricted pools, transaction ownership and current single schema.            |
| apps/api/tests/                          | Mirrored domain/db/http/script tests and fixtures.                            |
| apps/api/scripts/                        | Migration/provisioning and separate loopback fixture entrypoints.             |
| apps/api/drizzle/                        | Ordered registered SQL migrations and immutable generated metadata.           |
| packages/contracts/src/                  | Public error/operational schemas; API-only OpenAPI document entry.            |
| packages/contracts/src/activity/         | Catalog, completion/reflection and Progress resource contracts.               |

Runtime and migration credentials remain separate. Mobile and API import the
public contracts package and do not import each other's implementations. The
[stack](TECH_STACK.md), [activity design](ACTIVITY_DATA.md) and [identity boundary](IDENTITY.md)
own the actual protocol and storage rules.

## Documentation and evidence

[docs/README.md](../README.md) maps each concern. Named files under
implementation-plan/ own phase scope/status; DECISIONS.md owns why. Architecture
and operations explain the current system. Handoffs record lasting outcomes and
owned gates, and completed handoffs move to archive/ only after their own gates
close. Deferred native testing and handoffs with open release gates remain active.
Unbuilt billing/Stripe/coaching designs live in proposals/.

Source design material lives under the repository-level design/ tree. Third-party
screen references and routine screenshots/recordings are preserved in ignored
.local/ storage; output/ is ignored entirely. They are not deployment inputs or
CI prerequisites. Committed visual evidence requires explicit owner direction.

The mobile workspace's generated `.expo/types/router.d.ts` and `expo-env.d.ts`
remain ignored. Its typecheck regenerates and validates route declarations before
compiling app source and the route type cases in `test-support/route-types.ts`.
`scripts/quality/routes.test.mjs` checks the installed Router's URL inventory and
the root stack's registrations against the on-disk route tree.
`scripts/quality/folder-structure.test.mjs` verifies these documented owners
exist and keeps the approved mobile responsibility groups in the guide.

## Placement and move rules

- Choose a product or supporting responsibility before creating files. Extract
  cohesive groups when navigation/responsibilities warrant it; avoid empty future
  folders or automatic components/hooks/services layers.
- Keep routes thin, domain logic with its owner, tests beside their owner and
  native/web pairs together. Developer fixtures remain in dev/.
- Moves must update imports, dynamic loaders, Jest/coverage selectors, fixture
  seams, assets, deployment allowlists, scripts and documentation together.
- Keep move-only work separately reviewable from behavior changes. Use
  import-aware rewrites and the [move checks](../operations/TESTING.md#file-moves-and-bundle-checks):
  focused import/discovery/packaging checks for small moves, cold web/iOS bundles
  for large or platform-sensitive moves. Restart an owned Metro with `--clear`
  and reload the existing app after moves; exports do not refresh a live
  dependency graph.
- Review complete file lists in touched directories before handoff. Preserve
  unrelated retained code and all existing coverage/boundary safeguards. Keep
  necessary organization within the task's responsibility; record unrelated
  cleanup separately instead of expanding a routine fix.

Phase 13 adds `app-support/identity/auth/` for managed lifecycle, `data/cloud/` for
JustGO/CloudKit synchronization, `features/settings/data/` for concise data controls,
`platform/auth/` and `platform/icloud/` for external adapters, and
`modules/justgo-icloud/` for the Swift CloudKit Expo module. Native/web pairs and
tests stay beside their owners. The portable backup format moved from Settings to
`data/backup/` because runtime import/sync also consumes it; Settings retains only
the action UI. Legacy identity internals remain for authenticated migration and
protocol compatibility, without restoring their removed product screens.

The account/data revision shares provider logos in `components/auth/` and extracts
the existing deletion presentation into `components/modals/`; account and data
owners retain their distinct destructive operations and consequences. Runtime
handover composes identity stages with activity repository fences, while
`data/cloud/icloud-handover.ts` owns resumable private-copy transfer. These groups
keep presentation, identity decisions and external data work separate.
