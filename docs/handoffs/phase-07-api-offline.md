# Phase 07 — API & offline saving

**Status:** Implementation merged; native/device/release acceptance remains open.
[Phase 07](../implementation-plan/phase-07-api-offline.md) owns scope; the
subphase handoffs below own implementation evidence and surviving gates.
The settled protocol belongs to [APP_SHELL.md](../architecture/APP_SHELL.md)
and [TECH_STACK.md](../architecture/TECH_STACK.md).

| Subphase                      | Handoff                                                                                                                                | Result and remaining gates                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 07.1A — API/data foundation   | [API and data](phase-07-1-api-data.md)                                                                                                 | Canonical resources, additive migrations, compatibility and typed `413`/`415`; hosted/native release acceptance stays with Phase 13      |
| 07.1B — Saved journeys and CI | [Journey harness](phase-07-1b-journey-ci.md)                                                                                           | Guarded app/API/database journeys and CI; native parity is not established by browser coverage                                           |
| 07.2 — Journal and sender     | [Local synchronization](phase-07-2-local-sync.md)                                                                                      | Account journal, storage, replay and ordered sender; native durability/relaunch and interruption acceptance remain open                  |
| 07.3 — Local flow/runtime     | [Challenge, reflection and feedback](phase-07-3-local-flow.md)                                                                         | Memory-owned active flow, explicit phone saves and shell saving feedback; relevant lifecycle, accessibility and device gates remain open |
| 07.3A — Native testing pilot  | [Deferred checkpoint](phase-07-3a-testing-checkpoint.md) and [browser assessment](../checks/phase-07-3a-browser-testing-assessment.md) | Deferred, not complete or merge-ready; retain browser CI and use this checkpoint for Phase 13’s native smoke                             |
| 07.4 — Progress/history       | [Progress integration](phase-07-4-progress-history.md)                                                                                 | Canonical reads, local reconciliation and inline Add/Edit; software-keyboard, physical-device and release gates remain open              |
| 07.5 — Cutover/acceptance     | [Final cutover](phase-07-5-cutover-acceptance.md)                                                                                      | Registered contraction, retired protocol removal and saved-journey/hosted CI acceptance; full native and release acceptance remain open  |

The [Phase 08 closeout](phase-08-settings-privacy.md) records later physical-phone
acceptance and fixes; it does not close every earlier native/release gate.
The October 1–4 design discussion is retained as
[historical planning](../archive/planning/phase-07-api-persistence-discussion.md).
