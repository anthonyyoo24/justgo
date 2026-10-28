import {
  completionAttemptSchema,
  restoredCompletionSchema,
  sameHistoricalContext,
  dataEpochSchema,
  type Attempt,
  type JournalSyncVersion,
} from '@justgo/contracts';
import { z } from 'zod';
import {
  ICloudError,
  type ICloudCollection,
  type ICloudValue,
} from '../../platform/icloud/model';
import {
  localJournalEntrySchema,
  type LocalJournalEntry,
} from '../journal/model';

// Guest identity is an installation-local UUID. Use one non-account marker in
// the guest CloudKit zone so its writing can be adopted by another guest phone.
const GUEST_OWNER = '00000000-0000-4000-8000-000000000000';
const base = {
  version: z.literal(1),
  collection: z.string(),
  accountEpoch: dataEpochSchema.nullable(),
};
export const iCloudDataSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...base,
      kind: z.literal('completion'),
      attempt: restoredCompletionSchema,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal('journal'),
      entry: localJournalEntrySchema,
      parents: z.array(z.uuid()).max(50),
    })
    .strict(),
  z.object({ ...base, kind: z.literal('epoch') }).strict(),
]);
export type ICloudData = z.infer<typeof iCloudDataSchema>;
export type ICloudJournalVersion = {
  id: string;
  entry: LocalJournalEntry;
  parents: string[];
};

export function completionData(
  collection: ICloudCollection,
  attempt: Attempt,
  accountEpoch: number | null = null,
): ICloudData {
  const completion = restoredCompletionSchema.parse(
    completionAttemptSchema.strip().parse(attempt),
  );
  return iCloudDataSchema.parse({
    version: 1,
    collection,
    accountEpoch,
    kind: 'completion',
    attempt: completion,
  });
}
export function journalData(
  collection: ICloudCollection,
  entry: LocalJournalEntry,
  parents: string[] = [],
  accountEpoch: number | null = null,
): ICloudData {
  return iCloudDataSchema.parse({
    version: 1,
    collection,
    accountEpoch,
    kind: 'journal',
    entry: {
      ...entry,
      accountId: collection === 'guest' ? GUEST_OWNER : entry.accountId,
    },
    parents,
  });
}
export function epochData(
  collection: ICloudCollection,
  accountEpoch: number,
): ICloudData {
  return iCloudDataSchema.parse({
    version: 1,
    collection,
    accountEpoch,
    kind: 'epoch',
  });
}
export function iCloudDataIdentity(data: ICloudData): string {
  // An existing immutable version owns its original ancestry; finding the same
  // writing on another phone must not manufacture another uploaded version.
  return JSON.stringify(
    data.kind === 'journal' ? { ...data, parents: [] } : data,
  );
}
export function sameCompletionContext(
  a: Attempt | LocalJournalEntry,
  b: Attempt | LocalJournalEntry,
): boolean {
  return sameHistoricalContext(a, b);
}

export function parseICloudData(
  records: ICloudValue[],
  collection: ICloudCollection,
  owner: string,
) {
  const completions = new Map<string, Attempt>();
  const versions: ICloudJournalVersion[] = [];
  const values = new Map<string, ICloudData>();
  try {
    const parsed = [...records]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((record) => {
        const data = iCloudDataSchema.parse(JSON.parse(record.value));
        if (
          data.collection !== collection ||
          (collection === 'guest'
            ? data.accountEpoch !== null
            : data.accountEpoch === null)
        )
          throw new ICloudError('INVALID_DATA');
        return { record, data };
      });
    if (new Set(parsed.map(({ record }) => record.id)).size !== parsed.length)
      throw new ICloudError('INVALID_DATA');
    const epochs = parsed.flatMap(({ data }) =>
      data.accountEpoch === null ? [] : [data.accountEpoch],
    );
    const accountEpoch = epochs.length ? Math.max(...epochs) : null;
    const hasOlderEpoch = epochs.some((epoch) => epoch !== accountEpoch);
    for (const { record, data } of parsed) {
      if (data.accountEpoch !== accountEpoch) continue;
      values.set(record.id, data);
      if (data.kind === 'completion') {
        const attempt = { ...data.attempt, reflection: null };
        const old = completions.get(attempt.id);
        if (
          old &&
          (!sameCompletionContext(old, attempt) ||
            old.instruction !== attempt.instruction)
        )
          throw new ICloudError('CONFLICT');
        if (!old) completions.set(attempt.id, attempt);
      } else if (data.kind === 'journal') {
        const expected = collection === 'guest' ? GUEST_OWNER : owner;
        if (
          data.entry.accountId !== expected ||
          data.parents.includes(record.id) ||
          new Set(data.parents).size !== data.parents.length
        )
          throw new ICloudError('INVALID_DATA');
        versions.push({
          id: record.id,
          entry: { ...data.entry, accountId: owner },
          parents: data.parents,
        });
      }
    }
    const byId = new Map(versions.map((version) => [version.id, version]));
    const journalContexts = new Map<string, LocalJournalEntry>();
    for (const version of versions) {
      const completion = completions.get(version.entry.id);
      const context = completion ?? journalContexts.get(version.entry.id);
      if (context && !sameCompletionContext(context, version.entry))
        throw new ICloudError('INVALID_DATA');
      journalContexts.set(version.entry.id, version.entry);
      for (const parent of version.parents) {
        const previous = byId.get(parent);
        if (!previous || previous.entry.id !== version.entry.id)
          throw new ICloudError('INVALID_DATA');
      }
    }
    // Topological traversal validates the whole graph without recursion or an
    // unbounded repeated ancestry walk on hostile imported CloudKit content.
    const children = new Map<string, string[]>();
    const degree = new Map(
      versions.map((version) => [version.id, version.parents.length]),
    );
    for (const version of versions)
      for (const parent of version.parents) {
        const list = children.get(parent) ?? [];
        list.push(version.id);
        children.set(parent, list);
      }
    const queue = versions
      .filter((version) => !version.parents.length)
      .map((version) => version.id);
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      if (!id) throw new ICloudError('INVALID_DATA');
      for (const child of children.get(id) ?? []) {
        const previous = degree.get(child);
        if (previous === undefined) throw new ICloudError('INVALID_DATA');
        const remaining = previous - 1;
        degree.set(child, remaining);
        if (!remaining) queue.push(child);
      }
    }
    if (queue.length !== versions.length) throw new ICloudError('INVALID_DATA');
    return {
      attempts: [...completions.values()],
      versions,
      values,
      accountEpoch,
      hasOlderEpoch,
    };
  } catch (error) {
    if (error instanceof ICloudError) throw error;
    throw new ICloudError('INVALID_DATA');
  }
}

export function cloudVersion(
  version: ICloudJournalVersion,
): JournalSyncVersion {
  return {
    versionId: version.id,
    attemptId: version.entry.id,
    parents: version.parents,
    feelingScaleVersion: 1,
    reflection: version.entry.reflection,
  };
}
