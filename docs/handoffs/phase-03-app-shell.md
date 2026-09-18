# Phase 03 — App shell and shared API

## Snapshot

- **Status:** Implementation complete with passing browser and native smoke; full accessibility/device acceptance remains open. Phase 02 physical-device gates remain deferred under the approved sequencing exception.
- **Updated / author:** September 18, 2026 / Codex.
- **Branch:** `phase-03-app-shell`, based on merged main `96bfe2c`.
- **Scope decision:** Anthony explicitly deferred welcome screens and questionnaire onboarding. Build the approved core screens first. This removes onboarding as a phase 03 prerequisite; it does not approve questions, permanently delete onboarding from the product, or move billing out of phase 08.
- **Dependencies:** [Phase 02 handoff](phase-02-identity.md), [plan](../IMPLEMENTATION_PLAN.md), [app-shell implementation guide](../APP_SHELL.md).

## What changed

- Shared typed HTTP transport with strict Zod responses, redacted errors, ten-second budgets and cancellation; identity uses the same transport without automatic write retries.
- Account-scoped TanStack Query and domain requests: one bounded read/authentication replay, coordinated same-account expired-session recovery, stable action snapshots, synchronous cache clearing and late-response rejection after account changes.
- One app-level identity controller/vault and foreground handling. No persistent query cache, offline data store, new fake user or Zustand dependency.
- Home/Progress tab shells, Settings/recovery access, guarded Success/Reflection route shells and distinct loading/unavailable/unpaid/verified entry states. Feature content and mutations remain phases 04/06/07.
- A separate `__DEV__` screen preview has no domain queries/writes and cannot unlock paid routes. No environment-variable billing bypass exists. Settings states that analytics is off.
- Authenticated `/v1/access` executes its entitlement reader in `IdentityService.withSession`'s verified owner transaction. The default reports unavailable until phase 08; isolated tests inject fixture readers. No billing tables or provider calls were added.
- `/openapi.json` publishes OpenAPI 3.1 generated from the shared Zod identity/access contracts. Vercel's source allowlist includes the new files.
- Consent-aware telemetry interface with no exporter or private payload API; no analytics is transmitted. Route transitions are disabled, respecting reduced motion.
- Updated PRD, implementation plan, decisions, architecture/design guides and README to reflect deferred onboarding and the implemented shell.
- Completed the staging transfer upgrade from phase 02. See that handoff's dated follow-up for migration/deployment and retired smoke fixtures.

## Problems encountered and fixes

- Browser tab icons passed a native accessibility prop through to SVG DOM, causing a React warning. Replaced it with `aria-hidden`; the warning disappeared.
- React Native Web did not expose selected tab state from `accessibilityState` alone. Added explicit `aria-selected`; the browser accessibility tree now marks the active tab selected.
- Native preview banner initially overlapped the iPhone status area. Added its top safe area, avoided duplicate content insets, and accounted for the bottom home indicator in navigation and the recovery return link. Corrected native layouts were visually inspected.
- Cancelled-query test fixtures retained TanStack GC timers. Test-only query clients use infinite GC and are explicitly cleared; the full Jest run now exits normally. Runtime caching remains bounded and in memory.
- The retained simulator was displaying an older JS session. Used Simulator's Shake menu, Expo's Go home, and selected the existing localhost:8081 development server. No native rebuild or global Xcode setting changes were needed.
- Recovery tools were buried below a long account page. The app-managed recovery surface now has direct Account / Recovery keys / Device transfer / Manage devices controls, automatic keyboard insets, Return-key submission, a device refresh action and key hiding when leaving the screen. It still uses the real existing controller and confirmation flows. The standalone regression surface remains available to component tests.

## Verification

