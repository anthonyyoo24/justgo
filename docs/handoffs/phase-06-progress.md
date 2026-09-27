# Phase 06 — Progress calendar & saved history

## Snapshot

- **Status:** In progress. Local automated and in-app browser checks pass; physical-iPhone acceptance and staging deployment remain open.
- **Updated / author:** September 27, 2026 / Codex.
- **Scope:** [Plan phase 06](../IMPLEMENTATION_PLAN.md#phase-06), PRD §5.6–5.7 and AC-13–14, 17.
- **Dependency:** [Phase 05 handoff](phase-05-reflections.md), whose native acceptance and staging deployment remain open under the previously approved sequencing exception.
- **Checkout:** `codex/phase-06`, based on `2a33cc7`.
- **Result:** The local app renders the full Progress summary/calendar and chronological day sheet from owner-scoped history queries. Submitted per-attempt reflections can be read from expanded entries.

## What changed

| Path or migration                                                                                              | Behavior and reason                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/progress.ts`, `index.ts`, `openapi.ts`                                                 | Defines typed month and day response shapes, validated dates and bounded page size.                                                                                                                                                                                         |
| `apps/api/src/progress/`, `src/build-app.ts`                                                                   | Adds authenticated, entitlement-checked month summary and per-day history routes. Counts derive from completed attempts only. Day entries retain original revision, Level 1 and venue context.                                                                              |
| `apps/api/drizzle/0008_progress_history.sql`, `src/db/schema.ts`                                               | Adds a completed-attempt index on owner, frozen local date, completion time and ID for calendar and keyset day reads. No new user data table is added.                                                                                                                      |
| `apps/mobile/src/features/progress/`, `src/app/(tabs)/progress.tsx`                                            | Replaces the placeholder with the P37-inspired calendar and P31-inspired scrollable day sheet. It uses account-scoped query keys, active-day buttons, exact elapsed duration, frozen-zone completion clocks, loading/error/empty states and read-only reflection expansion. |
| `apps/mobile/src/features/shell/ScreenPreview.tsx`, `src/features/challenges/controller.ts`, `src/lib/http.ts` | Adds a presentation-only Progress fixture, invalidates account Progress after a confirmed completion and permits validated query strings in API paths. The preview does not write activity or bypass entitlement.                                                           |

`GET /v1/progress?month=YYYY-MM&timeZone=<IANA zone>` returns account-level current/best streak and all-time reps, the requested month's reps, active days, daily counts and the viewer's current local date. `GET /v1/progress/days/:date?limit=20&cursor=…` returns the selected day's total reps/elapsed seconds and chronological entries with a bounded keyset cursor. Pages allow 1–50 entries. Both routes require an authenticated session and verified paid access; missing/invalid input, unpaid access and unavailable entitlement verification use the existing 400/401/403/503 boundary.

## Decisions and invariants

| Decision                                                                                                                      | Source                                       | Implication                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Submitted per-attempt reflection text is read from an expanded day entry; phase 06 does not add editing or deletion controls. | Anthony, September 27, 2026.                 | Phase 05 submitted records remain terminal. No day note or standalone journal is introduced.                                |
| Completed attempts alone earn reps. Each attempt keeps its frozen local completion date and time zone.                        | PRD §6; Phase 04 attempt schema and handoff. | Travel and later time-zone changes cannot move an old rep to another calendar day. Skips and given-up attempts earn no rep. |
| Missing, draft and skipped reflections display **Not recorded**; only a submitted record displays its feeling or text.        | Phase 05 handoff and PRD §5.4.               | A draft never appears as final feedback in history.                                                                         |
| Elapsed duration displays exact hours/minutes/seconds without rounding.                                                       | Phase 06 implementation choice.              | Daily duration sums stored seconds for completed entries, including background and after-zero time.                         |

## Setup, data and operations

- Use the existing identity, database and local development entitlement configuration from the earlier handoffs. Progress introduces no new secret or environment variable.
- Apply migrations in journal order through `0008_progress_history.sql` before deploying the new API. The migration adds an index and is compatible with older clients; it does not rewrite attempt dates or reflections. Prefer a forward repair if the migration fails.
- Progress reads require verified paid access. The challenge development entrypoint remains an isolated local test fixture; production access stays closed until phase 07 billing verification exists.
- The month response contains counts only. Submitted reflection text is returned solely in owner-scoped day history. Keep private text out of logs, analytics and handoff fixtures.

## Problems encountered and fixes

| Symptom                                                                                                                | Cause                                                                                     | Fix / limit                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The first preview showed a seven-day current streak while its simulated today was nine days after the last completion. | The P37 sample count and the host's current date were combined in a presentation fixture. | Pinned the preview's today to September 18, matching the seven active dates September 12–18; refreshed the in-app browser and verified the today marker. Real streaks come from server data. |
| An ISO year `0000` passed the initial month/date validator but PostgreSQL cannot represent it.                         | ISO 8601 and PostgreSQL date ranges differ at year zero.                                  | Reject year zero in the shared Progress contract; added a focused contract test and reran workspace/database checks.                                                                         |

## Verification evidence

| Command or scenario                                                            | Environment                                              | Result                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                | Local workspace, Node 24/npm 11                          | Passed contracts build, all workspace typechecks, ESLint, Prettier, 29 mobile suites / 148 tests, 8 API unit tests and 9 contract tests.                                                                                        |
| `npm run test:db -w @justgo/api`                                               | Local PostgreSQL 17 with migration 0008                  | Passed 5 integration suites / 35 tests, including owner isolation, streaks, DST/travel, multiple completions, reflection status/content and exact-time cursor ordering.                                                         |
| `npm run export:web -w @justgo/mobile`; `npm run export:ios -w @justgo/mobile` | Expo 57                                                  | Both bundle exports passed; iOS export is a bundle check, not device interaction evidence.                                                                                                                                      |
| In-app Browser Use at 390 × 844                                                | Presentation-only `/preview`                             | Progress calendar, month navigation, active September 18 day, three chronological entries, submitted reflection expansion, skipped **Not recorded**, close control and honest empty October passed. No browser warnings/errors. |
| In-app Browser Use at 320 × 568                                                | Presentation-only `/preview`                             | Calendar scrolled, active day opened, reflection expanded and all day entries remained reachable by sheet scrolling. The heading wrapped cleanly.                                                                               |
| Representative month and day `EXPLAIN (ANALYZE, BUFFERS)`                      | 6,000 synthetic completions in a rolled-back transaction | PostgreSQL used `attempt_history_day_idx` for both reads; month aggregate ~0.61 ms and ordered day page ~0.10 ms in the local sample.                                                                                           |

The browser preview does not exercise a live authenticated account. Database/API integration tests cover the real owner-scoped data path; physical-iPhone sheet gestures, VoiceOver, Dynamic Type and staged API/mobile use remain unverified.

### September 27 local Progress follow-up

- The simulator's Progress request initially returned `404 NOT_FOUND` because the local API process on port 3000 predated the Phase 06 route. Restarting `npm run dev:challenges -w @justgo/api` from this branch registered the route. The live simulator then showed the account's 10 saved reps on September 27 and the day sheet's chronological entries.
- A successful account with no completions now shows the full calendar, zero totals, no rep badges and “Your first completed challenge will appear here.” A failed or pending month request keeps the same layout but shows unavailable values (`—`), muted disabled dates and an error/Retry or loading message. It does not report zero activity until the API confirms it.
- `npm run check` passed after this follow-up, including 29 mobile suites / 150 tests. In-app Browser Use verified the new-account empty state, unavailable state and Retry recovery in the presentation preview; the live iPhone 17 simulator still displayed the 10-rep account after the UI change.

## Remaining work and risks

| Item                                                                                                  | Impact                                                                 | Required by        |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------ |
| Physical-iPhone day-sheet gestures, VoiceOver and large-text acceptance.                              | Phase 06 cannot be marked complete from browser/component tests alone. | Phase 06 / release |
| Apply the phase 06 migration and deploy the API/mobile build to staging after the earlier migrations. | Local implementation is not a staged feature.                          | Phase 06 / release |
| Resolve Phase 05 and earlier device/deployment gates.                                                 | Dependency phases remain in progress.                                  | Release            |

## Next phase: read this first

1. Verify the Phase 06 owner-scoped aggregate and paged history contract before changing billing or entitlement behavior.
2. Preserve frozen completion dates, original challenge revision/Level 1 context and the distinction between draft and submitted reflections.
3. Rerun the full workspace, database and Progress browser checks after touching these boundaries.
4. Keep private reflection text out of analytics and unauthenticated responses.
