<a id="phase-02"></a>

# Phase 02 — No-signup identity & recovery

**Status:** In progress — implementation built; physical-device acceptance pending

## Outcome

A real account survives supported recovery paths, without exposing another person’s history.

## Decisions in force

- Dependencies: 01
- Acceptance: PRD AC-01 · Tech acceptance 1–4, 17
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Implement users, devices, hashed recovery credentials and expiring independent device sessions. Store the recovery secret before idempotent bootstrap; add recovery, renewal, revocation, rate limits and ownership checks.
- Build the Swift synchronizing-Keychain module and secure per-device session storage. Handle locked storage, delayed iCloud sync, revoked credentials and two concurrent devices without silently creating or merging accounts.
- Implement optional recovery-key and existing-device transfer APIs plus minimal test UI, including code expiry, one-use redemption and existing-device approval. Validate these fallbacks on iPhones; Android recovery implementation is deferred.
- Keep platform access behind typed adapters. Native timer and speech-recognition spikes are deferred with their features; do not add them to identity acceptance.

## Keep out

- No signup, email, SMS, OAuth or identity inferred from store purchases.
- No unconditional cross-device recovery promise, shared rotating session token, silent account merge or polished Settings screen yet.

## Ready to hand off when

- [ ] Real iPhone reinstall, two-iPhone recovery, disabled/delayed sync and credential failures behave as specified; limitations are recorded.
- [ ] iPhone recovery-key/transfer, replay/expiry/revocation, lost bootstrap responses and concurrent sessions are tested.
- [x] Two-user API/database isolation passes under the actual runtime role; Keychain configuration and fallback limitations are recorded.
- [x] Save the phase handoff with exact changes, issues/fixes, test evidence and next steps; link it from the handoff index.

## Open gates for Phase 13

- Physical-iPhone reinstall, delayed/disabled iCloud synchronization, recovery-key/transfer, concurrent-device and credential-revocation acceptance.
- Valuable-data external testing must not precede accepted recovery and identity isolation.
