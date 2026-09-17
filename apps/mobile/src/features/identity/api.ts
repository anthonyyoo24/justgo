import { z } from 'zod';
import { identityErrorSchema, type IdentityErrorCode } from '@justgo/contracts';
export class IdentityClientError extends Error {
  constructor(readonly code: IdentityErrorCode | 'NETWORK' | 'STORAGE') {
    super(code);
  }
}
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
  return {
    async request<T>(
      path: string,
      schema: z.ZodType<T>,
      body?: unknown,
      token?: string,
    ) {
      if (!baseUrl) throw new IdentityClientError('UNAVAILABLE');
      let base: URL;
      try {
        base = new URL(baseUrl);
      } catch {
        throw new IdentityClientError('UNAVAILABLE');
      }
      if (
        base.protocol !== 'https:' &&
        !(
          __DEV__ && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
        )
      )
        throw new IdentityClientError('UNAVAILABLE');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const result = await fetcher(
          `${baseUrl.replace(/\/$/, '')}/v1/identity${path}`,
          {
            method: body === undefined ? 'GET' : 'POST',
            signal: controller.signal,
            headers: {
              'content-type': 'application/json',
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          },
        );
        const value: unknown = await result.json();
        if (!result.ok) {
          const error = identityErrorSchema.safeParse(value);
          throw new IdentityClientError(
            error.success ? error.data.code : 'UNAVAILABLE',
          );
        }
        const parsed = schema.safeParse(value);
        if (!parsed.success) throw new IdentityClientError('UNAVAILABLE');
        return parsed.data;
      } catch (error) {
        if (error instanceof IdentityClientError) throw error;
        throw new IdentityClientError('NETWORK');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
