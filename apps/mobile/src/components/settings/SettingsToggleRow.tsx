import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/tokens';
import type { SettingsIconName } from './SettingsIcon';
import { SettingsRowContent } from './SettingsRows';

/** The visual toggle emits no native feedback; its owner controls any haptics. */
export function SettingsToggleRow({
  icon,
  label,
  hint,
  value,
  disabled,
  busy,
  onValueChange,
}: {
  icon: SettingsIconName;
  label: string;
  hint: string;
  value: boolean;
  disabled: boolean;
  busy: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const toggle = () => {
    if (!disabled) onValueChange(!value);
  };
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled, busy }}
      aria-checked={value}
      disabled={disabled}
      onPress={toggle}
      {...(Platform.OS === 'web'
        ? {
            // RN Web already handles Enter; switch roles need Space support.
            onKeyDown: (event: { key: string; preventDefault: () => void }) => {
              if (event.key === ' ' || event.key === 'Spacebar') {
                event.preventDefault();
                toggle();
              }
            },
          }
        : {})}
    >
      <SettingsRowContent
        icon={icon}
        label={label}
        accessory={
          <View
            pointerEvents="none"
            style={[
              styles.track,
              value && styles.on,
              disabled && !busy && styles.disabled,
            ]}
          >
            <View style={[styles.thumb, value && styles.thumbOn]} />
          </View>
        }
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 51,
    height: 31,
    borderRadius: 16,
    padding: 2,
    backgroundColor: colors.border,
  },
  on: { backgroundColor: colors.ink },
  thumb: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: colors.white,
  },
  thumbOn: { transform: [{ translateX: 20 }] },
  disabled: { opacity: 0.5 },
});
