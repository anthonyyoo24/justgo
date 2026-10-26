# Optional accounts and cloud synchronization setup

The separate [JustGO Dev setup](DEVELOPMENT_BUILDS.md) now uses its own native app,
Google iOS client and CloudKit container with the same staging API/Auth. Both
native app audiences are accepted; the original provider settings are retained.
EAS development now belongs to the separate Dev app, while preview retains the
TestFlight inputs. The original Phase 13 setup/build records below are historical.

This is the operator checklist for Phase 13. The owner authorized the current
staging provider/API setup and a compatible internal development build. Git
publication, public distribution, purchases and scheduling retain their separate
permissions. The [phase plan](../implementation-plan/phase-13-local-journal.md)
and [handoff](../handoffs/phase-13-local-journal.md) own acceptance status;
[IDENTITY.md](../architecture/IDENTITY.md) owns the safety invariants.

## Current setup status

The October 21 authorized implementation configured these prerequisites. Console
configuration, automated evidence and real phone acceptance remain distinct.

| Area                     | Verified state / remaining work                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing Apple identity  | Reused team `NPDYTJS425`, bundle `com.anthonyyoo.justgo` and existing signing credentials. Supabase Apple accepts that native audience, allows missing email and keeps nonce validation.                                                                                                                                                                                   |
| Supabase Auth            | Apple/Google enabled in existing `kmcpcauaxlgpevkkenwd`; manual identity linking enabled. Server administrative key was verified without exporting user records.                                                                                                                                                                                                           |
| Google clients           | Existing organization, new project `justgo-512319`; JustGO Supabase web client and JustGO iPhone client. External/Testing, owner email allowlisted, only openid/profile/email scopes. Google-only Skip nonce checks explicitly approved for the pinned original iOS SDK.                                                                                                   |
| Hosted database          | Registered migrations 0019–0023 applied, 19→24 history verified. Protected snapshot restored and forward-rehearsed locally; account/history preservation checked inside the live transaction. There were no old server attempts/reflections to erase.                                                                                                                      |
| Public app configuration | Matching seven public Auth/Google/API inputs configured in local development and the existing EAS development environment. Server-only Auth configuration uses Vercel secret/environment storage.                                                                                                                                                                          |
| Native build             | Configured internal build [87bc28d0](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/87bc28d0-8c0e-4936-8222-d918d362b8ab) succeeded. Signed IPA inspection confirms bundle/team, registered phone, Apple entitlement, Google URL scheme, secure storage and current conditional CloudKit bridge. Installation and real provider acceptance remain open. |
| Staging API              | Matching deployment `dpl_HmREmiNREfSTiW6uC5GpjWFrbqkr` is active at `https://justgo-two.vercel.app`. `/ready` returns 200/ready; managed routes reject missing authentication and legacy administration is absent. Actual restricted-role helper/schema checks and absent-session rejection pass; security advisor reports no findings.                                    |
| iCloud native setup      | `iCloud.com.anthonyyoo.justgo` is assigned to the existing App ID/team. The encrypted private record schema is deployed in Development and Production; local/EAS development configuration uses Production for the ad hoc build. Signed-build inspection and physical acceptance remain separate. Provider login does not enable iCloud Sync.                              |

## Execution checklist: working Apple and Google login

This is the remaining login work within Phase 13, in execution order. The
implementation owner completes each step and records evidence before moving to
dependent work. Anthony handles account access and the existing authorization
boundaries for hosted changes and signed builds. Planning does not enable a
provider, deploy an API or change an installed app.

The original read-only audit identified missing provider, app and database setup.
The status table above supersedes that audit; use live readiness and actual device
results before claiming acceptance. Loopback test API configuration stays isolated
from hosted Auth and production credentials.

### 1. Audit legacy recovery and prepare the cutover

- [x] Confirm the target Supabase project, API environment, existing Apple team
      and bundle ID, Google project and current installed build. Inventory old
      installations and pending operations using counts/status only.
