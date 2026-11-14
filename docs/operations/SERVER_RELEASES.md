# Staging API and database releases

The staging API is one Supabase Edge Function, `api`, in the Supabase project
**JustGo US**. The manual
[Staging API release workflow](../../.github/workflows/staging-api.yml) builds
the reviewed tag, deploys it as `api-candidate`, probes it, and only then deploys
the same bundle as `api`. `pnpm run release:staging:local` only dispatches that
workflow and prints its receipt, so the Mac deploys nothing. Every deploy,
migration and secret change needs Anthony's go.

The Cloudflare Worker that served staging before the function is retired, and
P15-5 of the [Phase 15 plan](../implementation-plan/phase-15-supabase-api.md)
removed its code and release lane. Git history keeps them and the earlier Worker
evidence.

Release probes do not establish real managed-account, performance,
alert-delivery or native acceptance.

## Fixed target

`stagingProjectRef` in
[`scripts/release/staging-supabase.mjs`](../../scripts/release/staging-supabase.mjs)
pins the project ref `gcjmvtsisivxxorstvkb`, and `stagingFunctions` pins the
function names `api` and `api-candidate`. `stagingProject` and
`hostedMigrationOptions()` in
[`apps/api/scripts/staging-release-guard.ts`](../../apps/api/scripts/staging-release-guard.ts)
pin the same ref and its session pooler host, and a test keeps the two refs
equal. [Staging readiness diagnostic](../../.github/workflows/staging-health.yml)
reads that project's `/ready`. `stagingTarget` in
[`scripts/release/staging-api.mjs`](../../scripts/release/staging-api.mjs) pins the
repository, the protected environment and its sole reviewer. The lane refuses a
`SUPABASE_PROJECT_REF` that differs from the pinned ref, so it cannot select
production. A future production project needs separate credentials and its own
approved procedure.

[`supabase/config.toml`](../../supabase/config.toml) gives both functions the
same entrypoint and `verify_jwt = false`, because the API checks its own bearer.
The lane reads each function back and refuses one that is not `ACTIVE` or that
verifies JWTs. The function URL is
`https://<ref>.supabase.co/functions/v1/<name>`, and
`stripFunctionPrefix` in `apps/api/src/edge.ts` removes the `/<name>` prefix the
function receives.

<a id="local-branch-staging-tests"></a>

## Run a release

