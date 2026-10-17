<a id="phase-09"></a>

# Phase 09 — Analytics & consent

**Status:** Not started; analytics exporter disabled.

## Outcome

Useful product measurement follows one Terms & Privacy onboarding acceptance for the disclosed analytics scope, with no analytics on/off controls in Settings or later analytics permission prompt. Analytics failures never interrupt product saves. Venue decks are shuffled once and resume where the user left off, the last venue is remembered, and Reflection has a single bottom exit.

## Decisions in force

- Dependencies: 08, including verified account isolation and deletion/cleanup behavior, and 08A's documentation and folder structure.
- Acceptance: PRD §8, AC-16 · Tech §9; acceptance 8, 16–17
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Implement the [measurement plan](phase-09-analytics.md#phase-09-measurement) below: its event allowlist with validated property schemas, `start_id` linking, and metric definitions in the event dictionary. Separate UI intent from confirmed domain outcomes. Challenge Start/Give up remain local product actions with no required backend attempt save. Only the Terms & Privacy onboarding page is newly approved; welcome/questionnaire onboarding and inactive purchases do not gain new flows merely to generate analytics.
- Confirm PostHog project/environment separation, pseudonymous account identifiers, region, retention and account-deletion cleanup. The architecture's 90-day event retention is a proposal to approve and configure, not an existing guarantee. Reuse Phase 08 deletion ownership and cleanup behavior for the configured analytics provider.
- Implement one Terms & Privacy onboarding page with a short data explanation, Terms of Service and Privacy Policy links, and an explicit continuation/acceptance action. This is the only permission request for the Phase 09 analytics scope. Verify legal-link wiring and failure behavior against clearly labeled development/test destinations while Phase 10 finalizes public URLs; final public links remain a Phase 10/11 release gate, not a circular dependency for Phase 09 implementation handoff. Remove both unavailable analytics Settings rows and do not replace them with switches or a later prompt. Welcome/questionnaire screens remain deferred.
- Persist an account-owned receipt identifying the accepted Terms, Privacy Policy and analytics scope versions and acceptance time. Apply the same acceptance boundary on client and server; unconfirmed/missing acceptance blocks forwarding, including delayed work. Handle existing accounts as well as new installs without reusing another account's receipt during recovery, account changes or slow hydration. Keep recovery/export/deletion reachable and preserve saved/pending activity; analytics/provider failures must not interfere with cloud saving or eligible paid access.
- Adapt the How We Feel copy to actual JustGO behavior: submitted activity is saved on the phone and uploaded to private account records; persistent pseudonymous identifiers are not anonymous/non-identifying; the purpose is understanding app usage and improving JustGO. The single explanation and linked policy must cover the actual transmitted fields, including feeling selections and coarse reflection-length categories if included. Use the draft in the handoff, with final wording and regional sufficiency reviewed in Phase 10; a bundled acceptance is a product decision, not an established legal exemption.
- Activate explicit PostHog events through consent-aware client/server adapters. Server-confirmed events follow successful transactions and use stable domain-derived IDs; client-only interactions use the approved single consent-aware boundary. Record occurrence/receipt timestamps and prevent retry double-counting. Delivery is best effort and analytics failures must not fail a saved completion or reflection.
- Allow feeling codes and coarse reflection-length categories only within the disclosed, accepted and reviewed analytics scope, with no separate sensitive-metadata switch. Compute approved categories without exporting the words. Disable autocapture/session replay and exclude journal text, audio, credentials, payment details and contact data from event payloads. Recheck acceptance and account eligibility before delayed delivery. Preserve enforcement of deletion and applicable withdrawal/objection requests through the reviewed privacy-request process; no Settings toggle does not remove these rights.
- Route future billing measurement through the same server consent checks; do not enable unconditional RevenueCat-to-PostHog forwarding. Preserve Phase 07A's activation sequencing and verify the integration again before paid launch.
- Create a small product dashboard for the agreed usage, challenge-flow and return-rate questions. Define cohort anchors, eligible observation windows and missing-data handling; describe the actual population with recorded acceptance and eligible events. Collect a baseline before setting targets. Sensitive-metadata comparisons use only the reviewed scope; retrospective feelings and retention correlations do not establish wellbeing improvement or causation.
- Verify first-use and existing-account acceptance, persistence, hydration/account changes, stale callbacks, allowed/blocked payloads, duplicate delivery, provider outages and deletion/privacy-request cleanup with relevant automated and interactive evidence. Verify the absence of analytics Settings controls and later analytics prompts. Supply actual collection/provider facts and acceptance copy to Phase 10's data inventory and public notices. Diagnostic redaction remains a Phase 08 responsibility and server health monitoring a Phase 11 pre-beta task.
- Add app crash and error reporting (for example Sentry) so production crashes and unhandled failures are visible [SEC-1]. Scrub reports to the same allowlist as server logs: never reflection text, feelings, tokens, recovery keys or request bodies. Connect it to the root `ErrorBoundary` from Phase 08. Settle with Phase 10 whether it falls under the onboarding acceptance or the Privacy Policy alone, and record the provider in the data inventory.

<a id="phase-09-measurement"></a>

**Measurement plan**

The aim is to learn which challenges and venues people take on, how often they finish, how feelings and reflections relate to what people do next, and what brings them back within a day and across consecutive days.

**Questions the events must answer**

- Which challenges are accepted (swipe right) or passed (swipe left), with cards shown as the denominator, by challenge and venue.
- Which venues people are in when they accept a challenge.
- How often a started challenge is completed, given up or left without an outcome, by challenge and venue.
- After a completion or a give-up, how often the user starts another challenge in the same session, the same day, the next day and later, and how often they stop using the app.
- How often users record a feeling and/or write a reflection after each challenge, and which feelings follow which challenges.
- What users do after each feeling: for example, whether "A lot worse" is followed by another challenge or by leaving the app, and how many challenges follow "A lot better" within the next hour and day.
- How return rates differ between users who record only a feeling, users who also write a reflection, and users who write longer reflections.

**Event allowlist**

Every event carries the pseudonymous account identifier, occurrence timestamp, app version and a stable event ID for deduplication (the event name with its `start_id` or `attempt_id` where one exists). Properties not listed here are not sent.

| Event                 | When it fires                                           | Properties                                                              |
| --------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `app_opened`          | The app starts or returns to the foreground             | —                                                                       |
| `app_backgrounded`    | The app leaves the foreground                           | —                                                                       |
| `venue_selected`      | The user taps a venue pill                              | `venue`, `previous_venue`                                               |
| `card_shown`          | A card becomes the front, actionable card               | `challenge_id`, `placement_id`, `venue`                                 |
| `card_passed`         | Swipe left or X                                         | `challenge_id`, `placement_id`, `venue`                                 |
| `challenge_started`   | Swipe right or heart                                    | `start_id`, `challenge_id`, `placement_id`, `venue`                     |
| `challenge_given_up`  | Give up                                                 | `start_id`, `challenge_id`, `placement_id`, `venue`                     |
| `challenge_completed` | Completed, after the phone save succeeds                | `start_id`, `attempt_id`, `challenge_id`, `placement_id`, `venue`       |
| `reflection_saved`    | Save Reflection on the post-challenge Reflection screen | `attempt_id`, `has_feeling`, `has_text`, `feeling`, `reflection_length` |
| `reflection_skipped`  | Skip on the post-challenge Reflection screen            | `attempt_id`                                                            |
| `progress_viewed`     | The Progress screen opens                               | —                                                                       |
| `day_sheet_opened`    | A calendar day sheet opens                              | —                                                                       |

- `feeling` uses the existing contract codes (`a_lot_worse` … `a_lot_better`) and is present only when a feeling was chosen.
- `reflection_length` is a word-count bucket computed on the phone (`1-9`, `10-29`, `30-79`, `80+`) and is present only when text was submitted. The words themselves never enter an event.
- Billing events remain owned by Phase 07A and the billing bullet above.

**Linking a start to its outcome**

- On swipe right, the app generates a random `start_id` and keeps it with the in-memory challenge start (card, start time and time zone). `challenge_started`, `challenge_given_up` and `challenge_completed` all carry it, so each outcome matches its start even when an event is lost or arrives late. A start with no outcome event within the window set in the event dictionary counts as left without an outcome.
- `start_id` is analytics-only. Do not add it to the saved attempt, the API contract or PostgreSQL. The attempt UUID is still created when Completed is tapped; `challenge_completed` carries it so reflection events link to the same completion.
- Send `challenge_completed` from the client through the single acceptance-aware analytics boundary once the phone save succeeds, deduplicated by attempt UUID, rather than waiting for the backend upload. PostgreSQL remains the exact record for reps, calendar and streaks; PostHog covers accepting users with best-effort delivery and is used for rates and patterns.

**Event dictionary and analysis**

- Write `docs/architecture/ANALYTICS_EVENTS.md`: one entry per event with when it fires, each property's meaning and allowed values, and the metric definitions (sessions, cohort anchors, observation windows and the left-without-outcome window). Keep it in step with the runtime schemas.
- Answer the questions above from the PostHog dashboard. The events above are sufficient; no database access is needed for this analysis.

**Not recorded:** time spent viewing a card, seconds elapsed or the timer reaching zero (no goal-reached event), how the user left the Reflection screen, and whether a venue was the launch default or chosen by the user.

<a id="phase-09-app-changes"></a>

**App changes**

Owner-approved product changes outside analytics. They do not depend on PostHog or the acceptance page, so implement and verify them first.

1. **Shuffled, saved venue decks.**
   - When an account first has the catalog on this phone, shuffle each venue's placements once, using an injected random source so tests control the order.
   - Save each venue's card order and current front card on the phone, scoped to the account beside the downloaded catalog. Skip, give up and completion keep rotating the saved order as today; on relaunch each venue resumes at the same card.
   - When a catalog refresh adds placements, insert them at random positions in the saved order; drop removed or inactive placements. Never fabricate cards.
   - Missing, unreadable or invalid saved state falls back to a fresh shuffle without blocking Home. Saving this state is best effort: a failed write keeps the in-memory deck working and never shows the saving or loss-risk banner.
   - An account change loads only that account's saved order.
2. **Saved last venue.** Save the selected venue with the deck state. Relaunch opens on it; new accounts and missing or unknown saved values open on Streets.
3. **Reflection exit.** Remove the top Back/X control from the post-challenge Reflection screen. The bottom action (Skip with no input, Save Reflection otherwise) becomes the only exit; the screen's swipe-back gesture is already disabled. Remove the Save / Keep editing / Discard prompt that only Back/X reached. Verify the bottom action stays visible and reachable with the keyboard open on the smallest supported iPhone and at large text sizes. The Progress day-sheet editor keeps its existing dirty-close prompt.
4. **Documentation.** Update PRD §5.1 (deck order and venue persist instead of resetting on a fresh launch, with the one-time shuffle), PRD §5.4 (bottom action is the only exit), PRD §8 (align the event list with the allowlist above), the venue-stack line in `product/CHALLENGES.md`, and the data inventory (deck and venue state stays on the phone and is not uploaded or sent to analytics).

**Order:** app changes 1–3 → Terms & Privacy page and acceptance receipt → event allowlist and adapters → event dictionary and dashboard.

## Keep out

- No analytics Settings switches, separate sensitive-metadata permission request, later analytics prompt, pre-acceptance forwarding, raw journal/credential/audio payloads, session replay/autocapture, unconditional vendor forwarding or invented conversion/wellbeing targets. Analytics delivery success is never a requirement for a product save or paid access.
- No welcome/questionnaire onboarding beyond the approved Terms & Privacy page, billing activation, experiments, transactional analytics outbox or other unimplemented product feature merely for measurement. This analytics decision does not authorize unrelated OS permissions or future AI-context sharing.
- No final legal publication, App Store submission or release deployment; those belong to Phases 10 and 11 under their separate authorization rules.

## Ready to hand off when

- [ ] One understandable Terms & Privacy page has verified legal-link wiring/failure behavior and an account-owned, versioned acceptance receipt (final public URLs remain Phase 10/11 acceptance); new and existing accounts cannot forward analytics before acceptance. No analytics switches remain in Settings and no later analytics prompt is added.
- [ ] Account changes, missing acceptance, deletion and applicable privacy requests fence delayed client/server delivery. Recovery/data controls remain reachable; saved/pending activity and product saves survive acceptance/provider failures.
- [ ] Explicit event schemas, stable IDs, deduplication and provider-failure isolation have passing evidence; transmitted payloads contain only approved fields.
- [ ] Provider region, identifiers, retention and deletion cleanup are configured/verified and recorded for Phase 10; future billing integration checks remain explicitly owned by 07A/11 until activated.
- [ ] Initial product reports have documented metric definitions, eligible population and baseline collection; no unsupported wellbeing or all-user claim is made.
- [ ] Venue decks shuffle once per account and resume with the saved order and last venue after relaunch, account change and catalog refresh; invalid saved state falls back without blocking Home. Reflection has no top Back/X, and its bottom action stays reachable with the keyboard open.
- [ ] The measurement-plan events, including `start_id` linking, send only allowlisted properties; the event dictionary is written; and the measurement questions can be answered from the dashboard.
- [ ] Save the phase handoff with exact changes, issues/fixes, test/browser/device evidence and any open gates; link it from the handoff index.

## Open gates for Phase 11

- Verify consent, error reporting, configured providers, privacy disclosures and analytics cleanup on the signed beta/release build.
- Carry actual collection/provider facts and remaining physical-device acceptance forward.
