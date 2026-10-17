import { strFromU8, unzipSync } from 'fflate';
import { exportPageSchema, type ExportPage } from '@justgo/contracts';
import {
  AccountClient,
  createQueryClient,
} from '../../../lib/network/account-client';
import { ApiError, createHttpClient } from '../../../lib/network/http';
import { AccountRepository } from '../../../data/activity/repository';
import { collectExport } from './data-export';
import { captureLocalExport } from '../../../data/activity/export';
import {
  MemoryStorage,
  backend,
  card,
  input,
  owner,
  otherOwner,
  today,
  uuid,
  zone,
  attempt,
  deferred,
} from '../../../../test-support/journal';

const resources: { repo: AccountRepository; client: AccountClient }[] = [];
afterEach(() => {
  resources.splice(0).forEach(({ repo, client }) => {
    repo.dispose();
    client.changeAccount(null);
  });
});
const page = (
  attempts: ExportPage['attempts'] = [],
  nextCursor: string | null = null,
): ExportPage => ({
  account: { id: owner, createdAt: `${today}T00:00:00.000Z` },
  devices: [],
  attempts,
  nextCursor,
});
const response = (data: unknown) => ({ ok: true, json: async () => data });
async function setup(
  fetcher: jest.Mock = jest.fn(async () => response(page())),
) {
  const repo = new AccountRepository({
    accountId: owner,
    storage: new MemoryStorage(),
    transport: backend(),
    today,
    timeZone: zone,
  });
  repo.setEnvironment({ active: true, online: false });
  await repo.hydrate();
  let userId = owner;
  const client = new AccountClient(
    createHttpClient('http://localhost:3000', fetcher),
    {
      current: () => ({ userId, token: 'b'.repeat(64) }),
      renew: async () => {
        throw new ApiError('UNAUTHORIZED');
      },
      reject: () => {},
    },
    createQueryClient(),
  );
  client.changeAccount(owner);
  resources.push({ repo, client });
  const controller = new AbortController();
  return {
    repo,
    client,
    fetcher,
    controller,
    collect: () =>
      collectExport({
        client,
        repository: repo,
        reduceMotion: true,
        haptics: false,
        signal: controller.signal,
      }),
    switchOwner: () => {
      userId = otherOwner;
      client.changeAccount(otherOwner);
    },
  };
}
function files(archive: Awaited<ReturnType<typeof collectExport>>) {
  const zip = unzipSync(archive.bytes);
  return {
    names: Object.keys(zip),
    csv: strFromU8(zip['activity.csv']!),
    json: JSON.parse(strFromU8(zip['data.json']!)),
    readme: strFromU8(zip['README.txt']!),
  };
}
it('produces a valid complete empty ZIP with metadata and a CSV header', async () => {
  const ctx = await setup();
  const archive = await ctx.collect();
  expect(archive.name).toMatch(/^JustGO-data-[\dTZ-]+\.zip$/);
  const result = files(archive);
  expect(result.names.sort()).toEqual([
    'README.txt',
    'activity.csv',
    'data.json',
  ]);
  expect(result.json).toMatchObject({
    formatVersion: 1,
    account: { id: owner },
    preferences: { reduceMotion: true, haptics: false },
    attempts: [],
    localChanges: [],
  });
  expect(result.csv).toContain('"reflection"');
  expect(result.readme).toContain('private');
  expect(JSON.stringify(result.json)).not.toContain('bbbbbbbb');
});
it('follows all pages instead of relying on the phone cache and sorts activity chronologically', async () => {
  const first = { ...attempt(1), startedAt: `${today}T14:00:00.000Z` };
  const second = {
    ...attempt(2),
    startedAt: '2024-11-03T05:30:00.123456Z',
    activityDate: '2024-11-03',
    startTimeZone: null,
  };
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(response(page([first], first.id)))
    .mockResolvedValueOnce(response(page([second])));
  const ctx = await setup(fetcher);
  const result = files(await ctx.collect());
  expect(result.json.attempts.map((x: { id: string }) => x.id)).toEqual([
    second.id,
    first.id,
  ]);
  expect(fetcher.mock.calls[1]?.[0]).toBe(
    'http://localhost:3000/v1/account/export?cursor=' + first.id,
  );
  expect(result.json.attempts[0].startTimeZone).toBeNull();
});
it('preserves online and pending versions, exact Unicode, quotes, multiline and formula text', async () => {
  const saved = {
    ...attempt(),
    reflection: {
      feeling: 'a_little_better' as const,
      text: 'Earlier note',
      revision: 1,
    },
  };
  const ctx = await setup(jest.fn(async () => response(page([saved]))));
  await ctx.repo.complete(input(), card);
  await ctx.repo.submitReflection(uuid(1), uuid(10), {
    feeling: 'a_lot_worse',
    text: '=HYPERLINK("x")\n오늘 🌱, "quotes"',
  });
  const journal = JSON.stringify(ctx.repo.store.getState().journal);
  const result = files(await ctx.collect());
  expect(result.json.attempts[0].reflection.text).toBe('Earlier note');
  expect(result.json.localChanges[0]).toMatchObject({
    status: 'pending_upload',
    attempt: {
      reflection: {
        feeling: 'a_lot_worse',
        text: '=HYPERLINK("x")\n오늘 🌱, "quotes"',
      },
    },
  });
  expect(result.csv).toContain('"\'=HYPERLINK(""x"")\n오늘 🌱, ""quotes"""');
  expect(result.csv).toContain('"cloud"');
  expect(result.csv).toContain('"pending_upload"');
  expect(JSON.stringify(ctx.repo.store.getState().journal)).toBe(journal);
});
it('captures local changes before an upload or edit can replace their export copy', async () => {
  const pending = deferred<ReturnType<typeof response>>();
  const ctx = await setup(jest.fn(() => pending.promise));
  await ctx.repo.complete(input(), card);
  await ctx.repo.submitReflection(uuid(1), uuid(10), {
    text: 'At export start',
  });
  const exporting = ctx.collect();
  await Promise.resolve();
  await ctx.repo.submitReflection(uuid(1), uuid(11), { text: 'Later edit' });
  pending.resolve(response(page()));
  expect(
    files(await exporting).json.localChanges[0].attempt.reflection.text,
  ).toBe('At export start');
});
it('labels locally rejected writes and omits acknowledged caches', async () => {
  const ctx = await setup();
  await ctx.repo.complete(input(), card);
  const state = ctx.repo.store.getState();
  const record = state.journal.records[uuid(1)]!;
  state.journal.operations[0]!.state = 'rejected';
  expect(captureLocalExport(state)[0]?.status).toBe('needs_attention');
  state.journal.operations = [];
  record.serverVersion = record.version;
  expect(captureLocalExport(state)).toEqual([]);
  record.rejected = 'INVALID_REQUEST';
  expect(captureLocalExport(state)[0]?.status).toBe('needs_attention');
});
it.each(['ready', 'hydrationError'] as const)(
  'fails clearly when local data is unreadable (%s)',
  async (field) => {
    const ctx = await setup();
    if (field === 'ready') ctx.repo.store.setState({ ready: false });
    else ctx.repo.store.setState({ hydrationError: 'unreadable' });
    await expect(ctx.collect()).rejects.toMatchObject({ code: 'STORAGE' });
    expect(ctx.fetcher).not.toHaveBeenCalled();
  },
);
it('does not create a partial file when a later page fails', async () => {
  const a = attempt();
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce(response(page([a], a.id)))
    .mockResolvedValue({
      ok: false,
      json: async () => ({ code: 'UNAVAILABLE', requestId: 'safe' }),
    });
  const ctx = await setup(fetcher);
  await expect(ctx.collect()).rejects.toMatchObject({ code: 'UNAVAILABLE' });
});
it.each(['duplicate', 'cursor', 'owner', 'secret'] as const)(
  'rejects unsafe/inconsistent server pages (%s)',
  async (fault) => {
    const a = attempt();
    const data = page([a]);
    if (fault === 'duplicate') data.attempts.push(a);
    if (fault === 'cursor') data.nextCursor = uuid(99);
    if (fault === 'owner') data.account.id = otherOwner;
    const payload = fault === 'secret' ? { ...data, token: 'private' } : data;
    const ctx = await setup(jest.fn(async () => response(payload)));
    await expect(ctx.collect()).rejects.toBeInstanceOf(ApiError);
    expect(exportPageSchema.safeParse(payload).success).toBe(
      fault !== 'secret',
    );
  },
);
it('stops on cancellation and account changes before sharing', async () => {
  const ctx = await setup();
  ctx.controller.abort();
  await expect(ctx.collect()).rejects.toMatchObject({ code: 'CANCELLED' });
  const switched = await setup();
  switched.switchOwner();
  await expect(switched.collect()).rejects.toMatchObject({
    code: 'ACCOUNT_CHANGED',
  });
  const parked = await setup();
  parked.repo.setEnvironment({ active: false, online: false });
  // AppState inactive is a pause in uploading, not loss of account ownership.
  expect(files(await parked.collect()).json.account.id).toBe(owner);
});
it('fences a late account response even when the fetcher ignores cancellation', async () => {
  const pending = deferred<ReturnType<typeof response>>();
  const ctx = await setup(jest.fn(() => pending.promise));
  const exporting = ctx.collect();
  const rejected = expect(exporting).rejects.toMatchObject({
    code: 'ACCOUNT_CHANGED',
  });
  await Promise.resolve();
  ctx.switchOwner();
  pending.resolve(response(page()));
  await rejected;
});
