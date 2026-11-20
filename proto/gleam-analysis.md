# Gleam onboarding, paywall and pricing: notes for JustGO (2026-11-19)

Research only. Source: 47 screenshots and 7 screen recordings in `~/Documents/apps/screens/gleam` (captured Oct 25–27, 2026, US storefront, USD). No repo edits. Gleam's art and copy are reference only: JustGO writes its own.

## Paywall prices (what Gleam actually showed)

| Plan | Price | Framing on paywall | Trial | Preselected | Badge |
|---|---|---|---|---|---|
| Yearly | US$89.99 / year | "$7.5 / mo." on the card; fine print "$7.49/mo" | 7 days free ("1-week free trial" on Apple's sheet) | Yes, it is the only plan shown | None |
| Weekly | not shown | — | — | — | — |
| Monthly | not shown | — | — | — | — |

- One plan only. No plan picker, no weekly or monthly option, no "save X%" badge.
- Apple's own subscription screen shows "See All Plans", so the subscription group may hold other plans. None appeared in any capture.
- Button: "Try for $0.00". Fine print under it: 7-day free trial, then $89.99 per year billed automatically, cancel anytime. Footer: Terms · Privacy Policy · Restore.
- Per week that is about $1.73. Gleam never shows a weekly figure.

## Video durations

Frames grabbed every 2 s with a Swift `AVAssetImageGenerator` script (no ffmpeg). All seven opened without errors.

| Video | Date | Length | What it shows |
|---|---|---|---|
| v1 | Oct 25 10:33 | 581 s (9 m 41 s) | Full onboarding → paywall → purchase → welcome → home → cancels the trial in iOS Settings |
| v2 | Oct 25 11:10 | 865 s (14 m 25 s) | Tour of tabs, Settings and Manage Subscription, first full lesson, rating prompt, speaking practice |
| v3 | Oct 25 11:25 | 244 s | Second lesson |
| v4 | Oct 26 11:37 | 211 s | Day-2 lesson, streak screen |
| v5 | Oct 27 14:15 | 154 s | Lesson |
| v6 | Oct 27 14:18 | 103 s | Lesson end, 3-day streak |
| v7 | Oct 27 15:19 | 215 s | Lesson |

Total about 39.5 minutes.

## 1. Onboarding, step by step

About 33 screens before the trial screens, then 2 trial screens, then the paywall. In v1 it took about 6 minutes (with pauses for screenshots).

Numbers are the screenshot numbers.

- 01 Welcome: language picker, "Begin your journey", and a sign-in link for existing accounts.
- 02 Name (text field). Used later in the letter and the profile.
- 03 Gender (3 options plus "prefer not to say").
- 04 **"How did you hear about us?"** (Google, TikTok, Reddit, AI tools, Instagram, etc.; option order changes between runs). Attribution only.
- 05 What brought you here (multi-select).
- 06 Preparing for a specific moment? (this week, 2 weeks, a month, long term). Feeds the "your timeline" framing.
- 07 Skills to improve (multi-select, says it won't limit you).
- 08 Did you know #1: health and relationships stats with citations.
- 09 Did you know #2: first-impression stats.
- 10 Interstitials: "Let's personalize your growth plan" and "A few quick questions." Each opens a block of questions.
- 11 0–10 slider: recharge alone or with people.
- 12 Confidence meeting new people (3 options).
- 13–14 Two agree/disagree statements. Continue stays disabled until answered.
- 15 Did you know #3: freezing up is normal (reassurance, bullets animate in).
- 16–18 Three 0–10 sliders (talking to someone attractive, a room of strangers, saying no).
- 19 Your social strength (pick one of four).
- 20 How often you try new situations.
- 21 Social skills overall.
- 22 "Analyzing your answers…" loader.
- 23 Scratch-to-reveal card.
- 24 **Score reveal**: 37/100 ring, four sub-scores, an archetype name and encouraging text.
- 25 **Chart**: "using the app daily" vs "mindless scrolling" from today to one month, with a "3x faster" claim and citations.
- 26 What have you tried before (multi-select).
- 27 Daily practice goal (5 / 10 / 15 / 20+ minutes).
- 28 **Notification pre-prompt** ("make it a habit", a mock iOS dialog with an arrow, button "Remind me to practice").
- 29 Real iOS notification prompt.
- 30 **Widget ask** (streak widget mock, "Add widget" / "Not now").
- 31 **Letter from future self**: personalized with the name, dated one year out, then "Hold to commit" (press and hold a fingerprint).
- 32 "Building a personalized plan": 0→100% with a three-item checklist and glowing screen edges. The app's home screen flashes for a frame behind it, so the paywall is a layer over the app.
- 33–36 Trial screen 1, trial screen 2, then the paywall (section 2).

Pattern: questions in short blocks, each block opened by an interstitial and broken up by a "did you know". Commitment (daily minutes, notification, widget, letter) all comes right before the paywall.

## 2. The paywall sequence

**Trial screen 1: "How your free trial works"** (screenshot 33)
- Vertical timeline: Today (unlock everything) → In 5 days (reminder) → In 7 days (billing starts, with the exact charge date).
- "No Payment Due Now" with a check mark. Button "Try for $0.00". Terms · Privacy · Restore.
- No close and no back button.

**Trial screen 2: reminder promise** (34, 35)
- "We'll send you a reminder before your free trial ends", animated bell with a badge.
- "No Payment Due Now". Button "Continue for FREE". A back chevron returns to screen 1.

**Paywall** (36)
- Headline about becoming the best version of yourself, "in 45 days".
- Laurels: 4.9 average rating, 250k+ users.
- "You'll become a completely different person by: <date 45 days out>".
- Scrolls to more check-mark benefits and a 5-star testimonial.
- Shield line: "Try risk-free. Refund guaranteed if no results."
- One plan card (Yearly, 7-day free trial, $89.99, $7.5/mo), button "Try for $0.00", auto-renew fine print, Terms · Privacy Policy · Restore.
- Only exit: a back chevron that returns to trial screen 2. No X, no "maybe later", no skip.

**How hard is it?** In practice it is a hard paywall. Every path forward goes through the purchase, and back only loops to the trial screens. The capture never shows the user leaving, so these are not verified: what happens on a swipe-close of the app, a declined Apple sheet, or a "free tier". One hint of a soft side: the welcome screen says "Your daily limit is gone", which suggests a limited free mode exists somewhere. No second offer or discount appeared in any capture, but the user never declined, so that is unverified too.

**Apple purchase sheet** (37): "Yearly Subscription", 1-week free trial starting today, $89.99 per year from the charge date, Apple's standard cancel text, double-click to confirm.

**Success**: system alert "You're all set. Your purchase was successful." (38).

**Welcome to PRO, 3 pages** (39–41)
1. "Welcome to … PRO", your free trial just started, three unlocked features with check marks.
2. "We'll remind you before your trial ends": a lock-screen mock notification ("trial ends tomorrow, keep PRO or cancel in one tap"), "Easy to cancel, no penalties or fees", "Nothing is charged until <date>".
3. "Ready for your first lesson?": the first lesson card, "Start my first lesson" or "I'll look around first".

Small inconsistency: the timeline says the reminder comes "in 5 days", the mock notification says "ends tomorrow" (day 6).

## 3. After purchase

- **Home**: a path of lesson nodes (module title card, locked future lessons), XP and streak counters, "Next Lesson" button.
- **Tabs**: Home, Library (courses with art), a center button (AI coach), Practice (speak a prompt aloud, get a score), You (level, XP, rank, streaks, activity calendar, community link).
- **Lesson**: about 5–8 minutes. Learn cards, multiple choice, card sort, chat scenarios (type or hold to speak), reflections, recap with "Try this today". Then "Perfect Lesson" with XP, streak screen, streak-freeze reward, and a feedback box.
- **Rating prompt**: Apple's native "Enjoying …? Tap a star" right after the first finished lesson.
- **Settings**: Manage Subscription screen (plan, status, member since) with a "Before you cancel" note that cancellation happens in Apple's billing portal and access lasts to the end of the period, and a "Cancel or manage subscription" button that opens Apple's page. Also Terms, Privacy, support email, sign out, delete account.
- **iOS subscription screens** (45–47, v1 end): the user cancelled the trial minutes after buying. Apple shows "free for 7 days, then renews at $89.99 per year", "Cancel Free Trial", confirm, then "Your subscription is expiring… you can subscribe for $89.99 per year". Access continued through the trial (v3–v7 still show PRO two days later).

## 4. What JustGO should copy, adapt or skip

**Copy**
- The trial timeline screen (today / reminder / charge date) with the real date and "No payment due now". It is honest and lowers fear of the trial.
- The reminder promise, but only if JustGO really sends it: a local notification scheduled on the phone 2 days before the charge date. No server, no analytics.
- One clear button, the full price-and-renewal sentence under it, and Terms (EULA) · Privacy · Restore on every paywall screen. That covers App Store guideline 3.1.2.
- The three-page welcome after purchase, ending on "start your first challenge".
- A Manage Subscription row in Settings that explains cancel happens in Apple and opens Apple's page.
- Apple's native rating prompt after a first completed challenge.

**Adapt**
- Questions in short blocks. JustGO's should be about dating apps and goals: how long on the apps, how they feel after a session, what they want instead (meet people in person, friends, confidence), and how bold the first challenges should be. Use the answers to pick the first challenges, so the "building your plan" step is real, and keep it short (2–3 s).
- A summary screen instead of a numeric score: "Your starting point" with the user's own answers played back. No made-up 37/100.
- Commitment: daily or weekly challenge goal, then the notification pre-prompt, then a short commitment (a "hold to commit" pledge in JustGO's words). JustGO's journal fits a "note to future you" better than a fake letter.
- "Did you know" cards only with real, cited sources (for example on loneliness or dating-app burnout). Check each source before use.
- Paywall headline: one plain promise, such as more real-world plans and fewer swipes in 30 days, not a personality transformation.

**Skip**
- **"How did you hear about us?"** It exists only for attribution. JustGO has no analytics and must not collect it until Phase 17.
- Gender, unless a challenge actually needs it.
- Rating and user-count laurels until JustGO has real numbers.
- "Refund guaranteed if no results". Apple handles refunds, so JustGO cannot promise one.
- "You'll become a completely different person by <date>" and other outcome promises.
- The widget ask, unless JustGO ships a widget.
- XP, ranks and leaderboards at first. Streaks are fine if they stay on the phone.

**Privacy notes for Superwall**
- Keep onboarding answers on the phone. Do not pass them as Superwall user attributes or event parameters.
- `eventTrackingBehavior: "none"`, as the payments note already says.
- The paywall belongs in JustGO's own billing screen, so it needs no Superwall-rendered paywall.

## 5. Suggested JustGO offer

| Plan | US price | About per week | Trial | Preselected |
|---|---|---|---|---|
| Annual | US$59.99 / year | $1.15 | 7 days free | Yes |
| Monthly | US$12.99 / month | $3.00 | None | No |
| Weekly | Skip at launch | — | — | — |

Reasoning:
- Gleam anchors annual at $89.99 with a 7-day trial and shows only annual. JustGO is newer, narrower and has no AI coach or speech scoring, so start lower. $59.99 is about $5 a month.
- Keep a monthly plan so the annual looks like a good deal ("save about 60%" is true at these prices) and so people who distrust a year have a path. No trial on monthly keeps the trial on the plan we want.
- Skip weekly. It reads as aggressive, does not fit a calm app about leaving swipe apps, and Gleam doesn't show one either. Add it later only if Anthony wants to test it.
- Show the annual as "$59.99 a year (about $5 a month)" and keep the yearly total the largest price on the screen, which Apple expects.
- **Canada and UK**: Apple sets local prices from the US base price when you pick one in App Store Connect. Canadian prices usually land near 1.35–1.4× the US number, and UK prices (with VAT) usually land near the same number in pounds. Check the exact CA$ and £ figures in App Store Connect's price table before setting them, and round to a clean tier (for example CA$84.99 / £59.99 or nearby) if Apple's automatic value looks odd.
- Free-launch users: whether they get a grace period or a trial is still open in the payments note. Their history always stays.

## Summary

- Gleam shows one plan only: Yearly US$89.99 ($7.49/mo) with a 7-day free trial, preselected. There is no weekly or monthly plan and no discount offer.
- The paywall is hard in practice: no X or skip. The only back button loops to the trial screens, and nothing in the captures leaves without buying. A free "daily limit" mode is hinted at but never shown.
- Suggested JustGO offer: Annual US$59.99 with a 7-day trial, preselected; Monthly US$12.99 with no trial; no weekly plan; CA$ and £ prices taken from App Store Connect's table.
