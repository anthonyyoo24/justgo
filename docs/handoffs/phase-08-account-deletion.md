# Phase 08 account deletion

**Date:** October 14, 2026\
**Branch/base:** `codex/phase-08-delete-account`, separate managed worktree from
`4679335` (the combined Phase 08 Settings/reflection-keyboard checkpoint).\
**Status:** Local implementation and automated/browser verification pass. Phase acceptance,
native build/device evidence and hosted rollout remain open.

Anthony requested a separate worktree/server, then authorized starting account
deletion. The Phase 08 plan, Settings handoff, identity architecture and local
storage handoff define the existing boundaries. The original checkout's
uncommitted account-screen edits are not included in this worktree.

## Implemented behavior

- Settings → Delete account is available without paid access. The page explains
  permanent deletion, pending phone activity, revoked recovery/transfer access,
  retained security records/backups and separately managed Apple subscriptions.
  Continue reveals a second explicit permanent-delete action; header Back stays
  available before acceptance. Changing accounts invalidates confirmation.
- `DELETE /v1/account` requires a valid device session and the strict
  `{ "confirmation": "delete-account" }` body. It accepts no caller-supplied owner.
  Shared Zod contracts and OpenAPI describe the request and private receipt.
- The existing owner lock serializes deletion with uploads, recovery, renewal and
  other account changes. One transaction deletes attempts/reflections, patch
  receipts, devices, sessions and account-linked transfers; revokes recovery
  credentials; and records the deletion. A failure rolls everything back.
- Approved but unredeemed transfers contribute credential tombstones. An old
  bootstrap, recovery key or transfer cannot recreate the deleted account.
  A receipt is retrievable only with the original deleting session's token,
  including after session rows are removed. Repeated/concurrent requests return
  the original result. Receipt fingerprints identify matching local credentials;
  raw secrets and private activity are never returned.
- The phone saves deletion intent before sending it and disconnects product
  requests/uploads. An uncertain response retains the same proof for retry.
  A confirmed receipt is saved before local cleanup; cleanup failures survive
  relaunch and retry without another destructive request. A definitive rejected
  request preserves local activity and permits explicit recovery.
- Local cleanup stops the account coordinator, drains accepted writes, removes
  only that account's journal/catalog/quarantine keys and clears its in-memory
  records and matching Keychain credentials. Other accounts and installation
  motion/haptics preferences remain separate. A persisted deleted marker prevents
  automatic creation of a replacement account; explicit new-account creation is
  still available.
- The Swift Keychain module now exposes item-scoped, idempotent removal.
  Existing binaries without this capability refuse deletion before the server
  request and explain the updated-build prerequisite. Browser memory-vault
  behavior does not establish native Keychain/iCloud deletion.
- Saved journeys can use distinct `JUSTGO_JOURNEY_API_PORT` and
  `JUSTGO_JOURNEY_APP_PORT` values, retaining loopback binding, disposable database
  safeguards, occupied-port refusal and server-owned fixture cleanup. Defaults
  remain 3000/8081. This worktree uses 3002/8083 for verification alongside the
  existing previews.

Migration `0014_account_deletion` adds the deletion proof fingerprint and its
unique index, restricted receipt lookup and owner-scoped DELETE privileges.
Earlier SQL is unchanged; migration 0013 is added to the immutable hash inventory.
The current declarative snapshot and restoration rehearsal include 0014.

## Verification

These results do not establish phase/native/hosted acceptance. Logs and routine screenshots stay in ignored
`.local/phase-08-delete-account/`.

- Final mobile coverage run: **677 tests / 79 suites passed**. New regressions cover
  confirmation/cancel/account changes, duplicate taps, lost responses/relaunch,
  account-scoped credential cleanup, old-binary refusal, cleanup retry, rejected
  and wrong-owner responses, and storage writes that were already in flight.
- Local database suite: 59 cases passed, plus the migration/restoration rehearsal.
  New cases cover confirmation/ownership, expired/revoked sessions, atomic rollback,
  repeated/concurrent deletion, concurrent recovery, other-account preservation,
  actual record removal and revoked bootstrap/key/transfer proofs.
- Final `npm run typecheck`, `npm run lint`, `npm run format:check` and
  `npm run test:architecture` pass. Architecture/tooling: **182 cases**. API unit
  tests: **54 pass**; shared contracts: **25 pass**. The final copy refinements
  additionally pass **11 focused deletion cases**.
