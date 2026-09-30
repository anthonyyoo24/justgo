import { useEffect, useId, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

// One clock keeps the calendar and summary highlights moving together.
export function useProgressShimmer(loading: boolean) {
  const reduceMotion = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!loading || reduceMotion) return;
    progress.setValue(0);
    const animation = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        isInteraction: false,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [loading, progress, reduceMotion]);
  return loading && !reduceMotion ? progress : null;
}

export function ProgressSkeleton({
  animation,
  style,
  testID,
}: {
  animation: Animated.Value | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const gradientId = `progress-shine-${useId().replace(/:/g, '')}`;
  return (
    <View
      testID={testID}
      aria-hidden
      pointerEvents="none"
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
      style={[styles.rectangle, style]}
    >
      {animation && width > 0 && (
        <Animated.View
          testID="progress-shimmer-band"
          style={[
            styles.band,
            {
              width,
              transform: [
                {
                  translateX: animation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-width, width],
                  }),
                },
              ],
            },
          ]}
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0.35">
                <Stop offset="0" stopColor="#FFFAF4" stopOpacity="0" />
                <Stop offset="0.5" stopColor="#FFFAF4" stopOpacity="0.95" />
                <Stop offset="1" stopColor="#FFFAF4" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rectangle: {
    backgroundColor: '#E7DCD0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  band: { position: 'absolute', left: 0, top: 0, bottom: 0 },
});
