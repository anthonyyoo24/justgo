import { z } from 'zod';
import {
  attemptSchema,
  createAttemptSchema,
  patchAttemptSchema,
  progressSummarySchema,
  progressCalendarSchema,
  progressDayResponseSchema,
  type Catalog,
  timeZoneSchema,
  activityDateSchema,
  catalogSchema,
} from '@justgo/contracts';

const recordSchema = z
  .object({
    attempt: attemptSchema,
    version: z.number().int().positive(),
    phoneVersion: z.number().int().nonnegative(),
    serverVersion: z.number().int().nonnegative(),
    serverRevision: z.number().int().nonnegative(),
    created: z.boolean(),
    rejected: z.string().nullable(),
  })
  .strict();
const operationBase = {
  id: z.uuid(),
  attemptId: z.uuid(),
  version: z.number().int().positive(),
  state: z.enum(['pending', 'acknowledged', 'rejected', 'auth']),
  failures: z.number().int().nonnegative(),
  dueAt: z.number().nonnegative(),
  code: z.string().nullable(),
  requestId: z.string().nullable(),
};
const operationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...operationBase,
      kind: z.literal('create'),
      input: createAttemptSchema,
    })
    .strict(),
  z
    .object({
      ...operationBase,
      kind: z.literal('patch'),
      input: patchAttemptSchema,
      // Unbound dependent edits receive the acknowledged predecessor revision
      // before their first send. Bound payloads never change during replay.
      bound: z.boolean(),
      dependsOn: z.uuid().nullable(),
    })
    .strict(),
]);
export const journalSchema = z
  .object({
    version: z.literal(1),
    accountId: z.uuid(),
    generation: z.number().int().nonnegative(),
    records: z.record(z.string(), recordSchema),
    operations: z.array(operationSchema),
    submissions: z.record(
      z.uuid(),
      z
        .object({
          attemptId: z.uuid(),
          reflection: patchAttemptSchema.shape.reflection,
          version: z.number().int().positive(),
          appliedRevision: z.number().int().positive().nullable(),
        })
        .strict(),
    ),
    summaryAdditions: z.array(z.uuid()),
    calendarAdditions: z.array(z.uuid()),
    summary: progressSummarySchema.nullable(),
    calendar: z
      .object({ timeZone: timeZoneSchema, data: progressCalendarSchema })
      .strict()
      .nullable(),
    today: z
      .object({ timeZone: timeZoneSchema, data: progressDayResponseSchema })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((journal, context) => {
    for (const [id, record] of Object.entries(journal.records)) {
      if (
        record.attempt.id !== id ||
        record.phoneVersion > record.version ||
        record.serverVersion > record.version
      )
        context.addIssue({
          code: 'custom',
          message: 'Invalid record ownership/version',
        });
    }
    const ids = new Set<string>();
    for (const operation of journal.operations) {
      const record = journal.records[operation.attemptId];
      if (
        ids.has(operation.id) ||
        !record ||
        operation.version > record.version ||
        (operation.kind === 'create' &&
          (operation.id !== operation.attemptId ||
            operation.input.id !== operation.attemptId ||
            operation.input.challengeId !== record.attempt.challengeId ||
            operation.input.venue !== record.attempt.venue ||
            operation.input.startedAt !== record.attempt.startedAt ||
            operation.input.startTimeZone !== record.attempt.startTimeZone)) ||
        (operation.kind === 'patch' &&
          (operation.input.submissionId !== operation.id ||
            journal.submissions[operation.id]?.attemptId !==
              operation.attemptId ||
            journal.submissions[operation.id]?.version !== operation.version))
      )
        context.addIssue({
          code: 'custom',
          message: 'Invalid operation dependency',
        });
      ids.add(operation.id);
      if (
        operation.kind === 'patch' &&
        operation.dependsOn &&
        operation.dependsOn !== operation.attemptId
      ) {
        const predecessor = journal.submissions[operation.dependsOn];
        if (
          !predecessor ||
          predecessor.attemptId !== operation.attemptId ||
          predecessor.version >= operation.version
        )
          context.addIssue({
            code: 'custom',
            message: 'Invalid predecessor acknowledgement',
          });
      }
    }
    for (const id of [
      ...journal.summaryAdditions,
      ...journal.calendarAdditions,
    ])
      if (!journal.records[id])
        context.addIssue({
          code: 'custom',
          message: 'Missing aggregate record',
        });
    for (const receipt of Object.values(journal.submissions)) {
      const record = journal.records[receipt.attemptId];
      if (!record || receipt.version > record.version)
        context.addIssue({
          code: 'custom',
          message: 'Invalid submission receipt',
        });
    }
    if (
      new Set(journal.summaryAdditions).size !==
        journal.summaryAdditions.length ||
      new Set(journal.calendarAdditions).size !==
        journal.calendarAdditions.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Duplicate aggregate record',
      });
  });
export const catalogEnvelopeSchema = z
  .object({
    version: z.literal(1),
    accountId: z.uuid(),
    catalog: catalogSchema,
  })
  .strict();
export const periodSchema = z
  .object({ today: activityDateSchema, timeZone: timeZoneSchema })
  .strict();
export type Journal = z.infer<typeof journalSchema>;
export type LocalRecord = Journal['records'][string];
export type Operation = Journal['operations'][number];
export type WarningEpisode = {
  visible: boolean;
  dismissed: boolean;
  episode: number;
  storageFull: boolean;
  online: boolean;
};
export type JournalState = {
  ready: boolean;
  hydrationError: 'unreadable' | null;
  coordinatorError: 'UNAVAILABLE' | null;
  journal: Journal;
  catalog: Catalog | null;
  online: boolean;
  active: boolean;
  warning: WarningEpisode | null;
  recoverySequence: number;
  remoteRefreshSequence: number;
  flowAttemptId: string | null;
  period: { today: string; timeZone: string };
};
export interface JournalStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export interface JournalClock {
  now(): number;
  setTimeout(
    callback: () => void,
    delay: number,
  ): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}
export const systemClock: JournalClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
};
export function emptyJournal(accountId: string): Journal {
  return {
    version: 1,
    accountId,
    generation: 0,
    records: {},
    operations: [],
    submissions: {},
    summaryAdditions: [],
    calendarAdditions: [],
    summary: null,
    calendar: null,
    today: null,
  };
}
export function cloneJournal(journal: Journal): Journal {
  return JSON.parse(JSON.stringify(journal)) as Journal;
}
export function endangered(journal: Journal): boolean {
  return Object.values(journal.records).some(
    (record) =>
      record.phoneVersion < record.version &&
      record.serverVersion < record.version,
  );
}