- `npm run test:coverage` and the fresh final mobile coverage/combined gate pass,
  with unchanged global and critical floors. Mobile: **96.85% lines / 91.60%
  branches**; API: **95.35% / 90.88%**; contracts: **100% / 100%**. The API coverage
  run includes all **114 unit/database/rehearsal cases**.
- `JUSTGO_JOURNEY_API_PORT=3002 JUSTGO_JOURNEY_APP_PORT=8083
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run test:journey --
--grep 'Settings permanently deletes|self-device revocation|export shows a retryable'`:
  **3 pass**. The new actual-app/API/database case commits deletion, deliberately
  drops its response, retries through the UI, checks removed browser storage and
  server history, and proves the original session/credential cannot restore access.
  The retained revocation and export-retry journeys also pass. Fixture cleanup
  remains limited to the server's own allocated accounts.
- Side-panel Browser Use: **pass** at **390 × 844** and **320 × 568** for the
  Settings link, retention/subscription copy, independent confirmation, Cancel,
  back navigation, wrapping and scrolling. The narrow document width and scroll
  width both measured 320 px. Screenshots: `delete-account-390.jpg` and
  `confirmation-320.jpg`. Historical Metro-disconnect warnings reflect owned
  server restarts; the existing `props.pointerEvents` deprecation was observed,
  without suppression. No new application exception was observed.
- Swift frontend syntax parsing passes. This is syntax evidence, not a compiled
  native binary or physical Keychain/iCloud acceptance.
- `npm run check` stopped at fresh online Expo Doctor: four existing pinned
  packages trail current SDK patch recommendations (`expo`, `expo-constants`,
  `expo-linking`, `expo-router`). This is the already-recorded dependency
  maintenance task, not a passing root check or a validation bypass.

### Issues found and corrected

The first focused checks caught raw SQL timestamps needing `Date` conversion and
an unbound storage enumeration method. Their regressions now pass. Migration
metadata initially still targeted snapshot 0013; the new 0014 snapshot, prior-SQL
hash protection and full clean/restore rehearsal now agree. A navigation review
also added a pending-deletion redirect from recovery and separated the durable
workflow from the existing identity controller.

The first journey launch found the shared disposable database stopped; restarting
the original loopback cluster preserved its existing environment/data. Subsequent
browser runs exposed Expo SDK 57 selecting `.env.local` through `expo/virtual/env`
despite CLI API overrides and `EXPO_NO_DOTENV`. They failed at connection, before
the deletion flow. The HTTPS API's preflight does not allow this preview origin.
Guarded web journeys now validate the exact loopback API URL and resolve a
test-only public-environment adapter; native and normal/production bundles retain
their usual environment resolution. The browser harness additionally blocks API
requests to another origin. Tooling regressions prove hosted-URL rejection and
that native/normal builds do not get the adapter. All three saved journeys pass
after this fix. No credential bodies or network traces were logged.

### Retained development services

The phone Metro remains on **8082** with the existing HTTPS test API; the original
8081/8084 previews were not replaced. This worktree's separate local fixture API
and browser preview remain on **3002/8083**, with one Metro worker and file
watching enabled. The side panel retains the deletion page using one intentionally
disposable, empty local account for owner review. The signed phone binary and
hosted API still need the separate acceptance/rollout steps below.

## Retention, rollout and open acceptance

- Revoked credential rows and a minimal user deletion receipt are security
  tombstones, not retained reflection content. Do not purge them or restore an
  older live identity over them. Exact retention periods, backup expiry and the
  published privacy wording still require the operator's Phase 08 decision.
- Before restoring a backup, preserve the latest deletion/tombstone ledger in
  restricted operator storage, restore into an isolated environment, replay every
  later deletion (including activity removal and credential blocking), then verify
  deleted proofs fail before reopening writers. An old snapshot alone must never
  become the live account database. A hosted backup/deletion replay drill is an
  open Phase 08/09 gate; the local migration restoration test is separate evidence.
- PostHog, Sentry and RevenueCat forwarding are inactive on this branch, so no
  active vendor deletion job is claimed. Their future activation must include
  durable vendor cleanup/retry and reviewed retention before deleted identities
  or event replay can recreate profiles. Support inbox retention remains an
  operator decision. Previously exported files and offline devices cannot be
  remotely erased by this request.
