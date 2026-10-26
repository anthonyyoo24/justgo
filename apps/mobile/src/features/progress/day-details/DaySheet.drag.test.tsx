import { act, fireEvent, render } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import {
  Animated,
  Keyboard,
  PanResponder,
  StyleSheet,
  type GestureResponderEvent,
  type PanResponderCallbacks,
  type PanResponderGestureState,
} from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { ProgressEntry } from '../types';
import { DaySheet } from './DaySheet';

jest.mock('../../../platform/motion/motion', () => ({
  useReduceMotion: () => false,
}));
jest.mock('./entries/useEntryMotion', () =>
  jest.requireActual('./entries/useEntryMotion.ts'),
);

const event = {} as GestureResponderEvent;
const gesture = (dy = 0) => ({ dy, dx: 0, vy: 0 }) as PanResponderGestureState;
const layout = (height: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
});
const entries: ProgressEntry[] = Array.from({ length: 41 }, (_, index) => ({
  attemptId: `synthetic-drag-attempt-${index}`,
  instruction: `Synthetic challenge ${index + 1}`,
  startedAt: '2026-10-10T16:00:00Z',
  timeZone: 'UTC',
  reflectionStatus: 'none',
  feeling: null,
  reflectionText: null,
}));

async function setup(beforeClose?: (work: () => void) => void) {
  let handlers: PanResponderCallbacks = {};
  const createResponder = PanResponder.create.bind(PanResponder);
  jest.spyOn(PanResponder, 'create').mockImplementation((config) => {
    handlers = config;
    return createResponder(config);
  });
  jest
    .spyOn(
      require('react-native') as typeof import('react-native'),
      'useWindowDimensions',
    )
    .mockReturnValue({ width: 390, height: 900, scale: 3, fontScale: 1 });
  jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
  const exits: { from: number; finish: () => void }[] = [];
  jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({
    start: (callback?: (result: { finished: boolean }) => void) => {
      const animated = value as Animated.Value;
      const finish = () => {
        animated.setValue(config.toValue as number);
        callback?.({ finished: true });
      };
      if (config.duration === 220) {
        let from = 0;
        animated.stopAnimation((position) => {
          from = position;
        });
        exits.push({ from, finish });
      } else finish();
    },
    stop: jest.fn(),
    reset: jest.fn(),
  }));
  const onClose = jest.fn();
  const props: ComponentProps<typeof DaySheet> = {
    date: '2026-10-10',
    day: { date: '2026-10-10', totalReps: 41, entries },
    loading: false,
    error: false,
    loadMoreError: false,
    hasMore: false,
    loadingMore: false,
    fetching: false,
    onClose,
    onEditReflection: () => {},
    beforeClose,
  };
  const sheet = (overrides: Partial<typeof props> = {}) => (
    <SafeAreaInsetsContext.Provider
      value={{ top: 40, bottom: 20, left: 0, right: 0 }}
    >
      <DaySheet {...props} {...overrides} />
    </SafeAreaInsetsContext.Provider>
  );
  const screen = await render(sheet());
  await fireEvent(screen.getByTestId('day-sheet-panel'), 'layout', layout(360));
  await fireEvent(screen.getByTestId('day-sheet-space'), 'layout', layout(860));
  await fireEvent(
    screen.getByTestId('day-sheet-header'),
    'layout',
    layout(140),
  );
  await fireEvent(screen.getByRole('button', { name: /Rep 1\./ }), 'layout', {
    nativeEvent: { layout: { x: 0, y: 13, width: 320, height: 75 } },
  });
  await fireEvent(
    screen.getByTestId('day-sheet-entry-list'),
    'layout',
    layout(500),
  );
  await fireEvent(
    screen.getByTestId('day-sheet-entry-list'),
    'contentSizeChange',
    390,
    1000,
  );
  const panelHeight = () =>
    StyleSheet.flatten(screen.getByTestId('day-sheet-size').props.style)
      .height as number;
  const panelTop = () => {
    const offset = StyleSheet.flatten(
      screen.getByTestId('day-sheet-panel').props.style,
    ).transform[0].translateY as number;
    return 900 - 20 - panelHeight() + offset;
  };
  const beginDrag = async (dy: number) =>
    act(() => {
      handlers.onPanResponderGrant?.(event, gesture());
      handlers.onPanResponderMove?.(event, gesture(dy));
    });
  const releaseDrag = async (dy: number) =>
    act(() => handlers.onPanResponderRelease?.(event, gesture(dy)));
  const cleanup = async () => screen.unmount();
  return {
    screen,
    exits,
    onClose,
    panelHeight,
    panelTop,
    beginDrag,
    releaseDrag,
    rerender: (overrides: Partial<typeof props>) =>
      screen.rerender(sheet(overrides)),
    cleanup,
  };
}

