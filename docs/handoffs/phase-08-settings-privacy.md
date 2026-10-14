# Phase 08 settings and privacy handoff

**Date:** October 12, 2026\
**Status:** Settings/contact, account/recovery UI, Reduce Motion and direct data export slices for owner review; legal drafts prepared and remaining Phase 08 controls open.\
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

`platform/motion/MotionPreferencesProvider` combines the saved choice with React
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

## October 10 data export implementation

Anthony authorized step 2 and selected a ZIP with CSV and JSON. The initial
slice opened a separate Export my data screen, available without paid access;
the October 11 follow-up below replaces it with a direct Settings action.
Export is explicit, blocks repeated taps while preparing/sharing and leaves
existing data unchanged. The original screen explained the private contents,
internet requirement and user-selected save destination. Back navigation,
account changes and route blur cancel preparation; retry, unreadable local
storage, cancellation and successful delivery have distinct feedback.

`GET /v1/account/export` authenticates every page using the existing session
transaction and owner policy. Strict shared contracts/OpenAPI reject unknown
input or response fields. The existing `(user_id,id)` primary key supports
50-attempt pages across all history, including historical timestamps, challenge
details, submitted feelings and reflection text. Account creation and registered
device metadata are included; credentials, session tokens, recovery keys and
request diagnostics are excluded. The route requires identity only and has no
entitlement check. The upload allowlist explicitly includes the new contract.

The Settings coordinator captures pending/rejected local records before reading
online pages. A challenge with an unuploaded edit retains both versions, labeled
`cloud`, `pending_upload` or `needs_attention`; exporting does not discard writing
or acknowledge operations. Invalid pages, ownership changes, cancellation and a
failed later page prevent file delivery. Another device's changes can appear
between pages; README and timestamps describe the read interval rather than
promise an atomic cross-device snapshot. Only saved/submitted content is included,
not unsaved text or challenge starts/give-ups that the product does not persist.

The archive contains `activity.csv`, `data.json` and `README.txt`. CSV includes
UTF-8 BOM, quoted fields and spreadsheet-formula protection; JSON preserves exact
Unicode, quotes and newlines. The effective Reduce Motion preference from this
installation is included. Pinned `fflate@0.8.2` creates stored ZIP entries without
native compression modules. `expo-file-system@57.0.7`, already present in the
installed development app, is now a direct dependency. iOS writes to a private
cache folder and opens the native share sheet, cleaning up after success,
dismissal or failure. A process interruption can leave a temporary file until
the next export clears the folder. The web adapter downloads a ZIP and removes
its temporary anchor/object URL. Android file sharing remains outside the first
iOS release; no rebuild, signing change or external file upload was performed.

### Export verification

- Focused mobile checks: **47 cases across five suites pass**, covering all-page
  reads, cloud/local copies, exact text and CSV escaping, rejected changes,
  unreadable hydration, failure after a successful page, invalid/cyclic pages,
  ownership and late-response fences, same-account backgrounding, repeated taps,
  retry, still-mounted route blur, account change, native cleanup and web URL
  cleanup. These adapter tests do not establish native file-provider behavior.
- Real PostgreSQL export integration: **four cases pass** for 51 rows split
  50 + 1, historical precision/legacy attribution, exact feelings/text, owner
  isolation, empty history, safe device metadata, invalid queries and
  expired/revoked/retired identities. Full `npm run test:db`: **52 cases across
  six suites plus the migration/restoration rehearsal pass**.
- The first database run found raw timestamps could be strings; normalization
  now handles both strings and `Date` values. The first full check found the new
  contract missing from the deploy allowlist; the explicit allowlist entry fixes
  it. Lint/format feedback was fixed without suppressing warnings or weakening
  checks.
- `npm run check`: **pass**, including fresh online Expo Doctor, contract build,
  workspace/journey typechecks, lint, formatting and architecture/API/mobile/
  contract tests. Mobile: **529 cases / 67 suites**; contracts: **23 / 9**.
- Fresh root `npm run test:coverage`: **pass** for every workspace and unchanged
  all-source/critical floors. Mobile: **95.89% lines / 91.25% branches**; API:
  **94.75% / 90.44%**; contracts: **100% / 100%**. Export service/routes and
  local snapshot have 100% line/branch coverage. Archive collection has 100%
  lines and 95.45% branches; UI has 97.43% lines and 91.89% branches. Native
  adapter has all lines covered; its uncovered folder-existence branches do not
  replace the tested write/share/cancellation/ownership cleanup behaviors.
- Saved app/API/database journeys: `npm run test:journey --
e2e/data-export.spec.ts` **passes both cases**. The downloaded archive contains
  all 51 historical online attempts plus a pending local reflection, with exact
  text and spreadsheet protection. The second case fails the export network
  read and downloads after an explicit retry. Database assertions verify export
  added no activity rows; the isolated server registry cleans accounts created by
  this run. Earlier saved suites were not rerun for this additive slice. This
  local result does not establish hosted CI or native platform acceptance.
- `npm run export:web -w @justgo/mobile` and `npm run export:ios -w
@justgo/mobile -- --max-workers 1`: **pass**. The export route and ZIP library
  resolve in both production bundles. Bundling is separate from actual delivery,
  installed app behavior and physical-device acceptance.
- Browser Use in the in-app side panel: an actual ZIP download was unzipped and
  its three files, exact synthetic reflection, CSV formula protection and
  credential exclusion verified. The export screen fits **390 × 844** and
  **320 × 568**, exposes honest missing-account feedback and returns to Settings.
  The viewport override was reset. The stale fixture server initially returned
  NOT_FOUND; restarting this workspace's isolated fixture API with current code
  resolved the environment mismatch. No production server or bypass was used.
- Native Computer Use on the existing iPhone 17 / iOS 26.5 QA simulator reached
  the actual ZIP share sheet and Save to Files picker. Save completion,
  cancellation and real file-provider cleanup are **not yet native acceptance
  evidence**. Anthony requested a five-minute pause while another task used the
  simulator; that pause was honored. The other task's Progress UI was then
  visible, and its Metro/API processes were left alone. This observation did
  not verify its server connection; the reconnection follow-up below corrects
  that gap. No physical-iPhone pass is claimed.
  Phase 09 still owns physical file delivery, VoiceOver and large-text checks
  before beta, alongside the wider recovery/storage/staging gates.
- The one manually created browser account contained only disposable test text;
  its exact UUID was read from this task's ZIP and removed from loopback
  `justgo_test` after verification. No native account or other task's records
  were deleted. Diagnostic ZIP/screenshot/logs stay under ignored
  `.local/phase-08/`; no private journal content, credentials or recordings are
  committed. A Simulator shortcut briefly selected screen capture during native
  navigation; it was stopped and its control confirmed inactive.
- Plan, app-shell boundaries, data inventory, policy draft, testing guidance and
  handoff index describe the implemented slice and preserve remaining gates.
  No policy was published and no Git push, PR or merge was performed.
- Final Prettier and `git diff --check`: **pass**; all four added internal links
  resolve, including this implementation section. The browser fixture API and
  live Metro preview are restored on their original 3000/8081 ports; the other
  task's 3003/8083 processes were not stopped or edited.

### Simulator connection follow-up

Anthony reported a simulator issue after the export handoff. Direct inspection
found the development client still connected to `http://127.0.0.1:8081`, with
“Could not connect to the server” over cached Progress content. The export journey
checks had restarted this preview server; restoring the process had not restored
the client connection or the other task's original server selection.

Both preview servers responded as running. The untouched 8083 process belongs to
the `day-sheet-performance` worktree. In the development launcher's Recently
opened list, selecting `http://127.0.0.1:8083` restored the app. Native Home and
Progress loaded normally; the developer menu explicitly confirmed that URL, then
was closed. Progress still displayed the existing local QA totals. No app data,
Keychain, simulator configuration or server was erased/rebuilt/restarted in this
follow-up. The simulator was left on Progress for the other task. Ignored proof:
`.local/phase-08/simulator-reconnected.png`.

This was an environment reconnection, with no application-code change. Native
inspection and final document formatting/diff checks are the applicable evidence;
the earlier export test results and open file-delivery gates remain unchanged.

### Owner preview switch to the export implementation

