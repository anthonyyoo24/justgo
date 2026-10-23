import { act, renderHook } from '@testing-library/react-native';
import {
  Keyboard,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';
import {
  MotionContext,
  type MotionPreferences,
} from '../../platform/motion/motion';
import { useReflectionKeyboard } from './useReflectionKeyboard';

const layout = (y: number, height: number) =>
  ({
    nativeEvent: { layout: { x: 0, y, width: 390, height } },
  }) as LayoutChangeEvent;

async function setup(reduceMotion = false) {
  const shown = jest.fn();
  const remove = jest.fn();
  const listen = Keyboard.addListener.bind(Keyboard);
  jest.spyOn(Keyboard, 'addListener').mockImplementation((_event, callback) => {
    shown.mockImplementation(callback);
    const subscription = listen(_event, callback);
    const unsubscribe = subscription.remove.bind(subscription);
    jest.spyOn(subscription, 'remove').mockImplementation(() => {
      remove();
      unsubscribe();
    });
    return subscription;
  });
  const preferences = { reduceMotion } as MotionPreferences;
  const hook = await renderHook(() => useReflectionKeyboard(228), {
    wrapper: ({ children }) => (
      <MotionContext.Provider value={preferences}>
        {children}
      </MotionContext.Provider>
    ),
  });
  const scrollTo = jest.fn();
  hook.result.current.scrollRef.current = {
    scrollTo,
  } as unknown as ScrollViewInstance;
  await act(() => {
    hook.result.current.onViewportLayout(layout(0, 700));
    hook.result.current.onSectionLayout(layout(350, 320));
    hook.result.current.onInputLayout(layout(92, 228));
  });
  return { ...hook, scrollTo, shown, remove };
}

afterEach(() => jest.restoreAllMocks());

it('reveals the editor on focus and retries after keyboard layout/content settle', async () => {
  const { result, scrollTo, shown } = await setup();
  expect(scrollTo).not.toHaveBeenCalled();
  await act(() => result.current.onFocus());
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 338, animated: true });
  expect(result.current.paddingBottom).toBe(380);
  scrollTo.mockClear();
  await act(() => {
    // A small phone leaves only 260 points above the separately measured footer.
    result.current.onViewportLayout(layout(0, 260));
    shown();
  });
  expect(result.current.inputHeight).toBe(140);
  expect(12 + 92 + result.current.inputHeight).toBeLessThanOrEqual(260 - 16);
  await act(() => {
    result.current.onSectionLayout(layout(350, 232));
    result.current.onContentSizeChange();
  });
  expect(result.current.paddingBottom).toBe(28);
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 338, animated: true });
  // Section plus trailing space can actually scroll to that offset.
  expect(350 + 232 + result.current.paddingBottom - 260).toBeGreaterThanOrEqual(
    338,
  );
});

it('bounds a long editor to the viewport and responds to large text and rotation', async () => {
  const { result } = await setup();
  await act(() => {
    result.current.onFocus();
    result.current.onViewportLayout(layout(0, 180));
    result.current.onInputLayout(layout(130, 228));
  });
  expect(result.current.inputHeight).toBe(96);
  await act(() => result.current.onViewportLayout(layout(0, 500)));
  expect(result.current.inputHeight).toBe(228);
});

it('honors reduced motion and supports refocusing when a keyboard is already visible', async () => {
  const { result, scrollTo } = await setup(true);
  await act(() => result.current.onFocus());
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 338, animated: false });
  await act(() => result.current.onBlur());
  scrollTo.mockClear();
  await act(() => result.current.onFocus());
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 338, animated: false });
});

it('ignores late keyboard/layout events after blur and removes the native listener', async () => {
  const { result, scrollTo, shown, remove, unmount } = await setup();
  await act(() => result.current.onFocus());
  await act(() => result.current.onBlur());
  scrollTo.mockClear();
  await act(() => {
    shown();
    result.current.onViewportLayout(layout(0, 260));
    result.current.onContentSizeChange();
  });
  expect(scrollTo).not.toHaveBeenCalled();
  expect(result.current.inputHeight).toBe(228);
  expect(result.current.paddingBottom).toBe(16);
  await unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});

it('handles focus before measurements without negative offsets or a missing ref', async () => {
  const { result, unmount } = await renderHook(() =>
    useReflectionKeyboard(228),
  );
  await act(() => result.current.onFocus());
  expect(result.current.inputHeight).toBe(228);
  const scrollTo = jest.fn();
  result.current.scrollRef.current = {
    scrollTo,
  } as unknown as ScrollViewInstance;
  await act(() => {
    result.current.onSectionLayout(layout(5, 320));
    result.current.onContentSizeChange();
  });
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  await unmount();
});
