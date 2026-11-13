import { okSchema } from '@justgo/contracts';
import { AccountClient, type SessionSource } from './account-client';
import { createHttpClient, type HttpMethod } from './http';

// #449 pins the Supabase `api` function to the database's region.
const ok = () =>
  new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
const regionOf = (init: RequestInit | undefined) =>
  new Headers(init?.headers).get('x-region');

const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const cases = methods.flatMap((method) =>
  [undefined, { value: 'body' }].flatMap((body) =>
    [undefined, 'a'.repeat(64)].map((token) => ({ method, body, token })),
  ),
);

it.each(cases)(
  'pins $method requests to ca-central-1 (body: $body, token: $token)',
  async ({ method, body, token }) => {
    const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () => ok(),
    );
    const http = createHttpClient(
      'https://api.example.test/functions/v1/api',
      fetcher,
    );
    await expect(
      http.request('/v1/resource', okSchema, {
        method,
        ...(body ? { body } : {}),
        ...(token ? { token } : {}),
      }),
    ).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const init = fetcher.mock.calls[0]![1];
    expect(regionOf(init)).toBe('ca-central-1');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe(token ? `Bearer ${token}` : null);
    expect(headers.get('content-type')).toBe(body ? 'application/json' : null);
  },
);

it('pins the replayed read and the renewed request as well as the first', async () => {
  const fetcher = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(ok());
  const http = createHttpClient('https://api.example.test', fetcher);
  await http.request('/v1/resource', okSchema, { retryRead: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
  for (const [, init] of fetcher.mock.calls)
    expect(regionOf(init)).toBe('ca-central-1');

  let token = 'old-token';
  const session: SessionSource = {
    current: () => ({ userId: 'account', token }),
    renew: jest.fn(async () => {
      token = 'new-token';
      return { userId: 'account', token };
    }),
    reject: jest.fn(),
  };
  fetcher.mockReset();
  fetcher
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 'SESSION_EXPIRED', requestId: 'test' }),
        { headers: { 'Content-Type': 'application/json' }, status: 401 },
      ),
    )
    .mockResolvedValueOnce(ok());
  const client = new AccountClient(http, session);
  client.changeAccount('account');
  await expect(client.request('/v1/resource', okSchema)).resolves.toEqual({
    ok: true,
  });
  client.changeAccount(null);
  expect(session.renew).toHaveBeenCalledWith('old-token');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(
    fetcher.mock.calls.map(([, init]) => [
      new Headers(init?.headers).get('authorization'),
      regionOf(init),
    ]),
  ).toEqual([
    ['Bearer old-token', 'ca-central-1'],
    ['Bearer new-token', 'ca-central-1'],
  ]);
});
