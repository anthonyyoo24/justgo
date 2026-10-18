<a id="phase-10"></a>

# Phase 10 — Terms & Privacy acceptance

**Status:** Implemented, verified and owner-reviewed; existing hosted test API updated; analytics exporter remains disabled

## Outcome

New and existing accounts have one understandable Terms & Privacy acceptance page and an account-owned, versioned receipt. Recovery and saved activity stay safe, and analytics remains disabled until Phase 14.

## Decisions in force

- Dependencies: 09; preserve Phase 08 identity/deletion safeguards and Phase 08A boundaries.
- Acceptance: PRD §4.2, §8, AC-02 and AC-16; the October 15 single-page decision remains in force.
- The [handoff](../handoffs/phase-10-acceptance.md) records the approved navy design, draft versions and implemented boundary; final legal review/publication belongs to Phase 12.
- The October 18 analytics deferral preserves this implemented receipt boundary and keeps export disabled through paid launch. Phase 12 must align launch copy/legal/scope versions with that disabled state; Phase 14 reviews notices and current acceptance again before post-launch activation. No runtime copy or receipt changes are part of this reordering.
- The October 18 refinement removes account shortcuts from this page, uses a short red error, and places the agreement directly above the bottom I Accept button. Anthony separately authorized the existing hosted test API update; no Git or release publication follows.

## Implement

- Implement one Terms & Privacy onboarding page with a short data explanation, Terms of Service and Privacy Policy links, and an explicit continuation/acceptance action. This is the only permission request for the Phase 14 analytics scope. Verify legal-link wiring and failure behavior against clearly labeled development/test destinations while Phase 12 finalizes public URLs; final public links remain a Phase 12/13 release gate, not a circular dependency for Phase 10 implementation handoff. Remove both unavailable analytics Settings rows and do not replace them with switches or a later prompt. Reuse the existing Welcome: Continue opens acceptance without creating an account; I Accept creates the account and receipt. Additional welcome/questionnaire screens remain deferred.
- Persist an account-owned receipt identifying the accepted Terms, Privacy Policy and analytics scope versions and acceptance time. Apply the same acceptance boundary on client and server; unconfirmed/missing acceptance blocks forwarding, including delayed work. Handle existing accounts as well as new installs without reusing another account's receipt during recovery, account changes or slow hydration. Keep recovery/export/deletion reachable and preserve saved/pending activity; analytics/provider failures must not interfere with cloud saving or eligible paid access.
- Adapt the How We Feel copy to actual JustGO behavior: submitted activity is saved on the phone and uploaded to private account records; persistent pseudonymous identifiers are not anonymous/non-identifying; the purpose is understanding app usage and improving JustGO. The single explanation and linked policy must cover the actual transmitted fields, including feeling selections and coarse reflection-length categories if included. Use the disclosed copy recorded by the implementation and design guide, with final wording and regional sufficiency reviewed in Phase 12; a bundled acceptance is a product decision, not an established legal exemption.
- Implement and test reusable account-eligibility checks for client/server analytics adapters to consume in Phase 14. Missing/unconfirmed acceptance, slow hydration, recovery, account changes, stale callbacks, deletion and applicable privacy requests must fail closed. Do not enable a provider or replay pre-acceptance activity in this phase.
- Verify first use, existing accounts, accepted-version reuse, acceptance persistence/failures, account isolation and legal-link success/failure. Update PRD/design/inventory descriptions of acceptance together at closeout.

## Keep out

- No analytics Settings switches, separate feeling/length permission, later analytics prompt, additional welcome/questionnaire flow or questionnaire persistence.
- No PostHog/crash exporter activation or dependency of product saving/paid access on acceptance/provider success.
- No final legal publication, release deployment or App Store submission. Clearly labeled development/test legal links are sufficient for this phase's wiring evidence; final reviewed URLs remain Phases 12–13.

## Ready to hand off when

- [x] One page, working labeled legal links/failure feedback and account-owned legal/scope versions and acceptance time have automated and interactive evidence for new/existing accounts.
- [x] No analytics Settings rows or later prompt remain; confirmed acceptance of the same versions is reused only for its owning account.
- [x] Eligibility checks fence missing acceptance, hydration, account changes, stale work, deletion and applicable privacy requests; recovery/export/deletion and saved/pending activity remain accessible/preserved.
- [x] Analytics export stays disabled. Phase 14 has a tested receipt/eligibility boundary to consume, without reimplementing acceptance.
- [x] Required phase checks pass; update the handoff with actual evidence, setup and owned remaining gates.

## Open gates for Phases 12–14

- Phase 14 verifies the receipt checks at actual client/server delivery and deletion/provider boundaries.
- Phase 12 reviews wording, regional sufficiency, privacy-request handling and final public URLs; Phase 13 verifies the signed release.
