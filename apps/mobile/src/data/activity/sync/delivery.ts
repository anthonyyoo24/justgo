import type { Attempt } from '@justgo/contracts';
import type { ApiError } from '../../../lib/network/http';
import type { Journal, Operation } from '../model';
import { SHORT_RETRY_MS, sparseRetryDelay } from './retry';

const transient = new Set([
  'NETWORK',
  'TIMEOUT',
  'UNAVAILABLE',
  'RATE_LIMITED',
  'CANCELLED',
]);
const authentication = new Set([
  'UNAUTHORIZED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'CREDENTIAL_REJECTED',
  'ACCOUNT_CHANGED',
]);
export type DeliveryResponse = {
  attempt: Attempt;
};

export function acknowledge(
  journal: Journal,
  sent: Extract<Operation, { kind: 'create' }>,
  response: DeliveryResponse,
): void {
  const current = journal.operations.find((item) => item.id === sent.id);
  if (!current) return;
  current.state = 'acknowledged';
  const record = journal.records[sent.attemptId]!;
  record.created = true;
  record.serverVersion = Math.max(record.serverVersion, sent.version);
  // The completion response has no authority over saved private content, even
  // when an old fixture/proxy supplies it. Local storage owns all revisions.
  record.attempt = {
    ...response.attempt,
    reflection: record.attempt.reflection,
  };
}
export function recordFailure(
  journal: Journal,
  sent: Extract<Operation, { kind: 'create' }>,
  failure: ApiError,
  now: number,
  random: () => number,
): void {
  const current = journal.operations.find((item) => item.id === sent.id);
  if (!current) return;
  current.code = failure.code;
  current.requestId = failure.requestId ?? null;
  if (authentication.has(failure.code)) current.state = 'auth';
  else if (transient.has(failure.code)) {
    current.failures++;
    const delay =
      current.failures <= 2
        ? SHORT_RETRY_MS[current.failures - 1]!
        : sparseRetryDelay(current.failures - 3, random);
    current.dueAt = now + Math.max(delay, failure.retryAfterMs ?? 0);
  } else {
    current.state = 'rejected';
    if (
      ['ATTEMPT_INELIGIBLE', 'INVALID_REQUEST', 'NOT_FOUND'].includes(
        failure.code,
      )
    ) {
      journal.records[current.attemptId]!.rejected = failure.code;
      journal.generation++;
      // Only remove its provisional additions; never blindly decrement a baseline.
      journal.summaryAdditions = journal.summaryAdditions.filter(
        (value) => value !== current.attemptId,
      );
      journal.calendarAdditions = journal.calendarAdditions.filter(
        (value) => value !== current.attemptId,
      );
    }
  }
}
