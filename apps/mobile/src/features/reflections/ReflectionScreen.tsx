import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, typography } from '../../theme/tokens';
import { useRuntime } from '../shell/AppProvider';
import { ReflectionController } from './controller';
import { ReflectionView } from './ReflectionView';

export function ReflectionScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId?: string }>();
  const { client, challenges } = useRuntime();
  const router = useRouter();
  const controller = useMemo(
    () =>
      attemptId
        ? new ReflectionController(client, attemptId, () => {
            challenges.dismissSuccess();
            router.replace('/(tabs)');
          })
        : null,
    [attemptId, client, challenges, router],
  );
  useEffect(() => {
    if (!controller) return;
    void controller.load();
    return () => controller.dispose();
  }, [controller]);
  const state = useSyncExternalStore(
    controller?.subscribe ?? (() => () => {}),
    controller?.getSnapshot ?? (() => null),
    controller?.getSnapshot ?? (() => null),
  );
  if (
    !controller ||
    !state ||
    state.phase === 'loading' ||
    state.phase === 'load-error' ||
    state.phase === 'already'
  ) {
    return (
      <Screen title="Reflection">
        <View style={{ gap: 20, paddingVertical: 20 }}>
          <Text style={{ ...typography.body, color: colors.ink }}>
            {!attemptId
              ? 'Complete a challenge before adding a reflection.'
              : state?.phase === 'loading'
                ? 'Loading your reflection…'
                : state?.phase === 'load-error'
                  ? state.error
                  : 'This reflection has already been finished.'}
          </Text>
          {state?.phase === 'load-error' && (
            <PrimaryButton
              label="Retry"
              onPress={() => void controller?.load()}
            />
          )}
          <PrimaryButton
            label="Back to Home"
            onPress={() => {
              challenges.dismissSuccess();
              router.replace('/(tabs)');
            }}
          />
        </View>
      </Screen>
    );
  }
  return (
    <ReflectionView
      feeling={state.feeling}
      text={state.text}
      onFeelingChange={controller.setFeeling.bind(controller)}
      onTextChange={controller.setText.bind(controller)}
      onSubmit={controller.submit}
      onClose={controller.close}
      busy={state.saving}
      locked={state.pendingAction !== null || state.conflict}
      pendingAction={state.pendingAction}
      error={state.error}
      draftError={state.draftError}
      onRetryDraft={state.draftError ? controller.retryDraft : undefined}
      conflict={state.conflict}
      onLoadLatest={() => void controller.useLatest()}
      onKeepMine={
        state.terminalConflict ? undefined : () => void controller.keepMine()
      }
      dismissOpen={state.dismissOpen}
      onKeepEditing={controller.keepEditing}
      onDiscard={controller.discard}
    />
  );
}
