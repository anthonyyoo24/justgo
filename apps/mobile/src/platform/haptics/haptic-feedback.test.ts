import { AppState, Platform, TurboModuleRegistry } from 'react-native';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { HapticsPreferencesProvider } from './HapticsPreferencesProvider';
import { useHapticPreferences } from './haptics';
import { completionHaptics } from './completion/completion-haptics';
import { hapticAdapter } from './haptic-feedback';

const mockLoaded = jest.fn();
const mockImpact = jest.fn();
const mockPreset = jest.fn();
const mockSupport = jest.fn(() => 3);
const mockSound = jest.fn();
const mockStop = jest.fn();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
}));
jest.mock('react-native-pulsar', () => {
  mockLoaded();
  return {
    Presets: {
      System: { impactHeavy: () => mockImpact() },
      ...Object.fromEntries(
        [
          'bloom',
          'fanfare',
          'fizz',
          'flourish',
          'trumpet',
          'triumph',
          'barrage',
          'batter',
          'afterglow',
        ].map((name) => [name, () => mockPreset(name)]),
      ),
    },
    Settings: {
      enableSound: (value: boolean) => mockSound(value),
      getHapticsSupportLevel: () => mockSupport(),
      stopHaptics: () => mockStop(),
    },
  };
});
const originalState = AppState.currentState;
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
  AppState.currentState = 'active';
  jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue({});
  mockSupport.mockReturnValue(3);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  AppState.currentState = originalState;
});

it.each(['accept', 'selection'] as const)(
  'gives %s one Pulsar system heavy impact without audio',
  async (feedback) => {
    await hapticAdapter.play(feedback, () => true);
    expect(mockImpact).toHaveBeenCalledTimes(1);
    expect(mockSound).toHaveBeenCalledWith(false);
    expect(mockPreset).not.toHaveBeenCalled();
  },
);
it('recreates the four-heavy-tap comparison entirely through Pulsar', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  const pending = hapticAdapter.play('completed', () => true);
  expect(mockImpact).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(69);
  expect(mockImpact).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(mockImpact).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(70);
  expect(mockImpact).toHaveBeenCalledTimes(3);
  await jest.advanceTimersByTimeAsync(70);
  await pending;
  expect(mockImpact).toHaveBeenCalledTimes(4);
  expect(mockPreset).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
it('stops remaining comparison taps when disabled or fenced', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  let allowed = true;
  const pending = hapticAdapter.play('completed', () => allowed);
  await jest.advanceTimersByTimeAsync(70);
  expect(mockImpact).toHaveBeenCalledTimes(2);
  allowed = false;
  await jest.advanceTimersByTimeAsync(70);
  await pending;
  expect(mockImpact).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});
it('stops a comparison burst when the app leaves the foreground', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  const pending = hapticAdapter.play('completed', () => true);
  AppState.currentState = 'background';
  await jest.advanceTimersByTimeAsync(70);
  await pending;
  expect(mockImpact).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
it('stops a comparison burst after a native tap fails', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  mockImpact
    .mockImplementationOnce(() => {})
    .mockImplementationOnce(() => {
      throw new Error('unavailable');
    });
  const result = expect(
    hapticAdapter.play('completed', () => true),
  ).rejects.toThrow('unavailable');
  await jest.advanceTimersByTimeAsync(70);
  await result;
  expect(mockImpact).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});
