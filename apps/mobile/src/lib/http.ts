import type { z } from 'zod';
import { identityErrorSchema, type IdentityErrorCode } from '@justgo/contracts';

export type ClientErrorCode =
  | IdentityErrorCode
  | 'NETWORK'
  | 'STORAGE'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'ACCOUNT_CHANGED';
export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    readonly requestId?: string,
  ) {
    super(code);
  }
}
export type RequestOptions = {
  body?: unknown;
  token?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  retryRead?: boolean;
};
export type HttpClient = ReturnType<typeof createHttpClient>;
export function createHttpClient(
  baseUrl: string | undefined,
  fetcher: typeof fetch = fetch,
) {
  return {
    async request<T>(
      path: string,
      schema: z.ZodType<T>,
      options: RequestOptions = {},
    ): Promise<T> {
      let base: URL;
      try {
        base = new URL(baseUrl ?? '');
      } catch {
        throw new ApiError('UNAVAILABLE');
      }
      if (
        (base.protocol !== 'https:' &&
          !(
            __DEV__ &&
            base.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
          )) ||
        base.username ||
        base.password ||
        base.search ||
        base.hash ||
        !path.startsWith('/v1/') ||
        path.includes('?') ||
        path.includes('#')
      )
        throw new ApiError('UNAVAILABLE');
      const controller = new AbortController();
      let timedOut = false;
      const cancel = () => controller.abort();
      options.signal?.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(
        () => {
          timedOut = true;
          cancel();
        },
        Math.min(10_000, options.timeoutMs ?? 10_000),
      );
      const body =
        options.body === undefined ? undefined : JSON.stringify(options.body);
      const aborted = () => new ApiError(timedOut ? 'TIMEOUT' : 'CANCELLED');
      const check = () => {
        if (controller.signal.aborted || options.signal?.aborted)
          throw aborted();
      };
      // Also bounds misbehaving transports/body readers that ignore AbortSignal.
      let onAbort: () => void = () => {};
      const cancellation = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(aborted());
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      const attempt = async () => {
        check();
        try {
          const response = await fetcher(
            `${baseUrl!.replace(/\/$/, '')}${path}`,
            {
              method: body === undefined ? 'GET' : 'POST',
              signal: controller.signal,
              headers: {
                'content-type': 'application/json',
                ...(options.token
                  ? { authorization: `Bearer ${options.token}` }
                  : {}),
              },
              ...(body === undefined ? {} : { body }),
            },
          );
          const value: unknown = await response.json();
          check();
          if (!response.ok) {
            const error = identityErrorSchema.safeParse(value);
            throw new ApiError(
              error.success ? error.data.code : 'UNAVAILABLE',
              error.success ? error.data.requestId : undefined,
            );
          }
          const parsed = schema.safeParse(value);
          if (!parsed.success) throw new ApiError('UNAVAILABLE');
          return parsed.data;
        } catch (error) {
          check();
          if (error instanceof ApiError) throw error;
          throw new ApiError('NETWORK');
        }
      };
      try {
        check();
        return await Promise.race([
          cancellation,
          (async () => {
            try {
              return await attempt();
            } catch (error) {
              if (
                body !== undefined ||
                !options.retryRead ||
                !(error instanceof ApiError) ||
                !['NETWORK', 'UNAVAILABLE'].includes(error.code)
              )
                throw error;
              // One immediate replay, inside the original ten-second budget. No query-library retries.
              return attempt();
            }
          })(),
        ]);
      } finally {
        clearTimeout(timer);
        controller.signal.removeEventListener('abort', onAbort);
        options.signal?.removeEventListener('abort', cancel);
      }
    },
  };
}
