import { StyleSheet, Switch, Text, View } from 'react-native';
import { useMotionPreferences } from '../../platform/motion/motion';
import { colors, spacing, typography } from '../../theme/tokens';
import { SettingsRowContent } from './SettingsRows';

export function SettingsMotionRow() {
  const { reduceMotion, systemReduced, loading, saving, error, setReduced } =
    useMotionPreferences();
  const disabled = loading || saving || systemReduced !== false;
  const phoneNotice =
    systemReduced === true
      ? 'Enabled by your phone’s accessibility setting.'
      : systemReduced === null && !loading
        ? 'Your phone’s setting is unavailable. Motion stays reduced.'
        : null;
  return (
    <View>
      <SettingsRowContent
        icon="motion"
        label="Reduce motion"
        accessory={
          <Switch
            accessibilityLabel="Reduce motion"
            accessibilityHint={
              phoneNotice ?? 'Reduce animated movement in JustGO.'
            }
            accessibilityState={{ disabled, busy: loading || saving }}
            disabled={disabled}
            value={reduceMotion}
            onValueChange={(enabled) => {
              // The preference provider owns storage failure feedback.
              void setReduced(enabled);
            }}
            trackColor={{ false: colors.border, true: colors.ink }}
            thumbColor={colors.white}
          />
        }
      />
      {phoneNotice && <Text style={styles.notice}>{phoneNotice}</Text>}
      {error && (
        <Text accessibilityRole="alert" style={styles.notice}>
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
});
