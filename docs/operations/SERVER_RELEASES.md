# Staging API and database releases

The manual [Staging API release workflow](../../.github/workflows/staging-api.yml)
releases the existing JustGO staging API and, only when separately selected,
reviewed application-schema migrations. It does not create another host, upgrade
a provider plan, publish a mobile build, or run simulator tests. Workflow source
and local tests do not establish a successful hosted release; inspect the actual
run for its exact reviewed source before recording deployment acceptance.

## Fixed target

| Setting                  | Required value                                                                    |
| ------------------------ | --------------------------------------------------------------------------------- |
| GitHub repository        | `anthonyyoo24/justgo`                                                             |
| Workflow branch          | `main`                                                                            |
| Protected environment    | `justgo-staging`                                                                  |
| Sole required reviewer   | Anthony, GitHub user `51426358`                                                   |
| Deployment branch policy | Exactly one branch policy, `main`; no tag/wildcard policy                         |
| Vercel project           | `justgo`, `prj_j3ubtzyuYsCbpuGjKNmm5dLB8YZB`                                      |
| Vercel team              | `team_fAS7k1lpUEvk1jtNAz0SJhnq`                                                   |
| Vercel scope             | `anthony-youngshin-yoos-projects`                                                 |
| Public staging API       | `https://justgo-two.vercel.app`                                                   |
| Supabase project         | `kmcpcauaxlgpevkkenwd`, Canada Central                                            |
| Migration connection     | Restricted `justgo_migrator` through this project's session pooler on port `5432` |

The provider's **production deployment slot hosts application-level staging**.
Keep `APP_ENVIRONMENT=staging`, the existing managed Auth/backend configuration,
and Montréal `yul1` API execution. This workflow does not convert the app to a
paid production service. A newly connected Vercel Git integration is rejected;
automatic branch deployments must not bypass this approval lane.

## Credentials and approval protection

Store these only in the `justgo-staging` GitHub environment:

| Secret                            | Purpose                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `VERCEL_TOKEN`                    | Existing-team, project-scoped CLI token authorized for JustGO deployment and metadata reads               |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | An **existing JustGO-project** deployment-protection automation bypass secret for candidate probes        |
| `MIGRATION_DATABASE_URL`          | Separate restricted migrator connection; never the runtime connection or a `postgres` operator login      |
| `DATABASE_CA_CERT`                | Trusted PEM CA for that hosted database; hostname/certificate verification remains enabled                |
| `STAGING_RECOVERY_ATTESTATION`    | Optional reviewed recovery attestation, absent by default; required only when pending migrations will run |

The October 27 setup configured and verified metadata for the four required
environment secrets. The optional recovery attestation remains unset. The initial
project-scoped Vercel token expires **January 25, 2027**; replace it under the
owner's credential authorization before expiry. Configured credentials and local
preflight evidence do not establish a successful hosted workflow run.

The bypass secret must belong to the API project, not the separate legal site.
The helper refuses to proceed when it is absent. Vercel CLI's curl implementation
can otherwise create a bypass token automatically; release probes must reuse an
existing credential instead. Configure/recover that credential through the
owner's approved account setup, never by printing it in a command, log or receipt.

No Supabase Management API token, Auth administrator key or native signing token
is required by this workflow. Runtime database/Auth/Sentry settings stay in the
Vercel server environment. Candidate deployment explicitly sets the public source
identity and `API_SENTRY_RELEASE` to the reviewed commit, avoiding a stale release
label from a previous operator configuration.

The workflow verifies owner-only required review and the exact main-only branch
policy before the protected job and again inside that job. Adding another User
or Team reviewer is rejected because GitHub permits any one configured reviewer
to approve. Preserve solo-owner self-review as configured; these guards do not
replace Anthony's review or the repository's separate Git publishing permissions.

## Run a code-only release

1. Complete the applicable checks and obtain the specific Git permissions in
   [AGENTS.md](../../AGENTS.md). Publish and merge the reviewed source, wait for
   its latest Foundation **main push** run to pass, and create the reviewed tag
   under the owner's authorization. PR-only checks do not substitute for that run.
2. On `main`, dispatch **Staging API release**, choose `deploy`, and provide that
   existing tag. Leave `migration_plan_sha256` empty. The workflow resolves the tag
   to one commit reachable from main and checks out that exact SHA after approval.
3. Review the candidate SHA/operation and approve the protected environment job.
   Provider secrets are available only in its release step.
