import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, typography } from '../../theme/tokens';
import { useRuntime } from '../../runtime/providers/AppProvider';
import { ReflectionController } from './controller';
import { ReflectionView } from './ReflectionView';

export function ReflectionScreen() {
  const { attemptId } = useLocalSearchParams<{ attemptId?: string }>();
  const { client, challenges } = useRuntime();
  const router = useRouter();
  const controller = useMemo(
    () =>
      attemptId
        ? new ReflectionController(
            client,
            attemptId,
            () => {
              challenges.dismissSuccess();
              router.dismissTo('/(tabs)');
            },
            { fresh: challenges.getSnapshot().success?.id === attemptId },
          )
        : null,
    [attemptId, client, challenges, router],
  );
  useEffect(() => {
    if (!controller) return;
    if (controller.getSnapshot().phase === 'loading') void controller.load();
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
    state.phase === 'load-error' ||
    state.phase === 'already'
  ) {
    return (
      <Screen title="Reflection">
        <View style={{ gap: 20, paddingVertical: 20 }}>
          <Text style={{ ...typography.body, color: colors.ink }}>
            {!attemptId
              ? 'Complete a challenge before adding a reflection.'
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
              router.dismissTo('/(tabs)');
            }}
          />
        </View>
      </Screen>
    );
  }
  // Controller actions publish their own busy/error/retry states; UI callbacks
  // intentionally start them without returning a promise to the view.
  return (
    <ReflectionView
      feeling={state.feeling}
      text={state.text}
      loading={state.phase === 'loading'}
      onFeelingChange={controller.setFeeling.bind(controller)}
      onTextChange={controller.setText.bind(controller)}
      onSubmit={() => void controller.submit()}
      onClose={() => void controller.close()}
      busy={state.saving}
      locked={state.pendingAction !== null || state.conflict}
      pendingAction={state.pendingAction}
      error={state.error}
      draftError={state.draftError}
      onRetryDraft={
        state.draftError ? () => void controller.retryDraft() : undefined
      }
      conflict={state.conflict}
      onLoadLatest={() => void controller.useLatest()}
      onKeepMine={
        state.terminalConflict ? undefined : () => void controller.keepMine()
      }
      dismissOpen={state.dismissOpen}
      onKeepEditing={controller.keepEditing}
      onDiscard={() => void controller.discard()}
    />
  );
}
