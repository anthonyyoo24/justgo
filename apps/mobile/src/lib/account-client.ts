import type { z } from 'zod';
import { QueryClient } from '@tanstack/react-query';
import { ApiError, type HttpClient, type RequestOptions } from './http';
import { Deadline } from './deadline';

export type AccountSession = { userId: string; token: string };
export interface SessionSource {
  current: () => AccountSession | null;
  renew: (failedToken: string) => Promise<AccountSession>;
  reject: (token: string, code: 'SESSION_REVOKED' | 'UNAUTHORIZED') => void;
}
export const accountKey = (userId: string, ...parts: readonly unknown[]) =>
  ['account', userId, ...parts] as const;
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        networkMode: 'always',
        staleTime: 0,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}
export class AccountClient {
  private epoch = 0;
  private accountId: string | null = null;
  private inflight = new Set<AbortController>();
  private renewal: Promise<AccountSession> | null = null;
  private renewalDeadline: Deadline | null = null;
  constructor(
    private readonly http: HttpClient,
    private readonly session: SessionSource,
    readonly queries = createQueryClient(),
  ) {}
  changeAccount(userId: string | null) {
    if (this.accountId === userId) return;
    this.accountId = userId;
    this.epoch++;
    this.inflight.forEach((controller) => controller.abort());
    this.inflight.clear();
    this.renewalDeadline?.cancel('ACCOUNT_CHANGED');
    this.renewalDeadline = null;
    this.renewal = null;
    void this.queries.cancelQueries();
    this.queries.clear();
  }
  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    options: Omit<RequestOptions, 'token' | 'retryRead'> = {},
  ): Promise<T> {
    const session = this.session.current();
    if (!session || session.userId !== this.accountId)
      throw new ApiError('UNAUTHORIZED');
    const epoch = this.epoch;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    this.inflight.add(controller);
    const started = Date.now();
    const budget = Math.min(options.timeoutMs ?? 10_000, 10_000);
    const check = () => {
      if (epoch !== this.epoch) throw new ApiError('ACCOUNT_CHANGED');
      if (controller.signal.aborted) throw new ApiError('CANCELLED');
      if (Date.now() - started >= budget) throw new ApiError('TIMEOUT');
    };
    const send = async (token: string, retryRead: boolean) => {
      check();
      const result = await this.http.request(path, schema, {
        ...options,
        token,
        signal: controller.signal,
        retryRead,
        timeoutMs: budget - (Date.now() - started),
      });
      check();
      return result;
    };
    // Freeze an action's serialized input across authentication replay/manual retry.
    if (options.body !== undefined)
      options = {
        ...options,
        body: JSON.parse(JSON.stringify(options.body)) as unknown,
      };
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abort: () => void = () => {};
    try {
      const work = async () => {
        try {
          return await send(session.token, false);
        } catch (error) {
          check();
          if (!(error instanceof ApiError)) throw error;
          if (
            error.code === 'SESSION_REVOKED' ||
            error.code === 'UNAUTHORIZED'
          ) {
            // An already-coordinated rotation may have invalidated this request's old token.
            const current = this.session.current();
            if (
              current?.userId === session.userId &&
              current.token !== session.token
            )
              return send(current.token, false);
            this.session.reject(session.token, error.code);
            throw error;
          }
          if (error.code === 'SESSION_EXPIRED') {
            if (!this.renewal) {
              // A cancelled/short-lived request must not cancel other renewal waiters.
              const deadline = new Deadline();
              this.renewalDeadline = deadline;
              const renewal = deadline.wait(() =>
                this.session.renew(session.token),
              );
              this.renewal = renewal;
              void renewal
                .finally(() => {
                  deadline.dispose();
                  if (this.renewal === renewal) {
                    this.renewal = null;
                    this.renewalDeadline = null;
                  }
                })
                .catch(() => {});
            }
            const renewed = await this.renewal;
            check();
            if (renewed.userId !== session.userId)
              throw new ApiError('ACCOUNT_CHANGED');
            return send(renewed.token, false);
          }
          if (
            options.body === undefined &&
            ['NETWORK', 'UNAVAILABLE'].includes(error.code)
          )
            return send(session.token, false);
          throw error;
        }
      };
      const boundary = new Promise<never>((_resolve, reject) => {
        abort = () =>
          reject(
            new ApiError(
              epoch !== this.epoch ? 'ACCOUNT_CHANGED' : 'CANCELLED',
            ),
          );
        controller.signal.addEventListener('abort', abort, { once: true });
        timeout = setTimeout(() => {
          reject(new ApiError('TIMEOUT'));
          controller.abort();
        }, budget);
      });
      return await Promise.race([boundary, work()]);
    } finally {
      clearTimeout(timeout);
      controller.signal.removeEventListener('abort', abort);
      options.signal?.removeEventListener('abort', cancel);
      this.inflight.delete(controller);
    }
  }
}

// Caller creates once per user intent, retains this object for an uncertain retry.
// Consuming feature endpoints must enforce ownership + matching-input idempotency.
export function stableAction<T extends object>(
  id: string,
  input: T,
): Readonly<T & { actionId: string }> {
  return Object.freeze(
    JSON.parse(JSON.stringify({ ...input, actionId: id })) as T & {
      actionId: string;
    },
  );
}
