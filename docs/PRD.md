# JustGO — MVP Product Requirements

**Status:** Revised draft aligned to the final core-app designs; unresolved product decisions are listed in section 13.  
**Platforms:** iOS first; Android is deferred, using the same shared codebase when scheduled.  
**Updated:** September 17, 2026.  
**Implementation specification:** [TECH_STACK.md](TECH_STACK.md).  
**Implementation plan:** [Stages and handoffs](IMPLEMENTATION_PLAN.md).  
**Design source:** [Paper — Version 3](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0), reviewed through Paper MCP on September 16, 2026.

## 1. Product summary and scope

JustGO helps adults build social confidence through short, real-world social challenges. Users find an appropriate challenge, attempt it, acknowledge completion, optionally reflect, and see their activity history and progress.

```text
First use: Credential bootstrap → Verify paid access / Hard paywall → Home
Returning use: Recover account → Verify access / restore active attempt
Core loop: Home → Active Challenge → Success → Reflection → Home
Primary destinations: Home · Progress
Supporting surfaces: Settings · Calendar day sheet
```

The first iOS release includes native paid access, recovery, cloud saves, one general Level 1 challenge deck, the in-app timer, Success, optional typed reflections, and the complete Progress screen with its calendar and day sheet. Levels and their progression rules, venue/category filters, custom dictation, and lock-screen timers are deferred. On September 17, Anthony deferred welcome screens and questionnaire onboarding so implementation can focus on the approved core screens. This is a deferral, not permanent removal. Paywall and native subscriptions remain phase 08; their final designs and offer remain to be specified.

Goals:

- Make a suitable social action easy to find, understand, and start.
- Keep the challenge readable and its timer reliable while the user goes about the activity.
- Recognize effort without speed bonuses or pressure to intrude on others.
- Preserve each challenge’s Level 1 context for future progression without imposing a completion threshold now.
- Offer a brief feeling check-in and optional private written reflection.
- Make completion history, streaks, and progress easy to revisit across supported devices.

The target user is an adult seeking more confidence in everyday interactions, conversations, friendships, groups, social events, or dating. The app must not imply clinical diagnosis, treatment, or proven changes in mental health.

## 2. Design authority and changes from the previous PRD

This PRD defines behavior and scope. The selected final core-app row in Paper Version 3 defines visual direction; the page also contains many earlier explorations, which are not additional requirements. The tech stack defines implementation and persistence. Older local design documents, tokens, screenshots, and the draft curriculum must not silently override this revision.

### Selected screen references

| Paper screen                                                        | Adopted requirement                                                                                                                            |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 39O — Centered front card, plus the cream/peach three-card variants | Home challenge stack, browsing indicator, left/right actions, primary navigation; omit venue chips and the Levels destination for this release |
| 19 — Navy timer · Pill action buttons                               | Active Challenge with readable instruction, countdown, Give up / Completed actions, and navigation                                             |
| 40B — A small medal · Larger illustration · That’s a win!           | Separate, brief success celebration and Continue                                                                                               |
| D1 — Mood and reflection · Simplified                               | One relative feeling choice, optional typing, and Save reflection; omit Dictate for this release                                               |
| 2E — Paper corner markers · Blue wave · Centered header             | Deferred reference: illustrated level list and progression; not a first-release screen                                                         |
| Level 4 — Ask and Exit · Not started                                | Deferred reference: level preview and Skip to this level; finalize rules when levels are scheduled                                             |
| P37 — Progress · Total reps summary                                 | Three summary metrics, activity calendar, monthly rep and active-day totals                                                                    |
| P31 — Day journal · Friday, September 18                            | Scrollable day sheet with completed challenge entries, timing, and recorded feelings                                                           |
| F1 — Outlined icon groups · Meetup                                  | Settings visual reference only; section 5.8 determines functional scope                                                                        |

Explicit interpretation rules:

