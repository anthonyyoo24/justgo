# Phase 15 — Cloudflare API and encrypted recovery

**Superseded.** Anthony retired the Cloudflare Workers rollout in favor of
Supabase Edge Functions. The [Supabase plan](../implementation-plan/phase-15-supabase-api.md)
owns Phase 15 now. This handoff is a record of what happened on the Worker, not
current status. PR #73 merged the rollout branch as `50194ee` on November 4, 2026.
The backup and recovery evidence below still applies to the R2 backups.

## Current status

**Phase 15 remains in progress. Local phase source `a082087` is active on staging
at 100%, including the tested static security-policy optimization. Genuine
Google/Apple phone and native iCloud read-back/cleanup checks passed. Manual
main-workflow copies, real missed-run email delivery and verified manual catch-up
passed. Two new-clock hourly ledger runs passed; the first nightly database slot,
actual expiry, complete recovery and sustained
Workers Free suitability remain open. Final TestFlight, notices and coordinated
cutover remain separate gates. Changes stay local for one phase PR.**

The [consolidated rollout review](../checks/phase-15-rollout-review.md) records the
hourly schedule/monitor evidence, overnight follow-up, credential proposal,
reviewed recovery preparation and remaining approvals.

The latest guarded code-only release deployed source
`a082087b74c417640baf87e3b0916accf5c677be`, version
`acf11ecb-afa5-4b5f-87fd-b446186f6794`, deployment
`f7cff9f0-045b-460f-b373-eb7f6623fc83`, local run
`local-d4c0b028-d121-4638-971d-03b3f70f1385` at November 2 19:53:50 UTC.
Full `check`, coverage including database/migrations, Workers smoke and selected
journeys passed before upload/promotion; exact candidate/public/provider readback
passed. The first attempt stopped before upload because phone Metro occupied
the journey port. After stopping that owned server, all eight selected journeys
passed. Another task restored Metro on port 8081 from its `ui-polish-review`
checkout; actual served iOS Cloudflare configuration was verified. Leave that
server alone. No Git publication, migration, native build or paid change occurred.
The safe release receipt is under `.local/phase15-cloudflare/local-releases/`.

The prior Google sign-in release remains its historical acceptance record.

The code-only local release deployed version
`b1555a49-4d53-49bc-a046-f981602c3a29` in deployment
`e68527d0-e085-428f-9d0c-4d37ebf545ab`, source
`762c12841ea5466e3c9dd756bdcf39c451227dc7`, local run
`local-e3b84f81-7a1d-412b-b875-9d5c9f03bf21`. It reuses the existing operator
connection from protected `.local/staging.env`; no password reset, new grant or
GitHub secret change was needed. Both managed Auth verification and minimal
Sentry delivery now use supported manual redirects and reject redirects without
forwarding credentials. Workerd rejected the previous `redirect: 'error'` setting
before sending either request. No application schema or native binary changed.
Full local `check`, aggregate coverage (including database/migration tests),
Workers smoke and the selected provider-sign-in/sync/deletion journeys passed.
The ignored receipt is
`.local/phase15-cloudflare/local-releases/local-e3b84f81-7a1d-412b-b875-9d5c9f03bf21.json`.
The same installed Dev app subsequently passed the owner's genuine Google
sign-in retry and the phone checks below.
This successful local release supersedes the serving `d66c42d` baseline below;
the earlier GitHub run `41346805790` remains failed and is not relabeled successful.

