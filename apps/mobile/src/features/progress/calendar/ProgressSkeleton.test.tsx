import { render, renderHook } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';
import { ProgressSkeleton, useProgressShimmer } from './ProgressSkeleton';

let mockReduceMotion = false;
jest.mock('../../../platform/motion/motion', () => ({
  useReduceMotion: () => mockReduceMotion,
}));

afterEach(() => {
  jest.restoreAllMocks();
  mockReduceMotion = false;
});

it('runs one shared animation during loading and stops it when data is ready', async () => {
  const start = jest.fn();
  const stop = jest.fn();
  const loop = jest
    .spyOn(Animated, 'loop')
    .mockReturnValue({ start, stop, reset: jest.fn() });
  const screen = await renderHook<Animated.Value | null, { loading: boolean }>(
    ({ loading }) => useProgressShimmer(loading),
    {
      initialProps: { loading: true },
    },
  );
  expect(screen.result.current).toBeInstanceOf(Animated.Value);
  expect(loop).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledTimes(1);
  await screen.rerender({ loading: false });
  expect(screen.result.current).toBeNull();
  expect(stop).toHaveBeenCalledTimes(1);
});

it('uses static placeholders when reduced motion is requested', async () => {
  mockReduceMotion = true;
  const loop = jest.spyOn(Animated, 'loop');
  const screen = await renderHook(() => useProgressShimmer(true));
  expect(screen.result.current).toBeNull();
  expect(loop).not.toHaveBeenCalled();
});

it('stops an in-flight shimmer when the Progress screen unmounts', async () => {
  const stop = jest.fn();
  jest
    .spyOn(Animated, 'loop')
    .mockReturnValue({ start: jest.fn(), stop, reset: jest.fn() });
  const screen = await renderHook(() => useProgressShimmer(true));
  await screen.unmount();
  expect(stop).toHaveBeenCalledTimes(1);
});

it('keeps skeleton overlays decorative and ignores pointer input through styles', async () => {
  const screen = await render(
    <ProgressSkeleton animation={null} testID="skeleton" />,
  );
  const placeholder = screen.getByTestId('skeleton', {
    includeHiddenElements: true,
  });
  expect(StyleSheet.flatten(placeholder.props.style).pointerEvents).toBe(
    'none',
  );
  expect(placeholder.props['aria-hidden']).toBe(true);
});
