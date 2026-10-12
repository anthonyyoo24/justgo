import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { EntryMotionView, useEntryMotion } from './useEntryMotion';

type EntryDetailsProps = {
  open: boolean;
  reduceMotion: boolean;
  contentKey: 'editor' | 'saved';
  children: ReactNode;
  onOpened?: (() => void) | undefined;
};

export function SlidingEntryDetails(props: EntryDetailsProps) {
  const [retained, setRetained] = useState(props.open);
  const release = useCallback(() => setRetained(false), []);
  // Keep the outgoing panel until its closing animation finishes. Untouched
  // rows never allocate native motion values or measure hidden forms.
  if (props.open && !retained) setRetained(true);
  return props.open || retained ? (
    <MountedEntryDetails {...props} onClosed={release} />
  ) : null;
}

function MountedEntryDetails({
  open,
  reduceMotion,
  contentKey,
  children,
  onOpened,
  onClosed,
}: EntryDetailsProps & { onClosed: () => void }) {
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
    // A rapid close can arrive before the first layout. Nothing has been
    // revealed yet, so there is no outgoing animation to retain.
    if (!open && contentHeight === 0) {
      onClosed();
      return;
    }
    // A replacement must be measured before starting its reveal. Reusing the
    // saved text's height would start and then restart the textbox animation.
    if (contentHeight === 0 || (open && measuredKey !== contentKey)) return;
    if (reduceMotion) {
      motion.set(open, contentHeight);
      if (open) openedCallback.current?.();
      else onClosed();
      return;
    }
    // Edit replaces visible saved text: retain opacity and position while
    // resizing. Resetting the reveal would flash the white sheet underneath.
    let cancelled = false;
    const stop = motion.animate(open, contentHeight, () => {
      if (cancelled) return;
      if (open) openedCallback.current?.();
      else onClosed();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [
    contentHeight,
    contentKey,
    measuredKey,
    motion,
    open,
    reduceMotion,
    onClosed,
  ]);

  return (
    <EntryMotionView
      testID="sliding-entry-details"
      aria-hidden={!open}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.clip,
        motion.clipStyle,
        { pointerEvents: open ? 'auto' : 'none' },
      ]}
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
