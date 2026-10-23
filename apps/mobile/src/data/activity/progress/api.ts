import {
  progressSummarySchema,
  progressCalendarSchema,
  completionProgressDayResponseSchema,
} from '@justgo/contracts';
import type { AccountClient } from '../../../lib/network/account-client';

type ProgressClient = Pick<AccountClient, 'request'>;

/** Wire reads only; query/repository owners retain acceptance and cache fences. */
export function readProgressSummary(
  client: ProgressClient,
  timeZone: string,
  signal: AbortSignal,
) {
  return client.request(
    `/v1/progress/summary?timeZone=${encodeURIComponent(timeZone)}`,
    progressSummarySchema,
    { signal },
  );
}
export function readProgressCalendar(
  client: ProgressClient,
  month: string,
  signal: AbortSignal,
) {
  return client.request(
    `/v1/progress/calendar?month=${month}`,
    progressCalendarSchema,
    { signal },
  );
}
export async function readProgressDay(
  client: ProgressClient,
  date: string,
  cursor: string,
  signal: AbortSignal,
) {
  const page = await client.request(
    `/v1/attempts?date=${date}&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    completionProgressDayResponseSchema,
    { signal },
  );
  return {
    ...page,
    entries: page.entries.map((attempt) => ({ ...attempt, reflection: null })),
  };
}
