# Repository folder structure

This guide describes the implemented tree. [The implementation plan](../implementation-plan/README.md)
owns future moves; [handoffs](../handoffs/README.md) own verification and open gates.
Tests stay beside their mobile/contracts owner; API integration tests live in capability groups under tests. Native/web adapter families stay together.

## Repository owners

| Path                   | Responsibility                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| apps/mobile/           | Expo app, product UI, local account data and native adapters.                                 |
| apps/api/              | Authenticated API, restricted database access, migrations and safe local fixture entrypoints. |
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

| Implemented path                                                 | Owner                                                                        |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| apps/mobile/src/app/                                             | Route files and layouts; composition only.                                   |
| apps/mobile/src/app/access.tsx                                   | Identity restoration and access gate at `/access`.                           |
| apps/mobile/src/app/(tabs)/                                      | Home at `/` and Progress, with the shared tab layout.                        |
| apps/mobile/src/app/(challenge)/                                 | Challenge, Success and reflection routes; no extra navigator/layout.         |
| apps/mobile/src/app/account/                                     | Static recover, keys, devices, transfer and troubleshooting route adapters.  |
| apps/mobile/src/app-support/access/                              | Startup/access gate.                                                         |
| apps/mobile/src/app-support/identity/                            | Identity controller, transport, vault and storage.                           |
| apps/mobile/src/app-support/identity/account/                    | Account/recovery hub, tools, device transfer and key management.             |
| apps/mobile/src/app-support/identity/deletion/                   | Durable account-deletion workflow, cleanup and confirmation UI.              |
| apps/mobile/src/app-support/identity/welcome/                    | Post-deletion/access-waiting welcome and transition preparation.             |
| apps/mobile/src/app-support/providers/                           | App, account and activity-runtime composition/lifecycle.                     |
| apps/mobile/src/app-support/fallbacks/                           | Root crash and unknown-link recovery UI.                                     |
| apps/mobile/src/app-support/saving/                              | App-wide saving/recovery feedback.                                           |
| apps/mobile/src/features/settings/                               | Settings screen and preference rows.                                         |
| apps/mobile/src/features/settings/export/                        | Export collection/coordinator and Settings action.                           |
| apps/mobile/src/features/settings/information/                   | Support/About/legal/social destinations and failure feedback.                |
| apps/mobile/src/features/challenges/                             | Challenge orchestration and controller.                                      |
| apps/mobile/src/features/challenges/deck/                        | Venue tabs, artwork, deck cards and deck model.                              |
| apps/mobile/src/features/challenges/active/                      | Active countdown, modal, native handoff and lifecycle.                       |
| apps/mobile/src/features/challenges/success/                     | Success screen and presentation.                                             |
| apps/mobile/src/features/reflections/                            | Post-challenge feeling/text submission and keyboard composition.             |
| apps/mobile/src/features/progress/                               | Summary/calendar/day-detail screen and query composition.                    |
| apps/mobile/src/features/progress/calendar/                      | Calendar presentation and loading state.                                     |
| apps/mobile/src/features/progress/day-details/entries/           | Progressive list, row/details and native/shared entry motion.                |
| apps/mobile/src/features/progress/day-details/reflection-editor/ | Inline text editor and session orchestration.                                |
| apps/mobile/src/data/activity/                                   | Shared account-scoped activity repository and domain submissions.            |
| apps/mobile/src/data/activity/persistence/                       | Persisted journal envelopes and serialized writes.                           |
| apps/mobile/src/data/activity/sync/                              | Ordered delivery, acknowledgements, transport and retry decisions.           |
| apps/mobile/src/data/activity/progress/                          | Independent reads, local/backend reconciliation and bounded read cache.      |
| apps/mobile/src/components/                                      | Reusable UI, including Settings primitives and scalable text.                |
| apps/mobile/src/lib/                                             | General reusable helpers.                                                    |
| apps/mobile/src/lib/network/                                     | Validated HTTP, account client, public URL and deadline helpers.             |
| apps/mobile/src/platform/                                        | Reusable native/web capability groups.                                       |
| apps/mobile/src/platform/connectivity/                           | Native/web connection observers and tests.                                   |
| apps/mobile/src/platform/modals/                                 | Native/web modal isolation adapters and tests.                               |
| apps/mobile/src/platform/export/                                 | Native share/browser download and temporary-file cleanup.                    |
| apps/mobile/src/platform/haptics/                                | Preference/lifecycle ownership and Pulsar adapters.                          |
| apps/mobile/src/platform/haptics/completion/                     | Batter default, session-only development override and playback cancellation. |
| apps/mobile/src/platform/motion/                                 | Installation/system motion preferences.                                      |
| apps/mobile/src/platform/subscriptions/                          | Native subscription-management presentation boundary.                        |
| apps/mobile/src/platform/toast/                                  | Native/browser notification adapters.                                        |
| apps/mobile/src/theme/                                           | Typed design tokens.                                                         |
| apps/mobile/src/dev/                                             | Guarded presentation fixtures and haptics comparison UI.                     |
| apps/mobile/src/dev/previews/challenges/                         | Developer-only deck and completed/give-up previews.                          |

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
modules/justgo-subscriptions/. Generated ios/android projects are ignored; native
capability changes need a separately authorized compatible build.

## API and contracts

| Implemented path                 | Responsibility                                                              |
| -------------------------------- | --------------------------------------------------------------------------- |
| apps/api/src/identity/           | Session, credential, recovery/transfer and deletion-lock boundaries.        |
| apps/api/src/access/             | Server-authorized access and staging-only beta admission.                   |
| apps/api/src/challenges/         | Stable catalog reads.                                                       |
| apps/api/src/attempts/           | Canonical completion creation and reflection PATCH/replay.                  |
| apps/api/src/progress/           | Independent summary/month/day resources.                                    |
| apps/api/src/privacy/            | Owner-isolated export and permanent account deletion.                       |
| apps/api/src/db/                 | Restricted pools, transaction ownership and current single schema.          |
| apps/api/tests/                  | Application/error wiring and capability/database/harness integration cases. |
| apps/api/scripts/                | Migration/provisioning and separate loopback fixture entrypoints.           |
| apps/api/drizzle/                | Ordered registered SQL migrations and immutable generated metadata.         |
| packages/contracts/src/activity/ | Catalog, completion/reflection and Progress resource contracts.             |

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
  import-aware rewrites and cold web/iOS bundles. Restart an owned Metro with
  --clear and reload the existing app after moves; exports do not refresh a live
  dependency graph.
- Review complete file lists in touched directories before handoff. Preserve
  unrelated retained code and all existing coverage/boundary safeguards.
