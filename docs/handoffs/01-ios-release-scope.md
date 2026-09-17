# Planning revision — first iOS release

**Date:** September 16, 2026  
**State:** Documentation only. No app code, migrations, accounts, purchases or deployments were created. This is a planning handoff, not completion of phase 01.

## What changed

- [PRD](../PRD.md): iOS first, onboarding, one general easy Level 1 deck, in-app timer, Success, typed reflection, the full Progress summary/calendar/day sheet and scoped Settings. No levels page, filters, custom dictation or lock-screen display at launch.
- [Tech stack](../TECH_STACK.md): preserved architecture and billing reliability; retained stable challenge/revision/Level 1 history. Level progress/credit records, thresholds and selection endpoints are deferred. General content explicitly has no venue restriction; unknown classification is distinct.
- [Markdown plan](../IMPLEMENTATION_PLAN.md) and [HTML plan](../IMPLEMENTATION_PLAN.html): nine launch stages, with phase 05 moved after release. Phase IDs remain stable. Apple/RevenueCat setup starts alongside phase 01. EAS build/upload, TestFlight and App Review are separate steps.
- [Handoff index](README.md): current order, dependencies and reserved names. Phase 07’s reserved filename is now `phase-07-progress.md`; no implementation handoff was renamed because none existed.
- Frontend learning checklist: removed its assumption that custom dictation ships initially.

## Decisions and invariants

- All launch challenges are easy Level 1 and general, without requiring a specific venue. Stable published revisions and attempt context protect historical meaning.
- No hidden unlocking, completion threshold, level selection or credit engine. Decide future progression and treatment of earlier completions later; catalog exhaustion is not an undefined level-completion event.
- Keep the entire Progress screen: current/best streak, all-time reps, month/year calendar, daily counts, monthly totals/active days, and tappable day history with saved reflection access. No day notes or completed-challenge replay.
- In-app deadlines survive lock/background/relaunch. Zero awaits the user’s outcome; only explicit give-up cancels. OS lock-screen display is a separate deferred enhancement.
- Onboarding remains included; its exact length/content is open. Cloud identity/recovery, API rules, safe retries, immediate purchase verification, QStash delivery, and scheduled billing repair remain required.
- Android shares the repository and reusable code later; Android implementation or device tests do not block this iOS release.

## Problems encountered and fixes

The earlier docs coupled launch to Android, levels/progression, native timer surfaces and dictation. Phase 08 also depended on the native timer phase. Revised the product rules, schema scope, acceptance gates and phase dependencies together to remove those contradictions.

The HTML checklist’s previous saved checks referred to broader v1 gates. Tracker v2 uses a new storage key and export version; v1 imports are rejected instead of silently treating old evidence as current. Old v1 browser data is left intact. The current baseline has no completed implementation stages.

## Verification evidence

See [planning checks](../checks/plan-check-results.md) for automated validator/document consistency tests and in-app-browser verification. These validate documentation and tracker behavior only, not mobile or backend functionality.

## Remaining work and next actions

1. Begin phase 01 workspace scaffolding and record the compatible iOS/native version matrix.
2. Start Apple account/app-record and RevenueCat product setup in parallel, recording access/status without secrets. Finalize offer details before phase 08.
3. Resolve onboarding content before phase 03 and approve a useful, safe general Level 1 catalog before phase 04.
4. Decide the deck counter/exhausted state, reflection dismissal/reading interaction, and access-expiry behavior before their consuming phases.
5. Keep future levels/venue taxonomy, dictation and Android decisions out of launch prerequisites. Detailed phases for those features will be written when scheduled.

No submission, approval date, production capacity or hackathon eligibility has been guaranteed by this planning revision.
