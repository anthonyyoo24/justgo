# Optional accounts and cloud synchronization setup

This document records the outside-service settings for Apple, Google, Supabase
Auth and CloudKit, the private Auth-session helper, and the Auth erasure runbook.
[IDENTITY.md](../architecture/IDENTITY.md) owns the account safety invariants.
[`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate) own
acceptance status.

The [JustGO Dev app](DEVELOPMENT_BUILDS.md) has its own native app, Google iOS
client and CloudKit container, and uses the same staging API and Auth. Supabase
accepts both native app audiences. The EAS `development` environment belongs to
the Dev app. The `preview` environment holds the TestFlight inputs.

## Provider settings

| Area                     | Setting                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple identity           | Team `NPDYTJS425`, bundle `com.anthonyyoo.justgo`, the existing signing credentials and the Sign in with Apple capability.                                                                        |
| Supabase Auth            | Project `kmcpcauaxlgpevkkenwd`. Apple and Google providers are on. Manual identity linking is on.                                                                                                 |
| Supabase Apple provider  | The bundle ID is an accepted Client ID and token audience. Users without email are allowed. Nonce validation is on.                                                                               |
| Google clients           | Project `justgo-512319` in the existing organization, with a JustGO Supabase web client and a JustGO iPhone client. The consent screen is External and Testing, with the owner email allowlisted. |
| Google scopes            | `openid`, `profile` and `email` only.                                                                                                                                                             |
| Supabase Google provider | Skip nonce checks is on. See [Accepted security exceptions](#accepted-security-exceptions).                                                                                                       |
| CloudKit                 | Container `iCloud.com.anthonyyoo.justgo`, assigned only to `com.anthonyyoo.justgo` under team `NPDYTJS425`. The encrypted private record schema is deployed in Development and Production.        |
| Public app inputs        | The Auth, Google and API inputs in `apps/mobile/.env.example`, plus `IOS_BUNDLE_IDENTIFIER`, are set in local development and in the EAS `development` and `preview` environments.                |
| Server-only Auth inputs  | `SUPABASE_AUTH_SECRET_KEY` and the matching Supabase URL and publishable key live in the API host's secret store.                                                                                 |

## Accepted security exceptions

The owner approved **Skip nonce checks** for the Supabase Google provider only.
The app uses the free, original native Google Sign-In integration. Its pinned iOS
wrapper does not expose the nonce that Google's SDK generates, so Supabase cannot
compare one. Supabase's iOS guide uses this setting for that case.
Supabase still verifies the token signature and the allowed audiences.

Never turn on Skip nonce checks for Apple. Apple nonce validation stays on.

The owner approved migration 0020 as a narrow reset. It clears only old server
inline reflection fields and patch receipts. It keeps accounts, completed reps,
frozen context and all writing on the phone. No reset of users, challenge history,
entitlements or phone databases is approved.

Keep legacy-proof compatibility until supported installations have migrated, or
until the owner approves ending that support.
[Internal legacy migration compatibility](../architecture/IDENTITY.md#internal-legacy-migration-compatibility)
lists what it covers.

## Configure Apple sign-in

Native Apple sign-in exchanges an ID token. It needs no browser Services ID and no
`.p8`-generated OAuth client secret. Native Apple requests no email or name scope,
which is why the provider allows users without email.

Browser Apple OAuth is not set up. To add it:

1. Create an Apple Services ID and its approved website and callback settings.
2. Generate the server-side client secret with the Apple signing key.
3. Put the Services ID first in Supabase's Client IDs list, and keep the native
   bundle ID as an accepted audience.
4. Record the six-month rotation of the browser secret in the operator's secure
   process. Native-only sign-in has no such rotation.

See [Supabase Apple sign-in](https://supabase.com/docs/guides/auth/social-login/auth-apple).

## Configure Google sign-in

Configure the web client and the iOS client for the same permanent bundle. Add the
iOS reversed-client URL scheme. The web client callback is the project's
`/auth/v1/callback`. The native ID-token exchange puts no client secret on the
phone. Browser Google OAuth is a separate setup and acceptance task. See
[Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google)
and the [original Google Sign-In Expo setup](https://react-native-google-signin.github.io/docs/setting-up/expo).

Keep provider secrets in provider and server configuration, never in an
`EXPO_PUBLIC_` variable.

## Link identities and allow browser origins

Manual identity linking serves the explicit link action of a signed-in user. Do not
add custom linking by email. An identity that already belongs to another Auth user
must fail. See [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

Real web Auth uses PKCE and `/auth/callback`. In Supabase, allowlist only approved
browser origins and callback URLs, and set the API's `CORS_ORIGINS` to match.

## Keep private tables off the Data API

Private application tables stay in the `justgo` schema with forced RLS and narrow
`justgo_runtime` privileges. Do not add `justgo` or `justgo_auth_private` to the
Data API's exposed schemas. Grant no application data to `anon`, `authenticated`
or `PUBLIC`.

## Live Auth session privileges

The API verifies the bearer with Auth, then checks the JWT's `session_id` against
the live `auth.sessions` row. A valid signature and expiry do not show that the
user has not signed out. See
[User sessions](https://supabase.com/docs/guides/auth/sessions).

Hosted Supabase does not allow `postgres` to grant custom roles access to its
managed `auth` schema. The API therefore uses
[Supabase's private-helper pattern](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema).
The ordinary migrator cannot grant itself Auth access.

After the registered application migrations, the project's `postgres` operator
runs the versioned
[session-check-v1.sql](../../apps/api/scripts/managed-auth/session-check-v1.sql).
Its one helper returns a boolean for the exact session and subject, plus
`not_after`. The arguments come from the API's verified JWT, never from
client-selected owner fields. A direct backend SQL connection has no PostgREST
`auth.uid()` context, so the verified server arguments are the ownership boundary.

The helper's privileges:

- It is a SQL function, `STRICT` and `STABLE`, with `search_path=''`, fully
  qualified Auth objects and `postgres` ownership.
- `PUBLIC` and the Data API roles have no access to its schema or function.
  `justgo_runtime` has only `USAGE` and `EXECUTE`.
- The obsolete direct Auth-column grants are removed.
- The runtime gets no Auth records, no writes, no administrator role and no
  ability to replace the function. Application RLS stays forced and unchanged.

`/ready` checks the helper's body, types, owner, security settings and privileges,
and fails closed when any of them is wrong. After setup on a hosted database,
verify with the real runtime role:

1. Call the helper with fresh random UUIDs. It returns false.
2. Read and write Auth directly. Both fail.
3. Read another owner's application rows. The read fails.

## API secrets

`apps/api/.env.example` lists the variables, and `apps/api/src/config.ts`
validates them. Store values in the deployment's secret manager. Do not commit
them or print them in build logs. Keep the runtime and migration database
credentials separate, and never deploy `MIGRATION_DATABASE_URL` as the runtime
connection.

`SUPABASE_AUTH_SECRET_KEY` must have permission for hard Auth user deletion
through `auth.admin.deleteUser(id, false)`. See the
[deleteUser reference](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).
A configured string does not prove the key works. Validate erasure on a disposable
staged account.

## Mobile and CloudKit configuration

`apps/mobile/.env.example` lists the public mobile inputs.

iCloud Sync is opt-in, off by default and independent of provider login. The
internal ad hoc build pairs `EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER` with
`ICLOUD_CONTAINER_ENVIRONMENT=Production`. Both values are public build metadata.
Set the pair explicitly in preview and production before their builds. Follow
[APPLE_SETUP.md](APPLE_SETUP.md) for the Apple side.

The deployed CloudKit schema:

| Record type        | Field                    | CloudKit type    |
| ------------------ | ------------------------ | ---------------- |
| `JustGoCollection` | `generation`, `revision` | String           |
| `JustGoCollection` | `wasReset`, `closed`     | Int(64)          |
| `JustGoValue`      | `generation`, `itemId`   | String           |
| `JustGoValue`      | `value`                  | Encrypted String |

The schema has no custom query indexes and no public `_world` or `_icloud` grants.
The bridge uses private custom zones. Deploying the schema copies no user records.
Create `value` as Encrypted String from the start. Keep the signed build's
environment consistent with the deployed schema, and inspect the final IPA.

To run CI's `native-icloud` `swift test` command locally, prefix it with
`DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.

## Pending Auth erasure operations

Account deletion fences the account, removes application data and records a
receipt plus private `managed_auth_deletions` work. Auth hard deletion runs
outside that transaction. A known `user_not_found` after hard deletion counts as
success. Other failures stay pending, and the original deletion proof can replay
the same receipt.

When the original phone never returns, run the operator command. It retries up
to 50 pending deletions:

```sh
npm run auth:cleanup -w @justgo/api
```

Run it only in an authorized operator environment with:

- `MIGRATION_DATABASE_URL` resolving to `justgo_migrator`. The command refuses the
  runtime connection and role.
- The matching Supabase configuration and the server-only deletion secret.

The command checks the canonical mapping and deleted-owner state, prints counts
only, and exits nonzero if any attempt fails. A provider deletion followed by a
database-marker failure is safe to retry. The command does not purge tombstones.

To count the backlog without exporting account identifiers or private content:

```sql
SELECT count(*) AS pending_auth_deletions
FROM justgo.managed_auth_deletions
WHERE completed_at IS NULL;
```

No hosted worker, cron job or workflow runs this command. Before production
activation, assign an operator and an approved retry and alert cadence, so that
erasure does not depend on the phone reconnecting.

## Gate cases not yet in an issue

Each gate below has an open issue, but the issue does not name these cases.

- [#117](https://github.com/anthonyyoo24/justgo/issues/117), existing-phone
  migration: lost exchange responses, revoked proofs, returning provider sign-in
  and old pending deletion receipts, with no replacement owners.
- [#81](https://github.com/anthonyyoo24/justgo/issues/81), sign-in matrix: hard
  Auth deletion with the real administrative key, interrupted provider or marker
  cleanup, original-proof replay after provider removal, and the operator retry.
  Also hidden or different provider email; guest adoption after the sign-in
  disclosure; the same journal after logout, offline edits and sign-in again to
  the same owner; and conflicts from a second signed-in device.