- [x] Trace every remaining legacy dependency and record its removal condition
      using the inventory below. Identify presentation/fallback code that can
      retire independently of account migration. Preserve old journal ownership
      and unfinished deletion state; no account/history/phone reset is part of
      this work.
- [x] Prepare the exact configuration/deployment/build changes for review, with
      environment names, console destinations, migration scope and acceptance
      checks. Recheck current Supabase, Expo and provider documentation before
      implementation. Store credentials through the appropriate secret manager.

| Existing responsibility                                  | Current owner                                                                                     | Planned treatment / removal condition                                                                                                                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Old key, transfer and device screens and route fallbacks | Mobile `identity/account`, `app/account` and `app/recovery.tsx`                                   | Removed from the managed-only app. Old URLs redirect to Account; managed routes/fixtures/tests now exercise the current controller. Retain redirects for existing links.                                                                                                          |
| General legacy controller                                | Mobile `identity/controller.ts` and `providers/AppProvider.tsx`                                   | Obsolete UI branches removed. Keep the generic boundary-test constructor, pending legacy deletion consumer and shared snapshot type until their supported migration/cleanup window closes.                                                                                        |
| Existing-owner proof migration                           | Mobile `auth/legacy-link-proof.ts`, `auth/managed-controller.ts` and API managed identity service | Retain proof renewal/recovery, frozen exchange proof and linked-owner marker until supported old installations can migrate without replacement accounts or cross-owner linking. Verify lost-response replay.                                                                      |
| Old secure vault/native bridge                           | Mobile `identity/vault.ts`, `identity/storage.ts` and `modules/justgo-keychain`                   | Retain the operations required to read/migrate old ownership and finish pending cleanup. Startup currently reads this bridge even on a fresh installation; do not remove the native module while callers remain. Audit unused credential-creation/transfer operations separately. |
| Legacy server routes and records                         | API `identity/routes.ts`, identity services and registered database migrations                    | Managed mode disables public key/device/transfer administration and bootstrap/transfer creation. Keep exact-proof current-session/renewal/recovery and pending deletion compatibility until the supported migration window closes. Preserve revocation/deletion records.          |
| Secure storage for new sign-ins                          | Mobile `platform/auth` and Supabase Auth adapter                                                  | Keep. This stores managed login tokens securely and does not restore the user-facing key/code system.                                                                                                                                                                             |

**Exit:** every retained legacy path has a named migration/cleanup consumer and a
removal condition; candidate cleanup has a focused verification scope. Do not
delay real provider setup solely because migration compatibility must remain.

### 2. Configure and verify the real providers

- [x] Configure native Apple sign-in in the existing Supabase project using the
      permanent bundle ID as an accepted audience. Preserve the existing Apple
      capability and nonce validation. The native ID-token path does not require
      adding browser Apple OAuth setup.
- [x] Configure Google's web/server and iOS OAuth clients for the same app,
      Supabase Google provider and iOS reversed-client URL scheme. Confirm the
      consent/test-user settings permit the intended phone testers.
- [x] Enable and verify explicit Supabase identity linking. Keep both methods
      attached to the same verified JustGO owner; do not add custom email merges.
- [x] Supply matching public app values and server-only secrets using the
      environment tables below. Add only approved callback/CORS destinations
      for browser OAuth if browser login is included in this rollout.

**Exit:** provider/client/audience settings match the existing app identity, and
the intended test accounts can reach real Auth. Configuration alone does not
establish successful app login or data synchronization.

### 3. Roll out the matching API and database

- [x] Follow the coordinated [rollout](LOCAL_JOURNAL_ROLLOUT.md), including a
      restorable snapshot, registered migrations 0019–0023, the private Auth-session
      helper and the compatible API deployment. Retain the narrowly approved
      server-only reflection reset scope.
