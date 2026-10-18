<a id="phase-08"></a>

# Phase 08 — Settings & privacy controls

**Status:** Complete.

## Outcome

Users control recovery, private data and preferences, with authenticated export and confirmed account deletion.

## Decisions in force

- Dependencies: 07.5; prepared 07A interfaces may be reused, but external billing activation does not block this phase.
- Acceptance: PRD AC-15–17 · Tech acceptance 3–4, 8–9, 17
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Keep Settings, recovery, export and deletion usable without paid access. Use Preferences, Account & data, Privacy, Support and About groups; unavailable destinations stay honestly unavailable.
- Persist installation-level Reduce Motion and Haptics choices independently of accounts. System Reduce Motion takes priority. Apply effective motion to cards, sheets, reflection panels, shimmer and toasts, including live changes.
- Use Pulsar only: Batter on accepted completion, one heavy impact for accepting a challenge, changing a feeling or enabling Haptics. Hydrate before enabling; suppress mount/sync/duplicate/failure/background feedback, stop on disable/background, contain native failures, and keep missing-module builds usable and quiet.
- Keep accessible app-drawn toggles visually steady; Reduce Motion input feedback obeys Haptics. The control's own short movement may animate in both directions unless system Reduce Motion or hydration suppresses it.
- Retain the guarded development-only Test haptics page and session override; production always uses Batter. Never persist/export/report test selections.
- Export a private ZIP of CSV, JSON and README with full authenticated paged history, safe metadata, preferences and labeled captured pending/rejected local copies. Exclude credentials and diagnostics, fence account changes/cancellation and clean temporary files. Share-sheet dismissal resets quietly; actual failures remain retryable.
- Provide the configured support and feature-request email drafts without automatic private attachments, preserve failed-link feedback, and keep App Store/social rows unavailable until real destinations are verified. Existing legal links remain honest pending Phase 13.
- Permanently delete the account in an owner-locked transaction, revoke credentials, retain minimal receipts/tombstones, persist intent and receipt, stop uploads/drain writes and remove only the selected account's storage/Keychain items. Refuse before destructive requests on incapable binaries; retries must not resurrect accounts.
- Show the post-deletion/access-waiting welcome with new-account/recovery choices and remove deleted-account screens from Back history. This does not reopen deferred onboarding.
- Explain that deletion does not cancel an Apple subscription and retain immediate deletion plus subscription management. Billing-provider cleanup/management is reaccepted when billing activates.
- Keep allowlisted diagnostics free of private content/secrets. Record the chosen 7-day Pro backup period and restore checklist; production plan confirmation, hosted rehearsal and scheduling retain their approved later-phase owners.
- Ship bounded invoker-rights retention cleanup for rate buckets older than 30 days and transfers expired more than 24 hours, preserving deletion receipts/tombstones and denying mobile-runtime execution.

<a id="phase-08-pre-merge"></a>

**Stability safeguards**

- Keep compatible Expo patch pins/lockfile aligned, actual dependency validation enabled, journeys independent of time of day, and race-prone layout assertions tied to usable controls/fresh geometry.
- CI runs on pull requests and main merges, cancels superseded pull-request runs and runs each test suite once with coverage.
- Preserve typed 4xx client errors, including unlisted statuses; keep root retryable crash and unknown-link recovery screens.

## Keep out

- No Reset progress from the mockup, unconditional vendor forwarding, session replay/autocapture or journal/credential/audio payloads in telemetry.
- No dependency of paid access or cloud saves on successful analytics delivery; Phase 10 owns the recorded owner decision onboarding acceptance flow.
- No practice reminders, reminder notification permissions/scheduling or public feature-request board in the first release. Revisit reminders in separately scheduled post-launch work.
- No analytics activation or new consent implementation; these belong to Phases 10–11. No final legal drafting/review/publication or release-disclosure preparation; these belong to Phase 13.

## Ready to hand off when

- [x] All required Phase 08 controls remain reachable when unpaid; recovery/transfer and motion preferences work on iOS. Haptics implementation and physical-phone acceptance remain together in this phase. No reminder permission prompt or scheduling is introduced.
- [x] Haptic feedback and its saved Settings switch pass automated checks and physical-iPhone acceptance on an updated signed build; timing/strength/feel, disabled/persisted behavior and any resulting fixes are retested within Phase 08.
- [x] Get help opens the configured, working support destination from each recovery surface that offers it; no placeholder action or sensitive diagnostic payload is shipped.
- [x] Feature requests reuses the configured support contact flow/destination with a feature-request subject/type, remains usable without a purchase, sends no automatic private attachments and handles link-opening failure honestly.
- [x] Rating and social rows open their verified public destinations when configured, remain honestly unavailable otherwise, and retain a usable retry with plain feedback if opening fails. Actual App Store/profile opening remains a Phase 14 device check once these destinations exist.
- [x] Export/deletion isolate the owner, revoke credentials and document any pending cleanup; deleted identities cannot resurrect accounts.
- [x] Server logs contain no sensitive payloads, including from the deletion endpoints; data-control/recovery actions remain usable without paid access. Phase 10 owns the single Terms & Privacy onboarding acceptance and removal of the unavailable analytics Settings rows under the recorded owner decision.
- [x] The [pre-merge stability fixes](phase-08-settings-privacy.md#phase-08-pre-merge) pass, `npm run check` passes with fresh Expo Doctor, and hosted CI is green for each merge candidate. The Supabase backup retention period is recorded and the backup restore checklist is written. The retention cleanup function has passing database evidence; Anthony deferred its hosted schedule on the recorded owner decision.
- [x] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; link it from the handoff index.

## Open gates for Phase 14

- Phase 08A owns the month-boundary Progress journey correction.
- Phase 11 owns analytics activation and vendor cleanup; Phase 13 owns legal notices and production Pro backup confirmation.
- The October 18 owner-authorized Phase 10 rollout applied hosted migrations through 0017 and updated the current test API. Phase 14 retains retention scheduling, native crash/not-found checks, signed-build capability/accessibility checks and the broader hosted restore/deletion rehearsal.
- See [open-gate owners](../handoffs/phase-08-settings-privacy.md#open-gates).
