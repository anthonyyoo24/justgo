import { createICloudSync, type ICloudNativeModule } from './adapter';
import { ICLOUD_PREFERENCE_KEY, ICloudError, type ICloudStatus } from './model';

const owner = '11111111-1111-4111-8111-111111111111';
const generation = '22222222-2222-4222-8222-222222222222';
const nextGeneration = '33333333-3333-4333-8333-333333333333';
const id = '44444444-4444-4444-8444-444444444444';
const pin = 'a'.repeat(64);
const values = [{ id, value: JSON.stringify({ kind: 'synthetic', value: 1 }) }];
const page = {
  generation,
  revision: 'revision-1',
  wasReset: false,
  closed: false,
  records: values,
  cursor: 'opaque-token',
  hasMore: false,
};

function setup(saved?: { enabled: boolean; accountToken: string | null }) {
  const stored = new Map<string, string>();
  if (saved) stored.set(ICLOUD_PREFERENCE_KEY, JSON.stringify(saved));
  const storage = {
    getItem: jest.fn(async (key: string) => stored.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      stored.set(key, value);
    }),
  };
  let listener = () => {};
  let state: ICloudStatus = {
    status: 'available',
    accountToken: pin,
    enabled: false,
  };
  const remove = jest.fn();
  const native = {
    status: jest.fn(async () => JSON.stringify(state)),
    configure: jest.fn(async (enabled: boolean, expected: string | null) => {
      if (enabled && expected !== state.accountToken)
        throw new Error('JUSTGO_ICLOUD_ACCOUNT_CHANGED');
      state = { ...state, enabled };
      return JSON.stringify({ enabled });
    }),
    read: jest.fn(async () => JSON.stringify(page)),
    write: jest.fn(async () => JSON.stringify({ generation })),
    reset: jest.fn(async () => JSON.stringify({ generation: nextGeneration })),
    resetIfUnchanged: jest.fn(async () =>
      JSON.stringify({ generation: nextGeneration }),
    ),
    close: jest.fn(async () => JSON.stringify({ generation: nextGeneration })),
    purge: jest.fn(async () =>
      JSON.stringify({
        generation: nextGeneration,
        cursor: 'purge-token',
        hasMore: false,
      }),
    ),
    addListener: jest.fn((_event: string, callback: () => void) => {
      listener = callback;
      return { remove };
    }),
  } satisfies ICloudNativeModule;
  return {
    sync: createICloudSync(native, storage),
    native,
    storage,
    stored,
    remove,
    changeAccount() {
      state = { ...state, accountToken: 'b'.repeat(64), enabled: false };
      listener();
    },
    setStatus(status: ICloudStatus) {
      state = status;
    },
  };
}

it('defaults off without native reads or uploads and persists an explicit enabled choice', async () => {
  const { sync, native, stored } = setup();
  await expect(sync.read({ collection: 'guest' })).rejects.toMatchObject({
    code: 'DISABLED',
  });
  expect(native.read).not.toHaveBeenCalled();
  expect(native.configure).not.toHaveBeenCalled();
  await sync.setEnabled(true);
  expect(native.configure).toHaveBeenCalledWith(true, pin);
  expect(JSON.parse(stored.get(ICLOUD_PREFERENCE_KEY)!)).toEqual({
    enabled: true,
    accountToken: pin,
  });
  await expect(sync.read({ collection: `account:${owner}` })).resolves.toEqual(
    page,
  );
  expect(native.read).toHaveBeenCalledWith(`account:${owner}`, null);
  sync.dispose();
});

it('reopens only the pinned Apple account and never silently enables a different account', async () => {
  const same = setup({ enabled: true, accountToken: pin });
  await expect(same.sync.status()).resolves.toMatchObject({ enabled: true });
  same.sync.dispose();
  const changed = setup({ enabled: true, accountToken: 'b'.repeat(64) });
  await expect(changed.sync.status()).resolves.toMatchObject({
    enabled: false,
  });
  expect(JSON.parse(changed.stored.get(ICLOUD_PREFERENCE_KEY)!)).toEqual({
    enabled: false,
    accountToken: null,
  });
  expect(changed.native.read).not.toHaveBeenCalled();
  changed.sync.dispose();
});

it('disables immediately on account change, fences in-flight reads and requires explicit re-enable', async () => {
  const { sync, native, changeAccount, stored } = setup();
  await sync.setEnabled(true);
  let release!: (value: string) => void;
  native.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const reading = sync.read({ collection: 'guest' });
  await Promise.resolve();
  const notified = jest.fn();
  const unsubscribe = sync.subscribe(notified);
  changeAccount();
  release(JSON.stringify(page));
  await expect(reading).rejects.toMatchObject({ code: 'DISABLED' });
  await expect(
    sync.write({ collection: 'guest', generation, records: values }),
  ).rejects.toMatchObject({ code: 'DISABLED' });
  expect(native.write).not.toHaveBeenCalled();
  expect(notified).toHaveBeenCalledTimes(1);
  await Promise.resolve();
  expect(JSON.parse(stored.get(ICLOUD_PREFERENCE_KEY)!)).toEqual({
    enabled: false,
    accountToken: null,
  });
  await sync.setEnabled(true);
  expect(native.configure).toHaveBeenLastCalledWith(true, 'b'.repeat(64));
  unsubscribe();
  sync.dispose();
});

