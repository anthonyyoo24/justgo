import type { Attempt } from '@justgo/contracts';
import { MemoryJournalBackend } from '../../../test-support/local-journal';
import {
  LocalJournalError,
  localJournalEntrySchema,
  type LocalJournalEntry,
} from './model';
import { LocalJournalRepository } from './repository';

const owner = '10000000-0000-4000-8000-000000000001';
const otherOwner = '10000000-0000-4000-8000-000000000002';
const id = '20000000-0000-4000-8000-000000000001';
const secondId = '20000000-0000-4000-8000-000000000002';
const attempt: Attempt = {
  id,
  challengeId: 'challenge-1',
  venue: 'park',
  levelId: 'level-1',
  instruction: 'Synthetic historical challenge',
  startedAt: '2026-10-01T12:00:00.000Z',
  startTimeZone: 'America/Toronto',
  displayTimeZone: 'America/Toronto',
  activityDate: '2026-10-01',
  reflection: null,
};
function entry(overrides: Partial<LocalJournalEntry> = {}): LocalJournalEntry {
  return {
    ...attempt,
    accountId: owner,
    feelingScaleVersion: 1,
    reflection: {
      feeling: 'a_little_better',
      text: 'Synthetic writing',
      revision: 1,
    },
    ...overrides,
  };
}