4. Inspect the resulting run, public receipt and staging readiness before marking
   that source deployed. A failed or cancelled run is not a deployment receipt.

The runner verifies the hosted project, restricted role, trusted TLS connection
and complete applied Drizzle-history prefix. Hash edits, missing checkpoints,
future migrations and pending SQL stop a code-only release. It holds the same
PostgreSQL session advisory lock through the database check, candidate build,
probes and promotion. Concurrent jobs are also serialized by GitHub.

## Candidate and promotion safeguards

Node/npm follow the pinned repository setup. Vercel CLI **64.5.0** and its
transitive graph are pinned by the separate
[tool manifest](../../scripts/release/vercel-cli/package.json) and
[dependency lockfile](../../scripts/release/vercel-cli/package-lock.json).
The protected job runs `npm ci --prefix scripts/release/vercel-cli` before provider
credentials are exposed, then prepends that installation's binary directory to
`GITHUB_PATH`. The root/app install and API upload do not include this toolset.
Weekly Dependabot checks cover both the workspace and this standalone lock.

The isolated tool manifest overrides `tar` to 7.5.22 while the CLI's container
helper pins an older vulnerable patch. This removes the critical archive-parser
DoS and related tar findings without changing the reviewed CLI major version.
See the [node-tar advisory](https://github.com/advisories/GHSA-23hp-3jrh-7fpw).
The October 27 standalone CLI audit still reports 32 upstream findings (20 high,
12 moderate), separately from the root tooling and zero-finding API production
graph. Track compatible vendor repairs before public release; neither a lockfile
nor a clean API audit establishes that all deployment-tool dependencies are clear.

That CLI accepts `VERCEL_TOKEN` without a saved owner login. Project-scoped tokens
can read their project/deployments but cannot read `/user`; the CLI's uncached
`--scope` bootstrap otherwise fails there with `User not found (404)`. For each
invocation, the helper creates a fresh private XDG directory containing only the
fixed nonsecret team/scope mapping, its reverse cache and disabled CLI automatic
updates. It copies no owner profile or authentication file. Backend authorization
still uses the narrow token, and the normal project/team checks remain required.
The temporary config is removed on success/failure, with workflow cleanup as a
fallback. This bootstrap was checked with the project-only token against project
metadata, protected health and `deploy --dry`; it does not broaden that token's
permissions. XDG paths avoid passing `--global-config` to curl, which would
forward that unsupported option instead of using it as a CLI flag.

The CLI's `promote` subcommand also reads team-wide metadata before sending its
project-specific promotion request. Scope caches do not eliminate that extra
lookup. The runner instead sends one authenticated project-bound
`POST /v10/projects/{projectId}/promote/{deploymentId}` through `vercel api`,
using the same fixed project, team and inspected production candidate. The
[promotion endpoint](https://vercel.com/docs/rest-api/projects/point-production-traffic-to-a-given-deployment)
preserves the existing build and uses the configured project-only credential.
`--include --silent` captures only private response headers;
the runner requires documented HTTP 201 or 202 without parsing an empty body.
A successful response may be queued, so the
runner polls the stable alias at two-second intervals, for at most 30 reads,
and requires its exact deployment/source/run identity before public probes.
It accepts the previous baseline only while waiting; another deployment fails
closed. The same database lease remains held, abort cancels the wait, and the
mutation is never retried automatically.

The helper runs from
the checked-out repository root and validates the actual `deploy --dry --json`
upload paths and file hashes against tracked production sources. Preserve
[`.vercelignore`](../../.vercelignore): migrations, operator scripts, tests,
environment files, private keys and local artifacts must not enter the upload.

The candidate command uses `deploy --json --prod --skip-domain`. Its validated
JSON receipt must have `status: "ok"` and a production/READY deployment with its
exact ID and HTTPS URL. Messages and `next` command suggestions are ignored.
REST readback must agree with that receipt and the fixed project/team, region,
reviewed SHA and GitHub run/attempt metadata. A Preview deployment is not used:
promoting Preview can create a different production build.

Before any candidate probes, the stable alias must still resolve to the previous
deployment. The CLI may print an `Aliased` message for a generated project URL;
that message does not establish the state of `justgo-two.vercel.app`.

Candidate probes use `vercel curl` with explicit deployment identity and the
existing bypass secret. Place curl's arguments after `--`. In CLI 64.5.0,
`--non-interactive` is forwarded to curl and fails as an unknown curl option, so
the helper deliberately omits that flag only for this subcommand. It also uses
the subprocess working directory rather than forwarding `--cwd` to curl.
With `--output` and `--write-out '%{http_code}'`, the verified CLI behavior is a
three-digit status on stdout and the response body in the private output file.

The probes require:

- `/health` and `/ready`: exact JSON contracts, HTTP 200, no-store, a generated
  request ID, the reviewed `x-justgo-source-sha`, and `x-justgo-environment: staging`.
- Unauthenticated journal/completion-history reads: HTTP 401 with the safe typed
  error and matching generated request ID. No account is created or modified.

After those checks, the runner rechecks the stable alias and verifies the advisory
lock in the **same live database backend** immediately before promotion. Handled
database error/end events abort active asynchronous provider commands. Only the
inspected production candidate's exact ID is promoted. Public readiness/auth
checks and alias readback then establish the final target. Raw provider errors,
response bodies, credentials and private journal data stay out of logs; temporary
probe files are removed. Public receipts contain only deployment/source/run
identifiers and the upload digest.

## Pending migrations and recovery evidence

Choose `migrate-deploy` only after reviewing the exact pending SQL and its printed
plan digest. The runner's `staging_migration_plan` record contains migration names,
the current applied-history digest and the pending-plan digest. A `deploy` run
with pending SQL stops before deployment; its plan is preparation information,
not migration approval. Do not use `supabase db push` or execute arbitrary SQL
through this lane: application migrations retain the existing Drizzle history and
one transaction for the entire pending plan. Provider-owned Auth helper,
provisioning and retention-job SQL remain separately reviewed operator work.

`migrate-deploy` requires the matching `migration_plan_sha256` input and an actual
owner-reviewed `STAGING_RECOVERY_ATTESTATION`. Its fields bind:

- `version`, `project`, exact `sourceSha` and `previousApiSha`;
- current `historyDigest`, exact `planDigest` and `backupSha256`;
- `backupVerifiedAt`, `restoreVerifiedAt`, `ledgerVerifiedAt` and `expiresAt`;
- verified off-Mac copy, current deletion/epoch/Auth ledger, isolated restore, and
  backward compatibility with the previously deployed API.

All verification timestamps must be within the preceding 24 hours and not in the
future. Restore/ledger verification must not precede backup verification. Expiry
must be in the future and no later than 24 hours after backup verification.
This is an explicit recovery attestation, not an automated backup service.
Do not create placeholder approval values to bypass it.

Current full recovery, off-Mac storage and independently recoverable deletion/Auth
ledger evidence remain open under the
[backup restore checklist](FOUNDATION.md#backup-restore-checklist). The historical
October 21 snapshot predates the current journal/managed-account tables and does
not establish Auth restoration. Supabase Pro remains selected but its purchase
and upgrade are deferred; this workflow does not perform either. Those open
backup gates block pending hosted migrations, not code-only deployment when the
live migration history already matches.

## Failures and uncertain outcomes

Failure records preserve the database guard's existing `reason` and validated
SQLSTATE, plus a `code` only for the runner's branded, closed-vocabulary failures.
A provider error message is never accepted merely because it looks like an
uppercase code. Once promotion has been attempted, command, probe, receipt or
cleanup failures report `STAGING_PROMOTION_UNCONFIRMED`; read back the alias and
runtime identity before retrying. Earlier guard failures retain their specific
codes. These diagnostics do not authorize rollback or further deployment.

Before promotion, a failed candidate/probe leaves the stable alias untouched;
verify its actual target rather than relying on CLI wording. Successful pending
migrations can already be committed when a later API deployment fails. The
`staging_database_verified` event distinguishes the database gate from the
subsequent provider release. Keep old/new API compatibility intact and repair
forward; do not automatically downgrade the schema or restore a snapshot.

A promotion timeout, lost connection, cancellation or failed final readback is an
**uncertain outcome**. Promotion may have been accepted remotely. Read back the
stable alias's deployment ID, exact source metadata and public health/readiness
before deciding what happened. Do not automatically repeat promotion, delete a
candidate, roll back an alias or restore a database. Any repair must preserve
accepted writes and current deletion/revocation state.

Uptime detection, sanitized Sentry email delivery and receipt proof are separate
operating controls. This release workflow and its local tests do not establish
those controls, external-beta admission, private-journal hosting suitability or
the owner-deferred native/device acceptance.
