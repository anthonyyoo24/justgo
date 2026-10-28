import type { JournalStorage } from '../model';
import {
  DeckPreferencesStorage,
  type DeckPreferences,
} from './deck-preferences';

const accountId = '11111111-1111-4111-8111-111111111111';
const otherAccount = '22222222-2222-4222-8222-222222222222';
const key = `justgo:v1:${accountId}:decks`;
const saved: DeckPreferences = {
  selected: 'park',
  orders: { streets: ['streets-2', 'streets-1'], park: ['park-1'] },
};

function envelope(value: Record<string, unknown> = {}): string {
  return JSON.stringify({ version: 1, accountId, ...saved, ...value });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(raw: string | null = null) {
  const storage = {
    getItem: jest
      .fn<
        ReturnType<JournalStorage['getItem']>,
        Parameters<JournalStorage['getItem']>
      >()
      .mockResolvedValue(raw),
    setItem: jest
      .fn<
        ReturnType<JournalStorage['setItem']>,
        Parameters<JournalStorage['setItem']>
      >()
      .mockResolvedValue(),
    removeItem: jest
      .fn<
        ReturnType<JournalStorage['removeItem']>,
        Parameters<JournalStorage['removeItem']>
      >()
      .mockResolvedValue(),
  };
  return {
    storage,
    preferences: new DeckPreferencesStorage(accountId, storage),
  };
}

it('hydrates only its account key once and returns independent snapshots', async () => {
  const { storage, preferences } = fixture(envelope());
  const restored = await preferences.read();
  expect(restored).toEqual(saved);
  restored?.orders.park?.push('changed-by-caller');
  await expect(preferences.read()).resolves.toEqual(saved);
  expect(storage.getItem).toHaveBeenCalledTimes(1);
  expect(storage.getItem).toHaveBeenCalledWith(key);
});

it('does not rewrite unchanged hydrated or successfully saved preferences', async () => {
  const { storage, preferences } = fixture(envelope());
  await preferences.read();
  preferences.save(saved);
  await preferences.settled();
  expect(storage.setItem).not.toHaveBeenCalled();
  const next: DeckPreferences = { selected: 'gym', orders: { gym: ['gym-1'] } };
  preferences.save(next);
  await preferences.settled();
  preferences.save(next);
  await preferences.settled();
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  await expect(preferences.read()).resolves.toEqual(next);
});

it('coalesces identical pending snapshots while preserving later changes back to an older value', async () => {
  const { storage, preferences } = fixture(envelope());
  await preferences.read();
  const write = deferred<void>();
  const started = deferred<void>();
  storage.setItem.mockImplementationOnce(() => {
    started.resolve();
    return write.promise;
  });
  const next: DeckPreferences = { selected: 'gym', orders: { gym: ['gym-1'] } };
  preferences.save(next);
  preferences.save(next);
  await started.promise;
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  // The pending changed value would replace the old phone state, so restoring
  // that older value must queue a write even though it is still on disk now.
  preferences.save(saved);
  preferences.save(saved);
  write.resolve();
  await preferences.settled();
  expect(storage.setItem.mock.calls).toEqual([
    [key, envelope(next)],
    [key, envelope()],
  ]);
  await expect(preferences.read()).resolves.toEqual(saved);
});

it('treats missing and unreadable state as optional and memoizes the failed read', async () => {
  const missing = fixture();
  await expect(missing.preferences.read()).resolves.toBeNull();
  const unreadable = fixture();
  unreadable.storage.getItem.mockRejectedValue(
    new Error('fixture storage error'),
  );
  await expect(unreadable.preferences.read()).resolves.toBeNull();
  await expect(unreadable.preferences.read()).resolves.toBeNull();
  expect(unreadable.storage.getItem).toHaveBeenCalledTimes(1);
});

it.each([
  ['malformed JSON', '{invalid'],
  ['unsupported version', envelope({ version: 2 })],
  ['foreign account', envelope({ accountId: otherAccount })],
  ['invalid account', envelope({ accountId: 'unknown' })],
  ['invalid root', 'null'],
  ['extra envelope data', envelope({ unexpected: true })],
  ['missing orders', envelope({ orders: undefined })],
  ['invalid order', envelope({ orders: { streets: 'streets-1' } })],
  ['unknown venue order', envelope({ orders: { beach: ['beach-1'] } })],
  ['empty placement', envelope({ orders: { streets: [''] } })],
  ['oversized placement', envelope({ orders: { streets: ['x'.repeat(81)] } })],
  ['duplicate placement', envelope({ orders: { park: ['park-1', 'park-1'] } })],
  [
    'duplicate placement across venues',
    envelope({ orders: { streets: ['shared-1'], park: ['shared-1'] } }),
  ],
])('discards %s without rejecting hydration', async (_reason, raw) => {
  const { preferences } = fixture(raw);
  await expect(preferences.read()).resolves.toBeNull();
});

it.each([undefined, null, 'beach'])(
  'defaults an unknown selected value (%s) to Streets',
  async (selected) => {
    const { preferences } = fixture(
      envelope({ selected, orders: { park: ['park-1'] } }),
    );
    await expect(preferences.read()).resolves.toEqual({
      selected: 'streets',
      orders: { park: ['park-1'] },
    });
  },
);

it('keeps a new save available immediately without reading older phone state', async () => {
  const { storage, preferences } = fixture(envelope());
  const next: DeckPreferences = { selected: 'gym', orders: { gym: ['gym-1'] } };
  preferences.save(next);
  next.orders.gym?.push('changed-by-caller');
  await expect(preferences.read()).resolves.toEqual({
    selected: 'gym',
    orders: { gym: ['gym-1'] },
  });
  expect(storage.getItem).not.toHaveBeenCalled();
  await preferences.settled();
  expect(storage.setItem).toHaveBeenCalledWith(
    key,
    envelope({ selected: 'gym', orders: { gym: ['gym-1'] } }),
  );
});

it('preserves a newer save when an older hydration response arrives', async () => {
  const { storage, preferences } = fixture();
  const read = deferred<string | null>();
  storage.getItem.mockReturnValue(read.promise);
  const restoring = preferences.read();
  const next: DeckPreferences = {
    selected: 'cafe',
    orders: { cafe: ['cafe-2'] },
  };
  preferences.save(next);
  read.resolve(envelope());
  await expect(restoring).resolves.toEqual(next);
  await expect(preferences.read()).resolves.toEqual(next);
  await preferences.settled();
});

it('serializes accepted writes so an older slow write cannot overwrite a newer deck', async () => {
  const { storage, preferences } = fixture();
  const firstWrite = deferred<void>();
  const started = deferred<void>();
  storage.setItem.mockImplementationOnce(() => {
    started.resolve();
    return firstWrite.promise;
  });
  preferences.save(saved);
  const next: DeckPreferences = {
    selected: 'park',
    orders: { park: ['park-2', 'park-1'] },
  };
  preferences.save(next);
  await started.promise;
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  await expect(preferences.read()).resolves.toEqual(next);
  firstWrite.resolve();
  await preferences.settled();
  expect(storage.setItem.mock.calls).toEqual([
    [key, envelope()],
    [key, envelope(next)],
  ]);
});

it('keeps in-memory changes and accepts later writes after optional phone saving fails', async () => {
  const { storage, preferences } = fixture();
  storage.setItem.mockRejectedValueOnce(new Error('fixture phone full'));
  preferences.save(saved);
  await preferences.settled();
  await expect(preferences.read()).resolves.toEqual(saved);
  const next: DeckPreferences = {
    selected: 'bars',
    orders: { bars: ['bars-1'] },
  };
  preferences.save(next);
  await preferences.settled();
  expect(storage.setItem).toHaveBeenLastCalledWith(key, envelope(next));
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  await expect(preferences.read()).resolves.toEqual(next);
});

it('retries an identical snapshot after its prior optional write failed', async () => {
  const { storage, preferences } = fixture();
  storage.setItem.mockRejectedValueOnce(new Error('fixture phone full'));
  preferences.save(saved);
  await preferences.settled();
  preferences.save(saved);
  await preferences.settled();
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(storage.setItem).toHaveBeenLastCalledWith(key, envelope());
  preferences.save(saved);
  await preferences.settled();
  expect(storage.setItem).toHaveBeenCalledTimes(2);
});

it('ignores invalid saves without replacing valid in-memory preferences', async () => {
  const { storage, preferences } = fixture();
  preferences.save(saved);
  preferences.save({
    selected: 'park',
    orders: { park: ['park-1', 'park-1'] },
  });
  await preferences.settled();
  await expect(preferences.read()).resolves.toEqual(saved);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
});

it('stops new work and drains both hydration and accepted writes before account cleanup', async () => {
  const { storage, preferences } = fixture();
  const read = deferred<string | null>();
  const write = deferred<void>();
  const started = deferred<void>();
  storage.getItem.mockReturnValue(read.promise);
  storage.setItem.mockImplementationOnce(() => {
    started.resolve();
    return write.promise;
  });
  const restoring = preferences.read();
  preferences.save(saved);
  await started.promise;
  let stopped = false;
  const stopping = preferences.stop().then(() => {
    stopped = true;
  });
  preferences.save({ selected: 'gym', orders: {} });
  write.resolve();
  await preferences.settled();
  expect(stopped).toBe(false);
  read.resolve(envelope({ selected: 'cafe' }));
  await Promise.all([restoring, stopping]);
  await storage.removeItem(key);
  preferences.save({ selected: 'cafe', orders: {} });
  await expect(preferences.read()).resolves.toEqual(saved);
  expect(storage.getItem).toHaveBeenCalledTimes(1);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  expect(storage.removeItem).toHaveBeenCalledWith(key);
});

it('does not hydrate or write after stopping a previously unused account', async () => {
  const { storage, preferences } = fixture(envelope());
  await preferences.stop();
  preferences.save(saved);
  await expect(preferences.read()).resolves.toBeNull();
  expect(storage.getItem).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
});
