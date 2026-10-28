import { okSchema } from '@justgo/contracts';
import { ApiError, createHttpClient } from './http';

const jsonResponse = (mediaType = 'application/json') =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': mediaType },
  });

it.each([
  'localhost',
  '127.0.0.1',
  '[::1]',
  '10.0.0.101',
  '172.16.0.1',
  '172.31.255.254',
  '192.168.1.2',
])('allows development HTTP access to local host %s', async (host) => {
  const fetcher = jest.fn().mockResolvedValue(jsonResponse());
  await expect(
    createHttpClient(`http://${host}:3000`, fetcher).request(
      '/v1/guest/access',
      okSchema,
    ),
  ).resolves.toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledWith(
    `http://${host}:3000/v1/guest/access`,
    expect.objectContaining({ method: 'GET' }),
  );
});

it.each([
  '8.8.8.8',
  '172.15.255.255',
  '172.32.0.1',
  '192.169.1.2',
  '169.254.1.2',
  '10.0.0.101.example.test',
])('keeps development HTTP closed for nonlocal host %s', async (host) => {
  const fetcher = jest.fn();
  await expect(
    createHttpClient(`http://${host}:3000`, fetcher).request(
      '/v1/guest/access',
      okSchema,
    ),
  ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each(['localhost', '127.0.0.1', '[::1]', '10.0.0.101', '192.168.1.2'])(
  'requires HTTPS for %s in release builds',
  async (host) => {
    const original = __DEV__;
    Object.defineProperty(globalThis, '__DEV__', { value: false });
    const fetcher = jest.fn();
    try {
      await expect(
        createHttpClient(`http://${host}:3000`, fetcher).request(
          '/v1/guest/access',
          okSchema,
        ),
      ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, '__DEV__', { value: original });
    }
  },
);

it.each([
  {
    base: 'https://API.EXAMPLE.TEST:443/prefix/',
    path: '/v1/progress?timeZone=America%2FToronto',
    expected: 'https://api.example.test/v1/progress?timeZone=America%2FToronto',
  },
  {
    base: 'https://api.example.test/prefix/../gateway/',
    path: '/v1/challenges/../sessions/current',
    expected: 'https://api.example.test/v1/sessions/current',
  },
])(
  'fetches the exact admitted canonical URL ($expected)',
  async ({ base, path, expected }) => {
    const fetcher = jest.fn().mockResolvedValue(jsonResponse());
    await expect(
      createHttpClient(base, fetcher).request(path, okSchema),
    ).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith(
      expected,
      expect.objectContaining({ method: 'GET' }),
    );
  },
);

it.each(['https://[invalid-target', '//[invalid-target'])(
  'normalizes an invalid target URL without fetching or exposing it',
  async (path) => {
    const fetcher = jest.fn();
    const pending = createHttpClient(
      'https://api.example.test',
      fetcher,
    ).request(path, okSchema);
    await expect(pending).rejects.toBeInstanceOf(ApiError);
    await expect(pending).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'UNAVAILABLE',
    });
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it.each([
  ['http://api.example.test', '/v1/test'],
  ['https://synthetic:credential@api.example.test', '/v1/test'],
  ['https://api.example.test?synthetic=value', '/v1/test'],
  ['https://api.example.test#synthetic', '/v1/test'],
  ['https://api.example.test', 'https://other.example.test/v1/test'],
  ['https://api.example.test', '/v1/../../outside'],
  ['https://api.example.test', '/v1/test#synthetic'],
] as const)(
  'preserves API admission guards for %s and %s',
  async (base, path) => {
    const fetcher = jest.fn();
    await expect(
      createHttpClient(base, fetcher).request(path, okSchema),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it.each([
  'application/json',
  'Application/JSON; Charset=UTF-8',
  'application/problem+json',
  'APPLICATION/VND.JUSTGO+JSON; charset=utf-8',
])('accepts JSON media type %s', async (mediaType) => {
  const fetcher = jest.fn().mockResolvedValue(jsonResponse(mediaType));
  await expect(
    createHttpClient('https://api.example.test', fetcher).request(
      '/v1/test',
      okSchema,
    ),
  ).resolves.toEqual({ ok: true });
});

it.each([
  'text/plain',
  'text/json',
  'application/jsonp',
  'application/problem+xml',
  undefined,
])(
  'rejects a JSON-looking success with non-JSON media type %s before reading the body',
  async (mediaType) => {
    const response = jsonResponse(mediaType);
    if (mediaType === undefined) response.headers.delete('Content-Type');
    const read = jest.spyOn(response, 'json');
    const fetcher = jest.fn().mockResolvedValue(response);
    await expect(
      createHttpClient('https://api.example.test', fetcher).request(
        '/v1/test',
        okSchema,
      ),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(read).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it.each([
  {
    status: 503,
    mediaType: 'text/html',
    body: '<html>Synthetic edge failure</html>',
  },
  {
    status: 200,
    mediaType: 'text/html',
    body: '<html>Synthetic proxy page</html>',
  },
  {
    status: 429,
    mediaType: 'application/json',
    body: 'Synthetic invalid JSON',
  },
  { status: 200, mediaType: 'application/json', body: '{"ok":' },
])(
  'classifies HTTP $status $mediaType protocol failure as unavailable without trusting Retry-After',
  async ({ status, mediaType, body }) => {
    const response = new Response(body, {
      status,
      headers: { 'Content-Type': mediaType, 'Retry-After': '23' },
    });
    const fetcher = jest.fn().mockResolvedValue(response);
    await expect(
      createHttpClient('https://api.example.test', fetcher).request(
        '/v1/test',
        okSchema,
        { method: 'POST' },
      ),
    ).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      message: 'UNAVAILABLE',
      retryAfterMs: undefined,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

it('keeps a rejected fetch distinct from a rejected response-body read', async () => {
  const response = jsonResponse();
  jest
    .spyOn(response, 'json')
    .mockRejectedValue(new TypeError('Synthetic body failure'));
  const bodyFailure = jest.fn().mockResolvedValue(response);
  await expect(
    createHttpClient('https://api.example.test', bodyFailure).request(
      '/v1/test',
      okSchema,
    ),
  ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  const transportFailure = jest
    .fn()
    .mockRejectedValue(new SyntaxError('Synthetic transport failure'));
  await expect(
    createHttpClient('https://api.example.test', transportFailure).request(
      '/v1/test',
      okSchema,
    ),
  ).rejects.toMatchObject({ code: 'NETWORK' });
});

it('uses at most one GET replay for a protocol failure', async () => {
  const fetcher = jest.fn<Promise<Response>, Parameters<typeof fetch>>(
    async () =>
      new Response('<html>Synthetic edge failure</html>', {
        status: 503,
        headers: { 'Content-Type': 'text/html' },
      }),
  );
  const client = createHttpClient('https://api.example.test', fetcher);
  await expect(
    client.request('/v1/test', okSchema, { retryRead: true }),
  ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[0]![1]!.signal).toBe(
    fetcher.mock.calls[1]![1]!.signal,
  );
});

it('recovers through the single permitted GET replay after a malformed response', async () => {
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(
      new Response('{', {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    .mockResolvedValueOnce(jsonResponse());
  await expect(
    createHttpClient('https://api.example.test', fetcher).request(
      '/v1/test',
      okSchema,
      { retryRead: true },
    ),
  ).resolves.toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('keeps body parsing and the protocol-failure replay inside the original deadline', async () => {
  jest.useFakeTimers();
  try {
    const response = jsonResponse();
    jest.spyOn(response, 'json').mockImplementation(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 80));
      throw new SyntaxError('Synthetic malformed response');
    });
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(response)
      .mockImplementationOnce(() => new Promise(() => {}));
    const pending = createHttpClient(
      'https://api.example.test',
      fetcher,
    ).request('/v1/test', okSchema, { retryRead: true, timeoutMs: 100 });
    const assertion = expect(pending).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    await jest.advanceTimersByTimeAsync(80);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(21);
    await assertion;
    expect(fetcher.mock.calls[0]![1].signal).toBe(
      fetcher.mock.calls[1]![1].signal,
    );
    expect(fetcher.mock.calls[1]![1].signal.aborted).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

it('lets cancellation win over a late body failure without replaying', async () => {
  const response = jsonResponse();
  let rejectBody!: (error: Error) => void;
  jest.spyOn(response, 'json').mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectBody = reject;
      }),
  );
  const fetcher = jest.fn().mockResolvedValue(response);
  const controller = new AbortController();
  const pending = createHttpClient('https://api.example.test', fetcher).request(
    '/v1/test',
    okSchema,
    { signal: controller.signal, retryRead: true },
  );
  const assertion = expect(pending).rejects.toMatchObject({
    code: 'CANCELLED',
  });
  await Promise.resolve();
  controller.abort();
  rejectBody(new SyntaxError('Synthetic late body failure'));
  await assertion;
  expect(fetcher).toHaveBeenCalledTimes(1);
});
