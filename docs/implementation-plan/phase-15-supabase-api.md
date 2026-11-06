<a id="phase-15"></a>

# Phase 15 — Supabase API migration

**Status:** Planning only, November 2, 2026. Anthony requested this plan and
paused the Cloudflare rollout. Writing this plan authorizes no implementation,
deployment, purchase, account change, Git publication or service retirement.

## Outcome and scope

Move the existing Hono API from Cloudflare Workers to Supabase Edge Functions.
Keep the existing Supabase PostgreSQL database, Auth project, canonical accounts
and stored journals. Start from the current implementation, including accepted
fixes. Do not restore the old Vercel and Fastify code.

The app may remain a portfolio project. The migration must work without assuming
a commercial launch, subscriptions or a Supabase Pro upgrade. A small runtime
compatibility trial comes before the full port and any live cutover.

This plan is the proposed continuation of Phase 15, not an additional numbered
phase. Phase 16 remains billing. The [Cloudflare plan](phase-15-cloudflare-api.md)
and [handoff](../handoffs/phase-15-cloudflare-api.md) keep the earlier scope and
evidence. Their unfinished rollout steps stay paused. Existing Phase 14 privacy,
release and device gates stay open.

| Responsibility              | Planned treatment                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HTTP API                    | Keep Hono, shared contracts, routes, domain services and Node support for tests and local development. Add a thin Supabase runtime adapter.                                                |
| Database and identity       | Keep PostgreSQL, Drizzle, private schemas, migrations, restricted roles, Apple and Google Auth, and account and session ownership. Migrate neither the database provider nor account data. |
| Phone data                  | Preserve local journals, offline writes, guest adoption, account isolation, iCloud and deletion cleanup. Change transport configuration only where required.                               |
| Recovery                    | Keep existing R2 copies, schedules and deletion records until a separately accepted recovery arrangement replaces them. Moving the API does not select Supabase backups.                   |
| Legal pages and diagnostics | Choose their destinations separately. Edge Functions hosting does not automatically move static pages, Sentry checks or build notices.                                                     |

This migration excludes D1 conversion, direct mobile access to private database
tables, a new sign-in system, billing activation, unrelated UI redesign and any
signing or toolchain upgrade.

Preserve the owning [identity](../architecture/IDENTITY.md),
[activity](../architecture/ACTIVITY_DATA.md) and
[app-shell](../architecture/APP_SHELL.md) invariants. Consult
[server releases](../operations/SERVER_RELEASES.md) when adapting deployment.

## Prerequisites and decisions

- [ ] Reconcile the current phase branch, paused recovery-work checkpoint and
      sign-in and UI work before you select the implementation base. Finish and
      verify the duplicate-provider-notification fix and post-deletion sign-in
      and guest regressions. An ongoing investigation is not accepted
      behavior. Preserve unmerged and uncommitted work. Any checkpoint PR, branch
      merge or change to the agreed consolidated-PR workflow needs the existing
      owner approval. This plan creates none of them.
- [ ] Verify current provider configuration, deployed source, installed
      clients, running servers, and backup and alert schedules before you use
      earlier evidence. Pausing a chat does not disable hosted backups. Before any
      future recovery operation, recheck credential expiry and the paused task's
      checkpoint.
- [ ] Identify the existing staging project, intended production arrangement,
      supported client builds and exact source revision. Do not create a
      second project, database branch or paid environment without the applicable
      approval.
- [ ] Resolve the operating choices below before dependent hosted work. Routine
      engineering choices stay with the implementation owner.

| Choice                     | Required decision or evidence                                                                                                                                                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Free or Pro                | Default the trial to local or disposable infrastructure. Reuse the existing Free project only for approved hosted testing. Free-plan pausing and quotas must be acceptable for the intended demo. Pro is not presumed inevitable. Before any purchase, present the actual project count, limits and spend-cap behavior. |
| API address                | Prefer a direct function URL, with safe base-path support in the client. Confirm function name, public path and region. A custom domain, DNS change or retained proxy is a separate choice and may add cost.                                                                                                            |
| Recovery service           | Decide whether to keep encrypted R2 backups, adopt paid Supabase backups, or use a justified combination. Keep the current protection until the replacement passes restore, deletion and expiry evidence. Keep recovery targets and the accepted fail-closed beta limit.                                                |
| Notices and static hosting | Reconcile actual Supabase, retained Cloudflare and R2, Sentry and any remaining Vercel roles. Reuse the coordinated owner-only cutover policy. Reassess it if external users or supported builds have changed.                                                                                                          |

