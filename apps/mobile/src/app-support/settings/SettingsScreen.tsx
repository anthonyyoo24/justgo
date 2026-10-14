import { Link, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  colors,
  fontFamilies,
  layout,
  spacing,
  typography,
} from '../../theme/tokens';
import { SettingsInformationGroups } from './SettingsInformationGroups';
import { SettingsIcon } from './SettingsIcon';
import { SettingsMotionRow } from './SettingsMotionRow';
import {
  PendingSettingsRow,
  SettingsGroup,
  SettingsRowContent,
} from './SettingsRows';

export function SettingsScreen() {
  const router = useRouter();
  const version = Constants.expoConfig?.version;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              accessibilityHint="Return to the previous screen"
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace('/')
              }
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <SettingsIcon name="back" />
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>
              Settings
            </Text>
            <View style={styles.headerSlot} />
          </View>

          <SettingsGroup title="Preferences">
            <PendingSettingsRow icon="haptics" label="Haptics" />
            <SettingsMotionRow />
          </SettingsGroup>

          <SettingsGroup title="Account & data">
            <Link href="/recovery" asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Account & recovery"
                style={({ pressed }) => pressed && styles.pressed}
              >
                <SettingsRowContent
                  icon="account"
                  label="Account & recovery"
                  chevron
                />
              </Pressable>
            </Link>
            <PendingSettingsRow icon="export" label="Export my data" />
            <PendingSettingsRow icon="delete" label="Delete account" />
          </SettingsGroup>

          <SettingsGroup title="Privacy">
            <PendingSettingsRow icon="analytics" label="General analytics" />
            <PendingSettingsRow icon="sensitive" label="Sensitive metadata" />
          </SettingsGroup>

          <SettingsInformationGroups />

          <Text style={styles.footer}>
            JustGO{version ? ` · Version ${version}` : ''}
          </Text>
          {__DEV__ && (
            <Link href="/preview" style={styles.preview}>
              Preview app screens
            </Link>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.successCanvas },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerSlot: { width: layout.minTouchTarget, flexShrink: 0 },
  back: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: layout.minTouchTarget / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    ...typography.heading,
    fontFamily: fontFamilies.editorial,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.ink,
    flex: 1,
    textAlign: 'center',
  },
  pressed: { opacity: 0.65 },
  footer: { ...typography.caption, color: colors.ink, textAlign: 'center' },
  preview: {
    ...typography.caption,
    color: colors.ink,
    textAlign: 'center',
    textDecorationLine: 'underline',
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.md,
  },
});
