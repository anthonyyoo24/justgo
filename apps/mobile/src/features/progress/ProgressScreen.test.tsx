jest.mock('../../app-support/saving/SavingFeedback', () => ({
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
import { AccountRepository } from '../../data/activity/repository';
import {
  MemoryStorage,
  backend,
  owner,
  otherOwner,
  today,
  zone,
  attempt,
  uuid,
  deferred,
} from '../../../test-support/journal';
import { ProgressScreen } from './ProgressScreen';
import { ProgressRefresh } from '../../app-support/providers/ProgressRefresh';
import type { AccountClient } from '../../lib/account-client';
import type { ActivityRuntime } from '../../app-support/providers/activity-runtime';

jest.mock('../../app-support/providers/activity-hooks', () => ({
  useActivityStore: () =>
    jest
      .requireMock('../../app-support/providers/AppProvider')
      .useActivityState(),
}));

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  Link: () => null,
}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('expo-crypto', () => {
  let n = 100;
  return {
    randomUUID: () =>
      `30000000-0000-4000-8000-${String(n++).padStart(12, '0')}`,
  };
});
let mockRepository: AccountRepository | null;
let mockClient: { queries: QueryClient; request: jest.Mock };
jest.mock('../../app-support/providers/AppProvider', () => ({
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

it('loads independent summary/calendar/today reads and does not query summary while switching months', async () => {
  await online();
  const screen = mount();
  await loaded();
  const initial = requests('/summary?').length;
  const next = deferred<ProgressCalendar>();
  mockClient.request.mockImplementation((path: string) =>
    path.includes('month=2026-09')
      ? next.promise
      : Promise.resolve(
          path.includes('/summary?')
            ? summary
            : path.includes('/calendar?')
              ? calendar
              : page,
        ),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByRole('header', { name: 'September 2026' })).toBeTruthy();
  expect(screen.getByTestId('progress-value-reps')).toHaveTextContent('10');
  expect(screen.getByLabelText('Loading month')).toBeTruthy();
  await act(async () =>
    next.resolve({
      month: '2026-09',
      monthlyReps: 4,
      activeDays: 2,
      days: [
        { date: '2026-09-10', reps: 1 },
        { date: '2026-09-20', reps: 3 },
      ],
    }),
  );
  await waitFor(() =>
    expect(screen.getByText('on 2 active days')).toBeTruthy(),
  );
  expect(requests('/summary?')).toHaveLength(initial);
});
it('hydrates offline current-period data and restricts previously viewed other days/months', async () => {
  await online();
  const screen = mount();
  await loaded();
  openToday(screen);
  expect(screen.getByLabelText(/Rep 1\. Say hello/)).toBeTruthy();
  await act(async () =>
    mockRepository!.setEnvironment({ active: true, online: false }),
  );
  expect(screen.getByLabelText(/Rep 1\. Say hello/)).toBeTruthy();
  expect(screen.queryByText(/partial|out of date/i)).toBeNull();
  fireEvent.press(
    screen.getAllByRole('button', { name: 'Close day details' })[0]!,
  );
  fireEvent.press(
    screen.getByRole('button', { name: /Saturday, October 3, 2 reps/ }),
  );
  expect(screen.getByText('Connect to view this day.')).toBeTruthy();
  fireEvent.press(
    screen.getAllByRole('button', { name: 'Close day details' })[0]!,
  );
  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByText('Connect to view this month.')).toBeTruthy();
  expect(screen.getByTestId('progress-value-reps')).toHaveTextContent('10');
});
it('adds and edits a reflection inline while preserving its feeling and local saving behavior', async () => {
  await online();
  const screen = mount();
  await loaded();
  openToday(screen);
  fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  expect(
    screen.getByRole('button', { name: 'Save reflection' }),
  ).toBeDisabled();
  fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'First day entry text.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  expect(mockRepository!.getAttempt(uuid(1))?.reflection?.text).toBe(
    'First day entry text.',
  );
  expect(screen.getByText('First day entry text.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Edit reflection' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection').props.value).toBe(
      'First day entry text.',
    ),
  );
  fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Edited day text.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  expect(mockRepository!.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Edited day text.',
  );
});
it('opens Add from the row title and guards dirty input when the row is tapped again', async () => {
  await online();
  const screen = mount();
  await loaded();
  openToday(screen);
  fireEvent.press(screen.getByText('Say hello.'));
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Keep this unsent writing.',
  );
  fireEvent.press(screen.getByText('Feeling'));
  expect(screen.getByText('Leave your reflection?')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Your day reflection').props.value).toBe(
    'Keep this unsent writing.',
  );
  fireEvent.press(screen.getByText('01'));
  fireEvent.press(screen.getByRole('button', { name: 'Discard changes' }));
  expect(screen.queryByLabelText('Your day reflection')).toBeNull();
  expect(mockRepository!.getAttempt(uuid(1))?.reflection).toBeNull();
  expect(screen.getByLabelText(/Rep 1.*Add reflection/)).toBeTruthy();
});
it('protects dirty input on sheet close and keeps editing without applying the canceled close later', async () => {
  await online();
  const screen = mount();
  await loaded();
  openToday(screen);
  fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Unfinished day text.',
  );
  fireEvent.press(
    screen.getAllByRole('button', { name: 'Close day details' })[0]!,
  );
  expect(screen.getByText('Leave your reflection?')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Your day reflection').props.value).toBe(
    'Unfinished day text.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  expect(screen.getByText('Unfinished day text.')).toBeTruthy();
});
it('discards only unsent editor changes and keeps the day sheet open', async () => {
  await online();
  const screen = mount();
  await loaded();
  openToday(screen);
  fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Discardable text.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Cancel reflection' }));
  fireEvent.press(screen.getByRole('button', { name: 'Discard changes' }));
  expect(screen.queryByLabelText('Your day reflection')).toBeNull();
  expect(mockRepository!.getAttempt(uuid(1))?.reflection).toBeNull();
  expect(screen.getByLabelText(/Rep 1.*Add reflection/)).toBeTruthy();
});
it('retries a failed initial page and later page without dropping already displayed attempts', async () => {
  let count = 0;
  const first: ProgressDayResponse = {
    date: '2026-10-03',
    totalReps: 21,
    entries: Array.from({ length: 20 }, (_, i) => ({
      ...attempt(i + 10),
      activityDate: '2026-10-03',
    })),
    nextCursor: 'next',
  };
  const next = deferred<ProgressDayResponse>();
  mockClient.request.mockImplementation((path: string) => {
    if (path.includes('date=2026-10-03')) {
      count++;
      if (count === 1) return Promise.reject(new Error('Temporary failure'));
      if (count === 3) return next.promise;
      return Promise.resolve(
        count === 2
          ? first
          : {
              ...first,
              entries: [{ ...attempt(30), activityDate: '2026-10-03' }],
              nextCursor: null,
            },
      );
    }
    return Promise.resolve(
      path.includes('/summary?')
        ? summary
        : path.includes('/calendar?')
          ? calendar
          : page,
    );
  });
  await online();
  const screen = mount();
  await loaded();
  fireEvent.press(
    screen.getByRole('button', { name: /Saturday, October 3, 2 reps/ }),
  );
  await waitFor(() =>
    expect(screen.getByText('Couldn’t load attempts')).toBeTruthy(),
  );
  fireEvent.press(
    screen.getByRole('button', { name: 'Try loading attempts again' }),
  );
  await waitFor(() => expect(screen.getByLabelText(/Rep 20\./)).toBeTruthy());
  fireEvent.scroll(screen.getByTestId('day-sheet-entry-list'), {
    nativeEvent: {
      contentOffset: { y: 900 },
      contentSize: { height: 1600 },
      layoutMeasurement: { height: 700 },
    },
  });
  await waitFor(() =>
    expect(screen.getByLabelText('Loading more attempts')).toBeTruthy(),
  );
  await act(async () => next.reject(new Error('Temporary next-page failure')));
  await waitFor(() =>
    expect(screen.getByText('Couldn’t load more attempts')).toBeTruthy(),
  );
  expect(screen.getByLabelText(/Rep 20\./)).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', { name: 'Try loading more attempts again' }),
  );
  await waitFor(() => expect(screen.getByLabelText(/Rep 21\./)).toBeTruthy());
  expect(count).toBe(4);
});
it('fences account changes and clears old account progress while another account loads', async () => {
  await online();
  const screen = mount();
  await loaded();
  const pending = deferred<ProgressSummary>();
  mockClient.request.mockReturnValue(pending.promise);
  const nextRepository = await repository(otherOwner);
  await act(async () => {
    mockRepository!.setEnvironment({ active: false, online: false });
    mockRepository = nextRepository;
    mockRepository.setEnvironment({ active: true, online: true });
  });
  screen.rerender(
    <QueryClientProvider client={mockClient.queries}>
      <ProgressRefresh
        client={mockClient as unknown as AccountClient}
        activity={{} as ActivityRuntime}
      />
      <ProgressScreen />
    </QueryClientProvider>,
  );
  expect(screen.queryByTestId('progress-value-reps')).toBeNull();
  expect(screen.getByLabelText('Loading progress')).toBeTruthy();
  await act(async () =>
    pending.resolve({
      ...summary,
      totalReps: 0,
      currentStreak: 0,
      bestStreak: 0,
    }),
  );
  await loaded();
  expect(screen.getByTestId('progress-value-reps')).toHaveTextContent('0');
});
it('keeps current summary on month failures and follows current-month rollover', async () => {
  await online();
  const screen = mount();
  await loaded();
  mockClient.request.mockRejectedValue(new Error('Unavailable'));
  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  await waitFor(() =>
    expect(screen.getByText('We couldn’t load your progress.')).toBeTruthy(),
  );
  expect(screen.getByTestId('progress-value-reps')).toHaveTextContent('10');
  fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
  await act(async () => mockRepository!.rollover('2026-11-01', zone));
  expect(screen.getByRole('header', { name: 'November 2026' })).toBeTruthy();
});
it('shows a disconnected account message without private cached entries', () => {
  mockRepository = null;
  const screen = mount();
  expect(
    screen.getByText('Connect your account to view Progress.'),
  ).toBeTruthy();
});

it('blocks duplicate slow saves, retains newer typing and saves through dirty-close confirmation', async () => {
  await online();
  const screen = mount();
  await loaded();
  openToday(screen);
  fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  await act(async () =>
    mockRepository!.setEnvironment({ active: true, online: false }),
  );
  fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Submitted day text.',
  );
  const pending = deferred<void>();
  storage.blocked = pending;
  fireEvent.press(screen.getByRole('button', { name: 'Cancel reflection' }));
  fireEvent.press(screen.getByRole('button', { name: 'Save Reflection' }));
  fireEvent.press(screen.getByRole('button', { name: 'Save Reflection' }));
  await act(async () => jest.advanceTimersByTimeAsync(199));
  expect(screen.queryByTestId('day-reflection-dismiss-spinner')).toBeNull();
  await act(async () => jest.advanceTimersByTimeAsync(1));
  expect(screen.getByTestId('day-reflection-dismiss-spinner')).toBeTruthy();
  for (const button of screen.getAllByRole('button', {
    name: 'Saving reflection',
  }))
    expect(button).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
  fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Newer day text.',
  );
  fireEvent.press(
    screen.getAllByRole('button', { name: 'Close day details' })[0]!,
  );
  expect(screen.getByLabelText('Your day reflection').props.value).toBe(
    'Newer day text.',
  );
  await act(async () => {
    storage.blocked = null;
    pending.resolve();
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Save reflection' }),
    ).toBeEnabled(),
  );
  expect(mockRepository!.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Submitted day text.',
  );
  expect(
    mockRepository!.store
      .getState()
      .journal.operations.filter((op) => op.kind === 'patch'),
  ).toHaveLength(1);
  fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  expect(mockRepository!.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Newer day text.',
  );
});
it('allows clean cancellation and reports unavailable today cache instead of a false empty day', async () => {
  await online();
  const screen = mount();
  await loaded();
  openToday(screen);
  fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Cancel reflection' }));
  expect(screen.queryByLabelText('Your day reflection')).toBeNull();
  expect(screen.queryByText('Leave your reflection?')).toBeNull();
  await act(async () => {
    mockRepository!.setEnvironment({ active: true, online: false });
    const journal = mockRepository!.store.getState().journal;
    mockRepository!.store.setState({
      journal: { ...journal, records: {}, today: null },
    });
    mockClient.queries.removeQueries({
      predicate: (query) => query.queryKey.includes('day'),
    });
  });
  expect(screen.getByText('Connect to view this day.')).toBeTruthy();
});
it('keeps usable caches through a failed background refresh and reports a failed explicit editor adoption', async () => {
  await online();
  const screen = mount();
  await loaded();
  mockClient.request.mockRejectedValue(new Error('Refresh unavailable'));
  await act(async () => mockClient.queries.invalidateQueries());
  await loaded();
  expect(
    screen.queryByText(/out of date|Couldn’t refresh your summary/),
  ).toBeNull();
  openToday(screen);
  const adopt = jest
    .spyOn(mockRepository!, 'adoptAttempt')
    .mockRejectedValueOnce(new Error('Account changed'));
  fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(
      screen.getByText('Couldn’t open this reflection. Please try again.'),
    ).toBeTruthy(),
  );
  expect(screen.queryByLabelText('Your day reflection')).toBeNull();
  adopt.mockRestore();
});

