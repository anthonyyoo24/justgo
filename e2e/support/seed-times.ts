/** Bounds of one local calendar day in the browser, plus the browser's now. */
export type SeedDay = { start: number; end: number; now: number };

/** Resolve calendar boundaries in the browser's local time zone. */
export function seedDay(
  offset: number | 'previous-month',
  now = Date.now(),
): SeedDay {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(offset === 'previous-month' ? 0 : start.getDate() - offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime(), now };
}

/**
 * Distinct start times, oldest first, that all fall inside one local day and
 * never in the future. Counting back a fixed minute per attempt from now
 * crossed local midnight shortly after it, splitting a seeded "today" across
 * two calendar days (hosted run 38660201918 at 00:33 UTC).
 */
export function seedStartTimes(count: number, day: SeedDay): number[] {
  const latest = Math.min(day.now, day.end - 1);
  const spacing = Math.min(60_000, Math.floor((latest - day.start) / count));
  if (spacing < 1)
    throw new Error(
      `Cannot seed ${count} distinct starts inside the selected local day`,
    );
  return Array.from(
    { length: count },
    (_, n) => latest - (count - n) * spacing,
  );
}
