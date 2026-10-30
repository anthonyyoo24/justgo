# Implementation decision register

Updated October 30, 2026. The [October 30 staging-retention decision](#october-30-seven-day-staging-backup-retention) records approved seven-day protection and expiry with verified lock enforcement; actual expiry remains unobserved. The [October 29 small-beta recovery decision](#october-29-small-beta-recovery-limit) records the accepted beta recovery limit and required reassessment. The [October 28 Cloudflare decision](#october-28-cloudflare-workers-hono-and-r2-backups) adds Phase 15 to move the API to Cloudflare Workers and Hono, with R2 backups instead of Supabase Pro. The [October 28 renumbering](#october-28-phase-renumbering) makes billing Phase 16 and shifts later phases; dated entries keep their original numbers. The [October 28 billing-provider decision](#october-28-superwall-replaces-revenuecat-for-phase-16-billing) replaces RevenueCat with Superwall for Phase 16. The [October 20 optional-account decision](#october-20-optional-accounts-and-cloud-sync) owns the current Phase 13 scope and supersedes its earlier local-only/manual-backup outcome. The earlier local-journal decision retains the phase numbering and release sequence. Earlier dated phase numbers and release orders are historical unless explicitly marked “now”; links resolve to the current owning files. Historical evidence and artifact paths remain unchanged. Historical dated decisions below retain their original evidence; the Phase 07 reconciliation supersedes server-backed browsing/active lifecycle, exact content revisions and cloud draft behavior. The October 19 [no-recording decision](#october-19-terms-links-without-acceptance-recording) supersedes the earlier legal receipt/version design and its analytics-permission assumption. The [October 20 territory decision](#october-20-initial-app-store-release-excludes-the-eu) supersedes the earlier worldwide target by excluding EU App Store countries, the UK, Norway, Iceland and Liechtenstein initially. Anthony owns product/account decisions; the implementation owner executes and records technical validation. Open choices below retain their status in [PRD §13](product/PRD.md#13-remaining-decisions-and-design-gaps).

| Decision                                                                       | Owner                          | Due                             | State                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root npm workspaces, strict TypeScript, one lockfile                           | Implementation owner           | 01                              | Implemented. No code wrapper.                                                                                                                                                                                                                               |
| Expo SDK 58 / React Native 0.88, Node 24 LTS, iOS 16.4 minimum                 | Implementation owner           | 01 / 14 native prerequisite     | Pinned; see FOUNDATION.md for exact versions and the native-upgrade handoff for evidence.                                                                                                                                                                   |
| Staging Supabase organization/project                                          | Anthony                        | 01                              | Approved anthonyyoo corp; created dedicated JustGo in Canada Central.                                                                                                                                                                                       |
| Vercel project                                                                 | Anthony / implementation owner | 01                              | Dedicated justgo project; API root apps/api, Montréal compute.                                                                                                                                                                                              |
| Production infrastructure and budgets                                          | Anthony                        | Before 14                       | Separate from staging; not provisioned.                                                                                                                                                                                                                     |
| Permanent bundle ID, Expo owner/project, Apple enrollment type                 | Anthony                        | Before 02 device recovery tests | Apple membership, linked Expo project, permanent bundle ID and signed physical development build are verified in APPLE_SETUP.md. Broader recovery/native release acceptance remains Phase 14; the simulator identifier is development-only.                 |
| iOS artwork and reusable tokens                                                | Implementation owner / Anthony | 01; refine per feature          | Paper extracts recorded. Raster-only exact measurements remain explicit gaps in DESIGN.md.                                                                                                                                                                  |
| Onboarding questions, branching and final designs                              | Anthony                        | Deferred                        | Deferred September 17; no welcome/questionnaire flow in phase 03. Revisit separately.                                                                                                                                                                       |
| Easy Level 1 challenge text, venue, subtext and duration                       | Anthony                        | Before 04                       | Six venues and 61 placements approved September 24; five minutes, no displayed subtext. Seeded in phase 04; see CHALLENGES.md.                                                                                                                              |
| Level indicator/exhaustion; Home color variants                                | Anthony                        | Before 04                       | Counter omitted; independent cycling stacks. Three colors rotate with the deck; Streets is the initial venue. Configured venue decks are nonempty; catalog loading/refresh failures have recovery states rather than an ordinary empty deck.                |
| Optional feeling/text save and Reflection dismissal                            | Anthony                        | 06; updated 09                  | Approved September 27 and updated October 15: overall step optional; feeling-only/text-only/both accepted; bottom Skip when empty or Save Reflection otherwise is the only post-challenge exit. Progress keeps its dirty-close prompt.                      |
| Saved reflection reading and edit/delete controls                              | Anthony                        | Before 07                       | Phase 06 implemented reading. Phase 07.4 adds explicit Add/Edit text, preserving feeling and dirty-close protection; deletion remains excluded.                                                                                                             |
| Elapsed-duration storage/display and day-sheet summary                         | Anthony                        | 06                              | Approved September 29: remove elapsed-duration storage/API fields and per-entry/day duration displays; omit the day-level rep total and use Feeling. Completion clocks, frozen dates/zones and calendar rep badges remain. See PRD §5.7 and migration 0009. |
| Code quality and test hardening before billing                                 | Anthony / implementation owner | 06A                             | Complete; see the Phase 06A handoff. Objective coverage/lint/boundary gates remain. Phase 07 separately redesigns API/persistence; deferred physical-device/staging gates stay open.                                                                        |
| Subscription products/pricing/trials, paywall, expiry rules, Superwall mapping | Anthony                        | 16                              | Pricing/products/trials and final paywall setup remain open. The nine subscription verification/expiry/earlier-upload rules are confirmed in Phase 16; production billing is not implemented.                                                               |
| Settings rows/reminder defaults                                                | Anthony                        | 08 / deferred                   | Settings controls are implemented in Phase 08; practice reminders and notification scheduling remain deferred beyond first release.                                                                                                                         |
| Future levels/credit/taxonomy, Android, dictation, lock-screen display         | Anthony                        | Respective deferred phase       | Intentionally deferred; not launch blockers.                                                                                                                                                                                                                |

September 27 reflection follow-up: tapping the selected face again clears the feeling. “Choose one.” stays visible, and any written reflection remains intact.

Never treat Paper's sample counts, preselected feelings, dates or content as approved defaults. No paid-access bypass, fake user account, permanent local journal or domain table has been added in phase 01.

## September 17 phase 02 implementation decisions

Anthony approved deferring Apple enrollment/signing and real-iPhone acceptance while identity implementation and later phases proceed. Phase 02 stays open until device gates pass. No release or unconditional iCloud-recovery claim follows from that deferral.

The implementation owner selected 7-day independent sessions, renewal within 24 hours of expiry, 10-minute approved transfers, 256-bit bearer credentials, persisted idempotent proposals and PostgreSQL-backed rate limits. These are documented in [IDENTITY.md](architecture/IDENTITY.md), with configurable bounds and dedicated tests. The existing Expo project and default per-app Keychain access group are retained; permanent signing/access-group continuity still requires device validation.

## September 17 phase 03 scope decision

Anthony authorized phase 02 staging follow-up and phase 03 on a feature branch. Welcome screens and questionnaire onboarding are deferred; build the existing approved screen shells and shared navigation/API/account infrastructure. No onboarding schema or Zustand store is introduced. Historical scheduling said phase 07; the October 3 split moves native subscriptions/paywall to Phase 07A. Development screen fixtures must be isolated from paid access and real domain writes.

## September 21 phase 04 scope decisions

Anthony approved venue filtering in phase 04 using Street & Park, Gym, Café & Bookshop, Bar & Party, and Errands & Transit from the reference in the “Clarify venue exclusions” task. The counter is future level progress and is omitted at launch. Per-challenge illustration, separate hint and safety-guideline fields are not required. Confirmed expired paid access locks paid functionality without a finish/reflection exception; billing now belongs to Phase 07A under the October 3 split. See [PHASE_04_SCOPE.md](product/CHALLENGES.md) for approved scope, proposals and remaining details.

Apple Developer enrollment is complete according to Anthony; account/team access, permanent identifier, signing and physical-device evidence have not been verified. The existing device-gate deferral remains in effect. Small device checks during development are recommended, with the full acceptance pass before release.

## September 24 phase 04 implementation

The six-venue, cycling, no-subtext 39O specification supersedes the September 21 proposal. Implementation defaults are Streets on first use and per-account persisted venue selection; genuinely empty venues invite trying another venue. Server-confirmed outcomes freeze a named IANA zone/local completion date. The elapsed-time storage introduced at that point was removed by the September 29 decision below. No progress aggregate, reflection or payment feature was added in Phase 04. See the [phase 04 handoff](handoffs/phase-04-challenge-loop.md) for schema, retries, tests and remaining physical-device gates.

## September 29 Phase 06 scope and validation timing

Anthony removed elapsed-duration storage and display, the day-sheet rep total and the After label. Migration 0009 and the shared attempt/Progress contracts implement this decision; the sheet retains completion clocks and Feeling, and calendar badges retain per-day reps. Start/deadline/end timestamps remain for timer recovery and dated history, and the configured challenge goal remains five minutes. At zero the timer says Goal reached and still awaits an explicit outcome. The earlier day-duration/rounding rule is superseded; API/mobile rollout must account for the removed field and column.

Physical-iPhone acceptance is scheduled after the full app build in Phase 14. Staging checks belong to integration/release validation. Preserve those gates in the original handoffs while local feature implementation proceeds.

## September 30 Phase 06A sequencing

Anthony approved [Phase 06A — Code quality & test hardening](implementation-plan/phase-06a-code-quality.md#phase-06a) between Progress and billing. It may start and complete against verified local implementations while earlier physical-device/staging gates remain open. API route and persistence redesign is discussed separately. The quality phase is complete; the Phase 06A handoff records its tests and maintained thresholds.

## October 8 Phase 07 implementation reconciliation

- Resource-only identity/catalog/completed-attempt/reflection PATCH/summary/calendar/day protocols replace old action paths. API/contracts/mobile cut over together; final migration 0013 removes obsolete tables/columns/receipts after comparison and restoration rehearsals. Release deployment and old installed-client retirement remain Phase 14 integration work.
- Venue selection/deck order stay in memory. React owns unfinished activity; Start/Give up have no product write, fresh mounts/account changes/process restarts discard it, and lock/background retains captured start/duration while alive. Completed generates one stable UUID and normal Success follows the serialized phone save.
- Stable challenge/venue/Level 1 references replace content revisions. Current wording can appear in old history after minor edits; new activities get new IDs. Inactive references remain. New reps freeze the original start-date/time zone; prior recorded dates and submitted content/revisions survive migration.
- AsyncStorage stores the catalog and one account-scoped journal with submitted activity, ordered upload intent and reconciliation. Downloaded history is limited to latest summary/current-month counts/today's pages; other month/day reads require a connection. Pending/memory-only content is never ordinary cache eviction.
- Explicit reflection saves use stable submission IDs/expected revisions, preserve feeling on later text edits and never autosave drafts. Genuine conflicts adopt current backend writing automatically; no two-phone chooser. Ordered replay protects newer local writing from older acknowledgements.
- Normal uploads use one sender, two short retries and sparse active/online recovery opportunities with cooldown/Retry-After. Device-write failure clears disposable confirmed period payloads, retries once, then tries the same operation online. If neither saves, continue with memory-only content and a dismissible loss-risk banner; full recovery shows one toast. Accepted pre-upload only-device loss risk adds no backup system.
- Progress independently reconciles each aggregate and merges day rows by attempt ID. Definitive completion rejection removes provisional credit while retaining content; reflection-only rejection retains valid rep credit. The saved app/API/database suite and required browser CI remain; 07.3A is deferred, and native/device/staging gates remain separately owned.
- Access/earlier-upload provider interfaces have isolated tests, with no production paid bypass. Phase 07A connects RevenueCat verification/coverage, account-scoped saved access, purchase/restore, webhook delivery and scheduled billing recovery. Under the phase ownership recorded before the October 18 reorder, Phase 08 owns support/Settings/data controls, Phases 10–11 acceptance/analytics, Phase 13 legal documents/disclosures and Phase 14 the full physical-device/staging/release pass.

See [APP_SHELL.md](architecture/APP_SHELL.md), [PRD](product/PRD.md) and the [Phase 07 handoff](handoffs/phase-07-api-offline.md) for current implementation and evidence. Earlier dated sections are historical and do not reopen superseded behavior.

## October 14 Phase 08 scope split and renumbering

Historical numbering in this section records the October 14 split; the October 17 mapping below supersedes it.

Anthony reports most Phase 08 work completed and is implementing account deletion. Keep deletion, retention/backup mechanics and the existing Settings/recovery/export/preference acceptance in [Phase 08](implementation-plan/phase-08-settings-privacy.md#phase-08). Move analytics consent, PostHog and product measurement to [then Phase 09 (now 10 and 17)](implementation-plan/phase-17-analytics.md#phase-17), and Privacy Policy/Terms, legal review, public hosting and disclosure preparation to [then Phase 10 (now 12)](implementation-plan/phase-12-legal-documents.md#phase-12). Operational diagnostic redaction/service-health dashboards stay in Phase 08.

Former release Phase 09 is now [then Phase 11 (now 14)](implementation-plan/phase-14-release.md#phase-14); lock-screen countdowns, optional US checkout and the future coach shift from 10–12 to 12–14. Earlier IDs and billing's beta-first activation sequence remain unchanged. Existing open device/staging/release gates keep their owners under the new numbering. This is a documentation/planning change, not feature implementation, phase acceptance or publication authorization.

## October 15 Terms & Privacy acceptance (now Phase 10)

Anthony approved one Terms & Privacy onboarding page as the only permission request for the disclosed Phase 11 analytics scope. Remove both planned analytics Settings controls; no separate sensitive-metadata choice or post-reflection analytics prompt. This limited page is approved while welcome/questionnaire onboarding stays deferred. Account-owned, versioned acceptance and matching client/server enforcement replace the two-choice boundary. Retain payload exclusions, account/deletion fencing, reliable product saves and provider cleanup.

The How We Feel reference supplies the page structure, not JustGO's data claims: submitted records live on the phone and in the cloud, and persistent pseudonymous analytics is account-linked. Disclose feeling/length fields if included. The [planning handoff](handoffs/phase-10-acceptance.md) records draft copy, dependencies and evidence limits. Implementation/export remains disabled; Phase 13 reviews final wording, regional sufficiency and applicable privacy requests. This update does not authorize publication or close any implementation/release gate.

## October 16 codebase assessment follow-up

Anthony approved these decisions while reviewing the [October 16 codebase assessment](https://claude.ai/code/artifact/f5067650-3c46-4c2e-bf14-1fcb107617ab):

- **Placement.** New work from the assessment goes only into Phase 08 or later, because Phase 08 is current. CI-unblocking fixes land as [Phase 08 pre-merge work](implementation-plan/phase-08-settings-privacy.md#phase-08-pre-merge); structure, documentation and tooling cleanup with no user-visible change becomes [Phase 08A](implementation-plan/phase-08a-structure-cleanup.md#phase-08a), after Phase 08 merges and before Phase 09; remaining items join Phases 08–14.
- **File-based routes.** Keep every current URL except the access gate, which moves from `/` to `/access` so Home is the only owner of `/`. Group screens with parenthesized folders, which change no URL, and freeze the route list before Phase 14. Turn on Expo Router typed routes.
- **Implementation plan folder.** Split `IMPLEMENTATION_PLAN.md` into a `docs/implementation-plan/` folder with a README and one file per phase, including Phases 01–07. Moving earlier phases' text is documentation housekeeping, not new work for those phases.
- **Superseded and finished documents.** Delete files that no longer work or label themselves superseded; Git keeps their history. Archive finished handoffs in `docs/archive/`, and keep handoffs with open gates until those gates close.
- **Handoffs record only what the next phase needs.** That means decisions and their reasons, behavior that changed, invariants to preserve, problems that could recur, open gates, and setup or environment changes someone must know about. Per-change details belong in the commit message or PR description, not the handoff. This covers small UI adjustments with no lasting decision, interim test runs and coverage numbers, browser steps, screenshot paths, and merge or publication bookkeeping. A handoff is edited in place, stays short enough to read in one sitting, and links to CI runs instead of pasting output. Each fact has one home: scope in the phase file, decisions here, outcomes and open gates in the handoff, status in the phase file and handoff index.
- **Retention defaults.** Follow the hosting tools' defaults rather than custom schedules. A deleted account's activity is removed immediately, as implemented. The minimal deletion record and revoked-credential tombstones are kept permanently: they hold no reflection content and stop a deleted account being recovered. Database backups follow the Supabase plan's default retention, and the policy states that deleted data leaves backups within that period. Server logs follow Vercel's default retention and contain no private content. Support emails are deleted after 12 months unless a conversation is still open. Analytics keeps the 90 days Phase 11 proposes. Phase 08 confirms the actual backup retention in the Supabase dashboard; Phase 13 writes the wording.
- **Backup restore procedure.** Phase 08 writes a short restore checklist: before restoring, save the deletions made since the backup; after restoring into an isolated environment, apply them again and confirm those accounts stay deleted before reopening the app. The full rehearsal on the hosted test server moves to Phase 14's paid-launch checkpoint, when real users' data is at stake; it is not required for the free beta.
- **Server monitoring.** Use existing tools rather than building a dashboard: Vercel's and Supabase's built-in dashboards, a free uptime checker on `/ready`, and an error tracker for API 5xx errors with the same log scrubbing. Set them up before the Phase 14 free beta, when testers start using the server; Phase 08 keeps only the diagnostic redaction already in place.
- **Free-beta admission.** The free TestFlight beta admits testers through the staging-only beta access window rather than one-by-one account approval. TestFlight controls who can install the build; the window controls when those accounts can start challenges.
- **Post-deletion welcome screen.** The welcome screen shown after account deletion, or while a new account waits for access, belongs to account deletion. It does not reopen the deferred welcome/questionnaire onboarding.
- **Later the same day:** Anthony deferred the separate Expo Doctor CI job and its weekly schedule [CI-1]; Doctor remains the first step of the single CI job. Work always lands through feature branches and pull requests, so `push` runs only for merges to `main`. He also deferred scheduling the retention cleanup on the hosted database; the cleanup function itself ships with Phase 08. He reported completing the Phase 08 physical-iPhone checks (deletion on a signed build, haptics lifecycle, two-phone transfer, Get help and Suggest a feature email drafts).
- **Placing the deferred Phase 08 items:** Anthony approved moving four follow-ups into later phases. The month-boundary journey fix joins Phase 08A, landing on its own first if 08A has not started by November 1. The API redeploy with the 4xx mapping and the retention cleanup schedule (migration 0015, Supabase `pg_cron` recommended) join the Phase 14 free-beta server setup. Phase 13 confirms the production database will be on Supabase Pro (7-day daily backups) before writing the backup period, and Phase 14's paid launch puts production on Pro. Anthony chose the standard 7-day backup period.

## October 9 beta-first sequencing and reminder deferral

Anthony moved payment activation until after Settings and a free TestFlight beta.
Under the October 17 numbering, finish Phase 08/08A, then Phases 09–12 and legal notices in 13, then the
Phase 14 free-beta checkpoint; activate and accept 07A before returning to 14 for
paid launch. Preserve prepared local billing work and all nine subscription rules.
Do not generate purchase keys or enable RevenueCat/live billing before its stage.
Free testers use authenticated server-authorized access in isolated hosting and a
signed iOS build. Practice reminders, notification permission requests and reminder
scheduling are deferred beyond first release. Feature requests use the private
support contact flow rather than a public board. This records the original owner
decisions moved from the plan; it grants no deployment/upload/publication approval.

Anthony declined Tminus and Lance for now and retained the existing EAS release
workflow. This decision is recovered from the preserved native-billing planning
stash; no submission service was installed or connected.

## October 15 measurement and app changes

Anthony approved the explicit analytics event allowlist and analytics-only start_id
linking in the [Phase 11 plan](implementation-plan/phase-17-analytics.md#phase-17-measurement).
The identifier never enters saved attempts or API/database contracts. He also
approved one-time shuffled venue decks persisted on the phone, remembering the
last venue, and removing the post-challenge Reflection top exit. These app changes
remain independent of analytics activation; PostgreSQL remains authoritative for
exact reps while best-effort accepting-user events support rates and patterns.
This preserves the header decisions from the original plan without changing scope.

## October 17 Phase 08A documentation ownership

Phase 08A moves plan scope into named phase files, implementation results into
handoffs, architecture into concern-based guides, and unbuilt designs into
proposals. The original Phase 07 API/persistence discussion is archived; current
behavior remains in ACTIVITY_DATA.md. No product decision changes in this move.

The approved Phase 08A CI split places fresh Expo Doctor validation first in the
`static` job. Five parallel producers feed the required `checks` status;
API coverage merges execution maps from the disjoint unit/database producers
before applying the existing floors. This replaces the earlier single-job layout.
The separate standalone/weekly Doctor job remains deferred.

## October 17 Phase 08A review split

Anthony approved publishing Phase 08A as two stacked pull requests rather than
one pull request per implementation step. Documentation and design-source
organization form the first comparison; the remaining implementation uses that
branch as its base. Each comparison must remain within CodeRabbit's 300-file
limit. Repository review configuration inherits the existing organization settings
and allows automatic review against the documentation branch. Preserve separate
move and behavior commits, validate both actual
publication candidates, and retain all existing device and release gates.
Merge approval remains a separate owner decision.

## October 17 Phase 09 split and renumbering

Anthony wants each phase to group related work that can be requested and completed in one run, with owner review at phase completion. Routine implementation/test steps are internal checkpoints, not separate confirmation requests. Material unresolved decisions, blockers and separately restricted actions still require the applicable owner input or authorization.

Split the former Phase 09 without adding or dropping approved scope:

| Previous owner          | Phase on October 17                                            | Responsibility                                                                                                   |
| ----------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 09 app changes          | [09](implementation-plan/phase-09-app-continuity.md#phase-09)  | One-time shuffled/saved venue decks, remembered venue and bottom-only post-challenge Reflection exit             |
| 09 acceptance           | [10](implementation-plan/phase-10-acceptance.md#phase-10)      | Terms & Privacy page, account-owned versioned receipt, eligibility boundary and unavailable Settings-row removal |
| 09 measurement          | [11](implementation-plan/phase-17-analytics.md#phase-17)       | Explicit events, acceptance-aware adapters, PostHog settings/cleanup, event dictionary and dashboard             |
| 09 app diagnostics      | [12](implementation-plan/phase-11-crash-reporting.md#phase-11) | App crash/unhandled-error reporting, redaction and provider facts                                                |
| 10 legal                | [13](implementation-plan/phase-12-legal-documents.md#phase-12) | Legal review, public notices/hosting and release-disclosure preparation                                          |
| 11 release              | [14](implementation-plan/phase-14-release.md#phase-14)         | Free beta, server monitoring, native/staging/release validation and paid launch                                  |
| 12–14 optional features | 15–17                                                          | Lock-screen countdowns, optional US web checkout and future AI text coach respectively                           |

The October 17 order was 09 → 10 → 11 → 12 → 13 → 14 free beta → 07A activation/acceptance → 14 paid launch. The October 18 decision below supersedes that order and the table's phase numbers. Legal review may proceed alongside implementation. Phase 10 remains verifiable with labeled legal test URLs and analytics disabled; Phase 11 consumes its tested receipt boundary. Resolve the app-reporting fields/provider/privacy basis before enabling delivery in 12, with final legal reconciliation in 13. Server monitoring stays in 14. Earlier IDs through 08A and billing sequencing remain unchanged.

Preserve the event allowlist table and analytics-only start_id rules in Phase 11. Move the existing draft acceptance copy/planning handoff to Phase 10. Renumber current references and later phase/handoff filenames together; preserve historical evidence/artifact paths and distinguish dated numbering history. No implementation is started, no acceptance gate is closed and no publication, push, PR or merge is authorized by this planning change.

## October 17 Success navigation

Anthony approved disabling swipe-back on Success as well as Reflection. Continue
is the only exit from a valid completed result and opens its Reflection; bottom
Skip/Save then returns Home. Keep gestures disabled both when Success is revealed
inside the native `/challenge` surface and on standalone `/success`. This avoids
bypassing Reflection or making a completed challenge appear to become active again.
Preserve the explicit Back to Home recovery action for a result route without a
matching completed attempt. Phase 09 owns this follow-up; native gesture acceptance
remains open until evidenced.

## October 17 Phase 10 entry and acceptance

Anthony approved the existing Welcome → Continue → navy Terms & Privacy → I Accept flow. Continue only navigates; I Accept creates the no-signup account and saves its accepted versions atomically. Existing-account recovery keeps its identity and requires acceptance only when its own current receipt is missing. Reuse the edited navy Paper design, including narrower headings, reference-sized body text and extra spacing above I Accept. This does not reopen questionnaires, enable analytics, approve final legal publication or authorize any Git/hosting action.

## October 18 acceptance layout and hosted endpoint

Anthony requested removing the acceptance page's account shortcut, shortening the
save error to “Couldn’t save your acceptance. Please try again.” and making errors
red. Keep the agreement at normal two-line spacing immediately above the bottom
I Accept button, with no action below it. Existing Settings/recovery/data-control
routes remain available through their established navigation.

Anthony explicitly authorized updating the existing hosted test server so it
serves the acceptance endpoint. This permits the matching API deployment and
required forward migrations on the existing application-staging infrastructure;
it does not authorize Git publication, release deployment, legal publication,
retention scheduling, provider activation or native distribution. The
[Phase 10 handoff](handoffs/phase-10-acceptance.md) records the rollout evidence.

## October 18 focused verification for routine fixes

Anthony approved focused checks as the default for routine fixes, classified by
the behavior and boundary changed. A follow-up or handoff edit does not reopen
phase closeout. The [testing guide](operations/TESTING.md#choosing-checks) owns the
scope matrix, concrete escalation triggers, coverage and file-move checks; actual
phase closeout and publication retain their full required gates.

Reuse unchanged instructions, versioned reference documentation and correctly
configured tools when context and ownership are verified. Keep routine check
details in task/review records and update durable documentation when behavior,
invariants, setup or paths change. Preserve regression tests, coverage floors,
fixture isolation/cleanup, native/device evidence and separate Git permissions.
Keep heavy checks sequential on the 8 GB Mac.

## October 18 crash reporting before launch and analytics deferral

Anthony approved moving product analytics until after paid launch and integrating basic Sentry crash/error reporting before legal finalization. Renumber the current phase files, dependency/handoff references and compatibility index together:

| Previous phase | Current phase                                                  | Responsibility                                                                         |
| -------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 12             | [11](implementation-plan/phase-11-crash-reporting.md#phase-11) | Sentry app crash/unhandled-error reporting, redaction, recovery and provider facts     |
| 13             | [12](implementation-plan/phase-12-legal-documents.md#phase-12) | Final launch notices, acceptance copy/versions, public URLs and disclosure preparation |
| 14             | [13](implementation-plan/phase-14-release.md#phase-14)         | Free beta, server monitoring, signed-device/release validation and paid launch         |
| 11             | [14](implementation-plan/phase-17-analytics.md#phase-17)       | PostHog events, cleanup, dictionary and dashboard after paid launch                    |

Run 10 → 11 crash reporting → 12 legal → 13 free beta → 07A activation/acceptance → 13 paid launch → 14 analytics. Earlier phase IDs and billing's beta-first sequence stay unchanged. Phases 15–17 stay optional after paid launch and do not depend on analytics.

Sentry account setup created the React Native `justgo-mobile` project under `anthony-corp` in the US region. That is setup evidence only: the SDK, delivery/redaction, verified retention/privacy basis and signed-device acceptance remain Phase 11 work. API uptime/5xx monitoring stays in Phase 13. Analytics is not a prerequisite for either crash reporting or launch.

Keep product analytics and unconditional billing-to-PostHog forwarding disabled through beta and paid launch. Preserve Phase 10's account-owned receipt, restrictions and eligibility fencing. Phase 12 must align the existing acceptance page and reviewed legal/scope versions with actual launch collection; the current runtime copy still describes PostHog/feeling/length scope and is not changed by this planning edit. Do not silently treat a launch receipt as permission for future analytics.

Before Phase 14 activation, review the provider/payloads, update public notices/disclosures and accepted versions, and require current account-owned acceptance through the existing Terms & Privacy page. Preserve the approved event allowlist and analytics-only `start_id` rules; do not backfill pre-activation history. No separate analytics switch or separate prompt is added.

Preserve historical decision numbering and ignored evidence paths. The live hosted-test handoff moved to `phase-13-test-server.md` in this October 18 reordering (its [current location](handoffs/phase-14-test-server.md) follows the later October 20 insertion); its rollout evidence and all earlier device/release gates remain unchanged. This reordering does not implement an SDK or runtime copy change, close an acceptance gate, or authorize Git publication, deployment, native build/upload, legal publication or new data delivery.

## October 18 minimal Sentry integration

Install Expo 57's supported Sentry React Native 7.11.0 (Cocoa 8.58.0), keeping
Expo Doctor validation intact. The app-support diagnostics owner starts before
Router and independently allowlists JS events at capture and final transport;
the iOS config plugin separately allowlists native events because Cocoa crashes
bypass JavaScript callbacks. Keep replay, tracing, logs, sessions, attachments and
account/user linkage disabled. Preserve generic ErrorBoundary recovery and keep
provider failure outside product saving/access/recovery.

Synthetic browser delivery and provider-stored redaction are verified. On
October 18, Anthony approved minimal essential diagnostics under the Privacy
Policy, including startup before onboarding acceptance. Reporting does not depend
on the account's Terms & Privacy receipt. Preserve the narrow approved fields:
app/version, OS version and scrubbed technical stacks; no account ID, stored IP,
feelings, journal text or breadcrumbs. Phase 12 reviews matching notices and
applicable requirements before real-user activation; signed-build acceptance stays
in Phase 13. This owner scope decision does not close those launch gates.
Account deletion cannot
identify reports through an app account because no account identifier is sent;
Phase 12 must review event-based requests/retention without promising linked erasure.
The [inventory](legal/DATA_INVENTORY.md#sentry-diagnostic-boundary) records exact
fields, local native cache and provider facts. Native config changes require a
rebuilt binary; an OTA JS disable does not disable already enabled native capture.
Signed-build crash/restart, payload inspection and symbolication remain Phase 13.

## October 18 Phase 12 operator clarification

Anthony confirmed the personal operator is Youngshin Yoo in Ontario, Canada.
The existing owner-selected temporary support/privacy email remains the draft
contact. No public address, telephone or final domain was supplied by this confirmation.

Anthony asked what Supabase Pro means. The current organization was verified on
Free; the earlier seven-day backup target applies only to a configured Pro project.
No upgrade was purchased or authorized and no current seven-day backup guarantee
is established. Phase 12 must settle the final promised configuration before
publication, with actual infrastructure/restore acceptance retained in Phase 13.
Local legal candidates and a hosting preview do not constitute content approval,
worldwide legal clearance, provider activation or publication permission.

## October 19 Phase 12 API description review

The authorized Phase 12 technical review retains `/openapi.json` [SEC-4]. The
static description contains public contracts, not account data or credentials.
The app's authentication and account-ownership checks protect records independently
of whether their route shapes are documented. No API route, deployment protection
or access policy changed; normal owner patch review still applies. This technical
decision is not publication, deployment or merge permission.

## October 19 Phase 12 public drafts and local protection review

Anthony asked for a JustGO-specific public draft informed by How We Feel and
Stoic, followed by the remaining Phase 12 work. Use their readable topic structure
and separation of journal, technical data and optional processing; retain JustGO's
own phone-and-cloud model, export/deletion behavior and disabled analytics/crash
delivery. Competitor policies are design references, not evidence of JustGO's
practices or legal sufficiency. Internal test plans, provider tiers and unresolved
review notes stay outside public text. Content review and hosting authorization
remain separate from drafting.

The SEC-5 technical review retains the existing iOS Data Protection baseline.
AsyncStorage adds no app-controlled journal encryption; no MMKV migration or
additional vault was selected or implemented. The earlier blanket recommendation
to require a second lock before beta was too strong: no specific gap has yet been
established that requires one. Phase 13's existing signed-build storage acceptance
must inspect the actual file-protection class and backup exclusion, including
failure behavior. A concrete finding can require remediation; an extra vault is
not automatically a release prerequisite or a new owner risk-acceptance question.
This does not claim end-to-end cloud encryption or protection of an unlocked app.

## October 19 legal-site address choice

Anthony selected Vercel hosting with its automatically assigned `.vercel.app`
address for the legal reader; no custom domain is needed now. This settles the
host/address preference. The actual project address is assigned on deployment;
final document content/effective date approval and publication verification remain
open. The source approval metadata stays pending until the text is approved.

The initial portfolio/free-beta direction does not remove the planned later
payment phase. Review commercial hosting eligibility before a commercial rollout,
rather than waiting for paying users. No paid plan, domain purchase or provider
agreement acceptance is authorized by the address choice. Existing pre-real-user
hosting/data-processing and regional release conditions remain recorded in the
[legal review](legal/LEGAL_REVIEW.md).

## October 19 legal-text approval and worldwide target

Anthony approved the drafted Privacy Policy and Terms. Record their source
metadata as owner-approved without changing the approved public wording. The
current version identifiers remain candidates until publication finalization;
the effective date and actual public URLs are not yet set. No provider is enabled
and no plan purchase or agreement acceptance is authorized by content approval.

Anthony also confirmed worldwide availability for the first App Store release.
This settles the target territories, not the remaining regional/provider review,
trader/contact requirements or signed-build evidence. Keep those conditions open
with their existing owners. The selected legal host remains Vercel with a generated
`.vercel.app` address; do not ask for content approval or a domain choice again.

Anthony confirmed paid access from the first public App Store release. Preserve
the existing sequence: free TestFlight beta, then 07A payment activation and
Phase 13 paid release acceptance. Do not reinterpret the portfolio direction as a
free public App Store launch. Commercial hosting eligibility must be resolved
before that rollout; this answer does not authorize a plan purchase. Paid notices,
offer/renewal/cancellation information and billing disclosures remain the existing
07A/13 pre-launch gates. Public trader contact details for EU distribution have
not been supplied or approved for publication. Anthony confirmed they are not ready
yet. Keep obtaining suitable contacts and Apple's verification open before EU App
Store distribution; do not infer permission to publish a home address or private
phone number, or ask for those details again while their availability is unchanged.

## October 19 publication deferred until hosting is ready

Anthony chose to wait until closer to launch to pay for hosting and keep the legal
website local for now. Preserve the approved public text, Vercel-generated address
choice, worldwide target and paid-first App Store sequence. Do not deploy the site,
upgrade a plan, invent public URLs or set an effective publication date now.

Publication, anonymous HTTPS/link verification, final legal version/date setup and
the matching API/mobile rollout remain explicit open work for Phase 13 launch
preparation when Anthony is ready to start hosting. Current content approval does
not need to be requested again; materially changed paid/vendor disclosures still
need review before use. The native/provider/regional release conditions remain
open, including EU trader contacts that are not ready yet. This defers publication,
not those requirements, and does not authorize a future paid purchase automatically.

After the development app could not save acceptance, Anthony explicitly approved
updating the existing test server on October 19. This authorizes the matching
candidate API/contracts deployment to the existing phone API address and disposable
acceptance verification. It does not publish the legal website, finalize effective
dates, upgrade hosting, authorize Git publication or distribute a native build.
The [Phase 12 handoff](handoffs/phase-12-legal-documents.md) records the verified
test-server repair; the public release rollout remains open.

## October 19 Terms links without acceptance recording

Anthony rejected the legal receipt/version system and requested ordinary Terms/Privacy links and Continue-based account creation. Do not record document views, agreement dates or accepted versions, call a legal-acceptance API, or force existing accounts through reacceptance. This supersedes the earlier October 15/17/18 receipt, accepted-scope and eligibility-ticket design and the earlier October 19 matching-version repair.

Keep ordinary account/session creation and exact-proof retries, recovery, access checks, journal saving and deletion safeguards. Strip legacy legal metadata without resetting credentials. Forward migration 0018 removes only the legal receipt table; independent analytics restrictions and activity/deletion acknowledgements remain. The requested removal includes retiring the existing test-server receipt implementation and its stored legal records; public legal hosting and paid upgrades remain deferred. Git publication and native distribution retain their separate permissions.

Product analytics and ordinary Sentry delivery stay disabled. Phase 14 must review any future collection and permission design separately; the normal Continue action or historical receipt cannot authorize it, and the removed tracking/gating system must not be silently reintroduced.

## October 19 plain Privacy and Terms pages

Anthony requested removal of the legal reader's approval/preview banner, internal version and pending-date display, Legal landing page and top tabs. Keep two document pages with footer cross-links; the base address renders Privacy directly. Source metadata and publication checks remain internal, and the public text no longer refers to version/date information appearing above. Hosting remains local under the existing publication deferral.

## October 19 concise Terms and Privacy entry copy

Anthony requested removal of the onboarding Analytics section, Sentry paragraph and development-release notice, with the data summary informed by the supplied How We Feel Paper reference. Paper MCP inspection confirms that reference describes device-only saving and active non-identifying research usage, which differ from JustGO. Anthony later chose to retain the existing cloud storage; the entry text explicitly describes uploads for account recovery, optional feelings/reflections and the no-sale assurance. The full Privacy Policy remains linked, with the explicit encryption-status sentence omitted at his request. The internal inventory retains the actual technical protection facts. No data flow, diagnostics/analytics activation, account behavior or legal publication changes follow from this copy edit.

## October 20 initial App Store release excludes the EU

Anthony first directed that the initial App Store release exclude the European
Union. In his later October 20 reply, he explicitly also excluded the United
Kingdom, Norway, Iceland and Liechtenstein for now. This replaces the October 19
worldwide target while preserving paid access from the first public release.
Other intended storefronts retain their applicable review; no additional exclusion
is inferred. The UK/non-EU EEA expansion requirements are deferred until those
markets are reconsidered, without treating storefront exclusion as a blanket
privacy-law exemption.

Phase 13 must apply and verify the country selection in App Store Connect;
no storefront setting or app distribution was changed by this documentation
update. The EU public trader address/phone gate applies before a future EU
expansion, rather than blocking this initial release. Apple's trader-status
declaration and the applicable privacy/eligibility review for actual distribution
and processing remain release tasks. Storefront exclusion alone is not a blanket
exemption from privacy law.

No hosting upgrade, purchase, publication or provider activation follows from
this decision. October 20 read-only checks still show the JustGO Vercel team on
Hobby and its Supabase organization on Free; discussing Pro does not authorize
an upgrade. Both services support multiple projects, with additional Supabase
projects incurring their own compute costs on paid organizations.

## October 20 Phase 12 provider review and project data-sharing opt-out

The bounded Apple/regional/provider review is recorded in
[LEGAL_REVIEW](legal/LEGAL_REVIEW.md). Retain 18+, the current individual-operator
implementation assumption and Apple's standard EULA with supplementary service
Terms; the license relationship is clarified without a custom EULA or new identity
collection. Actual App Review eligibility remains Phase 13.

JustGO's Vercel Project Settings → Data Preferences had future model-training
sharing enabled. It was disabled for **JustGO alone**, saved and verified after
reload. Team defaults and the owner's other projects were left alone. This
control concerns future code/chat sharing and does not prove journal-request
payloads are excluded from every secondary use. No service was activated, plan
purchased, contract accepted or message sent.

Vercel's processor/sensitive-data scope remains unresolved independently of
paid-plan eligibility. The exact privacy/contracts inquiry is prepared and unsent.
Anthony declined permission to email Vercel on October 20. Keep the draft; do not
send it unless he later explicitly authorizes contact. This does not resolve or
waive the hosting condition before real users. His same reply excludes the UK,
Norway, Iceland and Liechtenstein initially; the related bases/representative/
transfer review is deferred until expansion. Washington health-data classification
remains recorded before US availability. No territory restriction beyond the
owner's explicit choices, new consent workflow or legal receipt was introduced. Keep public
hosting deferred and ordinary diagnostics/analytics disabled under the existing
decisions. Only supported provider/regional assertions may enter public text.

Later public-source and product-specific research in the same review prepares
conservative consumer-health handling, a short supplemental notice and concrete
request/deletion checks instead of leaving regional classification as an owner
research assignment. It also assesses Supabase Edge Functions as an alternative
API host while retaining the existing private database and cloud journal. These
are implementation recommendations for review: no storage redesign, hosting
migration, new public navigation or purchase is selected. The existing no-contact,
publication and country decisions remain in force.

## October 20 local journal and manual backup phase

Anthony accepts keeping feelings and reflection text on the phone, with JustGO
account recovery restoring basic cloud challenge history but not that private
journal. He selected manual backup and restore files through iCloud Drive;
automatic iCloud synchronization and AI coaching are out of scope for now.

Insert [Phase 13 — Local journal and manual backup](implementation-plan/phase-13-local-journal.md)
before release. Existing release becomes 14, analytics 15, native timers 16,
optional web checkout 17 and future AI coach 18. The hosted test prerequisite is
renamed to Phase 14 as well. Number-only compatibility links follow the new map;
named historical measurement aliases still resolve to analytics. Dated decisions,
migrations, acceptance IDs and evidence paths keep their historical identities.

Phase 12's local legal preparation can be handed off with publication explicitly
deferred to 14. Phase 13 implements the new storage boundary, preserves existing
content through a reviewed cutover, adds real backup/restore and reconciles
notices with verified behavior. Existing cloud-processing claims remain accurate
until that implementation; this decision does not change the running app or
approve cloud-data removal, deployment or public wording in advance.

Keep the existing Vercel API and Supabase database subject to verification of
their reduced payloads. Supabase Edge Functions remains a researched alternative,
not a required migration. Reassess cloud-journal-specific regional/provider
conditions after cutover rather than marking them universally resolved or
automatically publishing the prepared health supplement. Phase 14 retains
remaining publication, plan eligibility, support, backup and release evidence.
No purchase, provider contact, public deployment, Git publication or native build
is authorized by this planning change.

## October 20 optional accounts and cloud sync

After reviewing How We Feel's data/account screens and privacy policy, Anthony
selected the same visible product approach: account-free local use, optional
Apple/Google sign-in, signed-in cloud storage of challenge history and private
journal entries, an iCloud Sync toggle, Download my data, Import data and Delete
all my data. Logout retains local data. Replace the custom recovery-key and
transfer-code interface; preserve existing writing and account ownership during
migration. The earlier approved reset applied only to old server reflections,
not existing phone journals, accounts or challenge history.

This supersedes the earlier Phase 13 prohibition on all future private uploads
and its exclusion of automatic iCloud sync/provider sign-in. It does not discard
the durable local journal, offline behavior, import validation or conflict/data
isolation safeguards already implemented. Add a dedicated signed-in journal sync
boundary rather than replaying retired private queues or blindly reverting the
phase. Preserve no-private-content diagnostics and analytics/AI activation gates.

The revised [Phase 13 plan](implementation-plan/phase-13-local-journal.md) uses
managed Supabase Auth with native Apple/Google adapters, the existing API/private
PostgreSQL boundary and optional private CloudKit synchronization. The precise
relationship between How We Feel's account cloud storage and its iCloud toggle,
and its initial guest-data migration rules, are not established by the researched
sources. The plan explicitly labels JustGO's proposed rules for these gaps.

Reopen Phase 13 acceptance. Its earlier handoff evidence describes the previous
local-journal baseline only. Revise implemented architecture/product/privacy
sources after the new behavior is verified, with clear local-versus-cloud copy
before account upload. Native capabilities/builds, Apple/Google provider setup,
hosted changes, publication and paid purchases retain their separate permissions.
No production configuration, hosted data, authentication or release behavior is
changed by this planning update.

The initial optional-account implementation follows explicit first-sign-in guest merge, retained owner-bound
local collections after logout, and optional CloudKit off by default. Welcome now
places “Sign in with Apple” and “Sign in with Google” with their logos above guest
Continue. A stable deletion intent plus server epochs/CloudKit generations prevents
retrying a lost acknowledgement from deleting new data. One full-data download/import
includes history and writing; possession of a file does not authenticate an account.
These rules describe JustGO, not inferred How We Feel internals. Real provider and
CloudKit setup/build/hosting acceptance remain separately gated.

## October 21 journal continuity and Account/Data Settings

Anthony clarified that the same journal must remain visible and editable before
sign-in, after sign-in and after logout. A permanent View guest data action and a
separate guest-journal experience are unwanted. Supersede the optional first-login
merge choice above: disclose account cloud storage before sign-in, then adopt the
phone's unowned writing automatically when sign-in succeeds. Returning to the
same account reconciles its local edits and cloud history together. Preserve
different-account ownership, conflicting writing and existing phone data; this
does not authorize moving a former owner's entries into another person's account.

Account will contain Login methods with branded Apple/Google rows and switches
that show the actual connected methods, followed by Log out and Delete account.
Do not add a separate connected-status sentence/block. Both deletion rows use red
text and trash icons, with no chevron, and open their confirmation modal directly
on the current page instead of adding an intermediate deletion page.
Data will contain iCloud Sync, Download my data, Import data and Delete all my data
at the bottom, with matching cloud/circular-arrow, down-arrow/tray and up-arrow/tray
icons. Reuse the existing account-deletion confirmation modal presentation for
both destructive actions, retaining their distinct wording and behavior.

Keep both deletion actions: deleting data retains the JustGO account/login methods;
deleting the account also removes JustGO account access and its associated data.
Neither deletes the person's Apple/Google account or their exported files. Keep
one full-data download/import flow. Finish actual iCloud configuration and native
verification within Phase 13; until available, explain why the control cannot be
enabled instead of leaving it silently unresponsive.

Anthony requested a written plan before implementation. The revised
[Phase 13 sequence](implementation-plan/phase-13-local-journal.md#implementation-sequence)
orders continuity/migration, verified provider switches, page layout, shared
confirmations, backup/deletion reconciliation, external setup/device acceptance
and final verification/documentation. It specifies implementation defaults for
provider disconnect/last-method protection and authentication inside account-owned
import/deletion flows. These details describe JustGO behavior, not verified How We Feel internals.

Anthony then authorized implementation. The revision adopts unowned phone writing
automatically after the sign-in disclosure and retires the source only after a
durable account copy. Older optional-merge installations require a disclosed
re-login before adopting parked writing. Account-owned import authenticates before
opening the file picker; the user chooses the file after returning to Data.
Previously associated iCloud copies remain deletion targets when sync is off;
unavailable cleanup stays pending. Preserve the earlier server-only legacy-reflection
reset scope and all separate publication, hosted configuration and native build
permissions. The handoff distinguishes local evidence from open external gates.

## October 21 native provider rollout and hosted session checks

Anthony authorized implementation of the working-login checklist, console access,
Google policy acceptance, creation of JustGO's web/iPhone OAuth clients and the
Google-only Skip nonce checks setting required by the pinned original iOS SDK.
Apple retains native nonce validation and permits missing email because the app
requests no Apple email/name scopes. Browser OAuth remains separate from the
native ID-token flows. No paid SDK, billing upgrade, Git publication or public
release was authorized by this setup.

The existing staging Supabase project, Apple team/bundle, Vercel app and Expo
project are reused. Migrations 0019–0023 ran only after a protected snapshot,
restoration/forward rehearsal and transaction-internal preservation comparisons.
The approved old-server-only journal reset excludes accounts, challenge history
and phone storage; hosted inventory had no old attempt/reflection rows to erase.

Hosted Supabase does not support direct Auth-schema grants to custom roles.
Follow its [private-helper guidance](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema):
a versioned, postgres-owned, unexposed helper returns only the exact verified
session/subject's live boolean. Fixed empty search path, runtime-only execution,
no direct Auth access and fail-closed body/owner/effective-permission readiness
preserve live logout/revocation checks without granting the API an administrator
role. Keep app-schema migrations immutable and manage this provider-owned
capability through reviewed versioned operator SQL.

Retire the obsolete recovery UI and fallback branches, retaining existing-owner
proof/vault reads and pending legacy deletion until supported installations finish
migration/cleanup. The configured signed build and successful automated/staging
readiness checks do not establish real phone login, hard Auth deletion or working
iCloud. Those acceptance gates remain explicit in Phase 13.

## October 22 iCloud recovery and scoped Phase 13 closeout

Anthony requested completing guarded iCloud recovery and the local closeout, and
explicitly skipped the remaining manual checks: offline-save/reconnect, all
second-device/Apple-account-change cases, extended Apple/Google continuity and
account-isolation cases, and native Download/Import/deletion acceptance. Preserve
these as owner-deferred and unverified before release, under Anthony, the
implementation owner and the Phase 14 release owner. The single-phone upload,
sync-off isolation and re-enable/restart catch-up checks already passed; skipped
cases do not inherit those passes.

The recovery behavior in this paragraph was superseded by the October 23 decision
below. The October 22 implementation required ordinary reads to fail closed for
missing known collections, with explicit recovery recording a durable reset fence
and clearing intent before phone writing could be cleared. Pending deletion,
closure, handover, ownership and server epochs remained protected. Its compatible
signed build was inspected; physical recovery acceptance was not established.

For this scoped closeout Anthony requested focused checks of the changed
recovery/native, adapter/coordinator and UI boundaries, avoiding unrelated or
repeated full-phase suites. Record current focused results separately from earlier
full-suite evidence. This does not change coverage thresholds or remove the
applicable publication/release checks, privacy approval/publication, signed-device
or hosted CI gates. Local implementation closeout does not mean production
release acceptance and does not authorize a Git push, PR, merge or public release.

## October 23 iCloud deletion retains phone data

Anthony rejected the Clear older copy and sync flow. Deleting JustGO's iCloud data
through Apple Settings does not authorize deleting journal entries or challenge
history from the phone. Remove that action and its recovery-clearing flow. Keep
the saved iCloud Sync preference: while enabled, ordinary synchronization may
recreate missing cloud storage and upload the phone's existing entries; turning
it off stops ordinary uploads and keeps the phone's entries. Do not infer a wish
to erase phone data from an external cloud deletion or encrypted-data reset.

This supersedes the October 22 missing-collection recovery behavior, not its
manual-test deferrals or scoped verification decision. Genuine in-app Delete all
my data and Delete account retain their confirmations, durable cleanup, account
closure and authenticated deletion-epoch safeguards. Native missing-storage reads
create an empty cloud collection without an app-deletion marker; genuine in-app
reset/closure always writes the app-deletion marker, including legacy recovered
collections. The adapter requires the new `readRetainingLocal` capability so an
older bridge cannot apply the rejected deletion semantics. A compatible signed
build and actual device acceptance remain distinct from automated checks.

An unfinished clearing intent from the removed flow may be canceled only when
there is no actual deletion/cleanup or authoritative account-epoch clear to
finish. Preserve current ownership, handover, conflicts and all entries that have
not already been explicitly deleted. The superseded `3cbc873a` binary remains
historical build evidence, not the installation candidate for this behavior.

After the compatible replacement bridge was exercised on the phone, Anthony
explicitly deferred external iCloud deletion/recreation and second-phone restore
acceptance. These remain unverified before release under Anthony, the
implementation owner and the Phase 14 release owner. Single-phone on/off,
catch-up and restart results do not establish either deferred case; the earlier
manual, privacy and release deferrals remain in force.

## October 24 beta access while offline

Anthony chose to let previously approved free-beta testers start challenges offline
until their server-issued beta access expires. The phone retains only a fresh
`free_beta` approval, scoped to its canonical account or guest collection, access
mode and API origin. First use still needs a server approval; expiry grants no
extra grace. Saved history remains available. An authoritative online denial,
explicit logout, provider detachment, account switch or deletion invalidates the
old local approval. An offline tester cannot discover a remote revocation until
reconnecting, so beta expiry remains the offline limit.

Transient offline restoration of an account-owned journal may read that same
account's saved beta approval without creating an authenticated session or enabling
cloud requests. Challenge admission checks the live clock and current owner at the
Accept action. Expiry blocks new starts while allowing an already-admitted
challenge, its result and unsaved reflection to finish within the same collection;
identity and deletion guards remain in force. This beta policy does not activate
the separate paid-access rules in Phase 07A or authorize distribution/deployment.

## October 24 offline-artwork check waived

After confirming venue and Success illustrations return online, Anthony chose to
trust the inspected packaging and skip a separate packaged-build offline-image
check. The installed development client fetches those images from Metro; the
production iOS export contains all required venue variants, paper texture and
Success artwork. Record the physical offline-artwork check as owner-waived and
unverified, rather than passed, and proceed with other Phase 14 work. This does
not waive cold offline launch, data-safety, privacy or other release gates.

## October 24 TestFlight display name

Anthony selected **JustGo: Ditch Dating Apps** for the existing App Store Connect
record. Preserve app `6821022390`, bundle `com.anthonyyoo.justgo`, existing Apple
team and Expo project; this is a store-name update, not a new app/account or a
change to local journal ownership. The installed app retains the JustGO name.

## October 25 beta notices and build automation

Anthony authorized final necessary wording changes and public document hosting
on Vercel Hobby for now. Keep Terms unchanged; Privacy additionally explains
ordinary visits to the legal website. The approved `2026-10-25-beta` notices are
effective October 25, 2026 at `https://justgo-legal.vercel.app/privacy/` and
`/terms/`, on a separate static project with model-training sharing off. This
document-hosting choice does not establish private-journal processor suitability
or authorize a paid plan, provider contact or external-beta release.

Anthony separately approved the Expo robot `justgo-beta-builder` with Developer
access (publish/view organization projects), its generated token and storage
only in GitHub's protected `testflight-beta` environment. Owner approval is still
required for each release job. Preserve the existing Git hold and separate
review/merge, signing/upload and external-distribution permissions.

## October 25 GitHub Mac beta builds

After Expo's free iOS cloud-build allowance was exhausted, Anthony selected
GitHub-hosted macOS builds over local compilation on his 8 GB Mac. He authorized
completing this setup and its necessary permissions in advance. Use standard
public-repository runners without a paid plan. Preserve Expo/EAS tooling, existing
managed credentials, preview configuration and remote build-number increments.

Compile through EAS local builds on stable `macos-26` with explicit Xcode 26.6.
Protect the Expo token, temporary signing inputs and release environment. Replace
cloud build-ID dependence with exact GitHub run/artifact provenance and archive/IPA
hash verification; keep Apple upload separate from compilation and inspection.
This build-route decision does not authorize tester invitations, external release,
paid services or claim that signed-device acceptance is complete.

## Open and settled product decisions

This table was moved from the plan. Resolve open entries before dependent work; settled entries preserve scope and are not new approval requests.

| Decision                        | Before phase                                 | What needs an answer                                                                                                                                                                                                                      |
| ------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding content              | Deferred                                     | Welcome/questionnaire flow deferred by Anthony; revisit scope and designs separately. No phase 03 gate.                                                                                                                                   |
| Launch catalog                  | 04                                           | Settled: CHALLENGES.md supplies 61 placements in six venues; five minutes, no displayed subtext. Seeded by phase 04. The archived curriculum remains a future draft.                                                                      |
| Deck counter                    | 04                                           | Settled: omit level progress; each venue cycles. New accounts start in Streets. Configured decks are nonempty; loading/refresh failures retain recovery actions. See CHALLENGES.md.                                                       |
| Future levels                   | Later; not a launch blocker                  | Thresholds, unlocking/skipping, historical-credit policy and later taxonomy; retain Level 1 history now without implementing progression.                                                                                                 |
| Reflection save & dismissal     | Approved September 27; updated October 15    | Feeling-only/text-only/both; bottom Skip when empty or Save Reflection otherwise is the only post-challenge exit, with no top Back/X or discard prompt. Progress retains its dirty-close prompt.                                          |
| Reading saved reflections       | Settled; 06/07.4                             | Per-attempt reading and inline text Add/Edit are implemented; feelings remain immutable after submission.                                                                                                                                 |
| Apple account & offer           | Apple setup from 01; billing in post-beta 16 | Enrollment, bundle ID/app record and signing start early. Configure subscription products and Superwall mapping after the free beta, during 16; settle offer/paywall rules before billing validation.                                     |
| Supporting designs & formatting | Relevant phase                               | Home color variants, remaining Settings controls, Phase 08 haptic preferences, duration rounding and outstanding small-screen/accessibility design states. See the owning phase and handoff before treating an older design note as open. |

## October 26 day-sheet resizing

Anthony selected continuous resizing from the top grip. Open short days at their
content height and longer days around two-thirds of the screen. Keep the released
height within a minimum showing the complete first attempt row and a
content/safe-area maximum; cap short days
without stretching them into mostly empty space. Scroll challenge rows inside the
sheet independently. Measure the first summary row and its padding for the
minimum, adapting to wrapped/scaled text. Allow light upward stretching beyond
short content before returning to its content height on release.

Only the overlay and X are sheet dismissal controls. Dragging downward shrinks the
sheet until its minimum, and cannot close it regardless of distance or speed.
Retain dirty-reflection confirmation on dismissal. With the keyboard open, a
downward grip gesture hides the keyboard first and preserves the editor and chosen
height. This replaces the earlier proposed drag-to-dismiss behavior and does not
close the existing physical-device/accessibility release gates.

## October 26 separate iPhone development app

Anthony selected a separate **JustGO Dev** app alongside TestFlight, built on
GitHub's standard Mac runner because Expo's iOS cloud allowance is exhausted.
He requested full Apple/Google sign-in and iCloud support. Use bundle
`com.anthonyyoo.justgo.dev`, scheme `justgo-dev`, a dedicated Google iOS client
and private container `iCloud.com.anthonyyoo.justgo.dev`; preserve the original
app's identity, storage and provider configuration. Keep the existing Expo
project and staging API/Auth. The same signed-in account still shares backend
history/deletion effects, so destructive testing uses disposable accounts.

Compile through EAS local builds with frozen managed credentials and upload the
inspected exact IPA through `eas upload` for its installation link. Hosting uses
the separate uploaded-build allowance; no Expo cloud compilation or TestFlight
submission occurs. Native callback/entitlement inspection and explicit Metro
environment isolation protect the app boundary. The first hosted build and
physical acceptance remain pending under the
[development-build procedure](operations/DEVELOPMENT_BUILDS.md). Existing owner
review, Git permissions and Phase 14 release gates remain in force.

## October 27 hosting, backups and simulator-test direction

The owner-requested side-chat decision handoff selects the existing providers:
Vercel for the API/server and Supabase for database/authentication. Keep that
arrangement as the working plan; do not pursue a hosting migration. Cloudflare
R2, Backblaze B2 and AWS were discussed, but none was selected. This provider
choice does not establish private-journal processing suitability or close the
existing privacy/recovery gates.

Supabase Pro is the selected managed-backup plan, with automatic daily backups
and seven days of accessible history. Defer the upgrade and spending until Anthony
is ready for outside testers or App Store release preparation. No purchase or
upgrade is authorized now; current backup, recovery-copy retention and
deletion-safe restore evidence remain separate requirements.

Defer the automated iOS simulator smoke test [TST-2] for now. Do not implement
that CI test under the current scope; record it as deferred/unverified, never
passed. This does not supply physical-device evidence. The side-chat explanation
of alerts and deployment automation authorizes no new implementation, account
changes or purchases.

## October 27 error alerts and approved server releases

Anthony subsequently approved implementing Sentry for sanitized API errors and
app crashes, Sentry uptime checks of the public staging readiness endpoint, email
notifications, and GitHub Actions server releases with an owner approval button.
This later instruction supersedes the earlier explanation-only restriction for
these controls. It does not authorize paid upgrades, a provider migration, Git
push/PR/merge, a server deployment or a new native build by itself.

Use the existing US `anthony-corp` organization with separate `justgo-api` and
`justgo-mobile` projects. Keep product analytics, replay, tracing and profiling
disabled. Rebuild API reports from the safe diagnostic classification only; do
not forward exceptions, request context, account identifiers or journal content.
Keep mobile payload/native filters and a separate explicit diagnostics build
profile. Existing TestFlight 0.1.0 (4) has reporting disabled. Native acceptance
remains open before external testing; browser tests cannot establish it.

The owner confirmed receipt of Sentry's test email and personally accepted DPA
v5.1.0 on October 27. He approved the reviewed Privacy Policy wording and its
publication at the existing URL, effective October 27, version
`2026-10-27-essential-errors`. The Terms remain unchanged. Account configuration
and notice approval do not establish signed-build acceptance or final Apple
privacy disclosures.

Use the protected `justgo-staging` GitHub environment for reviewed main-branch
releases, a project-restricted Vercel credential and the existing restricted
migrator. Deploy-only must refuse pending migrations; migration/deploy additionally
requires current, source-bound recovery evidence. Preserve the database advisory
lock through candidate validation and promotion. Read back an uncertain promotion
before any further action; never automatically roll back a changed schema.
See [server releases](operations/SERVER_RELEASES.md) for the operating procedure.

Sentry owns recurring uptime monitoring; retain the GitHub readiness workflow as
a manual diagnostic after the workflow change is merged. GitHub continues to
report build/test failures. No Slack integration is needed. Supabase Pro, current
restorable/off-Mac backups, private-journal provider assessment and deferred
physical-device/simulator checks retain their separately recorded status.

## October 27 release-publication patch follow-up

Anthony requested implementation of the remaining patch work, pushing the branch
and opening its PR. Include the SDK 58 compatibility alignment as a separately
reviewable commit with the prepared error-alert and release work. Expo, development
client, File System and Router patch versions follow the refreshed supported set;
React, React Native, the Sentry version and app identities remain unchanged.
The updated native core/JSI still requires a newly signed binary and later phone
acceptance. Keep those deferred release gates explicit. This instruction authorizes
the current push and PR; merge, server deployment, native build/upload and outside
tester invitations retain their separate approval.

## October 27 deliberate-crash test and provider-contact direction

Anthony explicitly chose not to perform the deliberate native crash test and
again declined sending the prepared Vercel privacy inquiry. Do not add a crash
trigger, dispatch a build for that exercise or contact Vercel under the current
scope. Record fatal crash/restart acceptance as owner-skipped and unverified,
never passed. This does not establish Sentry identity linkage or resolve
private-journal provider coverage, recoverable backups or other device checks.
Non-crashing evidence may be investigated separately, without claiming it proves
the skipped fatal cache/restart path. Apple privacy preparation remains an
unpublished draft; public submission retains its separate review/authorization.

## October 28 Superwall replaces RevenueCat for Phase 16 billing

Anthony selected Superwall as the Phase 16 subscription provider instead of
RevenueCat. Superwall's subscription infrastructure (entitlements, purchase and
restore, server-side entitlement lookups and signed webhooks) is free at any
revenue level; RevenueCat charges 1% of all tracked revenue above US$2,500 a month.
Use JustGO's own billing screen, not Superwall-rendered paywalls, which are billed
at 1% of paywall-attributed revenue above US$10,000 a month. Paywall experiments
need a separate decision.

Keep the Phase 16 design: server-verified entitlements in PostgreSQL, immediate
purchase/restore verification, durable webhook receipts, reconciliation and the
nine subscription rules. Superwall offers a RevenueCat-compatible subscriber
endpoint and Svix-signed webhooks, so provider-specific changes should stay in the
API provider adapter, webhook ingress and the mobile store adapter. The existing
`codex/phase-07a-native-billing` checkpoint is RevenueCat-based until reworked.

Before activation, verify and record: a Superwall data processing agreement
covering this use; purchases, restores and entitlements with the SDK's external
data collection disabled (`isExternalDataCollectionEnabled: false`), consistent
with disabled product analytics; sandbox results from the compatible lookup
endpoint, including expiry, grace, refund and restore transfer; and webhook
signature verification and replay handling. If any check fails, return to
Anthony before reverting to RevenueCat. Update notices and App Privacy answers for
Superwall before paid launch. This decision authorizes no account creation,
purchase, code change, build or billing activation.

PostHog remains the planned Phase 17 product-analytics provider. The
[Cloudflare decision](#october-28-cloudflare-workers-hono-and-r2-backups) below
replaces the October 27 hosting and backup choices; every other provider keeps its
October 27 decision.

## October 28 Cloudflare Workers, Hono and R2 backups

Anthony approved moving the API from Vercel to Cloudflare Workers in a new
[Phase 15](implementation-plan/phase-15-cloudflare-api.md#phase-15), before outside
testers store real journals. Vercel's DPA (Schedule 1 §6.1) prohibits sensitive
data and its Hobby plan bars commercial use. The reviewed Cloudflare DPA (v6.4)
does not prohibit special-category data. Fastify is not supported on Workers
([fastify/fastify#6314](https://github.com/fastify/fastify/issues/6314) was closed
as not planned), so the HTTP layer moves to Hono. Supabase Postgres and Auth,
Drizzle, the contracts, domain services and the mobile app stay.

Use encrypted nightly backups and an hourly deletion-ledger copy in Cloudflare R2
instead of upgrading to Supabase Pro. Stay on the Supabase Free plan, and ask
Anthony to approve Pro when database size nears 400 MB, monthly egress nears 5 GB,
a pause or capacity incident occurs, or revenue comfortably covers the cost. This
supersedes the October 27 instruction not to pursue a hosting migration and its
selection of Supabase Pro backups. The Supabase DPA sensitive-data consent clause
and the signed-in journal provider assessment remain open Phase 14 gates.

Start on Workers Free; Workers Paid (US$5/month) needs approval if measured CPU
exceeds the free limit. This decision authorizes no account creation, purchase,
DNS change, deployment, migration, notice publication or Vercel retirement.

## October 28 phase renumbering

Anthony asked that phases take the next number in the order they will run, not
letter suffixes such as 07A. The Cloudflare move runs next, then billing, so later
phases shift:

| Before October 28 | Now | Responsibility                              |
| ----------------- | --- | ------------------------------------------- |
| —                 | 15  | Cloudflare API hosting and R2 backups (new) |
| 07A               | 16  | Native subscriptions and reliable billing   |
| 15                | 17  | Product analytics and the PostHog dashboard |
| 16                | 18  | Lock-screen countdowns                      |
| 17                | 19  | Optional US iOS web checkout                |
| 18                | 20  | Future AI text coach                        |

The release order is now 14 internal beta → 15 Cloudflare/R2 → 14 external free
beta → 16 billing → 14 paid launch → 17 analytics. Current references, plan
filenames and anchors are renumbered; dated decisions above keep the numbers in
force when they were written. The billing checkpoint branch
`codex/phase-07a-native-billing` and its `phase-07a-billing.md` handoff keep their
names until that work is reworked. Renumbering changes no scope, acceptance gate
or authorization.

## October 28 Phase 15 runtime and recovery implementation

The Hono port preserves the existing schema, contracts and domain services.
Workers use request-owned pg connections through cache-disabled Hyperdrive.
Cloudflare lists advisory locks as unsupported, so the complete identity
transactions that need them use a separate direct restricted-role TLS connection,
with both connections checked by readiness. Hosted pooling/statement-timeout
acceptance remains required. This engineering adaptation changes no identity
policy or database schema.

The first Worker uses a distinct `bootstrap` operation in the same protected
GitHub release workflow. It requires reviewed main source, successful exact main
CI, current migrations and the same database lease; ordinary releases still
require an existing verified Worker baseline. Initial runtime bindings are a
temporary protected secret, not code or build input. A transition Privacy notice
must name both Cloudflare and Vercel while supported older builds retain Vercel
addresses; the beta candidate is pinned to the verified account's Workers origin.
These engineering choices do not approve publication, private processing or
retirement of existing builds.

R2 hourly copies do not close the post-copy deletion gap. The local restore tool
requires source-bound, writer-fenced current-ledger evidence and never reopens
an API. Total-source-loss recovery without that evidence remains blocked; a
zero-resurrection and high-availability guarantee has not been established.
Retention, offline key/token custody and the proposed reauthentication-on-restore
tradeoff remain unapproved policies in the
[backup guide](operations/CLOUDFLARE_BACKUPS.md). Hosted account/setup, notices,
cutover and Git permissions remain separate from local implementation.

## October 29 small-beta recovery limit

Anthony accepts the current recovery limit for the small beta: if the source
database is lost and deletions or revocations after the latest ledger copy cannot
be established, keep the old restored account/data state closed rather than
resurrect deleted data or revoked access. Old cloud data may remain unrecoverable;
this does not require the service to stay closed forever. A clean restart with
newly authenticated accounts and new writing remains possible in principle, but
needs a separately reviewed procedure. Automatic recovery from old phones is
unsupported; their retained copies do not establish the lost deletion history.

Independent per-deletion/revocation recording is the long-term direction and is
explicitly deferred for this beta, not implemented or proved by hourly copies.
Anthony and the implementation/release owner must reassess it **before paid
launch or expansion beyond the small beta, whichever comes first**. Future design
must cover app, maintenance and Auth/admin paths. Anthony accepts conservative
replay of a durably saved deletion intent even when the original database operation
appeared to fail; that is a future-design policy choice, not authorization to
change the current implementation or treat incomplete records as sufficient.

This decision settles only the beta ledger-gap disposition. Backup retention,
ordinary-write recovery point, recovery-time target and reauthentication-on-restore
remain separate proposals; hosted restore/copy/monitor evidence and independent
privacy/device gates are unchanged. No source reset, deployment or recovery action
is authorized by this decision.

## October 29 dedicated backup reader

Anthony approved a dedicated backup account using Supabase's supported
`BYPASSRLS` plus `pg_read_all_data` pattern. The account can read all project
tables, views and sequences, including Auth and database security catalogs;
limiting the export to `justgo`, `auth` and `drizzle` limits the job, not the
credential's authority. Metadata confirmed access to role password verifiers;
no verifier values or private application rows were retrieved during setup.

The contract is one inherited `pg_read_all_data` membership with SET
and ADMIN disabled, bounded connections/timeouts and no additional membership,
ownership, schema/database creation or exposed noncatalog SECURITY DEFINER
execution. Data-table mutations remain rejected except for the narrow staging
exception below. Read-only defaults are an accident safeguard; standard PUBLIC
session-setting and built-in function capabilities still exist.

Hosted verification found PUBLIC `DELETE` on `cron.job_run_details`; the reader
was set to `NOLOGIN` when the default guard rejected it. The table belongs to
`supabase_admin`, and a rollback-only probe confirmed that the available
`postgres` operator cannot revoke that owner's PUBLIC grant. No global PUBLIC ACL
change was made.

Anthony now accepts this extra scheduler-history DELETE capability for the small
beta and requests backup activation. The reviewed opt-in plan is
`allowCronJobRunDetailsDelete: true` in the exact approved backup-policy bytes and
digest, restricted to `staging`, project `kmcpcauaxlgpevkkenwd`, database `postgres`
and its matching accepted direct/session-pooler source. Absence or `false` keeps
the default rejection. Only DELETE on exactly `cron.job_run_details` is excepted;
other relation/column mutations, ownership, memberships and privileged functions
remain rejected. This is an accepted capability, not a request to delete history.
The reader has been re-enabled with LOGIN. Actual verified-TLS metadata checks
passed the opted-in guard and required-schema access probes using `LIMIT 0`;
no private rows were fetched. Scheduled backup activation and actual hosted
dump/restore evidence remain pending.

The authorized Supabase support request asking the provider to remove PUBLIC
DELETE was submitted. The support page confirmed "Support request sent" and a
ticket logged for JustGo; no ticket ID was displayed. Optional support diagnostic
access remained off. The provider response/removal is an open follow-up alongside
backups, not an activation prerequisite. Remove the exception once provider removal
is verified. This reader decision does not approve the other proposed retention,
alert-delivery or custody policies, or establish actual hosted Auth restore evidence.

## October 29 single backup health monitor

The implementation owner selected one free Sentry Cron monitor,
`justgo-staging-backup-health`, scheduled hourly at minute 23 UTC with a 20-minute
check-in margin and 20-minute maximum runtime. Account inspection showed three days
left on the trial and one Cron on the following Developer plan; the design does
not depend on trial-only extra monitors or a paid-plan change.

A successful hourly health check requires both the encrypted ledger upload and
trusted GitHub main-branch evidence that the actual database-copy job and copy step
succeeded for the required nightly slot. The database slot is 04:43 UTC with a
40-minute deadline, inclusive at 05:23. A missing database copy is normally caught
when that 05:23 ledger run completes, plus runtime/platform/notification delays;
this is not an alert-delivery SLA. A missing ledger run is detected by the Cron's
own missed-check-in logic. The workflow needs read-only `GITHUB_TOKEN` access to
Actions, and initial verification runs the database copy before the ledger copy.
Hosted check-ins, failure/missed-run notification delivery and scheduled copies
still require evidence. Retention, renewal and independent key custody proposals
are unchanged.

## October 30 seven-day staging backup retention

Anthony approved seven-day retention, seven-day protection and automatic expiry
for both `staging/database/` and `staging/ledger/` in `justgo-staging-backups`,
including saving both expiry rules at action time. API readback verified enabled
Age locks and Age object-expiry rules of 604800 seconds for each prefix. The
default incomplete-multipart abort rule is preserved and public domains remain
disabled. This supersedes the earlier proposed retention/lock status for staging.

Actual enforcement passed with two encrypted dummy canaries containing no user
data: parent-credential overwrite and DELETE both returned HTTP 409
`ObjectLockedByBucketPolicy`. HEAD reported `x-amz-expiration` of
`2026-11-06T13:22:01Z` for the database canary and `2026-11-06T13:22:37Z` for the
ledger canary. Both remain under lock until expiry. Actual asynchronous deletion
has not yet been observed; seven-day expiry is not an exact deletion-time promise.

The approved policy and SHA-256 are saved as `BACKUP_POLICY_JSON` and
`BACKUP_POLICY_SHA256` in the protected `database-backups` environment.
Protected-environment readback matched the exact policy bytes and digest.
`JUSTGO_BACKUPS_ENABLED` remains unset. This decision and evidence do not close
Git publication/merge permissions, privacy/DPA, actual app/Auth restore, alert
delivery, independent off-Mac key custody or credential-renewal gates.
