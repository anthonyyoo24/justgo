# Identity and owner boundary security review

Gate: [#100](https://github.com/anthonyyoo24/justgo/issues/100). Reviewed on
November 17, 2026, against `main` at `aaa9329` (after #535), before the free App
Store launch. The review covers sign-in, sessions, the owner boundary and account
deletion, on the API and on the phone. It used code reading and local tests
against loopback `justgo_test` only. It touched no hosted database or provider.

Verdicts follow AGENTS.md: **Verified** means a check ran on the named surface and
showed the behavior. **Code review** means the code was read and no test runs that
surface. **Inconclusive** means it could not run there.

## Result

No defect with a shown failure was found, and nothing blocks launch. One retention decision and the notes
below remain. The production catalog sweep stays with gate #106 and signed-build
checks with their own gates.

## Evidence run

- `pnpm run test:db` on loopback `justgo_test`: 20 files, 117 tests passed,
  including the migration rehearsal.
- Focused API unit tests: `managed-verifier`, `managed-deletion`,
  `managed-exchange`, `identity`, `owner-transaction`, `outbound-fetch`,
  `routing` and `openapi`, 8 files, 94 tests passed.
- Focused mobile tests: `managed-controller`, `managed-auth`,
  `managed-auth.sign-out`, `provider-token`, `legacy-link-proof`,
  `auth-storage`, `secure-storage`, `account-client`,
  `AppProvider.token-canary` and deletion `cleanup`, 10 suites, 192 tests passed.
- A source sweep of the AGENTS.md gaps marked "only review catches", listed
  under each area.

## API

| Area                      | Verdict             | How                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed Auth verifier     | Verified            | `managed-verifier.ts` asks Supabase Auth for the user first, then checks `sub`, a non-anonymous Apple or Google identity, `iss`, `exp`, `role` and `aud`. Unit cases reject each wrong claim and map Auth outages to 503, not 401.                                                                                                                                                  |
| Session issue and renewal | Verified            | `ManagedIdentityService.exchange` maps only the verified subject to an owner and links a legacy session only by its proof. `withSession` rechecks Auth session liveness through the definer helper on every request. `managed-exchange`, `identity.sessions` and the managed sync cases pass.                                                                                       |
| Logout and revocation     | Verified            | `/v1/auth/logout` revokes the current session or all of them under the owner lock. The sync cases show a revoked session gets 401 on its next request.                                                                                                                                                                                                                              |
| Owner boundary and RLS    | Verified            | Every transaction opens through `IdentityService.db`. RLS context is set only by `setTransactionContext()`, which is transaction-local. The owner comes only from the bearer: routes read no owner from a header, query or body. `database.integration` shows owner isolation and a clean next transaction. The private-schema sweep in `managed-session-check.integration` passes. |
| Provider I/O              | Verified            | `outboundFetch()` is the only network path, and only `managed-deletion.ts` builds a Supabase client, over that transport. `owner-transaction-io.integration` shows verification runs before the owner transaction and deletion after it. `outbound-fetch` shows redirects fail closed.                                                                                              |
| Account deletion          | Verified            | One owner-locked transaction removes the data, marks the account deleted and writes the Auth deletion outbox. The Auth hard delete runs after commit. A failed Auth delete fails the request, so the phone keeps its proof and retries. The original proof replays the receipt. `delete-account.integration` passes.                                                                |
| Legacy mode               | Verified            | Managed mode refuses the legacy key, code, device and transfer routes (`routing` test). Renewal and existing-proof recovery stay, take no advisory lock and add no credential (`managed-exchange.integration`). Advisory locks appear only on legacy bootstrap and transfers.                                                                                                       |
| Rate limits               | Verified            | Keyed buckets limit sign-in to 120 and recovery to 30 per address per 10 minutes, and writes per account. The limits are not load-tested; that is gate #101.                                                                                                                                                                                                                        |
| Email and secrets on wire | Verified            | No API source reads an email (lint). The OpenAPI walk finds no bearer in a path, query, cookie or response. CORS uses an allowlist, and the bearer is never a cookie.                                                                                                                                                                                                               |
| Hosted catalogs           | Verified on staging | Gate #212 ran the private-schema sweep on staging on November 10 with no rows, and the Data API exposes no `justgo` schema. Migrations applied since may postdate it; through 0026 the same sweep passes locally. Production has no project yet; its sweep is in gate #106.                                                                                                         |

## Mobile

| Area                         | Verdict      | How                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets out of storage, logs | Verified     | `AppProvider.token-canary` runs sign-in, sync, renewal, export, an error report, a provider switch, logout and deletion and finds no secret in AsyncStorage, the journal, the export or the Sentry envelope. The saved session response holds no token. |
| Keychain options             | Verified     | `createAuthStorage()` uses its own `justgo.managed-auth.v1` service with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (`auth-storage` test). Legacy device state is device-only and does not sync.                                                                  |
| Web session storage          | Code review  | The web session sits in one tab's `sessionStorage`. The legacy vault on web is memory-only. Web sign-in uses PKCE and never reads a session from the URL.                                                                                               |
| Sign-in tokens               | Verified     | Apple gets a fresh nonce's SHA-256 and Supabase the raw nonce (`provider-token` test). Google sends no nonce, the accepted exception in [Account sync setup](../operations/ACCOUNT_SYNC_SETUP.md).                                                      |
| Bearer and account switching | Verified     | The client hands out a bearer only when the provider's Auth user matches the account, fences each request by account epoch and aborts on change. Requests attach the bearer only to the API origin under `/v1/`. No route parameter names an owner.     |
| Logout order                 | Verified     | The app session and any switch proof are revoked before the provider signs out, and a failed revocation keeps logout pending. The four logout-order cases AGENTS.md names pass.                                                                         |
| Account deletion order       | Verified     | The phone erases local data only after the server receipt, keeps the proof until then and replays it after a failure (`managed-controller`, `cleanup` tests).                                                                                           |
| Native Keychain on a device  | Inconclusive | Keychain behavior across reinstall and on a signed build needs a physical phone. Gates #81 and #85 cover signed-build sign-in and file protection.                                                                                                      |

## Decision for Anthony

[#536](https://github.com/anthonyyoo24/justgo/issues/536), labeled `needs-decision`: when a deleted account's phone never returns after a failed
Auth hard delete, its Supabase Auth user, which holds the provider email, stays
until someone runs `pnpm --filter @justgo/api run auth:cleanup`. No hosted
schedule runs it ([TestFlight beta](../operations/TESTFLIGHT_BETA.md)), and
[Account sync setup](../operations/ACCOUNT_SYNC_SETUP.md) makes it a manual
operator step. The Privacy Policy says Delete account removes the sign-in. The
issue lists the options: a hosted schedule, a set manual check, or accepting the
delay for launch volume.

## Notes

These are risks with no failure shown. None blocks launch.

1. A data route verifies any JWT-shaped bearer with one Supabase Auth call before
   any per-address limit applies. A flood of junk bearers costs one Auth call
   each. Gate #101 should include it in the load test.
2. A deletion receipt replays on a match of the original proof's digest without
   re-verifying it with Auth. That is by design, so a phone can finish deletion
   after its Auth user is gone. The digest is a SHA-256 of a signed JWT.
3. A colliding `managed_auth_sessions` id would raise an RLS error rather than
   move the row to another owner. Session ids come from signed Auth JWTs, so this
   is not reachable.
4. The chunked Keychain store keeps the previous value in its other slot until
   the next write, by design, so a write can commit atomically. After a provider
   switch, the old session stays in this phone's Keychain until the next token
   refresh, and a few chunks can linger until logout. Deleting the old slot
   after each commit would remove it.
5. When `/auth/logout` or a switch-proof revocation gets a 401, the phone treats
   it as done. After logout, the provider sign-out still ends the Supabase
   session. After a provider switch, the old Supabase session is not revoked on
   the server, but nothing on the phone can reach its refresh token.
6. The Keychain outlives an app uninstall, but the rest of the app's storage does
   not. After a reinstall the app starts at Welcome and never revokes the session
   left in the Keychain. Clearing that service on a first launch would fix it.
7. The deletion proof is the access token. If the first attempt never reached the
   server and the token expires, the next attempt gets 401 and the user deletes
   again. This fails closed.
8. Mobile requests use fetch's default redirect mode. Only the trusted API origin
   could redirect them. `redirect: 'manual'` would match the API's own rule.
9. Legacy recovery credentials use a Keychain class that syncs through iCloud.
   That is the legacy design, and new installs do not create them.
