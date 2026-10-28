import { act, renderHook } from '@testing-library/react-native';
import {
  Animated,
  Keyboard,
  PanResponder,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
  type ViewInstance,
} from 'react-native';
import { useDaySheetDrag } from './useDaySheetDrag';

const layout = (height: number) =>
  ({
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
  }) as LayoutChangeEvent;
const event = {} as GestureResponderEvent;
const gesture = (dy = 0, vy = 0, dx = 0) =>
  ({ dy, vy, dx }) as PanResponderGestureState;

async function setup(reduceMotion = true) {
  let handlers: PanResponderCallbacks = {};
  const create = PanResponder.create.bind(PanResponder);
  jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    handlers = config;
    return create(config);
  });
  const timing = jest
    .spyOn(Animated, 'timing')
    .mockImplementation((value, config) => ({
      start: (callback?: (result: { finished: boolean }) => void) => {
        (value as Animated.Value).setValue(config.toValue as number);
        callback?.({ finished: true });
      },
      stop: jest.fn(),
      reset: jest.fn(),
    }));
  const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  const options = {
    visible: true,
    windowHeight: 900,
    topInset: 40,
    bottomInset: 20,
    keyboardVisible: false,
    fallbackHeight: 360,
    hasMore: false,
    reduceMotion,
  };
  const hook = await renderHook(
    (props: typeof options) => useDaySheetDrag(props),
    { initialProps: options },
  );
  await act(() => hook.result.current.attachHandle({} as ViewInstance));
  let height = 0;
  const listener = hook.result.current.height.addListener(({ value }) => {
    height = value;
  });
  await act(() => {
    hook.result.current.onAvailableLayout(layout(860));
    hook.result.current.onHeaderLayout(layout(140));
    hook.result.current.onFirstRowHeightChange(100);
    hook.result.current.onContentLayout(1000, true);
  });
  const drag = async (dy: number, velocity = 0) =>
    act(() => {
      handlers.onPanResponderGrant?.(event, gesture());
      handlers.onPanResponderMove?.(event, gesture(dy, velocity));
      handlers.onPanResponderRelease?.(event, gesture(dy, velocity));
    });
  const cleanup = async () => {
    hook.result.current.height.removeListener(listener);
    await hook.unmount();
  };
  return {
    ...hook,
    options,
    handlers,
    timing,
    dismiss,
    height: () => height,
    drag,
    cleanup,
  };
}

afterEach(() => jest.restoreAllMocks());

it('follows the finger in both directions and keeps intermediate release heights', async () => {
  const t = await setup();
  expect(t.height()).toBe(580);
  expect(t.result.current.canExpand).toBe(true);
  await act(() => {
    t.handlers.onPanResponderGrant?.(event, gesture());
    t.handlers.onPanResponderMove?.(event, gesture(-120));
  });
  expect(t.height()).toBe(700);
  await act(() => t.handlers.onPanResponderRelease?.(event, gesture(-120)));
  expect(t.height()).toBe(700);
  expect(t.result.current.expanded).toBe(false);
  await t.drag(80);
  expect(t.height()).toBe(620);
  expect(t.timing).not.toHaveBeenCalled();
  await t.cleanup();
});

it('clamps very large downward drags at minimum height and upward drags at available space', async () => {
  const t = await setup();
  await t.drag(2000, 10);
  expect(t.height()).toBe(252);
  await t.drag(2000, 10);
  expect(t.height()).toBe(252);
  await t.drag(-2000, -10);
  expect(t.height()).toBe(828);
  expect(t.result.current.expanded).toBe(true);
  await t.cleanup();
});

it('fits very short content, resists upward stretching and restores it on cancellation', async () => {
  const t = await setup();
  await act(() => t.result.current.onContentLayout(100, true));
  expect(t.height()).toBe(252);
  expect(t.result.current.canExpand).toBe(false);
  await act(() => {
    t.handlers.onPanResponderGrant?.(event, gesture());
    t.handlers.onPanResponderMove?.(event, gesture(-100));
  });
  expect(t.height()).toBe(277);
  await act(() => t.handlers.onPanResponderTerminate?.(event, gesture(-100)));
  expect(t.height()).toBe(252);
  await t.cleanup();
});

it('consumes keyboard dismissal through layout changes and restores the chosen resize height', async () => {
  const t = await setup();
  await t.drag(-120);
  expect(t.height()).toBe(700);
  await t.rerender({ ...t.options, keyboardVisible: true });
  expect(t.height()).toBe(828);
  await act(() => {
    t.handlers.onPanResponderGrant?.(event, gesture());
    t.handlers.onPanResponderMove?.(event, gesture(120));
    t.handlers.onPanResponderMove?.(event, gesture(180));
  });
  expect(t.dismiss).toHaveBeenCalledTimes(1);
  await t.rerender({ ...t.options, keyboardVisible: false });
  await act(() => t.handlers.onPanResponderRelease?.(event, gesture(180, 10)));
  expect(t.height()).toBe(700);
  await t.drag(50);
  expect(t.height()).toBe(650);
  await t.cleanup();
});

it('retains expanded preference through the keyboard and cancels stale release after rotation', async () => {
  const t = await setup();
  await act(() => t.result.current.expand());
  await t.rerender({ ...t.options, keyboardVisible: true });
  await act(() => t.result.current.onAvailableLayout(layout(400)));
  expect(t.height()).toBe(368);
  await t.rerender({ ...t.options, keyboardVisible: false });
  await act(() => t.result.current.onAvailableLayout(layout(860)));
  expect(t.height()).toBe(828);
  await act(() => {
    t.handlers.onPanResponderGrant?.(event, gesture());
    t.handlers.onPanResponderMove?.(event, gesture(120));
    t.result.current.onAvailableLayout(layout(500));
  });
  await act(() => t.handlers.onPanResponderRelease?.(event, gesture(2000, 10)));
  expect(t.height()).toBe(468);
  await t.cleanup();
});

