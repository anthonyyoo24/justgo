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
  ProgressDayResponse,
  ProgressEntry,
  ProgressResponse,
} from '@justgo/contracts';
import { accountKey } from '../../lib/account-client';
import { ProgressScreen } from './ProgressScreen';

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  Link: () => null,
}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));
jest.mock('./calendar', () => ({
  ...jest.requireActual('./calendar'),
  currentMonth: () => '2026-09',
}));

let mockAccount = { userId: 'user-one' };
let mockClient: { queries: QueryClient; request: jest.Mock };
jest.mock('../shell/AppProvider', () => ({
  useRuntime: () => ({ client: mockClient }),
  useIdentity: () => ({ account: mockAccount }),
}));

const september: ProgressResponse = {
  month: '2026-09',
  today: '2026-09-28',
  currentStreak: 2,
  bestStreak: 5,
  totalReps: 10,
  monthlyReps: 2,
  activeDays: 1,
  days: [{ date: '2026-09-18', reps: 2 }],
};
const august: ProgressResponse = {
  ...september,
  month: '2026-08',
  monthlyReps: 4,
  activeDays: 2,
  days: [
    { date: '2026-08-10', reps: 1 },
    { date: '2026-08-20', reps: 3 },
  ],
};

beforeEach(() => {
  jest.useFakeTimers();
  // Query notifications are scheduled outside React; flush them inside act.
  notifyManager.setNotifyFunction((notify) => act(notify));
  mockAccount = { userId: 'user-one' };
  mockClient = {
    queries: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
    request: jest.fn().mockResolvedValue(september),
  };
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  mockClient.queries.setQueryData(
    accountKey('user-one', 'progress', 'month', '2026-09', timeZone),
    september,
  );
});

afterEach(async () => {
  // Unsubscribe observers before clearing the cache and settle cancelled work.
  cleanup();
  await mockClient.queries.cancelQueries();
  mockClient.queries.clear();
  // Drain scheduled query notifications inside async act before restoring the
  // global notifier and real timers for the next test.
  await act(async () => {
    await jest.runOnlyPendingTimersAsync();
  });
  notifyManager.setNotifyFunction((notify) => notify());
  jest.useRealTimers();
});

it('keeps the displayed month and summary together until an uncached month loads', async () => {
  let finishAugust!: (value: ProgressResponse) => void;
  const pendingAugust = new Promise<ProgressResponse>((resolve) => {
    finishAugust = resolve;
  });
  mockClient.request.mockImplementation((path: string) =>
    path.includes('month=2026-08') ? pendingAugust : Promise.resolve(september),
  );
  const screen = render(
    <QueryClientProvider client={mockClient.queries}>
      <ProgressScreen />
    </QueryClientProvider>,
  );

  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  await waitFor(() =>
    expect(mockClient.request).toHaveBeenCalledWith(
      expect.stringContaining('month=2026-08'),
      expect.anything(),
      expect.anything(),
    ),
  );
  expect(screen.getByRole('header', { name: 'September 2026' })).toBeTruthy();
  expect(screen.getByText('on 1 active day')).toBeTruthy();
  expect(screen.queryByText('—')).toBeNull();
  expect(screen.getByLabelText('Loading month')).toBeTruthy();

  await act(async () => finishAugust(august));
  await waitFor(() =>
    expect(screen.getByRole('header', { name: 'August 2026' })).toBeTruthy(),
  );
  expect(screen.getByText('on 2 active days')).toBeTruthy();
  expect(screen.queryByText('—')).toBeNull();
  expect(screen.queryByLabelText('Loading month')).toBeNull();
});

it('does not show another account’s previous progress while its month loads', async () => {
  const screen = render(
    <QueryClientProvider client={mockClient.queries}>
      <ProgressScreen />
    </QueryClientProvider>,
  );
  // Finish the first account's focus refresh before replacing the transport
  // fixture, so a queued old-account request cannot consume the new response.
  await waitFor(() => expect(mockClient.queries.isFetching()).toBe(0));
  let finishOther!: (value: ProgressResponse) => void;
  const pendingOther = new Promise<ProgressResponse>((resolve) => {
    finishOther = resolve;
  });
  mockClient.request.mockImplementation(() => pendingOther);
  mockAccount = { userId: 'user-two' };
  screen.rerender(
    <QueryClientProvider client={mockClient.queries}>
      <ProgressScreen />
    </QueryClientProvider>,
  );

  expect(screen.getByLabelText('Loading progress')).toBeTruthy();
  expect(
    screen.getAllByTestId('progress-calendar-skeleton', {
      includeHiddenElements: true,
    }),
  ).toHaveLength(35);
  expect(screen.queryByText('—')).toBeNull();
  expect(screen.queryByText('on 1 active day')).toBeNull();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await waitFor(() =>
    expect(
      mockClient.queries.getQueryState(
        accountKey('user-two', 'progress', 'month', '2026-09', timeZone),
      )?.fetchStatus,
    ).toBe('fetching'),
  );
  await act(async () =>
    finishOther({
      ...september,
      currentStreak: 0,
      bestStreak: 0,
      totalReps: 0,
      monthlyReps: 0,
      activeDays: 0,
      days: [],
    }),
  );
  await waitFor(() =>
    expect(screen.queryByLabelText('Loading progress')).toBeNull(),
  );
  await waitFor(() => expect(mockClient.queries.isFetching()).toBe(0));
  expect(screen.getByText('on 0 active days')).toBeTruthy();
  expect(screen.queryByText('on 1 active day')).toBeNull();
});

