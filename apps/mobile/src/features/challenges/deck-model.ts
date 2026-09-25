// Worklet-safe, shared by gestures and their tests.
export const deckMotion = {
  duration: 300,
  settle: 220,
  distance: 80,
  velocity: 650,
} as const;
export type DeckMotion = {
  turn: number;
  x: number;
  y: number;
  progress: number;
};

export function restingMotion(turn: number): DeckMotion {
  'worklet';
  return { turn, x: 0, y: 0, progress: 0 };
}

export function swipeDirection(x: number, velocity: number): -1 | 0 | 1 {
  'worklet';
  if (Math.abs(x) >= deckMotion.distance) return x > 0 ? 1 : -1;
  if (
    Math.abs(x) > 12 &&
    Math.abs(velocity) >= deckMotion.velocity &&
    Math.sign(x) === Math.sign(velocity)
  )
    return x > 0 ? 1 : -1;
  return 0;
}
export function rotate<T>(cards: readonly T[]): T[] {
  return cards.length > 1 ? [...cards.slice(1), cards[0]!] : [...cards];
}
export function cardColor(turn: number, index: number) {
  return (turn + index) % 3;
}
export function cardPose(index: number, progress: number) {
  'worklet';
  const p =
    index === 3 ? Math.max(0, Math.min(1, (progress - 0.45) / 0.55)) : progress;
  const from = index === 3 ? 2 : index;
  const to = index === 3 ? 2 : Math.max(0, index - 1);
  // The fourth card starts exactly behind the rear, then fans out as it moves away.
  const position =
    index === 3
      ? 2 - Math.min(progress / 0.45, 1) * 0.6 + p * 0.6
      : from + (to - from) * p;
  return { x: position * 12, y: position * 9, angle: position * 4 };
}

// A card's slot (queue turn + index) stays constant as it moves to the front.
// The acknowledged queue may render before the animation state is rebased;
// both sides of that handoff must produce exactly the same visible pose.
export function cardVisual(slot: number, motion: DeckMotion) {
  'worklet';
  const index = slot - motion.turn;
  const pose =
    index === 0
      ? { x: motion.x, y: motion.y, angle: motion.x / 22 }
      : cardPose(index, motion.progress);
  return {
    ...pose,
    opacity:
      index < 0 || index > 3
        ? 0
        : index === 3
          ? Math.max(0, Math.min(1, (motion.progress - 0.4) / 0.35))
          : 1,
    contentOpacity:
      index === 0
        ? 1
        : index === 1
          ? Math.min(1, Math.max(Math.abs(motion.x) / 80, motion.progress * 2))
          : 0,
  };
}
