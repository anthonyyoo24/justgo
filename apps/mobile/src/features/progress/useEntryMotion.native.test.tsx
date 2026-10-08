import { renderHook } from '@testing-library/react-native';
import {
  cancelAnimation,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useEntryMotion } from './useEntryMotion.native';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const { useRef } = require('react');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (initial: number) => {
      const ref = useRef(null);
      if (!ref.current) {
        let value = initial;
        ref.current = {
          get: () => value,
          set: (next: number) => {
            value = next;
          },
        };
      }
      return ref.current;
    },
    useAnimatedStyle: (read: () => unknown) => {
      const ref = useRef(null);
      if (!ref.current) ref.current = { read };
      read();
      return ref.current;
    },
    cancelAnimation: jest.fn(),
    Easing: { out: () => 'out-cubic', inOut: () => 'in-out-cubic', cubic: 0 },
    withTiming: jest.fn((to: number) => to),
    withDelay: jest.fn((_delay: number, animation: number) => {
      expect(_delay).toBe(16);
      return animation;
    }),
  };
});
jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn() }));

const timing = jest.mocked(withTiming);
const cancel = jest.mocked(cancelAnimation);
beforeEach(() => jest.clearAllMocks());

it('animates height and reveal on native shared values and cancels both together', () => {
  const { result } = renderHook(useEntryMotion);
  const stop = result.current.animate(true, 144, jest.fn());
  expect(timing.mock.calls.map(([to, config]) => [to, config])).toEqual([
    [144, { duration: 240, easing: 'out-cubic' }],
    [1, { duration: 240, easing: 'out-cubic' }],
  ]);
  expect(withDelay).toHaveBeenCalledTimes(2);
  stop();
  expect(cancel).toHaveBeenCalledTimes(2);
  expect(cancel.mock.calls[0]![0]).not.toBe(cancel.mock.calls[1]![0]);
  timing.mockClear();
  result.current.animate(false, 144, jest.fn())();
  expect(timing.mock.calls.map(([to, config]) => [to, config])).toEqual([
    [0, { duration: 230, easing: 'in-out-cubic' }],
    [0, { duration: 230, easing: 'in-out-cubic' }],
  ]);
});

it('schedules the RN focus callback only when native reveal actually finishes', () => {
  const { result } = renderHook(useEntryMotion);
  const onDone = jest.fn();
  const stop = result.current.animate(true, 144, onDone);
  const complete = timing.mock.calls[1]![2]!;
  complete(false);
  expect(scheduleOnRN).not.toHaveBeenCalled();
  complete(true);
  expect(scheduleOnRN).toHaveBeenCalledWith(onDone);
  // The UI callback schedules rather than synchronously focusing on that thread.
  expect(onDone).not.toHaveBeenCalled();
  jest.mocked(scheduleOnRN).mock.calls[0]![0]();
  expect(onDone).toHaveBeenCalledTimes(1);
  stop();
});

it('sets reduced-motion endpoints and resets replacement opacity without timing', () => {
  const { result } = renderHook(useEntryMotion);
  result.current.set(true, 156);
  const values = cancel.mock.calls.map(([value]) => value);
  expect(values.map((value) => value.get())).toEqual([156, 1]);
  result.current.resetReveal();
  expect(values.map((value) => value.get())).toEqual([156, 0]);
  result.current.set(false, 156);
  expect(values.map((value) => value.get())).toEqual([0, 0]);
  expect(timing).not.toHaveBeenCalled();
});

it('keeps the adapter stable across unrelated renders without restarting motion', () => {
  const { result, rerender } = renderHook(useEntryMotion);
  const initial = result.current;
  rerender({});
  expect(result.current).toBe(initial);
  expect(timing).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});
