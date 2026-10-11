# Phase 08 settings and privacy handoff

**Date:** October 10, 2026\
**Status:** Settings/contact and Reduce Motion slices for owner review; legal drafts prepared and remaining Phase 08 controls open.\
**Branch:** codex/phase-08-settings-privacy, based on the merged Phase 07.5 baseline. Native billing remains preserved on codex/phase-07a-native-billing at 4d5c9f2.

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

## October 10 data export implementation

Anthony authorized step 2 and selected a ZIP with CSV and JSON. Settings now
opens a separate Export my data screen, available without paid access. Export
is explicit, blocks repeated taps while preparing/sharing and leaves existing
data unchanged. The screen explains the private contents, internet requirement
and user-selected save destination. Back navigation, account changes and route
blur cancel preparation; retry, unreadable local storage, cancellation and
successful delivery have distinct feedback.

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
