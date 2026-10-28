import {
  act,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import { type PropsWithChildren } from 'react';
import { Animated } from 'react-native';
import { SettingsHapticsRow } from './SettingsHapticsRow';
import { MotionContext } from '../../platform/motion/motion';
jest.mock('expo-router', () => ({
  Link: ({ children }: PropsWithChildren) => children,
}));
import {
  HapticsPreferencesProvider,
  hapticsPreferenceKey,
  type HapticsStorage,
} from '../../platform/haptics/HapticsPreferencesProvider';
import {
  useHapticPreferences,
  type HapticAdapter,
} from '../../platform/haptics/haptics';

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
function memory(initial: string | null = null) {
  let value = initial;
  return {
    getItem: jest.fn(async () => value),
    setItem: jest.fn(async (_key: string, next: string) => {
      value = next;
    }),
  };
}
function setup(
  storage: HapticsStorage = memory(),
  available = true,
  reduceMotion = false,
) {
  const adapter = {
    isAvailable: () => available,
    playPreset: jest.fn(),
    stop: jest.fn(),
    play: jest
      .fn<
        ReturnType<HapticAdapter['play']>,
        Parameters<HapticAdapter['play']>
      >()
      .mockResolvedValue(undefined),
  };
  function wrapper({ children }: PropsWithChildren) {
    return (
      <HapticsPreferencesProvider storage={storage} adapter={adapter}>
        <MotionContext.Provider
          value={{
            reduceMotion,
            systemReduced: false,
            loading: false,
            saving: false,
            error: null,
            setReduced: async () => {},
          }}
        >
          {children}
        </MotionContext.Provider>
      </HapticsPreferencesProvider>
    );
  }
  return { adapter, wrapper, storage };
}

it.each([
  [null, true],
  ['true', true],
  ['false', false],
  ['{"wrong":true}', false],
] as const)(
  'loads only a valid installation preference %s',
  async (initial, enabled) => {
    const { wrapper, storage } = setup(memory(initial));
    const screen = await render(<SettingsHapticsRow />, { wrapper });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Haptics' })).toBeEnabled(),
    );
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
      enabled,
    );
    expect(storage.getItem).toHaveBeenCalledWith(hapticsPreferenceKey);
  },
);
it('waits for slow hydration and ignores early feedback and toggles', async () => {
  const read = deferred<string | null>();
  const { wrapper, adapter, storage } = setup({
    getItem: () => read.promise,
    setItem: jest.fn(async () => {}),
  });
  const hook = await renderHook(useHapticPreferences, { wrapper });
  expect(hook.result.current.loading).toBe(true);
  await act(() => hook.result.current.feedback('accept'));
  await act(async () => hook.result.current.setEnabled(false));
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(adapter.play).not.toHaveBeenCalled();
  await act(async () => read.resolve('false'));
  expect(hook.result.current.enabled).toBe(false);
  await act(() => hook.result.current.feedback('completed'));
  expect(adapter.play).not.toHaveBeenCalled();
});
it('saves off and restores it after remount, without playing on hydration', async () => {
  const storage = memory();
  const { wrapper, adapter } = setup(storage);
  const screen = await render(<SettingsHapticsRow />, { wrapper });
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  await fireEvent.press(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
      false,
    ),
  );
  expect(storage.setItem).toHaveBeenCalledWith(hapticsPreferenceKey, 'false');
  await screen.unmount();
  const fresh = await render(<SettingsHapticsRow />, { wrapper });
  await waitFor(() => expect(fresh.getByRole('switch')).toBeEnabled());
  expect(fresh.getByRole('switch').props.accessibilityState.checked).toBe(
    false,
  );
  expect(adapter.play).not.toHaveBeenCalled();
});

