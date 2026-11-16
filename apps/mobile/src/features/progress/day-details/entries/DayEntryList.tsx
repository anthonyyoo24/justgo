import {
  createContext,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';
import type { ProgressEntry } from '../../types';

const rowBatch = 8;

/**
 * Lets an opening row ask the list to keep its final bottom in view. The row
 * reports how much it will grow; the list follows the growth frame by frame.
 */
export const EntryExpansion = createContext<((growth: number) => void) | null>(
  null,
);
type Expansion = { id: string; height: number };

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
  scrollRef?: (scroll: ScrollViewInstance | null) => void;
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
  const scrollView = useRef<ScrollViewInstance | null>(null);
  const attachScroll = useCallback(
    (scroll: ScrollViewInstance | null) => {
      scrollView.current = scroll;
      scrollRef?.(scroll);
    },
    [scrollRef],
  );
  const geometry = useRef({ offset: 0, viewport: 0, content: 0 });
  const rowLayouts = useRef(new Map<string, { y: number; height: number }>());
  const expansion = useRef<Expansion | null>(null);
  // Scroll only as far as the content has grown so far, so the expanding
  // row's bottom stays pinned to the viewport edge while it opens. With
  // reduced motion the row opens in one step and this is a single jump.
  const followExpansion = useCallback(() => {
    const goal = expansion.current;
    if (!goal) return;
    const row = rowLayouts.current.get(goal.id);
    const { offset, viewport, content: contentHeight } = geometry.current;
    if (!row || viewport <= 0) {
      expansion.current = null;
      return;
    }
    // A row taller than the viewport shows its start, never its far end.
    const target =
      goal.height > viewport ? row.y : row.y + goal.height - viewport;
    const reachable = Math.min(target, contentHeight - viewport);
    if (reachable > offset + 0.5) {
      geometry.current.offset = reachable;
      scrollView.current?.scrollTo({ y: reachable, animated: false });
    }
    if (reachable >= target - 0.5) expansion.current = null;
  }, []);
  const expandRow = useCallback(
    (id: string, growth: number) => {
      const row = rowLayouts.current.get(id);
      expansion.current =
        row && growth > 0.5 ? { id, height: row.height + growth } : null;
      followExpansion();
    },
    [followExpansion],
  );
  const measureRow = useCallback(
    (id: string, y: number, height: number) =>
      rowLayouts.current.set(id, { y, height }),
    [],
  );
  const measureContent = useCallback(
    (_: number, height: number) => {
      geometry.current.content = height;
      followExpansion();
      const rows = Math.min(visibleCount, entries.length);
      onContentLayout?.(height, rows === entries.length);
      setContent((measured) =>
        measured.height === height && measured.rows === rows
          ? measured
          : { height, rows },
      );
    },
    [entries.length, visibleCount, onContentLayout, followExpansion],
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
      ref={attachScroll}
      testID="day-sheet-entry-list"
      style={styles.scroll}
      contentContainerStyle={styles.entries}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={() => {
        // A finger on the list owns scrolling from here on.
        expansion.current = null;
        onScrollBeginDrag?.();
      }}
      onLayout={(event) => {
        geometry.current.viewport = event.nativeEvent.layout.height;
        followExpansion();
        setViewportHeight(event.nativeEvent.layout.height);
        onViewportLayout?.(event);
      }}
      onContentSizeChange={measureContent}
      onScroll={(event) => {
        const { contentOffset, contentSize, layoutMeasurement } =
          event.nativeEvent;
        geometry.current.offset = contentOffset.y;
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
        <EntrySlot
          key={entry.attemptId}
          id={entry.attemptId}
          onMeasure={measureRow}
          onExpand={expandRow}
        >
          {renderEntry({ item: entry, index })}
        </EntrySlot>
      ))}
      {visibleCount >= entries.length && footer}
    </ScrollView>
  );
}

function EntrySlot({
  id,
  onMeasure,
  onExpand,
  children,
}: {
  id: string;
  onMeasure: (id: string, y: number, height: number) => void;
  onExpand: (id: string, growth: number) => void;
  children: ReactNode;
}) {
  const expand = useCallback(
    (growth: number) => onExpand(id, growth),
    [id, onExpand],
  );
  return (
    <View
      onLayout={({ nativeEvent: { layout } }) =>
        onMeasure(id, layout.y, layout.height)
      }
    >
      <EntryExpansion.Provider value={expand}>
        {children}
      </EntryExpansion.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { marginTop: 12 },
  entries: { paddingRight: 12, paddingBottom: 0 },
});
