# Phase NN — Name

## Summary and status

**Status:** Not started / In progress / Blocked / Complete. State what now works,
link the plan and dependency handoffs, and distinguish implementation from open
native, hosted or release acceptance. Use actual evidence; say “Not applicable”
with a reason when a check does not apply.

## Decisions and why

Record decisions the next phase must preserve, their reason and owner approval or
source. Distinguish approved behavior from proposals; link the owning product or
architecture document instead of copying its specification.

## Behavior that changed

Describe the resulting behavior and its owners. Include relevant contracts,
migrations, dependencies or configuration changes; link source where useful.
Omit small visual adjustments and per-change chronology.

## Invariants to preserve

Record ownership, security, retry, cancellation, account-isolation and
compatibility rules that later work could accidentally break.

## Problems that could recur

Keep only recurring failure modes, their causes, the lasting fixes and relevant
limits. Interim attempts and routine diagnostic captures belong in commits or PRs.

## Setup or environment changes

Record prerequisites, migration/build order, environment variable names, fixture
boundaries and recovery/forward-repair steps. Never include credentials or private
activity. Link the operational guide for commands already documented there.

## Open gates

Edit this single table in place. Every unfinished requirement needs an owner,
required phase and observable completion condition. Write “None” if all gates
are satisfied. Browser checks and JavaScript exports do not establish native
Keychain, gestures, purchases or device accessibility.

| Gate                   | Owner                          | Required phase | Done when         |
| ---------------------- | ------------------------------ | -------------- | ----------------- |
| Unfinished requirement | Person or implementation owner | NN             | Required evidence |

## Final verification

Record the final verification date, exact commands and actual results, plus the
inspected CI link when one exists. Separate automated tests, saved journeys,
interactive browser checks, native/device evidence and owner-reported acceptance.
State what was not verified and why. Do not include interim test counts,
screenshot paths or merge/publication bookkeeping.