- **Fresh native reload follow-up:** the retained 8082 log contained `TypeError: right operand of 'in' is not an object` and an animated-value/no-listener warning. The broadcast found no connected app, and no simulator was booted. Anthony then fully closed/reopened the phone client and confirmed on October 14 that **Settings opens normally**. The earlier error's exact cause remains unisolated, but it was not reproduced after his fresh launch. This is owner-reported physical baseline evidence, not a native deletion/Keychain cleanup pass. XcodeBuildMCP simulator discovery could not resolve the default `simctl`; command-scoped Xcode discovery confirmed there was no booted simulator without changing global developer settings.
- **Native gate:** separately authorized updated signed development build,
  item-scoped removal on physical iPhone, locked-Keychain/relaunch/retry,
  iCloud/second-device behavior, accessibility/large text and Apple subscription
  destination opening. No native signing/build or physical deletion pass is
  implied by JavaScript/browser checks.
- **Hosted gate:** reviewed migration/API rollout and staging deletion using an
  explicitly disposable account, after owner authorization. The existing HTTPS
  test API has not acquired this new local endpoint. The phone preview remains
  on 8082 with that existing API; older binaries are guarded before deletion.
- **Project gate:** resolve the known Expo patch recommendations and rerun fresh
  root validation before publication. The wider Phase 08 checkboxes remain open.

## Organization

Deletion UI, cleanup and regressions live together under
`app-support/identity/deletion/`; the route remains a thin navigation export.
API deletion stays beside export under `src/privacy/`, with real database tests
under `tests/privacy/`. Reviewed touched directories retain cohesive owners and
colocated tests/adapters; migration history stays in its tooling-defined layout.
No additional source-directory moves are needed for this slice.

## October 14 subscription cancellation and navigation refinement

Anthony requested **Cancel subscription**, a billing icon in place of the profile
icon, Apple's more direct subscription screen, and removal of the duplicate bottom
Cancel action. The row now uses an outlined payment card with a minus mark. Header
Back remains the exit on both confirmation steps; leaving and reopening requires
confirmation again. Completed deletion retains its Return to Settings action.

`CancelSubscriptionRow` owns presentation progress, duplicate taps and safe retry
feedback. The shared platform adapter opens the new local `JustGoSubscriptions`
Expo module on updated iOS builds. The presenter derives the group from this app's
verified, unrevoked auto-renewable StoreKit entitlements and, on iOS 17+, opens
Apple's group-specific controls when exactly one group exists. No invented product
or group identifier, RevenueCat activation or private app-account data is needed.
The current Apple customer controls cancellation; dismissing the sheet never marks
renewal cancelled or grants JustGO access. iOS 16.4, absent/ambiguous verified groups,
older binaries without the module and web previews retain Apple's general
subscription-management destination. Native presentation errors remain retryable
without silently opening another destination.

Evidence for this follow-up:

- Focused component/platform regressions: **14 pass**, including duplicate taps,
  failure/retry, unmount, native/fallback routing and header-only navigation.
- Saved browser deletion journey: **1 pass**; it now checks the renamed action,
  absence of bottom Cancel, header Back and renewed confirmation after reopening,
  before exercising real deletion and lost-response retry against `justgo_test`.
- The StoreKit presenter passes Swift typechecking against the installed iOS SDK
  with a 16.4 deployment target; both Swift files pass frontend parsing. Expo
  autolinking discovers `JustGoSubscriptionsModule` and its pod. This establishes
  source/API compatibility and registration, not an installed native run.
- Fresh `npm run check` still stops at the existing four Expo patch recommendations
  (20/21 Doctor checks). Versions and validation requirements remain unchanged.
- Explicit remaining checks pass: `npm run typecheck`, `npm run lint`,
  `npm run format:check` and all **182** architecture checks. Full mobile coverage
  passes **685 tests / 81 suites** (96.87% lines, 91.61% branches, 95.43%
  statements, 94.22% functions). `npm run coverage:check` passes the unchanged
  global/critical floors using the fresh mobile report and earlier unchanged
  API/contracts reports. No backend/shared boundary changed in this follow-up.
- In-app browser verification on a disposable local fixture confirms the label,
  card/minus icon, working Continue control, header Back and the card ending after
  Cancel subscription without a duplicate bottom Cancel. The saved screenshot is
  `.local/phase-08-delete-account/cancel-subscription-refinement.jpg`. The browser
  exercises web presentation, not StoreKit or actual Apple cancellation.

