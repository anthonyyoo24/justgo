<a id="phase-17"></a>

# Phase 17 — Product analytics & PostHog dashboard

**Status:** Deferred until after paid launch; analytics exporter disabled

## Outcome

Explicit PostHog events, subject to a reviewed permission and collection design, answer the agreed challenge-flow and return-rate questions. A dashboard inside PostHog presents those reports without exposing reflection text or blocking product saves.

## Decisions in force

- Dependencies: Phase 14 paid launch, Phase 09's final deck/Reflection behavior and Phase 12's launch notices. This phase is not required for beta or paid launch. The prior Phase 10 account-owned legal receipt/controller/version gate has been removed by owner direction and is not an available dependency.
- Acceptance: PRD §8, AC-16; preserve the October 15 event allowlist and analytics-only `start_id` decision.
- Reuse Phase 08 deletion ownership. Before implementing delivery, review the actual provider/payloads, lawful basis, required permission and privacy choices with the owner and applicable reviewer. Update the inventory, public notices and App Privacy disclosures established in Phases 12–14. Continue, document views and any historical legal receipts grant no analytics permission. Do not silently reintroduce legal-view tracking, accepted-version persistence or per-account document-version gates. Verify the actual signed update before enabling delivery.

- Phase 13 establishes local-only feelings/text and manual backup. The earlier feeling, reflection-presence and length proposals below do not authorize exporting those fields under that baseline. Reconcile the allowlist and public promises through a separately reviewed collection/permission decision before activation; no historical backfill or automatic change to local storage is allowed.

## Implement

