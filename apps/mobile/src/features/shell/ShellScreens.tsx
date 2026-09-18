import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { colors, radii, spacing, typography } from '../../theme/tokens';

export function SettingsLink() {
  return (
    <Link
      href="/settings"
      accessibilityLabel="Open Settings"
      style={styles.link}
    >
      Settings
    </Link>
  );
}
export function HomeScreen({ insetTop = true }: { insetTop?: boolean } = {}) {
  return (
    <Screen title="JustGO" accessory={<SettingsLink />} insetTop={insetTop}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>ONE SMALL STEP AT A TIME</Text>
        <Text accessibilityRole="header" style={styles.title}>
          A little courage.{'\n'}A world of possibility.
        </Text>
        <View style={styles.deck}>
          <Text style={styles.cardTitle}>Your next challenge</Text>
          <Text style={styles.body}>
            Challenges will appear here when they’re ready.
          </Text>
        </View>
        <Text style={styles.caption}>Room to try. Space to grow.</Text>
      </View>
    </Screen>
  );
}
export function ProgressScreen({
  insetTop = true,
}: { insetTop?: boolean } = {}) {
  return (
    <Screen
      title="Your progress"
      accessory={<SettingsLink />}
      insetTop={insetTop}
    >
      <Text style={styles.body}>Small moments, meaningful steps.</Text>
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          Your story takes shape here.
        </Text>
        <Text style={styles.body}>
          Your activity and saved reflections will appear here as you go.
        </Text>
      </View>
    </Screen>
  );
}
export function FocusedScreen({ kind }: { kind: 'success' | 'reflection' }) {
  return (
    <Screen
      title={
        kind === 'success' ? 'Your completed challenge' : 'Your reflection'
      }
    >
      <View style={styles.panel}>
        <Text style={styles.body}>
          {kind === 'success'
            ? 'Complete a challenge to see its result here.'
            : 'A completed challenge is needed before you can add a reflection.'}
        </Text>
      </View>
      <Link href="/(tabs)" replace style={styles.link}>
        Back to Home
      </Link>
    </Screen>
  );
}
export const styles = StyleSheet.create({
  link: {
    ...typography.label,
    color: colors.ink,
    paddingVertical: spacing.md,
    minHeight: 44,
    textDecorationLine: 'underline',
  },
  hero: {
    flex: 1,
    gap: spacing.xl,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  eyebrow: {
    ...typography.caption,
    letterSpacing: 1.3,
    color: colors.ink,
    textAlign: 'center',
  },
  title: { ...typography.display, color: colors.ink, textAlign: 'center' },
  body: { ...typography.body, color: colors.ink },
  cardTitle: { ...typography.heading, color: colors.ink },
  deck: {
    minHeight: 240,
    justifyContent: 'center',
    gap: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cream,
    padding: spacing.xl,
    marginBottom: spacing.md,
    boxShadow: `5px 7px 0 ${colors.peach}`,
  },
  panel: {
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.cream,
  },
  caption: { ...typography.caption, color: colors.ink, textAlign: 'center' },
});