- **Ignore P31’s entire “Day note” block**, including its example sentence. There is no day-level journal field or day-note feature. Optional reflections belong to individual attempts.
- **Settings is a design reference, not an approved feature checklist.** In particular, “Your progress is saved on this device” conflicts with cloud storage, and Reset progress is not committed scope.
- Use P31’s sheet over the current P37 Progress screen. Its older illustrated background is not a second Progress layout requirement.
- Sample dates, counts, challenge copy, course totals, selected feelings, and repeated sample rows are fixture content. They are not defaults, fixed targets, or evidence that completed challenges can be replayed.
- The medal illustration celebrates a completion; it does not introduce collectible badges or an awards system.
- Several screens contain raster artwork. Extract/rebuild real controls, text, accessibility semantics, and responsive layout during implementation; do not ship a screenshot as the interface.

### Behavioral changes

| Previous PRD                                               | Revised requirement                                                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Earlier cross-platform launch plan                         | iOS first; Android implementation and release gates deferred                                      |
| Core loop only; onboarding excluded                        | Core loop plus hard paywall and account recovery; onboarding deferred                             |
| Swipe up to replace; double tap to accept                  | Swipe left / X to replace; swipe right / heart to accept                                          |
| Venue-filtered deck and Levels page                        | One collection of general, easy Level 1 challenges; no filters, level selector, or Levels page    |
| Hide navigation throughout an attempt                      | Active Challenge retains navigation; leaving it does not end the attempt                          |
| Streak-focused Success message                             | Completion-focused celebration                                                                    |
| Separate anxiety and confidence ratings                    | One five-choice, retrospective feeling comparison                                                 |
| No free-form notes                                         | Optional per-attempt typed reflection; custom dictation deferred                                  |
| Anxiety/confidence calendar heatmap                        | Completion-count calendar with day history                                                        |
| Every completion counts; earlier practice can imply replay | Completed challenges are excluded from new offers; level completion and credit rules are deferred |
| Sensitive self-reports stored locally by default           | Private cloud records; optional analytics consent is separate                                     |

## 3. Navigation and common behavior

- Home and Progress are the primary destinations for the first release. Icon-only navigation must expose accessible names and selected state.
- Active Challenge remains in the Home destination and retains the bottom navigation shown in the final design. Returning to Home while an attempt is active restores that attempt instead of offering a second challenge.
- The header account/person icon opens Settings. It does not imply a public profile, signup form, or social feature.
- Success and Reflection are focused screens without bottom navigation. Completing or dismissing Reflection returns to Home.
- Back navigation never implicitly gives up an attempt. A root tab does not need a nonfunctional back arrow simply because one appears in a mockup.
- Sheets open over their parent screen, preserve its selection/scroll position, and support accessible close controls and platform back behavior. Dragging the sheet must not trigger card gestures underneath.
- Text scaling, screen readers, safe areas, keyboard avoidance, reduced motion, and sufficient contrast apply on iOS at launch and on Android when that release is implemented. Gesture actions have tappable alternatives; color and facial expression are never the only labels.

## 4. Entry, onboarding, and paid access

### 4.1 No-signup identity and recovery

The first launch creates or recovers an authenticated, persistent app account using secure credentials. No email, SMS, OAuth, or account form is required. Cloud history belongs to that account, not to an installation identifier or store purchase alone.

On supported iPhone paths, a synchronized recovery credential can restore the same account on another iPhone. This depends on platform availability and must not be presented as an unconditional guarantee. Optional recovery-key and existing-device transfer actions provide the fallback described in the tech stack, on iOS at launch. Android and cross-platform recovery are validated when Android is implemented.

Credential access failures show retry/recovery states rather than silently creating a new account. Restoring paid access alone never discloses another account’s private history.

### 4.2 Onboarding — deferred

Welcome screens, questionnaire steps, warming-up copy, branching and onboarding persistence are deferred by Anthony’s September 17 scope decision. Do not invent them or block phase 03 on them. Revisit whether/when to add them with separate product approval. Secure account bootstrap/recovery remains required behind the scenes and is not a signup or welcome flow.

If onboarding is scheduled later, settle content/design first and retain the original cloud-save, revision-conflict and relaunch-restoration requirements. No onboarding tables, answer collection or Zustand store are needed now.

### 4.3 Hard paywall

