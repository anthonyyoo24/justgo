# Phase 13 — Optional accounts and complete data controls

## Status

The local continuity/Settings, working-login, private iCloud and guarded
missing-collection recovery implementation is locally ready for owner review.
Phone login and single-phone CloudKit upload/off/re-enable behavior are verified.
Anthony explicitly deferred the remaining manual acceptance checks and requested
focused checks for this closeout. The compatible recovery build is available and
inspected; installation and physical recovery acceptance remain open. This is not production release acceptance.
The [plan](../implementation-plan/phase-13-local-journal.md) owns remaining scope;
the [October 22 decision](../DECISIONS.md#october-22-icloud-recovery-and-scoped-phase-13-closeout)
records the scope and deferrals. No Git push, PR or merge ran.

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
- Known missing CloudKit collections fail closed during ordinary reads. Explicit
  recovery first establishes a durable reset fence without replacing a live
  collection; the confirmed flow may clear the older phone copy only after
  durable local clearing intent. Closing, deletion, handover and server-epoch
  safeguards still apply. Native/device acceptance remains separate.

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

Installed iCloud development build
[1a1174d6](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/1a1174d6-160a-48ef-8a0e-4ffccfbc1590)
finished successfully. Signed IPA inspection verifies the exact container,
CloudKit/Production entitlements, matching provisioning permissions, existing
bundle/team/registered phone, native writer/conditional reset and per-record
quota-error collection. Apple/Google/secure storage/SQLite/Files/Keychain modules
and the Google URL scheme remain present; signature verification passes.
Single-phone behavior on this build is recorded below. It predates the new
missing-collection recovery bridge.

Recovery development build [3cbc873a](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/3cbc873a-ea18-4cf7-b309-c62ed87ace05), from source `b6c75d5`, finished successfully
on October 22 and is available through Expo's Install page. Fresh online Expo
Doctor passes 21/21. Downloaded IPA signature verification and inspection confirm
`com.anthonyyoo.justgo`, team `NPDYTJS425`, `iCloud.com.anthonyyoo.justgo`,
CloudKit/Production, registered-phone provisioning, Keychain access, Apple sign-in
and Google's URL scheme; the full provisioning profile is unchanged from the
installed `1a1174d6` binary. The actual Mach-O contains `readGuarded` and
`ZONE_RECOVERY_REQUIRED`, establishing that the new native recovery bridge is in
this binary. The install QR was decoded and matched to its exact installation URL.
Installation and real recovery/reset acceptance remain unverified;
a JavaScript update of the older binary cannot add the bridge.

Native and JS uploads now have byte/count budgets. Native size retries preserve
fresh atomic generation fencing; durable cleanup can recover an expired cursor
without repeating deletion reset/closure or accepted guest adoption. Settings
retry preserves the intended enable/disable operation and opt-in. The dependency-free
Swift test target is separate from pod sources/uploads and has a required macOS
CI producer. Missing-zone recovery now retains the native durable reset marker
and reports its recovered state to the guarded TypeScript flow; it cannot silently
replace an existing live collection. Phone writing remains untouched until the
explicit recovery confirmation and durable clearing intent. The new bridge's
signed-build inspection is complete; installation and physical recovery checks
remain implementation-owner release tasks.

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

The later toggle-initial-state fix passed focused row/toggle/Data/preview
regressions, mobile typechecks, lint and an isolated side-panel walkthrough. The
walkthrough established initial checked geometry and browser-unavailable
feedback; it did not establish native recovery behavior.

Scoped recovery closeout verification passed:

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
  explicit, and closing returned to the off state. This verifies presentation
  only; it did not execute native recovery or modify real phone/cloud data.

An independent audit's recovery-ordering and durable-marker findings were fixed
and regression-tested; no required review finding remains. Anthony requested no
unrelated/full-phase suites for this scoped closeout. Earlier broad checks below
remain historical evidence and aggregate coverage/publication gates were not
refreshed. The compatible signed recovery build subsequently passed fresh online
Doctor and the binary inspection above; its installation/native-device acceptance
remains open.

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
checks do not refresh the earlier full phase/coverage evidence. The new macOS CI
job remains unverified on GitHub until an authorized push runs it.

## Open acceptance gates

Anthony explicitly skipped the remaining manual steps 1–4 on October 22:
offline/reconnect; second-device/Apple-account-change cases; extended provider
continuity/account-isolation; and native Download/Import/deletion cases. These
are owner-approved deferrals from this implementation closeout, remain unverified
and must be resolved by the named owners before release. Existing single-phone
passes above are preserved. No skipped check is treated as passed.

| Gate                                      | Owner and completion point                                                            | Required evidence                                                                                                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recovery installation/device acceptance   | Implementation owner with Anthony, before release                                     | Signed recovery build `3cbc873a` is available and inspected. Install it and verify real encrypted-data-reset/missing-zone recovery; preserve live roots, deletion fences and newer writing during retries. Earlier installed-phone evidence is from `1a1174d6`. |
| Offline/reconnect and multi-device iCloud | Anthony and implementation owner with Phase 14 release owner, deferred before release | Offline local save/reconnect; second-device guest/account restore, bidirectional changes/conflicts, Apple-account changes and deletion propagation, including sync off → delete → on.                                                                           |
| Extended Apple/Google continuity          | Anthony and implementation owner with Phase 14 release owner, deferred before release | Hidden email, cancellation/refresh/revocation, link/unlink/last-method, returning data, owner isolation and interrupted native secure-session behavior. Basic phone login is confirmed.                                                                         |
| Native Download/Import/deletion           | Anthony and implementation owner with Phase 14 release owner, deferred before release | Files/share cancellation/cleanup, complete native import/export, both confirmation actions, remote deletion while sync off/unavailable and lost acknowledgements. Automated evidence does not replace these checks.                                             |
| Hosted migration and old-client cutover   | Anthony plus release owner before testers                                             | 0019–0023, protected rehearsal and matching staged API are complete; still verify existing-phone migration, real Auth erasure/revocation, incompatible-client retirement and deletion-aware recovery acceptance.                                                |
| Public notices/provider/retention         | Anthony plus privacy/release owner before public distribution                         | Review unpublished candidates, actual private-data processing/retention and App Privacy answers; public URLs/approval remain pending. Recovery retains the existing storage/deletion model and requires no new public data-flow claim.                          |
| Publication/release validation            | Implementation owner and Phase 14/07A owners before publication/release               | Applicable broad checks, current coverage/online Doctor, hosted CI, signed storage/accessibility, diagnostics activation and purchases/guest paid admission. Focused closeout does not refresh these gates.                                                     |

Local implementation closeout and the owner's deferrals do not establish release
acceptance. Preserve the named gates when carrying the candidate into Phase 14.
