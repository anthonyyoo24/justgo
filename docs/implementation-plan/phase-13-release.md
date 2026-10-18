<a id="phase-13"></a>

# Phase 13 — Release validation & launch

**Status:** Hosted owner-device prerequisite ready; beta/release acceptance not started

## Outcome

A free TestFlight beta validates the complete core product; payment activation and final release acceptance follow before paid store submission.

## Decisions in force

- Dependencies: 08–12 for the free beta checkpoint; 08–12 and accepted 07A for paid launch. Phase 14 product analytics follows paid launch and is not a release prerequisite.
- Acceptance: PRD AC-01–06, 08–11, 13–17 · applicable iOS tech acceptance
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

**Free beta checkpoint**

- Define authenticated, server-authorized free tester access in an isolated non-production environment, including coverage for offline use and synchronization. Keep real identity/ownership boundaries, preserve tester history and plan how beta access ends or transitions when payments launch. Do not deploy the local fixture server or rely on a client premium switch. Purchases remain disabled and the beta explains that access is free during testing.
- Finish Phases 08–12 and run the applicable core-product/privacy/recovery/accessibility acceptance checks on the actual signed iOS build and physical devices. Keep native/Keychain/storage, valuable-data recovery and environment-isolation gates explicit; a browser export is not sufficient evidence. Verify Sentry reporting/redaction, the single Terms & Privacy acceptance, absence of analytics Settings switches and approved public notices/disclosure preparation against the actual beta build. Confirm product analytics remains disabled and launch acceptance copy accurately describes the enabled services.
- Deploy the matching reviewed API/schema to the test environment, verify backup/restoration and old-client compatibility/cutover, and prepare an EAS-signed build, beta review information, support contact and tester instructions. Obtain separate build/upload/distribution authorization where required by the repository's native-build and release rules. External testers need Apple's TestFlight beta review.
- Collect feedback and resolve beta-blocking issues. Record the build/commit, tester access policy, device evidence and remaining paid-only checks in the Phase 13 handoff. A beta does not establish paid-launch acceptance.
- Before the beta build, complete the Expo SDK 58 / React Native 0.88 upgrade as its own native-upgrade task, with a new signed development build and a device recheck of affected native behavior [STK-2].
- Set the app icon and splash in `app.config.ts` from the existing `assets/icon.png` and `assets/splash-icon.png`, embed Inter through the `expo-font` config plugin, and keep the splash visible until fonts and providers are ready [RTR-5].
- Automate release steps [CI-6, CI-7]: switch `eas.json` to remote app versions with `autoIncrement` on the production profile; pin the EAS CLI version; build and submit to TestFlight from a tag; run migrations through a protected workflow with manual approval and a log; and smoke-check `/ready` after each deploy. These workflows still need the existing separate authorization before any upload or deployment.
- Rate-limit authenticated write routes (attempts, reflections, export), or add an equivalent Vercel firewall rule, and check the limits against measured beta traffic [API-6].
- The October 18 authorized Phase 10 test-server update deployed the current API (including the `/v1/` 4xx mapping) and applied forward migrations through 0017, including the owner-only transfer DELETE restriction. Retention scheduling remains open: schedule `justgo.purge_expired_identity_records` with Supabase `pg_cron` running as `justgo_migrator` (recommended; it needs `USAGE` on the `cron` schema) or a protected workflow, and record the first run's counts. See the [Phase 08 handoff](../handoffs/phase-08-settings-privacy.md#open-gates).
- Set up server health monitoring with existing tools before testers arrive; nothing custom is built [SEC-1, server side]. Point a free uptime checker (for example UptimeRobot or Better Stack) at the test server's `/ready` and have it email Anthony on failure. Send API 5xx errors to an error tracker such as Sentry, scrubbed to the same allowlisted log fields so no private data leaves the server. Use Vercel's and Supabase's built-in dashboards for request and database health.
- Admit free-beta testers with the staging-only beta access window (`BETA_ACCESS_WINDOW`, a start and end time) instead of approving each account by hand. TestFlight limits who can install the build; during the window every signed-in account on the test server can start challenges. Per-account grants still take precedence, so one tester can be revoked, and challenges completed during the window stay uploadable after it ends.
- Run a small Maestro smoke against a simulator build in CI, starting from the deferred [07.3A checkpoint](../handoffs/phase-07-3a-testing-checkpoint.md), so native launch, recovery and the challenge flow have automated coverage before testers arrive [TST-2].

