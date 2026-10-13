import { useCallback } from 'react';
import { Redirect, useFocusEffect } from 'expo-router';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SettingsPage } from '../../components/settings/SettingsPage';
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsRowContent,
} from '../../components/settings/SettingsRows';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import { useHapticPreferences } from '../../platform/haptics/haptics';
import {
  completionHaptics,
  defaultCompletionHaptic,
  useCompletionHapticsTesting,
} from '../../platform/haptics/completion/completion-haptics';
import { colors, spacing, typography } from '../../theme/tokens';

const defaultLabel = completionHaptics.find(
  ({ id }) => id === defaultCompletionHaptic,
)!.label;

export function HapticsTestScreen() {
  const preferences = useHapticPreferences();
  const testing = useCompletionHapticsTesting();
  useFocusEffect(useCallback(() => testing.stop, [testing.stop]));
  if (!__DEV__) return <Redirect href="/settings" />;
  const canPreview =
    preferences.available &&
    preferences.enabled &&
    !preferences.loading &&
    !preferences.saving;
  const label = completionHaptics.find(
    ({ id }) => id === testing.selected,
  )!.label;
  return (
    <SettingsPage title="Test haptics" backHref="/settings">
      <View style={styles.copy}>
        <Text style={styles.description}>
          Choose an effect, then preview it on your iPhone. Your choice also
          plays when you tap Completed after a challenge.
        </Text>
        <Text style={styles.description}>
          Development only. Reloading restores {defaultLabel}, the app’s default
          effect.
        </Text>
        {!preferences.available ? (
          <Text style={styles.description}>
            Feel these effects on a physical iPhone with the Pulsar-enabled
            development build. This preview stays silent when unsupported.
          </Text>
        ) : null}
        {!preferences.enabled && (
          <Text style={styles.description}>
            Turn on Haptics in Settings to preview.
          </Text>
        )}
      </View>
      <SettingsGroup title="Try it">
        <SettingsActionRow
          icon="haptics"
          label={`Preview ${label}`}
          disabled={!canPreview}
          busy={testing.previewing}
          onPress={() => {
            void testing.preview();
          }}
        />
        <SettingsActionRow
          icon="haptics"
          label="Stop haptic"
          disabled={!preferences.available}
          onPress={testing.stop}
        />
      </SettingsGroup>
      {testing.error && (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.error}
        >
          {testing.error}
        </Text>
      )}
      <SettingsGroup title="Completion effect">
        {completionHaptics.map(({ id, label: name }) => (
          <Pressable
            key={id}
            accessibilityRole="radio"
            accessibilityLabel={name}
            aria-checked={id === testing.selected}
            accessibilityState={{ checked: id === testing.selected }}
            onPress={() => testing.select(id)}
            {...(Platform.OS === 'web'
              ? {
                  // RN Web activates radio Pressables with Enter; add Space
                  // without passing a DOM keyboard prop to the native view.
                  onKeyDown: (event: {
                    key: string;
                    preventDefault: () => void;
                  }) => {
                    if (event.key === ' ' || event.key === 'Spacebar') {
                      event.preventDefault();
                      testing.select(id);
                    }
                  },
                }
              : {})}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <SettingsRowContent
              icon="haptics"
              label={name}
              status={id === testing.selected ? 'Selected' : undefined}
            />
          </Pressable>
        ))}
      </SettingsGroup>
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  copy: { gap: spacing.sm },
  description: { ...typography.body, color: colors.ink },
  error: { ...typography.body, color: '#8B1E32' },
  pressed: { opacity: 0.65 },
});
