import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useIsFocused, useRouter } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
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
import { ActiveChallengeModal } from './ActiveChallengeModal';
import { useChallengeActivity } from './ChallengeActivityProvider';
import { NativeChallengeHandoff } from './NativeChallengeHandoff';
/**
 * Reset Home's navigation bookkeeping when the account changes. The activity
 * provider separately scopes the in-memory challenge to the same identity.
 */
export function ChallengeScreen() {
  const { account } = useIdentity();
  return <ChallengeFlow key={account?.userId ?? 'disconnected'} />;
}
/**
 * Compose the memory-owned deck and active surface with local-save navigation.
 * iOS opens a native active route; Android/web cover the accepted deck. Returning
 * from a completed flow clears its memory state without reopening Success.
 */
function ChallengeFlow() {
  const { challenges } = useRuntime();
  const { account } = useIdentity();
  const { active, onAction, finish, clear, presentedStart } =
    useChallengeActivity();
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
      if (state.success && Platform.OS !== 'ios') clear();
      return;
    }
    const returnedToScreen = !wasFocused.current;
    wasFocused.current = true;
    if (Platform.OS === 'ios' && returnedToScreen) {
      clear();
      if (state.success) void challenges.dismissSuccess();
      return;
    }
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
  }, [state.success, focused, router, challenges, clear]);
  const queue = state.queues[state.selected];
  const venue = venues.find((v) => v.id === state.selected)!;
  // iOS keeps the departed card while its native active route opens. Changing
  // the key on focus loss remounts a resting deck and flashes that card again.
  const deckIdentity = `${account?.userId}:${venue.id}`;
  return (
    <>
      <ChallengeLayout title="Find a challenge" fillContent>
        {!active && !!state.error && (
          <View style={styles.notice}>
            <Text accessibilityRole="alert" style={styles.body}>
              {state.error}
            </Text>
            <PrimaryButton
              label="Refresh challenges"
              busy={state.loading}
              onPress={() => void challenges.refresh()}
            />
          </View>
        )}
        <VenueTabs
          selected={state.selected}
          disabled={!!active || moving || state.saving}
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
            key={
              Platform.OS === 'ios'
                ? deckIdentity
                : `${deckIdentity}:${focused}`
            }
            cards={queue.cards}
            venue={venue.id}
            label={venue.label}
            turn={queue.turn}
            disabled={!!active || state.saving || !focused}
            covered={!!active}
            onBusyChange={setMoving}
            onAction={onAction}
          />
        )}
      </ChallengeLayout>
      {Platform.OS === 'ios' && active && presentedStart !== active && (
        <NativeChallengeHandoff key={active.startedAt} start={active} />
      )}
      {Platform.OS !== 'ios' && active && focused && (
        <ActiveChallengeModal
          start={active}
          error={state.error}
          saving={state.saving}
          completed={!!state.success}
          completionStarted={state.completionStarted}
          savingVisible={savingVisible}
          finish={finish}
        />
      )}
    </>
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
