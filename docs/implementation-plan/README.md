# Implementation plan

This folder owns sequencing, approved scope and acceptance requirements. Results and open acceptance evidence belong in [handoffs](../handoffs/README.md); lasting decisions belong in [DECISIONS.md](../DECISIONS.md). The [documentation map](../README.md) identifies other owners.

## Stage overview

| Phase                                                                     | Outcome                                                                                                                         | Depends on                                   | Status                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| [01 — Foundation & implementation decisions](phase-01-foundation.md)      | A reproducible workspace and a clear list of decisions to settle before each feature.                                           | None                                         | Complete                                    |
| [02 — No-signup identity & recovery](phase-02-identity.md)                | A real account survives supported recovery paths, without exposing another person’s history.                                    | 01                                           | In progress                                 |
| [03 — App shell & shared API](phase-03-app-shell.md)                      | The app restores the right account and provides consistent navigation and network behavior.                                     | 02                                           | In progress                                 |
| [04 — Challenge deck & reliable attempts](phase-04-challenge-loop.md)     | Browse → accept → complete or give up works against real cloud data exactly once.                                               | 03                                           | In progress                                 |
| [05 — Feelings & typed reflections](phase-05-reflections.md)              | A completed attempt can have optional private feedback and typed reflection text.                                               | 04                                           | In progress                                 |
| [06 — Progress calendar & saved history](phase-06-progress.md)            | Users can view the full Progress summary/calendar and read day details and saved reflections.                                   | 05                                           | In progress                                 |
| [06A — Code quality & test hardening](phase-06a-code-quality.md)          | Existing code is easier to understand and change, with meaningful regression tests and durable coding guidance.                 | 06 (local)                                   | Complete                                    |
| [07 — API & offline saving](phase-07-api-offline.md)                      | Completions/reflections display after local saving and synchronize reliably through resource APIs.                              | 06A                                          | In progress                                 |
| [07A — Native subscriptions & reliable billing](phase-07a-billing.md)     | Verified purchases unlock promptly, and later subscription changes recover reliably.                                            | 07.5; activate after free beta               | Local work in progress; activation deferred |
| [08 — Settings & privacy controls](phase-08-settings-privacy.md)          | Users control recovery, private data and preferences, including confirmed account deletion.                                     | 07.5                                         | Complete                                    |
| [08A — Structure, docs & tooling cleanup](phase-08a-structure-cleanup.md) | Routes, folders and docs match how the app works today; CI is faster and deterministic; no user-visible change.                 | 08 merged, no other open feature branch      | Local ready; hosted CI/cleanup open         |
| [09 — Analytics & consent](phase-09-analytics.md)                         | Product measurement follows one Terms & Privacy onboarding acceptance; saved shuffled decks and venue; Reflection exit cleanup. | 08, 08A                                      | Not started; exporter disabled              |
| [10 — Legal documents & release disclosures](phase-10-legal-documents.md) | Reviewed public notices and disclosure preparation match the verified release behavior.                                         | 08, 09                                       | Drafts prepared; review/publication open    |
| [11 — Release validation & launch](phase-11-release.md)                   | A free beta validates the core product, then the complete paid product is ready for store submission.                           | 08–10 for beta; accepted 07A for paid launch | Hosted prerequisite ready; acceptance open  |
| [12 — Lock-screen countdowns](phase-12-native-timers.md)                  | The same accepted challenge is visible on supported lock screens without a JavaScript background timer.                         | 11                                           | Not scheduled                               |
| [13 — Optional US iOS web checkout](phase-13-optional-stripe.md)          | Eligible users can purchase on the web using the same authenticated app identity.                                               | 11                                           | Not scheduled                               |
| [14 — Future AI text coach](phase-14-future-text-coach.md)                | A separately approved text coach uses bounded, permitted context in the existing backend.                                       | 11                                           | Not scheduled                               |

## Release order

01 → 02 → 03 → 04 → 05 → 06 → 06A → 07 (07.1 → 07.2 → 07.3 → 07.4 → 07.5; 07.3A deferred) → 08 → 08A → 09 → 10 → 11 free beta → 07A activation/acceptance → 11 paid launch.

Prepared billing code can be reviewed independently while activation waits. Legal review can run alongside implementation, but final notices must describe the verified build. Phases 12–14 are separately scheduled after launch and do not block the first submission.

## How to use the plan

- Read the requested phase, dependency handoffs and applicable AGENTS.md before editing. Build each slice through the boundaries it needs; preserve unrelated behavior and approved scope.
- Earlier feature implementation may proceed against verified local identity/core behavior while explicitly owned physical-device and staging gates remain open. Quality phases do not close those gates.
- Phase 07 checkpoints remain sequential except deferred 07.3A; keep the retained browser suite and lower-level coverage until replacement native acceptance exists. Phase 11 starts its native smoke from that checkpoint.
- Phase 08 includes the first physical-iPhone haptics acceptance. Broader device/release rechecks remain Phase 11.
- Run focused checks during implementation and required phase/publication gates at completion. Follow [testing guidance](../operations/TESTING.md); browser evidence cannot establish native behavior.
- Phase 08A uses the approved two-PR stack: documentation/design sources first, then implementation against that documentation branch. Keep move-only commits separate from behavior changes and merge in dependency order. Publishing, pull requests, merges and local branch/worktree deletion require the specific owner authorization in AGENTS.md.
- Keep first-release scope in the [PRD](../product/PRD.md). Onboarding/questionnaires, reminders, progression/extra filters, dictation, lock-screen display, Android, Stripe and coaching remain deferred unless a phase explicitly implements them.

## Handoff workflow

1. Before starting, verify the checkout/environment and read the previous phase and dependency handoffs; check relevant smoke behavior.
2. During implementation, retain decisions, checks and unresolved issues in task conversation. Do not rewrite project docs after every small change.
3. At phase completion, update applicable docs together and edit the handoff using [TEMPLATE.md](../handoffs/TEMPLATE.md). Record only what the next phase needs: decisions and why, changed behavior, invariants, recurring problems, setup, owned open gates and final verification.
4. Record results in the handoff; change a phase plan only when scope or a decision changes, and edit its status in place. Update the index row only when status changes. Keep detailed interim checks, screenshots and publication bookkeeping in commits/PR descriptions.
5. Mark complete only when required work/dependencies are satisfied, verification exists and each remaining gate has an approved owner/phase. A deferral is not a passing result. Do not publish or merge without the separate authorization required by AGENTS.md.
