import type { Attempt, PatchAttemptResponse } from '@justgo/contracts';
import type { ApiError } from '../../lib/http';
import type { Journal, Operation } from './model';
import { SHORT_RETRY_MS, sparseRetryDelay } from './retry';

const transient = new Set([
  'NETWORK',
  'TIMEOUT',
  'UNAVAILABLE',
  'RATE_LIMITED',
  'REFLECTION_CONFLICT',
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
  acknowledgement: PatchAttemptResponse['acknowledgement'] | null;
};

export function acknowledge(
  journal: Journal,
  sent: Operation,
  response: DeliveryResponse,
): void {
  const current = journal.operations.find((item) => item.id === sent.id);
  if (!current) return;
  current.state = 'acknowledged';
  const record = journal.records[sent.attemptId]!;
  record.created = true;
  if (sent.kind === 'patch')
    journal.submissions[sent.id]!.appliedRevision =
      response.acknowledgement!.appliedRevision;
  record.serverVersion = Math.max(record.serverVersion, sent.version);
  record.serverRevision = Math.max(
    record.serverRevision,
    response.attempt.reflection?.revision ?? 0,
    response.acknowledgement?.appliedRevision ?? 0,
  );
  const reflection =
    record.version > sent.version ||
    (record.attempt.reflection?.revision ?? 0) >
      (response.attempt.reflection?.revision ?? 0)
      ? record.attempt.reflection
      : response.attempt.reflection;
  record.attempt = { ...response.attempt, reflection };
}
export function recordFailure(
  journal: Journal,
  sent: Operation,
  failure: ApiError,
  through: number,
  now: number,
  random: () => number,
): void {
  const canonical = failure.currentAttempt;
  if (
    failure.code === 'REFLECTION_CONFLICT' &&
    sent.kind === 'patch' &&
    canonical?.id === sent.attemptId
  ) {
    const record = journal.records[sent.attemptId]!;
    record.serverRevision = canonical.reflection?.revision ?? 0;
    record.serverVersion = Math.max(record.serverVersion, through);
    record.attempt = {
      ...canonical,
      reflection:
        record.version > through
          ? record.attempt.reflection
          : canonical.reflection,
    };
    for (const pending of journal.operations) {
      if (pending.attemptId !== sent.attemptId || pending.kind !== 'patch')
        continue;
      if (pending.version <= through) {
        pending.state = 'acknowledged';
        journal.submissions[pending.id]!.appliedRevision =
          canonical.reflection?.revision ?? null;
      } else pending.bound = false;
    }
    return;
  }
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
      current.kind === 'create' &&
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
