/* eslint-disable react-hooks/refs -- Gesture Handler registers callbacks; it does not execute these event handlers during render. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Path } from 'react-native-svg';
import {
  colors,
  fontFamilies,
  challengeStyle,
  type ChallengeCardTheme,
} from '../../theme/tokens';
import {
  cardColor,
  cardVisual,
  deckMotion,
  restingMotion,
  swipeDirection,
  type DeckMotion,
} from './deck-model';
import { VenueArt, PaperTexture, LowerFlourish } from './VenueArt';
import {
  challengeScale,
  panelOutline,
  challengeDisplayFont,
} from './challenge-design';

export type DeckCard = { id: string; text: string };
const cardThemes = challengeStyle.cards;
// A queue advances within one frame; only the copy panel changes with its text.
const cardFrame = (scale: number) => ({
  width: 220 * scale,
  height: 273 * scale,
});
/**
 * Coordinate gesture/button actions with one authoritative queue settlement.
 * An accepted card stays departed while covered by the active modal; an
 * unconfirmed action restores it, and duplicate actions remain locked out.
 */
export function ChallengeDeck({
  cards,
  venue,
  label,
  turn,
  disabled = false,
  covered = false,
  onBusyChange,
  onAction,
}: {
  cards: readonly DeckCard[];
  venue: string;
  label: string;
  turn: number;
  disabled?: boolean;
  covered?: boolean;
  onBusyChange?: (busy: boolean) => void;
  // Resolve with the authoritative queue version, even when it did not advance.
  onAction: (direction: -1 | 1) => Promise<number | void>;
}) {
  const { width } = useWindowDimensions();
  const scale = challengeScale(width);
  const frame = cardFrame(scale);
  const motion = useSharedValue(restingMotion(turn));
  const locked = useSharedValue(false);
  const busy = useRef(false),
    alive = useRef(true);
  const [working, setWorking] = useState(false),
    [reduced, setReduced] = useState(false);
  const [settlement, setSettlement] = useState<{
    from: number;
    to: number;
  } | null>(null);
  useEffect(() => {
    alive.current = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const listener = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    return () => {
      alive.current = false;
      listener.remove();
      cancelAnimation(motion);
      onBusyChange?.(false);
    };
  }, [motion, onBusyChange]);

  // Rebase only after React has committed the queue acknowledged by the action.
  // Resetting shared values in the promise's finally can reveal the old card
  // for a frame before the new props arrive on the native UI thread.
  useLayoutEffect(() => {
    // Acceptance does not advance the queue. Hold its departed card while the
    // opaque active surface opens, instead of animating it back underneath.
    if (covered) return;
    if (!busy.current) {
      motion.set(restingMotion(turn));
      return;
    }
    if (!settlement || turn < settlement.to) return;
    const unlock = () => {
      if (!alive.current) return;
      locked.set(false);
      busy.current = false;
      setWorking(false);
      setSettlement(null);
      onBusyChange?.(false);
    };
    if (turn === settlement.from && !reduced) {
      // An unconfirmed/failed save restores the same card without a snap.
      motion.set(
        withTiming(
          restingMotion(turn),
          { duration: deckMotion.settle },
          (done) => {
            if (done) scheduleOnRN(unlock);
          },
        ),
      );
    } else {
      motion.set(restingMotion(turn));
      unlock();
    }
  }, [turn, settlement, covered, reduced, motion, locked, onBusyChange]);

  async function commit(direction: -1 | 1) {
    if (busy.current) return;
    if (disabled || !cards.length) {
      locked.set(false);
      return;
    }
    busy.current = true;
    locked.set(true);
    setWorking(true);
    onBusyChange?.(true);
    const from = turn;
    const animation = new Promise<void>((resolve) => {
      if (reduced) {
        resolve();
        return;
      }
      motion.set(
        withTiming(
          {
            ...motion.get(),
            x: direction * (width + 320),
            progress: 1,
          },
          {
            duration: deckMotion.duration,
            easing: Easing.bezier(0.22, 1, 0.36, 1),
          },
          (done) => {
            if (done) scheduleOnRN(resolve);
          },
        ),
      );
    });
    await animation;
    if (!alive.current) return;
    let to = from;
    try {
      to = (await onAction(direction)) ?? from;
    } finally {
      if (alive.current) setSettlement({ from, to });
    }
  }
  const gesture = Gesture.Pan()
    .enabled(!disabled && !working && cards.length > 0)
    .activeOffsetX([-12, 12])
    .failOffsetY([-22, 22])
    .onUpdate((event) => {
      if (!locked.get()) {
        motion.set({
          ...motion.get(),
          x: event.translationX,
          y: event.translationY * 0.35,
        });
      }
    })
    .onEnd((event) => {
      if (locked.get()) return;
      const direction = swipeDirection(event.translationX, event.velocityX);
      if (direction) {
        locked.set(true);
        scheduleOnRN(commit, direction);
      } else {
        motion.set(
          withTiming(restingMotion(turn), { duration: deckMotion.settle }),
        );
      }
    })
    .onFinalize((_event, success) => {
      if (!success && !locked.get()) {
        motion.set(
          withTiming(restingMotion(turn), { duration: deckMotion.settle }),
        );
      }
    });
  return (
    <View style={styles.container}>
      <GestureDetector gesture={gesture}>
        <View
          testID="challenge-stage"
          collapsable={false}
          style={[
            styles.stage,
            {
              height: frame.height + 30 * scale,
              width: 292 * scale,
              marginBottom: 17 * scale + 8,
            },
          ]}
        >
          {cards.slice(0, 4).map((card, index) => (
            <DeckLayer
              key={card.id}
              index={index}
              turn={turn}
              motion={motion}
              theme={cardThemes[cardColor(turn, index)]!}
              reduced={reduced}
              card={card}
              venue={venue}
              label={label}
              scale={scale}
            />
          ))}
        </View>
      </GestureDetector>
      <View testID="challenge-action-space" style={styles.actionSpace}>
        <View style={styles.actions}>
          {([-1, 1] as const).map((direction) => (
            <View key={direction} style={styles.action}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  direction === -1 ? 'Skip challenge' : 'Accept challenge'
                }
                accessibilityState={{ disabled: disabled || working }}
                disabled={disabled || working || !cards.length}
                onPress={() => void commit(direction)}
                style={styles.button}
              >
                <Svg
                  width={direction === -1 ? 22 : 24}
                  height={direction === -1 ? 22 : 24}
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <Path
                    d={
                      direction === -1
                        ? 'M5.7 5.7L18.3 18.3M18.3 5.7L5.7 18.3'
                        : 'M12.1 21C10.7 19.5 4.5 15 3.1 11.1C1.7 7.4 3.2 3.6 6.5 3.4C9.1 3.2 10.7 4.8 12 6.8C13.4 4.5 15.2 3.1 17.8 3.5C21 4 22.1 7 21 10.2C19.8 13.5 16.3 17 12.1 21Z'
                    }
                    fill="none"
                    stroke={colors.white}
                    strokeWidth={direction === -1 ? 1.45 : 1.25}
                    strokeLinecap="round"
                  />
                </Svg>
              </Pressable>
              <Text style={styles.caption}>
                {direction === -1 ? 'Swipe left' : 'Swipe right'}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
function DeckLayer({
  index,
  turn,
  motion,
  theme,
  reduced,
  card,
  venue,
  label,
  scale,
}: {
  index: number;
  turn: number;
  motion: SharedValue<DeckMotion>;
  theme: ChallengeCardTheme;
  reduced: boolean;
  card: DeckCard;
  venue: string;
  label: string;
  scale: number;
}) {
  const slot = turn + index;
  const style = useAnimatedStyle(() => {
    const visual = cardVisual(
      slot,
      reduced ? restingMotion(turn) : motion.get(),
    );
    return {
      opacity: visual.opacity,
      transform: [
        { translateX: visual.x },
        { translateY: visual.y },
        { rotate: `${visual.angle}deg` },
      ],
    };
  });
  const contentStyle = useAnimatedStyle(() => ({
    opacity: cardVisual(slot, reduced ? restingMotion(turn) : motion.get())
      .contentOpacity,
  }));
  const isFront = index === 0;
  return (
    <Animated.View
      testID={isFront ? 'challenge-card' : `challenge-back-${card.id}`}
      accessible={isFront}
      accessibilityLabel={
        isFront ? `${label}. ${card.text}. Five minutes.` : undefined
      }
      aria-hidden={!isFront}
      accessibilityElementsHidden={!isFront}
      importantForAccessibility={isFront ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.card,
        cardFrame(scale),
        {
          backgroundColor: theme.surface,
          zIndex: 4 - index,
          pointerEvents: isFront ? 'auto' : 'none',
        },
        style,
      ]}
    >
      <PaperTexture />
      <Animated.View
        testID={`challenge-reveal-${card.id}`}
        style={[StyleSheet.absoluteFill, contentStyle]}
      >
        <CardContent
          card={card}
          venue={venue}
          label={label}
          scale={scale}
          theme={theme}
        />
      </Animated.View>
    </Animated.View>
  );
}
function CardContent({
  card,
  venue,
  label,
  scale,
  theme,
}: {
  card: DeckCard;
  venue: string;
  label: string;
  scale: number;
  theme: ChallengeCardTheme;
}) {
  return (
    <View
      testID={`challenge-face-${card.id}`}
      style={[
        styles.face,
        {
          paddingHorizontal: 16 * scale,
          paddingTop: 23 * scale,
          paddingBottom: 13 * scale,
          gap: 5 * scale,
        },
      ]}
    >
      <Svg
        testID={`challenge-flourish-${card.id}`}
        aria-hidden
        style={{ position: 'absolute', right: 14 * scale, top: 14 * scale }}
        width={34 * scale}
        height={24 * scale}
        viewBox="0 0 34 24"
      >
        <Path
          d="M2 21C6 13 17 15 23 8C29 0 17 -3 17 6C17 14 26 19 33 14"
          fill="none"
          stroke={colors.ink}
          strokeWidth={1.05}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Text
        style={[styles.venue, { fontSize: 10 * scale, lineHeight: 14 * scale }]}
      >
        {label.toUpperCase()}
      </Text>
      <VenueArt venue={venue} scale={scale} background={theme.artwork} />
      <View style={styles.copyRegion}>
        <ScrollView
          testID={`challenge-copy-scroll-${card.id}`}
          style={styles.copyScroll}
          contentContainerStyle={styles.copyContent}
          bounces={false}
          nestedScrollEnabled
        >
          <View testID="challenge-copy-panel" style={styles.textPanel}>
            {/* A Yoga-sized viewport keeps percentage SVG dimensions tied to
                this intrinsic panel on iOS as well as web. */}
            <View
              aria-hidden
              style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}
            >
              <Svg
                width="100%"
                height="100%"
                viewBox="0 0 188 106"
                preserveAspectRatio="none"
              >
                <Path
                  testID={`challenge-panel-fill-${card.id}`}
                  d={panelOutline}
                  fill={theme.accent}
                />
              </Svg>
            </View>
            <Text
              style={[
                styles.challenge,
                {
                  fontSize: 20 * scale,
                  lineHeight: 23 * scale,
                  padding: 10 * scale,
                },
              ]}
            >
              {card.text}
            </Text>
          </View>
        </ScrollView>
      </View>
      <LowerFlourish scale={scale} />
    </View>
  );
}
export function ChallengeCard({
  card,
  venue,
  label,
  turn = 0,
}: {
  card: DeckCard;
  venue: string;
  label: string;
  turn?: number;
}) {
  const { width } = useWindowDimensions();
  const scale = challengeScale(width);
  const theme = cardThemes[cardColor(turn, 0)]!;
  return (
    <View
      testID="challenge-card"
      style={[
        styles.card,
        cardFrame(scale),
        {
          position: 'relative',
          alignSelf: 'center',
          backgroundColor: theme.surface,
        },
      ]}
    >
      <PaperTexture />
      <CardContent
        card={card}
        venue={venue}
        label={label}
        scale={scale}
        theme={theme}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', paddingTop: 18 },
  stage: {
    flexShrink: 0,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    position: 'absolute',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: challengeStyle.border,
    boxShadow: challengeStyle.shadow,
  },
  // Front, queued and active cards all use the same full-frame coordinates.
  face: { ...StyleSheet.absoluteFill, alignItems: 'center' },
  copyRegion: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    justifyContent: 'center',
  },
  copyScroll: { flexGrow: 0, maxHeight: '100%', width: '100%' },
  copyContent: { alignItems: 'center' },
  venue: {
    fontFamily: fontFamilies.medium,
    letterSpacing: 1.6,
    color: colors.ink,
    textAlign: 'center',
  },
  textPanel: {
    justifyContent: 'center',
    maxWidth: '100%',
  },
  challenge: {
    fontFamily: challengeDisplayFont,
    fontWeight: '400',
    letterSpacing: -0.3,
    textAlign: 'center',
    color: colors.ink,
  },
  actionSpace: {
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  actions: { flexDirection: 'row', gap: 20 },
  action: { alignItems: 'center', gap: 4 },
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    fontFamily: fontFamilies.regular,
    fontSize: 9.5,
    lineHeight: 12,
    color: colors.ink,
  },
});
