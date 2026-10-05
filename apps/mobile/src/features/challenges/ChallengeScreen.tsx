import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useIsFocused, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
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
      if (returnedToScreen) challenges.dismissSuccess();
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
  // controller clears active before navigation, but showing the deck here
  // would expose it for a frame between the two screens.
  const visibleAttempt = state.state?.active ?? state.success;
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
          <PrimaryButton
            label={state.pending ? 'Retry save' : 'Refresh challenges'}
            busy={state.busy}
            onPress={() =>
              void (state.pending ? challenges.retry() : challenges.refresh())
            }
          />
        </View>
      )}
      {visibleAttempt ? (
        <ActiveChallenge
          key={visibleAttempt.id}
          attempt={visibleAttempt}
          turn={state.queues[visibleAttempt.card.venue]?.version ?? 0}
          offset={state.clockOffset}
          disabled={
            state.busy || !!state.pending || !!state.success || !focused
          }
          finish={challenges.finish}
        />
      ) : (
        <>
          <VenueTabs
            selected={state.selected}
            disabled={moving || state.busy || !!state.pending}
            onSelect={(v) => void challenges.select(v)}
          />
          {!queue ? (
            <Text style={styles.body}>
              {state.busy
                ? 'Finding your challenges…'
                : 'Your challenges couldn’t load.'}
            </Text>
          ) : !queue.cards.length ? (
            <View style={styles.notice}>
              <Text style={styles.heading}>More small steps soon.</Text>
              <Text style={styles.body}>
                There are no challenges here yet. Try another venue.
              </Text>
            </View>
          ) : (
            <ChallengeDeck
              key={`${account?.userId}:${venue.id}:${focused}`}
              cards={queue.cards}
              venue={venue.id}
              label={venue.label}
              turn={queue.version}
              disabled={state.busy || !!state.pending || !focused}
              onBusyChange={setMoving}
              onAction={async (direction) => {
                await challenges.act(direction);
                return (
                  challenges.getSnapshot().queues[venue.id]?.version ??
                  queue.version
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
  heading: { ...typography.heading, color: colors.ink, textAlign: 'center' },
  body: { ...typography.body, color: colors.ink },
  notice: {
    gap: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.peach,
  },
});
