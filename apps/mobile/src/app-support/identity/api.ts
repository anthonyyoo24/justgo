import type { z } from 'zod';
import {
  ApiError,
  createHttpClient,
  type HttpMethod,
} from '../../lib/network/http';
export { ApiError as IdentityClientError } from '../../lib/network/http';
export interface IdentityApi {
  request<T>(
    method: HttpMethod,
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    token?: string,
    signal?: AbortSignal,
  ): Promise<T>;
}
export function createIdentityApi(
  baseUrl: string | undefined,
  fetcher: typeof fetch = fetch,
): IdentityApi {
  const http = createHttpClient(baseUrl, fetcher);
  return {
    async request<T>(
      method: HttpMethod,
      path: string,
      schema: z.ZodType<T>,
      body?: unknown,
      token?: string,
      signal?: AbortSignal,
    ) {
      try {
        return await http.request(`/v1${path}`, schema, {
          method,
          ...(body === undefined ? {} : { body }),
          ...(token ? { token } : {}),
          ...(signal ? { signal } : {}),
        });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'TIMEOUT')
          throw new ApiError('NETWORK');
        throw error;
      }
    },
  };
}
