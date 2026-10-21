import type {
  Attempt,
  ProgressCalendar,
  ProgressDayResponse,
} from '@justgo/contracts';
import type { JournalState } from '../model';

export type ProgressMetrics = {
  totalReps: number;
  currentStreak: number | null;
  bestStreak: number | null;
};
// Older-month snapshots live only in QueryClient. Their generation prevents a
// previously viewed month from showing a count known to predate local activity.
export type CalendarRead = ProgressCalendar & { generation?: number };
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
const eligible = (state: JournalState, ids: string[]) =>
  ids.flatMap((id) => {
    const record = state.journal.records[id];
    return record && !record.rejected ? [record.attempt] : [];
  });
export function currentCalendar(
  state: JournalState,
): ProgressCalendar | undefined {
  const cached = state.journal.calendarBaseline ?? state.journal.calendar;
  return cached?.data.month === state.period.today.slice(0, 7) &&
    cached.timeZone === state.period.timeZone
    ? cached.data
    : undefined;
}
export function progressCalendar(
  state: JournalState,
  month: string,
  remote?: CalendarRead,
): ProgressCalendar | undefined {
  if (state.dataMode && state.dataMode !== 'legacy') {
    const days = new Map<string, number>();
    for (const attempt of eligible(state, Object.keys(state.journal.records)))
      if (attempt.activityDate.slice(0, 7) === month)
        days.set(
          attempt.activityDate,
          (days.get(attempt.activityDate) ?? 0) + 1,
        );
    return {
      month,
      monthlyReps: [...days.values()].reduce((sum, count) => sum + count, 0),
      activeDays: days.size,
      days: [...days]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, reps]) => ({ date, reps })),
    };
  }
  const baseline =
    month === state.period.today.slice(0, 7)
      ? currentCalendar(state)
      : state.online &&
          (remote?.generation === undefined ||
            remote.generation === state.journal.generation)
        ? remote
        : undefined;
  if (!baseline) return undefined;
  const days = new Map(baseline.days.map((day) => [day.date, day.reps]));
  // An older-month response already includes confirmed rows. Only current-period
  // baselines retain the explicit not-yet-covered addition set.
  if (month === state.period.today.slice(0, 7))
    for (const attempt of eligible(state, state.journal.calendarAdditions)) {
      if (attempt.activityDate.slice(0, 7) === month)
        days.set(
          attempt.activityDate,
          (days.get(attempt.activityDate) ?? 0) + 1,
        );
    }
  return {
    month,
    monthlyReps: [...days.values()].reduce((sum, count) => sum + count, 0),
    activeDays: days.size,
    days: [...days]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, reps]) => ({ date, reps })),
  };
}
export function progressMetrics(
  state: JournalState,
): ProgressMetrics | undefined {
  if (state.dataMode && state.dataMode !== 'legacy') {
    const attempts = eligible(state, Object.keys(state.journal.records));
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
  const summary = state.journal.summary;
  if (!summary) return undefined;
  const additions = eligible(state, state.journal.summaryAdditions);
  const totalReps = summary.totalReps + additions.length;
  const month = state.period.today.slice(0, 7);
  const calendar = progressCalendar(state, month);
  const missingContext =
    summary.timeZone !== state.period.timeZone ||
    !calendar ||
    summary.streakContext.month !== month ||
    additions.some((a) => a.activityDate.slice(0, 7) < month);
  if (missingContext) {
    // Rejection may undo a locally extended run. Without its date context, a
    // verified historical figure is no longer an exact corrected streak.
    const corrected = Object.values(state.journal.records).some(
      (r) => r.rejected,
    );
    return {
      totalReps,
      currentStreak: corrected ? null : summary.currentStreak,
      bestStreak: corrected ? null : summary.bestStreak,
    };
  }
  const dates = new Set(calendar.days.map((day) => day.date));
  let run = summary.streakContext.precedingRun;
  let bestStreak = summary.streakContext.bestBeforeMonth;
  let currentStreak = 0;
  let date = `${month}-01`;
  const last = [...dates].sort().at(-1);
  // Frozen dates can be ahead of this time zone's today. They retain all-time
  // and best-streak credit but cannot reset the run ending today/yesterday.
  const end = last && last > state.period.today ? last : state.period.today;
  for (; date <= end; date = shiftDay(date, 1)) {
    run = dates.has(date) ? run + 1 : 0;
    bestStreak = Math.max(bestStreak, run);
    if (
      date === shiftDay(state.period.today, -1) ||
      date === state.period.today
    )
      currentStreak = Math.max(currentStreak, run);
  }
  // On the first day of a month, yesterday's run lives in compact context.
  if (state.period.today === `${month}-01`)
    currentStreak = Math.max(currentStreak, summary.streakContext.precedingRun);
  return { totalReps, currentStreak, bestStreak };
}
export function progressDay(
  state: JournalState,
  date: string,
  remote?: ProgressDayResponse,
): (ProgressDayResponse & { repCountKnown: boolean }) | undefined {
  const isToday = date === state.period.today;
  const durableHistory = state.dataMode && state.dataMode !== 'legacy';
  const localEntries = Object.values(state.localEntries ?? {}).filter(
    (entry) => entry.activityDate === date,
  );
  if (!durableHistory && !isToday && !state.online && !localEntries.length)
    return undefined;
  const cached = state.journal.today;
  const baseline =
    isToday &&
    cached?.data.date === date &&
    cached.timeZone === state.period.timeZone
      ? cached.data
      : state.online
        ? remote
        : undefined;
  const rows = new Map<string, Attempt>(
    baseline?.entries.map((a) => [a.id, a]) ?? [],
  );
  for (const record of Object.values(state.journal.records)) {
    if (record.attempt.activityDate !== date) continue;
    if (record.rejected) {
      rows.delete(record.attempt.id);
      continue;
    }
    const old = rows.get(record.attempt.id);
    if (
      !old ||
      record.serverVersion < record.version ||
      (record.attempt.reflection?.revision ?? 0) >=
        (old.reflection?.revision ?? 0)
    )
      rows.set(
        record.attempt.id,
        old
          ? { ...old, reflection: record.attempt.reflection }
          : record.attempt,
      );
  }
  for (const entry of localEntries) rows.set(entry.id, entry);
  if (!durableHistory && !baseline && !rows.size) return undefined;
  const calendar = progressCalendar(state, date.slice(0, 7));
  const completionCount = Object.values(state.journal.records).filter(
    (record) => !record.rejected && record.attempt.activityDate === date,
  ).length;
  return {
    date,
    // Restored journal entries do not establish a completion count. Keep count
    // provenance local to this projection so the UI can distinguish unknown
    // from a known zero without changing completion/API arithmetic.
    repCountKnown: !!baseline || !!calendar || completionCount > 0,
    totalReps: Math.max(
      completionCount,
      calendar?.days.find((d) => d.date === date)?.reps ??
        baseline?.totalReps ??
        0,
    ),
    entries: [...rows.values()].sort(
      (a, b) =>
        a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
    ),
    nextCursor: baseline?.nextCursor ?? null,
  };
}
