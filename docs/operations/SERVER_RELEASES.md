# Staging API and database releases

The manual [Staging API release workflow](../../.github/workflows/staging-api.yml)
prepares Cloudflare Worker versions and deploys the exact version after its probes
pass. Reconfirm the serving/latest baseline before applying the ordinary release
guards. Release probes do not establish real managed-account, performance,
alert-delivery or native acceptance.

The [Phase 15 handoff](../handoffs/phase-15-cloudflare-api.md#current-status) owns
current source, tag, CI, run, deployment/version, probe and approval evidence.
Existing owner-only builds still target the Vercel API/legal addresses until
the approved full cutover replaces or retires them; see the
[Phase 14 handoff](../handoffs/phase-14-release.md#current-release-evidence). Local implementation does not authorize account creation,
spending, deployment, migrations, DNS changes, native releases or Vercel retirement.

## Fixed target

| Setting                   | Required value                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| GitHub repository         | `anthonyyoo24/justgo`                                                                     |
| Workflow branch           | `main`                                                                                    |
| Protected environment     | `justgo-staging`                                                                          |
| Sole required reviewer    | Anthony, GitHub user `51426358`                                                           |
| Deployment branch policy  | Exactly one branch policy, `main`; no tag/wildcard policy                                 |
| Worker                    | `justgo-api-staging`, separate from the future `justgo-api-production`                    |
| Account and public origin | Approved protected account ID and Workers subdomain; no account ID is guessed in source   |
| Supabase project          | `kmcpcauaxlgpevkkenwd`, Canada Central                                                    |
| Hyperdrive origin         | `db.kmcpcauaxlgpevkkenwd.supabase.co:5432/postgres`, role `justgo_runtime`                |
| Migration connection      | Separate restricted `justgo_migrator` through the project's session pooler on port `5432` |

The Worker runs with `APP_ENVIRONMENT=staging`, managed Auth enabled and the
reviewed staging grants. Its placement target is `aws:ca-central-1`; actual
placement and full managed-workload CPU/latency remain unmeasured. Public route
timings and active-version CPU chart readbacks are recorded in the handoff. The release lane
cannot select production or an arbitrary Worker name. Production needs separate
credentials and its own approved release procedure.

Hyperdrive configuration readback must show caching disabled, certificate and
hostname verification (`verify-full` with a CA), and an origin connection limit
of five. That is a **soft** origin limit, not a proof of total database connection
use. Include the separate direct release connections when measuring
capacity. User ownership and revocation reads must never rely on cached results.

Hyperdrive does not support advisory locks. Hosted managed requests, including
Auth exchange and retained existing-proof recovery, use Hyperdrive transactions
with canonical-owner row locks and live-session rechecks. A unique Auth-subject
mapping resolves concurrent first exchanges through one bounded transaction
retry; revoked legacy proofs can confirm only an already-mapped owner. The
direct legacy transport remains only for isolated loopback tests. A Worker does
not establish custom-CA trust merely by receiving `DATABASE_CA_CERT`; Hyperdrive
owns the verified origin connection. Workers' [native TLS options](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/sockets.h)
do not expose a custom CA trust store. Validated virtual Hyperdrive URLs may
contain opaque proxy usernames and database names, including on
`*.hyperdrive.local`; those placeholders are not origin identity. `/ready`
verifies the real database name, runtime role and schema capabilities through
Hyperdrive. Nonvirtual URLs still require matching literal identity. The release
advisory lock stays on the separate direct session-pooler migrator connection.
See [Hyperdrive's supported features](https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/).

## Credentials and approval protection

Store these secrets only in the protected `justgo-staging` GitHub environment:

| Secret                         | Purpose                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`         | Approved account's Workers editing and Hyperdrive read access; no account setup or backup authority is needed by the release runner   |
| `MIGRATION_DATABASE_URL`       | Restricted migrator connection; never the runtime connection or a `postgres` operator login                                           |
| `DATABASE_CA_CERT`             | Trusted PEM CA for that migration connection; verification remains enabled                                                            |
| `STAGING_RECOVERY_ATTESTATION` | Reviewed current recovery evidence, required only for pending migrations                                                              |
| `STAGING_BOOTSTRAP_BINDINGS`   | Initial runtime secrets and optional variables as JSON; available only to the first-deployment step, removed after verified bootstrap |

After verified active deployment readback on October 31,
`STAGING_BOOTSTRAP_BINDINGS` was removed from the protected GitHub environment;
a fresh secret-name list confirmed its absence. A nonempty mode-0600 ignored
local recovery copy remains, without reading/logging values or changing Worker
bindings. The bootstrap workflow remains documented for clean first provisioning;
it must not be repeated against the existing Worker.

Protected variables are `CLOUDFLARE_ACCOUNT_ID`,
`CLOUDFLARE_WORKERS_SUBDOMAIN`, `STAGING_HYPERDRIVE_ID`, and
`STAGING_WORKER_ORIGIN`. The last is the GitHub environment display link;
requests use the validated account subdomain and fixed Worker name. Provider
readback must confirm the account subdomain, public Workers route and version
URLs. The lane refuses unset or malformed configuration.

The actual account, token scope, DPA, Hyperdrive configuration and these protected
settings have not been accepted merely because this procedure names them. Verify
those through separately approved setup. The workflow checks sole-owner review
and the exact main-only branch policy before the protected job and again inside
it. Adding another User or Team reviewer fails the guard because GitHub permits
any one configured reviewer to approve. These checks do not replace Anthony's
review or separate Git publication permissions.

Runtime database, Auth, rate-key and diagnostic secrets belong to the staging
Worker, not mobile or the release bundle. The version guard requires secret
bindings for `LOCK_DATABASE_URL`, `IDENTITY_RATE_LIMIT_KEY`,
`SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_AUTH_SECRET_KEY`. Optional
`DATABASE_CA_CERT`, `API_SENTRY_DSN` and private beta-grant configuration may also
be secret bindings. Approved public configuration includes the exact Supabase
URL and `NODE_ENV=production`. The release updates source SHA, Sentry release and
GitHub run/attempt bindings explicitly and verifies their readback.

Prepare secret values through the Wrangler secret interface under separate
credential authorization. Ordinary `wrangler secret put` changes the deployed
version; `wrangler versions secret put` creates an undeployed version. Neither
is a harmless configuration read. Initial provisioning and later secret rotations
need an approved version disposition. Never put secret values in process
arguments, source, receipts or chat. The backup runner uses separate narrowly
scoped credentials described in [Cloudflare backups](CLOUDFLARE_BACKUPS.md).

## Initial Worker and cutover prerequisites

The normal lane requires an existing single-version deployment with a valid
source identity. The same protected workflow now offers `bootstrap` for the first
Worker, implemented in `scripts/release/staging-bootstrap.mjs`. It requires the
reviewed tag, exact successful Foundation main-push CI, clean matching checkout,
sole-owner environment protection and the restricted migrator's existing database
lease. The registered migration chain must already be fully applied; bootstrap
never applies SQL or invents a previous Worker SHA. Do not simulate GitHub context
variables to run this operation locally.

After account/DPA approval and Hyperdrive setup, prepare
`STAGING_BOOTSTRAP_BINDINGS` as `{"secrets":{...},"vars":{...}}`. Supply the four
mandatory runtime secrets listed above and explicit secret values for
`BETA_ACCESS_GRANTS` and `BETA_ACCESS_WINDOW`; optional CA, diagnostic and CORS
settings must meet the existing allowlist. The command generates fixed target,
environment, source/run and Hyperdrive bindings internally. It validates the
runtime configuration before database/provider work and excludes this secret JSON
from child commands and builds. Never substitute Vercel's `[SENSITIVE]` export
placeholders for real values.

Dispatch `bootstrap` on main with the reviewed tag and no migration digest, then
obtain the protected environment approval. The command checks exact provider
absence twice, inspects the bundle, and sends one Script Upload with
`If-None-Match: *`. It verifies version/deployment/binding readback, enables the
Worker and version routes with at most one separate request, and probes both
origins. There is no automatic retry, rollback or repair of an existing Worker.
The conditional header is covered locally; Cloudflare's wildcard atomic rejection
still needs hosted evidence, so do not permit concurrent dashboard/CLI writes
during this initial operation. An uncertain outcome requires inspection before
any new attempt. Remove the bootstrap JSON secret after verified deployment.

Use the local setup token for account preparation only. The GitHub release token
needs Workers Write and Hyperdrive Read; do not transfer the broader Hyperdrive
Write bootstrap token into CI. The initial deployment remains a restricted action
even before mobile traffic moves.

The latest uploaded version must equal the deployed baseline before a new
candidate is built. Unexpected or abandoned versions, including secret-only
uploads, require operator inspection and an approved disposition. The runner
never deletes them or promotes them to make this check pass.

The optional `abandoned_version_id` input was used for the inspected failed
October 30 upload `c5af7c5b-d045-470b-b91e-d6cfbe7accf5`, source
`742f3e03ceb823c93e8ddfa9d6e131dfcfc83987`, run `41159286606`, attempt `1`.
Its candidate health passed, readiness returned 503, and it was not promoted.
That continuation required the exact recorded account, baseline deployment/
version/source, all three abandoned uploads' source/run/annotations and preserved
bindings. The required version order was that upload, `c0fefad7-9a31-4db7-976a-bfc8fbb0366b`,
`2d6ea61b-2714-4cd9-9437-2a73f9476dd6`, then baseline
`d15d9fbd-1d99-4106-abc4-43b907ba7a2c`, both at preflight and before upload.
The then-deployed baseline was `caaa7a54-d4a3-4eec-bdc2-9d5f927142e5`,
source `7d8a5624bf7224bc243a342dab22a9d0b82f7f04`.
It does not accept another abandoned version or change the default guard. After
one replacement upload, ordinary candidate/probe/promotion checks apply again;
another failed candidate requires fresh inspection and review. That incident
continuation was consumed when latest and serving both became `830444c8…` from
`08aa805`. The current release above also has latest equal to serving. Do not
reuse the old four-version opt-in; ordinary release guards apply.

Automatic invocation logs, Logpush and tail consumers must be disabled on this
Worker. The version lane reads `/script-settings` for these non-versioned
settings rather than silently changing them. Cloudflare can represent disabled
observability and absent tail consumers as null; malformed settings or enabled
telemetry still stop the lane. `/settings` is used only for the bootstrap
absence check. The app's reconstructed safe diagnostics remain the reporting
boundary. Version URLs are public and use the same database resources as the
version, so their auth and no-store checks are required before deployment.

Hosted Hyperdrive bindings use opaque proxy credentials/database names and a
platform-owned 32-hex `*.workers.alt:5432` transport with sole query parameter
`sslmode=disable`; local Miniflare uses `*.hyperdrive.local`. This parameter does
not disable verified TLS on the actual Hyperdrive database origin.
Provider readback validates the real origin role/project/database, and managed
readiness checks that active connection's real role/database. The direct URL is
retained as a strictly validated origin reference, not an active managed Worker
socket. A local smoke cannot
alone establish hosted binding compatibility. If initial upload succeeded before
a later check failed, inspect the existing version/deployment and use an ordinary
release for reviewed fixes; never rerun bootstrap or delete/recreate the Worker.

Keep the existing Vercel API/legal addresses, deployment configuration and
credentials until the approved old-build retirement plan is executed. A redirect
or two working APIs does not prove that private request bodies stopped reaching
Vercel. Sentry readiness monitor `10773615` now targets Cloudflare `/ready` and
normal checks pass. GitHub notification delivery is verified; Sentry Cron
failure/missed-backup delivery remains open. The
[phase handoff](../handoffs/phase-15-cloudflare-api.md#current-status) records final
evidence. Complete all required approvals and legal-artifact preflight before
the prepared coordinated Vercel retirement, Cloudflare publication/verification
and ASC/EAS URL update. Anthony accepts the brief legal-URL gap under the
[October 31 decision](../DECISIONS.md#october-31-local-recovery-key-custody-and-coordinated-cutover);
no legacy redirect remains and the final Cloudflare-only notice follows the end
of Vercel's roles. Ship
an approved TestFlight build only as part of the separately authorized cutover.
Keep Phase 14's privacy and physical-device acceptance gates open.

## Run a code-only release

1. Complete the applicable checks and obtain the specific Git permissions in
   [AGENTS.md](../../AGENTS.md). Publish and merge reviewed source, require its
   latest successful Foundation **main push**, and create the reviewed tag under
   the owner's authorization. PR-only CI does not substitute for that run.
2. On `main`, dispatch **Staging API release**, choose `deploy`, and provide that
   existing tag. Leave `migration_plan_sha256` empty. The workflow resolves the
   tag to a commit reachable from main and checks out that exact SHA after review.
3. Review the source and operation, then approve the protected environment job.
   Provider credentials are available only to its release step.
4. Inspect the actual run, version/deployment receipt and public readiness before
   recording hosted acceptance. A failed or cancelled run is not a release receipt.

The database guard verifies the hosted target, restricted role, trusted TLS and
complete applied Drizzle-history prefix. Edited hashes, missing checkpoints,
future migrations and pending SQL stop a code-only release. The same PostgreSQL
session advisory lock remains held through database checks, candidate build,
probes and promotion. GitHub also serializes these jobs without cancelling an
active release.

## Candidate and promotion safeguards

Pinned Node/npm and `npm ci` prepare the reviewed dependency graph before provider
credentials are exposed. Wrangler **4.155.0** is pinned in the API development
manifest and root lockfile. It performs only a local `deploy --dry-run` build in
this lane. Its mutation retry behavior is not used for uploads or promotion.

The builder resolves contracts to tracked sources, so an ignored `dist` directory
cannot supply release code. It inspects esbuild's actual inputs against tracked
production paths, installed dependencies and known Node builtins, and refuses
unexpected output modules, operator scripts, fixtures, environment files or keys.
Only the inspected `worker.js` bytes are uploaded; source maps and private build
configuration are not. The public receipt includes the bundle's SHA-256.

The runner sends one multipart [version upload](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/create/)
with strict secret inheritance. That creates an immutable candidate without
changing the serving deployment. Existing approved non-release bindings must
survive exactly; secrets remain provider-held. Readback must identify the exact
returned version, expected bindings and reviewed source/run identity. The
baseline must remain unchanged throughout candidate preparation and probes.

The candidate's [version URL](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/)
and then its public origin must pass:

- `/health` and `/ready`: exact JSON contracts, HTTP 200, no-store, generated
  request ID, reviewed `x-justgo-source-sha`, and `x-justgo-environment: staging`.
- Unauthenticated journal and completion-history reads: HTTP 401 with the typed
  error and matching generated request ID. Probes create no account or writing.

Probes carry no user credentials, follow no redirects and bound response sizes.
A 20-second deadline covers each provider request/probe. Provider failures are
redacted, and losing the database lease aborts active work. Immediately before
promotion, the runner rechecks baseline/latest-version identity and Hyperdrive
configuration, then verifies the advisory lock in the **same database session**.

Promotion is one account/Worker-bound
[deployment POST](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/)
assigning 100% of traffic to that candidate version. It is never retried or
redirected, and no force/rollback flag is used. A failed or lost POST response
still leads to readback, not a second mutation. At most 30 deployment reads, two
seconds apart, must resolve to the exact candidate. Only the unchanged baseline
is accepted while waiting; any other version fails closed. The candidate's
source/run bindings and public health/readiness/auth probes then establish the
result. Temporary build files are removed on success and failure.

## Pending migrations and recovery evidence

Choose `migrate-deploy` only after reviewing the exact pending SQL and its printed
plan digest. The `staging_migration_plan` record contains migration names, applied
history digest and pending-plan digest. A failed code-only run may provide this
preparation information; it does not authorize migrations. Application migrations
retain Drizzle history and one transaction for the pending plan. Provider-owned
Auth helpers, role provisioning and retention-job SQL remain separate operator
work; do not route arbitrary SQL or `supabase db push` through this lane.

`migrate-deploy` requires the matching `migration_plan_sha256` and an actual
owner-reviewed `STAGING_RECOVERY_ATTESTATION` binding:

- `version`, `project`, exact `sourceSha` and `previousApiSha`;
- `historyDigest`, `planDigest` and `backupSha256`;
- `backupVerifiedAt`, `restoreVerifiedAt`, `ledgerVerifiedAt` and `expiresAt`;
- verified off-Mac copy, current deletion/epoch/Auth ledger, isolated restore and
  backward compatibility with the previously deployed API.

Verification timestamps must be within the preceding 24 hours and not in the
future. Restore/ledger verification must not precede backup verification. Expiry
must be future and no later than 24 hours after backup verification. Never create
placeholder approval values or infer these booleans from a successful upload.

Encrypted R2 database/ledger receipts and the isolated restore procedure in
[Cloudflare backups](CLOUDFLARE_BACKUPS.md) supply evidence for this attestation
once the actual arrangement is accepted. The
[backup restore checklist](FOUNDATION.md#backup-restore-checklist) remains the
reopening boundary. An hourly ledger copy cannot establish deletions/revocations
made after that copy; a current writer-fenced ledger must cover application and
Auth changes. If that state cannot be recovered, keep restored writers closed.
The local restore intentionally returns `writersMayOpen: false`.

Synthetic app/Auth rehearsal does not prove actual Supabase Auth schema, ACL,
role, extension or provider restoration. Those prerequisites and the encrypted
R2 object's actual retrieval/decryption remain operational acceptance evidence.
Open recovery gates block pending hosted migrations; they do not block a
code-only release when live migration history already matches.

## Failures and uncertain outcomes

Earlier release `41215593308` for source `08aa805`, tagged
`staging-cloudflare-2026-10-31`, failed with
`STAGING_PROMOTION_UNCONFIRMED` after promotion was attempted. Subsequent stable
read-only proof verified deployment `388bd042-ae25-4fc6-95dc-6c32f62461a0`, serving
version `830444c8-6e59-42c6-bfa9-97bfae1c6309` at 100%, exact source/run bindings,
health/readiness 200 and unauthenticated private guards 401. That run remains failed;
its exact inner cause is not established. No retry, rollback or second promotion
was performed for that incident. The later successful release above is a separate
ordinary release.

Failures preserve the database guard's existing reason and validated SQLSTATE,
plus a code only for branded runner failures. Provider text cannot supply a
trusted code. Before promotion, candidate/probe failures leave serving traffic
unchanged, but inspect actual deployment state before retrying. A failed version
upload has an uncertain object-creation outcome and may leave an undeployed
version; do not automatically upload again or delete it.

Worker startup fallbacks retain their redacted bodies and omit release identity.
The optional `x-justgo-startup-stage` header contains only a fixed code location:
`configuration`, `reporter`, `database` or `composition`. It contains no exception
or binding data, and is absent after app startup, including ordinary readiness
failures. Release probes distinguish failed health/readiness from a successful
response with the wrong source identity. These diagnostics identify a boundary;
they do not establish the underlying cause or authorize promotion.

After promotion is attempted, failed readback, public probes, receipt writing or
cleanup reports `STAGING_PROMOTION_UNCONFIRMED`. Inspect deployment/version IDs,
source/run bindings and public health/readiness before deciding the outcome.
The same mutation is never automatically repeated. These diagnostics authorize
no rollback or further deployment.

Successful pending migrations may already be committed when API deployment
fails. The `staging_database_verified` event distinguishes database acceptance
from the later provider action. Preserve old/new compatibility and repair
forward; never automatically downgrade schema, restore a snapshot, delete a
candidate or roll back traffic across a schema change. Preserve accepted writes
and current deletion/revocation state in any separately approved repair.

Public uptime, bounded route timings and active-version CPU readbacks are recorded
in the handoff. Anthony chose to retain Workers Free after reviewing Paid pricing;
the measured public-check CPU exceeds its budget and suitability remains open.
Sentry failure/missed-backup delivery, full-workload latency/CPU, DPA/privacy suitability,
old-build traffic retirement and device acceptance remain separate Phase 15/14
gates. Local release tests do not close them.
