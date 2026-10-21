import { z } from 'zod';
import {
  FEELING_SCALE_VERSION,
  normalizeReflectionText,
  patchAttemptSchema,
  type Attempt,
  type PatchAttempt,
} from '@justgo/contracts';
import type { JournalBackend, JournalTransaction } from './backend';
import {
  journalEntryIdentity,
  LocalJournalError,
  parseOwnedEntry,
  type JournalMergeResult,
  type LocalJournalEntry,
} from './model';

export interface LocalJournal {
  readonly accountId: string;
  list(): Promise<LocalJournalEntry[]>;
  get(id: string): Promise<LocalJournalEntry | null>;
  listConflicts(): Promise<LocalJournalEntry[]>;
  snapshot(): Promise<{
    entries: LocalJournalEntry[];
    alternatives: LocalJournalEntry[];
  }>;
  save(entry: LocalJournalEntry): Promise<LocalJournalEntry>;
  update(
    attempt: Attempt,
    requested: PatchAttempt['reflection'],
    expectedRevision?: number,
  ): Promise<LocalJournalEntry>;
  merge(
    entries: readonly LocalJournalEntry[],
    alternatives?: readonly LocalJournalEntry[],
  ): Promise<JournalMergeResult>;
  mergeLegacy(
    entries: readonly LocalJournalEntry[],
  ): Promise<JournalMergeResult>;
  mergeSynced(
    entries: readonly LocalJournalEntry[],
    alternatives: readonly LocalJournalEntry[],
    replacements?: readonly LocalJournalEntry[],
  ): Promise<JournalMergeResult>;
  clear(): Promise<void>;
  setActive(active: boolean): void;
  stop(): void;
  deleteOwned(): Promise<void>;
}

function sameContext(a: LocalJournalEntry, b: LocalJournalEntry): boolean {
  // Catalog wording may have changed between the historical sources.
  return (
    [
      'accountId',
      'id',
      'challengeId',
      'venue',
      'levelId',
      'startedAt',
      'startTimeZone',
      'displayTimeZone',
      'activityDate',
      'feelingScaleVersion',
    ] as const
  ).every((key) => a[key] === b[key]);
}

export class LocalJournalRepository implements LocalJournal {
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private active = true;
  private generation = 0;

  get isStopped(): boolean {
    return this.stopped;
  }

  constructor(
    readonly accountId: string,
    private readonly backend: JournalBackend,
  ) {
    if (!z.uuid().safeParse(accountId).success)
      throw new LocalJournalError('WRONG_ACCOUNT');
  }

  private run<T>(
    action: (transaction: JournalTransaction) => Promise<T>,
  ): Promise<T> {
    if (this.stopped || !this.active)
      return Promise.reject(new LocalJournalError('STOPPED'));
    const generation = this.generation;
    const checkActive = () => {
      if (this.stopped || !this.active || generation !== this.generation)
        throw new LocalJournalError('STOPPED');
    };
    const result = this.queue
      .then(async () => {
        checkActive();
        const value = await this.backend.transaction(
          this.accountId,
          async (transaction) => {
            checkActive();
            const output = await action(transaction);
            checkActive();
            return output;
          },
        );
        checkActive();
        return value;
      })
      .catch((error: unknown) => {
        throw error instanceof LocalJournalError
          ? error
          : new LocalJournalError('UNAVAILABLE');
      });
    this.queue = result.catch(() => undefined);
    return result;
  }

  list(): Promise<LocalJournalEntry[]> {
    return this.run(async (transaction) =>
      (await transaction.list()).map((entry) =>
        parseOwnedEntry(entry, this.accountId),
      ),
    );
  }

  get(id: string): Promise<LocalJournalEntry | null> {
    return this.run(async (transaction) => {
      const entry = await transaction.get(id);
      return entry ? parseOwnedEntry(entry, this.accountId) : null;
    });
  }

