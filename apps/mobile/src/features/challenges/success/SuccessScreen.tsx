import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { Screen } from '../../../components/Screen';
import { PrimaryButton } from '../../../components/PrimaryButton';
import {
  useIdentity,
  useJournal,
  useRuntime,
} from '../../../app-support/providers/AppProvider';
import { SuccessView } from './SuccessView';

export function SuccessScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId?: string }>();
  const { challenges } = useRuntime();
  const { account } = useIdentity();
  const repository = useJournal();
  const router = useRouter();
  const attempt =
    account && attemptId && repository?.accountId === account.userId
      ? repository.getAttempt(attemptId)
      : undefined;
  if (attempt)
    return (
      <SuccessView
        onContinue={() =>
          router.replace({
            pathname: '/reflection',
            params: { attemptId: attempt.id },
          })
        }
      />
    );
  return (
    <Screen title="Your completed challenge">
      <Text>Complete a challenge to see its result here.</Text>
      <PrimaryButton
        label="Back to Home"
        onPress={() => {
          void challenges.dismissSuccess();
          router.replace('/(tabs)');
        }}
      />
    </Screen>
  );
}
