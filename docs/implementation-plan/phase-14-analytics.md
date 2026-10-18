<a id="phase-14"></a>

# Phase 14 — Product analytics & PostHog dashboard

**Status:** Deferred until after paid launch; analytics exporter disabled

## Outcome

Explicit, acceptance-aware PostHog events answer the agreed challenge-flow and return-rate questions. A dashboard inside PostHog presents those reports without exposing reflection text or blocking product saves.

## Decisions in force

- Dependencies: Phase 13 paid launch, Phase 09's final deck/Reflection behavior, Phase 10's account-owned acceptance/eligibility boundary and Phase 12's approved launch notices. This phase is not required for beta or paid launch.
- Acceptance: PRD §8, AC-16; preserve the October 15 event allowlist and analytics-only `start_id` decision.
- Reuse Phase 08 deletion ownership and Phase 10 receipt checks. Before post-launch activation, update the inventory, public notices and App Privacy disclosures established in Phases 12–13, review legal/analytics-scope versions and require current account-owned acceptance. A launch receipt does not automatically authorize newly enabled analytics. Verify the actual signed update before enabling delivery.

## Implement

- Implement the [measurement plan](phase-14-analytics.md#phase-14-measurement) below: its event allowlist with validated property schemas, `start_id` linking, and metric definitions in the event dictionary. Separate UI intent from confirmed domain outcomes. Challenge Start/Give up remain local product actions with no required backend attempt save. Reuse the single Terms & Privacy acceptance page for reviewed material-version reacceptance; welcome/questionnaire onboarding and extra product flows solely for analytics remain outside scope.
- Confirm PostHog project/environment separation, pseudonymous account identifiers, region, retention and account-deletion cleanup. The architecture's 90-day event retention is a proposal to approve and configure, not an existing guarantee. Reuse Phase 08 deletion ownership and cleanup behavior for the configured analytics provider.
- Activate explicit PostHog events through consent-aware client/server adapters. Server-confirmed events follow successful transactions and use stable domain-derived IDs; client-only interactions use the approved single consent-aware boundary. Record occurrence/receipt timestamps and prevent retry double-counting. Delivery is best effort and analytics failures must not fail a saved completion or reflection.
- Allow feeling codes and coarse reflection-length categories only within the disclosed, accepted and reviewed analytics scope, with no separate sensitive-metadata switch. Compute approved categories without exporting the words. Disable autocapture/session replay and exclude journal text, audio, credentials, payment details and contact data from event payloads. Recheck acceptance and account eligibility before delayed delivery. Preserve enforcement of deletion and applicable withdrawal/objection requests through the reviewed privacy-request process; no Settings toggle does not remove these rights.
- Route billing measurement through the same server consent checks; do not enable unconditional RevenueCat-to-PostHog forwarding. Phase 07A billing and paid launch precede this phase. Verify any now-active billing integration at analytics activation, without making purchases or paid access depend on analytics.
- Create a small product dashboard for the agreed usage, challenge-flow and return-rate questions. Define cohort anchors, eligible observation windows and missing-data handling; describe the actual population with recorded acceptance and eligible events. Collect a baseline before setting targets. Sensitive-metadata comparisons use only the reviewed scope; retrospective feelings and retention correlations do not establish wellbeing improvement or causation.
- Verify actual client/server forwarding against Phase 10's receipt/eligibility boundary: first use, existing launch accounts accepting the reviewed analytics version, missing acceptance, hydration/account changes, stale callbacks, allowed/blocked payloads, duplicate delivery, provider outages and deletion/privacy-request cleanup. Never backfill pre-activation history or forward pre-acceptance onboarding activity.
- Reconcile actual collection/provider facts with the data inventory, public notices and release disclosures from Phases 12–13 before activation, under their existing review/publication permissions. Update PRD §8 to match the allowlist at closeout. Diagnostic redaction stays with Phase 08; app crash reporting belongs to Phase 11 and server health monitoring to Phase 13.

<a id="phase-14-measurement"></a>

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

## Keep out

- No separate analytics acceptance flow or Settings switches, raw journal/credential/audio payloads, session replay/autocapture, unconditional vendor forwarding or invented conversion/wellbeing targets. Reacceptance of a reviewed material version uses the existing Terms & Privacy page.
- No billing activation, experiments, transactional analytics outbox, extra product feature solely for measurement or unrelated OS/AI-context permission.
- Analytics delivery success never gates product saves or eligible paid access. No final legal publication, App Store submission or release deployment.

## Ready to hand off when

- [ ] Explicit event schemas, stable IDs, occurrence/receipt times, deduplication, `start_id` linking and provider-failure isolation have passing evidence; transmitted properties match the allowlist.
- [ ] Actual client/server delivery and delayed work respect account-owned acceptance, deletion and applicable privacy requests; saved/pending activity and product saves survive provider failures.
- [ ] Provider environments, pseudonymous identifiers, region, retention and deletion cleanup are configured/verified in the inventory and reviewed notices; any active Phase 07A billing integration is acceptance-aware at analytics activation.
- [ ] Updated notices/disclosures and legal/analytics-scope versions are reviewed before activation; existing launch accounts require current acceptance, with no replay of pre-activation history.
- [ ] ANALYTICS_EVENTS.md defines events and metrics, including sessions, cohort anchors, observation/missing-outcome windows and eligible population; the PostHog dashboard answers the measurement questions and baseline collection is documented before setting targets.
- [ ] Reports state their accepting-user/best-effort population and do not imply wellbeing improvement or causation from correlations.
- [ ] Required automated/phase and interactive checks pass; save the handoff with final evidence and remaining gates, and link it from the index.

## Open gates before analytics activation

- Verify acceptance/reacceptance, configured providers, cleanup and updated disclosures on the actual signed post-launch update, including any active billing integration. Phase 14 owns these activation gates; earlier launch evidence does not establish analytics acceptance.
