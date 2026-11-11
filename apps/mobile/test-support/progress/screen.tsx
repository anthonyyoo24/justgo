jest.mock('../../src/app-support/saving/SavingFeedback', () => ({
  SavingSheetSurface: () => null,
}));
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { memoryLocalJournal } from '../local-journal';
import { AccountRepository } from '../../src/data/activity/repository';
import {
  MemoryStorage,
  backend,
  card,
  input,
  owner,
  today,
  zone,
} from '../journal';
import { ProgressScreen } from '../../src/features/progress/ProgressScreen';

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
jest.mock('../../src/app-support/providers/AppProvider', () => ({
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
const repositories: AccountRepository[] = [];
let storage: MemoryStorage;
async function repository(accountId = owner) {
  const repo = new AccountRepository({
    accountId,
    storage,
    localJournal: memoryLocalJournal(accountId, storage),
    transport: backend(),
    today,
    timeZone: zone,
  });
  repositories.push(repo);
  repo.setEnvironment({ active: true, online: false });
  await repo.hydrate();
  return repo;
}
const mount = async () => await render(<ProgressScreen />);
beforeEach(async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  storage = new MemoryStorage();
  mockRepository = await repository();
  // Today's one completion lives only in local history.
  await mockRepository.complete(input(), card);
});
afterEach(async () => {
  await cleanup();
  repositories.forEach((r) => r.dispose());
  repositories.length = 0;
  await act(async () => {
    await jest.runOnlyPendingTimersAsync();
  });
  jest.useRealTimers();
});
const openToday = async (screen: Awaited<ReturnType<typeof render>>) =>
  await fireEvent.press(
    screen.getByRole('button', { name: /Monday, October 5, today, 1 rep/ }),
  );
export const harness = {
  get mockRepository() {
    return mockRepository;
  },
  set mockRepository(value: typeof mockRepository) {
    mockRepository = value;
  },
  get storage() {
    return storage;
  },
  set storage(value: typeof storage) {
    storage = value;
  },
};
export { repository, mount, openToday };
