# Phase 09 — Analytics and onboarding acceptance

## Snapshot

- **Status:** Planning only; implementation not started. Telemetry export remains disabled and the original unavailable analytics Settings rows remain in the app.
- **Updated:** October 15, 2026.
- **Scope:** [Phase 09](../IMPLEMENTATION_PLAN.md#phase-09), [PRD §§4.2 and 8](../product/PRD.md), [analytics architecture](../architecture/TECH_STACK.md#9-analytics-and-sensitive-data).
- **Dependency:** [Phase 08 Settings/privacy handoff](phase-08-settings-privacy.md), including unresolved deletion, retention and account-isolation acceptance. Phase 10 owns final legal wording/publication; Phase 11 retains release/native gates.
- **Checkout:** `codex/phase-08-settings-privacy`, starting at `1a0fb67`; this follow-up changes documentation only. No app, database, provider or hosting configuration changed.

## October 15 owner decision

Anthony directed Phase 09 to use one **Terms & Privacy** onboarding page, inspired by How We Feel, as the only permission request for its disclosed analytics scope. Remove both planned analytics on/off controls from Settings. Do not add a separate feelings/reflection-metadata choice or ask again after the first reflection. Existing users with a receipt should not repeat the same acceptance; existing accounts without one must be handled alongside first installs.

This supersedes the earlier two-opt-in plan. The scope exception is only this page and its account-owned acceptance; welcome screens, questionnaire/branching flows and answer persistence remain deferred. It does not authorize future AI-context sharing, unrelated OS permissions or undisclosed material changes to collection.

## Reference and copy adaptation

Mobbin's [How We Feel Terms & Privacy screen](https://mobbin.com/screens/a06cb3a8-f066-4250-9adc-3b27d595d1fa), uploaded July 9, 2024, has a concise data explanation, Terms/Privacy links and an I Accept action. The research did not verify today's installed native app or establish that its approach satisfies JustGO's regional obligations.

Anthony proposed wording about device storage, no sale without permission and non-identifying app usage for research. Adapt the facts for JustGO: submitted activity is saved on the phone **and uploaded to private account records**; persistent pseudonymous analytics is account-linked; the planned purpose is product measurement and improvement. If feeling selections and coarse reflection lengths are transmitted, the explanation must identify that scope rather than imply only generic usage counts.

**Draft for implementation/design and Phase 10 review; not final approved legal copy:**

> **Terms & Privacy**
>
> **Your data is yours**
>
> Your saved activity and reflections are kept on your phone and uploaded to your private JustGO account for saving and recovery. We won't sell your data without your permission.
>
> To understand how JustGO is used and improve the app, we collect limited app-usage information through PostHog. This includes your selected feeling and approximate reflection length when you submit them, but never the words you wrote. Analytics can be linked to your JustGO account using a random identifier.
>
> By continuing, you agree to our **Terms of Service** and **Privacy Policy**.
>
> **I Accept**

Render both legal titles as working links. Final fields and wording must match the reviewed implementation; the no-sale sentence does not authorize selling data. Phase 09 can verify link wiring and failure feedback with clearly labeled development/test destinations. Final reviewed public URLs and release-build link verification remain Phase 10/11 gates; their later ownership does not prevent the Phase 09 implementation handoff. Keep unavailable production destinations honest and do not claim release acceptance.

## Implementation safeguards carried forward

- Store acceptance for the authenticated account with Terms, Privacy Policy and analytics-scope versions and acceptance time. Do not depend on PostHog delivery to save the receipt.
- Missing/unconfirmed acceptance blocks client and server analytics. Account recovery, slow hydration, account changes, deletion and stale/delayed callbacks must not reuse another account's acceptance. Do not forward pre-acceptance onboarding activity.
- Preserve saved/pending journal records and access to recovery/export/deletion. Analytics/provider failures never fail product saves or eligible paid access.
- Keep explicit event/property allowlists, runtime validation, stable event IDs, deduplication and best-effort delivery. No autocapture/replay, raw reflection text, audio, credentials, payment information or contact details in analytics.
- Apply the same boundary to future billing delivery; no unconditional RevenueCat-to-PostHog forwarding. Verify provider environments, identifiers, regions, retention and deletion cleanup.
- Keep applicable withdrawal/objection requests and effective client/server suppression in Phase 10's review despite the absence of a Settings toggle. The single-page decision is not evidence that bundled acceptance suffices in every intended region.

## Documentation and evidence

The plan, PRD, architecture/app-shell/design guidance, decision register, legal drafts/inventory/review, foundation notes and README/handoff index now distinguish the approved future experience from disabled current telemetry. Historical Phase 08 screenshots, tests and dated two-choice records remain historical evidence; the October 15 decision supersedes their future requirements.

Verification for this documentation update:

- Prettier formatting and final formatting check across all 15 changed Markdown files: **pass**.
- `git diff --check`: **pass**.
- Added relative-link destination check: **25 links pass**; this checks local file existence, not public URL or browser behavior.
- Independent documentation review: resolved the remaining two-choice phase-summary text, the Phase 09/10 public-link sequencing loop, and the ambiguous phrase about disabled export. Current and planned behavior are distinguished.
- Reviewed the full contents of each changed directory; existing responsibility groups remain appropriate, so no file moves were needed.

Application tests, database tests and interactive/native UI checks are not applicable because no code or UI changed. No implementation gate is closed and no publication is authorized.

## Remaining work

1. Complete Phase 08 dependency acceptance, then implement the page, receipt boundary, removal of Settings rows, explicit events and provider cleanup in Phase 09.
2. Add automated coverage for receipt persistence, existing users, slow hydration, account changes, missing acceptance, payload exclusions, retries, provider failures, deletion and applicable privacy requests. Verify the page and absent analytics controls in the in-app browser and relevant native surface.
3. Run Phase 09's required code/database/coverage checks and add actual implementation evidence here; none has run for this planning-only update.
4. Phase 10 reviews exact collection, single-page acceptance, regional requirements and privacy-request handling, finalizes legal copy and public links, and records unresolved release conditions. Phase 11 retains native/staging/release verification.
