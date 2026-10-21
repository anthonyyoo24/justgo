import {
  isValidHistoricalContext,
  type CompletionAttempt,
} from '@justgo/contracts';
import { ApiError } from '../http/api-error.js';
import { FUTURE_START_TOLERANCE_MS } from '../attempts/service.js';

function localDate(instant: string, zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)?.value)
    .join('-');
}
export function validateHistoricalContext(
  attempt: CompletionAttempt,
  now: number,
) {
  if (
    Date.parse(attempt.startedAt) > now + FUTURE_START_TOLERANCE_MS ||
    !isValidHistoricalContext(attempt) ||
    attempt.activityDate >
      localDate(
        new Date(now + FUTURE_START_TOLERANCE_MS).toISOString(),
        attempt.displayTimeZone,
      )
  )
    throw new ApiError('INVALID_REQUEST', 400);
}