The new native module still needs the separately authorized signed build and
physical-iPhone checks: direct JustGO group, iOS/no-record fallback, dismissal,
actual cancellation confirmation and failed presentation/retry. Billing activation
and real provider acceptance remain with 07A before paid launch. No build, purchase,
cancellation, deployment or Git publication was performed.

The changed deletion, shared Settings, platform-subscriptions and native-module
directories were reviewed in full. The new platform adapter/test and native module
have distinct owners; the focused deletion row/test stay beside their screen.
Existing documentation and journey directories retain established layouts. No
additional folder moves are warranted.

### October 14 complete billing-icon outline

Anthony identified that the custom SVG payment-card path looked unfinished at
the bottom right. The previous path intentionally stopped around an external
minus mark, leaving an open silhouette. The icon now uses a closed rounded
rectangle with its stripe and minus inside the border. The cancellation-row
regression requires the closed card shape, catching the previous missing corner.
The label, cancellation behavior and navigation are unchanged. All **18** focused
deletion/row/Settings tests pass, and the corrected outline is visually verified
in the in-app browser. Mobile typechecking, lint, formatting, all **685** mobile
tests and the unchanged coverage floors pass. Fresh root `check` still stops at
the same four Expo patch recommendations. The screenshot is
`.local/phase-08-delete-account/subscription-icon-closed.jpg`. The already reviewed
shared Settings and deletion directories remain cohesive; no moves are needed.

## October 14 owner-requested deletion-screen walkthrough

Anthony requested actual screenshots of confirmation, deletion and the app's state
afterward using a new test account. This is a manual in-app browser walkthrough at
**390 × 844**, against the guarded loopback fixture API on 3002 and browser preview
on 8083, using the dedicated `justgo_test` database. No product code changed for
the walkthrough, and no phone/hosted account was used.

The fixture registry confirmed exactly one new account allocated for this run.
One synthetic completed activity/reflection was added under that account before
using the real Settings → Delete account → Continue to deletion → Delete account
permanently controls. The UI reached **Account deleted**, stayed on the deletion
route and offered **Return to Settings**. That button opened the ordinary Settings
page with the existing Haptics/Reduce Motion choices intact. Account & recovery
then showed **Your account has been deleted**, Create a private account, transfer
and recovery actions. No new account was created automatically. Account deleted
is a heading, not a further action to click; no welcome screen is presented by
successful deletion.

A read-only database check for that allocated ID confirmed `deleted = true` and
zero activity records, sessions, devices and unrevoked credentials. The security
tombstone is retained as designed; other fixture accounts were untouched.
The browser's ephemeral vault does not establish native Keychain cleanup,
installed-app relaunch or physical-device acceptance. Native deletion removes
account data within the installed app; this flow has no app-uninstallation action.

Actual browser screenshots are ignored local evidence under
`.local/phase-08-delete-account/walkthrough/`:

- `01-settings-before.jpg`
- `02-before-delete.jpg`
- `03-confirm-deletion.jpg`
- `04-account-deleted.jpg`
- `05-settings-after.jpg`
- `06-disconnected-account.jpg`

The orange browser-only credential notice on the disconnected screen is specific
to the web preview. This run covers the healthy successful path; the earlier saved
journey separately covers uncertain/lost-response retry. No simulator/native
deletion pass, new automated gate, rollout or wider phase completion is claimed.

### October 14 account-entry wording and post-deletion footer

Anthony requested **Create a new account** in place of Create a private account,
removal of the bottom **Get help** on the post-deletion account screen, and an
updated screenshot. The shared initial-creation label and its progress label now
use the new wording; existing saved-credential/separate-account safeguards remain.
Bottom help is omitted when deletion status is `deleted`; support for ordinary
account connection/recovery failures and Settings Support remains available.
Saved browser selectors across identity/catalog, local flow, Progress, export and
deletion now use the same accessible name. The deletion journey also checks the
post-deletion account screen's new label and absent footer help.

All **13** focused identity component tests pass. In-app browser verification at
**390 × 844** confirms both requested changes; the updated screenshot is
`.local/phase-08-delete-account/walkthrough/07-create-new-account.jpg`. This later
capture shows the existing foreground/retry message **Choose a recovery method to
continue**, while the account remains deleted/disconnected. Earlier immediate
post-deletion screenshots retain their historical wording and help footer.

