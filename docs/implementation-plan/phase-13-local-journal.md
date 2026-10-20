<a id="phase-13"></a>

# Phase 13 — Local journal and manual backup

**Status:** Planned; local feelings/reflection storage and manual backup/restore in iCloud Drive selected October 20. Implementation has not started. Current app behavior remains phone-and-cloud until the verified cutover.

## Outcome

Saved feelings and reflection text remain in durable storage on the user's phone.
JustGO continues synchronizing accounts and basic completed-challenge history.
Users can explicitly save a journal backup through Files to iCloud Drive and
restore that file later. No automatic iCloud synchronization or AI coaching is
included.

## Decisions in force

- Dependencies: the implemented account/recovery, activity, export and deletion
  boundaries from Phases 07–10; Phase 11's private-data exclusions; and the
  [Phase 12 legal handoff](../handoffs/phase-12-legal-documents.md).
- October 20: Anthony accepts that JustGO account recovery restores cloud
  challenge history without restoring local feelings/text. He selected manual
  backup and restore in iCloud Drive, rather than automatic synchronization.
- Keep Vercel for the existing API and Supabase for account/completion data while
  verifying the reduced processing against their applicable terms. The earlier
  Supabase Edge Functions migration is an alternative if a concrete remaining
  hosting problem requires it, not a prerequisite or selected migration.
- Existing activity architecture still describes the running cloud model. Update
  it at phase completion; do not claim uploads stopped merely because this plan
  exists. Phase 14 owns public hosting, final signed-release verification and
  actual rollout approvals.
- Preserve the plain Terms/Privacy links and ordinary account creation, without
  agreement/view receipts. Diagnostics and analytics remain off. Later analytics
  and coaching phases must reassess permission and context before proposing any
  departure from local journal storage.

## Implement

1. **Give the local journal durable ownership.** Separate saved private entries
   from disposable synchronized activity/query caches. Preserve attempt ID,
   account ownership and enough historical challenge/date metadata to show old
   entries offline. Keep all saved feelings/text across restart, acknowledgement,
   day/month rollover, cache pruning and catalog changes. Server refreshes must
   not overwrite or remove local journal entries. Preserve existing feeling/edit
   behavior and explicit durable-save/error feedback.
2. **Separate private saving from completion sync.** Save feelings/text only
   through the local store. Retire private PATCH operations, persisted retries,
   server reflection reconciliation and cloud fallback on device-write failure.
   Keep completion retries, totals, streaks and recovery intact. Update shared
   contracts, routes, OpenAPI, server projections and exports together. After
   cutover, no private text, feelings or content-derived fields enter JustGO API
   requests, diagnostics, analytics or AI. Refresh guarded development legal-copy
   references to the new phase map during this implementation.
3. **Preserve existing entries before cloud removal.** Inventory the legacy
   server/local representation using synthetic fixtures first. Plan authenticated
   account-owned migration of any existing cloud entries, including records
   already pruned from the phone and pending/rejected local changes. Confirm
   durable local preservation before an approved removal; never discard a
   journal because migration is interrupted or replay private queued writes.
   Coordinate old-client retirement and an expansion/cutover/contraction rollout
   with registered forward migrations. Preserve reps, account credentials,
   restrictions and deletion/revocation markers. Record actual legacy backup
   expiry/removal separately: a local-only future does not erase old provider
   copies. Hosted migrations, access to private records and deployment require
   their applicable authorization; no shared reset or historical migration edit.
4. **Add manual backup and restore.** Reuse the existing ZIP/share/temporary-file
   infrastructure, but define a versioned data-only backup containing every saved
   local entry, stable IDs, historical display context and feeling-scale version.
   Do not restore CSV, raw repository state, credentials, network queues, receipts
   or sessions. Files lets the user select iCloud Drive or another destination;
   explain that each file is a snapshot and later edits require another backup.
   Explain that the file contains private journal content and needs a protected
   destination; user-selected sharing is separate from JustGO server storage.
   Reuse existing account recovery before restoring that account's journal;
   possession of a backup is not an authentication or account-recovery mechanism.