## 1. Prove runtime compatibility first

- [ ] Package the shared Hono app and `@justgo/contracts` for the actual Supabase
      Deno runtime. Verify workspace imports, existing `.js` specifiers, generated
      contracts, dependency versions, `pg` and Drizzle, Node APIs and inclusion in
      the deployment bundle. Do not copy contracts or rewrite domain services to
      work around a packaging failure. Pin any newly required tooling and verify
      its commands against current documentation.
- [ ] Supply validated runtime configuration explicitly. Supabase's injected
      environment and Deno secret access must not silently select Node's local
      defaults, development legal routes, the wrong project or an administrative
      database connection. Keep credentials on the server and out of bundles, logs
      and test receipts. Supabase reserves the `SUPABASE_` secret prefix, so map a
      permitted custom secret name into the existing `SUPABASE_AUTH_SECRET_KEY`
      configuration field. Select the intended injected publishable or admin key
      explicitly. Do not assume those runtime values match the names or shapes of
      the existing Node environment.
- [ ] Connect over verified TLS as `justgo_runtime`, including required CA
      handling. Prove that a supported direct or pooler connection preserves
      complete transactions, transaction-local account context, locks, rollback
      and the private live-session helper. Keep migrations on the separate
      migrator role. Never substitute a privileged `service_role` or admin Data
      API client for the restricted SQL connection.
- [ ] Run the actual function locally against disposable PostgreSQL, then against
      an explicitly approved hosted candidate. Prove health, readiness, guest
      catalog access, a protected operation and rejected cross-account access.
      Readiness must confirm the expected database, role and helper, and exact
      release identity.

**Trial checkpoint.** Record concrete compatibility gaps, remaining effort and
measured behavior. If the runtime cannot preserve the existing security and
transaction boundaries, stop the port and present the incompatibility. Keep the
current serving API and database intact. The trial does not require a paid
upgrade.

## 2. Preserve authentication, transport and HTTP behavior

- [ ] Configure the Supabase gateway so these requests reach their existing
      handlers: public health and guest routes, retained opaque legacy proofs, and
      exact retries of account-deletion receipts. Default gateway JWT validation
      can reject them before the app runs, including retries after Auth deletion
      or token expiry. Gateway configuration must not weaken protected-route token
      verification, live-session checks, ownership or revocation. Test the real
      gateway as well as the Hono handlers.
- [ ] Preserve private-schema RLS, the canonical JustGO owner mapping, atomic
      account context and idempotent deletion receipts. Keep the separate Auth
      administration capability limited to its existing deletion responsibility.
      The plan assumes no schema or grant change. Any demonstrated need gets its
      own migration, security review and database regression coverage.
- [ ] Fix the client's URL assumption deliberately. `lib/network/http.ts` reduces
      the API URL to its origin and permits only `/v1/` paths. A Supabase URL has
      `/functions/v1/<function>` before the API path. Support the chosen base path
      without losing the origin and path fence, forwarding credentials to another
      origin, accepting path traversal, or breaking queries and cancellation.
      Update origin-scoped access snapshots and deployment and fixture
      allowlists together. Do not clear saved journals to resolve an address
      change.
- [ ] Preserve request bounds, CORS and preflight, typed errors, request IDs,
      no-store and security headers, `Retry-After`, health, readiness and OpenAPI.
      For identity rate limits, find a trustworthy gateway-provided client
      address. Do not trust arbitrary forwarded headers, and do not group all
      users under the Node adapter's loopback fallback.
- [ ] Keep network and database timeouts and pool use bounded. Close failed and
      cancelled work, keep account context inside its request, and test concurrent
      users and connection exhaustion. Share a pool only if the target runtime's
      supported lifecycle and isolation are demonstrated.