- [ ] Enable managed Auth for the chosen environment only after its prerequisites
      pass. Verify readiness using the actual restricted runtime role, real token
      verification, canonical-owner mapping and blocked legacy administration.
- [ ] Verify Auth account-erasure capability and arrange the documented pending
      deletion retry operation before testers depend on Delete account. Keep
      supported old-proof migration available and coordinate incompatible clients.

**Current evidence:** the compatible staging API and private helper are live.
The restricted runtime passes readiness, a nonexistent session is denied, the
server admin key was validated, and the operator cleanup command completed with
zero pending work. Real provider mapping, revocation and erasure still require
the phone/disposable-account cases below; do not equate readiness with those tests.

### 4. Build the configured iPhone app

- [x] Put the matching public Auth/Google values in local development and the
      chosen EAS environment. Check the resolved API origin and generated native
      configuration without exposing secrets.
- [x] Preserve the existing Welcome and Account provider-entry pages, logos and
      cloud disclosure. Tapping a signed-out switch continues to open the separate
      provider page; errors stay with that attempt and reset on a later visit.
- [x] Create a compatible signed development build with the existing bundle/team,
      Apple entitlement, Google URL scheme, secure storage and required modules.
      Inspect the resulting binary, then provide its installation link and QR code.
      Install over the existing app to preserve its phone data.

**Current evidence:** the signed binary contains the Apple entitlement and Google
URL scheme. The restarted, cache-cleared phone Metro bundle contains the matching
public Auth/Google/staging API inputs and no actual server admin secret. The
unpublished legal reader remains a separate local LAN preview; its pages return
200 and no legal content was published. Installation and native login remain open.
Keep iCloud's separate Phase 13 checklist open until its own setup and device
checks pass; successful provider login does not establish working iCloud Sync.

### 5. Accept real login and data continuity on the phone

- [ ] Test first and returning Apple and Google sign-in, provider cancellation,
      Apple hidden email, expired/refreshed sessions and network interruption.
- [ ] Confirm guest entries are adopted after disclosure; log out, edit offline,
      relaunch and sign back into the same account. Verify challenge history and
      journal together, including another device's changes and conflicts.
- [ ] Link/unlink both providers, protect the final method and reject an identity
      belonging to a different owner. Confirm Account switches reflect verified
      connections and another account never receives the prior owner's entries.
- [ ] On disposable accounts, verify session revocation, Delete all my data,
      Delete account and interrupted cleanup/retry. Verify existing-phone proof
      migration, a lost exchange response and pending legacy deletion separately.
- [ ] Record real device/provider evidence separately from unit, browser and
      fixture journeys. Run the applicable focused and release/phase gates in
      [TESTING.md](TESTING.md); keep any unavailable device/provider check open.

**Exit:** both real providers complete login in the configured iPhone app, the
correct data survives logout/returning login, and server-side ownership/deletion
works. A mocked login, successful build or disappearing error is insufficient.

### 6. Remove obsolete recovery code and reconcile documentation

- [x] Remove audited legacy presentation/fallback consumers in a separate
      reviewable change. Extract required migration/deletion responsibilities
      before removing general controllers, shared types or native operations.
- [x] Bound retained compatibility to existing-owner migration and unfinished
      deletion. Remove it only when supported installations have migrated or the
      owner explicitly approves ending that support. Keep
      canonical ownership, deleted-owner/revocation records and pending cleanup
      authoritative through restoration. Retain managed token secure storage.
- [x] Update the plan, implemented architecture, setup/rollout guidance and handoff
      together with actual evidence and remaining gates. Do not mark the whole
      phase complete while iCloud, hosted or physical-device requirements remain.

**Exit:** obsolete recovery code is removed, necessary compatibility is explicitly
bounded, and documentation distinguishes working phone login from open work.

## Rollout prerequisites

Keep the existing Supabase project, canonical JustGO owners, Apple bundle identity
and signing team. Coordinate the compatible API and mobile releases; older
installed clients use the custom proof protocol and cannot safely be treated as
new guest accounts. Keep old phone journals and secure proofs intact. A failed or
locked vault must not trigger a reset or automatic replacement account.

