import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

export function SlidingEntryDetails({
  open,
  reduceMotion,
  contentKey,
  children,
}: {
  open: boolean;
  reduceMotion: boolean;
  contentKey: 'editor' | 'saved';
  children: ReactNode;
}) {
  const [contentHeight, setContentHeight] = useState(0);
  const [height] = useState(() => new Animated.Value(0));
  const [progress] = useState(
    () => new Animated.Value(reduceMotion && open ? 1 : 0),
  );
  const previousContent = useRef(contentKey);

  useEffect(() => {
    if (contentHeight === 0) return;
    const changedContent = previousContent.current !== contentKey;
    previousContent.current = contentKey;
    if (reduceMotion) {
      height.setValue(open ? contentHeight : 0);
      progress.setValue(open ? 1 : 0);
      return;
    }
    // Edit replaces visible saved text: resize from the existing height while
    // the new textbox slides in, without snapping the whole section shut.
    if (changedContent && open) progress.setValue(0);
    const timing = {
      duration: open ? 240 : 230,
      easing: open ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    };
    const animation = Animated.parallel([
      Animated.timing(height, {
        ...timing,
        toValue: open ? contentHeight : 0,
      }),
      Animated.timing(progress, { ...timing, toValue: open ? 1 : 0 }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [contentHeight, contentKey, height, open, progress, reduceMotion]);

  return (
    <Animated.View
      testID="sliding-entry-details"
      pointerEvents={open ? 'auto' : 'none'}
      aria-hidden={!open}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.clip,
        {
          height,
          opacity: progress,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.contentLayer,
          {
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-12, 0],
                }),
              },
            ],
          },
        ]}
      >
        <View
          testID="entry-details-content"
          style={styles.content}
          onLayout={({ nativeEvent }) => {
            const { height } = nativeEvent.layout;
            // Keep the last measured height while an editor unmounts on close.
            if (height <= 12) return;
            setContentHeight((current) =>
              Math.abs(current - height) > 0.5 ? height : current,
            );
          }}
        >
          {children}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  contentLayer: { position: 'absolute', top: 0, left: 0, right: 0 },
  content: { paddingTop: 12 },
});
