import type { PropsWithChildren } from 'react';
import { Link } from 'expo-router';
import {
  ScrollView,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '../../theme/tokens';
import { challengeScale, challengeDisplayFont } from './challenge-design';

export function ChallengeLayout({
  title,
  children,
  insetTop = true,
  fillContent = false,
}: PropsWithChildren<{
  title: string;
  insetTop?: boolean;
  fillContent?: boolean;
}>) {
  const { width } = useWindowDimensions();
  const scale = challengeScale(width);
  return (
    <SafeAreaView
      testID="challenge-screen-surface"
      style={styles.safe}
      edges={insetTop ? ['top', 'left', 'right'] : ['left', 'right']}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.content,
            fillContent && styles.fillContent,
            { paddingHorizontal: 14 * scale },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.slot} />
            <Text
              accessibilityRole="header"
              style={[
                styles.title,
                { fontSize: 17 * scale, lineHeight: 22 * scale },
              ]}
            >
              {title}
            </Text>
            <Link href="/settings" accessibilityLabel="Open Settings" asChild>
              <Pressable style={styles.profile} accessibilityRole="link">
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
          </View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: 384,
    paddingTop: 4,
    paddingBottom: 16,
    gap: 12,
  },
  fillContent: { flexGrow: 1, paddingBottom: 0 },
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
    fontFamily: challengeDisplayFont,
    fontWeight: '700',
    color: colors.ink,
    letterSpacing: -0.15,
  },
});
