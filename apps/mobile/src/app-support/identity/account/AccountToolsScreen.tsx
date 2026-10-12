import { useCallback, useSyncExternalStore } from 'react';
import { Redirect, useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import {
  SettingsGroup,
  SettingsActionRow,
} from '../../../components/settings/SettingsRows';
import type { IdentityController } from '../controller';
import { useIdentityAction } from '../useIdentityAction';
import { RecoveryKeys } from './RecoveryKeys';
import { DeviceTransfer } from './DeviceTransfer';
import { Devices } from './Devices';
import { accountStyles as styles } from './account-styles';

export const accountTools = {
  keys: 'Recovery keys',
  transfer: 'Move to another phone',
  devices: 'Devices',
  troubleshooting: 'Troubleshooting',
} as const;
export type AccountTool = keyof typeof accountTools;

export function AccountToolsScreen({
  controller,
  tool,
}: {
  controller: IdentityController;
  tool: AccountTool;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const { activeAction, runAction } = useIdentityAction(controller);
  useFocusEffect(
    useCallback(() => {
      // The controller owns failures and publishes retryable feedback.
      if (controller.getSnapshot().account)
        void controller.refresh({ background: true });
      return () => controller.hideKey();
    }, [controller]),
  );
  if (!state.account) return <Redirect href="/recovery" />;
  return (
    <SettingsPage title={accountTools[tool]} backHref="/recovery">
      <View key={`${state.account.userId}:${tool}`} style={styles.stack}>
        {tool === 'keys' && (
          <RecoveryKeys controller={controller} state={state} />
        )}
        {tool === 'transfer' && (
          <DeviceTransfer controller={controller} state={state} />
        )}
        {tool === 'devices' && (
          <Devices controller={controller} state={state} />
        )}
        {tool === 'troubleshooting' && (
          <SettingsGroup title="Account connection">
            <View style={styles.inset}>
              <Text selectable style={styles.caption}>
                Account {state.account.userId.slice(0, 8)}
              </Text>
              <Text style={styles.body}>
                Your connection normally refreshes automatically. If you are
                having trouble, try these actions.
              </Text>
            </View>
            <SettingsActionRow
              icon="account"
              label="Refresh account"
              disabled={state.busy}
              busy={activeAction === 'Refresh account'}
              onPress={() => {
                void runAction('Refresh account', controller.refresh);
              }}
            />
            <SettingsActionRow
              icon="account"
              label="Renew this session"
              disabled={state.busy}
              busy={activeAction === 'Renew this session'}
              onPress={() => {
                void runAction('Renew this session', controller.renew);
              }}
            />
            <SettingsActionRow
              icon="key"
              label="Recover an existing account"
              chevron
              disabled={state.busy}
              href="/account/recover"
            />
          </SettingsGroup>
        )}
        {!!state.message && (
          <Text accessibilityRole="alert" style={styles.message}>
            {state.message}
          </Text>
        )}
        {tool === 'troubleshooting' &&
          (!!state.message || activeAction === 'Retry connection') && (
            <SettingsGroup title="Connection">
              <SettingsActionRow
                icon="account"
                label="Retry connection"
                disabled={state.busy}
                busy={activeAction === 'Retry connection'}
                onPress={() => {
                  void runAction('Retry connection', controller.retry);
                }}
              />
            </SettingsGroup>
          )}
      </View>
    </SettingsPage>
  );
}
