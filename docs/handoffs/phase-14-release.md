# Phase 14 — Release validation and launch

## Current status

**In progress. Internal TestFlight 0.1.0 (5) and the matching staging API are
delivered; external-beta and paid-launch acceptance remain open.** This is the
consolidated receiving handoff, updated October 28, 2026 from release/account
evidence checked October 27 and the October 28 hosting/backup decision. It records implemented
work, actual release evidence, current concerns, owner decisions and remaining
tasks. It does not authorize a purchase, migration, provider contact, new release
or Git publication.

Read the [phase plan](../implementation-plan/phase-14-release.md),
[decisions](../DECISIONS.md), [beta procedure](../operations/TESTFLIGHT_BETA.md)
and [server release procedure](../operations/SERVER_RELEASES.md) before continuing.
The earlier [test-server](phase-14-test-server.md) and
[native-upgrade](phase-14-native-upgrade.md) handoffs preserve historical evidence;
their older pending-deployment/activation statements do not describe build 5.
Carry forward the applicable device/data-safety gates from
[Phase 13](phase-13-local-journal.md#open-acceptance-gates),
[Phase 11](phase-11-crash-reporting.md#open-gates) and
[Phase 12](phase-12-legal-documents.md#open-gates), using the current dispositions
below rather than repeating completed setup.

## Completed work and behavior

| Area                                  | Delivered result and limits                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native runtime and dependency patches | SDK 58 / React Native 0.88 upgrade integrated through PR #46. Latest supported patch alignment in PR #57 pins Expo 58.0.20, development client 58.0.16, File System 58.0.12 and Router 58.0.27. Build 5 contains the new native inputs; extended device acceptance and upstream advisories remain separate.                                                                                                                      |
| Offline beta access                   | Previously server-approved free-beta access survives same-owner offline restart until its server-issued expiry. Authoritative denial, account/origin changes and deletion fence stale approval. Expiry stops new starts while preserving saved history and completion of an already-admitted challenge. This does not enable paid access or guarantee unfinished-challenge force-quit recovery.                                  |
| GitHub Mac builds                     | PRs #49, #51–53 establish standard GitHub-hosted macOS compilation through pinned EAS local-build tooling, remote build numbering, exact-source IPA inspection/provenance and separate Apple upload. This avoids Expo cloud compilation allowance and heavy compilation on the owner's 8 GB Mac. Signing inputs are private and cleaned; builds still need their release approval.                                               |
| Separate JustGO Dev                   | PR #54 merged. Separate bundle/provider callbacks, Google iOS client, ad hoc profile and private CloudKit container were configured without replacing TestFlight. The first hosted Dev compile/upload succeeded. Local storage/Keychain/CloudKit are separate; signing into the same staging account still shares server history and deletion effects. Native install/provider/iCloud acceptance remains unverified.             |
| UI fixes                              | PR #55 merged: reflection editors remain visible around the keyboard; Progress day sheets resize within content/safe-area bounds, scroll rows independently and retain dirty-editor protection. Downward grip movement resizes rather than dismisses; with the keyboard open it first hides the keyboard. Updated UI shipped in build 4 and remains in build 5.                                                                  |
| Safe server diagnostics               | PR #56 logs each completed 5xx once using a generated request ID, classification/status and validated SQLSTATE. PR #57 adds an optional bounded Sentry reporter that reconstructs these safe fields with release/environment metadata. Raw exceptions, request bodies/URLs, account identifiers and private journal content are excluded. The matching reporter is now deployed.                                                 |
| Protected API releases                | PRs #57/#59 add a manual, owner-approved GitHub lane with exact main/tag/CI identity, fixed project/environment checks, restricted migrator/TLS, upload allowlists, candidate probes and an advisory lock through promotion. Deploy-only rejects pending migrations. Migration/deploy requires current source-bound recovery evidence; that path has not been exercised.                                                         |
| Release failure fixes                 | PR #59 fixes Expo bootstrap before remote diagnostics configuration loads, and project-only Vercel promotion without a team-wide credential. Promotion sends one HTTPS mutation, with no automatic retry/redirect and a total deadline, then verifies exact stable-alias provenance. Missing preview public Sentry configuration was corrected before the successful build. Failed attempts are not successful release evidence. |
| Maintenance and limits                | Identity-retention cleanup is scheduled hourly at minute 17 with a restricted execution role; initial execution and later successful runs were checked. Independent authenticated write/export budgets are deployed. Cleanup preserves journals and deletion/revocation ledgers; rate limits still need tuning from measured beta traffic.                                                                                       |
| Alerts and Sentry account setup       | Separate API/mobile projects, owner email rules, scrubbing/IP controls and approved symbol-upload credentials are configured. Owner accepted Sentry DPA 5.1.0. Synthetic issue erasure was authorized and verified. Uptime monitor 10773615 checks public readiness; a controlled assertion failure/recovery generated both emails, confirmed received. This was not an actual API outage.                                       |
| Public notices and Apple preparation  | Approved Privacy version `2026-10-27-essential-errors` is published, effective October 27; Terms remains `2026-10-25-beta`, effective October 25. Anonymous public bytes were verified. Apple has the Privacy URL, beta description, review contact and build-5 notes. App Privacy is saved as an unpublished partial draft: 13 categories selected, 11 configured, two diagnostics entries unfinished.                          |

## Current release evidence

| Item                  | Verified receipt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewed source       | [PR #59](https://github.com/anthonyyoo24/justgo/pull/59), merged source `311f07323fdaacfe868b5a18dce4b2f516923783`; immutable tag `testflight-beta-2026-10-27-2`.                                                                                                                                                                                                                                                                                                                                                            |
| Main CI               | [Foundation 40584989171](https://github.com/anthonyyoo24/justgo/actions/runs/40584989171): all seven jobs passed on the merged source.                                                                                                                                                                                                                                                                                                                                                                                       |
| API release           | [40585928393](https://github.com/anthonyyoo24/justgo/actions/runs/40585928393); Ready deployment `dpl_Gko9VqfvaPAXBrf2ZefegbjoCJ7W` at <https://justgo-two.vercel.app>. `/health` and `/ready` returned 200 with the exact release identity; unsigned journal/restore requests returned 401/no-store.                                                                                                                                                                                                                        |
| Database/environment  | Existing Supabase `kmcpcauaxlgpevkkenwd`, Canada Central. All 24 registered application migrations match; none pending and no schema writes in this release. Vercel's production deployment slot deliberately hosts **application staging**, not the paid production service.                                                                                                                                                                                                                                                |
| Native build/upload   | [Mac build 40587250274](https://github.com/anthonyyoo24/justgo/actions/runs/40587250274), artifact `12773992277`; separate [upload 40591517008](https://github.com/anthonyyoo24/justgo/actions/runs/40591517008). EAS submission `914df1b3-d1a8-47e5-82e9-7c6cedc8cab5`.                                                                                                                                                                                                                                                     |
| Actual signed IPA     | 0.1.0 (5), original bundle `com.anthonyyoo.justgo`; SHA-256 `96ddd076399fac183b16f704d485437a4e9f720a71f72d61dbc43051eff830fa`. Signature/store identity, Production CloudKit and public staging/diagnostics configuration passed inspection. All 18 privacy manifests match the prior build.                                                                                                                                                                                                                                |
| Symbol provenance     | Main native UUID `4767983f-fc3f-3690-899e-4dfd93330133` and embedded JS debug ID `969b61d8-dd30-4a81-9c09-cfa60d5d2843` match Sentry-stored dSYMs/source maps. Matching uploaded symbols do not prove symbolication of an actual native crash.                                                                                                                                                                                                                                                                               |
| Apple distribution    | Apple build `5740ba53-c8fb-406f-be28-fde95af5b6a5` processed and is **Testing** in the existing internal **Owner validation** group: one tester, manual distribution. No external review, outside invitations or public App Store submission. Actual IPA declares `ITSAppUsesNonExemptEncryption=false`; no Missing Compliance prompt was observed.                                                                                                                                                                          |
| Owner phone feedback  | Anthony reported that the TestFlight app **looks fine**. This establishes general owner-reported phone/UI smoke only, not an enumerated offline, recovery, deletion, provider, two-device or accessibility matrix.                                                                                                                                                                                                                                                                                                           |
| Separate Dev artifact | [Run 40375898057](https://github.com/anthonyyoo24/justgo/actions/runs/40375898057), source `22d583d01713c4f3b948f6c8873723288b13bea5`, tag `development-ios-2026-10-26-1`, Dev 0.1.0 (1); SHA-256 `9884f136c8acea3cdc7a48d9802f4657936ba457cdba72ba72b531eadfdeb52a`. [Installation artifact](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/38339b73-da09-49da-b9e1-149119481fd7) hosted successfully; phone acceptance is pending. This older binary is not evidence for build 5's newer native inputs. |

Ignored evidence remains under `.local/server-alerts-deployment/` and
`.local/development-ios/`, including release/artifact, Apple draft, provider and
recovery-readiness receipts. Those files may not accompany another checkout;
use the public run/source identifiers above and reverify account state when
resuming. Do not copy credentials, private contacts, journals or raw diagnostic
payloads into this handoff.

## Decisions in force and explicit deferrals

| Subject                 | Owner direction                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting                 | October 28: [Phase 15](../implementation-plan/phase-15-cloudflare-api.md#phase-15) moves the API from Vercel to Cloudflare Workers and Hono before the external beta; Supabase database/Auth stay. No account, purchase or deployment is authorized yet. Provider suitability for private journal content remains open. |
| Provider contact        | Do not contact Vercel. The prepared privacy inquiry remains **unsent**; Anthony declined it again. Do not reopen contact without a new instruction.                                                                                                                                                                     |
| Backups/spending        | October 28: encrypted nightly backups and an hourly ledger copy in Cloudflare R2 (Phase 15) replace the planned Supabase Pro upgrade. Stay on Free until a recorded upgrade trigger. No upgrade or purchase now.                                                                                                        |
| Essential diagnostics   | Approved filtered Sentry app/API errors, included uptime monitoring and email alerts; approved/published matching Privacy wording. Build 5 enables app reporting and the API reporter is deployed. Product analytics, replay, tracing and profiling remain off.                                                         |
| Deliberate native crash | Explicitly **skipped**, not passed or merely awaiting scheduling. Do not add a crash trigger, build for that exercise or perform it without later owner direction. Fatal crash/restart/cache acceptance remains unverified.                                                                                             |
| Physical-device matrix  | Remaining phone/offline/provider/Files/deletion/two-device/iCloud/accessibility checks are owner-deferred and unverified. Preserve earlier narrow phone successes and the new general UI smoke without broadening them.                                                                                                 |
| Offline artwork         | Separate physical offline-artwork exercise is owner-waived/unverified; inspected packaging and online images were accepted. Cold offline launch and data-safety checks are not waived.                                                                                                                                  |
| Simulator automation    | Automated iOS simulator/Maestro smoke is deferred/unverified. Do not implement it now; the retained older launch flow is not a passing current CI gate.                                                                                                                                                                 |
| External cohort         | Recommendation only: five trusted iPhone users for 14 days after readiness clears. Actual invitees and dates remain undecided; outside invitations/review are not authorized.                                                                                                                                           |
| Paid launch/regions     | First public App Store release is paid after accepted 16 billing. Initial availability excludes EU countries, UK, Norway, Iceland and Liechtenstein; actual Apple settings/trader declaration remain to be applied/verified. EU contact verification is deferred until expansion.                                       |
| Git/release permissions | Earlier approved merges, tags, deployments and uploads were completed. This handoff and the latest documentation reconciliation remain local. New push, PR, merge, native build/upload, external distribution and purchases retain their applicable separate permissions.                                               |

The [October 28 Cloudflare decision](../DECISIONS.md#october-28-cloudflare-workers-hono-and-r2-backups)
supersedes the October 27 Vercel/Supabase Pro selections. The separate
[crash/contact direction](../DECISIONS.md#october-27-deliberate-crash-test-and-provider-contact-direction)
and existing device/simulator deferrals remain in force. Phase 15 is planned, not
implemented; choosing the replacement does not close the current operating gates.

## Current concerns and roadblocks

### Private journal content and Vercel

The current account is **Hobby**. Vercel's [DPA](https://vercel.com/legal/dpa)
expressly applies its processor coverage to Pro/Enterprise and Schedule 1 §6.1
prohibits sensitive/special-category Customer Data. A journal can contain health,
beliefs or other sensitive material. Its contents pass through the API during
account synchronization even though the database is on Supabase; transit is also
processing. Log redaction does not remove that provider-processing boundary.
**Upgrading to Pro alone does not resolve the sensitive-data restriction.** No
account-specific exception or supported arrangement has been established.

Vercel [Hobby fair use](https://vercel.com/docs/limits/fair-use-guidelines#commercial-usage)
also limits commercial use; intended financial gain matters, so a free beta for
an intended paid product is not a documented safe harbor. The separate static
legal site needs an eligible plan/host for its intended commercial use as well.
The project model-training sharing setting is OFF, verified after reload. That
does not establish processor coverage or eliminate every operational use of
service metadata. The review found **no evidence establishing that journal text
was used for training or that a data leak occurred**; this is an unresolved
contract/data-handling suitability finding, not a confirmed breach.

**Selected resolution:** Phase 15 moves the API to Cloudflare Workers/Hono and
the static legal site to Cloudflare, while retaining Supabase database/Auth. The
earlier Vercel-arrangement and Supabase Edge Functions options are superseded;
Anthony does not need to select a host again. Verify Cloudflare account/DPA
coverage, the replacement API/release lane and actual traffic cutover before
closing the blocker. Old builds retain Vercel addresses; running both APIs or
redirecting through Vercel does not itself prove that journal payloads have
stopped reaching it. Record old-build retirement and the approved Vercel
retirement disposition. No provider contact is authorized. See
[Phase 15 decisions](../implementation-plan/phase-15-cloudflare-api.md#remaining-decisions-and-approvals)
and [provider findings](../legal/LEGAL_REVIEW.md#hosting-agreements-and-recovery-copies).

### Recovery copies, deletion and provider processing

- The October 21 snapshot predates five current managed-Auth/journal/deletion
  tables and omits the `auth` schema. Its successful historical restore is not a
  current full-recovery proof. The old backup runner expects 19 migrations;
  **do not rerun it unchanged against the current 24-migration database**.
- There is no evidenced current full app/Auth restore, protected off-Mac recovery
  arrangement or independently recoverable deletion/epoch/revocation/Auth ledger.
  Restoring an older snapshot must not resurrect deleted journals/accounts or
  revoked access. If the newer reconciliation ledger cannot be recovered, keep
  restored writers closed. Provider backups and local regression tests do not
  establish this operational recovery procedure.
- The selected October 28 recovery path is encrypted nightly app/Auth backups
  and hourly ledger copies in Cloudflare R2, to be implemented and rehearsed in
  Phase 15. Supabase stays on Free until a recorded upgrade trigger; Pro is no longer
  the selected prerequisite for backups. R2 is selected as the destination, but
  actual bucket/account setup, payment-method approval, retention/lock periods,
  key custody and recovery guarantees remain to be resolved. No purchase or
  account setup is authorized by this handoff. Scheduled copies alone do not
  establish complete recovery or provider-copy deletion/expiry.
- Supabase's [incorporated DPA](https://supabase.com/legal/customer-resources/data-processing-addendum)
  is not categorically missing because there is no separately signed PDF. Its
  sensitive-data conditions, actual notices/consent, Auth/profile/session
  retention and account/copy deletion still need verification. Canada Central
  database placement does not promise all support, metadata and recovery
  processing stays in Canada. Keep the applicable regional/request/deletion
  review open; do not infer blanket clearance or a HIPAA requirement from the
  fact that this is a consumer journal.

### Diagnostics and Apple disclosures

Sentry's allowlists are designed to exclude private writing, credentials and
persistent identity. Actual native final envelope headers/events/attachments,
local crash-cache contents, restart cleanup and fatal symbolication have not been
accepted on the released binary. The owner's crash-test skip does not verify
those paths or prove Apple's **Not Linked** answer. A future guarded non-fatal
native error could inspect the shared outgoing path without a crash; build 5 has
no such trigger, no test build/event has been performed, and that evidence alone
would not prove fatal cache/restart behavior. Do not use an already-built
`captureEnvelope` submission as proof of the native filtering path.

App Store Connect has 13 categories selected and 11 fully configured, all with
Linked/no-tracking answers and the purposes in the
[disclosure worksheet](../legal/RELEASE_DISCLOSURES.md). This includes the
recommended Health category for the retrospective feeling prompt, Other User
Content for reflections, Product Interaction and the eight Google SDK categories.
Google's declared Analytics purposes are separate from disabled JustGO product
analytics; do not claim no partner analytics or infer GPS/phone access from the
category names. **Crash Data and Other Diagnostic Data remain unfinished;
Publish is disabled and nothing was published.** Their identity linkage is an
evidence question, not an answer Anthony should guess.

Sentry DPA, approved notice, synthetic erasure, symbol matches and alert emails
are verified. The account was observed on a Business trial with five days left;
no paid continuation/downgrade behavior has been exercised or purchased. Published
event/backup retention is documented in the
[legal review](../legal/LEGAL_REVIEW.md#sentry-activation-notice-and-request-process);
do not invent a trial-specific expiry or promise immediate backup erasure. Check
the post-trial features/quotas before relying on them for wider testing.

## Remaining tasks and ownership

| Task                                      | Owner / completion point                                                                                                | What is still needed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported journal hosting                 | Phase 15 implementation/privacy owner; Anthony approves restricted setup/cutover actions before outside journal testing | Implement and verify the selected Cloudflare Workers/Hono API and legal-site move. Confirm account/DPA coverage, preserve the existing contracts/security/release safeguards, and prove old-build traffic retirement. The host choice is settled; provider suitability and actual cutover remain open. No Vercel contact.                                                                                                                                                                                                                                                                                                                                |
| Current recoverable backups               | Phase 15 implementation/release owner; Anthony approves policy, key custody and restricted account/spend actions        | Implement the selected encrypted R2 app/Auth backups and independent current ledger copies while retaining Supabase Free. Resolve the Phase 15 decision register, verify scheduled copies/missed-run alerts and retrieval, then rehearse stale synthetic snapshot → deletion → isolated restore → current ledger replay/no resurrection. Follow the [restore checklist](../operations/FOUNDATION.md#backup-restore-checklist); do not upgrade to Pro just to close this task.                                                                                                                                                                            |
| Migration/deploy acceptance               | Release owner before a release containing pending SQL                                                                   | Current successful run was deploy-only. `STAGING_RECOVERY_ATTESTATION` is unset; keep it absent until genuine current source-bound restore/ledger evidence exists. Rehearse the guarded migration path with reviewed recovery material; never fabricate an attestation or infer success from the code-only release.                                                                                                                                                                                                                                                                                                                                      |
| Final Apple privacy answers               | Implementation/privacy owner prepares; Anthony reviews publication                                                      | Resolve the two diagnostic entries using defensible evidence/configuration disposition while respecting the crash-test skip. Recheck actual partner behavior and applicable exemptions, submit accurate purposes/linkage, then obtain the applicable publication authorization. Saved beta metadata is not external-review approval.                                                                                                                                                                                                                                                                                                                     |
| Actual diagnostic delivery and retention  | Implementation/release owner before external acceptance                                                                 | Verify controlled, sanitized deployed API fault-to-Sentry delivery without exposing real user data. Native shared-path evidence remains a separate potential task; no new trigger/build is authorized here. Preserve skipped fatal-path uncertainty. Recheck post-trial monitoring/retention/features; GitHub build-failure email delivery is also not evidenced.                                                                                                                                                                                                                                                                                        |
| Deferred signed-device/data-safety matrix | Anthony with implementation/Phase 14 owner, deferred before release                                                     | Cold offline launch and save/reconnect, account/provider cancellation/refresh/revocation/linking/final-method protection/isolation, two-device and Apple-account-change CloudKit behavior, external iCloud deletion/recreation, native Files import/export/cancel/interruption/full-disk, account/data deletion and stale-copy fences. Inspect SQLite/WAL/SHM/temp-file protection, system-backup/Keychain and lifecycle behavior. Use [Phase 13 rollout](../operations/LOCAL_JOURNAL_ROLLOUT.md); do not treat general UI smoke as these passes.                                                                                                        |
| Native presentation/accessibility         | Anthony with implementation/release owner, deferred                                                                     | Smallest supported phone/large text, VoiceOver/focus/keyboard, sheet gestures, haptics/reduced motion, branded icon, font/splash and signed-app legal-link success/failure. Existing browser/layout and archive checks are narrower evidence.                                                                                                                                                                                                                                                                                                                                                                                                            |
| Dev app acceptance                        | Anthony with implementation owner                                                                                       | Verify side-by-side installation with retained TestFlight data, both providers' native first/returning/cancel flows, dedicated-container iCloud round trip and live Metro. Refresh the native Dev binary separately when its native inputs need alignment; do not assume an old Dev artifact contains build 5's patches.                                                                                                                                                                                                                                                                                                                                 |
| Dependency health                         | Dependency/release owner before public release                                                                          | October 27 root audit: three high/four moderate tooling findings; separate Vercel CLI lock: 20 high/12 moderate. API production graph: zero findings at that check. Track compatible upstream repairs without weakening gates/downgrading SDK or forcing incompatible majors. Weekly Dependabot covers workspace, isolated CLI and Actions; fresh online Expo Doctor is still required at publication.                                                                                                                                                                                                                                                   |
| External beta package and invitations     | Anthony chooses cohort/dates and approves distribution; release owner prepares                                          | Confirm actual invitees and 14-day recommendation or another duration; ensure server access spans Apple review/testing. Existing guest window ends November 10, 2026 at 15:23 UTC and is not a selected future cohort date. Reconcile reviewer notes, submit for external Beta App Review, wait for Apple acceptance, then invite only under separate authorization. Collect feedback and fix blockers.                                                                                                                                                                                                                                                  |
| Operational follow-through                | Phase 15 migration owner, then Phase 14 release owner with Anthony                                                      | Measure actual beta traffic before tuning rate/connection budgets; preserve existing application rate limits, scheduler checks and incident/forward-repair instructions. Move Sentry readiness monitoring and verify scrubbed API error delivery on Workers. Remove Vercel credentials only at approved retirement; if still needed, rotate the deployment token before **January 25, 2027** under credential authorization. No reminder/automation is created by this record.                                                                                                                                                                           |
| Paid launch after beta                    | Anthony with Phase 16/Phase 14 owner                                                                                    | Integrate and accept native billing/purchase/restore, offer/paywall, guest paid admission and free-to-paid/history continuity; reconcile paid notices/disclosures. Phase 16 owns the selected Superwall adaptation and its provider/privacy acceptance. Prepare isolated production configuration and coordinated compatible client/schema cutover, capacity/load evidence, store listing/screenshots/support URL/age rating/trader status and selected country availability. Recheck export/privacy/build requirements for the actual submitted binary and obtain public-release approval. Product analytics remains disabled; Phase 17 follows launch. |

## Decisions still required and next sequence

Cloudflare Workers/Hono, R2 and continued Supabase Free use are settled selections.
The [Phase 15 decision register](../implementation-plan/phase-15-cloudflare-api.md#remaining-decisions-and-approvals)
owns account/DPA confirmation, budget/setup approvals, backup retention and key
custody, recovery goals/deletion-ledger completeness, cutover and changed public
notices. Do not ask Anthony to choose the host or backup provider again. Routine
engineering choices remain with the implementation owner; material tradeoffs,
legal acceptance, spending and separately restricted actions go to Anthony.

The following release decisions remain with Phase 14 rather than disappearing
into the hosting migration:

| Decision                                      | Owner / before dependent action                                                                                          | Still needed                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase/private-journal privacy requirements | Implementation/privacy owner investigates; Anthony reviews any required change before outside testing                    | Determine the actual sensitive-data notice/consent and account/profile/session/copy-retention requirements. Prepare a concrete compliant flow/wording if required; do not infer that moving the API clears an unchanged database/Auth provider.                                                                                                    |
| Sentry and Apple disclosure disposition       | Implementation/privacy owner prepares evidence; Anthony reviews publication/configuration changes before outside testing | Resolve the two diagnostic entries and remaining native privacy evidence without reinstating the skipped deliberate crash test. Decide any necessary reporting-scope change from actual evidence, and verify post-trial features/retention before proposing any paid continuation. Phase 15 preserves the reporter; it does not close these gates. |
| Deferred release acceptance                   | Anthony with implementation/Phase 14 owner, before declaring the dependent release accepted                              | Revisit the already-recorded physical/device/recovery/accessibility deferrals at release acceptance. Record actual passes or explicit owner/release dispositions; hosting migration and general UI smoke do not turn deferrals into passes. The simulator and deliberate-crash directions remain in force.                                         |
| External testers and dates                    | Anthony, after readiness and before external review/invitations                                                          | Select actual invitees and dates, reconcile access expiry and reviewer access, then separately authorize external Beta App Review/invitations. Five trusted users for 14 days remains a recommendation only.                                                                                                                                       |

The sequence is Phase 14 internal beta → Phase 15 Cloudflare/R2 implementation
and acceptance → Phase 14 external beta → Phase 16 billing acceptance → Phase 14
paid launch → Phase 17 analytics. Phase 15 must close before outside testers
store real journals, and the separate Phase 14 privacy/device decisions above
also need disposition. Paid offer and launch decisions stay with Phase 16 and
the later paid checkpoint. Do not repeat completed build 5 upload, deploy-only
release, monitor email rehearsal or unchanged approved public Privacy publication;
the Cloudflare wording is a new notice review, not approval of unchanged text.

## Verification and documentation state

The release fixes passed full `npm run check` (394 tooling, 288 API, 1,752 mobile
and 35 contract tests, with online Expo validation), full aggregate/critical
coverage and independent review. Exact merged-source hosted Foundation passed
all seven jobs; API/native build/upload results are linked above. These are the
release's verification results, not a new test run for this documentation edit.
No skipped physical, simulator or fatal-crash check is counted as passed.

This handoff consolidates the current local decision, legal-inventory/review,
disclosure, plan and operating-guide reconciliation. It does not mark Phase 14
complete or refresh every historical prerequisite's evidence. Documentation-only
verification checks formatting, whitespace, relative links and consistency with
the recorded receipts; no app code, database, native build or UI changed for this
handoff request. Complete file lists in changed documentation directories are
reviewed before delivery; existing responsibility groups need no folder moves.
