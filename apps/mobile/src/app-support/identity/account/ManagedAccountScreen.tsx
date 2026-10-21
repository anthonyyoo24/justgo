import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useIdentity, useRuntime } from '../../providers/AppProvider';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsRowDivider,
} from '../../../components/settings/SettingsRows';
import { SettingsToggleRow } from '../../../components/settings/SettingsToggleRow';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { useReduceMotion } from '../../../platform/motion/motion';
import { colors, radii, spacing, typography } from '../../../theme/tokens';

export function ManagedAccountScreen() {
  const { identity } = useRuntime();
  const state = useIdentity();
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const [confirming, setConfirming] = useState(false);
  if (!('signIn' in identity)) return null;
  const connected = 'linkedProviders' in state ? state.linkedProviders : null;
  const linkedProviders =
    state.account && Array.isArray(connected)
      ? (['apple', 'google'] as const).filter((provider) =>
          connected.includes(provider),
        )
      : [];
  return (
    <SettingsPage title="Account" backHref="/settings">
      <SettingsGroup title="Login methods">
        {(['apple', 'google'] as const).map((provider) => (
          <SettingsToggleRow
            key={provider}
            icon={provider}
            label={provider === 'apple' ? 'Apple' : 'Google'}
            hint={
              state.account
                ? `Connect or disconnect ${provider === 'apple' ? 'Apple' : 'Google'} for this account.`
                : `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'}.`
            }
            value={linkedProviders.includes(provider)}
            busy={state.busy}
            disabled={state.busy || !state.initialized}
            reduceMotion={reduceMotion}
            onValueChange={(connected) => {
              if (!state.account) {
                router.push({
                  pathname: '/account/sign-in',
                  params: { provider },
                });
              } else if (connected) {
                // The controller owns provider failure and cancellation feedback.
                void identity.linkProvider(provider);
              } else {
                void identity.unlinkProvider(provider);
              }
            }}
          />
        ))}
      </SettingsGroup>
      {state.account && (
        <View style={styles.card}>
          {confirming && (
            <Text style={styles.message}>
              Log out? Your saved data stays on this phone and account sync
              stops.
            </Text>
          )}
          <SettingsActionRow
            icon="logout"
            label={confirming ? 'Confirm log out' : 'Log out'}
            disabled={state.busy}
            onPress={() => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              setConfirming(false);
              void identity.signOut();
            }}
          />
          {confirming && (
            <SettingsActionRow
              icon="back"
              label="Cancel"
              disabled={state.busy}
              onPress={() => setConfirming(false)}
            />
          )}
          <SettingsRowDivider />
          <SettingsActionRow
            icon="delete"
            label="Delete account"
            destructive
            disabled={state.busy}
            href="/delete-account"
            chevron
          />
        </View>
      )}
      {!!state.message && (
        <Text accessibilityRole="alert" style={styles.message}>
          {state.message}
        </Text>
      )}
      {state.hasPending && (
        <View style={styles.card}>
          <SettingsActionRow
            icon="account"
            label="Retry connection"
            disabled={state.busy}
            onPress={() => {
              void identity.retry();
            }}
          />
        </View>
      )}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  message: { ...typography.caption, color: colors.ink, padding: spacing.lg },
});