  listConflicts(): Promise<LocalJournalEntry[]> {
    return this.run(async (transaction) =>
      (await transaction.listConflicts()).map((entry) =>
        parseOwnedEntry(entry, this.accountId),
      ),
    );
  }

  snapshot(): Promise<{
    entries: LocalJournalEntry[];
    alternatives: LocalJournalEntry[];
  }> {
    return this.run(async (transaction) => ({
      entries: (await transaction.list()).map((entry) =>
        parseOwnedEntry(entry, this.accountId),
      ),
      alternatives: (await transaction.listConflicts()).map((entry) =>
        parseOwnedEntry(entry, this.accountId),
      ),
    }));
  }

  save(candidate: LocalJournalEntry): Promise<LocalJournalEntry> {
    const entry = parseOwnedEntry(candidate, this.accountId);
    return this.run(async (transaction) => {
      const previous = await transaction.get(entry.id);
      if (previous) {
        const current = parseOwnedEntry(previous, this.accountId);
        if (journalEntryIdentity(current) === journalEntryIdentity(entry))
          return current;
        if (
          !sameContext(current, entry) ||
          current.reflection.feeling !== entry.reflection.feeling ||
          entry.reflection.revision !== current.reflection.revision + 1
        )
          throw new LocalJournalError('CONFLICT');
      }
      await transaction.put(entry);
      return entry;
    });
  }

  update(
    attempt: Attempt,
    requested: PatchAttempt['reflection'],
    expectedRevision?: number,
  ): Promise<LocalJournalEntry> {
    const parsed = patchAttemptSchema.shape.reflection.safeParse(requested);
    if (!parsed.success) throw new LocalJournalError('INVALID_ENTRY');
    requested = parsed.data;
    return this.run(async (transaction) => {
      const stored = await transaction.get(attempt.id);
      const previous = stored ? parseOwnedEntry(stored, this.accountId) : null;
      const text =
        requested.text === undefined
          ? (previous?.reflection.text ?? null)
          : normalizeReflectionText(requested.text);
      if (
        previous &&
        text === previous.reflection.text &&
        (requested.feeling === undefined ||
          requested.feeling === previous.reflection.feeling)
      )
        return previous;
      if (
        (expectedRevision !== undefined &&
          expectedRevision !== (previous?.reflection.revision ?? 0)) ||
        (previous && requested.feeling !== undefined)
      )
        throw new LocalJournalError('CONFLICT');
      const entry = parseOwnedEntry(
        {
          ...(previous ?? attempt),
          accountId: this.accountId,
          feelingScaleVersion: FEELING_SCALE_VERSION,
          reflection: {
            feeling: previous
              ? previous.reflection.feeling
              : (requested.feeling ?? null),
            text,
            revision: (previous?.reflection.revision ?? 0) + 1,
          },
        },
        this.accountId,
      );
      await transaction.put(entry);
      return entry;
    });
  }

  merge(
    entries: readonly LocalJournalEntry[],
    alternatives: readonly LocalJournalEntry[] = [],
  ): Promise<JournalMergeResult> {
    return this.mergeEntries(entries, alternatives, true);
  }

  mergeSynced(
    candidates: readonly LocalJournalEntry[],
    alternativeCandidates: readonly LocalJournalEntry[],
    replacementCandidates: readonly LocalJournalEntry[] = [],
  ): Promise<JournalMergeResult> {
    const entries = candidates.map((entry) =>
      parseOwnedEntry(entry, this.accountId),
    );
    const alternatives = alternativeCandidates.map((entry) =>
      parseOwnedEntry(entry, this.accountId),
    );
    const replacements = new Map(
      replacementCandidates.map((entry) => [
        entry.id,
        journalEntryIdentity(parseOwnedEntry(entry, this.accountId)),
      ]),
    );
    return this.run(async (transaction) => {
      const result: JournalMergeResult = {
        added: 0,
        identical: 0,
        conflictIds: [],
      };
      const conflicts = new Set<string>();
      for (const entry of entries) {
        const stored = await transaction.get(entry.id);
        const current = stored ? parseOwnedEntry(stored, this.accountId) : null;
        if (!current) {
          await transaction.put(entry);
          result.added++;
        } else if (
          journalEntryIdentity(current) === journalEntryIdentity(entry)
        )
          result.identical++;
        else {
          if (!sameContext(current, entry))
            throw new LocalJournalError('CONFLICT');
          if (replacements.get(entry.id) === journalEntryIdentity(current)) {
            await transaction.putConflict(current);
            await transaction.put(entry);
          } else {
            await transaction.putConflict(entry);
            conflicts.add(entry.id);
          }
        }
      }
      for (const entry of alternatives) {
        const current = await transaction.get(entry.id);
        if (!current || !sameContext(current, entry))
          throw new LocalJournalError('CONFLICT');
        if (journalEntryIdentity(current) !== journalEntryIdentity(entry))
          await transaction.putConflict(entry);
      }
      result.conflictIds = [...conflicts];
      return result;
    });
  }

