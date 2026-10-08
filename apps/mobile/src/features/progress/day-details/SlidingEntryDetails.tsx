import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { EntryMotionView, useEntryMotion } from './useEntryMotion';

export function SlidingEntryDetails({
  open,
  reduceMotion,
  contentKey,
  children,
  onOpened,
}: {
  open: boolean;
  reduceMotion: boolean;
  contentKey: 'editor' | 'saved';
  children: ReactNode;
  onOpened?: (() => void) | undefined;
}) {
  const [measurement, setMeasurement] = useState({
    key: contentKey,
    height: 0,
  });
  const contentHeight = measurement.height;
  const measuredKey = open ? measurement.key : null;
  const motion = useEntryMotion();
  const openedCallback = useRef(onOpened);
  useEffect(() => {
    openedCallback.current = onOpened;
  }, [onOpened]);

  useEffect(() => {
    // A replacement must be measured before starting its reveal. Reusing the
    // saved text's height would start and then restart the textbox animation.
    if (contentHeight === 0 || (open && measuredKey !== contentKey)) return;
    if (reduceMotion) {
      motion.set(open, contentHeight);
      if (open) openedCallback.current?.();
      return;
    }
    // Edit replaces visible saved text: retain opacity and position while
    // resizing. Resetting the reveal would flash the white sheet underneath.
    let cancelled = false;
    const stop = motion.animate(open, contentHeight, () => {
      if (open && !cancelled) openedCallback.current?.();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [contentHeight, contentKey, measuredKey, motion, open, reduceMotion]);

  return (
    <EntryMotionView
      testID="sliding-entry-details"
      pointerEvents={open ? 'auto' : 'none'}
      aria-hidden={!open}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      style={[styles.clip, motion.clipStyle]}
    >
      <EntryMotionView style={[styles.contentLayer, motion.contentStyle]}>
        <View
          key={contentKey}
          testID="entry-details-content"
          style={styles.content}
          onLayout={({ nativeEvent }) => {
            const { height } = nativeEvent.layout;
            // Keep the last measured height while an editor unmounts on close.
            if (height <= 12) {
              setMeasurement((current) =>
                current.key === contentKey
                  ? current
                  : { key: contentKey, height: current.height },
              );
              return;
            }
            setMeasurement((current) =>
              current.key !== contentKey ||
              Math.abs(current.height - height) > 0.5
                ? { key: contentKey, height }
                : current,
            );
          }}
        >
          {children}
        </View>
      </EntryMotionView>
    </EntryMotionView>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  contentLayer: { position: 'absolute', top: 0, left: 0, right: 0 },
  content: { paddingTop: 12 },
});