it('never loads the enforcing SDK on an older binary', async () => {
  jest.mocked(TurboModuleRegistry.get).mockReturnValue(null);
  expect(hapticAdapter.isAvailable()).toBe(false);
  await hapticAdapter.play('accept', () => true);
  expect(() => hapticAdapter.playPreset('batter')).toThrow('unavailable');
  hapticAdapter.stop();
  expect(mockLoaded).not.toHaveBeenCalled();
  expect(mockImpact).not.toHaveBeenCalled();
  expect(mockStop).not.toHaveBeenCalled();
});
it('stays unavailable on unsupported hardware or a failed engine', async () => {
  mockSupport.mockReturnValue(0);
  expect(hapticAdapter.isAvailable()).toBe(false);
  await hapticAdapter.play('selection', () => true);
  expect(() => hapticAdapter.playPreset('batter')).toThrow('unavailable');
  expect(mockImpact).not.toHaveBeenCalled();
  expect(mockPreset).not.toHaveBeenCalled();
  mockSupport.mockImplementationOnce(() => {
    throw new Error('engine');
  });
  expect(hapticAdapter.isAvailable()).toBe(false);
});
it('does not produce iPhone feedback on other platforms', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  expect(hapticAdapter.isAvailable()).toBe(false);
  await hapticAdapter.play('completed', () => true);
  expect(() => hapticAdapter.playPreset('bloom')).toThrow('unavailable');
  expect(mockImpact).not.toHaveBeenCalled();
  expect(mockPreset).not.toHaveBeenCalled();
});
it('rechecks permission before producing a tap', async () => {
  await hapticAdapter.play('selection', () => false);
  expect(mockImpact).not.toHaveBeenCalled();
});
it.each(['background', 'inactive'] as const)(
  'stays quiet in %s',
  async (state) => {
    AppState.currentState = state;
    await hapticAdapter.play('selection', () => true);
    hapticAdapter.playPreset('batter');
    expect(mockImpact).not.toHaveBeenCalled();
    expect(mockPreset).not.toHaveBeenCalled();
  },
);
it('lets the provider contain native tap failures', async () => {
  mockImpact.mockImplementationOnce(() => {
    throw new Error('unavailable');
  });
  await expect(hapticAdapter.play('selection', () => true)).rejects.toThrow(
    'unavailable',
  );
});
it.each(completionHaptics.filter(({ id }) => id !== 'current'))(
  'plays $label through Pulsar with audio disabled',
  ({ id }) => {
    if (id === 'current') throw new Error('Expected a Pulsar preset');
    hapticAdapter.playPreset(id);
    expect(mockSound).toHaveBeenCalledWith(false);
    expect(mockPreset).toHaveBeenCalledWith(id);
    hapticAdapter.stop();
    expect(mockStop).toHaveBeenCalledTimes(1);
  },
);
it('supports taps, Batter and stop in production', async () => {
  const development = globalThis as typeof globalThis & { __DEV__: boolean };
  const original = development.__DEV__;
  try {
    development.__DEV__ = false;
    await hapticAdapter.play('accept', () => true);
    hapticAdapter.playPreset('batter');
    hapticAdapter.stop();
    expect(mockImpact).toHaveBeenCalledTimes(1);
    expect(mockPreset).toHaveBeenCalledWith('batter');
    expect(mockStop).toHaveBeenCalledTimes(1);
  } finally {
    development.__DEV__ = original;
  }
});

it('wires the real provider to Pulsar for every product action and respects saved off', async () => {
  const storage = {
    getItem: async () => 'false',
    setItem: jest
      .fn<Promise<void>, [string, string]>()
      .mockResolvedValue(undefined),
  };
  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(HapticsPreferencesProvider, { storage }, children);
  const hook = await renderHook(useHapticPreferences, { wrapper });
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  for (const kind of ['accept', 'selection', 'completed'] as const)
    await act(async () => hook.result.current.feedback(kind));
  expect(mockImpact).not.toHaveBeenCalled();
  expect(mockPreset).not.toHaveBeenCalled();
  await act(async () => hook.result.current.setEnabled(true));
  expect(mockImpact).toHaveBeenCalledTimes(1);
  await act(async () => hook.result.current.feedback('accept'));
  await act(async () => hook.result.current.feedback('selection'));
  await act(async () => hook.result.current.feedback('completed'));
  expect(mockImpact).toHaveBeenCalledTimes(3);
  expect(mockPreset.mock.calls).toEqual([['batter']]);
  await act(async () => hook.result.current.setEnabled(false));
  for (const kind of ['accept', 'selection', 'completed'] as const)
    await act(async () => hook.result.current.feedback(kind));
  expect(mockImpact).toHaveBeenCalledTimes(3);
  expect(mockPreset).toHaveBeenCalledTimes(1);
  expect(storage.setItem.mock.calls.map((args) => args[1])).toEqual([
    'true',
    'false',
  ]);
  await hook.unmount();
  expect(mockStop).toHaveBeenCalled();
});
