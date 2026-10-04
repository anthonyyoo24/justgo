import { useEffect, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  legacyProgressDayResponseSchema as progressDayResponseSchema,
  legacyProgressResponseSchema as progressResponseSchema,
  type LegacyProgressResponse as ProgressResponse,
} from '@justgo/contracts';
import { accountKey } from '../../lib/account-client';
import { useIdentity, useRuntime } from '../shell/AppProvider';
import { currentMonth, moveMonth } from './calendar';
import { ProgressView } from './ProgressView';

export function ProgressScreen() {
  const { client } = useRuntime();
  const { account } = useIdentity();
  const focused = useIsFocused();
  const [month, setMonth] = useState(currentMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const userId = account?.userId ?? 'disconnected';
  const monthKey = accountKey(userId, 'progress', 'month', month, timeZone);
  const dayKey = accountKey(userId, 'progress', 'day', selectedDate);
  const summary = useQuery<ProgressResponse>({
    queryKey: monthKey,
    enabled: !!account && focused,
    // Keep the last complete month visible until the requested month arrives.
    // Never reuse another account's (or time zone's) progress as a placeholder.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === userId &&
      previousQuery.queryKey[5] === timeZone
        ? previousData
        : undefined,
    queryFn: ({ signal }) =>
      client.request(
        `/v1/progress?month=${month}&timeZone=${encodeURIComponent(timeZone)}`,
        progressResponseSchema,
        { signal },
      ),
  });
  const details = useInfiniteQuery({
    queryKey: dayKey,
    enabled: !!account && focused && !!selectedDate,
    initialPageParam: '' as string,
    queryFn: ({ pageParam, signal }) =>
      client.request(
        `/v1/progress/days/${selectedDate}?limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        progressDayResponseSchema,
        { signal },
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  // Confirmed finishes and submitted reflections invalidate account progress
  // immediately. Focus refreshes it after navigation or an external change.
  useEffect(() => {
    if (focused && account?.userId)
      void client.queries.invalidateQueries({
        queryKey: accountKey(account.userId, 'progress'),
      });
  }, [focused, account?.userId, client]);
  const first = details.data?.pages[0];
  const day = first
    ? {
        date: first.date,
        totalReps: first.totalReps,
        entries: details.data!.pages.flatMap((page) => page.entries),
      }
    : undefined;
  return (
    <ProgressView
      month={summary.data?.month ?? month}
      data={summary.data}
      loading={summary.isPending}
      updatingMonth={summary.isPlaceholderData}
      error={summary.isError}
      selectedDate={selectedDate}
      day={day}
      dayLoading={details.isPending}
      dayError={details.isError && !details.data}
      loadMoreError={details.isFetchNextPageError}
      hasMore={details.hasNextPage}
      loadingMore={details.isFetchingNextPage}
      fetchingDay={details.isFetching}
      onMonth={(offset) => {
        setSelectedDate(null);
        setMonth((current) => moveMonth(current, offset));
      }}
      onOpenDay={setSelectedDate}
      onCloseDay={() => setSelectedDate(null)}
      onRetryMonth={() => void summary.refetch()}
      onRetryDay={() =>
        void (details.isFetchNextPageError
          ? details.fetchNextPage()
          : details.refetch())
      }
      onLoadMore={() => {
        if (details.hasNextPage && !details.isFetching)
          void details.fetchNextPage();
      }}
    />
  );
}
