import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
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
  reduceMotion,
  onValueChange,
}: {
  icon: SettingsIconName;
  label: string;
  hint: string;
  value: boolean;
  disabled: boolean;
  busy: boolean;
  reduceMotion: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const [progress] = useState(() => new Animated.Value(value ? 1 : 0));
  const previousValue = useRef(value);
  useEffect(() => {
    const changed = previousValue.current !== value;
    previousValue.current = value;
    if (reduceMotion) {
      progress.setValue(value ? 1 : 0);
      return;
    }
    if (!changed) return;
    const animation = Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reduceMotion, value]);

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
            style={[styles.track, disabled && !busy && styles.disabled]}
          >
            <Animated.View
              testID="settings-toggle-fill"
              style={[styles.fill, { opacity: progress }]}
            />
            <Animated.View
              testID="settings-toggle-thumb"
              style={[
                styles.thumb,
                {
                  transform: [
                    {
                      translateX: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 20],
                      }),
                    },
                  ],
                },
              ]}
            />
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
  fill: {
    ...StyleSheet.absoluteFill,
    borderRadius: 16,
    backgroundColor: colors.ink,
  },
  thumb: {
    width: 27,
    height: 27,
    borderRadius: 14,
    backgroundColor: colors.white,
  },
  disabled: { opacity: 0.5 },
});
