# JustGO

An iOS-first social-confidence app with no-signup credential recovery, six venue decks, local challenge/countdown flow, optional explicit reflections and Progress history. Phase 07 saves completed activity on the phone before background uploads and limits downloaded offline history to the latest summary/current-month counts/today's pages. The [app-shell guide](docs/architecture/APP_SHELL.md) describes the implemented boundaries; the [Phase 07 handoff](docs/handoffs/phase-07-api-offline.md) records evidence and remaining gates. Native billing remains Phase 07A, Settings/privacy Phase 08, and physical-device/staging/release acceptance Phase 09. Welcome/questionnaire onboarding and 07.3A native journey migration remain deferred. `npm ci` builds shared contracts for Node; re-run `npm run build:contracts` after contract edits during API development.

See the [folder structure guide](docs/architecture/FOLDER_STRUCTURE.md) for the current directory groupings and responsibilities.

Read [repository coding and verification instructions](AGENTS.md) before changing code, plus directory-specific `AGENTS.md` files. Phase scope and handoffs live in the [implementation plan](docs/IMPLEMENTATION_PLAN.md).

## Start locally

Use Node **24.18.0** and npm **11.16.0**. From this repository root:

```sh
npm ci
npm run db:local
npm run db:migrate
npm run dev:api
# In another terminal:
npm run dev:web
```

`db:local` requires PostgreSQL 17 binaries. On macOS: `brew install postgresql@17`. Elsewhere set `JUSTGO_PG_BIN` to their directory. It creates a dedicated, loopback-only cluster at `.local/postgres` on port **54329** and the `justgo_test` database, generates local role credentials and creates missing workspace `.env` files without replacing existing ones. Stop it with `npm run db:stop`. Local host authentication is trusted on this disposable cluster; never expose its port or use it for personal data.

The browser preview is at `http://localhost:8081`. The API listens at `http://localhost:3000`: `/health` checks liveness; `/ready` checks the database connection, restricted role and foundation migration. The app connects a real account and checks `/v1/access`. Until phase 07A, this returns unavailable; **Preview app screens** opens isolated development UI. `/openapi.json` publishes the shared contracts; `/health` and `/ready` remain operational probes. Without a database, liveness still works and readiness returns 503.

To exercise the implemented challenge/reflection/Progress flow with disposable local data, run `npm run dev:challenges -w @justgo/api` **instead of** `dev:api`. This separate entrypoint grants a test entitlement only on the loopback `justgo_test` database; it refuses production/Vercel and is not part of deployed access behavior. Create a disposable account using the normal recovery screen and choose Back to app. The presentation-only screen preview still makes no challenge writes. Apply all registered migrations first. See [testing guidance](docs/operations/TESTING.md) for fixtures and the current native/device gates.

For environment-managed development, copy the workspace `.env.example` files to `.env` and configure the separate runtime and migration URLs. Never commit credentials. Identity traffic requires HTTPS, except loopback during development. A physical iPhone needs a reachable HTTPS API route; `localhost` on a phone refers to the phone. Do not embed a Vercel protection bypass secret in the app.

## Verify

```sh
npm run check          # fresh Expo Doctor, TypeScript, lint, formatting and tests
npm run test:db        # real PostgreSQL isolation/rollback/pool tests; db:local + migrate first
npm run test:coverage  # all-source reports + regression floors; uses the test DB
npm run test:journey   # saved app/API/database local saving, Progress, lost-acknowledgement and account recovery cases
npm run export:web -w @justgo/mobile
npm run export:ios -w @justgo/mobile
npm run doctor -w @justgo/mobile
```

