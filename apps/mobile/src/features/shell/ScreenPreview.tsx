import { useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeScreen, ProgressScreen } from './ShellScreens';
import { NavigationIcon } from '../../components/NavigationIcon';
import { colors, spacing, typography } from '../../theme/tokens';
// Presentation fixtures only. No API, account impersonation, or entitlement override.
export function ScreenPreview() {
  const [tab, setTab] = useState<'home' | 'progress'>('home');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView edges={['top']} style={styles.notice}>
        <Text style={styles.note}>SCREEN PREVIEW · No activity is saved</Text>
        <Link href="/" replace style={styles.close}>
          Exit preview
        </Link>
      </SafeAreaView>
      {tab === 'home' ? (
        <HomeScreen insetTop={false} />
      ) : (
        <ProgressScreen insetTop={false} />
      )}
      <SafeAreaView edges={['bottom']} style={styles.nav}>
        <View style={styles.row}>
          {(['home', 'progress'] as const).map((name) => (
            <Pressable
              key={name}
              accessibilityRole="tab"
              aria-selected={tab === name}
              accessibilityLabel={name === 'home' ? 'Home' : 'Progress'}
              accessibilityState={{ selected: tab === name }}
              onPress={() => setTab(name)}
              style={styles.tab}
            >
              <NavigationIcon
                name={name}
                color={tab === name ? colors.white : colors.border}
              />
              <Text
                style={[
                  styles.label,
                  { color: tab === name ? colors.white : colors.border },
                ]}
              >
                {name === 'home' ? 'Home' : 'Progress'}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}
const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.peach,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    alignItems: 'center',
  },
  note: { ...typography.caption, color: colors.ink },
  close: {
    ...typography.caption,
    textDecorationLine: 'underline',
    color: colors.ink,
    minHeight: 44,
    padding: spacing.md,
  },
  nav: { backgroundColor: colors.navy },
  row: { flexDirection: 'row' },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.lg,
    minHeight: 64,
  },
  label: typography.caption,
});
