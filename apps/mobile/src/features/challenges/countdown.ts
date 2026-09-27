// A deadline, never a decremented counter: background time and zero remain correct.
export function remainingSeconds(
  deadline: string,
  now: number,
  durationSeconds: number,
) {
  return Math.min(
    durationSeconds,
    Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)),
  );
}