1. Merge the reviewed source under the
   [Git and autonomy](../../AGENTS.md#git-and-autonomy) rules. The release needs a
   successful **Foundation checks** run from the push to `main` for that commit.
   CI on the PR does not count. With Anthony's go, create the reviewed tag on the
   merged commit and push it.
2. Check out that tag in a clean checkout and preview the run. The dry run
   refuses a dirty checkout or a HEAD that is not the tag's commit, builds the
   bundle, prints each step and ends with `dry run, no deploy`. It contacts
   neither GitHub nor Supabase.

   ```sh
   pnpm run release:staging:local --tag <tag> --operation deploy --dry-run
   ```

3. Run it again without `--dry-run`. The command dispatches **Staging API
   release** on `main` with `gh workflow run`, prints the run URL, waits for the
   run and prints its `staging_` receipt lines. You can also dispatch the
   workflow from GitHub with the same inputs.
4. Review the source and operation, then approve the protected environment job.
   Provider credentials reach only its release step.
5. Read the receipt. A `staging_supabase_release` receipt names the source SHA,
   the previous SHA and function version, the bundle SHA-256 and size, and the candidate and
   serving function versions. A failed or cancelled run is not a receipt.

`--operation` is `deploy`, `migrate-deploy` with `--plan <sha256>`, or `secrets`.

Inside the job, the lane:

1. Reads the serving `/health` source SHA as `previousApiSha`. When `api` does
   not exist, `previousApiSha` is the fixed marker `none`, which the guard
   accepts only for a project with no applied migrations, as
   [First release](#first-release) describes. A listed `api` that cannot name
   its source still fails the run. When `api` already serves the release SHA,
   it stops with `unchanged`.
2. Holds the database guard in `apps/api/scripts/staging-release-guard.ts`: the
   hosted target, restricted role, trusted TLS and a complete applied Drizzle
   history. One PostgreSQL session advisory lock stays held through the serving
   deploy. GitHub also serializes these jobs without cancelling an active one.
3. Builds `supabase/functions/api/dist/edge.mjs` from tracked sources with
   `apps/api/scripts/edge-build.mjs`. The bundle stays at or under 5 MB, and a
   generated `release.mjs` names the source SHA, because function secrets are
   project-wide.
4. Deploys the bundle as `api-candidate` and checks `/health`, `/ready` and the
   unauthenticated 401 guards with the release SHA.
5. Rechecks the database lease, deploys the same bundle as `api`, probes it the
   same way, and reads back that `api`'s version changed.

## Roll back

Rollback is the same lane run on the previous tag with `deploy`. Never roll back
across a schema change: when the newer release applied a migration, keep old and
new compatibility and repair forward.

## Function secrets

The `secrets` operation sets the function secrets from the protected
`STAGING_FUNCTION_SECRETS` environment secret, a dotenv file. It deploys nothing.
The lane accepts only the runtime names in `functionSecretNames`, requires the
staging and managed values, a transaction-pooler `DATABASE_URL` on port 6543 as
`justgo_runtime.<ref>`, a PEM `DATABASE_CA_CERT` and long random keys. It refuses
`SUPABASE_*`, `JUSTGO_SOURCE_SHA`, `API_SENTRY_RELEASE` and `PORT`, since the
platform or the bundle sets those. `functionSecretRules` refuses each value the
API's `readConfig()` would refuse at boot, such as `DATABASE_SSL=true` or the
API's local default `IDENTITY_RATE_LIMIT_KEY`, with a
code that names the field and not the value, as in
`STAGING_SUPABASE_SECRET_DATABASE_SSL_INVALID`.
`apps/api/tests/scripts/staging-function-secrets.test.ts` runs the rules
against the real `readConfig()`, so a rule that drifts looser fails it. It writes the file mode 0600 under
`$RUNNER_TEMP`, removes it, confirms the names with `secrets list`, and probes
`api` when it exists. The receipt holds names only. Never put secret values in
process arguments, source, receipts or chat.

## Credentials and approval protection

The workflow reads these from the protected `justgo-staging` environment. No
secret is copied into source, the bundle or a build child.

| Secret                         | Purpose                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`        | Supabase CLI access for function deploys and secrets. Only the release steps receive it. |
| `MIGRATION_DATABASE_URL`       | Restricted migrator connection. Never the runtime connection or a `postgres` login.      |
| `DATABASE_CA_CERT`             | Trusted PEM CA for that migration connection.                                            |
| `STAGING_RECOVERY_ATTESTATION` | Reviewed current recovery evidence, required only for pending migrations.                |
| `STAGING_FUNCTION_SECRETS`     | The function's runtime secrets, read only by the `secrets` operation.                    |

The one protected variable is `SUPABASE_PROJECT_REF`.

The Supabase CLI comes from the SHA-pinned `supabase/setup-cli` action at CLI
version 3.1.0, not from npm, so nothing new installs on the Mac. Its telemetry is
off, and its child process gets only `PATH`, `HOME`, `DOCKER_HOST` and the
access token.

Naming a token scope or protected setting here does not accept it. Verify each
through separately approved setup.

The workflow checks for sole-owner review and the exact main-only branch policy,
before the protected job and again inside it. Adding another user or team
reviewer fails that guard, because GitHub lets any one configured reviewer
approve. These checks do not replace Anthony's approval of the environment job.

## Local Edge runtime check

`pnpm run test:edge` builds the bundle and runs the managed sign-in, read, write,
idempotent retry, error envelope, account deletion, startup redaction, deferred
error delivery and outbound adapter routes in the pinned Edge runtime against
loopback `justgo_test`. CI runs it in the `database` job. It is local evidence only,
not hosted CPU, latency or account acceptance.

## Staging database

The staging database is the Supabase project **JustGo US**, project ref
`gcjmvtsisivxxorstvkb`, in `us-east-1` on the free plan, under the organization
**anthonyyoo corp**. Anthony created it on 2026-11-13. The
[move plan](../implementation-plan/supabase-us-move.md) owns the move from the
Canada project `kmcpcauaxlgpevkkenwd`, which served staging before it and stays
until that plan's US-10. The lane can no longer release to Canada. Production
is not provisioned.

To provision a database, follow this order:

1. As an administrator, review `apps/api/scripts/provision.sql` and apply it once.
   It creates the `justgo_migrator` and `justgo_runtime` roles, the private
   `justgo` and `drizzle` schemas, and their grants and limits. Give each role an
   independent random password through a secure administrative channel. Never put
   a password in a migration.
2. Connect the migration role directly or through the **session** pooler, which
   listens on port 5432. Staging uses host
   `aws-1-us-east-1.pooler.supabase.com` and username
   `justgo_migrator.<project-ref>`. Supply the project's CA and keep certificate
   and hostname verification on.
3. Apply the application migrations with `pnpm run db:migrate`.
4. Connect the runtime role with its own password through the **transaction**
   pooler, the same host on port 6543, as `justgo_runtime.<project-ref>`. The `api` function and
   the Vercel API that build 5 still uses both connect this way.

Supabase records the administrative provisioning as its own migration,
`foundation_roles`. Drizzle's journal in schema `drizzle` records the application
migrations from `0000_foundation.sql` on. Keep the two runners separate.
Generate a later domain migration with
`pnpm --filter @justgo/api run db:generate --name <feature_name>`, or a custom one
with Drizzle Kit's `--custom` option, and review the generated SQL and journal
together. Managed Auth also needs the operator-installed session-check helper in
[account setup](ACCOUNT_SYNC_SETUP.md#live-auth-session-privileges).

Give each new owner-scoped table `USING` and `WITH CHECK` policies for
`justgo_runtime`, only the grants its operations need, and an index on `user_id`.
PostgreSQL truncates identifiers longer than 63 bytes, so give each long
generated constraint or foreign-key name an explicit short name in the schema,
the SQL and the snapshot.

## First release

A new project has no `api` function and no Drizzle journal. The lane then reads
`previousApiSha` as `none`, and the guard reads the missing
`drizzle.__drizzle_migrations` table as an empty history, so every migration is
pending. The guard refuses `none` with `serving_function_missing` once any
migration is applied, so the first release is one `migrate-deploy` that applies
every migration and then creates `api`. There is no migrate-only run, and a
second run cannot name a previous API. In this order:

1. Provision the roles and passwords as [Staging database](#staging-database) describes.
   Do not run `pnpm run db:migrate` against the project, because the lane
   applies the migrations.
2. Install the session-check helper from
   [account setup](ACCOUNT_SYNC_SETUP.md#live-auth-session-privileges). It needs
   only the `justgo_runtime` role, and the candidate's `/ready` probe needs it.
3. Run the `secrets` operation, and set the `SUPABASE_*` function secrets the
   lane refuses. With no `api` it probes nothing.
4. Review the pending SQL, then dispatch `migrate-deploy` with the printed plan
   digest. Its recovery attestation or test-data waiver names
   `"previousApiSha": "none"`. The receipt names `previousApiSha` `none` and no
   previous version.
5. Schedule the identity retention job. As `postgres`, run
   [`apps/api/scripts/beta-identity-retention.sql`](../../apps/api/scripts/beta-identity-retention.sql)
   once in the SQL editor. It needs the migrated function, so it runs after the
   release. It enables `pg_cron` and schedules the job that
   [TESTFLIGHT_BETA.md](TESTFLIGHT_BETA.md#identity-retention-job) describes, and
   its last query shows `justgo-identity-retention` at `17 * * * *`.

If that run fails after its migrations commit, the project holds migrations and
no `api`, and the lane refuses every later run with `serving_function_missing`.
Recovering it is operator work outside the lane, so bring it to Anthony.

## Pending migrations and recovery evidence

Choose `migrate-deploy` only after you review the exact pending SQL and its printed
plan digest. A failed code-only run may print that plan. It does not authorize
migrations. Provider-owned Auth helpers, role provisioning and retention-job SQL
stay separate operator work. Never route arbitrary SQL or `supabase db push`
through this lane.

`migrate-deploy` requires the matching `migration_plan_sha256` and an
owner-reviewed `STAGING_RECOVERY_ATTESTATION`. `apps/api/scripts/staging-release-guard.ts`
checks its fields and the 24-hour freshness window. Never create placeholder
approval values or infer its booleans from a successful upload.

While staging holds only test data, Anthony may approve a test-data waiver in
place of that recovery proof (2026-11-12, while backups were paused). The
secret then holds `kind: "test-data-waiver"`, `version`, `project`,
`sourceSha`, `previousApiSha`, `historyDigest`, `planDigest`,
`testDataOnly: true`, `ownerApprovedAt` and an `expiresAt` at most 24 hours
after it. The guard binds it to that one plan. A waiver proves no recovery and
leaves gate #98 open. Retire this path, in code and here, before outside
testers store real journals. Backups resumed on 2026-11-13.

Encrypted R2 database and ledger receipts and the isolated restore in
[Cloudflare backups](CLOUDFLARE_BACKUPS.md) supply evidence for this attestation
once the actual arrangement is accepted. The
[restore checklist](CLOUDFLARE_BACKUPS.md#restore-checklist) remains the
reopening boundary. An hourly ledger copy cannot cover deletions or revocations
made after it, so a current writer-fenced ledger must cover application and Auth
changes. If that state cannot be recovered, keep restored writers closed.

Synthetic app and Auth rehearsal does not prove restoration of the real Supabase
Auth schema, ACLs, roles, extensions or providers. Open recovery gates block
pending hosted migrations. They do not block a code-only release when live
migration history already matches.

## Failures and uncertain outcomes

<a id="candidate-and-promotion-safeguards"></a>

A failed candidate deploy or probe leaves `api` unchanged. A lost deploy response
reports `STAGING_SUPABASE_DEPLOY_UNCONFIRMED`. Rerun the same tag: the lane reads
the serving SHA first and returns `unchanged` when the release already reached
`api`. A lost database lease aborts the run before `api` changes.

A failure after the `api` deploy, such as a failed probe or readback, leaves `api`
on the new bundle. Inspect the function version and public health and readiness
before you decide. Roll back with the previous tag only when no migration ran.

The optional `x-justgo-startup-stage` header names only where startup failed. It
identifies a boundary, not the cause.

Pending migrations may already be committed when the deploy fails. Keep old and
new compatibility and repair forward. Never downgrade the schema, restore a
snapshot or roll back traffic across a schema change automatically. Any
separately approved repair keeps accepted writes and the current deletion and
revocation state.

API errors go to the US-region Sentry project `anthony-corp` / `justgo-api`, with
delivery off until gate #93 passes. Full-workload latency and CPU, DPA and privacy
suitability, old-build retirement and device acceptance remain open
[`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate).
Local release tests do not close them.
