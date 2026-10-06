import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import {
  useJournal,
  useRuntime,
} from '../../app-support/providers/AppProvider';
import { useDelayedBusy } from '../../lib/useDelayedBusy';
import { ReflectionController } from './controller';
import { ReflectionView } from './ReflectionView';

export function ReflectionScreen() {
  const { attemptId, source } = useLocalSearchParams<{
    attemptId?: string;
    source?: string;
  }>();
  const { challenges, activity } = useRuntime();
  const repository = useJournal();
  const router = useRouter();
  const controller = useMemo(
    () =>
      repository && attemptId
        ? new ReflectionController(
            repository,
            attemptId,
            () => {
              if (challenges.getSnapshot().success?.id === attemptId)
                void challenges.dismissSuccess();
              else if (repository.store.getState().flowAttemptId === attemptId)
                void repository.setFlowAttempt(null);
              if (source === 'recovery') router.back();
              else if (source === 'progress')
                router.dismissTo('/(tabs)/progress');
              else router.dismissTo('/(tabs)');
            },
            { isCurrent: () => activity.getRepository() === repository },
          )
        : null,
    [repository, attemptId, source, router, challenges, activity],
  );
  useEffect(() => {
    controller?.connect();
    return () => controller?.dispose();
  }, [controller]);
  const state = useSyncExternalStore(
    controller?.subscribe ?? (() => () => {}),
    controller?.getSnapshot ?? (() => null),
    controller?.getSnapshot ?? (() => null),
  );
  const savingVisible = useDelayedBusy(state?.submitting ?? false);
  if (!controller || !state || state.phase === 'missing')
    return (
      <Screen title="Reflection">
        <Text>Open a completed challenge to add or edit its reflection.</Text>
        <PrimaryButton
          label="Back to Home"
          onPress={() => router.dismissTo('/(tabs)')}
        />
      </Screen>
    );
  // The controller owns validation/errors; background uploads belong to the repository.
  return (
    <ReflectionView
      feeling={state.feeling}
      text={state.text}
      editing={state.editing}
      onFeelingChange={controller.setFeeling}
      onTextChange={controller.setText}
      onSubmit={() => void controller.submit()}
      onClose={controller.close}
      busy={state.submitting}
      savingVisible={savingVisible}
      error={state.error}
      dismissOpen={state.dismissOpen}
      onKeepEditing={controller.keepEditing}
      onDiscard={controller.discard}
    />
  );
}
