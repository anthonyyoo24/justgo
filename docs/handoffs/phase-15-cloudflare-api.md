# Phase 15 — Cloudflare API and encrypted recovery

## Current status

**Local implementation prepared; Phase 15 remains in progress.** Anthony approved
creation of the empty private R2 bucket and the seven-day Cloudflare setup token;
both are created and verified. Changes are prepared on local branch
`codex/phase-15-cloudflare`. Anthony subsequently authorized pushing this branch and opening a pull request;
merge and hosted release remain separately gated. No hosted API deployment,
real-data backup, notice publication, mobile release or Vercel retirement occurred. Build 5 and its
deployed Vercel API remain the current hosted release. This handoff does not close
external-beta acceptance or the independent Phase 14 privacy/device gates.

## Implemented behavior

- The Hono app replaces Fastify/Pino while preserving contracts, paths, methods,
  status/error envelopes, security/CORS headers, generated IDs, request bounds,
  rate-budget order and allowlisted diagnostics. A shared `app.request` test helper
  retains existing protocol assertions. Node development, database tests and
  journey fixtures run the same Hono app through the Node adapter.
- The Worker creates and closes its pg pool per invocation. Hyperdrive query
  caching must be disabled. Advisory-lock identity transactions use a direct
  restricted-role TLS connection; Cloudflare documents those locks as unsupported
  through Hyperdrive. Both connections must identify the same role/database and
  readiness checks both. The Worker preserves the shared bounded Sentry reporter.
  No application schema, migration, contract or mobile data behavior changed.
- The protected release lane checks source/CI/environment, inspects a fresh
  Wrangler bundle, uploads one no-traffic version, probes its immutable URL and
  promotes once with exact readback. It preserves the migration digest, recovery
  evidence and direct database advisory lock. Unknown latest versions or uncertain
  promotion stop for inspection; no automatic schema rollback is attempted.
  A separate `bootstrap` operation in the same protected workflow handles the
  first Worker with exact source/CI/protection, current migration history and the
  same database lease. It refuses existing Workers and pending migrations. The
  initial conditional upload, route setup and readback receive no automatic retry.
- Nightly app/Auth/migration-journal dumps and hourly deletion/revocation ledgers
  stream through `age` to encrypted files. Uploads require approved policy bytes,
  private R2 bucket/retention checks and PutObject/HeadObject-only credentials.
  The opt-in scheduled workflow cannot activate merely by merging. It uses
  preconfigured Sentry Cron monitors for failure/missed-run evidence.
- The local restore verifies source/file/migration/timestamp evidence, reconciles
  deletion epochs, tombstones, revoked proofs and Auth subjects, and invalidates
  restored sessions. It never reopens an API. A current complete writer-fenced
  ledger is required; hourly copies alone do not solve the post-copy deletion gap.
- Static legal Worker configuration and an approval-gated build are prepared.
  The [exact notice candidate](../legal/CLOUDFLARE_NOTICE_REVIEW.md) is separate
  from the approved/published October 27 source. The proposed transition notice
  names both providers while old builds remain. The beta profile and protected
  build/submit lane target `https://justgo-api-staging.anthonyyoo24.workers.dev`
  and refuse a missing Cloudflare notice approval. Hosted acceptance, legal URLs
  and a new TestFlight binary remain open; installed build 5 is unchanged.

## Invariants and problems worth retaining

Hyperdrive's virtual connection string includes `sslmode=disable` on its
platform-owned `*.hyperdrive.local` transport. Accept that exact virtual parameter
only; keep verified TLS on the actual database origin and direct lock connection.
Generic connection-string query overrides remain rejected. Match the same decoded
route path as Hono when selecting direct transactions, including encoded static
segments; otherwise a valid auth route can accidentally reach Hyperdrive's
unsupported lock path.

Hono defaults differ from Fastify for trailing slashes, malformed encodings,
empty JSON, CORS preflights and header serialization. Explicit regressions cover
these boundaries, including HEAD and Node connection deadlines. Existing strict
validation and early rejection of private legacy PATCH bodies remain intact.

Do not reuse the obsolete 19-migration backup runner. The new tooling checks the
current registered chain. The synthetic Auth fixture establishes application
reconciliation, not recovery of Supabase's actual roles/extensions/ACLs. R2
temporary credentials expire and require an owner-operated renewal policy; the
broad parent credential never belongs in CI. Locks can be changed by a separate
administrator and lifecycle deletion is asynchronous.

