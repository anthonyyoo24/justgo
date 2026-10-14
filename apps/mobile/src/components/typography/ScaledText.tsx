import { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native';

/** Explicit metrics keep native text measurement in sync with live text sizes. */
function useScaledTextStyle(
  style: StyleProp<TextStyle>,
  maxMultiplier = 0,
): TextStyle {
  const { fontScale } = useWindowDimensions();
  const scale =
    maxMultiplier > 0 ? Math.min(fontScale, maxMultiplier) : fontScale;
  return useMemo(() => {
    const base = StyleSheet.flatten(style) ?? {};
    return {
      ...base,
      fontSize: (base.fontSize ?? 14) * scale,
      ...(base.lineHeight === undefined
        ? {}
        : { lineHeight: base.lineHeight * scale }),
    };
  }, [style, scale]);
}

export function ScaledText({
  style,
  maxFontSizeMultiplier,
  ...props
}: Omit<TextProps, 'allowFontScaling' | 'dynamicTypeRamp'>) {
  const scaledStyle = useScaledTextStyle(style, maxFontSizeMultiplier ?? 0);
  // The user's scale is already applied above; native scaling would apply it twice.
  return <Text {...props} allowFontScaling={false} style={scaledStyle} />;
}
