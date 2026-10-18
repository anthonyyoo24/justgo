# Identity and recovery implementation

Phase 02 uses the custom no-signup identity design in [TECH_STACK.md](TECH_STACK.md#4-frictionless-identity-and-recovery). Supabase hosts PostgreSQL; there is no Supabase Auth or direct mobile database access. See the [phase handoff](../handoffs/phase-02-identity.md) for actual verification and remaining device acceptance.

## Transfer verification upgrade

Migration `0003_transfer_verification.sql` erases legacy plaintext verification values and cancels old transfer requests without changing accounts or sessions. Deploy the API/client changes together with the migration during a brief staging maintenance window: stop serving the old API, apply the migration, deploy the new API, then reload the client. Old development clients fail closed against the restricted inspection response and must update before approving transfers. Start a fresh transfer after upgrading.

`IDENTITY_RATE_LIMIT_KEY` now also protects transfer verification through separate HMAC domains. Keep the same value across API instances and restarts. Rotation requires cancelling outstanding transfers and restarting the flow; accounts, sessions and recovery keys are unaffected. Preserve the key securely and never place it in mobile configuration.

## Credential and session rules

- Recovery credentials and device session tokens contain 32 cryptographically random bytes, encoded as 64 lowercase hexadecimal characters. Mobile uses Expo Crypto `getRandomValues`, which has no development `Math.random` fallback. Node uses standard cryptographic primitives. PostgreSQL receives SHA-256 digests, never the bearer secrets.
- A device session expires after **168 hours (7 days)**. The client renews on foreground/verification when fewer than 24 hours remain. An expired session can recover through its selected credential; a revoked or unknown session requires an explicit recovery action.
- Renewal proposes and securely saves the next token and ID before sending it. The old token is immediately invalid for ordinary API requests after rotation. Retrying the same rotation can retrieve the same still-active result when the caller proves possession of both tokens. A different replacement is rejected. Other devices remain independent.
- Recovery credentials are long-lived, independently revocable, and immutable. Revocation does not log out other active device sessions. Device revocation invalidates that device’s sessions; explicit recovery establishes a new device authorization. Account retirement revokes all credentials/sessions and cancels transfers. Tombstones prevent retired/revoked credentials from bootstrapping a new account.
- Bootstrap serializes on the recovery digest and is idempotent. Fresh native and browser initialization no longer bootstrap automatically: Welcome Continue opens Terms & Privacy, and I Accept persists the bootstrap proof with the accepted versions before transmission. The optional wire `acceptance` field is stored atomically only when bootstrap creates a new account; a credential that resolves an existing account never implies acceptance. The client saves a pending intent and then the recovery item before contacting the API. Unknown credentials presented with session kind `recovery` are never retried as `bootstrap`. Failed/lost responses reuse the persisted proposal.

These defaults can be tuned with bounded server environment variables. Changing them requires the relevant expiry/retry tests; it does not require a new product flow.

## API contracts

The Phase 07 identity slice moves the public protocol to resources under `/v1`.
API and mobile must be deployed together: retired `/v1/identity/*` action paths
return `404`. Existing securely persisted pending intents keep their stored kinds
and proposals; the controller maps them to the new wire protocol without replacing
credentials or retry identities. No schema migration is needed for this route slice.

Requests and responses are strict Zod contracts in `packages/contracts/src/identity.ts`.
Authenticated calls require `Authorization: Bearer <device session token>`. Secrets
and transfer codes stay in TLS request bodies or the bearer header, never URLs.
Session responses contain IDs and expiry, not bearer tokens. Responses use
`Cache-Control: no-store`; diagnostics omit URLs, headers, bodies, database errors
and credential values.

| Resource                            | Proof / behavior                                                                                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /sessions`, `kind: bootstrap` | Recovery credential plus persisted device/session proposal; create once or recover the same account.                                                                             |
| `POST /sessions`, `kind: recovery`  | Same proposal shape; only existing active credentials can recover. No fallback to account creation.                                                                              |
| `POST /sessions`, `kind: renewal`   | Bearer session plus persisted next session ID/token; exact retry after rotation.                                                                                                 |
| `POST /sessions`, `kind: transfer`  | Code and claimant secret redeem approval for exactly the saved new-device proposal.                                                                                              |
| `GET /sessions/current`             | Active verified session; authenticated account/device/session IDs and expiry.                                                                                                    |
| `GET /devices`                      | Owner-scoped device metadata.                                                                                                                                                    |
| `DELETE /devices/:id`               | Authenticated owner; soft revocation invalidates that device's sessions. No request body required.                                                                               |
| `GET /credentials`                  | Owner-scoped IDs, kinds and revocation timestamps; never secrets or digests.                                                                                                     |
| `POST /credentials`                 | Authenticated owner adds a sync credential or recovery key; stable ID permits exact retry.                                                                                       |
| `DELETE /credentials/:id`           | Authenticated owner soft-revokes a recovery credential. No request body required.                                                                                                |
| `POST /transfers`                   | New device persists code, claimant secret, recovery credential and session proposal.                                                                                             |
| `POST /transfer-inspections`        | Existing authenticated device inspects transfer status; no verification digits returned.                                                                                         |
| `POST /transfer-approvals`          | Existing authenticated device submits the six digits from the new device. No supplied owner ID.                                                                                  |
| `DELETE /transfers/:id`             | Receiver supplies its complete persisted proposal without a bearer; approving account may still cancel with bearer plus code. Returns receiver status `cancelled` or `redeemed`. |

Transfer codes have 64 random bits (16 hexadecimal characters, displayed in four groups). A separate 256-bit claimant secret is never displayed to the approving device. The new device alone receives six verification digits; the user enters them on the existing device to approve. Inspection never returns the digits. The server derives them with a transfer-specific HMAC domain under `IDENTITY_RATE_LIMIT_KEY` and stores only a second, independently domain-separated HMAC verifier bound to the transfer ID. Five incorrect submissions cancel the transfer; this counter persists across accounts, addresses and API instances. Transfers expire **10 minutes after creation** and do not reset their deadline on retry. The new device receives no session until approval and proof verification. Exact claimant retries return the same session; they cannot attach a different device or token. Expired/cancelled transfers require a new transfer. Once approved, another account cannot replace the owner, and previously redeemed approval is rejected. The protocol relies on keeping both the transfer code and verification digits private; possession of both permits an authenticated account to approve the pending transfer.

Failures return a typed code and a server-generated request ID. Oversized bodies return `413 REQUEST_TOO_LARGE`; unsupported content types return `415 UNSUPPORTED_MEDIA_TYPE`; any other 4xx keeps its status with `INVALID_REQUEST`. None is retried unchanged as a temporary outage; only failures without a client status return `503 UNAVAILABLE`. Authentication, expiry, revocation, conflict, pending transfer, rate limiting and temporary failures have distinct client states. Invalid JSON/contract inputs never echo supplied values. Client requests have a 10-second deadline and no automatic write retry loop. The controller serializes identity operations. A receiving transfer keeps the current account and session until successful redemption; other explicit recovery actions clear the visible account while switching. Uncertain non-transfer writes remain available for retry after relaunch. An unfinished receiving transfer is cancelled on navigation blur, Back, unmount or any non-active app state. A fresh process cancels a persisted transfer rather than resuming it.

## Receiving-transfer cancellation

The receiving screen owns one transfer visit. Leaving immediately hides its codes,
fences in-flight results, and moves its full proposal into a durable cancellation
queue in the device-only secure state. The previous session, recovery key and
credential selection stay intact until a transfer actually completes. Returning to
Account & recovery opens the normal hub. Starting again cancels the old proposal
first and generates a fresh code. Credentials for the new account enter the
synchronizing vault only after redemption succeeds; abandoned legacy items are
excluded from automatic account selection.

Receiver cancellation proves every original field: resource ID, code, claimant
secret, device/session IDs, token and recovery credential. It uses the same code
advisory lock as creation and a row lock shared with approval/redemption. If DELETE
arrives before POST, it creates an already-cancelled tombstone so the delayed POST
cannot revive the code. An already-redeemed result reconciles that exact committed
session rather than undoing a completed account switch. The approving-account
bearer-plus-code cancellation remains compatible and now locks the row too.

Background/Back cancellation attempts server cleanup immediately. Force termination
and loss of connectivity cannot guarantee delivery: startup, foreground and network
reconnection retry the saved cleanup. The UI shows pending server confirmation;
it never resumes the abandoned receiving screen. The existing ten-minute server
expiry remains a final bound. No native bridge change or database migration is
required. Deploy the API update before testing this behavior with a phone connected
to the hosted test server; an older API rejects the receiver proof and leaves
cleanup pending.

## Terms & Privacy receipts

Phase 10 adds `GET/PUT /v1/account/acceptance`. Both derive the owner from the current session and use its transaction/owner lock, independently of paid access. Shared contracts define the Terms, Privacy Policy and analytics-scope versions. Server time records acceptance; retrying unchanged versions preserves that time. Migration `0017_account_acceptance` adds the forced-RLS owner table and an account privacy-restriction timestamp. Deletion removes the receipt; a privacy restriction survives reacceptance and never blocks product saving/access. User-requested export includes the receipt and restriction status.

The pending secure bootstrap retains nonsecret accepted versions through lost responses and relaunch; normal confirmed receipts come from the server, not another account’s device state. Phase 11 consumes the shared eligibility rule and the mobile controller’s generation tickets. The server adapter rereads live owner/receipt/restriction for each delivery decision and fails closed on errors; never cache that decision or hold an owner transaction while awaiting a provider. No exporter is enabled.

## Database boundary

Drizzle migrations `0001_identity.sql` and `0002_identity_policy_read_paths.sql` add users, devices, recovery credentials, sessions, transfers and rate buckets. All six tables enable and force RLS. No grants go to `PUBLIC`, Supabase `anon` or `authenticated`; no new `SECURITY DEFINER` functions are used. The original identity runtime privileges were select/insert/update. Migration 0014 adds DELETE for account cleanup resources and a digest-bound read of the original deletion receipt; it does not grant deletion of user/credential tombstones. Forward migration 0016 restricts transfer DELETE to the owner even when a transaction has a matching transfer-code digest, preserving cancellation tombstones. The separate migrator has an explicit maintenance policy and can perform reviewed cleanup/migrations.

Pre-authentication policies allow **only a digest-matching read** of the presented recovery/session record. The API validates revocation, expiry, account and device status before setting transaction-local owner context. Bootstrap alone may create a new server-generated user ID after verifying a previously unseen credential digest. Transfer access uses a transaction-local code digest and still requires API proof/approval checks; RLS alone is not authentication.

`IdentityService.withSession(token, callback)` is the authenticated entry point for future domain operations. It verifies the token, locks the owner row, rechecks session/device state after the lock, and supplies the same transaction to the callback. Use that transaction for all owner queries; do not nest a second database transaction or accept a `userId` from a request. It preserves the phase one `withOwner` transaction-local ownership model. Keep transactions short and perform external provider calls outside them.

Digest uniqueness, composite user/device foreign keys, owner indexes and one read policy per role/action provide database enforcement. A forward migration consolidated overlapping read policies reported by the advisor. Informational unused indexes on newly created, empty tables are retained because they support known owner/cleanup access paths.

## Rate limits and deployment

PostgreSQL atomically counts attempts in ten-minute windows across warm instances:

- 120 identity requests per client address per window.
- 30 bootstrap/recovery/transfer attempts per address per window (configurable within 1–100).
- On rejection: HTTP 429 and conservative `Retry-After: 600`.

Bucket keys are HMACs under `IDENTITY_RATE_LIMIT_KEY`; raw addresses and secrets are not stored. Set an independent random key of at least 32 characters in Vercel’s **preview Secret** environment; production startup rejects the local development default. Session hours and transfer minutes are configurable as `IDENTITY_SESSION_HOURS` and `IDENTITY_TRANSFER_MINUTES`.

Direct servers use the connection address and ignore forwarded headers. Only the Vercel runtime uses the edge-controlled `x-vercel-forwarded-for` header after IP validation. A proxy in front of Vercel may share a rate bucket; test that deployment topology before rollout. These application limits are not volumetric DDoS protection or measured capacity claims. [Vercel request-header behavior](https://vercel.com/docs/headers/request-headers).

Apply migrations with the operator’s separate migration connection before deploying. `.vercelignore` includes the identity contracts while excluding credentials, tests, native sources and local files. Mobile identity traffic requires HTTPS except loopback in development; a plaintext LAN URL is not accepted. Protected staging still needs an approved reachable route before physical-phone testing. Never bundle a deployment protection bypass secret in the app.

## iPhone storage and browser preview

`apps/mobile/modules/justgo-keychain` is a local Expo Swift module. It stores immutable recovery items with `kSecAttrSynchronizable=true` and `kSecAttrAccessibleWhenUnlocked`. Each recovery item has its own UUID account key so delayed sync does not overwrite another credential. It uses the app’s default signing-derived Keychain access group; the permanent bundle identifier, signing team and access-group continuity must be verified on physical phones.

Device state uses a separate non-synchronizing `WhenUnlockedThisDeviceOnly` item. A UserDefaults installation marker selects that installation’s item; UserDefaults contains no secret. Secure state includes only credentials, session metadata and pending identity operations, with no journal or persistent domain cache in Keychain. Phase 07 separately stores submitted completed activity/upload intent and the limited downloaded catalog/summary/current-month/today caches in account-scoped AsyncStorage. Storage errors, malformed contents, and locked Keychain access are failures, never an empty-store result. A missing native module fails visibly; there is no insecure native fallback.

The controller preserves all discovered credentials except when confirmed account deletion removes verified matching items through the updated Keychain module. Multiple candidates require explicit selection. A late candidate is listed without switching an authenticated account. Recovery keys and explicit transfer provide fallback when sync is unavailable. The recovery UI hides a displayed key when the app backgrounds and rechecks identity on foreground. Settings and export are implemented; [Phase 08 deletion](../handoffs/phase-08-settings-privacy.md) adds a durable request/receipt/cleanup workflow and guards older native binaries before destructive requests. Physical acceptance and hosted rollout remain open.

The web page is explicitly a development test surface. Its identity vault lives only in JavaScript memory; reload/closing the tab loses those credentials. The Phase 07 activity adapter can persist its account-scoped catalog/journal in browser storage, independently of identity. Saved journeys explicitly recover the same synthetic account after reload; browser storage proves no native Keychain or AsyncStorage behavior. It uses real API authentication but proves no Keychain persistence, iCloud sharing or real-device security. Do not point browser testing at valuable user accounts.

References checked during implementation: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo Modules](https://docs.expo.dev/modules/get-started/), [Expo Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/), [Apple synchronizable Keychain items](https://developer.apple.com/documentation/security/ksecattrsynchronizable), [Postgres RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Exact native behavior still requires the device matrix in the handoff.

## Retention and recovery operations

`DELETE /v1/account` requires an active session and explicit `delete-account` confirmation, derives ownership from that session and shares the owner lock with uploads/recovery. The original deleting proof can retrieve a durable receipt after its session row is removed. Revoked credentials and approved-transfer credential fingerprints remain blocked. See the [deletion handoff](../handoffs/phase-08-settings-privacy.md) for cleanup, rollout and backup-restoration gates.

Do not purge revoked/deleted recovery digests: retaining their tombstones prevents credential resurrection. Session history supports rotation/revocation and uncertain-response recovery; retain it until a reviewed retention policy exists. The [October 16 retention defaults](../DECISIONS.md#october-16-codebase-assessment-follow-up) keep deletion receipts and revoked-credential tombstones permanently; restores follow the [backup restore checklist](../operations/FOUNDATION.md#backup-restore-checklist), which reapplies deletions before reopening writes.

Rate buckets older than 30 days and unredeemed transfers expired more than 24 hours ago are removed in bounded batches using their indexed timestamps. Migration 0015 adds `justgo.purge_expired_identity_records(batch_limit)`: each call deletes at most `batch_limit` (1–10000, default 1000) rows of each kind and returns the counts. It runs with invoker rights, `PUBLIC` cannot execute it, and it never touches deletion receipts, revoked credential tombstones or redeemed transfers. The migration role runs it from a scheduler (Supabase `pg_cron` or a protected workflow) that is configured separately with owner approval; until then no hosted schedule exists. Protect any future maintenance endpoint separately; do not grant the mobile runtime administrative deletion access. Never run test suites against staging; integration tests refuse non-loopback databases and use unique fixtures in `justgo_test`.

For the original additive identity migrations, an API rollback can leave the tables in place. Phase 07 retires the old wire protocol and contracts product tables, so reverting an old API against the contracted schema is unsafe. Follow the [coordinated cutover/backup/forward-repair procedure](../operations/FOUNDATION.md#phase-07-coordinated-cutover-and-old-clients). Do not reset staging or remove credential history to retry a deployment.

Account recovery restores uploaded server history and hydrates only the current app account's available local journal. It cannot recover an only-device pending copy from another installation. Same-account renewal preserves accepted local records; explicit account switches fence reads/uploads, hide prior views and keep any pending/memory-only content in its original partition. Provider purchase restoration does not prove ownership of private history. Production verification/coverage integration remains Phase 07A.

## Account deletion and development-build safety

- Account deletion must persist its intent and confirmed receipt before cleanup,
  stop uploads, drain accepted storage writes and remove only the selected account's
  data. Preserve credential tombstones and same-proof retry behavior; delayed
  recovery/iCloud credentials must never recreate a deleted identity. Follow the
  [identity boundary](#account-deletion-and-development-build-safety) and keep native cleanup
  capability checks ahead of destructive requests.
- Native development worktrees share the installed app's Keychain namespace.
  Compare persisted schemas when switching worktrees and preserve known newer
  recovery/deletion safety metadata. A schema rejection can appear as a generic
  secure-storage error; do not reset Keychain or loosen validation to hide it.
  Cover format compatibility and account preservation with synthetic fixtures.
