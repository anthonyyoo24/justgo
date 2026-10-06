// Derive the deadline from frozen start values; never decrement a counter.
export function remainingSeconds(
  startedAt: string,
  now: number,
  durationSeconds: number,
) {
  const deadline = Date.parse(startedAt) + durationSeconds * 1000;
  return Math.min(
    durationSeconds,
    Math.max(0, Math.ceil((deadline - now) / 1000)),
  );
}
