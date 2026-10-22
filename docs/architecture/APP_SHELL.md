# App shell and shared API

This guide describes navigation, mobile runtime composition and platform-facing
presentation. [ACTIVITY_DATA.md](ACTIVITY_DATA.md) owns activity persistence and
reconciliation; [IDENTITY.md](IDENTITY.md) owns managed account access and legacy migration;
[TECH_STACK.md](TECH_STACK.md) owns installed technologies/server boundaries.
The [plan](../implementation-plan/README.md) owns future behavior and the
[handoffs](../handoffs/README.md) own verification and open release gates.

## Implemented folder responsibilities

`src/app/` connects Expo Router to screens and layouts. `app-support/` composes
providers, startup/access, managed identity/account access and saving feedback. Product
capabilities live in `features/`; shared saved activity and synchronization live
in `data/activity/`, `data/journal/`, `data/cloud/` and `data/backup/`. Shared UI, general infrastructure, design tokens and reusable
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
responses are fenced even when transport cancellation is ignored. Same-account session refresh preserves that boundary. The durable local collection
is distinct from the authenticated account; logout retains its local content while
stopping account uploads. Signing back into the same account keeps its journal and
delivers edits made while signed out. Disclosed sign-in adopts an unconsumed guest
source; choosing a different account never transfers the previous account's data.
There is no guest-collection selector. Memory-only submissions stay parked in their original account partition while
the process survives. They never migrate to the next account or use its session.