  async clear(): Promise<void> {
    if (this.stopped || !this.active) throw new LocalJournalError('STOPPED');
    const generation = ++this.generation;
    const result = this.queue
      .then(async () => {
        if (this.stopped || !this.active || generation !== this.generation)
          throw new LocalJournalError('STOPPED');
        await this.backend.deleteOwned(this.accountId);
      })
      .catch((error: unknown) => {
        throw error instanceof LocalJournalError
          ? error
          : new LocalJournalError('UNAVAILABLE');
      });
    this.queue = result.catch(() => undefined);
    await result;
  }

  mergeLegacy(
    entries: readonly LocalJournalEntry[],
  ): Promise<JournalMergeResult> {
    return this.mergeEntries(entries, [], true);
  }

  private mergeEntries(
    candidates: readonly LocalJournalEntry[],
    alternativeCandidates: readonly LocalJournalEntry[],
    preserveConflicts: boolean,
  ): Promise<JournalMergeResult> {
    // Validate the entire batch before entering a transaction, including owners.
    const entries = candidates.map((entry) =>
      parseOwnedEntry(entry, this.accountId),
    );
    const alternatives = alternativeCandidates.map((entry) =>
      parseOwnedEntry(entry, this.accountId),
    );
    return this.run(async (transaction) => {
      const result: JournalMergeResult = {
        added: 0,
        identical: 0,
        conflictIds: [],
      };
      const conflictIds = new Set<string>();
      for (const entry of entries) {
        const stored = await transaction.get(entry.id);
        const current = stored ? parseOwnedEntry(stored, this.accountId) : null;
        if (!current) {
          await transaction.put(entry);
          result.added++;
        } else if (
          journalEntryIdentity(current) === journalEntryIdentity(entry)
        ) {
          result.identical++;
        } else {
          if (!sameContext(current, entry))
            throw new LocalJournalError('CONFLICT');
          conflictIds.add(entry.id);
          if (preserveConflicts) await transaction.putConflict(entry);
        }
      }
      for (const entry of alternatives) {
        const stored = await transaction.get(entry.id);
        if (!stored) throw new LocalJournalError('INVALID_ENTRY');
        const current = parseOwnedEntry(stored, this.accountId);
        if (!sameContext(current, entry))
          throw new LocalJournalError('CONFLICT');
        if (journalEntryIdentity(current) !== journalEntryIdentity(entry)) {
          await transaction.putConflict(entry);
          conflictIds.add(entry.id);
        }
      }
      result.conflictIds = [...conflictIds];
      return result;
    });
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.generation++;
  }

  stop(): void {
    this.stopped = true;
    this.generation++;
  }

  deleteOwned(): Promise<void> {
    // Close admission synchronously, then drain a transaction already accepted
    // by the backend before removing this account's private database.
    this.stop();
    const result = this.queue
      .then(() => this.backend.deleteOwned(this.accountId))
      .catch(() => {
        throw new LocalJournalError('UNAVAILABLE');
      });
    this.queue = result.catch(() => undefined);
    return result;
  }
}
