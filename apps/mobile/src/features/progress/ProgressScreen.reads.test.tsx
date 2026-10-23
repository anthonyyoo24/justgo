import {
  harness,
  summary,
  calendar,
  page,
  repository,
  mount,
  requests,
  online,
  loaded,
  openToday,
} from '../../../test-support/progress/screen';

import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { QueryClientProvider } from '@tanstack/react-query';

import type {
  ProgressSummary,
  ProgressCalendar,
  ProgressDayResponse,
} from '@justgo/contracts';

import { DayEntryList } from './day-details/entries/DayEntryList';

import { ApiError } from '../../lib/network/http';

import {
  otherOwner,
  zone,
  attempt,
  uuid,
  deferred,
  input,
  card,
  owner,
} from '../../../test-support/journal';
import { journalEntry } from '../../data/activity/private-journal';

import { ProgressScreen } from './ProgressScreen';

import { ProgressRefresh } from '../../app-support/providers/ProgressRefresh';

import type { AccountClient } from '../../lib/network/account-client';

import type { ActivityRuntime } from '../../app-support/providers/activity-runtime';

it('loads independent summary/calendar/today reads and does not query summary while switching months', async () => {
  await online();
  const screen = mount();
  await loaded();
  const initial = requests('/summary?').length;
  const next = deferred<ProgressCalendar>();
  harness.mockClient.request.mockImplementation((path: string) =>
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

it('explains an uncached aggregate waiting for upload retry and resumes reads after acknowledgement', async () => {
  await harness.mockRepository!.complete(input(2), card);
  jest
    .spyOn(harness.transport, 'create')
    .mockRejectedValueOnce(new ApiError('UNAVAILABLE'));
  await online();
  await act(async () => harness.mockRepository!.synchronize());
  const screen = mount();
  await loaded();
  expect(screen.getByText('Syncing your latest activity…')).toBeTruthy();
  expect(screen.queryByLabelText('Loading progress')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Retry progress' })).toBeNull();
  expect(requests('/summary?')).toHaveLength(0);
  expect(requests('/calendar?')).toHaveLength(0);
  await act(async () => jest.advanceTimersByTimeAsync(2000));
  await loaded();
  await waitFor(() =>
    expect(screen.queryByText('Syncing your latest activity…')).toBeNull(),
  );
  expect(requests('/summary?').length).toBeGreaterThan(0);
  expect(requests('/calendar?').length).toBeGreaterThan(0);
  expect(screen.getByTestId('progress-value-reps')).toHaveTextContent('10');
  expect(screen.queryByRole('button', { name: 'Retry progress' })).toBeNull();
});

it('explains a stale older month while preserving local totals, offline guidance and automatic recovery', async () => {
  const september: ProgressCalendar = {
    month: '2026-09',
    monthlyReps: 4,
    activeDays: 1,
    days: [{ date: '2026-09-10', reps: 4 }],
  };
  harness.mockClient.request.mockImplementation(async (path: string) =>
    path.includes('month=2026-09')
      ? september
      : path.includes('/summary?')
        ? {
            ...summary,
            totalReps: harness.transport.records.has(uuid(2)) ? 11 : 10,
          }
        : path.includes('/calendar?')
          ? calendar
          : page,
  );
  await online();
  const screen = mount();
  await loaded();
  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  await loaded();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /September 10.*4 reps/ }),
    ).toBeTruthy(),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
  await loaded();
  await act(async () => {
    harness.mockRepository!.setEnvironment({ active: true, online: false });
    await harness.mockRepository!.complete(input(2), card);
  });
  jest
    .spyOn(harness.transport, 'create')
    .mockRejectedValueOnce(new ApiError('UNAVAILABLE'));
  await online();
  await act(async () => harness.mockRepository!.synchronize());
  const previousReads = requests('month=2026-09').length;
  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByText('Syncing your latest activity…')).toBeTruthy();
  expect(screen.getByTestId('progress-value-reps')).toHaveTextContent('11');
  expect(screen.queryByLabelText('Loading progress')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Retry progress' })).toBeNull();
  expect(requests('month=2026-09')).toHaveLength(previousReads);
  await act(async () =>
    harness.mockRepository!.setEnvironment({ active: true, online: false }),
  );
  expect(screen.queryByText('Syncing your latest activity…')).toBeNull();
  expect(
    screen.getByText(
      'You’re offline. Saved journal entries are available; connect to refresh challenge counts.',
    ),
  ).toBeTruthy();
  await online();
  await act(async () => jest.advanceTimersByTimeAsync(2000));
  await loaded();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /September 10.*4 reps/ }),
    ).toBeTruthy(),
  );
  expect(screen.queryByText('Syncing your latest activity…')).toBeNull();
  expect(screen.getByTestId('progress-value-reps')).toHaveTextContent('11');
});

it('hydrates offline current-period data and restricts previously viewed other days/months', async () => {
  await online();
  const screen = mount();
  await loaded();
  openToday(screen);
  expect(screen.getByLabelText(/Rep 1\. Say hello/)).toBeTruthy();
  await act(async () =>
    harness.mockRepository!.setEnvironment({ active: true, online: false }),
  );
  expect(screen.getByLabelText(/Rep 1\. Say hello/)).toBeTruthy();
  expect(screen.queryByText(/partial|out of date/i)).toBeNull();
  fireEvent.press(
    screen.getAllByRole('button', { name: 'Close day details' })[0]!,
  );
  fireEvent.press(
    screen.getByRole('button', { name: /Saturday, October 3, 2 reps/ }),
  );
  expect(screen.getByText("You're currently offline")).toBeTruthy();
  expect(
    screen.getByText('Connect to the internet to view this day’s activity.'),
  ).toBeTruthy();
  fireEvent.press(
    screen.getAllByRole('button', { name: 'Close day details' })[0]!,
  );
  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'You’re offline. Saved journal entries are available; connect to refresh challenge counts.',
  );
  expect(screen.getByTestId('progress-value-reps')).toHaveTextContent('10');
});