Guest handover drains source writes and existing source/target sync work, discards
stale target coordinator caches and fences new source writes until the identity
controller durably selects the destination. Pending/copy/retirement state survives
restart; the original source remains recoverable on failure. Identity owns the
`pending`/`copied`/`consumed` transition, while the activity runtime owns copying and
source cleanup. [ACTIVITY_DATA.md](ACTIVITY_DATA.md#guest-source-handover) describes
the deletion-epoch and iCloud handover rules.

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

| Route                                   | Responsibility                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| `/access`                               | Resolve selected local collection and verify challenge admission.                    |
| `/` and `/progress`                     | Catalog/deck and durable full local history, including signed-out use.               |
| `/challenge`, `/success`, `/reflection` | Selected-collection challenge/result and explicit private save.                      |
| `/settings`, `/data`                    | Preferences and unified iCloud/download/import/delete-all controls.                  |
| `/recovery`                             | Account page: verified Apple/Google login switches, Log out and Delete account.      |
| `/account/sign-in`, `/auth/callback`    | Cloud/phone-data disclosure, owner-bound sign-in return and provider callback.       |
| `/acceptance`                           | Terms/Privacy links and guest Continue, without legal receipts.                      |
| `/delete-account`, `/welcome`           | Durable deletion cleanup and entry with branded Apple/Google buttons above Continue. |
| Old account tools                       | Redirect to the Account page; no key/code/transfer UI.                               |
| `/preview` and unknown links            | Guarded development fixtures or provider-independent not-found recovery.             |

The root uses `Stack.Protected` for local collection, access and deletion boundaries.
Home is the sole owner of `/`. Guest Continue selects a durable collection without
creating an account. Apple/Google entry explains JustGO cloud storage before login;
the disclosure states that saved phone entries are included. Settings, Data and Account remain outside paid
admission. Challenge starts require fresh verified access; saved local Progress
remains available offline or signed out. Pending account deletion removes product
routes from Back history until required cleanup finishes.

The separate Apple/Google sign-in page keeps the selected button disabled with a
centered spinner through native authorization, owner adoption, access verification
and challenge preparation. It opens Challenges directly once the verified owner's
repository and selected deck are usable. Cancelled/failed authorization restores
the button; catalog failure offers retry without repeating provider login. Real
access denial/unavailability still uses the access page. Handoff results are fenced
by route focus, canonical owner and app session, and owner-authenticated Data
returns skip challenge admission. Explicit provider entry cancels the Terms cover,
including after deletion; later guest Continue retains its normal preparation.

Welcome transition keeps Terms above navigation until the first selected collection's
deck paints. Catalog preparation and unfinished challenge state key off the active
collection, including guest/signed-out owners, rather than requiring a session.
Switching collections cannot retain another owner's unfinished challenge. Route
visits cannot fabricate completion or restore unsaved drafts. Root challenge files
share a group without a nested layout; iOS gestures remain owned by the root stack.

`experiments.typedRoutes` enables generated navigation types. Mobile typechecking
runs the installed Expo CLI's `customize tsconfig.json` command without starting
Metro, discards the previous declaration, and requires a fresh
`.expo/types/router.d.ts` before TypeScript runs. CI uses the same command through
the workspace typecheck. Generated declarations and `expo-env.d.ts` stay ignored;
their explicit tsconfig includes and compile-time invalid-route regressions remain
tracked.

The root `ErrorBoundary` renders `RouteErrorScreen` after an unhandled render error
replaces the layout and its providers. It uses no app provider, hides private error
text and retries by rendering the layout/providers again. Unknown links remain
outside protected groups. Their Go home action enters the unprotected `/access`
gate, which resolves the current account/access destination. Replacing an unknown
URL with the protected `/` can be a no-op when access is unavailable.

### Access verification

`AccessService` calls `IdentityService.withSession` and supplies that same verified
owner transaction to an entitlement reader. The authenticated default provider returns unavailable. Anonymous guest access
uses explicit staging beta windows only; production guest admission remains unpaid
until the billing policy is implemented. Guest mode is not a paid-access bypass. Explicit application staging can compose operator-approved free beta
grants with start/expiry/revocation and earlier-start coverage; client requests
cannot grant access. [The beta setup](../handoffs/phase-14-test-server.md) owns its
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

## App error reporting

`apps/mobile/index.ts` initializes the optional diagnostics owner before loading
Expo Router. The provider-independent root ErrorBoundary reports through that
owner and retains its generic message and Retry action. Reporter and transport
failures never join product saving, account recovery or access decisions.

The JavaScript `beforeSend` callback rebuilds an allowlisted error, and the custom
transport repeats that boundary immediately before exporting one event. It drops
other envelope items, raw messages, arbitrary paths/symbols, user/account IDs,
headers, URLs, context, breadcrumbs and attachments. Only canonical bundle names,
numeric locations, debug UUIDs, error handling state, event ID/time and trusted
app/build/OS/environment metadata survive. Source-mapped development paths are
discarded; signed-build stack usefulness and symbolication require release proof.
JS delivery is memory-only, capped at two requests with five-second aborts and a
one-minute pause after provider/network failures; it has no persistent retry queue.

Native crashes bypass JS callbacks. The reviewed iOS config plugin owns early
Cocoa initialization and independently reconstructs native events with numeric
addresses/debug UUIDs and generic reasons. JS uses `autoInitializeNativeSdk: false`
so it cannot replace that callback. Replay, screenshots, view hierarchy, network
capture, automatic sessions, logs, tracing and profiling remain disabled. SDK or
native API additions, including manual attachments, require renewed privacy review.
Only `SentryCrashIntegration` is enabled natively. Cocoa 8.58 runs global event
processors after `beforeSend`; its built-in Replay processor stays excluded.
It also adds envelope trace metadata after the callback: random trace ID, public
key, release/environment and SDK metadata. Do not add native user/segment/replay
scope or manual span APIs without reviewing that separate header boundary.
The native crash cache can retain original crash details locally until the next
launch; outbound reconstruction is separate from that local capture.

Native builds use `expo-build-properties` with `ios.useFrameworks: 'static'`.
Cocoa 8.58's scope-taking Swift APIs can disappear under plain static-library
linkage because Swift cannot resolve the transitive `_SentryPrivate` module;
[Sentry's linkage diagnosis](https://github.com/getsentry/sentry-dart/issues/3570)
describes the same failure. Keep framework modules with static linkage rather
than removing the attachment-clearing callback or weakening the privacy options.
The owner-authorized Phase 13 iPhone build verifies this configuration compiles;
physical diagnostics acceptance and activation remain separate gates.

Explicit enabled/DSN/environment settings control JS delivery; native settings are
baked into the binary and require a rebuild to change. An OTA JS disable does not
disable native reporting in an already enabled binary. Neither path sets an
account/device identifier. No account-owned diagnostics queue or identifier needs
resetting on account changes/deletion. Anthony approved minimal essential
reporting under the Privacy Policy before entry into the app. The legal reader
records no agreement or permission. Real-user activation stays off until
Phase 12 completes matching notices/provider review and Phase 14 verifies the
signed build. See the [field inventory](../legal/DATA_INVENTORY.md#sentry-diagnostic-boundary)
and [setup/handoff](../handoffs/phase-11-crash-reporting.md).

## Request policy

The shared HTTP transport validates HTTPS URLs, with HTTP allowed only in
development for loopback and private IPv4 LAN addresses (10/8, 172.16/12 and
192.168/16). This lets a physical phone reach the Mac's local API; public HTTP
hosts remain rejected and release builds always require HTTPS. It validates strict response schemas, bounds the whole operation
including body parsing to ten seconds, and supports cancellation even when a
transport ignores AbortSignal. Credentials stay in headers/bodies, never URLs or
logs. Transport messages and response bodies cannot become diagnostics.

The account client owns at most two sends in one ten-second total budget for an
eligible GET retry or authentication replay. It classifies reads by resolved
method, so a bodyless DELETE is a write. It never retries an uncertain write;
the persisted activity sender owns completion-create replay. Private journal edits
commit only through the local database and never enter HTTP retry handling. Validation, conflict,
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
Its decks shuffle once per account on this phone, restoring saved order/front and
last venue through the repository's optional `:decks` preferences. New accounts or
missing/unknown saved venue values start in Streets. Catalog refresh preserves
surviving order/front, inserts added placements behind the front at random positions
and drops removed/inactive placements. Outcome rotation checks the original
placement so a removed active card cannot advance the untouched next card.
Preference failures keep the live deck usable without activity saving/loss-risk
feedback; [ACTIVITY_DATA.md](ACTIVITY_DATA.md#ownership-and-durable-saving)
owns storage, account fencing and deletion draining.

`ChallengeActivityProvider`, above the navigator, owns the in-memory active start
across Home and `/challenge`. Start freezes the card, timestamp and time zone;
countdown samples start + original duration once per second and on foreground.
Background/lock retain it while the process survives. Fresh mount/account change/
process restart discard unfinished activity. Zero waits for explicit Completed or
Give up; Give up creates no saved attempt or rep, while its deck rotation can save
optional phone preferences.

On iOS, keep the outgoing deck's identity when Home loses focus. A focus-based key
would remount its resting state before the destination covers it and flash the
accepted card. `NativeChallengeHandoff` prepares an opaque window overlay, waits
for layout and decorative images, opens `/challenge` once and remains until the
destination's layout/images and entry transition settle. Image failures also settle
readiness. The cover blocks actions and mirrors saving feedback without creating a
second toast host; the account-owned provider acknowledges presentation.

`ChallengeFlowScreen` prepares Success beneath opaque active content, with hidden
input/accessibility until completion. Completed reveals Success in place, avoiding
an intermediate native modal dismissal or route blend. Active and Success both
disable back gestures; the standalone `/success` route does too. Continue is the
only exit from a valid Success result and replaces `/challenge` (or `/success`)
with `/reflection`; returning Home clears its active/result context. Standalone `/success` remains available for
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
The shared reflection controller owns validation and newer-input protection, plus
the Progress editor's dirty-close decisions. Post-challenge Reflection exposes no
top Back/X or discard dialog, and its root route disables swipe-back. Its only exit
is bottom Skip when empty or Save Reflection otherwise. The Progress day-sheet
editor retains its Save / Keep editing / Discard prompt. Explicit saves commit
feelings/text and historical context in the account SQLite journal. A phone-write
failure keeps the editor available with storage feedback; it never uploads private
content or claims a cloud fallback. There is no draft autosave or URL-based
completion recovery.
`useReflectionKeyboard` measures the section and
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
unreadable completion storage and rejected completion records remain discoverable.
Private save errors stay with the editor; imported conflicts keep current writing
and report differing IDs. Server refreshes cannot replace saved private writing.
[ACTIVITY_DATA.md](ACTIVITY_DATA.md) owns the rules.

Connected Account and Data screens share Settings page/group/row components.
Account shows a Login methods group with Apple/Google logos and switches driven by
verified linked identities. There is no separate signed-in status sentence. An off
switch signs in when signed out, or links that method when signed in. An on switch
requests unlinking; removing the last login method is rejected with feedback.
Log out is separate. Old key/code/device routes redirect
there. Sign-out keeps the same local journal; there is no View guest data action.
Actions preserve accessible names while busy and show retryable errors.
Sign-in failures stay on the separate provider-entry page. The signed-out Account
page omits connection messages and the generic Retry connection button. Signed-in
provider-action feedback and pending account-deletion retries remain available.
Provider-entry errors belong to the current attempt and reset on a new visit or
provider change; a late result cannot add feedback to a later visit.

Settings keeps Preferences, Account & data, Support and About. Account & data contains
only Account and Data links. Support actions open private email drafts; legal/social
links use configured URLs or honest unavailable states. No legal-view/agreement
receipts or analytics switches are introduced; diagnostics/analytics stay gated.
The shared `SettingsPage` keeps its safe-area title and Back button above the
scrollable body, preserving navigation while longer pages scroll. Header and body
share the same content width and enlarged-text layout rules.

Welcome's branded Apple and Google buttons appear above Continue. Continue opens
Terms & Privacy, then selects a local guest collection. It creates no account.
Provider entry explains the signed-in cloud destination and inclusion of saved
phone entries without an optional merge switch. Older accounts with unknown guest
adoption require this disclosed sign-in before automatic source adoption. Welcome
preparation remains covered until access and the selected
collection's first deck paint. Readiness is owner/attempt-fenced; catalog failure
retries preparation without creating another account. Navigation waits for identity
hydration before mounting protected routes, preserving cold saved-history links.

Data contains iCloud Sync, Download my data, Import data and Delete all my data.
Descriptions live in action flows instead of paragraphs beneath every Settings row.
Download and Import use matching down/up tray icons; iCloud uses a cloud with a
circular arrow. An unavailable iCloud switch shows its configuration, platform or
Apple-account reason rather than silently ignoring taps. Delete all sits at the
bottom. Both deletion rows use red labels and trash icons, omit chevrons and open
their confirmation modal directly on the current page. Both flows reuse
`components/modals/ConfirmationModal` with destructive styling, their own consequence text and
retry behavior. The Account modal retains the subscription warning. The
`/delete-account` route remains available for deep links and interrupted cleanup;
normal Account deletion does not navigate there. The modal preserves input and
accessibility isolation, busy dismissal protection and large-text action layout.
Log out uses the same modal with neutral Cancel/Log out actions, leaving the
Account layout fixed. Its spinner stays visible until controller-confirmed logout
finishes, including after the local account is fenced. Failures remain in the
modal for retry. Route, owner and session changes dismiss stale confirmations.
Native download uses the share sheet; the browser downloads directly. Import uses
DocumentPicker/Files or the web file chooser, validates before preview/commit and
preserves current differing writing. It accepts the full-data backup, adding real
completion history without duplicate counts. A file never restores identity proofs.
For a signed-out account, Import and Delete all route through sign-in bound to that
owner and return to Data. Import authenticates before opening Files; returning from
sign-in does not automatically open a picker, import a file or confirm deletion.
Full format/ownership/deletion rules live in [ACTIVITY_DATA.md](ACTIVITY_DATA.md).

Duplicate taps, focus loss, cancellation and collection changes fence file work and
stale presentation. Backgrounding for Files alone does not change ownership.
Temporary files are cleaned up independently. Unfinished delete-all remains visible
after relaunch and blocks competing import/cloud/download actions until retry
finishes. Browser unsupported iCloud is distinct from native CloudKit acceptance.
Required deletion of previously associated iCloud copies remains pending until
cleanup succeeds, even when ordinary iCloud Sync is off.

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
