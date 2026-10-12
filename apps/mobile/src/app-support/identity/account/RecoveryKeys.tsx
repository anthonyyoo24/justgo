import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, View } from 'react-native';
import {
  SettingsActionRow,
  SettingsGroup,
} from '../../../components/settings/SettingsRows';
import type { IdentityController } from '../controller';
import { useIdentityAction } from '../useIdentityAction';
import { AccountConfirmation } from './AccountConfirmation';
import { accountStyles as styles } from './account-styles';

export function RecoveryKeys({
  controller,
  state,
}: {
  controller: IdentityController;
  state: ReturnType<IdentityController['getSnapshot']>;
}) {
  const [revealed, setRevealed] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const { activeAction, runAction } = useIdentityAction(controller);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        setRevealed(false);
        controller.hideKey();
      }
    });
    return () => subscription.remove();
  }, [controller]);
  useFocusEffect(
    useCallback(
      () => () => {
        setRevealed(false);
        setRevoking(null);
        controller.hideKey();
      },
      [controller],
    ),
  );
  const keys = state.recoveryKeys.filter(
    (key) => key.kind === 'key' && !key.revokedAt,
  );
  return (
    <>
      <SettingsGroup title="Recovery key">
        <View style={styles.inset}>
          <Text style={styles.body}>
            Save a key somewhere private so you can recover your account if you
            lose this phone.
          </Text>
          <Text style={styles.caption}>
            Recovery brings back uploaded history. Changes saved only on a lost
            phone cannot be recovered.
          </Text>
        </View>
        <SettingsActionRow
          icon="key"
          label="Show recovery key"
          disabled={state.busy}
          busy={activeAction === 'Show recovery key'}
          onPress={() => {
            setRevealed(true);
            void runAction('Show recovery key', controller.saveKey);
          }}
        />
        {revealed && state.key && (
          <View style={styles.inset}>
            <Text style={styles.caption}>
              Anyone with this key can access your account. Keep it private.
            </Text>
            <Text selectable style={styles.secret}>
              {state.key.match(/.{1,8}/g)?.join(' ')}
            </Text>
            <SettingsActionRow
              icon="privacy"
              label="Hide recovery key"
              onPress={() => {
                setRevealed(false);
                controller.hideKey();
              }}
            />
          </View>
        )}
      </SettingsGroup>
      <SettingsGroup title="Manage keys">
        {keys.length ? (
          keys.map((key) => (
            <SettingsActionRow
              key={key.id}
              icon="delete"
              label={`Revoke recovery key ${key.id.slice(0, 8)}`}
              disabled={state.busy}
              busy={activeAction === `revoke-key:${key.id}`}
              onPress={() => setRevoking(key.id)}
            />
          ))
        ) : (
          <View style={styles.inset}>
            <Text style={styles.body}>No recovery keys yet.</Text>
          </View>
        )}
      </SettingsGroup>
      {revoking && (
        <AccountConfirmation
          message="This key will stop recovering your account. Your active devices will remain signed in."
          busy={state.busy}
          onCancel={() => setRevoking(null)}
          onConfirm={() => {
            const id = revoking;
            setRevoking(null);
            void runAction(`revoke-key:${id}`, () =>
              controller.revokeCredential(id),
            );
          }}
        />
      )}
      <SettingsGroup title="Existing account">
        <SettingsActionRow
          icon="account"
          label="Recover an existing account"
          chevron
          disabled={state.busy}
          href="/account/recover"
        />
      </SettingsGroup>
    </>
  );
}
