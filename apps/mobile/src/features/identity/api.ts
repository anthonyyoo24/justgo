import type { z } from 'zod';
import { ApiError, createHttpClient } from '../../lib/http';
export { ApiError as IdentityClientError } from '../../lib/http';
export interface IdentityApi {
  request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    token?: string,
  ): Promise<T>;
}
export function createIdentityApi(
  baseUrl: string | undefined,
  fetcher: typeof fetch = fetch,
): IdentityApi {
  const http = createHttpClient(baseUrl, fetcher);
  return {
    async request<T>(
      path: string,
      schema: z.ZodType<T>,
      body?: unknown,
      token?: string,
    ) {
      try {
        return await http.request(`/v1/identity${path}`, schema, {
          ...(body === undefined ? {} : { body }),
          ...(token ? { token } : {}),
        });
      } catch (error) {
        if (error instanceof ApiError && error.code === 'TIMEOUT')
          throw new ApiError('NETWORK');
        throw error;
      }
    },
  };
}
