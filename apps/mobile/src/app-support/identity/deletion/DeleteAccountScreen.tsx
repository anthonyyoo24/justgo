import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import {
  SettingsActionRow,
  SettingsGroup,
} from '../../../components/settings/SettingsRows';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { useIdentity, useRuntime } from '../../providers/AppProvider';
import { colors, spacing, typography } from '../../../theme/tokens';
import { CancelSubscriptionRow } from './CancelSubscriptionRow';

export function DeleteAccountScreen() {
  const { identity } = useRuntime();
  const state = useIdentity();
  const router = useRouter();
  const [confirmedAccountId, setConfirmedAccountId] = useState<string | null>(
    null,
  );
  const [attemptedAccountId, setAttemptedAccountId] = useState<string | null>(
    null,
  );
  const confirmed =
    !!state.account && confirmedAccountId === state.account.userId;
  const pending =
    state.deletionStatus === 'pending' || state.deletionStatus === 'cleanup';
  const deleted = state.deletionStatus === 'deleted';
  return (
    <SettingsPage title="Delete account" backHref="/settings">
      <SettingsGroup
        title={
          deleted
            ? 'Account deleted'
            : pending
              ? 'Finish account deletion'
              : 'Before you delete'
        }
      >
        <View style={styles.copy}>
          {deleted ? (
            <Text style={styles.body}>
              Your account and uploaded activity have been deleted. Recovery
              keys and phone transfers can no longer restore this account. This
              phone’s account data has been cleared.
            </Text>
          ) : pending ? (
            <>
              <Text style={styles.body}>
                {state.deletionStatus === 'cleanup'
                  ? 'Your account has been deleted. Finish clearing this phone’s account data and recovery keys.'
                  : 'Your deletion request is saved. Retry to confirm its result and finish cleanup. Your account stays disconnected while this is pending.'}
              </Text>
              <PrimaryButton
                label="Finish deletion"
                busy={state.busy}
                onPress={() => {
                  void identity.retry();
                }}
              />
            </>
          ) : state.account ? (
            <>
              <Text style={styles.body}>
                Permanently delete your JustGO account, completed challenges,
                feelings and reflections. This includes activity still waiting
                to upload from this phone.
              </Text>
              <Text style={styles.body}>
                All devices lose access, and recovery keys and transfer codes
                stop working. This cannot be undone. You can export your data
                from Settings first.
              </Text>
              <Text style={styles.body}>
                Limited security records remain to block old recovery keys.
                Restricted backups may retain copies until they expire. Files
                you exported and copies on offline devices are not erased by
                this action.
              </Text>
              <Text style={styles.body}>
                Deleting your account does not cancel an Apple subscription. You
                can cancel your subscription separately and delete your account
                immediately.
              </Text>
              {confirmed ? (
                <>
                  <Text accessibilityRole="alert" style={styles.warning}>
                    Delete this account permanently?
                  </Text>
                  <PrimaryButton
                    label="Delete account permanently"
                    busy={state.busy}
                    onPress={() => {
                      setAttemptedAccountId(state.account!.userId);
                      void identity.deleteAccount();
                    }}
                  />
                </>
              ) : (
                <PrimaryButton
                  label="Continue to deletion"
                  disabled={state.busy}
                  onPress={() => setConfirmedAccountId(state.account!.userId)}
                />
              )}
            </>
          ) : (
            <>
              <Text style={styles.body}>
                Connect the account you want to delete first.
              </Text>
              <PrimaryButton
                label="Connect account"
                onPress={() => router.push('/recovery')}
              />
            </>
          )}
          {!deleted &&
          state.message &&
          (pending ||
            (attemptedAccountId !== null &&
              (!state.account ||
                attemptedAccountId === state.account.userId))) ? (
            <Text accessibilityRole="alert" style={styles.warning}>
              {state.message}
            </Text>
          ) : null}
        </View>
        {!deleted && <CancelSubscriptionRow />}
        {deleted && (
          <SettingsActionRow
            icon="back"
            label="Return to Settings"
            onPress={() => router.replace('/settings')}
          />
        )}
      </SettingsGroup>
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  copy: { padding: spacing.lg, gap: spacing.lg },
  body: { ...typography.body, color: colors.ink },
  warning: { ...typography.body, color: '#8B1E32' },
});
