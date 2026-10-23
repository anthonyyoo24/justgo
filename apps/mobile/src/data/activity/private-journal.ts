import type { Attempt } from '@justgo/contracts';
import type { LocalJournalEntry } from '../journal/model';
import type { LocalJournalRepository } from '../journal/repository';
import { cloneJournal, type Journal } from './model';

export function journalEntry(
  accountId: string,
  attempt: Attempt,
): LocalJournalEntry {
  if (!attempt.reflection)
    throw new Error('A journal entry needs saved content');
  return {
    ...attempt,
    reflection: attempt.reflection,
    accountId,
    feelingScaleVersion: 1,
  };
}

export function journalAttempt(entry: LocalJournalEntry): Attempt {
  return {
    id: entry.id,
    challengeId: entry.challengeId,
    instruction: entry.instruction,
    venue: entry.venue,
    levelId: entry.levelId,
    startedAt: entry.startedAt,
    activityDate: entry.activityDate,
    startTimeZone: entry.startTimeZone,
    displayTimeZone: entry.displayTimeZone,
    reflection: entry.reflection,
  };
}

/** Preserve accepted legacy bytes before retiring private retries or pruning caches. */
export async function preserveActivityJournal(
  local: LocalJournalRepository,
  journal: Journal,
) {
  const current = new Map<string, Attempt>();
  for (const record of Object.values(journal.records))
    if (record.attempt.reflection)
      current.set(record.attempt.id, record.attempt);
  await local.mergeLegacy(
    [...current.values()].map((attempt) =>
      journalEntry(journal.accountId, attempt),
    ),
  );
  // Cached server rows can contain another saved version of the same attempt.
  // Keep the visible local record preferred, but preserve every cached version.
  await local.mergeLegacy(
    (journal.today?.data.entries ?? [])
      .filter((attempt) => attempt.reflection !== null)
      .map((attempt) => journalEntry(journal.accountId, attempt)),
  );
  // Receipts can retain a rejected/pending version that differs from the visible row.
  const versions: LocalJournalEntry[] = [];
  for (const receipt of Object.values(journal.submissions)) {
    const attempt = journal.records[receipt.attemptId]?.attempt;
    if (!attempt?.reflection) continue;
    const reflection = {
      feeling:
        receipt.reflection.feeling === undefined
          ? attempt.reflection.feeling
          : receipt.reflection.feeling,
      text:
        receipt.reflection.text === undefined
          ? attempt.reflection.text
          : receipt.reflection.text,
      revision: receipt.appliedRevision ?? Math.max(1, receipt.version - 1),
    };
    if (reflection.feeling || reflection.text)
      versions.push(
        journalEntry(journal.accountId, { ...attempt, reflection }),
      );
  }
  await local.mergeLegacy(versions);
}

export function completionJournal(journal: Journal): Journal {
  const result = cloneJournal(journal);
  result.operations = result.operations.filter(
    (operation) => operation.kind === 'create',
  );
  result.submissions = {};
  for (const record of Object.values(result.records)) {
    record.attempt.reflection = null;
    record.version = 1;
    record.phoneVersion = record.phoneVersion ? 1 : 0;
    record.serverVersion = record.created ? 1 : 0;
    record.serverRevision = 0;
  }
  if (result.today)
    result.today.data.entries = result.today.data.entries.map((attempt) => ({
      ...attempt,
      reflection: null,
    }));
  return result;
}
