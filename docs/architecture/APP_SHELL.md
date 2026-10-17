# App shell and shared API

This guide describes navigation, mobile runtime composition and platform-facing
presentation. [ACTIVITY_DATA.md](ACTIVITY_DATA.md) owns activity persistence and
reconciliation; [IDENTITY.md](IDENTITY.md) owns account proofs and recovery;
[TECH_STACK.md](TECH_STACK.md) owns installed technologies/server boundaries.
The [plan](../implementation-plan/README.md) owns future behavior and the
[handoffs](../handoffs/README.md) own verification and open release gates.

## Implemented folder responsibilities

`src/app/` connects Expo Router to screens and layouts. `app-support/` composes
providers, startup/access, identity/account recovery and saving feedback. Product
capabilities live in `features/`; shared saved activity and synchronization live
in `data/activity/`. Shared UI, general infrastructure, design tokens and reusable
platform adapters live in `components/`, `lib/`, `theme/` and `platform/`.
[FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md) owns the complete current path map.

Features can consume app-support providers and data. App support can compose
features/data/shared code, but cannot import route implementations. Data uses
contracts/general infrastructure/platform adapters and cannot import UI, features,
app support or routes. Shared code cannot import app-specific layers. Only the
guarded `app/preview.tsx` route loads `dev/` from production source; the route and
fixture loader both require `__DEV__`.

## Runtime composition and account ownership

`app-support/providers/AppProvider.tsx` composes the identity controller,
account-scoped client/query cache, telemetry helper, activity runtime and challenge
controller. It synchronizes account identity before consumers, forwards foreground
and connectivity changes, and stops account work/listeners during teardown.
Installation-level Motion and Haptics providers sit outside account/access guards.

Account changes synchronously advance the request generation, abort pending
requests and clear queries/mutations before exposing the next account. Late
responses are fenced even when transport cancellation is ignored. Same-account
automatic session recovery preserves that owner boundary; explicit recovery resets
it. Memory-only submissions stay parked in their original account partition while
the process survives. They never migrate to the next account or use its session.

A runtime created before async hydration must reconcile the current snapshot when
connecting and subscribe to later changes. A construction-to-subscription gap
must not hide hydration or newer accepted input. `ProgressRefresh` receives its
runtime from the composing provider; shared subscriptions stay context-free so
observers do not import their provider back and create a module cycle.

React can restart an effect while retaining the state-owned runtime. Cleanup parks
activity/client work without erasing recoverable input; foreground reconnects the
current runtime. After changing provider lifecycle effects, fully reload the
installed development app if Fast Refresh retained a disposed runtime. A preview
with file watching disabled must be restarted before its bundle proves edits.

## Navigation and access

