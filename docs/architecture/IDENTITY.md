# Identity, optional accounts and recovery

Phase 13 adds local guest collections and optional Apple/Google accounts through
Supabase Auth. The API remains the trusted boundary for JustGO data; mobile does
not access private PostgreSQL tables directly. The authorized staging rollout
applied migrations 0019–0023 and configured native Apple/Google Auth. Current setup
and remaining signed-device acceptance are recorded in
[ACCOUNT_SYNC_SETUP.md](../operations/ACCOUNT_SYNC_SETUP.md). Public release and
iCloud acceptance remain separate.

## Guest and account transitions

Continuing without signing in creates a durable local collection, not a JustGO or
Supabase Auth account. Guest writing stays on the phone unless the user enables
the separate iCloud copy or proceeds through the disclosed account sign-in. Guest
catalog access still needs verified eligibility: production denies access until
the purchase boundary exists; an explicitly bounded staging beta window may
permit it. Guest identity never grants paid access.

Before Apple/Google sign-in, the flow explains that signed-in challenge history,
feelings and reflections synchronize to JustGO's cloud and that saved phone entries
are included. There is no optional merge switch or separate guest-data selector.
Signing in adopts the unconsumed guest source into the verified account and
downloads that account's completion history and journal together. A purchase
receipt, public user ID, email address or downloaded file cannot authenticate it.

The durable `guestAdoption` marker binds the source to one destination. `pending`
retains the source through interrupted copying; `copied` means the verified
destination is durably selected and source retirement remains; `consumed` means
retirement finished. Retry cannot silently copy a bound source into another
account. Stable record IDs and preserved alternatives make replay idempotent.
Source writes remain fenced between successful copying and durable selection;
the associated guest iCloud copy is handed over during copying, and the old local
source is erased only after durable destination selection.
An interrupted storage write keeps the recoverable source or selected destination.
Older managed state without an adoption marker requires disclosed sign-in once
before adopting previously excluded guest writing; background session restoration
must not infer that permission.

Logout immediately fences account requests and persists its pending operation.
It revokes the JustGO app session before signing out the provider SDK. Saved local
content remains in the same owner collection, readable, editable and exportable.
Signing back into that account synchronizes later local edits. Signing into another
account selects its own journal; retained account writing never becomes guest data
eligible for upload to it. Account
changes fence stale callbacks, queries and writes. Pending or memory-only writing
belongs to the collection that accepted it.

