import { ActivityRuntime } from './activity-runtime';
import { AccountClient } from '../../lib/account-client';
import { createHttpClient } from '../../lib/http';
import { journalSchema } from '../../data/activity/model';
import {
  MemoryStorage,
  card,
  input,
  deferred,
  owner,
  otherOwner,
} from '../../../test-support/journal';
function createRuntime(storage = new MemoryStorage()) {
  const client = new AccountClient(createHttpClient('http://127.0.0.1:3000'), {
    current: () => null,
    renew: async () => {
      throw new Error('unused');
    },
    reject: () => {},
  });
  return { runtime: new ActivityRuntime(client, storage), client };
}
it('parks memory-only activity across identity changes and reuses the same repository on recovery', async () => {
  const storage = new MemoryStorage();
  storage.fail = true;
  const { runtime, client } = createRuntime(storage);
  runtime.setEnvironment({ active: true, online: false });
  runtime.changeAccount(owner);
  const first = runtime.getRepository()!;
  await first.complete(input(), card);
  expect(first.store.getState().warning?.visible).toBe(true);
  runtime.changeAccount(otherOwner);
  expect(first.store.getState().active).toBe(false);
  const second = runtime.getRepository()!;
  expect(second.getAttempt(input().id)).toBeUndefined();
  runtime.changeAccount(null);
  expect(runtime.getRepository()).toBeNull();
  runtime.changeAccount(owner);
  expect(runtime.getRepository()).toBe(first);
  expect(first.getAttempt(input().id)).toBeTruthy();
  runtime.dispose();
  expect(first.store.getState().active).toBe(false);
  client.changeAccount(null);
});

it('resumes hydrated auth-blocked submissions after a session becomes valid during a slow journal read', async () => {
  const storage = new MemoryStorage();
  const seed = createRuntime(storage);
  seed.runtime.setEnvironment({ active: true, online: false });
  seed.runtime.changeAccount(owner);
  await seed.runtime.getRepository()!.complete(input(), card);
  const key = `justgo:v1:${owner}:journal`;
  const journal = journalSchema.parse(JSON.parse(storage.values.get(key)!));
  journal.operations[0]!.state = 'auth';
  const raw = JSON.stringify(journal);
  seed.runtime.dispose();
  seed.client.changeAccount(null);
  const read = deferred<string | null>();
  jest.spyOn(storage, 'getItem').mockImplementationOnce(() => read.promise);
  const { runtime, client } = createRuntime(storage);
  try {
    runtime.setEnvironment({ active: true, online: false });
    runtime.changeAccount(owner);
    const repository = runtime.getRepository()!;
    runtime.resumeAuthentication();
    expect(repository.store.getState().ready).toBe(false);
    read.resolve(raw);
    await repository.hydrate();
    expect(repository.store.getState().journal.operations[0]?.state).toBe(
      'pending',
    );
  } finally {
    read.resolve(raw);
    runtime.dispose();
    client.changeAccount(null);
  }
});

it('defers renewed authentication while inactive and applies it only to the same foreground account', async () => {
  const { runtime, client } = createRuntime();
  runtime.setEnvironment({ active: true, online: false });
  runtime.changeAccount(owner);
  const first = runtime.getRepository()!;
  await first.complete(input(), card);
  const journal = structuredClone(first.store.getState().journal);
  journal.operations[0]!.state = 'auth';
  first.store.setState({ journal });
  runtime.setEnvironment({ active: false, online: false });
  expect(() => runtime.resumeAuthentication()).not.toThrow();
  expect(first.store.getState().journal.operations[0]?.state).toBe('auth');
  runtime.setEnvironment({ active: true, online: false });
  expect(first.store.getState().journal.operations[0]?.state).toBe('pending');
  journal.operations[0]!.state = 'auth';
  first.store.setState({ journal: structuredClone(journal) });
  runtime.setEnvironment({ active: false, online: false });
  runtime.resumeAuthentication();
  runtime.changeAccount(otherOwner);
  runtime.setEnvironment({ active: true, online: false });
  expect(first.store.getState().journal.operations[0]?.state).toBe('auth');
  expect(runtime.getRepository()?.accountId).toBe(otherOwner);
  runtime.dispose();
  runtime.resumeAuthentication();
  client.changeAccount(null);
});