The backup connection accepts the verified Supabase session-pooler format only
with an approved `sourceProjectRef`, exact host/database/port and project-qualified
login; the connected role must still be canonical `justgo_backup`. Pooled receipts
include the project reference to distinguish projects sharing a pooler. Actual
managed Auth grants and restoration remain unverified; reapply the tracked private
managed-session helper as part of isolated provider restoration.

## Verification

Final local evidence was collected October 28, 2026. Focused HTTP,
release and backup regressions preceded the consolidated checks. Heavy checks
ran sequentially. Unchanged suites are reused after narrow test/config repairs;
coverage execution supplies unit/database/migration-suite evidence without
rerunning those suites through overlapping root wrappers.

- Online Expo Doctor: 20/20 passed; no native dependency version changed.
- API production dependency audit: zero vulnerabilities in 31 locked entries.
- Actual Wrangler candidate dry-run and input inspection passed.
- Actual workerd smoke passed: startup, both-connection readiness, authenticated
  read/write, idempotent completion and 401 envelope. Owned fixtures/processes
  were removed.
- Actual local pg_dump → age → restore/reconciliation rehearsal passed, including
  later deleted/missing owners, epochs/tombstones, revoked recovery/session proofs,
  erased synthetic Auth subjects and idempotent replay. Temporary databases,
  role, key and ciphertext were removed.
- Contracts build, all workspace/journey typechecks and formatting passed. Lint
  had no errors (167 existing warnings). Architecture/tooling ran 416 tests;
  a strict-JSON legal-config failure was corrected and both affected legal
  tests then passed. Workflow syntax passed `actionlint`.
- Coverage suites passed: mobile 1,752 tests, contracts 35 and API 409 (including
  real local database and migration rehearsals). An invalid date-less input in
  the new routing regression was corrected, then API coverage was rerun. The
  aggregate and critical coverage floors passed without threshold changes.
- All 50 saved API-consumer browser journeys passed against guarded loopback
  fixtures. In-app browser verification separately confirmed the local static
  legal Worker's Privacy/Terms layout and links; an unknown route returned 404.
  This checks hosting behavior using existing notice content, not publication
  or approval of the proposed notice.
- Subsequent setup fixes passed focused checks: 65 bootstrap/provider/release
  tooling tests, 12 API release-guard tests, 14 diagnostic tests, 14 backup tests
  and 33 beta/workflow tests. The changed beta test fixture was then checked
  separately. API typecheck, scoped lint/format and workflow syntax passed.
  These checks cover the new bootstrap, pooler identity and beta-target changes;
  unchanged application suites were not repeated.
- Hosted CI, actual Hyperdrive/CPU, scheduled R2 copies/expiry, real hosted
  Auth restore and signed-device checks remain unverified. The root `check` and
  `test:db` wrappers were not repeated: the constituent static/Doctor and
  coverage suites above supplied their local checks without duplicate execution.

No app UI rendering or native dependencies changed. API consumer journeys and the
static legal-host check are separate from native evidence. The complete file lists
in changed directories were reviewed; their responsibility groups needed no moves.
Ordinary diagnostics remain in ignored
`.local/` storage.

## Approval and acceptance register

Authenticated account inspection on October 28 confirmed account
`52662d8ba7ae983237860a1719c66a1e` after Anthony signed in himself. Workers is
Free (100,000 requests/day, 10 ms CPU/request); no Workers applications or
Hyperdrive configurations exist. R2 is already enabled, with one unrelated bucket
and $0.00 billable usage in the displayed period. Its contents were not opened.
The account's Worker subdomain is `anthonyyoo24.workers.dev`. Anthony separately
approved the empty private `justgo-staging-backups` bucket. It was created with
Standard storage and automatic Eastern North America placement selected. The
resulting bucket page confirmed Standard storage, Public Access Disabled and no
objects. Anthony then approved `justgo-staging-bootstrap`, an account token with
Workers Scripts Write and Hyperdrive Write, saved only in an ignored mode-0600
local file. API verification confirmed it active, expiring November 4 at 23:59:59
America/Toronto (`2026-11-05T04:59:59Z`), and confirmed the account still has no
Workers or Hyperdrive configurations. No upgrade or backup was created.
Anthony subsequently approved adding Account: SSL and Certificates Write to the
same token with its November 4 expiry unchanged. The public Supabase Root 2021 CA
was uploaded as `justgo-supabase-root-2021` (certificate ID
`ecffd548-d776-4ea0-8a97-ef4610289ed6`). Provider readback confirmed the CA metadata
and exact certificate fingerprint. This prepares verified database TLS; it does
not create a Hyperdrive connection or deploy the Worker.
Retention/lock configuration and real-data copying remain unapproved.
Account access is verified; it does not establish the legal customer or resolve
the recorded DPA/private-processing approval.

