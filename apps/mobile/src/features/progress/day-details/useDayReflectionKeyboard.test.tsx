import { act, renderHook } from '@testing-library/react-native';
import {
  Keyboard,
  type LayoutChangeEvent,
  type ScrollViewInstance,
  type ViewInstance,
} from 'react-native';
import { useDayReflectionKeyboard } from './useDayReflectionKeyboard';

const layout = (height: number) =>
  ({
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
  }) as LayoutChangeEvent;

let frames = new Map<number, Parameters<typeof requestAnimationFrame>[0]>();
beforeEach(() => {
  frames = new Map();
  let nextFrame = 0;
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => {
    if (id !== null && id !== undefined) frames.delete(id);
  });
});
async function flushFrame() {
  const callbacks = [...frames.values()];
  frames.clear();
  await act(() => callbacks.forEach((callback) => callback(0)));
}

async function setup(reduceMotion = false) {
  const listeners = new Map<string, () => void>();
  const remove = jest.fn();
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  jest.spyOn(Keyboard, 'metrics').mockReturnValue(undefined);
  jest.spyOn(Keyboard, 'addListener').mockImplementation((name, callback) => {
    listeners.set(name, callback as () => void);
    return { remove };
  });
  const hook = await renderHook(
    ({ id }: { id: string | null }) =>
      useDayReflectionKeyboard(id, reduceMotion),
    { initialProps: { id: 'last-attempt' as string | null } },
  );
  const scrollTo = jest.fn();
  const bounds = {
    listTop: 180,
    listHeight: 200,
    editorTop: 400,
    editorHeight: 132,
  };
  const measureEditor = jest.fn(
    (callback: (x: number, y: number, width: number, height: number) => void) =>
      callback(0, bounds.editorTop, 340, bounds.editorHeight),
  );
  hook.result.current.scrollRef.current = {
    scrollTo,
    measureInWindow: (
      callback: (x: number, y: number, width: number, height: number) => void,
    ) => callback(0, bounds.listTop, 390, bounds.listHeight),
  } as unknown as ScrollViewInstance;
  hook.result.current.editorRef.current = {
    measureInWindow: measureEditor,
  } as unknown as ViewInstance;
  await act(() => hook.result.current.onScrollOffsetChange(900));
  return { ...hook, bounds, scrollTo, measureEditor, listeners, remove };
}

afterEach(() => jest.restoreAllMocks());

it.each([
  ['last', 400],
  ['second-last', 480],
  ['third-last', 560],
])(
  'reveals the whole %s editor and actions without jumping to the end of the day',
  async (_position, top) => {
    const { result, bounds, listeners, scrollTo } = await setup();
    bounds.editorTop = top as number;
    await act(() => listeners.get('keyboardDidShow')!());
    await flushFrame();
    const expectedY =
      900 + bounds.editorTop + bounds.editorHeight - (180 + 200 - 12);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: expectedY, animated: true });
    const movedTop = bounds.editorTop - (expectedY - 900);
    expect(movedTop).toBeGreaterThanOrEqual(180 + 12);
    expect(movedTop + bounds.editorHeight).toBe(180 + 200 - 12);
    expect(result.current.keyboardVisible).toBe(true);
  },
);

it('retries fresh geometry when the keyboard and viewport settle in either order', async () => {
  const { result, bounds, listeners, scrollTo } = await setup(true);
  bounds.listHeight = 500;
  jest
    .spyOn(Keyboard, 'metrics')
    .mockReturnValue({ screenY: 500, height: 344, screenX: 0, width: 390 });
  await act(() => listeners.get('keyboardDidShow')!());
  await flushFrame();
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 944, animated: false });
  bounds.listHeight = 200;
  await act(() => result.current.onViewportLayout(layout(200)));
  await flushFrame();
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 1064, animated: false });
  scrollTo.mockClear();
  await act(() => listeners.get('keyboardDidChangeFrame')!());
  await flushFrame();
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 1064, animated: false });
  expect(result.current.viewportHeight).toBe(200);
});

