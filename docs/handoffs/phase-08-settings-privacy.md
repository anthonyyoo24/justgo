# Phase 08 settings and privacy handoff

**Date:** October 9, 2026\
**Status:** Settings UI/contact slice for owner review and legal drafts prepared; Phase 08 remains open.\
**Branch:** codex/phase-08-settings-privacy, based on the merged Phase 07.5 baseline. Native billing remains preserved on codex/phase-07a-native-billing at 4d5c9f2.

## Current authorized work

The owner accepted the legal sequence: data checklist, policy/terms drafts, review, then hosting. After that preparation, the owner explicitly authorized the Settings UI using the Paper F1 design and agreed Phase 08 scope, starting with layout and existing recovery/support actions. This handoff covers those local changes and the legal drafts. No public site, email delivery, App Store configuration or Git publication was performed.

Youngshin Yoo is the confirmed personal operator in Canada. The owner's proposed distribution is all available App Store countries and regions for ages 18 and older. The operator's province, final territorial availability, age-related implementation and required regional notices remain review decisions.

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
- Privacy policy stays disabled until a valid public HTTPS destination is configured. Terms uses the existing Apple standard license fallback, identified in the row, until the reviewed JustGO terms URL is supplied. No legal draft was published. App version comes from Expo config rather than the mockup's sample version.

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

## Open Phase 08 work

All phase acceptance boxes remain open. Haptic/motion preferences, authenticated export/deletion, credential/cache/vendor cleanup, both analytics choices and event forwarding, redaction/dashboards, verified contact/legal links and relevant device evidence still need implementation or verification. Reminders remain deferred beyond the first release; Tminus/Lance remain excluded. Feature suggestions reuse Support's private email destination with a distinct subject and no automatic private attachments.

Before publication, resolve retention and backup behavior, provider configuration, operator/contact and regional requirements, individual-versus-legal-entity App Review eligibility, age treatment and final Terms/EULA compatibility. Review the concrete policy before creating and publishing the public site. Resume commercial activation after the free beta and reconcile the policy for the paid build.
