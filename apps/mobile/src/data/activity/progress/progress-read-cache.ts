import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { ProgressDayResponse } from '@justgo/contracts';
import { accountKey } from '../../../lib/network/account-client';
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
            const local = state.localEntries?.[entry.id];
            if (local) return local;
            const record = state.journal.records[entry.id];
            // Completion cache rows carry no private content. Durable local
            // writing always takes precedence over a server refresh.
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
