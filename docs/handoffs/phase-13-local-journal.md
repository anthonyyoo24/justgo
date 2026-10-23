# Phase 13 — Optional accounts and complete data controls

## Status

The October 21 continuity and Account/Data revision is implemented locally.
Local automated checks and the grouped in-app walkthrough pass. Real Apple/Google
configuration, hosted cutover, a compatible signed build and physical iCloud/device acceptance remain
open. Existing installed builds and hosted services retain earlier behavior.
The [plan](../implementation-plan/phase-13-local-journal.md) owns remaining scope;
[DECISIONS.md](../DECISIONS.md#october-21-journal-continuity-and-accountdata-settings)
records the approved behavior. No Git publication or hosted/provider change ran.

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
The read-only October 21 audit found Apple/Google disabled, hosted migrations
0019–0023 unapplied, narrow Auth-session grants missing, and mobile/API/EAS managed
Auth/Google/iCloud configuration incomplete. Existing project, bundle and team
identity must be retained. Native-only Apple uses the bundle audience; browser
Apple setup is separate. No hosted grant, provider, container or deployment changed.

The approved [967b34cf development build](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/967b34cf-7a97-4268-88b7-5a2c77dc2feb)
contains the native modules and Apple sign-in entitlement but has no configured
CloudKit container or Google native URL scheme. It predates the new conditional
CloudKit reset bridge and is not acceptance of this revision. A further configured
signed build is required. Fresh Expo validation also required local SDK 57 patch
updates to Expo 57.0.31 and Router 57.0.29; device acceptance remains open.

The shared modal lives in `components/modals`, shared provider artwork in
`components/auth`, portable archives in `data/backup`, and cloud handover beside
its coordinator in `data/cloud`. Adapter pairs and tests remain beside their
owners. Complete changed-directory file lists were reviewed; no further moves
were needed. Registered migrations remain immutable; the server-only legacy
reflection reset preserves accounts, completed history and all phone writing.

## Verification

Verified October 21 with pinned Node 24/npm 11 and heavy checks sequentially:

- Full `npm run check` passed: online Expo Doctor 21/21, root/workspace/journey
  typechecks, lint (zero errors; 176 existing warnings), formatting, 259 tooling
  tests, 136 API unit tests, 1,450 mobile tests and 35 contract tests.
- Full coverage passed every all-source and critical floor. Mobile: 88.14% branches /
  94.68% lines; API: 88.07% / 96.06%; contracts: 100% / 100%. API coverage included
  223 unit/database cases. Dedicated `test:db` also passed 86 integration tests
  plus the migration/restoration rehearsal against loopback `justgo_test`.
- All 35 saved app/API/database journeys passed after the SDK patches. Cold web
  and iOS JavaScript/assets exports passed with `--clear --max-workers 1`;
  production-web smoke passed with no API traffic. These are bundles, not a signed
  native build.
- The final visual review corrected two remaining old explanatory sentences in
  entry/account-deletion UI. Their 33 focused component tests, five saved entry /
  deletion journeys and scoped lint/formatting passed afterward. The final text was
  also checked in the restarted browser app; these wording-only changes do not
  establish new native or hosted evidence.
- Swift CloudKit core typechecking and Expo-wrapper syntax parsing passed against
  the installed iPhoneOS SDK. They do not establish linkage, entitlements, schema
  or real two-device synchronization.

The grouped 1280×720 in-app walkthrough used a fresh guarded fixture build and
run-owned synthetic Google account on loopback `justgo_test`. It verified the
same written entry after first sign-in/logout, returning login, connected switches
and last-method protection, Account/Data layout and icons, both cancellation/focus
paths, unavailable iCloud feedback, and authentication before signed-out import.
The resolved legal/API origin was the separate loopback fixture server. No browser
console errors appeared; the run-owned account/data and servers were removed.
This walkthrough is separate from saved regression journeys and device evidence.

Changed-document formatting, local links, whitespace and complete changed-directory
file lists were reviewed. Public legal text remains an unpublished candidate.

## Open acceptance gates

| Gate                                          | Owner and completion point                                                           | Required evidence                                                                                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Apple/Google and managed Auth setup           | Anthony authorizes external setup; implementation owner verifies before distribution | Real clients/audiences, manual linking, narrow live-session grants, hidden email, cancellation/refresh/revocation, unlink and returning data.                                        |
| Compatible signed build and device storage/UI | Anthony authorizes build; implementation owner verifies before beta                  | New CloudKit bridge, native modules/entitlements, secure session storage, SQLite interruption/full storage/protection, Files/share cleanup, accessible phone layout and both modals. |
| Real iCloud synchronization                   | Implementation owner with required devices, before enabled beta claims               | Private schema/container/profile, two-device offline/conflict/reset/deletion, full storage and Apple-account changes, including sync off → delete → on.                              |
| Hosted migration and old-client cutover       | Anthony plus release owner before testers                                            | Authorized 0019–0023 and matching API/client, narrow old-private reset, existing-owner migration, Auth cleanup operations, revocation and deletion-aware restore.                    |
| Public notices/provider/retention             | Anthony plus privacy/release owner before public distribution                        | Review updated unpublished candidates, actual private-data processing/retention and App Privacy answers; public URLs/approval remain pending.                                        |
| Inherited Phases 02–12 and billing/release    | Respective Phase 14/07A owners                                                       | Remaining accessibility, diagnostics activation, purchases/guest paid admission, hosted CI and release evidence.                                                                     |

Local migration, mocks and browser tests do not establish hosted deletion, native
storage protection, real OAuth or CloudKit. Phase 13 remains open at these gates.
