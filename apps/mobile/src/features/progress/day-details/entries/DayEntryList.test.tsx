import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import type { ProgressEntry } from '../../types';
import { DayEntryList } from './DayEntryList';

const entries = (count: number): ProgressEntry[] =>
  Array.from({ length: count }, (_, index) => ({
    attemptId: `entry-${index}`,
    instruction: `Entry ${index + 1}`,
    startedAt: '2026-10-14T12:00:00Z',
    timeZone: 'UTC',
    reflectionStatus: 'none',
    feeling: null,
    reflectionText: null,
  }));
const renderEntry = ({ item }: { item: ProgressEntry }) => (
  <Text>{item.instruction}</Text>
);
const layout = (height: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
});
const nearEnd = {
  nativeEvent: {
    contentOffset: { y: 100 },
    contentSize: { height: 700 },
    layoutMeasurement: { height: 500 },
  },
};

it('fills available space in measured batches without scrolling or reusing stale measurements', async () => {
  const onScroll = jest.fn();
  const screen = await render(
    <DayEntryList
      entries={entries(25)}
      renderEntry={renderEntry}
      onScroll={onScroll}
      footer={<Text>List footer</Text>}
    />,
  );
  const list = screen.getByTestId('day-sheet-entry-list');
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(8);
  await fireEvent(list, 'layout', layout(1000));
  await fireEvent(list, 'contentSizeChange', 390, 600);
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(16);

  // A resize must not reuse the old eight-row height for another batch.
  await fireEvent(list, 'layout', layout(1200));
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(16);
  await fireEvent(list, 'contentSizeChange', 390, 1100);
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(24);
  await fireEvent(list, 'contentSizeChange', 390, 1500);
  await fireEvent(list, 'contentSizeChange', 390, 1500);
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(24);
  expect(screen.queryByText('List footer')).toBeNull();
  expect(onScroll).not.toHaveBeenCalled();

  await fireEvent.scroll(list, nearEnd);
  expect(screen.getByText('Entry 25')).toBeTruthy();
  expect(screen.getByText('List footer')).toBeTruthy();
  expect(onScroll).not.toHaveBeenCalled();
  await fireEvent.scroll(list, nearEnd);
  expect(onScroll).toHaveBeenCalledTimes(1);
});

it('fills when content is measured before the viewport, including an exact fit', async () => {
  const screen = await render(
    <DayEntryList
      entries={entries(9)}
      renderEntry={renderEntry}
      onScroll={jest.fn()}
      footer={<Text>List footer</Text>}
    />,
  );
  const list = screen.getByTestId('day-sheet-entry-list');
  await fireEvent(list, 'contentSizeChange', 390, 600);
  expect(screen.queryByText('Entry 9')).toBeNull();
  await fireEvent(list, 'layout', layout(600));
  expect(screen.getByText('Entry 9')).toBeTruthy();
  expect(screen.getByText('List footer')).toBeTruthy();
});

it('ignores zero sizes and preserves rendered rows when the viewport shrinks', async () => {
  const screen = await render(
    <DayEntryList
      entries={entries(25)}
      renderEntry={renderEntry}
      onScroll={jest.fn()}
      footer={null}
    />,
  );
  const list = screen.getByTestId('day-sheet-entry-list');
  await fireEvent(list, 'layout', layout(1000));
  await fireEvent(list, 'contentSizeChange', 390, 0);
  await fireEvent(list, 'layout', layout(0));
  await fireEvent(list, 'contentSizeChange', 390, 600);
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(8);
  await fireEvent(list, 'layout', layout(500));
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(8);
  await fireEvent(list, 'layout', layout(1000));
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(16);
  await fireEvent(list, 'contentSizeChange', 390, 1100);
  await fireEvent(list, 'layout', layout(500));
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(16);
});

it('fills newly available entries when the previous data already fit without scrolling', async () => {
  const props = { renderEntry, onScroll: jest.fn(), footer: null };
  const screen = await render(<DayEntryList {...props} entries={entries(8)} />);
  const list = screen.getByTestId('day-sheet-entry-list');
  await fireEvent(list, 'layout', layout(1000));
  await fireEvent(list, 'contentSizeChange', 390, 600);
  await screen.rerender(<DayEntryList {...props} entries={entries(17)} />);
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(16);
  await fireEvent(list, 'contentSizeChange', 390, 900);
  expect(screen.getByText('Entry 17')).toBeTruthy();
  expect(props.onScroll).not.toHaveBeenCalled();
});

it('reveals a new page after scrolling without mounting the rest or requesting it twice', async () => {
  const props = { renderEntry, onScroll: jest.fn(), footer: null };
  const screen = await render(<DayEntryList {...props} entries={entries(8)} />);
  const list = screen.getByTestId('day-sheet-entry-list');
  await fireEvent.scroll(list, nearEnd);
  expect(props.onScroll).toHaveBeenCalledTimes(1);
  await screen.rerender(<DayEntryList {...props} entries={entries(41)} />);
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(16);
  await screen.rerender(<DayEntryList {...props} entries={entries(41)} />);
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(16);
  expect(props.onScroll).toHaveBeenCalledTimes(1);
});
