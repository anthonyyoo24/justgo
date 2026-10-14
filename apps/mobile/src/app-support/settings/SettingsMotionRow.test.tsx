import {
  act,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Switch,
  Text,
  type AppStateStatus,
} from 'react-native';
import { SettingsMotionRow } from './SettingsMotionRow';
import { SettingsHapticsRow } from './SettingsHapticsRow';
import { HapticsPreferencesProvider } from '../../platform/haptics/HapticsPreferencesProvider';
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
import { useProgressShimmer } from '../../features/progress/calendar/ProgressSkeleton';
import {
  MotionPreferencesProvider,
  motionPreferenceKey,
  type MotionStorage,
} from '../../platform/motion/MotionPreferencesProvider';
import {
  useMotionPreferences,
  useReduceMotion,
} from '../../platform/motion/motion';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function memoryStorage(initial: string | null = null) {
  let saved = initial;
  return {
    getItem: jest.fn(async () => saved),
    setItem: jest.fn(async (_key: string, value: string) => {
      saved = value;
    }),
  };
}
function mount(storage: MotionStorage) {
  return render(
    <MotionPreferencesProvider storage={storage}>
      <SettingsMotionRow />
    </MotionPreferencesProvider>,
  );
}

let changeMotion!: (value: boolean) => void;
let changeAppState!: (state: AppStateStatus) => void;
let removeMotion: jest.Mock;
let removeForeground: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  removeMotion = jest.fn();
  removeForeground = jest.fn();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockImplementation((name, callback) => {
      expect(name).toBe('reduceMotionChanged');
      changeMotion = callback as unknown as (value: boolean) => void;
      return { remove: removeMotion } as unknown as ReturnType<
        typeof AccessibilityInfo.addEventListener
      >;
    });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((name, callback) => {
      expect(name).toBe('change');
      changeAppState = callback;
      return { remove: removeForeground };
    });
});
afterEach(() => jest.restoreAllMocks());

it('animates both app-choice directions without delaying reduced motion elsewhere, while phone settings stop movement', async () => {
  const stop = jest.fn();
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop,
    reset: jest.fn(),
  });
  function MotionObserver() {
    const reduced = useReduceMotion();
    return <Text>{reduced ? 'App motion reduced' : 'App motion enabled'}</Text>;
  }
  const storage = memoryStorage('false');
  const screen = render(
    <MotionPreferencesProvider storage={storage}>
      <SettingsMotionRow />
      <MotionObserver />
    </MotionPreferencesProvider>,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  timing.mockClear();

  fireEvent.press(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByText('App motion reduced')).toBeTruthy(),
  );
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
  expect(timing.mock.calls.map(([, config]) => config.toValue)).toEqual([1]);

  // The app preference applies while this test keeps the local animation open.
  // A phone-level preference must cancel even that small control animation.
  stop.mockClear();
  act(() => changeMotion(true));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('switch')).toBeDisabled();
  expect(screen.getByText('App motion reduced')).toBeTruthy();
  expect(timing).toHaveBeenCalledTimes(1);

  act(() => changeMotion(false));
  expect(screen.getByRole('switch')).toBeEnabled();
  expect(screen.getByText('App motion reduced')).toBeTruthy();
  fireEvent.press(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByText('App motion enabled')).toBeTruthy(),
  );
  expect(timing.mock.calls.map(([, config]) => config.toValue)).toEqual([1, 0]);
  expect(storage.setItem.mock.calls).toEqual([
    [motionPreferenceKey, 'true'],
    [motionPreferenceKey, 'false'],
  ]);
});