5. **Validate and commit imports safely.** Bound file/record/decompressed sizes,
   accept only supported archive entries and schema versions, and validate owner,
   IDs, relationships, dates, feelings and text limits before writing. Avoid
   arbitrary extraction paths. Reject malformed or mismatched-account files
   without changing existing data. Repeated identical imports are idempotent;
   add missing entries and preserve differing existing entries with a conflict
   report. Do not trust file timestamps to silently overwrite writing. Serialize
   imports with edits, fence account changes/deletion, and report success only
   after a durable commit. Import never creates cloud reps or upload operations.
6. **Extend export, deletion and device protection.** Export all saved local
   entries alongside the appropriate account/completion data. Remove owned local
   journals and app-controlled temporary files during account deletion, preserving
   retry and account isolation. User-saved iCloud Drive files remain under the
   user's control. Verify iOS Data Protection and actual device-backup behavior
   for the private store and temporary files. Manual iCloud Drive backup is
   distinct from iPhone system backup; do not promise that data never leaves the
   phone when the user chooses a backup. Native dependency/build changes retain
   the repository's separate task/signing requirements.
7. **Reconcile privacy and release preparation.** Update entry copy, Privacy
   Policy, Terms where affected, inventory and App Privacy worksheet to the
   verified split. Explain local-data loss/recovery, manual files and retained
   legacy copies accurately. Reassess Vercel's reduced payloads and regional
   journal requirements from actual behavior; do not automatically carry forward
   the cloud-journal health supplement or declare blanket legal clearance.
   Record necessary remaining provider/support/retention conditions with Phase 14
   owners. New public text needs review before publication; the site stays local
   until Anthony resumes hosting.

## Verification and handoff

- Cover durable saves/relaunch, older history, server refresh/pruning, storage
  failures, account changes/deletion, migration restart and legacy queued writes.
- Cover full backup/restore, cancellation, malformed/oversized/unsupported files,
  wrong owners, duplicate/conflicting entries and interrupted commits. Verify
  imports preserve rep counts and do not recreate credentials or network writes.
- Prove the post-cutover outbound boundary using synthetic request capture,
  including failure/export/recovery paths. Keep private fixtures out of logs and
  screenshots. Run affected contract/API/mobile tests and typechecks during each
  slice; backend/protocol changes require dedicated loopback database coverage.
- After relevant tests, use the existing guarded fixtures for one grouped
  in-app-browser walkthrough. Browser previews cannot prove Files/iCloud Drive,
  iOS file protection or native persistence. Record actual signed-iPhone backup,
  restore and local cleanup evidence, or retain it as an explicit Phase 14 gate.
- At actual phase completion, run the required full checks, coverage and affected
  saved journeys under [testing guidance](../operations/TESTING.md). Reconcile
  architecture, product requirements, privacy sources and the phase handoff
  together. Passing local checks does not authorize a deployment or publication.

## Keep out

- Automatic CloudKit/iCloud sync, background cloud journals, AI coaching, app
  accounts based on Apple identity, analytics activation and a new encrypted-vault
  architecture without a concrete protection finding.
- Payment activation, public legal-site publication, paid-plan purchases, native
  signing/upload and App Store distribution.

## Ready to hand off when

- [ ] Every saved feeling/reflection has durable local ownership independent of cloud caches.
- [ ] Completion sync/recovery remains correct; private fields and queued retries cannot reach the API after cutover.
- [ ] Existing private content is preserved through the approved migration, with legacy copies/removal conditions recorded.
- [ ] Versioned manual backup and safe, idempotent restore work without importing credentials, changing reps or crossing accounts.
- [ ] Export/deletion/protection and app-owned temporary-file cleanup match the new model.
- [ ] Privacy/product documentation matches verified behavior; publication and any residual provider/regional conditions have explicit owners.
- [ ] Required automated/browser evidence passes, native evidence is recorded or explicitly assigned to Phase 14, and the phase handoff is saved.