After account connection, verified paid access is required to enter the core paid experience and start new challenges. Initial purchases use native store billing through RevenueCat. Pricing, products, trials, and paywall copy are not determined by the core-app screens.

Purchase, restore, cancellation, failure, and purchased-but-still-verifying states must be distinct. Unlock after immediate server verification; do not wait for scheduled billing processing or ask someone to purchase again to fix a verification failure.

Restore Purchases, subscription management, recovery, privacy/terms, and data controls remain reachable without paid access. The proposed expiry behavior for an already active attempt is listed in section 13. Stripe checkout and the AI coach are later phases, not launch requirements.

## 5. Core screens and interactions

### 5.1 Home — Find a challenge

Home presents:

- One collection of easy Level 1 challenges that need no particular venue; omit the venue/category chips shown in the reference.
- A layered challenge deck with one actionable front card.
- A suitable general illustration, full challenge instruction, and optional short supporting cue such as “Start with a simple hello.”
- A compact deck indicator/progress line, represented by “Challenge 03 / 12” in the design.
- **X / Swipe left** and **heart / Swipe right** controls.

All launch challenges belong to the same stable Level 1 record and explicitly have no venue restriction. “General” is a content classification, not a venue filter or GPS feature. No category taxonomy, level selection, or hidden advancement logic is required now.

Swiping left or tapping X presents another eligible card without creating an attempt, marking a level skipped, or earning a rep. Swiping right or tapping the heart requests acceptance and starts an attempt after server confirmation. The heart means accept, not favorite. Disable duplicate acceptance while the start request is unresolved, and keep the same action identity for a retry.

Home does not need points, a separate challenge title, a time constraint, or a streak. The instruction is the challenge; a short optional helper is supporting content. The final screen does not require the old Home level badge.

**Proposed indicator interpretation:** “03 / 12” means position in the currently available deck, not three completed challenges or progress toward a level. Replacements may advance this position but never increase earned progress. Confirm the denominator/reset behavior before implementation (section 13).

If the collection has no eligible unfinished challenges, show an honest “all available challenges done” state; never silently replay completed content or claim the user has completed a level whose threshold is undefined. If the API is unavailable, show loading/retry rather than fabricated cards.

### 5.2 Active Challenge

The screen shows the accepted challenge’s full instruction, general illustration, optional helper, prominent countdown, **Completed**, and **Give up**. The countdown uses that challenge’s configured duration, not the sample time in Paper.

- Begin the countdown from the server-confirmed start and deadline. A pending/failed start is not an active attempt.
- **Completed** submits the completion. Show Success only once the server confirms it; a retry must not award credit twice.
- **Give up** requires confirmation. Confirming ends the attempt without a rep or streak credit and returns to an eligible Home card. Cancelling the confirmation keeps the original deadline.
- Navigating to another tab or Settings, backgrounding, locking, or closing the app leaves the same attempt active. There is no pause/reset implied by navigation.
- Recover the active attempt before allowing another start after relaunch or on another device.
- At zero, display zero and retain the outcome actions. Expiry does not automatically complete, fail, give up, or restart the attempt.
- Lock-screen display is deferred. Locking the phone still preserves the original deadline; reopening computes the remaining time without restarting it.
- Pending/failed completion or give-up remains visible with retry/reconciliation. Do not falsely display saved progress or stop the authoritative attempt because a response was lost.

### 5.3 Success

Show a separate completion celebration with the approved illustration, **“That’s a win!”**, supportive completion copy, and **Continue**. Continue opens Reflection for the completed attempt.

This screen does not require a streak claim, a weekly activity strip, a collectible award, ratings, or recommendation feedback. Completion credit has already been recorded; leaving the flow cannot revoke it.

### 5.4 Reflection

Reflection asks **“How do you feel?”** with the qualifier **“Compared to before the challenge.”** Offer a single selection from:

1. A lot worse
2. A little bit worse
3. Pretty much the same
4. A little bit better
5. A lot better

Use the labeled facial choices in the final D1 design, with a visible and accessible selected state. Do not preselect the positive example shown in the mockup. This is one retrospective report of perceived change; the app has not collected a separate before measurement and must not calculate a clinical or measured before/after improvement from it.

