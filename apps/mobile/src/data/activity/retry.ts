// One immediate send, two short retries, then sparse foreground opportunities.
export const SHORT_RETRY_MS = [2_000, 5_000] as const;
export const SPARSE_RETRY_BASE_MS = 30_000;
export const SPARSE_RETRY_CAP_MS = 300_000;
export function sparseRetryDelay(
  exponent: number,
  random: () => number,
): number {
  return Math.min(
    SPARSE_RETRY_CAP_MS,
    Math.round(
      Math.min(
        SPARSE_RETRY_CAP_MS,
        SPARSE_RETRY_BASE_MS * 2 ** Math.min(exponent, 5),
      ) *
        (0.8 + Math.max(0, Math.min(1, random())) * 0.4),
    ),
  );
}