it.each([
  ['2026-09-01', /Tuesday, September 1, saved journal entry/, null],
  ['2026-10-02', /Friday, October 2/, 0],
  ['2026-10-03', /Saturday, October 3/, 2],
] as const)(
  'shows the saved %s journal offline with an honest challenge count',
  async (date, label, count) => {
    const repo = harness.mockRepository!;
    await repo.acceptCalendar(calendar, zone, 0);
    await repo.restoreJournal([
      journalEntry(owner, {
        ...attempt(9),
        activityDate: date,
        startedAt: `${date}T14:00:00.000Z`,
        reflection: {
          feeling: null,
          text: 'Restored synthetic writing remains readable.',
          revision: 1,
        },
      }),
    ]);
    const screen = mount();
    if (date.startsWith('2026-09'))
      fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.press(screen.getByRole('button', { name: label }));
    if (count === null) {
      expect(
        screen.getByText('Saved journal · Challenge count unavailable'),
      ).toBeTruthy();
      expect(screen.queryByText('0 reps')).toBeNull();
    } else {
      expect(screen.getByText(`${count} reps`)).toBeTruthy();
      expect(screen.queryByText(/Challenge count unavailable/)).toBeNull();
    }
    fireEvent.press(screen.getByRole('button', { name: /Rep 1\./ }));
    expect(
      screen.getByText('Restored synthetic writing remains readable.'),
    ).toBeTruthy();
    expect(harness.mockClient.request).not.toHaveBeenCalled();
  },
);

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
  harness.mockClient.request.mockImplementation((path: string) => {
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
  const retainedRows = () =>
    screen.UNSAFE_getByType(DayEntryList).props.entries;
  await waitFor(() => expect(retainedRows()).toHaveLength(20));
  expect(screen.getByLabelText(/Rep 1\./)).toBeTruthy();
  const nearEnd = {
    nativeEvent: {
      contentOffset: { y: 900 },
      contentSize: { height: 1600 },
      layoutMeasurement: { height: 700 },
    },
  };
  fireEvent.scroll(screen.getByTestId('day-sheet-entry-list'), nearEnd);
  fireEvent.scroll(screen.getByTestId('day-sheet-entry-list'), nearEnd);
  expect(count).toBe(2);
  expect(screen.getByLabelText(/Rep 20\./)).toBeTruthy();
  fireEvent.scroll(screen.getByTestId('day-sheet-entry-list'), nearEnd);
  await waitFor(() =>
    expect(screen.getByLabelText('Loading more attempts')).toBeTruthy(),
  );
  await act(async () => next.reject(new Error('Temporary next-page failure')));
  await waitFor(() =>
    expect(screen.getByText('Couldn’t load more attempts')).toBeTruthy(),
  );
  // The complete loaded page remains available after the next-page failure.
  expect(
    retainedRows().map((row: { attemptId: string }) => row.attemptId),
  ).toEqual(first.entries.map((row) => row.id));
  expect(screen.getByLabelText(/Rep 1\./)).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', { name: 'Try loading more attempts again' }),
  );
  await waitFor(() => expect(retainedRows()).toHaveLength(21));
  expect(retainedRows().at(-1).attemptId).toBe(attempt(30).id);
  expect(screen.getByLabelText(/Rep 21\./)).toBeTruthy();
  expect(count).toBe(4);
});

it('fences account changes and clears old account progress while another account loads', async () => {
  await online();
  const screen = mount();
  await loaded();
  const pending = deferred<ProgressSummary>();
  harness.mockClient.request.mockReturnValue(pending.promise);
  const nextRepository = await repository(otherOwner);
  await act(async () => {
    harness.mockRepository!.setEnvironment({ active: false, online: false });
    harness.mockRepository = nextRepository;
    harness.mockRepository.setEnvironment({ active: true, online: true });
  });
  screen.rerender(
    <QueryClientProvider client={harness.mockClient.queries}>
      <ProgressRefresh
        client={harness.mockClient as unknown as AccountClient}
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
  harness.mockClient.request.mockRejectedValue(new Error('Unavailable'));
  fireEvent.press(screen.getByRole('button', { name: 'Previous month' }));
  await waitFor(() =>
    expect(screen.getByText('We couldn’t load your progress.')).toBeTruthy(),
  );
  expect(screen.getByTestId('progress-value-reps')).toHaveTextContent('10');
  fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
  await act(async () => harness.mockRepository!.rollover('2026-11-01', zone));
  expect(screen.getByRole('header', { name: 'November 2026' })).toBeTruthy();
});

it('shows a disconnected account message without private cached entries', () => {
  harness.mockRepository = null;
  const screen = mount();
  expect(
    screen.getByText('Connect your account to view Progress.'),
  ).toBeTruthy();
});

it('summary failure leaves the independently loaded calendar usable', async () => {
  harness.mockClient.request.mockImplementation((path: string) =>
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
