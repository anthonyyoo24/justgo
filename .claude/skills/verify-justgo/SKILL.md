---
name: verify-justgo
description: Launch, health-check, drive and clean up the JustGO web app (Expo web, fixture API, local Postgres) to prove a user-facing change works, with masked screenshots and database side effects as evidence. Use after a JustGO UI, API or data change, before claiming it works, or when asked to run, check or screenshot the app. Covers Playwright drives, the built-in browser pane and the unproven native simulator path.
---

# Verify JustGO

Playwright, through the saved-journey wrapper, is the driver. The built-in browser pane is for interactive checks. cursor-team-kit's `control-ui` and `verify-this` are not installed. Do not look for them.

Run every command from the repository root. `bin/` paths below are relative to this skill directory: `.claude/skills/verify-justgo/bin/verify`. The [feature map](features/README.md) holds the per-feature recipes.

## Launch

Two modes share one local stack: Postgres 17 on `127.0.0.1:54329` (database `justgo_test`), the fixture API on `127.0.0.1:3000` (`apps/api/scripts/challenge-dev.ts`, the same server `npm run dev:challenges -w @justgo/api` runs) and Expo web on `127.0.0.1:8081`.

- **Scripted drive (evidence).** `bin/verify drive <feature>...`, for example `bin/verify drive challenge` or `bin/verify drive welcome challenge progress account data`. It starts the database (`npm run db:local`, which also creates the cluster, roles and missing `.env` files on a fresh checkout), then runs `npm run test:journey` with this skill's `verify.config.ts`. The wrapper validates the loopback database roles, refuses occupied ports, builds contracts, migrates (migrations seed the challenge catalog), starts both services, runs the drives and stops the services. Ready is built in: each drive waits for the deck's `Accept challenge` button before acting.
- **Saved journeys.** `npm run test:journey` runs every journey spec in `e2e/` except the exported-web smoke (`testIgnore` in `e2e/playwright.config.ts`) through the same wrapper, and `npm run test:journey -- e2e/<name>.spec.ts` runs one. Install the pinned browser first with `npx playwright install chromium`. Failures write `.local/journey-results` and `.local/journey-report`.
- **Exported-web smoke.** After `npm run export:web -w @justgo/mobile`, `npm run test:exported-web` serves `apps/mobile/dist/` from its own server on `127.0.0.1:8093` (`JUSTGO_EXPORTED_WEB_PORT`) and never reuses a running one. Its fence rejects every `/v1` request, so it needs no API, database or account. Reports go to `.local/exported-web-report/` and `.local/exported-web-results/`. Run it before `export:ios`, which replaces the same `dist/`.
- **Interactive (built-in browser pane).** `bin/verify serve` starts the database, migrates and starts the same two services with the journeys' commands and environment, records their process groups in `.local/verify-justgo/serving.json` and returns when both answer. Then run `bin/verify doctor`. Ready means doctor reports `"state": "serving"`. Open `http://127.0.0.1:8081/welcome` with `preview_start`, and resize the tab to 390x844, the journeys' viewport. The first page load compiles the bundle and can take a minute.

Set `JUSTGO_VERIFY_RUN_ID` to name the run. Otherwise it is a UTC timestamp plus the first feature, or `serve`.

## Doctor

`bin/verify doctor` is read-only. It prints JSON and exits 1 when the instance is not worth driving.

- `state: idle`: no fixture ports are listening and no serve record exists. Drive or serve from here. A stopped database is fine.
- `state: serving`: the ports belong to the process groups `bin/verify serve` recorded and run from this checkout. `/ready` is 200 and `/__fixtures/accounts` answers (the fixture API, not the deployable one). The bundle Metro serves has API origin `http://127.0.0.1:3000`, `EXPO_PUBLIC_PROJECT_ROOT` in this checkout, the guarded journey environment, and none of the hosted origins saved in `apps/mobile/.env*`.
- `state: broken`: read `problems`. A port owned by a process this skill did not start means someone else's server. Do not drive it and do not kill it. Report it.

It also reports the checkout's HEAD, branch and changed-file count, migration status (`current`, `pending`, or `ahead of this checkout` when another branch migrated `justgo_test`), and `justgo.users` and `justgo.attempts` counts. The counts need a running database, so start it first (`LC_ALL=en_US.UTF-8 npm run db:local`, or any earlier `drive` or `serve`). Run doctor before and after a drive. Matching counts prove fixture cleanup.

## Drive

Scripted drives live in `drives/<feature>.spec.ts`. They use the journey fixtures from `e2e/support/fixtures.ts`: the request fence that aborts any `/v1` request outside the fixture API, the attempt-payload check, Sentry interception and teardown that deletes every account the run's fixture API registered. Accounts come from `signInFixture` and `continueAsGuest` in `e2e/support/managed-account.ts`. Seed dated history only with `seedManagedHistory` (`e2e/support/managed-data.ts`), which places attempts inside the browser's local day through `e2e/support/seed-times.ts`.

