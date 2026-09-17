# Identity and recovery implementation

Phase 02 uses the custom no-signup identity design in [TECH_STACK.md](TECH_STACK.md#4-frictionless-identity-and-recovery). Supabase hosts PostgreSQL; there is no Supabase Auth or direct mobile database access. See the [phase handoff](handoffs/phase-02-identity.md) for actual verification and remaining device acceptance.

## Credential and session rules

- Recovery credentials and device session tokens contain 32 cryptographically random bytes, encoded as 64 lowercase hexadecimal characters. Mobile uses Expo Crypto `getRandomValues`, which has no development `Math.random` fallback. Node uses standard cryptographic primitives. PostgreSQL receives SHA-256 digests, never the bearer secrets.
- A device session expires after **168 hours (7 days)**. The client renews on foreground/verification when fewer than 24 hours remain. An expired session can recover through its selected credential; a revoked or unknown session requires an explicit recovery action.
- Renewal proposes and securely saves the next token and ID before sending it. The old token is immediately invalid for ordinary API requests after rotation. Retrying the same rotation can retrieve the same still-active result when the caller proves possession of both tokens. A different replacement is rejected. Other devices remain independent.
- Recovery credentials are long-lived, independently revocable, and immutable. Revocation does not log out other active device sessions. Device revocation invalidates that device’s sessions; explicit recovery establishes a new device authorization. Account retirement revokes all credentials/sessions and cancels transfers. Tombstones prevent retired/revoked credentials from bootstrapping a new account.
- Bootstrap serializes on the recovery digest and is idempotent. The client saves a pending intent and then the recovery item before contacting the API. Unknown credentials presented to `/recover` are never sent to `/bootstrap` as a fallback. Failed/lost responses reuse the persisted proposal.

These defaults can be tuned with bounded server environment variables. Changing them requires the relevant expiry/retry tests; it does not require a new product flow.

## API contracts

All routes below are under `/v1/identity`. Requests and responses are strict Zod contracts in `packages/contracts/src/identity.ts`. Authenticated calls require `Authorization: Bearer <device session token>`. Secrets are only in TLS request bodies or that header, never URLs. Successful session responses contain IDs and an expiry, not bearer tokens. Responses use `Cache-Control: no-store`; diagnostics omit URLs, headers, bodies, database errors and credential values.

| Route                          | Proof / behavior                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `POST /bootstrap`              | Recovery credential plus persisted device/session proposal; create once or recover the same account.    |
| `POST /recover`                | Same proposal shape; only existing, active credentials can recover.                                     |
| `POST /renew`                  | Current session plus persisted next session ID/token; same-result retry after rotation.                 |
| `GET /me`                      | Active server-verified session; returns the authenticated account/device/session IDs and expiry.        |
| `GET /devices`                 | Owner-scoped device metadata.                                                                           |
| `POST /devices/:id/revoke`     | Authenticated owner; revokes all sessions on that device.                                               |
| `GET /credentials`             | Owner-scoped IDs, kinds and revocation timestamps; never secrets or digests.                            |
| `POST /credentials`            | Authenticated owner adds an independent sync credential or recovery key; stable ID permits exact retry. |
| `POST /credentials/:id/revoke` | Authenticated owner revokes a recovery credential.                                                      |
| `POST /transfers/start`        | New device persists a code, claimant secret, new recovery credential and session proposal.              |
| `POST /transfers/inspect`      | Existing authenticated device enters the code to see verification numbers.                              |
| `POST /transfers/approve`      | Existing authenticated device explicitly approves matching numbers. No caller-supplied owner ID.        |
| `POST /transfers/redeem`       | Code and claimant secret redeem approval for exactly the saved new-device proposal.                     |
| `POST /transfers/cancel`       | Approving account can cancel an approved, unredeemed transfer.                                          |

Transfer codes have 64 random bits (16 hexadecimal characters, displayed in four groups). A separate 256-bit claimant secret is never displayed to the approving device. Six verification digits let the user compare the two screens. Transfers expire **10 minutes after creation** and do not reset their deadline on retry. The new device receives no session until approval and proof verification. Exact claimant retries return the same session; they cannot attach a different device or token. Expired/cancelled transfers require a new transfer. Cross-account approval and previously redeemed approval are rejected.

Failures return a typed code and a server-generated request ID. Authentication, expiry, revocation, conflict, pending transfer, rate limiting and temporary failures have distinct client states. Invalid JSON/contract inputs never echo supplied values. Client requests have a 10-second deadline and no automatic write retry loop. The controller serializes identity operations and clears the visible account when explicitly switching identities. A persisted uncertain write remains available for retry after relaunch.

## Database boundary

Drizzle migrations `0001_identity.sql` and `0002_identity_policy_read_paths.sql` add users, devices, recovery credentials, sessions, transfers and rate buckets. All six tables enable and force RLS. No grants go to `PUBLIC`, Supabase `anon` or `authenticated`; no new `SECURITY DEFINER` functions are used. Runtime has only select/insert/update privileges. The separate migrator has an explicit maintenance policy and can perform reviewed cleanup/migrations.

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

Device state uses a separate non-synchronizing `WhenUnlockedThisDeviceOnly` item. A UserDefaults installation marker selects that installation’s item; UserDefaults contains no secret. Secure state includes only credentials, session metadata and pending identity operations, with no journal or persistent domain cache. Storage errors, malformed contents, and locked Keychain access are failures, never an empty-store result. A missing native module fails visibly; there is no insecure native fallback.

The controller preserves all discovered credentials. Multiple candidates require explicit selection. A late candidate is listed without switching an authenticated account. Recovery keys and explicit transfer provide fallback when sync is unavailable. The recovery UI hides a displayed key when the app backgrounds and rechecks identity on foreground. Final Settings design, exports and deletion UI remain phase 09 work.

The web page is explicitly a development test surface. Its vault lives only in JavaScript memory; reload/closing the tab loses those credentials. It uses real API authentication but proves no Keychain persistence, iCloud sharing or real-device security. Do not point browser testing at valuable user accounts.

References checked during implementation: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/), [Expo Modules](https://docs.expo.dev/modules/get-started/), [Expo Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/), [Apple synchronizable Keychain items](https://developer.apple.com/documentation/security/ksecattrsynchronizable), [Postgres RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Exact native behavior still requires the device matrix in the handoff.

## Retention and recovery operations

Do not purge revoked/deleted recovery digests: retaining their tombstones prevents credential resurrection. Session history supports rotation/revocation and uncertain-response recovery; retain it until a reviewed retention policy exists. The phase 09 privacy/deletion work must define policy and backups before release.

Rate buckets older than 30 days and unredeemed transfers expired more than 24 hours ago can be removed by the migration operator in bounded batches using their indexed timestamps. No scheduler or production retention job is claimed in phase 02. Protect any future maintenance endpoint separately; do not grant the mobile runtime administrative deletion access. Never run test suites against staging; integration tests refuse non-loopback databases and use unique fixtures in `justgo_test`.

For rollback, revert the API deployment independently. The additive tables are safe to leave in place. Repair schema issues through new reviewed migrations. Do not reset staging or remove credential history to retry a deployment.
