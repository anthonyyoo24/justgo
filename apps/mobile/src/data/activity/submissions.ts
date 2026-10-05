import {
  attemptSchema,
  normalizeReflectionText,
  patchAttemptSchema,
  type Attempt,
  type ChallengeCard,
  type CreateAttempt,
  type PatchAttempt,
} from '@justgo/contracts';
import { ApiError } from '../../lib/http';
import type { Journal, Operation } from './model';

function activityDate(startedAt: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(startedAt));
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join('-');
}
// Domain updates are synchronous; the repository commits their consistent
// snapshot before navigation, and the sender owns subsequent external delivery.
export function addCompletion(
  journal: Journal,
  input: CreateAttempt,
  card: ChallengeCard,
): Attempt {
  const attempt = attemptSchema.parse({
    ...input,
    levelId: card.levelId,
    instruction: card.text,
    displayTimeZone: input.startTimeZone,
    activityDate: activityDate(input.startedAt, input.startTimeZone),
    reflection: null,
  });
  journal.generation++;
  journal.records[attempt.id] = {
    attempt,
    version: 1,
    phoneVersion: 0,
    serverVersion: 0,
    serverRevision: 0,
    created: false,
    rejected: null,
  };
  journal.operations.push({
    kind: 'create',
    id: attempt.id,
    attemptId: attempt.id,
    input,
    version: 1,
    state: 'pending',
    failures: 0,
    dueAt: 0,
    code: null,
    requestId: null,
  });
  journal.summaryAdditions.push(attempt.id);
  journal.calendarAdditions.push(attempt.id);
  return attempt;
}
export function addReflection(
  journal: Journal,
  attemptId: string,
  submissionId: string,
  requested: PatchAttempt['reflection'],
): void {
  const rejected = journal.operations.find(
    (operation) =>
      operation.attemptId === attemptId &&
      operation.kind === 'patch' &&
      operation.state === 'rejected',
  );
  if (rejected?.kind === 'patch') {
    if (rejected.code !== 'INVALID_REQUEST')
      throw new ApiError('CONFLICT', rejected.requestId ?? undefined);
    // New writing explicitly replaces the blocked chain. An older recovery
    // action still uses correctReflection's version guard below.
    replaceRejectedReflection(journal, rejected, submissionId, requested);
    return;
  }
  const record = journal.records[attemptId]!;
  const previous = record.attempt.reflection;
  if (previous && requested.feeling !== undefined)
    throw new ApiError('INVALID_REQUEST');
  const text =
    requested.text === undefined
      ? (previous?.text ?? null)
      : normalizeReflectionText(requested.text);
  const feeling = previous ? previous.feeling : (requested.feeling ?? null);
  if (!text && !feeling) throw new ApiError('INVALID_REQUEST');
  const input = patchAttemptSchema.parse({
    submissionId,
    expectedReflectionRevision: record.serverRevision,
    reflection: previous ? { text } : { feeling, text },
  });
  const predecessor = [...journal.operations]
    .reverse()
    .find((operation) => operation.attemptId === attemptId);
  record.version++;
  journal.submissions[submissionId] = {
    attemptId,
    reflection: requested,
    version: record.version,
    appliedRevision: null,
  };
  record.attempt.reflection = {
    feeling,
    text,
    revision: (previous?.revision ?? 0) + 1,
  };
  journal.operations.push({
    kind: 'patch',
    id: submissionId,
    attemptId,
    version: record.version,
    input,
    bound: predecessor?.kind !== 'patch',
    dependsOn: predecessor?.id ?? null,
    state: 'pending',
    failures: 0,
    dueAt: 0,
    code: null,
    requestId: null,
  });
}

// An explicit correction gets a new identity. Preserve superseded submitted
// values in receipts, rather than retrying an unchanged rejected payload.
export function correctReflection(
  journal: Journal,
  failedId: string,
  newId: string,
  requested: PatchAttempt['reflection'],
): string {
  const failed = journal.operations.find(
    (operation) => operation.id === failedId,
  );
  if (
    failed?.kind !== 'patch' ||
    failed.state !== 'rejected' ||
    failed.code !== 'INVALID_REQUEST'
  )
    throw new ApiError('INVALID_REQUEST');
  if (journal.submissions[newId] || journal.records[newId])
    throw new ApiError('CONFLICT');
  const record = journal.records[failed.attemptId]!;
  // A stale correction must not consume unrelated writing submitted since the
  // rejected version. The caller must surface the current entry for recovery.
  if (record.version !== failed.version) throw new ApiError('CONFLICT');
  replaceRejectedReflection(journal, failed, newId, requested);
  return failed.attemptId;
}

function replaceRejectedReflection(
  journal: Journal,
  failed: Extract<Operation, { kind: 'patch' }>,
  newId: string,
  requested: PatchAttempt['reflection'],
): void {
  const record = journal.records[failed.attemptId]!;
  const previous = record.attempt.reflection;
  const text =
    requested.text === undefined
      ? (previous?.text ?? null)
      : normalizeReflectionText(requested.text);
  const candidate =
    record.serverRevision === 0
      ? { feeling: requested.feeling ?? previous?.feeling ?? null, text }
      : { text };
  if (JSON.stringify(candidate) === JSON.stringify(failed.input.reflection))
    throw new ApiError('INVALID_REQUEST');
  for (const operation of journal.operations) {
    if (
      operation.attemptId === failed.attemptId &&
      operation.kind === 'patch'
    ) {
      operation.state = 'acknowledged';
      journal.submissions[operation.id]!.appliedRevision =
        record.serverRevision || null;
    }
  }
  let correction = requested;
  if (record.serverRevision === 0) {
    correction = {
      feeling: requested.feeling ?? previous?.feeling ?? null,
      text:
        requested.text === undefined
          ? (previous?.text ?? null)
          : requested.text,
    };
    record.attempt.reflection = null;
  }
  addReflection(journal, failed.attemptId, newId, correction);
  journal.submissions[newId]!.reflection = requested;
}
