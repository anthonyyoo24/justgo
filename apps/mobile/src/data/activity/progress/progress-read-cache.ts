import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { ProgressDayResponse } from '@justgo/contracts';
import { accountKey } from '../../../lib/account-client';
import type { JournalState } from '../model';
import { preserveNewerReflection } from './progress';

/** Online-only day pages retain confirmed edits when journal rows are pruned. */
export function reconcileDayQueries(
  queries: QueryClient,
  owner: string,
  state: JournalState,
) {
  queries.setQueriesData<InfiniteData<ProgressDayResponse>>(
    { queryKey: accountKey(owner, 'progress', 'day') },
    (cached) =>
      cached && {
        ...cached,
        pages: cached.pages.map((page) => ({
          ...page,
          entries: page.entries.map((entry) => {
            const record = state.journal.records[entry.id];
            // A settled backend-wins conflict can intentionally replace optimistic
            // text. Copy the repository's result before requesting another read.
            return record && !record.rejected
              ? { ...entry, reflection: record.attempt.reflection }
              : entry;
          }),
        })),
      },
  );
}
export function preserveDayRead(
  queries: QueryClient,
  key: readonly unknown[],
  page: ProgressDayResponse,
) {
  const cached = queries.getQueryData<InfiniteData<ProgressDayResponse>>(key);
  const retained = new Map(
    cached?.pages.flatMap((p) => p.entries).map((entry) => [entry.id, entry]),
  );
  return {
    ...page,
    entries: page.entries.map((entry) =>
      preserveNewerReflection(entry, retained.get(entry.id)),
    ),
  };
}
