import { StrictMode, useEffect, useSyncExternalStore } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import { catalogSchema, venues, type SessionResponse } from '@justgo/contracts';
import { card } from '../../../test-support/journal';
import { createMemoryVault } from '../identity/storage';
import { createVault } from '../identity/vault';
import {
  AppProvider,
  useIdentity,
  useJournal,
  useRuntime,
} from './AppProvider';

jest.mock('expo-crypto', () => ({
  randomUUID: () => '00000000-0000-4000-8000-000000000009',
  getRandomValues: (array: Uint8Array) => array.fill(0xbb),
}));
jest.mock('../../platform/connectivity/connectivity', () => ({
  listenToConnectivity: () => () => {},
}));
jest.mock('../../data/activity/persistence/storage', () => ({
  asyncStorageJournalStorage: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
jest.mock('../identity/vault', () => ({ createVault: jest.fn() }));
jest.mock('./ProgressRefresh', () => ({ ProgressRefresh: () => null }));

const session: SessionResponse = {
  userId: '00000000-0000-4000-8000-000000000001',
  deviceId: '00000000-0000-4000-8000-000000000002',
  sessionId: '00000000-0000-4000-8000-000000000003',
  expiresAt: '2099-01-01T00:00:00.000Z',
};
let runtime: ReturnType<typeof useRuntime>;
const originalUrl = process.env.EXPO_PUBLIC_API_URL;
function Probe() {
  const currentRuntime = useRuntime();
  useEffect(() => {
    runtime = currentRuntime;
  }, [currentRuntime]);
  const identity = useIdentity();
  const repository = useJournal();
  const challenges = useSyncExternalStore(
    currentRuntime.challenges.subscribe,
    currentRuntime.challenges.getSnapshot,
    currentRuntime.challenges.getSnapshot,
  );
  useEffect(() => {
    if (identity.account?.userId === repository?.accountId && repository)
      void currentRuntime.challenges.refresh();
  }, [identity.account, repository, currentRuntime]);
  return (
    <>
      <Text>{identity.account?.userId ?? 'disconnected'}</Text>
      <Text>{challenges.queues.gym?.cards[0]?.text ?? 'no challenge'}</Text>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ['performance'] });
});
afterEach(async () => {
  await act(async () => cleanup());
  await runtime.client.queries.cancelQueries();
  runtime.client.queries.clear();
  await act(async () => jest.runOnlyPendingTimersAsync());
  jest.restoreAllMocks();
  jest.useRealTimers();
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = originalUrl;
});

it.each([false, true])(
  'loads challenges with provider effect replay=%s and stops work on unmount',
  async (strict) => {
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
    const vault = createMemoryVault();
    await vault.write({
      deviceId: session.deviceId,
      selectedId: '00000000-0000-4000-8000-000000000004',
      session: { token: 'a'.repeat(64), info: session },
      pending: null,
      savedKey: null,
      registration: null,
    });
    jest.mocked(createVault).mockReturnValue(vault);
    const removeListener = jest.fn();
    const listeners = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: removeListener });
    const fetcher = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const path = String(input);
        const body = path.endsWith('/sessions/current')
          ? session
          : path.endsWith('/devices')
            ? { devices: [] }
            : path.endsWith('/credentials')
              ? { credentials: [] }
              : path.endsWith('/challenges')
                ? {
                    cards: venues.map(({ id }) => ({ ...card, id, venue: id })),
                  }
                : {};
        return new Response(JSON.stringify(body), { status: 200 });
      });
    const provider = (
      <AppProvider>
        <Probe />
      </AppProvider>
    );
    const screen = render(
      strict ? <StrictMode>{provider}</StrictMode> : provider,
    );
    await waitFor(() => expect(screen.getByText(session.userId)).toBeTruthy());
    expect(runtime.activity.getRepository()?.accountId).toBe(session.userId);
    await waitFor(() => expect(screen.getByText(card.text)).toBeTruthy());
    await waitFor(() => {
      expect(runtime.identity.getSnapshot().busy).toBe(false);
      expect(runtime.challenges.getSnapshot().loading).toBe(false);
    });
    expect(
      fetcher.mock.calls.some(([path]) =>
        String(path).endsWith('/v1/challenges'),
      ),
    ).toBe(true);
    let aborted = false;
    fetcher.mockImplementationOnce(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new Error('Synthetic cancelled read'));
            },
            { once: true },
          );
        }),
    );
    const read = expect(
      runtime.client.request('/v1/challenges', catalogSchema),
    ).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' });
    await act(async () => screen.unmount());
    await read;
    expect(aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledTimes(listeners.mock.calls.length);
    expect(runtime.activity.getRepository()).toBeNull();
    expect(runtime.client.queries.getQueryCache().getAll()).toHaveLength(0);
    await act(async () => jest.advanceTimersByTimeAsync(0));
    expect(jest.getTimerCount()).toBe(0);
  },
);
