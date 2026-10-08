import {
  attemptResultSchema,
  patchAttemptResponseSchema,
  type Attempt,
  type CreateAttempt,
  type PatchAttempt,
  type PatchAttemptResponse,
} from '@justgo/contracts';
import type { AccountClient } from '../../../lib/account-client';
import { ApiError } from '../../../lib/http';

export interface JournalTransport {
  create(input: CreateAttempt, signal: AbortSignal): Promise<Attempt>;
  patch(
    id: string,
    input: PatchAttempt,
    signal: AbortSignal,
  ): Promise<PatchAttemptResponse>;
}
export function createJournalTransport(
  client: AccountClient,
  accountId: string,
): JournalTransport {
  return {
    create: async (body, signal) => {
      if (!client.ownsAccount(accountId)) throw new ApiError('ACCOUNT_CHANGED');
      return (
        await client.request('/v1/attempts', attemptResultSchema, {
          method: 'POST',
          body,
          signal,
        })
      ).attempt;
    },
    patch: async (id, body, signal) => {
      if (!client.ownsAccount(accountId)) throw new ApiError('ACCOUNT_CHANGED');
      return client.request(`/v1/attempts/${id}`, patchAttemptResponseSchema, {
        method: 'PATCH',
        body,
        signal,
      });
    },
  };
}