Below the feeling choices, provide **Your reflection — optional**, the prompts “What went well? What was hard? What would you try next time?”, a multiline text field and **Save reflection**. The custom Dictate control is deferred.

- The reflection step remains optional, preserving the previous PRD’s optionality. Skipping never affects a completed rep or streak.
- **Proposed save rule:** allow a feeling alone, nonempty text alone, or both. With neither, the user can close/skip; do not create a fabricated neutral answer. This permissive rule is a product default to confirm, since the image labels only the writing field optional.
- Back/X provides an explicit route out. If input is unsaved, offer to save, keep editing, or discard it; do not silently treat a draft as submitted. Exact dismissal copy remains to be designed.
- Save reflection persists the selected feeling and/or text for that attempt before returning Home. Preserve unsaved input and offer retry after failure.
- Autosaved cloud drafts are separate from submitted feelings/final reflections. A draft must not appear as completed feedback in history or analytics.
- Do not add a custom speech-recognition dependency, microphone prompt, or Dictate control at launch. Ordinary system-keyboard features are not a custom app dictation implementation.

No separate anxiety scale, confidence scale, pre-challenge assessment, or “More/Fewer like this” question is required. Feelings and reflection text do not change challenge selection in the MVP.

### 5.5 Levels — deferred

There is no Levels page, level selector, skip action, or automatic advancement in the first release. The initial catalog is all easy Level 1 content. Preserve a stable Level 1 record and each attempt’s original challenge/revision/level context so future levels can be added without rewriting history.

When levels are scheduled, the intended direction is a pool of challenges larger than the configured number of **different** completions required to advance, plus the previously requested Skip to this level flow. Exact thresholds, unlocking/skip behavior, and whether earlier completions count will be decided then. Do not invent a threshold or count catalog exhaustion as level completion now.

Paper’s Levels screens and [CURRICULUM.md](CURRICULUM.md) are future references, not launch requirements or approved numeric targets.

### 5.6 Progress

Progress contains:

- **Current streak**, **Best streak**, and **Total reps**.
- A navigable month/year calendar.
- Distinct inactive, active, today, and selected-day treatments, with a numeric rep badge for each active date.
- **Reps this month** and the number of **active days** in that selected month.
- A short legend explaining the small rep counts and the instruction to tap an active day.

The calendar visualizes completed activity. It has no Anxiety / Confidence toggle, metric heatmap, feeling-based day color, or “last rating controls the shade” rule. Users can open a completed day even if every reflection was skipped.

Month navigation updates both the calendar and monthly totals. All-time totals and streaks remain account-level metrics. Empty months and a new account show honest zero/empty states; loading or an API error must not appear as zero activity. Dates outside the displayed month are placeholders, not activity targets. Future dates cannot contain completed reps.

### 5.7 Calendar day sheet — P31

Tapping an active date opens a scrollable sheet with:

- The full day/date heading, such as “Friday, September 18”.
- That day’s completed rep count and summed elapsed time.
- Every completed challenge in chronological order, with an ordinal, readable instruction/summary, completion time, elapsed duration, and its submitted feeling indicator.
- An accessible close action and drag handle.

The **After** indicator uses the same five-choice feeling vocabulary as D1. Missing/skipped feedback is **Not recorded**, never a neutral face. A compact indicator must expose its exact label accessibly; the three sample faces in P31 do not reduce the five-option scale.

Duration means elapsed time between the stored start and completion, including background time and any time after zero. It is not the configured time limit or remaining countdown. The daily duration is the sum for completed entries only. Final rounding/display rules are an open formatting decision.

**Do not include the Day note label, quote, input, or any day-level note data.** The final compact rows also do not require the old PRD’s two ratings or a visible level label on every row. Preserve the original level and challenge revision in the underlying history.

Saved per-attempt reflection text needs a reading interaction, but P31 does not specify one once Day note is removed. The proposed follow-up design is to expand/tap a challenge entry to read its full instruction, feeling, and saved reflection. This is an unresolved supporting state, not permission to reintroduce a day note or standalone journal destination.

### 5.8 Settings

Use the supplied grouped-row visual style, spacing, icons, and hierarchy as a reference. Functional scope comes from explicit product needs:

