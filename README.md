# JustGO

An iOS-first social-confidence app with local guest use, optional Apple or Google
accounts, six venue decks, explicit reflections and durable Progress history.
Signed-in collections synchronize history and journal through JustGO's API.
Optional iCloud Sync and the complete Download and Import controls are separate.

## Documentation

- [Agent instructions](AGENTS.md) and the directory `AGENTS.md` files: the repository map, the rules and what enforces them, and owner permissions. Read them before changing code.
- Architecture: [tech stack](docs/architecture/TECH_STACK.md), [app shell](docs/architecture/APP_SHELL.md), [activity data](docs/architecture/ACTIVITY_DATA.md) and [identity](docs/architecture/IDENTITY.md).
- Product: the [PRD](docs/product/PRD.md) and the [challenge catalog](docs/product/CHALLENGES.md).
- Operations: [Apple setup](docs/operations/APPLE_SETUP.md), [server releases](docs/operations/SERVER_RELEASES.md) and the other [procedures](docs/operations/) for accounts, builds, releases, backups and support.
- Legal: the [Terms and Privacy drafts, approvals and data inventory](docs/legal/).
- Roadmap: the [implementation plan](docs/implementation-plan/README.md) and [proposals](docs/proposals/) for later phases. The [Phase 15 plan](docs/implementation-plan/phase-15-supabase-api.md) moves the API to Supabase Edge Functions, and the Cloudflare plan and handoff stay as history. Open gates are GitHub issues labeled `gate` (`gh issue list --label gate`).
- Running the app: the [`verify-justgo` skill](.claude/skills/verify-justgo/SKILL.md).

## Start locally

Use the Node version in `.nvmrc` and the npm version in `package.json`. `npm ci` builds the shared contracts. Rerun `npm run build:contracts` after you edit a contract. From this repository root:

```sh
npm ci
npm run db:local
npm run db:migrate
npm run dev:api
# In another terminal:
npm run dev:web
```

The [`verify-justgo` skill](.claude/skills/verify-justgo/SKILL.md) is the tested way to start the app on loopback fixtures and check that it serves this checkout.

`db:local` requires PostgreSQL 17 binaries. On macOS: `brew install postgresql@17`. Elsewhere, set `JUSTGO_PG_BIN` to their directory. The `test:db` migration rehearsal and the backup scripts read it too.

`db:local` creates a loopback-only cluster at `.local/postgres` on port **54329** with the `justgo_test` database, and creates missing workspace `.env` files without replacing existing ones. Stop it with `npm run db:stop`. Database tests need `DATABASE_URL`, `MIGRATION_DATABASE_URL` and `JUSTGO_TEST_ADMIN_DATABASE_URL`, all with `DATABASE_SSL=disable`. `db:local` writes them to a new `apps/api/.env`. If an older `.env` lacks any of them, copy them from `.local/database.env`. This disposable cluster trusts local host authentication, so never expose its port or use it for personal data.

The browser preview is at `http://localhost:8081` and the API at `http://localhost:3000`. To run the challenge, reflection and Progress flow on disposable local data, run `npm run dev:challenges -w @justgo/api` **instead of** `dev:api`, because plain `dev:api` answers `/v1/access` with access unavailable until Phase 16. `dev:challenges` grants a test entitlement only on loopback `justgo_test`.

A physical iPhone needs a reachable HTTPS API route, because `localhost` on a phone refers to the phone.

## Verify

Commands, coverage reports and the check matrix are in
[AGENTS.md](AGENTS.md#choosing-checks).

## iOS development

Compile native builds on the linked EAS cloud project, not on the owner's 8 GB Mac. Keep Simulator closed while building.

```sh
cd apps/mobile
npx eas-cli@latest build --platform ios --profile development-simulator
```

The simulator profile needs no Apple signing. `app.config.ts` links the existing Expo project. Do not create another. If EAS requires authentication, run `npx eas-cli@latest login`. Device and distribution profiles need the confirmed `IOS_BUNDLE_IDENTIFIER` and [Apple setup](docs/operations/APPLE_SETUP.md).

After the cloud build finishes, download its artifact and launch **one** installed simulator. Start the local database and API, then start Metro with `NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --dev-client --localhost --max-workers 1` from `apps/mobile`. The IPv4 option keeps Metro's localhost binding compatible with the simulator's `127.0.0.1` bundle URL. Install the downloaded `.app` and open `justgo://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081`. Reuse that development binary for JavaScript, styling and UI changes through Fast Refresh. Rebuild only when native dependencies or configuration change. Do not restart a heavy local Xcode build as a fallback until you explain an EAS access, quota or configuration blocker.

EAS runs Continuous Native Generation from app config. Inspect the archive before you change `.easignore`.

The local Expo module is auto-linked from `apps/mobile/modules/justgo-keychain`. A native dependency or Swift change needs a new EAS build. If `xcrun simctl` resolves only Command Line Tools, use `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` for simulator commands without changing the global developer selection.

Automated simulator drives are unproven. The [`verify-justgo` Native section](.claude/skills/verify-justgo/SKILL.md#native) and [#114](https://github.com/anthonyyoo24/justgo/issues/114) track them.