To check a new behavior, add a step or a new drive file that follows `drives/challenge.spec.ts`: locate by role and accessible name, assert the visible result, call `capture(page, feature, step)` after each user-visible step, read side effects back with `fixtureDatabase` or `localJournalEntries`, and finish with `writeProof`. Use only synthetic text constants. Run the new drive with `bin/verify drive <feature>`.

In the pane, drive with `find` and `computer` clicks on the same names the feature files list. Provider sign-in uses the synthetic fixture provider: choose `Sign in with Apple` on Welcome. `/preview` shows presentation-only states: `/preview?mode=welcome`, `?mode=icloud-sync&state=<state>`, `?mode=diagnostics`, and `?progressState=empty|error|loading|syncing`. Previews make no writes.

## Evidence

Everything for a run goes to `.local/verify-justgo/<run-id>/`. `.local/` is gitignored. Do not commit evidence unless the owner asks.

- `<feature>/NN-<step>.png`: screenshots that mask textboxes and recovery-key text, the same mask as the journeys' failure screenshots.
- `<feature>/NN-<step>.aria.yml`: the accessibility tree with the route on its first line, with input values and recovery keys masked.
- `<feature>/proof.json`: side effects read back after the action, such as server attempt and journal-version counts, local journal entries, revoked-session status and ZIP contents.
- `report/index.html`: the Playwright report. `serve` runs also hold `fixture-api.log` and `expo-web.log`.

Proof standard: drive the user's path (buttons, links, tabs), never internal setters or app debug hooks. Capture each step and the resulting state, not only the last screen. Read side effects from Postgres or the browser's stores. Journey traces, videos and automatic screenshots stay off because they retain credentials. Never save a downloaded ZIP or a token.

For pane checks, save screenshots under the same run folder and read `read_network_requests` with pattern `/v1/`. Every request must go to `http://127.0.0.1:3000`. The Playwright request fence does not exist in the pane.

## Cleanup

- After a scripted drive, the wrapper has stopped the API and Expo, and the fixture teardown has deleted its accounts. Postgres stays up for the next drive. `bin/verify stop` stops it when a `bin/verify` command started it. So does a `serve` that refused to start.
- After `serve`, run `bin/verify stop`. When doctor confirms the recorded services still own their ports, it deletes the accounts the served fixture API registered (by running `drives/cleanup.spec.ts` against that API). Otherwise it skips that cleanup and exits 1. It then stops only the recorded process groups, waits for the ports to free and removes `serving.json`. When a foreign process holds `:3000`, `stop` skips the cleanup, keeps `serving.json` and exits 1.
- In the pane, clear the app origin before closing the tab. Its profile persists across sessions, so the guest identity and journal would carry into the next run. Run this with `javascript_tool`:

  ```js
  for (const { name } of await indexedDB.databases())
    indexedDB.deleteDatabase(name);
  localStorage.clear();
  sessionStorage.clear();
  ```

- `bin/verify stop` also stops the database when a `bin/verify` command started it (marker `.local/verify-justgo/database-started`). Otherwise it leaves the database running. Never stop a database or kill a process by name.
- Cleanup never touches `.local/verify-justgo/<run-id>/`. Confirm the evidence is still there before you report.

## Helpers

- `bin/verify doctor | drive <feature>... | serve | stop`: the entry point. Run it from the repository root.
- `bin/doctor.ts`: the read-only health report behind `doctor`.
- `bin/serve.ts start|stop`: starts and stops the interactive services and records their process groups.
- `drives/evidence.ts`: `capture` and `writeProof` for screenshots, accessibility trees and side-effect proofs.
- `drives/cleanup.spec.ts`: fixture-account teardown against a served API.
- `verify.config.ts`: the Playwright config that `drive` and `stop` layer over `e2e/playwright.config.ts`.

CI type-checks these files through `npm run typecheck:journey`.

## Isolate

Run one instance per machine and one drive at a time. Queue further drives into one `bin/verify drive a b c` invocation. It launches once and runs the drives in order (`workers: 1` in `e2e/playwright.config.ts`).

- Ports: the harness binds `127.0.0.1:3000` and `:8081` and refuses occupied ports before migrating. `JUSTGO_JOURNEY_API_PORT` and `JUSTGO_JOURNEY_APP_PORT` move them, but that only separates sockets.
- Database: every instance shares the one `justgo_test` database in `.local/postgres`, and every launch migrates it. A second worktree on another branch can migrate it ahead of this checkout. Doctor reports that.
- Data: lanes on one instance stay apart through fixture accounts. Each run's fixture API registers only its own accounts and rate-limit buckets, and teardown deletes only those.
- Memory: one launched instance plus headless Chromium took system free memory from 64% down to 31-36% across two runs on the owner's 8 GB Mac.
- Do not run `npm run test:journey`, `npm run test:db` or `npm run test:coverage` while an instance is serving. They use the same ports or database.
- Two instances side by side (separate worktrees, distinct ports) are untested. A larger verification host needs its own measurement before raising the cap.

## Native

