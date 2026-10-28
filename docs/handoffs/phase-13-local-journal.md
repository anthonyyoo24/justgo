# Phase 13 — Optional accounts and complete data controls

## Status

The continuity/Settings, working-login and private iCloud implementation passed
reviewed-candidate hosted checks on [PR #43](https://github.com/anthonyyoo24/justgo/pull/43).
PR #43 had targeted `codex/phase-13-data-foundation` after
[#44](https://github.com/anthonyyoo24/justgo/pull/44) merged that branch into `main`.
Local integration `32c66ff` on `codex/phase-13-integration` merged the reviewed
foundation head `cb8b89c`; its baseline tree matches reviewed candidate `a3a3be2`.
[PR #46](https://github.com/anthonyyoo24/justgo/pull/46) now integrates the remaining
refinements and the SDK 58 upgrade into `main` at `2c554f7`. Its final candidate
`4d39cf2` passed all seven hosted Foundation jobs before merging. Local `main`
was fast-forwarded to that merge, with the same file tree as the tested candidate.
The [SDK 58 prerequisite](phase-14-native-upgrade.md) owns the updated
dependency-health evidence. The October 23 revision removes the rejected recovery
clear flow and retains phone data when the iCloud copy is removed externally;
its focused automated checks pass. The compatible bridge has been exercised on
the phone for upload/readback, sync-off isolation, catch-up and restart; actual
external-deletion/recreation and second-phone restore acceptance are explicitly
owner-deferred and unverified before release. Earlier phone login is verified
separately.
Anthony explicitly deferred the remaining manual acceptance checks and requested
focused checks for this closeout. The compatible build for the revised native
bridge is finished, inspected and exercised on the phone.
This is not production release acceptance.
The [plan](../implementation-plan/phase-13-local-journal.md) owns remaining scope;
the [October 22 decision](../DECISIONS.md#october-22-icloud-recovery-and-scoped-phase-13-closeout)
records the scope and deferrals; the [October 23 decision](../DECISIONS.md#october-23-icloud-deletion-retains-phone-data)
supersedes its recovery-clearing behavior and records the later acceptance deferrals.

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
  the bottom. iCloud opens the illustrated opt-in sheet with a fixed illustration
  and reserved error space; feedback/retry stays in the sheet. Initial activation
  commits on only after successful synchronization. A loading indicator covers
  the initial status read so a saved on-state mounts without sliding from off.
  Both deletion actions use the shared accessible confirmation modal, retaining
  independent consequences, cancellation, focus isolation, busy state and retry
  feedback.
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
- Removing JustGO's iCloud copy through Apple Settings or an encrypted-data reset
  does not clear phone entries or change the saved sync choice. Enabled ordinary
  sync may recreate missing cloud storage and upload local journal/challenge
  history; off stops ordinary uploads and keeps local entries. Clear older copy
  and sync and its recovery-clearing flow are removed. Genuine in-app deletion,
  closure, handover and server-epoch safeguards still apply.

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

External iCloud-only deletion is not an in-app deletion instruction. Missing-cloud
reads create an empty root without a deletion marker and rebuild cloud-version
bookkeeping while preserving all phone entries. Genuine reset/closure always
writes the app-deletion marker, superseding legacy external-recovery markers.
The adapter requires the new `readRetainingLocal` capability before data
operations, so older destructive bridge behavior cannot be used accidentally.
An unfinished legacy recovery clear is canceled only when no actual deletion,
cleanup or authoritative account-epoch clear still needs completion.

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

Installed iCloud development build
[1a1174d6](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/1a1174d6-160a-48ef-8a0e-4ffccfbc1590)
finished successfully. Signed IPA inspection verifies the exact container,
CloudKit/Production entitlements, matching provisioning permissions, existing
bundle/team/registered phone, native writer/conditional reset and per-record
quota-error collection. Apple/Google/secure storage/SQLite/Files/Keychain modules
and the Google URL scheme remain present; signature verification passes.
Single-phone behavior on this build is recorded below. It predates both the
superseded recovery bridge and the revised cloud-only recreation bridge.

Historical recovery build [3cbc873a](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/3cbc873a-ea18-4cf7-b309-c62ed87ace05), from source `b6c75d5`, finished successfully
on October 22. It contains the rejected clear flow and is superseded; do not use
it to accept the October 23 behavior. At that checkpoint, fresh online Expo
Doctor passes 21/21. Downloaded IPA signature verification and inspection confirm
`com.anthonyyoo.justgo`, team `NPDYTJS425`, `iCloud.com.anthonyyoo.justgo`,
CloudKit/Production, registered-phone provisioning, Keychain access, Apple sign-in
and Google's URL scheme; the full provisioning profile is unchanged from the
installed `1a1174d6` binary. The actual Mach-O contains `readGuarded` and
`ZONE_RECOVERY_REQUIRED`, establishing that the former native recovery bridge is in
this binary. The install QR was decoded and matched to its exact installation URL.
Installation and real recovery/reset acceptance were not established.

Replacement development build [b4da28da](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/b4da28da-e425-4e5a-83fd-d734b87f39c4),
from source `4a9f10f`, finished successfully on October 23. Downloaded IPA
signature verification (`codesign --verify --deep --strict`) passed; its actual
Mach-O contains `readRetainingLocal` and no `readGuarded`. Inspection confirms
`com.anthonyyoo.justgo`, team `NPDYTJS425`, container
`iCloud.com.anthonyyoo.justgo`, matching Info.plist container and CloudKit-only
Production entitlements. Registered-phone provisioning, profile and Keychain
permissions are unchanged from `1a1174d6`; Apple sign-in and Google's URL scheme
remain present. The installation QR was decoded against this exact build URL.
The phone Metro uses the matching staged API. An OTA or development-server update
cannot add this capability; older native bridges safely reject data operations.
The mandatory `readRetainingLocal` bridge was successfully exercised on the phone.
Actual external-deletion/recreation and second-phone restore remain explicitly
owner-deferred and unverified before release.

Native and JS uploads now have byte/count budgets. Native size retries preserve
fresh atomic generation fencing; durable cleanup can recover an expired cursor
without repeating deletion reset/closure or accepted guest adoption. Settings
retry preserves the intended enable/disable operation and opt-in. The dependency-free
Swift test target is separate from pod sources/uploads and has a required macOS
CI producer. The revised native missing-storage read retains existing live roots,
including closed-account and real-deletion roots. Only missing cloud storage is
recreated, with no local-clear instruction. Phone writing is retained unless a
genuine in-app deletion or authoritative account-epoch fence applies. Compatible
external-deletion/recreation and broader physical checks remain implementation-owner
release tasks.

The shared modal lives in `components/modals`, shared provider artwork in
`components/auth`, portable archives in `data/backup`, and cloud handover beside
its coordinator in `data/cloud`. Adapter pairs and tests remain beside their
owners. Obsolete legacy presentation/tests were removed and old URLs redirect to
Account. Retained controller/vault/proof consumers preserve existing-owner and
pending-deletion compatibility. The private helper readiness and versioned
operator SQL have separate database/operator owners. Complete changed-directory
file lists were reviewed; no further moves were needed.

## Verification

Actual phone checks on the configured iCloud build established:

- A disposable completed challenge and its journal/reflection matched CloudKit
  by canonical content, beyond merely reading collection metadata.
- With sync off, two challenge/journal pairs remained on the phone while only the
  earlier pair remained in iCloud. The newly saved IDs were absent remotely and
  the prior cloud copy was retained. The read-only diagnostic did not upload,
  delete or turn the saved preference on.
- After re-enabling, restarting and saving another challenge/reflection, all
  three local completion/journal pairs matched CloudKit, including the pair
  saved while off. There were no missing canonical records.
- The actual storage-full condition reached the concise iCloud-full message.

On October 23, the compatible replacement bridge was exercised on the phone:

- Sync on matched all four challenge/journal pairs in iCloud by canonical content.
- Sync off retained five pairs on the phone and four in iCloud; the newest
  challenge and reflection were absent remotely, earlier records still matched,
  and the saved preference remained off. The diagnostic did not upload or delete.
- Re-enabling caught up all five pairs. After the owner force-quit and reopened
  JustGO, all five pairs still matched iCloud, with sync enabled and idle.

These results confirm actual use of `readRetainingLocal`, local retention while
off and persisted synchronization after restart. They do not establish external
iCloud deletion/recreation or restoration to a second phone.

The later toggle-initial-state fix passed focused row/toggle/Data/preview
regressions, mobile typechecks, lint and an isolated side-panel walkthrough. The
walkthrough established initial checked geometry and browser-unavailable
feedback; it did not establish native missing-storage behavior.

Historical October 22 recovery-closeout verification passed for the subsequently
rejected flow:

- 145 distinct JavaScript regressions across seven directly affected suites,
  including recovery consent before stale-account replacement/cleanup, reset
  persistence, lifecycle fences and the affected Settings behavior.
- 31 production-native SwiftPM tests, including preservation of the external
  recovery marker through ordinary resets. This is native package testing, not
  physical CloudKit acceptance.
- Mobile source/test typechecks and ESLint for all changed TypeScript/MJS files,
  with no lint errors or warnings.
- One isolated side-panel recovery preview: the message occupied two lines in
  the reserved space, artwork stayed fixed, Clear older copy and sync was
  explicit, and closing returned to the off state. This was presentation evidence
  for the rejected flow, not native recovery or a real data operation.

An independent audit's recovery-ordering and durable-marker findings were fixed
and regression-tested; no required review finding remains. Anthony requested no
unrelated/full-phase suites for this scoped closeout. Earlier broad checks below
remain historical evidence and aggregate coverage/publication gates were not
refreshed. The compatible signed recovery build subsequently passed fresh online
Doctor and the binary inspection above; its installation/native-device acceptance
was not established, and that rejected flow is no longer an acceptance candidate.
These results do not accept the October 23 revision.

Focused October 23 revision verification passed:

- 145 distinct JavaScript tests across seven affected suites cover local-data
  retention, legacy clearing-intent migration, real deletion/account-epoch fences,
  adapter capability checks and affected Settings/preview consumers. The final
  adapter-only rerun passed 32 tests after its test-code lint correction.
- 30 SwiftPM tests cover missing-cloud recreation, preservation of live/closed
  roots, failure handling and genuine in-app deletion superseding legacy markers.
- Mobile source/test typechecks, changed-file ESLint and online Expo Doctor 21/21
  passed.

The live side-panel UI walkthrough was blocked by the browser tool's URL security
policy; it was not completed or counted as passed. No workaround was attempted.
These automated checks do not establish physical external-deletion behavior.
That focused follow-up did not refresh aggregate coverage, database or hosted CI
gates. The later publication preparation below records its separate validation.

### PR publication validation

Publication preparation passed full `npm run check`: online Expo Doctor 21/21,
source/test/journey typechecks, lint/formatting, 260 architecture/tooling tests,
180 API unit tests, 1,517 mobile tests across 142 suites and 35 contract tests.
Full coverage passes all-source and critical floors for API (272 tests, including
real local database and migration checks), mobile (1,517) and contracts (35).
Cold web/iOS exports and the production-web smoke case pass. The 30 native tests
remain applicable because native source has not changed.

All 43 saved journeys pass in one complete run with the patched API. A stale
Home Refresh challenges assertion was corrected in `582194c`; the approved
provider handoff retains Sign in/Try again. Its lint/formatting and journey
typecheck also pass.

The first hosted candidate failed its API dependency audit and the dependent
aggregate `checks` status; native, unit, database, journeys and exports passed.
Fastify was patched from 5.12.5 to 5.12.7 in `414a085`, with lockfile changes
limited to Fastify; all 272 API tests, API typechecks and combined coverage floors passed
afterward. The shared-workspace audit still followed Drizzle ORM's unused optional
Expo SQLite peer into the mobile Expo/tooling graph, reporting nine remaining
vulnerabilities (three moderate, five high and one critical).

`npm run audit:api` now audits a temporary projection of the API's exact locked
production dependencies, available optional runtime dependencies and required
peers. It preserves nested/workspace resolution, fails on manifest drift or missing
required packages and runs ordinary npm audit with the same low threshold. No
advisory is suppressed. The current graph reports zero vulnerabilities; a live
negative control against the earlier Fastify 5.12.5 lock correctly fails at low
severity. Tooling regressions cover dependency selection, required peers, exact
versions/aliases, invalid graphs, manifest drift, failure propagation and cleanup.
Fresh full `npm run check` also passes after this tooling fix: online Doctor 21/21,
all typechecks, lint/formatting, 270 tooling tests, 180 API unit tests, 1,517 mobile
tests and 35 contract tests. App/native source and coverage selectors are unchanged;
the prior application coverage, database, journey and export evidence remains
applicable, with hosted producers enforcing those gates again on the pushed head.
PR #43 records historical Phase 13 results. Hosted acceptance for the combined
SDK 58 candidate must be checked on [PR #46](https://github.com/anthonyyoo24/justgo/pull/46)
for its exact pushed commit; local results and earlier PR results do not establish
that pass.

The nine mobile/tooling advisories are not patched by this scope correction and
remain pre-public-release work for the implementation/dependency owner and Phase
14 release owner. Native/SDK upgrades require a separate task. API audit acceptance
does not establish all-mobile dependency health or inspect the deployed Vercel
artifact. PR #43's subsequent merge into the foundation branch and the remaining
`main` integration are recorded in the status above; release acceptance remains open.

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
  real provider/device acceptance was still pending at that earlier checkpoint.
  Later phone evidence above supersedes only the named single-phone cases.

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
checks do not refresh the earlier full phase/coverage evidence. The macOS native
job subsequently passed on PR #46's initial head `139d27b`. That run's journey
fixture failure and follow-up are recorded in the
[SDK upgrade handoff](phase-14-native-upgrade.md). The final combined candidate
`4d39cf2` passed all seven hosted Foundation jobs before PR #46 merged.

## Open acceptance gates

Anthony explicitly skipped the remaining manual steps 1–4 on October 22:
offline/reconnect; second-device/Apple-account-change cases; extended provider
continuity/account-isolation; and native Download/Import/deletion cases. These
are owner-approved deferrals from this implementation closeout, remain unverified
and must be resolved by the named owners before release. Existing single-phone
passes above are preserved. No skipped check is treated as passed.
Anthony subsequently explicitly deferred external iCloud deletion/recreation and
second-phone restore as well. Their owners remain Anthony, the implementation
owner and the Phase 14 release owner before release.

| Gate                                                  | Owner and completion point                                                            | Required evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Revised cloud-only recreation build/device acceptance | Implementation owner with Anthony, before release                                     | Build `b4da28da` from `4a9f10f` is inspected and its mandatory bridge exercised on the phone for on/off, catch-up and restart. External deletion/recreation and second-phone restore are explicitly owner-deferred and unverified before release under Anthony, the implementation owner and Phase 14 release owner; verify local retention, enabled re-upload and real app-deletion/epoch fences. `3cbc873a` is superseded; earlier single-phone evidence is from `1a1174d6`. |
| Offline/reconnect and multi-device iCloud             | Anthony and implementation owner with Phase 14 release owner, deferred before release | Offline local save/reconnect; second-device guest/account restore, bidirectional changes/conflicts, Apple-account changes and deletion propagation, including sync off → delete → on.                                                                                                                                                                                                                                                                                          |
| Extended Apple/Google continuity                      | Anthony and implementation owner with Phase 14 release owner, deferred before release | Hidden email, cancellation/refresh/revocation, link/unlink/last-method, returning data, owner isolation and interrupted native secure-session behavior. Basic phone login is confirmed.                                                                                                                                                                                                                                                                                        |
| Native Download/Import/deletion                       | Anthony and implementation owner with Phase 14 release owner, deferred before release | Files/share cancellation/cleanup, complete native import/export, both confirmation actions, remote deletion while sync off/unavailable and lost acknowledgements. Automated evidence does not replace these checks.                                                                                                                                                                                                                                                            |
| Hosted migration and old-client cutover               | Anthony plus release owner before testers                                             | 0019–0023, protected rehearsal and matching staged API are complete; still verify existing-phone migration, real Auth erasure/revocation, incompatible-client retirement and deletion-aware recovery acceptance.                                                                                                                                                                                                                                                               |
| Public notices/provider/retention                     | Anthony plus privacy/release owner before public distribution                         | Review unpublished candidates, actual private-data processing/retention and App Privacy answers; public URLs/approval remain pending. The external-deletion revision retains the existing optional-iCloud data flow; do not imply that Apple Settings deletion also erases phone data.                                                                                                                                                                                         |
| Mobile/tooling dependency health                      | Implementation/dependency owner and Phase 14 release owner, before public release     | Follow the separate [SDK 58 handoff](phase-14-native-upgrade.md) for compatible patches and remaining upstream advisories. The corrected API production audit does not establish mobile dependency health.                                                                                                                                                                                                                                                                     |
| Publication/release validation                        | Implementation owner and Phase 14/07A owners before publication/release               | The combined Phase 13/SDK candidate passed its hosted checks and merged into `main` through PR #46. Retain mobile dependency health, signed storage/accessibility, privacy, diagnostics activation and release gates for purchases and paid admission for guests.                                                                                                                                                                                                              |

Local implementation closeout and the owner's deferrals do not establish release
acceptance. Preserve the named gates when carrying the candidate into Phase 14.