it('calendar reflection creation and text clearing preserve an existing feeling and accepted rep', async () => {
  const felt = {
    ...attempt(),
    reflection: {
      feeling: 'a_little_better' as const,
      text: null,
      revision: 1,
    },
  };
  transport.records.set(uuid(1), felt);
  mockClient.request.mockImplementation(async (path: string) =>
    path.includes('/summary?')
      ? summary
      : path.includes('/calendar?')
        ? calendar
        : { ...page, entries: [transport.records.get(uuid(1))!] },
  );
  await online();
  const screen = mount();
  await loaded();
  openToday(screen);
  fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  expect(
    screen.getByRole('button', { name: 'Save reflection' }),
  ).toBeDisabled();
  fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Writing after a feeling-only submission.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  await waitFor(() =>
    expect(transport.records.get(uuid(1))?.reflection?.text).toBe(
      'Writing after a feeling-only submission.',
    ),
  );
  expect(transport.records.get(uuid(1))?.reflection?.feeling).toBe(
    'a_little_better',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Edit reflection' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  fireEvent.changeText(screen.getByLabelText('Your day reflection'), '');
  expect(screen.getByRole('button', { name: 'Save reflection' })).toBeEnabled();
  fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  expect(mockRepository!.getAttempt(uuid(1))?.reflection).toMatchObject({
    feeling: 'a_little_better',
    text: null,
  });
  expect(
    mockRepository!.store.getState().journal.summaryAdditions,
  ).toHaveLength(0);
});
it('summary failure leaves the independently loaded calendar usable', async () => {
  mockClient.request.mockImplementation((path: string) =>
    path.includes('/summary?')
      ? Promise.reject(new Error('Summary unavailable'))
      : Promise.resolve(path.includes('/calendar?') ? calendar : page),
  );
  await online();
  const screen = mount();
  await loaded();
  expect(screen.getByText('Couldn’t refresh your summary.')).toBeTruthy();
  expect(screen.getByTestId('progress-value-reps')).toHaveTextContent('—');
  openToday(screen);
  expect(screen.getByLabelText(/Rep 1\./)).toBeTruthy();
});
it('retains an older-day saved reflection after upload, pruning and a stale day refresh', async () => {
  const older = {
    ...attempt(2),
    activityDate: '2026-10-03',
    startedAt: '2026-10-03T14:00:00.000Z',
  };
  transport.records.set(uuid(2), older);
  mockClient.request.mockImplementation(async (path: string) =>
    path.includes('/summary?')
      ? summary
      : path.includes('/calendar?')
        ? calendar
        : path.includes('date=2026-10-03')
          ? {
              date: '2026-10-03',
              totalReps: 2,
              entries: [older],
              nextCursor: null,
            }
          : page,
  );
  await online();
  const screen = mount();
  await loaded();
  fireEvent.press(
    screen.getByRole('button', { name: /Saturday, October 3, 2 reps/ }),
  );
  await loaded();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
    ).toBeTruthy(),
  );
  fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Saved older-day reflection.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Save reflection' }));
  await waitFor(() =>
    expect(transport.records.get(uuid(2))?.reflection?.text).toBe(
      'Saved older-day reflection.',
    ),
  );
  await loaded();
  await waitFor(() =>
    expect(mockRepository!.getAttempt(uuid(2))).toBeUndefined(),
  );
  expect(screen.getByText('Saved older-day reflection.')).toBeTruthy();
});
it('cannot save an empty text-only edit from the dirty-close dialog', async () => {
  const written = {
    ...attempt(),
    reflection: { feeling: null, text: 'Retain this text.', revision: 1 },
  };
  transport.records.set(uuid(1), written);
  mockClient.request.mockImplementation(async (path: string) =>
    path.includes('/summary?')
      ? summary
      : path.includes('/calendar?')
        ? calendar
        : { ...page, entries: [written] },
  );
  await online();
  const screen = mount();
  await loaded();
  openToday(screen);
  fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*View Reflection/ }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Edit reflection' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  fireEvent.changeText(screen.getByLabelText('Your day reflection'), '');
  expect(
    screen.getByRole('button', { name: 'Save reflection' }),
  ).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel reflection' }));
  expect(
    screen.getByRole('button', { name: 'Save Reflection' }),
  ).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Discard changes' }));
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  expect(transport.records.get(uuid(1))?.reflection?.text).toBe(
    'Retain this text.',
  );
});