CI installs from the single root lockfile, provisions an isolated PostgreSQL 17 service, runs the checks and exports both the browser preview and the iOS bundle. Database tests refuse remote hosts, scope fixture cleanup to synthetic accounts/tables and run product operations as `justgo_runtime`. The migration-role rehearsal creates and restores only its uniquely named disposable schema. CI also installs PostgreSQL 17 snapshot tools. The required Playwright journey step runs the full local-save/reflection/Progress and controlled recovery suite against isolated app/API/database fixtures, with masked failure artifacts. Current-revision hosted results are distinct from local passes and require authorized publication. The [Phase 07 cutover procedure](docs/operations/FOUNDATION.md#phase-07-coordinated-cutover-and-old-clients) governs migration 0013 and old-client handling; no staging/production deployment is implied by local implementation. See [testing guidance](docs/operations/TESTING.md) for local prerequisites and artifact handling.

Coverage scope, thresholds, focused commands and async/UI test conventions are in
[testing guidance](docs/operations/TESTING.md).

## iOS development

On the owner's 8 GB Mac, use the linked EAS cloud project for native compilation. Keep Simulator closed while building, retain existing caches, and run heavy checks sequentially.

```sh
cd apps/mobile
npx eas-cli@latest build --platform ios --profile development-simulator
```

The simulator profile uses the unreserved identifier `dev.justgo.foundation` and localhost API. It needs no Apple signing. The existing Expo project `53cf0560-8ab5-446a-9bc6-deb193b337b5` (`@anthonyyoos-team/justgo`) is linked in `app.config.ts`; do not create another project. Authenticate with `npx eas-cli@latest login` if required. Device/distribution profiles still require the confirmed `IOS_BUNDLE_IDENTIFIER` and Apple setup.

After the cloud build finishes, download its artifact and launch **one** installed simulator. Start the local database/API, then Metro with `NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --dev-client --localhost --max-workers 1` from `apps/mobile`. The IPv4 option keeps Metro’s localhost binding compatible with the simulator’s `127.0.0.1` bundle URL. Install the downloaded `.app` and open `justgo://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`. Reuse that development binary for JavaScript, styling and UI changes through Fast Refresh; rebuild only when native dependencies/configuration change. Do not restart a heavy local Xcode build as a fallback without first explaining an EAS access/quota/configuration blocker.

Generated native projects and completed Xcode caches are retained locally and excluded from Git/cloud uploads. EAS runs Continuous Native Generation from app config. `.easignore` excludes local secrets, native output, dependencies and design/docs; inspect the archive before changing those rules.

The local Expo module is auto-linked from `apps/mobile/modules/justgo-keychain`; native dependency or Swift changes require a new EAS build. If `xcrun simctl` resolves only Command Line Tools, use `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` for simulator commands without changing the global developer selection.

A native smoke flow lives in `apps/mobile/e2e/launch.yaml`. With Maestro installed, a running development build, Metro and healthy API, run `APP_ID=dev.justgo.foundation npm run test:native -w @justgo/mobile`. The command requires a nonempty `APP_ID` and passes it explicitly to Maestro with `-e`; use the identifier of your installed development app. This is a launch harness, not proof of physical-device recovery or purchases. The [phase handoff](docs/handoffs/phase-01-foundation.md) owns actual results.

[Phase 07.3A — hybrid/native testing](docs/IMPLEMENTATION_PLAN.md#phase-07-3a) was deferred by Anthony on October 7. Its checkpoint and [removal assessment](docs/checks/phase-07-3a-browser-testing-assessment.md) remain reference material; it is not a prerequisite for 07.4/07.5. Retain browser journeys/adapters/CI and lower-level coverage. Manual native checks use the existing installed development binary; physical-device Keychain/AsyncStorage, software keyboard, VoiceOver and release acceptance remain separate gates.

## Workspace

- `apps/mobile`: Expo Router, typed design tokens, native Keychain storage, shared network/query handling, local challenge/reflection/Progress UI, account journal/sender and guarded recovery/access composition.
- `apps/api`: Fastify, Drizzle, `pg`, reviewed SQL and operational endpoints.
- `packages/contracts`: public Zod response schemas shared by mobile and API.
- `docs`: product scope, implementation plan, extracted design references and durable phase handoffs.

Read [foundation setup and versions](docs/operations/FOUNDATION.md), [design guide](docs/design/DESIGN.md), [decision register](docs/DECISIONS.md), [Apple/RevenueCat checklist](docs/operations/APPLE_SETUP.md), and the [phase 01 handoff](docs/handoffs/phase-01-foundation.md). The [PRD](docs/product/PRD.md) owns product behavior and the [implementation plan](docs/IMPLEMENTATION_PLAN.md) owns release gates.