describe('durable local journal', () => {
  let backend: MemoryJournalBackend;
  let journal: LocalJournalRepository;
  beforeEach(() => {
    backend = new MemoryJournalBackend();
    journal = new LocalJournalRepository(owner, backend);
  });

  it('preserves historical context across repository relaunch and returned object mutation', async () => {
    await journal.save(entry());
    const reopened = new LocalJournalRepository(owner, backend);
    const records = await reopened.list();
    expect(records).toEqual([entry()]);
    records[0]!.instruction = 'Changed outside repository';
    expect(await reopened.get(id)).toEqual(entry());
    expect(await reopened.get(secondId)).toBeNull();
  });

  it('keeps accounts isolated and rejects malformed or wrong-owner data before writing', async () => {
    const other = new LocalJournalRepository(otherOwner, backend);
    await journal.save(entry());
    expect(await other.list()).toEqual([]);
    expect(() => other.save(entry())).toThrow('WRONG_ACCOUNT');
    expect(() =>
      journal.merge([
        entry({ id: secondId }),
        entry({ accountId: otherOwner }),
      ]),
    ).toThrow('WRONG_ACCOUNT');
    expect(() => journal.save(entry({ activityDate: '2026-10-02' }))).toThrow(
      'INVALID_ENTRY',
    );
    expect(await journal.list()).toHaveLength(1);
  });

  it('saves locally with normalized blank text and retains the original challenge context on edit', async () => {
    await journal.update(attempt, { feeling: 'about_the_same', text: '  ' });
    const updated = await journal.update(
      { ...attempt, instruction: 'New catalog wording' },
      { text: 'New synthetic writing' },
    );
    expect(updated).toMatchObject({
      instruction: attempt.instruction,
      reflection: {
        feeling: 'about_the_same',
        text: 'New synthetic writing',
        revision: 2,
      },
    });
    await journal.update(attempt, { text: null });
    expect((await journal.get(id))?.reflection).toEqual({
      feeling: 'about_the_same',
      text: null,
      revision: 3,
    });
  });

  it('makes a repeated identical save idempotent after an uncertain acknowledgement', async () => {
    const first = await journal.update(
      attempt,
      { feeling: 'a_little_better', text: 'Synthetic writing' },
      0,
    );
    expect(
      await journal.update(
        attempt,
        { feeling: 'a_little_better', text: 'Synthetic writing' },
        0,
      ),
    ).toEqual(first);
    expect(await journal.save(first)).toEqual(first);
    expect(backend.commits).toBe(1);
  });

  it('rejects changing feelings, stale revisions, empty text-only entries and malformed edits', async () => {
    await journal.update(attempt, { text: 'Text only' });
    await expect(
      journal.update(attempt, { text: 'Another text' }, 0),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(journal.update(attempt, { text: null })).rejects.toMatchObject(
      { code: 'INVALID_ENTRY' },
    );
    await expect(
      journal.update(attempt, {
        feeling: 'a_lot_better',
        text: 'Another text',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(() => journal.update(attempt, {})).toThrow('INVALID_ENTRY');
    expect(() => journal.update(attempt, { text: 'x'.repeat(10001) })).toThrow(
      'INVALID_ENTRY',
    );
    expect((await journal.get(id))?.reflection).toEqual({
      feeling: null,
      text: 'Text only',
      revision: 1,
    });
  });

  it('serializes competing edits so a stale optimistic revision cannot overwrite accepted writing', async () => {
    await journal.save(entry());
    const first = journal.update(attempt, { text: 'First edit' }, 1);
    const stale = journal.update(attempt, { text: 'Stale edit' }, 1);
    await expect(first).resolves.toMatchObject({
      reflection: { text: 'First edit', revision: 2 },
    });
    await expect(stale).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await journal.get(id))?.reflection.text).toBe('First edit');
  });

  it('protects save context and immutable feeling while allowing only the next revision', async () => {
    await journal.save(entry());
    await expect(
      journal.save(
        entry({
          reflection: { ...entry().reflection, text: 'New text', revision: 3 },
        }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      journal.save(
        entry({
          challengeId: 'another-challenge',
          reflection: { ...entry().reflection, revision: 2 },
        }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      journal.save(
        entry({
          reflection: { feeling: 'a_lot_worse', text: 'New text', revision: 2 },
        }),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      journal.save(
        entry({
          reflection: { ...entry().reflection, text: 'New text', revision: 2 },
        }),
      ),
    ).resolves.toMatchObject({ reflection: { revision: 2 } });
  });

  it('adds missing imported entries, keeps differing writing and reports conflicts without trusting revisions', async () => {
    await journal.save(entry());
    const conflicting = entry({
      reflection: {
        ...entry().reflection,
        text: 'Imported text',
        revision: 900,
      },
    });
    expect(
      await journal.merge([entry(), conflicting, entry({ id: secondId })]),
    ).toEqual({ added: 1, identical: 1, conflictIds: [id] });
    expect((await journal.get(id))?.reflection.text).toBe('Synthetic writing');
    expect(await journal.listConflicts()).toEqual([conflicting]);
    expect(await journal.merge([entry(), entry({ id: secondId })])).toEqual({
      added: 0,
      identical: 2,
      conflictIds: [],
    });
  });

  it('preserves legacy cloud/pending versions as durable deduplicated alternatives', async () => {
    const alternative = entry({
      instruction: 'Older catalog wording',
      reflection: { ...entry().reflection, text: 'Legacy text' },
    });
    await journal.mergeLegacy([entry(), alternative, alternative]);
    const reopened = new LocalJournalRepository(owner, backend);
    expect(await reopened.snapshot()).toEqual({
      entries: [entry()],
      alternatives: [alternative],
    });
    expect(await reopened.listConflicts()).toEqual([alternative]);
    const restored = new LocalJournalRepository(
      owner,
      new MemoryJournalBackend(),
    );
    expect(await restored.merge([entry()], [alternative, alternative])).toEqual(
      { added: 1, identical: 0, conflictIds: [id] },
    );
    expect(await restored.listConflicts()).toEqual([alternative]);
    await restored.merge([], [entry()]);
    expect(await restored.listConflicts()).toEqual([alternative]);
  });

  it('preserves imported journal-only versions with equivalent timestamp precision', async () => {
    const imported = entry({
      startedAt: attempt.startedAt.replace('.000Z', '.000000Z'),
      reflection: { ...entry().reflection, text: 'Imported writing' },
    });
    const alternative = entry({
      startedAt: attempt.startedAt.replace('.000Z', 'Z'),
      reflection: { ...entry().reflection, text: 'Preserved writing' },
    });
    await journal.save(entry());
    await expect(journal.merge([imported], [alternative])).resolves.toEqual({
      added: 0,
      identical: 0,
      conflictIds: [id],
    });
    expect(await journal.snapshot()).toEqual({
      entries: [entry()],
      alternatives: [imported, alternative],
    });
    const restored = new LocalJournalRepository(
      owner,
      new MemoryJournalBackend(),
    );
    await restored.merge([imported], [alternative]);
    expect(await restored.snapshot()).toEqual({
      entries: [imported],
      alternatives: [alternative],
    });
  });

  it('accepts a synced successor and alternatives across equivalent timestamp precision', async () => {
    const original = entry();
    const successor = entry({
      startedAt: attempt.startedAt.replace('.000Z', '.000000Z'),
      reflection: {
        ...entry().reflection,
        text: 'Remote writing',
        revision: 2,
      },
    });
    const alternative = entry({
      startedAt: attempt.startedAt.replace('.000Z', 'Z'),
      reflection: { ...entry().reflection, text: 'Other writing' },
    });
    await journal.save(original);
    await journal.mergeSynced([successor], [alternative], [original]);
    expect(await journal.snapshot()).toEqual({
      entries: [successor],
      alternatives: [original, alternative],
    });
  });

  it.each(['merge', 'mergeSynced'] as const)(
    'keeps %s atomic and rejects real microsecond differences, wrong owners and unsupported feeling scales',
    async (method) => {
      const original = entry({
        startedAt: attempt.startedAt.replace('.000Z', '.123401Z'),
      });
      const changed = {
        ...original,
        startedAt: attempt.startedAt.replace('.000Z', '.123402Z'),
      };
      await journal.save(original);
      await expect(
        journal[method]([entry({ id: secondId }), changed], []),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(journal[method]([], [changed])).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(() =>
        journal[method]([{ ...original, accountId: otherOwner }], []),
      ).toThrow('WRONG_ACCOUNT');
      expect(() =>
        journal[method]([{ ...original, feelingScaleVersion: 2 as 1 }], []),
      ).toThrow('INVALID_ENTRY');
      expect(await journal.snapshot()).toEqual({
        entries: [original],
        alternatives: [],
      });
    },
  );

  it('rolls back the entire batch for orphan alternatives or an incompatible attempt relationship', async () => {
    await expect(
      journal.merge([entry()], [entry({ id: secondId })]),
    ).rejects.toMatchObject({ code: 'INVALID_ENTRY' });
    expect(await journal.list()).toEqual([]);
    await expect(
      journal.merge([entry(), entry({ challengeId: 'unrelated' })]),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await journal.list()).toEqual([]);
    await expect(
      journal.merge([entry()], [entry({ challengeId: 'unrelated' })]),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(await journal.list()).toEqual([]);
  });

  it('does not report success or keep partial writes after a phone-full commit failure, and can retry', async () => {
    await journal.save(entry());
    backend.failCommit = true;
    await expect(
      journal.merge([entry({ id: secondId })]),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      journal.update(attempt, { text: 'Uncommitted text' }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(await journal.snapshot()).toEqual({
      entries: [entry()],
      alternatives: [],
    });
    backend.failCommit = false;
    await expect(
      journal.update(attempt, { text: 'Retried text' }),
    ).resolves.toMatchObject({ reflection: { text: 'Retried text' } });
  });

  it('fences queued operations across account switches and permits returning to the original account', async () => {
    const pending = journal.save(entry());
    journal.setActive(false);
    journal.setActive(true);
    await expect(pending).rejects.toMatchObject({ code: 'STOPPED' });
    expect(await journal.list()).toEqual([]);
    journal.setActive(false);
    await expect(journal.list()).rejects.toMatchObject({ code: 'STOPPED' });
    journal.setActive(true);
    journal.setActive(true);
    await expect(journal.save(entry())).resolves.toEqual(entry());
  });

  it('suppresses stale success when account changes during a native commit already underway', async () => {
    let release!: () => void;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    backend.beforeCommit = () => {
      entered();
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    };
    const pending = journal.save(entry());
    await reached;
    journal.setActive(false);
    release();
    await expect(pending).rejects.toMatchObject({ code: 'STOPPED' });
    // An accepted commit remains solely with its original owner.
    const other = new LocalJournalRepository(otherOwner, backend);
    expect(await other.list()).toEqual([]);
    journal.setActive(true);
    expect(await journal.list()).toEqual([entry()]);
  });

  it('drains an accepted commit before deletion and never recreates that account through late operations', async () => {
    const other = new LocalJournalRepository(otherOwner, backend);
    await other.save(entry({ accountId: otherOwner }));
    let release!: () => void;
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => {
      entered = resolve;
    });
    backend.beforeCommit = () => {
      entered();
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    };
    const pending = journal.save(entry());
    await reached;
    const deleted = journal.deleteOwned();
    await expect(journal.save(entry({ id: secondId }))).rejects.toMatchObject({
      code: 'STOPPED',
    });
    release();
    await expect(pending).rejects.toMatchObject({ code: 'STOPPED' });
    await deleted;
    expect(await new LocalJournalRepository(owner, backend).list()).toEqual([]);
    expect(await other.list()).toEqual([entry({ accountId: otherOwner })]);
  });

  it('retains a retryable deletion failure and leaves other accounts untouched', async () => {
    await journal.save(entry());
    backend.failDelete = true;
    await expect(journal.deleteOwned()).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    backend.failDelete = false;
    await journal.deleteOwned();
    expect(backend.deletions).toEqual([owner]);
    await expect(journal.list()).rejects.toMatchObject({ code: 'STOPPED' });
    expect(() => new LocalJournalRepository('not-an-owner', backend)).toThrow(
      'WRONG_ACCOUNT',
    );
  });

  it('rejects corrupt persisted content instead of treating it as an empty journal', async () => {
    await backend.transaction(owner, async (transaction) => {
      await transaction.put(entry({ accountId: otherOwner }));
      await transaction.putConflict(entry({ accountId: otherOwner }));
    });
    await expect(journal.list()).rejects.toMatchObject({
      code: 'WRONG_ACCOUNT',
    });
    await expect(journal.get(id)).rejects.toMatchObject({
      code: 'WRONG_ACCOUNT',
    });
    await expect(journal.listConflicts()).rejects.toMatchObject({
      code: 'WRONG_ACCOUNT',
    });
    await expect(journal.snapshot()).rejects.toMatchObject({
      code: 'WRONG_ACCOUNT',
    });
    expect(new LocalJournalError('UNAVAILABLE').message).toBe('UNAVAILABLE');
  });
});

it('strictly validates data-only fields, real historical dates, zones, feelings and text limits', () => {
  for (const invalid of [
    { ...entry(), secret: 'not-allowed' },
    entry({ feelingScaleVersion: 2 as 1 }),
    entry({ startedAt: 'not-a-date' }),
    entry({ displayTimeZone: 'Somewhere/Missing' }),
    entry({ activityDate: '2026-02-30' }),
    entry({ instruction: 'x'.repeat(10001) }),
    entry({ reflection: { feeling: null, text: '  ', revision: 1 } }),
  ]) {
    expect(localJournalEntrySchema.safeParse(invalid).success).toBe(false);
  }
});
