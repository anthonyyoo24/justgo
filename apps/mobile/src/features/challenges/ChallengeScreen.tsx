import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useIsFocused, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useDelayedBusy } from '../../lib/useDelayedBusy';
import { venues } from '@justgo/contracts';
import { PrimaryButton } from '../../components/PrimaryButton';
import { colors, typography } from '../../theme/tokens';
import {
  useIdentity,
  useRuntime,
} from '../../app-support/providers/AppProvider';
import { ChallengeLayout } from './ChallengeLayout';
import { VenueTabs } from './VenueTabs';
import { ChallengeDeck } from './ChallengeDeck';
import { ActiveChallenge } from './ActiveChallenge';
export function ChallengeScreen() {
  const { challenges } = useRuntime();
  const { account } = useIdentity();
  const state = useSyncExternalStore(
    challenges.subscribe,
    challenges.getSnapshot,
    challenges.getSnapshot,
  );
  const focused = useIsFocused();
  const savingVisible = useDelayedBusy(state.saving && focused);
  const [moving, setMoving] = useState(false);
  const successRouteAttemptId = useRef<string | null>(null);
  const wasFocused = useRef(focused);
  const router = useRouter();
  useEffect(() => {
    if (focused && account) void challenges.refresh();
  }, [focused, account, challenges]);
  useEffect(() => {
    if (!focused) {
      wasFocused.current = false;
      return;
    }
    const returnedToScreen = !wasFocused.current;
    wasFocused.current = true;
    if (!state.success) return;
    if (successRouteAttemptId.current === state.success.id) {
      // A native back gesture can return here without pressing Continue.
      // Clear the result instead of immediately opening Success again.
      if (returnedToScreen) void challenges.dismissSuccess();
      return;
    }
    successRouteAttemptId.current = state.success.id;
    router.push({
      pathname: '/success',
      params: { attemptId: state.success.id },
    });
  }, [state.success, focused, router, challenges]);
  const queue = state.queues[state.selected];
  const venue = venues.find((v) => v.id === state.selected)!;
  // Keep the completed card in place while the success route opens. The
  // controller retains active until the focused flow exits, so the deck cannot
  // appear for a frame between the two screens.
  const visibleAttempt = state.active;
  return (
    <ChallengeLayout
      title={visibleAttempt ? 'Active challenge' : 'Find a challenge'}
      fillContent={!visibleAttempt}
    >
      {!!state.error && (
        <View style={styles.notice}>
          <Text accessibilityRole="alert" style={styles.body}>
            {state.error}
          </Text>
          {!visibleAttempt && (
            <PrimaryButton
              label="Refresh challenges"
              busy={state.loading}
              onPress={() => void challenges.refresh()}
            />
          )}
        </View>
      )}
      {visibleAttempt ? (
        <ActiveChallenge
          key={visibleAttempt.startedAt}
          attempt={visibleAttempt}
          turn={visibleAttempt.turn}
          savingVisible={savingVisible}
          giveUpDisabled={state.saving || state.completionStarted || !focused}
          disabled={state.saving || !!state.success || !focused}
          finish={challenges.finish}
        />
      ) : (
        <>
          <VenueTabs
            selected={state.selected}
            disabled={moving || state.saving}
            onSelect={(v) => void challenges.select(v)}
          />
          {!queue ? (
            <Text style={styles.body}>
              {state.loading
                ? 'Finding your challenges…'
                : 'Your challenges couldn’t load.'}
            </Text>
          ) : (
            <ChallengeDeck
              key={`${account?.userId}:${venue.id}:${focused}`}
              cards={queue.cards}
              venue={venue.id}
              label={venue.label}
              turn={queue.turn}
              disabled={state.saving || !focused}
              onBusyChange={setMoving}
              onAction={async (direction) => {
                await challenges.act(direction);
                return (
                  challenges.getSnapshot().queues[venue.id]?.turn ?? queue.turn
                );
              }}
            />
          )}
        </>
      )}
    </ChallengeLayout>
  );
}
const styles = StyleSheet.create({
  body: { ...typography.body, color: colors.ink },
  notice: {
    gap: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.peach,
  },
});