## 3. Verify the app and realistic workloads

- [ ] Exercise guest entry, Apple and Google sign-in and switching, duplicate Auth
      notifications, guest-source adoption, logout, local retention and returning
      to the same account. A different account must never receive earlier writing.
- [ ] Exercise save and load, two-device reconciliation, lost responses and
      duplicate retries, and reconnecting queued offline writes after an
      API-address change. Also exercise complete history, import and export, and
      account and data deletion. Verify that receipt retries after Auth erasure,
      stale uploads and iCloud cleanup cannot resurrect deleted content. Keep the
      same database and stable IDs throughout.
- [ ] Measure cold and warm requests, peak concurrent users, database connections,
      actual query counts, Auth verification calls, response sizes and errors.
      Include the existing 4 MiB sync bound and representative large histories
      within the existing client deadline. Low monthly traffic does not prove that
      a single large operation fits the function's CPU and memory limits.
- [ ] Verify the configured execution region against the database and actual
      response metadata. Supabase hosting alone does not guarantee nearby
      execution, faster responses or greater database capacity.
- [ ] Record a cost model from observed requests and CPU, authenticated monthly
      users, retained journal versions, storage and egress. Document what quota
      exhaustion, pausing, spend-cap restrictions and provider outages look like
      to the app. The app must preserve accepted local input and useful retry
      feedback through them.

## 4. Privacy, recovery and operations

