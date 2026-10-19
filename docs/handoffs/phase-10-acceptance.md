# Phase 10 — Terms & Privacy entry

## Summary and status

The October 19 owner decision replaces the earlier receipt system with ordinary legal links and Continue-based account creation. The source, local migration and existing test-server removal rollout are verified. Product analytics and ordinary Sentry delivery remain disabled. Public legal-site hosting is still owner-deferred.

## Decisions and behavior

- Welcome Continue opens the existing Terms & Privacy route without creating an account. That page's Continue creates an ordinary account and enters Challenges through the existing access/preparation flow.
- The entry screen shows one short phone/cloud saving and no-sale summary, adapted from the How We Feel Paper reference without its incompatible on-device-only or active research-analytics claims. The owner removed Sentry/analytics paragraphs and the development-release notice; the full Privacy Policy remains linked.
- Opening Terms or Privacy opens its configured webpage. No account request, document-view tracking, legal receipt, accepted-version record or forced reacceptance is involved.
- Existing accounts and recovered accounts proceed through access without a legal check or replacement account. An explicit separate-account choice retains the existing credential/recovery safeguards.
- Ordinary identity requests contain only their credential/device/session proof. New-account response loss retries the same persisted proof, including across restart; no receipt field is sent or saved.
- The native vault removes legacy bootstrap legal metadata during a validated read, preserving the exact pending proof and all known cancellation/deletion safety metadata. A failed rewrite is retryable and never resets Keychain.
- The receipt controller, startup/foreground requests, GET/PUT acceptance routes, contract helpers and export receipt fields are removed. The internal /acceptance route name remains for navigation continuity.
- Forward migration 0018 drops only account_acceptances, without CASCADE. Historical migration 0017 stays immutable. All twelve retained tables, including journals, credentials, sessions, deletion tombstones and the independent analytics restriction marker, are preserved.

## Invariants to preserve

Continue is an account-creation action, not permission for future analytics. Product analytics remains disabled; Phase 14 must review the actual collection/permission design before activation and must not silently restore the rejected tracking or gating system. Independent analytics restrictions never grant permission.

Account creation remains explicit and idempotent. Preserve recovery, account isolation, synchronization, export/deletion, timeout/duplicate guards and ordinary access verification. Activity PATCH acknowledgements and account-deletion confirmations are unrelated safety records and remain intact.

The first-deck handoff retains the Terms presentation until the native cover is shown, then waits for the same account's deck, layout and images. Recovery cancels that handoff. Preparation retries do not recreate the account. Product routes also require a connected account, no Welcome/deletion state and verified access, so stale access state cannot expose a new installation's Home screen.

## Setup and rollout

The prior October 18 rollout through migration 0017 and the earlier October 19 matching-version repair are historical; they do not describe the current legal flow. Their protected operational evidence remains under ignored .local/ storage. Do not reapply those migrations or restore the receipt-dependent API after contraction.

The compatible API was deployed before registered migration 0018 removed its unused legal table. The existing phone alias `https://justgo-two.vercel.app` now resolves to Ready deployment `dpl_DGBKFq22xPwHvNiBi53oh4cZRYQ1`, API `0.12.0`. The verified-TLS migration advanced the exact history from 18 to 19 entries, removed the receipt table, and compared row counts and all-column fingerprints for all twelve retained tables inside the transaction before commit. All matched. No private rows or old legal values were exported or backed up for this removal. Nonprivate migration/probe evidence remains in ignored `.local/legal-no-tracking-rollout/`.

Montréal compute, deployment protection and environment metadata were preserved. The hosted synthetic probe verified ordinary bootstrap and exact-proof retry, recovery to the same account, receipt-free export, retired GET/PUT returning 404 and preservation of the independent privacy restriction. Its account data was deleted through the normal account endpoint, with only existing security tombstones retained; the private synthetic proof was removed after confirmed cleanup. Hosted legal routes remain unpublished.

Local documents are served from `sites/legal/dist/` only. Explicit private-LAN/loopback HTTP destinations work only in development; release still requires reviewed public HTTPS URLs. Keep the Mac and phone on the same network and restart Metro after environment/module changes. The legal website remains unpublished with effective dates pending.

## Verification and open gates

Focused mobile tests cover ordinary Continue, links without account mutations, exact-proof retries, direct recovery/export/deletion, the preparation cover and legacy vault cleanup. Backend tests cover strict ordinary bootstrap requests, retired endpoints, receipt-free export and the forward migration. The preservation/restoration rehearsal verifies removal of old legal rows with byte-for-byte preservation of all twelve retained tables.

`npm run check` passed, including fresh online Expo Doctor, all workspace/journey types, lint, formatting, tooling and workspace tests. Full `npm run test:coverage` passed every global and critical floor, including the database and migration rehearsal. All 43 saved journeys passed. Cold web/iOS JavaScript exports and the independent exported-web smoke passed. A separate in-app side-panel walkthrough opened both documents with zero accounts created, then reached usable Challenges after Continue; its disposable local account and rate buckets were removed. The phone Metro server was restarted with `--lan --clear` against the updated test API and local static reader.

Browser/component/export checks do not establish native Keychain behavior, physical-phone links, VoiceOver or signed-build acceptance; these remain Phase 13 gates. Anthony still needs to reload the installed development app for the current bundle.

Phase 12/13 still own public notices/hosting, applicable provider/regional review, final paid-stage disclosures and signed release acceptance. No Git publication, provider activation, paid upgrade, native distribution or App Store submission is authorized by this handoff.