- `npm run check`: strict type checking, ESLint, formatting and unit/component tests pass. 63 unit/component tests pass (API 8, mobile 50, contracts 5), plus 21 database integration tests: **84 total**.
- `npm run test:db`: 21 PostgreSQL integration tests pass, using actual restricted runtime roles. New coverage checks active-session enforcement, owner-transaction isolation across accounts, unavailable billing and expired access. No integration suite runs against staging.
- Web and iOS production bundle exports and Expo Doctor 21/21 pass; repeated after final UI changes.
- Mobile tests cover transient-read budgets, no uncertain-write replay, unchanged action input/ID, concurrent expiry, a delayed rejection from a rotated token, no recursive recovery, rate/conflict/auth errors, cancellation, late cross-account responses, body/renewal timeouts, access UI and isolated tab selection. Identity regressions continue to pass.
- In-app browser at 390×844 and 320×568: real account bootstrap, access-unavailable gate, Settings/recovery access, Home/Progress preview switching, selected tab accessibility and no horizontal overflow (320px viewport/content). Direct `/progress` without authorization redirects to recovery. No onboarding or welcome flow is introduced.
- Native retained EAS binary, iPhone 17 / iOS 26.4: loaded the new JS bundle, restored existing account `8d1d2903`, displayed the unavailable-access state, opened Home and Progress previews, navigated to Settings and recovery, and verified corrected safe areas. Native transfer inspection and approval with user-entered verification digits passed; keyboard Return submitted approval and a browser claimant recovered the same account. Native device-list refresh showed the newly connected device; confirmed revocation marked it Revoked on iOS and returned the browser client to explicit recovery, while the native device stayed connected.
- Deployed staging smoke passed health/readiness, bootstrap/retry, independent recovery, owner isolation, session renewal/retry/revocation, recovery-key revocation, transfer proof separation, wrong/correct approval, redemption replay and device revocation. `/v1/access` fails closed and OpenAPI is served. Both new staging fixture accounts were retired and verified rejected.
- Supabase security advisor: no findings. Performance: only two informational [unused cleanup indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), retained for documented maintenance paths.

Browser/component tests do not establish physical-device Keychain behavior, VoiceOver acceptance, real purchases or signing continuity. Maestro is not installed; its updated launch flow is not claimed as executed.

## Environment and rollback

- Staging: existing database `kmcpcauaxlgpevkkenwd`; Drizzle migrations 0000–0003 applied through `justgo_migrator` with verified TLS. No new roles, project or production infrastructure.
- API: [protected preview](https://justgo-gfm5y2xz7-anthony-youngshin-yoos-projects.vercel.app), `dpl_Dp4DDzSyDRV1xw1rya1ZB5c2FX25`, preview/Ready, function region `yul1`. Deployment protection remains enabled; no protection secret is in the app.
- Runtime requires the existing `IDENTITY_RATE_LIMIT_KEY`; it was preserved. No new server or mobile secret is required.
- TanStack Query 5.103.1 is exact-pinned in the workspace lockfile. No native dependency/configuration was added that requires recompiling the retained EAS binary.
- Production deployment remains unconfigured. Browser previews are temporary development surfaces; their credentials live in tab memory only.
- Roll back shell UI separately if necessary. Keep schema 0003 and deploy only a compatible identity API. Never restore the retired pre-HMAC transfer deployment against the upgraded database.

## Remaining gates / next phase

1. Finish the full iOS VoiceOver, large-text and software-keyboard acceptance matrix; finish the phase 02 two-physical-iPhone/signing matrix before valuable-data external testing or release.
2. Phase 04 requires owner-approved challenge catalog/art/helpers/durations/safety and deck counter/exhaustion decisions. Replace Home's empty shell with real challenge queries/mutations through the shared account client; add authenticated and entitlement-aware server guards.
3. Phase 06/07 consume the focused routes and Progress shell with real completed-attempt/reflection/history contracts; the current placeholders do not claim those features exist.
4. Phase 08 implements the actual billing reader/paywall/purchase/restore flow. Default access remains unavailable until then. Do not turn development preview into a paid-access bypass.
5. Welcome/questionnaire onboarding remains deferred and needs separate scope/content approval if resumed.

## PR 3 review follow-up — September 18, 2026

- Fixed shared renewal lifetime in both AccountClient and IdentityController. A stalled operation releases its waiters after ten seconds; later attempts can retry. A shorter individual request deadline does not cancel another waiter's renewal. Identity I/O is bounded and late API completions cannot publish state. Native storage remains serialized; timed-out writes force a reread of durable state before retry, preserving pending proposals. Permanently unresponsive native storage still fails closed and cannot be safely bypassed.
- Added five regression tests covering renewed attempts after timeout, late results during a newer renewal, independent waiter deadlines, busy-controller timeout cleanup, and delayed native writes. Updated the current phase 02 staging/rollback records and marked obsolete deployment evidence historical.
- The newer PR CI run exposed Expo patch mismatches after the original branch checks passed. Updated exact pins and lockfile: Expo 57.0.24, build-properties 57.0.21, constants 57.0.19, router 57.0.22, with their resolved dependencies. Expo Doctor passes 21/21; web and iOS production exports pass. This follow-up did not rebuild or revalidate a native binary with the upgraded native packages; physical/signing/accessibility gates remain open.
- `npm run check` passes: API 8, mobile 55, contracts 5 = 68 unit/component tests. `npm run test:db` also passes all 21 integration tests: **89 total**.
- In-app browser: created disposable local account `c772f4c1`, paused the local API during session renewal, observed the error and re-enabled recovery controls, then retried after the API restarted and reconnected to the same account. The access gate and Home/Progress preview navigation also passed with the upgraded router. No staging or production deployment was changed during this follow-up.
