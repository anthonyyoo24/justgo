import { errorTransport } from './transport';
import { diagnosticConfiguration } from './configuration';
import type { ReactNativeOptions } from '@sentry/react-native';
const config = diagnosticConfiguration(
  'true',
  `https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/4512279181459456`,
  'staging',
)!;
const build = {
  version: '0.1.0',
  os: 'ios' as const,
  osVersion: '26',
  environment: 'staging' as const,
};
type Transport = ReturnType<NonNullable<ReactNativeOptions['transport']>>;
type Envelope = Parameters<Transport['send']>[0];
const envelope = [
  { secret: 'PRIVATE', trace: { private: 'PRIVATE' } },
  [
    [{ type: 'attachment', length: 7, filename: 'PRIVATE' }, 'PRIVATE'],
    [
      { type: 'event' },
      {
        event_id: 'a'.repeat(32),
        exception: { values: [{ value: 'PRIVATE' }] },
        extra: { private: 'PRIVATE' },
      },
    ],
    [{ type: 'session' }, { private: 'PRIVATE' }],
  ],
] as unknown as Envelope;
const ok = () => Promise.resolve({ status: 200 } as Response);
afterEach(() => jest.useRealTimers());
it('sends only rebuilt error envelopes without cookies/referrer, attachments or SDK metadata', async () => {
  const send = jest.fn<Promise<Response>, Parameters<typeof fetch>>(ok);
  const transport = errorTransport(config, build, send);
  await expect(transport.send(envelope)).resolves.toEqual({ statusCode: 200 });
  const [url, options] = send.mock.calls[0]!;
  expect(url).toBe(config.endpoint);
  expect(options).toMatchObject({
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    method: 'POST',
  });
  const body = String(options?.body);
  expect(body).not.toContain('PRIVATE');
  expect(body.split('\n')).toHaveLength(3);
  expect(JSON.parse(body.split('\n')[1]!)).toEqual({ type: 'event' });
  await expect(transport.flush()).resolves.toBe(true);
});
it('rejects non-error and malformed envelopes before network work', async () => {
  const send = jest.fn(ok);
  const transport = errorTransport(config, build, send);
  for (const input of [
    [{}, []],
    [{}, [[{ type: 'event' }, { message: 'PRIVATE' }]]],
  ] as Envelope[])
    await expect(transport.send(input)).resolves.toEqual({ statusCode: 400 });
  expect(send).not.toHaveBeenCalled();
});
it('bounds concurrent sends, waits for accepted work and coalesces provider outages with a cooldown', async () => {
  const finishes: Array<(value: Response) => void> = [];
  const send = jest.fn(
    () =>
      new Promise<Response>((resolve) => {
        finishes.push(resolve);
      }),
  );
  const transport = errorTransport(config, build, send);
  const first = transport.send(envelope);
  const second = transport.send(envelope);
  const drained = transport.flush();
  await expect(transport.send(envelope)).resolves.toEqual({ statusCode: 429 });
  expect(finishes).toHaveLength(2);
  finishes.forEach((finish) => finish({ status: 200 } as Response));
  await Promise.all([first, second]);
  await expect(drained).resolves.toBe(true);
});
it('isolates thrown fetch and HTTP failures, then permits a later diagnostic', async () => {
  let now = 1;
  const send = jest
    .fn<Promise<Response>, Parameters<typeof fetch>>()
    .mockRejectedValueOnce(new Error('provider'));
  const transport = errorTransport(config, build, send, () => now);
  await expect(transport.send(envelope)).resolves.toEqual({ statusCode: 503 });
  await expect(transport.send(envelope)).resolves.toEqual({ statusCode: 429 });
  now += 60_000;
  send.mockResolvedValueOnce({ status: 429 } as Response);
  await expect(transport.send(envelope)).resolves.toEqual({ statusCode: 429 });
  now += 60_000;
  send.mockResolvedValueOnce({ status: 200 } as Response);
  await expect(transport.send(envelope)).resolves.toEqual({ statusCode: 200 });
  await expect(transport.flush()).resolves.toBe(true);
});
it('aborts stalled requests and drains without leaking timers or throwing', async () => {
  jest.useFakeTimers();
  const send: typeof fetch = (_url, options) =>
    new Promise((_resolve, reject) =>
      options?.signal?.addEventListener('abort', () =>
        reject(new Error('offline')),
      ),
    );
  const transport = errorTransport(config, build, send);
  const work = transport.send(envelope);
  const drained = transport.flush();
  await jest.advanceTimersByTimeAsync(5000);
  await expect(work).resolves.toEqual({ statusCode: 503 });
  await expect(drained).resolves.toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});