it('keeps the haptics control static when the effective motion preference is reduced', async () => {
  const timing = jest.spyOn(Animated, 'timing');
  const { wrapper } = setup(memory('true'), true, true);
  const screen = await render(<SettingsHapticsRow />, { wrapper });
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  await fireEvent.press(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
      false,
    ),
  );
  expect(timing).not.toHaveBeenCalled();
});
it('plays a selection preview only after successfully enabling', async () => {
  const { wrapper, adapter } = setup(memory('false'));
  const hook = await renderHook(useHapticPreferences, { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => hook.result.current.setEnabled(true));
  await waitFor(() => expect(adapter.play).toHaveBeenCalledTimes(1));
  expect(adapter.play.mock.calls[0]![0]).toBe('selection');
  await act(async () => hook.result.current.setEnabled(true));
  expect(adapter.play).toHaveBeenCalledTimes(1);
});
it('blocks duplicate writes and feedback while saving, then fences older events', async () => {
  const write = deferred<void>();
  const { wrapper, adapter, storage } = setup({
    getItem: async () => 'true',
    setItem: jest.fn(() => write.promise),
  });
  const hook = await renderHook(useHapticPreferences, { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await act(async () => hook.result.current.feedback('accept'));
  const stillAllowed = adapter.play.mock.calls[0]![1];
  let pending!: Promise<void>;
  await act(() => {
    pending = hook.result.current.setEnabled(false);
  });
  expect(stillAllowed()).toBe(false);
  await act(async () => hook.result.current.setEnabled(false));
  await act(async () => hook.result.current.feedback('completed'));
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  expect(adapter.play).toHaveBeenCalledTimes(1);
  await act(async () => {
    write.resolve();
    await pending;
  });
  expect(hook.result.current.enabled).toBe(false);
  expect(stillAllowed()).toBe(false);
});
it('contains native promise and synchronous failures without changing the preference', async () => {
  const { wrapper, adapter } = setup();
  const hook = await renderHook(useHapticPreferences, { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  adapter.play.mockRejectedValueOnce(new Error('unavailable'));
  await act(async () => hook.result.current.feedback('completed'));
  adapter.play.mockImplementationOnce(() => {
    throw new Error('native unavailable');
  });
  await act(async () => hook.result.current.feedback('accept'));
  expect(hook.result.current.enabled).toBe(true);
  expect(hook.result.current.error).toBeNull();
});
it('contains read/write failures and leaves retry usable with red feedback', async () => {
  const storage = memory('false');
  storage.getItem.mockRejectedValueOnce(new Error('read'));
  storage.setItem.mockRejectedValueOnce(new Error('write'));
  const { wrapper, adapter } = setup(storage);
  const screen = await render(<SettingsHapticsRow />, { wrapper });
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your haptics preference couldn’t load. Try saving it again.',
    ),
  );
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    false,
  );
  await fireEvent.press(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your haptics preference couldn’t save. Please try again.',
    ),
  );
  expect(screen.getByRole('alert').props.style).toMatchObject({
    color: '#8B1E32',
  });
  expect(screen.getByRole('switch')).toBeEnabled();
  expect(adapter.play).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
      true,
    ),
  );
  expect(screen.queryByRole('alert')).toBeNull();
});
it('keeps the preference usable without a native module and clearly explains availability', async () => {
  const { wrapper, adapter } = setup(memory(), false);
  const screen = await render(<SettingsHapticsRow />, { wrapper });
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  expect(screen.getByText(/Touch feedback needs an updated/)).toBeTruthy();
  await fireEvent.press(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
      false,
    ),
  );
  expect(adapter.play).not.toHaveBeenCalled();
});
it('fences delayed reads, feedback and callbacks after unmount', async () => {
  const read = deferred<string | null>();
  const { wrapper, adapter, storage } = setup({
    getItem: () => read.promise,
    setItem: jest.fn(async () => {}),
  });
  const hook = await renderHook(useHapticPreferences, { wrapper });
  const old = hook.result.current;
  await hook.unmount();
  await act(async () => read.resolve('true'));
  await old.setEnabled(true);
  old.feedback('completed');
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(adapter.play).not.toHaveBeenCalled();
});
it('ignores a late write after unmount and does not play its preview', async () => {
  const write = deferred<void>();
  const { wrapper, adapter } = setup({
    getItem: async () => 'false',
    setItem: () => write.promise,
  });
  const hook = await renderHook(useHapticPreferences, { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  let pending!: Promise<void>;
  await act(() => {
    pending = hook.result.current.setEnabled(true);
  });
  await hook.unmount();
  await act(async () => {
    write.resolve();
    await pending;
  });
  expect(adapter.play).not.toHaveBeenCalled();
});