afterEach(() => jest.restoreAllMocks());

it.each([
  ['offline', { day: undefined, connectionRequired: true }, 450],
  ['loading', { day: undefined, loading: true }, 340],
  ['initial error', { day: undefined, error: true }, 450],
  ['offline with retained day data', { connectionRequired: true }, 450],
] satisfies [string, Partial<ComponentProps<typeof DaySheet>>, number][])(
  'forgets list measurements when the same date becomes %s and measures restored entries afresh',
  async (_state, overrides, fallbackHeight) => {
    const t = await setup();
    expect(t.panelHeight()).toBe(580);
    await t.rerender(overrides);
    expect(t.screen.queryByTestId('day-sheet-entry-list')).toBeNull();
    expect(t.panelHeight()).toBe(fallbackHeight);
    await t.beginDrag(2000);
    await t.releaseDrag(2000);
    expect(t.panelHeight()).toBe(340);

    await t.rerender({
      day: { date: '2026-10-10', totalReps: 3, entries: entries.slice(0, 3) },
    });
    await fireEvent(
      t.screen.getByRole('button', { name: /Rep 1\./ }),
      'layout',
      { nativeEvent: { layout: { x: 0, y: 13, width: 320, height: 75 } } },
    );
    await fireEvent(
      t.screen.getByTestId('day-sheet-entry-list'),
      'contentSizeChange',
      390,
      300,
    );
    await fireEvent(
      t.screen.getByRole('adjustable', { name: 'Resize day details' }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } },
    );
    expect(t.panelHeight()).toBe(452);
    expect(t.screen.getAllByRole('button', { name: /Rep \d+\./ })).toHaveLength(
      3,
    );
    expect(t.onClose).not.toHaveBeenCalled();
    await t.cleanup();
  },
);

it.each(['default', 'expanded'] as const)(
  'resizes from the %s height and keeps the released height without requesting dismissal',
  async (position) => {
    const guard = jest.fn((work: () => void) => work());
    const t = await setup(guard);
    if (position === 'expanded')
      await fireEvent(
        t.screen.getByRole('adjustable', { name: 'Resize day details' }),
        'accessibilityAction',
        { nativeEvent: { actionName: 'activate' } },
      );
    const initialHeight = t.panelHeight();
    await t.beginDrag(120);
    expect(t.panelHeight()).toBe(initialHeight - 120);
    await t.releaseDrag(120);
    expect(t.panelHeight()).toBe(initialHeight - 120);
    await t.beginDrag(2000);
    const minimumHeight = t.panelHeight();
    expect(minimumHeight).toBeGreaterThan(140);
    expect(minimumHeight).toBeLessThan(initialHeight - 120);
    await t.releaseDrag(2000);
    expect(t.panelHeight()).toBe(minimumHeight);
    expect(guard).not.toHaveBeenCalled();
    expect(t.exits).toHaveLength(0);
    expect(t.onClose).not.toHaveBeenCalled();
    expect(t.screen.getAllByRole('button', { name: /Rep \d+\./ })).toHaveLength(
      8,
    );
    await t.cleanup();
  },
);

