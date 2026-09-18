import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout, spacing, typography } from '../theme/tokens';
export function Screen({
  title,
  children,
  accessory,
  insetTop = true,
}: PropsWithChildren<{
  title: string;
  accessory?: React.ReactNode;
  insetTop?: boolean;
}>) {
  return (
    <SafeAreaView
      style={styles.safe}
      edges={insetTop ? ['top', 'left', 'right'] : ['left', 'right']}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.heading}>
              {title}
            </Text>
            {accessory}
          </View>
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    padding: spacing.screen,
    gap: spacing.xl,
    paddingBottom: spacing.section,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  heading: { ...typography.heading, color: colors.ink, flexShrink: 1 },
});
