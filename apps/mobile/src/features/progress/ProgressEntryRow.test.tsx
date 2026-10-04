import { fireEvent, render } from '@testing-library/react-native';
import { legacyProgressEntrySchema } from '@justgo/contracts';
import { ProgressEntryRow } from './ProgressEntryRow';

const legacyEntry = {
  attemptId: '00000000-0000-4000-8000-000000000001',
  completedAt: '2026-09-18T13:15:00.000Z',
  timeZone: 'America/Toronto',
  cardId: 'ST-01',
  venue: 'streets',
  challengeId: 'hello',
  revisionId: 'hello-v1',
  levelId: 'level-1',
  instruction: 'Say hello to someone',
  feelingVersion: 1,
  reflectionStatus: 'none',
  feeling: null,
  reflectionText: null,
};

it('preserves the completion time for an existing legacy history row', () => {
  const screen = render(
    <ProgressEntryRow
      entry={legacyProgressEntrySchema.parse(legacyEntry)}
      index={0}
      expanded={false}
      onToggle={jest.fn()}
      reduceMotion
    />,
  );

  expect(screen.getByText('9:15 AM')).toBeTruthy();
  expect(
    screen.getByLabelText(
      'Rep 1. Say hello to someone. 9:15 AM. Feeling: Not recorded',
    ),
  ).toBeTruthy();
});

it.each([null, '2026-09-18T13:15:00.000Z'])(
  'uses the activity timestamp when the completion timestamp is %s',
  (completedAt) => {
    const screen = render(
      <ProgressEntryRow
        entry={legacyProgressEntrySchema.parse({
          ...legacyEntry,
          completedAt,
          activityAt: '2026-09-18T12:05:00.000Z',
          cardId: null,
          revisionId: null,
        })}
        index={0}
        expanded={false}
        onToggle={jest.fn()}
        reduceMotion
      />,
    );

    expect(screen.getByText('8:05 AM')).toBeTruthy();
    expect(screen.queryByText('9:15 AM')).toBeNull();
    expect(
      screen.getByLabelText(
        'Rep 1. Say hello to someone. 8:05 AM. Feeling: Not recorded',
      ),
    ).toBeTruthy();
  },
);

it('omits unknown time without hiding the entry or its reflection action', () => {
  const onToggle = jest.fn();
  const screen = render(
    <ProgressEntryRow
      entry={legacyProgressEntrySchema.parse({
        ...legacyEntry,
        completedAt: null,
        cardId: null,
        revisionId: null,
        reflectionStatus: 'submitted',
        reflectionText: 'A small step.',
      })}
      index={0}
      expanded={false}
      onToggle={onToggle}
      reduceMotion
    />,
  );

  expect(screen.queryByTestId('entry-clock-icon')).toBeNull();
  const row = screen.getByRole('button', {
    name: 'Rep 1. Say hello to someone. Feeling: Not recorded. View Reflection',
  });
  fireEvent.press(row);
  expect(onToggle).toHaveBeenCalledTimes(1);
});