Transient offline restoration keeps a saved account-owned collection selected.
`offlineAccountOwner()` exposes only its local beta-admission scope while the
normal account projection/session stays unavailable. It excludes pending sign-in,
logout/deletion, explicit revocation and provider detachment, including a provider
change while the account projection is already null. Only successful owner
verification or disclosed sign-in can clear the provider-detachment fence. A
provider generation check prevents verification/adoption finishing an older
storage write from clearing a newer detach event. An already-fenced logout or
deletion does not republish the erased owner after cleanup: runtime subscribers
could otherwise reopen its journal. The
[app-shell access policy](APP_SHELL.md#access-verification) owns beta approval;
this local scope never authenticates a request or enables synchronization.

## Managed sessions and canonical owners

Native Apple and Google sign-in produce provider ID tokens for
`@supabase/supabase-js`. Apple uses a random nonce, sending its SHA-256 form to
Apple and the original to Auth; Apple nonce validation stays enabled. The pinned
original Google iOS wrapper neither accepts nor returns its SDK-generated nonce.
Supabase's [documented iOS setup](https://supabase.com/docs/guides/auth/social-login/auth-google#ios-configuration)
therefore requires Google-only Skip nonce checks, explicitly authorized for this
integration. Auth still verifies token signatures and configured client audiences;
never invent a nonce or apply this exception to Apple. The development web adapter
uses PKCE and an allowlisted callback; real browser OAuth is separate configuration.
Guarded browser fixtures do not establish native provider behavior.

The API verifies each bearer through Supabase Auth's get-user endpoint, then
checks issuer, expiry, authenticated audience/role, subject and session ID against
the verified user. Only nonanonymous Apple/Google identities are accepted. Decoded
JWT claims, editable metadata and email matching never establish ownership by
themselves. `managed_auth_accounts` maps that verified subject to a canonical
JustGO owner. Client requests cannot select that owner.

Concurrent first sign-ins compete on that mapping's unique Auth-subject key.
A losing transaction rolls back its candidate owner before one fresh attempt;
it never leaves an unlinked owner behind. Existing owner row locks serialize
session creation, revocation and deletion. Retrying still verifies the provider
and live session and rejects a deleted canonical owner.

JWT signature/expiry alone is insufficient for logout or deletion enforcement.
Every owner operation also checks the matching live `auth.sessions` row,
`not_after`, the registered JustGO app session, local revocation and the canonical
owner's deletion state. Verification I/O happens before the short database
transaction; live session and owner state are checked again under the owner lock.
Hosted Supabase does not support direct Auth-schema grants to custom roles.
A versioned, postgres-owned `justgo_auth_private.is_live_session_v1(uuid,uuid)`
helper exposes only the exact verified session/subject's live boolean, using a
fixed empty search path and fully qualified Auth objects. Only `justgo_runtime`
may use/execute this private capability; it cannot read Auth records directly.
Readiness checks the executable body, ownership, security settings, effective
privileges and managed application schema, failing closed on mismatch. See
[Supabase session semantics](https://supabase.com/docs/guides/auth/sessions) and
[the supported private-helper pattern](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema).

| Resource                                       | Behavior                                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/auth/session`                        | Verified provider bearer plus device ID; map/register the app session. Optional frozen legacy bearer links an existing owner. |
| `GET /v1/auth/session`                         | Reverify provider, live session, app revocation and owner; return canonical IDs, expiry and data epoch.                       |
| `POST /v1/auth/logout`                         | Revoke this JustGO app session or all its owner's app sessions; the client then signs out the provider SDK.                   |
| `GET /v1/guest/access`, `/v1/guest/challenges` | No account creation; catalog delivery still requires trusted guest eligibility.                                               |
| `GET` / `POST /v1/completion-restores`         | Owner-scoped paged history and stable completion import; expected deletion epoch on writes.                                   |
| `GET` / `POST /v1/journal-sync`                | Managed account only; immutable private versions, ancestry and historical context.                                            |
| `DELETE /v1/data`                              | Delete activity/journal while retaining account and entitlement; durable epoch-based retry.                                   |
| `DELETE /v1/account`                           | Explicit ownership-confirmed account erasure, including managed Auth user cleanup and replayable receipt.                     |

Shared strict schemas and generated OpenAPI own exact payloads. Bearers remain in
headers or explicitly permitted TLS bodies, never URLs. Responses contain IDs and
expiry, never new bearer secrets. Requests use no-store responses and safe typed
errors/request IDs; diagnostics omit headers, bodies, tokens and private writing.

Provider linking requires an already authenticated account and verified provider
flow. The controller checks that both Auth subject and canonical JustGO owner
remain unchanged. Supabase's provider identity linking does not replace the
separate legacy ownership proof. Hidden Apple email and different Google email
must never trigger custom email-based merges.

The Account page's Apple and Google switches reflect verified linked identities.
Signed-out switches open the disclosed sign-in flow; signed-in off switches link
that provider, and on switches request unlinking. Unlinking rechecks the identity
and cannot remove the last supported login method. Failure leaves the verified
switch state intact and shows feedback. Log out is a separate action; Delete
account is red. No separate signed-in status block or guest-data row is shown.

## Journal synchronization and data deletion

SQLite remains the durable phone journal. Signed-in synchronization saves locally
first and sends dedicated immutable versions with stable UUIDs and parent IDs.
Concurrent writing is preserved as alternatives; acknowledgement marks durable
versions rather than overwriting phone content. Completion payloads contain no
private reflection fields. Journal-only entries from compatible earlier backups
retain their historical context without inventing completed reps. The retired
legacy private PATCH remains retired.

Each account has a monotonically increasing `data_epoch`. A client reads the
server epoch before uploading; an advanced epoch fences and clears stale local
activity. Writes require the observed epoch. Delete all records tombstones for
completion IDs and journal-only IDs, clears live data and advances the epoch.
`DATA_EPOCH_CHANGED` requires reconciliation; `DATA_DELETED` stops ordinary retry.
Neither error is a temporary delivery failure. Only a user-confirmed Import data
flow may send `restoreDeleted: true` at the current epoch. Background sync never
adds that flag or silently restores deleted IDs. Stable completion IDs prevent
duplicate reps. See [ACTIVITY_DATA.md](ACTIVITY_DATA.md) for merge and file rules.

Delete all my data pins its original expected epoch before the request. A lost
acknowledgement reuses that intent and observes the advanced epoch; retrying must
not erase records created after the original deletion. Local and previously
associated iCloud cleanup follow the durable remote result, including when the
sync toggle is off. An unavailable or changed Apple account keeps cleanup pending
instead of reporting completion. Downloaded files remain under the user's
control. Manual files carry data only, never credentials or sessions; importing
an account-owned file cannot claim a different account. For a signed-out account
collection, Import data requires sign-in to its owner before opening the picker.
The flow returns to Data; sign-in alone never imports or confirms a deletion.

## Account deletion and development-build safety

Account deletion checks native cleanup capability before making a destructive
request. It persists the intent and freezes the original provider bearer in a
separate OS-secure deletion-proof item. Activity uploads and private-store
admission stop, and accepted writes drain before cleanup. Only the selected
collection's journal, completion/preferences keys and app temporary files are
removed. Cleanup accepts already absent databases and remains retryable.

The server owner transaction removes activity, revokes app and legacy sessions,
records a deletion receipt and queues `managed_auth_deletions`. It performs
server-only Supabase Auth hard deletion outside that transaction and records
completion durably before returning final success. If provider cleanup fails, the
account is already fenced and the request returns unavailable. The exact original
bearer digest can retrieve/replay only that deletion receipt even after Auth has
removed its session/user. It cannot regain ordinary account access. The client
saves the confirmed receipt before local/iCloud cleanup and provider sign-out.

The bounded operator cleanup command retries pending Auth erasures when a phone
never reconnects. No hosted schedule is configured by adding it. Deletion receipts,
canonical subject tombstones, deleted record IDs and revoked credential digests
remain protected from purge/backup resurrection. Restore operations must reapply
deletions before reopening writes; see the
[backup checklist](../operations/FOUNDATION.md#backup-restore-checklist).

Native worktrees share the installed app's Keychain namespace. Preserve newer
known pending-deletion and identity metadata when switching builds; storage/schema
errors are failures, never permission to reset Keychain or bootstrap replacement
accounts. Signed SQLite protection, provider logout/deletion, restored backups and
iCloud multi-device cleanup remain physical-device acceptance gates.

## iPhone storage and browser preview

Managed access/refresh sessions use a separate Expo SecureStore adapter with
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`, a private service name and verified bounded
chunks. Two slots and a manifest commit retain the previous accepted value if a
write fails. Locked/unavailable/malformed storage fails visibly. Tokens never go
to AsyncStorage, journal databases, exports or diagnostics. Nonsecret controller
state records pending operations and selected collection ownership separately.

The existing local Swift Keychain module remains only for internal migration and
old pending deletion/recovery proofs. Immutable synchronizable recovery items and
device-only session proposals are preserved until successful linking/deletion
reconciliation. No private journal is stored in Keychain. AsyncStorage owns
completion/cache/preferences envelopes; account/guest SQLite owns writing. The
optional private CloudKit copy is a separate opt-in destination and does not prove
JustGO account ownership.

The browser remains a development surface. Its guarded provider fixture stores
only disposable run-owned proofs, uses actual API mapping/RLS, and refuses hosted
destinations. Real web Auth uses PKCE and its platform session adapter. Browser
storage, injected providers and Node SQLite tests establish no native Keychain,
Apple/Google sign-in, iCloud or signed-device security evidence.

## Internal legacy migration compatibility

The installed app removes the old recovery-key/device/transfer presentation and
routes old URLs to Account. Welcome, acceptance and Account use the managed
controller directly. Retain the legacy controller only for pending legacy
deletion and its shared snapshot type; retain proof renewal, frozen exchange
proofs, linked-owner markers and secure-vault reads until supported existing
installations finish migration/cleanup. Managed SecureStore tokens remain required.

Managed rollout disables public key/code/device/transfer administration and old
bootstrap/transfer creation. It temporarily retains `GET /v1/sessions/current`
and recovery/renewal forms of `POST /v1/sessions` so a phone with existing secure
proofs can authenticate its old owner before provider linking. Pending legacy
account deletion may still replay its original proof/receipt. The default legacy
API mode remains available until coordinated rollout; these are internal
compatibility paths, not current account UI options.

Linking proves both an active provider session and the existing legacy session.
The unique Auth-subject mapping and owner locks preserve the canonical owner and atomically
revoke that owner's old sessions/credentials/transfers. A lost response may
confirm the same already-linked owner with its frozen old proof; a revoked proof
cannot create a fresh mapping. If concurrent linking revokes a legacy proof after
an exchange read an absent mapping, one retry is allowed only after a fresh
verified-subject lookup proves its mapping now exists. The retry still validates
the exact legacy proof against that mapped owner. Existing-proof recovery creates
no missing credential and uses the owner lock plus a credential re-read, without
an advisory lock. The phone commits its linked-owner marker with
the exchange result before removing the frozen proof, so later provider sign-in
does not try to reuse revoked legacy credentials.

Historical safety rules remain in force:

- Credentials and session tokens use 32 cryptographically random bytes, encoded
  as 64 lower hexadecimal characters. PostgreSQL stores SHA-256 digests. Default
  legacy sessions last seven days and renew within 24 hours of expiry.
- Renewal/recovery persist exact next IDs and tokens securely before sending.
  Same-proof replay reconciles uncertain responses; unknown recovery proofs never
  fall back to bootstrap. Locked storage is not an empty credential store.
- Legacy transfer proofs bind code, claimant secret, verification and exact
  device/session proposal. Leaving a receiving visit durably cancels it; a
  pre-creation cancellation tombstone prevents delayed creation. A redeemed
  cancellation reconciles the committed session instead of undoing it.
- Revoked/retired proof digests and deleted-owner tombstones must survive cleanup
  and database restoration. They cannot silently create replacement identities.

<a id="transfer-verification-upgrade"></a>

Migration `0003_transfer_verification` erased obsolete plaintext verification and
cancelled old transfers. Do not restore an older transfer API against that schema.
Historical protocol evidence remains in the [Phase 02 handoff](../handoffs/phase-02-identity.md);
later resource contraction follows the
[coordinated cutover procedure](../operations/FOUNDATION.md#phase-07-coordinated-cutover-and-old-clients).

## Database, rates and retention

`IdentityService.withSession` authenticates, locks/rechecks the canonical owner and
supplies one transaction for all owner operations. Set transaction-local context
only after trusted verification; never accept a request owner ID, use session-level
`SET` or query on another connection. Private `justgo` tables enable and force RLS,
with narrow runtime grants and separate migrator maintenance. No grants go to
Supabase `anon`, `authenticated` or `PUBLIC`. The narrowly scoped private
Auth-session helper is the only new definer-rights capability; it returns no
records and changes no data. It does not alter application-table RLS. See the
[operator setup](../operations/ACCOUNT_SYNC_SETUP.md#live-auth-session-privileges).

Database-backed ten-minute rate buckets use separate HMAC domains for identity,
recovery and managed Auth. The managed/ordinary identity limit is 120 per address;
legacy recovery defaults to 30 within configurable bounds. HTTP429 reports the
actual conservative remaining seconds. Raw addresses and secrets are not stored.
Production requires an independent `IDENTITY_RATE_LIMIT_KEY`; proxy trust remains
limited to the configured Vercel boundary. External provider I/O and diagnostics
must never occur while retaining an owner transaction.

`justgo.purge_expired_identity_records` is invoker-rights, migrator-only, bounded
and excludes deleted-owner/credential receipts. Its reviewed expiry defaults
remove old rate buckets and expired unredeemed transfers, never revoked proof
tombstones. Neither this function nor Auth cleanup has a hosted schedule until
separately approved. Integration tests refuse non-loopback databases.

Ordinary Terms/Privacy links record no legal views, versions or agreement receipts.
Migration 0018 removed the old legal table; the independent analytics restriction
can restrict processing and never grants permission. Product analytics remains
disabled through beta/paid launch. Identity, writing, recovery and deletion must
remain independent of analytics and diagnostic delivery.