Fresh root `check` still stops at the same four Expo patch recommendations (20/21
Doctor checks). The first saved-journey attempt stopped safely before migrations
because 8085 was occupied; that service was left alone and the run moved to vacant
isolated loopback ports 3007/8093. The identity, journey and handoff directories
retain their existing responsibilities; no reorganization is needed.

The rerun saved deletion journey passes (**1 test**), including the post-deletion
label/footer assertions. Mobile and journey typechecking, lint and formatting pass.
Full mobile coverage passes **686 tests / 81 suites** (96.87% lines, 91.62% branches,
95.43% statements, 94.22% functions). The unchanged combined coverage gate passes
with this fresh mobile report and the earlier unchanged API/contracts reports.

### October 14 Settings Back navigation finding

Anthony asked what one tap on Settings Back does after deletion. Reused the
retained deleted/disconnected browser account without a new deletion or product
edit: Settings → completed Delete account screen → Return to Settings → one
header Back tap. The browser remained on **Settings**. `Return to Settings` uses
`router.replace('/settings')` while a previous Settings entry can remain beneath
it, so Back can land on Settings again. This reproduces the same observation from
the initial walkthrough; it is not a phone/simulator navigation pass. The deleted
account remains disconnected and is not restored by navigation.

- [ ] **Open — implementation owner / Phase 08:** agree and implement the
      post-deletion Back destination, remove duplicate Settings history and add a saved
      regression starting from the ordinary app → Settings entry. Verify browser and
      updated native behavior. The current question did not request a navigation fix.

## October 14 local commit checkpoint

Anthony authorized local commits of this worktree's existing implementation.
Changes are grouped into isolated journey tooling, server/contracts/migration,
durable mobile cleanup, deletion/subscription UI with saved journey coverage,
and documentation. The changed directories were reviewed again; existing
responsibility groups remain appropriate and no file moves were needed.

Fresh verification before committing:

- `npm run check` stops at the existing four Expo patch recommendations
  (20/21 Doctor checks). Dependency pins and validation remain unchanged; this
  checkpoint does not establish a passing root gate.
- `npm run build:contracts`, `npm run typecheck`, `npm run lint`,
  `npm run format:check` and `npm test` pass: 182 architecture/tooling cases,
  54 API unit cases, 686 mobile cases across 81 suites, and 25 contract cases.
- `npm run test:db` passes against loopback `justgo_test`: 59 database cases
  plus the migration/restoration rehearsal.
- `npm run test:coverage` passes every unchanged global/critical floor using
  fresh reports from all workspaces. Mobile: 96.87% lines / 91.62% branches;
  API: 95.35% / 90.88%; contracts: 100% / 100%. The API coverage run includes
  all 114 unit/database/rehearsal cases.
- `JUSTGO_JOURNEY_API_PORT=3007 JUSTGO_JOURNEY_APP_PORT=8093
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run test:journey --
--grep 'Settings permanently deletes'` passes: one actual-app/API/database
  journey, including the lost-response retry and post-deletion entry assertions.
  The harness migrates only the guarded loopback test database and shuts down
  its owned services after the run.

Logs remain in ignored `.local/phase-08-delete-account/commit-*.log` storage.
Commit packaging does not change UI behavior; the earlier interactive browser
evidence remains distinct from automated and native evidence. Native build/device,
hosted rollout, retention/backup and dependency gates remain open.

The subsequent OAuth/guest-account recovery and centered confirmation-alert
discussions are design proposals, not implemented changes in this checkpoint.
The post-deletion Back navigation finding above remains open.

## October 14 centered deletion confirmation

After the local commit checkpoint, Anthony authorized implementing the centered
confirmation discussed from the Commons reference. Continue to deletion now opens
an overlay titled **Delete your account?** with the approved account/progress/
feelings/reflections warning, **Cancel**, and a red **Delete account** action.
Subscription cancellation, retention and export information stay on the preceding
page. The old inline second-stage button is removed.

`DeleteAccountConfirmation` owns presentation, measured root-window safe-area
padding, scrollable copy and larger-text action stacking. The existing web modal
isolation helper excludes the covered page; React Native Web's modal owns keyboard
focus trapping and restoration. Cancel is the first focusable action. The screen closes confirmation
on navigation blur, account changes or a non-active app state. Accepting consumes
the confirmation before starting deletion and rechecks the controller's current
account, busy state and deletion status. Queued duplicate or stale callbacks cannot
delete a replacement account. Each opening has its own in-memory confirmation
identity, so callbacks from a canceled opening also cannot confirm or cancel a
newer opening for the same account. The durable deletion workflow is unchanged.

