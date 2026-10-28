import {
  harness,
  summary,
  calendar,
  page,
  mount,
  online,
  loaded,
  openToday,
} from '../../../test-support/progress/screen';

import { act, fireEvent, waitFor, within } from '@testing-library/react-native';

import { memoryJournalBackend } from '../../../test-support/local-journal';
import { attempt, uuid, deferred } from '../../../test-support/journal';

it('adds and edits a reflection inline while preserving its feeling and local saving behavior', async () => {
  await online();
  const root = await mount();
  await loaded();
  await openToday(root);
  const screen = within(root.getByTestId('day-sheet-panel'));
  await fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  const addSave = screen.getByRole('button', { name: 'Save reflection' });
  expect(addSave).toBeDisabled();
  expect(screen.getByRole('button', { name: /Rep 1.*Cancel/ })).toBeTruthy();
  expect(
    screen.getByTestId('cancel-reflection-icon', {
      includeHiddenElements: true,
    }),
  ).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'First day entry text.',
  );
  await fireEvent.press(addSave);
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  expect(harness.mockRepository!.getAttempt(uuid(1))?.reflection?.text).toBe(
    'First day entry text.',
  );
  expect(screen.getByText('First day entry text.')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: /Rep 1.*Hide Reflection/ }),
  ).toBeTruthy();
  expect(
    screen.queryByTestId('cancel-reflection-icon', {
      includeHiddenElements: true,
    }),
  ).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Edit reflection' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection').props.value).toBe(
      'First day entry text.',
    ),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Edited day text.',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Save reflection' }),
  );
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  expect(harness.mockRepository!.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Edited day text.',
  );
});

it('opens Add from the row title and guards dirty input when the row is tapped again', async () => {
  await online();
  const screen = await mount();
  await loaded();
  await openToday(screen);
  await fireEvent.press(screen.getByText('Say hello.'));
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  expect(screen.getByRole('button', { name: /Rep 1.*Cancel/ })).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Keep this unsent writing.',
  );
  await fireEvent.press(screen.getByText('Feeling'));
  expect(screen.getByText('Leave your reflection?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Your day reflection').props.value).toBe(
    'Keep this unsent writing.',
  );
  await fireEvent.press(screen.getByRole('button', { name: /Rep 1.*Cancel/ }));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Discard changes' }),
  );
  expect(screen.queryByLabelText('Your day reflection')).toBeNull();
  expect(harness.mockRepository!.getAttempt(uuid(1))?.reflection).toBeNull();
  expect(screen.getByLabelText(/Rep 1.*Add reflection/)).toBeTruthy();
});

it('protects dirty input on sheet close and keeps editing without applying the canceled close later', async () => {
  await online();
  const screen = await mount();
  await loaded();
  await openToday(screen);
  await fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Unfinished day text.',
  );
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Close day details' })[0]!,
  );
  expect(screen.getByText('Leave your reflection?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Your day reflection').props.value).toBe(
    'Unfinished day text.',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Save reflection' }),
  );
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  expect(screen.getByText('Unfinished day text.')).toBeTruthy();
});

it('discards only unsent editor changes and keeps the day sheet open', async () => {
  await online();
  const screen = await mount();
  await loaded();
  await openToday(screen);
  await fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Discardable text.',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Cancel reflection' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Discard changes' }),
  );
  expect(screen.queryByLabelText('Your day reflection')).toBeNull();
  expect(harness.mockRepository!.getAttempt(uuid(1))?.reflection).toBeNull();
  expect(screen.getByLabelText(/Rep 1.*Add reflection/)).toBeTruthy();
});

