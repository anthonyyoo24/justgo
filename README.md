# JustGO

An iOS-first social-confidence app. Phase 01 provides the Expo development app, Fastify API, shared contracts, database foundation and test infrastructure. Phase 02 adds real account bootstrap, independent sessions, recovery keys, approved device transfers and a Swift Keychain module. [Identity setup](docs/IDENTITY.md) and the [phase 02 handoff](docs/handoffs/phase-02-identity.md) record implementation, verification and deferred physical-device acceptance. `npm ci` builds the shared contracts for Node; re-run `npm run build:contracts` after editing contracts during API development.

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

The browser preview is at `http://localhost:8081`. The API listens at `http://localhost:3000`: `/health` checks liveness; `/ready` checks the database connection, restricted role and foundation migration. The identity preview uses authenticated account endpoints; `/health` and `/ready` remain operational probes. Without a database, liveness still works and readiness returns 503.

For environment-managed development, copy the workspace `.env.example` files to `.env` and configure the separate runtime and migration URLs. Never commit credentials. Identity traffic requires HTTPS, except loopback during development. A physical iPhone needs a reachable HTTPS API route; `localhost` on a phone refers to the phone. Do not embed a Vercel protection bypass secret in the app.

## Verify

```sh
npm run check          # strict TypeScript, lint, formatting and unit/component tests
npm run test:db        # real PostgreSQL isolation/rollback/pool tests; db:local + migrate first
npm run export:web -w @justgo/mobile
npm run doctor -w @justgo/mobile
```

CI installs from the single root lockfile, provisions an isolated PostgreSQL 17 service, runs the checks and exports the browser preview. Database tests refuse remote hosts and create/drop only their uniquely named fixture table. They run as `justgo_runtime`, not an administrator.

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

A native smoke flow lives in `apps/mobile/e2e/launch.yaml`. With Maestro installed, a running development build, Metro and healthy API, run `APP_ID=dev.justgo.foundation npm run test:native -w @justgo/mobile`. This is a launch harness, not proof of physical-device recovery or purchases. The [phase handoff](docs/handoffs/phase-01-foundation.md) owns actual results.

## Workspace

- `apps/mobile`: Expo Router, typed design tokens, native Keychain storage and the identity/recovery preview.
- `apps/api`: Fastify, Drizzle, `pg`, reviewed SQL and operational endpoints.
- `packages/contracts`: public Zod response schemas shared by mobile and API.
- `docs`: product scope, implementation plan, extracted design references and durable phase handoffs.

Read [foundation setup and versions](docs/FOUNDATION.md), [design guide](docs/DESIGN.md), [decision register](docs/DECISIONS.md), [Apple/RevenueCat checklist](docs/APPLE_SETUP.md), and the [phase 01 handoff](docs/handoffs/phase-01-foundation.md). The [PRD](docs/PRD.md) owns product behavior and the [implementation plan](docs/IMPLEMENTATION_PLAN.md) owns release gates.
