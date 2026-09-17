import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, layout, radii, spacing, typography } from '../theme/tokens';

export function PrimaryButton({
  label,
  onPress,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {busy && (
        <ActivityIndicator
          color={colors.white}
          accessibilityLabel="Checking connection"
        />
      )}
      <Text style={styles.label}>{label}</Text>
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
