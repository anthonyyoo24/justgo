import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { ScaledText as Text } from './typography/ScaledText';
import { colors, layout, radii, spacing, typography } from '../theme/tokens';

export function PrimaryButton({
  label,
  onPress,
  busy = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {busy ? (
        <ActivityIndicator
          color={colors.white}
          size="small"
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${label} in progress`}
        />
      ) : (
        <Text maxFontSizeMultiplier={2} style={styles.label}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: layout.buttonHeight,
    backgroundColor: colors.ink,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  label: {
    ...typography.label,
    color: colors.white,
    textAlign: 'center',
    flexShrink: 1,
  },
});
