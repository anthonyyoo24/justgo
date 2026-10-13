import { StyleSheet, View } from 'react-native';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import { useMotionPreferences } from '../../platform/motion/motion';
import { colors, spacing, typography } from '../../theme/tokens';
import { SettingsToggleRow } from '../../components/settings/SettingsToggleRow';
import { useHapticFeedback } from '../../platform/haptics/haptics';

export function SettingsMotionRow() {
  const feedback = useHapticFeedback();
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
      <SettingsToggleRow
        icon="motion"
        label="Reduce motion"
        hint={phoneNotice ?? 'Reduce animated movement in JustGO.'}
        disabled={disabled}
        busy={loading || saving}
        value={reduceMotion}
        onValueChange={(enabled) => {
          // Replace the native switch's implicit tap with preference-aware input
          // feedback. The motion provider owns storage failure feedback.
          feedback('selection');
          void setReduced(enabled);
        }}
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
