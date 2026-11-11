import {
  harness,
  mount,
  openToday,
} from '../../../test-support/progress/screen';

import { act, fireEvent, waitFor, within } from '@testing-library/react-native';

import { memoryJournalBackend } from '../../../test-support/local-journal';
import { attempt, uuid, deferred } from '../../../test-support/journal';

it('adds and edits a reflection inline while preserving its feeling and local saving behavior', async () => {
  const root = await mount();
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
  const screen = await mount();
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
  const screen = await mount();
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
  const screen = await mount();
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
  const screen = await mount();
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

it('allows clean cancellation without a leave prompt', async () => {
  const screen = await mount();
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
  const root = await mount();
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
});

it('cannot save an empty text-only edit from the dirty-close dialog', async () => {
  const written = {
    ...attempt(),
    reflection: { feeling: null, text: 'Retain this text.', revision: 1 },
  };
  await harness.mockRepository!.adoptAttempt(written);
  const screen = await mount();
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