**Paid launch checkpoint**

Put the production database on the Supabase Pro plan and confirm 7-day daily backups in its dashboard before real users' data is stored. Complete real store/provider configuration, native purchase/restore and all 07A acceptance gates, then run the integrated checks below with payments enabled. Reconcile beta-account/history preservation and the free-to-paid transition before inviting testers to a paid release. When the billing tables join `apps/api/src/db/schema.ts` at this checkpoint, split it into `schema/identity.ts`, `schema/catalog.ts`, `schema/activity.ts`, `schema/billing.ts` and an `index.ts`, and point `drizzle.config.ts` at the folder; this must generate no migration by itself [FS-9]. Before the paid launch, rehearse Phase 08's backup restore checklist once on the hosted test server with a disposable account: back up, delete the account, restore into an isolated environment, reapply the deletion and confirm the account stays deleted before reopening writers.

**Integrated verification**

- Run the first-release PRD acceptance matrix and applicable iOS tech checks on release-like builds and physical iPhones. Recheck identity, in-app countdown recovery, typed reflections, full calendar/day sheet, purchases, accessibility and keyboard/sheet behavior. Deferred Android, lock-screen, dictation and level tests do not block this release.
- Load-test interactive saves/history/purchase checks together with billing bursts and reconciliation using provider test doubles. Measure database connections/CPU/locks, API latency, queue age/drain time and choose configurable capacity limits.
- Deploy the integrated API and mobile build to a non-production staging environment, applying all reviewed migrations in order, including `0013_attempt_resources_contract`, under the [coordinated cutover and repair procedure](../operations/FOUNDATION.md#phase-07-coordinated-cutover-and-old-clients). Retire/block incompatible writers, verify a restorable backup and preservation comparisons, and accept the matching API/mobile together before reopening traffic. Verify end-to-end behavior before production, environment isolation, restoration/forward repair, old-client retirement, alert delivery, scheduler heartbeat and incident/replay instructions. After contraction, do not roll back the old API alone against removed schema. Confirm paid-plan allowances and operating budgets.
- Follow the [App Store setup checklist](../operations/APPLE_SETUP.md#release-setup-sequence): EAS production build/upload, TestFlight, listing/screenshots/privacy/support, reviewer access and App Review submission. Upload is not review approval. Record submission/release authorization and monitor real purchase/restore and errors after launch.
- Audit the submitted native bundle and configured SDKs for valid privacy manifests and approved reasons for any required-reason APIs. Reconcile actual cloud journal, Sentry diagnostics, billing and private feedback collection with App Privacy disclosures and the published policy; confirm product analytics and unconditional RevenueCat-to-PostHog forwarding remain disabled through paid launch. Distinguish the product's onboarding acceptance from Apple's ATT permission, which is required if the actual SDK/data use performs tracking under Apple's definition. Check current screenshot, build-SDK and export-compliance requirements immediately before submission. See [Apple privacy/data-use guidance](https://developer.apple.com/app-store/user-privacy-and-data-use/) and [required-reason API guidance](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).

## Keep out

- No unmeasured million-user claim, overdue launch blockers, incompatible native changes through an OTA update or additional feature scope during stabilization. Haptics implementation and its first physical acceptance belong to Phase 08; Phase 13 rechecks the accepted feature on the release build.
- Do not count Stripe or the future coach toward MVP readiness.

## Ready to hand off when

- [ ] Phase 08 haptics acceptance is recorded and the accepted feedback/preference still work on the signed beta/release build.
- [ ] Phase 09 app continuity, Phase 10 acceptance, Phase 11 crash reporting and Phase 12 approved public notices/disclosure preparation have linked acceptance; verify final bundle/disclosures and reconcile 07A billing changes before paid launch. Product analytics is disabled on beta and paid builds, with matching acceptance/public wording; its measurement/provider gates remain deferred to Phase 14.
- [ ] All launch PRD criteria (AC-01–06, AC-08–11, AC-13–17) and applicable iOS tech checks have linked passing evidence; no unresolved launch-blocking product decisions.
- [ ] Capacity, recovery/restore, security/privacy, rollback and device coverage meet documented release targets; limitations have explicit disposition.
- [ ] Store/release checklist, operational ownership and handoffs are complete; authorized release and post-release smoke results are recorded before marking launch complete.
- [ ] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; link it from the handoff index.

## Open gates for Phase 13

All unchecked acceptance items in this phase remain release gates until evidenced; beta acceptance does not establish paid-launch acceptance.