Unproven. On 2026-11-05 the Mac had no simulator devices, only the iOS 26.5 runtime. No current JustGO simulator build was installed. The archived `.app` files in `.local/` date from September and October 6, before the Sentry SDK and the current native modules, so they cannot run today's JavaScript. Three things are missing:

1. A current EAS `development-simulator` build (README, "iOS development"). Build it on EAS, never locally on this Mac.
2. A guarded native Metro launch pinned to the loopback fixture API. The journey fixture seam resolves only for web. `npm run dev:mobile` targets hosted staging. `apps/mobile/.env`, `.env.local` and `.env.development.local` all hold a hosted API origin, so a plain `expo start` would likely serve that origin to the simulator (inference).
3. One booted simulator, for example `xcrun simctl create` and `boot` with `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`, kept closed during builds.

With those in place, the Claude desktop app's iOS Simulator tool (`mcp__Claude_Code_iOS_Simulator__control`) would drive it: `attach`, then `launch` with the `.app` path, then `open_url` with `justgo://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`, then `tap`, `swipe` and `text` on what `screenshot` shows. Prove one feature from the map that way before trusting this section.

## Gotchas

- PostgreSQL 17 refuses to start from a shell with no locale (`postmaster became multithreaded during startup`). `bin/verify` sets `LC_ALL` for `db:local`. Set it yourself if you run `npm run db:local` directly.
- Never verify with `npm run dev:web`, `dev:api` or `dev:mobile`. The saved mobile `.env` files point at hosted staging, and Expo's virtual env can prefer `.env.local` even when CLI variables override it. `serve` and `drive` replace that module with the guarded journey environment. Doctor checks the served bundle.
- `justgo_test` keeps rows from earlier runs (42 users on 2026-11-05). Compare doctor counts before and after instead of expecting zero.
- Expo logs `Unable to run simctl` when Command Line Tools are selected. Web runs ignore it.
- Right after navigation, `find` in the pane can miss controls that are still rendering. Read the page again before concluding a control is absent.
- `bin/verify drive` passes its config after the wrapper's own `--config`. Playwright uses the last one, so the wrapper's guards still run.
- Web evidence does not establish native behavior. The web build uses an in-memory vault, not Keychain. A reload is not a native relaunch and does not test SQLite, Keychain or AsyncStorage durability or the OS lifecycle. Browser offline events are not NetInfo. Web toasts are Sonner, not `sonner-native`. Fonts fall back to CSS families. Modal isolation exists only in `useModalIsolation.web.ts`. Journal fault injection loads only through the web journey seam. Native has no fault switch, so storage-failure cases need lower-level tests. Browser, export and component checks also cannot establish gestures, the software keyboard, VoiceOver, native Apple or Google OAuth, hosted Auth revocation or deletion, or real CloudKit sync. Keychain tests prove JavaScript schema and error wiring only.
- Journey builds run the real Sentry SDK with a fake ingestion key and intercept hosted Sentry requests. A probe against real Sentry sends only disposable synthetic errors, with ordinary delivery disabled.
- After moving source or asset files, restart the owned Metro server with `--clear` and reload the installed development app. A separate export does not refresh that server's live module graph.
- The web export logs an expected Metro resolution warning for Sentry's optional Router-store import. Do not alias or suppress it.
- React Native Web ignores `accessibilityState` selected and checked. Set `aria-selected` or `aria-checked` too, as `VenueTabs` and `ReflectionView` do, or role queries cannot see the state.
- `aria-*` props, `pointerEvents` and CSS-looking styles in React Native components do not make the code web-only. Do not strip them as browser leftovers.
- Install a failure route before the navigation that starts the targeted work. For a one-shot fault after sign-in, first send the old page to `about:blank` so its background requests cannot consume the fault. Wait on the intended request, not on a sleep or a longer timeout.
- A phone development server on LAN port 8081 blocks the drive's Expo port. Move the drive with `JUSTGO_JOURNEY_APP_PORT`.
- `e2e/local-sync.spec.ts`, `cleanup-isolation.spec.ts` and `network-isolation.spec.ts` test the repository, transport and fixture safety, not UI. A native drive does not replace them.
- The Maestro flow and `test:native` were retired on November 2. Do not restore them.
- Uncached illustrations load over HTTP from Metro in a development client. Offline artwork needs a self-contained build.
- Earlier simulator drags (XcodeBuildMCP, mirrored pointer, Computer Use) did not commit native gestures. Drive the equivalent button path and leave swipe feel to a physical phone.
- Typing through the simulator's hardware keyboard shows no software keyboard, so it cannot check keyboard-open layout.
- For native transition frames, record with `xcrun simctl io <udid> recordVideo` and read the real sample timestamps.
- Moving a simulator or phone between worktrees can leave Keychain data in a newer schema, which can surface as a generic secure-storage failure. Compare the persisted schemas. Do not reset Keychain or loosen validation.
- Transitive DOM and jsdom packages that Expo and Jest require are not removable because their names mention browsers.
