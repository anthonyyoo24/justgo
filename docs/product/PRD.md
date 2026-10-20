# JustGO — MVP Product Requirements

**October 8 Phase 07 reconciliation:** The implemented flow starts challenges in memory, saves completed reps and explicit reflections on the phone, and uploads them in the background. Progress combines local and backend activity with limited current-period offline history. Current requirements below supersede the earlier server-backed lifecycle, immutable wording and cloud-draft behavior; the original handoffs retain their historical evidence. Native billing remains [Phase 07A](../implementation-plan/phase-07a-billing.md#phase-07a), and physical-device/staging release acceptance remains Phase 14.

**Status:** Revised draft aligned to the final core-app designs; unresolved product decisions are listed in section 13.  
**Platforms:** iOS first; Android is deferred, using the same shared codebase when scheduled.  
**Updated:** October 19, 2026.

**October 19 entry and legal links (Phase 10):** Terms & Privacy presents readable notices and ordinary links. Continue creates an account using the normal identity proof; it records no legal agreement, document view, accepted version or acceptance time. There is no per-account legal-version gate. Analytics stays disabled through beta and paid launch. Phase 15 must review its actual permission and collection design before activation, without treating Continue or an old receipt as analytics permission or silently restoring the rejected tracking mechanism. Additional welcome/questionnaire onboarding remains deferred.

**Implementation specification:** [TECH_STACK.md](../architecture/TECH_STACK.md).\
**Implementation plan:** [Stages and handoffs](../implementation-plan/README.md).\
**Design source:** [Paper — Version 3](https://app.paper.design/file/01M06AN54B8CZHGDPRD8XY0880/3-0), reviewed through Paper MCP on September 16, 2026.

## 1. Product summary and scope

JustGO helps adults build social confidence through short, real-world social challenges. Users find an appropriate challenge, attempt it, acknowledge completion, optionally reflect, and see their activity history and progress.

For the October 9 legal drafts, the owner identified the personal operator as Youngshin Yoo in Canada and proposed adults 18 and older across available App Store countries and regions. Final distribution, eligibility behavior, age rating and regional legal review remain release decisions. The [data inventory and legal review](../legal/LEGAL_REVIEW.md) track the policy assumptions and required follow-up; no new onboarding is approved by these drafts.

```text
First use: Welcome → Continue → Terms & Privacy → Continue creates the account → Verify access / Hard paywall → Prepare first deck → Home
Returning use: Restore or recover account → Verify access → Hydrate saved activity → Home
Core loop: Home → Active Challenge → Success → Reflection → Home
Primary destinations: Home · Progress
Supporting surfaces: Settings · Calendar day sheet
```

The first iOS release includes native paid access, recovery, cloud saves, one Level 1 collection with six venue decks, the in-app timer, Success, optional typed reflections, and the complete Progress screen with its calendar and day sheet. Practice reminders, Levels and their progression rules, additional category filters, custom dictation, and lock-screen timers are deferred. On September 17, Anthony deferred welcome screens and questionnaire onboarding so implementation can focus on the approved core screens. The entry flow reuses the existing Welcome before Terms & Privacy; additional welcome/questionnaire steps remain deferred. Paywall and native subscriptions remain phase 07A; their final designs and offer remain to be specified.

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

| Paper screen                                                        | Adopted requirement                                                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 39O — Centered front card, plus the cream/peach three-card variants | Home challenge stack, six manual venue pills, left/right actions and primary navigation; omit the Levels destination |
| 19 — Navy timer · Pill action buttons                               | Active Challenge with readable instruction, countdown and Give up / Completed actions; no Settings or bottom tabs    |
| 40B — A small medal · Larger illustration · That’s a win!           | Separate, brief success celebration and Continue                                                                     |
| D1 — Mood and reflection · Simplified                               | One relative feeling choice, optional typing, and Save reflection; omit Dictate for this release                     |
| 2E — Paper corner markers · Blue wave · Centered header             | Deferred reference: illustrated level list and progression; not a first-release screen                               |
| Level 4 — Ask and Exit · Not started                                | Deferred reference: level preview and Skip to this level; finalize rules when levels are scheduled                   |
| P37 — Progress · Total reps summary                                 | Three summary metrics, activity calendar, monthly rep and active-day totals                                          |
| P31 — Day journal · Friday, September 18                            | Scrollable day sheet with completed challenge entries, timing, and recorded feelings                                 |
| F1 — Outlined icon groups · Meetup                                  | Settings visual reference only; section 5.8 determines functional scope                                              |

Explicit interpretation rules:

- **Ignore P31’s entire “Day note” block**, including its example sentence. There is no day-level journal field or day-note feature. Optional reflections belong to individual attempts.
- **Settings is a design reference, not an approved feature checklist.** In particular, “Your progress is saved on this device” conflicts with cloud storage, and Reset progress is not committed scope.
- Use P31’s sheet over the current P37 Progress screen. Its older illustrated background is not a second Progress layout requirement.
- Sample dates, counts, challenge copy, course totals, selected feelings, and repeated sample rows are fixture content. They are not defaults, fixed targets, or evidence that completed challenges can be replayed.
- The medal illustration celebrates a completion; it does not introduce collectible badges or an awards system.
- Several screens contain raster artwork. Extract/rebuild real controls, text, accessibility semantics, and responsive layout during implementation; do not ship a screenshot as the interface.

### Behavioral changes

| Previous PRD                                               | Revised requirement                                                                                        |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Earlier cross-platform launch plan                         | iOS first; Android implementation and release gates deferred                                               |
| Core loop only; onboarding excluded                        | Core loop plus hard paywall and account recovery; Phase 10 adds Terms & Privacy links and Continue         |
| Swipe up to replace; double tap to accept                  | Swipe left / X to replace; swipe right / heart to accept                                                   |
| Venue-filtered deck and Levels page                        | One easy Level 1 collection with six manual venues; no extra filters, level selector or Levels page        |
| Hide navigation throughout an attempt                      | Active Challenge covers navigation; Completed and Give up are its only exits                               |
| Streak-focused Success message                             | Completion-focused celebration                                                                             |
| Separate anxiety and confidence ratings                    | One five-choice, retrospective feeling comparison                                                          |
| No free-form notes                                         | Optional per-attempt typed reflection; custom dictation deferred                                           |
| Anxiety/confidence calendar heatmap                        | Completion-count calendar with day history                                                                 |
| Every completion counts; earlier practice can imply replay | Venue decks cycle; repeated accepted cards can become new reps; level credit rules are deferred            |
| Sensitive self-reports stored locally by default           | Phone-saved submissions upload to private cloud records; future analytics requires its own reviewed design |

## 3. Navigation and common behavior

- Home and Progress are the primary destinations for the first release. Icon-only navigation must expose accessible names and selected state.
- Active Challenge is a full-screen surface over Home. Hide Settings and bottom navigation; only Completed or Give up exits it. Backgrounding/locking retains the countdown while the screen and process survive. A fresh mount, account change or process restart discards unfinished activity.
- The header account/person icon opens Settings. It does not imply a public profile, signup form, or social feature.
- Success and Reflection are focused screens without bottom navigation or swipe-back exits. Continue is the only exit from a completed Success result and opens its Reflection. Reflection returns to Home through its bottom Skip or Save Reflection action only; no top Back/X or swipe-back exit is available.
- Back navigation never implicitly gives up an attempt. A root tab does not need a nonfunctional back arrow simply because one appears in a mockup.
- Sheets open over their parent screen, preserve its selection/scroll position, and support accessible close controls and platform back behavior. Dragging the sheet must not trigger card gestures underneath.
- Text scaling, screen readers, safe areas, keyboard avoidance, reduced motion, and sufficient contrast apply on iOS at launch and on Android when that release is implemented. Gesture actions have tappable alternatives; color and facial expression are never the only labels.

## 4. Entry, onboarding, and paid access

### 4.1 No-signup identity and recovery

The first launch discovers an existing secure account or shows Welcome. Welcome Continue opens Terms & Privacy. Continue on that page creates a new authenticated, persistent app account using the ordinary secure identity proof, without legal acceptance/view recording or a document-version gate. No email, SMS, OAuth, or account form is required. Cloud history belongs to that account, not to an installation identifier or store purchase alone.

On supported iPhone paths, a synchronized recovery credential can restore the same account on another iPhone. This depends on platform availability and must not be presented as an unconditional guarantee. Optional recovery-key and existing-device transfer actions provide the fallback described in the tech stack, on iOS at launch. Android and cross-platform recovery are validated when Android is implemented.

Credential access failures show retry/recovery states rather than silently creating a new account. Restoring paid access alone never discloses another account’s private history.

### 4.2 Terms & Privacy links; broader onboarding deferred

Present one short, accurate explanation of phone/cloud saving and the no-sale assurance, ordinary Terms of Service and Privacy Policy links, and Continue. Omit the onboarding Analytics section, Sentry paragraph and development-release notice; the linked Privacy Policy describes the actual processing and disabled services. The existing `/acceptance` route remains an internal navigation name. Opening the page or its links does not create an account or record agreement, document views, accepted versions or acceptance dates. Returning connected accounts do not need a document-version check. Recovery, export and deletion stay reachable independently of paid access.

Welcome Continue only navigates. Continue on Terms & Privacy persists the normal identity bootstrap proof before sending; uncertain retries reuse it. Recovery never creates a replacement account implicitly. Preserve the preparation cover until the first deck and its artwork are ready, and let deck retries reuse the connected account. An explicit replacement-account route retains its source owner so a remount cannot request another account. See the [Phase 10 handoff](../handoffs/phase-10-acceptance.md).

The owner-directed October 19 removal of legal tracking supersedes the earlier account-owned receipt design. Ordinary identity, activity acknowledgements and deletion confirmations remain. Current entry adds no analytics Settings switches or permission flow. Before future analytics activation, Phase 15 must review the actual collection and permission design; it cannot infer permission from Continue or historical receipts or silently restore the removed legal tracking/version gates.

If broader questionnaire onboarding is scheduled later, settle content/design first and retain the original cloud-save, revision-conflict and relaunch-restoration requirements. No questionnaire tables, answer collection or questionnaire Zustand store are needed now.

### 4.3 Hard paywall

After account connection, verified paid access is required to enter the core paid experience and start new challenges. Initial purchases use native store billing through RevenueCat. Pricing, products, trials, and paywall copy are not determined by the core-app screens.

Purchase, restore, cancellation, failure, and purchased-but-still-verifying states must be distinct. Unlock after immediate server verification; do not wait for scheduled billing processing or ask someone to purchase again to fix a verification failure.

Restore Purchases, subscription management, recovery, privacy/terms, and data controls remain reachable without paid access. The confirmed Phase 07A policy locks ordinary paid actions at saved expiry until an online verification succeeds, while authenticated uploads of earlier valid-access reps remain eligible under server-verified coverage. Existing saved and pending activity stays with its original app account. The current access guard still uses the pre-billing short verification window; persistence, event-driven checks and exact-expiry behavior are implementation work in 07A. Stripe checkout and the AI coach are later phases, not launch requirements.

## 5. Core screens and interactions

### 5.1 Home — Find a challenge

Home presents:

- One easy Level 1 collection with six manual venue pills: Streets, Park, Gym, Cafe, Bookstore, and Bars & Clubs.
- A layered challenge deck with one actionable front card.
- A venue illustration and the full challenge instruction; no displayed subtext.
- No level-progress indicator; the reference’s “3 / 12” is deferred level progress.
- **X / Swipe left** and **heart / Swipe right** controls.

All launch challenges belong to one stable Level 1 record and have explicit venue-card placements. Shared content can serve several placements with independent ordering. When an account first has the catalog on this phone, shuffle each venue's deck once and save its order, front card and selected venue on the phone for that account. Relaunch resumes them; new accounts and missing or unknown saved venue values default to Streets. These preferences are local only and are not uploaded or sent to analytics. No GPS, extra category taxonomy, level selection or advancement logic is required now.

Swiping left or tapping X presents another eligible card without creating an attempt, marking a level skipped, or earning a rep. Swiping right or tapping the heart starts immediately in screen-owned memory and captures the card, exact start timestamp, phone time zone and original duration. The heart means accept, not favorite. Start and Give up create no saved attempt or API write; saving an updated deck order is separate from activity saving. The completed-attempt UUID is generated once when Completed is tapped.

Home does not need points, a separate challenge title, a countdown or a streak. The instruction is the challenge. Omit subtext and the old Home level badge.

Skipped, completed and given-up cards move to the back of their own venue’s saved queue. A deliberate completed repeat creates a new attempt. Catalog refresh preserves surviving order and the current front card, inserts new placements at random positions behind that front, and drops removed or inactive placements. If the active card was removed during refresh, its later outcome must not rotate the untouched next card. Missing, unreadable or invalid saved deck state falls back to a fresh shuffle. Preference writes are best effort: a failed write leaves the live deck usable without saving or loss-risk banners. There is no ordinary exhausted state. Every supported venue has a validated nonempty catalog. With no downloaded catalog, show fetching or a truthful first-download failure/offline state. A failed background refresh keeps previously downloaded cards usable. Loading and errors must not fabricate cards.

### 5.2 Active Challenge

The screen shows the accepted challenge’s full instruction, venue illustration, prominent countdown above the card, **Completed**, and **Give up**. No subtext is displayed. The countdown uses that challenge’s configured duration, not the sample time in Paper.

- Derive the countdown deadline from the captured start and original duration. Sample the clock once per second while active and immediately on foreground; background JavaScript execution is unnecessary.
- **Completed** generates one UUID and saves a completed rep with its upload intent through the account repository. Show Success after the phone write; the normal path never waits for HTTP acknowledgement. Duplicate activation reuses the in-flight save. Give subtle accessible saving feedback only for a noticeably slow write.
- **Give up** returns to the venue deck without a saved attempt or rep. Completed and given-up cards cycle within their own venue.
- Locking/backgrounding retains the captured state while the process and screen survive. A fresh mount, account change or process restart returns to the deck; there is no server active-attempt recovery.
- At zero, display zero and a neutral goal-reached caption, retaining both outcome actions. Zero awards no automatic credit and never counts overtime.
- New reps use the original start timestamp/time zone for their frozen activity date and day-sheet clock, even when completion or upload crosses midnight. Historical dates remain as previously recorded.
- If a phone write fails, clear only disposable confirmed day/month caches and retry once. When online, try the same operation directly against the API and await its bounded result. If neither save succeeds, continue with account-scoped memory and a dismissible loss-risk banner. Do not claim durable saving; termination can lose those memory-only submissions. Recovery remains automatic after dismissal.

### 5.3 Success

Show a separate completion celebration with the approved illustration, **“That’s a win!”**, supportive completion copy, and **Continue**. Continue opens Reflection for the completed attempt.

This screen does not require a streak claim, a weekly activity strip, a collectible award, ratings, or recommendation feedback. The normal path already has a phone-saved completion. The exceptional memory-only path celebrates the activity with its loss-risk warning still visible. A definitively rejected completion later loses provisional credit while retaining submitted content for recovery; a failed reflection edit never removes an accepted rep.

### 5.4 Reflection

Reflection asks **“How do you feel?”** with the qualifier **“Compared to before the challenge.”** Offer a single selection from:

1. A lot worse
2. A little bit worse
3. Pretty much the same
4. A little bit better
5. A lot better

Use the labeled facial choices in the final D1 design, with a visible and accessible selected state. Do not preselect the positive example shown in the mockup. This is one retrospective report of perceived change; the app has not collected a separate before measurement and must not calculate a clinical or measured before/after improvement from it.

Below the feeling choices, provide **Your reflection — optional**, the prompts “What went well? What was hard? What would you try next time?”, a multiline text field and the bottom action described below. The custom Dictate control is deferred.

- The reflection step remains optional, preserving the previous PRD’s optionality. Skipping never affects a completed rep or streak.
- **Approved September 27:** allow a feeling alone, nonempty text alone, or both. With neither, the bottom action says **Skip**; otherwise it says **Save Reflection**. Empty Skip sends no reflection request and leaves reflection null, never a fabricated neutral answer.
- Tapping the selected face again clears the feeling choice without changing typed text. The visible prompt remains “Choose one.”
- The post-challenge screen has no top Back/X, swipe-back exit or associated discard prompt. Its bottom Skip / Save Reflection action is the only exit and stays outside the scroll area, reachable above the keyboard on small screens and with large text. Unsubmitted text remains editor memory and is never uploaded automatically. The Progress day-sheet editor keeps its existing dirty-close prompt.
- Save Reflection persists the selected feeling and/or text with the attempt and its ordered PATCH upload intent before continuing. Background upload failure preserves the saved copy and retries automatically; it does not add ordinary network save-error UI. The exceptional device-write failure path uses the same cloud fallback and warned memory-only continuation as Completed.
- There are no cloud drafts, autosaves or draft/final/skipped resources. Initial submissions accept feeling-only, nonblank text-only or both. Progress Add/Edit changes text while preserving the original feeling. Stable submission IDs, expected revisions and ordered uploads protect replay and newer writing; a genuine revision conflict adopts the newest backend reflection automatically, with no chooser or merge screen.
- Do not add a custom speech-recognition dependency, microphone prompt, or Dictate control at launch. Ordinary system-keyboard features are not a custom app dictation implementation.

No separate anxiety scale, confidence scale, pre-challenge assessment, or “More/Fewer like this” question is required. Feelings and reflection text do not change challenge selection in the MVP.

### 5.5 Levels — deferred

There is no Levels page, level selector, skip action, or automatic advancement in the first release. The initial catalog is all easy Level 1 content. Preserve a stable Level 1 record and each attempt’s stable challenge/venue/level context so future levels can be added without rewriting history.

When levels are scheduled, the intended direction is a pool of challenges larger than the configured number of **different** completions required to advance, plus the previously requested Skip to this level flow. Exact thresholds, unlocking/skip behavior, and whether earlier completions count will be decided then. Do not invent a threshold or count catalog exhaustion as level completion now.

Paper’s Levels screens and [CURRICULUM.md](../archive/product/CURRICULUM.md) are future references, not launch requirements or approved numeric targets.

### 5.6 Progress

Progress contains:

- **Current streak**, **Best streak**, and **Total reps**.
- A navigable month/year calendar.
- Distinct inactive, active, today, and selected-day treatments, with a numeric rep badge for each active date.
- **Reps this month** and the number of **active days** in that selected month.
- A short legend explaining the small rep counts and the instruction to tap an active day.

The calendar visualizes completed activity. It has no Anxiety / Confidence toggle, metric heatmap, feeling-based day color, or “last rating controls the shade” rule. Users can open a completed day even if every reflection was skipped.

Month navigation updates both the calendar and monthly totals. All-time totals and streaks remain account-level metrics. Empty months and a new account show honest zero/empty states; loading or an API error must not appear as zero activity. Dates outside the displayed month are placeholders, not activity targets. Frozen activity dates are retained even if the phone clock places them ahead of today. Future dates can contribute total/month/best-streak credit; the current streak still ends today or yesterday. Implausible future starts are rejected by the API.

### 5.7 Calendar day sheet — P31

Tapping an active date opens a scrollable sheet with:

- The full day/date heading, such as “Friday, September 18”.
- Every completed challenge in chronological order, with an ordinal, readable instruction/summary, start time, and its submitted feeling indicator.
- An accessible close action and drag handle.

The sheet omits the day-level rep count and elapsed-duration displays by Anthony’s later decision; the calendar still shows each active day’s rep badge. Saved attempts retain the captured start and frozen activity date/time-zone context. They contain no server deadline, product completion timestamp or elapsed-duration field/aggregate.

The **Feeling** indicator uses the same five-choice vocabulary as D1. Missing/skipped feedback is **Not recorded**, never a neutral face; the compact empty-circle treatment must expose “Not recorded” accessibly. The three sample faces in P31 do not reduce the five-option scale.

**Do not include the Day note label, quote, input, or any day-level note data.** The final compact rows also do not require the old PRD’s two ratings or a visible level label on every row. Preserve the level, venue and stable challenge ID in history. Instruction text comes from the current linked challenge; minor wording edits can appear in older history.

Saved per-attempt reflection text is read from an expanded challenge entry showing its full instruction, feeling and submitted reflection. Phase 06 originally added reading only; Phase 07.4 adds inline Add/Edit text using the selected Paper soft-fill textbox, Cancel and Save. Feelings remain display-only, dirty closes preserve the save/keep-editing/discard choice, and empty text-only reflections cannot be saved. Deletion, day notes and a standalone journal destination remain outside scope.

### 5.8 Settings

Use the supplied grouped-row visual style, spacing, icons, and hierarchy as a reference. Functional scope comes from explicit product needs:

| Scope                                           | Settings capability                                                                                                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required by the tech-stack product flow         | Restore Purchases, manage subscription, optional Save recovery key and Transfer to another device, authenticated data export and account deletion, privacy policy and terms |
| Current Phase 10 entry and legal links          | Both analytics rows remain removed. Terms & Privacy contains ordinary links and Continue, with no legal-view/acceptance recording or analytics Settings switches            |
| Implemented Phase 08 preference                 | Reduce Motion: saved on this phone, with the phone's accessibility preference always taking priority; physical-device acceptance remains Phase 14                           |
| Phase 08 preference                             | Haptic feedback and its saved switch, implemented and physically tested together in Phase 08 before the free beta                                                           |
| Owner-approved October 9 addition               | Feature requests reuse Support’s private email draft to anthonyyoo24@gmail.com with a distinct subject and no automatic private attachments                                 |
| Deferred beyond the first release October 9     | Practice reminders, their notification permission flow and per-device scheduling                                                                                            |
| Reference-only; not committed by the screenshot | Reset progress, exact help/feedback/about rows, app-version footer, and the “On this device” grouping                                                                       |

Any storage explanation must describe phone saving, background uploads and credential-based cloud recovery accurately. Recovery on another device restores uploaded history; it cannot recover the only device copy of a still-pending submission. Do not promise complete backup or cross-device availability before upload. System reduced-motion settings apply even if a custom preference is omitted. Account deletion requires explicit confirmation and revokes recovery/access; it is not the same action as an unapproved Reset progress feature.

Feature requests remain available without paid access and reuse support's private contact flow and configured destination. Distinguish suggestions with an email subject or form request type. Requests contain only what the user deliberately submits; do not automatically attach private reflections, activity history or recovery credentials. Public boards and voting are outside the first-release scope. A failed link opening shares support's existing toast presentation and leaves the action available.

Phase 10 removes the empty Privacy group with its two unavailable analytics rows, leaving Preferences, Account & data, Support and About from the October 9 grouped Settings design. Support sits directly above About and contains separate Get help and Suggest a feature email-draft actions. About contains the legal links, Rate on the App Store, and Instagram, TikTok and Twitter/X profiles. The owner confirmed the profiles and App Store listing are not ready; their rows stay unavailable until public destinations are configured. The rating action links directly to Write a Review. Link-opening failure shows plain feedback and permits retry; no activity or account payload is appended.

In-app account deletion includes the automatically created no-signup account and associated data. Do not require a support email or call to delete it. Explain any retained data or delayed cleanup. When subscriptions are active, explain that deleting the app account does not cancel billing through Apple, offer subscription management and retain immediate deletion. See [Apple account-deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion).

## 6. Challenge selection and activity counts

Published challenges have a stable ID, current instruction/configuration, active flag and Level 1 link. Venue-card placements reference challenge IDs. The 58 challenges provide 61 reviewed placements: Gym 11 and each other venue 10. All current durations are 300 seconds; nullable subtext is not displayed. Minor wording edits update the challenge and later appear in history; substantially different activities receive new IDs. Inactive challenges/placements remain for history and pending upload references.

Venue selection and each venue's ordered deck are saved separately from activity, per account on this phone. Skip, completion and give-up rotate only the matching front placement; browsing needs no server queue/preferences/skips. Preference saving is best effort and cannot weaken submitted-activity safeguards. Repeated deliberate completions get new IDs, while every retry of one save keeps its original UUID.

- An eligible local completion contributes one provisional rep. Matching backend acknowledgement and aggregate reconciliation preserve that same rep without duplication or regression.
- A definitively rejected completion keeps its content for recovery but contributes no reps/calendar/streak credit. Temporary/uncertain/authentication failures retain provisional credit. A reflection-only rejection never removes valid completion credit.
- No level threshold, daily cap, unlocking or advancement is computed at launch.
- At least one eligible completion makes its frozen activity date active. Additional completions add reps, not active days.
- Current streak counts consecutive active dates ending today or yesterday; best streak is the longest run. Both are zero without activity.
- New reps freeze the date of the captured start in its phone time zone. Travel, completion, reflection saving and upload cannot move them. Existing historical dates are preserved without recalculation.

Challenges must respect consent, social context and personal safety. Never reward speed or intrusive behavior to satisfy a timer or streak.

## 7. State, persistence, and reliability

PostgreSQL holds authenticated account history and accepted completed attempts, including inline submitted feeling/text/revision. AsyncStorage holds the account's downloaded catalog and one validated versioned journal envelope containing submitted records, immutable ordered operations, acknowledgement/reconciliation metadata and permitted history snapshots. Credentials and identity proposals stay in secure Keychain storage.

React owns the unfinished challenge and editor drafts; Zustand owns shared browsing/completion/activity state; TanStack Query owns remote reads and in-memory pages. Hydration, account switches, cancellation and generation fences prevent older data or callbacks from replacing newer writing or another account's views.

Persist the full downloaded catalog and latest Progress summary, current month's calendar counts and today's available day pages. Other months and other days require online reads even after viewing; do not persist the entire query cache or prefetch every day. Available cached/local entries display normally. An unavailable offline lookup shows a connection-required state rather than false empty totals or endless loading. Rollover discards obsolete downloaded period caches while retaining pending activity and required reconciliation metadata.

Normal Completed/Save Reflection/Add/Edit navigation follows a successful phone write and automatic background uploading. Phone storage failure clears only disposable confirmed period payloads, retries once, then tries the same operation online. Confirmed backend saving is durable but does not promise an offline device copy. If both saves fail, account-scoped memory permits continuation with an accurate dismissible loss-risk banner. Partial recovery retains the warning; full recovery closes it and produces one recovery toast, including after dismissal. Closing the app before any durable save can lose those submissions.

One sender uploads each create before dependent reflection patches and binds later revisions in order. Temporary failures retry immediately, then after about 2 and 5 seconds; reconnect/restart/foreground and sparse active-online cooldowns provide later opportunities. Respect Retry-After, coalesce triggers and cancel account-bound timers. No ordinary upload-error toast, manual network retry gate or pending-upload Home status is added.

Attempt UUIDs and reflection submission IDs remain stable through lost acknowledgements and restart. Matching PATCH replay acknowledges its original applied revision without reapplying it. Newer local writing survives older acknowledgements; genuine revision conflicts adopt the current owner-scoped backend reflection automatically. Permanently invalid input remains available for explicit correction, and account/storage/integrity failures remain discoverable through saving/recovery presentation.

Never evict pending or memory-only activity as ordinary cache cleanup. Prune full records only after their latest content and necessary acknowledgement writes are settled and the current flow, today, dependent operations and aggregate reconciliation no longer need them. Recovery after another-device install covers uploaded history; the owner accepted the risk of losing an only-device pending copy, with no additional backup system in Phase 07.

## 8. Privacy and analytics

Cloud storage is part of the journal feature. Product analytics remains disabled through free beta and paid launch. Phase 11 implements scrubbed Sentry crash/error reporting, with ordinary delivery still disabled pending its notice/provider and signed-build gates. Phase 12 owns readable public notices and document labels; Phase 14 verifies the signed launch build. Terms & Privacy records no agreement, document views or accepted legal versions and does not gate navigation by document version.

Phase 15 owns post-launch product analytics and its [approved event allowlist and measurement plan](../implementation-plan/phase-15-analytics.md#phase-15-measurement). Keep that future scope out of launch collection and do not backfill pre-activation history. Before activation, review the actual provider/payloads, lawful basis, required permission and privacy choices, and update notices/disclosures. The actual permission/collection design remains to be reviewed; Continue, document viewing and historical legal receipts confer no analytics permission. Do not silently reintroduce the rejected tracking or version-gating mechanism.

Keep analytical processing separate from product saving: analytics failures never prevent saving reflections or eligible paid access. Stable event identities prevent retry double-counting. Feeling codes or coarse reflection-length metadata require disclosed, reviewed scope; raw reflection text, audio, credentials and payment details must never enter analytics or diagnostic payloads. Sentry reports must also exclude feelings and request bodies. No session replay/autocapture is approved.

Future client/server forwarding must enforce the reviewed permission/collection design and fence account changes, deletion and applicable privacy requests. The independent analytics restriction marker can limit processing and never grants permission. Final legal review remains open; readable notices and ordinary continuation do not establish worldwide sufficiency. Collect an analytics baseline only after activation before setting targets; retrospective feelings and retention correlations do not establish wellbeing improvement or causation.

## 9. Explicit non-goals

- Separate anxiety/confidence scales, pre-challenge ratings, clinical scoring, or automated mental-health conclusions.
- A feeling heatmap, line graph, multi-month contribution grid, or standalone recent-challenges/journal page.
- Day notes, day-level journaling, and raw audio recordings.
- A separate replay mode; ordinary independent venue-stack cycling is included.
- XP, points, speed bonuses, collectible badges, leaderboards, social feeds, or sharing.
- Favorites implied by the heart, a browsable challenge library, or GPS-based venue discovery.
- Personalized recommendations based on feelings/reflections or “More/Fewer like this” feedback.
- Practice reminders, Levels UI, level unlocking/skipping/advancement, additional category filters, custom dictation, lock-screen timers, and an Android release at launch.
- A shipped AI coach, voice coach, or Stripe checkout in the initial release.
- Automatic inclusion of every Settings reference row or every draft curriculum course.
- SQLite, exhaustive offline history, multi-phone reflection conflict choosers, additional backup systems or a generic server upload outbox.

## 10. Fit with the tech stack

Keep the proposed React Native + Expo + TypeScript application, API, and PostgreSQL architecture. These screens use the already planned card gestures, animations, sheets, native text input, the in-app countdown, and phone saving with background synchronization and server history. No new charting engine, real-time backend, database type, or AI feature is required by the designs.

Implementation must align contracts with the stable challenge/venue placements, account-scoped phone-only deck preferences, five descriptive feeling values, start-date attribution and explicit local saving. Exact fonts, artwork, tokens, and responsive measurements need a fresh export from the final Paper references; the older Analog design tokens are not the approved final palette/type system.

This PRD carries product behavior; native-library compatibility, secure recovery, billing processing, API retry/concurrency mechanics, and deployment remain governed by [TECH_STACK.md](../architecture/TECH_STACK.md).

## 11. Acceptance criteria

| ID    | Required result                                                                                                                                                                                                                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-01 | On iOS, account bootstrap requires no signup form; valid recovery restores only the authorized account. Credential failures cannot create duplicate accounts silently.                                                                                                                                                                             |
| AC-02 | Terms & Privacy has ordinary links and Continue using the normal identity proof, with no legal acceptance/view receipts, accepted-version persistence or version-driven navigation. Preserve recovery and first-deck preparation; additional welcome/questionnaire onboarding remains deferred.                                                    |
| AC-03 | The hard paywall supports purchase, restore, and honest pending/failed verification; essential recovery, subscription, legal, and data controls remain reachable when unpaid.                                                                                                                                                                      |
| AC-04 | Six Level 1 venue decks shuffle once and cycle independently, with order/front/last venue saved per account on this phone. Left/X saves only optional deck preferences; right/heart starts locally. Each Completed action creates one stable UUID; retries cannot duplicate a rep.                                                                 |
| AC-05 | Home validates nonempty venue catalogs, distinguishes initial loading/failure/offline misses, and keeps downloaded cards usable through refresh failure. Omit level progress.                                                                                                                                                                      |
| AC-06 | Active Challenge covers Settings/tabs and exits only through Completed or Give up. Lock/background preserves captured start/duration while alive; a fresh mount, account change or process restart discards unfinished activity.                                                                                                                   |
| AC-07 | **Deferred:** lock-screen display; not an iOS launch gate. The in-app lifecycle remains covered by AC-06.                                                                                                                                                                                                                                          |
| AC-08 | Completed saves one rep locally and uploads in the background using the same UUID/start values. Preserve stable challenge/venue/Level 1 context; definitive rejection removes provisional credit, and Give up grants none.                                                                                                                         |
| AC-09 | Success follows the phone save, or confirmed exceptional cloud save; warned memory-only continuation makes no durable-save claim. Continue is the only exit from a valid result and opens that attempt’s Reflection without a streak requirement; swipe-back is disabled.                                                                          |
| AC-10 | Reflection uses the five specified relative choices with no default answer, optional text, accessible selected states, and normal keyboard editing. The only post-challenge exit is bottom Skip/Save, reachable above the keyboard; Progress retains dirty-close protection. Skipping preserves earned credit.                                     |
| AC-11 | Explicit saves preserve feeling/text on the correct attempt with ordered PATCH/revision/replay protection. Progress edits text only. Newer input survives older acknowledgements; genuine conflicts automatically adopt current backend writing; no draft autosave.                                                                                |
| AC-12 | **Deferred:** Levels UI, thresholds, unlocking, skipping and historical-credit policy. Preserving Level 1 context does not implement these rules.                                                                                                                                                                                                  |
| AC-13 | Independent summary/calendar/day reads combine local/backend activity once, preserve totals through acknowledgement and stale responses, and expose current/best streak, all-time/month reps and active days. Offline downloaded history is limited to current-month counts/today’s pages.                                                         |
| AC-14 | An available active date opens all loaded entries chronologically by original start and ID, with start time and exact feeling labels or Not recorded. Other days require online lookup. No duration, day-level rep summary or Day note.                                                                                                            |
| AC-15 | Settings implements only scoped capabilities, accurately describes phone saving/cloud recovery and pending-copy limits, and does not add Reset progress solely from the reference image.                                                                                                                                                           |
| AC-16 | Product analytics stays disabled through paid launch. Phase 15 must review its permission/collection design before activation without inferring permission from Continue or old receipts. Account changes/deletion/privacy requests fence delivery; failures never block saves. No journal text, audio or credentials enter analytics/diagnostics. |
| AC-17 | Controls work with screen readers, text scaling, reduced motion, platform back navigation, and keyboard/sheet interactions on iOS. Android verification is deferred.                                                                                                                                                                               |

## 12. Validation and implementation order

1. Begin Apple Developer enrollment/account readiness, App Store Connect app identifiers and Expo/EAS signing setup alongside development. RevenueCat/store-credential connection and subscription-product configuration wait until Phase 07A after the free beta; record unresolved offer/design decisions with the phase they block.
2. Prove no-signup iPhone identity/recovery and its fallback, then build shared API/navigation boundaries; welcome/questionnaire onboarding is deferred.
3. Build the six Level 1 venue decks, local unfinished challenge/countdown and phone-saved completion/Success flow.
4. Add typed reflections and the full Progress summary/calendar/day sheet against real cloud data.
5. Finish Settings/privacy controls and validate the core app in a free TestFlight beta with server-authorized tester access.
6. Activate native iOS purchases and billing recovery, verify the free-to-paid transition and complete paid App Store submission acceptance. The October 9 beta-first sequence defers commercial setup; it preserves all nine paid subscription rules.

Use the detailed [implementation plan](../implementation-plan/README.md) for dependencies and the release checklist. Launch acceptance is AC-01–06, AC-08–11, and AC-13–17. AC-07 and AC-12 are deferred; they do not block submission.

Include duplicate completion, phone-write failure and warned memory-only recovery, offline/reconnect and lost acknowledgements, ordered text edits/backend-wins conflicts, empty Skip, deck cycling/first-download failure, independent Progress reconciliation, rollover/time-zone boundaries, identity recovery and purchased-but-unverified billing cases. The saved browser app/API/database suite runs through `npm run test:journey` and required CI; publication-specific hosted results and native/device gates are recorded separately in handoffs. Browser previews supplement real iOS development-build/device testing for Keychain and store purchases. Android, native lock-screen surfaces and custom dictation receive their own validation when implemented.

## 13. Remaining decisions and design gaps

The table records outstanding decisions and previously approved reflection rules. Other proposed defaults are recommendations, not newly approved scope. Reduce Motion's saved preference and system priority are implemented; remaining physical-device, VoiceOver and text-scaling acceptance belongs to Phase 14, separately from open design work.

| Decision                             | Proposed default / work needed                                                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding and commercial offer      | Question/branching flow is deferred. Define purchase products/pricing/trials and paywall designs before phase 07A. Keep no-signup entry and native-first paid access.                                                             |
| Reflection optionality and dismissal | Approved September 27 and updated October 15: optional overall step; feeling-only, text-only or both; bottom Skip when empty or Save Reflection otherwise is the only post-challenge exit. Progress keeps its dirty-close prompt. |
| Reading saved reflection text        | Approved September 27: expand a day entry to read its submitted per-attempt reflection. Phase 07.4 adds explicit text-only Add/Edit while preserving feeling; deletion remains excluded. Do not use a day-level note.             |
| Future levels — not a launch blocker | Decide thresholds, unlocking/skipping, partial/final-level behavior and treatment of prior Level 1 completions when scheduling levels. Preserve history now; do not implement hidden progression.                                 |
| Supporting UI and formatting         | Finalize remaining Settings/privacy controls, Phase 08 haptic preferences and outstanding missing/empty or short-screen/text-scaling designs. Confirm the visual role of the three Home color variants.                           |