it('toggle off cancels native work and rejects stale acknowledgements without deleting local data', async () => {
  const { sync, native, stored } = setup();
  await sync.setEnabled(true);
  let release!: (value: string) => void;
  native.write.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const writing = sync.write({
    collection: 'guest',
    generation,
    records: values,
  });
  await Promise.resolve();
  await sync.setEnabled(false);
  release(JSON.stringify({ generation }));
  await expect(writing).rejects.toMatchObject({ code: 'DISABLED' });
  expect(native.configure).toHaveBeenLastCalledWith(false, null);
  expect(JSON.parse(stored.get(ICLOUD_PREFERENCE_KEY)!)).toEqual({
    enabled: false,
    accountToken: null,
  });
  sync.dispose();
});

it.each([
  { collection: 'another-collection', generation, records: values },
  { collection: 'guest', generation: 'not-a-generation', records: values },
  { collection: 'guest', generation, records: [] },
  { collection: 'guest', generation, records: [...values, ...values] },
  {
    collection: 'guest',
    generation,
    records: Array.from({ length: 51 }, (_, i) => ({
      id: `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`,
      value: '{}',
    })),
  },
  { collection: 'guest', generation, records: [{ id, value: 'not-json' }] },
  {
    collection: 'guest',
    generation,
    records: [{ id, value: JSON.stringify('😀'.repeat(20_000)) }],
  },
])(
  'rejects malformed/oversized write before native I/O (%#)',
  async (input) => {
    const { sync, native } = setup();
    await sync.setEnabled(true);
    await expect(
      sync.write(input as Parameters<typeof sync.write>[0]),
    ).rejects.toMatchObject({ code: 'INVALID_DATA' });
    expect(native.write).not.toHaveBeenCalled();
    sync.dispose();
  },
);

it('keeps generation reset separate from resumable physical cleanup', async () => {
  const { sync, native } = setup();
  await sync.setEnabled(true);
  await expect(
    sync.reset({ collection: 'guest', generation }),
  ).resolves.toEqual({ generation: nextGeneration });
  expect(native.purge).not.toHaveBeenCalled();
  await expect(
    sync.purge({ collection: 'guest', generation: nextGeneration }),
  ).resolves.toEqual({
    generation: nextGeneration,
    cursor: 'purge-token',
    hasMore: false,
  });
  expect(native.purge).toHaveBeenCalledWith('guest', nextGeneration, null);
  await sync.read({ collection: 'guest', cursor: 'opaque-token' });
  expect(native.read).toHaveBeenLastCalledWith('guest', 'opaque-token');
  sync.dispose();
});

it('exposes permanent account closure and refuses closing the shared guest collection', async () => {
  const { sync, native } = setup();
  await sync.setEnabled(true);
  await expect(
    sync.close({ collection: 'guest', generation }),
  ).rejects.toMatchObject({ code: 'INVALID_DATA' });
  expect(native.close).not.toHaveBeenCalled();
  await expect(
    sync.close({ collection: `account:${owner}`, generation }),
  ).resolves.toEqual({ generation: nextGeneration });
  expect(native.close).toHaveBeenCalledWith(`account:${owner}`, generation);
  native.read.mockResolvedValueOnce(
    JSON.stringify({ ...page, closed: true, records: [] }),
  );
  await expect(
    sync.read({ collection: `account:${owner}` }),
  ).resolves.toMatchObject({ closed: true });
  sync.dispose();
});

it.each([
  'QUOTA_EXCEEDED',
  'STALE_GENERATION',
  'CURSOR_EXPIRED',
  'CONFLICT',
] as const)(
  'exposes %s without provider detail and permits retry',
  async (code) => {
    const { sync, native } = setup();
    await sync.setEnabled(true);
    native.read.mockRejectedValueOnce(
      new Error(`JUSTGO_ICLOUD_${code}: synthetic provider details`),
    );
    const failure = await sync
      .read({ collection: 'guest' })
      .catch((error: unknown) => error);
    expect(failure).toEqual(new ICloudError(code));
    await expect(sync.read({ collection: 'guest' })).resolves.toEqual(page);
    sync.dispose();
  },
);

