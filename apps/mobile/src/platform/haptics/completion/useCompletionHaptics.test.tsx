import { act, renderHook, waitFor } from '@testing-library/react-native';
import { type PropsWithChildren } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { HapticsPreferencesProvider } from '../HapticsPreferencesProvider';
import { useHapticPreferences } from '../haptics';
import {
  completionHaptics,
  useCompletionHapticsTesting,
} from './completion-haptics';
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
}));

const development = globalThis as typeof globalThis & { __DEV__: boolean };
const originalDevelopment = development.__DEV__;
afterEach(() => {
  development.__DEV__ = originalDevelopment;
  jest.restoreAllMocks();
});
function setup(initial: string | null = null, available = true) {
  const current = {
    isAvailable: () => true,
    play: jest
      .fn<Promise<void>, [string, () => boolean]>()
      .mockResolvedValue(undefined),
  };
  const pulsar = {
    isAvailable: jest.fn(() => available),
    play: jest.fn<void, [string]>(),
    stop: jest.fn(),
  };
  const storage = {
    getItem: async () => initial,
    setItem: jest.fn(async () => {}),
  };
  let lifecycle!: (next: AppStateStatus) => void;
  const remove = jest.fn();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      lifecycle = callback;
      return { remove };
    });
  const wrapper = ({ children }: PropsWithChildren) => (
    <HapticsPreferencesProvider
      adapter={current}
      completionAdapter={pulsar}
      storage={storage}
    >
      {children}
    </HapticsPreferencesProvider>
  );
  const hook = renderHook(
    () => ({
      preferences: useHapticPreferences(),
      testing: useCompletionHapticsTesting(),
    }),
    { wrapper },
  );
  return {
    ...hook,
    current,
    pulsar,
    storage,
    lifecycle: (next: AppStateStatus) => lifecycle(next),
    remove,
  };
}
async function ready(hook: ReturnType<typeof setup>) {
  await waitFor(() =>
    expect(hook.result.current.preferences.loading).toBe(false),
  );
}