Verification:

- All **14** focused screen/modal regressions pass, covering cancellation,
  request-close, duplicate acceptance, account changes and late callbacks,
  canceled/reopened confirmation callbacks, retained failure feedback with
  account isolation, busy/pending guards, navigation blur, backgrounding and
  listener cleanup. The canceled/reopened regression first failed with an
  unexpected deletion call; it passes with the per-opening guard.
- Fresh contract build, full workspace/journey typechecking, lint, formatting
  and all **182** architecture/tooling cases pass.
- Full mobile coverage passes **694 tests / 81 suites**: **96.90% lines /
  91.76% branches**, with unchanged global/critical floors. The combined coverage
  gate passes with the fresh mobile report and unchanged API/contracts reports
  from the local commit checkpoint. No backend/shared contract changed in this slice.
- The saved actual-app/API/database deletion journey passes on loopback
  **3007/8093**, including Cancel, focus restoration, keyboard Escape, a fresh
  confirmation after returning, actual deletion and lost-response retry. The
  first attempt sent Escape before the modal had acquired focus; the test now
  awaits the observable Cancel focus before keyboard input, without arbitrary waits.
- In-app Browser Use passes at **390 × 844** and **320 × 568** for first/repeated
  opening, copy, Cancel, Tab wrapping, Escape and background-page isolation.
  At 320 px, the dialog measures **272 × 255** at **(24, 156.5)**, both actions
  are 70 px high, and document/scroll widths remain 320 px. Only the existing
  `props.pointerEvents` deprecation was observed; no application exception occurred.
- Fresh `npm run check` still stops at the same four Expo patch recommendations
  (20/21 Doctor checks). No dependency versions or validation gates were changed.

Ignored logs: `.local/phase-08-delete-account/modal-{check,journey,final-checks}.log`;
`modal-final-coverage.log` captures the final 694-case run and combined gate.
Screenshots: `delete-confirmation-modal-390.jpg` and
`delete-confirmation-modal-320.jpg` in the same ignored directory.

The guarded fixture API/browser preview remain on **3002/8083** with a fresh,
empty disposable account and the modal retained in the side panel. Manual Metro
uses development mode; setting its `NODE_ENV=test` tripped the development-tools
test assertion before serving and was corrected before verification. The browser
preview currently disables watching, so restart it before treating later edits
as served evidence. Phone Metro is restarted on **8082** with a clear cache and
one worker; it retains the existing HTTPS API configuration and native deletion
capability guard.

Physical-iPhone modal layout, larger text and VoiceOver are not established by
browser/component evidence. Existing native cleanup, hosted rollout, retention,
dependency and post-deletion Back/navigation gates remain open. OAuth/guest-login
changes remain proposals. The deletion, journey and documentation directories
were reviewed again; their existing responsibility groups need no reorganization.

## October 14 phone storage compatibility

After reconnecting to 8082, Anthony reported that Settings Back returned to
Account & recovery, with Create a new account and “Secure storage is unavailable.
Unlock your iPhone and retry.” The newer Settings/receiving-transfer worktree
writes optional `cancelledTransfers` and `ignoredCredentialIds` fields. This
branch's strict persisted-state schema did not recognize them, so reading a
valid newer state failed before account verification. The disconnected root
gate then routed back to recovery. No phone credential payload was inspected
or logged; a synthetic native-adapter fixture reproduces the schema rejection.

The schema now validates and retains both known fields, while continuing to
reject malformed values and unknown fields. Credential selection excludes
ignored IDs. Retained cancellation metadata cannot silently bootstrap a new
account when no usable credential remains. Normal renewal and deletion cleanup
preserve this metadata instead of discarding it. This is a compatibility bridge;
the newer receiving-transfer cancellation UI/server reconciliation is not copied
into the deletion branch or represented as implemented here. No saved account,
progress or credential is reset, and no access guard is bypassed.

The 8082 phone Metro was restarted with `--clear`, one worker, normal native
environment resolution and the existing HTTPS test API. Anthony was asked to
fully close/reopen the installed app using the same QR and check Settings Back.
Physical-phone restoration confirmation is pending; browser/component results
cannot establish access to the actual phone Keychain.

