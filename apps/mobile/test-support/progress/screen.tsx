jest.mock('../../src/app-support/saving/SavingFeedback', () => ({
  SavingSheetSurface: () => null,
}));
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react-native';
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from '@tanstack/react-query';
import type {
  ProgressSummary,
  ProgressCalendar,
  ProgressDayResponse,
} from '@justgo/contracts';
import { memoryLocalJournal } from '../local-journal';
import { AccountRepository } from '../../src/data/activity/repository';
import {
  MemoryStorage,
  backend,
  owner,
  today,
  zone,
  attempt,
  uuid,
} from '../journal';
import { ProgressScreen } from '../../src/features/progress/ProgressScreen';
import { ProgressRefresh } from '../../src/app-support/providers/ProgressRefresh';
import type { AccountClient } from '../../src/lib/network/account-client';
import type { ActivityRuntime } from '../../src/app-support/providers/activity-runtime';

jest.mock('../../src/app-support/providers/activity-hooks', () => ({
  useActivityStore: () =>
    jest
      .requireMock('../../src/app-support/providers/AppProvider')
      .useActivityState(),
}));

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  Link: () => null,
}));
jest.mock('../../src/platform/motion/motion', () => ({
  useReduceMotion: () => true,
}));
jest.mock(
  '../../src/features/progress/day-details/entries/useEntryMotion',
  () =>
    jest.requireActual(
      '../../src/features/progress/day-details/entries/useEntryMotion.ts',
    ),
);
jest.mock('expo-crypto', () => {
  let n = 100;
  return {
    randomUUID: () =>
      `30000000-0000-4000-8000-${String(n++).padStart(12, '0')}`,
  };
});
let mockRepository: AccountRepository | null;
let mockClient: { queries: QueryClient; request: jest.Mock };
jest.mock('../../src/app-support/providers/AppProvider', () => ({
  useRuntime: () => ({ client: mockClient }),
  useActivityState: () => {
    const { useSyncExternalStore } = jest.requireActual('react');
    return {
      repository: mockRepository,
      state: useSyncExternalStore(
        mockRepository?.store.subscribe ?? (() => () => {}),
        mockRepository?.store.getState ?? (() => null),
      ),
    };
  },
}));
const summary: ProgressSummary = {
  today,
  timeZone: zone,
  totalReps: 10,
  currentStreak: 2,
  bestStreak: 5,
  streakContext: { month: '2026-10', precedingRun: 0, bestBeforeMonth: 5 },
};
const calendar: ProgressCalendar = {
  month: '2026-10',
  monthlyReps: 10,
  activeDays: 2,
  days: [
    { date: '2026-10-03', reps: 2 },
    { date: today, reps: 8 },
  ],
};
const page: ProgressDayResponse = {
  date: today,
  totalReps: 8,
  entries: [attempt()],
  nextCursor: null,
};
const repositories: AccountRepository[] = [];
let storage: MemoryStorage;
let transport: ReturnType<typeof backend>;
async function repository(accountId = owner) {
  const repo = new AccountRepository({
    accountId,
    storage,
    localJournal: memoryLocalJournal(accountId, storage),
    transport,
    today,
    timeZone: zone,
  });
  repositories.push(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.hydrate();
  return repo;
}
const mount = () =>
  render(
    <QueryClientProvider client={mockClient.queries}>
      <ProgressRefresh
        client={mockClient as unknown as AccountClient}
        activity={{} as ActivityRuntime}
      />
      <ProgressScreen />
    </QueryClientProvider>,
  );
const requests = (resource: string) =>
  mockClient.request.mock.calls.filter(([path]) => path.includes(resource));
beforeEach(async () => {
  jest.useFakeTimers();
  notifyManager.setNotifyFunction((notify) => act(notify));
  storage = new MemoryStorage();
  transport = backend();
  transport.records.set(uuid(1), attempt());
  mockRepository = await repository();
  mockClient = {
    queries: new QueryClient({
      defaultOptions: { queries: { retry: false, networkMode: 'always' } },
    }),
    request: jest.fn(async (path: string) =>
      path.includes('/summary?')
        ? summary
        : path.includes('/calendar?')
          ? calendar
          : page,
    ),
  };
});
afterEach(async () => {
  cleanup();
  repositories.forEach((r) => r.dispose());
  repositories.length = 0;
  await mockClient.queries.cancelQueries();
  mockClient.queries.clear();
  await act(async () => {
    await jest.runOnlyPendingTimersAsync();
  });
  notifyManager.setNotifyFunction((notify) => notify());
  jest.useRealTimers();
});
async function online() {
  await act(async () => {
    mockRepository!.setEnvironment({ active: true, online: true });
  });
}
async function loaded() {
  await waitFor(() => expect(mockClient.queries.isFetching()).toBe(0));
}
const openToday = (screen: ReturnType<typeof render>) =>
  fireEvent.press(
    screen.getByRole('button', { name: /Monday, October 5, today, 8 reps/ }),
  );
export const harness = {
  get mockRepository() {
    return mockRepository;
  },
  set mockRepository(value: typeof mockRepository) {
    mockRepository = value;
  },
  get mockClient() {
    return mockClient;
  },
  set mockClient(value: typeof mockClient) {
    mockClient = value;
  },
  get storage() {
    return storage;
  },
  set storage(value: typeof storage) {
    storage = value;
  },
  get transport() {
    return transport;
  },
  set transport(value: typeof transport) {
    transport = value;
  },
};
export {
  summary,
  calendar,
  page,
  repository,
  mount,
  requests,
  online,
  loaded,
  openToday,
};
