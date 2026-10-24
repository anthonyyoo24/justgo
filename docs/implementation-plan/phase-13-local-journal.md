<a id="phase-13"></a>

# Phase 13 — Local data, optional accounts and cloud sync

**Status:** Ready for PR review; the API dependency-audit scope fix passes locally.
Exact hosted acceptance is recorded on PR #43. Mobile/tooling advisories remain pre-release work. Release acceptance
remains open. Native providers, protected hosted database/API cutover, private CloudKit
setup and cloud-only missing-storage recreation are implemented. Anthony confirmed
phone login, and actual single-phone CloudKit upload, sync-off isolation and
re-enable/restart catch-up have been verified. Anthony deferred the remaining
manual checks. The October 23 revision removes the rejected recovery-clearing flow;
its focused automated checks pass. The compatible native bridge is inspected and
exercised on the phone for on/off, catch-up and restart. External cloud deletion/
recreation and second-phone restore are owner-deferred and unverified before
release. The [handoff](../handoffs/phase-13-local-journal.md) distinguishes
verified behavior, owner deferrals and pre-release gates.

## Outcome

Match the researched How We Feel experience: users can journal without signing
in, optionally sign in with Apple or Google, and manage iCloud Sync, Download my
data, Import data and Delete all my data through concise Settings rows. Signed-in
accounts synchronize challenge history, feelings and reflections with JustGO's
Supabase-hosted database. Local storage remains durable and usable offline.
The same journal remains visible and editable before sign-in, after sign-in and
after logout. Signing in adds account synchronization; logging out stops account
uploads without switching the user to a different journal.

## Decisions and reference boundaries