Verification is recorded in ignored
`.local/phase-08-delete-account/storage-compat-*` logs:

- The initial regression failed with unrecognized persisted keys. All **38
  focused vault/controller/deletion cases** now pass, including restoration of
  the same account, renewal, ignored-credential exclusion, malformed metadata
  and no automatic replacement.
- Contracts build, workspace/journey typechecks, lint, formatting, **182
  architecture/tooling cases**, **700 mobile cases**, **54 API unit cases** and
  **25 contracts cases** pass.
- Fresh mobile coverage passes at **96.88% lines / 91.80% branches**. Combined
  all-source/critical floors pass using that report and the retained unchanged
  API/contracts reports. This slice changes no backend/shared contract.
- Fresh `npm run check` still stops at the same four Expo patch recommendations
  recorded above; validation remains enabled. No dependency upgrade is included.
- `JUSTGO_JOURNEY_API_PORT=3007 JUSTGO_JOURNEY_APP_PORT=8093
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run test:journey --
--grep 'a real account renews|Settings permanently deletes'`: **2 pass**.
  The actual-app/API/database cases cover renewal and entry to the catalog plus
  permanent deletion/lost-response retry. Their owned fixture servers stopped.
- Restarted the non-watching 8083 preview before side-panel verification. A
  disposable local account connects, Account & recovery Back opens Settings,
  and Settings Back reaches the real challenge catalog. Repeating Home →
  Settings → Account & recovery → Back → Back also returns Home. Screenshot:
  `storage-compat-home.jpg` in the same ignored evidence directory. This is
  browser navigation evidence, separate from the native Keychain regression
  fixture and pending physical-phone confirmation.

Reviewed the full touched root, identity/deletion and documentation directories.
Their existing responsibility groups remain navigable; no folder move is needed.
Root `AGENTS.md` records the shared-Keychain/schema-compatibility lesson.

## October 15 loading, error and retry screenshots

The owner-requested modal feedback refinement below supersedes this earlier UI;
these screenshots remain historical evidence of the layout Anthony reviewed.

Anthony asked to run the implemented flow and screenshot each visible state.
This is a side-panel browser walkthrough at **390 × 844**, not a new product-code
change, saved regression test or physical-iPhone acceptance result. The phone
Metro remains on **8082**. A temporary browser Metro on **8083** used the guarded
journey environment and a loopback-only fault proxy on **3003**, forwarding only
to the disposable **3002** fixture API and dedicated `justgo_test` database.
Two fresh, empty accounts were allocated by that fixture server; a scoped query
of its own registry confirmed both have deletion timestamps. No existing account
or phone credential was used.

The first dropped response was automatically replayed by the browser and safely
completed. For the visible failure capture, the proxy then withheld deletion
replies until the app showed its retryable service-unavailable message. Retrying
Finish deletion recovered the existing server receipt and completed local cleanup.
The proxy briefly held that retry response to capture its spinner, then released
the real response. The account was not recreated.

Actual screenshots are ignored under `.local/phase-08-delete-account/`:

| File                          | Observed state                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `states-00-before.jpg`        | Delete page with Continue to deletion and Cancel subscription                   |
| `states-01-confirmation.jpg`  | Centered confirmation with Cancel and Delete account                            |
| `states-02-loading.jpg`       | Modal closed; Finish account deletion, disabled button and spinner              |
| `states-03-network-error.jpg` | Service-unavailable error in red, Finish deletion available                     |
| `states-04-retrying.jpg`      | Error cleared; Finish deletion disabled with spinner during retry               |
| `states-05-deleted.jpg`       | Account deleted and Return to Settings                                          |
| `states-06-settings.jpg`      | Settings reached by Return to Settings                                          |
| `states-07-account-entry.jpg` | Account & recovery opened from Settings, deleted message and new-account action |

The initial in-progress copy currently already says “Finish account deletion”
and describes retrying; the screenshots preserve that wording. The modal itself
has no loading spinner or error message. After success, the implemented flow
still opens Settings before account entry; a welcome-only replacement has not
been implemented by this walkthrough. Native cleanup, hosted rollout, physical
restoration confirmation and the existing Expo dependency gate remain open.

The temporary browser tab and fault-injection services are closed after capture;
the phone server remains running. Documentation and evidence directories retain
their existing organization. No dependency, native binary or product UI is changed.