it.each(completionHaptics.filter(({ id }) => id !== 'current'))(
  'uses $label for preview and accepted completion, leaving other actions alone',
  async ({ id }) => {
    const hook = setup();
    await ready(hook);
    act(() => hook.result.current.testing.select(id));
    expect(hook.pulsar.play).not.toHaveBeenCalled();
    await act(async () => hook.result.current.testing.preview());
    await act(async () =>
      hook.result.current.preferences.feedback('completed'),
    );
    expect(hook.pulsar.play.mock.calls).toEqual([[id], [id]]);
    await act(async () => hook.result.current.preferences.feedback('accept'));
    await act(async () =>
      hook.result.current.preferences.feedback('selection'),
    );
    expect(hook.current.play.mock.calls.map(([kind]) => kind)).toEqual([
      'accept',
      'selection',
    ]);
    expect(hook.storage.setItem).not.toHaveBeenCalled();
  },
);
it('defaults to Batter without a selection and restores it on remount', async () => {
  const hook = setup();
  await ready(hook);
  await act(async () => hook.result.current.testing.preview());
  expect(hook.result.current.testing.selected).toBe('batter');
  expect(hook.pulsar.play).toHaveBeenCalledWith('batter');
  expect(hook.current.play).not.toHaveBeenCalled();
  act(() => hook.result.current.testing.select('barrage'));
  hook.unmount();
  expect(hook.pulsar.stop).toHaveBeenCalled();
  expect(hook.remove).toHaveBeenCalled();
  const fresh = setup();
  await ready(fresh);
  expect(fresh.result.current.testing.selected).toBe('batter');
});
it('respects saved off and stops a native pattern immediately when toggled off', async () => {
  const hook = setup('false');
  await ready(hook);
  act(() => hook.result.current.testing.select('bloom'));
  await act(async () => hook.result.current.testing.preview());
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.pulsar.play).not.toHaveBeenCalled();
  await act(async () => hook.result.current.preferences.setEnabled(true));
  await act(async () => hook.result.current.testing.preview());
  expect(hook.pulsar.play).toHaveBeenCalledTimes(1);
  hook.pulsar.stop.mockClear();
  let finish!: () => void;
  hook.storage.setItem.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  let write!: Promise<void>;
  act(() => {
    write = hook.result.current.preferences.setEnabled(false);
  });
  expect(hook.pulsar.stop).toHaveBeenCalledTimes(1);
  await act(async () => hook.result.current.testing.preview());
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.pulsar.play).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await write;
  });
});
it('keeps old binaries usable with the current completion effect and an honest preview error', async () => {
  const hook = setup(null, false);
  await ready(hook);
  act(() => hook.result.current.testing.select('fizz'));
  await act(async () => hook.result.current.testing.preview());
  expect(hook.result.current.testing.error).toMatch(/Couldn’t play/);
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.current.play).toHaveBeenCalledTimes(1);
  expect(hook.pulsar.play).not.toHaveBeenCalled();
});
it('uses Batter in production and ignores development selection and preview actions', async () => {
  development.__DEV__ = false;
  const hook = setup();
  await ready(hook);
  act(() => hook.result.current.testing.select('fizz'));
  await act(async () => hook.result.current.testing.preview());
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.result.current.testing.selected).toBe('batter');
  expect(hook.current.play).not.toHaveBeenCalled();
  expect(hook.pulsar.play.mock.calls).toEqual([['batter']]);
  expect(hook.result.current.testing.pulsarAvailable).toBe(true);
});
it('keeps a development override out of production completion', async () => {
  const hook = setup();
  await ready(hook);
  act(() => hook.result.current.testing.select('afterglow'));
  development.__DEV__ = false;
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.pulsar.play.mock.calls).toEqual([['batter']]);
});
it('honors saved off and stops playback when disabling the production default', async () => {
  development.__DEV__ = false;
  const hook = setup('false');
  await ready(hook);
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.pulsar.play).not.toHaveBeenCalled();
  await act(async () => hook.result.current.preferences.setEnabled(true));
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.pulsar.play).toHaveBeenCalledWith('batter');
  hook.pulsar.stop.mockClear();
  await act(async () => hook.result.current.preferences.setEnabled(false));
  expect(hook.pulsar.stop).toHaveBeenCalledTimes(1);
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.pulsar.play).toHaveBeenCalledTimes(1);
});
it('retains the safe Expo fallback on a production binary without Pulsar', async () => {
  development.__DEV__ = false;
  const hook = setup(null, false);
  await ready(hook);
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.current.play.mock.calls[0]![0]).toBe('completed');
  expect(hook.pulsar.play).not.toHaveBeenCalled();
});
it('contains native failures, shows red-error state for preview only and allows retry', async () => {
  const hook = setup();
  await ready(hook);
  act(() => hook.result.current.testing.select('triumph'));
  hook.pulsar.play.mockImplementationOnce(() => {
    throw new Error('private detail');
  });
  await act(async () => hook.result.current.testing.preview());
  expect(hook.result.current.testing.error).toBe(
    'Couldn’t play this haptic. Please try again.',
  );
  await act(async () => hook.result.current.testing.preview());
  expect(hook.result.current.testing.error).toBeNull();
  hook.pulsar.play.mockImplementationOnce(() => {
    throw new Error('failure');
  });
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.result.current.preferences.enabled).toBe(true);
  expect(hook.result.current.testing.error).toBeNull();
  hook.pulsar.stop.mockImplementationOnce(() => {
    throw new Error('stop');
  });
  await act(async () => hook.result.current.preferences.setEnabled(false));
  expect(hook.result.current.preferences.enabled).toBe(false);
});
it('blocks duplicate previews and fences a pending Expo burst on stop, choice or background', async () => {
  const hook = setup();
  await ready(hook);
  act(() => hook.result.current.testing.select('current'));
  let finish!: () => void;
  hook.current.play.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.testing.preview();
  });
  expect(hook.result.current.testing.previewing).toBe(true);
  const fence = hook.current.play.mock.calls[0]![1];
  await act(async () => hook.result.current.testing.preview());
  expect(hook.current.play).toHaveBeenCalledTimes(1);
  expect(fence()).toBe(true);
  act(() => hook.result.current.testing.stop());
  expect(fence()).toBe(false);
  act(() => hook.result.current.testing.select('bloom'));
  hook.pulsar.stop.mockClear();
  act(() => hook.lifecycle('active'));
  expect(hook.pulsar.stop).not.toHaveBeenCalled();
  act(() => hook.lifecycle('background'));
  expect(hook.pulsar.stop).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await pending;
  });
  expect(hook.result.current.testing.previewing).toBe(false);
});
it('ignores failed previews from an old choice or an unmounted screen', async () => {
  const hook = setup();
  await ready(hook);
  act(() => hook.result.current.testing.select('current'));
  let fail!: (error: Error) => void;
  hook.current.play.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.testing.preview();
  });
  act(() => hook.result.current.testing.select('bloom'));
  await act(async () => {
    fail(new Error('old'));
    await pending;
  });
  expect(hook.result.current.testing.error).toBeNull();
  act(() => hook.result.current.testing.select('current'));
  hook.current.play.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  act(() => {
    pending = hook.result.current.testing.preview();
  });
  const old = hook.result.current.testing;
  hook.unmount();
  await act(async () => {
    fail(new Error('late'));
    await pending;
  });
  old.select('afterglow');
  await old.preview();
  expect(hook.pulsar.play).not.toHaveBeenCalled();
});
