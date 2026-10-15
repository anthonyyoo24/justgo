import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { StyleSheet, View } from 'react-native';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import {
  SettingsActionRow,
  SettingsGroup,
} from '../../../components/settings/SettingsRows';
import { colors, spacing, typography } from '../../../theme/tokens';

export function AccountRecoveryScreen({
  cancellationPending = false,
}: {
  cancellationPending?: boolean;
}) {
  return (
    <SettingsPage title="Account & recovery" backHref="/settings">
      <SettingsGroup title="Account">
        <View style={styles.summary}>
          <Text style={styles.label}>Private account</Text>
          <Text style={styles.caption}>No email or password.</Text>
          <Text style={styles.caption}>Connected</Text>
        </View>
        <SettingsActionRow
          icon="account"
          label="Troubleshooting"
          chevron
          href="/account/troubleshooting"
        />
      </SettingsGroup>
      <SettingsGroup title="Recovery">
        <SettingsActionRow
          icon="key"
          label="Recovery keys"
          chevron
          href="/account/keys"
        />
        <SettingsActionRow
          icon="transfer"
          label="Move to another phone"
          chevron
          href="/account/transfer"
        />
      </SettingsGroup>
      <SettingsGroup title="Devices">
        <SettingsActionRow
          icon="devices"
          label="Devices"
          chevron
          href="/account/devices"
        />
      </SettingsGroup>
      {cancellationPending && (
        <Text accessibilityRole="alert" style={styles.caption}>
          Transfer cancelled on this phone. Server confirmation is pending.
          Retry when connected.
        </Text>
      )}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  summary: { padding: spacing.lg, gap: spacing.xs },
  label: { ...typography.body, color: colors.ink },
  caption: { ...typography.caption, color: colors.ink },
});