| Route                                       | Responsibility                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/` startup gate                            | Restore identity and verify access; distinguish loading, unavailable and unpaid     |
| Home in `/(tabs)` and `/progress`           | Catalog/deck and independent Progress reads with the shared local overlay           |
| `/challenge`                                | iOS Active → Success flow; empty/restarted start context returns Home               |
| `/success`, `/reflection`                   | Current-account completed result and explicit reflection submission                 |
| `/settings`, `/recovery`, `/account/[tool]` | Preferences, account tools, recovery, direct export and support outside paid access |
| `/delete-account`, `/welcome`               | Durable deletion/cleanup and safe entry after deletion                              |
| `/export-data`                              | Redirect older export links to Settings                                             |
| `/preview`                                  | Guarded development fixtures and haptics tools                                      |
| Unknown links                               | Provider-independent `+not-found` screen with Go home                               |

The root layout uses `Stack.Protected` for account/access/deletion boundaries.
Pending deletion removes the selected account's product screens from Back history;
welcome becomes available only after required cleanup. Route visits cannot invent
completed attempts or restore unsaved drafts. Settings, recovery, export and
deletion remain reachable without paid access.

The root `ErrorBoundary` renders `RouteErrorScreen` after an unhandled render error
replaces the layout and its providers. It uses no app provider, hides private error
text and retries by rendering the layout/providers again. Unknown links remain
outside protected groups and replace themselves with Home when dismissed.

### Access verification

`AccessService` calls `IdentityService.withSession` and supplies that same verified
owner transaction to an entitlement reader. The default provider returns
unavailable. Explicit application staging can compose operator-approved free beta
grants with start/expiry/revocation and earlier-start coverage; client requests
cannot grant access. [The beta setup](../handoffs/phase-11-test-server.md) owns its
environment and release limits.

Mobile polls every 30 seconds and accepts a server verification for at most
60 seconds, never beyond expiry. A failed recheck closes access. A server check
up to five seconds ahead of receipt uses one bounded clock offset for admission,
freshness and closure timers. Stale or more distant future checks remain closed;
clock alignment cannot extend validity. Refresh on foreground.

This current boundary is distinct from the planned persisted paid-access rules in
[Phase 07A](../implementation-plan/phase-07a-billing.md). Activity upload
eligibility checks verified coverage for the original start rather than today's
paid status, through its separate injected reader. Neither an unavailable provider
nor a navigation guard grants production paid access.

## Request policy

The shared HTTP transport validates HTTPS URLs, with HTTP allowed only for
development loopback, validates strict response schemas, bounds the whole operation
including body parsing to ten seconds, and supports cancellation even when a
transport ignores AbortSignal. Credentials stay in headers/bodies, never URLs or
logs. Transport messages and response bodies cannot become diagnostics.

The account client owns at most two sends in one ten-second total budget for an
eligible GET retry or authentication replay. It classifies reads by resolved
method, so a bodyless DELETE is a write. It never retries an uncertain write;
the persisted activity sender owns completion/PATCH replay. Validation, conflict,
rate-limit, revoked-session and typed 413/415 failures do not become outage retries.
Authentication replay retains the original serialized body.

Concurrent expired-session responses share one renewal/recovery operation and reuse
an already rotated token. There is no recursive renewal loop. Renewal has its own
ten-second deadline and releases its cached promise on timeout. Identity actions
bound I/O, release busy state and fence late results. Native storage writes remain
serialized after a timeout because native I/O cannot be cancelled safely. A timed-out
write invalidates in-memory identity state so retry rereads the durable intent;
a never-returning write must not permit overlapping storage mutations.

TanStack Query retries are disabled for reads and mutations. Query keys begin with
`['account', userId, ...]`, and requests consume query cancellation. `stableAction`
snapshots an ID/input for manual replay; the consuming server endpoint must still
enforce owner and matching-input idempotency.

## Challenge presentation and lifecycle

[CHALLENGES.md](../product/CHALLENGES.md#challenge-loop-and-content) owns the
six-venue cycling rules and product behavior. The challenge controller owns
account-scoped catalog/deck continuity and accepted completion context.
`ChallengeActivityProvider`, above the navigator, owns the in-memory active start
across Home and `/challenge`. Start freezes the card, timestamp and time zone;
countdown samples start + original duration once per second and on foreground.
Background/lock retain it while the process survives. Fresh mount/account change/
process restart discard unfinished activity. Zero waits for explicit Completed or
Give up; Give up records nothing.

On iOS, keep the outgoing deck's identity when Home loses focus. A focus-based key
would remount its resting state before the destination covers it and flash the
accepted card. `NativeChallengeHandoff` prepares an opaque window overlay, waits
for layout and decorative images, opens `/challenge` once and remains until the
destination's layout/images and entry transition settle. Image failures also settle
readiness. The cover blocks actions and mirrors saving feedback without creating a
second toast host; the account-owned provider acknowledges presentation.

`ChallengeFlowScreen` prepares Success beneath opaque active content, with hidden
input/accessibility until completion. Completed reveals Success in place, avoiding
an intermediate native modal dismissal or route blend. Active disables back gestures;
Success enables them. Continue replaces `/challenge` with `/reflection`; returning
Home clears its active/result context. Standalone `/success` remains available for
restored results and Android/web completion.

Android/web use `ActiveChallengeModal` and focus-based dismissal. Native input/
accessibility isolation and the web inert/ARIA adapter disable underlying navigation.
For native full-screen content sharing the root window, use safe areas measured
above the stack on the first frame and avoid adding the same inset twice. Web uses
root measurements with inner inset edges disabled; Android retains dialog-owned
measurement because its window bounds can exclude system bars. Verify first and
repeated native openings; browser/component evidence cannot prove inset timing.

## Reflections and Progress presentation

Completed waits for repository saving; ordinary local success never waits for HTTP.
The reflection controller owns validation, dirty-close decisions and newer-input
protection. Only explicit saves enter the journal; there is no draft autosave or
URL-based completion recovery. `useReflectionKeyboard` measures the section and
available viewport, adds trailing scroll space and brings the focused editor into
view. The bounded internally scrolling input and fixed Skip/Save footer preserve
access on reduced viewports; focus scrolling honors effective Reduce Motion.

`ProgressScreen` owns selected date/editor coordination; independent read hooks
accept repository data. `ProgressView` composes the calendar, day sheet and entry
rows. The day-details group keeps sheet/motion, entry expansion and reflection
editor responsibilities together. `ConnectedDayReflectionEditor` owns draft
subscriptions so typing updates stay inside the active editor.

`DayEntryList` initially mounts eight rows, fills ahead of scrolling and requests
further backend pages. Visited rows stay mounted until the day closes so animated
heights/drafts survive. Fill underfull viewports using layout/content measurements
and await each batch's measurements before extending again. Compare full display
values and callback identity when memoizing rows. Collapsed detail content/motion
adapters stay unmounted; do not measure every collapsed panel. Native expanding
heights and scrolling require native evidence.

## Saving feedback and account tools

`SavingFeedback` owns root/covering-sheet hosts and `SavingNotice` owns exceptional
loss-risk/intervention presentation. Warnings reserve layout space and permit
manual dismissal while recovery continues. Full recovery closes the warning and
emits one account-scoped toast, including after dismissal. Authentication,
unreadable storage and rejected records remain discoverable; correctable reflection
input reopens in the existing editor. Genuine revision conflicts adopt backend
reflection data automatically. [ACTIVITY_DATA.md](ACTIVITY_DATA.md) owns the rules.

Connected account screens share the Settings page/group/row components. Recovery
keys, device transfer and device management are focused tools; troubleshooting
contains account details and manual refresh/renewal. `useIdentityAction` places a
spinner on the initiating control while the identity controller serializes actions,
timeouts and failures. Busy primary buttons preserve accessible names. Revocation
confirmation closes before its request; existing-account recovery confirmation
stays mounted through Confirm. The receiving form survives until its request
settles. Return-key submission, key hiding and explicit revocation confirmation
remain accessible. Header Back uses history with Settings fallback.

Settings owns Preferences, Account & data, Privacy, Support and About. Support/
feature-request actions create private email drafts. Legal/social/rating destinations
use configured URLs or honest unavailable states. The current analytics rows are
unavailable and telemetry exports nothing; planned acceptance/analytics changes
belong to [Phase 09](../implementation-plan/phase-09-analytics.md).

The direct export action keeps Export my data visible with a spinner and delivers
CSV/JSON in a ZIP through the native share sheet or browser download. Dismissal
resets quietly; failures remain inline for retry. Duplicate taps, focus loss,
cancellation and account changes fence collection/presentation. Local accepted
changes are captured independently of pruning/upload. The authenticated API pages
at most 50 owner-scoped attempts plus safe account/device metadata; pending local
copies and cloud versions are labeled separately. CSV formula escaping, read-interval
notes and private temporary-file cleanup are part of the export boundary.

## Installation preferences and accessibility

`MotionPreferencesProvider` combines one saved AsyncStorage boolean with the live
system Reduce Motion setting and foreground refresh. System preference wins;
motion stays reduced while either initial read is unresolved. Save before applying
a new choice and expose read/write errors. Cards, sheets, reflection and toasts
consume the same effective flag. The preference is account-independent.

Haptics defaults on but stays quiet during hydration/writes, when disabled or
inactive, and when the iPhone TurboModule is absent. The adapter checks availability
before importing Pulsar's enforcing SDK; unsupported old binaries remain usable.
One heavy impact follows accepted start/feeling changes or successful enabling;
completion uses Batter, coalesced across repeated taps. Playback cancels on disable,
background and disposal, with contained native errors and stable callbacks. Web
never vibrates and no private input enters the adapter. Development-only preset
selection is in memory; production always uses Batter.

Both preference rows use an accessible full-row `SettingsToggleRow`, decorative
pill, keyboard Enter/Space and checked/disabled state. Only accepted values animate
thumb/track for 200 ms; initial and saving-only updates do not. Effective Reduce
Motion stops Haptics-row motion immediately. The Reduce Motion row's short status
transition is exempt from the app preference, but system motion preference and
unresolved hydration still suppress it. Row/icon/label opacity stays unchanged.

`ScaledText` computes explicit font/line-height metrics from live system text scale
without double-scaling native text or remounting forms. Descriptions follow the
full selected size; headings/actions cap at 2×. Enlarged headers gain a full-width
title line, unavailable statuses move below labels, and native inputs retain
platform scaling. Browser/tests and simulator checks do not establish physical
VoiceOver, software-keyboard or device behavior; track those gates in handoffs.
