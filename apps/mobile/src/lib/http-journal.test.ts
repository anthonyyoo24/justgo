import { attemptResultSchema, okSchema } from '@justgo/contracts';
import { attempt } from '../../test-support/journal';
import { createHttpClient } from './http';

it('preserves the validated canonical reflection conflict and retry header without replaying PATCH', async () => {
  const canonical = {
    ...attempt(),
    reflection: { feeling: null, text: 'Backend fixture', revision: 3 },
  };
  const fetcher = jest.fn(
    async () =>
      new Response(
        JSON.stringify({
          code: 'REFLECTION_CONFLICT',
          requestId: 'safe-id',
          currentAttempt: canonical,
        }),
        { status: 409, headers: { 'Retry-After': '12' } },
      ),
  );
  await expect(
    createHttpClient('https://api.example.test', fetcher).request(
      '/v1/attempts/test',
      attemptResultSchema,
      { method: 'PATCH', body: { test: true }, retryRead: true },
    ),
  ).rejects.toMatchObject({
    code: 'REFLECTION_CONFLICT',
    requestId: 'safe-id',
    currentAttempt: canonical,
    retryAfterMs: 12000,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  'INVALID_REQUEST',
  'REQUEST_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'ATTEMPT_INELIGIBLE',
  'SESSION_REVOKED',
])('does not replay permanent/auth %s errors', async (code) => {
  const fetcher = jest.fn(
    async () =>
      new Response(JSON.stringify({ code, requestId: 'fixture' }), {
        status: 400,
      }),
  );
  await expect(
    createHttpClient('https://api.example.test', fetcher).request(
      '/v1/attempts',
      okSchema,
      { method: 'POST', body: {} },
    ),
  ).rejects.toMatchObject({ code });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects malformed conflict data instead of consuming an unvalidated attempt', async () => {
  const fetcher = jest.fn(
    async () =>
      new Response(
        JSON.stringify({
          code: 'REFLECTION_CONFLICT',
          requestId: 'fixture',
          currentAttempt: { ...attempt(), activityDate: 'invalid' },
        }),
        { status: 409 },
      ),
  );
  await expect(
    createHttpClient('https://api.example.test', fetcher).request(
      '/v1/attempts/test',
      okSchema,
      { method: 'PATCH' },
    ),
  ).rejects.toMatchObject({ code: 'UNAVAILABLE', currentAttempt: undefined });
});
it.each(['garbage', '-2', 'Infinity'])(
  'ignores invalid Retry-After %s',
  async (header) => {
    const fetcher = jest.fn(
      async () =>
        new Response(
          JSON.stringify({ code: 'RATE_LIMITED', requestId: 'fixture' }),
          { status: 429, headers: { 'Retry-After': header } },
        ),
    );
    await expect(
      createHttpClient('https://api.example.test', fetcher).request(
        '/v1/attempts',
        okSchema,
        { method: 'POST' },
      ),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterMs: undefined });
  },
);
it('preserves an HTTP-date Retry-After as a remaining delay', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-10-05T14:00:00Z'));
  try {
    const fetcher = jest.fn(
      async () =>
        new Response(
          JSON.stringify({ code: 'RATE_LIMITED', requestId: 'fixture' }),
          {
            status: 429,
            headers: { 'Retry-After': 'Mon, 05 Oct 2026 14:01:00 GMT' },
          },
        ),
    );
    await expect(
      createHttpClient('https://api.example.test', fetcher).request(
        '/v1/attempts',
        okSchema,
        { method: 'POST' },
      ),
    ).rejects.toMatchObject({ retryAfterMs: 60000 });
  } finally {
    jest.useRealTimers();
  }
});