it('keeps Reduce Motion quiet while Haptics is off and uses only the controlled adapter when on', async () => {
  const motionStorage = memoryStorage('false');
  const hapticsStorage = memoryStorage('false');
  const adapter = {
    isAvailable: () => true,
    play: jest.fn(async () => {}),
    playPreset: jest.fn(),
    stop: jest.fn(),
  };
  const screen = render(
    <MotionPreferencesProvider storage={motionStorage}>
      <HapticsPreferencesProvider storage={hapticsStorage} adapter={adapter}>
        <SettingsHapticsRow />
        <SettingsMotionRow />
      </HapticsPreferencesProvider>
    </MotionPreferencesProvider>,
  );
  await waitFor(() => {
    expect(screen.getByRole('switch', { name: 'Haptics' })).toBeEnabled();
    expect(screen.getByRole('switch', { name: 'Reduce motion' })).toBeEnabled();
  });
  // Neither setting may retain an interactive UIKit switch outside our gate.
  expect(screen.UNSAFE_queryAllByType(Switch)).toHaveLength(0);
  fireEvent.press(screen.getByRole('switch', { name: 'Reduce motion' }));
  await waitFor(() =>
    expect(
      screen.getByRole('switch', { name: 'Reduce motion' }).props
        .accessibilityState.checked,
    ).toBe(true),
  );
  expect(adapter.play).not.toHaveBeenCalled();
  expect(adapter.playPreset).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('switch', { name: 'Haptics' }));
  await waitFor(() => expect(adapter.play).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByRole('switch', { name: 'Reduce motion' }));
  await waitFor(() => expect(adapter.play).toHaveBeenCalledTimes(2));
  expect(
    screen.getByRole('switch', { name: 'Reduce motion' }).props
      .accessibilityState.checked,
  ).toBe(false);
  fireEvent.press(screen.getByRole('switch', { name: 'Haptics' }));
  await waitFor(() =>
    expect(
      screen.getByRole('switch', { name: 'Haptics' }).props.accessibilityState
        .checked,
    ).toBe(false),
  );
  fireEvent.press(screen.getByRole('switch', { name: 'Reduce motion' }));
  await waitFor(() =>
    expect(
      screen.getByRole('switch', { name: 'Reduce motion' }).props
        .accessibilityState.checked,
    ).toBe(true),
  );
  expect(adapter.play).toHaveBeenCalledTimes(2);
  expect(adapter.playPreset).not.toHaveBeenCalled();
});

it('requires the app-level provider', () => {
  expect(() => renderHook(useMotionPreferences)).toThrow(
    'MotionPreferencesProvider is required',
  );
});

it.each([
  [null, false],
  ['false', false],
  ['true', true],
  ['{"unexpected":true}', false],
] as const)(
  'validates stored choice %s and exposes a usable unpaid switch',
  async (saved, reduced) => {
    const screen = mount(memoryStorage(saved));
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
      reduced,
    );
  },
);

it('keeps motion reduced and input disabled until slow hydration finishes', async () => {
  const read = deferred<string | null>();
  const storage = memoryStorage();
  storage.getItem.mockReturnValue(read.promise);
  const screen = mount(storage);
  await act(async () => {});
  const toggle = screen.getByRole('switch');
  expect(toggle).toBeDisabled();
  expect(toggle.props.accessibilityState.checked).toBe(true);
  fireEvent.press(toggle);
  expect(storage.setItem).not.toHaveBeenCalled();
  await act(async () => read.resolve('true'));
  expect(screen.getByRole('switch')).toBeEnabled();
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
});

it('saves both choices and restores them after the provider remounts', async () => {
  const storage = memoryStorage();
  let screen = mount(storage);
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
      true,
    ),
  );
  screen.unmount();
  screen = mount(storage);
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
  fireEvent.press(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
      false,
    ),
  );
  screen.unmount();
  screen = mount(storage);
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    false,
  );
  expect(storage.setItem.mock.calls).toEqual([
    [motionPreferenceKey, 'true'],
    [motionPreferenceKey, 'false'],
  ]);
});

it('honors live phone changes without replacing the saved app choice', async () => {
  const storage = memoryStorage('true');
  const screen = mount(storage);
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  act(() => changeMotion(true));
  expect(screen.getByRole('switch')).toBeDisabled();
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
  expect(
    screen.getByText('Enabled by your phone’s accessibility setting.'),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole('switch'));
  expect(storage.setItem).not.toHaveBeenCalled();
  act(() => changeMotion(false));
  expect(screen.getByRole('switch')).toBeEnabled();
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
});

it('does not let a late initial phone read overwrite a newer accessibility event', async () => {
  const read = deferred<boolean>();
  jest
    .mocked(AccessibilityInfo.isReduceMotionEnabled)
    .mockReturnValue(read.promise);
  const screen = mount(memoryStorage());
  act(() => changeMotion(true));
  await act(async () => read.resolve(false));
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
  expect(screen.getByRole('switch')).toBeDisabled();
});

it('uses the phone preference on startup even when the saved app choice is off', async () => {
  jest.mocked(AccessibilityInfo.isReduceMotionEnabled).mockResolvedValue(true);
  const screen = mount(memoryStorage('false'));
  await waitFor(() =>
    expect(
      screen.getByText('Enabled by your phone’s accessibility setting.'),
    ).toBeTruthy(),
  );
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
  expect(screen.getByRole('switch')).toBeDisabled();
  act(() => changeMotion(false));
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    false,
  );
});

