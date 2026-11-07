import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useRuntime } from '../../providers/AppProvider';
import { DeleteAccountConfirmation } from '../deletion/DeleteAccountConfirmation';
import { useAccountDeletionDialog } from '../deletion/useAccountDeletionDialog';
import { ConfirmationModal } from '../../../components/modals/ConfirmationModal';
import { useLogoutDialog } from './useLogoutDialog';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import {
  SettingsActionRow,
  SettingsGroup,
} from '../../../components/settings/SettingsRows';
import { SettingsToggleRow } from '../../../components/settings/SettingsToggleRow';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { useReduceMotion } from '../../../platform/motion/motion';
import { colors, radii, spacing, typography } from '../../../theme/tokens';

export function ManagedAccountScreen() {
  const { identity } = useRuntime();
  const { state, pending, open, dialog } = useAccountDeletionDialog();
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const logout = useLogoutDialog();
  if (!('signIn' in identity)) return null;
  const activeProvider =
    state.account && 'provider' in state ? state.provider : null;
  return (
    <SettingsPage title="Account" backHref="/settings">
      <SettingsGroup title="Login methods">
        {(['apple', 'google'] as const).map((provider) => (
          <SettingsToggleRow
            key={provider}
            icon={provider}
            label={provider === 'apple' ? 'Apple' : 'Google'}
            hint={
              activeProvider === provider
                ? `You’re signed in with ${provider === 'apple' ? 'Apple' : 'Google'}. Turn off to log out on this phone.`
                : `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'}.`
            }
            subtitle={
              activeProvider === provider
                ? `You’re signed in with ${provider === 'apple' ? 'Apple' : 'Google'}.`
                : undefined
            }
            value={activeProvider === provider}
            busy={state.busy}
            disabled={state.busy || pending || !state.initialized}
            reduceMotion={reduceMotion}
            onValueChange={() => {
              if (activeProvider === provider) logout.open();
              else
                router.push({
                  pathname: '/account/sign-in',
                  params: {
                    provider,
                    ...(state.account ? { switchProvider: '1' } : {}),
                  },
                });
            }}
          />
        ))}
      </SettingsGroup>
      {(state.account || pending) && (
        <View style={styles.card}>
          <SettingsActionRow
            icon="delete"
            label="Delete account"
            destructive
            disabled={state.busy}
            onPress={open}
          />
        </View>
      )}
      {!!state.message &&
        (state.account || pending) &&
        !dialog &&
        !logout.dialog && (
          <Text accessibilityRole="alert" style={styles.message}>
            {state.message}
          </Text>
        )}
      {dialog && <DeleteAccountConfirmation {...dialog} />}
      {logout.dialog && (
        <ConfirmationModal
          {...logout.dialog}
          title="Log out?"
          message="Your saved data will stay on this phone. Account syncing will stop until you sign in again."
          confirmLabel="Log out"
          progressLabel="Logging out"
        />
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