it('retains finger ownership when progressive batches remeasure during a resize', async () => {
  const t = await setup();
  await act(() => {
    t.handlers.onPanResponderGrant?.(event, gesture());
    t.handlers.onPanResponderMove?.(event, gesture(-80));
  });
  await act(() => t.result.current.onContentLayout(2000, false));
  expect(t.height()).toBe(660);
  await act(() => t.handlers.onPanResponderMove?.(event, gesture(-120)));
  expect(t.height()).toBe(700);
  await act(() => t.handlers.onPanResponderRelease?.(event, gesture(-120)));
  expect(t.height()).toBe(700);
  await t.cleanup();
});

it('uses interrupted presentation height and cleans up animation ownership on unmount', async () => {
  const t = await setup(false);
  t.timing.mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  await act(() => {
    t.result.current.expand();
    t.result.current.height.setValue(700);
  });
  await act(() => {
    t.handlers.onPanResponderGrant?.(event, gesture());
    t.handlers.onPanResponderMove?.(event, gesture(20));
  });
  expect(t.height()).toBe(680);
  const stop = jest.spyOn(t.result.current.height, 'stopAnimation');
  await t.cleanup();
  expect(stop).toHaveBeenCalled();
});

it('supports accessible minimum/maximum resizing and resets the preference when closed', async () => {
  const t = await setup(false);
  await act(() => t.result.current.expand());
  expect(t.height()).toBe(828);
  expect(t.timing).toHaveBeenLastCalledWith(
    t.result.current.height,
    expect.objectContaining({ toValue: 828, useNativeDriver: false }),
  );
  await act(() => t.result.current.collapse());
  expect(t.height()).toBe(252);
  await act(() => t.result.current.collapse());
  expect(t.height()).toBe(252);
  await t.rerender({ ...t.options, keyboardVisible: true });
  await act(() => t.result.current.collapse());
  expect(t.dismiss).toHaveBeenCalledTimes(1);
  expect(t.height()).toBe(828);
  await t.rerender({ ...t.options, visible: false });
  expect(t.result.current.expanded).toBe(false);
  expect(t.height()).toBe(580);
  await t.cleanup();
});

it('cancels horizontal gestures without applying their vertical distance', async () => {
  const t = await setup();
  expect(t.handlers.onStartShouldSetPanResponder?.(event, gesture())).toBe(
    true,
  );
  expect(t.handlers.onMoveShouldSetPanResponder?.(event, gesture(4))).toBe(
    false,
  );
  expect(
    t.handlers.onMoveShouldSetPanResponder?.(event, gesture(20, 0, 30)),
  ).toBe(false);
  await act(() => {
    t.handlers.onPanResponderGrant?.(event, gesture());
    t.handlers.onPanResponderMove?.(event, gesture(20, 0, 30));
    t.handlers.onPanResponderRelease?.(event, gesture(20, 0, 30));
  });
  expect(t.height()).toBe(580);
  await t.cleanup();
});

it('ignores a click after dragging while allowing fresh keyboard or pointer activation', async () => {
  const t = await setup();
  await t.drag(-120);
  expect(t.height()).toBe(700);
  await act(() => t.result.current.toggle());
  expect(t.height()).toBe(700);
  await act(() => {
    t.result.current.preparePress();
    t.result.current.toggle();
  });
  expect(t.height()).toBe(828);
  await act(() => t.result.current.toggle());
  expect(t.height()).toBe(252);
  await t.cleanup();
});

it('keeps a four-attempt-sized sheet under the finger while native content remeasures', async () => {
  const t = await setup();
  await act(() => t.result.current.onContentLayout(360, true));
  expect(t.height()).toBe(512);
  await act(() => {
    t.handlers.onPanResponderGrant?.(event, gesture());
    t.handlers.onPanResponderMove?.(event, gesture(-100));
  });
  expect(t.height()).toBe(537);
  await act(() => t.result.current.onContentLayout(370, true));
  expect(t.height()).toBe(537);
  await act(() => t.handlers.onPanResponderMove?.(event, gesture(-120)));
  expect(t.height()).toBe(542);
  await act(() => t.handlers.onPanResponderRelease?.(event, gesture(-120)));
  expect(t.height()).toBe(522);
  await t.drag(80);
  expect(t.height()).toBe(442);
  await t.cleanup();
});

it('resizes small fast downward gestures by their distance without a fling', async () => {
  const t = await setup();
  await t.drag(25, 10);
  expect(t.height()).toBe(555);
  await t.drag(25, Number.POSITIVE_INFINITY);
  expect(t.height()).toBe(530);
  await t.cleanup();
});

it('updates the one-row minimum after wrapping while preserving a taller chosen height', async () => {
  const t = await setup();
  await t.drag(2000);
  expect(t.height()).toBe(252);
  await act(() => t.result.current.onFirstRowHeightChange(180));
  expect(t.height()).toBe(332);
  await t.drag(-100);
  expect(t.height()).toBe(432);
  await act(() => t.result.current.onFirstRowHeightChange(120));
  expect(t.height()).toBe(432);
  await t.drag(2000);
  expect(t.height()).toBe(272);
  await t.cleanup();
});
