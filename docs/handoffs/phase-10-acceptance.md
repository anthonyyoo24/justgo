# Phase 10 — Terms & Privacy acceptance

## Summary and status

**Status:** Planning only; implementation not started. Telemetry export is
disabled and the unavailable analytics Settings rows remain in the app.
[Phase 10](../implementation-plan/phase-10-acceptance.md) owns implementation
scope. [Phase 08](phase-08-settings-privacy.md) records the completed dependency
and retained release gates. Phase 13 owns final legal wording/publication;
Phase 14 owns release and native acceptance.

## Decisions and why

Anthony chose one **Terms & Privacy** onboarding page as the only permission
request for its disclosed analytics scope on October 15, 2026. Remove both planned
analytics Settings controls; do not add a separate feelings/reflection-metadata
choice or a later analytics prompt. Accounts with the same accepted versions
should not repeat acceptance; existing accounts without a receipt join first
installs at this boundary.

The exception covers this page and account-owned acceptance only. Welcome screens,
questionnaires, branching flows and answer persistence remain deferred. It does
not authorize future AI-context sharing, unrelated OS permissions or undisclosed
material changes to collection.

The reference is Mobbin’s [How We Feel Terms & Privacy screen](https://mobbin.com/screens/a06cb3a8-f066-4250-9adc-3b27d595d1fa),
uploaded July 9, 2024. It supplies a concise explanation, legal links and an
acceptance action; it is not evidence of JustGO’s regional legal sufficiency.

**Draft for implementation/design and Phase 13 review; not final approved legal copy:**

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

The final fields and explanation must match the reviewed implementation. Activity
is saved on the phone and uploaded to private account records; a persistent random
analytics identifier is pseudonymous and account-linked, not anonymous. The
no-sale sentence does not authorize selling data.

The same approval also requires one-time shuffled/saved venue decks, the last
selected venue remembered on the phone, and removal of the post-challenge
Reflection top exit. These app changes are independent of analytics delivery;
the [Phase 09 app changes](../implementation-plan/phase-09-app-continuity.md#phase-09-app-changes)
own their full specification.

## Behavior that changed

Planning documents now specify the single page and versioned account receipt.
No app, database, provider or hosting behavior has changed. Phase 10 replaces the unavailable Settings rows and implements the page and receipt boundary. Phase 11 owns explicit events and vendor cleanup; Phase 12 owns app crash reporting.

Both legal titles must be working links. Clearly labeled development/test URLs
can verify wiring and failure feedback during Phase 10. Final reviewed public
URLs and release-build checks belong to Phases 13/14, so publication is not a
circular prerequisite for the Phase 10 implementation handoff.

## Invariants to preserve

- Save the authenticated account’s Terms, Privacy Policy and analytics-scope
  versions and acceptance time independently of PostHog delivery.
- Missing or unconfirmed acceptance blocks client and server analytics. Recovery,
  slow hydration, account changes, deletion and delayed callbacks cannot reuse
  another account’s receipt. Never forward pre-acceptance onboarding activity.
- Preserve saved/pending journal records and recovery/export/deletion access.
  Provider failure cannot fail product saves or eligible paid access.
- Retain event/property allowlists, runtime validation, stable IDs, deduplication
  and best-effort delivery. Exclude autocapture/replay, raw reflection text,
  audio, credentials, payment information and contact details.
- Future billing delivery uses the same boundary; no unconditional
  RevenueCat-to-PostHog forwarding. Verify provider environments, identifiers,
  regions, retention and deletion cleanup before activation.

## Problems that could recur

- Generic “non-identifying usage” copy would conceal the planned account linkage,
  feeling selections and coarse reflection-length categories. Review the actual
  transmitted fields against the explanation and policy together.
- A single-page product decision does not prove bundled acceptance is sufficient
  in every intended region. Phase 13 must still review withdrawal/objection
  handling and effective client/server suppression without a Settings toggle.
- Historical two-choice specifications are superseded by the October 15 decision;
  they must not reintroduce an additional prompt during implementation.

## Setup or environment changes

None. Telemetry export remains disabled. Before analytics activation, follow the [Phase 11 plan](../implementation-plan/phase-11-analytics.md), the
[Phase 10 acceptance plan](../implementation-plan/phase-10-acceptance.md) and implemented
[analytics boundary](../architecture/TECH_STACK.md#current-access-and-disabled-integrations).
Use disposable fixtures and keep legal test destinations visibly identified.

## Open gates

| Gate                                                                    | Owner                            | Required phase | Done when                                                                                                     |
| ----------------------------------------------------------------------- | -------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| Saved shuffled decks, remembered venue and Reflection exit              | Implementation owner             | 09             | Phase 09 persistence, account-isolation and navigation checks pass                                            |
| Page, account-owned receipt, eligibility checks and Settings cleanup    | Implementation owner             | 10             | New/existing accounts, receipt isolation, persistence, legal links and failure handling have passing evidence |
| Explicit events, actual forwarding, provider failures and cleanup       | Implementation owner             | 11             | Phase 11 consumes receipt checks and passes payload, deduplication, delayed-work and cleanup cases            |
| App crash/error reporting                                               | Implementation owner             | 12             | Configured delivery, redaction and recovery have evidence                                                     |
| Collection, final legal copy, regional sufficiency and privacy requests | Anthony and legal reviewer       | 13             | Actual collection and request handling are reviewed and approved                                              |
| Public legal URLs and signed/native release acceptance                  | Implementation owner and Anthony | 13–14          | Published reviewed destinations and remaining release gates pass                                              |

## Final verification

October 17, 2026: the documentation-only phase split passed formatting checks,
`git diff --check` and local Markdown link/anchor validation. The original
measurement specification and draft acceptance copy were checked for preservation.
An independent planning review checked scope, dependencies and gate ownership.
Changed directories were reviewed; their existing responsibility groups remain suitable.

Application/database tests and interactive/native checks were not applicable to
this documentation-only change. No implementation or release gate is closed.
The earlier planning evidence remains in Git; each new phase must record its own
actual final checks and handoff when implemented. Phase 08A's evidence remains in
its own handoff.
