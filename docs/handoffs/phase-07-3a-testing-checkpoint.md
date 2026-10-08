# Phase 07.3A — Deferred testing checkpoint

**Owner decision:** October 7, 2026. Stop 07.3A, preserve its unfinished work and
proceed to 07.4 with existing browser/lower-level automated checks plus relevant
manual native verification. 07.3A is **deferred, not complete or merge-ready**.
Native/device/VoiceOver/staging/release and future billing gates remain open.

**Checkpoint:** `codex/phase-07.3a-testing-checkpoint` at
`c7c67b22f235ed1c7d2ea1c60729a94c0d6a7c48`. **Approved code baseline:**
`67804068e4a6818d7ad25ef30b5bdb172daf529b`. Main retains that code baseline;
only this handoff and the plan/index deferral decision are added. Local branch and
checkpoint/documentation commits are authorized; no push, PR or merge is authorized.

## Preserved work and verification limits

The checkpoint contains the full native parity prototype, four focused native
journeys, guarded account setup through the real API/Keychain, native failure
adapters, compatibility/build helpers, selectors, timing/cleanup/redaction,
a gesture check, a 25-group iOS inventory, hybrid guidance and a native CI draft.
Browser tests/adapters/existing CI are retained. The only production-code addition
is a Progress sheet handle test ID. None of this experimental code is active on main.

| Evidence                                                 | Measured result and version limit                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Earlier native prototype: ten UI + six independent cases | All 16 passed twice: 722.90 s / 707.78 s                                                  |
| Earlier browser suite                                    | All 16 passed: 26.63 s / 26.31 s                                                          |
| Earlier portable integration command                     | Six passed: 7.97 s / 7.74 s                                                               |
| Healthy fresh signed compilation                         | 1,050.58 s (17m30.58s); empty DerivedData, existing workspace/Pods                        |
| Cold retained simulator boot                             | 31.04 s; installed runtime/data reused                                                    |
| Fresh binary startup/identity after prompt fix           | Passed: 154.40 s                                                                          |
| Latest core run, owner-stopped                           | Storage passed 45.929 s; offline passed 57.217 s; account interrupted, active not reached |

Historical full passes used baseline `6780406` plus the
earlier uncommitted parity prototype, before optimized bridge/lifecycle/gesture/CI
changes. `npm run check`, `test:db`, coverage and web/iOS exports passed on that
earlier version. Later focused checks passed: bridge/provider/DaySheet 8; suite/
runner guards 7; Metro namespace 4; native CI compatibility/selection 6. These are
focused results, **not a final acceptance pass against checkpoint `c7c67b2`**.
No acceptance suite was rerun merely to save it.

The stopped latest command took 220.30 s: setup 33.34 s, boundary checks 1.37 s,
journeys 168.12 s, cleanup 16.51 s, internal total 219.34 s. It exited 1 after the
requested stop. A passing optimized hybrid total remains unmeasured; 8–10 minutes
was a hypothesis. Historical coincident sampled RSS was about 2.5–3.2 GiB native
versus 1.5 GiB browser; shared pages/background activity limit attribution.

## Failures, unfinished work and resume

Fixture setup previously failed with HTTP 400, then 409 with zero app polls;
a storage-only run timed out after relaunch at font loading. Distinct Metro
cache namespaces, a warmed/guarded native bundle and a 60-second relaunch window
were added. Latest storage/offline passed with this wiring; account/active,
new gestures, latest complete suite, browser timing reporter, optimized benchmark,
clean CI provisioning and hosted native CI remain unverified.

CI uploads still rely on runner-finally redaction; a killed process could bypass
it. Independent pre-upload scrubbing is an open finding. Synthetic test Keychain
services may survive uninstall; scoped cleanup remains open. Earlier setup issues
included stale Pods references, unsigned Keychain failure, first-launch prompts
and keyboard/developer-overlay occlusion. The normal app's earlier background
crash has an unconfirmed cause; its data/container were retained. Actual OS radio
connectivity, physical Keychain/iCloud/lock/reinstall, VoiceOver, transitions,
text sizes, staging and billing remain separate acceptance gates.

Resume only when the owner reauthorizes 07.3A. Switch to the checkpoint and read
its detailed `docs/handoffs/phase-07-3a-native-testing.md` and pilot report first.
Use Java 17, Maestro 2.11.0, command-scoped Xcode, a booted compatible retained QA
simulator, free ports 3000/3001/8082 and loopback `justgo_test` with isolated roles.
Heavy commands run sequentially on the 8 GiB Mac. Ignored local configuration owns
the database credentials; do not copy them into documentation.

```sh
git switch codex/phase-07.3a-testing-checkpoint
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
export JAVA_HOME="$PWD/.local/native-testing-pilot/tools/jdk-17.0.20.1+1-jre/Contents/Home"
export JAVA_OPTS=-Xmx512m
export MAESTRO_BINARY="$PWD/.local/native-testing-pilot/tools/maestro/bin/maestro"
export NATIVE_JOURNEY_APP_SOURCE="$PWD/.local/native-parity-clean-build/Build/Products/Debug-iphonesimulator/JustGO.app"
npm run test:journey:native:focused -- --case account
```

The next debugging step is the account case alone: inspect actual bridge polls
and native creation/recovery/restart ownership before repeating a full benchmark.
Then validate active/background and gesture additions. Other checkpoint commands:
`test:journey:native:focused`, `test:journey:native`, `test:journey:integration`,
`test:journey` and `build:journey:native`. These new commands are absent on main.

## Local artifacts, safety and next phase

Useful ignored artifacts remain in `.local/native-testing-pilot/` (measurements,
logs, tools, audit/checkpoint metadata, saved stopped cases/timings),
`.local/native-journey-results/` (redacted Maestro diagnostics),
`.local/native-parity-clean-build/` (healthy signed app/cache/manifest) and
`.local/native-parity-build/` (earlier repaired build cache). They are preserved
locally, excluded from commits and not uploaded. No binaries/dependencies/raw
sensitive logs/real credentials were committed. All 78 intended checkpoint paths
were inspected and verified against committed blobs; no unrelated changes found.

Task agents/tests/services were stopped. Fixture ports are closed, task driver
processes are gone and its copied app is uninstalled. The original 18 database
user IDs exactly match the pre-final baseline. Normal app/container are retained;
no simulator erase, shared Keychain reset or normal data deletion occurred.

Next work is 07.4: split Progress reads, local/backend same-ID reconciliation,
current-month/today cache and rollover, and Add/Edit reflection. Extend saved
browser journeys and lower-level regressions for “10 + 1 stays 11,” rejection,
offline history and stale-response cases; inspect affected browser UI and native
behavior. Keep release gates explicit. Do not resume the testing pilot as part of
07.4 without a separate owner request.
