import { useRouter, type Href } from 'expo-router';
import type { PropsWithChildren } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  colors,
  fontFamilies,
  layout,
  spacing,
  typography,
} from '../../theme/tokens';
import { SettingsIcon } from './SettingsIcon';
import { ScaledText } from '../typography/ScaledText';

export function SettingsPage({
  title,
  backHref = '/',
  children,
}: PropsWithChildren<{ title: string; backHref?: Href }>) {
  const router = useRouter();
  const { fontScale, width } = useWindowDimensions();
  const expanded = fontScale > 1.3;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.content}>
          <View style={[styles.header, expanded && styles.expandedHeader]}>
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
            <ScaledText
              accessibilityRole="header"
              maxFontSizeMultiplier={2}
              style={[
                styles.title,
                expanded && styles.expandedTitle,
                expanded && width < 360 && styles.narrowTitle,
              ]}
            >
              {title}
            </ScaledText>
            {!expanded && <View style={styles.headerSlot} />}
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
  expandedHeader: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
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
  expandedTitle: {
    flex: 0,
    width: '100%',
    textAlign: 'left',
    fontSize: 23,
    lineHeight: 30,
  },
  narrowTitle: { fontSize: 20, lineHeight: 27 },
  pressed: { opacity: 0.65 },
});
