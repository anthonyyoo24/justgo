# Foundation: setup, versions and operations

> Current setup and operations guide, established in Phase 01. See [IDENTITY.md](../architecture/IDENTITY.md) for Phase 02 identity configuration and [phase handoffs](../handoffs/README.md) for historical verification and remaining acceptance gates.

Established September 17, 2026. Start with the [README](../../README.md). The Phase 01 preview did not include account/session endpoints or permanent client credential storage; Phase 02 adds those capabilities. Phase 07 now implements challenge/completion/reflection/Progress saving and synchronization; purchases and verified production coverage remain Phase 07A.

## Compatible version set

Direct dependencies are exact-pinned; `package-lock.json` fixes transitive versions. Use root `npm ci`, not separate workspace installs. Its prepare step builds the contracts package to JavaScript for Node/Vercel; Metro uses its React Native source export. Re-run `npm run build:contracts` after editing contracts during API development.

| Component                        | Pinned version / constraint                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------- |
| Node / npm                       | 24.18.0 LTS / 11.16.0; Vercel runtime 24.x                                                         |
| TypeScript                       | 6.0.3, strict plus unchecked-index and exact-optional checks                                       |
| Expo / React Native / React      | 57.0.27 / 0.86.3 / 19.2.3                                                                          |
| Expo Router / development client | 57.0.25 / 57.0.19                                                                                  |
| Reanimated / Worklets            | 4.5.1 / 0.10.1; New Architecture required                                                          |
| Bottom sheet / Gesture Handler   | 5.2.14 / 2.32.0                                                                                    |
| Safe area / Screens / SVG        | 5.7.0 / 4.26.2 / 15.15.4                                                                           |
| Activity storage / state         | AsyncStorage 2.2.0 / Zustand 5.0.15; explicit journal persistence                                  |
| Connectivity / saving feedback   | NetInfo 12.0.1 / Sonner Native 0.27.0 / Sonner 2.0.8 web adapter                                   |
| React Native Web                 | 0.21.2; development/browser verification only                                                      |
| iOS                              | 16.4 minimum, Hermes; original iPhone 17 / iOS 26.4 smoke, retained Phase 07 QA device on iOS 26.5 |
| Fastify / Drizzle / pg           | 5.12.5 / 0.45.2 (kit 0.31.10) / 8.23.0                                                             |
| PostgreSQL                       | 17 locally and in CI; Supabase staging 17.6                                                        |
| Tests                            | Vitest 5.0.1; Jest 29.7.0, jest-expo 57.0.5, React Native Testing Library 13.3.3                   |

