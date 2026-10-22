# Phase 13 — Optional accounts and complete data controls

## Status

The October 21 continuity/Settings revision, working-login setup and private
iCloud container/schema setup are implemented. Anthony confirmed successful
phone login. Extended provider continuity/revocation/deletion and actual iCloud
device acceptance remain open. The [plan](../implementation-plan/phase-13-local-journal.md) owns
remaining scope and [decisions](../DECISIONS.md#october-21-native-provider-rollout-and-hosted-session-checks)
record the provider-specific choices. No Git push, PR or merge ran.

## Implemented behavior

- Welcome retains branded Apple/Google buttons above Continue. Continue creates a
  local journal without a server account. Sign-in explains JustGO cloud storage
  and automatically adopts unowned phone writing. The optional merge checkbox and
  View guest data action are removed. Logout keeps the same journal readable and
  editable; returning to the same account uploads its pending edits.
- Account has Login methods with verified Apple/Google switches, Log out and red
  Delete account. Methods can be linked/unlinked while keeping at least one usable
  method. There is no separate connected-status block. Another account never
  receives a former owner's writing.
- Data has iCloud Sync, matching download/import arrows and Delete all my data at
  the bottom. Unavailable iCloud gives a visible reason. Both deletion actions use
  the shared accessible confirmation modal, retaining independent consequences,
  cancellation, focus isolation, busy state and retry feedback.
- One bounded ZIP includes full challenge history, journal versions/alternatives,
  supported preferences and readable CSV. Import validates ownership/context and
  preserves conflicts without duplicate reps. Signed-out account import requests
  the correct owner before opening the picker; after returning to Data, the user
  selects Import data and chooses the file. Files never authenticate an account.
- Delete all my data keeps the account and login methods. Delete account removes
  JustGO account access and its associated data, including retryable Auth erasure.
  Both include previously associated app-managed iCloud copies even when sync is
  off. Cleanup stays pending while a required Apple account is unavailable.
  User-saved downloads, the person's Apple/Google account and store subscription
  remain under their separate controls.

## Boundaries to preserve

Guest adoption persists pending/copied/consumed progress and the target owner.
Drain existing source/target synchronization, discard stale target metadata and
freeze source submissions through the durable destination switch. Retire the source
only after verified delivery and selection; retries preserve accepted input and
conflicting writing. An older optional-merge installation with unknown adoption
state requires a disclosed re-login before parked writing uploads. A parked unowned
source can join the selected provider account without copying any other account.

CloudKit handover records source revision/fingerprints and conditionally resets the
source after durable destination delivery. A concurrent source write forces a retry;
a lost reset acknowledgement cannot reset a newer generation. Normal source sync
stays fenced until retirement. Previously used Apple-account tokens are tracked
for cleanup without turning the user's sync preference back on. Journal-only data
round-trips without inventing completed reps.

Ordinary adoption/sync never sets the explicit restore override. Server epochs and
deleted IDs prevent old replicas from resurrecting data; an intentional validated
import is the separate restore action. Deletion persists its original operation ID
and epoch/generation, so uncertain responses cannot erase later writing. Resume
saved deletion proofs/receipts and copied-source retirement before fresh provider
verification, which can fail after the Auth user has already been deleted.

Preserve SQLite/IndexedDB ownership and local commit before delivery. Never replay
retired private PATCH queues. Private journal content belongs only in authorized
journal sync, explicitly enabled private CloudKit or user-selected exports; never
logs, diagnostics or analytics. Managed Auth maps verified subjects to canonical
owners, checks live sessions and preserves legacy proof/deletion compatibility.

## Setup and organization

[ACCOUNT_SYNC_SETUP.md](../operations/ACCOUNT_SYNC_SETUP.md) and
[APPLE_SETUP.md](../operations/APPLE_SETUP.md) contain the concrete setup sequence.
The authorized rollout supersedes the earlier read-only setup gaps. Supabase
Apple/Google and manual linking are enabled in the existing staging project.
Google uses project `justgo-512319`, web+iPhone clients, External/Testing and the
owner test email with only openid/profile/email scopes. Its original iOS SDK
requires the expressly approved Google-only nonce exception; Apple validation
stays on. Browser OAuth is separate and unaccepted.

A protected hosted snapshot was restored on loopback and forward-rehearsed before
registered 0019–0023 ran. The live wrapper locked users first and verified all
preserved data and exact schema/history before COMMIT. History is 24 registered
hashes; accounts/history/phone writing were preserved, and the hosted old journal
inventory was empty. Registered migrations remain immutable.

Hosted direct Auth-schema grants are unsupported. The versioned private
postgres-owned boolean helper now supplies exact live-session checks to runtime.
Actual restricted-role schema/helper readiness and nonexistent-session rejection
pass over verified TLS; it cannot read/write Auth records directly. Supabase's
security advisor reports no findings. The matching API deployment
`dpl_HmREmiNREfSTiW6uC5GpjWFrbqkr` is active at `https://justgo-two.vercel.app`:
ready=200, missing managed authentication=401, retired legacy administration=404,
and staged guest admission remains verified. The server admin key was validated
without exporting users; the operator Auth-cleanup command completed with zero
pending work. Real provider erasure/revocation acceptance remains open; no hosted
retry schedule was installed.

Configured internal build [87bc28d0](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/87bc28d0-8c0e-4936-8222-d918d362b8ab)
succeeded. Signed IPA inspection verifies the existing bundle/team/registered
phone, Apple entitlement, Google URL scheme, required modules/secure storage and
current conditional CloudKit reset bridge. That provider build lacks iCloud
configuration and is superseded for iCloud testing by the configured build below.
Matching public inputs are in local/EAS development configuration. Cache-cleared
Metro's actual native bundle uses the staged API/Auth/Google inputs and contains
no actual server admin secret. Unpublished legal pages use a separate local LAN
reader; they were not published on the staged API. Install over the existing app
and keep phone/Mac on the same Wi-Fi.

The approved `iCloud.com.anthonyyoo.justgo` container is now assigned to the
existing App ID/team. Private `JustGoCollection`/`JustGoValue` schema is deployed
in Development and Production, with Encrypted String journal payloads and no
public read/create grants on these record types. Local/EAS development inputs
select Production for ad hoc signing; the existing phone provisioning profile
was regenerated. The config plugin retains this environment after DocumentPicker
without adding CloudDocuments access. Provider sign-in and app identity remain
configured.

Configured iCloud build
[ae5bf713](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/ae5bf713-8265-440d-b4f1-23bc135eec5b)
finished successfully. Downloaded signed IPA inspection verifies the exact
container, CloudKit/Production entitlements, matching provisioning permissions,
existing bundle/team/registered phone and current native writer/reset bridge.
Existing Apple/Google/secure storage/SQLite/Files/Keychain modules and the Google
URL scheme remain present; signature verification passes. The installation page
offers Install, and the supplied QR decodes to this build. Install over the
existing app, then reconnect to the restarted development server. Phone iCloud
acceptance is awaiting Anthony's result; two-device/error/deletion gates remain
open.

Native and JS uploads now have byte/count budgets. Native size retries preserve
fresh atomic generation fencing; durable cleanup can recover an expired cursor
without repeating deletion reset/closure or accepted guest adoption. Settings
retry preserves the intended enable/disable operation and opt-in. The dependency-free
Swift test target is separate from pod sources/uploads and has a required macOS
CI producer. Apple encrypted-data key reset/external zone removal currently fails
closed as unavailable; explicit recovery that retains deletion fences is an open
implementation-owner release task, recorded in the plan.

The shared modal lives in `components/modals`, shared provider artwork in
`components/auth`, portable archives in `data/backup`, and cloud handover beside
its coordinator in `data/cloud`. Adapter pairs and tests remain beside their
owners. Obsolete legacy presentation/tests were removed and old URLs redirect to
Account. Retained controller/vault/proof consumers preserve existing-owner and
pending-deletion compatibility. The private helper readiness and versioned
operator SQL have separate database/operator owners. Complete changed-directory
file lists were reviewed; no further moves were needed.

## Verification

Earlier Phase 13 candidate verification used pinned Node 24/npm 11 and sequential
heavy checks:

- Final full `npm run check`: online Expo Doctor 21/21, root/workspace/journey
  typechecks, lint with zero errors (176 existing warnings), formatting, 259 tooling
  tests, 180 API unit tests, 1,402 mobile tests and 35 contract tests.
- Full mobile/contracts coverage remained valid after cleanup; updated API coverage
  passed 272 tests. All aggregate/critical floors pass: mobile 88.27% branches /
  94.43% lines, API 88.59% / 96.22%, contracts 100% / 100%.
- Dedicated `test:db`: 91 integration cases plus registered migration/restoration
  rehearsal. Five transactional operator cases cover real SQL helper ownership,
  privileges, exact session/subject, strict expiry/null and unsafe tampering.
- All 11 affected saved entry/identity/deletion journey cases passed. One stale
  logout-footer expectation was corrected; its returning-provider case passed on
  rerun. This is distinct from real provider/device evidence.
- Cold web/iOS JavaScript exports and production-web no-API-traffic smoke passed.
  The grouped side-panel review verified current Account/provider entry pages,
  Welcome buttons and an old recovery-key URL redirect using a fresh anonymous
  static origin without hosted credentials or account creation.
- Hosted snapshot restore/forward/live preservation and actual runtime readiness
  checks passed as described above. Signed IPA/module/config inspection passed;
  installation and real provider flows remain unverified.

Setup/architecture/plan/decision documents and local links were reconciled.
Screenshots, QR and operator proofs remain ignored. Public legal text remains an
unpublished candidate. Device mocks, browser checks and binary inspection do not
establish native OAuth, private storage protection or CloudKit behavior.

The subsequent iCloud follow-up passed native Swift regressions, affected
adapter/coordinator/runtime/Settings and config/plugin-chain tests, required-job
tooling regressions, the saved backup/import and account-deletion journeys,
mobile typechecks, lint, formatting, online Doctor and a cold iOS bundle export.
Generated native config and the restarted phone Metro bundle use the approved
container/Production environment and retain the staged API/provider inputs.
A grouped isolated side-panel check verified the disabled web iCloud row and its
visible platform explanation without creating server accounts. These focused
checks do not refresh the earlier full phase/coverage evidence. The new macOS CI
job remains unverified on GitHub until an authorized push runs it.

## Open acceptance gates

| Gate                                          | Owner and completion point                                             | Required evidence                                                                                                                                                                                                      |
| --------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apple/Google and managed Auth setup           | Implementation owner with Anthony on the phone, before distribution    | Configuration/private-helper checks are complete; still verify real hidden email, cancellation/refresh/revocation, link/unlink and returning data on the phone.                                                        |
| Compatible signed build and device storage/UI | Anthony authorizes build; implementation owner verifies before beta    | New CloudKit bridge, native modules/entitlements, secure session storage, SQLite interruption/full storage/protection, Files/share cleanup, accessible phone layout and both modals.                                   |
| Real iCloud synchronization                   | Implementation owner with required devices, before enabled beta claims | Private schema/container/profile, two-device offline/conflict/reset/deletion, full storage and Apple-account changes, including sync off → delete → on.                                                                |
| Hosted migration and old-client cutover       | Anthony plus release owner before testers                              | 0019–0023, protected rehearsal and matching staged API are complete; still verify real existing-phone owner migration, Auth erasure/revocation, incompatible-client retirement and deletion-aware recovery acceptance. |
| Public notices/provider/retention             | Anthony plus privacy/release owner before public distribution          | Review updated unpublished candidates, actual private-data processing/retention and App Privacy answers; public URLs/approval remain pending.                                                                          |
| Inherited Phases 02–12 and billing/release    | Respective Phase 14/07A owners                                         | Remaining accessibility, diagnostics activation, purchases/guest paid admission, hosted CI and release evidence.                                                                                                       |

Local migration, mocks and browser tests do not establish hosted deletion, native
storage protection, real OAuth or CloudKit. Phase 13 remains open at these gates.
