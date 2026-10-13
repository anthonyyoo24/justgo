import { AppState, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Haptics from 'expo-haptics';
import { hapticAdapter } from './haptic-feedback';

jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn(() => ({})) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Heavy: 'heavy' },
}));
const originalState = AppState.currentState;
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
  AppState.currentState = 'active';
  jest.mocked(requireOptionalNativeModule).mockReturnValue({});
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  AppState.currentState = originalState;
});

it.each(['accept', 'selection'] as const)(
  'gives %s one heavy impact',
  async (feedback) => {
    await hapticAdapter.play(feedback, () => true);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('heavy');
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  },
);
it('gives completion a longer burst of four heavy impacts', async () => {
  jest.useFakeTimers();
  const pending = hapticAdapter.play('completed', () => true);
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(69);
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(1);
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
  await jest.advanceTimersByTimeAsync(70);
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(3);
  await jest.advanceTimersByTimeAsync(70);
  await pending;
  expect(jest.mocked(Haptics.impactAsync).mock.calls).toEqual([
    ['heavy'],
    ['heavy'],
    ['heavy'],
    ['heavy'],
  ]);
  expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
it('stops the remaining completion pulses after feedback is disabled or fenced', async () => {
  jest.useFakeTimers();
  let allowed = true;
  const pending = hapticAdapter.play('completed', () => allowed);
  await jest.advanceTimersByTimeAsync(70);
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
  allowed = false;
  await jest.advanceTimersByTimeAsync(70);
  await pending;
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});
it('stops a completion burst when the app leaves the foreground', async () => {
  jest.useFakeTimers();
  const pending = hapticAdapter.play('completed', () => true);
  AppState.currentState = 'background';
  await jest.advanceTimersByTimeAsync(70);
  await pending;
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
it('stops a completion burst after a native pulse fails', async () => {
  jest.useFakeTimers();
  jest
    .mocked(Haptics.impactAsync)
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('unavailable'));
  const result = expect(
    hapticAdapter.play('completed', () => true),
  ).rejects.toThrow('unavailable');
  await jest.advanceTimersByTimeAsync(70);
  await result;
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});
it('keeps a development binary without the native module usable', async () => {
  jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
  expect(hapticAdapter.isAvailable()).toBe(false);
  await expect(
    hapticAdapter.play('accept', () => true),
  ).resolves.toBeUndefined();
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
});
it('does not produce iPhone feedback on other platforms', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  expect(hapticAdapter.isAvailable()).toBe(false);
  await hapticAdapter.play('completed', () => true);
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
});
it('rechecks the preference before producing feedback', async () => {
  await hapticAdapter.play('selection', () => false);
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
});
it.each(['background', 'inactive'] as const)(
  'stays quiet in %s',
  async (state) => {
    AppState.currentState = state;
    await hapticAdapter.play('selection', () => true);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  },
);
it('lets the provider contain native rejections', async () => {
  jest
    .mocked(Haptics.impactAsync)
    .mockRejectedValueOnce(new Error('unavailable'));
  await expect(hapticAdapter.play('selection', () => true)).rejects.toThrow(
    'unavailable',
  );
});
