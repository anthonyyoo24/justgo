# Staging API and database releases

**The Worker release lane is retired.** Anthony moved the API host to Supabase
Edge Functions. Until the
[Supabase plan](../implementation-plan/phase-15-supabase-api.md) replaces this
lane, the Worker workflow and `pnpm run release:staging:local` still deploy the
Worker. Run them only when Anthony's go names the Worker. The database guard,
release identity and probe rules below carry over.

The manual [Staging API release workflow](../../.github/workflows/staging-api.yml)
prepares Cloudflare Worker versions and deploys the exact version after its probes
pass. Reconfirm the serving and latest baseline before each release. Release
probes do not establish real managed-account, performance, alert-delivery or
native acceptance.

The [Phase 15 handoff](../handoffs/phase-15-cloudflare-api.md#current-status) owns
current source, tag, CI, run, deployment, version, probe and approval evidence.
Existing owner-only builds still target the Vercel API and legal addresses until
the approved full cutover replaces or retires them. Local implementation does not
authorize account creation, spending, deployment, migrations, DNS changes, native
releases or Vercel retirement.

## Fixed target

`stagingTarget` in [`scripts/release/staging-api.mjs`](../../scripts/release/staging-api.mjs)
fixes the repository, Worker, protected environment and sole reviewer. The
Hyperdrive origin, project ref and connection checks live in
`scripts/release/staging-api-deployment.mjs` and
`apps/api/scripts/staging-release-guard.ts`. Their tests assert each value. The
lane cannot select production or another Worker name. A future
`justgo-api-production` needs separate credentials and its own approved procedure.

The account ID and Workers subdomain come from protected GitHub variables. Never
guess an account ID in source.

The Worker's placement target is `aws:ca-central-1`. Actual placement and full
managed-workload CPU and latency are unmeasured.

Hyperdrive must report caching disabled, `verify-full` with a CA, and an origin
connection limit of five. Caching stays off because ownership and revocation reads
must never use cached results. The limit of five is a soft origin limit, not a
cap on total database connections. Count the separate direct release connections
when you measure capacity.

These platform limits shape the lane:

- Hyperdrive does not support advisory locks. The release advisory lock therefore
  stays on the separate direct session-pooler migrator connection.
- Workers' [native TLS options](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/sockets.h)
  have no custom CA trust store, so a Worker does not trust a CA just because it
  receives `DATABASE_CA_CERT`. Hyperdrive owns the verified origin connection.
- Hosted Hyperdrive URLs carry opaque proxy usernames and database names, on
  `*.workers.alt:5432` with `sslmode=disable`, or `*.hyperdrive.local` under
  Miniflare. Those placeholders are not origin identity, and `sslmode=disable`
  does not turn off TLS to the real origin. `/ready` verifies the real database
  name, runtime role and schema capabilities through Hyperdrive.

See [Hyperdrive's supported features](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/).

## Staging database

The staging database is the Supabase project **JustGo**, project ref
`kmcpcauaxlgpevkkenwd`, in Canada Central, under the organization
**anthonyyoo corp**. Anthony approved its creation after Supabase quoted $0 a
month. That quote does not guarantee a future budget. Production is not
provisioned.

To provision a database, follow this order:

1. As an administrator, review `apps/api/scripts/provision.sql` and apply it once.
   It creates the `justgo_migrator` and `justgo_runtime` roles, the private
   `justgo` and `drizzle` schemas, and their grants and limits. Give each role an
   independent random password through a secure administrative channel. Never put
   a password in a migration.
2. Connect the migration role directly or through the **session** pooler, which
   listens on port 5432. Staging uses host
   `aws-0-ca-central-1.pooler.supabase.com` and username
   `justgo_migrator.<project-ref>`. Supply the project's CA and keep certificate
   and hostname verification on.
3. Apply the application migrations with `pnpm run db:migrate`.
4. Connect the runtime role with its own password. The Vercel API that build 5
   still uses connects through the **transaction** pooler on port 6543 as
   `justgo_runtime.<project-ref>`. The Worker connects through Hyperdrive.

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

## Credentials and approval protection

The GitHub release lane reads these secrets from the protected `justgo-staging`
environment. The owner-local lane below uses an owner-only credential file
instead. No secret is copied into source or build children.

| Secret                         | Purpose                                                                                             |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`         | Workers Write and Hyperdrive Read on the approved account. No account setup or backup authority.    |
| `MIGRATION_DATABASE_URL`       | Restricted migrator connection. Never the runtime connection or a `postgres` operator login.        |
| `DATABASE_CA_CERT`             | Trusted PEM CA for that migration connection.                                                       |
| `STAGING_RECOVERY_ATTESTATION` | Reviewed current recovery evidence, required only for pending migrations.                           |
| `STAGING_BOOTSTRAP_BINDINGS`   | Initial runtime secrets for the first deployment. Removed from GitHub after the verified bootstrap. |

An owner-only local copy of the bootstrap bindings remains, mode 0600 and ignored
by Git. Do not read or log its values.

Protected variables are `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_WORKERS_SUBDOMAIN`, `STAGING_HYPERDRIVE_ID` and
`STAGING_WORKER_ORIGIN`. The last one is only the GitHub environment display
link. Requests use the validated account subdomain and the fixed Worker name.

Naming an account, token scope, DPA, Hyperdrive configuration or protected setting
here does not accept it. Verify each through separately approved setup.

The workflow checks for sole-owner review and the exact main-only branch policy,
before the protected job and again inside it. Adding another user or team reviewer
fails that guard, because GitHub lets any one configured reviewer approve. These
checks do not replace Anthony's approval of the environment job.

Runtime database, Auth, rate-key and diagnostic secrets belong to the staging
Worker, never to mobile or the release bundle. Prepare secret values through the
Wrangler secret interface under separate credential authorization.
`wrangler secret put` deploys a new version, and `wrangler versions secret put`
creates an undeployed one. Neither is a harmless configuration read, so each
initial provisioning and secret rotation needs an approved version disposition.
Never put secret values in process arguments, source, receipts or chat. The backup
runner uses its own narrowly scoped credentials, described in
[Cloudflare backups](CLOUDFLARE_BACKUPS.md).

<a id="local-phase-branch-staging-tests"></a>

## Local branch staging tests

With Anthony's go, a code-only staging test may deploy a committed branch through
`pnpm run release:staging:local`. That go does not cover migrations, production
releases or merges. The lane needs no push, tag or PR, and it does not impersonate
a GitHub run. The GitHub workflow keeps its exact-main CI and protected-environment
requirements.

Run from the repository root:

```sh
pnpm run release:staging:local --prepare --phase-branch <branch> --source <full-local-commit-sha> --credentials <protected-json-file>
pnpm run db:local
pnpm run release:staging:local --deploy --phase-branch <branch> --source <full-local-commit-sha> --credentials <protected-json-file>
```

Pass the checked-out branch to `--phase-branch` and its exact commit to
`--source`. `scripts/release/staging-local.mjs` rejects `main`, a detached HEAD, a
dirty checkout and a credentials file that is not owner-only or holds other keys.
Before a deployment it runs Expo Doctor, `check:static`, coverage, the Workers
smoke and the selected journeys against loopback `justgo_test` only.

The original operator connection and CA already exist in the ignored owner-only
`.local/staging.env`. Check that file before you ask Anthony for credentials. Use
the existing restricted migrator's verified-TLS session-pooler connection. Runtime
credentials are not a substitute, and GitHub secret values cannot be read back.
Never paste credentials into chat or command arguments. An empty
`MIGRATION_DATABASE_URL` allows a read-only `--prepare` only.

Deployment requires the whole migration chain to be applied already. The lane
never retries an upload, rolls back or changes runtime secret values. Receipts
stay in the ignored `.local/phase15-cloudflare/local-releases/`, without
credentials or user content. A local release does not claim hosted CI, merge
approval, phone acceptance or a completed cutover. Before you retry an uncertain
release, inspect the version that is actually serving.

## Initial Worker and cutover prerequisites

The `bootstrap` operation in `scripts/release/staging-bootstrap.mjs` created the
staging Worker once. Never rerun bootstrap against the existing Worker, and never
delete and recreate the Worker. If a later check fails after an upload succeeded,
inspect the existing version and deployment, then ship reviewed fixes through an
ordinary release. Do not simulate GitHub context variables to run bootstrap
locally.

Use the local setup token for account preparation only. Never move the broader
Hyperdrive Write bootstrap token into CI.

The latest uploaded version must equal the deployed baseline before a new
candidate is built. Unexpected or abandoned versions, including secret-only
uploads, need operator inspection and an approved disposition. Never delete or
promote a version to make this check pass. The `abandoned_version_id` input
accepts only the one reviewed October 30 incident in
`scripts/release/staging-abandoned-version.mjs`, which is consumed. Do not reuse it.

Automatic invocation logs, Logpush and tail consumers stay disabled on this Worker,
because the app's filtered diagnostics are the reporting boundary. The lane reads
these settings and stops if they are enabled. It never changes them.

The hosted Vercel API project `justgo` (region `yul1`) still serves Fastify
`311f073` at `https://justgo-two.vercel.app` to TestFlight build 5. P15-3 removed
`apps/api/vercel.json` and `.vercelignore`, so this repository no longer carries
that project's build configuration. Keep its address, project settings and
credentials until P15-11 of the
[Phase 15 plan](../implementation-plan/phase-15-supabase-api.md) turns it off.
The legal pages stay on a separate Vercel Hobby project at
`justgo-legal.vercel.app`. A redirect or two working APIs does not prove that
private request bodies stopped reaching Vercel. The [cutover procedure](CLOUDFLARE_CUTOVER.md) owns the order of Vercel
retirement, Cloudflare legal publication and the ASC and EAS URL update. Ship a
TestFlight build only as part of that authorized cutover.

## Run a code-only release

1. Open a ready PR with the reviewed source and merge it under the
   [Git and autonomy](../../AGENTS.md#git-and-autonomy) rules. The release needs a
   successful **Foundation checks** run from the push to `main` for that commit.
   CI on the PR does not count. A staging deploy needs Anthony's go. With that go,
   create the reviewed tag on the merged commit.
2. On `main`, dispatch **Staging API release**, choose `deploy`, and provide that
   tag. Leave `migration_plan_sha256` empty. The workflow resolves the tag to a
   commit reachable from `main` and checks out that exact SHA after review.
3. Review the source and operation, then approve the protected environment job.
   Provider credentials reach only its release step.
4. Inspect the actual run, the version and deployment receipt, and public
   readiness before you record hosted acceptance. A failed or cancelled run is not
   a release receipt.

The database guard verifies the hosted target, restricted role, trusted TLS and a
complete applied Drizzle-history prefix. Edited hashes, missing checkpoints,
future migrations and pending SQL stop a code-only release. One PostgreSQL session
advisory lock stays held through the database checks, candidate build, probes and
promotion. GitHub also serializes these jobs without cancelling an active release.

## Local Worker runtime checks

`pnpm run test:workers` runs the pinned Wrangler and workerd entrypoint against
loopback `justgo_test`. `JUSTGO_WORKERS_TEST_PORT` selects another loopback port.
`pnpm run profile:workers` writes mode-0600 CPU profiles under
`.local/workers/profiles/`. Both are local evidence only. They do not establish
hosted Hyperdrive, CPU or account acceptance.

## Candidate and promotion safeguards

The lane builds, uploads and promotes through `staging-worker-build.mjs`,
`staging-api.mjs`, `staging-public-probes.mjs` and `staging-promotion.mjs` in
`scripts/release/`. Their tests pin each limit. An operator relies on these
guarantees:

- Only the inspected `worker.js` bytes are uploaded, built from tracked sources.
  The receipt carries the bundle's SHA-256.
- The upload creates an immutable candidate version and leaves the serving
  deployment unchanged. Existing approved bindings survive exactly.
- The candidate's version URL, then its public origin, must pass `/health`,
  `/ready` and the unauthenticated 401 guards with the reviewed source SHA.
- Promotion is one deployment POST that moves 100% of traffic. It is never
  retried, forced or rolled back. A lost response leads to readback, not a
  second mutation.
- Losing the database lease aborts active work.

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

Before promotion, a candidate or probe failure leaves serving traffic unchanged.
Still inspect the actual deployment before you retry. A failed version upload has
an uncertain outcome and may leave an undeployed version. Never upload again
automatically or delete it.

After promotion is attempted, a failed readback, probe, receipt write or cleanup
reports `STAGING_PROMOTION_UNCONFIRMED`. Inspect the deployment and version IDs,
the source and run bindings and public health and readiness before you decide the
outcome. These diagnostics authorize no rollback or further deployment.

The optional `x-justgo-startup-stage` header names only where startup failed. It
identifies a boundary, not the cause, and it does not authorize promotion.

Pending migrations may already be committed when the API deployment fails. Keep
old and new compatibility and repair forward. Never downgrade the schema, restore
a snapshot, delete a candidate or roll back traffic across a schema change
automatically. Any separately approved repair keeps accepted writes and the
current deletion and revocation state.

Staging stays on Workers Free by Anthony's choice after he reviewed Paid pricing.
Measured public-check CPU exceeds the Free budget, so its suitability is open.
API errors go to the US-region Sentry project `anthony-corp` / `justgo-api`, with
delivery off until gate #93 passes. Sentry readiness monitor `10773615` checks the Cloudflare `/ready`. Delivery of
Sentry Cron failure and missed-backup alerts is unverified. Full-workload latency
and CPU, DPA and privacy suitability, old-build retirement and device acceptance
remain open [`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate).
Local release tests do not close them.