it('keeps visible forms still and permits manual scrolling, then reveals on refocus', async () => {
  const { result, bounds, scrollTo } = await setup(true);
  bounds.editorTop = 200;
  await act(() => result.current.revealEditor());
  await flushFrame();
  expect(scrollTo).not.toHaveBeenCalled();
  await act(() => result.current.onScrollOffsetChange(850));
  expect(scrollTo).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
  bounds.editorTop = 400;
  // Focusing an input while the keyboard is already present has no show event.
  await act(() => result.current.revealEditor());
  await flushFrame();
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 1014, animated: false });
});

it('brings a form above the viewport down and clamps offsets at zero', async () => {
  const { result, bounds, scrollTo } = await setup();
  bounds.editorTop = 100;
  await act(() => result.current.revealEditor());
  await flushFrame();
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 808, animated: true });
  await act(() => result.current.onScrollOffsetChange(0));
  await act(() => result.current.revealEditor());
  await flushFrame();
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true });
});

it('ignores zero measurements and starts oversized accessibility forms at the field', async () => {
  const { result, bounds, scrollTo } = await setup();
  bounds.editorHeight = 0;
  await act(() => result.current.revealEditor());
  await flushFrame();
  expect(scrollTo).not.toHaveBeenCalled();
  bounds.editorHeight = 300;
  bounds.listHeight = 0;
  await act(() => result.current.revealEditor());
  await flushFrame();
  expect(scrollTo).not.toHaveBeenCalled();
  bounds.listHeight = 200;
  await act(() => result.current.revealEditor());
  await flushFrame();
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 1108, animated: true });
});

it.each(['switch', 'close', 'scroll', 'unmount'] as const)(
  'fences late editor measurements after %s',
  async (action) => {
    const { result, measureEditor, scrollTo, rerender, unmount } =
      await setup();
    let finish:
      | ((x: number, y: number, width: number, height: number) => void)
      | undefined;
    measureEditor.mockImplementation((callback) => {
      finish = callback;
    });
    await act(() => result.current.revealEditor());
    await flushFrame();
    if (action === 'switch') await rerender({ id: 'other-attempt' });
    else if (action === 'close') await rerender({ id: null });
    else if (action === 'scroll')
      await act(() => {
        result.current.cancelReveal();
        result.current.onScrollOffsetChange(1000);
      });
    else await unmount();
    await act(() => finish!(0, 400, 340, 132));
    expect(scrollTo).not.toHaveBeenCalled();
  },
);

it('cleans up listeners and ignores focus/layout without an active editor', async () => {
  const { result, listeners, scrollTo, rerender, remove, unmount } =
    await setup();
  await act(() => listeners.get('keyboardWillShow')!());
  expect(result.current.keyboardVisible).toBe(true);
  await act(() => listeners.get('keyboardDidHide')!());
  expect(result.current.keyboardVisible).toBe(false);
  await rerender({ id: null });
  await act(() => {
    result.current.revealEditor();
    result.current.onViewportLayout(layout(200));
    listeners.get('keyboardDidShow')!();
  });
  expect(scrollTo).not.toHaveBeenCalled();
  expect(result.current.keyboardVisible).toBe(false);
  await unmount();
  expect(remove).toHaveBeenCalledTimes(4);
  expect(frames.size).toBe(0);
});

it('resets the old day offset when a new list mounts at the top', async () => {
  const { result, bounds, scrollTo } = await setup(true);
  const nextList = result.current.scrollRef.current;
  await act(() => result.current.attachScrollView(null));
  await act(() => result.current.attachScrollView(nextList));
  bounds.editorTop = 400;
  await act(() => result.current.revealEditor());
  await flushFrame();
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 164, animated: false });
});

