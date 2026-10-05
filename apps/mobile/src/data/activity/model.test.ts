import { cloneJournal, emptyJournal, journalSchema } from './model';
import { attempt, input, owner, uuid } from '../../../test-support/journal';

function fixture() {
  const journal = emptyJournal(owner);
  journal.records[uuid(1)] = {
    attempt: attempt(),
    version: 1,
    phoneVersion: 1,
    serverVersion: 0,
    serverRevision: 0,
    created: false,
    rejected: null,
  };
  journal.operations.push({
    id: uuid(1),
    attemptId: uuid(1),
    version: 1,
    state: 'pending',
    failures: 0,
    dueAt: 0,
    code: null,
    requestId: null,
    kind: 'create',
    input: input(),
  });
  journal.summaryAdditions.push(uuid(1));
  journal.calendarAdditions.push(uuid(1));
  return journal;
}
it('validates a committed envelope and isolates cloned updates', () => {
  const journal = journalSchema.parse(fixture());
  const cloned = cloneJournal(journal);
  cloned.records[uuid(1)]!.phoneVersion = 0;
  expect(journal.records[uuid(1)]!.phoneVersion).toBe(1);
});
it.each([
  (journal: ReturnType<typeof fixture>) => {
    journal.records[uuid(1)]!.phoneVersion = 2;
  },
  (journal: ReturnType<typeof fixture>) => {
    journal.records[uuid(1)]!.serverVersion = 2;
  },
  (journal: ReturnType<typeof fixture>) => {
    journal.records[uuid(1)]!.attempt.id = uuid(2);
  },
  (journal: ReturnType<typeof fixture>) => {
    journal.operations.push(journal.operations[0]!);
  },
  (journal: ReturnType<typeof fixture>) => {
    journal.operations[0]!.version = 2;
  },
  (journal: ReturnType<typeof fixture>) => {
    journal.operations[0]!.attemptId = uuid(2);
  },
  (journal: ReturnType<typeof fixture>) => {
    const op = journal.operations[0]!;
    if (op.kind === 'create') op.input.id = uuid(2);
  },
  (journal: ReturnType<typeof fixture>) => {
    const op = journal.operations[0]!;
    if (op.kind === 'create') op.input.challengeId = 'wrong';
  },
  (journal: ReturnType<typeof fixture>) => {
    journal.summaryAdditions.push(uuid(2));
  },
  (journal: ReturnType<typeof fixture>) => {
    journal.summaryAdditions.push(uuid(1));
  },
  (journal: ReturnType<typeof fixture>) => {
    journal.submissions[uuid(101)] = {
      attemptId: uuid(2),
      reflection: { text: 'Fixture' },
      version: 1,
      appliedRevision: null,
    };
  },
  (journal: ReturnType<typeof fixture>) => {
    journal.submissions[uuid(101)] = {
      attemptId: uuid(1),
      reflection: { text: 'Fixture' },
      version: 2,
      appliedRevision: null,
    };
  },
])(
  'rejects inconsistent ownership, versions, operations and aggregate references %#',
  (mutate) => {
    const journal = fixture();
    mutate(journal);
    expect(journalSchema.safeParse(journal).success).toBe(false);
  },
);

it('rejects cross-attempt reflection dependencies and mismatched receipt versions', () => {
  const journal = fixture();
  journal.records[uuid(1)]!.version = 2;
  journal.records[uuid(2)] = {
    ...journal.records[uuid(1)]!,
    attempt: attempt(2),
  };
  journal.submissions[uuid(101)] = {
    attemptId: uuid(1),
    reflection: { text: 'Fixture' },
    version: 2,
    appliedRevision: null,
  };
  journal.submissions[uuid(102)] = {
    attemptId: uuid(2),
    reflection: { text: 'Other fixture' },
    version: 1,
    appliedRevision: 1,
  };
  journal.operations.push({
    kind: 'patch',
    id: uuid(101),
    attemptId: uuid(1),
    version: 2,
    state: 'pending',
    failures: 0,
    dueAt: 0,
    code: null,
    requestId: null,
    input: {
      submissionId: uuid(101),
      expectedReflectionRevision: 0,
      reflection: { text: 'Fixture' },
    },
    bound: false,
    dependsOn: uuid(102),
  });
  expect(journalSchema.safeParse(journal).success).toBe(false);
  const op = journal.operations[1]!;
  if (op.kind === 'patch') op.dependsOn = uuid(1);
  expect(journalSchema.safeParse(journal).success).toBe(true);
  journal.submissions[uuid(101)]!.version = 1;
  expect(journalSchema.safeParse(journal).success).toBe(false);
});
