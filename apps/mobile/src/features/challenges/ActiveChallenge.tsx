import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { venues, type Attempt } from '@justgo/contracts';
import Svg, { Path } from 'react-native-svg';
import { colors, typography, fontFamilies } from '../../theme/tokens';
import { challengeScale, timerOutline } from './challenge-design';
import { ChallengeCard } from './ChallengeDeck';
import { remainingSeconds } from './countdown';
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
const styles = StyleSheet.create({
  active: { gap: 20, alignItems: 'stretch', paddingVertical: 0 },
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
