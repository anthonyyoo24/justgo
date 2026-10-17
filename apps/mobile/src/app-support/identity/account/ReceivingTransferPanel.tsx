import { View } from 'react-native';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { SettingsGroup } from '../../../components/settings/SettingsRows';
import { PrimaryButton } from '../../../components/PrimaryButton';
import type { IdentityController } from '../controller';
import { IdentityTextButton } from './IdentityTextButton';
import { identityScreenStyles as styles } from './identity-screen-styles';

export function ReceivingTransferPanel({
  transfer,
  disabled,
  finishing,
  restarting,
  onFinish,
  onRestart,
}: {
  transfer: ReturnType<IdentityController['getSnapshot']>['transfer'];
  disabled: boolean;
  finishing: boolean;
  restarting: boolean;
  onFinish: () => void;
  onRestart: () => void;
}) {
  return (
    <SettingsGroup title="Connect from your other device">
      <View style={styles.form}>
        {transfer && (
          <>
            <Text style={styles.body}>
              Enter this code on your existing device:
            </Text>
            <Text selectable style={styles.verification}>
              {transfer.code.match(/.{1,4}/g)?.join('-')}
            </Text>
            <Text style={styles.body}>
              Then enter these six digits on your existing device:
            </Text>
            <Text selectable style={styles.verification}>
              {transfer.verification}
            </Text>
            <Text style={styles.small}>
              Expires at{' '}
              {new Date(transfer.expiresAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
              . Approval is required.
            </Text>
            <Text style={styles.small}>
              Leaving this screen or closing JustGO cancels this transfer.
            </Text>
            <PrimaryButton
              label="Check approval & finish"
              onPress={onFinish}
              busy={finishing}
              disabled={disabled}
            />
          </>
        )}
        <IdentityTextButton
          label="Start a new transfer"
          disabled={disabled}
          busy={restarting}
          onPress={onRestart}
        />
      </View>
    </SettingsGroup>
  );
}
