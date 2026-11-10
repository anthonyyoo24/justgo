import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/http/api-error.js';
import { outboundFetch } from '../../src/http/outbound-fetch.js';

function trackedResponse(status: number) {
  const body = { reads: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        body.reads += 1;
        controller.enqueue(new TextEncoder().encode('private body'));
        controller.close();
      },
      cancel() {
        body.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const headers = { location: 'https://elsewhere.invalid/collect' };
  return { body, response: new Response(stream, { status, headers }) };
}

describe('outboundFetch', () => {
  it.each([300, 301, 302, 303, 307, 308, 399])(
    'fails a %i as UNAVAILABLE and cancels its body unread',
    async (status) => {
      const { body, response } = trackedResponse(status);
      const send = outboundFetch(
        vi.fn<typeof fetch>().mockResolvedValue(response),
      );
      const failure = await send('https://auth.invalid/user').then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(ApiError);
      expect(failure).toMatchObject({ code: 'UNAVAILABLE', status: 503 });
      expect(body).toEqual({ reads: 0, cancelled: true });
    },
  );

  it('fails a 3xx with no body as UNAVAILABLE', async () => {
    const send = outboundFetch(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 302 })),
    );
    await expect(send('https://auth.invalid/user')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      status: 503,
    });
  });

  it.each([200, 299, 400, 404, 500])(
    'returns a %i to the caller with its body unread',
    async (status) => {
      const { body, response } = trackedResponse(status);
      const send = outboundFetch(
        vi.fn<typeof fetch>().mockResolvedValue(response),
      );
      await expect(send('https://auth.invalid/user')).resolves.toBe(response);
      expect(body).toEqual({ reads: 0, cancelled: false });
    },
  );

  it("overrides the caller's redirect mode with manual and keeps the rest of the request", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const headers = { apikey: 'synthetic-key' };
    await outboundFetch(transport)('https://auth.invalid/admin/users/1', {
      method: 'DELETE',
      headers,
      redirect: 'follow',
    });
    expect(transport).toHaveBeenCalledWith(
      'https://auth.invalid/admin/users/1',
      {
        method: 'DELETE',
        headers,
        redirect: 'manual',
      },
    );
  });
});
