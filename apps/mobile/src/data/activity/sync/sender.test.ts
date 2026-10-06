import { AccountRepository } from '../repository';
import { ApiError } from '../../../lib/network/http';
import { journalSchema } from '../model';
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

it('orders a create, first reflection and two rapid explicit edits with acknowledged revisions', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), {
    feeling: 'a_little_better',
    text: 'First fixture',
  });
  await repo.submitReflection(uuid(1), uuid(102), { text: 'Second fixture' });
  await repo.submitReflection(uuid(1), uuid(103), { text: 'Third fixture' });
  const patch = transport.patch;
  const revisions: number[] = [];
  transport.patch = async (id, body, signal) => {
    revisions.push(body.expectedReflectionRevision);
    return patch(id, body, signal);
  };
  await send(repo);
  expect(transport.calls).toEqual([
    `create:${uuid(1)}`,
    `patch:${uuid(101)}`,
    `patch:${uuid(102)}`,
    `patch:${uuid(103)}`,
  ]);
  expect(revisions).toEqual([0, 1, 2]);
  expect(transport.records.size).toBe(1);
  expect(repo.getAttempt(uuid(1))?.reflection).toMatchObject({
    text: 'Third fixture',
    revision: 3,
  });
  expect(journal(repo).operations).toHaveLength(0);
});
it('replays lost create/patch responses unchanged, without duplicate reps or revisions', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Fixture' });
  const create = transport.create;
  const patch = transport.patch;
  let createLost = true;
  let patchLost = true;
  transport.create = async (body, signal) => {
    const result = await create(body, signal);
    if (createLost) {
      createLost = false;
      throw new ApiError('TIMEOUT');
    }
    return result;
  };
  transport.patch = async (id, body, signal) => {
    const result = await patch(id, body, signal);
    if (patchLost) {
      patchLost = false;
      throw new ApiError('TIMEOUT');
    }
    return result;
  };
  await send(repo);
  expect(transport.calls).toEqual([`create:${uuid(1)}`]);
  await jest.advanceTimersByTimeAsync(2000);
  expect(transport.calls).toEqual([
    `create:${uuid(1)}`,
    `create:${uuid(1)}`,
    `patch:${uuid(101)}`,
  ]);
  await jest.advanceTimersByTimeAsync(2000);
  expect(transport.records.size).toBe(1);
  expect(transport.records.get(uuid(1))?.reflection?.revision).toBe(1);
  expect(journal(repo).operations).toHaveLength(0);
});
it('survives termination after a server response but before the acknowledgement write', async () => {
  const { repo, transport, storage } = await setup();
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Fixture' });
  const create = transport.create;
  transport.create = async (body, signal) => {
    const canonical = await create(body, signal);
    storage.fail = true;
    return canonical;
  };
  // Pause after create so the failed ack write cannot be mistaken for a durable receipt.
  const patchGate = deferred<Awaited<ReturnType<typeof transport.patch>>>();
  const patch = transport.patch;
  transport.patch = async () => patchGate.promise;
  repo.setEnvironment({ active: true, online: true });
  await jest.advanceTimersByTimeAsync(0);
  expect(
    journalSchema.parse(
      JSON.parse(storage.values.get(`justgo:v1:${owner}:journal`)!),
    ).operations[0]?.kind,
  ).toBe('create');
  repo.dispose();
  await jest.advanceTimersByTimeAsync(0);
  storage.fail = false;
  transport.create = create;
  transport.patch = patch;
  const reopened = new AccountRepository({
    accountId: owner,
    storage,
    transport,
    today,
    timeZone: zone,
  });
  repos.push(reopened);
  await reopened.hydrate();
  await reopened.synchronize();
  expect(transport.records.size).toBe(1);
  expect(transport.records.get(uuid(1))?.reflection?.text).toBe('Fixture');
  expect(journal(reopened).operations).toHaveLength(0);
  patchGate.resolve({
    attempt: attempt(),
    acknowledgement: { submissionId: uuid(101), appliedRevision: 1 },
  });
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
it('online server fallback establishes durability while phone storage continues failing', async () => {
  const { repo, transport, storage } = await setup();
  storage.fail = true;
  repo.setEnvironment({ active: true, online: true });
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Cloud fixture' });
  expect(transport.records.size).toBe(1);
  expect(journal(repo).records[uuid(1)]).toMatchObject({
    phoneVersion: 0,
    serverVersion: 2,
  });
  expect(repo.store.getState().warning).toBeNull();
  storage.fail = false;
  await jest.advanceTimersByTimeAsync(30_000);
  expect(journal(repo).operations).toHaveLength(0);
  expect(journal(repo).records[uuid(1)]?.phoneVersion).toBe(2);
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
it('automatically adopts backend state and settles the superseded conflict chain across restart', async () => {
  const { repo, transport, storage } = await setup();
  await repo.complete(input(), card);
  await send(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Stale fixture' });
  await repo.submitReflection(uuid(1), uuid(102), {
    text: 'Queued stale fixture',
  });
  transport.records.set(uuid(1), {
    ...attempt(),
    reflection: { feeling: null, text: 'Backend fixture', revision: 3 },
  });
  await send(repo);
  expect(repo.getAttempt(uuid(1))?.reflection).toEqual({
    feeling: null,
    text: 'Backend fixture',
    revision: 3,
  });
  expect(journal(repo).operations).toHaveLength(0);
  expect(repo.store.getState().warning).toBeNull();
  repo.dispose();
  const reopened = new AccountRepository({
    accountId: owner,
    storage,
    transport,
    today,
    timeZone: zone,
  });
  repos.push(reopened);
  reopened.setEnvironment({ active: true, online: false });
  await reopened.hydrate();
  expect(reopened.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Backend fixture',
  );
  expect(journal(reopened).operations).toHaveLength(0);
});
it('retains a genuine new submission made while conflict recovery is in flight', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  await send(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'Conflicting fixture',
  });
  const canonical = {
    ...attempt(),
    reflection: { feeling: null, text: 'Backend fixture', revision: 3 },
  };
  transport.records.set(uuid(1), canonical);
  const late = deferred<never>();
  const patch = transport.patch;
  let first = true;
  transport.patch = async (id, body, signal) => {
    if (first) {
      first = false;
      return late.promise;
    }
    return patch(id, body, signal);
  };
  repo.setEnvironment({ active: true, online: true });
  await jest.advanceTimersByTimeAsync(0);
  await repo.submitReflection(uuid(1), uuid(102), {
    text: 'Newer explicit fixture',
  });
  late.reject(new ApiError('REFLECTION_CONFLICT', 'fixture', canonical));
  await repo.synchronize();
  expect(repo.getAttempt(uuid(1))?.reflection).toMatchObject({
    text: 'Newer explicit fixture',
    revision: 4,
  });
  expect(journal(repo).operations).toHaveLength(0);
});
it('does not settle a conflict without authoritative canonical data', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  await send(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Retained fixture' });
  transport.patch = async () => {
    throw new ApiError('REFLECTION_CONFLICT');
  };
  await send(repo);
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe('Retained fixture');
  expect(journal(repo).operations[0]?.state).toBe('pending');
});

it('reconstructs the original patch revision after cloud saving and an unwritable acknowledgement are interrupted', async () => {
  const { repo, transport, storage } = await setup();
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), {
    text: 'First accepted fixture',
  });
  await repo.submitReflection(uuid(1), uuid(102), {
    text: 'Second accepted fixture',
  });
  const create = transport.create;
  const patch = transport.patch;
  transport.create = async (body, signal) => {
    const result = await create(body, signal);
    storage.fail = true;
    return result;
  };
  transport.patch = async (id, body, signal) => {
    const result = await patch(id, body, signal);
    if (body.submissionId === uuid(102))
      repo.setEnvironment({ active: false, online: false });
    return result;
  };
  await send(repo);
  expect(transport.records.get(uuid(1))?.reflection?.revision).toBe(2);
  repo.dispose();
  storage.fail = false;
  transport.create = create;
  transport.patch = patch;
  const reopened = new AccountRepository({
    accountId: owner,
    storage,
    transport,
    today,
    timeZone: zone,
  });
  repos.push(reopened);
  await reopened.hydrate();
  await reopened.synchronize();
  expect(journal(reopened).operations).toHaveLength(0);
  expect(transport.records.get(uuid(1))?.reflection).toMatchObject({
    text: 'Second accepted fixture',
    revision: 2,
  });
});

it('does not send a dependent patch before the normal acknowledgement write finishes', async () => {
  const { repo, transport, storage } = await setup();
  await repo.complete(input(), card);
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Fixture' });
  const create = transport.create;
  const ack = deferred<void>();
  transport.create = async (body, signal) => {
    const result = await create(body, signal);
    storage.blocked = ack;
    return result;
  };
  repo.setEnvironment({ active: true, online: true });
  const sending = repo.synchronize();
  await jest.advanceTimersByTimeAsync(0);
  expect(transport.calls).toEqual([`create:${uuid(1)}`]);
  ack.resolve();
  storage.blocked = null;
  await sending;
  expect(transport.calls).toEqual([`create:${uuid(1)}`, `patch:${uuid(101)}`]);
});
it('a reflection rejection retains accepted completion credit and safe diagnostics', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  await send(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Retained fixture' });
  transport.patch = async () => {
    throw new ApiError('INVALID_REQUEST', 'redacted-request-id');
  };
  await send(repo);
  expect(journal(repo).records[uuid(1)]?.rejected).toBeNull();
  expect(journal(repo).summaryAdditions).toContain(uuid(1));
  expect(journal(repo).operations[0]).toMatchObject({
    state: 'rejected',
    code: 'INVALID_REQUEST',
    requestId: 'redacted-request-id',
  });
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe('Retained fixture');
});
it('does not let a delayed successful acknowledgement overwrite newer explicit reflection input', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  await send(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Older fixture' });
  const patch = transport.patch;
  const late = deferred<Awaited<ReturnType<typeof patch>>>();
  let first = true;
  transport.patch = async (id, body, signal) => {
    const result = await patch(id, body, signal);
    if (first) {
      first = false;
      return late.promise;
    }
    return result;
  };
  repo.setEnvironment({ active: true, online: true });
  await jest.advanceTimersByTimeAsync(0);
  await repo.submitReflection(uuid(1), uuid(102), { text: 'Newer fixture' });
  late.resolve({
    attempt: {
      ...attempt(),
      reflection: { feeling: null, text: 'Older fixture', revision: 1 },
    },
    acknowledgement: { submissionId: uuid(101), appliedRevision: 1 },
  });
  await repo.synchronize();
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe('Newer fixture');
  expect(transport.records.get(uuid(1))?.reflection?.revision).toBe(2);
});

it('sends an explicit changed correction with a new identity, preserving rejected writing and completion credit', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  await send(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.submitReflection(uuid(1), uuid(101), {
    feeling: 'a_little_better',
    text: 'Rejected fixture',
  });
  const patch = transport.patch;
  transport.patch = async () => {
    throw new ApiError('INVALID_REQUEST');
  };
  await send(repo);
  await expect(
    repo.correctReflection(uuid(101), uuid(102), {
      feeling: 'a_little_better',
      text: 'Rejected fixture',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  await expect(
    repo.correctReflection(uuid(101), uuid(102), { text: 'Rejected fixture' }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  await expect(
    repo.submitReflection(uuid(1), uuid(102), { text: 'Rejected fixture' }),
  ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  expect(journal(repo).submissions[uuid(102)]).toBeUndefined();
  transport.patch = patch;
  await Promise.all([
    repo.correctReflection(uuid(101), uuid(102), { text: 'Corrected fixture' }),
    repo.correctReflection(uuid(101), uuid(102), { text: 'Corrected fixture' }),
  ]);
  await repo.correctReflection(uuid(101), uuid(102), {
    text: 'Corrected fixture',
  });
  await repo.synchronize();
  expect(transport.records.get(uuid(1))?.reflection).toMatchObject({
    feeling: 'a_little_better',
    text: 'Corrected fixture',
    revision: 1,
  });
  expect(journal(repo).submissions[uuid(101)]?.reflection.text).toBe(
    'Rejected fixture',
  );
  expect(journal(repo).operations).toHaveLength(0);
  expect(journal(repo).records[uuid(1)]?.rejected).toBeNull();
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

it.each([0, 1])(
  'delivers an ordinary changed submission after rejection from server revision %s across restart',
  async (serverRevision) => {
    const { repo, storage, transport } = await setup();
    await repo.complete(input(), card);
    await send(repo);
    if (serverRevision) {
      await repo.submitReflection(uuid(1), uuid(100), {
        feeling: 'a_little_better',
        text: 'Accepted fixture',
      });
      await repo.synchronize();
    }
    repo.setEnvironment({ active: true, online: false });
    await repo.submitReflection(uuid(1), uuid(101), {
      ...(serverRevision ? {} : { feeling: 'a_little_better' as const }),
      text: 'Rejected fixture',
    });
    const patch = transport.patch;
    const requests: Parameters<typeof patch>[1][] = [];
    transport.patch = async (id, body, signal) => {
      requests.push(structuredClone(body));
      if (body.submissionId === uuid(101))
        throw new ApiError('INVALID_REQUEST');
      return patch(id, body, signal);
    };
    await send(repo);
    repo.setEnvironment({ active: true, online: false });
    await Promise.all([
      repo.submitReflection(uuid(1), uuid(102), { text: 'Corrected fixture' }),
      repo.submitReflection(uuid(1), uuid(102), { text: 'Corrected fixture' }),
    ]);
    repo.dispose();
    const restored = new AccountRepository({
      accountId: owner,
      storage,
      transport,
      today,
      timeZone: zone,
    });
    repos.push(restored);
    restored.setEnvironment({ active: true, online: false });
    await restored.hydrate();
    await send(restored);
    expect(requests).toEqual([
      {
        submissionId: uuid(101),
        expectedReflectionRevision: serverRevision,
        reflection: {
          ...(serverRevision ? {} : { feeling: 'a_little_better' }),
          text: 'Rejected fixture',
        },
      },
      {
        submissionId: uuid(102),
        expectedReflectionRevision: serverRevision,
        reflection: {
          ...(serverRevision ? {} : { feeling: 'a_little_better' }),
          text: 'Corrected fixture',
        },
      },
    ]);
    expect(transport.records.get(uuid(1))?.reflection).toEqual({
      feeling: 'a_little_better',
      text: 'Corrected fixture',
      revision: serverRevision + 1,
    });
    expect(journal(restored).submissions[uuid(101)]?.reflection.text).toBe(
      'Rejected fixture',
    );
    expect(journal(restored).submissions[uuid(102)]?.reflection).toEqual({
      text: 'Corrected fixture',
    });
    expect(journal(restored).operations).toHaveLength(0);
    expect(journal(restored).records[uuid(1)]?.rejected).toBeNull();
    expect(journal(restored).summaryAdditions).toContain(uuid(1));
  },
);

it('refuses to replace a reflection rejected for a different permanent cause', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  await send(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Retained fixture' });
  transport.patch = async () => {
    throw new ApiError('NOT_FOUND', 'redacted-request-id');
  };
  await send(repo);
  const before = journal(repo);
  await expect(
    repo.submitReflection(uuid(1), uuid(102), { text: 'Changed fixture' }),
  ).rejects.toMatchObject({
    code: 'CONFLICT',
    requestId: 'redacted-request-id',
  });
  expect(journal(repo)).toEqual(before);
});

it('protects newer queued writing from a stale correction and recovers through a new ordinary submission', async () => {
  const { repo, transport } = await setup();
  await repo.complete(input(), card);
  await send(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.submitReflection(uuid(1), uuid(101), { text: 'Rejected fixture' });
  const patch = transport.patch;
  transport.patch = async () => {
    throw new ApiError('INVALID_REQUEST');
  };
  await repo.submitReflection(uuid(1), uuid(102), {
    text: 'Newer ordinary submission',
  });
  await send(repo);
  repo.setEnvironment({ active: true, online: false });
  await expect(
    repo.correctReflection(uuid(101), uuid(103), { text: 'Stale correction' }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Newer ordinary submission',
  );
  expect(journal(repo).operations.map((op) => op.id)).toEqual([
    uuid(101),
    uuid(102),
  ]);
  transport.patch = patch;
  await repo.submitReflection(uuid(1), uuid(103), { text: 'Latest fixture' });
  await send(repo);
  expect(journal(repo).operations).toHaveLength(0);
  expect(repo.getAttempt(uuid(1))?.reflection?.text).toBe('Latest fixture');
  expect(transport.records.get(uuid(1))?.reflection).toMatchObject({
    text: 'Latest fixture',
    revision: 1,
  });
  expect(journal(repo).submissions[uuid(101)]?.reflection.text).toBe(
    'Rejected fixture',
  );
  expect(journal(repo).submissions[uuid(102)]?.reflection.text).toBe(
    'Newer ordinary submission',
  );
});
