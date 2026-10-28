import { fireEvent, render } from '@testing-library/react-native';

import type { ProgressEntry } from './types';
import { ProgressView } from './ProgressView';

jest.mock('expo-router', () => ({ Link: () => null }));
jest.mock('../../platform/motion/motion', () => ({
  useReduceMotion: () => false,
}));
jest.mock('./day-details/entries/useEntryMotion', () =>
  jest.requireActual('./day-details/entries/useEntryMotion.ts'),
);

import { month, entry, callbacks } from '../../../test-support/progress/view';

it('shows a retry in the sheet when its first page fails', async () => {
  const retry = jest.fn();
  const screen = await render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      dayError
      onRetryDay={retry}
      {...callbacks()}
    />,
  );

  expect(screen.getByText('Couldn’t load attempts')).toBeTruthy();
  expect(
    screen.getByText(
      'We couldn’t get your challenge attempts. Please try again.',
    ),
  ).toBeTruthy();
  const illustration = screen.getByTestId('day-initial-error-illustration', {
    includeHiddenElements: true,
  });
  expect(illustration.props.source).toEqual(
    require('../../../assets/illustrations/disconnected-plugs.png'),
  );
  expect(illustration.props.resizeMode).toBe('contain');
  expect(illustration.props['aria-hidden']).toBe(true);
  expect(screen.queryByTestId('day-sheet-entry-list')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Try loading attempts again' }),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});

it('keeps loaded entries and shows a bottom retry when a later page fails', async () => {
  const retry = jest.fn();
  const loadMore = jest.fn();
  const screen = await render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: 21,
        entries: [entry('first', 'none')],
      }}
      hasMore
      loadMoreError
      onRetryDay={retry}
      onLoadMore={loadMore}
      {...callbacks()}
    />,
  );

  expect(screen.getByLabelText(/Rep 1\. Say hello to someone/)).toBeTruthy();
  const footer = screen.getByTestId('day-load-more-error');
  expect(
    footer
      .queryAll((node) => node.type === 'Text')
      .map(({ props }) => props.children),
  ).toContain('Couldn’t load more attempts');
  await fireEvent.scroll(screen.getByTestId('day-sheet-entry-list'), {
    nativeEvent: {
      contentOffset: { y: 900 },
      contentSize: { height: 1600 },
      layoutMeasurement: { height: 700 },
    },
  });
  expect(loadMore).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Try loading more attempts again' }),
  );
  expect(retry).toHaveBeenCalledTimes(1);
});

it('keeps loaded attempts visible while the next page loads', async () => {
  const screen = await render(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: 21,
        entries: [entry('first', 'none')],
      }}
      hasMore
      loadingMore
      fetchingDay
      {...callbacks()}
    />,
  );

  expect(screen.getByLabelText(/Rep 1\. Say hello to someone/)).toBeTruthy();
  expect(screen.getByTestId('day-loading-more')).toBeTruthy();
  expect(screen.getByLabelText('Loading more attempts')).toBeTruthy();
  expect(screen.queryByText('Loading more attempts…')).toBeNull();
  expect(screen.queryByTestId('day-load-more-error')).toBeNull();
});

it('fetches once near the end of each page as the sheet scrolls', async () => {
  const loadMore = jest.fn();
  const first = Array.from({ length: 20 }, (_, index) =>
    entry(`attempt-${index}`, 'none'),
  );
  const renderDay = (entries: ProgressEntry[], fetchingDay = false) => (
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate="2026-09-18"
      day={{
        date: '2026-09-18',
        totalReps: 21,
        entries,
      }}
      hasMore
      fetchingDay={fetchingDay}
      onLoadMore={loadMore}
      {...callbacks()}
    />
  );
  const screen = await render(renderDay(first));
  const scroll = async (y: number) =>
    await fireEvent.scroll(screen.getByTestId('day-sheet-entry-list'), {
      nativeEvent: {
        contentOffset: { y },
        contentSize: { height: 1600 },
        layoutMeasurement: { height: 700 },
      },
    });

  await scroll(0);
  await scroll(500);
  expect(loadMore).not.toHaveBeenCalled();
  await scroll(900);
  await scroll(900);
  expect(loadMore).toHaveBeenCalledTimes(1);
  await screen.rerender(renderDay(first, true));
  await scroll(900);
  expect(loadMore).toHaveBeenCalledTimes(1);
  await screen.rerender(renderDay([...first, entry('attempt-20', 'none')]));
  // New page content must appear even if the user is already at the boundary
  // and native scrolling does not emit another event after the response.
  expect(screen.getByLabelText(/Rep 21\./)).toBeTruthy();
  await scroll(900);
  expect(loadMore).toHaveBeenCalledTimes(2);
  await screen.rerender(
    <ProgressView
      month="2026-09"
      data={month}
      selectedDate={null}
      {...callbacks()}
    />,
  );
  await screen.rerender(renderDay(first));
  await scroll(900);
  await scroll(900);
  expect(loadMore).toHaveBeenCalledTimes(2);
  await scroll(900);
  expect(loadMore).toHaveBeenCalledTimes(3);
  expect(
    screen.queryByRole('button', { name: 'Load more challenges' }),
  ).toBeNull();
});
