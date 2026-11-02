import Constants from 'expo-constants';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ExternalLinkButton } from '../../components/ExternalLinkButton';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import { contactFailureMessage, supportContact } from '../contact';
import { useActivityState } from '../providers/AppProvider';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import {
  actionableOperations,
  operationProblem,
  savingRiskCopy,
} from './presentation';

export function SavingDetails({
  onNavigate,
  navigationEnabled = true,
  toastChannel = 'activity',
}: {
  onNavigate?: ((proceed: () => void) => void) | undefined;
  navigationEnabled?: boolean;
  toastChannel?: string;
} = {}) {
  const { repository, state } = useActivityState();
  const router = useRouter();
  if (!state || !repository) return null;
  return (
    <View style={styles.details}>
      {state.warning && (
        <Text accessibilityRole="alert" style={styles.copy}>
          {savingRiskCopy(state.warning)}
        </Text>
      )}
      {state.hydrationError === 'unreadable' && (
        <>
          <Text accessibilityRole="alert" style={styles.copy}>
            Your saved entries couldn’t load. Your existing data has been kept.
          </Text>
          <Text style={styles.copy}>
            Close and reopen JustGO, then try again. If this keeps happening,
            get help before making changes to your saved data.
          </Text>
          {__DEV__ &&
            process.env.EXPO_PUBLIC_JUSTGO_DEV_DIAGNOSTICS === '1' && (
              <Text
                selectable
                style={styles.copy}
                testID="saving-storage-diagnostic"
              >
                Storage check: {state.hydrationDiagnostic ?? 'UNKNOWN'} ·
                Installed build:{' '}
                {Constants.platform?.ios?.buildNumber ?? 'unknown'}
              </Text>
            )}
        </>
      )}
      {actionableOperations(state).map((operation) => {
        const record = state.journal.records[operation.attemptId]!;
        const attempt =
          repository.getAttempt(operation.attemptId) ?? record.attempt;
        return (
          <View key={operation.id} style={styles.entry}>
            <Text style={styles.copy}>
              {attempt.instruction} · {attempt.activityDate}
            </Text>
            <Text accessibilityRole="alert" style={styles.copy}>
              {operationProblem(operation)}
            </Text>
            {!!attempt.reflection?.text && (
              <Text style={styles.copy}>{attempt.reflection.text}</Text>
            )}
            {!!operation.requestId && (
              <Text style={styles.copy}>Reference: {operation.requestId}</Text>
            )}
            {navigationEnabled && !!attempt.reflection && (
              <Pressable
                accessibilityRole="button"
                style={styles.action}
                onPress={() => {
                  const proceed = () =>
                    router.push({
                      pathname: '/reflection',
                      params: {
                        attemptId: operation.attemptId,
                        source: 'recovery',
                      },
                    });
                  if (onNavigate) onNavigate(proceed);
                  else proceed();
                }}
              >
                <Text style={styles.link}>Review reflection</Text>
              </Pressable>
            )}
            {navigationEnabled && operation.state === 'auth' && (
              <Pressable
                accessibilityRole="button"
                style={styles.action}
                onPress={() => {
                  const proceed = () => router.push('/recovery');
                  if (onNavigate) onNavigate(proceed);
                  else proceed();
                }}
              >
                <Text style={styles.link}>Recover account</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <ExternalLinkButton
        label="Get help"
        url={supportContact}
        failureMessage={contactFailureMessage}
        channel={toastChannel}
      />
    </View>
  );
}

/** Recovery stays discoverable in Data after the floating notice is dismissed. */
export function SavingRecoveryPanel() {
  const { state } = useActivityState();
  if (
    !state ||
    (!state.warning &&
      state.hydrationError !== 'unreadable' &&
      !actionableOperations(state).length)
  )
    return null;
  return (
    <View style={styles.card} testID="saving-recovery-panel">
      <Text accessibilityRole="header" style={styles.heading}>
        Saving needs attention
      </Text>
      <SavingDetails />
    </View>
  );
}
const styles = StyleSheet.create({
  details: { gap: spacing.md },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heading: { ...typography.heading, color: colors.ink },
  copy: { ...typography.body, color: colors.ink },
  entry: { gap: spacing.sm },
  action: { minHeight: 44, justifyContent: 'center' },
  link: {
    ...typography.body,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
});