Apply the registered Drizzle migrations using the existing separate migration
connection and `npm run db:migrate -w @justgo/api`. Review backup/restore and
forward-repair steps in [FOUNDATION.md](FOUNDATION.md) first. Do not rewrite applied
migration 0019. The registered 0020 migration is the owner's narrowly approved reset
of old server inline reflection fields and patch receipts only; it preserves
accounts, completed reps, frozen context and all local phone writing. Migration
0021 adds managed mappings, sessions, epochs, journal versions and deleted IDs;
0022 supports independent historical journal context; 0023 adds durable Auth
deletion cleanup.
No reset of users, challenge history, entitlements or phone databases is approved.

Private application tables remain under `justgo`, with FORCE RLS and narrow
`justgo_runtime` privileges. Do not expose them through Supabase's public Data API
or grant application data to `anon`, `authenticated` or `PUBLIC`.

## Implemented account and data behavior

Sign-in discloses account storage before automatically adopting unowned writing
from this phone into the verified account. There is no optional merge step or
permanent guest-data selector. The handover preserves journal conflicts and
retries after interruption; its source is retired only after the destination is
durable. An adopted source cannot later attach to a different owner, and existing
account deletions/tombstones must not be undone by replaying an older source.
Logging out leaves the same journal available for offline reading and writing;
signing back into that owner resumes synchronization. Signing into a different
account must not transfer the prior account's writing.