- The [October 20 optional-account decision](../DECISIONS.md#october-20-optional-accounts-and-cloud-sync) supersedes the earlier local-only/manual-backup phase scope. Dependencies and remaining release gates from Phases 07–12 continue to apply.
- The [October 22 scoped-closeout decision](../DECISIONS.md#october-22-icloud-recovery-and-scoped-phase-13-closeout) defers remaining manual acceptance checks and limits this closeout to focused recovery checks; those deferrals do not establish release acceptance.
- The [October 23 iCloud decision](../DECISIONS.md#october-23-icloud-deletion-retains-phone-data) supersedes the recovery-clearing flow: external iCloud deletion retains phone entries, enabled sync may recreate/upload, and turning sync off keeps local data.
- The [October 21 continuity and Settings decision](../DECISIONS.md#october-21-journal-continuity-and-accountdata-settings) supersedes the optional guest-merge choice and permanent guest-collection selector. It also fixes the Account/Data organization, provider switches and deletion-modal requirements. Keep these connected changes within Phase 13 and implement the slices below in order.
- How We Feel's [privacy policy](https://howwefeel.web.app/privacy) distinguishes account-free local recording from account-user collection, including journal/check-in data. Its [captured login screen](https://mobbin.com/screens/5fc47e96-a36f-44eb-8fc3-d43871b3c121) describes cloud synchronization, its [data screen](https://mobbin.com/screens/0cc34b3f-9377-43e6-baac-23cf75ead256) groups iCloud Sync/download/import/deletion, and its [account screen](https://mobbin.com/screens/b4a6e18c-938d-40a7-99d3-94e873778bf0) preserves local data after logout. These sources do not establish its internal implementation, initial guest upload/merge rules or the relationship between its account sync and iCloud toggle. The rules below are JustGO implementation rules for those gaps, not claims about How We Feel.
- Use managed Supabase Auth with native Apple/Google sign-in; keep the existing Fastify API, PostgreSQL database and strict owner isolation. The authorized staging rollout now includes Supabase Auth; canonical ownership and existing-phone proof migration remain explicit boundaries.
- iCloud Sync means actual optional synchronization through the user's Apple iCloud account. It is separate from signing into JustGO and from downloading a manual snapshot. Its default is off. Do not ship a toggle backed only by Keychain credential synchronization or a one-time file export.
- Keep analytics, crash delivery and AI activation outside this change. Never include journal content or auth secrets in diagnostics or test artifacts. Preserve country exclusions, access/billing safeguards and ordinary Terms/Privacy links without legal-view/agreement receipts.
- Hosted configuration/migrations/deployment, Git publication, paid purchases and native signing/build/upload retain their existing separate authorization boundaries. This plan does not enable any provider or change hosted data.

## Keep, replace and retire

| Existing work                                                                                       | Treatment                                                                                             |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| SQLite/IndexedDB journal, historical context, offline reads, atomic saves and conflict preservation | Keep; adapt first sign-in and existing-data migration for one continuous journal.                     |
| Bounded backup validation, complete local export, file adapters and temporary-file cleanup          | Keep; verify the complete Download/Import flow against revised ownership and logout transitions.      |
| Completion retries, stable IDs, date handling and account isolation                                 | Preserve throughout the continuity migration and signed-in reconciliation.                            |
| Optional guest-merge checkbox and permanent View guest data action                                  | Replace with automatic adoption after disclosed sign-in; safely consume older parked phone data.      |
| Generic signed-in status block and Link Apple/Link Google actions                                   | Replace with Login methods rows, branded logos and switches reflecting verified provider connections. |
| Existing account-deletion modal and inline data-deletion confirmation                               | Reuse the modal presentation for both actions, retaining separate deletion rules and retry state.     |
| Blanket rule that no journal content can ever reach the JustGO API                                  | Already superseded; preserve local guest recording and disclosed signed-in journal sync.              |
| Retired legacy private PATCH, old queued private writes and legacy cloud-recovery option            | Keep retired; preserve the dedicated authorized journal-sync resource and never replay old queues.    |
| Custom recovery-key/device-transfer account UI and identity implementation                          | Keep managed sign-in; retain only legacy compatibility needed for proven ownership migration.         |
| Local-only copy and phase acceptance claims                                                         | Revise after the new behavior is verified; earlier test passes do not accept the expanded scope.      |

## Required product behavior

| Situation                                     | Expected result                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Continue without signing in                   | Challenges, history and journal work locally without creating an account or sending journal content to JustGO. Optional iCloud remains a separate explicit choice.                                                                                                                                       |
| First sign-in on this phone                   | Explain that signing in syncs this phone's history and journal to JustGO. Completing sign-in adopts that data automatically; no optional guest-merge checkbox or separate journal selection. If the account already has data, combine it safely.                                                         |
| Log out, edit and restart                     | The same saved entries remain visible and editable offline. Stop JustGO account sync; preserve pending local edits for that same account. Previously enabled iCloud remains governed by its own toggle and owner safeguards.                                                                             |
| Sign back into the same account               | Reconcile the phone's intervening edits with account history and reflections together, preserving conflicts and avoiding duplicate reps.                                                                                                                                                                 |
| Sign into a different person's account        | Never upload the previous account's journal to the new owner. Explain the account change in that action flow, keep the prior owner's local data protected and recoverable, and show the new account's data after successful sign-in. This exception does not create a permanent guest-data selector.     |
| Connect a second login method                 | Link it to the current JustGO account through verified provider identity. A provider already belonging to a different owner must not silently merge accounts.                                                                                                                                            |
| Delete JustGO's iCloud copy in Apple Settings | Keep this phone's journal and challenge history. If iCloud Sync stays enabled, it may recreate the cloud copy and upload those entries again. Turning sync off stops ordinary uploads and retains local data. This is separate from the in-app deletion actions below.                                   |
| Download / Import                             | One complete backup and one import flow for history, feelings, reflections, alternatives and supported preferences. Download uses the native share/save flow; the user can choose On My iPhone or iCloud Drive when available. Saving a file is a manual snapshot.                                       |
| Delete all my data                            | After confirmation, remove activity/journal from this phone, JustGO account storage if present and previously associated app-managed iCloud copies, even when sync is now off; keep the account, login methods and purchase entitlement. Track unavailable remote cleanup until complete.                |
| Delete account                                | After confirmation, remove the JustGO account and associated data, including local and previously associated app-managed iCloud copies. Preserve durable cleanup/retry until finished. This does not delete the person's Apple/Google account, cancel an App Store subscription or erase exported files. |

For both deletion actions, downloaded backups remain under the user's control.
Guests have Delete all my data but no account to delete. If the selected journal
belongs to a signed-out account, remote deletion requires signing back into that
same account inside the action flow; do not silently report a local wipe as deletion
of every copy. Account-owned import similarly authenticates the correct owner when
needed. Ordinary local reading, writing and downloading remain available signed out.
An archive never serves as a login credential.

## Implementation sequence

Slices 1–5 and cloud-only missing-storage recreation are implemented locally.
Slice 6 records completed setup/single-phone evidence and owner-deferred device
gates; slice 7 closes out local work with focused verification and the handoff.
Finish and verify each coherent slice before building dependent work on it. Keep one implementation owner for
continuity/auth/deletion; bounded independent reviews or icon work can use other
agents. Run heavy checks sequentially on the owner's Mac. No per-slice approval is
needed once implementation is requested; existing external-action permissions apply.

### 1. Preserve one journal through sign-in and logout

**Complexity: high. Owners:** `app-support/identity/auth`, the activity runtime,
`data/activity`, `data/journal` and `data/cloud`. Start by confirming the current
managed controller and durable state; reuse them rather than replace the storage
architecture. Existing logout already retains the selected owner-bound journal.
First sign-in and older parked guest copies are the main correction.

- Replace optional `mergeGuest` with automatic adoption after the sign-in disclosure.
  Cancelled/failed sign-in leaves all writing usable. Reconcile existing account data
  by stable entry/completion IDs; retain differing text as preserved versions.
- Persist migration progress and the source/target ownership before copying data.
  Keep the source until the destination is durably verified, then mark it consumed
  and retire the obsolete copy safely. Relaunch/retry must finish the same operation.
- Migrate existing guest-only, account-only and mixed installations. A parked source
  already adopted into an account must never reappear after logout or deletion.
  Preserve unadopted writing; never infer ownership from an email or upload a former
  account's entries into a different account.
- Cover the corresponding guest/account CloudKit zones during adoption. Persist a
  replay-safe handover and prevent old zones from recreating consumed/deleted data.
  Automated adapter evidence belongs here; physical validation belongs to slice 6.
- Remove the guest-selection controller/UI path once existing writing is reachable
  through these transitions. Keep internal account boundaries; the user no longer
  manages separate guest and account journals.
- Preserve local-first saves, pending edits after logout, cancellation/account-change
  fences and server deletion epochs/tombstones. Ordinary sync must never use an
  explicit-restore override to bring deleted writing back.

**Verify before proceeding:** controller/repository/runtime regressions for first
sign-in to empty/existing accounts, conflict/deduplication, upgrade states, offline
logout/edit/restart/re-login, another-owner sign-in, interrupted migration and lost
acknowledgements. Include pending deletion and stale cloud responses. Exercise the
affected real API/database boundary on dedicated loopback `justgo_test`.

### 2. Make Apple and Google switches reflect actual connections

**Complexity: medium. Owners:** managed identity controller and `platform/auth`.
Retain `@supabase/supabase-js`, `expo-apple-authentication`, the free/original
`@react-native-google-signin/google-signin` integration and secure session storage.
Expose the verified linked-provider list to Account instead of a single last-used
provider. Both switches may be on when both methods belong to the same account.

Planned switch behavior:

- Signed out: turning on a method starts provider sign-in. Signed in: turning on
  another method links it to the current account. Cancel/failure leaves the prior
  switch state intact. Refresh verified identities before showing success.
- Turning off a connected method disconnects that method only when another usable
  method remains. Add the missing unlink adapter/controller behavior; protect the
  last method with concise action feedback directing the user to Log out. Log out
  remains the separate way to end the session, with switches off while signed out.
- Show loading/disabled interaction during an operation, with accessible switch
  labels and error feedback. Do not add a separate signed-in status block or
  “You're signed in with Google” sentence.

Preserve canonical-owner mapping, verified legacy linking and live
session/revocation checks. Do not match legacy owners by email, client IDs or
editable metadata. Old recovery keys/codes remain absent from product UI; retain
only compatibility needed to prove migration and deleted-account non-recreation.

**Verify before proceeding:** no/one/both connected methods, link/unlink success,
last-method protection, already-owned identity, cancellation, provider error,
session refresh/expiry, stale callbacks and logout. Recheck current provider
documentation before coding unlink. Synthetic adapters establish application
behavior only; real provider acceptance remains in slice 6.

### 3. Organize the Account and Data pages

**Complexity: low. Owners:** `identity/account`, `features/settings/data` and shared
settings components. Depend on the state and transition rules from slices 1–2.

| Account page, in order                                                     | Data page, in order                                 |
| -------------------------------------------------------------------------- | --------------------------------------------------- |
| Login methods: Apple logo/name/switch, then Google logo/name/switch        | iCloud Sync: cloud with circular arrow, plus switch |
| Log out, when signed in                                                    | Download my data: downward arrow with tray          |
| Delete account, with red text and trash icon, when an account is available | Import data: matching upward arrow with tray        |
|                                                                            | Delete all my data at the bottom                    |

Use the existing JustGO typography, spacing and icon system with the reference
organization. Do not add profile/friend-code features from the reference. Remove
the generic Signed in/On this phone block, Link Apple/Google rows, View guest data
and redundant descriptions. Keep necessary disclosure/errors in the action flow.
Both deletion actions use red labels and trash icons, omit chevrons and open the
shared confirmation modal directly on their current page. Keep the account
subscription warning in the modal and retain the standalone deletion route for
interrupted cleanup and existing deep links.
An unavailable iCloud control must give a visible short reason or open an
explanation when tapped; it must not appear silently broken.

Preserve the Welcome logos and Sign in with Apple / Sign in with Google buttons
above Continue. Remove the obsolete optional guest-merge UI wherever sign-in starts.

**Verify before proceeding:** component tests for signed-out/signed-in states,
provider switches, exact actions, red Delete account, icon accessibility and
unavailable iCloud feedback. Check both pages in one grouped side-panel walkthrough
after tests; later verify small-screen layout, large text and VoiceOver on device.

### 4. Reuse the existing deletion confirmation modal

**Complexity: medium. Owners:** `identity/deletion`, Settings Data and reusable
modal presentation in `src/components`. Extract only the common presentation from
`DeleteAccountConfirmation`; keep each action's domain logic with its owner.

- Replace the inline Data confirmation with the same modal used for account
  deletion. Preserve safe-area layout, background isolation, accessibility/focus,
  Cancel, destructive confirmation, busy state and retry/error feedback.
- Use action-specific titles and consequences, with Cancel and Delete buttons in
  both modals. Delete all my data
  keeps the account; Delete account removes it. Opening/cancelling a modal performs
  no deletion. Repeated taps cannot start competing operations.
- Keep durable pending-deletion state independent of modal mounting/dismissal and
  app restart. Never report success while promised remote cleanup is unfinished.

**Verify before proceeding:** both callers, cancellation, focus/isolation,
confirmation, busy/repeated-tap protection, failure/retry and interrupted cleanup.
Include both dialogs in the grouped walkthrough and native accessibility check.

### 5. Reconcile backup, import and deletion with continuity

**Complexity: high. Owners:** `data/backup`, cloud/activity orchestration,
Settings Data and the API sync/deletion resources. Retain the existing bounded
versioned ZIP, readable export and file adapters; this is a compatibility and
behavior correction, not another backup format or a second restore screen.

- Ensure downloads include the selected continuous journal, challenge history,
  preserved alternatives and supported preferences before/after sign-in and logout.
  Keep native share/save, cancellation and temporary-file cleanup.
- Retain one import preview with version, size, schema, historical-context and
  ownership validation. Preserve compatible earlier files without inventing reps.
  Never import credentials, sessions or raw queues. Retry safely after partial
  delivery; duplicate import must not duplicate completions.
- Guest use needs no account/key. Account-owned archives still require the correct
  authenticated owner; ask for that provider sign-in within Import if necessary.
  A file cannot recover a deleted identity or authorize a different owner. Explicit
  import after data deletion may restore supported data; background sync may not.
- Apply both deletion actions to adopted sources, local selected data, server data
  and previously associated app-managed iCloud copies, even if sync is now off.
  Preserve enough cleanup metadata to finish when the relevant iCloud account is
  reachable again; never delete another owner's data. Authenticate the retained
  owner if signed out before committing a remote deletion. Preserve existing operation IDs, epochs/generations,
  retryable Auth-user cleanup and the pending state through relaunch.
- Retain the earlier server-only reset scope. Registered migrations 0019–0023
  remain immutable; use new forward migrations if needed. Do not replay obsolete
  private PATCH queues or erase phone writing as part of the legacy server reset.

**Verify before proceeding:** export/import before first login, while signed in and
after logout; same-account full restore, malformed/oversize/wrong-owner files,
cancelled authentication, conflicts and duplicate retries. Test both deletion
actions during migration, offline/failed remote cleanup, lost acknowledgements and
stale-device/iCloud responses. Prove deleted data cannot return from a consumed
guest source. Run affected database suites and saved backup/deletion journeys.

### 6. Complete provider and iCloud setup, build and device acceptance

**Complexity: high; external setup required. Owners:** Anthony for account access
and restricted actions; implementation owner for configuration/runbook preparation,
native integration and verification. Coordinate with Phase 14 release ownership.

Installed development build [1a1174d6](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/1a1174d6-160a-48ef-8a0e-4ffccfbc1590)
contains the configured native providers, Apple entitlement, Google URL scheme
and private CloudKit/quota bridge. Anthony confirmed phone login. Single-phone
upload/readback, sync-off isolation and re-enable/restart catch-up have passed;
they do not establish the deferred multi-device/deletion matrix or the revised
external-deletion behavior. Historical build
[3cbc873a](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/3cbc873a-ea18-4cf7-b309-c62ed87ace05)
contains the rejected recovery flow and is superseded. Compatible development
build [b4da28da](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/b4da28da-e425-4e5a-83fd-d734b87f39c4)
from source `4a9f10f` finished successfully and passed signed-binary inspection.
Its mandatory `readRetainingLocal` bridge has now been exercised on the phone:
all five challenge/journal pairs match iCloud after off/on catch-up and restart.
External deletion/recreation and second-phone restore remain owner-deferred and
unverified before release.
Follow
[ACCOUNT_SYNC_SETUP.md](../operations/ACCOUNT_SYNC_SETUP.md) and the
[rollout runbook](../operations/LOCAL_JOURNAL_ROLLOUT.md).
The [working-login execution checklist](../operations/ACCOUNT_SYNC_SETUP.md#execution-checklist-working-apple-and-google-login)
expands the provider work below into ordered steps: audit retained recovery code,
configure providers, coordinate the API/database, build the configured app, verify
real phone login/data continuity, then remove obsolete recovery consumers.
This remains Phase 13 work. The handoff records completed provider/hosted/build
setup separately from the still-open phone and iCloud acceptance gates.

1. Prepare the exact Apple/Google OAuth, Supabase Auth and private CloudKit
   configuration against the existing bundle/team identity. Recheck SDK/provider
   documentation, nonce/callback handling and schema requirements. Keep secrets
   off the phone and out of docs. Retain the existing iOS baseline.
2. Complete the separately authorized provider/container/capability configuration
   and any required managed API rollout. Implement the missing native/configuration
   handling, including visible unavailable/signed-out-of-iCloud/quota/error states.
3. Create a further compatible development build in the separately authorized
   native build task; inspect its entitlements, URL schemes and module linkage.
   Supply the install link and QR code for phone testing.
4. Verify real Apple and Google sign-in/linking/returning data, hidden-email,
   cancellation, refresh, revocation and deletion. Verify secure session storage
   and native Files/share/import cancellation and cleanup.
5. Verify private CloudKit on two devices: opt-in/off, offline edits/reconnect,
   conflicts, adoption, logout, Apple-account changes, unavailable/full storage and
   both deletion actions. Turning sync off stops synchronization and keeps local
   writing; it does not silently delete the existing cloud copy. Test sync on →
   off → delete → on/new device, including deletion while the relevant iCloud
   account is unavailable. Record pending remote deletion honestly and prevent
   stale copies from restoring it.

**Exit evidence:** the actual configured build and device results, distinct from
mock/browser checks. If a setup/device dependency is unavailable, keep its named
gate open; an unresponsive switch or successful native compilation is not acceptance.

#### iCloud execution checklist

Anthony authorized this checklist and iCloud implementation, including the
required Apple setup and compatible internal iPhone build. Keep the existing
Apple team `NPDYTJS425`, bundle `com.anthonyyoo.justgo` and Expo project. Git
publication, public distribution and purchases retain their separate permissions.
One implementation owner coordinates code/configuration and sequential heavy
checks; independent native and TypeScript audits cover separate boundaries.

- [x] Audit the current Swift CloudKit bridge and TypeScript lifecycle/collection
      coordinator. Fix concrete readiness, restore, concurrency, account-change
      or deletion defects with focused regression tests before external setup.
- [x] Inspect Apple Developer and CloudKit access. Reuse an appropriate existing
      container or register `iCloud.com.anthonyyoo.justgo` under the existing team,
      associate only the JustGO app, and enable CloudKit private-database access.
      Complete any required interactive Apple authentication with the owner.
- [x] Configure the exact container identifier in the app/build environment.
      Verify generated Info.plist, CloudKit entitlements, signing profile and
      development/production environment agree. Preserve existing Apple/Google
      login configuration, secure storage and phone data.
- [x] Prepare the `JustGoCollection` and `JustGoValue` record schema from the
      actual native fields. Verify the environment used by the signed internal
      build has that schema; deploy schema changes when required without copying
      private records or enabling public access.
- [x] Run affected adapter/coordinator/configuration tests and saved data/deletion
      journeys. Run fresh online Expo validation and the required native-build
      checks, then create the compatible EAS development build. Download and
      inspect the signed IPA for the exact container/environment and current
      native bridge; provide the installation link and QR code.
- [x] On the first physical iPhone, verify availability, explicit opt-in,
      real disposable challenge/journal upload and canonical content readback.
      Verify off retains the local/cloud copies without uploading a new entry,
      then re-enable/restart and verify all three local challenge/journal pairs
      match iCloud. Storage-full feedback was also observed on this phone.
- [x] Exercise the compatible October 23 bridge on the phone: on matches four
      challenge/journal pairs, off keeps the fifth local without uploading it,
      and re-enable/restart match all five pairs with sync enabled and idle.
- [ ] **Owner-deferred, unverified before release:** finish the single-phone
      offline-save/reconnect case. Anthony explicitly skipped this remaining
      step on October 22; implementation owner and Anthony retain acceptance.
- [ ] **Owner-deferred, unverified before release:** use two physical devices to
      verify guest/account restoration, edits in both directions, conflicts,
      Apple-account changes and deletion propagation. Include sync off -> delete
      -> on, interrupted handover/reset and owner-isolation cases. Implementation
      owner coordinates with Anthony and the Phase 14 release owner.
- [x] Remove the rejected Clear older copy and sync action and recovery-clearing
      flow. After external deletion/reset, enabled ordinary reads recreate only
      missing cloud storage without clearing phone journal/challenge history.
      Off stops ordinary uploads and retains local entries. Preserve live roots,
      genuine in-app deletion/closure, server epochs, pending cleanup and handover.
      Cancel legacy recovery clearing only when no actual deletion/cleanup or
      authoritative account-epoch clear remains. See [ACTIVITY_DATA.md](../architecture/ACTIVITY_DATA.md).
- [x] Inspect compatible native build [b4da28da](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/b4da28da-e425-4e5a-83fd-d734b87f39c4)
      from source `4a9f10f`: its verified signed binary contains `readRetainingLocal`
      and retains app/container/provider, registered-phone and Keychain capabilities.
      This capability also guarantees real in-app reset/closure writes the
      deletion marker even on legacy roots. Older bridges are rejected safely;
      `3cbc873a` is historical evidence and must not be used for this acceptance.
- [ ] **Owner-deferred, unverified before release:** verify external cloud
      deletion/reset retains phone entries and enabled sync recreates/uploads.
      Anthony explicitly deferred this case and second-phone restoration after
      the compatible bridge's single-phone checks. Implementation owner, Anthony
      and Phase 14 release owner retain acceptance; those passes do not establish
      either deferred case.
- [x] Reconcile setup, architecture and handoff evidence together. Distinguish
      console setup, automated tests, signed-build inspection and physical-device
      evidence; retain any unavailable device gate with its owner and next step.

### 7. Reconcile documents, verify and hand off

Update PRD, IDENTITY/ACTIVITY_DATA/APP_SHELL/TECH_STACK, rollout/setup/testing
guidance, Privacy/Terms candidates, data inventory, App Privacy worksheet and the
handoff together when implemented behavior is verified. Clearly disclose that
signed-in feelings/reflections reach JustGO's cloud database and distinguish that
from guest local use and optional personal iCloud copies. Reassess the actual
Vercel/Supabase private-data processing and reopened provider/retention conditions;
do not retain clearance assumptions based on completion-only traffic.

Run focused tests during each slice. For the October 22 scoped closeout and the
October 23 follow-up,
Anthony explicitly requested only checks related to the recovery/native bridge,
adapter/coordinator and affected UI changes, with no unrelated or repeated broad
phase suites. Record those current results separately from earlier full-phase
checks. Use one grouped in-app walkthrough after affected UI tests. This does not
refresh aggregate coverage, full-suite, database, export or hosted CI evidence.
Before publication/release, the release owner still runs the applicable broader
gates in [TESTING.md](../operations/TESTING.md).

Anthony also explicitly deferred the remaining offline/reconnect test, all
second-device/Apple-account-change cases, extended Apple/Google continuity and
account-isolation cases, and physical Download/Import/deletion checks. Keep these
named and unverified under Anthony, the implementation owner and the Phase 14
release owner; no manual run is required to finish this scoped implementation
closeout. Build `b4da28da` is finished, inspected and exercised on the phone for
on/off, catch-up and restart. External deletion/recreation and second-phone
restore remain explicitly owner-deferred and unverified before release. The live side-panel UI walkthrough
was blocked by browser-tool URL security policy and is not accepted as passed.
Public privacy approval/publication remains pending. Local
closeout does not mean the candidate is accepted for production release.

PR publication preparation subsequently passed full checks/coverage, all 43
saved journeys, cold web/iOS exports and the production-web smoke case; current
evidence is in the [handoff](../handoffs/phase-13-local-journal.md#pr-publication-validation).
The API audit now projects exact locked production dependencies to prevent an
unused optional Expo driver from importing the mobile graph into the server gate.
Its unchanged low threshold passes locally and still rejects the earlier vulnerable
Fastify lock. PR #43 records historical Phase 13 hosted results; the combined
SDK 58 candidate requires passing hosted checks on the exact head of
[PR #46](https://github.com/anthonyyoo24/justgo/pull/46). The nine mobile/tooling
advisories remain pre-public-release work for the implementation/dependency owner and Phase
14 release owner. Native/SDK upgrades require a separate task; do not weaken the
audit gate.

## Acceptance requirements

These are the revised acceptance targets. Checked implementation items establish
local automated/browser behavior; the single-phone item explicitly records actual
physical evidence. Other provider/device requirements remain separate. Preserve
existing beta/subscription access rules, billing identity and the deferred Phase
07A activation boundary throughout the work.

- [x] Guest saves/relaunches work offline with no journal upload to JustGO; the same entries survive first sign-in, logout/edit/restart and same-account re-login.
- [x] Existing parked guest data is safely adopted once; interrupted migration, conflicts, repeated import and retries neither lose writing nor duplicate reps.
- [x] View guest data and optional guest-merge UI are gone; internal ownership still prevents cross-account uploads and stale callbacks.
- [x] Apple/Google logos and verified switches appear under Login methods, with working link/unlink/last-method handling and no separate connected-status sentence.
- [x] Account/Data have the agreed row order, matching download/import/cloud icons, Log out, red Delete account and Delete all my data at the bottom of Data.
- [x] Both deletion actions reuse the existing modal presentation with distinct wording, cancellation, accessibility and durable busy/error/retry behavior.
- [x] One Download/Import flow covers all supported history, writing and preferences, including signed-out behavior and correct-owner authentication when needed.
- [x] Signed-in sync remains authenticated, durable and account-isolated; both deletion actions remove promised copies without source/stale-device resurrection.
- [ ] **Owner-deferred before release:** extended real Apple/Google session, return-login, revocation, linking/unlinking, account-isolation and deletion cases. Basic phone login is confirmed.
- [x] Single-phone iCloud upload/readback, sync-off isolation, re-enable/restart catch-up and storage-full feedback are verified.
- [ ] **Owner-deferred before release:** offline/reconnect, two-device/account-change and native Download/Import/deletion cases.
- [x] External cloud deletion/reset cannot authorize clearing phone entries; enabled sync recreates missing cloud storage, and the rejected recovery-clearing UI is removed. Genuine in-app deletion and account-epoch fences remain.
- [x] The revised `readRetainingLocal` native bridge has a compatible inspected signed build, `b4da28da`, from source `4a9f10f`.
- [x] The compatible `readRetainingLocal` bridge is exercised on the phone; on/off, catch-up and restart retain/match all five challenge/journal pairs as applicable.
- [ ] **Owner-deferred before release:** actual external-deletion/reset and second-phone restore acceptance, distinct from the verified single-phone cases, under Anthony, the implementation owner and Phase 14 release owner.
- [x] Documents distinguish current implementation, earlier evidence and owner-deferred release gates; public privacy approval/publication remains pending.
- [x] Focused checks for the October 23 cloud-only recreation revision pass and are recorded in the handoff: 145 distinct JavaScript tests across seven suites, 30 Swift tests, mobile source/tests typechecks, changed-file ESLint and online Expo Doctor 21/21. Live browser verification is blocked and remains unverified; historical recovery-closeout results do not establish the revision.
- [ ] **Merge blocker:** resolve the exact CI dependency-health audit's nine remaining advisories under the implementation/dependency owner. This is not an owner-approved deferral; preserve the native/SDK separate-task requirement and existing audit gate.

## Primary implementation references

- [Supabase Apple sign-in](https://supabase.com/docs/guides/auth/social-login/auth-apple), [Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google) and [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking).
- [Expo SDK 57 Apple authentication](https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/), [SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/) and [Google native Expo setup](https://react-native-google-signin.github.io/docs/setting-up/expo).
- [Apple CloudKit](https://developer.apple.com/icloud/cloudkit/).

These references were checked during earlier Phase 13 work. Recheck relevant current versions,
provider configuration and changelogs before implementation/publication.
