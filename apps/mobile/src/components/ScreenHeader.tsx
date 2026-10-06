import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, fontFamilies } from '../theme/tokens';

export function ScreenHeader({
  title,
  scale,
  showSettings = true,
}: {
  title: string;
  scale: number;
  showSettings?: boolean;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.slot} />
      <Text
        accessibilityRole="header"
        style={[styles.title, { fontSize: 17 * scale, lineHeight: 22 * scale }]}
      >
        {title}
      </Text>
      {showSettings ? (
        <Link href="/settings" asChild>
          <Pressable
            style={styles.profile}
            accessibilityRole="link"
            accessibilityLabel="Open Settings"
          >
            <Svg
              width={22 * scale}
              height={22 * scale}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <Circle
                cx="12"
                cy="12"
                r="10"
                fill="none"
                stroke={colors.ink}
                strokeWidth={0.9}
              />
              <Circle
                cx="12"
                cy="9"
                r="3.5"
                fill="none"
                stroke={colors.ink}
                strokeWidth={0.9}
              />
              <Path
                d="M5.4 19.4C5.7 11.2 18.3 11.2 18.6 19.4"
                fill="none"
                stroke={colors.ink}
                strokeWidth={0.9}
              />
            </Svg>
          </Pressable>
        </Link>
      ) : (
        <View style={styles.slot} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  slot: { width: 44, minHeight: 44, flexShrink: 0 },
  profile: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamilies.editorial,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.15,
  },
});
