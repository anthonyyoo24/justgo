# Phase 08 settings and privacy handoff

**Date:** October 10, 2026\
**Status:** Settings/contact and Reduce Motion slices for owner review; legal drafts prepared and remaining Phase 08 controls open.\
**Branch:** codex/phase-08-settings-privacy, based on the merged Phase 07.5 baseline. Native billing remains preserved on codex/phase-07a-native-billing at 4d5c9f2.

## October 14 PR #22 review corrections

Anthony authorized fixing and pushing the two documentation findings assessed
against `a522fe6`. The [billing schedule comment](https://github.com/anthonyyoo24/justgo/pull/22#discussion_r4274919498)
and [remaining motion work comment](https://github.com/anthonyyoo24/justgo/pull/22#discussion_r4274919507)
are addressed by the following corrections:

- Keep early Apple enrollment, app identifiers, Expo/EAS project and signing
  preparation available for the free beta. Schedule Apple purchase-key generation,
  RevenueCat/store-credential connection, subscription-product creation and
  offering/paywall mapping after the free beta checkpoint, during Phase 07A and
  before its billing acceptance. Distinguish the Phase 09 free-beta build checks
  from the return to Phase 09 for paid submission after accepted 07A.
- Align the plan's decision table and PRD implementation order with that same
  sequence. Local billing-code preparation remains preserved; this documentation
  correction does not authorize external provider setup.
- Remove implemented Reduce Motion behavior from open design rows. Keep remaining
  Settings/privacy and haptics design work open, and distinguish Phase 09
  physical-device/VoiceOver/text-scaling acceptance from design decisions.
- Preserve the assessment's recommendation against a blanket 80% docstring target;
  no code, test-coverage floor or CI policy changes are included.

This follow-up also publishes the previously recorded hosted CI results for
`a522fe6`. Verification is limited to Markdown consistency, relative links,
formatting and diff checks; no code tests or UI checks are required for these
documentation-only changes. The legacy `docs/checks/check-plan.mjs` targets the
absent historical HTML companion rather than the authoritative Markdown plan,
so it is not an applicable check for this correction.

Verification: Prettier checks for all four changed Markdown files and
`git diff --check` **pass**. The new relative review-handoff link and its
heading anchor **pass** validation. Manual comparison of the plan and PRD
confirms the billing and motion boundaries agree. Fresh online Expo Doctor
passes **21/21** before the authorized push; its ignored log is
`.local/pr22-ci/review-pre-push-doctor.log`.

Changed-directory review covers `docs`, `docs/product` and `docs/handoffs`.
Their existing responsibility groups remain navigable and no new files or
folder moves are needed. The approved phase sequence and remaining native,
privacy and billing acceptance gates remain open.

## October 14 PR #22 CI repair

Anthony requested identifying and fixing [PR #22](https://github.com/anthonyyoo24/justgo/pull/22)'s
failed checks and preventing recurrence. The isolated `codex/pr22-ci-fixes`
worktree starts at the PR's exact `e146adc95dd67cf5efa0fb46c07cb24165711228`
head; ongoing Phase 08 source edits and other PR checkouts are preserved.

Both [push](https://github.com/anthonyyoo24/justgo/actions/runs/38616590568/job/116033131224)
and [pull-request](https://github.com/anthonyyoo24/justgo/actions/runs/38616610799/job/116033196409)
Foundation `checks` jobs failed for the same reasons:

- `npm run check` stopped at Expo Doctor's SDK dependency validation (20/21).
  Eight exact package pins were behind fresh online recommendations.
- `Upload coverage reports` ran under unconditional `always()` despite coverage
  being skipped and failed with no files under `coverage/`.
- Database tests, coverage collection, saved journeys and both exports were
  skipped; these logs do not establish failures in those checks. CodeRabbit was
  still pending when first inspected and is not the reported Actions failure.

| Package            | PR pin  | Updated pin |
| ------------------ | ------- | ----------- |
| expo               | 57.0.27 | 57.0.29     |
| expo-constants     | 57.0.21 | 57.0.22     |
| expo-crypto        | 57.0.3  | 57.0.4      |
| expo-dev-client    | 57.0.19 | 57.0.20     |
| expo-linking       | 57.0.12 | 57.0.13     |
| expo-router        | 57.0.25 | 57.0.27     |
| expo-splash-screen | 57.0.9  | 57.0.10     |
| jest-expo          | 57.0.5  | 57.0.6      |

The root lockfile is regenerated with these pins. Coverage collection now has
an explicit step ID; upload runs after collection succeeds or fails, while
skipped/unstarted/cancelled collection does not trigger upload. Missing reports
after a completed collection still fail (`if-no-files-found: error`), and all
coverage floors and dependency validation remain enabled.

`scripts/quality/ci-artifacts.test.mjs` reads the workflow's actual condition
and exercises success/failure/skipped/cancelled/unstarted outcomes. Against the
original workflow, four of six cases failed, including the observed skipped
coverage bug. After repair, all six pass. This local condition simulation and YAML
parse do not establish hosted Actions acceptance.

The clean-checkout check also exposed five-second timeouts in two existing
Progress reflection journeys. Their repeated whole-calendar queries are now
scoped to the open day sheet, and each already located Save control is reused
within its editor. Both full add/save/edit/save and add/save/clear/save sequences
and every assertion are retained, without increasing timeouts. The 19-case
Progress file and subsequent full 496-case mobile run pass. This changes test
query cost, not app behavior. Initial regex lint findings in the new tooling test
were corrected with standard space quantifiers.

Prevention: install and run `npm run check` in each exact split/stacked PR
candidate, carry SDK maintenance through reviewed stack integration, and run
`npm run doctor -w @justgo/mobile` with fresh online metadata immediately before
an authorized push. A fixed lockfile controls installation; Expo can publish new
SDK patch recommendations independently, so an old passing result can expire.
No scheduled task or Git hook is installed by this repair.

Verification:

- Fresh `npm ci`: **pass** in the isolated PR checkout. The new workflow regression
  uses only Node built-ins and tracked source; no ignored artifact is required.
- `npm run check`: **pass**, fresh online Expo Doctor **21/21**, contracts build,
  typechecks, lint, formatting, **186** tooling cases, **45** API unit cases,
  **496** mobile cases across **63** suites and **20** contract cases.
- `npm run db:migrate` and `npm run test:db`: **pass**, **48** integration cases
  plus the migration/restoration rehearsal against loopback `justgo_test`.
- `npm run test:coverage`: **pass**, all existing floors unchanged. Mobile
  **95.76% lines / 91.24% branches**, API **94.58% / 89.80%**, contracts **100% / 100%**.
  Includes **94** API unit/database/rehearsal cases, **496** mobile and **20** contract cases.
- `npm run export:web -w @justgo/mobile` and
  `npm run export:ios -w @justgo/mobile`: **pass**. Bundles do not establish native
  runtime or device acceptance.
- `npm run test:journey -- --grep 'self-device revocation'`: **pass**, one saved
  actual-app/API/database Settings → revocation → recovery journey, preserving
  reflection/Progress. The initially reused database on port 54329 stopped after
  coverage completed, causing a connection-refused startup failure. The rerun
  used an independently provisioned clean loopback `justgo_test` cluster on 54331
  with the same isolated roles and clean migrations; fixture cleanup completed.
  The complete journey suite was not rerun for this maintenance slice.
- Interactive Browser Use in the **in-app side panel**: **pass** for Settings,
  Reduce Motion on/off, preference persistence after reload, Account & recovery
  navigation and browser Back. The fixture's original preference was restored;
  no account was created. Browser warning/error logs were empty. Metro bound the
  smoke server to IPv6 localhost, so the first IPv4 visit was refused; the
  observed `localhost:8092` address worked. No security protection was bypassed.
- The saved journey and manual Metro server reported unavailable `simctl` under
  the existing Command Line Tools selection; browser checks passed. No native
  build/signing change, device test or simulator pass is claimed.
- Temporary Metro on 8092 and the separately created PostgreSQL instance on
  54331 were stopped after verification. Other checkout services were preserved.

Logs remain ignored under `.local/pr22-ci/`. Anthony explicitly authorized
pushing the fixes on October 14. The three commits (`9b76585`, `819a061`,
`a522fe6`) were pushed to the existing `phase8-01-settings-foundation` branch
after fresh online Expo Doctor passed **21/21** immediately before publication.
The [push run](https://github.com/anthonyyoo24/justgo/actions/runs/38623306723)
and [pull-request run](https://github.com/anthonyyoo24/justgo/actions/runs/38623313914)
both completed with **success**, inspected on October 14 for exact head
`a522fe64173835f75e0b7f859a83759e16b3c529`. Root checks (Doctor **21/21**, all
**496** mobile tests), database tests, migration rehearsal, unchanged coverage
floors, coverage upload, all **24 saved journeys**, journey upload and both
exports passed. Safe summary evidence is in `.local/pr22-ci/hosted-summary.log`.
CodeRabbit's current passing status explicitly says its review was skipped and
manual review is required; no fresh automated code review is claimed.
Native build/device acceptance for the SDK
patch changes remains separate owner/Phase 09 work. No new PR, merge,
deployment or native build was performed.

Changed-directory review covers the root, `docs`, `.github/workflows`,
`scripts/quality`, `docs/operations`, `docs/handoffs`, `apps/mobile` and
`apps/mobile/src/features/progress`. Existing responsibility groups remain
navigable; only one new quality regression file is added. No folder moves are
needed for this repair.

## Current authorized work

The owner accepted the legal sequence: data checklist, policy/terms drafts, review, then hosting. After that preparation, the owner explicitly authorized the Settings UI using the Paper F1 design and agreed Phase 08 scope, starting with layout and existing recovery/support actions. This handoff covers those local changes and the legal drafts. No public site, email delivery, App Store configuration or Git publication was performed.

Youngshin Yoo is the confirmed personal operator in Canada. The owner's proposed distribution is all available App Store countries and regions for ages 18 and older. The operator's province, final territorial availability, age-related implementation and required regional notices remain review decisions.

The owner subsequently accepted separate email-draft contact actions and added App Store rating plus Instagram, TikTok and Twitter/X rows. After reviewing the combined Help & about group, the owner requested Support directly above About: Support contains Get help and Suggest a feature, while About contains rating, socials and legal links. The owner confirmed the profiles and public App Store listing are not ready; those rows remain unavailable until public destinations are configured.

On October 10 Anthony authorized implementing the first remaining slice, Reduce Motion, while keeping implementation and focused verification together within Phase 08. Haptics remains a separate, explicitly open Phase 09 implementation/device-testing task.

## Documents prepared

- [Data inventory](../legal/DATA_INVENTORY.md): current data, purposes, recipients, retention proposals, provider status and App Privacy categories to assess.
- [Privacy Policy draft](../legal/PRIVACY_POLICY_DRAFT.md): plain-language user notice, with explicit review notes for unverified or undecided release behavior.
- [Terms of Use draft](../legal/TERMS_DRAFT.md): proposed service terms alongside Apple's standard EULA, including separate beta and paid-release wording.
- [Review and publication checklist](../legal/LEGAL_REVIEW.md): owner/phase for open decisions, regional and Apple guidance, and the sequence for publishing a public static site without changing protected API deployment settings.

The drafts distinguish uploaded product data from optional analytics, persistent account identifiers from anonymous data, and phone storage from cloud recovery. They make no fixed backup/deletion deadline or claim that all providers process only in Canada. PostHog/Sentry activation and paid billing are described as planned rather than running services.

## Evidence and limits

Reviewed the current identity, activity contracts/schema, telemetry stub, safe log serializers, foundation provider setup, Phase 07.5 handoff and Phase 07A sequencing. Checked primary Apple, Canadian OPC, European Commission, ICO and California resources plus Supabase backup guidance on October 9. Production vendor settings and worldwide legal sufficiency are not verified by document drafting.

Document verification passed: `npx prettier --check` for the four legal files, this handoff, handoff index, plan and PRD; 20 internal file/anchor links resolved; review notes and provider/implementation status were reconciled. `git diff --check` passed after the final document updates. Those document-only additions required no code tests or UI checks. The subsequently authorized UI slice has its separate evidence below.

## Settings UI and contact slice

[Paper F1 reference](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0/O23-0) was inspected through Paper MCP. JSX/computed styles confirm one raster image fill with no editable internal text or rows. Native reconstruction follows its cream surface, navy serif headings, white outlined groups, decorative line icons, inset dividers and centered title; measurements use existing app tokens and deliberate accessibility adaptations rather than claims of exact raster font/spacing metadata.

- `/settings` remains a secondary stack route reachable without paid access, without Home/Progress bottom tabs. Back returns to its originating screen; direct entry falls back to `/`.
- `app-support/settings/` owns layout, grouped rows and decorative icons. The route remains a thin screen export. The existing Account & recovery link opens the shared identity controller's Account / Recovery keys / Device transfer / Manage devices tools.
- Support and Feature requests open user-reviewed email drafts to `anthonyyoo24@gmail.com`, with distinct subjects and no body, attachments, history or account identifiers. The shared external-link control blocks duplicate taps while opening, restores the action after failure, displays approved toast copy and suppresses late presentation after unmount.
- The same support destination is connected to account recovery and expanded saving-recovery details. Native/web toast adapters show plain link-failure copy; covering sheets use the sheet toast channel.
- Preferences, data export/deletion and two analytics choices are visible but explicitly unavailable in this layout slice. No fake switches, consent persistence, deletion or export action is introduced. Reminders, Reset progress and inactive commercial controls are omitted. Optional analytics remain off under the existing stub.
- Privacy policy stays disabled until a valid public HTTPS destination is configured. Terms uses the existing Apple standard license fallback until the reviewed JustGO terms URL is supplied; its descriptive subtext was removed in the later owner refinement recorded below. No legal draft was published. App version comes from Expo config rather than the mockup's sample version.

Verification for this slice is recorded below. Earlier local app edits are included in the tested scope, not silently accepted as completed Phase 08 behavior.

### UI verification

- Focused mobile tests: **35 pass** across Settings route/navigation, configured and unavailable legal links, exact contact subjects/no private attachments, duplicate tap/retry/unmount handling, account and saving-recovery support, and native/web toast host wiring.
- `npm run check`: **pass**, fresh online Expo Doctor 21/21, contracts build, workspace/journey typechecks, lint, formatting, tooling/API/mobile/contracts tests. Mobile: **443 cases across 60 suites**.
- `npm run test:coverage`: **pass**, all existing global and critical floors unchanged. Mobile **95.07% lines / 90.71% branches**, API **94.58% / 89.8%**, contracts **100% / 100%**. The combined run includes the dedicated loopback database suites and migration rehearsal. Remaining Settings branches cover conditional presentation/version/developer shortcut paths; no new preference/data/consent behavior is claimed.
- `npm run test:journey -- --grep 'self-device revocation'`: **pass**, one saved actual-app/API/database journey through Settings → account tools → revocation → recovery preserving saved history. Fixture-owned account cleanup and service shutdown complete. The temporary Expo process reported unavailable `simctl` under the machine's default Command Line Tools path; the browser journey itself passed.
- Interactive Browser Use in the side panel: **pass** at **390 × 844** and **320 × 568** for upper/lower grouped layout, narrow-width wrapping/scrolling, unavailable controls, opening existing recovery, and the preview → Settings → Back return path. No browser console errors/warnings were observed. A separate attempt to open the feature-request draft was **blocked by the side-panel browser security policy**; no bypass or native alternative for that blocked mail action was attempted. Exact mail destinations, approved failure copy and retry/unmount behavior have automated evidence; actual mail opening remains a physical-phone check.
- Cold native bundle: Metro's iOS/Hermes entry returned **HTTP 200 / 10,874,469 bytes** after its cache was prepared. This proves bundling, not native UI behavior.
- Native simulator **visual evidence passes** for Settings rendering on the existing iPhone 17 / iOS 26.5 QA device: safe-area header, first groups, connected-account copy, grouped native rows and no bottom tabs were observed through the live side-panel mirror. The first client connection failed while a cold iOS bundle took about 218 seconds. Preparing the exact bundle, restarting the same simulator without erasing data and reopening the existing client produced the current Settings screen. A subsequent native screen capture confirms the Account & recovery tap reached the existing connected-account tools (Account / Recovery keys / Device transfer / Manage devices). The mirror lagged behind the actual screen and its input/device discovery was intermittent; a window-level Computer Use capture also reported no available window after the simulator restart. This limited rendering/recovery-entry evidence does not establish full native recovery, Keychain persistence, mail opening, large text or VoiceOver acceptance.
- XcodeBuildMCP could not locate `simctl` through the machine default tools path. Command-scoped `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` uses the installed Xcode without changing global configuration. No native rebuild, signing upgrade, app reinstall, data or Keychain erase was performed. Full native recovery flows, large text/VoiceOver and physical-device mail behavior remain open in Phase 08/09.
- Ignored evidence: `.local/phase-08/{check,coverage,recovery-journey}.log`, `settings-web.png`, `settings-ios.png`, `settings-recovery-ios.png` and native bundle; routine screenshots remain uncommitted.
- Manual review allocated **zero** new fixture accounts. It reused the existing nonproduction QA simulator/vault; no activity or recovery-key generation was performed. API/Metro and the scoped simulator mirror are retained for owner review; stop the mirror terminal so its UDID-scoped cleanup trap runs when review ends. These local fixture services are not the free TestFlight beta environment.
- Physical iPhone mail-draft opening, VoiceOver and large text remain release checks. Component/browser results do not establish native behavior.

### October 9 heading refinement

At Anthony's request, the Settings title and every section heading now use the existing `fontFamilies.editorial` Bodoni 72 bold treatment shared by the refined Success, Reflection and Progress headings. Sizes and line heights stay at 29/32 for the title and 23/28 for sections, with -0.5 and -0.25 tracking respectively. Paper MCP confirmed F1 remains a single raster fill; this family is a visual reconstruction rather than extracted source font metadata.

- Existing Settings behavior tests: **7 pass**. `npm run check`: **pass**, including online Expo Doctor **21/21** and mobile **443 tests / 60 suites**.
- `npm run test:coverage -w @justgo/mobile`: **pass**, **95.07% lines / 90.71% branches**. `npm run coverage:check`: **pass**, unchanged floors using the fresh mobile report and the prior verified API/contracts reports. No backend/shared behavior changed; database suites were not rerun for this typography refinement.
- Side-panel Browser Use: **pass**, upper and lower headings at **390 × 844** and **320 × 568**, with no heading overflow or browser console errors/warnings. The title's rendered width decreased from about **102.7px to 90.3px** at the same font size. Review verdict: clearer narrow serif hierarchy, preserved spacing/contrast, aligned groups and readable scrolling content without clipping. Temporary viewport overrides were reset.
- Existing iPhone 17 / iOS 26.5 simulator: **visual pass** for the updated Settings title and visible section headings after hot reload. No native build, signing change, reinstall or data erase. Physical-device large-text and VoiceOver acceptance remain open.
- Ignored evidence: `.local/phase-08/heading-refinement-{check,coverage}.log`, `settings-heading-{before,after}-web.png` and `settings-heading-after-ios.png`.

### October 9 Help & about and public destinations

This earlier review slice combined contact/information rows under Help & about: Get help, Suggest a feature, Rate on the App Store, Instagram, TikTok, Twitter / X, Privacy policy and Terms of use. The subsequent owner-requested split is recorded below. Contact actions retain distinct subjects, the same private inbox and no automatic attachments. Legal links retain the existing policy-unavailable state and identified Apple standard-license fallback.

Rating/social destinations come from `EXPO_PUBLIC_APP_STORE_ID`, `EXPO_PUBLIC_INSTAGRAM_URL`, `EXPO_PUBLIC_TIKTOK_URL` and `EXPO_PUBLIC_TWITTER_URL`. The numeric Apple ID is configured only after the public listing can accept reviews; it generates the direct Write a Review URL. This follows [Expo's explicit review-link guidance](https://docs.expo.dev/versions/v57.0.0/sdk/storereview/#ios) without a new dependency or discretionary in-app rating prompt. Legal/social links share the public HTTPS/credential validation in `lib/public-url.ts`. Unconfigured or invalid destinations stay disabled with Coming soon; configured opening failures use approved copy and permit retry.

- Focused Settings/community/legal/shared-link tests: **32 pass** across four suites. They cover four groups, unavailable rows, exact configured destinations with no account/activity data, rejected URL/store configuration, retry after each new link failure, and retained recovery/contact/legal behavior.
- `npm run check`: **pass**, online Expo Doctor **21/21**, types/lint/format/tooling/API/mobile/contracts checks; mobile **459 tests / 61 suites**.
- `npm run test:coverage -w @justgo/mobile`: **pass**, **95.09% lines / 90.78% branches**. `npm run coverage:check`: **pass**, unchanged global/critical floors with the fresh mobile report and prior verified API/contracts reports. Backend/public contracts and database behavior are unchanged; database suites were not rerun for this mobile slice.
- Browser Use in the side panel: **pass**, upper/lower layout at **390 × 844** and **320 × 568**, eight combined rows, disabled destinations, readable two-line rating label at the narrow width, scrolling/footer and no browser console warnings/errors. Temporary viewport overrides were reset and the Settings page retained for review.
- Native Computer Use on the existing iPhone 17 / iOS 26.5 QA simulator: **visual pass**, combined heading, all eight rows, outline icons, named controls and disabled states. The Simulator window was accessible during this check, after the earlier slice's intermittent failures. No native rebuild/signing/reinstall or data erase was required. Real mail, App Store/social destination opening and physical-iPhone/VoiceOver/large-text release checks remain open.
- Ignored evidence: `.local/phase-08/help-about-{check,coverage}.log`, `help-about-web.png` and `help-about-ios.png`.
- **Owner / Phase 09 setup:** Supply public profile URLs and the listing's numeric Apple ID once ready, then verify the actual destinations on a physical iPhone. These unavailable links do not establish release acceptance; this slice does not complete the other Phase 08 controls or legal publication.

### October 9 separate Support and About

At the owner's request, Settings now has five groups: Preferences, Account & data, Privacy, Support, and About. `SettingsInformationGroups` owns the two information/contact cards. Support sits directly above About and contains Get help and Suggest a feature, followed by the email privacy note. About contains rating, Instagram, TikTok, Twitter / X, Privacy policy and Terms of use. Existing destinations, unavailable states, email subjects, retry feedback, typography and navigation are preserved.

- Focused Settings/community/legal/shared-link tests: **33 pass** across four suites. The added regression verifies contact/information membership and note placement; the route test verifies heading order. The first grouping assertion scoped a React Native Text wrapper instead of the containing section; it was corrected to query the actual `SettingsGroup` and rerun successfully.
- `npm run check`: **pass**, fresh online Expo Doctor **21/21**, types/lint/format/tooling/API/mobile/contracts checks; mobile **460 tests / 61 suites**.
- `npm run test:coverage -w @justgo/mobile`: **pass**, **95.09% lines / 90.78% branches**. `npm run coverage:check`: **pass**, unchanged global/critical floors with the fresh mobile report and prior verified API/contracts reports. No backend/public-contract/database behavior changed; database and saved journey suites were not rerun for this presentation refinement.
- Interactive Browser Use in the side panel: **pass**, Support above About at **390 × 844** and **320 × 568**, separate cards and email note, wrapped labels, lower rows/footer and no console warnings/errors. Temporary viewport overrides were reset and Settings retained for review. This is separate from saved end-to-end evidence.
- Native Computer Use on the existing iPhone 17 / iOS 26.5 QA simulator: **visual pass**, separate headings/cards with the two contact controls and retained unavailable states. No native build, signing change, reinstall or data erase was needed. Physical-device mail/store/social opening, VoiceOver and large-text release acceptance remain open as previously recorded.
- Ignored evidence: `.local/phase-08/support-about-{check,coverage}.log`, `support-about-web.png` and `support-about-ios.png`.

### October 9 section descriptions removed

The owner requested removing the explanatory paragraphs below Account & data, Privacy and Support. Those three paragraphs and the now-unused section-note rendering/style are removed. All five headings and their rows remain, including recovery and Apple-license details within individual rows. The section gaps continue to use the existing spacing token. Contact destinations, privacy behavior and unavailable controls are unchanged.

- Focused Settings/community/legal/shared-link tests: **33 pass** across four suites. The route regression now asserts that all three paragraphs are absent while recovery/license row details remain; grouping, navigation, link configuration and failure/retry coverage still pass.
- `npm run check`: **pass**, fresh online Expo Doctor **21/21**, types/lint/format/tooling/API/mobile/contracts checks; mobile **460 tests / 61 suites**.
- `npm run test:coverage -w @justgo/mobile`: **pass**, **95.09% lines / 90.77% branches**. `npm run coverage:check`: **pass**, unchanged global/critical floors using the fresh mobile report and prior verified API/contracts reports.
- Interactive Browser Use in the side panel: **pass** at **390 × 844** and **320 × 568** for absent descriptions, consistent gaps between Account & data, Privacy and Support, retained row details and narrow-width wrapping. No console warnings/errors were observed; the viewport override was reset and Settings retained for review.
- This copy/layout refinement did not rerun native/device, database or saved journey checks. Earlier physical-device mail/store/social opening, VoiceOver and large-text acceptance remain open.
- Ignored evidence: `.local/phase-08/section-descriptions-{check,coverage}.log` and `section-descriptions-web.png`.

### October 9 row subtext and local commit review

The owner requested removing the Account & recovery and Terms of use subtext, then explicitly authorized appropriate local commits for all pending changes. Both rows now display only their labels. Account recovery still navigates to `/recovery`, and Terms retains its configured public URL or existing Apple standard-license fallback. The unused row-detail rendering/style and Settings screen's account-preview dependency are removed. The code and scope/verification documentation are grouped into separate local commits; no push, PR or merge was authorized or performed.

- Local code commit: `9d8065f` — `feat(mobile): refine Settings groups and community actions`. The separate documentation commit records the current scope, prior review slices and final evidence. Ignored screenshots/logs remain outside Git.
- Focused Settings/community/legal/shared-link tests: **33 pass** across four suites. The route regression asserts absence of both account-description variants and Apple-license subtext, along with the earlier section paragraphs. Recovery navigation, configured and fallback Terms destinations, unavailable ratings/socials, private contact payloads and link-opening failure/retry checks still pass.
- `npm run check`: **pass**, fresh online Expo Doctor **21/21**, types/lint/format/tooling/API/mobile/contracts checks; mobile **460 tests / 61 suites**.
- `npm run test:coverage -w @justgo/mobile`: **pass**, **95.09% lines / 90.75% branches**. `npm run coverage:check`: **pass**, unchanged global/critical floors using the fresh mobile report and prior verified API/contracts reports.
- Interactive Browser Use in the side panel: **pass** at **390 × 844** and **320 × 568** for both label-only rows, uniform row spacing, retained headings/actions, narrow-width wrapping and the footer. No console warnings/errors were observed; the viewport override was reset and Settings retained for review.
- Native/device, database and saved journey checks were not rerun for this final presentation refinement. Earlier physical-device mail/store/social opening, VoiceOver and large-text acceptance remain open. Native billing remains preserved on `codex/phase-07a-native-billing` at `4d5c9f2`.
- Ignored evidence: `.local/phase-08/settings-final-{check,coverage}.log`, `settings-final-account-web.png` and `settings-final-about-web.png`.

### October 10 challenge completion investigation

The owner reported a brief page flash after Completed on the iPhone simulator and
rejected the provisional overlay fix. Further recordings captured native mixed
frames and first-frame Success layout/artwork settling. The current iOS flow uses
one `/challenge` route with Success prepared beneath Active; Completed reveals it
in place. First/repeated final captures are clean. The [07.3 follow-up](phase-07-3-local-flow.md#october-10-native-completion-handoff-follow-up)
records final checks, diagnostic evidence and remaining owner/device acceptance.
Settings scope, preserved native billing and Git permissions remain unchanged.

### October 10 Accept and Completed verification

The owner subsequently reported Accept flicker. Native recordings reproduced an
accepted-card snapback from Home's focus-based deck key, then a separate mixed
native frame and late artwork. The current iOS flow preserves the exiting deck
and prepares an opaque Accept cover until destination layout/images and native
entry finish. The temporary cover mirrors saving warnings without duplicating
the destination toast host. Completed retains its in-place prepared Success view.
First/repeated final native recordings are clean; **471 mobile tests / 62 suites**,
the root check and unchanged coverage gate pass. The [Accept follow-up](phase-07-3-local-flow.md#october-10-accept-handoff-follow-up)
records failing-before regressions, final frame timestamps and verification limits.
This remains a local mobile fix, with owner acceptance and wider device gates open.

## October 10 haptics moved to Phase 09

Anthony requested keeping haptics implementation and its testing together in
Phase 09. Feedback, the saved Settings toggle, automated checks, physical-iPhone
acceptance and any corrections/retests are now one pre-beta Phase 09 task. Haptics
does not block Phase 08; the existing unavailable row remains unchanged. Reduce
motion remains Phase 08. The [plan](../IMPLEMENTATION_PLAN.md#phase-09) owns the
implementation scope and acceptance gate; Anthony owns physical-phone acceptance.
This is a documentation-only scheduling change, with no haptics implementation,
dependency/build change or Git publication.

Documentation verification: Prettier checks pass for the plan, tech stack, this
handoff and the index; updated link/section targets resolve and `git diff --check`
passes. This scheduling change requires no application tests or UI checks.

## October 10 Reduce Motion implementation

Settings now replaces the unavailable Reduce motion row with a working native
switch. One boolean is saved in installation-level AsyncStorage under
`justgo:reduce-motion:v1`. It survives relaunch, is available without paid access
and remains independent of accounts, recovery and journal storage. It is not
uploaded or synchronized. The data inventory and policy draft now describe this
actual local behavior; no legal document was published.

`platform/MotionPreferencesProvider` combines the saved choice with React
Native's accessibility query, live changes and foreground refresh. Phone-level
Reduce Motion always wins: Settings shows the enabled, unavailable switch with
“Enabled by your phone’s accessibility setting.” Initial unresolved reads keep
motion reduced and disable input so late hydration cannot replace a newer choice.
Failed saves preserve the earlier choice and expose a retryable message. Failed
system queries keep motion reduced until an event or foreground read succeeds.
Subscriptions, stale reads and delayed saves are fenced on cleanup.

The root wraps app providers and toast hosts with this shared preference. Cards,
Progress shimmer, day-sheet slides, reflection-panel motion and native/web toast
entry/exit consume its effective flag. Reduced motion settles movement directly
without blocking Skip/Accept or sheet/reflection actions. Enabling it during a
card exit resolves the canceled animation wait; enabling it during sheet opening
or closing settles the sheet exactly once. `useDaySheetMotion` owns this animation
lifecycle separately from paging/reflection UI and rejects late close callbacks
after unmount. Existing in-place Completed → Success and prepared Accept cover
behavior is preserved; fade-only dialogs and native loading controls remain.

### Motion verification

- Focused tests: **114 pass across five suites** for motion preferences, cards,
  day sheets and actual Progress composition. Coverage includes storage validation,
  slow reads, both persisted choices, live system priority, overlapping/stale
  foreground reads, save failures/retry, duplicate input, cleanup, canceled card
  exits, swipe/cancel gestures and interrupted/late sheet callbacks.
- Browser review exposed an existing deprecated `pointerEvents` prop in the
  reflection panel. Its style now owns the same open/closed input isolation;
  the regression checks both states. The affected panel/day-sheet/Progress
  suites pass **38 cases**, and fresh browser reload/expansion produces no new
  console warnings or errors.
- Early lint feedback caught synchronous effect resets and a shared-directory
  test importing feature/app-support code. The adapter is now stable for the
  provider lifetime, unnecessary resets are removed, and integration tests live
  beside the Settings owner. Gesture mocks now forward callback arguments. No
  lint or coverage requirement was relaxed.
- One later full run hit the existing five-second timeout in Progress's
  feeling-preserving text-clear test. The unchanged 19-case Progress suite then
  passed in isolation, including that case in about two seconds. The final full
  run and coverage results are recorded below; no assertion or timeout was
  weakened.
- Final `npm run check`: **pass**, fresh online Expo Doctor **21/21**, contracts
  build, workspace/journey typechecks, lint, formatting, tooling/API/mobile/
  contracts tests. Mobile: **496 cases across 63 suites**.
- `npm run test:coverage -w @justgo/mobile`: **pass**, **95.76% lines / 91.24%
  branches**. `npm run coverage:check`: **pass**, unchanged all-source/critical
  floors using fresh mobile and prior verified API/contracts reports. The new
  provider/shared flag and switch have 100% line coverage. Important preference
  failures and animation interruption branches have focused behavioral evidence.
- Browser Use in the in-app side panel: **pass** for Settings at **390 × 844**
  and **320 × 568**, keyboard switching, both choices after reload, preview card
  advancement, day-sheet open/close and reflection expansion/hiding with normal
  and reduced motion. The pointer-events warning was reproduced and fixed;
  fresh final reload/panel review has no new warnings or errors. Metro's existing
  live watcher served the source, viewport overrides were reset, and Settings
  was retained for review. This walkthrough is separate from saved end-to-end
  evidence; browser system-media override was not tested interactively.
- Native Computer Use on the existing iPhone 17 / iOS 26.5 QA simulator verifies
  the functional switch, persistence after terminate/launch, and phone-level
  priority with the app preference off. Foregrounding after system Reduce Motion
  changes shows the explanatory disabled switch; restoring the system setting
  returns the app's saved off choice and usable control. The phone setting was
  restored to its original off value. No native rebuild, signing change,
  reinstall or account/Keychain erase occurred.
- Native synthetic preview: **pass** for Skip advancing the card with the
  preference enabled, Progress/day-sheet opening, saved reflection expansion/
  hiding and sheet closure. App and system preferences were returned to off;
  Settings remains open for review. Coordinate-based Computer Use briefly
  reported no available window; reconnecting and using the observed AX elements
  completed the walkthrough. No desktop screen recorder was used.
- XcodeBuildMCP's default `simctl` discovery remains unavailable under Command
  Line Tools. Command-scoped `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`
  uses the installed Xcode for the existing simulator without changing global
  configuration. Browser/component evidence does not establish physical-phone
  behavior.
- Manual review uses existing local QA and synthetic preview content, with zero
  new fixture accounts or recovery secrets. Backend, public contracts and
  database behavior are unchanged; database and saved journey suites are not
  rerun for this mobile-only slice. Physical-iPhone, VoiceOver and large-text
  checks remain owned by Anthony in Phase 09 before the beta. All wider prior
  recovery/device/release gates remain open. No Git publication was performed.
- Ignored evidence: `.local/phase-08/motion-{focused,progress-regression,
panel-regression,check,coverage,coverage-gate}.log`, the earlier timeout log,
  `motion-settings-web.jpg`, `motion-ios-system.png` and
  `motion-ios-reflection.png`. No screenshots or recordings are committed.
- Final documentation checks: Prettier passes, **19** added/updated internal
  links resolve, and `git diff --check` passes. Plan, product/architecture
  guidance, local-data inventory and handoff index match the implemented slice
  and retain all open acceptance/deferral records.

## Open Phase 08 work

All combined phase acceptance boxes remain open. Reduce Motion implementation and local verification are recorded above; physical-device accessibility checks remain Phase 09 work. Authenticated export/deletion, credential/cache/vendor cleanup, both analytics choices and event forwarding, redaction/dashboards, verified contact/legal links and relevant device evidence still need implementation or verification. Haptics implementation and acceptance are explicitly scheduled together in Phase 09 before the free beta. Reminders remain deferred beyond the first release; Tminus/Lance remain excluded. Feature suggestions reuse Support's private email destination with a distinct subject and no automatic private attachments.

Before publication, resolve retention and backup behavior, provider configuration, operator/contact and regional requirements, individual-versus-legal-entity App Review eligibility, age treatment and final Terms/EULA compatibility. Review the concrete policy before creating and publishing the public site. Resume commercial activation after the free beta and reconcile the policy for the paid build.