it('blocks duplicate slow saves, retains newer typing and saves through dirty-close confirmation', async () => {
  await online();
  const screen = await mount();
  await loaded();
  await openToday(screen);
  await fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  await act(async () =>
    harness.mockRepository!.setEnvironment({ active: true, online: false }),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Submitted day text.',
  );
  const pending = deferred<void>();
  memoryJournalBackend(harness.storage).beforeCommit = () => pending.promise;
  await fireEvent.press(
    screen.getByRole('button', { name: 'Cancel reflection' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Save Reflection' }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Save Reflection' }),
  );
  await act(async () => jest.advanceTimersByTimeAsync(199));
  expect(screen.queryByTestId('day-reflection-dismiss-spinner')).toBeNull();
  await act(async () => jest.advanceTimersByTimeAsync(1));
  expect(screen.getByTestId('day-reflection-dismiss-spinner')).toBeTruthy();
  for (const button of screen.getAllByRole('button', {
    name: 'Saving reflection',
  }))
    expect(button).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
  await fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Newer day text.',
  );
  await fireEvent.press(
    screen.getAllByRole('button', { name: 'Close day details' })[0]!,
  );
  expect(screen.getByLabelText('Your day reflection').props.value).toBe(
    'Newer day text.',
  );
  await act(async () => {
    memoryJournalBackend(harness.storage).beforeCommit = null;
    pending.resolve();
  });
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Save reflection' }),
    ).toBeEnabled(),
  );
  expect(harness.mockRepository!.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Submitted day text.',
  );
  expect(
    harness
      .mockRepository!.store.getState()
      .journal.operations.filter((op) => op.kind === 'patch'),
  ).toHaveLength(0);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Save reflection' }),
  );
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  expect(harness.mockRepository!.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Newer day text.',
  );
});

it('allows clean cancellation and reports unavailable today cache instead of a false empty day', async () => {
  await online();
  const screen = await mount();
  await loaded();
  await openToday(screen);
  await fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  await fireEvent.press(screen.getByRole('button', { name: /Rep 1.*Cancel/ }));
  expect(screen.queryByLabelText('Your day reflection')).toBeNull();
  expect(screen.queryByText('Leave your reflection?')).toBeNull();
  expect(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  ).toBeTruthy();
  expect(harness.mockRepository!.getAttempt(uuid(1))?.reflection).toBeNull();
  await act(async () => {
    harness.mockRepository!.setEnvironment({ active: true, online: false });
    const journal = harness.mockRepository!.store.getState().journal;
    harness.mockRepository!.store.setState({
      journal: { ...journal, records: {}, today: null },
    });
    harness.mockClient.queries.removeQueries({
      predicate: (query) => query.queryKey.includes('day'),
    });
  });
  expect(screen.getByText("You're currently offline")).toBeTruthy();
  expect(
    screen.getByText('Connect to the internet to view this day’s activity.'),
  ).toBeTruthy();
});

