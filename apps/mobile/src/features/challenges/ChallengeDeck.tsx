/* eslint-disable react-hooks/refs -- Gesture Handler registers callbacks; it does not execute these event handlers during render. */
import { useEffect, useRef, useState } from 'react';
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
import { cardColor, cardPose, deckMotion, swipeDirection } from './deck-model';
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
  height: 310 * scale,
});
export function ChallengeDeck({
  cards,
  venue,
  label,
  turn,
  disabled = false,
  onBusyChange,
  onAction,
}: {
  cards: readonly DeckCard[];
  venue: string;
  label: string;
  turn: number;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onAction: (direction: -1 | 1) => Promise<void>;
}) {
  const { width } = useWindowDimensions();
  const scale = challengeScale(width);
  const frame = cardFrame(scale);
  const x = useSharedValue(0),
    y = useSharedValue(0),
    progress = useSharedValue(0),
    locked = useSharedValue(false);
  const busy = useRef(false),
    alive = useRef(true);
  const [working, setWorking] = useState(false),
    [reduced, setReduced] = useState(false);
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
      cancelAnimation(x);
      cancelAnimation(y);
      cancelAnimation(progress);
      onBusyChange?.(false);
    };
  }, [x, y, progress, onBusyChange]);
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
    const animation = new Promise<void>((resolve) => {
      if (reduced) {
        resolve();
        return;
      }
      x.set(
        withTiming(direction * (width + 320), {
          duration: deckMotion.duration,
          easing: Easing.out(Easing.cubic),
        }),
      );
      progress.set(
        withTiming(
          1,
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
    // Domain updates happen after motion, and remain authoritative on failure.
    await animation;
    if (!alive.current) return;
    try {
      await onAction(direction);
    } finally {
      if (alive.current) {
        x.set(0);
        y.set(0);
        progress.set(0);
        locked.set(false);
        busy.current = false;
        setWorking(false);
      }
      onBusyChange?.(false);
    }
  }
  const gesture = Gesture.Pan()
    .enabled(!disabled && !working && cards.length > 0)
    .activeOffsetX([-12, 12])
    .failOffsetY([-22, 22])
    .onUpdate((event) => {
      if (!locked.get()) {
        x.set(event.translationX);
        y.set(event.translationY * 0.35);
      }
    })
    .onEnd((event) => {
      if (locked.get()) return;
      const direction = swipeDirection(event.translationX, event.velocityX);
      if (direction) {
        locked.set(true);
        scheduleOnRN(commit, direction);
      } else {
        x.set(withTiming(0, { duration: deckMotion.settle }));
        y.set(withTiming(0, { duration: deckMotion.settle }));
      }
    })
    .onFinalize((_event, success) => {
      if (!success && !locked.get()) {
        x.set(withTiming(0));
        y.set(withTiming(0));
      }
    });
  const front = useAnimatedStyle(() => ({
    transform: [
      { translateX: reduced ? 0 : x.get() },
      { translateY: reduced ? 0 : y.get() },
      { rotate: `${reduced ? 0 : x.get() / 22}deg` },
    ],
  }));
  return (
    <View style={styles.container}>
      <View
        testID="challenge-stage"
        style={[
          styles.stage,
          { height: frame.height + 30, width: 292 * scale },
        ]}
      >
        {cards.slice(1, 4).map((card, i) => (
          <StackCard
            key={card.id}
            index={i + 1}
            progress={progress}
            reveal={x}
            theme={cardThemes[cardColor(turn, i + 1)]!}
            reduced={reduced}
            card={card}
            venue={venue}
            label={label}
            scale={scale}
          />
        ))}
        {cards[0] && (
          <GestureDetector gesture={gesture}>
            <Animated.View
              testID="challenge-card"
              accessible
              accessibilityLabel={`${label}. ${cards[0].text}. Five minutes.`}
              style={[
                styles.card,
                frame,
                {
                  backgroundColor: cardThemes[cardColor(turn, 0)]!.surface,
                  zIndex: 4,
                },
                front,
              ]}
            >
              <PaperTexture />
              <CardContent
                card={cards[0]}
                venue={venue}
                label={label}
                scale={scale}
                theme={cardThemes[cardColor(turn, 0)]!}
              />
            </Animated.View>
          </GestureDetector>
        )}
      </View>
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
              style={[styles.button, (disabled || working) && { opacity: 0.5 }]}
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
  );
}
function StackCard({
  index,
  progress,
  reveal,
  theme,
  reduced,
  card,
  venue,
  label,
  scale,
}: {
  index: number;
  progress: SharedValue<number>;
  reveal: SharedValue<number>;
  theme: ChallengeCardTheme;
  reduced: boolean;
  card: DeckCard;
  venue: string;
  label: string;
  scale: number;
}) {
  const style = useAnimatedStyle(() => {
    const pose = cardPose(index, reduced ? 0 : progress.get());
    return {
      opacity:
        index === 3
          ? Math.max(0, Math.min(1, (progress.get() - 0.4) / 0.35))
          : 1,
      transform: [
        { translateX: pose.x },
        { translateY: pose.y },
        { rotate: `${pose.angle}deg` },
      ],
    };
  });
  const contentStyle = useAnimatedStyle(() => ({
    // Paper shows clean fanned edges at rest. Reveal the next card's contents
    // during the swipe, before it becomes the live front card.
    opacity: reduced
      ? 0
      : Math.min(1, Math.max(Math.abs(reveal.get()) / 80, progress.get() * 2)),
  }));
  return (
    <Animated.View
      testID={`challenge-back-${card.id}`}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.card,
        cardFrame(scale),
        {
          backgroundColor: theme.surface,
          zIndex: 4 - index,
          pointerEvents: 'none',
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
        { padding: 16 * scale, paddingTop: 27 * scale, gap: 8 * scale },
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
}: {
  card: DeckCard;
  venue: string;
  label: string;
}) {
  const { width } = useWindowDimensions();
  const scale = challengeScale(width);
  return (
    <View
      testID="challenge-card"
      style={[
        styles.card,
        cardFrame(scale),
        {
          position: 'relative',
          alignSelf: 'center',
          backgroundColor: cardThemes[0].surface,
        },
      ]}
    >
      <PaperTexture />
      <CardContent
        card={card}
        venue={venue}
        label={label}
        scale={scale}
        theme={cardThemes[0]}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 14, paddingTop: 18 },
  stage: {
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
