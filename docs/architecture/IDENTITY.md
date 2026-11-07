# Identity, optional accounts and recovery

The API is the trusted boundary for JustGO data. Mobile never reads private
PostgreSQL tables directly. Shared Zod contracts and the generated OpenAPI own
route payloads. Provider settings live in
[ACCOUNT_SYNC_SETUP.md](../operations/ACCOUNT_SYNC_SETUP.md). The open
physical-device gate issues (#81, #82, #83, #85, #105), the identity security
review (#100) and the hosted existing-phone migration (#117) track the remaining
acceptance. This file keeps the rules that tests do not pin and the reasons
that code cannot show.

## Guest and account ownership

Continuing without sign-in creates a durable local collection, not a JustGO or
Supabase Auth account. Guest identity never grants paid access.

Signing in adopts the unconsumed guest source into the verified account after
the cloud-sync disclosure. The durable `guestAdoption` marker binds the source
to one destination:

| State      | Meaning                                                         | Rule                                                                                                  |
| ---------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pending`  | The source is bound to one verified account. Copying can stop.  | Keep the source. Retry copies only into the bound account. Fence source writes once copying succeeds. |
| `copied`   | The destination is durably selected. Source retirement remains. | Erase the old local source only now. The guest iCloud copy was handed over during copying.            |
| `consumed` | Retirement finished.                                            | Never adopt the source again.                                                                         |

Managed state from before the marker needs one disclosed sign-in before it
adopts previously excluded guest writing. Background session restoration never
infers that permission.

Logout fences account requests at once and persists its pending operation. It
revokes the JustGO app session before the provider SDK signs out. Account writing
retained on the phone never becomes guest data for another account.
`offlineAccountOwner()` exposes only a local beta-admission scope. That scope
never authenticates a request or enables synchronization.

## Switching the active provider

On November 2, 2026, Anthony chose Account's Apple and Google switches to show
the active sign-in provider, not the linked identities. At most one is on. The
active switch opens the Log out confirmation, and an off switch opens that
provider's sign-in page. The switches never link or unlink identities, and
linked identities stay intact.

- Cancellation or failure before the provider SDK replaces its session keeps the
  old login. The SDK notifies a new session before its sign-in promise resolves,
  so fence account requests as soon as that session changes, even for a
  same-subject token replacement.
- Keep the source bearer only in secure storage until its JustGO app session is
  revoked, then adopt the destination under the ownership rules above. Logout
  revokes a leftover source proof, and accepted account deletion clears it.
- Restore a changed source bearer only after trusted session verification matches
  the saved owner, Auth subject and app-session ID. A completed switch resumes at
  startup without another provider prompt. An exchange that cannot prove which
  provider completed keeps the old journal and asks the user to sign in again.
- The active provider is a display fact. Successful sign-in saves it. Older
  installations fall back to the most recently signed-in supported identity. It
  never establishes ownership or grants access.

## Sessions and verification

**Security acceptances.** Apple sign-in sends the SHA-256 form of a random nonce
to Apple and the original to Auth. Apple nonce validation stays enabled. The
pinned Google iOS wrapper neither accepts nor returns its SDK-generated nonce, so
Supabase's
[documented iOS setup](https://supabase.com/docs/guides/auth/social-login/auth-google#ios-configuration)
requires Skip nonce checks for Google. That exception is explicitly authorized
for this integration. Auth still verifies token signatures and client audiences.
Never invent a nonce, and never apply the exception to Apple.

Only a verified Apple or Google Auth subject establishes ownership, mapped
through `managed_auth_accounts` to one canonical owner. A purchase receipt,
public user ID, email address, decoded JWT claim, editable metadata, downloaded
file or client request field never does. Never merge accounts by email,
including a hidden Apple email or a different Google email.

Auth verification and the server-error reporter use `redirect: 'manual'` and
treat 3xx as `UNAVAILABLE` without reading the body, because Workers rejects
`redirect: 'error'` before it sends the request. Cover both paths with native
Workers `Request` validation, not only mocked fetch calls.

A valid JWT does not prove the session is still live after logout or deletion.
Hosted Supabase cannot grant Auth-schema access to custom roles, so the
postgres-owned `justgo_auth_private.is_live_session_v1(uuid,uuid)` helper returns
only a live boolean for the exact verified session and subject. Only
`justgo_runtime` may execute it. See
[Supabase session semantics](https://supabase.com/docs/guides/auth/sessions) and
[the supported private-helper pattern](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema).

Run verification I/O before the short owner transaction. Never run external
provider I/O or diagnostics while an owner transaction is open. Bearers stay in
headers or permitted TLS bodies, never URLs. Responses never carry new bearer
secrets. Identity, writing, recovery and deletion never depend on analytics or
diagnostic delivery.

## Database

`IdentityService.withSession` sets transaction-local context only after trusted
verification. Never accept a request owner ID, use session-level `SET` or query
on another connection. Private `justgo` tables get no grants to Supabase `anon`,
`authenticated` or `PUBLIC`. The Auth-session helper is the only definer-rights
capability. It returns no records and changes no data. See the
[operator setup](../operations/ACCOUNT_SYNC_SETUP.md#live-auth-session-privileges).

Managed exchange and existing-proof recovery run through Hyperdrive with
ordinary transactions and owner row locks. Existing-proof recovery creates no
missing credential, so it takes no advisory lock. The owner lock plus a
credential re-read protects revocation. Legacy bootstrap creation and transfers
take advisory locks. `createWorkerDatabase` sends the `needsDirectTransaction`
paths (`POST /v1/sessions`, `POST /v1/transfers` and
`DELETE /v1/transfers/:id`) to one direct connection only when
`MANAGED_AUTH_ENABLED` is false, which Worker config allows only against
loopback `justgo_test`. Workers' direct TLS sockets cannot use the Supabase
private CA, so hosted Workers never take that path.

## Data and account deletion

Each account has a `data_epoch` that only increases.

| Event                | Rule                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload               | Read the server epoch first. An advanced epoch fences and clears stale local activity. Writes send the observed epoch.                             |
| Delete all my data   | Pin the original expected epoch. A lost acknowledgement reuses that intent and never erases records created after the original deletion.           |
| `DATA_EPOCH_CHANGED` | Reconcile. It is not a temporary delivery failure.                                                                                                 |
| `DATA_DELETED`       | Stop ordinary retry. It is not a temporary delivery failure.                                                                                       |
| Import data          | Only a user-confirmed import may send `restoreDeleted: true` at the current epoch. Background sync never adds it or silently restores deleted IDs. |
| Local cleanup        | Local and iCloud cleanup follow the durable remote result, even with sync off. A changed or unavailable Apple account keeps cleanup pending.       |

Staging runs `justgo.purge_expired_identity_records` hourly (the
[identity retention job](../operations/TESTFLIGHT_BETA.md#identity-retention-job)).
No hosted schedule runs the operator Auth cleanup (`npm run auth:cleanup`). Any
other hosted schedule needs separate approval.

Deletion receipts, canonical subject tombstones, deleted record IDs and revoked
or retired proof digests must survive purge and database restoration. A restore
reapplies deletions before writes reopen. See the
[restore checklist](../operations/CLOUDFLARE_BACKUPS.md#restore-checklist).

## Device storage

Managed access and refresh sessions use a separate Expo SecureStore adapter with
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Tokens never go to AsyncStorage, journal
databases, exports or diagnostics. Locked storage fails visibly and is never an
empty credential store. Generate secrets as 32 bytes from `expo-crypto`
`getRandomValues`, never `getRandomBytes`, whose debugging fallback uses
`Math.random`.

## Internal legacy migration compatibility

Old installations may still hold recovery-key proofs. Keep these paths until
the supported migration window closes, meaning every supported old installation
has linked its owner or finished its pending deletion, or the owner explicitly
approves ending that support:

- Mobile keeps the legacy controller for pending legacy deletion, plus proof
  renewal, frozen exchange proofs, linked-owner markers, secure-vault reads and
  the local Swift Keychain module. Recovery items and device-only session
  proposals stay until linking or deletion reconciles them.
- Managed mode disables key, code, device and transfer administration and
  bootstrap and transfer creation. The API keeps `GET /v1/sessions/current`,
  recovery and renewal forms of `POST /v1/sessions`, and original-proof replay of
  pending legacy deletion. The default legacy API mode stays until the
  coordinated rollout.

PostgreSQL stores SHA-256 hex digests (`digest` in
`apps/api/src/identity/service.ts`). Never change the algorithm: stored digests
and revoked-proof tombstones would stop matching.

These are internal compatibility paths, not account UI options. Migration
`0003_transfer_verification` erased plaintext transfer verification. Never
restore an older transfer API against that schema.