Anthony then explicitly requested running these changes in the simulator for
manual testing while preserving the other worktree. The development menu
confirmed the initial connection was `http://127.0.0.1:8083`. Its launcher still
listed that preview and this workspace's `http://localhost:8081`. Selecting 8081
loaded the Phase 08 app from the existing live Metro server and fixture API on 3000. Settings exposed Export my data as a link, and opening it displayed the
enabled Export ZIP action. The simulator was left on that screen for Anthony;
no export was sent or save destination chosen during this setup.

The other worktree's source and existing 8083 server were untouched; its preview
remains in the launcher's Recently opened list for switching back. No branch
merge, native rebuild, reinstall, signing change or account erase was needed.
The floating development control was moved away from the export heading.
Ignored proof: `.local/phase-08/export-ios-ready.png`. This launch/navigation
check does not close the outstanding native save/cancel/cleanup acceptance gates.

## October 11 physical-phone setup

At Anthony's request, the agent inspected Apple Developer and the existing Expo project in the Codex side panel, plus EAS CLI read-only metadata. Active individual Apple membership, the existing `com.anthonyyoo.justgo` identifier and the matching EAS development variable were verified. The setup notes previously marked these as pending; [APPLE_SETUP.md](../operations/APPLE_SETUP.md) now records current evidence and the first-phone checklist. No replacement identifier or Expo project was created.

The Mac detected Anthony's iPhone 15 Pro / iOS 26.6.2, initially unpaired. Anthony explicitly authorized submitting the phone's device name and UDID to Apple/Expo for JustGO testing. The Apple side-panel registration reached **Registration Complete**. The UDID stays out of committed documentation; ignored discovery data and `phone-registration-complete.png` record local evidence. EAS has only simulator builds and no Apple team/device registration for this Expo account yet. `eas device:create` reached Apple's password prompt; it was cancelled without requesting a password in chat. Anthony must authenticate privately in his terminal and import the already registered phone using Developer Portal.

Physical signing/build, Developer Mode, phone installation and the HTTPS test API are still open. There is no `EXPO_PUBLIC_API_URL` in the EAS development environment. The current loopback fixture cannot be exposed as a phone backend; a reviewed test API and tester-access path are necessary. No signing credential, API deployment, build upload, Git publication or physical-phone acceptance occurred. This is setup evidence, not a change to the previously recorded Phase 08/09 feature sequencing.

### Physical development build follow-up

Anthony completed Apple authentication privately in his terminal and imported the already registered iPhone into the existing Expo team. EAS CLI verified that registration. The agent reused that session, selected the existing phone and let EAS generate an Apple distribution certificate and ad hoc provisioning profile; no existing signing credential was removed. Signing secrets remain in provider-managed credential storage and were not printed or committed.

Fresh `npm run check` **passed**, including online Expo Doctor and the existing **529 mobile tests / 67 suites**. `eas build:inspect --platform ios --profile development --stage archive` verified the upload contains the current export implementation, custom Keychain module and required workspace dependencies, excluding private environment files, local test data, generated native projects and signing credentials. The completed source upload was 18.2 MB. Logs and archive inspection remain under ignored `.local/phase-08/`.

EAS build [1500d7ee-c49a-4047-b88a-278eccdc21bc](https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/1500d7ee-c49a-4047-b88a-278eccdc21bc) used the physical `development` profile, `com.anthonyyoo.justgo`, version 0.1.0 (1), and **finished successfully October 11 at 14:25:51 UTC**. Both CLI status and the side-panel Succeeded/IPA/Install controls confirm the result. Its source includes the uncommitted export changes despite the dashboard displaying HEAD `e146adc*`. Compilation ran on Expo, not the 8 GB Mac. The installation QR dialog was opened for Anthony; ignored proof is `phone-build-install.png`. Phone installation/Developer Mode and real device acceptance are still pending. A subsequent USB discovery confirmed the iPhone is now paired; this does not establish app launch or Developer Mode.

