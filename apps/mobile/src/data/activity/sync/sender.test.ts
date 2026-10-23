import { AccountRepository } from '../repository';
import { ApiError } from '../../../lib/network/http';
import { journalSchema } from '../model';
import {
  memoryLocalJournal,
  memoryJournalBackend,
} from '../../../../test-support/local-journal';
import { sparseRetryDelay } from './retry';
import {
  MemoryStorage,
  backend,
  card,
  deferred,
  input,
  owner,
  today,
  uuid,
  zone,
  attempt,
} from '../../../../test-support/journal';

const repos: AccountRepository[] = [];
beforeEach(() =>
  jest.useFakeTimers().setSystemTime(new Date(`${today}T14:00:00Z`)),
);
afterEach(async () => {
  repos.forEach((repo) => repo.dispose());
  repos.length = 0;
  await jest.advanceTimersByTimeAsync(0);
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
async function setup() {
  const storage = new MemoryStorage();
  const transport = backend();
  const repo = new AccountRepository({
    accountId: owner,
    localJournal: memoryLocalJournal(owner, storage),
    storage,
    transport,
    today,
    timeZone: zone,
    random: () => 0.5,
  });
  repos.push(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.hydrate();
  return { repo, storage, transport };
}
async function send(repo: AccountRepository) {
  repo.setEnvironment({ active: true, online: true });
  await repo.synchronize();
}
const journal = (repo: AccountRepository) => repo.store.getState().journal;

it('keeps private saves and rapid edits local while sending one completion', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), {
    feeling: 'a_little_better',
    text: 'First fixture',
  });
  await repo.submitReflection(uuid(1), uuid(102), { text: 'Second fixture' });
  await repo.submitReflection(uuid(1), uuid(103), { text: 'Third fixture' });
  await send(repo);
  expect(transport.calls).toEqual([`create:${uuid(1)}`]);
  expect(transport.records.get(uuid(1))?.reflection).toBeNull();
  expect(repo.getAttempt(uuid(1))?.reflection).toMatchObject({
    text: 'Third fixture',
    revision: 3,
  });
  expect(journal(repo).operations).toHaveLength(0);
});
it('replays a lost completion response without duplicate reps or uploading the local journal', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Local fixture' });
  const create = transport.create;
  let lost = true;
  transport.create = async (body, signal) => {
    const result = await create(body, signal);
    if (lost) {
      lost = false;
      throw new ApiError('TIMEOUT');
    }
    return result;
  };
  await send(repo);
  await jest.advanceTimersByTimeAsync(2000);
  expect(transport.calls).toEqual([`create:${uuid(1)}`, `create:${uuid(1)}`]);
  expect(transport.records.size).toBe(1);
  expect(transport.records.get(uuid(1))?.reflection).toBeNull();
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe('Local fixture');
  expect(journal(repo).operations).toHaveLength(0);
});
it('replays completion after an interrupted acknowledgement while the separate journal survives', async () => {
  const { repo, transport, storage } = await setup();
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'Durable private fixture',
  });
  const create = transport.create;
  transport.create = async (body, signal) => {
    const result = await create(body, signal);
    storage.fail = true;
    return result;
  };
  await send(repo);
  expect(
    journalSchema.parse(
      JSON.parse(storage.values.get(`justgo:v1:${owner}:journal`)!),
    ).operations[0]?.kind,
  ).toBe('create');
  repo.dispose();
  storage.fail = false;
  transport.create = create;
  const reopened = new AccountRepository({
    accountId: owner,
    storage,
    transport,
    today,
    timeZone: zone,
    localJournal: memoryLocalJournal(owner, storage),
  });
  repos.push(reopened);
  await reopened.hydrate();
  await reopened.synchronize();
  expect(transport.records.size).toBe(1);
  expect(transport.records.get(uuid(1))?.reflection).toBeNull();
  expect(reopened.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Durable private fixture',
  );
  expect(journal(reopened).operations).toHaveLength(0);
});
it('does not fall back to private uploads when the journal commit fails', async () => {
  const { repo, transport, storage } = await setup();
  await repo.complete(input(), card);
  await send(repo);
  memoryJournalBackend(storage).failCommit = true;
  await expect(
    repo.submitReflection(uuid(1), uuid(101), { text: 'Uncommitted fixture' }),
  ).rejects.toMatchObject({ code: 'STORAGE' });
  await jest.advanceTimersByTimeAsync(600_000);
  expect(transport.calls).toEqual([`create:${uuid(1)}`]);
  expect(repo.getAttempt(uuid(1))?.reflection).toBeNull();
  memoryJournalBackend(storage).failCommit = false;
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'Uncommitted fixture',
  });
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Uncommitted fixture',
  );
  expect(transport.records.get(uuid(1))?.reflection).toBeNull();
});
it('ignores legacy private operations even when migration has not retired them', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  const old = journal(repo);
  old.operations.unshift({
    id: uuid(101),
    attemptId: uuid(1),
    kind: 'patch',
    version: 1,
    state: 'pending',
    failures: 0,
    dueAt: 0,
    code: null,
    requestId: null,
    bound: true,
    dependsOn: null,
    input: {
      submissionId: uuid(101),
      expectedReflectionRevision: 0,
      reflection: { text: 'Legacy pending fixture' },
    },
  });
  old.submissions[uuid(101)] = {
    attemptId: uuid(1),
    reflection: { text: 'Legacy pending fixture' },
    version: 1,
    appliedRevision: null,
  };
  await send(repo);
  await jest.advanceTimersByTimeAsync(600_000);
  expect(transport.calls).toEqual([`create:${uuid(1)}`]);
  expect(jest.getTimerCount()).toBe(0);
});
it('preserves newer local writing when a delayed completion response arrives', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  const pending = deferred<ReturnType<typeof attempt>>();
  transport.create = async () => pending.promise;
  repo.setEnvironment({ active: true, online: true });
  await jest.advanceTimersByTimeAsync(0);
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'Newer local fixture',
  });
  pending.resolve(attempt());
  await repo.synchronize();
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Newer local fixture',
  );
  expect(journal(repo).operations).toHaveLength(0);
});
it('completion fallback remains independent of a durable private journal when the cache is full', async () => {
  const { repo, transport, storage } = await setup();
  storage.fail = true;
  repo.setEnvironment({ active: true, online: true });
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Local fixture' });
  expect(transport.records.size).toBe(1);
  expect(journal(repo).records[uuid(1)]).toMatchObject({
    phoneVersion: 0,
    serverVersion: 1,
  });
  expect(repo.store.getState().warning).toBeNull();
  expect(transport.records.get(uuid(1))?.reflection).toBeNull();
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe('Local fixture');
  storage.fail = false;
  await jest.advanceTimersByTimeAsync(30_000);
  expect(journal(repo).records[uuid(1)]?.phoneVersion).toBe(1);
});
it('recovers after a prolonged outage while connectivity and foreground remain unchanged', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  const create = transport.create;
  let outage = true;
  const times: number[] = [];
  transport.create = async (body, signal) => {
    times.push(Date.now());
    if (outage) throw new ApiError('UNAVAILABLE');
    return create(body, signal);
  };
  const start = Date.now();
  await send(repo);
  await jest.advanceTimersByTimeAsync(7000);
  expect(times.map((n) => n - start)).toEqual([0, 2000, 7000]);
  for (let n = 0; n < 5; n++)
    repo.setEnvironment({ active: true, online: true });
  await jest.advanceTimersByTimeAsync(29_999);
  expect(times).toHaveLength(3);
  outage = false;
  await jest.advanceTimersByTimeAsync(1);
  expect(times.map((n) => n - start)).toEqual([0, 2000, 7000, 37000]);
  expect(journal(repo).operations).toHaveLength(0);
});
it('honors Retry-After and retains cooldown through reconnect/foreground event storms', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  const create = transport.create;
  let count = 0;
  transport.create = async (body, signal) => {
    count++;
    if (count === 1)
      throw new ApiError('RATE_LIMITED', 'fixture', undefined, 60_000);
    return create(body, signal);
  };
  await send(repo);
  for (let n = 0; n < 10; n++) {
    repo.setEnvironment({ active: false, online: false });
    repo.setEnvironment({ active: true, online: true });
  }
  await jest.advanceTimersByTimeAsync(59_999);
  expect(count).toBe(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(count).toBe(2);
  expect(journal(repo).operations).toHaveLength(0);
});
it('uses increasing sparse cooldowns with bounded jitter and a finite cap', async () => {
  expect(sparseRetryDelay(0, () => 0)).toBe(24_000);
  expect(sparseRetryDelay(0, () => 1)).toBe(36_000);
  expect(sparseRetryDelay(1, () => 0.5)).toBe(60_000);
  expect(sparseRetryDelay(20, () => 1)).toBe(300_000);
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  const times: number[] = [];
  const start = Date.now();
  transport.create = async () => {
    times.push(Date.now() - start);
    throw new ApiError('NETWORK');
  };
  await send(repo);
  await jest.advanceTimersByTimeAsync(97_000);
  expect(times).toEqual([0, 2000, 7000, 37000, 97000]);
  repo.setEnvironment({ active: false, online: true });
  expect(jest.getTimerCount()).toBe(0);
  await jest.advanceTimersByTimeAsync(500_000);
  expect(times).toHaveLength(5);
  repo.setEnvironment({ active: true, online: false });
  expect(jest.getTimerCount()).toBe(0);
});
it.each([
  'INVALID_REQUEST',
  'REQUEST_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'NOT_FOUND',
  'CONFLICT',
  'ACCESS_REQUIRED',
])(
  'retains permanent %s failures without endless retries or network-save warning',
  async (code) => {
    const { repo, transport } = await setup();
    await repo.complete(input(), card);
    let count = 0;
    transport.create = async () => {
      count++;
      throw new ApiError(code as 'INVALID_REQUEST', 'safe-fixture');
    };
    await send(repo);
    await jest.advanceTimersByTimeAsync(600_000);
    expect(count).toBe(1);
    expect(journal(repo).operations[0]).toMatchObject({
      state: 'rejected',
      code,
    });
    expect(repo.store.getState().warning).toBeNull();
    expect(repo.getAttempt(uuid(1))).toBeDefined();
    expect(jest.getTimerCount()).toBe(0);
  },
);
it('excludes definitive rejected completions but preserves writing and lets independent entries send', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  await repo.complete(input(2), card);
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Retained fixture' });
  const create = transport.create;
  transport.create = async (body, signal) => {
    if (body.id === uuid(1)) throw new ApiError('ATTEMPT_INELIGIBLE');
    return create(body, signal);
  };
  await send(repo);
  expect(journal(repo).records[uuid(1)]?.rejected).toBe('ATTEMPT_INELIGIBLE');
  expect(journal(repo).summaryAdditions).toEqual([uuid(2)]);
  expect(journal(repo).calendarAdditions).toEqual([uuid(2)]);
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe('Retained fixture');
  expect(transport.records.size).toBe(1);
  await repo.rollover('2026-11-01', zone);
  expect(repo.getAttempt(uuid(1))).toBeDefined();
});
it.each([
  'UNAUTHORIZED',
  'SESSION_EXPIRED',
  'SESSION_REVOKED',
  'CREDENTIAL_REJECTED',
  'ACCOUNT_CHANGED',
])(
  'pauses %s work until same-account authentication recovery',
  async (code) => {
    const { repo, transport } = await setup();
    await repo.complete(input(), card);
    const create = transport.create;
    let count = 0;
    transport.create = async () => {
      count++;
      throw new ApiError(code as 'UNAUTHORIZED');
    };
    await send(repo);
    await jest.advanceTimersByTimeAsync(600_000);
    expect(count).toBe(1);
    expect(journal(repo).operations[0]?.state).toBe('auth');
    expect(jest.getTimerCount()).toBe(0);
    transport.create = create;
    repo.resumeAuthentication();
    await repo.synchronize();
    expect(journal(repo).operations).toHaveLength(0);
  },
);
it('bounds an unresponsive transport and ignores its late response after deactivation', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  const late = deferred<ReturnType<typeof attempt>>();
  transport.create = async () => late.promise;
  repo.setEnvironment({ active: true, online: true });
  await jest.advanceTimersByTimeAsync(10_000);
  expect(journal(repo).operations[0]).toMatchObject({
    code: 'TIMEOUT',
    failures: 1,
  });
  repo.setEnvironment({ active: false, online: false });
  late.resolve(attempt());
  await jest.advanceTimersByTimeAsync(0);
  expect(journal(repo).records[uuid(1)]?.created).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
});
it('a timed-out backend fallback is not reported as saved and retries with the original identity', async () => {
  const { repo, transport, storage } = await setup();
  storage.fail = true;
  let count = 0;
  const create = transport.create;
  transport.create = async (body, signal) => {
    count++;
    const result = await create(body, signal);
    if (count === 1) throw new ApiError('TIMEOUT');
    return result;
  };
  repo.setEnvironment({ active: true, online: true });
  await repo.complete(input(), card);
  expect(repo.store.getState().warning?.visible).toBe(true);
  expect(journal(repo).records[uuid(1)]?.serverVersion).toBe(0);
  await jest.advanceTimersByTimeAsync(2000);
  expect(transport.records.size).toBe(1);
  expect(repo.store.getState().warning).toBeNull();
  expect(repo.store.getState().recoverySequence).toBe(1);
});
it('chunks a Retry-After beyond the native timer limit without retrying early', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  const create = transport.create;
  let calls = 0;
  transport.create = async (body, signal) => {
    calls++;
    if (calls === 1)
      throw new ApiError('RATE_LIMITED', 'fixture', undefined, 3_000_000_000);
    return create(body, signal);
  };
  await send(repo);
  await jest.advanceTimersByTimeAsync(2_147_483_647);
  expect(calls).toBe(1);
  await jest.advanceTimersByTimeAsync(852_516_353);
  expect(calls).toBe(2);
  expect(journal(repo).operations).toHaveLength(0);
});
