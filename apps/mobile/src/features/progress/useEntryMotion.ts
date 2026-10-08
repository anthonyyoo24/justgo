import { useMemo, useState } from 'react';
import { Animated, Easing } from 'react-native';

// The browser keeps its existing Animated driver. Native uses the paired
// Reanimated adapter so textbox mounting cannot starve intermediate frames.
export function useEntryMotion() {
  const [height] = useState(() => new Animated.Value(0));
  const [progress] = useState(() => new Animated.Value(0));
  return useMemo(
    () => ({
      clipStyle: { height, opacity: progress },
      contentStyle: {
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [-12, 0],
            }),
          },
        ],
      },
      set: (open: boolean, contentHeight: number) => {
        height.setValue(open ? contentHeight : 0);
        progress.setValue(open ? 1 : 0);
      },
      animate: (open: boolean, contentHeight: number, onDone: () => void) => {
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
        animation.start(({ finished }) => {
          if (finished) onDone();
        });
        return () => animation.stop();
      },
    }),
    [height, progress],
  );
}

export const EntryMotionView = Animated.View;
