import { StyleSheet } from 'react-native';
import { colors, radii, spacing, typography } from '../../../theme/tokens';

export const accountStyles = StyleSheet.create({
  stack: { gap: spacing.xl },
  body: { ...typography.body, color: colors.ink },
  caption: { ...typography.caption, color: colors.ink },
  inset: { padding: spacing.lg, gap: spacing.md },
  input: {
    ...typography.body,
    color: colors.ink,
    minHeight: 52,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.small,
    backgroundColor: colors.white,
  },
  secret: { ...typography.body, color: colors.ink, fontFamily: 'monospace' },
  message: { ...typography.body, color: colors.ink },
});