## October 15 loading and errors inside the modal

Anthony requested keeping all deletion loading/error feedback in the confirmation
modal, replacing the Delete account text with a loading circle and displaying
errors in red below its main explanation. The modal now remains mounted through
request, failure and retry, then closes when durable cleanup reaches deleted.
The underlying deletion page renders neither a spinner nor an inline error.

`useAccountDeletionDialog` owns presentation, focus/foreground handling and retry
selection; the existing identity controller still owns persisted deletion intent,
proofs, request idempotency and account cleanup. It subscribes to identity changes
and reconciles immediately after connecting, including slow hydration and the
construction/subscription gap. A restored unfinished deletion opens in the modal
without submitting another destructive request. Cancel/escape are disabled while
working. Dismissing an idle failed attempt preserves the pending proof; Finish
deletion reopens its error in the modal. A request retry clears the displayed
error and shows only the spinner in the destructive button. Cleanup failures use
copy that accurately says the server account is already deleted.

Separate visit and attempt revisions fence duplicate/queued actions, old
completions, navigation blur and account changes. Before submission, backgrounding
still cancels consent; a submitted operation keeps its dialog state when the app
backgrounds. No ownership/access/native-capability guard is bypassed. The guarded
old-native-build message is now shown in the modal too.

Verification:

- **24 screen/presentation cases** and **5 durable deletion cases** pass. They
  cover spinner-only loading, modal-only feedback, retry, preflight failures,
  restoration, stale callbacks/completions, hydration gaps and disposal.
- Contracts build, workspace/journey typechecks, lint, formatting, **182
  architecture/tooling cases**, **54 API unit cases** and **25 contracts cases**
  pass. Full mobile coverage runs **710 cases in 81 suites**, all passing, at
  **96.83% lines / 91.82% branches**. All-source and critical floors pass, with
  retained unchanged API/contracts reports. The new hook is **96.25% lines /
  94.18% branches**; remaining branches are defensive admission/late-result
  guards, reviewed without weakening thresholds.
- `npm run check` still stops at fresh Expo Doctor **20/21**, with the same four
  SDK patch recommendations recorded above. The remaining check commands were
  run explicitly and pass; dependency validation remains enabled.
- `JUSTGO_JOURNEY_API_PORT=3007 JUSTGO_JOURNEY_APP_PORT=8093
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run test:journey --
--grep 'Settings permanently deletes'`: **1 pass**. The saved actual-app/API/
  database case holds request responses and verifies a spinner with no button
  text, disabled dismissal, modal-only red feedback below the main copy,
  cancel/reopen, retry and successful cleanup. Its fixture services stopped.
- Side-panel browser verification passes at **390 × 844** and **320 × 568**.
  The error is below the main copy, colored `rgb(179, 38, 30)`, and occurs only
  once in the document. The dialog and both buttons fit the small viewport.
  Canceling an idle error leaves zero page alerts/spinners; reopening restores
  its modal feedback. Retry clears the error and shows the spinner; success
  closes the modal. A scoped query of the live fixture server's allocated IDs
  confirms one test account, deleted once; no account was recreated.
- Phone Metro **8082** was restarted with `--clear`, one worker and the normal
  existing HTTPS API configuration. Its fresh iOS bundle returns **HTTP 200**.
  This is bundling evidence, not physical-device modal/Keychain acceptance.

Screenshots are ignored under `.local/phase-08-delete-account/`:
`modal-feedback-01-confirmation.jpg`, `modal-feedback-02-loading.jpg`,
`modal-feedback-03-error.jpg`, `modal-feedback-04-retrying.jpg`,
`modal-feedback-05-deleted.jpg` and `modal-feedback-error-320.jpg`.
The live walkthrough used the isolated 3002 fixture API and a loopback 3003
response-control proxy, behind a fresh 8083 web bundle. The first deletion reply
was held then failed as 503; retry recovered the real server receipt. These
temporary services/tab are closed after capture, leaving the phone server running.
Logs use the same `modal-feedback-*` prefix. No fixture proofs or private account
data are included in screenshots or handoff output.

Reviewed the touched deletion, journey and documentation directories: modal UI,
its controller hook, subscription row, durable workflow and colocated tests
remain one cohesive capability. No folder move is needed. Existing
native-build/device, hosted rollout, retention,
physical-phone restoration and Expo dependency gates remain open.