| Scope                                           | Settings capability                                                                                                                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Required by the tech-stack product flow         | Restore Purchases, manage subscription, optional Save recovery key and Transfer to another device, analytics/privacy choices, authenticated data export and account deletion, privacy policy and terms |
| Specified preferences; details to finalize      | Practice-reminder scheduling, haptics, and motion preference; OS permissions remain separate                                                                                                           |
| Reference-only; not committed by the screenshot | Reset progress, exact help/feedback/about rows, app-version footer, and the “On this device” grouping                                                                                                  |

Any storage explanation must accurately describe private cloud storage and credential-based recovery. Do not ship “Your progress is saved on this device.” System reduced-motion settings apply even if a custom preference is omitted. Account deletion requires explicit confirmation and revokes recovery/access; it is not the same action as an unapproved Reset progress feature.

## 6. Challenge selection and activity counts

Published challenges need a stable ID, immutable revision, instruction, configured duration, stable Level 1 link, explicit no-venue-restriction classification, illustration reference, and optional helper cue. General challenges still require an appropriate, consenting social situation; “no venue restriction” is not an instruction to approach anyone anywhere.

Use simple, non-personalized catalog rules for this one collection. Avoid immediately reoffering replaced or given-up cards while alternatives exist. A given-up challenge may become eligible later; a completed stable challenge ID may not, even after a wording revision. Provide an honest exhausted-collection state.

- One server-confirmed completed attempt earns one rep. Browsing, acceptance, giving up, and reflection submission do not independently earn reps.
- No level-completion threshold, daily cap, unlocking, selection, or advancement is implemented at launch. Future progression is described in section 5.5.
- At least one completion makes that frozen local date active. More completions increase reps but not active-day or streak-day counts.
- Current streak counts consecutive active dates ending today or yesterday. Best streak is the longest consecutive run; both are zero without completions.
- Freeze each completion’s local date and time-zone context. Travel or viewing history on another device must not move old activity. Test midnight and daylight-saving boundaries.

Challenges must respect consent, social context, and personal safety. Never reward speed or intrusive behavior to satisfy a timer or streak.

## 7. State, persistence, and reliability

PostgreSQL, accessed through the authenticated API, is the source of truth for account/onboarding state, settings, attempts, feelings, reflection drafts/final text, activity totals, and history. Secure device storage contains credentials, not a second journal database.

Persist:

- Challenge ID/revision, Level 1 context at acceptance, server start/deadline, attempt outcome, completion/give-up timestamp, frozen completion date/time zone, and revision.
- A versioned nullable feeling choice with submitted/skipped state where applicable; missing is distinct from neutral.
- Optional per-attempt reflection body, draft/final status, revision, and known input method.
- Preserve Level 1 context in attempts; defer earned-level credits, level selection, completion/skipping states, and requirement snapshots until progression is designed.
- Preferences/consent (onboarding answers/schema/last confirmed step only if later scheduled), and verified billing state.

The original challenge content and level context must remain readable in history after content edits. Keep attempts separate from published challenges, feelings, and reflection text.

Product-critical writes require server confirmation. A completion is recorded once and contributes one rep to history and calendar aggregates. Save feeling/text consistently so a screen cannot report a saved reflection while silently dropping its chosen feeling. Conflicting edits from another device require an explicit resolution, not silent overwrite.

There is no durable offline mutation queue or local journal database in this architecture. An already loaded countdown can keep rendering offline; starting, completing, and saving require the API. Keep unsaved input visible with unsaved/saving/saved/failed status and retry. Force-quitting offline can lose unsaved input; never claim it was saved. Recover uncertain server outcomes before creating replacement actions.

## 8. Privacy and analytics

Cloud storage is part of the journal feature. Optional analytics sharing is a separate choice; declining it must not prevent saving reflections or using paid access. Raw reflection text, audio, credentials, and payment details must not be sent to analytics or diagnostic payloads. No session replay/autocapture on these screens.

Track consent-aware events for:

