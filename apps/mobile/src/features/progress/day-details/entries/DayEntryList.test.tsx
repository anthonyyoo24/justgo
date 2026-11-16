import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import type { ProgressEntry } from '../../types';
import { DayEntryList } from './DayEntryList';
import { SlidingEntryDetails } from './SlidingEntryDetails';

jest.mock('./useEntryMotion', () => jest.requireActual('./useEntryMotion.ts'));

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
  const onScrollOffsetChange = jest.fn();
  const onContentLayout = jest.fn();
  const onScrollBeginDrag = jest.fn();
  const screen = await render(
    <DayEntryList
      entries={entries(25)}
      renderEntry={renderEntry}
      onScroll={onScroll}
      onScrollOffsetChange={onScrollOffsetChange}
      onContentLayout={onContentLayout}
      onScrollBeginDrag={onScrollBeginDrag}
      footer={<Text>List footer</Text>}
    />,
  );
  const list = screen.getByTestId('day-sheet-entry-list');
  expect(screen.getAllByText(/^Entry \d+$/)).toHaveLength(8);
  await fireEvent(list, 'layout', layout(1000));
  await fireEvent(list, 'contentSizeChange', 390, 600);
  expect(onContentLayout).toHaveBeenLastCalledWith(600, false);
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
  // Keyboard reveal needs the real offset even while local batches still
  // intercept scrolling before backend pagination receives events.
  expect(onScrollOffsetChange).toHaveBeenLastCalledWith(100);
  expect(screen.getByText('Entry 25')).toBeTruthy();
  expect(screen.getByText('List footer')).toBeTruthy();
  await fireEvent(list, 'contentSizeChange', 390, 1600);
  expect(onContentLayout).toHaveBeenLastCalledWith(1600, true);
  expect(onScroll).not.toHaveBeenCalled();
  await fireEvent.scroll(list, nearEnd);
  expect(onScroll).toHaveBeenCalledTimes(1);
  expect(onScrollBeginDrag).not.toHaveBeenCalled();
  await fireEvent(list, 'scrollBeginDrag');
  expect(onScrollBeginDrag).toHaveBeenCalledTimes(1);
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

it('keeps trailing padding at zero, so the last row meets the viewport and the safe area stays outside', async () => {
  const screen = await render(
    <DayEntryList
      entries={entries(2)}
      renderEntry={renderEntry}
      onScroll={jest.fn()}
      footer={null}
    />,
  );
  const style = StyleSheet.flatten(
    screen.getByTestId('day-sheet-entry-list').props.contentContainerStyle,
  );
  expect(
    style.paddingBottom ??
      style.paddingBlockEnd ??
      style.paddingVertical ??
      style.paddingBlock ??
      style.padding ??
      0,
  ).toBe(0);
});

describe('scrolling an opening row into view', () => {
  // Four 100-point rows in a 300-point viewport, scrolled to the bottom.
  async function setup(reduceMotion: boolean) {
    const scrollTo = jest.fn();
    const attach = (scroll: ScrollViewInstance | null) => {
      if (scroll) jest.spyOn(scroll, 'scrollTo').mockImplementation(scrollTo);
    };
    const list = (open: string | null) => (
      <DayEntryList
        entries={entries(4)}
        scrollRef={attach}
        renderEntry={({ item }) => (
          <View testID={`row-${item.attemptId}`}>
            <Text>{item.instruction}</Text>
            <SlidingEntryDetails
              open={open === item.attemptId}
              reduceMotion={reduceMotion}
              contentKey="saved"
            >
              <Text>Reflection</Text>
            </SlidingEntryDetails>
          </View>
        )}
        onScroll={jest.fn()}
        onScrollBeginDrag={jest.fn()}
        footer={null}
      />
    );
    const screen = await render(list(null));
    const scrollView = screen.getByTestId('day-sheet-entry-list');
    await fireEvent(scrollView, 'layout', layout(300));
    await fireEvent(scrollView, 'contentSizeChange', 390, 400);
    for (let index = 0; index < 4; index += 1)
      await fireEvent(screen.getByTestId(`row-entry-${index}`), 'layout', {
        nativeEvent: {
          layout: { x: 0, y: index * 100, width: 390, height: 100 },
        },
      });
    await fireEvent.scroll(scrollView, {
      nativeEvent: {
        contentOffset: { y: 100 },
        contentSize: { height: 400 },
        layoutMeasurement: { height: 300 },
      },
    });
    const open = async (id: string, height: number) => {
      await screen.rerender(list(id));
      await fireEvent(screen.getByTestId('entry-details-content'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
      });
    };
    const grow = (height: number) =>
      fireEvent(scrollView, 'contentSizeChange', 390, height);
    return { screen, scrollView, scrollTo, open, grow };
  }

  it('follows the last row while its reflection opens below the viewport', async () => {
    const { scrollTo, open, grow } = await setup(false);
    await open('entry-3', 120);
    // Nothing has grown yet, and the list is already at its end.
    expect(scrollTo).not.toHaveBeenCalled();
    await grow(460);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 160, animated: false });
    await grow(520);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 220, animated: false });
    // The reflection is fully in view, so later growth such as a new page
    // below it leaves the position alone.
    await grow(900);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });

  it('opens with one jump when motion is reduced', async () => {
    const { scrollTo, open, grow } = await setup(true);
    await open('entry-3', 120);
    await grow(520);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 220, animated: false });
  });

  it('does not scroll when the opened reflection already fits', async () => {
    const { scrollTo, open, grow } = await setup(false);
    await open('entry-1', 80);
    await grow(480);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('shows the start of a row taller than the viewport', async () => {
    const { scrollTo, open, grow } = await setup(true);
    await open('entry-3', 400);
    await grow(800);
    expect(scrollTo).toHaveBeenCalledWith({ y: 300, animated: false });
  });

  it('stops following once the person drags the list', async () => {
    const { scrollView, scrollTo, open, grow } = await setup(false);
    await open('entry-3', 120);
    await grow(460);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    await fireEvent(scrollView, 'scrollBeginDrag');
    await grow(520);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });
});