- [ ] Complete the [provider and consent review](https://github.com/anthonyyoo24/justgo/issues/95)
      for real account journal traffic. Supabase's DPA permits processing of
      sensitive data subject to notice, necessary explicit user consent and lawful
      handling. The DPA is not blanket clearance of the current sign-in
      disclosure. Confirm the actual account agreement, processor locations and
      appropriate user choices. A Free or portfolio app still has those
      contractual obligations.
- [ ] Keep journal text, tokens and request bodies out of function and gateway
      logs, Sentry and evidence. Verify restricted access, retention and deletion
      for application rows, Auth records, backups and operator exports. Preserve
      deletion-ledger replay before reopening a restored database.
- [ ] Preserve the accepted recovery objectives and existing open recovery
      gates. Pro's accessible backup window is not evidence of when every
      provider copy expires. Do not disable R2 schedules, discard ciphertext, revoke
      required credentials or remove deletion records merely because the API
      moved.
- [ ] Adapt deployment preflight, source-bound health and readiness, environment
      isolation, migration and release coordination, rollback records, Sentry
      uptime targets and safe 5xx reporting. Verify actual provider deployment
      behavior, because a function upload may replace serving code immediately. Do
      not assume that the Workers mechanics for uploading and promoting inactive
      versions exist on Supabase. Stage with an isolated candidate name or
      project, as approved, and keep a verified redeployment path for the previous
      serving source.
- [ ] Remove the Vercel credentials and configuration when Vercel API and legal
      hosting retires. If Vercel is still needed, rotate its deployment token
      before January 25, 2027.

## 5. Cut over only after acceptance

1. Review the exact candidate, test evidence, cost and plan choice, privacy
   notices, backup arrangement, mobile API paths and fallback procedure with
   Anthony. Obtain the specific Git, deployment, notice, build and publication
   permissions, and any spending permissions, that the next action requires.
   Earlier Cloudflare approvals do not authorize new Supabase provider actions.
2. Preserve the last known working Cloudflare artifact and configuration for
   recovery. Keep database schema and owner mappings compatible with both API
   versions. Do not roll back the database or resurrect deleted data to recover
   from an API-hosting failure.
3. Coordinate the currently supported Dev and TestFlight clients and any queued
   work. Changing a server setting does not update an installed app's embedded
   URL or notices. Follow the approved sequence for notice publication and builds.
   Do not force a native toolchain upgrade into this migration.
4. Switch only after the approved candidate passes. On the serving endpoint and
   the phone, verify genuine disposable Apple and Google accounts, guest use, save
   and load, deletion retries, response source identity, alerts and backup
   continuity. Never send local fixture proofs to a hosted API.
5. If required behavior fails, return routing, configuration or clients to the
   verified compatible API. Keep accepted writes, account mappings and deletion
   records. A mobile rollback may need a compatible app update, so document that
   limitation before switching. Retire Workers, Hyperdrive or old origins only
   after acceptance and explicit approval. Leave the retained R2 and static roles
   intact.

## Verification and completion

The implementation owner integrates the migration and verifies its combined
behavior. Any delegated work has separate file ownership and focused checks.
Heavy commands run one at a time. Use the [check matrix](../../AGENTS.md#choosing-checks)
for the current commands rather than inventing a second test policy.

- During implementation: affected API and mobile regressions and workspace
  typechecks, repository lint, actual local function smoke and relevant saved
  journeys. Database-boundary checks use `npm run test:db` against loopback
  `justgo_test`. Changes at the contracts or tooling boundary also require the
  root contracts build and all workspace typechecks.
- At phase closeout or publication: `npm run check`, aggregate
  `npm run test:coverage`, database checks and applicable saved journeys and
  exports. Reuse overlapping valid evidence as the check matrix allows. Once
  publication is approved, check hosted CI for the actual published candidate.
- After automated checks: grouped in-app browser verification, then actual
  signed-device, provider, offline and deletion acceptance. Browser mocks and
  local Deno runs do not prove hosted gateway behavior or iOS Keychain and iCloud
  behavior.
- At implementation completion: update implemented architecture, operations,
  fixture and build documentation, and the PR descriptions together.
  Review changed directories, and account for every earlier finding and open
  gate. Retire eligible tooling and worktrees only under the standing
  preservation and permission rules.

**Completion requires** all of these:

- The serving API and supported phone builds use the accepted Supabase
  configuration.
- Ownership, retries, deletion and local retention are preserved.
- Cost, privacy, recovery and operational checks have actual evidence.
- Remaining work has an explicitly approved owner or deferral.

A paused or abandoned Cloudflare acceptance item is not a passing Supabase result.

Writing this document requires scoped formatting and link checks only. The
commands above describe future implementation verification. This plan does not
run them.

## Provider references

Reviewed November 2, 2026. Before implementation, recheck the changelog, runtime
and tool versions, pricing and account configuration. Figures are in USD and
illustrative. They are not approved purchases or promised workload capacity.

- [Functions and runtime](https://supabase.com/docs/guides/functions),
  [Hono routing](https://supabase.com/docs/guides/functions/routing),
  [gateway authentication](https://supabase.com/docs/guides/functions/auth-headers),
  [database connections](https://supabase.com/docs/guides/functions/connect-to-postgres)
  and [environment variables](https://supabase.com/docs/guides/functions/secrets).
- [Runtime limits](https://supabase.com/docs/guides/functions/limits): currently
  256 MB of memory and 2 seconds of CPU per request, including on Pro. Verify
  these limits against actual sync, import and export behavior rather than
  relying on monthly allowances.
- [Pricing](https://supabase.com/pricing) and
  [function billing](https://supabase.com/docs/guides/functions/pricing): Free
  includes 500,000 function invocations a month, a 500 MB database and 5 GB of
  uncached egress. Pro starts at $25 a month for one Micro project and includes
  2 million invocations, then $2 per extra million. A second Micro project adds
  about $10. Auth on Pro includes 100,000 monthly active users, then $0.00325 per
  extra user.
- [Project pausing](https://supabase.com/docs/guides/platform/free-project-pausing),
  [cost controls](https://supabase.com/docs/guides/platform/cost-control) and
  [database scaling](https://supabase.com/docs/guides/platform/compute-and-disk):
  Free inactivity can pause a project. Pro spend caps can restrict covered usage
  and exclude compute upgrades, and they do not automatically add database CPU or
  RAM.
- [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum),
  [terms](https://supabase.com/terms) and
  [data residency](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq).
  HIPAA-regulated PHI has a separate BAA requirement. Consumer journaling is not
  automatically HIPAA-regulated. Pro does not itself resolve consent or erasure.
