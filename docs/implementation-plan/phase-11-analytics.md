<a id="phase-11"></a>

# Phase 11 — Product analytics & PostHog dashboard

**Status:** Not started; analytics exporter disabled

## Outcome

Explicit, acceptance-aware PostHog events answer the agreed challenge-flow and return-rate questions. A dashboard inside PostHog presents those reports without exposing reflection text or blocking product saves.

## Decisions in force

- Dependencies: 10 for the implemented account-owned acceptance/eligibility boundary, and 09 for the final deck/Reflection behavior being measured.
- Acceptance: PRD §8, AC-16; preserve the October 15 event allowlist and analytics-only `start_id` decision.
- Reuse Phase 08 deletion ownership and Phase 10 receipt checks. Final notices belong to Phase 13 and signed-release acceptance to Phase 14.

## Implement

- Implement the [measurement plan](phase-11-analytics.md#phase-11-measurement) below: its event allowlist with validated property schemas, `start_id` linking, and metric definitions in the event dictionary. Separate UI intent from confirmed domain outcomes. Challenge Start/Give up remain local product actions with no required backend attempt save. Only the Terms & Privacy onboarding page is newly approved; welcome/questionnaire onboarding and inactive purchases do not gain new flows merely to generate analytics.
- Confirm PostHog project/environment separation, pseudonymous account identifiers, region, retention and account-deletion cleanup. The architecture's 90-day event retention is a proposal to approve and configure, not an existing guarantee. Reuse Phase 08 deletion ownership and cleanup behavior for the configured analytics provider.
- Activate explicit PostHog events through consent-aware client/server adapters. Server-confirmed events follow successful transactions and use stable domain-derived IDs; client-only interactions use the approved single consent-aware boundary. Record occurrence/receipt timestamps and prevent retry double-counting. Delivery is best effort and analytics failures must not fail a saved completion or reflection.
- Allow feeling codes and coarse reflection-length categories only within the disclosed, accepted and reviewed analytics scope, with no separate sensitive-metadata switch. Compute approved categories without exporting the words. Disable autocapture/session replay and exclude journal text, audio, credentials, payment details and contact data from event payloads. Recheck acceptance and account eligibility before delayed delivery. Preserve enforcement of deletion and applicable withdrawal/objection requests through the reviewed privacy-request process; no Settings toggle does not remove these rights.
- Route future billing measurement through the same server consent checks; do not enable unconditional RevenueCat-to-PostHog forwarding. Preserve Phase 07A's activation sequencing and verify the integration again before paid launch.
- Create a small product dashboard for the agreed usage, challenge-flow and return-rate questions. Define cohort anchors, eligible observation windows and missing-data handling; describe the actual population with recorded acceptance and eligible events. Collect a baseline before setting targets. Sensitive-metadata comparisons use only the reviewed scope; retrospective feelings and retention correlations do not establish wellbeing improvement or causation.
- Verify actual client/server forwarding against Phase 10's receipt/eligibility boundary: first use, existing accounts, missing acceptance, hydration/account changes, stale callbacks, allowed/blocked payloads, duplicate delivery, provider outages and deletion/privacy-request cleanup. Never forward pre-acceptance onboarding activity.
- Supply actual collection/provider facts to Phase 13's data inventory and public notices. Update PRD §8 to match the allowlist at closeout. Diagnostic redaction stays with Phase 08; app crash reporting belongs to Phase 12 and server health monitoring to Phase 14.

<a id="phase-11-measurement"></a>

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

- No new acceptance flow or analytics Settings switches, raw journal/credential/audio payloads, session replay/autocapture, unconditional vendor forwarding or invented conversion/wellbeing targets.
- No billing activation, experiments, transactional analytics outbox, extra product feature solely for measurement or unrelated OS/AI-context permission.
- Analytics delivery success never gates product saves or eligible paid access. No final legal publication, App Store submission or release deployment.

## Ready to hand off when

- [ ] Explicit event schemas, stable IDs, occurrence/receipt times, deduplication, `start_id` linking and provider-failure isolation have passing evidence; transmitted properties match the allowlist.
- [ ] Actual client/server delivery and delayed work respect account-owned acceptance, deletion and applicable privacy requests; saved/pending activity and product saves survive provider failures.
- [ ] Provider environments, pseudonymous identifiers, region, retention and deletion cleanup are configured/verified and recorded for Phase 13; 07A/14 retain future billing activation checks.
- [ ] ANALYTICS_EVENTS.md defines events and metrics, including sessions, cohort anchors, observation/missing-outcome windows and eligible population; the PostHog dashboard answers the measurement questions and baseline collection is documented before setting targets.
- [ ] Reports state their accepting-user/best-effort population and do not imply wellbeing improvement or causation from correlations.
- [ ] Required automated/phase and interactive checks pass; save the handoff with final evidence and remaining gates, and link it from the index.

## Open gates for Phase 14

- Verify acceptance, configured providers, cleanup and disclosures on the signed beta/release build. Carry physical-device and billing-integration acceptance forward until evidenced.
