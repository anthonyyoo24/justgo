import { okSchema } from '@justgo/contracts';
import { AccountClient, type SessionSource } from './account-client';
import { createHttpClient } from './http';

const token = 'a'.repeat(64);
const session: SessionSource = {
  current: () => ({ userId: 'account', token }),
  renew: jest.fn(),
  reject: jest.fn(),
};

it.each(['PATCH', 'DELETE'] as const)(
  'never transiently replays explicit %s requests, including bodyless writes',
  async (method) => {
    for (const body of [undefined, { value: 'unchanged' }]) {
      for (const failure of ['NETWORK', 'UNAVAILABLE']) {
        const fetcher = jest.fn().mockImplementation(async () => {
          if (failure === 'NETWORK') throw new Error('offline');
          return new Response(
            JSON.stringify({ code: 'UNAVAILABLE', requestId: 'test' }),
            { status: 503 },
          );
        });
        const http = createHttpClient('https://api.example.test', fetcher);
        const options = { method, ...(body ? { body } : {}) };
        await expect(
          http.request('/v1/resource', okSchema, {
            ...options,
            retryRead: true,
          }),
        ).rejects.toMatchObject({ code: failure });
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(fetcher.mock.calls[0]![1]).toMatchObject({ method });
        if (body === undefined) {
          expect(fetcher.mock.calls[0]![1].headers).not.toHaveProperty(
            'content-type',
          );
          expect(fetcher.mock.calls[0]![1]).not.toHaveProperty('body');
        }
        fetcher.mockClear();
        const client = new AccountClient(http, session);
        client.changeAccount('account');
        await expect(
          client.request('/v1/resource', okSchema, options),
        ).rejects.toMatchObject({ code: failure });
        expect(fetcher).toHaveBeenCalledTimes(1);
        client.changeAccount(null);
      }
    }
  },
);

it('continues one transient retry for explicit GET reads', async () => {
  const fetcher = jest
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
  const client = new AccountClient(
    createHttpClient('https://api.example.test', fetcher),
    session,
  );
  client.changeAccount('account');
  await expect(
    client.request('/v1/resource', okSchema, { method: 'GET' }),
  ).resolves.toEqual({ ok: true });
  expect(fetcher).toHaveBeenCalledTimes(2);
  client.changeAccount(null);
});
