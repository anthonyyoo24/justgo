import { afterEach, describe, expect, it, vi } from 'vitest';
import { serverDiagnosticConfiguration } from '../../src/http/sentry-configuration.js';
import {
  createServerErrorReporter,
  type ServerErrorDiagnostic,
} from '../../src/http/server-error-reporter.js';

const dsn = `https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/4512345678901234`;
const config = serverDiagnosticConfiguration(
  true,
  dsn,
  'b'.repeat(40),
  'staging',
)!;
const diagnostic = {
  statusCode: 503,
  requestId: 'a8bcb93b-c662-4119-80ac-3fc9775d5082',
  sqlState: '08006',
} as const;

afterEach(() => vi.useRealTimers());

describe('minimal API error delivery', () => {
  it('does no network work while disabled', async () => {
    const send = vi.fn<typeof fetch>();
    await expect(
      createServerErrorReporter(null, { send })(diagnostic),
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('rebuilds an authenticated single-event envelope with no private context', async () => {
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('provider-private'));
    const now = () => 1_800_000_000_000;
    const reporter = createServerErrorReporter(config, { send, now });
    await reporter(
      Object.assign({}, diagnostic, {
        message: 'private',
        stack: 'private',
        request: { url: 'private', body: 'private', headers: 'private' },
        user: { id: 'private', ip_address: 'private' },
        sql: 'private',
        device: 'private',
        toJSON: () => ({ secret: 'private' }),
      }),
    );
    expect(send).toHaveBeenCalledOnce();
    const [endpoint, options] = send.mock.calls[0]!;
    expect(endpoint).toBe(config.endpoint);
    expect(options).toEqual({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      body: expect.any(String),
      signal: expect.any(AbortSignal),
    });
    const lines = String(options!.body).split('\n');
    expect(lines).toHaveLength(4);
    const [envelope, item, event] = lines
      .slice(0, 3)
      .map((line) => JSON.parse(line));
    expect(event.event_id).toMatch(/^[a-f0-9]{32}$/);
    expect(envelope).toEqual({
      event_id: event.event_id,
      dsn,
      sent_at: '2027-01-15T08:00:00.000Z',
    });
    expect(item).toEqual({
      type: 'event',
      length: Buffer.byteLength(lines[2]!),
    });
    expect(event).toEqual({
      event_id: expect.any(String),
      timestamp: envelope.sent_at,
      platform: 'node',
      level: 'error',
      message: 'HTTP server failure',
      environment: 'staging',
      release: `justgo-api@${'b'.repeat(40)}`,
      user: { ip_address: '0.0.0.0' },
      tags: { code: 'HTTP_SERVER_ERROR', statusCode: '503', sqlState: '08006' },
      extra: { requestId: diagnostic.requestId },
      fingerprint: ['HTTP_SERVER_ERROR', '503', '08006'],
    });
    expect(options!.body).not.toContain('private');
  });

  it.each([500, 502, 503, 599])(
    'accepts server status %s without a SQLSTATE',
    async (statusCode) => {
      const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
      await createServerErrorReporter(config, { send })({
        statusCode,
        requestId: diagnostic.requestId,
      });
      const event = JSON.parse(
        String(send.mock.calls[0]![1]!.body).split('\n')[2]!,
      );
      expect(event.tags).toEqual({
        code: 'HTTP_SERVER_ERROR',
        statusCode: String(statusCode),
      });
      expect(event.fingerprint).toEqual([
        'HTTP_SERVER_ERROR',
        String(statusCode),
        'none',
      ]);
    },
  );

  it.each([
    { ...diagnostic, statusCode: 499 },
    { ...diagnostic, statusCode: 600 },
    { ...diagnostic, statusCode: 500.5 },
    { ...diagnostic, requestId: 'private' },
    { ...diagnostic, sqlState: 'private' },
    { ...diagnostic, sqlState: 'abcde' },
    { ...diagnostic, sqlState: '23505\n' },
  ])('drops malformed classification before transport', async (input) => {
    const send = vi.fn<typeof fetch>();
    await createServerErrorReporter(config, { send })(
      input as ServerErrorDiagnostic,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('bounds simultaneous delivery without queuing dropped events', async () => {
    let release: (response: Response) => void = () => {};
    const waiting = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const send = vi.fn<typeof fetch>().mockReturnValue(waiting);
    const reporter = createServerErrorReporter(config, { send });
    const first = reporter(diagnostic);
    const second = reporter(diagnostic);
    await reporter(diagnostic);
    expect(send).toHaveBeenCalledTimes(2);
    release(new Response(null));
    await Promise.all([first, second]);
    await reporter(diagnostic);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('bounds successful per-instance event volume and starts a new window', async () => {
    let time = 1_800_000_000_000;
    const send = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(null));
    const reporter = createServerErrorReporter(config, {
      send,
      now: () => time,
    });
    for (let index = 0; index < 25; index++) await reporter(diagnostic);
    expect(send).toHaveBeenCalledTimes(20);
    time += 60_000;
    await reporter(diagnostic);
    expect(send).toHaveBeenCalledTimes(21);
  });

  it.each([301, 400, 401, 403, 429, 500, 503])(
    'backs off for failed status %s without retries',
    async (status) => {
      let time = 1_800_000_000_000;
      const send = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => new Response(null, { status }));
      const reporter = createServerErrorReporter(config, {
        send,
        now: () => time,
      });
      await reporter(diagnostic);
      time += 59_999;
      await reporter(diagnostic);
      expect(send).toHaveBeenCalledOnce();
      time++;
      await reporter(diagnostic);
      expect(send).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    { status: 429, headers: { 'retry-after': '120' }, wait: 120_000 },
    {
      status: 429,
      headers: { 'retry-after': 'Fri, 15 Jan 2027 08:02:00 GMT' },
      wait: 120_000,
    },
    {
      status: 200,
      headers: {
        'x-sentry-rate-limits':
          '60:transaction:key, 120:error;unknown:organization, 90::key',
      },
      wait: 120_000,
    },
    { status: 429, headers: { 'retry-after': 'private' }, wait: 60_000 },
  ])(
    'honors provider throttling $headers',
    async ({ status, headers, wait }) => {
      let time = 1_800_000_000_000;
      const send = vi
        .fn<typeof fetch>()
        .mockImplementation(
          async () => new Response(null, { status, headers }),
        );
      const reporter = createServerErrorReporter(config, {
        send,
        now: () => time,
      });
      await reporter(diagnostic);
      time += wait - 1;
      await reporter(diagnostic);
      expect(send).toHaveBeenCalledOnce();
      time++;
      await reporter(diagnostic);
      expect(send).toHaveBeenCalledTimes(2);
    },
  );

  it('ignores unrelated rate limits and catches synchronous or asynchronous transport failures', async () => {
    let time = 1_800_000_000_000;
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: {
            'x-sentry-rate-limits': '120:transaction:key, private:error:key',
          },
        }),
      )
      .mockImplementationOnce(() => {
        throw new Error('private');
      })
      .mockRejectedValueOnce(new Error('private'))
      .mockResolvedValue(new Response(null));
    const reporter = createServerErrorReporter(config, {
      send,
      now: () => time,
    });
    await expect(reporter(diagnostic)).resolves.toBeUndefined();
    await expect(reporter(diagnostic)).resolves.toBeUndefined();
    await reporter(diagnostic);
    expect(send).toHaveBeenCalledTimes(2);
    time += 60_000;
    await expect(reporter(diagnostic)).resolves.toBeUndefined();
    time += 60_000;
    await reporter(diagnostic);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('aborts at 1.5 seconds and resolves even if transport ignores abort or rejects later', async () => {
    vi.useFakeTimers();
    let reject: (error: Error) => void = () => {};
    const send = vi.fn<typeof fetch>().mockReturnValue(
      new Promise((_resolve, rejectWork) => {
        reject = rejectWork;
      }),
    );
    const reporter = createServerErrorReporter(config, { send });
    const pending = reporter(diagnostic);
    await vi.advanceTimersByTimeAsync(1499);
    expect(send.mock.calls[0]![1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBeUndefined();
    expect(send.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    reject(new Error('private late failure'));
    await Promise.resolve();
    await reporter(diagnostic);
    expect(send).toHaveBeenCalledOnce();
  });
});
