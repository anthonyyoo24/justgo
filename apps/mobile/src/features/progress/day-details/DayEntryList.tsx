import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ScrollView,
  StyleSheet,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { ProgressEntry } from '../types';

const rowBatch = 8;

/** Keep animated row heights and active drafts stable while filling ahead of scroll. */
export function DayEntryList({
  entries,
  renderEntry,
  onScroll,
  footer,
}: {
  entries: ProgressEntry[];
  renderEntry: (item: { item: ProgressEntry; index: number }) => ReactNode;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  footer: ReactNode;
}) {
  const [visibleCount, setVisibleCount] = useState(rowBatch);
  const fillingAhead = useRef(false);
  useLayoutEffect(() => {
    // A page can arrive at the scroll boundary without another scroll event.
    // Fill from the new data immediately so the user can keep scrolling.
    if (fillingAhead.current)
      setVisibleCount((count) => Math.min(entries.length, count + rowBatch));
  }, [entries.length]);
  return (
    <ScrollView
      testID="day-sheet-entry-list"
      style={styles.scroll}
      contentContainerStyle={styles.entries}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      onScroll={(event) => {
        const { contentOffset, contentSize, layoutMeasurement } =
          event.nativeEvent;
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
  entries: { paddingRight: 12, paddingBottom: 24 },
});
