# Phase 08 — Settings & privacy controls

## Summary and status

**Status (October 17, 2026):** Complete. Implementation is merged into `main`,
and post-merge CI passes. Anthony reported completing the required physical-iPhone
checks and chose 7-day backup retention. The approved follow-ups in
[Open gates](#open-gates) remain with their later phases. Phase 08A is in
progress; its [handoff](phase-08a-structure-cleanup.md) owns current status and open gates.

This file replaces the earlier per-change Settings handoff and folds in the
account-deletion and reflection-keyboard handoffs, under the
[October 16 handoff rule](../DECISIONS.md#october-16-codebase-assessment-follow-up).
Their per-change history is in Git (for example
`git show 867e5d2:docs/handoffs/phase-08-settings-privacy.md`) and in PRs #22–25.
The [plan](../implementation-plan/phase-08-settings-privacy.md#phase-08) owns scope; this file records
outcomes, invariants and open gates.

Phase 08 delivers Settings with Preferences, Account & data, Privacy, Support and
About groups; Reduce Motion and Haptics preferences; Export my data; the Account &
recovery hub (recovery keys, phone transfer in both directions, devices,
troubleshooting); permanent account deletion with a post-deletion welcome screen;
the reflection-editor keyboard fix; the staging-only beta access window; the
identity retention function; and the October 16 pre-merge stability fixes.

## Decisions and why

- **Haptics:** Pulsar is the only haptics library (October 13). Accepted
  completion plays the Batter preset; accepting a challenge, changing a feeling
  and turning Haptics on play one heavy impact. Anthony chose these on his
  physical iPhone. Test haptics is a development-only route; production always
  uses Batter.
- **Preferences are per installation:** Reduce Motion and Haptics are saved on
  the phone, independent of account and paid access; the phone's own Reduce
  Motion setting wins. Both rows are app-drawn accessible switches, because the
  native switch experiment felt different on the phone (October 13).
- **Export:** a ZIP with CSV, JSON and a README, started directly from Settings.
  It includes labeled copies of pending or rejected local changes. Pages are read
  separately, so it is not a cross-device atomic snapshot.
- **Deletion:** immediate and permanent on the server, in one owner-locked
  transaction. The minimal deletion receipt and revoked-credential tombstones
  are kept permanently and hold no reflection content
  ([retention defaults](../DECISIONS.md#october-16-codebase-assessment-follow-up)).
  Without them an old proof could recreate the deleted account.
- **Post-deletion welcome screen** (`app/welcome.tsx`): shown after deletion and
  while a new account waits for access. It belongs to deletion, not the deferred
  onboarding (October 16).
- **Receiving transfer:** the receiving phone keeps its current account until the
  transfer is redeemed, and leaving the code screen cancels the transfer (October 14).
- **Free-beta admission:** `BETA_ACCESS_WINDOW` (staging only) admits any account
  during a configured interval; explicit `BETA_ACCESS_GRANTS` still take
  precedence (October 16). TestFlight controls who can install.
- **Monitoring** moved to the Phase 14 free beta using existing tools; Phase 08
  keeps only diagnostic redaction (October 16).
- **API client errors:** on `/v1/`, any 4xx without its own code keeps its status
  with `INVALID_REQUEST`; only failures without a client status become
  `503 UNAVAILABLE`, which clients treat as transient.
- **CI:** one job. Work lands through feature branches and pull requests, so
  pushes run CI only for merges to `main`; newer pull-request pushes cancel
  older runs, and each test suite runs once through `test:coverage`. Doctor
  stays the first step; Anthony deferred a separate Doctor job and weekly
  schedule (October 16).
- **Retention cleanup** is a reviewed SQL function, so either scheduler can call
  it. Anthony deferred the hosted schedule (October 16); until then nothing runs
  it. Recommendation when scheduled: Supabase `pg_cron` running as `justgo_migrator`.
  It keeps the migration credential out of GitHub and needs no new role, but the
  migrator needs `USAGE` on the `cron` schema. The alternative is a scheduled
  GitHub workflow in a protected environment holding `MIGRATION_DATABASE_URL`.

## Behavior that changed

- New routes: `/settings`, `/delete-account`, `/welcome`, `/account/[tool]` and
  `+not-found`; `/export-data` redirects to Settings. The root layout exports
  an `ErrorBoundary`.
- New API: `DELETE /v1/account` and `GET /v1/account/export` (both without paid
  access); the staging beta access window.
- Migrations `0014_account_deletion` (receipt digest, owner-scoped DELETE grants),
  `0015_identity_retention` (`justgo.purge_expired_identity_records`) and
  `0016_transfer_delete_owner` (owner-only transfer deletion).
- Account-entry copy now says **Create a new account**. Primary buttons replace
  their label with one centered spinner while busy. Automatic account checks
  are quiet.
- The reflection editor scrolls its heading into view on focus and keeps
  Skip/Save in a footer above the keyboard. Anthony confirmed this on his iPhone
  on October 14.
- Two analytics rows remain visibly unavailable; Phase 10 removes them.

## Invariants to preserve

- Settings, recovery, export and deletion stay usable without paid access; the
  root layout's `Stack.Protected` groups keep them outside the access guard and
  remove the deleted account's screens from Back history.
- Never purge deletion receipts or revoked credentials, and never restore an old
  snapshot over the live database. Restores follow the
  [backup restore checklist](../operations/FOUNDATION.md#backup-restore-checklist).
  The retention function must stay invoker-rights, `PUBLIC`-revoked and limited
  to stale rate buckets and long-expired unredeemed transfers.
- Deletion: the phone saves its intent before the request and the confirmed
  receipt before cleanup. Cleanup removes only that account's keys and Keychain
  items; a persisted deleted marker prevents automatic replacement accounts.
  Binaries without item-scoped Keychain removal refuse before the request.
- Export never contains recovery keys, session tokens or request diagnostics.
- Logs use the allowlisted serializers in `apps/api/src/http/diagnostics.ts`. The
  deletion log test fails if tokens, credentials, owner IDs, bodies, URLs or raw
  error messages appear.
- The crash screen renders outside every provider and never shows the error's
  text.
- Haptics: Off is silent, including the Reduce Motion row's own feedback. Never
  vibrate on mount, synchronization, failed or repeated completion, or in the
  background.
- Persisted Keychain state keeps known newer fields (for example
  `cancelledTransfers`, `ignoredCredentialIds`); a strict-schema rejection looks
  like "Secure storage is unavailable". See AGENTS.md.

## Problems that could recur

- **Expo patch recommendations** arrive without a code change and fail Doctor.
  Align the exact pins and lockfile together (`expo` 57.0.30 and `expo-router`
  57.0.28 on October 16); native build/device acceptance stays separate.
- **Date-dependent journeys.** Seeds counted back one minute per attempt crossed
  local midnight (main run 38660201918 at 00:33 UTC). Seeds now stay inside the
  intended local day. Still open: on the 1st of a month in the browser's time
  zone (UTC in CI), the two cases that seed "yesterday"
  (`progress-flow.spec.ts` "today cached paging…" and "older-day Add/Edit…") look
  for it in the current month's calendar and will fail.
- **Browser previews can reach the hosted API.** `EXPO_NO_DOTENV` alone still
  serves `.env.local`'s hosted URL. Start interactive previews with
  `JUSTGO_JOURNEY_FIXTURES=1` and the API database variables (as
  `npm run test:journey` does), then check the served bundle for the loopback
  API before any account action. On October 16 one unpinned preview sent two
  body-less CORS preflights to the test API; both were refused and no account
  was created.
- **`CI=1` disables Metro file watching;** restart the preview before trusting a
  served bundle after an edit. Restart phone Metro with `--clear` after moves.
- **Local PostgreSQL** refuses to start from a shell without a locale
  ("postmaster became multithreaded"); set `LC_ALL=en_US.UTF-8` for
  `npm run db:local`.
- **Shared fixture budgets:** each journey case resets only its run-owned rate
  buckets; never raise production limits to make journeys pass.

## Setup or environment changes

- The hosted test API (`justgo-two.vercel.app`) already serves `DELETE
/v1/account` (checked October 16). It does not yet have the 4xx change or
  migration 0016's owner-only transfer DELETE restriction.
- Apply through forward migration `0016_transfer_delete_owner` on the next
  authorized hosted update. It makes transfer DELETE owner-only even with a
  matching code digest; keep already-applied migration 0014 unchanged. The
  migration runner also applies 0015, but retention scheduling stays deferred.
- New API variable `BETA_ACCESS_WINDOW` (JSON `{startsAt, expiresAt}` or `null`);
  configuration rejects it outside `APP_ENVIRONMENT=staging`.
- Native builds need item-scoped Keychain removal for deletion and the
  `JustGoSubscriptions` module for native subscription management. The original
  October 12 signed build predates these capabilities. Anthony's reported
  Phase 08 physical acceptance is recorded in
  [DECISIONS.md](../DECISIONS.md#october-16-codebase-assessment-follow-up);
  Phase 14 must verify the capabilities in the actual beta/release build.
- Journeys accept `JUSTGO_JOURNEY_API_PORT` and `JUSTGO_JOURNEY_APP_PORT` (defaults
  3000/8081). The root `check:static` script is what CI runs before coverage.

## Open gates

| Gate                                                                                              | Owner                         | Phase  | Done when                                                                            |
| ------------------------------------------------------------------------------------------------- | ----------------------------- | ------ | ------------------------------------------------------------------------------------ |
| Redeploy the API with the 4xx mapping and apply migration 0016's transfer DELETE restriction      | Anthony authorizes            | 14     | Forward migrations through 0016 applied; deployment probed                           |
| Retention scheduler: `pg_cron` (recommended) or protected workflow, with migration 0015           | Anthony, deferred             | 14     | Schedule runs on the hosted database; first run's counts recorded                    |
| Confirm the production project is on Pro (7-day backups recorded)                                 | Anthony reads dashboard       | 13, 14 | Dashboard matches FOUNDATION.md before Phase 13 publishes wording                    |
| Month-boundary journey dependence (see above)                                                     | Implementation owner          | 08A    | Both cases pass when the browser date is the 1st                                     |
| Crash and not-found screens on native (first and repeated)                                        | Implementation owner          | 14     | Simulator or device check                                                            |
| Hosted restore rehearsal of the checklist                                                         | Implementation owner, Anthony | 14     | Paid-launch checkpoint                                                               |
| VoiceOver, large text, Save to Files, App Store/social destinations, vendor cleanup on activation | As in the plan                | 09–14  | See [Phase 14](../implementation-plan/phase-14-release.md#phase-14) and Phase 11/07A |

## Final verification

October 17, 2026: [post-merge Foundation checks](https://github.com/anthonyyoo24/justgo/actions/runs/39042916677)
passed on `main` at `652275887d14c23399c52d4cf429668ba51bea8f`.

- Fresh `npm run doctor -w @justgo/mobile` and `npm run check:static`: pass.
- `npm run db:migrate` and `npm run test:coverage`: pass, including workspace
  tests, database tests and the migration/restoration rehearsal through 0016,
  with every existing coverage floor unchanged.
- `npm run test:journey`: pass for the full saved app/API/database suite.
- `npm run export:web -w @justgo/mobile` and
  `npm run export:ios -w @justgo/mobile`: pass (JavaScript bundles, not a native
  build).

The recorded pre-publication local `npm run check` and `npm run test:db` passes
remain separate from this hosted run. Prior in-app browser verification covered
the not-found and crash screens, their recovery actions and keyboard focus against
the loopback fixture API. Physical-iPhone acceptance is owner-reported in
[DECISIONS.md](../DECISIONS.md#october-16-codebase-assessment-follow-up); this
closeout adds no new browser or native evidence. Later-phase gates remain open.
