import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { View } from 'react-native';
import {
  SettingsGroup,
  SettingsActionRow,
} from '../../../components/settings/SettingsRows';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { accountStyles as styles } from './account-styles';

export function AccountConfirmation({
  message,
  busy,
  onConfirm,
  onCancel,
}: {
  message: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <SettingsGroup title="Please confirm">
      <View style={styles.inset}>
        <Text style={styles.body}>{message}</Text>
        <PrimaryButton label="Confirm" disabled={busy} onPress={onConfirm} />
      </View>
      <SettingsActionRow
        icon="back"
        label="Cancel"
        disabled={busy}
        onPress={onCancel}
      />
    </SettingsGroup>
  );
}
