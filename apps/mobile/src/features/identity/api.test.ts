import { okSchema } from '@justgo/contracts';
import { createIdentityApi } from './api';

it('sends credentials only in body/header, validates responses and never retries writes implicitly', async () => {
  const fetcher = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  await createIdentityApi('http://localhost:3000', fetcher).request(
    'POST',
    '/credentials',
    okSchema,
    { credential: 'test-secret' },
    'test-session',
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0]!;
  expect(url).toBe('http://localhost:3000/v1/credentials');
  expect(init.method).toBe('POST');
  expect(url).not.toContain('secret');
  expect(init.headers.authorization).toBe('Bearer test-session');
  expect(init.body).toContain('test-secret');
});
it('rejects insecure remote URLs and malformed server payloads', async () => {
  const fetcher = jest.fn();
  await expect(
    createIdentityApi('http://example.com', fetcher).request(
      'GET',
      '/sessions/current',
      okSchema,
    ),
  ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, token: 'should-not-exist' }),
  });
  await expect(
    createIdentityApi('https://example.com', fetcher).request(
      'GET',
      '/sessions/current',
      okSchema,
    ),
  ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
});
it('maps malformed API addresses to availability errors before sending a request', async () => {
  const fetcher = jest.fn();
  for (const address of ['not-a-url', 'https://', 'http://[broken']) {
    await expect(
      createIdentityApi(address, fetcher).request(
        'GET',
        '/sessions/current',
        okSchema,
      ),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  }
  expect(fetcher).not.toHaveBeenCalled();
});
it('normalizes transport and HTTP failures without echoing server payloads', async () => {
  const fetcher = jest
    .fn()
    .mockRejectedValue(new Error('secret-from-transport'));
  await expect(
    createIdentityApi('https://example.com', fetcher).request(
      'GET',
      '/sessions/current',
      okSchema,
    ),
  ).rejects.toMatchObject({ message: 'NETWORK' });
  fetcher.mockResolvedValue({
    ok: false,
    json: async () => ({ code: 'SESSION_REVOKED', requestId: 'server-id' }),
  });
  await expect(
    createIdentityApi('https://example.com', fetcher).request(
      'GET',
      '/sessions/current',
      okSchema,
    ),
  ).rejects.toMatchObject({ code: 'SESSION_REVOKED' });
});

it('uses bodyless DELETE for a credential resource without a JSON content type', async () => {
  const fetcher = jest
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
  await createIdentityApi('https://example.com', fetcher).request(
    'DELETE',
    '/credentials/00000000-0000-4000-8000-000000000001',
    okSchema,
    undefined,
    'test-session',
  );
  expect(fetcher).toHaveBeenCalledWith(
    'https://example.com/v1/credentials/00000000-0000-4000-8000-000000000001',
    expect.objectContaining({
      method: 'DELETE',
      headers: { authorization: 'Bearer test-session' },
    }),
  );
  expect(fetcher.mock.calls[0]![1]).not.toHaveProperty('body');
});
