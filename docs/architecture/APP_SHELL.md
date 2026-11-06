# App shell and shared API

This guide keeps the mobile shell's rules that no check enforces, the reasons code
cannot show, and the owner's acceptances. Code, tests and lint own the rest,
including what each screen shows. [IDENTITY.md](IDENTITY.md) owns account access,
[ACTIVITY_DATA.md](ACTIVITY_DATA.md) owns activity data, and
[`gate` issues](https://github.com/anthonyyoo24/justgo/issues?q=label%3Agate) track
open release gates.

## Runtimes survive hydration and effect restarts

- A runtime created before async hydration reconciles the current snapshot when it
  connects, then subscribes. The gap between construction and subscription must
  not hide hydration or newer accepted input.
- React can restart an effect and keep the state-owned runtime. Cleanup parks
  activity and client work without erasing recoverable input, and foregrounding
  reconnects the current runtime.
- `ProgressRefresh` gets its runtime from the composing provider. Shared
  subscriptions stay context-free, so observers never import their provider and
  create a module cycle.
- The Motion and Haptics providers sit outside the account and access guards,
  because both preferences belong to the installation, not to an account.

After you change provider lifecycle effects, fully reload the installed
development app, because Fast Refresh can keep a disposed runtime. Restart a
preview that has file watching disabled before its bundle proves an edit.

## Guest adoption moves through three durable stages

Identity owns the `guestAdoption` stage, and the activity runtime copies and
retires the source. Each stage survives a restart.

| Stage                  | Source writes                                | Rule                                                        |
| ---------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| No marker (older data) | Not copied                                   | Disclosed sign-in once. Session restoration never infers it |
| `pending`              | Drained, then fenced until durable selection | A failure keeps the source recoverable                      |
| `copied`               | Fenced. The destination is durably selected  | Source retirement retries after a failure                   |
| `consumed`             | The source is erased                         | Retry cannot adopt the source again                         |

- Before copying, the runtime discards cached destination coordinators, because
  their earlier epoch metadata would clear newly accepted account writing.
- The destination reconciles its cloud history and deletion epoch first. Adoption
  uses ordinary tombstone protection, so deleted IDs stay deleted.
- [ACTIVITY_DATA.md](ACTIVITY_DATA.md#guest-source-handover) has the iCloud
  handover rules.

## Navigation keeps protected history private

- The root's explicit `access` anchor exists because SDK 58 otherwise resolves a
  protected cold link to an alphabetical supporting route instead of through
  hydration and admission.
- An unknown link's **Go home** enters the unprotected `/access` gate, because
  replacing the URL with the protected `/` can do nothing while access is
  unavailable.
- Router 58 reports zero web safe-area metrics. Keep the native provider boundary,
  and do not add a web provider to force measurements.
- Old account-tool routes, such as `/account/keys`, stay only as redirects to
  `/recovery`. No key, code or transfer UI returns.
- The root challenge files share a group without a nested layout, so the root
  stack keeps owning iOS gestures.

### Access verification

- Guest access uses explicit staging beta windows only. Production guest admission
  stays unpaid until billing exists. Guest mode is not a paid-access bypass, and
  client requests cannot grant access.
  [Server releases](../operations/SERVER_RELEASES.md) own the staging limits.
- Backups, imports and iCloud adoption never copy admission metadata.
- A legacy cache without a matching recovery record needs one fresh online
  approval. Journal history is unaffected.
- Offline account restoration may keep local admission without a session. Account
  reads and cloud sync wait for real session verification.
- Activity upload eligibility checks coverage for the original start, not today's
  paid status, through its own injected reader. Neither an unavailable provider
  nor a navigation guard grants production paid access.
  [Phase 16](../implementation-plan/phase-16-billing.md) plans paid access.

## App error reporting

- Native crashes bypass JavaScript callbacks, so the iOS config plugin owns
  native initialization. JavaScript keeps `autoInitializeNativeSdk: false` so it
  cannot replace that native callback.
- Any SDK or native API addition, including manual attachments, needs a new privacy
  review. Do not add native user, segment or replay scope, or manual span APIs,
  without reviewing the envelope-header boundary.
- The native crash cache can keep original crash details on the phone until the
  next launch. Outbound reconstruction does not change that local copy.
- Native settings are baked into the binary. An over-the-air JavaScript disable
  does not stop native reporting in a binary built with it enabled.
- Anthony approved minimal essential reporting under the Privacy Policy before
  entry into the app. The legal reader records no agreement. Real-user activation
  stays off until Phase 12 completes the notices and provider review and Phase 14
  verifies the signed build. See the
  [field inventory](../legal/DATA_INVENTORY.md#sentry-diagnostic-boundary) and the
  [crash-reporting build profile](../operations/TESTFLIGHT_BETA.md#optional-crash-reporting-profile).

Native iOS builds link static frameworks without precompiled Expo modules. Expo
modules then compile against the pinned React Native headers, so the app never
links Expo artifacts built against another React Native patch. Cocoa 9.29's
prebuilt framework and the attachment-clearing Swift callback also need static
linkage. Builds under this policy need a new binary and signed-device privacy
acceptance, because earlier signed-build receipts cover only their own inputs.

## Request policy

- Native storage writes stay serialized after a timeout, because native I/O cannot
  be cancelled. A timed-out write invalidates in-memory identity state, so a retry
  rereads the durable intent.
- Build query keys with `accountKey`, so each starts with `['account', userId]`.
- `stableAction` snapshots an ID and input for manual replay. The server endpoint
  must still enforce owner and matching-input idempotency.
- Private journal edits commit only through the local database and never enter
  HTTP retry handling.

## Challenge and Progress presentation

- On iOS, keep the outgoing deck's identity when Home loses focus. A focus-based
  key remounts its resting state before the destination covers it, which flashes
  the accepted card.
- Success appears in place inside the native challenge route, so completion never
  shows a native modal dismissal or a route blend.
- Native full-screen content in the root window uses safe areas measured above the
  stack on the first frame. Do not add the same inset twice. Web uses the root
  measurements with the inner inset edges disabled. Android keeps dialog-owned
  measurement because its window bounds can exclude system bars.
- Do not replace `DayEntryList` with `FlatList`. Expanding an animated row breaks
  `FlatList`'s estimated offsets, and it then mounts every row.
- Keep `DayEntryList`'s trailing padding at zero. With no paging footer, the last
  row's bottom then meets the viewport, and the bottom safe area stays outside the
  list, matching the first row's alignment.
- A failed reflection save keeps the editor open. It never uploads private content
  or claims a cloud fallback. There is no draft autosave or URL-based completion
  recovery.

## Data actions wait for the user

- Returning from an owner-bound sign-in never opens a picker, imports a file or
  confirms deletion by itself.
- An imported file never restores identity proofs.
- Leaving the app for Files does not change which account owns the file work.
- iCloud consent stays scoped to the route visit, the collection and the Apple
  account through the final preference write.
- Removing the iCloud copy in Apple's Settings keeps phone data. The sheet never
  offers to erase phone entries after an iCloud reset.
- Deletion of a previously associated iCloud copy stays pending until cleanup
  succeeds, even when iCloud Sync is off.

## Prove native behavior on a device

Browser, simulator and component evidence cannot prove native launch
configuration, notched layouts, inset timing on first and repeated challenge
openings, `DayEntryList` row expansion and scrolling, VoiceOver, the software
keyboard, or Sentry's native envelope headers, cached payloads, replay exclusion
and signed-build symbolication. The
[`verify-justgo` Gotchas](../../.claude/skills/verify-justgo/SKILL.md#gotchas) list
the general limits. File each deferred check as a `gate` issue.

## Phase 15 server cutover boundary

Installed builds switch to the Worker and legal origins only in a separately
approved build after [cutover acceptance](../operations/CLOUDFLARE_CUTOVER.md). A
redirect through Vercel does not prove that private request payloads stopped
reaching it.