The React family is overridden to the Expo-supported version to prevent a test renderer from pulling an incompatible React. Expo Doctor validates the installed native set. Recheck the [Expo 57 reference](https://docs.expo.dev/versions/v57.0.0/) and [Reanimated compatibility table](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/) as a set when upgrading. Do not update Worklets independently.

Android is excluded from app platforms and has no package identifier, EAS profile, signing or test evidence. Shared dependencies do not establish Android support. When scheduled, select the SDK's Android minimum/target/compile levels, JDK/Gradle, New Architecture and recovery adapter together, and recheck current Play requirements. Do not infer an Android release promise from the Expo template.

## Environments and secrets

| Variable                        | Where / purpose                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `EXPO_PUBLIC_API_URL`           | Mobile `.env` or EAS environment; public HTTPS staging URL, loopback/LAN locally                                                           |
| `IOS_BUNDLE_IDENTIFIER`         | Confirmed identifier required by device/distribution EAS builds; the simulator profile explicitly uses provisional `dev.justgo.foundation` |
| `DATABASE_URL`                  | API `.env` / Vercel preview Secret; restricted `justgo_runtime` only                                                                       |
| `MIGRATION_DATABASE_URL`        | Operator's local/CI migration environment only; `justgo_migrator`; never Vercel/mobile                                                     |
| `DATABASE_CA_CERT`              | API/migration environment; Supabase root certificate PEM, with verification enabled                                                        |
| `DATABASE_SSL`                  | `verify-full` remotely; `disable` accepted only for loopback test databases                                                                |
| `DATABASE_POOL_MAX`             | API; default 1, validated range 1–5                                                                                                        |
| `CORS_ORIGINS`                  | Explicit comma-separated browser origins; staging allows localhost:8081 for development                                                    |
| `PORT`, `LOG_LEVEL`, `NODE_ENV` | API process; 3000 / info / development defaults; production requires a database URL                                                        |

Expo project ID `53cf0560-8ab5-446a-9bc6-deb193b337b5`, owner `anthonyyoos-team`, slug `justgo` are public metadata committed in `apps/mobile/app.config.ts`. Anthony created the project; `eas init --id … --non-interactive` and `eas project:info` verified the existing link. Authenticate through `npx eas-cli@latest login`; no duplicate project is needed. Apple enrollment, permanent bundle ID and physical signing remain owner work in [APPLE_SETUP.md](APPLE_SETUP.md).

Local/staging credential files, `.env*`, `.local`, `.vercel` and generated native projects are ignored. Environment examples contain placeholders. `.vercelignore` is an explicit upload allowlist: deploy API sources, contracts and workspace package metadata only. Before deployment, inspect `npx vercel@latest deploy --dry --json`; never upload local database files, role credentials, generated iOS/Pods, design sources or mobile environment files. Keep original provisioning credentials in the owner's secret manager; ignored local copies are not disaster recovery.

## Database roles, migrations and ownership

Staging: dedicated **JustGo**, project ref `kmcpcauaxlgpevkkenwd`, Canada Central, organization **anthonyyoo corp**. Creation was owner-approved after the provider quoted $0/month. That quote is not a future budget guarantee. Production is not provisioned.

1. As an administrator, review and apply `apps/api/scripts/provision.sql` once. It creates `justgo_migrator` and `justgo_runtime`, private `justgo` and `drizzle` schemas, permissions and connection/time limits. Set random independent login passwords through a secure administrative channel. Do not put passwords in migrations.
2. Set the migration connection to direct PostgreSQL or the **session** pooler on 5432, using the migration role. Staging uses `aws-0-ca-central-1.pooler.supabase.com`, username `justgo_migrator.<project-ref>`. Supply the project's trusted CA and keep certificate/hostname verification enabled.
3. Review generated SQL and journal together. `npm run db:generate -w @justgo/api -- --name feature_name` generates later domain changes; custom migrations use Drizzle Kit's `--custom` option. `npm run db:migrate` verifies the effective migration role before applying the journal to schema `drizzle`.
4. Runtime uses the **transaction** pooler on 6543, username `justgo_runtime.<project-ref>`, with the separate password. No administrator, migration or Supabase service-role key belongs in the API runtime. Mobile never connects to PostgreSQL or Supabase directly.

Staging administrative provisioning is recorded as Supabase migration `foundation_roles`. Application migration `0000_foundation.sql` was applied through Drizzle with its own journal; it creates only `justgo.current_user_id()`. Keep these responsibilities separate. Do not reapply the function SQL through a second migration runner.

The runtime role owns no schema/table, cannot bypass RLS, create roles/databases/tables, or assume the migrator. Future owner-scoped tables must enable **and force** RLS, have `USING` and `WITH CHECK` policies for `justgo_runtime`, grant only required operations, and index `user_id` alongside access-path indexes. Example policy predicate: `user_id = (select justgo.current_user_id())`. Add constraints and indexes with the consuming feature, not a speculative full schema.

The Phase 01 helper `withOwner(db, verifiedUserId, tx => …)` establishes transaction-local ownership after the caller verifies identity. For authenticated feature operations, use `IdentityService.withSession(token, callback)` as described in [IDENTITY.md](../architecture/IDENTITY.md); it verifies the active account/device/session before supplying the owner transaction. It sets `app.user_id` with transaction-local `set_config(..., true)` and executes work on that same connection. Never derive ownership from an untrusted request field, use session-level `SET`, or issue the feature query outside `tx`. A connection without ownership sees no owner data. RLS is defense in depth; it does not replace API authentication/authorization, which Phase 02 implements.

`pg` reuses one pool per warm server instance, max 1 by default, with 5-second connect/statement and 6-second query limits. There are no named prepared statements. Runtime role connection limit is 20. Transaction pooling and those caps bound individual processes; they do not establish a traffic capacity or global Vercel instance limit. Load tests, capacity alerts and budget policy are later operational work. Certificate verification must not be disabled to fix pooler TLS errors; use the dashboard connection host and the Supabase CA.

Local integration tests use a dedicated loopback-only PostgreSQL 17 cluster on 54329. They create a uniquely named fixture table as migrator, execute isolation checks as the actual runtime role, and drop that fixture. The local application catalog seed and synthetic accounts/history are disposable; no customer data belongs in this cluster. Never reset a shared environment to run tests. Use forward-repair migrations; restore and destructive rollback procedures require reviewed backups before domain data exists.

## API deployment and diagnostics

Entrypoint: `apps/api/src/server.ts`, importing Fastify directly for Vercel detection. `build-app.ts` contains the injected/testable app factory. Vercel project **justgo** has root `apps/api`, Fastify preset, Node 24.x, Montréal (`yul1`) function region, and install command `cd ../.. && npm ci`. Deploy from the repository root so the workspace lockfile and contracts are included:

```sh
npx vercel@latest link --project justgo --scope anthony-youngshin-yoos-projects
npx vercel@latest deploy --dry --json
npx vercel@latest deploy --target=preview --regions yul1 --yes --scope anthony-youngshin-yoos-projects
```

Phase 01 verified staging deployment (historical; see the latest handoff for the current preview): `https://justgo-303esikf7-anthony-youngshin-yoos-projects.vercel.app`. Both health/readiness returned healthy JSON using authenticated `vercel curl`.

Set runtime variables in the **preview** environment before deployment. Use Secret storage for `DATABASE_URL`; do not pass its value as a command-line argument. An explicit preview target avoids Vercel treating a project's first deployment as production. The app has no release production deployment yet. Preserve Vercel deployment protection; use authenticated CLI requests for protected verification. A phone needs an owner-approved reachable staging route before it can call a protected preview.

| Route         | Contract                                                      | Failure                                              |
| ------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| `GET /health` | 200 `{ "status": "ok", "service": "justgo-api" }`             | Process/platform failures only; not a database check |
| `GET /ready`  | 200 `{ "status": "ready" }` after database/role/context check | 503 `{ "status": "unavailable" }`                    |

Responses use `no-store`, security headers and server-generated request IDs. The Phase 01 connection probe validated both endpoints with an 8-second deadline. The current identity UI uses the authenticated API and its 10-second request deadline; see [IDENTITY.md](../architecture/IDENTITY.md). Readiness never returns credentials, SQL, database host or role details. Logging uses allowlisted request/response/error fields; URLs, headers, bodies and raw error messages are omitted. Identity and private reflection records now exist; diagnostics must exclude both secrets and journal contents. Sentry and analytics export are not enabled; implement opt-in interfaces in the appropriate phase and revalidate scrubbing before export.

## Design and tests

The [design guide](../design/DESIGN.md), `docs/design-source/` and asset README record Paper provenance, editable-source measurements and raster-only uncertainty. `apps/mobile/src/theme/tokens.ts` is the code authority. Inter font weights are bundled from their licensed package; Baskerville remains the iOS system font. The foundation preview uses an exported illustration and accessible type/button sizes; it is not an approved onboarding or Home screen.

Run `npm run check`, `npm run test:db`, `npm run export:web -w @justgo/mobile`, `npm run export:ios -w @justgo/mobile`, and `npm run doctor -w @justgo/mobile`. CI mirrors these with PostgreSQL 17. Native compilation now runs on EAS using `development-simulator`, per the owner’s 8 GB memory constraint. Keep Simulator and local preview servers stopped during cloud compilation; launch only one simulator afterwards and reuse its binary for JS/UI changes. Preserve local Pods/DerivedData caches. Explain any EAS account/quota/configuration blocker before considering a heavy local fallback.

The EAS `development-simulator` build `2c73c1af-3d5d-4216-8f25-875c72691973` completed on September 17, 2026. Its downloaded binary passed native startup and the connection check on one iPhone 17 / iOS 26.4 simulator. The artifact remains at `.local/JustGO-eas-simulator.tar.gz`, with the extracted app at `.local/eas-simulator/JustGO.app`. Start Metro from `apps/mobile` using `NODE_OPTIONS=--dns-result-order=ipv4first npx expo start --dev-client --localhost --max-workers 1`; the IPv4 option avoids a localhost/127.0.0.1 binding mismatch. Reuse this binary until a native dependency/configuration changes.

The Phase 02 binary and its native checks remain historical in [its handoff](../handoffs/phase-02-identity.md). The October 6 EAS simulator build and retained QA device are recorded in the [07.3 simulator setup](../handoffs/phase-07-3-local-flow.md#october-6-simulator-reuse-and-owner-test-setup); use the existing installed binary containing AsyncStorage/NetInfo for current JavaScript/UI checks.

The native launch harness is `apps/mobile/e2e/launch.yaml`; run it with Maestro only after installing/launching a development build and starting Metro/API. Browser verification must cover loading/disabled state, successful readiness, offline failure/retry, keyboard activation and narrow-screen scrolling. Native verification is separately recorded in the handoff; a web export proves no Keychain, purchase or device recovery behavior.

The Phase 01 `npm audit` recorded 18 moderate dependency advisories, with no high/critical findings at the recorded installation. They include transitive Expo tooling and Drizzle Kit dependencies. Review compatible upstream fixes before release; do not apply a forced Expo downgrade to silence the audit.

## Phase 07 coordinated cutover and old clients

This runbook prepares Phase 09 staging/release integration; Phase 07.5 local implementation does not deploy externally or prove that old installed clients are retired. The final public protocol is catalog/completed-attempt/reflection PATCH and independent summary/calendar/day resources, alongside noun identity resources. Old identity/product action routes return 404; no compatibility writer remains after contraction.

1. Inventory the deployed API build/schema journal and distributed mobile/native runtime versions before maintenance. Confirm the new client contains the canonical contracts/callers and the required AsyncStorage/NetInfo runtime. Block/distribute an update for older clients before reopening paid product access; there is no implemented general minimum-version endpoint or silent old-client conversion. Preserve recovery credentials and existing securely saved identity proposals.
2. Prepare a restorable pre-cutover database backup under the separate operator role, protect its private contents outside repository/log artifacts, and record only counts/comparison outcomes. Rehearse restoration and forward application on disposable data with `npm run test:migrations`; production backup/PITR and a reachable phone staging route are Phase 09 requirements. Never test by resetting shared staging or production.
3. Stop all old API writers/traffic for the final comparison. Apply the unchanged additive/backfill migrations through 0012 if missing. Compare completed `(owner,id,activity_date)` sets, original starts, Level 1/challenge/venue references, canonical catalog and owner-matched submitted feeling/text/revisions. Preserve recorded historical dates and nullable unknown start zones with their historical display fallback. Do not promote drafts/skips or invent legacy lifecycle timestamps.
4. With old writers still stopped, apply reviewed registered `0013_attempt_resources_contract.sql` using `npm run db:migrate` and the separate migration environment. It removes obsolete lifecycle, revision, queue/preferences/skips, separate reflections and action receipts; targeted `attempt_patch_receipts` remain. Repeat preservation/schema/ownership checks before opening traffic. Retain inactive historical challenge/placement references.
5. Deploy matching canonical API/contracts and distribute/reload the matching mobile client together, then run staged recovery/revocation/transfer and completion/reflection/Progress checks. Check old paths return 404 without writes and reject old public fields. Do not grant a production test entitlement or bundle a deployment-protection bypass. Phase 07A must connect real verified access/earlier-upload coverage before paid release.
6. If comparison or deployment fails, keep traffic closed. Before contraction, leave additive schema in place and repair forward. After contraction, an old API requires removed tables/columns and cannot safely be rolled back alone. Restore the protected pre-cutover snapshot only under the reviewed maintenance plan, coordinate its matching old API/client state, then repair/rehearse forward; account for writes since the snapshot before any restore. Prefer a new reviewed forward-repair migration when preserved data is sound. Never edit already-applied 0000–0012 SQL, reset shared data or delete credential history to retry.

Relaunch hydrates same-account device-persisted submissions and resumes their stable create/PATCH operations. New-device recovery restores uploaded server history, not another phone's only pending copy. Current old-client handling is coordinated release maintenance/update, not an already implemented in-app forced-upgrade system. Record actual deployed versions, backup/restore proof, comparisons and staged/device results in the release handoff before claiming rollout acceptance.