- Onboarding steps, paywall views, purchase/restore verification outcomes.
- Home/deck views, card replacements, accept requests, confirmed starts, completions, give-ups, and deadline expiry.
- Success Continue, feeling submitted/skipped, reflection saved/skipped.
- Progress viewed, month changed, and day sheet opened.

Separate UI intent from confirmed domain events. Stable event identities prevent retry double-counting. Analytics outages must not fail product saves. Feeling codes or coarse reflection-length metadata require the sensitive-data choice described in the tech stack; raw text never becomes an event property.

Initial metrics are onboarding/paywall conversion, challenge start and completion rates, replacement/give-up rates, time to completion, optional feeling/reflection response rates, D1/D7 retention, and weekly users completing at least three challenges. Set targets after baseline data exists. Retrospective feelings and retention correlations are not evidence that JustGO caused improvement.

## 9. Explicit non-goals

- Separate anxiety/confidence scales, pre-challenge ratings, clinical scoring, or automated mental-health conclusions.
- A feeling heatmap, line graph, multi-month contribution grid, or standalone recent-challenges/journal page.
- Day notes, day-level journaling, and raw audio recordings.
- Replaying already completed challenges or bypassing exhaustion by recycling them.
- XP, points, speed bonuses, collectible badges, leaderboards, social feeds, or sharing.
- Favorites implied by the heart, a browsable challenge library, or GPS-based venue discovery.
- Personalized recommendations based on feelings/reflections or “More/Fewer like this” feedback.
- Levels UI, level unlocking/skipping/advancement, venue/category filters, custom dictation, lock-screen timers, and an Android release at launch.
- A shipped AI coach, voice coach, or Stripe checkout in the initial release.
- Automatic inclusion of every Settings reference row or every draft curriculum course.
- A local-first database or durable offline sync engine.

## 10. Fit with the tech stack

Keep the proposed React Native + Expo + TypeScript application, API, and PostgreSQL architecture. These screens use the already planned card gestures, animations, sheets, native text input, the in-app countdown, and server-backed history. No new charting engine, real-time backend, database type, or AI feature is required by the designs.

Implementation must align contracts with the general challenge classification and optional helper content, five relative feeling values, day-duration aggregates, and navigation that preserves an active attempt. Exact fonts, artwork, tokens, and responsive measurements need a fresh export from the final Paper references; the older Analog design tokens are not the approved final palette/type system.

This PRD carries product behavior; native-library compatibility, secure recovery, billing processing, API retry/concurrency mechanics, and deployment remain governed by [TECH_STACK.md](TECH_STACK.md).

## 11. Acceptance criteria

| ID    | Required result                                                                                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | On iOS, account bootstrap requires no signup form; valid recovery restores only the authorized account. Credential failures cannot create duplicate accounts silently.                                     |
| AC-02 | Deferred: welcome/questionnaire onboarding is outside current implementation. If scheduled later, approve content and confirm cloud saves/relaunch restoration before shipping it.                         |
| AC-03 | The hard paywall supports purchase, restore, and honest pending/failed verification; essential recovery, subscription, legal, and data controls remain reachable when unpaid.                              |
| AC-04 | The single general Level 1 deck excludes completed challenges. Left swipe/X replaces; right swipe/heart starts exactly one attempt after confirmation. Neither browsing nor the deck counter earns credit. |
| AC-05 | Home handles exhausted content, loading, and errors without offering completed challenges or fabricating progress.                                                                                         |
| AC-06 | The full challenge remains readable with a correct countdown after tab changes, locking, backgrounding, and relaunch. Returning Home restores the active attempt.                                          |
| AC-07 | **Deferred:** lock-screen display; not an iOS launch gate. The in-app lifecycle remains covered by AC-06.                                                                                                  |
| AC-08 | Confirmed completion grants one rep and preserves Level 1/revision context; retries and concurrent devices cannot duplicate completion. Give-up grants no rep.                                             |
| AC-09 | Success celebrates the confirmed completion and continues to that attempt’s Reflection without requiring a streak message.                                                                                 |
| AC-10 | Reflection uses the five specified relative choices with no default answer, optional text, accessible selected states, and normal keyboard editing. Skipping preserves earned credit.                      |
| AC-11 | Saved feedback/text belongs to the correct attempt; failed saves preserve visible input, drafts remain distinct from submissions, and concurrent edits do not silently overwrite.                          |
| AC-12 | **Deferred:** Levels UI, thresholds, unlocking, skipping and historical-credit policy. Preserving Level 1 context does not implement these rules.                                                          |
| AC-13 | Progress correctly shows current/best streak, all-time reps, month reps/active days, and per-day rep counts without an anxiety/confidence heatmap.                                                         |
| AC-14 | An active date opens all its completed entries in order with completion time, elapsed duration, and exact feeling labels or Not recorded. P31 has no Day note block or day-note field.                     |
| AC-15 | Settings implements only the scoped capabilities, describes cloud persistence accurately, and does not add Reset progress solely from the reference image.                                                 |
| AC-16 | Cloud saves and paid access work with analytics declined; no journal text, audio, or credentials enter analytics or diagnostic payloads.                                                                   |
| AC-17 | Controls work with screen readers, text scaling, reduced motion, platform back navigation, and keyboard/sheet interactions on iOS. Android verification is deferred.                                       |