it.each(['overlay', 'X'] as const)(
  'preserves the dirty-close guard for the %s after resizing',
  async (control) => {
    let authorize: (() => void) | undefined;
    const guard = jest.fn((work: () => void) => {
      authorize = work;
    });
    const t = await setup(guard);
    await t.beginDrag(120);
    await t.releaseDrag(120);
    const resizedTop = t.panelTop();
    const target =
      control === 'overlay'
        ? t.screen.getByTestId('day-sheet-backdrop')
        : t.screen.getAllByRole('button', { name: 'Close day details' })[1]!;
    await fireEvent.press(target);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(t.exits).toHaveLength(0);
    expect(t.panelTop()).toBe(resizedTop);
    expect(t.onClose).not.toHaveBeenCalled();
    expect(authorize).toBeDefined();
    await act(() => authorize!());
    expect(t.exits).toHaveLength(1);
    expect(t.exits[0]!.from).toBe(0);
    expect(t.panelTop()).toBe(resizedTop);
    await act(() => t.exits[0]!.finish());
    expect(t.onClose).toHaveBeenCalledTimes(1);
    await t.cleanup();
  },
);

it('sets the drag floor from the complete first summary row and its padding', async () => {
  const t = await setup();
  const first = t.screen.getByRole('button', { name: /Rep 1\./ });
  await fireEvent(first, 'layout', {
    nativeEvent: { layout: { x: 0, y: 13, width: 320, height: 64 } },
  });
  await t.beginDrag(2000);
  await t.releaseDrag(2000);
  expect(t.panelHeight()).toBe(140 + 12 + 13 + 64 + 12);
  await fireEvent(first, 'layout', {
    nativeEvent: { layout: { x: 0, y: 13, width: 250, height: 108 } },
  });
  expect(t.panelHeight()).toBe(140 + 12 + 13 + 108 + 12);
  expect(t.onClose).not.toHaveBeenCalled();
  await t.cleanup();
});

it('connects accessible resizing to expansion and minimum height without closing', async () => {
  const guard = jest.fn((work: () => void) => work());
  const t = await setup(guard);
  const handle = () =>
    t.screen.getByRole('adjustable', { name: 'Resize day details' });
  const compactTop = t.panelTop();
  expect(handle().props.accessibilityState.expanded).toBe(false);
  await fireEvent(handle(), 'accessibilityAction', {
    nativeEvent: { actionName: 'activate' },
  });
  const expandedTop = t.panelTop();
  expect(expandedTop).toBeLessThan(compactTop);
  expect(handle().props.accessibilityState.expanded).toBe(true);
  await fireEvent(handle(), 'accessibilityAction', {
    nativeEvent: { actionName: 'decrement' },
  });
  const minimumTop = t.panelTop();
  expect(minimumTop).toBeGreaterThanOrEqual(compactTop);
  expect(handle().props.accessibilityState.expanded).toBe(false);
  expect(guard).not.toHaveBeenCalled();
  await fireEvent(handle(), 'accessibilityAction', {
    nativeEvent: { actionName: 'increment' },
  });
  expect(t.panelTop()).toBe(expandedTop);
  await fireEvent(handle(), 'accessibilityAction', {
    nativeEvent: { actionName: 'activate' },
  });
  expect(t.panelTop()).toBe(minimumTop);
  await fireEvent(handle(), 'accessibilityAction', {
    nativeEvent: { actionName: 'decrement' },
  });
  expect(t.panelTop()).toBe(minimumTop);
  expect(guard).not.toHaveBeenCalled();
  expect(t.exits).toHaveLength(0);
  expect(t.onClose).not.toHaveBeenCalled();
  await t.cleanup();
});

it('toggles the native adjustable handle on repeated taps without dismissing the sheet', async () => {
  const t = await setup();
  const handle = () =>
    t.screen.getByRole('adjustable', { name: 'Resize day details' });
  const compactTop = t.panelTop();
  await t.beginDrag(0);
  await t.releaseDrag(0);
  expect(t.panelTop()).toBeLessThan(compactTop);
  expect(handle().props.accessibilityState.expanded).toBe(true);
  await t.beginDrag(0);
  await t.releaseDrag(0);
  expect(t.panelTop()).toBeGreaterThanOrEqual(compactTop);
  expect(handle().props.accessibilityState.expanded).toBe(false);
  expect(t.onClose).not.toHaveBeenCalled();
  expect(t.exits).toHaveLength(0);
  await t.cleanup();
});
