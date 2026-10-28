import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import {
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';
import type { ProgressEntry } from '../../types';

const rowBatch = 8;

/** Keep animated row heights and active drafts stable while filling ahead of scroll. */
export function DayEntryList({
  entries,
  renderEntry,
  onScroll,
  footer,
  scrollRef,
  onViewportLayout,
  onScrollOffsetChange,
  onContentLayout,
  onScrollBeginDrag,
}: {
  entries: ProgressEntry[];
  renderEntry: (item: { item: ProgressEntry; index: number }) => ReactNode;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  footer: ReactNode;
  scrollRef?: Ref<ScrollViewInstance>;
  onViewportLayout?: (event: LayoutChangeEvent) => void;
  onScrollOffsetChange?: (y: number) => void;
  onContentLayout?: (height: number, complete: boolean) => void;
  onScrollBeginDrag?: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(rowBatch);
  const fillingAhead = useRef(false);
  const previousLength = useRef(entries.length);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [content, setContent] = useState({ height: 0, rows: 0 });
  const measureContent = useCallback(
    (_: number, height: number) => {
      const rows = Math.min(visibleCount, entries.length);
      onContentLayout?.(height, rows === entries.length);
      setContent((measured) =>
        measured.height === height && measured.rows === rows
          ? measured
          : { height, rows },
      );
    },
    [entries.length, visibleCount, onContentLayout],
  );
  useLayoutEffect(() => {
    const appended = entries.length > previousLength.current;
    previousLength.current = entries.length;
    // Wait for the newly rendered batch's height before deciding to add another.
    const fitsViewport =
      viewportHeight > 0 &&
      content.height > 0 &&
      content.height <= viewportHeight &&
      content.rows === Math.min(visibleCount, entries.length);
    // New data can arrive at the scroll boundary without another scroll event.
    if (
      visibleCount < entries.length &&
      (fitsViewport || (appended && fillingAhead.current))
    )
      setVisibleCount((count) => Math.min(entries.length, count + rowBatch));
  }, [content, entries.length, viewportHeight, visibleCount]);
  return (
    <ScrollView
      ref={scrollRef}
      testID="day-sheet-entry-list"
      style={styles.scroll}
      contentContainerStyle={styles.entries}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={onScrollBeginDrag}
      onLayout={(event) => {
        setViewportHeight(event.nativeEvent.layout.height);
        onViewportLayout?.(event);
      }}
      onContentSizeChange={measureContent}
      onScroll={(event) => {
        const { contentOffset, contentSize, layoutMeasurement } =
          event.nativeEvent;
        onScrollOffsetChange?.(contentOffset.y);
        fillingAhead.current =
          contentOffset.y > 0 &&
          contentOffset.y + layoutMeasurement.height * 2 >= contentSize.height;
        if (visibleCount < entries.length) {
          if (fillingAhead.current)
            setVisibleCount((count) =>
              Math.min(entries.length, count + rowBatch),
            );
          return;
        }
        onScroll(event);
      }}
    >
      {entries.slice(0, visibleCount).map((entry, index) => (
        <Fragment key={entry.attemptId}>
          {renderEntry({ item: entry, index })}
        </Fragment>
      ))}
      {visibleCount >= entries.length && footer}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { marginTop: 12 },
  entries: { paddingRight: 12, paddingBottom: 0 },
});
