<a id="phase-10"></a>

# Phase 10 — Terms & Privacy entry

**Status:** Owner-directed simplification implemented; existing test-server rollout verified. Product analytics remains disabled.

## Outcome

Welcome opens one Terms & Privacy page with ordinary document links. Continue creates an account when needed and enters Challenges through the existing access/preparation flow. The app records no legal document views, agreement receipts or accepted versions.

## Decisions in force

- The October 19 [no-recording decision](../DECISIONS.md#october-19-terms-links-without-acceptance-recording) supersedes the earlier receipt/version and reacceptance design. Keep the existing navy screen and internal /acceptance route to avoid unrelated navigation changes.
- Entry copy is one short phone/cloud saving and no-sale summary. The owner removed the Sentry paragraph, Analytics section and development-release notice. Use the linked Privacy Policy for full processing details; do not borrow incompatible on-device-only or active research-analytics claims from the Paper reference.
- Welcome Continue only navigates. The Terms page's Continue performs ordinary account creation; recovery of an existing account does not require legal-version checks or create another account.
- Legal links open the configured document URLs without account API calls or per-account tracking. Public publication remains owner-deferred in Phase 12; clearly labeled local pages support development testing.
- Analytics and ordinary Sentry delivery remain disabled. Continue is not authorization for future analytics. Phase 14 must revisit its actual permission/collection design before activation and must not silently restore this rejected tracking mechanism.

## Implement

- Remove the legal receipt controller, launch/foreground refreshes, GET/PUT acceptance routes, bootstrap acceptance fields, receipt exports and accepted-version navigation gates.
- Preserve explicit account creation, duplicate-action guards, persisted exact-proof retries, recovery/account isolation, deletion safeguards and the existing native first-deck preparation cover.
- Normalize older pending bootstrap state by stripping only obsolete legal metadata while retaining the same device/session/credential proof and transfer/deletion safety metadata. Failed cleanup is retryable and must not reset credentials.
- Apply forward migration 0018 to remove only the legal receipt table. Keep historical migrations unchanged, retain independent analytics restrictions, and preserve all identity/journal/deletion data. Deploy compatible API code before removing the table; old receipt-dependent APIs cannot be restored after contraction without a reviewed forward repair.
- Verify document navigation without account mutations; normal account creation without legal fields; response-loss retries; existing-account recovery; direct export/deletion; and no receipt endpoint or table.

## Keep out

- No legal view/click tracking, receipt storage, accepted-version checks or forced reacceptance.
- No analytics/Sentry activation, new onboarding questions, paid-access bypass, credential reset or journal deletion.
- No public legal-site hosting, plan purchase, Git publication or native distribution without the existing applicable authorization.

## Ready to hand off when

- [x] Terms links remain ordinary webpage navigation; Continue uses normal account creation with no legal metadata.
- [x] Existing accounts, exact-proof retries, recovery, export/deletion and first-deck preparation retain meaningful regression coverage.
- [x] Migration rehearsal proves old legal receipts disappear while all other account/journal tables remain unchanged.
- [x] Combined checks, in-app walkthrough and the authorized test-server rollout are verified and recorded in the [handoff](../handoffs/phase-10-acceptance.md).

## Open release gates

Phase 12/13 still own public legal URLs, publication, applicable legal/provider review and signed-device acceptance. Phase 14 owns any newly reviewed analytics permission/collection design; no old receipt or implied Continue is permission to deliver events.
