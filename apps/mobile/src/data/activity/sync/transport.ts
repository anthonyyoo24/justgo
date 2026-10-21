import {
  completionAttemptResultSchema,
  createAttemptSchema,
  type Attempt,
  type CreateAttempt,
  type PatchAttempt,
  type PatchAttemptResponse,
} from '@justgo/contracts';
import type { AccountClient } from '../../../lib/network/account-client';
import { ApiError } from '../../../lib/network/http';

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
      // Runtime validation prevents accidentally passing a local record, private
      // fields, or content-derived metadata into the HTTP request.
      const input = createAttemptSchema.safeParse(body);
      if (!input.success) throw new ApiError('INVALID_REQUEST');
      const response = await client.request(
        '/v1/attempts',
        completionAttemptResultSchema,
        {
          method: 'POST',
          body: input.data,
          signal,
        },
      );
      return { ...response.attempt, reflection: null };
    },
    patch: async () => {
      if (!client.ownsAccount(accountId)) throw new ApiError('ACCOUNT_CHANGED');
      throw new ApiError('PRIVATE_JOURNAL_LOCAL');
    },
  };
}
