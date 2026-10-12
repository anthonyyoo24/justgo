import { useRouter, type Href } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  colors,
  fontFamilies,
  layout,
  spacing,
  typography,
} from '../../theme/tokens';
import { SettingsIcon } from './SettingsIcon';

export function SettingsPage({
  title,
  backHref = '/',
  children,
}: PropsWithChildren<{ title: string; backHref?: Href }>) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              accessibilityHint="Return to the previous screen"
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace(backHref)
              }
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <SettingsIcon name="back" />
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <View style={styles.headerSlot} />
          </View>
          {children}
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
});