Account's Apple/Google switches display verified linked methods, so both can be
on. Turning on a method signs in when signed out, or links it to the current
account when signed in. Turning one off unlinks it only if another usable method
remains; the last method is retained and Log out remains a separate action.
Cancelled or failed changes must not leave a falsely connected switch. Enable
Supabase manual linking and verify real identities, including different/hidden
email and an identity already owned by another account; do not add custom
email-based account matching. See [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

Data exposes iCloud Sync, Download my data, Import data and Delete all my data.
Account exposes Log out and Delete account. Both destructive actions use the
existing confirmation modal. Data deletion keeps account access and linked
methods; account deletion also removes the JustGO account and its Auth profile.
Neither deletes the user's Apple or Google account. Complete exported files
include journal and challenge history, and remain under the user's control.

## Live Auth session privileges

The API verifies the bearer with Auth and then checks the JWT's `session_id`
against the live `auth.sessions` row. Signature/expiry alone does not establish
that a user has not signed out. Supabase documents the session-ID relationship in
[User sessions](https://supabase.com/docs/guides/auth/sessions).

Hosted Supabase does not support direct grants from `postgres` to custom roles
on its managed `auth` schema. The prior direct-grant recipe is superseded by
[Supabase's documented private-helper pattern](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema).
The ordinary migrator remains unable to grant itself Auth access.

After the registered application migrations, the authorized project `postgres`
operator runs the versioned
[session-check-v1.sql](../../apps/api/scripts/managed-auth/session-check-v1.sql).
Keep `justgo_auth_private` outside the Data API exposed schemas. Its only helper
returns a boolean for the exact session/subject plus `not_after`; arguments come
from the API's verified JWT, never client-selected owner fields. A direct backend
SQL connection has no PostgREST `auth.uid()` context, so verified server arguments
are the ownership boundary.

The helper uses SQL, STRICT/STABLE, fixed `search_path=''`, fully qualified Auth
objects and postgres ownership. Revoke schema/function access from PUBLIC and
Data API roles, grant only runtime USAGE/EXECUTE, and remove the obsolete direct
Auth-column grants. Runtime receives no Auth records, writes, administrator role
or ability to replace the function. Application RLS remains forced and unchanged.

`/ready` validates the helper's exact executable body, types, owner, security
settings, direct/effective privileges and managed application tables. Wrong/missing
setup fails closed. Verify the real runtime can call the helper with fresh random
UUIDs and receive false, cannot read/write Auth directly, and cannot access another
owner's application rows. Live matching-session/revocation and actual hard deletion
still need separate real-provider evidence.

## API environment

Use deployment secret/environment management; do not commit values or print them
in build logs. Keep runtime and migration database credentials separate.

| Variable                   | Required behavior                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `MANAGED_AUTH_ENABLED`     | Default `false`; set `true` only for the coordinated managed rollout after prerequisites.                                    |
| `SUPABASE_URL`             | Exact HTTPS project origin without credentials, paths, query or fragment.                                                    |
| `SUPABASE_PUBLISHABLE_KEY` | Matching project's public Auth key, paired with the URL.                                                                     |
| `SUPABASE_AUTH_SECRET_KEY` | Server-only administrative key capable of hard Auth user deletion; at least 32 characters. Never use an `EXPO_PUBLIC_` name. |
| `DATABASE_URL`             | Restricted `justgo_runtime` connection with existing verified TLS settings.                                                  |
| `IDENTITY_RATE_LIMIT_KEY`  | Independent random secret of at least 32 characters, shared across API instances; never bundled on mobile.                   |
| `MIGRATION_DATABASE_URL`   | Operator-only `justgo_migrator` connection; never deploy it as the API runtime connection.                                   |
| `CORS_ORIGINS`             | Explicit approved browser origins; no wildcard credential relaxation.                                                        |

Enabling managed mode without the URL, matching public configuration or server
deletion secret fails startup. The server secret is used only in an isolated
administrative SDK client with persistence and automatic refresh disabled.
`auth.admin.deleteUser(id, false)` performs hard deletion; see the
[server-only deleteUser reference](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).
Use the target project's approved server secret with that permission; validate
actual behavior on a disposable staged account. A configured string alone does
not establish a valid key or successful erasure.

Managed mode retires key/code/device administration and rejects legacy bootstrap
and transfer session creation. Internal `GET /v1/sessions/current` and
recovery/renewal `POST /v1/sessions` remain for verified existing-phone migration,
plus original account-deletion proof replay. Leave default legacy mode in place
until the compatible mobile rollout and existing-owner migration tests are ready.

## Apple, Google and mobile configuration

Configure the providers in the same Supabase Auth project. Enable manual identity
linking for the explicit already-signed-in provider-link action; do not implement
custom linking by email. See
[Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).
An already-linked identity belonging to another Auth user must fail safely.

For native Apple sign-in, preserve team `NPDYTJS425` and bundle
`com.anthonyyoo.justgo`, retain its Sign in with Apple capability and enable the
Supabase Apple provider with that bundle ID among its accepted Client IDs/token
audiences. The native ID-token exchange does not require a browser Services ID
or a `.p8`-generated OAuth client secret. Native Apple uses no email/name scopes, so allow users without email for this
provider. Its cryptographic nonce validation stays enabled. Verify first/returning sign-in,
hidden email, cancellation and provider linking on the signed app.

Browser Apple OAuth is separate setup: it needs an Apple Services ID, approved
website/callback configuration and the server-side client secret generated using
the Apple signing key. If supporting both paths, place the Services ID first in
Supabase's Client IDs list and retain the native bundle ID as an accepted audience.
Record the browser secret's six-month rotation under the operator's secure
process; this rotation requirement does not apply to native-only sign-in. See
[Supabase Apple sign-in](https://supabase.com/docs/guides/auth/social-login/auth-apple).

For Google, configure the web/server OAuth client and the iOS OAuth client for the
same permanent bundle identity. Add the approved iOS reversed-client URL scheme;
confirm the consent screen and provider settings through
[Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google)
and the [original Google Sign-In Expo setup](https://react-native-google-signin.github.io/docs/setting-up/expo).
The application uses the free/original native integration. Its pinned iOS wrapper
does not expose the nonce generated by Google's SDK. The owner explicitly approved
Google-only Skip nonce checks, following Supabase's iOS configuration; signatures
and allowed audiences remain verified. Apple nonce validation is unchanged.
The web client callback is the project's `/auth/v1/callback`; native ID-token
exchange does not require putting a client secret on the phone. Browser Google
OAuth remains a separate configuration and acceptance task.
Keep provider secrets in provider/server configuration, never public mobile env.

The implemented mobile inputs are:

```dotenv
EXPO_PUBLIC_API_URL=https://<approved-api-origin>
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<public-key>
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web-oauth-client-id>
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios-oauth-client-id>
EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.<reversed-client-id>
IOS_BUNDLE_IDENTIFIER=<existing-permanent-bundle-id>
```

The Auth adapter requires a publishable key with the `sb_publishable_` prefix.
The native config includes Apple sign-in and SecureStore plugins; Google URL
scheme configuration supplies its native plugin. Rebuild a compatible native app
after native/plugin changes. JavaScript OTA/export cannot add those modules.
Check current [Expo Apple Authentication](https://docs.expo.dev/versions/v58.0.0/sdk/apple-authentication/)
and [SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/) requirements.

Real web Auth uses PKCE and `/auth/callback`; allowlist only approved browser
origins/callback URLs in Supabase, configure API CORS accordingly and do not ship
fixture providers. The guarded loopback fixture allocates its own principals and
sessions in dedicated `justgo_test`; it establishes no real Apple/Google evidence.

iCloud is separately opt-in and off by default. Its native configuration uses
`EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER=iCloud.com.anthonyyoo.justgo` paired with
`ICLOUD_CONTAINER_ENVIRONMENT=Production` for the internal ad hoc build, the existing
Apple team and private CloudKit capabilities. Both values are public build metadata.
The EAS development environment and local phone configuration contain this pair;
configure preview/production explicitly before their builds. Unconfigured local
builds omit iCloud entitlements, and `development-simulator` ignores inherited
device CloudKit inputs. This is independent of JustGO
provider login. Follow [APPLE_SETUP.md](APPLE_SETUP.md) and retain physical
multi-device, account-change, quota, toggle-off and deletion gates. A Files share
to iCloud Drive is a manual snapshot, not the iCloud Sync toggle.

The approved container is assigned only to `com.anthonyyoo.justgo` under team
`NPDYTJS425`. Its schema is deployed in Development and Production:

| Record type        | Field                    | CloudKit type    |
| ------------------ | ------------------------ | ---------------- |
| `JustGoCollection` | `generation`, `revision` | String           |
| `JustGoCollection` | `wasReset`, `closed`     | Int(64)          |
| `JustGoValue`      | `generation`, `itemId`   | String           |
| `JustGoValue`      | `value`                  | Encrypted String |

There are no custom query indexes or public `_world`/`_icloud` grants for these
types. The bridge uses private custom zones; deploying schema does not copy any
user records. Create `value` as Encrypted String from the beginning. Keep the
signed environment consistent with the deployed schema and inspect the final IPA.

The pinned DocumentPicker automatic plugin removes the environment entitlement
when its separate CloudDocuments integration is off. The focused
`with-icloud-environment.cjs` mod restores the validated CloudKit environment after
the entitlement pipeline; do not enable `usesIcloudStorage` merely to compensate,
because that changes service/container entitlements to CloudDocuments. App-config
tests exercise both plugins together and introspection must retain `CloudKit`,
the approved container, the environment and the Apple sign-in entitlement.

The local implementation remembers previously used iCloud copies. Guest-to-account
handover reads any associated guest copy before retiring it; deletion also cleans
up associated copies when the user's toggle is currently off. This maintenance
does not turn ordinary synchronization back on. Cleanup stays pending if a
previously used Apple account is unavailable or its result is uncertain; do not
report complete erasure merely because the current Apple account's copy is gone.
Retry against the associated account without uploading another owner's writing.

The current handover requires the native page `revision` and `resetIfUnchanged`
bridge, which conditionally retires only the source version actually read. The
earlier `967b34cf` IPA predates this bridge revision; the provider build includes
it but lacks CloudKit configuration. Use the subsequent configured iCloud build
recorded in [APPLE_SETUP.md](APPLE_SETUP.md). A missing bridge or unavailable
configuration must remain an explicit unsupported/pending state, not a simulated
successful sync. Include concurrent-write and lost-response retries in native
acceptance.

When enabled ordinary sync finds missing private storage, including a removed
zone or a missing zone after an Apple encrypted-data key reset, it may recreate
the cloud copy and upload existing phone entries without clearing them. Turning
sync off stops ordinary uploads and retains phone data. Genuine in-app deletion,
closure and account-epoch fences remain separate and enforced. Access or
recreation failures remain errors, and phone writing is retained. Actual
external-deletion/recreation device acceptance remains unverified before release;
see the [October 23 decision](../DECISIONS.md#october-23-icloud-deletion-retains-phone-data)
and [activity architecture](../architecture/ACTIVITY_DATA.md).

## Pending Auth erasure operations

The account-deletion transaction fences access, removes application data and
records a receipt plus private `managed_auth_deletions` work. External Auth hard
deletion follows outside the transaction. Final success requires both provider
erasure and a durable completion marker. If either step is uncertain, the exact
original secure deletion proof replays the same receipt/work; it cannot access
ordinary data. Only a known `user_not_found` response after hard deletion is an
idempotent success. Other failures stay pending.

When the original phone never returns, the operator command retries up to 50
pending deletions:

```sh
npm run auth:cleanup -w @justgo/api
```

Run it only in an authorized operator environment with the separate
`MIGRATION_DATABASE_URL` resolving to `justgo_migrator`, the matching Supabase
configuration and server-only deletion secret. The command refuses the runtime
connection/role, checks canonical mapping and deleted-owner state, emits counts
only and exits nonzero if any attempt fails. Successful provider deletion followed
by a database-marker failure is safe to retry. It does not purge tombstones.

To inspect backlog without exporting account identifiers/private content, an
authorized operator may use:

```sql
SELECT count(*) AS pending_auth_deletions
FROM justgo.managed_auth_deletions
WHERE completed_at IS NULL;
```

No hosted worker, cron job or workflow has been installed. Before production
activation, assign an operator and approved retry/alert cadence so erasure does
not depend on the phone reconnecting. Provider retention, database backup
retention and operational response commitments require final privacy review.

## Acceptance gates kept open

- Real staged Apple and Google sign-in, refresh, returning sign-in, cancellation,
  hidden/different email and safe linking to the same canonical owner.
- Existing-phone proof migration with lost responses, revoked proofs, returning
  provider sign-in and old pending deletion receipts; no replacement owners.
- Actual private-helper/runtime least privilege, provider sign-out and
  formerly valid JWT rejection on private endpoints after logout/revocation.
- Hard Auth deletion with a real administrative key, interrupted provider/marker
  cleanup, original-proof replay after provider removal and operator retry.
- Offline guest/relaunch, disclosed automatic adoption, interrupted handover and
  cross-device conflicts; the same journal after logout, offline edits and
  same-owner re-login; different-owner isolation and deletion without stale
  resurrection.
- Verified login-method switches, safe link/unlink and last-method protection.
- Signed native secure session storage, real optional iCloud synchronization,
  complete file download/import, conditional guest-copy retirement and cleanup
  with sync off or a previously associated Apple account unavailable.
- Reopened Vercel/Supabase private-journal processing, policy/App Privacy and
  retention/provider review before hosted activation.

Local unit/database/browser tests do not close these provider, native or hosted
gates. Keep deletion receipts, canonical subject tombstones, revoked legacy
proofs, epochs and deleted IDs through backup restoration; reconcile them before
reopening writes. User-saved external files remain under the user's control.
