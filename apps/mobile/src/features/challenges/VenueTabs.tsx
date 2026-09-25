import { useEffect, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { venues, type Venue } from '@justgo/contracts';
import { colors, fontFamilies } from '../../theme/tokens';
import { challengeScale } from './challenge-design';

// Exact paths from Paper's editable venue row, separate from the card illustrations.
const paths: Record<string, string> = {
  streets: 'M3 20h18M4 18l3-7h10l3 7M12 11V3m-3 3h6M7 14h10M6 17h12',
  park: 'M12 22V7m0 8c-8 1-11-6-7-8 0-6 7-8 9-3 6-2 9 6 4 8 0 3-3 4-6 3ZM5 22h14',
  gym: 'M7 10h10v4H7M1 9v6m22-6v6',
  cafe: 'M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Zm12 1h2a3 3 0 0 1 0 6h-2M2 22h18M7 2v4m4-4v4m4-4v4',
  bookstore:
    'M3 5c3-1 6-1 9 1v14c-3-2-6-2-9-1V5Zm18 0c-3-1-6-1-9 1v14c3-2 6-2 9-1V5Z',
  bars: 'm3 3 7 1-1 6a3.5 3.5 0 0 1-7-1l1-6Zm3 10-1 7m-3 1 6 1M14 4l7-1 1 6a3.5 3.5 0 0 1-7 1l-1-6Zm4 9 1 7m-3 2 6-1',
};
export function VenueTabs({
  selected,
  disabled = false,
  onSelect,
}: {
  selected: Venue;
  disabled?: boolean;
  onSelect: (venue: Venue) => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const { width, fontScale } = useWindowDimensions();
  const scale = challengeScale(width);
  const pillWidth =
    ((Math.min(width, 384) - 40 * scale) / 3) * Math.max(1, fontScale);
  const selectedIndex = venues.findIndex((v) => v.id === selected);
  useEffect(() => {
    scroll.current?.scrollTo({
      x: Math.max(0, selectedIndex - 1) * (pillWidth + 6 * scale),
      animated: false,
    });
  }, [selectedIndex, pillWidth, scale]);
  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Challenge venues"
      style={{
        flexGrow: 0,
        flexShrink: 0,
        height: Math.max(44, 36 * scale * fontScale),
      }}
      contentContainerStyle={{ gap: 6 * scale, alignItems: 'center' }}
    >
      {venues.map((v) => {
        const active = v.id === selected;
        const color = active ? colors.white : colors.ink;
        return (
          <Pressable
            key={v.id}
            accessibilityRole="tab"
            accessibilityLabel={v.label}
            aria-selected={active}
            accessibilityState={{ selected: active, disabled }}
            disabled={disabled}
            onPress={() => onSelect(v.id)}
            style={{
              width: pillWidth,
              minHeight: 44,
              justifyContent: 'center',
            }}
          >
            <View
              style={[
                styles.pill,
                {
                  minHeight: 29 * scale * fontScale,
                  gap: 5 * scale,
                  backgroundColor: active ? colors.ink : colors.white,
                  borderColor: active ? colors.ink : '#75838B',
                },
              ]}
            >
              <Svg
                width={13 * scale}
                height={13 * scale}
                viewBox="0 0 24 24"
                aria-hidden
              >
                {v.id === 'gym' && (
                  <>
                    <Rect
                      x="3"
                      y="5"
                      width="4"
                      height="14"
                      rx="1"
                      stroke={color}
                      strokeWidth={1.5}
                      fill="none"
                    />
                    <Rect
                      x="17"
                      y="5"
                      width="4"
                      height="14"
                      rx="1"
                      stroke={color}
                      strokeWidth={1.5}
                      fill="none"
                    />
                  </>
                )}
                <Path
                  d={paths[v.id]!}
                  stroke={color}
                  strokeWidth={v.id === 'gym' ? 1.5 : 1.4}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
              <Text
                style={{
                  fontFamily: fontFamilies.regular,
                  fontSize: 9 * scale,
                  lineHeight: 12 * scale,
                  color,
                }}
              >
                {v.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.6,
    borderRadius: 18,
    paddingHorizontal: 4,
  },
});
