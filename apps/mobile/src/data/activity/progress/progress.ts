import type {
  Attempt,
  ProgressCalendar,
  ProgressDayResponse,
} from '@justgo/contracts';
import type { JournalState } from '../model';

export type ProgressMetrics = {
  totalReps: number;
  currentStreak: number;
  bestStreak: number;
};
export function preserveNewerReflection(
  incoming: Attempt,
  retained?: Attempt,
): Attempt {
  return retained &&
    (retained.reflection?.revision ?? 0) > (incoming.reflection?.revision ?? 0)
    ? { ...incoming, reflection: retained.reflection }
    : incoming;
}
const shiftDay = (date: string, offset: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10);
const eligible = (state: JournalState) =>
  Object.values(state.journal.records).flatMap((record) =>
    record.rejected ? [] : [record.attempt],
  );
export function progressCalendar(
  state: JournalState,
  month: string,
): ProgressCalendar {
  const days = new Map<string, number>();
  for (const attempt of eligible(state))
    if (attempt.activityDate.slice(0, 7) === month)
      days.set(attempt.activityDate, (days.get(attempt.activityDate) ?? 0) + 1);
  return {
    month,
    monthlyReps: [...days.values()].reduce((sum, count) => sum + count, 0),
    activeDays: days.size,
    days: [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, reps]) => ({ date, reps })),
  };
}
export function progressMetrics(state: JournalState): ProgressMetrics {
  const attempts = eligible(state);
  const dates = [
    ...new Set(attempts.map((attempt) => attempt.activityDate)),
  ].sort();
  let bestStreak = 0;
  let run = 0;
  let previous: string | undefined;
  for (const date of dates) {
    run = previous && shiftDay(previous, 1) === date ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    previous = date;
  }
  const dateSet = new Set(dates);
  let date = dateSet.has(state.period.today)
    ? state.period.today
    : shiftDay(state.period.today, -1);
  let currentStreak = 0;
  while (dateSet.has(date)) {
    currentStreak++;
    date = shiftDay(date, -1);
  }
  return { totalReps: attempts.length, currentStreak, bestStreak };
}
export function progressDay(
  state: JournalState,
  date: string,
): ProgressDayResponse {
  const rows = new Map<string, Attempt>();
  for (const attempt of eligible(state))
    if (attempt.activityDate === date) rows.set(attempt.id, attempt);
  const totalReps = rows.size;
  // Private journal entries carry the newest reflection text for each attempt.
  for (const entry of Object.values(state.localEntries ?? {}))
    if (entry.activityDate === date) rows.set(entry.id, entry);
  return {
    date,
    totalReps,
    entries: [...rows.values()].sort(
      (a, b) =>
        a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
    ),
    nextCursor: null,
  };
}
