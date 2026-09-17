import {
  healthResponseSchema,
  readinessResponseSchema,
} from '@justgo/contracts';

export type ConnectionResult =
  'ready' | 'database-unavailable' | 'unavailable' | 'unconfigured';

// Temporary foundation smoke probe; the authenticated shared API client belongs to phase 03.
export async function checkConnection(
  baseUrl: string | undefined,
  signal?: AbortSignal,
): Promise<ConnectionResult> {
  if (!baseUrl) return 'unconfigured';
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(abort, 8000);
  try {
    const base = baseUrl.replace(/\/$/, '');
    const health = await fetch(`${base}/health`, { signal: controller.signal });
    if (
      !health.ok ||
      !healthResponseSchema.safeParse(await health.json()).success
    )
      return 'unavailable';
    const readiness = await fetch(`${base}/ready`, {
      signal: controller.signal,
    });
    const parsed = readinessResponseSchema.safeParse(await readiness.json());
    return readiness.ok && parsed.success && parsed.data.status === 'ready'
      ? 'ready'
      : 'database-unavailable';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
