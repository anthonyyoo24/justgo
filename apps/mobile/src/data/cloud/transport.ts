import {
  completionRestorePageSchema,
  completionRestoreRequestSchema,
  completionRestoreResponseSchema,
  journalSyncPageSchema,
  journalSyncRequestSchema,
  journalSyncResponseSchema,
  dataDeletionResponseSchema,
  type CompletionRestorePage,
  type CompletionRestoreRequest,
  type CompletionRestoreResponse,
  type JournalSyncPage,
  type JournalSyncRequest,
  type JournalSyncResponse,
  type DataDeletionResponse,
} from '@justgo/contracts';
import type { AccountClient } from '../../lib/network/account-client';
import { ApiError } from '../../lib/network/http';

export interface DataSyncTransport {
  completions(
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<CompletionRestorePage>;
  versions(
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<JournalSyncPage>;
  putCompletions(
    input: CompletionRestoreRequest,
    signal: AbortSignal,
  ): Promise<CompletionRestoreResponse>;
  putVersions(
    input: JournalSyncRequest,
    signal: AbortSignal,
  ): Promise<JournalSyncResponse>;
  deleteData(
    expectedEpoch: number,
    signal: AbortSignal,
  ): Promise<DataDeletionResponse>;
}
export function createDataSyncTransport(
  client: AccountClient,
  owner: string,
): DataSyncTransport {
  const check = () => {
    if (!client.ownsAccount(owner)) throw new ApiError('ACCOUNT_CHANGED');
  };
  const page = (path: string, cursor: string | null) =>
    path + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '');
  return {
    completions: (cursor, signal) => {
      check();
      return client.request(
        page('/v1/completion-restores', cursor),
        completionRestorePageSchema,
        { signal },
      );
    },
    versions: (cursor, signal) => {
      check();
      return client.request(
        page('/v1/journal-sync', cursor),
        journalSyncPageSchema,
        { signal },
      );
    },
    putCompletions: (input, signal) => {
      check();
      return client.request(
        '/v1/completion-restores',
        completionRestoreResponseSchema,
        {
          method: 'POST',
          body: completionRestoreRequestSchema.parse(input),
          signal,
        },
      );
    },
    putVersions: (input, signal) => {
      check();
      return client.request('/v1/journal-sync', journalSyncResponseSchema, {
        method: 'POST',
        body: journalSyncRequestSchema.parse(input),
        signal,
      });
    },
    deleteData: (expectedEpoch, signal) => {
      check();
      return client.request('/v1/data', dataDeletionResponseSchema, {
        method: 'DELETE',
        body: { expectedEpoch },
        signal,
      });
    },
  };
}
