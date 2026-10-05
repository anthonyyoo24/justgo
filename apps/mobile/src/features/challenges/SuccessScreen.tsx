import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import {
  legacyAttemptResultSchema as attemptResultSchema,
  type LegacyAttempt as Attempt,
} from '@justgo/contracts';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, typography } from '../../theme/tokens';
import { useRuntime } from '../../app-support/providers/AppProvider';
import { SuccessView } from './SuccessView';
export function SuccessScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId?: string }>();
  const { client, challenges } = useRuntime();
  const [result, setResult] = useState<{
    id: string;
    attempt?: Attempt;
    error?: boolean;
  } | null>(null);
  // Route changes must never render a prior attempt as the requested result.
  // The finish response is already server-confirmed. Render it immediately
  // while the owner-scoped lookup refreshes, without a loading-screen flash.
  const confirmed = challenges.getSnapshot().success;
  const recent = confirmed?.id === attemptId ? confirmed : null;
  const attempt = (result?.id === attemptId ? result?.attempt : null) ?? recent;
  const error = result?.id === attemptId && result?.error && !recent;
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    if (attemptId)
      void client
        .request(
          `/v1/challenges/attempt/${encodeURIComponent(attemptId)}`,
          attemptResultSchema,
        )
        .then((result) => {
          if (alive) setResult({ id: attemptId, attempt: result.attempt });
        })
        .catch(() => {
          if (alive) setResult({ id: attemptId, error: true });
        });
    return () => {
      alive = false;
    };
  }, [attemptId, client]);
  const back = () => {
    challenges.dismissSuccess();
    router.replace('/(tabs)');
  };
  if (attempt?.status === 'completed')
    return (
      <SuccessView
        onContinue={() => {
          router.replace({
            pathname: '/reflection',
            params: { attemptId: attempt.id },
          });
        }}
      />
    );
  return (
    <Screen title="Your completed challenge">
      <View style={styles.active}>
        <Text style={styles.body}>
          {error
            ? 'We couldn’t load this result. Your saved activity is safe.'
            : attempt
              ? 'This challenge hasn’t been completed.'
              : attemptId
                ? 'Checking your saved result…'
                : 'Complete a challenge to see its result here.'}
        </Text>
        <PrimaryButton label="Back to Home" onPress={back} />
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  active: { gap: 20, alignItems: 'stretch', paddingVertical: 0 },
  body: { ...typography.body, color: colors.ink },
});