- Resolve and document a collection/permission design compatible with the owner's removal of legal tracking and version gates before activation. Evaluate first use, existing launch accounts, required privacy choices and withdrawal/objection handling; do not treat ordinary Continue as consent or revive the removed receipt/controller automatically. The retained analytics restriction marker can suppress processing and never proves permission. Keep delivery disabled while this design remains unresolved.
- Implement the [measurement plan](phase-17-analytics.md#phase-17-measurement) below: its event allowlist with validated property schemas, `start_id` linking, and metric definitions in the event dictionary. Separate UI intent from confirmed domain outcomes. Challenge Start/Give up remain local product actions with no required backend attempt save. Welcome/questionnaire onboarding and extra product features solely for analytics remain outside scope; this plan does not authorize a replacement permission UI or tracking mechanism.
- Confirm PostHog project/environment separation, pseudonymous account identifiers, region, retention and account-deletion cleanup. The architecture's 90-day event retention is a proposal to approve and configure, not an existing guarantee. Reuse Phase 08 deletion ownership and cleanup behavior for the configured analytics provider.
- Activate explicit PostHog events only through client/server adapters that enforce the reviewed permission/collection design. Server-confirmed events follow successful transactions and use stable domain-derived IDs; client-only interactions use one reviewed forwarding boundary. Record event occurrence and delivery-receipt timestamps and prevent retry double-counting. These are analytics delivery records, not legal acceptance/view receipts. Delivery is best effort and analytics failures must not fail a saved completion or reflection. Keep provider I/O outside owner transactions.
- Allow feeling codes and coarse reflection-length categories only within the disclosed, reviewed and lawfully permitted analytics scope. Compute approved categories without exporting the words. Disable autocapture/session replay and exclude journal text, audio, credentials, payment details and contact data from event payloads. Recheck the applicable permission/privacy state and account ownership before delayed delivery. Preserve enforcement of deletion and applicable withdrawal/objection requests through the reviewed privacy-request process; the absence of a Settings toggle does not remove these rights.
- Route billing measurement through the same reviewed server forwarding rules; do not enable unconditional billing-provider-to-PostHog forwarding. Phase 16 billing and paid launch precede this phase. Verify any now-active billing integration at analytics activation, without making purchases or paid access depend on analytics.
- Create a small product dashboard for the agreed usage, challenge-flow and return-rate questions. Define cohort anchors, eligible observation windows and missing-data handling; describe the actual population covered by the reviewed collection design and eligible events. Collect a baseline before setting targets. Sensitive-metadata comparisons use only the reviewed scope; retrospective feelings and retention correlations do not establish wellbeing improvement or causation.
- Verify actual client/server forwarding against the newly reviewed design: first use, existing launch accounts, missing or withdrawn required permission, hydration/account changes, stale callbacks, allowed/blocked payloads, duplicate delivery, provider outages and deletion/privacy-request cleanup. Never backfill pre-activation history or forward activity collected before the applicable permission and activation conditions were met. Preserve account isolation, product saves and existing identity/deletion acknowledgements.
- Reconcile actual collection/provider facts with the data inventory, public notices and release disclosures from Phases 12–14 before activation, under their existing review/publication permissions. Update PRD §8 to match the allowlist at closeout. Diagnostic redaction stays with Phase 08; app crash reporting belongs to Phase 11 and server health monitoring to Phase 14.

<a id="phase-17-measurement"></a>

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
- Billing events remain owned by Phase 16 and the billing bullet above.

**Linking a start to its outcome**

- On swipe right, the app generates a random `start_id` and keeps it with the in-memory challenge start (card, start time and time zone). `challenge_started`, `challenge_given_up` and `challenge_completed` all carry it, so each outcome matches its start even when an event is lost or arrives late. A start with no outcome event within the window set in the event dictionary counts as left without an outcome.
- `start_id` is analytics-only. Do not add it to the saved attempt, the API contract or PostgreSQL. The attempt UUID is still created when Completed is tapped; `challenge_completed` carries it so reflection events link to the same completion.
- Send `challenge_completed` from the client through the single reviewed analytics boundary once the phone save succeeds, deduplicated by attempt UUID, rather than waiting for the backend upload. PostgreSQL remains the exact record for reps, calendar and streaks; PostHog covers the population permitted by the reviewed collection design with best-effort delivery and is used for rates and patterns.

**Event dictionary and analysis**

- Write `docs/architecture/ANALYTICS_EVENTS.md`: one entry per event with when it fires, each property's meaning and allowed values, and the metric definitions (sessions, cohort anchors, observation windows and the left-without-outcome window). Keep it in step with the runtime schemas.
- Answer the questions above from the PostHog dashboard. The events above are sufficient; no database access is needed for this analysis.

**Not recorded:** time spent viewing a card, seconds elapsed or the timer reaching zero (no goal-reached event), how the user left the Reflection screen, and whether a venue was the launch default or chosen by the user.

## Keep out

- No silent restoration of legal acceptance/view receipts, accepted-version persistence or version-driven navigation. Ordinary Continue and old receipts cannot supply analytics permission. This plan does not approve new analytics Settings switches or a replacement permission flow; settle the actual permission/collection design before activation.
- No raw journal/credential/audio payloads, session replay/autocapture, unconditional vendor forwarding or invented conversion/wellbeing targets.
- No billing activation, experiments, transactional analytics outbox, extra product feature solely for measurement or unrelated OS/AI-context permission.
- Analytics delivery success never gates product saves or eligible paid access. No final legal publication, App Store submission or release deployment.

## Ready to hand off when

- [ ] Explicit event schemas, stable IDs, occurrence/receipt times, deduplication, `start_id` linking and provider-failure isolation have passing evidence; transmitted properties match the allowlist.
- [ ] The actual permission/collection design is reviewed before activation and does not infer permission from Continue, document views or historical receipts or silently reintroduce the rejected tracking/version gates.
- [ ] Actual client/server delivery and delayed work enforce the reviewed design, account ownership, deletion and applicable privacy requests; saved/pending activity and product saves survive provider failures.
- [ ] Provider environments, pseudonymous identifiers, region, retention and deletion cleanup are configured/verified in the inventory and reviewed notices; any active Phase 16 billing integration uses the same reviewed forwarding rules at analytics activation.
- [ ] Updated notices/disclosures and any required privacy choices are reviewed before activation for new and existing launch accounts, with no replay of pre-activation history.
- [ ] ANALYTICS_EVENTS.md defines events and metrics, including sessions, cohort anchors, observation/missing-outcome windows and eligible population; the PostHog dashboard answers the measurement questions and baseline collection is documented before setting targets.
- [ ] Reports state their actual eligible/best-effort population and do not imply wellbeing improvement or causation from correlations.
- [ ] Required automated/phase and interactive checks pass; save the handoff with final evidence and remaining gates, and link it from the index.

## Open gates before analytics activation

- Resolve the actual permission/collection design and verify it, configured providers, cleanup and updated disclosures on the signed post-launch update, including any active billing integration. Phase 17 owns these activation gates; earlier launch evidence and ordinary Continue establish no analytics permission. Keep analytics disabled until these gates pass without silently reviving the removed legal tracking or document-version machinery.