it('refuses corrupt native pages, changed upload generation and a reset that did not advance', async () => {
  const { sync, native } = setup();
  await sync.setEnabled(true);
  native.read.mockResolvedValueOnce(
    JSON.stringify({ ...page, records: [...values, ...values] }),
  );
  await expect(sync.read({ collection: 'guest' })).rejects.toMatchObject({
    code: 'INVALID_DATA',
  });
  native.write.mockResolvedValueOnce(
    JSON.stringify({ generation: nextGeneration }),
  );
  await expect(
    sync.write({ collection: 'guest', generation, records: values }),
  ).rejects.toMatchObject({ code: 'STALE_GENERATION' });
  native.reset.mockResolvedValueOnce(JSON.stringify({ generation }));
  await expect(
    sync.reset({ collection: 'guest', generation }),
  ).rejects.toMatchObject({ code: 'INVALID_DATA' });
  sync.dispose();
});

it('does not leave sync enabled when saving the explicit choice fails', async () => {
  const { sync, native, storage } = setup();
  storage.setItem.mockRejectedValueOnce(new Error('synthetic device failure'));
  await expect(sync.setEnabled(true)).rejects.toMatchObject({
    code: 'UNAVAILABLE',
  });
  expect(native.configure).toHaveBeenLastCalledWith(false, null);
  await expect(sync.read({ collection: 'guest' })).rejects.toMatchObject({
    code: 'DISABLED',
  });
  sync.dispose();
});

it('returns honest unsupported behavior without a native module and cleans up listeners on disposal', async () => {
  const original = setup();
  const web = createICloudSync(null, original.storage);
  await expect(web.status()).resolves.toEqual({
    status: 'unsupported',
    accountToken: null,
    enabled: false,
  });
  await expect(web.setEnabled(true)).rejects.toMatchObject({
    code: 'UNSUPPORTED',
  });
  await expect(web.read({ collection: 'guest' })).rejects.toMatchObject({
    code: 'UNSUPPORTED',
  });
  await web.setEnabled(false);
  web.dispose();
  original.sync.dispose();
  expect(original.remove).toHaveBeenCalledTimes(1);
});

it('permits pinned cleanup with sync off without changing preference or admitting ordinary uploads', async () => {
  const { sync, native, stored } = setup();
  await sync.setEnabled(true);
  await sync.setEnabled(false);
  const preference = stored.get(ICLOUD_PREFERENCE_KEY);
  await sync.withMaintenance!(pin, async (access) => {
    await expect(sync.status()).resolves.toMatchObject({ enabled: false });
    await expect(
      sync.write({ collection: 'guest', generation, records: values }),
    ).rejects.toMatchObject({ code: 'DISABLED' });
    await expect(access.read({ collection: 'guest' })).resolves.toEqual(page);
    await access.reset({
      collection: 'guest',
      generation,
      expectedRevision: page.revision,
    });
    expect(native.resetIfUnchanged).toHaveBeenCalledWith(
      'guest',
      generation,
      page.revision,
    );
    await expect(sync.setEnabled(true)).rejects.toMatchObject({
      code: 'DISABLED',
    });
  });
  expect(stored.get(ICLOUD_PREFERENCE_KEY)).toBe(preference);
  expect(native.configure).toHaveBeenLastCalledWith(false, null);
  expect(native.write).not.toHaveBeenCalled();
  sync.dispose();
});

it('fences maintenance on Apple account change and never adopts the replacement account', async () => {
  const { sync, native, changeAccount } = setup();
  await expect(
    sync.withMaintenance!('b'.repeat(64), async () => {}),
  ).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
  await expect(
    sync.withMaintenance!(pin, async (access) => {
      changeAccount();
      await access.purge({ collection: 'guest', generation });
    }),
  ).rejects.toMatchObject({ code: 'DISABLED' });
  expect(native.purge).not.toHaveBeenCalled();
  await expect(sync.status()).resolves.toMatchObject({ enabled: false });
  sync.dispose();
});

it('restores the existing enabled choice after failed maintenance and refuses unsupported atomic reset', async () => {
  const { sync, native } = setup();
  await sync.setEnabled(true);
  await expect(
    sync.withMaintenance!(pin, async () => {
      throw new ICloudError('QUOTA_EXCEEDED');
    }),
  ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
  expect(native.configure).toHaveBeenLastCalledWith(true, pin);
  await expect(sync.status()).resolves.toMatchObject({ enabled: true });
  const { resetIfUnchanged: _unsupported, ...oldNative } = native;
  expect(_unsupported).toBeDefined();
  const older = createICloudSync(oldNative, {
    getItem: async () => null,
    setItem: async () => {},
  });
  await older.setEnabled(true);
  await expect(
    older.reset({
      collection: 'guest',
      generation,
      expectedRevision: 'snapshot',
    }),
  ).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  expect(native.reset).not.toHaveBeenCalled();
  older.dispose();
  sync.dispose();
});
