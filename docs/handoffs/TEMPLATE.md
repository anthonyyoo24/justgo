# Phase NN — Name

> Replace prompts with actual evidence. Write “Not applicable” with a reason where needed; do not leave ambiguous checkmarks.

## Snapshot

- **Status:** Not started / In progress / Blocked / Complete
- **Updated / author:**
- **Plan phase and scope:**
- **Previous and dependency handoffs:**
- **Branch / start commit / end commit / uncommitted changes:** (If Git is not initialized, say so.)
- **Environment / mobile build / OS versions:**
- **Summary:** What now works that did not work before?

## What changed

| Repo-relative path or migration | Added / changed / removed | Behavior and reason |
| ------------------------------- | ------------------------- | ------------------- |
|                                 |                           |                     |

Include entrypoints and how the code is organized. List new dependencies/version changes, API routes and request/response/error contracts, schema/constraints/indexes, native configuration and deployment settings where applicable. Link source code rather than copying entire files.

## Decisions and invariants

| Decision | Reason / approval or source | Implication for later phases |
| -------- | --------------------------- | ---------------------------- |
|          |                             |                              |

Record product/configuration decisions, ownership rules, attempt/retry semantics, time-zone rules and any changed PRD/tech-stack sections that apply. Distinguish approved decisions from proposals.

## Problems encountered and fixes

| Symptom / reproduction | Root cause | Fix and changed path | Verification / remaining limitation |
| ---------------------- | ---------- | -------------------- | ----------------------------------- |
|                        |            |                      |                                     |

Include relevant failed approaches only when they explain why the selected fix matters or prevent repeating the mistake.

## Verification evidence

| Command / scenario | Environment / fixture / device | Actual result | Evidence path |
| ------------------ | ------------------------------ | ------------- | ------------- |
|                    |                                |               |               |

- Relevant unit/component/API/database checks and exact commands:
- In-app browser behavior checks (or Chrome fallback and why):
- Native iOS/Android behavior checks, physical devices and OS/build versions:
- PRD acceptance IDs and tech-stack checks covered:
- Tests not run, failed or still blocked, with reasons:
- Plan exit gates met / not met:

A passing browser preview does not establish Keychain recovery, purchase, lock-screen or dictation behavior. Mark a phase complete only when its required evidence exists.

## Setup, data and operations

- Commands to install/run/test this phase:
- Required environment variable **names**, where configured and who can provision them; never values:
- Migration order, seed/content version and prerequisites:
- Safe test fixtures and how to reset staging data:
- Deployment/build steps; native changes requiring a new binary:
- Rollback/forward-repair steps and older-client compatibility:
- Monitoring, alerts, provider/capacity settings and recovery/replay procedure:

## Remaining work and risks

| Item | Severity / launch impact | Owner or decision needed | Required by phase |
| ---- | ------------------------ | ------------------------ | ----------------- |
|      |                          |                          |                   |

Include intentionally deferred scope, temporary fixtures/flags, unresolved product decisions and known platform limits. Temporary development access must not reach a release build.

## Next phase: read this first

1. First concrete task and its entrypoint:
2. Dependency or assumption to verify before changing code:
3. Smoke command/scenario to rerun:
4. Behavior/invariant to preserve:

## Record updates

- Handoff index updated:
- HTML tracker updated/exported (browser state is not the implementation record):
- Relevant PRD/tech-stack decisions synchronized:
- Dated follow-up corrections, if any:
