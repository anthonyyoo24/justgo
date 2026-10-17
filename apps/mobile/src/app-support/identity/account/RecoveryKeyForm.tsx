import type { ReactNode } from 'react';
import { TextInput, View } from 'react-native';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { SettingsGroup } from '../../../components/settings/SettingsRows';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { colors } from '../../../theme/tokens';
import { identityScreenStyles as styles } from './identity-screen-styles';

/** The screen retains input across temporary closes and owns recovery orchestration. */
export function RecoveryKeyForm({
  value,
  onChange,
  onSubmit,
  disabled,
  busy,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <SettingsGroup title="Recover your account">
      <View style={styles.form}>
        <Text style={styles.body}>
          Recovering another account switches this device to that account. Your
          accounts stay separate.
        </Text>
        <TextInput
          accessibilityLabel="Recovery key"
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          placeholder="Recovery key"
          placeholderTextColor={colors.ink}
          value={value}
          onChangeText={onChange}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="none"
          maxLength={80}
          style={styles.input}
        />
        <PrimaryButton
          label="Recover with key"
          onPress={onSubmit}
          busy={busy}
          disabled={disabled}
        />
        {children}
      </View>
    </SettingsGroup>
  );
}
