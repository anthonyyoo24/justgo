import { journalEntry } from '../activity/private-journal';
import {
  attempt,
  owner,
  otherOwner,
  today,
  uuid,
} from '../../../test-support/journal';
import {
  completionData,
  journalData,
  parseICloudData,
  iCloudDataIdentity,
} from './icloud-records';

const entry = journalEntry(owner, {
  ...attempt(),
  reflection: { feeling: null, text: 'Synthetic journal entry', revision: 1 },
});
const record = (id: string, value: unknown) => ({
  id,
  value: JSON.stringify(value),
});
const completion = () => record(uuid(10), completionData('guest', attempt()));
const journal = (id = uuid(11), parents: string[] = []) =>
  record(id, journalData('guest', entry, parents));

it('keeps completion and private payloads separate and normalizes only guest ownership', () => {
  const privateAttempt = { ...attempt(), reflection: entry.reflection };
  expect(completionData('guest', privateAttempt)).toEqual({
    version: 1,
    collection: 'guest',
    accountEpoch: null,
    kind: 'completion',
    attempt: expect.not.objectContaining({ reflection: expect.anything() }),
  });
  expect(completionData('guest', privateAttempt)).not.toHaveProperty(
    'attempt.reflection',
  );
  const parsed = parseICloudData(
    [completion(), journal()],
    'guest',
    otherOwner,
  );
  expect(parsed.attempts).toHaveLength(1);
  expect(parsed.versions[0]?.entry.accountId).toBe(otherOwner);
  expect(parsed.versions[0]?.entry.reflection).toEqual(entry.reflection);
});

it('keeps account ownership exact and rejects another collection rather than remapping it', () => {
  const records = [
    record(uuid(10), completionData(`account:${owner}`, attempt(), 0)),
    record(uuid(11), journalData(`account:${owner}`, entry, [], 0)),
  ];
  expect(
    parseICloudData(records, `account:${owner}`, owner).versions[0]?.entry
      .accountId,
  ).toBe(owner);
  expect(() =>
    parseICloudData(records, `account:${owner}`, otherOwner),
  ).toThrow('INVALID_DATA');
  expect(() => parseICloudData(records, 'guest', owner)).toThrow(
    'INVALID_DATA',
  );
});

it('preserves journal-only writing without inventing a completed rep', () => {
  const parsed = parseICloudData([journal()], 'guest', otherOwner);
  expect(parsed.attempts).toEqual([]);
  expect(parsed.versions[0]?.entry).toEqual({
    ...entry,
    accountId: otherOwner,
  });
  const earlierContext = {
    ...entry,
    startedAt: '2026-10-03T14:00:00.000Z',
    activityDate: '2026-10-03',
  };
  expect(() =>
    parseICloudData(
      [journal(), record(uuid(12), journalData('guest', earlierContext))],
      'guest',
      owner,
    ),
  ).toThrow('INVALID_DATA');
});

it.each(
  [
    [completion(), journal(uuid(11), [uuid(99)])],
    [completion(), journal(uuid(11), [uuid(11)])],
    [
      completion(),
      journal(uuid(11), [uuid(12)]),
      journal(uuid(12), [uuid(11)]),
    ],
    [completion(), journal(uuid(11), [uuid(12), uuid(12)]), journal(uuid(12))],
    [completion(), completion()],
    [
      completion(),
      record(uuid(11), {
        version: 1,
        collection: 'guest',
        kind: 'credentials',
        proof: 'synthetic',
      }),
    ],
  ].map((records) => ({ records })),
)(
  'rejects incomplete, cyclic or unsupported immutable data before adoption (%#)',
  ({ records }) => {
    expect(() => parseICloudData(records, 'guest', owner)).toThrow(
      'INVALID_DATA',
    );
  },
);

it('rejects a journal/completion context mismatch instead of changing its historical date', () => {
  const mismatch = JSON.parse(completion().value);
  mismatch.attempt.activityDate = '2026-10-04';
  expect(() =>
    parseICloudData([record(uuid(10), mismatch), journal()], 'guest', owner),
  ).toThrow('INVALID_DATA');
});

it('matches equivalent timestamp precision without losing microseconds', () => {
  const base = { ...attempt(), startedAt: `${today}T14:00:00.123000Z` };
  const precise = record(uuid(10), completionData('guest', base));
  const equivalent = record(
    uuid(12),
    completionData('guest', { ...base, startedAt: `${today}T14:00:00.123Z` }),
  );
  const writing = record(
    uuid(11),
    journalData('guest', { ...entry, startedAt: `${today}T14:00:00.123Z` }),
  );
  expect(
    parseICloudData([precise, equivalent, writing], 'guest', owner).attempts,
  ).toHaveLength(1);
  const different = record(
    uuid(12),
    completionData('guest', {
      ...base,
      startedAt: `${today}T14:00:00.123001Z`,
    }),
  );
  expect(() => parseICloudData([precise, different], 'guest', owner)).toThrow(
    'CONFLICT',
  );
});

it('rejects conflicting immutable completion wording while allowing historical journal wording', () => {
  const updated = { ...attempt(), instruction: 'Different synthetic wording.' };
  expect(() =>
    parseICloudData(
      [completion(), record(uuid(12), completionData('guest', updated))],
      'guest',
      owner,
    ),
  ).toThrow('CONFLICT');
  const historicalWriting = record(
    uuid(11),
    journalData('guest', {
      ...entry,
      instruction: 'Earlier synthetic wording.',
    }),
  );
  expect(
    parseICloudData([completion(), historicalWriting], 'guest', owner).versions,
  ).toHaveLength(1);
});

it('identifies the same guest writing across phones independently of its chosen ancestry', () => {
  const copy = { ...entry, accountId: otherOwner };
  expect(iCloudDataIdentity(journalData('guest', entry, [uuid(2)]))).toBe(
    iCloudDataIdentity(journalData('guest', copy, [uuid(3)])),
  );
  expect(iCloudDataIdentity(journalData('guest', entry))).not.toBe(
    iCloudDataIdentity(
      journalData('guest', {
        ...entry,
        reflection: {
          ...entry.reflection,
          text: 'Changed synthetic entry',
          revision: 2,
        },
      }),
    ),
  );
});
