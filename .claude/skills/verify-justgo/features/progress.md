# Progress

The Progress tab shows streaks, total reps and a month calendar. Tapping an active day opens a day sheet listing each rep, where the user can add, edit or view a reflection inline.

## Sub-features

- `progress-totals` shows `Total reps` in test ID `progress-value-reps`.
- `progress-calendar` marks today with its rep count and moves between months.
- `progress-day-sheet` lists a day's reps in test ID `day-sheet-entry-list`.
- `progress-add-reflection` saves a reflection from `Your day reflection`.
- `progress-edit-reflection` replaces a saved reflection through `Edit reflection`.

## How to get to it (user POV)

- Tab `Progress` from Home.
- `/progress` directly.

## Driving it with Playwright

Preconditions:

- Doctor is `idle`. Drive: `bin/verify drive progress`.
- A fresh fixture account with three attempts seeded today through `seedManagedHistory(page, account, 3)`, then `page.reload()`.

- **Totals.** Click tab `Progress`. `progress-value-reps` reads `3`. Capture `01-calendar`.
- **Day sheet.** Click the button whose name matches `today, 3 reps`. Button `Rep 3. … Add reflection` is visible. Capture `02-day-sheet`.
- **Add reflection.** Click it, fill label `Your day reflection`, click `Save reflection`. The synthetic text is visible in the sheet and `localJournalEntries` has one entry. Capture `03-reflection-saved`.
- **Proof.** `justgo.attempts` still has three rows for the account.

## Gotchas

- Seed only through `seedManagedHistory`. It places attempts inside the browser's local day. Counting back from now crosses midnight in UTC CI.
- `Save reflection` (lowercase r) belongs to the day sheet. `Save Reflection` belongs to the post-challenge screen.
- `progress-edit-reflection`, month navigation and tall-sheet scrolling have no drive step. `e2e/progress-flow.spec.ts` covers them.
- Day sheet title width and the skeleton animation have web-only branches (`DaySheet.tsx`, `ProgressSkeleton.tsx`). Web layout of those is not native evidence.
- Layout assertions must wait for usable controls and reread geometry after navigation. Do not add sleeps or loosen alignment limits.