Read-only backend inventory found the existing Vercel preview is still the Phase 02 API. The existing Canadian Supabase `JustGo` project is on the free organization plan and was paused. Reactivation reached `ACTIVE_HEALTHY`; no migration or account-data change occurred. Metadata verified four migrations (0000–0003), four accounts and only identity tables, with no product activity/reflection tables. The current app needs the canonical API/schema and the planned server-authorized free tester access before full phone testing. [The scoped backend preparation](../operations/APPLE_SETUP.md#hosted-test-backend-prerequisite) preserves those identities, requires backup/cutover review and an approved reachable route, and keeps deployment protection and real ownership boundaries. The loopback fixture was not exposed, no entitlement bypass or API deployment was created, and no Git publication occurred. A live API address can be supplied through Metro without rebuilding this compatible native client.

Anthony subsequently reported successful installation and opening to the development launcher. Local IPA inspection confirms the expected bundle ID/team/version, the included development launcher and a provisioning profile containing the connected iPhone. A separate LAN Metro session runs on port 8084 with one worker and no API URL while hosted setup is pending; no simulator server was restarted. Sending its URL to the phone using `devicectl` was rejected with **Developer Mode is disabled**. Anthony was given the phone-side Developer Mode/restart steps. Live bundle loading, physical Settings/export behavior and all wider device gates remain open. This is owner-reported installation and tool-observed setup evidence, not a physical feature pass.

After reactivation, authenticated `vercel curl` checks of the existing protected preview's `/health` and `/ready` returned healthy/ready JSON. This confirms the older API can reach its existing database; it does not verify the newer API/schema, mobile reachability or free tester access. Final document formatting and `git diff --check` passed. The IPA, provisioning-profile inspection, full build metadata and screenshot are confirmed ignored by Git.

After Anthony enabled Developer Mode and restarted, a fresh `devicectl device info details` confirmed **enabled**, and opening JustGO with the LAN development link succeeded. The earlier list-devices response briefly retained stale disabled metadata. Anthony reported the development launcher could not load the project, with the internet connection appearing offline. Metro remains listening on 8084 and serves its status and SDK 57 iOS manifest on the Mac; there is no observed phone bundle request. IPA inspection confirms the local-network usage notice, Bonjour discovery service and local-network transport allowance are already present. Anthony was asked to enable the phone's JustGO Local Network permission, check the same Wi-Fi and retry. App bundle loading and physical feature acceptance remain unresolved; no rebuild, network-protection change or public tunnel was made for this connection diagnosis.

### Connected phone and approved server preparation

Anthony enabled/retried Local Network on the same Wi-Fi; Metro received a real iOS bundle request and he confirmed Settings opened. The exact cause of the earlier offline error was not isolated. He explicitly approved bringing the hosted test API/schema and approved-account free access forward from Phase 09. The [server handoff](phase-09-test-server.md) records its implementation, protected backup/restoration, unchanged migrations through 0013, preserved identity history, old-writer credential fencing, stable HTTPS application-staging address and passing checks. Preview protection was preserved; no loopback fixture or public bypass was deployed.

The phone's separate Metro session on 8084 now supplies the current API URL. A real account connected, and Anthony confirmed its displayed reference before a private 30-day grant was added. The access check initially rejected a verified response because its server timestamp was 25–46 ms ahead of the phone clock. The [clock follow-up](phase-09-test-server.md#phone-clock-and-real-home-follow-up) records bounded clock alignment, expiry/freshness regressions, fresh root checks and browser verification. Anthony then confirmed that real Home shows challenge cards and Home → Settings → Back returns to Home. The original deep-linked Settings history and developer preview are separate from this confirmed normal route. The existing physical development binary was reused; no additional signing/build or Git publication occurred. Phase 08 export/support/motion and the wider physical acceptance gates remain open.

## Open Phase 08 work

All combined phase acceptance boxes remain open. Reduce Motion and authenticated export implementation/local verification are recorded above; physical-device accessibility and file delivery checks remain Phase 09 work. Confirmed deletion, credential/cache/vendor cleanup, both analytics choices and event forwarding, redaction/dashboards, verified contact/legal links and relevant device evidence still need implementation or verification. Haptics implementation and acceptance are explicitly scheduled together in Phase 09 before the free beta. Reminders remain deferred beyond the first release; Tminus/Lance remain excluded. Feature suggestions reuse Support's private email destination with a distinct subject and no automatic private attachments.

Before publication, resolve retention and backup behavior, provider configuration, operator/contact and regional requirements, individual-versus-legal-entity App Review eligibility, age treatment and final Terms/EULA compatibility. Review the concrete policy before creating and publishing the public site. Resume commercial activation after the free beta and reconcile the policy for the paid build.

## October 11 folder organization

Anthony approved the five Settings/platform subfolders and saving the existing
feature work before moving files. Four local commits preserve the baseline:
`238f6e3` (CSV/JSON ZIP export), `1eb95af` (approved staging test access),
`fee2a29` (bounded phone/server clock alignment), and `360e348` (shared progress
and physical-phone/server handoffs). No push, PR or merge was performed.

The separate organization slice moves 19 existing files: four into
`app-support/settings/export`, five into `app-support/settings/information`,
four into `platform/export`, four into `platform/toast`, and two into
`platform/motion`. Settings retains 15 files total and platform retains 17.
Native/web pairs and their tests stay together. Imports, route re-exports, Jest
mocks and current architecture references follow their owners. Coverage discovery
and critical thresholds remain unchanged. No dependencies, route URLs, API
contracts, stored records or product behavior changed in this slice.

An initial import-normalization attempt altered the ambiguous sibling
`../calendar` reference; its original path was restored. Formatting also caught
five longer import/mock declarations; these were formatted before the final
checks. No checks or assertions were weakened.

Verification:

- `npm run check`: passed; fresh Expo Doctor 21/21, architecture, contracts build,
  all TypeScript checks, lint, formatting, 54 API unit tests, 535 mobile tests in
  67 suites, and 24 contract tests.
- `npm run test:coverage`: passed, including real loopback database integration
  tests and migration/restoration rehearsal. All existing coverage floors pass;
  mobile lines 95.90%, branches 91.28%.
- Side-panel browser: a fresh Settings render showed the Preferences, Account &
  data, Privacy, Support and About sections. Settings → Export → Account &
  recovery → disposable local account → Export ZIP downloaded a usable archive;
  inspection found `activity.csv`, `data.json` and `README.txt`, no top-level
  credential/diagnostic fields, and the expected empty activity. Returning to
  Settings worked. This used only localhost API/database fixtures. Ignored
  evidence: `.local/phase-08/folder-export-browser.png`.
- Cold web and iOS exports passed with cleared caches and one Metro worker,
  using ignored output directories. These confirm bundle resolution, not native
  UI behavior. The phone Metro server remains on 8084. Its original background
  command has closed stdin, so its keyboard reload shortcut could not be sent;
  CoreDevice also reports the phone disconnected. Anthony should reload the
  existing installed development app when connected again to clear old module
  paths. No phone data, installation or signing configuration was reset.

Physical export delivery, support drafts, motion/system accessibility, transition
frames and wider native/beta gates remain open as recorded above. This cleanup
neither closes Phase 08 nor accepts Phase 09.

### Phone reload follow-up after folder moves

Anthony reported an error while reloading the installed phone app. The owned
8084 server log reproduced `Got unexpected undefined` from Metro's
`Graph._recursivelyCommitModule` during an incremental iOS bundle. The separate
cold exports had passed, but they had not rebuilt this still-running server's
old dependency graph. Restarting that server with `--clear` resolved the observed
bundling failure; no application code, credentials, data or installed binary was
changed. The recurring folder-move guidance in `AGENTS.md` now requires that
server restart before asking the owner to reload.

Only the verified 8084 Metro process was stopped. Its replacement uses the same
LAN address, one worker, existing public staging API URL and bundle identifier.
A scoped Xcode developer path avoids the earlier CommandLineTools/simctl warning.
A recorded terminal session keeps keyboard reload available. The separate browser
and local API servers were preserved.

The running replacement server served its iOS launch bundle with HTTP 200
(11,086,791 bytes), then served the same bundle again with HTTP 200. Its fresh
build logged 2,196 modules without the previous graph error. Ignored diagnostic
artifacts are under `.local/phase-08/phone-folder-restart*`. These are development
server checks, not physical UI evidence. Anthony was asked to tap Reload/Retry;
Anthony confirmed that the installed phone app opens normally after the restart. This closes the folder-move reload follow-up with owner-reported physical-device evidence; the other feature/device acceptance gates remain open.

## October 11 direct export from Settings

Anthony approved removing the separate export page and its explanatory copy.
Settings now starts export on one tap: Export my data → Creating export… → the
existing iOS share sheet or browser ZIP download. The later feedback refinement
below makes share-sheet dismissal quiet. Inline feedback handles successful
delivery, unreadable storage and retryable failures. The row is
disabled until preparation/sharing ends. A disconnected account opens recovery;
legacy `/export-data` links redirect to Settings.

`SettingsExportRow` replaces `ExportDataScreen` within the existing export owner.
Account-change, focus-loss, duplicate-tap and temporary-file protections are
preserved. API contracts, archive contents, stored records and dependencies are
unchanged. Account/recovery UX research was explicitly moved to a separate local
project conversation; this slice does not redesign that screen. No native
rebuild, installation, signing change, Git publication or merge occurred.

Verification:

- `npm run check`: passed, including fresh online Expo Doctor, typechecks, lint,
  formatting and all workspace/architecture tests; mobile has **536 passing
  tests in 67 suites**. Component regressions cover the direct action, busy state,
  duplicate taps, results, failures/retry, account isolation, focus cancellation,
  disconnected recovery and the compatibility redirect.
- `npm run test:coverage`: passed all existing floors, including loopback
  database integration tests. Mobile lines/branches **95.91% / 91.29%**, API
  **95.01% / 90.61%**, contracts **100% / 100%**.
- `npm run test:journey -- e2e/data-export.spec.ts`: **2/2 passed** against the
  real app/API/disposable database. The first verifies 51 historical cloud rows,
  a pending device reflection and ZIP/CSV correctness while remaining on
  `/settings`; the second verifies explicit retry after a network failure.
  The command's default Xcode tools path produced its existing `simctl` warning;
  these are browser journeys, and both completed successfully.
- Cold web and iOS exports passed with `--clear --max-workers 1` and ignored
  output folders. Side-panel verification on localhost independently confirmed
  disconnected export → recovery, disposable account creation, return to
  Settings, and direct ZIP download without an export page. Archive inspection
  found `README.txt`, `activity.csv` and `data.json`, the expected empty history
  and no top-level credential/diagnostic fields. Proof and the disposable ZIP
  are under `.local/phase-08/direct-export-browser*`.
- Both owned live Metro previews were refreshed with cleared caches. The phone
  retains port 8084, the same staging API and installed development binary. The
  fresh iOS launch bundle returned HTTP 200 (11,086,020 bytes; 2,196 modules).
  Anthony reloaded the app and **confirmed that tapping Settings → Export my
  data opens the share sheet directly without a separate page**. This is
  owner-reported physical UI evidence; Save to Files/email delivery, cancellation,
  accessibility and native cleanup remain open Phase 09 checks.

After implementation, the full contents of every changed directory were
reviewed: Settings, its export owner, route wiring, e2e, and the touched docs
directories. Settings retains six direct files and export four, with tests beside
their owner. Routes remain navigation-only; the existing e2e/support and docs
responsibility groups remain usable. No additional folder moves are needed.
The `AGENTS.md` organization rule was preserved separately during implementation
and saved in local commit `501e048` at Anthony's request.

### Share sheet dismissal and error feedback

Anthony reported that dismissing the share sheet unnecessarily showed an export
cancellation message. Dismissal now resets the row quietly, with no message or
toast, and permits another export. Actual preparation/sharing failures remain
in red inline text as **“Couldn’t export your data. Please try again.”** until retry or leaving
Settings; unreadable journal storage retains its specific recovery guidance.
Starting again clears the previous feedback, so dismissing after a failed attempt
does not bring the old error back. A persistent inline error was chosen so users
can read it and retry by tapping Export my data.

Verification:

- Focused row/platform tests: **17/17 passed**. Regressions cover quiet dismissal,
  re-exporting and clearing an earlier failure on dismissal.
- Fresh `npm run check`: passed, including online Expo Doctor **21/21** and
  **537 mobile tests / 67 suites**.
- Fresh mobile coverage plus `npm run coverage:check`: passed all unchanged
  floors; mobile lines/branches remain **95.91% / 91.29%**. The combined checker
  reused the preceding unchanged API/contracts reports.
- `npm run test:journey -- e2e/data-export.spec.ts`: **2/2 passed**, including the
  updated error copy and explicit retry through the actual app/API/database.
- Side-panel verification: briefly pausing only the owned localhost API with a
  timed resume produced the real request-timeout error beneath the export row.
  After resume, tapping the row cleared the error and downloaded the ZIP. The
  phone's separate staging API was unaffected. Ignored proof:
  `.local/phase-08/export-feedback-browser-error.png`.
- Anthony repeated the flow on his iPhone and **confirmed that closing the
  share sheet leaves no cancellation message**. This closes the quiet-dismissal
  UI check; Save to Files/email delivery, accessibility and private native-file
  cleanup remain open as recorded above.

The owned browser Metro was restored after the saved journeys. The phone Metro
served the changed row through Fast Refresh; the existing development build was
reused. No new files or dependencies were needed. The full changed-directory
inventories were reviewed again; the existing export, e2e/support and docs groups
remain appropriate, with no additional folder moves.

At Anthony's subsequent request, export errors use the app's existing dark red
(`#8B1E32`); success messages retain navy. Feedback carries its severity so both
generic failures and unreadable-data guidance receive the error color. Updated
row tests pass **11/11**, fresh `npm run check` passes **537 mobile tests / 67
suites** and online Doctor **21/21**, and fresh mobile coverage plus the combined
floor check pass (unchanged API/contracts reports reused). Side-panel testing
confirmed the real timeout error in `rgb(139, 30, 50)`, followed by a successful
retry with navy `rgb(16, 44, 73)`. Ignored proof is
`.local/phase-08/export-error-red-browser.png`. The changed directory inventories
remain appropriate. Native color appearance was not separately observed; the
previous phone confirmation of quiet dismissal and remaining device gates stand.

## October 12 account and recovery UI

Anthony authorized implementing the account/recovery proposal from the separate
Mobbin research conversation, with exactly the Settings page styling. The work
remains local on `codex/phase-08-settings-privacy`; no Git publication, native
signing/build, account reset or external deployment is included.

- `/recovery` shows the connected-account hub with Account, Recovery, Devices and
  Support sections, a private-account summary and the existing Back to app path.
  Shared `components/settings/SettingsPage`, rows and icons supply the same cream
  canvas, narrow serif headings, white cards, dividers, spacing and circular Back
  control as Settings. Secondary screens have no bottom tabs.
- Recovery keys, Move to another phone and Devices open focused `/account/[tool]`
  screens using the existing controller/API. Manual Refresh account/Renew this
  session and the account reference are under Troubleshooting. Existing automatic
  foreground/session refresh is preserved rather than replaced.
- Key/device revocation retains explicit confirmation and cancellation. This
  phone is identified and self-revocation returns to recovery. Key revocation
  preserves active device sessions. Key text is selectable and hidden when the
  page loses focus or the app backgrounds; a late response cannot redisplay it
  after leaving. Transfer code editing clears its reviewed state/verification;
  only entered verification digits are sent, with pending/invalid/expired feedback
  owned by the existing controller.
- The disconnected creation/key/transfer entry and explicit recovery of another
  existing account remain available. Recovery explains uploaded-history limits;
  account switching never merges private history. Unavailable deletion/analytics,
  billing boundaries and all earlier release/device gates remain unchanged.
- The reusable row/icon files move from Settings into `components/settings/` and
  both screens use the extracted page layout. New connected-account UI lives in
  the cohesive identity/account group with its tests. All touched directories
  were reviewed in full: Settings root is smaller, identity/account keeps UI apart
  from the existing transport/vault/controller, and routes remain thin. Remaining
  directories do not need more subdivision for this change.

Verification and device review are recorded below. Full physical recovery,
Keychain/iCloud behavior, two-phone transfer, native keyboard/VoiceOver/large text
and real support-mail delivery remain release gates in Phase 09. Browser and
component checks cannot close them. Other Phase 08 work remains open.

### Verification for the account UI

- `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run check`: passed,
  with fresh online Expo Doctor **21/21**, architecture checks, type/lint/format
  checks, **544 mobile tests / 68 suites**, 54 API unit tests and 24 contract tests.
  Final run has no lint warnings; `.local/phase-08/account-check.log`.
- `npm run test:coverage`: passed all unchanged global/critical floors and the
  dedicated loopback database/migration suites. Mobile **96.41% lines / 91.58%
  branches**, API **95.01% / 90.61%**, contracts **100% / 100%**;
  `.local/phase-08/account-coverage.log`.
- Focused Settings/account checks: **29/29** passed. The final root check also
  includes transfer-code edits clearing previously entered verification digits,
  key hiding after a late response, key/device cancellation and revocation,
  session renewal, route validation and network-error retry.
- Retained actual-app/API/database journey suite: **25 passed**, with one
  self-device recovery assertion initially finding both the visible route and a
  hidden retained recovery screen. Scope the two text assertions to visible
  elements (without dropping database/HTTP/ownership/history assertions). The
  focused self-device recovery rerun **passed 1/1**, proving session refusal,
  same-account recovery and retained reflection/Progress. Evidence is split across
  `.local/phase-08/account-journeys.log` and `account-recovery-journey.log`; this
  does not claim a fresh full 26-case green invocation or hosted CI. The first
  startup attempt found the local database stopped; `npm run db:local` restored
  the existing loopback test database and preserved ignored environment files.
- Cleared-cache, one-worker web and iOS exports passed; logs and output remain
  under ignored `.local/phase-08/account-{web,ios}-export*`. Bundling is separate
  from native UI/device acceptance.
- Codex side-panel browser, disposable local account/API on 3000 and live web
  Metro on 8081: Settings → hub → each focused page, explicit account recovery,
  nested Back navigation, transfer validation and device-removal cancellation
  were observed. Reviewed at **393 × 852** and **320 × 740**; the narrow header/row
  text wraps without horizontal overflow. No browser warning/error logs appeared.
  No key was revealed, mail sent or private owner data used. Screenshot:
  `.local/phase-08/account-recovery-browser.png`; temporary viewport override reset.
- Only the owned phone Metro was restarted with `--clear`, one worker, the same
  staging API and port **8084**. Its LAN address is now **10.0.0.200**. The fresh
  iOS/Hermes bundle returns **HTTP 200 / 11,111,158 bytes**. The installed physical
  build is reused; native layout, keyboard, key-background hiding and two-phone
  transfer have not been newly observed in this slice. Owner can reload and open
  Settings → Account & recovery to review. A reload broadcast found no connected
  native app, so Anthony must reopen/connect the installed app; it was not remotely
  verified. No reinstallation or account/data reset.

The earlier phone confirmations for direct export/quiet dismissal remain valid;
this change does not close the wider Phase 08/09 acceptance gates.

### Owner phone connection follow-up

Anthony reported that the new page does not appear on his phone. The current
8084 server serves SDK 57 at `10.0.0.200:8084`, and its iOS bundle contains the new
account hub, phone-transfer label and Troubleshooting. The server's last reload
broadcast had no connected native app; CoreDevice also reports the paired iPhone
as disconnected, so no remote phone launch or screen verification is available.
The changed Mac address/stale development connection is a possible cause, not a
confirmed phone diagnosis. A fresh Expo development-client QR was generated from
the current connection URL and decoded successfully using Apple Vision. The
owner must close/reopen the installed app with that connection on the same Wi-Fi
and confirm the page. No app data, credentials, build or signing was changed.

Anthony also asked whether Support duplicates the Settings contact flow. The
recommendation is to remove that duplicate section/Get help from the connected
hub and keep Troubleshooting under Account. This is advice only in this follow-up;
the existing Support section has not yet been changed. Disconnected recovery help
should remain reachable when needed.

Anthony subsequently confirmed “it's working now” after the fresh-connection
instructions. This is owner-reported evidence that the new Account & recovery
page opens on the installed physical iPhone build. It does not establish recovery
key hiding, keyboard/VoiceOver/large-text behavior, key/device revocation,
two-phone transfer or full recovery acceptance. Support consolidation was subsequently implemented at the owner's request; see
the refinement below.

### October 12 account row alignment and support refinement

Anthony requested left alignment/padding for Recover an existing account in
Troubleshooting and removal of duplicate Get help from the connected account
hub. The recovery link now uses the same icon/label/action row as Refresh account
and Renew this session, retaining navigation and the busy guard. Troubleshooting
moves into Account and the redundant Support group is removed. Settings support
and disconnected recovery help remain available; no email/data/recovery policy
is changed.

The existing account screen tests cover the updated groups, recovery navigation
and disconnected help. The retained identity/catalog journey compares actual
rendered label positions to catch the original flush-left link. No new files or
folder moves are needed; the full account/e2e/documentation directory inventories
remain cohesive. Verification is recorded below.

Verification for the refinement:

- Focused Settings/account tests **29/29** pass. Typechecks, lint, formatting,
  architecture tests, API unit tests and contracts pass on the unchanged installed
  dependencies. Final mobile coverage run passes **544 tests / 68 suites**, with
  **96.44% lines / 91.59% branches**; all unchanged coverage floors pass. The API
  and contract coverage reports reused here are from the earlier unchanged-source
  root coverage run, rather than claimed as new backend acceptance.
- The saved actual-app/API/database identity/catalog journey passes **1/1**,
  comparing all three visible label left edges within one pixel, opening recovery
  with Enter, returning, renewing the same account and opening the real catalog.
  It waits for the enabled link/real destination after focus refresh, preserving
  the busy guard rather than racing its replacement. Log:
  `.local/phase-08/account-polish-journey.log`.
- Side-panel browser on the disposable loopback fixture: the three labels measure
  **x = 73 px** at 393 × 852. Connected Account & recovery has no duplicate Get
  help or Support header; Troubleshooting is under Account. Recovery navigation
  and nested Back were observed. Screenshot:
  `.local/phase-08/troubleshooting-aligned-browser.png`.
  Anthony subsequently required browser testing only in the side panel. Final
  verification used the Codex in-app browser, repeated the alignment/Enter/Back
  checks and restored the temporary viewport. The saved journey above predates
  this instruction; no outside-browser journey was rerun afterward.
- Browser inspection caught the replacement Pressable-only link not responding
  to Enter. Shared settings action rows now use Expo Link for destinations and
  omit the destination while disabled. Native touch navigation and true web-anchor
  semantics share one row; plain actions retain their existing button handler.
  The unrelated motion unit suite uses a scoped router mock, as the account tests
  already do; actual browser/journey navigation exercises the real router.
- Full `npm run check` currently **fails at Expo Doctor (20/21)** because fresh
  online metadata recommends six SDK 57 patches: Expo 57.0.28, Crypto 57.0.4,
  dev-client 57.0.20, router 57.0.26, splash-screen 57.0.10 and jest-expo 57.0.6.
  Installed versions/lockfile remain unchanged. The dependency gate was not
  excluded, suppressed or called passing. Track SDK patch alignment and its native
  build/device validation separately before Git publication; native signing/build
  upgrades remain outside this UI refinement. Diagnostic log:
  `.local/phase-08/account-polish-check.log`.
- Full contents of the touched account, shared settings-component, motion-test,
  journey and documentation directories were reviewed. No files were added and
  the existing responsibility groups remain appropriate. The loopback browser
  preview is restored; the separate physical-phone Metro and staging API remain
  intact. The earlier owner confirmation covers opening the base page; this
  refinement has not yet received separate physical-phone visual confirmation.

### October 12 quiet account refresh

Anthony requested that routine account checks stop showing “Connecting securely…”
when opening account items. The controller now marks accepted automatic operations
as background work while retaining the same mutual-exclusion guard, timeout,
session verification and failure handling. Focus refreshes, connected-account
foreground checks and request-driven session repair are quiet. Manual Refresh,
Retry, renewal, key and transfer actions retain their progress feedback. Successful
automatic session repair also avoids the connection-success message; failures
remain visible. Initial/disconnected connection keeps its loading feedback.

Account tools and explicit recovery distinguish background work from deliberate
actions. The shared primary button can be disabled independently of its spinner,
so transfer/recovery controls remain guarded during a quiet refresh. A focus
refresh cannot relabel an already-running manual action as background work. Key
hiding, account ownership, storage, network contracts and native dependencies are
unchanged.

Verification:

- Before the fix, the four controlled slow-focus regressions failed with the
  unwanted message visible. Afterward, **51 tests / 4 suites** pass across account
  screens, identity presentation/controller and provider integration. They cover
  all four tool pages, quiet disabled transfer controls, manual progress, an
  overlapping focus event, retained failure/retry, background session repair and
  progress-state reset. Logs: `.local/phase-08/account-quiet-before.log` and
  `.local/phase-08/account-quiet-focused.log`.
- Typechecks, lint, formatting, **180 architecture/tooling cases**, **54 API unit
  cases** and **24 contract cases** pass. Mobile coverage passes **549 cases / 68
  suites**, **96.48% lines / 91.65% branches**. The unchanged combined/critical
  coverage floors pass; API/contract coverage reports are retained from the prior
  unchanged-source coverage run. Gate log:
  `.local/phase-08/account-quiet-coverage-gate.log`. No backend change or phase
  closeout requires a new database acceptance run in this presentation slice.
- Fresh `npm run check` stops at the same **20/21 Expo Doctor** dependency check
  described above; none of the six package pins or validation rules were changed
  or excluded. Log: `.local/phase-08/account-quiet-check.log`. Native SDK patch
  alignment/build/device verification remains the separate pre-publication task.
- All interactive testing used the Codex side panel and a disposable loopback
  account. An ignored copy of the guarded fixture server delayed session checks
  by five seconds: Troubleshooting, Recovery keys, Move to another phone and
  Devices had no loading message while guarded actions were disabled. The
  transfer action had no spinner. Manual Refresh and Retry showed progress; a
  controlled 503 remained visible and retry restored the connected screen. One
  default locator wait expired before the intentional five-second response;
  subsequent inspection confirmed normal completion with no error. The standard
  fixture server was restored, and a final manual refresh succeeded. Screenshot:
  `.local/phase-08/account-quiet-browser.png`. No outside browser, saved browser
  journey, simulator or physical-phone acceptance is claimed for this slice.
- Reviewed the full contents of touched identity, account, provider, shared
  component and documentation directories. Existing responsibility groups remain
  cohesive; no new source files or additional subfolders are needed. Both Metro
  servers remain available; no installation, signing or phone data reset occurred.
  A full reload was broadcast to the owned phone Metro after the provider effect
  change, but no native app was connected at that moment. Anthony must reopen and
  fully reload the installed development app; this is not physical verification.

### October 12 account action indicators

Anthony requested an audit after Show recovery key still displayed “Connecting
securely…”. All Account & recovery manual actions now show progress on the
initiating control. A shared identity presentation hook tracks that control and
guards late completion after unmount; the existing controller remains responsible
for serialization, ownership, failure handling and deadlines. Shared Settings
action rows accept a spinner accessory and expose busy/disabled accessibility
state. Primary/text buttons retain their labels and show only their own spinner.
Key/device revocation distinguishes full IDs even if display prefixes collide.
Confirmation closes and progress remains on the originating row. Automatic
checks remain quiet; readable errors/success guidance are retained.

The audit covers:

| Action                                              | Loading presentation                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Show recovery key                                   | Spinner on the right of its row                                                                   |
| Revoke recovery key / device                        | Spinner on the selected row after confirmation                                                    |
| Refresh account / Renew this session                | Spinner on the selected row                                                                       |
| Retry connection                                    | Its row/button remains visible with a spinner while earlier error text clears                     |
| Review transfer / Approve this device               | Spinner inside only the selected primary button                                                   |
| Transfer from another device / Start a new transfer | Spinner beside only the selected text action                                                      |
| Check approval & finish                             | Spinner inside that primary button                                                                |
| Create a private/separate account                   | Spinner inside the initiating button, which remains mounted while the request is pending          |
| Create a separate empty account                     | Spinner beside that text action after confirmation                                                |
| Recover with key / saved credential                 | Spinner on the initiating primary/text button; saved credentials use their full IDs for selection |
| Initial account connection                          | Accessible indicator with no ellipsis text                                                        |
| Export my data                                      | Existing right-hand spinner, with its label preserved rather than “Creating export…”              |

Hide key, Cancel, navigation and showing recovery options are synchronous and have
no network loader. Support/legal/social/rating controls have no ellipsis loading
text to replace; their existing busy guard/failure feedback remains. Coming soon
indicates unavailable functionality, not loading. Other feature screen-loading
headings are outside this Settings/account action audit.

Verification:

- **40 focused cases / 3 suites** pass across account actions, disconnected/explicit
  recovery and export. Controlled pending requests verify every asynchronous action
  above, one correctly located indicator, steady labels, disabled duplicate actions,
  completion, manual/focus overlap, quiet background work and retained failure/retry.
  Initial test-fixture failures revealed a constant UUID collision and incomplete
  transfer response; the fixtures now use the existing randomness seam and valid
  public contracts. A missing async `act` import was repaired; final tests release
  all pending requests and exit without unexpected warnings. Log:
  `.local/phase-08/account-indicators-focused.log`.
- Typechecks, lint, formatting, **180 architecture cases**, **54 API unit cases**
  and **24 contract cases** pass. Mobile coverage passes **561 cases / 68 suites**,
  **96.92% lines / 91.76% branches**. Combined/critical floors are unchanged and
  pass; unchanged API/contracts coverage reports are retained from the preceding
  run. Gate log: `.local/phase-08/account-indicators-coverage-gate.log`.
- Fresh `npm run check` still stops at the same six online Expo patch mismatches,
  **20/21 Doctor checks**. No dependency pins or validation exclusions changed.
  Log: `.local/phase-08/account-indicators-check.log`. The pre-publication SDK
  patch/native-build acceptance task remains open.
- Interactive verification used only the Codex side panel with disposable loopback
  accounts. An ignored copy of the guarded fixture delayed selected requests by
  two/five seconds. Creation, Show key, key revocation, Refresh, Renew, Retry,
  transfer start/restart/review/approval/completion, device revocation and export
  each displayed one correctly labeled indicator. A controlled 503 cleared the
  refresh indicator and showed a readable error; retry stayed mounted, spun and
  restored the account. One tool wait ended before its intentional five-second
  response; subsequent inspection confirmed completion. Transfer tests used two
  in-panel tabs and masked synthetic inputs; the temporary tab was closed. Key
  display was hidden before continuing; the saved image captures only its pending
  request. Screenshot: `.local/phase-08/account-action-spinner.png`.
- Restored the standard loopback fixture server and retained the owned web/phone
  Metro servers. No native rebuild, installation, device reset, saved browser
  journey or physical/VoiceOver acceptance is claimed in this slice.
- Reviewed full contents of the changed identity (ten root files), account (eight),
  export (four), shared UI/settings and documentation directories. The new hook
  belongs with identity presentation; existing responsibility groups remain
  navigable, so no further folder moves are needed. The folder/architecture guides
  reflect its ownership and steady-label export behavior.
  The phone Metro reload broadcast reported no connected app; the owner must
  reopen/reload the installed development app to review these indicators. The
  broadcast does not establish native UI acceptance.

### October 12 footer cleanup and local commits

Anthony requested appropriate local commits for the existing work and removal of
redundant footer items. The explicit `/account/recover` form no longer offers Get
help; main Settings Support remains the routine contact destination. Disconnected
Account & recovery retains its existing direct help/retry for connection failures.
The identity privacy tagline is removed. Settings ends after About, without the
JustGO/version/free-test branding or Preview app screens link. Removing that
footer also removes Settings' unused version/access subscriptions and styles;
the actual build version and guarded developer preview route are unchanged.

The previously verified source was saved before this cleanup:

- `2f8c21c` — `refactor(settings): share row and icon components`: exact moves of
  the two existing components, import-aware caller rewrites and folder guidance.
  Behavior additions remain in the following commit.
- `b42b999` — `feat(account): add focused recovery screens and action indicators`:
  shared layout, account/recovery screens, quiet automatic checks, action spinners,
  export's steady label, tests/journey wiring and actual verification/handoffs.
- The footer refinement is a separate local commit,
  `fix(settings): remove redundant recovery and settings footers`.

All commits are on `codex/phase-08-settings-privacy`. Anthony authorized local
commits; no push, PR, merge, native build or release submission is included.

Verification:

- Three removal regressions fail against the preceding UI, then **46 focused
  cases / 3 suites** pass after the cleanup. They verify that the recovery help
  and tagline are absent, Settings has no version/test/preview footer even with
  development/free-test metadata available, and the original Support/contact and
  recovery controls remain usable. Logs: `.local/phase-08/footer-cleanup-before.log`
  and `.local/phase-08/footer-cleanup-focused.log`.
- Typechecks, lint, formatting, **180 architecture/tooling cases**, **54 API unit
  cases** and **24 contract cases** pass. Mobile coverage passes **561 cases / 68
  suites**, **96.92% lines / 91.79% branches**. Unchanged combined/critical floors
  pass; unchanged API/contracts coverage reports are retained from their preceding
  run. Gate: `.local/phase-08/footer-cleanup-coverage-gate.log`.
- Fresh `npm run check` still stops at the same **20/21 Expo Doctor** result and
  six SDK patch recommendations. No pins, exclusions or validation rules changed;
  the separate patch/native validation task remains open. Log:
  `.local/phase-08/footer-cleanup-check.log`.
- Only the Codex side panel was used for interactive verification. A fully
  reloaded runtime and disposable loopback account open Settings → Account &
  recovery → Recovery keys → Recover an existing account. The form ends after
  recovery options, with no help/tagline; Back navigation works. Settings scrolls
  to Terms of use, with no version/test/preview text below About, and its two
  Support actions remain visible. Screenshots:
  `.local/phase-08/recovery-footer-removed.png` and
  `.local/phase-08/settings-footer-removed.png`. No new native/physical/VoiceOver
  acceptance, saved browser journey or database acceptance is claimed.
- Reviewed full contents of touched identity, account, Settings and documentation
  directories. This slice adds no files; the established responsibility groups
  remain navigable and no further subfolders are needed. Owned development servers
  and phone data remain intact; routine screenshots are ignored local evidence.

### October 12 account back-link removal

Anthony requested removing the bottom Back to app link from Account & recovery.
The connected hub and disconnected route now end after their existing controls.
The shared header Back behavior is unchanged: use navigation history when
available, otherwise return to Settings. The disconnected route no longer needs
an extra footer/safe-area wrapper. Support and recovery actions remain available.

Verification:

- Both removal assertions fail against the preceding UI, then all **19 account
  screen cases** pass. The existing connected Back/history test and disconnected
  fallback assertion verify that header navigation remains available. Logs:
  `.local/phase-08/account-back-link-before.log` and
  `.local/phase-08/account-back-link-focused.log`.
- Contract build, all typechecks (including saved journeys), lint and formatting
  pass. Tests pass: **180 architecture/tooling, 54 API unit, 561 mobile and 24
  contract cases**. Test log: `.local/phase-08/account-back-link-tests.log`.
  Fresh mobile coverage passes **68 suites**, with **96.92% lines**; the unchanged
  combined/critical coverage gate passes using the retained API/contracts reports
  for their unchanged source. Logs: `.local/phase-08/account-back-link-coverage.log`
  and `.local/phase-08/account-back-link-coverage-gate.log`.
- Fresh `npm run check` still stops at the existing **20/21 Expo Doctor** result
  for the same six SDK patch updates. Dependency validation stays enabled; native
  dependency maintenance remains a separate task before publication. Log:
  `.local/phase-08/account-back-link-check.log`.
- Interactive verification used only the Codex side panel and disposable loopback
  state. The connected page has no bottom link; header Back returns to Settings,
  then Home. A fresh disconnected runtime also has no link and its header Back
  returns to Settings. Screenshot: `.local/phase-08/account-back-link-removed.png`.
  Saved journey callers now use header navigation rather than the removed link;
  their source was typechecked, but those CLI journeys were not rerun under the
  owner's side-panel-only preference. No new phone, native, VoiceOver or database
  acceptance is claimed.
- Reviewed full contents of the account, route, journey/support and documentation
  directories touched by this slice. Account screens remain together, routes are
  thin, and the four journey helpers remain a small cohesive support group. No
  additional folder split is needed. Anthony subsequently authorized a local
  commit for this refinement: `fix(account): remove bottom back-to-app shortcut`.
  No push, PR or merge is authorized; physical feature acceptance remains open.

### October 12 accessibility audit

Anthony reported that phone checklist items 1–4 (latest account UI, export,
motion and support) work, and that recovery/transfer is fine. These are
owner-reported results; the individual revocation/key/transfer scenarios were
not enumerated. He then requested agent checks for larger text and control
labels. This is a testing-only follow-up, with no product-code changes or new
native build.

**Evidence:**

- `npm run test -w @justgo/mobile -- --runTestsByPath
src/app-support/settings/SettingsScreen.test.tsx
src/app-support/identity/account/AccountScreens.test.tsx
src/app-support/identity/IdentityScreen.test.tsx`: **46 cases / 3 suites pass**.
  Log: `.local/phase-08/accessibility-focused.log`. These are component/controller
  tests, not native VoiceOver or large-text acceptance.
- Only the Codex side panel was used for interactive checks. The current web
  bundle exposes named links/buttons for the account hub, recovery-key controls,
  transfer input/action, device revocation, Troubleshooting and explicit recovery.
  Settings exposes a labeled Reduce motion switch and honest unavailable rows.
  Keyboard focus progresses from Back through Reduce motion, Account & recovery,
  Export my data, Get help, Suggest a feature and Terms of use, skipping unavailable
  controls. The explicit recovery field is labeled Recovery key, uses a password
  input and is reachable with Tab. No support email was sent and no recovery key
  was revealed. Local evidence: `.local/phase-08/accessibility-browser-settings-labels.txt`.
- The existing JustGO Phase 7.2 QA / iPhone 17 / iOS 26.5 simulator was booted and
  mirrored through `serve-sim` in the side panel. XcodeBuildMCP discovery could not
  find `simctl` under the machine's default tools path; command-scoped
  `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` used the installed
  Xcode without changing global configuration. The installed native app reused
  the existing web Metro's iOS bundle and loopback fixture API. A separate empty
  disposable QA account connected after the earlier credential was unavailable;
  previous recovery credentials were retained. The phone server/staging account
  and other running servers were not changed.
- Native accessibility inspection confirms Settings headings, named account
  navigation, export/support/legal buttons, the motion switch and unavailable
  labels. Fresh transfer inspection confirms Back, page/group headings, Transfer
  code as a text field and Review transfer as a button. Inspector results must
  match the live frame: the helper briefly returned no data and an older Settings
  tree before the fresh app launch. Only matching snapshots are evidence. Files:
  `.local/phase-08/accessibility-native-settings-labels.txt` and
  `.local/phase-08/accessibility-native-transfer-labels.txt`.
- The native `accessibility-extra-extra-extra-large` category was confirmed with
  `simctl ui ... content_size`. Settings and Recovery keys reflow and their lower
  actions are reachable with scrolling. The transfer form was also inspected
  at `accessibility-large` after a full native reload. These are real simulator
  layouts, not CSS zoom or mock text sizes.

**Audit findings — resolved by the subsequent large-text follow-up below:**

1. At the maximum size, Settings and Recovery keys titles split within words,
   and long section headings can leave a single letter on another line. The
   header's reserved side columns reduce the available title width. Improve the
   large-text layout and recheck before marking it accepted.
2. The fixed-width Coming soon accessory becomes a narrow column with words
   broken across several lines. Adapt unavailable-row layout for large text
   while retaining the availability information.
3. Changing text size live from the largest category to `accessibility-large`
   left excess blank space in the transfer heading, explanatory card and button.
   A full native reload at the same category produced the expected compact
   measurements. Live font-size changes need investigation and retesting; no
   cause or code fix is claimed by this audit.

Screenshots: `.local/phase-08/accessibility-settings-largest.png`,
`.local/phase-08/accessibility-keys-largest.png`,
`.local/phase-08/accessibility-transfer-large.png` and
`.local/phase-08/accessibility-transfer-large-fresh.png`.
At this audit checkpoint, these findings kept the large-text gate open; the
subsequent implementation below resolves all three. Actual iPhone VoiceOver speech, focus, gestures and
full journeys remain a physical-device check. Browser keyboard checks and native
label inspection do not replace that check. The prior Expo dependency requirement
also remains open; no dependency-validation bypass was introduced.

The simulator's original `large` text category and Shutdown state were restored,
and the task-owned mirror/helper was stopped after testing. Routine evidence
remains ignored under `.local/`. The full contents of touched docs/handoffs and
docs directories remain cohesive with the existing phase index; no new files or
folder moves were needed. This records results, not a phase closeout or Git
publication.

### October 12 large-text fixes

Anthony authorized fixing the audit findings and repeating visual checks until
the layouts work. All three findings above are resolved in this follow-up:

- Enlarged Settings/account headers put Back above a full-width title instead
  of reserving side columns. Serif headings and action labels grow up to 2×;
  body descriptions retain the full selected system scale. Narrow-screen titles
  use a smaller base size. No text is truncated to hide the wrapping problem.
- Unavailable rows place Coming soon below their label at enlarged sizes, with
  no fixed narrow status column. Icons, chevrons and switches align with the
  first line; normal-size layout remains unchanged.
- Shared `components/typography/ScaledText` updates explicit font size and line
  height together from live `useWindowDimensions().fontScale`. Native Text does
  not apply the scale a second time. Metrics are memoized by style/effective
  scale; unrelated width changes reuse them. Account descriptions and shared
  action controls use this boundary without remounting forms or pending work.
  Native TextInputs retain their original platform scaling and styles; shorter
  Recovery key, Transfer code and Six digits placeholders avoid tiny native
  placeholder text at enlarged sizes.

Interactive evidence:

- Only the Codex side panel was used. The existing signed simulator client on
  JustGO Phase 7.2 QA / iPhone 17 / iOS 26.5 loaded current source from the owned
  Metro and disposable loopback API. No new binary, installation, signing or
  owner-phone/staging change was needed. No recovery key was revealed, account
  transfer/revocation submitted or support email sent during visual inspection.
- `simctl ui ... content_size` confirmed the maximum
  `accessibility-extra-extra-extra-large` setting. Settings, Account & recovery,
  Troubleshooting, Recovery keys, Recover an account, Devices and Move to another
  phone have readable headings, rows and descriptions; lower controls remain
  reachable by scrolling. Troubleshooting fits as a whole word. Transfer fields
  and buttons remain visible/reachable at maximum size.
- In the same mounted native app, maximum → accessibility-large → maximum →
  normal `large` changes reflow descriptions, cards and buttons immediately.
  The previous leftover blank spacing is gone without reloading. Normal header
  and row layouts return correctly. Native inspection corroborates control
  labels/roles; actual VoiceOver speech and gestures are not claimed.
- A fully reloaded web Settings screen also passes a 320 × 568 viewport check
  and exposes the existing names, roles and unavailable states. Browser labels
  and keyboard navigation from the audit remain separate from native evidence.
  The temporary browser viewport was restored.
- Ignored proof: `.local/phase-08/accessibility-fixed-settings-largest.png`,
  `accessibility-fixed-settings-about-largest.png`,
  `accessibility-fixed-account-largest.png`,
  `accessibility-fixed-troubleshooting-largest.png`,
  `accessibility-fixed-keys-largest.png`,
  `accessibility-fixed-recovery-largest.png`,
  `accessibility-fixed-devices-largest.png`,
  `accessibility-fixed-transfer-live-largest.png`,
  `accessibility-fixed-transfer-live-large.png`,
  `accessibility-fixed-transfer-normal.png` and
  `accessibility-fix-browser-320.png`, all under `.local/phase-08/`.

Automated verification:

- **67 focused cases / 6 suites** pass for shared typography/layout, Settings,
  account screens, disconnected recovery, external links and export. Regressions
  cover live font/line-height updates, the full-width header/status layout,
  stable metrics during unrelated dimension changes and preservation of pending
  buttons. The actual account-screen regression also retains typed transfer
  input and its enabled action after changing system scale. This input-retention
  assertion is component evidence, not a native typing/VoiceOver claim. Log:
  `.local/phase-08/accessibility-fix-focused.log`.
- Contract build, all typechecks (including saved journeys), lint and formatting
  pass. Full tests pass: **180 architecture/tooling, 54 API unit, 567 mobile / 69
  suites and 24 contract cases**. Logs:
  `.local/phase-08/accessibility-fix-other-checks.log` and
  `.local/phase-08/accessibility-fix-final-tests.log`. An unused test import and
  formatting issue were corrected before final validation. Test assertions use
  boolean identity checks instead of serializing cyclic renderer instances;
  no heap setting, assertion, warning or quality threshold was weakened.
- Fresh mobile coverage passes with **96.93% lines / 91.85% branches**. Unchanged
  combined/critical floors pass, reusing API/contracts coverage reports for their
  unchanged source. Logs: `.local/phase-08/accessibility-fix-coverage.log` and
  `.local/phase-08/accessibility-fix-coverage-gate.log`. No database, migration or
  hosted CI pass is claimed for this mobile-only slice.
  Shared typography/page/rows have 100% line coverage. Remaining branches are
  the private helper's unused default argument, a press-opacity style callback
  and an existing action callback variant; live resizing, caps and status-layout
  branches are exercised. No coverage exclusion was added.
- Fresh `npm run check` still stops at **20/21 Expo Doctor** checks, recommending
  six existing patch updates: Expo 57.0.28, crypto 57.0.4, dev-client 57.0.20,
  router 57.0.26, splash-screen 57.0.10 and jest-expo 57.0.6. Dependency validation
  remains enabled and no pins/exclusions were changed. The remaining constituent
  commands were run explicitly as recorded above; the root check is not reported
  as green. Log: `.local/phase-08/accessibility-fix-check.log`.

Reviewed the full contents of every changed directory: shared components,
settings/typography, identity/account, Settings/export and documentation. The
two-file typography responsibility has its own subfolder and colocated tests;
the existing groups remain navigable, so no additional moves are needed.
Restored the simulator's original `large` category and Shutdown state, closed
the temporary mirror tab and stopped only the task-owned helper. The existing
web, phone and API servers remain running. Actual physical-iPhone VoiceOver and
the existing dependency/native maintenance requirement remain open. This is an
accessibility fix, not Phase 08 closeout or Git publication.

## October 14 second review preparation

Anthony confirmed that PR #22 was merged and authorized updating local main,
archiving the foundation review checkout, and publishing review 2. Local `main`
now matches `348671f`. The completed foundation worktree was archived with its
merged review history preserved. Work continues in the separate
`phase8-pr2-review` worktree on `phase8-02-data-export-test-access`; the original
Phase 08 checkout, its uncommitted work and the later review branches were not
changed.

The second checkpoint incorporates current main, preserving PR #22's Expo patch
alignment, Progress test correction, CI artifact guard and reviewed guidance.
Manifest/lockfile conflicts retain the reviewed versions plus this slice's
`expo-file-system` and `fflate` dependencies. Documentation conflicts retain
both reviews' scope and evidence. No export, access or other product behavior
was changed while preparing this review. No source files were added or moved
during preparation, so no additional folder reorganization was needed.

Fresh local validation of the integrated candidate:

- `npm ci`: **pass**, including manifest/lockfile consistency.
- `npm run check`: **pass**, online Expo Doctor **21/21**, contracts build,
  TypeScript, ESLint, Prettier, **186 tooling**, **54 API**, **535 mobile** and
  **24 contract** tests.
- `npm run test:db`: **pass**, **55 tests across seven suites** against the
  dedicated loopback `justgo_test` database, plus the migration/restoration
  rehearsal. Only disposable local configuration was copied to the worktree;
  no hosted database or account was changed.
- `npm run test:coverage`: **pass**, all unchanged workspace and critical-file
  floors. This includes the authenticated export, beta-access and clock bounds.
- `npm run test:journey -- e2e/data-export.spec.ts`: **blocked**, the existing
  preview occupies port 8081. The command completed the guarded local migration
  but Playwright refused to reuse the existing preview. That server was left
  running; no saved journey pass or fresh interactive/browser/native acceptance
  is claimed. The authorized PR's hosted CI must run the clean fixture suite.

This review contains the initial export screen; the later direct Settings share
action and account/recovery refinements remain in review 3, with haptics and
subsequent polish in review 4. Existing native build/device acceptance, broader
beta/paid-launch gates, deletion, analytics and legal publication remain open.
Local passing checks do not establish hosted success or authorize merging.

## October 14 third review preparation

Anthony merged PR #23 and requested the next review. Local `main` now matches
`222d65b`; the completed export review worktree is archived. The separate
`phase8-pr3-review` worktree prepares `phase8-03-account-recovery-accessibility`
from its original `be4a191` checkpoint, incorporating current main without
rewriting history or touching the original checkout's ongoing working files.
The final haptics/performance branch remains unchanged.

The 78-file review retains the Settings-style account hub and focused tools,
direct export with quiet sharing dismissal and red errors, deliberate-action
indicators, footer cleanup, large-text fixes and responsibility-based folder
organization. PR #22's dependency/CI/Progress-test corrections and PR #23's
preparation evidence are preserved. Only documentation needed conflict
resolution; the manifest and lockfile match current main. No product behavior
was changed during this integration.

Fresh local validation:

- Clean `npm ci`: **pass**.
- `npm run check`: **pass**, fresh online Expo Doctor **21/21**, contracts build,
  TypeScript, ESLint, Prettier, **186 tooling**, **54 API**, **567 mobile across
  69 suites** and **24 contract** tests.
- `npm run test:coverage`: **pass**, all unchanged workspace and critical-file
  floors, including the database suites and migration/restoration rehearsal
  against dedicated loopback `justgo_test`. No hosted database was changed.
- Cold `npm run export:web -w @justgo/mobile` and
  `npm run export:ios -w @justgo/mobile`: **pass**, exercising the moved imports
  and assets in this exact checkout. These are JavaScript bundle checks, not a
  native build or device acceptance.
- Saved browser journeys were **not rerun locally**: the existing preview still
  occupies required port 8081 and was left running. Hosted CI must verify the
  clean fixture suite for the published head. No fresh interactive/browser/native
  acceptance is claimed by this publication task; prior evidence remains in the
  individual feature sections above.

Reviewed the contents of the changed directories. Account tools, shared
Settings/typography, Settings export/information and platform adapter groups
remain cohesive, with tests and native/web pairs beside their owners. The
import-only changes did not grow the other feature directories; no further
folder moves were needed for preparation. Logs remain ignored under
`.local/phase-08/pr3-*` in the original checkout.

Haptics, later animation/performance polish and the reflection keyboard follow-up
remain in review 4. Ongoing transfer/planning edits are excluded. Existing
physical-device, VoiceOver, dependency-native acceptance, privacy and beta/paid
release gates remain open. Local results do not establish hosted success or
authorize merging.

## October 14 PR #24 journey timing fix

Anthony requested investigating and fixing the failed Foundation check on
PR #24 at `e1b0c63`. The [pull-request run](https://github.com/anthonyyoo24/justgo/actions/runs/38645444025/job/116131020069)
passed dependency validation, types/lint/format, units, database tests and
coverage, then failed `identity-catalog.spec.ts` at its immediate non-null
bounding-box assertion. The other 25 saved journeys passed. Both exports were
skipped after the journey failure; the [same-head push run](https://github.com/anthonyyoo24/justgo/actions/runs/38645426588/job/116130960479)
passed. The masked CI screenshot shows all three labels present and aligned
after the failed measurement.

The test read geometry immediately after entering Troubleshooting. Navigation
and the automatic account refresh can change row visibility/identity between
locating text and measuring it; the recovery row gains its real Link when the
busy guard clears. A one-frame `null` measurement incorrectly failed the journey
before checking whether the controls were usable. Local repetition reproduced
the identical failure in **8 of 10** unmodified runs.

The corrected journey first awaits the enabled recovery link and its actual
destination, then polls fresh boxes for all three labels. Any missing box keeps
the assertion failing. Once all exist, the maximum left-edge spread must remain
below the original one-pixel limit. Recovery keyboard navigation, session renewal,
catalog/Progress and zero-activity database assertions are retained. The existing
test/expect timeouts, zero whole-test retries and coverage floors are unchanged.
App/CI configuration is unchanged; the recurring layout-read lesson is recorded
in `AGENTS.md`.

Local verification uses an ignored runner on web port **8093** to preserve the
existing preview on 8081. It temporarily aligns only the test-app URL, Metro
port, fixture CORS and network probe; API port 3000, loopback/test-database/role
guards and registry-owned cleanup remain enabled. Every temporary file change
is restored byte-for-byte in `finally` before final checks. The initial full
run passed 25 journeys but its network probe still targeted the existing 8081
preview; the temporary port override was corrected to probe its own 8093
fixture without disabling that assertion.

The fixed focused journey passes **10/10 repeated runs**, and the final complete
saved suite passes **26/26**, including network and cleanup isolation. Final
`npm run check` **passes**, with fresh online Expo Doctor **21/21**, contracts
build, TypeScript, lint, formatting, **186 tooling**, **54 API**, **567 mobile**
and **24 contract** tests. The temporary fixture changes are absent from the
final diff, and only the test and its guidance/evidence are retained. Existing
CI database/coverage results remain as recorded above; no separate coverage,
native or device rerun is claimed for this test-only fix. Logs, downloaded
masked CI evidence and the temporary runner remain ignored under
`.local/pr24-ci-fix/` in the original checkout. No product UI/native change,
native build or new device acceptance is included in this test-only correction.
Publication and hosted verification remain pending at this preparation checkpoint.

Changed-directory review covers the root, `e2e`, `docs` and `docs/handoffs`.
No files were added; existing fixture-support and documentation groups remain
appropriate, so no folder moves were necessary. Task-owned API/Metro services
were shut down, and the original preview and original checkout's working files
were preserved. Final Markdown formatting and diff checks pass.