PRs 63–72 are merged. PR 70 merged as `e551604`; PR 71, reviewed head `d0e605e`,
merged as `0753986bc9ebcfd654e901a1ef25b7fb64c5ff92`. Both PR heads passed all
seven CI checks and CodeRabbit reported no actionable issues. Combined main
[CI 41229431683](https://github.com/anthonyyoo24/justgo/actions/runs/41229431683)
passed all seven checks.

Anthony approved publishing tag `staging-cloudflare-2026-10-31-2`: annotated
object `bd094882986c3040541e6665232714274b900c55` peels to `0753986`.
Approved code-only [release 41230382940](https://github.com/anthonyyoo24/justgo/actions/runs/41230382940)
succeeded. Version `e9356054-82bc-4fcb-a700-80240f989a01` was active at 100% in
deployment `3bf9db92-3e16-4616-8dd7-fac6a5707579`, with exact source/run bindings
`0753986` and `41230382940/1`. Provider deployment readback was stable before and
after the public measurement; health/readiness were 200 and both unauthenticated
private-route probes were 401. The release and measurement receipts are ignored
`.local/phase15-cloudflare/rollout/iphone-readiness/release-0753986.json` and
`public-latency-0753986.json`. The November 1 release below supersedes this baseline.

The previous `08aa805` release 41215593308 reported
`STAGING_PROMOTION_UNCONFIRMED`, but stable readback verified its version
`830444c8…` serving in deployment `388bd042…`. That historical workflow remains
failed; its hidden failing subcheck is unknown. Its receipt is preserved in
`.local/phase15-cloudflare/rollout/pr68-review/staging-promotion-readback.json`.
The new successful release supersedes its current deployment status. No retry or
rollback of that uncertain promotion was performed, and the old four-version
`c5af7c5b…` incident opt-in must not be reused.

The earlier `742f3e0` candidate passed startup but failed readiness without
promotion. Read-only probes and verified session-pooler checks isolated the direct
custom-CA compatibility gap; they did not record the Worker's hidden inner
readiness error. Workers' direct socket path cannot apply the Supabase custom CA,
whereas Hyperdrive supports the verified origin certificate. Diagnostic receipts
remain in ignored `.local/phase15-cloudflare/rollout/worker-readiness/`.
[PR 67](https://github.com/anthonyyoo24/justgo/pull/67), `a0c770a` merged as
`8fa11a6`, removed that unsupported managed direct path. First Auth-subject mapping
uses its existing unique key with complete rollback and at most one fresh attempt;
canonical-owner locks, live-session checks and exact legacy proofs remain.
Existing-proof recovery no longer takes a missing-row creation advisory lock.
Local legacy fixtures and the release migrator retain separate direct connections.
No application schema, migration, grants or public API contract changed.

Full local checks, coverage floors, actual local Workers smoke, concurrency tests,
cold web/iOS JavaScript exports, the saved exported-web smoke and in-app navigation
support the reviewed fixes. They do not replace hosted managed-account or
physical-device evidence. The disposable database and preview server are stopped;
TestFlight has not been replaced. Its precompile notice guard still rejects the
tracked October 27 Vercel notice; the approved Cloudflare candidate has a pending
effective date and still requires reconciliation with the verified backup operating facts below. Do not bypass
that guard or assume an update isolates existing phone/account data. The hosted
Mac build/upload lane is prepared; the separate early Dev run below is dispatched.

Sentry uptime monitor `10773615` checks Cloudflare `/ready`; normal responses
pass with existing timing, assertions, sampling disabled and alert routing.
PR 70's matching manual GitHub diagnostic is merged. Its actual
[run 41229561145](https://github.com/anthonyyoo24/justgo/actions/runs/41229561145)
passed on `0753986` with notification testing disabled. Under Anthony's specific
approvals, GitHub Actions failure-only email notifications and the repository's
All Activity watch were saved and verified after reload. Final intentional test
[41233869638](https://github.com/anthonyyoo24/justgo/actions/runs/41233869638)
failed as designed, and Anthony confirmed receipt of its email on October 31.
This verifies GitHub notification delivery, not Sentry Cron delivery or an app
outage. The destination remains the existing owner address.

PR 71 preserves closed promotion phases and branded safe cause codes alongside
`STAGING_PROMOTION_UNCONFIRMED`. Its reviewed finalization correction clears a
completed probe phase before summary/cleanup can fail. This changes no promotion,
retry or rollback behavior and cannot reconstruct the old run's lost details.
The same PR defers Supabase admin-client construction until actual deletion,
preserving fail-fast configuration validation, hard deletion, idempotent missing
users, timeout and redacted errors. Hosted CPU acceptance remains open.

Public-only measurements on October 31 used source `0753986`, Toronto client/YYZ
edge, two warmups and 25 sequential samples per route at concurrency one. Current
p50/p95 milliseconds are health 69.13/84.78, readiness 200.41/229.36, guest access
52.89/65.75 and guest challenges 197.16/223.87. All 108 public requests returned 200. Cold behavior, actual placement and managed account operations remain
unmeasured. Earlier Cloudflare/Vercel baseline values remain in ignored
`iphone-readiness/public-latency.json`; different collection times do not establish
an optimization benefit.

The October 31 active-version CPU chart for `0753986` displayed p50 19.23 ms, p90
28.03 ms, p99 30.13 ms and p999 32.02 ms. These dashboard
aggregates include public checks and are not full-workload request quantiles.
They do not establish suitability for the Free plan's 10 ms budget. Anthony
chose to keep Workers Free; no paid subscription was purchased. Bounded,
network-free Node measurements show small configuration/composition costs, but
do not attribute hosted workerd CPU. A guarded local workerd profile identified
per-invocation matcher construction. [PR 72](https://github.com/anthonyyoo24/justgo/pull/72)
introduces a WorkerRouter that
wraps a fresh TrieRouter per invocation, preserving each handler registration once,
Node's default routing and invocation-owned database/service isolation. The local
profiler has a separate explicit command and bounded 30-second capture. Matching captures
remove the targeted matcher hotspot but do not establish hosted CPU savings.
PR 72 merged as `d66c42d3daa2cc990f347fbf674b661845f1c603`; exact main-push
[Foundation CI 41339394813](https://github.com/anthonyyoo24/justgo/actions/runs/41339394813)
passed all seven jobs. Anthony approved tag publication, code-only staging
release and a subsequent compatible Dev compile/upload after verified deployment.
Annotated tag `staging-cloudflare-2026-11-01` is published: object
`8fc4395b798c7c8bcefbdc0f3ab5ba293b4f606d` peels to reviewed `d66c42d`.
After Anthony's protected review, [release 41346805790](https://github.com/anthonyyoo24/justgo/actions/runs/41346805790)
verified the unchanged migration history and promoted, then failed with
`STAGING_PROMOTION_UNCONFIRMED`, phase `public-probes`, cause
`STAGING_RUNTIME_IDENTITY_MISMATCH`. Its observed source header was not retained;
propagation is plausible but is not an established cause. No promotion retry or
rollback occurred. Fresh GET-only readback at 20:46:49 UTC verified deployment
`36658e31-0290-4c3a-be70-f1afcd019245`, version
`8f662241-5200-451b-b5bb-f24cefa1fd7b`, exact `d66c42d` and run `41346805790/1`
bindings, 100% serving/latest identity stable across all eight public/immutable
health, readiness and unauthorized probes, plus unchanged Hyperdrive/telemetry
settings. The workflow remains failed; the actual deployment is verified.
The receipt is ignored `staging-2026-11-01/deployment-readback-d66c42d.json`.
No phase-branch push or new PR was performed.

Before that deployment, fresh probes caught intermittent non-JSON 503s on
`0753986`, and its active-version dashboard recorded 38 CPU-limit failures in
30 minutes with zero memory, internal, load-shed or uncaught-exception outcomes.
This confirms CPU failures on that old version without tying each retained 503
to an individual invocation. Safe diagnostics remain ignored under
`staging-2026-11-01/`, including `worker-errors-active-30m.json` and
`closed-error-diagnostics.json`.

Post-deployment sampling on November 1 verified stable provider identity and all
108 public requests returning 200, plus both strict private-route 401 guards.
Toronto/YYZ, two warmups and 25 sequential samples per route gave p50/p95 ms:
health 56.79/82.58, readiness 188.50/231.70, guest access 44.31/72.95 and guest
challenges 182.14/206.34. The new active version's dashboard displayed CPU
p50/p90/p99/p999 13.13/17.38/17.96/17.96 ms and zero CPU-limit or other listed
errors. This is a young deployment with delayed aggregate data, not a complete
30-minute serving window or isolated per-route CPU measurement. Real-account,
cold-start, placement and Workers Free acceptance remain open. Collection times
and workload differ from the old baseline; do not claim causal CPU/latency
savings. Receipts are ignored `staging-2026-11-01/public-latency-d66c42d.json` and
`worker-metrics-d66c42d.json`. No paid plan or provider setting changed. Avoid
speculative shared-app, pool or account-state caching.

An earlier November 2 readback of then-serving version `b1555a49…` showed approximately 1.41k
invocations and zero listed CPU-limit or other errors over its roughly 15-hour
serving period. All 253 CPU errors in that all-version 24-hour
window belonged to older `e9356054…`; this does not reconstruct the earlier email's
1,000+ count. Current-version CPU p50/p90/p99/p999 displayed
10.4/15.56/23.56/23.73 ms. Zero observed failures does not establish sustained
acceptance under Workers Free's 10 ms CPU budget. No old version was deleted and
no plan was upgraded.

A fresh public-only sample on exact `762c128` returned 108 HTTP 200 responses and
two expected private-route 401s, with stable provider identity before/after.
Toronto/YYZ, concurrency one, two warmups and 25 samples per route gave p50/p95 ms:
health 93.32/189.09, readiness 227.35/275.23, guest access 71.73/87.10 and guest
challenges 220.81/256.65. This is public warm latency, not cold-start, managed-route
CPU or placement acceptance. Different collection times cannot prove a speedup.

Resource readback also showed approximately 2.51k total Worker invocations in
24 hours, and the Hyperdrive usage counter was 12,551 against the included
100,000-query daily allowance. Its 24-hour metrics showed zero query errors,
18.48 ms mean query latency, 3.38 ms mean connection latency, five open connections
and zero waiting clients at a configured ceiling of five. The R2 billing-period
view showed $0.00 billable usage, 95 Class A operations, 72 Class B operations and
261.61 kB account storage. These delayed counters include the unrelated bucket;
its contents were not opened, and counters are not a fresh object inventory.
Current request/query/storage volume is below the included allowances in the
[Hyperdrive](https://developers.cloudflare.com/hyperdrive/platform/pricing/) and
[R2](https://developers.cloudflare.com/r2/pricing/) pricing. This is observed
low-volume usage, not future capacity or a zero-cost guarantee. CPU remains the
unaccepted per-request constraint. Receipt: `cloudflare-resource-usage.json` in the
ignored phone evidence directory.

Local commit `4d58868` hoists only the immutable security-header middleware/policy
out of per-invocation composition. Request responses, CORS, diagnostics, services
and database/account state remain isolated. A paired native workerd sample no
longer showed repeated CSP-policy construction; single sampling profiles do not
establish hosted savings. Focused regression tests, API typecheck, lint and actual
Workers smoke passed. It is included in the verified `a082087` release above. Its initial active-version
observation had 156 invocations, zero errors and CPU p50/p90/p99/p999 of
15.14/29.12/58.13/58.49 ms. This young, different workload establishes neither a
hosted improvement nor Free suitability. Exact-source public p50/p95 ms were
health 70.92/230.91, readiness 228.92/341.23, guest access 71.16/121.75 and guest
challenges 209.92/255.04; all 110 responses had expected statuses.
The previous `762c128` version later showed five CPU-limit errors, superseding
its earlier zero-error snapshot. Sentry observed readiness 503s at 19:41–19:43
UTC and recovery at 19:44; no per-response cause was captured, so those responses
are not individually attributed to CPU. Safe receipts/profiles are ignored under
`phone-google-2026-11-01/`.

Local commit `257faf3` adds a post-promotion convergence helper preserving strict probe validation and
single upload/promotion behavior. Only a completely valid captured previous
source permits a two-second wait and another full four-probe round, within one
30-second total request/wait budget. Success needs a complete candidate round;
unknown versions, malformed responses, authentication/endpoint/network failures
and lease loss remain closed failures. Immutable candidate probes remain strict.
This prevention follows documented propagation behavior without claiming it
reconstructs release #9. It remains on the phase branch for the consolidated PR;
reviewed main does not contain it; the local staging release does. See
[server releases](../operations/SERVER_RELEASES.md#candidate-and-promotion-safeguards).

Hosted verification with synthetic content is already authorized. Anthony accepted the existing-account/DPA/current private-journal assessment and its residual interpretation on November 1. That disposition does not establish managed-account or operating acceptance. It requires a disposable
genuine Apple/Google identity with a live provider session and run-owned cleanup.
No hosted-safe managed fixture runner exists; never send the loopback smoke's
synthetic fixture proofs to a hosted API or substitute an admin-created Auth row
for real OAuth/session verification. The subsequent genuine secondary-account phone checks below supplied that
provider-session evidence; no hosted synthetic fixture proof was used.

Initial real encrypted database and ledger copies were captured from reviewed `d66c42d` and uploaded to the private R2 bucket on November 1 using the existing approved guards. Separate read-only retrieval returned identical ciphertext checksums; HEAD confirmed seven-day expiry rules. These supervised copies are not scheduled workflow evidence. Receipts are ignored `.local/phase15-cloudflare/rollout/recovery-2026-11-01/copy-receipts.json` and `download-receipts.json`. Capture/upload used no private key and established no writer fence. Anthony then specifically approved `age` verification of both exact R2-downloaded ciphertext files. Both authenticated decryptions passed with plaintext discarded; the protected identity was neither printed nor copied. The ignored receipt is `recovery-2026-11-01/decryption-receipt.json`. This verifies actual hosted-copy decryption, not restoration or safe reopening. The four run-owned local ciphertext files were removed after verification; R2 objects remain under their approved expiry rules and safe receipts remain. The actual main-workflow copy and monitor results are recorded below; scheduled
execution, complete recovery and actual expiry remain open; actual missed-run email passed below.
Anthony owns manual credential renewal by day five and confirmed an
encrypted-USB recovery-key copy. Under his October 31 custody choice,
the protected Mac key copies remain locally outside CI; USB retrieval is not a
prerequisite. Complete writer-fenced app/Auth recovery remains open. Automatic issuance is
optional [Phase 21](../implementation-plan/README.md#unscheduled-roadmap),
after accepted billing/analytics and actual App Store publication; it adds no
Phase 15 or beta gate. The current parent remains locally outside CI.
Complete simplified Privacy
wording, including sign-in after restoration, is approved; its date/version/
publication and operating facts remain pending. No notice publication or Vercel
retirement occurred. Build 5 still uses Vercel. The owner-selected full cutover has
no external-user grace period; retire owner-only old builds and both old hosting
roles before the Cloudflare-only notice goes live. Complete all required
approvals and legal-artifact preflight before retirement, then publish/verify
Cloudflare and update ASC/EAS URLs in the prepared coordinated cutover. Anthony
accepts its brief legal-URL gap; no legacy redirects are retained. Account incorporation evidence is recorded; Anthony accepted the reviewed coverage/sensitive-content assessment and its residual interpretation on November 1. No separate provider confirmation is claimed. Anthony declined Cloudflare correspondence; no contact was sent. Controlled
alert testing remains authorized. Independent Phase 14 privacy/device gates and external-beta
acceptance remain open. The phone checkpoint below is complete for the tested scope; the remaining
performance/recovery and cutover/publication/build prerequisites are preserved.

Remaining implementation and documentation are grouped on local
`codex/phase-15-rollout` for one consolidated review, as Anthony asked on
November 1.
A guarded `npm run dev:mobile -- --cloudflare --clear` option is prepared locally
for an earlier owner-only synthetic phone check. It selects only the exact
staging Worker API after validating the existing Dev environment/profile,
preserving app/provider identity, current legal URLs, fixture rejection and
dotenv isolation. The default Dev path and release/build profiles are unchanged.
A compatible Dev binary is now built and its artifact verified. The initial
screen/navigation phone check can use guest mode; a genuine disposable provider
session remains required for managed synchronization/deletion acceptance. An
existing secondary Google identity is sufficient; no new email is required for
the initial guest check. Verify Google test-user eligibility before managed
checks and delete only the disposable JustGO account, not its Google identity.

After verified API deployment and Anthony's protected signing review,
[JustGO Dev run 41348697942](https://github.com/anthonyyoo24/justgo/actions/runs/41348697942)
succeeded from reviewed `d66c42d` and tag `staging-cloudflare-2026-11-01`, producing
Dev 0.1.0 (2) in the existing Expo project. Frozen compilation, signed identity/
profile/native capability inspection, exact upload, public artifact retention
and temporary signing cleanup all passed. Downloaded archive SHA-256 and the
31,074,881-byte IPA SHA-256 matched GitHub metadata and the source/run manifest;
IPA hash is `704051dcd4c1db7adcbd3ceba7fd9d4d7711cc06fbbdc578728bcb0d375b1043`.
The [installation page](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/c1f43ed8-066a-413e-b196-647588a1296f)
shows Succeeded and its install QR. GitHub artifact `13101530786` expires November
8 at 21:13:59 UTC. The manifest reports one provisioned device without exposing
its ID. This is Dev internal distribution, with no TestFlight/App Store
submission, signing upgrade or plan purchase. Anthony reports using both QR
codes and the app appearing to work on his phone, with both JustGO and JustGO
Dev present; he then confirmed signed-out/guest mode. This is owner-reported
initial installation/launch evidence, without independent phone inspection or a
build-number readback from the device. He also confirmed that a synthetic
“Phone test” reflection saved in guest mode remains in Progress after fully
closing and reopening Dev. This initial launch evidence was followed by the phone acceptance below; it
does not establish final TestFlight or all Phase 14 device acceptance. The ignored receipt is
`staging-2026-11-01/phone-initial-launch.json`. Other safe receipts are ignored
`staging-2026-11-01/development-run-result.json`, `dev-manifest.json`,
`dev-install.json` and `development-artifact-verified.json`.

Fresh local served-code inspection found Expo 58's development virtual module
merging saved Vercel and original Google-client inputs despite the correct
launcher/HMR values and `EXPO_NO_DOTENV=1`. Local commit `978c41a` adds a guarded
Dev-only public adapter for the complete API/provider/diagnostic/notice pairing.
Marked production, CI, EAS-build, Vercel and fixture contexts are rejected;
normal release and isolated journey resolution stay unchanged. The native binary
inputs are unchanged; Dev deliberately loads current local phase-branch JS.
After restarting the owned Metro with `--clear`, the fresh complete iOS bundle
verified all four API/identity/provider/diagnostic consumers depend on the adapter,
all selected public values match and no dotenv or Vercel API modules remain.
The owned server is available on LAN port 8081. Owner-reported initial phone
launch and guest persistence are recorded above; no complete native walkthrough
is claimed.
The ignored receipt is `staging-2026-11-01/metro-readiness.json`. Local simctl is
unavailable, and the installed Router emits an export-fallback warning while
bundling succeeds. A limited in-app browser Settings walkthrough passed;
local browser API access is excluded by existing hosted CORS and LAN HTTP also
lacks secure-origin WebCrypto. These browser limits do not establish native
failure or acceptance; no provider policy was changed. Temporary preview tabs
were closed. This earlier Dev checkpoint does not replace final TestFlight/
cutover, real managed-account or independent Phase 14 acceptance.

The genuine secondary Google account passed sign-in, preservation of the guest
entry after reopening, online saving, saving while offline in the open app followed
by server receipt after reconnection, and logout/sign-in continuity. After the
owner deleted that disposable JustGO account, an exact-owner server check confirmed
Auth profile/identity/session removal, application tombstoning, empty activity and
revoked app sessions. The Google identity itself was not deleted. These are owner
phone reports plus scoped server evidence, not a saved native end-to-end test.

Anthony reported Apple cancellation/completion, account switching, save/reopen and
logout/sign-in checks passing. Fresh on-device CloudKit read-back matched all
three disposable completion/journal pairs. After owner-confirmed “Delete all my
data” with iCloud enabled, native checks confirmed the same retained account,
advanced deletion epoch, completed purge and zero local/cloud completion or journal
records. The private diagnostic baseline was removed. This proves the tested
current-generation cleanup and purge receipt, not independent enumeration of every
old CloudKit generation, second-device/reinstall restoration, changed Apple-account
or quota/failure behavior. The Welcome buttons also opened the provider prompt
directly after the local navigation fix. Full Phase 14 acceptance remains open.
Safe receipts are ignored `phone-google-2026-11-01/phone-sign-in-success.json`,
`phone-apple-icloud.json`, `icloud-native-readback.json` and
`icloud-native-cleanup.json`; private writing and provider credentials are excluded.

Fresh November 2 metadata shows `postgres` can SHARE-lock all 44 current domain
tables, but only ACCESS SHARE-lock `auth.schema_migrations`. Requiring 45 SHARE
locks was our engineering assumption, not owner policy. A self-service plan can
freeze domain writes while separately guarding registry/catalog/helper/ACL and
Auth version/public-key compatibility during a reviewed no-manual-change window.
ACCESS SHARE prevents registry replacement, not inserts; endpoint hashes do not
prove absence of change-and-revert activity. No hosted locks, grant or support
contact occurred. The backup operator remains NOLOGIN.

The bounded `scripts/backups/recovery-fence.mjs` helper checks reviewed OIDs,
actual granted locks and transaction identity, takes fresh post-lock reads, latches
drift as fatal and shuts the target before releasing the lease. Its loopback PG17
fault controls run within the existing encrypted recovery rehearsal. The complete
hosted catalog/Auth inspector and supported source transport remain to be prepared;
this helper is not a full hosted coordinator. Results keep `writersMayOpen: false`.

A separate real Supabase Auth v2.197.0 loopback HTTPS service passed certificate
verification, the unchanged production verifier, restricted private live-session
helper, old-session/refresh rejection, fresh-session success and actual local
Auth deletion controls with synthetic records. A valid email-only token passed
Auth but failed JustGO's Apple/Google policy. Temporary service/database/private
TLS resources were removed. This proves that service boundary, not genuine OAuth,
actual R2 recovery or complete API acceptance. No protected recovery key was used.
Safe receipt: ignored `phone-google-2026-11-01/real-auth-service-rehearsal.json`.

The existing reviewed main workflow was activated November 2 at 18:27 UTC after
fresh policy/role/TLS/migration/R2/monitor checks. Exact policy readback caught a
missing trailing newline in the protected variable; restoring the approved 582
bytes fixed the mismatch without changing the policy, digest or guard. Both actual
copy steps passed in manual database run
[41500830932](https://github.com/anthonyyoo24/justgo/actions/runs/41500830932) and
ledger run [41501504987](https://github.com/anthonyyoo24/justgo/actions/runs/41501504987),
on exact main `d66c42d`. Independent HEAD checks matched ciphertext size/hash:
197,941 database bytes and 31,519 ledger bytes, expiring November 9 at
18:30:14/18:34:16 UTC. The ledger also passed the actual database-job/step freshness
check and supplied the monitor's first healthy check-in. No private key was used.
These manual events do not prove a scheduled run.

The initial controlled error at 18:38 UTC created Sentry issue `7825382031` and
triggered rule `6238426`; it was resolved about three minutes later. Anthony
received the separate built-in routing test, but not that short incident email.
Sentry source shows resolved groups can be removed from pending digests and routing
tests bypass digests. With project settings of 5–30 minutes, early resolution is
a plausible explanation, not proof of hosted cause. No notification setting changed.

A real missing 19:23 check-in was detected at 19:43 UTC. Anthony confirmed the
backup-monitor email arrived, distinct from the API recovery email. After the
incident stayed open beyond batching, real manual ledger catch-up
[41517995755](https://github.com/anthonyyoo24/justgo/actions/runs/41517995755)
on reviewed main passed. Independent HEAD matched 32,387 ciphertext bytes,
SHA-256 `74f22c4e253b8bdbb2d39b8eab3192b6f0355002c65fb574f11892f2e884e5e3`
and November 9 20:20:27 UTC expiry. Sentry showed Okay at 20:20:29 and the issue
resolved. This verifies actual missed-run detection/email and real-copy recovery,
not scheduling or timeout-specific behavior. At 20:28:41 no schedule event had
appeared for the 20:23 slot; the latest scheduled entry was skipped before
activation. A manual copy is not scheduled execution. Safe copy/alert receipts
are ignored under `phone-google-2026-11-01/`.

Seven-day canaries remain present and ineligible for expiry until November 6/7;
actual asynchronous deletion cannot yet be accepted. Renew the uploader/parent
before their November 5 cutoff and the inspector before checking November 6
expiry, under Anthony's manual-renewal ownership. Do not shorten protection,
change monitoring grace or reuse the narrowly approved November 1 decryption
permission to manufacture a passing gate.

## Implemented behavior

- The Hono app replaces Fastify/Pino while preserving contracts, paths, methods,
  status/error envelopes, security/CORS headers, generated IDs, request bounds,
  rate-budget order and allowlisted diagnostics. A shared `app.request` test helper
  retains existing protocol assertions. Node development, database tests and
  journey fixtures run the same Hono app through the Node adapter.
- The Worker creates and closes its pg pool per invocation; Hyperdrive query
  caching must stay disabled. The deployed compatibility fix routes all managed
  requests and retained existing-proof recovery through Hyperdrive, preserving
  unique mapping, owner locks and live-session/deletion checks without unsupported
  advisory locks. Managed readiness verifies that active connection's actual
  role/database/schema/helper. The origin-reference URL stays strictly validated;
  it is not a supported custom-CA Worker socket. The release lease and loopback
  legacy fixture retain separate direct connections. No schema, migration,
  public contract, grant or mobile data behavior changed.
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
  one hourly Sentry Cron health monitor, checking ledger upload and trusted
  GitHub main-branch evidence of actual database-copy job/step success.
- The local restore verifies source/file/migration/timestamp evidence, reconciles
  deletion epochs, tombstones, revoked proofs and Auth subjects, and invalidates
  restored sessions. It never reopens an API. A current complete writer-fenced
  ledger is required; hourly copies alone do not solve the post-copy deletion gap.
  Anthony accepted that limit for the small beta on October 29: unverified old
  restored state stays closed.
  Independent deletion/revocation recording is deferred, with mandatory
  reassessment before paid launch or beta expansion, whichever comes first.
- Static legal Worker configuration and an approval-gated build are prepared.
  The [exact notice candidate](../legal/CLOUDFLARE_NOTICE_REVIEW.md) is separate
  from the approved/published October 27 source. A complete candidate, unchanged
  Terms copy, existing-renderer output and conditional publication/EAS inputs are
  prepared in ignored `.local/phase15-cloudflare/rollout/notice-review/`.
  Anthony approved the complete simplified public wording, including sign-in
  after a restore, on October 30. Proposed version `2026-10-30-cloudflare` remains
  date-dependent with a pending date; both publication guards reject it. Anthony selected a full
  cutover with no external users: the next notice names Cloudflare only after
  owner-only old builds and Vercel API/legal roles are retired. The beta profile and protected
  build/submit lane target `https://justgo-api-staging.anthonyyoo24.workers.dev`
  and refuse a missing Cloudflare notice approval. Hosted acceptance, legal URLs
  and a new TestFlight binary remain open; installed build 5 is unchanged.

## Invariants and problems worth retaining

Hyperdrive's virtual connection string includes `sslmode=disable`. Local Miniflare
uses `*.hyperdrive.local`; pinned hosted workerd uses a 32-lowercase-hex
`*.workers.alt` host on port 5432 and opaque proxy user/password/database values.
Those values cannot be compared with the real origin credentials. Accept only
the specific virtual transport parameter; keep release readback of the actual
origin role/project/database, verified Hyperdrive origin TLS, and live role,
database and Auth-helper checks. Generic query overrides remain rejected. The
local smoke alone did not reveal the hosted format. A Worker receiving a CA PEM
does not add that CA to its native TLS trust store. Keep hosted managed operations
on the verified Hyperdrive path; neither disabling certificate checks nor sending
unsupported advisory locks through Hyperdrive is an acceptable workaround. Match
Hono's decoded route path for the retained loopback legacy fixture. The unique
subject mapping and bounded rollback/retry rules must preserve deleted-owner,
revocation and exact-proof fences; see the identity architecture.

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
hosted archive compatibility, preserved ACLs and the restored private session
helper's ownership/access are now verified in isolated local PostgreSQL 17.
Archive owners were mapped to local `postgres`; this does not prove hosted
provider restoration or a complete recovery with a current writer-fenced ledger.

Fail-closed recovery does not prohibit a clean restart with newly authenticated
accounts and new writing under a separate reviewed procedure. Automatic recovery
from old phones is unsupported: retained local copies cannot prove lost deletion
history, and account-owned collections/imports stay bound to their original owner.
The long-term independent-record design must cover app, maintenance and Auth/admin
paths. Anthony accepts conservative replay of a durably saved deletion intent
after an apparent database failure for that future design; no implementation or
current restore check changes with this decision.

## Verification

The latest local pre-publication `npm run check` passed after reinstalling the
committed lockfile with `npm ci`. The initial run correctly stopped because six
installed Expo/native packages lagged the unchanged manifest/lockfile; no source
or dependency version was changed to resolve that local environment mismatch.
A fresh actual Wrangler dry-run and input inspection passed for the reviewed
`d66c42d` API source after that reinstall. The phase branch's additional native
build inputs remain identical to reviewed main. These local results and the
exact-main hosted CI supported the release preparation. Fresh Doctor 20/20
validation passed immediately before the authorized tag push. Actual deployment
readback, the failed workflow conclusion and post-release measurements are
recorded above. Initial phone launch and guest persistence are owner-reported; complete device
acceptance and operational recovery remain open.
The local convergence follow-up passed 151 focused release tests, API typecheck,
formatting and repository lint (zero errors, 167 existing warnings). The subsequent
Dev virtual-environment fix passed 16 launcher/Metro/journey regressions, 48
mobile adapter/runtime/Auth tests, mobile source/test typechecks and the same
lint result. The adapter suite passed again after correcting its test-environment
type. Fresh cleared served-iOS code inspection and limited browser evidence are
recorded above. Independent static review found no actionable issues in either
follow-up. These narrow tooling checks do not
reopen phase closeout or establish hosted execution of the unpublished helper.
Changed release/docs directory file lists were reviewed; no moves were needed.

Phase implementation evidence was collected October 28, 2026. Focused HTTP,
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
- At that closeout, hosted CI, actual Hyperdrive/CPU, scheduled R2 copies/expiry, real hosted
  Auth restore and signed-device checks remain unverified. The root `check` and
  `test:db` wrappers were not repeated: the constituent static/Doctor and
  coverage suites above supplied their local checks without duplicate execution.

Rollout follow-up evidence:

- PR 62 updated React Native to Expo's recommended 0.88.1. Exact merged-main
  [Foundation run 40924746524](https://github.com/anthonyyoo24/justgo/actions/runs/40924746524)
  passed; the reviewed staging tag resolves to that commit.
- [Bootstrap run 40943480759](https://github.com/anthonyyoo24/justgo/actions/runs/40943480759)
  failed after uploading version `d15d9fbd-1d99-4106-abc4-43b907ba7a2c`.
  Provider readback confirmed its source/run identity, preserved bindings and
  single-version deployment. `/script-settings` reports disabled observability
  and no tails as null values; the original strict settings check rejected this.
  A guarded continuation enabled routes without another upload. Both public and
  immutable origins still failed startup; no mobile traffic was moved.
- PR 63 uses authoritative script settings, narrowly accepts the pinned hosted
  binding format and documents null nested telemetry values. These fixes did
  not resolve the replacement hosted candidate's startup failure; it was not
  promoted. Local workerd acceptance does not establish hosted startup acceptance.
- The merged PR 63/64 review follow-ups add function contracts without changing
  parsed runtime ASTs.
  October 30 read-only Cloudflare inspection verified the active release token,
  unchanged deployed/latest baseline, source/bindings, public/preview route
  settings, disabled telemetry, disabled Hyperdrive caching, verified origin TLS
  and five-connection limit. The safe receipt is ignored
  `.local/phase15-cloudflare/rollout/worker-premerge-readback.json`; no public
  probe, provider mutation, new tag or deployment was performed by that check.
  The subsequent combined-main CI, approved tag and failed ordinary deployment
  are recorded in the current status above. The failed candidate returned
  health 500 and readiness 503 without release headers; the original probe
  validator misleadingly reported identity mismatch. Protected runtime values
  pass offline composition, and real workerd passes synthetic managed Auth,
  enabled Sentry/beta and the documented wrapped transport with zero outbound
  HTTP attempts. These checks do not establish the hosted binding representation
  or actual startup cause.
  Preserve redacted startup diagnostics and the distinction between a failed
  health/readiness probe and a successful response with the wrong source identity.
  Owned workerd/fixture processes and the local database are stopped.
- The backup-reader guard defaults to rejection and permits only the exact
  opted-in cron DELETE exception. Unapproved mutations, MAINTAIN and inherited
  ownership remain rejected. Real catalog behavior required CASE guards
  for relation-specific checks, a narrow standard `pg_settings` UPDATE exception,
  and explicit owner catalogs because pinned-role dependencies are omitted from
  `pg_shdepend`. All fixture roles/databases, key/ciphertext and owned processes
  were cleaned up. Missing `pg_dump` on PATH was resolved using the documented
  PostgreSQL 17 client directory.
- A read-only hosted `justgo`/`auth`/`drizzle` archive streamed through `age` and
  passed isolated PostgreSQL 17 compatibility restoration. Archive ACLs were
  preserved, owners mapped to local `postgres`, and the restored private session
  helper's ownership/access verified. No private rows were logged. This did not
  capture a writer-fenced current ledger, perform deletion/revocation
  reconciliation, establish provider acceptance or authorize writers to reopen.
  The safe receipt is ignored
  `.local/phase15-cloudflare/rollout/hosted-archive-compatibility-verified.json`.
  Independent cleanup confirmed zero target databases, created roles or other
  local clients; the encrypted test archive was removed and the owned PostgreSQL
  process stopped. Scheduled R2 copies and complete operational recovery remain open.

No app UI rendering or native dependencies changed. API consumer journeys and the
static legal-host check are separate from native evidence. The complete file lists
in changed directories were reviewed; their responsibility groups needed no moves.
Ordinary diagnostics remain in ignored
`.local/` storage.

## Approval and acceptance register

Authenticated account inspection on October 28 confirmed account
`52662d8ba7ae983237860a1719c66a1e` after Anthony signed in himself. Workers is
Free (100,000 requests/day, 10 ms CPU/request); no Workers applications or
Hyperdrive configurations existed at that inspection. R2 was already enabled, with one unrelated bucket
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
and exact certificate fingerprint. On October 29, Hyperdrive
`43680896c69f4596804be7fba6bf9f0d` was created and read back with query caching
disabled, verified TLS using that CA, the canonical restricted runtime origin
and a soft connection limit of five. The staging Worker now exists as described
above; its runtime acceptance remains open.
Seven-day staging retention/lock configuration is approved and verified below;
initial supervised database/ledger copies and independent ciphertext retrieval now pass; scheduled operation and recovery acceptance remain pending.
Anthony identified the personal account customer as Youngshin Yoo. The account's
Configurations page supplies a DPA-incorporation notice linked to v6.4; no separate
acceptance action was displayed. That recorded representation supports the November 1 accepted assessment together with the public terms; it is not separate provider confirmation of the SSA §6.1/PIPEDA interpretation. Anthony declined Cloudflare email correspondence.

An `age` identity was prepared locally with restrictive permissions and a
synthetic encrypt/decrypt roundtrip passed. At Anthony's request, a copy was also
saved in a protected local file, mode 0600, and checked against the source without
printing it. Anthony subsequently confirmed
a copy on an encrypted USB. That copy was not mounted or tested. Anthony chose
to retain the protected Mac copies locally outside CI, without a USB-retrieval
prerequisite, on October 31.
This does not establish actual hosted R2 recovery-copy decryption or complete
operational recovery. Existing runtime/migrator session-pooler credentials were
read-only checked as their restricted roles. Vercel exports protected settings as
`[SENSITIVE]`; the existing Auth secret was retrieved from the signed-in Supabase
dashboard and saved in a protected ignored file. The rate key, beta grants/window
and CORS values were recovered from protected local setup records, with their
provenance corroborated against authenticated Vercel modification timestamps;
this was not a fresh plaintext equality comparison. Validated bindings were
stored in the protected GitHub environment. Never substitute export placeholders.
The separately approved narrow release token has Workers Write and Hyperdrive
Read, expires at the end of November 5 Toronto time, and is stored in that
environment. No existing runtime/migrator credential was rotated during that
setup. The later backup-parent replacement is recorded below. After the verified
active deployment readback, `STAGING_BOOTSTRAP_BINDINGS` was removed from the
protected `justgo-staging` GitHub environment; a fresh secret-name list confirmed
its absence. The nonempty ignored local recovery copy remains protected with
mode 0600. No secret values were read/logged and Worker bindings were unchanged.
Do not repeat bootstrap against the existing Worker.

Anthony approved the dedicated supported backup reader and then accepted DELETE
on exactly `cron.job_run_details` for the small beta. The reader was re-enabled
with LOGIN; actual verified-TLS metadata and required-schema `LIMIT 0` access
probes passed the opted-in guard. No private rows were fetched. Its one-time
exchange key and provider comment remain removed. Default rejection remains
unless the approved policy explicitly sets
`allowCronJobRunDetailsDelete: true` for staging project `kmcpcauaxlgpevkkenwd`,
database `postgres` and its matching accepted direct/session-pooler source.
The exact policy bytes/digest bind the opt-in; other mutation, ownership,
membership and privileged-function checks remain in force. The read-only hosted
archive compatibility result above does not establish scheduled R2 operation or
complete recovery acceptance. The main-only `database-backups`
environment now holds `BACKUP_DATABASE_URL`, `BACKUP_DATABASE_CA_CERT`,
`R2_INSPECT_TOKEN`, the three `R2_UPLOAD_*` secrets, `BACKUP_SENTRY_DSN`, and approved
`BACKUP_POLICY_JSON` / `BACKUP_POLICY_SHA256`;
the November 2 exact-byte repair and activation are recorded above;
`JUSTGO_BACKUPS_ENABLED=approved` is now set. The reviewed reader/exception/health follow-up was published in PR 64 at
`3e6747b` on `codex/phase-15-backup-role`. Anthony subsequently approved merging
PRs 63 and 64; both are merged.

The authorized Supabase support request to remove PUBLIC DELETE was submitted.
The page showed "Support request sent" and a ticket logged for JustGo; no ticket
ID was displayed. Optional support diagnostic access was off. The provider
response/removal remains an open follow-up alongside backups, not an activation
prerequisite; remove the exception once removal is verified. An existing Supabase advisor
also reports [disabled leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection);
that setting was not changed by this work.

Initial R2 setup created a bucket-scoped Object Read & Write parent and an
Admin Read Only inspector. The original parent had expiry
`2026-11-05T23:03:57Z`; its original derived upload JWT had expiry
`2026-11-05T22:03:56Z`. Both were superseded by the October 31 rotation below.
The inspector is unchanged, expires `2026-11-05T23:06:08Z` and remains in the
protected environment. Anthony explicitly approved its account-wide R2 read/list
authority, including other buckets. Historical encrypted-canary checks passed
PUT/HEAD and denied GET/list/out-of-prefix PUT/DELETE; owner retrieval and
decryption with the protected local key file passed, and the canary was
cleaned up. That proves the inspected scope and local key usability, not actual
R2 database recovery-copy decryption or complete operational recovery.

On October 31, an agent tool-output mistake exposed the original backup-parent
API token. Anthony explicitly approved replacement and revocation. The original
parent was revoked; its derived uploader now returns HEAD 401. Replacement
`justgo-staging-backup-parent-rotation-2026-10-31` retains Object Read & Write for
only `justgo-staging-backups`; its derived uploader retains only PutObject and
HeadObject on the two approved staging prefixes. Replacement HEAD returned 200,
and all three protected-environment `R2_UPLOAD_*` secrets were updated. The new
parent stays local outside CI and expires `2026-11-05T17:00:00Z`; the derived
credential expires `2026-11-05T15:59:59Z`. The runner's 20-minute minimum stops
accepting it at `2026-11-05T15:39:59Z`. The inspector and recovery key were
unchanged; the recovery key was not read or exposed. Safe receipt:
`.local/phase15-cloudflare/rollout/credential-rotation/rotation-complete.json`.
Replacement-uploader verification subsequently passed actual PUT/HEAD 200 in both
approved prefixes and GET/list/out-of-prefix PUT/DELETE 403 with encrypted random
canaries only. No parent, recovery key, database or Sentry was used. Receipt:
`.local/phase15-cloudflare/rollout/iphone-readiness/rotated-uploader-scope-2026-10-31.json`.
Two new synthetic canaries remain for seven-day expiry, due November 7 with
asynchronous deletion. Schedules were enabled November 2, and actual manual
main-workflow copies passed; scheduled execution remains unverified. Initial real
hosted copies, independent retrieval and protected decryption passed November 1;
complete recovery remains open. Anthony
owns manual renewal under the existing policy.
Anthony approved seven-day retention, protection and automatic expiry on October
30, including saving both expiry rules at action time. API readback verified
enabled Age locks and Age object-expiry rules of 604800 seconds for
`staging/database/` and `staging/ledger/`; the default incomplete-multipart abort
rule is preserved and public domains remain disabled. The approved policy uses
`backupDays: 7`, `ledgerDays: 7` and `lockDays: 7`.

Two new encrypted dummy canaries containing no user data demonstrated actual lock
enforcement: parent-credential overwrite and DELETE returned HTTP 409
`ObjectLockedByBucketPolicy` on both prefixes. HEAD `x-amz-expiration` reported
`2026-11-06T13:22:01Z` for the database canary and `2026-11-06T13:22:37Z` for the
ledger canary. These two canaries remain under lock until expiry; actual
asynchronous deletion is not yet observed. The earlier credential-only canary
was cleaned up before these rules were installed. Readback and enforcement
evidence are in ignored `.local/phase15-cloudflare/rollout/r2-retention-verified.json`
and `r2-retention-enforcement.json`. The
October 30 retention approval does not close Git, privacy/DPA, actual hosted
recovery-copy decryption, complete app/Auth recovery, alerts or renewal gates. The later October 31 decision accepts
protected Mac key custody outside CI without a USB-retrieval prerequisite.

The implementation owner selected one free Sentry Cron,
`justgo-staging-backup-health`, hourly at minute 23 UTC with 20-minute check-in
margin/runtime. The account showed three trial days left, then Developer with one
Cron; no paid change is selected. Ledger health requires its upload plus trusted
GitHub main-branch database-copy job/step success, using `GITHUB_TOKEN` with
`actions: read`. The nightly 04:43 slot becomes due at the inclusive 05:23 deadline;
a missing database copy is normally caught when that ledger run completes, plus
runtime/platform/delivery delays, not an SLA. Missing ledger runs use the Cron's
missed-run detection. Run the first manual database copy before the ledger copy.
The monitor is created with the exact slug in `justgo-api`, assigned to Anthony,
and received its first healthy main-workflow ledger check-in November 2. The
controlled failure and verified real missed-run email/recovery are recorded above. The existing API email alert covers all
project issues and notifies Anthony; no duplicate alert was created. An unused
initial draft with slug `new-monitor` is disabled.
Real missed-run delivery passed; scheduled execution and timeout-specific evidence remain open.

| Item                       | Prepared result / remaining gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Owner                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare account and DPA | Personal customer Youngshin Yoo and signed-in incorporation notice recorded. Anthony accepted the reviewed DPA v6.4 Canadian-data/current private-journal assessment and residual interpretation on November 1. The [notice review](../legal/CLOUDFLARE_NOTICE_REVIEW.md#accepted-account-and-service-assessment) owns the reasoning and limits. No separate provider confirmation, new agreement or contact is claimed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Settled on reviewed facts; reassess material changes and preserve no-contact instruction.                                                                            |
| Services, costs and budget | Workers Free remains current. Bounded public latency and active-version CPU chart readbacks are recorded above; per-route managed CPU, cold starts and load capacity remain unmeasured; current Hyperdrive connection health and R2 usage are recorded above. Previous `762c128` later showed five CPU errors; initial active `a082087` showed zero errors in 156 invocations with CPU p50 15.14 ms/p99 58.13 ms; aggregate public/phone traffic does not establish per-route managed workload or sustained Free suitability. The tested static-policy optimization is deployed on staging source `a082087`. Anthony declined the Paid upgrade and chose to keep Workers Free; checkout was exited with no terms accepted or purchase. Resolve Free-plan performance suitability before claiming workload acceptance.                                                                                    | Implementation owner measures; Anthony approves setup/spending and alert ownership.                                                                                  |
| Retention and deletion     | Seven-day staging retention/protection/expiry approved October 30; API readback and actual parent overwrite/DELETE lock rejection passed for both prefixes. Approved policy bytes/digest are stored. Initial real R2 database/ledger copies, independent retrieval and protected decryption passed November 1; workflow opt-in is enabled, both main-workflow manual copies passed November 2, and two approved Cloudflare-clock hourly ledger runs now pass with independent R2 verification. The first new-clock nightly database run and operational recovery remain pending; see the consolidated rollout review. Encrypted canaries remain for November 6 retention and November 7 rotation expiry; actual asynchronous deletion is unobserved. Supabase support response/removal remains a nonblocking follow-up.                                                                                  | Implementation owner observes expiry, verifies activation/restore and owns support follow-up; Anthony/privacy owner owns separate publication date/version approval. |
| Recovery guarantees        | Small-beta fail-closed limit approved October 29; unverified old restored state stays closed. Independent deletion/revocation recording is explicitly deferred. The October 31 recovery-target decision approves up to 24 hours of ordinary-write loss and a four-hour operator recovery target when safe recovery is possible; sign-in again after a restore was approved October 30. Actual hosted archive compatibility passed locally; initial R2 upload/retrieval/decryption now pass. Writer-fenced ledger reconciliation and complete operational app/Auth recovery remain unverified.                                                                                                                                                                                                                                                                                                            | Anthony and implementation/release owner reassess before paid launch or beta expansion, whichever comes first; release owner proves current app/Auth recovery.       |
| Keys and restore access    | Anthony chose protected Mac key copies locally outside CI, without a USB-retrieval prerequisite, and owns manual renewal by day five. The owner-confirmed USB copy was not tested. Actual hosted-copy decryption passed November 1; complete recovery remains open. Automatic issuance is deferred to optional Phase 21. October 31 owner-approved rotation revoked the exposed original backup parent and invalidated its derived uploader (HEAD 401); replacement HEAD passed 200 and protected uploader secrets were updated. The replacement derived credential expires November 5 at 15:59:59 UTC and the runner stops accepting it at 15:39:59 UTC; parent expires at 17:00:00 UTC, unchanged inspector at 23:06:08 UTC. Renewing only the derived credential is insufficient, and inspector renewal is needed to observe the November 6 retention-canary expiry. Parent stays outside CI.         | Anthony retains local custody and owns manual renewal; actual hosted-copy decryption passed and the implementation owner verifies complete operational recovery.     |
| Release/bootstrap          | Approved tag `staging-cloudflare-2026-11-01` publishes reviewed `d66c42d` after seven main CI jobs passed. Release 41346805790 failed after promotion on public identity verification; stable GET-only readback verified deployment `36658e31…`, version `8f662241…`, source/run and all eight probes. Do not retry the mutation or call the workflow successful. Dev run 41348697942 succeeded with signed inspection, exact upload and cleanup. Anthony reports both app variants present, initial Dev launch working in guest mode, and a saved reflection surviving close/reopen. The subsequent local sign-in release and genuine phone acceptance are recorded above; final TestFlight, remaining device/performance and operational recovery acceptance stay open. Bootstrap secret remains removed; its protected local recovery copy remains. Release token expires November 6 at 04:59:59 UTC. | Implementation owner completes acceptance; Anthony supplies physical-device results and the phone checkpoint.                                                        |
| Old builds and Vercel      | Anthony confirmed no actual app users and selected full Cloudflare cutover with no external-user grace period or retained legal redirects. Complete all required approvals and legal-artifact preflight before the coordinated cutover; retire owner-only TestFlight/Dev binaries, end Vercel API/legal hosting, verify private-traffic cutoff, immediately publish/verify Cloudflare legal pages, then update ASC/EAS URLs. Build/upload the replacement only after verified publication. Anthony accepts the brief legal-URL gap. App Store Connect readback confirms builds 3–5 in the one-tester Owner validation internal group, Manual for Xcode Builds, and no external groups. EAS preview legal URLs and ASC Privacy URL still point to Vercel. Existing conditional retirement approval remains; no builds/hosting are retired.                                                                | Implementation owner executes the cutover and preserves data; Anthony supplies required phone acceptance and specific Git permissions.                               |
| Notices/disclosures        | Complete simplified public Privacy wording, including sign-in again after restoration, approved October 30. The local candidate records wording approval; effective date, matching final version and publication remain pending. Account assessment is accepted; scheduled backup and complete recovery evidence remain open. Complete final date/version approval, publication authorization and artifact preflight before retirement, then publish immediately after old API/legal roles and owner-only builds are retired. Current public source and Apple answers remain unchanged.                                                                                                                                                                                                                                                                                                                  | Anthony approves date/version and publication; implementation owner verifies the cutover facts and accepted recovery behavior.                                       |
| Phase 14 carry-forward     | Supabase sensitive-data/consent/provider-copy review, Sentry/Apple diagnostic entries/post-trial scope, physical-device/recovery/accessibility dispositions and external cohort/dates remain open. Deliberate crash skipped, simulator CI deferred, Vercel contact declined.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Existing Phase 14 owners; no gate is closed by this port.                                                                                                            |

Continue with [server releases](../operations/SERVER_RELEASES.md),
[backup setup/recovery](../operations/CLOUDFLARE_BACKUPS.md) and the
[cutover checklist](../operations/CLOUDFLARE_CUTOVER.md). The external free beta
still waits for Phase 15 acceptance and the independent Phase 14 decisions.
