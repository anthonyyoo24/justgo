import { Link, type LinkProps } from 'expo-router';
import { StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

export function NavigationLink({ style, ...props }: LinkProps) {
  return <Link {...props} style={[styles.link, style]} />;
}

export function SettingsLink() {
  return (
    <NavigationLink href="/settings" accessibilityLabel="Open Settings">
      Settings
    </NavigationLink>
  );
}

const styles = StyleSheet.create({
  link: {
    ...typography.label,
    color: colors.ink,
    paddingVertical: spacing.md,
    minHeight: 44,
    textDecorationLine: 'underline',
  },
});
