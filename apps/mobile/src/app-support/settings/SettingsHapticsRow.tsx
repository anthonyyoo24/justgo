import { Platform, StyleSheet, View } from 'react-native';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import { SettingsToggleRow } from '../../components/settings/SettingsToggleRow';
import { useHapticPreferences } from '../../platform/haptics/haptics';
import { colors, spacing, typography } from '../../theme/tokens';

export function SettingsHapticsRow() {
  const { enabled, available, loading, saving, error, setEnabled } =
    useHapticPreferences();
  const disabled = loading || saving;
  return (
    <View>
      <SettingsToggleRow
        icon="haptics"
        label="Haptics"
        hint="Touch feedback for challenges and feeling selections."
        disabled={disabled}
        busy={disabled}
        value={enabled}
        onValueChange={(next) => {
          void setEnabled(next);
        }}
      />
      {!available && (
        <Text style={styles.notice}>
          {Platform.OS === 'web'
            ? 'Touch feedback is available in the iPhone app.'
            : __DEV__
              ? 'Touch feedback needs an updated iPhone development build.'
              : 'Touch feedback isn’t available on this device.'}
        </Text>
      )}
      {error && (
        <Text accessibilityRole="alert" style={[styles.notice, styles.error]}>
          {error}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  notice: {
    ...typography.caption,
    color: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  error: { color: '#8B1E32' },
});
