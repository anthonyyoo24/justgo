import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import {
  SettingsActionRow,
  SettingsGroup,
} from '../../../components/settings/SettingsRows';
import type { IdentityController } from '../controller';
import { useIdentityAction } from '../useIdentityAction';
import { AccountConfirmation } from './AccountConfirmation';
import { accountStyles as styles } from './account-styles';

export function Devices({
  controller,
  state,
}: {
  controller: IdentityController;
  state: ReturnType<IdentityController['getSnapshot']>;
}) {
  const [revoking, setRevoking] = useState<string | null>(null);
  const { activeAction, runAction } = useIdentityAction(controller);
  useFocusEffect(useCallback(() => () => setRevoking(null), []));
  return (
    <>
      <SettingsGroup title="Connected devices">
        {state.devices.length ? (
          state.devices.map((device) => (
            <View key={device.id}>
              <View style={styles.inset}>
                <Text style={styles.body}>
                  {device.id === state.account?.deviceId
                    ? 'This phone'
                    : 'Other device'}{' '}
                  · {device.id.slice(0, 8)}
                </Text>
                {device.revokedAt && (
                  <Text style={styles.caption}>Access removed</Text>
                )}
              </View>
              {!device.revokedAt && (
                <SettingsActionRow
                  icon="delete"
                  label={`Revoke device ${device.id.slice(0, 8)}`}
                  disabled={state.busy}
                  busy={activeAction === `revoke-device:${device.id}`}
                  onPress={() => setRevoking(device.id)}
                />
              )}
            </View>
          ))
        ) : (
          <View style={styles.inset}>
            <Text style={styles.body}>No devices to show.</Text>
          </View>
        )}
      </SettingsGroup>
      {revoking && (
        <AccountConfirmation
          message={
            revoking === state.account?.deviceId
              ? 'This will sign this phone out. You will need a recovery key or another authorized device to access your account again.'
              : 'This device will lose access to your account. Recovery keys remain valid until separately revoked.'
          }
          busy={state.busy}
          onCancel={() => setRevoking(null)}
          onConfirm={() => {
            const id = revoking;
            setRevoking(null);
            void runAction(`revoke-device:${id}`, () =>
              controller.revokeDevice(id),
            );
          }}
        />
      )}
    </>
  );
}
