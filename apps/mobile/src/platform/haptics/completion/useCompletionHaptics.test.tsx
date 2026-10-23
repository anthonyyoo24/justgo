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
async function setup(initial: string | null = null, available = true) {
  const adapter = {
    isAvailable: jest.fn(() => available),
    play: jest
      .fn<Promise<void>, [string, () => boolean]>()
      .mockResolvedValue(undefined),
    playPreset: jest.fn<void, [string]>(),
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
    <HapticsPreferencesProvider adapter={adapter} storage={storage}>
      {children}
    </HapticsPreferencesProvider>
  );
  const hook = await renderHook(
    () => ({
      preferences: useHapticPreferences(),
      testing: useCompletionHapticsTesting(),
    }),
    { wrapper },
  );
  return {
    ...hook,
    adapter,
    storage,
    lifecycle: (next: AppStateStatus) => lifecycle(next),
    remove,
  };
}
async function ready(hook: Awaited<ReturnType<typeof setup>>) {
  await waitFor(() =>
    expect(hook.result.current.preferences.loading).toBe(false),
  );
}

it.each(completionHaptics.filter(({ id }) => id !== 'current'))(
  'uses $label for preview and accepted completion, leaving other actions alone',
  async ({ id }) => {
    const hook = await setup();
    await ready(hook);
    await act(() => hook.result.current.testing.select(id));
    expect(hook.adapter.playPreset).not.toHaveBeenCalled();
    await act(async () => hook.result.current.testing.preview());
    await act(async () =>
      hook.result.current.preferences.feedback('completed'),
    );
    expect(hook.adapter.playPreset.mock.calls).toEqual([[id], [id]]);
    await act(async () => hook.result.current.preferences.feedback('accept'));
    await act(async () =>
      hook.result.current.preferences.feedback('selection'),
    );
    expect(hook.adapter.play.mock.calls.map(([kind]) => kind)).toEqual([
      'accept',
      'selection',
    ]);
    expect(hook.storage.setItem).not.toHaveBeenCalled();
  },
);
it('defaults to Batter without a selection and restores it on remount', async () => {
  const hook = await setup();
  await ready(hook);
  await act(async () => hook.result.current.testing.preview());
  expect(hook.result.current.testing.selected).toBe('batter');
  expect(hook.adapter.playPreset).toHaveBeenCalledWith('batter');
  expect(hook.adapter.play).not.toHaveBeenCalled();
  await act(() => hook.result.current.testing.select('barrage'));
  await hook.unmount();
  expect(hook.adapter.stop).toHaveBeenCalled();
  expect(hook.remove).toHaveBeenCalled();
  const fresh = await setup();
  await ready(fresh);
  expect(fresh.result.current.testing.selected).toBe('batter');
});
it('respects saved off and stops a native pattern immediately when toggled off', async () => {
  const hook = await setup('false');
  await ready(hook);
  await act(() => hook.result.current.testing.select('bloom'));
  await act(async () => hook.result.current.testing.preview());
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.adapter.playPreset).not.toHaveBeenCalled();
  await act(async () => hook.result.current.preferences.setEnabled(true));
  await act(async () => hook.result.current.testing.preview());
  expect(hook.adapter.playPreset).toHaveBeenCalledTimes(1);
  hook.adapter.stop.mockClear();
  let finish!: () => void;
  hook.storage.setItem.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  let write!: Promise<void>;
  await act(() => {
    write = hook.result.current.preferences.setEnabled(false);
  });
  expect(hook.adapter.stop).toHaveBeenCalledTimes(1);
  await act(async () => hook.result.current.testing.preview());
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.adapter.playPreset).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await write;
  });
});
it('keeps old binaries usable and quiet without an alternate library', async () => {
  const hook = await setup(null, false);
  await ready(hook);
  await act(() => hook.result.current.testing.select('fizz'));
  await act(async () => hook.result.current.testing.preview());
  expect(hook.result.current.preferences.available).toBe(false);
  expect(hook.result.current.testing.error).toBeNull();
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.adapter.play).not.toHaveBeenCalled();
  expect(hook.adapter.playPreset).not.toHaveBeenCalled();
});
it('uses Batter in production and ignores development selection and preview actions', async () => {
  development.__DEV__ = false;
  const hook = await setup();
  await ready(hook);
  await act(() => hook.result.current.testing.select('fizz'));
  await act(async () => hook.result.current.testing.preview());
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.result.current.testing.selected).toBe('batter');
  expect(hook.adapter.play).not.toHaveBeenCalled();
  expect(hook.adapter.playPreset.mock.calls).toEqual([['batter']]);
});
it('keeps a development override out of production completion', async () => {
  const hook = await setup();
  await ready(hook);
  await act(() => hook.result.current.testing.select('afterglow'));
  development.__DEV__ = false;
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.adapter.playPreset.mock.calls).toEqual([['batter']]);
});
it('honors saved off and stops playback when disabling the production default', async () => {
  development.__DEV__ = false;
  const hook = await setup('false');
  await ready(hook);
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.adapter.playPreset).not.toHaveBeenCalled();
  await act(async () => hook.result.current.preferences.setEnabled(true));
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.adapter.playPreset).toHaveBeenCalledWith('batter');
  hook.adapter.stop.mockClear();
  await act(async () => hook.result.current.preferences.setEnabled(false));
  expect(hook.adapter.stop).toHaveBeenCalledTimes(1);
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.adapter.playPreset).toHaveBeenCalledTimes(1);
});
it('stays quiet in production when Pulsar is unavailable', async () => {
  development.__DEV__ = false;
  const hook = await setup(null, false);
  await ready(hook);
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.adapter.play).not.toHaveBeenCalled();
  expect(hook.adapter.playPreset).not.toHaveBeenCalled();
});
it('contains native failures, shows red-error state for preview only and allows retry', async () => {
  const hook = await setup();
  await ready(hook);
  await act(() => hook.result.current.testing.select('triumph'));
  hook.adapter.playPreset.mockImplementationOnce(() => {
    throw new Error('private detail');
  });
  await act(async () => hook.result.current.testing.preview());
  expect(hook.result.current.testing.error).toBe(
    'Couldn’t play this haptic. Please try again.',
  );
  await act(async () => hook.result.current.testing.preview());
  expect(hook.result.current.testing.error).toBeNull();
  hook.adapter.playPreset.mockImplementationOnce(() => {
    throw new Error('failure');
  });
  await act(async () => hook.result.current.preferences.feedback('completed'));
  expect(hook.result.current.preferences.enabled).toBe(true);
  expect(hook.result.current.testing.error).toBeNull();
  hook.adapter.stop.mockImplementationOnce(() => {
    throw new Error('stop');
  });
  await act(async () => hook.result.current.preferences.setEnabled(false));
  expect(hook.result.current.preferences.enabled).toBe(false);
});
it('blocks duplicate previews and fences a pending Pulsar tap burst on stop, choice or background', async () => {
  const hook = await setup();
  await ready(hook);
  await act(() => hook.result.current.testing.select('current'));
  let finish!: () => void;
  hook.adapter.play.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  let pending!: Promise<void>;
  await act(() => {
    pending = hook.result.current.testing.preview();
  });
  expect(hook.result.current.testing.previewing).toBe(true);
  const fence = hook.adapter.play.mock.calls[0]![1];
  await act(async () => hook.result.current.testing.preview());
  expect(hook.adapter.play).toHaveBeenCalledTimes(1);
  expect(fence()).toBe(true);
  await act(() => hook.result.current.testing.stop());
  expect(fence()).toBe(false);
  await act(() => hook.result.current.testing.select('bloom'));
  hook.adapter.stop.mockClear();
  await act(() => hook.lifecycle('active'));
  expect(hook.adapter.stop).not.toHaveBeenCalled();
  await act(() => hook.lifecycle('background'));
  expect(hook.adapter.stop).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await pending;
  });
  expect(hook.result.current.testing.previewing).toBe(false);
});
it('ignores failed previews from an old choice or an unmounted screen', async () => {
  const hook = await setup();
  await ready(hook);
  await act(() => hook.result.current.testing.select('current'));
  let fail!: (error: Error) => void;
  hook.adapter.play.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  let pending!: Promise<void>;
  await act(() => {
    pending = hook.result.current.testing.preview();
  });
  await act(() => hook.result.current.testing.select('bloom'));
  await act(async () => {
    fail(new Error('old'));
    await pending;
  });
  expect(hook.result.current.testing.error).toBeNull();
  await act(() => hook.result.current.testing.select('current'));
  hook.adapter.play.mockImplementationOnce(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  await act(() => {
    pending = hook.result.current.testing.preview();
  });
  const old = hook.result.current.testing;
  await hook.unmount();
  await act(async () => {
    fail(new Error('late'));
    await pending;
  });
  old.select('afterglow');
  await old.preview();
  expect(hook.adapter.playPreset).not.toHaveBeenCalled();
});
