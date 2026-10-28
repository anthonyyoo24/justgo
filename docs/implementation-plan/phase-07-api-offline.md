<a id="phase-07"></a>

# Phase 07 — API & offline saving

**Status:** In progress — active checkpoints implemented; deferred native/release acceptance remains open.

## Outcome

Challenge completions and submitted reflections save locally and display immediately, pending uploads synchronize reliably, and Progress reads avoid unnecessary summary work.

## Decisions in force

- Dependencies: 06A; complete active 07.1–07.5 in order before 07A. 07.3A is deferred; native/device/release evidence remains open.
- Acceptance: The confirmed API/persistence requirements below govern this redesign. Billing acceptance is owned by Phase 07A. Align older product/technical acceptance lists after each implementation under the approved documentation sequence.
- Preserve the applicable [recorded decisions](../DECISIONS.md) and [handoff](../handoffs/README.md).

## Implement

- Preserve the settled behavior in [ACTIVITY_DATA.md](../architecture/ACTIVITY_DATA.md): local completion/reflection persistence, stable operations, authenticated owner-isolated resources and limited offline history.
- Save accepted submissions to the device before normal navigation; synchronize quietly in order. Failed device writes get bounded safe cleanup, one local retry and a direct online save; if both paths fail, retain account-scoped memory, show the dismissible risk banner and recover automatically without false durability claims.
- Keep the catalog, latest summary, current-month counts, today's loaded details and pending data available under the defined bounded cache. Other history requires an online lookup. Never evict pending or endangered submissions.
- Preserve frozen challenge-start date/time-zone attribution, UUID idempotency, reflection revision/replay rules, server-wins genuine conflicts, retained rejected input and exclusion of definitively rejected completions from aggregates.
- Use separate summary, month and paged-day reads; reconcile accepted/local rows once and avoid summary work on month changes. Preserve submitted input through late hydration, stale responses and account changes.
- Apply resource contracts and registered migrations together, preserving historical owner/content/date data and blocking incompatible old writers under the coordinated cutover runbook.

<a id="phase-07-subphases"></a>

**Sequential checkpoints**

<a id="phase-07-1"></a>
<a id="phase-07-1b"></a>

- 07.1: shared resource contracts, independent backend reads, completion/reflection writes, typed client errors, ownership and migration/restore preservation; saved actual-app/API/database journeys and fixture isolation.

<a id="phase-07-2"></a>

- 07.2: durable account-scoped journal, sender, bounded storage cleanup/retry, transport backoff and lost-response replay.

<a id="phase-07-3"></a>

- 07.3: local challenge/reflection UI, quiet synchronization, storage-failure fallback and accessible feedback with accepted input retained.

<a id="phase-07-3a"></a>

- 07.3A: deferred hybrid/native-testing checkpoint. Preserve the existing browser suite, adapters, coverage floors and checkpoint/browser assessment; Phase 14 starts its native smoke here.

<a id="phase-07-4"></a>

- 07.4: independent Progress reads, local/backend reconciliation, calendar/day paging, bounded offline history and inline Add/Edit with retained drafts.

<a id="phase-07-5"></a>

- 07.5: final protocol/schema cutover, obsolete caller retirement, migration/restore rehearsal, complete journeys and documentation reconciliation. Keep native/device and staging gates explicit.

- Read each checkpoint's handoff from the [Phase 07 handoff index](../handoffs/phase-07-api-offline.md); a deferred checkpoint is not completed evidence.

## Keep out

- Native purchase/paywall/restore implementation, subscription refresh/expiry policy, provider billing records/webhooks, QStash and scheduled billing recovery. These belong to Phase 07A; recorded subscription decisions remain intact there.
- No production premium bypass, Stripe checkout, generic server outbox or continuously running worker for phone uploads. Keep existing authentication/ownership checks and isolated development/test access boundaries.
- General PostHog activation remains Phase 15. Earlier physical-device/staging gates remain in Phase 14.

## Ready to hand off when

- [ ] The complete API/local-save/cache/retry/start-date/migration/native acceptance matrix is evidenced or has an explicit approved gate.
- [x] Duplicate activation, delayed device persistence, sparse outage recovery, rejected records and revision conflicts retain stable identities and accepted input.
- [x] Typed client errors and actual-app/API/database journeys protect success, failure, recovery, owner isolation and migration/cutover boundaries.
- [x] Earlier-upload eligibility/access seams have isolated provider fixtures; no live billing completion or production bypass is claimed.
- [x] Contracts, API/mobile callers, migrations and current architecture agree; each checkpoint has a handoff.

## Open gates for Phase 14

- Native Keychain/AsyncStorage durability, saved/rejected/queued data through background/relaunch, software keyboard/toast/modal and physical-device accessibility.
- Deferred 07.3A native automation is a release smoke prerequisite, not completed evidence.
- Integrated staging/cutover and earlier feature acceptance remain open.