it('replaces the first-visit skeleton with the response as soon as it arrives', async () => {
  mockClient.queries.clear();
  let finish!: (value: ProgressResponse) => void;
  const response = new Promise<ProgressResponse>((resolve) => {
    finish = resolve;
  });
  // Focus invalidation may request the same response; retain one controllable
  // promise rather than leaving an earlier request unresolved.
  mockClient.request.mockReturnValue(response);
  const screen = render(
    <QueryClientProvider client={mockClient.queries}>
      <ProgressScreen />
    </QueryClientProvider>,
  );
  expect(screen.getByLabelText('Loading progress')).toBeTruthy();
  await act(async () => finish(september));
  await waitFor(() =>
    expect(screen.queryByLabelText('Loading progress')).toBeNull(),
  );
  expect(
    screen.getByRole('button', { name: 'Friday, September 18, 2 reps' }),
  ).toBeTruthy();
  expect(screen.getByText('on 1 active day')).toBeTruthy();
});

it('retries the first page and a failed later page without losing loaded entries', async () => {
  const sample: ProgressEntry = {
    attemptId: 'attempt-0',
    completedAt: '2026-09-18T13:15:00.000Z',
    timeZone: 'America/Toronto',
    cardId: 'card-1',
    venue: 'streets',
    challengeId: 'challenge-1',
    revisionId: 'revision-1',
    levelId: 'level-1',
    instruction: 'Say hello to someone',
    feelingVersion: 1,
    reflectionStatus: 'skipped',
    feeling: null,
    reflectionText: null,
  };
  const firstPage: ProgressDayResponse = {
    date: '2026-09-18',
    totalReps: 21,
    entries: Array.from({ length: 20 }, (_, index) => ({
      ...sample,
      attemptId: `attempt-${index}`,
    })),
    nextCursor: 'second-page',
  };
  let failNextPage!: (error: Error) => void;
  const pendingNextPage = new Promise<ProgressDayResponse>(
    (_resolve, reject) => {
      failNextPage = reject;
    },
  );
  let dayRequests = 0;
  mockClient.request.mockImplementation((path: string) => {
    if (!path.includes('/v1/progress/days/')) return Promise.resolve(september);
    dayRequests++;
    if (dayRequests === 1)
      return Promise.reject(new Error('Temporary connection failure'));
    if (dayRequests === 3) return pendingNextPage;
    return Promise.resolve(
      dayRequests === 2
        ? firstPage
        : {
            ...firstPage,
            entries: [{ ...sample, attemptId: 'attempt-20' }],
            nextCursor: null,
          },
    );
  });
  const screen = render(
    <QueryClientProvider client={mockClient.queries}>
      <ProgressScreen />
    </QueryClientProvider>,
  );

  fireEvent.press(screen.getByLabelText('Friday, September 18, 2 reps'));
  await waitFor(() =>
    expect(screen.getByText('Couldn’t load attempts')).toBeTruthy(),
  );
  fireEvent.press(
    screen.getByRole('button', { name: 'Try loading attempts again' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText(/Rep 20\. Say hello to someone/)).toBeTruthy(),
  );
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
  await act(async () =>
    failNextPage(new Error('Temporary connection failure')),
  );
  await waitFor(() =>
    expect(screen.getByText('Couldn’t load more attempts')).toBeTruthy(),
  );
  expect(screen.getByLabelText(/Rep 20\. Say hello to someone/)).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', { name: 'Try loading more attempts again' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText(/Rep 21\. Say hello to someone/)).toBeTruthy(),
  );
  expect(screen.queryByText('Couldn’t load more attempts')).toBeNull();
  expect(dayRequests).toBe(4);
});
