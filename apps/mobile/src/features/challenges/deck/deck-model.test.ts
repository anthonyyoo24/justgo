import {
  cardColor,
  cardPose,
  cardVisual,
  restingMotion,
  rotate,
  swipeDirection,
} from './deck-model';
it('cancels short drags and commits intentional distance or velocity', () => {
  expect(swipeDirection(40, 80)).toBe(0);
  expect(swipeDirection(0, 900)).toBe(0);
  expect(swipeDirection(90, -10)).toBe(1);
  expect(swipeDirection(-20, -700)).toBe(-1);
  expect(swipeDirection(20, -700)).toBe(0);
});
it('keeps the next card in place whether the new queue or the animation rebase arrives first', () => {
  const finished = { turn: 7, x: -710, y: 0, progress: 1 };
  // The old middle has slot 8; after the queue publishes it is front at turn 8.
  const before = cardVisual(7 + 1, finished);
  const queueCommitted = cardVisual(8 + 0, finished);
  const rebased = cardVisual(8 + 0, restingMotion(8));
  expect(before).toEqual({
    x: 0,
    y: 0,
    angle: 0,
    opacity: 1,
    contentOpacity: 1,
  });
  expect(queueCommitted).toEqual(before);
  expect(rebased).toEqual(before);
  // A newly prefetched fourth card must not flash through during the handoff.
  expect(cardVisual(8 + 3, finished).opacity).toBe(0);
  expect(cardVisual(8 + 3, restingMotion(8)).opacity).toBe(0);
  // Other fanned edges cannot flash their content and hide it on rebase.
  for (const slot of [9, 10]) {
    expect(cardVisual(slot, finished).contentOpacity).toBe(0);
    expect(cardVisual(slot, restingMotion(8)).contentOpacity).toBe(0);
  }
});
it('cycles an entire venue queue without duplicating small stacks', () => {
  expect(rotate([])).toEqual([]);
  expect(rotate(['one'])).toEqual(['one']);
  expect(rotate(['a', 'b', 'c', 'd'])).toEqual(['b', 'c', 'd', 'a']);
  expect(cardColor(0, 3)).toBe(cardColor(0, 0));
  expect(cardColor(1, 0)).toBe(cardColor(0, 1));
});
it('straightens the middle and overlaps the incoming rear reveal', () => {
  expect(cardPose(1, 1)).toEqual({ x: 0, y: 0, angle: 0 });
  expect(cardPose(2, 1)).toEqual(cardPose(1, 0));
  expect(cardPose(3, 0.8).x).toBeGreaterThan(cardPose(3, 0.45).x);
  expect(cardPose(3, 0)).toEqual(cardPose(2, 0));
  expect(cardPose(3, 1)).toEqual(cardPose(2, 0));
});
