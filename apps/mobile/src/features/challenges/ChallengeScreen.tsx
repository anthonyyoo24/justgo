import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useIsFocused } from 'expo-router';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { attemptResultSchema, venues, type Attempt } from '@justgo/contracts';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import Svg, { Path } from 'react-native-svg';
import { colors, typography, fontFamilies } from '../../theme/tokens';
import { useIdentity, useRuntime } from '../shell/AppProvider';
import { ChallengeLayout } from './ChallengeLayout';
import { VenueTabs } from './VenueTabs';
import { challengeScale, timerOutline } from './challenge-design';
import { ChallengeCard, ChallengeDeck } from './ChallengeDeck';
import { remainingSeconds } from './countdown';
import { SuccessView } from './SuccessView';
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
export function ActiveChallenge({
  attempt,
  turn = 0,
  offset,
  disabled,
  finish,
}: {
  attempt: Attempt;
  turn?: number;
  offset: number;
  disabled: boolean;
  finish: (outcome: 'completed' | 'given_up') => Promise<void>;
}) {
  const { width, fontScale } = useWindowDimensions();
  const scale = challengeScale(width);
  // The next queue arrives before the success route opens. Keep this card's
  // original color instead of briefly applying the next queue's turn.
  const [cardTurn] = useState(turn);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  const seconds = remainingSeconds(
    attempt.deadlineAt,
    now + offset,
    attempt.card.durationSeconds,
  );
  const timer = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <View style={styles.active}>
      <View
        style={[
          styles.timer,
          {
            width: Math.min(
              Math.min(width, 384) - 28 * scale,
              180 * scale * Math.max(1, fontScale),
            ),
            minHeight: 86 * scale * fontScale,
          },
        ]}
      >
        <View
          aria-hidden
          style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
        >
          <Svg
            width="100%"
            height="100%"
            viewBox="0 0 180 86"
            preserveAspectRatio="none"
          >
            <Path d={timerOutline} fill={colors.ink} />
          </Svg>
        </View>
        <Text
          style={[
            styles.timerText,
            { fontSize: 50 * scale, lineHeight: 52 * scale },
          ]}
          accessibilityLabel={
            seconds
              ? `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`
              : "Time's up. Give it a go."
          }
        >
          {timer}
        </Text>
        <Text
          style={[
            styles.timerCaption,
            { fontSize: 11 * scale, lineHeight: 14 * scale },
          ]}
        >
          {seconds ? 'Time remaining' : "Time's up. Give it a go."}
        </Text>
      </View>
      <ChallengeCard
        card={attempt.card}
        turn={cardTurn}
        venue={attempt.card.venue}
        label={venues.find((v) => v.id === attempt.card.venue)!.label}
      />
      <View
        style={[
          styles.outcomes,
          {
            flexWrap: fontScale > 1.4 ? 'wrap' : 'nowrap',
            marginTop: 12 * scale,
          },
        ]}
        testID="active-outcomes"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Give up"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => void finish('given_up')}
          style={[
            styles.outcomeTarget,
            {
              flex: fontScale > 1.4 ? undefined : 106,
              width: fontScale > 1.4 ? '100%' : undefined,
            },
          ]}
        >
          <View style={styles.secondary}>
            <Svg width={14} height={14} viewBox="0 0 14 14" aria-hidden>
              <Path
                d="M2.5 2.5L11.5 11.5M11.5 2.5L2.5 11.5"
                stroke={colors.ink}
                strokeWidth={1.3}
                strokeLinecap="round"
              />
            </Svg>
            <Text style={styles.outcomeText}>Give up</Text>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Completed"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={() => void finish('completed')}
          style={[
            styles.outcomeTarget,
            {
              flex: fontScale > 1.4 ? undefined : 148,
              width: fontScale > 1.4 ? '100%' : undefined,
            },
          ]}
        >
          <View style={[styles.secondary, { backgroundColor: colors.ink }]}>
            <Svg width={16} height={14} viewBox="0 0 16 14" aria-hidden>
              <Path
                d="M1.75 7L6 11.25L14.25 2.75"
                stroke={colors.white}
                strokeWidth={1.3}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </Svg>
            <Text style={[styles.outcomeText, { color: colors.white }]}>
              Completed
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
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
  heading: { ...typography.heading, color: colors.ink, textAlign: 'center' },
  body: { ...typography.body, color: colors.ink },
  notice: {
    gap: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.peach,
  },
  timer: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  timerText: {
    ...typography.timer,
    fontWeight: '600',
    letterSpacing: -0.75,
    color: colors.white,
    fontVariant: ['tabular-nums'],
  },
  timerCaption: {
    fontFamily: fontFamilies.regular,
    color: colors.white,
    textAlign: 'center',
  },
  outcomes: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    width: '90%',
    alignSelf: 'center',
  },
  outcomeTarget: { minHeight: 44, justifyContent: 'center' },
  outcomeText: {
    fontFamily: fontFamilies.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink,
  },
  secondary: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    alignItems: 'center',
    padding: 8,
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.ink,
  },
});
