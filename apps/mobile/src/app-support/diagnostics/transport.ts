import type { ReactNativeOptions } from '@sentry/react-native';
import type { DiagnosticConfiguration } from './configuration';
import { diagnosticEvent, type DiagnosticBuild } from './event';

type Transport = ReturnType<NonNullable<ReactNativeOptions['transport']>>;
/** No persistent JS queue or retries; outages cannot retain account-context work. */
export function errorTransport(
  config: DiagnosticConfiguration,
  build: DiagnosticBuild,
  send: typeof fetch = fetch,
  now: () => number = Date.now,
): Transport {
  const pending = new Set<Promise<{ statusCode: number }>>();
  let pausedUntil = 0;
  return {
    send(envelope) {
      if (pending.size >= 2 || now() < pausedUntil)
        return Promise.resolve({ statusCode: 429 });
      // The last boundary also discards attachments, logs, sessions, replay and traces.
      const input = envelope[1].find(
        ([header]) => header.type === 'event',
      )?.[1];
      const event = diagnosticEvent(input, build);
      if (!event?.event_id) return Promise.resolve({ statusCode: 400 });
      const body = [
        JSON.stringify({ event_id: event.event_id, dsn: config.dsn }),
        JSON.stringify({ type: 'event' }),
        JSON.stringify(event),
      ].join('\n');
      const request = new AbortController();
      const timeout = setTimeout(() => request.abort(), 5000);
      const work = (async () => {
        try {
          const response = await send(config.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-sentry-envelope' },
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            body,
            signal: request.signal,
          });
          if (response.status === 429 || response.status >= 500)
            pausedUntil = now() + 60_000;
          return { statusCode: response.status };
        } catch {
          pausedUntil = now() + 60_000;
          return { statusCode: 503 };
        } finally {
          clearTimeout(timeout);
        }
      })();
      pending.add(work);
      void work.then(() => pending.delete(work)); // work converts every transport failure to a status.
      return work;
    },
    async flush() {
      await Promise.all(pending);
      return true;
    },
  };
}
