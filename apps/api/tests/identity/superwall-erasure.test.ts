import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSuperwallErasure } from '../../src/identity/superwall-erasure.js';
import { ApiError } from '../../src/http/api-error.js';

const config = {
  apiKey: 'superwall-erasure-synthetic-key',
  applicationId: '60560',
};
const unavailable = (error: unknown) =>
  error instanceof ApiError &&
  error.code === 'UNAVAILABLE' &&
  error.status === 503;

describe('Superwall user erasure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('posts the owner ID to the documented erasure route with the server key', async () => {
    const owner = randomUUID();
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { object: 'app_user_erasure', status: 'scheduled' },
          { status: 201 },
        ),
      );
    await createSuperwallErasure(config, transport)(owner);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://api.superwall.com/v2/applications/60560/user_erasures',
    );
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('manual');
    expect(new Headers(init?.headers).get('authorization')).toBe(
      `Bearer ${config.apiKey}`,
    );
    expect(new Headers(init?.headers).get('content-type')).toBe(
      'application/json',
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      app_user_id: owner,
      acknowledge_active_subscriptions: true,
    });
    expect(timeout).toHaveBeenCalledWith(5000);
  });

  it.each([
    ['a refusal', () => Promise.resolve(new Response('no', { status: 403 }))],
    ['a conflict', () => Promise.resolve(new Response('no', { status: 409 }))],
    [
      'a server failure',
      () => Promise.resolve(new Response('no', { status: 500 })),
    ],
    [
      'a redirect',
      () =>
        Promise.resolve(
          new Response(null, {
            status: 307,
            headers: { location: 'https://elsewhere.invalid/' },
          }),
        ),
    ],
    ['a network failure', () => Promise.reject(new TypeError('offline'))],
  ])('fails as unavailable on %s without following it', async (_, answer) => {
    const transport = vi.fn<typeof fetch>().mockImplementation(answer);
    await expect(
      createSuperwallErasure(config, transport)(randomUUID()),
    ).rejects.toSatisfy(unavailable);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
