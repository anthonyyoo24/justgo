<a id="phase-06a"></a>

# Phase 06A — Code quality & test hardening

**Status:** Complete

## Outcome

Existing code is easier to understand, test and maintain. Important behavior has meaningful regression coverage, large components have clear responsibilities, and future agents can find the agreed coding standards in repository instructions.

## Decisions in force

- Dependencies: 06 (verified local implementation)
- Acceptance: Existing implemented behavior from phases 02–06; repository coding, test and UI-verification instructions. This phase adds no product features or physical-device acceptance gates.
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Protect provider/runtime, secure-storage adapter and asynchronous failure/retry behavior with meaningful regression tests.
- Separate Progress, challenge and reflection responsibilities while preserving behavior and accessibility.
- Enforce all-source coverage floors, import boundaries, safe promise handling and isolated journey fixtures.
- Keep shared coding, testing and owner-specific guidance discoverable and consistent.

## Keep out

- API route renaming, HTTP-contract redesign, schema/persistence changes, or decisions about local versus backend ownership of attempts, venue queues and reflections. Those belong to the separate API discussion. Preserve current behavior and interfaces throughout this phase.
- New billing/paywall, onboarding, levels, Android, dictation, analytics exporters or other unimplemented features. Missing tests for future features are not gaps in this phase.
- Physical-device release acceptance, staging/production deployment, store submission, provider integration work, native signing/build upgrades, and full production load/security campaigns. Existing device and release gates remain in Phase 14 and their original handoffs.
- A new offline sync engine, state-management framework, broad dependency upgrade, wholesale architecture rewrite, arbitrary file-size target, or blanket coverage goal. Use the current tools unless a demonstrated test requirement calls for a small, documented addition.

## Ready to hand off when

- [x] A fresh baseline and final evidence are recorded; meaningful runtime/provider and storage-adapter tests cover the selected critical gaps, existing implemented behavior remains protected, and `npm run check` plus `npm run test:db` pass with no unexplained asynchronous test warnings.
- [x] Progress responsibilities are separated and the agreed maintenance worklist is completed or explicitly deferred with reasons. Import boundaries, strict typing, current contracts and product behavior remain intact; affected browser UI checks pass, including applicable loading/error/retry and reduced-motion cases. Chrome fallback or any limited simulator verification is recorded accurately.
- [x] Coverage reports include all relevant production source, and CI enforces the documented thresholds/exclusions and selected type-aware lint rules. Existing user-journey checks pass using isolated fixtures; the evidence distinguishes automated, browser and simulator checks and makes no physical-device claims.
- [x] Repository agent/coding guidance is updated and discoverable, this plan and the handoff index agree, and the phase handoff records changed paths, tests, UI evidence, coverage changes, preserved decisions and remaining work before billing. Earlier physical-device/staging gates and API decisions retain their separate owners and phases.

## Open gates for Phase 14

No quality-phase gates remain. Earlier feature physical-device and staging gates retain their original owners.
