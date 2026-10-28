import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ServerDiagnosticConfiguration } from './sentry-configuration.js';

const diagnosticSchema = z.object({
  statusCode: z.number().int().min(500).max(599),
  requestId: z.uuidv4(),
  sqlState: z
    .string()
    .length(5)
    .regex(/^[0-9A-Z]{5}$/)
    .optional(),
});

export type ServerErrorDiagnostic = Readonly<z.infer<typeof diagnosticSchema>>;
export type ServerErrorReporter = (
  diagnostic: ServerErrorDiagnostic,
) => Promise<void>;

/** Validate only the classification object, never a request or an exception. */
export function serverErrorDiagnostic(
  input: unknown,
): ServerErrorDiagnostic | null {
  const result = diagnosticSchema.safeParse(input);
  return result.success ? result.data : null;
}

const timeoutMs = 1500;
const backoffMs = 60_000;
const windowCapacity = 20;

/** Rebuild the complete event; never spread caller data or accept raw errors. */
function diagnosticEvent(
  input: ServerErrorDiagnostic,
  config: ServerDiagnosticConfiguration,
) {
  const diagnostic = serverErrorDiagnostic(input);
  if (!diagnostic) return null;
  const { statusCode, requestId, sqlState } = diagnostic;
  return {
    event_id: randomUUID().replaceAll('-', ''),
    platform: 'node',
    level: 'error',
    message: 'HTTP server failure',
    environment: config.environment,
    release: config.release,
    // Prevent ingestion from deriving an end-user address; no user identifier.
    user: { ip_address: '0.0.0.0' },
    tags: {
      code: 'HTTP_SERVER_ERROR',
      statusCode: String(statusCode),
      ...(sqlState ? { sqlState } : {}),
    },
    extra: { requestId },
    fingerprint: ['HTTP_SERVER_ERROR', String(statusCode), sqlState ?? 'none'],
  };
}

function pauseDuration(response: Response, now: number): number {
  const limits = response.headers.get('x-sentry-rate-limits');
  if (limits) {
    let duration = 0;
    // Response headers are provider input. Bound parsing, ignore unknown
    // categories, and preserve the longest applicable error/all-category limit.
    for (const limit of limits.slice(0, 4096).split(',').slice(0, 64)) {
      const [seconds, categories] = limit.trim().split(':');
      if (
        categories === undefined ||
        (categories !== '' && !categories.split(';').includes('error'))
      )
        continue;
      const value = Number(seconds);
      if (Number.isFinite(value) && value >= 0)
        duration = Math.max(duration, value * 1000);
    }
    if (duration > 0) return duration;
  }
  if (response.status !== 429)
    return response.status < 200 || response.status >= 300 ? backoffMs : 0;
  const retry = response.headers.get('retry-after')?.slice(0, 128);
  if (retry) {
    const seconds = Number(retry);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(retry);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  return backoffMs;
}

/** No SDK instrumentation, persistent queue, retries, request context or logs. */
export function createServerErrorReporter(
  config: ServerDiagnosticConfiguration | null,
  options: { send?: typeof fetch; now?: () => number } = {},
): ServerErrorReporter {
  if (!config) return async () => {};
  const send = options.send ?? fetch;
  const now = options.now ?? Date.now;
  let pending = 0;
  let pausedUntil = 0;
  let windowStart = now();
  let sentInWindow = 0;
  return async (input) => {
    // All reporter work, including injected transport failures, belongs here.
    // It must never reject into the response hook or produce recursive reports.
    try {
      const time = now();
      if (pending >= 2 || time < pausedUntil) return;
      if (time - windowStart >= backoffMs) {
        windowStart = time;
        sentInWindow = 0;
      }
      if (sentInWindow >= windowCapacity) return;
      const event = diagnosticEvent(input, config);
      if (!event) return;
      const timestamp = new Date(time).toISOString();
      const payload = JSON.stringify({ ...event, timestamp });
      const body = [
        JSON.stringify({
          event_id: event.event_id,
          dsn: config.dsn,
          sent_at: timestamp,
        }),
        JSON.stringify({ type: 'event', length: Buffer.byteLength(payload) }),
        payload,
        '',
      ].join('\n');
      pending++;
      sentInWindow++;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Race as well as abort: even a misbehaving transport cannot hold the
        // response indefinitely. Promise.race observes later rejection too.
        const deadline = new Promise<undefined>((resolve) => {
          timer = setTimeout(() => {
            resolve(undefined);
            controller.abort();
          }, timeoutMs);
        });
        const delivery = (async () => {
          const response = await send(config.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-sentry-envelope' },
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            redirect: 'error',
            body,
            signal: controller.signal,
          });
          // Do not read or retain provider response content.
          await response.body?.cancel();
          return response;
        })();
        const response = await Promise.race([delivery, deadline]);
        pausedUntil = Math.max(
          pausedUntil,
          now() + (response ? pauseDuration(response, now()) : backoffMs),
        );
      } catch {
        pausedUntil = Math.max(pausedUntil, now() + backoffMs);
      } finally {
        clearTimeout(timer);
        pending--;
      }
    } catch {
      // No raw error, request or provider response is logged or re-reported.
    }
  };
}
