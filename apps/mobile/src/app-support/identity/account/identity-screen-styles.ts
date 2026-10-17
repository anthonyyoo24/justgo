import { StyleSheet } from 'react-native';
import {
  colors,
  layout,
  radii,
  spacing,
  typography,
} from '../../../theme/tokens';

export const identityScreenStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    padding: spacing.screen,
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  wordmark: { ...typography.heading, color: colors.ink },
  eyebrow: {
    ...typography.caption,
    color: colors.ink,
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  hero: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.cream,
  },
  art: {
    width: 120,
    height: 100,
    mixBlendMode: 'multiply',
  },
  image: { width: '100%', height: '100%' },
  heading: { ...typography.display, color: colors.ink, textAlign: 'center' },
  body: { ...typography.body, color: colors.ink },
  small: { ...typography.caption, color: colors.ink },
  title: {
    ...typography.heading,
    fontSize: 25,
    lineHeight: 29,
    color: colors.ink,
  },
  card: {
    backgroundColor: colors.paper,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  form: { padding: spacing.lg, gap: spacing.lg },
  notice: {
    padding: spacing.lg,
    backgroundColor: colors.peach,
    borderRadius: radii.small,
  },
  textButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  textButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  link: {
    ...typography.label,
    color: colors.ink,
    textDecorationLine: 'underline',
    textAlign: 'center',
    flexShrink: 1,
  },
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
  verification: {
    ...typography.heading,
    fontSize: 24,
    lineHeight: 32,
    color: colors.ink,
    textAlign: 'center',
  },
});
