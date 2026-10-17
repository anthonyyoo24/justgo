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

- API domains consistently own routes/services, tests mirror their source owners,
  and shared HTTP plumbing is separate. OpenAPI has an API-only package entry.
  Rate-limit replies expose their remaining window; diagnostics identify safe
  SQLSTATEs and failing migrations while preserving execution/history.

- The HTTP client fetches its admitted canonical URL. JSON media/status checks
  distinguish invalid or proxy responses from transport failure and prevent
  untrusted bodies from rejecting saved credentials. Retry/cancellation budgets
  and validated API errors remain intact.

- Production mobile types exclude Jest/Node globals; tests have a separate
  program. Targeted typed, React and Testing Library lint rules guard behavior.
  Large suites share fixtures while retaining their cases and ordered migration
  rehearsal. Progress journeys always exercise the previous month. A normal
  production-export smoke fences all API traffic and covers routes/assets.
  Unknown-link recovery enters `/access` so unavailable access cannot strand it.

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
- Syntax-only lint fixtures must disable type-aware rules when they deliberately
  have no TypeScript project; production and typed negative fixtures keep them on.

## Setup or environment changes

- Read [the documentation map](../README.md) and
  [folder guide](../architecture/FOLDER_STRUCTURE.md) for current owners.
- Design sources are excluded from native build uploads; ignored local evidence
  is not a fresh-checkout or CI prerequisite.
- Mobile typechecking generates Expo route declarations first, including on a
  fresh CI checkout. Generated declarations stay ignored and outside formatting.
- Node types match Node 24. Jest uses one local worker and two in CI. Run the
  normal exported-web smoke before iOS export replaces the shared output folder;
  [testing guidance](../operations/TESTING.md) owns the commands and import policy.

## Open gates

| Gate                                                          | Owner                                                | Required step/phase | Done when                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------- | ------------------- | ----------------------------------------------------------- |
| CI changes                                                    | Implementation owner                                 | 08A step 7          | Local required checks pass; hosted candidates are inspected |
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
physical-device release gates remain open. The API/contracts checkpoint passed
npm run check, npm run test:db (including the migration rehearsal), boundary/
deployment regressions and cold web/iOS exports. The native source map includes
public contracts and excludes the OpenAPI module; its document markers are
absent from the Hermes bundle. HTTP verification passed the full npm run check
and focused protocol/account/consumer regressions, including malformed media,
authentication-shaped proxy bodies, timeout/cancellation and bounded replay.
No Phase 08A hosted CI is claimed;
the tooling checkpoint passed the final npm run check, database suites and ordered
migration rehearsal, all saved journeys, normal production exported-web smoke,
cold web/iOS exports and a side-panel Settings/unknown-route walkthrough.
Remaining steps require their own checks. Detailed
interim output stays in ignored local logs and commit/PR descriptions.
