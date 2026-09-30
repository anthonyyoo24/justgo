import { renderHook } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { useProgressShimmer } from './ProgressSkeleton';

let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => ({
  useReducedMotion: () => mockReduceMotion,
}));

afterEach(() => {
  jest.restoreAllMocks();
  mockReduceMotion = false;
});

it('runs one shared animation during loading and stops it when data is ready', () => {
  const start = jest.fn();
  const stop = jest.fn();
  const loop = jest
    .spyOn(Animated, 'loop')
    .mockReturnValue({ start, stop, reset: jest.fn() });
  const screen = renderHook<Animated.Value | null, { loading: boolean }>(
    ({ loading }) => useProgressShimmer(loading),
    {
      initialProps: { loading: true },
    },
  );
  expect(screen.result.current).toBeInstanceOf(Animated.Value);
  expect(loop).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledTimes(1);
  screen.rerender({ loading: false });
  expect(screen.result.current).toBeNull();
  expect(stop).toHaveBeenCalledTimes(1);
});

it('uses static placeholders when reduced motion is requested', () => {
  mockReduceMotion = true;
  const loop = jest.spyOn(Animated, 'loop');
  const screen = renderHook(() => useProgressShimmer(true));
  expect(screen.result.current).toBeNull();
  expect(loop).not.toHaveBeenCalled();
});

it('stops an in-flight shimmer when the Progress screen unmounts', () => {
  const stop = jest.fn();
  jest
    .spyOn(Animated, 'loop')
    .mockReturnValue({ start: jest.fn(), stop, reset: jest.fn() });
  const screen = renderHook(() => useProgressShimmer(true));
  screen.unmount();
  expect(stop).toHaveBeenCalledTimes(1);
});
