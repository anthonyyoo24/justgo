import { cardColor, cardPose, rotate, swipeDirection } from './deck-model';
it('cancels short drags and commits intentional distance or velocity', () => {
  expect(swipeDirection(40, 80)).toBe(0);
  expect(swipeDirection(0, 900)).toBe(0);
  expect(swipeDirection(90, -10)).toBe(1);
  expect(swipeDirection(-20, -700)).toBe(-1);
  expect(swipeDirection(20, -700)).toBe(0);
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