An `age` identity was prepared locally with restrictive permissions and a
synthetic encrypt/decrypt roundtrip passed. It is not yet an independent offline
primary/recovery copy. Existing runtime/migrator session-pooler credentials were
read-only checked as their restricted roles. Vercel exports protected settings as
`[SENSITIVE]`; the existing Auth secret was retrieved from the signed-in Supabase
dashboard and saved in a protected ignored file. The current identity rate key
and beta grants/window remain unresolved; never substitute export placeholders.
No existing credentials were rotated.

| Item                       | Prepared result / remaining gate                                                                                                                                                                                                                                                                    | Owner                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Account and DPA            | Public v6.4 review retained. Anthony signed in; account, Free plan and existing R2 activation verified. Legal customer and DPA/private-processing approval remain open.                                                                                                                             | Anthony confirms account and any binding acceptance before setup/private processing.                                  |
| Services, costs and budget | Workers Free remains starting choice. CPU/p50/p95, queries/connections and R2 storage/operations require hosted measurement; no paid plan or payment method enabled.                                                                                                                                | Implementation owner measures; Anthony approves setup/spending and alert ownership.                                   |
| Retention and deletion     | Proposed seven-day database/ledger retention and locks, lifecycle expiry with actual lag disclosed; exact policy and bucket permissions unapproved.                                                                                                                                                 | Anthony/privacy owner before real-data copying or notices.                                                            |
| Recovery guarantees        | Proposed 24-hour ordinary-write RPO and unmeasured four-hour RTO; reauthentication after restore. Missing post-copy ledger keeps writers closed. Independent gap-free ledger recovery remains an open blocker.                                                                                      | Anthony accepts tradeoff or approves another durable deletion design; release owner proves current app/Auth recovery. |
| Keys and restore access    | Local age identity and synthetic roundtrip prepared; independent offline primary/recovery locations, access and retrieval unverified. Derived upload credentials renew by day five; parent stays offline.                                                                                           | Anthony designates custody and operator before activation.                                                            |
| Release/bootstrap          | Protected first-deployment and ordinary release lanes are local. Setup token verified through November 4. Hyperdrive, complete runtime bindings, Git publication/merge and reviewed hosted release/monitor evidence remain open. Conditional initial-upload behavior still needs provider evidence. | Anthony gives the specific Git/release permissions; implementation owner executes and verifies.                       |
| Old builds and Vercel      | Proposed retirement within seven days after replacement acceptance; not an approved date. No private-traffic cutoff proof yet. Old config/credentials remain.                                                                                                                                       | Anthony approves new TestFlight build/upload and retirement after phone acceptance.                                   |
| Notices/disclosures        | Exact Cloudflare/R2/cross-border/retention draft prepared; current public source and Apple answers unchanged.                                                                                                                                                                                       | Anthony/privacy owner approves final text/date and publication.                                                       |
| Phase 14 carry-forward     | Supabase sensitive-data/consent/provider-copy review, Sentry/Apple diagnostic entries/post-trial scope, physical-device/recovery/accessibility dispositions and external cohort/dates remain open. Deliberate crash skipped, simulator CI deferred, Vercel contact declined.                        | Existing Phase 14 owners; no gate is closed by this port.                                                             |

Continue with [server releases](../operations/SERVER_RELEASES.md),
[backup setup/recovery](../operations/CLOUDFLARE_BACKUPS.md) and the
[cutover checklist](../operations/CLOUDFLARE_CUTOVER.md). The external free beta
still waits for Phase 15 acceptance and the independent Phase 14 decisions.
