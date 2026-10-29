import type { ApiApp } from '../src/http/request.js';

type RequestOptions = {
  url: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  payload?: unknown;
  remoteAddress?: string;
};
/** Exercise Hono's Fetch boundary while retaining existing protocol assertions. */
export async function apiRequest(
  app: ApiApp,
  options: string | RequestOptions,
) {
  const input = typeof options === 'string' ? { url: options } : options;
  const headers = new Headers();
  for (const [name, value] of Object.entries(input.headers ?? {}))
    if (value !== undefined)
      headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  let body: string | undefined;
  if (input.payload !== undefined) {
    if (typeof input.payload === 'string') body = input.payload;
    else {
      body = JSON.stringify(input.payload);
      if (!headers.has('content-type'))
        headers.set('content-type', 'application/json');
    }
  }
  const response = await app.request(
    input.url,
    {
      method: input.method ?? 'GET',
      headers,
      ...(body === undefined ? {} : { body }),
    },
    {
      incoming: {
        socket: { remoteAddress: input.remoteAddress ?? '127.0.0.1' },
      },
    },
  );
  const text = await response.text();
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    body: text,
    json: <T = Record<string, unknown>>(): T => JSON.parse(text) as T,
  };
}