it('refreshes on foreground and ignores stale overlapping phone reads', async () => {
  const older = deferred<boolean>();
  const latest = deferred<boolean>();
  const read = jest.mocked(AccessibilityInfo.isReduceMotionEnabled);
  const screen = mount(memoryStorage());
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  read.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise);
  act(() => {
    changeAppState('background');
    changeAppState('active');
    changeAppState('active');
  });
  await act(async () => latest.resolve(true));
  await act(async () => older.resolve(false));
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
  expect(read).toHaveBeenCalledTimes(3);
});

it('shows safe read failure feedback and allows a successful replacement choice', async () => {
  const storage = memoryStorage();
  storage.getItem.mockRejectedValue(new Error('private adapter detail'));
  const screen = mount(storage);
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  expect(screen.getByRole('alert').props.children).toBe(
    'Your motion preference couldn’t load. Try saving it again.',
  );
  fireEvent.press(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
      true,
    ),
  );
  expect(screen.queryByRole('alert')).toBeNull();
});

it('preserves the prior choice on failed save and supports retry', async () => {
  const storage = memoryStorage();
  storage.setItem.mockRejectedValueOnce(new Error('private adapter detail'));
  const screen = mount(storage);
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    false,
  );
  expect(screen.getByRole('switch')).toBeEnabled();
  expect(screen.queryByText(/private adapter/)).toBeNull();
  fireEvent.press(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
      true,
    ),
  );
  expect(screen.queryByRole('alert')).toBeNull();
});

it('blocks duplicate writes while saving and keeps a newer phone preference', async () => {
  const write = deferred<void>();
  const storage = memoryStorage();
  storage.setItem.mockReturnValue(write.promise);
  const screen = mount(storage);
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  fireEvent.press(screen.getByRole('switch'));
  expect(screen.getByRole('switch')).toBeDisabled();
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  act(() => changeMotion(true));
  await act(async () => write.resolve());
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
  expect(screen.getByRole('switch')).toBeDisabled();
});

it('keeps motion reduced if the phone setting cannot be read, then recovers', async () => {
  jest
    .mocked(AccessibilityInfo.isReduceMotionEnabled)
    .mockRejectedValueOnce(new Error('unavailable'));
  const screen = mount(memoryStorage());
  await waitFor(() =>
    expect(
      screen.getByText(
        'Your phone’s setting is unavailable. Motion stays reduced.',
      ),
    ).toBeTruthy(),
  );
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    true,
  );
  act(() => changeAppState('active'));
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    false,
  );
});

it('cleans up listeners and fences delayed reads and writes after unmount', async () => {
  const read = deferred<string | null>();
  const storage = memoryStorage();
  storage.getItem.mockReturnValueOnce(read.promise);
  const first = mount(storage);
  first.unmount();
  await act(async () => read.resolve('true'));
  const write = deferred<void>();
  storage.setItem.mockReturnValueOnce(write.promise);
  const second = mount(storage);
  await waitFor(() => expect(second.getByRole('switch')).toBeEnabled());
  fireEvent.press(second.getByRole('switch'));
  second.unmount();
  await act(async () => write.reject(new Error('unmounted')));
  expect(removeMotion).toHaveBeenCalledTimes(2);
  expect(removeForeground).toHaveBeenCalledTimes(2);
});

it('applies a saved preference to the actual Progress shimmer and stops it on live changes', async () => {
  const start = jest.fn();
  const stop = jest.fn();
  const loop = jest
    .spyOn(Animated, 'loop')
    .mockReturnValue({ start, stop, reset: jest.fn() });
  const storage = memoryStorage();
  const screen = renderHook(
    () => ({
      shimmer: useProgressShimmer(true),
      reduced: useReduceMotion(),
      preferences: useMotionPreferences(),
    }),
    {
      wrapper: ({ children }) => (
        <MotionPreferencesProvider storage={storage}>
          {children}
        </MotionPreferencesProvider>
      ),
    },
  );
  expect(screen.result.current.shimmer).toBeNull();
  await waitFor(() => expect(screen.result.current.reduced).toBe(false));
  expect(loop).toHaveBeenCalledTimes(1);
  await act(async () => screen.result.current.preferences.setReduced(true));
  expect(screen.result.current.shimmer).toBeNull();
  expect(stop).toHaveBeenCalledTimes(1);
  act(() => changeMotion(true));
  expect(screen.result.current.shimmer).toBeNull();
  expect(stop).toHaveBeenCalledTimes(1);
});
