import { useCallback, useMemo } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export function useEntryMotion() {
  const height = useSharedValue(0);
  const progress = useSharedValue(0);
  const clipStyle = useAnimatedStyle(() => ({
    height: height.get(),
    opacity: progress.get(),
  }));
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -12 * (1 - progress.get()) }],
  }));
  const set = useCallback(
    (open: boolean, contentHeight: number) => {
      cancelAnimation(height);
      cancelAnimation(progress);
      height.set(open ? contentHeight : 0);
      progress.set(open ? 1 : 0);
    },
    [height, progress],
  );
  const animate = useCallback(
    (open: boolean, contentHeight: number, onDone: () => void) => {
      const timing = {
        duration: open ? 240 : 230,
        easing: open ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
      };
      // Let the first native commit settle before the timing clock starts.
      // Otherwise a busy mounting frame can consume most of the reveal curve.
      height.set(withDelay(16, withTiming(open ? contentHeight : 0, timing)));
      progress.set(
        withDelay(
          16,
          withTiming(open ? 1 : 0, timing, (finished) => {
            if (finished) scheduleOnRN(onDone);
          }),
        ),
      );
      return () => {
        cancelAnimation(height);
        cancelAnimation(progress);
      };
    },
    [height, progress],
  );
  return useMemo(
    () => ({ clipStyle, contentStyle, set, animate }),
    [clipStyle, contentStyle, set, animate],
  );
}

export const EntryMotionView = Animated.View;
