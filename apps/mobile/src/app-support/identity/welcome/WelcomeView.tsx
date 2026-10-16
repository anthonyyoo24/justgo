import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import {
  colors,
  fontFamilies,
  layout,
  radii,
  spacing,
} from '../../../theme/tokens';

export function WelcomeView({
  busy = false,
  error = '',
  onContinue,
}: {
  busy?: boolean;
  error?: string;
  onContinue: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const wordmarkGrowth = 66 * (Math.min(fontScale, 1.5) - 1);
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <Image
        source={require('../../../../assets/illustrations/welcome-night-paper.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        accessible={false}
      />
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(
              insets.top + spacing.xl,
              height * 0.28 - wordmarkGrowth,
            ),
            paddingBottom: Math.max(insets.bottom, spacing.xxl),
          },
        ]}
      >
        <View style={[styles.hero, { gap: Math.max(44, height * 0.18 - 66) }]}>
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={1.5}
            style={styles.wordmark}
          >
            JustGO
          </Text>
          <Text style={styles.headline}>{'A little courage.\nEvery day.'}</Text>
        </View>
        <View style={styles.spacer} />
        <View style={styles.footer}>
          {!!error && (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={styles.error}
            >
              {error}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={onContinue}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator
                color={colors.ink}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Creating your account"
              />
            ) : (
              <Text style={styles.buttonLabel}>Continue</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    minHeight: 611,
  },
  hero: {
    width: '100%',
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: fontFamilies.display,
    fontSize: 60,
    fontWeight: '400',
    letterSpacing: -1.2,
    lineHeight: 66,
    color: '#FEF4E9',
    textAlign: 'center',
  },
  headline: {
    fontFamily: fontFamilies.display,
    fontSize: 20,
    lineHeight: 23,
    textAlign: 'center',
    color: '#FFFDF9',
    letterSpacing: 0,
  },
  spacer: { flexGrow: 1, minHeight: spacing.xl },
  footer: { width: '100%', maxWidth: layout.maxContentWidth, gap: 18 },
  button: {
    minHeight: layout.buttonHeight,
    // Sampled from the H1 reference's warm cream button fill.
    backgroundColor: '#FAD4B3',
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  buttonLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.ink,
  },
  pressed: { opacity: 0.7 },
  error: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: colors.peach,
  },
});
