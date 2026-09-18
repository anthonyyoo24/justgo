# Implementation handoffs

This folder is the durable implementation record for [the staged plan](../IMPLEMENTATION_PLAN.md). The historical HTML checklist is absent from this checkout; current progress is recorded in Markdown. A browser-local checklist cannot modify or verify these files. Commit phase records with their implementation. Export/import the checklist to move its state between browsers or preview URLs.

## Current state

Phase 03 app-shell implementation is recorded in [phase-03-app-shell.md](phase-03-app-shell.md). Welcome/questionnaire onboarding is deferred by the owner; native acceptance status remains explicit. Staging now includes the transfer-verification upgrade and access boundary.

Phase 02 identity/recovery is implemented with passing browser/backend verification recorded in [phase-02-identity.md](phase-02-identity.md). Apple-dependent physical-device acceptance remains open. Anthony authorized later feature implementation to proceed against the verified identity boundary while those gates stay pending.

Phase 01 is complete: workspace, foundation app/API, restricted-role database infrastructure and the existing Expo project are verified. The cloud-built iOS app passed native launch and connectivity. See [phase-01-foundation.md](phase-01-foundation.md) for evidence and next steps. [00-planning-baseline.md](00-planning-baseline.md) records the historical starting point. [01-ios-release-scope.md](01-ios-release-scope.md) records the current scope revision; neither is a completed build phase.

## Workflow

1. **Start:** read the current PRD/tech stack, baseline, previous phase and each dependency handoff. Confirm checkout/commit, environment and smoke checks.
2. **During:** keep a record of decisions, changed paths, migrations, tests, issues/root causes/fixes and remaining work. Update product or architecture docs when an approved decision changes them.
3. **Finish or pause:** copy [TEMPLATE.md](TEMPLATE.md) into the filename below. Use In progress or Blocked for unfinished work; never invent implementation or test evidence.
4. **Verify:** include exact commands/results and browser/native evidence appropriate to the changes. A preview cannot prove Keychain recovery, real purchases, timers or dictation. Record tests not run and their reason.
5. **Hand off:** update the status/file link in this index and the HTML tracker, export its state if useful, and record the next stage’s first actions. Only mark Complete when required gates and dependencies pass and the handoff is saved.

If later work invalidates a completed phase, add a dated correction and reopen affected dependencies; do not erase historical evidence. Never put secret values, session tokens, recovery keys, private reflection text or real customer data in handoffs. Use repo-relative paths and test fixture identifiers.

## Phase index

The filenames below are reserved names, not claims that those files exist. Turn each filename into a link after writing that phase’s record.

| Phase                                        | Status        | Dependencies | Handoff filename                                 |
| -------------------------------------------- | ------------- | ------------ | ------------------------------------------------ |
| 01 — Foundation & implementation decisions   | Complete      | None         | [phase-01-foundation.md](phase-01-foundation.md) |
| 02 — No-signup identity & recovery           | In progress   | 01           | [phase-02-identity.md](phase-02-identity.md)     |
| 03 — App shell & shared API                  | In progress   | 02           | [phase-03-app-shell.md](phase-03-app-shell.md)   |
| 04 — Challenge deck & reliable attempts      | Not started   | 03           | `phase-04-challenge-loop.md`                     |
| 06 — Feelings & typed reflections            | Not started   | 04           | `phase-06-reflections.md`                        |
| 07 — Progress calendar & saved history       | Not started   | 06           | `phase-07-progress.md`                           |
| 08 — Native subscriptions & reliable billing | Not started   | 07           | `phase-08-billing.md`                            |
| 09 — Settings, privacy & measurement         | Not started   | 08           | `phase-09-settings-privacy.md`                   |
| 10 — Release validation & launch             | Not started   | 09           | `phase-10-release.md`                            |
| 05 — Lock-screen countdowns                  | Not scheduled | 10           | `phase-05-native-timers.md`                      |
| 11 — Optional US iOS web checkout            | Not scheduled | 10           | `phase-11-optional-stripe.md`                    |
| 12 — Future AI text coach                    | Not scheduled | 10           | `phase-12-future-text-coach.md`                  |

The release path is 01 → 02 → 03 → 04 → 06 → 07 → 08 → 09 → 10. Deferred stages 05, 11 and 12 each follow launch and do not block it. Additional levels/filters, dictation and Android stages will be detailed when scheduled.
