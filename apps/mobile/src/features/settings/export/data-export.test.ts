import { readDataBackup } from '../../../data/backup/data-backup';
import { AccountRepository } from '../../../data/activity/repository';
import { collectExport } from './data-export';
import { ApiError } from '../../../lib/network/http';
import {
  MemoryStorage,
  backend,
  card,
  input,
  owner,
  today,
  uuid,
  zone,
  attempt,
  deferred,
} from '../../../../test-support/journal';

const resources: AccountRepository[] = [];
afterEach(() => resources.splice(0).forEach((repo) => repo.dispose()));
async function setup(kind: 'guest' | 'account' = 'guest', signedIn = false) {
  const repository = new AccountRepository({
    accountId: owner,
    storage: new MemoryStorage(),
    transport: backend(),
    today,
    timeZone: zone,
  });
  repository.setEnvironment({ active: true, online: false });
  repository.setDataMode(signedIn ? 'cloud' : 'local');
  await repository.hydrate();
  resources.push(repository);
  let owns = true;
  const client = {
    ownsCollection: () => owns,
    ownsAccount: () => signedIn && owns,
  };
  const signal = new AbortController();
  return {
    repository,
    client,
    signal,
    changeAccount: () => {
      owns = false;
    },
    collect: () =>
      collectExport({
        client,
        repository,
        ownerKind: kind,
        reduceMotion: false,
        haptics: true,
        signal: signal.signal,
      }),
  };
}

it('downloads the durable guest history, exact private writing and preferences without an account request', async () => {
  const ctx = await setup();
  const sync = jest.spyOn(ctx.repository, 'synchronize');
  await ctx.repository.complete(input(), card);
  await ctx.repository.submitReflection(uuid(1), uuid(10), {
    feeling: 'a_little_better',
    text: '=SUM(1,2)\n오늘 🌱, "quotes"',
  });
  const archive = await ctx.collect();
  expect(archive.name).toMatch(/^JustGO-data-[\dTZ-]+\.zip$/);
  const data = readDataBackup(archive.bytes, { kind: 'guest', id: owner });
  expect(data.attempts).toHaveLength(1);
  expect(data.journal.entries[0]?.reflection).toMatchObject({
    feeling: 'a_little_better',
    text: '=SUM(1,2)\n오늘 🌱, "quotes"',
  });
  expect(data.preferences).toEqual({ reduceMotion: false, haptics: true });
  expect(sync).not.toHaveBeenCalled();
});

it('refreshes the complete signed-in history before taking the local download snapshot', async () => {
  const ctx = await setup('account', true);
  const remote = Array.from({ length: 101 }, (_, index) => attempt(index + 20));
  const synchronize = jest
    .spyOn(ctx.repository, 'synchronize')
    .mockImplementation(async () => {
      await ctx.repository.mergeCompletions(remote);
    });
  const data = readDataBackup((await ctx.collect()).bytes, {
    kind: 'account',
    id: owner,
  });
  expect(synchronize).toHaveBeenCalledTimes(1);
  expect(data.attempts.map((value) => value.id).sort()).toEqual(
    remote.map((value) => value.id).sort(),
  );
});

it('allows a signed-out owner to download its phone snapshot without resuming uploads', async () => {
  const ctx = await setup('account', false);
  await ctx.repository.complete(input(), card);
  const sync = jest.spyOn(ctx.repository, 'synchronize');
  expect(
    readDataBackup((await ctx.collect()).bytes, { kind: 'account', id: owner })
      .attempts,
  ).toHaveLength(1);
  expect(sync).not.toHaveBeenCalled();
});

it('does not label an incomplete online account download successful after cloud history fails', async () => {
  const ctx = await setup('account', true);
  jest
    .spyOn(ctx.repository, 'synchronize')
    .mockRejectedValue(new ApiError('NETWORK'));
  await expect(ctx.collect()).rejects.toMatchObject({ code: 'NETWORK' });
});

it('fences the result of an old collection snapshot after an account change', async () => {
  const ctx = await setup();
  const pending =
    deferred<Awaited<ReturnType<AccountRepository['snapshotData']>>>();
  jest.spyOn(ctx.repository, 'snapshotData').mockReturnValue(pending.promise);
  const collecting = ctx.collect();
  await Promise.resolve();
  await Promise.resolve();
  ctx.changeAccount();
  pending.resolve({ attempts: [], journal: { entries: [], alternatives: [] } });
  await expect(collecting).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
});

it('rejects cancellation and unreadable storage before creating a download', async () => {
  const ctx = await setup();
  ctx.signal.abort();
  await expect(ctx.collect()).rejects.toMatchObject({ code: 'CANCELLED' });
  const broken = await setup();
  jest
    .spyOn(broken.repository, 'snapshotData')
    .mockRejectedValue(new ApiError('STORAGE'));
  await expect(broken.collect()).rejects.toMatchObject({ code: 'STORAGE' });
});
