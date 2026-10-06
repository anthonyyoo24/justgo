import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useActivityState } from '../providers/AppProvider';
import { colors, typography } from '../../theme/tokens';
import {
  actionableOperations,
  operationProblem,
  savingRiskCopy,
} from './presentation';
export function SavingNotice({
  onNavigate,
  navigationEnabled = true,
}: {
  onNavigate?: (() => void) | undefined;
  navigationEnabled?: boolean;
} = {}) {
  const { repository, state } = useActivityState();
  const [expandedFor, setExpandedFor] = useState<typeof repository>(null);
  const expanded = expandedFor === repository;
  const router = useRouter();
  if (!state || !repository) return null;
  const operations = actionableOperations(state);
  const unreadable = state.hydrationError === 'unreadable';
  const warning = state.warning?.visible ? state.warning : null;
  if (!warning && !unreadable && !operations.length) return null;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.notice}>
      {warning && (
        <View style={styles.row} testID="saving-risk-banner">
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={styles.copy}
          >
            {savingRiskCopy(warning)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close saving warning"
            onPress={() => repository.dismissWarning()}
            style={styles.action}
          >
            <Text style={styles.link}>Close</Text>
          </Pressable>
        </View>
      )}
      {(unreadable || operations.length > 0) && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpandedFor(expanded ? null : repository)}
            style={styles.action}
          >
            <Text style={styles.link}>
              {expanded
                ? 'Hide saving details'
                : 'Review activity that couldn’t upload'}
            </Text>
          </Pressable>
          {expanded && (
            <ScrollView
              style={styles.details}
              keyboardShouldPersistTaps="handled"
            >
              {unreadable && (
                <Text accessibilityRole="alert" style={styles.copy}>
                  Saved activity on this phone couldn’t be read. The original
                  copy has been kept. Connect to view previously uploaded
                  history. New activity can still be recorded.
                </Text>
              )}
              {operations.map((operation) => {
                const record = state.journal.records[operation.attemptId]!;
                return (
                  <View key={operation.id} style={styles.entry}>
                    <Text style={styles.copy}>
                      {record.attempt.instruction} ·{' '}
                      {record.attempt.activityDate}
                    </Text>
                    <Text accessibilityRole="alert" style={styles.copy}>
                      {operationProblem(operation)}
                    </Text>
                    {!!record.attempt.reflection?.text && (
                      <Text style={styles.copy}>
                        {record.attempt.reflection.text}
                      </Text>
                    )}
                    {!!operation.requestId && (
                      <Text style={styles.copy}>
                        Reference: {operation.requestId}
                      </Text>
                    )}
                    {navigationEnabled &&
                      operation.kind === 'patch' &&
                      operation.code === 'INVALID_REQUEST' && (
                        <Pressable
                          accessibilityRole="button"
                          style={styles.action}
                          onPress={() => {
                            onNavigate?.();
                            router.push({
                              pathname: '/reflection',
                              params: {
                                attemptId: operation.attemptId,
                                source: 'recovery',
                              },
                            });
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
                          onNavigate?.();
                          router.push('/recovery');
                        }}
                      >
                        <Text style={styles.link}>Recover account</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </>
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  notice: { backgroundColor: colors.peach },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  copy: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    flexShrink: 1,
  },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  link: {
    ...typography.body,
    fontSize: 14,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  details: { maxHeight: 220, paddingHorizontal: 16 },
  entry: { paddingBottom: 12, gap: 8 },
});