it('keeps usable caches through a failed background refresh and reports a failed explicit editor adoption', async () => {
  await online();
  const screen = await mount();
  await loaded();
  harness.mockClient.request.mockRejectedValue(
    new Error('Refresh unavailable'),
  );
  await act(async () => harness.mockClient.queries.invalidateQueries());
  await loaded();
  expect(
    screen.queryByText(/out of date|Couldn’t refresh your summary/),
  ).toBeNull();
  const older = {
    ...attempt(2),
    activityDate: '2026-10-03',
    startedAt: '2026-10-03T14:00:00.000Z',
  };
  harness.mockClient.request.mockImplementation(async (path: string) => {
    if (path.includes('date=2026-10-03'))
      return {
        date: '2026-10-03',
        totalReps: 2,
        entries: [older],
        nextCursor: null,
      };
    throw new Error('Refresh unavailable');
  });
  await fireEvent.press(
    screen.getByRole('button', { name: /Saturday, October 3, 2 reps/ }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
    ).toBeTruthy(),
  );
  const adopt = jest
    .spyOn(harness.mockRepository!, 'adoptAttempt')
    .mockRejectedValueOnce(new Error('Account changed'));
  await fireEvent.press(
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
  await harness.mockRepository!.adoptAttempt(felt);
  harness.transport.records.set(uuid(1), attempt());
  harness.mockClient.request.mockImplementation(async (path: string) =>
    path.includes('/summary?')
      ? summary
      : path.includes('/calendar?')
        ? calendar
        : { ...page, entries: [harness.transport.records.get(uuid(1))!] },
  );
  await online();
  const root = await mount();
  await loaded();
  await openToday(root);
  const screen = within(root.getByTestId('day-sheet-panel'));
  await fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  const addSave = screen.getByRole('button', { name: 'Save reflection' });
  expect(addSave).toBeDisabled();
  await fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Writing after a feeling-only submission.',
  );
  await fireEvent.press(addSave);
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  await waitFor(() =>
    expect(harness.mockRepository!.getAttempt(uuid(1))?.reflection?.text).toBe(
      'Writing after a feeling-only submission.',
    ),
  );
  expect(harness.mockRepository!.getAttempt(uuid(1))?.reflection?.feeling).toBe(
    'a_little_better',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Edit reflection' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  await fireEvent.changeText(screen.getByLabelText('Your day reflection'), '');
  const editSave = screen.getByRole('button', { name: 'Save reflection' });
  expect(editSave).toBeEnabled();
  await fireEvent.press(editSave);
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  expect(harness.mockRepository!.getAttempt(uuid(1))?.reflection).toMatchObject(
    {
      feeling: 'a_little_better',
      text: null,
    },
  );
  expect(
    harness.mockRepository!.store.getState().journal.summaryAdditions,
  ).toHaveLength(0);
});

it('retains an older-day saved reflection after upload, pruning and a stale day refresh', async () => {
  const older = {
    ...attempt(2),
    activityDate: '2026-10-03',
    startedAt: '2026-10-03T14:00:00.000Z',
  };
  harness.transport.records.set(uuid(2), older);
  harness.mockClient.request.mockImplementation(async (path: string) =>
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
  const screen = await mount();
  await loaded();
  await fireEvent.press(
    screen.getByRole('button', { name: /Saturday, October 3, 2 reps/ }),
  );
  await loaded();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
    ).toBeTruthy(),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*Add reflection/ }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Saved older-day reflection.',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Save reflection' }),
  );
  await waitFor(() =>
    expect(harness.mockRepository!.getAttempt(uuid(2))?.reflection?.text).toBe(
      'Saved older-day reflection.',
    ),
  );
  await loaded();
  await waitFor(() =>
    expect(
      harness.mockRepository!.store.getState().journal.records[uuid(2)],
    ).toBeUndefined(),
  );
  expect(screen.getByText('Saved older-day reflection.')).toBeTruthy();
});

it('cannot save an empty text-only edit from the dirty-close dialog', async () => {
  const written = {
    ...attempt(),
    reflection: { feeling: null, text: 'Retain this text.', revision: 1 },
  };
  await harness.mockRepository!.adoptAttempt(written);
  harness.transport.records.set(uuid(1), attempt());
  harness.mockClient.request.mockImplementation(async (path: string) =>
    path.includes('/summary?')
      ? summary
      : path.includes('/calendar?')
        ? calendar
        : { ...page, entries: [written] },
  );
  await online();
  const screen = await mount();
  await loaded();
  await openToday(screen);
  await fireEvent.press(
    screen.getByRole('button', { name: /Rep 1.*View Reflection/ }),
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Edit reflection' }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText('Your day reflection')).toBeTruthy(),
  );
  await fireEvent.changeText(screen.getByLabelText('Your day reflection'), '');
  expect(
    screen.getByRole('button', { name: 'Save reflection' }),
  ).toBeDisabled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Cancel reflection' }),
  );
  expect(
    screen.getByRole('button', { name: 'Save Reflection' }),
  ).toBeDisabled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Discard changes' }),
  );
  await waitFor(() =>
    expect(screen.queryByLabelText('Your day reflection')).toBeNull(),
  );
  expect(harness.mockRepository!.getAttempt(uuid(1))?.reflection?.text).toBe(
    'Retain this text.',
  );
});
