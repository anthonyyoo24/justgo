import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  progressSummarySchema,
  progressCalendarSchema,
  progressDayResponseSchema,
} from '@justgo/contracts';
import { accountKey, type AccountClient } from '../../../lib/account-client';
import { ApiError } from '../../../lib/http';
import type { JournalState } from '../model';
import type { AccountRepository } from '../repository';
import { preserveDayRead } from './progress-read-cache';

/** Independent reads; repository acceptance owns durable aggregate rebasing. */
export function useProgressReads(
  client: AccountClient,
  repository: AccountRepository | null,
  state: JournalState | null,
  month?: string,
  date?: string | null,
  focused = true,
) {
  const owner = repository?.accountId ?? 'disconnected';
  const today = state?.period.today ?? '';
  const timeZone = state?.period.timeZone ?? 'UTC';
  month ??= today.slice(0, 7);
  date ??= today;
  const enabled =
    !!repository && !!state?.ready && state.active && state.online && focused;
  const aggregates = enabled && repository.captureAggregateFence() !== null;
  const summary = useQuery({
    queryKey: accountKey(owner, 'progress', 'summary', today, timeZone),
    enabled: aggregates,
    queryFn: async ({ signal }) => {
      const fence = repository!.captureAggregateFence();
      if (fence === null) throw new ApiError('CANCELLED');
      const data = await client.request(
        `/v1/progress/summary?timeZone=${encodeURIComponent(timeZone)}`,
        progressSummarySchema,
        { signal },
      );
      if (signal.aborted || !(await repository!.acceptSummary(data, fence)))
        throw new ApiError('CANCELLED');
      return data;
    },
  });
  const calendar = useQuery({
    queryKey: accountKey(owner, 'progress', 'calendar', month, timeZone, today),
    enabled: aggregates && !!month,
    queryFn: async ({ signal }) => {
      const fence = repository!.captureAggregateFence();
      if (fence === null) throw new ApiError('CANCELLED');
      const data = await client.request(
        `/v1/progress/calendar?month=${month}`,
        progressCalendarSchema,
        { signal },
      );
      if (
        signal.aborted ||
        state!.period.today !== repository!.store.getState().period.today ||
        !(await repository!.acceptCalendar(data, timeZone, fence))
      )
        throw new ApiError('CANCELLED');
      return { ...data, generation: fence };
    },
  });
  const dayKey = accountKey(owner, 'progress', 'day', date, timeZone, today);
  const day = useInfiniteQuery({
    queryKey: dayKey,
    enabled: enabled && !!date,
    initialPageParam: '',
    queryFn: async ({ pageParam, signal }) => {
      const data = await client.request(
        `/v1/attempts?date=${date}&limit=20${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        progressDayResponseSchema,
        { signal },
      );
      if (signal.aborted || !repository!.store.getState().active)
        throw new ApiError('CANCELLED');
      const retained = preserveDayRead(client.queries, dayKey, data);
      await repository!.acceptTodayPage(retained, timeZone, !!pageParam);
      return retained;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  return { summary, calendar, day };
}