## 12. Validation and implementation order

1. Begin Apple Developer enrollment/account readiness, App Store Connect app setup, and RevenueCat product setup alongside development; record unresolved offer/design decisions with the phase they block.
2. Prove no-signup iPhone identity/recovery and its fallback, then build shared API/navigation boundaries; welcome/questionnaire onboarding is deferred.
3. Build the general Level 1 deck, server-confirmed attempt lifecycle, reliable in-app countdown and Success.
4. Add typed reflections and the full Progress summary/calendar/day sheet against real cloud data.
5. Finish native iOS purchases, billing recovery, Settings/privacy controls, TestFlight testing and App Store submission preparation.

Use the detailed [implementation plan](IMPLEMENTATION_PLAN.md) for dependencies and the release checklist. Launch acceptance is AC-01–06, AC-08–11, and AC-13–17. AC-07 and AC-12 are deferred; they do not block submission.

Include duplicate completion, offline/uncertain writes, expired countdown, concurrent-device edits, skipped feedback, content exhaustion, calendar/time-zone boundaries, recovery, and purchased-but-unverified cases. Browser previews supplement real iOS development-build/device testing for Keychain and store purchases. Android, native lock-screen surfaces and custom dictation receive their own validation when implemented.

## 13. Remaining decisions and design gaps

These are intentionally unresolved. A final visual layout does not settle the following product rules; proposed defaults below are recommendations, not newly approved scope.

| Decision                             | Proposed default / work needed                                                                                                                                                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding and commercial offer      | Question/branching flow is deferred. Define purchase products/pricing/trials and paywall designs before phase 08. Keep no-signup entry and native-first paid access.                                                                |
| Launch catalog                       | Approve the easy Level 1, non-venue-specific challenge copy, durations, helpers, illustrations, safety rules, and useful catalog size. No threshold or venue taxonomy is required before launch.                                    |
| Home deck indicator                  | Use browsing position within the available general deck, clearly separate from earned progress. Define when its count resets/changes or replace its copy if it is meant to represent curriculum progress.                           |
| Reflection optionality and dismissal | Retain an optional overall step; allow feeling-only, text-only, or both. Finalize empty/save-button behavior and Back/X save/discard flow.                                                                                          |
| Reading saved reflection text        | Add a per-attempt expansion/detail interaction from a day entry; confirm editing/deletion affordances and obtain a matching design. Do not use a day-level note.                                                                    |
| Future levels — not a launch blocker | Decide thresholds, unlocking/skipping, partial/final-level behavior and treatment of prior Level 1 completions when scheduling levels. Preserve history now; do not implement hidden progression.                                   |
| Access expiry during an attempt      | Recommended: allow the existing attempt’s outcome and associated reflection to be saved; require renewed access before another start. Define private-history viewing after expiry separately from always-available export/deletion. |
| Supporting UI and formatting         | Finalize Settings rows, reminder defaults, day-duration rounding, missing/empty states, short-screen/text-scaling layouts, and reduced-motion behavior. Confirm the visual role of the three Home color variants.                   |
