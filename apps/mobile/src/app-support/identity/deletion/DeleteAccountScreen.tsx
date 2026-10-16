import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import { SettingsGroup } from '../../../components/settings/SettingsRows';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { colors, spacing, typography } from '../../../theme/tokens';
import { CancelSubscriptionRow } from './CancelSubscriptionRow';
import { DeleteAccountConfirmation } from './DeleteAccountConfirmation';
import { useAccountDeletionDialog } from './useAccountDeletionDialog';

export function DeleteAccountScreen() {
  const { state, pending, open, dialog } = useAccountDeletionDialog();
  const router = useRouter();
  if (state.deletionStatus === 'deleted') return <Redirect href="/welcome" />;
  return (
    <SettingsPage title="Delete account" backHref="/settings">
      <SettingsGroup title="Before you delete">
        <View style={styles.copy}>
          {state.account || pending ? (
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
              <PrimaryButton
                label={
                  pending && !dialog
                    ? 'Finish deletion'
                    : 'Continue to deletion'
                }
                disabled={state.busy}
                onPress={open}
              />
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
        </View>
        <CancelSubscriptionRow />
      </SettingsGroup>
      {dialog && <DeleteAccountConfirmation {...dialog} />}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  copy: { padding: spacing.lg, gap: spacing.lg },
  body: { ...typography.body, color: colors.ink },
});
