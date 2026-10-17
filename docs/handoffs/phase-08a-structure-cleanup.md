# Phase 08A — Structure, docs and tooling cleanup

## Summary and status

In progress. Phase 08 is merged and its acceptance is recorded in the
[Phase 08 handoff](phase-08-settings-privacy.md). This phase preserves product
behavior while clarifying documentation, routes, source owners and verification.
The [phase plan](../implementation-plan/phase-08a-structure-cleanup.md) owns scope.

## Decisions and why

- Use named phase files and a compatibility index so scope is readable without
  progress chronology; decisions and implementation evidence have separate owners.
- Archive only handoffs whose own work and gates are complete. Folder cleanup,
  day-sheet performance and earlier feature handoffs remain active while their
  native/device/release gates are open.
- Keep one independently reviewable change per numbered step; separate moves
  from behavior changes. Publishing and each branch/worktree deletion retain the
  existing specific owner-approval requirements.

## Behavior that changed

- Documentation moves to concern-based owners; the original single plan becomes
  a compatibility index. Unbuilt provider designs live in proposals.
- Source design material is preserved under design/source; routine screenshots
  and third-party references are retained in ignored local storage.
- Home alone owns `/`; the access gate is `/access`. Account tools use static
  routes, and challenge routes share a group without an extra native layout.
  The obsolete export redirect is removed; Settings owns export.

- Mobile source groups now match the folder guide: challenge deck/active/success,
  feature Settings, shared network and platform adapters, and developer previews.
  Account recovery uses the supplied runtime controller, with separate transfer
  presentation, controlled key form and confirmation ownership. Actions use stable
  IDs. Wire reads sit with their catalog/export/access/shared-progress owners.

## Invariants to preserve

- Existing identity, deletion, activity, access, privacy and native safety rules
  remain in their architecture owners; no accepted input or credential metadata
  may be discarded by cleanup.
- Keep route URLs and native stack behavior except the approved gate move to
  /access. Keep deleted-account screens out of Back history.
- Preserve existing coverage floors, fixture environment/account isolation and
  deferred native/device release gates.

## Problems that could recur

- File moves require simultaneous import, loader, asset, coverage, fixture,
  deployment and link updates. Cold exports do not refresh a running Metro graph;
  restart an owned server with --clear before reloading the installed app.
- Archived proposals and evidence cannot override the current phase scope or
  establish acceptance for a newer revision.

## Setup or environment changes

- Read [the documentation map](../README.md) and
  [folder guide](../architecture/FOLDER_STRUCTURE.md) for current owners.
- Design sources are excluded from native build uploads; ignored local evidence
  is not a fresh-checkout or CI prerequisite.
- Mobile typechecking generates Expo route declarations first, including on a
  fresh CI checkout. Generated declarations stay ignored and outside formatting.

## Open gates

| Gate                                                          | Owner                                                | Required step/phase | Done when                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------- | ------------------- | ----------------------------------------------------------- |
| API/contracts organization and HTTP robustness                | Implementation owner                                 | 08A steps 4–5       | Focused checks, database gates and bundle isolation pass    |
| Tooling, regression journeys and CI changes                   | Implementation owner                                 | 08A steps 6–7       | Local required checks pass; hosted candidates are inspected |
| Local branch/worktree deletions and billing stash disposition | Anthony approves each deletion; implementation owner | 08A step 8          | Concrete inventory reviewed and approved cleanup completed  |
| Publication of each step and hosted CI                        | Anthony authorizes each action                       | 08A                 | Authorized candidates have inspected passing hosted checks  |
| Earlier physical-device, staging and release acceptance       | Existing phase owners                                | 09–11               | Original handoff/release requirements are evidenced         |

## Final verification

October 17, 2026: documentation step verification passed locally: npm run check
with fresh online Expo Doctor, formatting, all internal Markdown links and the
required phase-file sections. Source assets were preserved byte-for-byte.
The route checkpoint passed npm run check, cold web and iOS exports, all saved
browser journeys, a side-panel walkthrough and the installed iOS simulator
walkthrough (launch, self-device sign-out, account switching and first/repeated
challenge flow). The mobile ownership checkpoint also passed npm run check, cold web/iOS
exports, focused identity and API-consumer regressions, a side-panel walkthrough
and a fresh installed-app reload after the clear-cache Metro restart. Existing
physical-device release gates remain open. No Phase 08A hosted CI is claimed;
remaining steps require their own checks. Detailed
interim output stays in ignored local logs and commit/PR descriptions.