it('supports browser keyboard adapters without native metrics or visibility APIs', async () => {
  const metrics = Object.getOwnPropertyDescriptor(Keyboard, 'metrics');
  const visible = Object.getOwnPropertyDescriptor(Keyboard, 'isVisible');
  Object.defineProperty(Keyboard, 'metrics', {
    configurable: true,
    value: undefined,
  });
  Object.defineProperty(Keyboard, 'isVisible', {
    configurable: true,
    value: undefined,
  });
  try {
    const hook = await renderHook(() =>
      useDayReflectionKeyboard('attempt', true),
    );
    const scrollTo = jest.fn();
    hook.result.current.scrollRef.current = {
      scrollTo,
      measureInWindow: (
        callback: (x: number, y: number, width: number, height: number) => void,
      ) => callback(0, 180, 390, 200),
    } as unknown as ScrollViewInstance;
    hook.result.current.editorRef.current = {
      measureInWindow: (
        callback: (x: number, y: number, width: number, height: number) => void,
      ) => callback(0, 400, 340, 132),
    } as unknown as ViewInstance;
    await act(() => hook.result.current.revealEditor());
    await flushFrame();
    expect(scrollTo).toHaveBeenCalledWith({ y: 164, animated: false });
    expect(hook.result.current.keyboardVisible).toBe(false);
    await hook.unmount();
  } finally {
    if (metrics) Object.defineProperty(Keyboard, 'metrics', metrics);
    else Reflect.deleteProperty(Keyboard, 'metrics');
    if (visible) Object.defineProperty(Keyboard, 'isVisible', visible);
    else Reflect.deleteProperty(Keyboard, 'isVisible');
  }
});

it('coalesces focus, viewport and keyboard notifications into one post-layout measurement', async () => {
  const { result, listeners, measureEditor, scrollTo } = await setup(true);
  await act(() => {
    result.current.revealEditor();
    result.current.onViewportLayout(layout(200));
    listeners.get('keyboardWillShow')!();
    listeners.get('keyboardDidShow')!();
  });
  expect(frames.size).toBe(1);
  expect(measureEditor).not.toHaveBeenCalled();
  await flushFrame();
  expect(measureEditor).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenCalledWith({ y: 1064, animated: false });
});

it('does not discard a pending reveal for an unchanged scroll-end offset', async () => {
  const { result, measureEditor, scrollTo } = await setup(true);
  let finish:
    ((x: number, y: number, width: number, height: number) => void) | undefined;
  measureEditor.mockImplementation((callback) => {
    finish = callback;
  });
  await act(() => result.current.revealEditor());
  await flushFrame();
  await act(() => result.current.onScrollOffsetChange(900));
  expect(frames.size).toBe(0);
  await act(() => finish!(0, 400, 340, 132));
  expect(scrollTo).toHaveBeenCalledWith({ y: 1064, animated: false });
});

it('retries pending geometry after automatic focus scrolling without starting a scroll loop', async () => {
  const { result, bounds, measureEditor, scrollTo } = await setup(true);
  const finishes: Array<
    (x: number, y: number, width: number, height: number) => void
  > = [];
  measureEditor.mockImplementation((callback) => {
    finishes.push(callback);
  });
  await act(() => result.current.revealEditor());
  await flushFrame();
  expect(finishes).toHaveLength(1);
  await act(() => {
    result.current.onScrollOffsetChange(950);
    result.current.onScrollOffsetChange(960);
    bounds.editorTop = 340;
  });
  expect(frames.size).toBe(1);
  await act(() => finishes[0]!(0, 400, 340, 132));
  expect(scrollTo).not.toHaveBeenCalled();
  await flushFrame();
  expect(finishes).toHaveLength(2);
  await act(() => finishes[1]!(0, bounds.editorTop, 340, 132));
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(scrollTo).toHaveBeenCalledWith({ y: 1064, animated: false });
  await act(() => {
    result.current.onScrollOffsetChange(1064);
    result.current.onScrollOffsetChange(1000);
  });
  expect(frames.size).toBe(0);
  expect(scrollTo).toHaveBeenCalledTimes(1);
});

it('relinquishes a queued reveal for explicit user scrolling and can reveal again on refocus', async () => {
  const { result, scrollTo } = await setup(true);
  await act(() => result.current.revealEditor());
  expect(frames.size).toBe(1);
  await act(() => {
    result.current.cancelReveal();
    result.current.onScrollOffsetChange(850);
  });
  expect(frames.size).toBe(0);
  expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
  await flushFrame();
  expect(scrollTo).not.toHaveBeenCalled();
  await act(() => result.current.revealEditor());
  await flushFrame();
  expect(scrollTo).toHaveBeenCalledWith({ y: 1014, animated: false });
});

it('cancels its queued frame when the editor unmounts', async () => {
  const { result, scrollTo, unmount } = await setup();
  await act(() => result.current.revealEditor());
  expect(frames.size).toBe(1);
  await unmount();
  expect(frames.size).toBe(0);
  expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
  await flushFrame();
  expect(scrollTo).not.toHaveBeenCalled();
});
