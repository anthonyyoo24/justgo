# Phase 10 — Terms & Privacy acceptance

## Summary and status

**Status:** Implemented and verified; existing hosted test API updated October 18.
Anthony confirmed the app fixes and authorized local commits on October 18.
Analytics and crash exporters remain disabled. The October 18 reorder defers analytics to Phase 14 after paid launch; Phase 12 owns the launch copy/version update because the current acceptance wording still describes PostHog collection. The implemented receipt boundary and recorded evidence below are unchanged. The [phase plan](../implementation-plan/phase-10-acceptance.md)
owns scope; [Phase 09](phase-09-app-continuity.md) retains its native gate and
[Phase 08](phase-08-settings-privacy.md) retains deletion/release safeguards.

## Decisions and why

The [October 17 entry decision](../DECISIONS.md#october-17-phase-10-entry-and-acceptance)
uses the existing Welcome → Continue → Terms & Privacy → I Accept flow. Continue
only navigates; account creation starts after acceptance. The refined navy
[Paper screen](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/PEZ-0)
is the visual authority. Questionnaires and extra onboarding remain deferred.
Phase 12 reviews final legal wording, regional sufficiency and public publication.
The [October 18 refinement](../DECISIONS.md#october-18-acceptance-layout-and-hosted-endpoint)
removes account shortcuts, keeps the legal agreement directly above the bottom
button and uses the red save error “Couldn’t save your acceptance. Please try
again.” Established Settings/recovery/data routes remain available.

## Behavior that changed

- Fresh native/browser initialization discovers credentials without creating an
  account. I Accept durably saves the accepted bootstrap proof before sending;
  bootstrap commits a newly created account and receipt atomically. Existing
  accounts without current acceptance use the same page, with their own identity.
- `GET/PUT /v1/account/acceptance` persists Terms, Privacy Policy and analytics-scope
  versions plus server time. Identical-version retries retain that time. Migration
  `0017_account_acceptance` adds the owner-only forced-RLS receipt and permanent
  account analytics-restriction marker; export includes the receipt and restriction status; deletion removes
  the receipt and clears the marker. The restriction cannot be lifted by reacceptance.
- Both unavailable analytics Settings rows and their empty group are removed.
  Legal URL resolution is shared by acceptance and Settings; it never substitutes
  Apple's EULA for JustGO service terms. Loopback development APIs provide visibly
  labeled draft documents without authentication. Public release URLs stay a
  Phase 12 gate.
- The client receipt controller fences hydration, account changes, recovery,
  backgrounding, stale callbacks and privacy invalidation. Phase 14 consumes its
  generation-bound eligibility tickets and the shared eligibility rule; the server
  rereads live ownership/receipt/restriction immediately before a delivery decision.

## Invariants to preserve

- Saving, synchronization and paid-access verification remain independent of
  acceptance/provider failures. Recovery, export and deletion remain reachable;
  saved/pending activity is neither erased nor moved to another account.
- Missing/unconfirmed/current-version-mismatched acceptance and restrictions fail
  closed for analytics. No preacceptance activity is replayed. A same-account
  previously confirmed receipt may keep the app open during a failed refresh,
  while analytics stays closed until new confirmation.
- Bootstrap acceptance applies only to a newly created account, never implicitly
  to one recovered from an existing credential. Persisted pending versions are
  nonsecret and retain the same credential/device/session proof on uncertain retry.
- Do not cache server eligibility decisions or hold database owner locks while
  awaiting a provider. Phase 14 must enforce the rule at actual forwarding.
- Current versions are `2026-10-17-draft` for Terms/Privacy and
  `2026-10-17-v1` for analytics scope. Reviewed material changes require deliberate
  version updates and matching notices, rather than silently reusing this receipt.

## Problems that could recur

Expo Router cannot reliably replace a route with protected Home while acceptance
or access is still pending. Continue accepted entry and no-history Settings Back
through `/access`. Creating/recovering an account can remount route components:
creation routes retain their source owner, and recovery actions retain the initiating
route/session boundary through completion. A remount must not create another
account or strand successful recovery. Only Welcome Continue opts into deck
preparation; choosing recovery cancels that handoff.

The post-deletion handoff must retain Terms & Privacy until the native modal's
`onShow`, then prepare the deck underneath the matching acceptance cover. Do not
render Welcome or redirect preparation through `/welcome`; that caused a visible
return to the old page after I Accept. Welcome's Continue now only navigates and
has no loading presentation. The preparation view/tests live with acceptance,
and both presentations share document opening/failure handling. Keep the existing
owner/attempt fencing, image/layout readiness and two-frame reveal; deck retries
must not repeat account creation or acceptance.

## Setup or environment changes

The owner-authorized hosted update applied registered migrations 0015–0017 to
the existing Supabase application-staging project `kmcpcauaxlgpevkkenwd`, then
switched the existing phone alias <https://justgo-two.vercel.app> to Ready Vercel
deployment `dpl_3cqvvSe1xWcM9v7SBJsUYtbf972b` (`yul1`, Node 24). The upload
contained 54 allowlisted API/contracts/workspace files; no mobile source, SQL,
operator credentials or backup files were uploaded. Project environment metadata,
staging grants/window and deployment protection were unchanged. No Git publication
or native build occurred.

A verified-TLS, RLS-enabled dump of the existing database restored successfully
into a fresh loopback database. The same registered runner was rehearsed there
before the live migration. On the live connection, all 12 existing app tables were
locked and compared inside the migration transaction before COMMIT; original
contents and the first 15 migration hashes were preserved. The journal now has
18 entries. The new receipt table has forced owner RLS and no PUBLIC, anon or
authenticated grants. The restriction column is nullable and initially null.
Migration 0015 only installed the retention function; no purge or schedule ran.
Protected backup, source hashes and proofs remain ignored under
`.local/phase-10-rollout/`; keep the backup for recovery.

The protected candidate initially failed because Vercel's inferred TypeScript
library rejected Progress's `Array.at`. Equivalent indexed access preserves
pagination and passes its database regression. The subsequent candidate passed;
the phone alias stayed on the previous deployment until after schema verification.
Use the existing guarded loopback `justgo_test` commands in
[TESTING.md](../operations/TESTING.md) for future fixtures.
`EXPO_PUBLIC_TERMS_URL` and `EXPO_PUBLIC_PRIVACY_POLICY_URL` supply reviewed public
HTTPS pages. Only development with a loopback API may fall back to `/legal/terms`
and `/legal/privacy`; both pages identify themselves as development drafts.
The deployable server leaves draft routes disabled by default and in production.

## Open gates

| Gate                                                    | Owner                         | Required phase | Done when                                                                                                                                                   |
| ------------------------------------------------------- | ----------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actual analytics delivery and provider cleanup          | Phase 14 implementation owner | 14             | Client/server adapters use this receipt boundary at forwarding and deletion/privacy cleanup, without replay or product-save dependency                      |
| Final wording, privacy-request handling and public URLs | Anthony and legal reviewer    | 12             | Reviewed documents, versions and authenticated-free HTTPS destinations match enabled collection; owner separately approves publication                      |
| Signed native acceptance                                | Anthony and release owner     | 13             | Signed iPhone verifies creation/relaunch/recovery, links, large text and VoiceOver, preserving earlier device gates; hosted prerequisite is evidenced above |

## Final verification

October 18, 2026, on the final source:

- `npm run check`: pass, including fresh online Expo Doctor (21/21), all
  typechecks, lint/format, 250 architecture checks, 110 API unit tests, 1001 mobile
  tests across 107 suites and 34 contracts tests.
- `npm run test:db`: pass, 80 database tests plus the migration
  preservation/restoration rehearsal. The final Progress pagination change also
  passes its three focused database regressions.
- Full root `npm run test:coverage`: all-source/critical floors pass unchanged;
  191 API, 1001 mobile and 34 contracts tests. API lines/branches 96.15%/90.93%;
  mobile 97.12%/92.44%; contracts 100%/100%.
- All 37 saved app/API/database journeys pass, including new/existing accounts,
  lost acceptance acknowledgement, the exact short red error, receipt reuse and
  account/data-control navigation. Cold web/iOS exports and the separate
  exported-web smoke pass. The final pagination compatibility change is covered
  by the fresh database/coverage runs and protected Vercel build.
- The Welcome-flash regression passes 78 focused tests and the saved deletion/
  recreation journey. It observes visible Welcome headings across uncertain
  creation, slow access, catalog failure/retry and delayed artwork/texture;
  Terms stays visible until the first deck is ready. Component tests delay native
  `onShow`, verify the real cover content and preserve owner/attempt fencing.
  Native frame inspection remains open: no simulator was booted, and browser/
  component results do not establish the exact physical-phone presentation.
- In-app browser checks at 320×611 and 390×844 show the final no-icon layout,
  normal legal line spacing, bottom button and red legal-link failure feedback.
  These visual checks are separate from the saved journeys. The owned phone
  Metro server was restarted with a clean cache on 8081.
  The handoff follow-up also passed an actual side-panel first-use and deletion/
  recreation walkthrough at 320×611 against the guarded loopback fixture API:
  Continue created no account, Terms retained its preparation spinner, and the
  recreated account reached the deck. Both disposable accounts were cleaned up.
  Cold web/iOS exports and exported-web smoke passed after moving the cover;
  phone Metro was restarted with `--clear` to remove its old module paths.
- Hosted readiness returns 200; unauthenticated GET/PUT acceptance return 401;
  draft legal routes remain disabled (404). Two disposable hosted accounts prove
  current-version read/write, invalid-version rejection, retry timestamp reuse,
  no implicit acceptance for existing accounts and atomic new-account acceptance.
  Both were deleted through their own normal account API, with receipt/session/
  device cleanup verified in the same hosted database. Real account data and
  configured free-beta access were preserved.

Changed directories were reviewed by their complete file lists; existing
responsibility groups remain appropriate. No hosted Git CI or physical-device
acceptance is claimed. Phase 14 delivery, Phase 12 legal publication and the
earlier signed-device/release gates remain open with the owners above.
