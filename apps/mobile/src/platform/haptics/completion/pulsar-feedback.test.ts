import { AppState, Platform, TurboModuleRegistry } from 'react-native';
import { completionHaptics } from './completion-haptics';
import { pulsarAdapter } from './pulsar-feedback';

const mockLoaded = jest.fn();
const mockPlay = jest.fn();
const mockSupport = jest.fn(() => 3);
const mockSound = jest.fn();
const mockStop = jest.fn();
jest.mock('react-native-pulsar', () => {
  mockLoaded();
  return {
    Presets: Object.fromEntries(
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
      ].map((name) => [name, () => mockPlay(name)]),
    ),
    Settings: {
      enableSound: (value: boolean) => mockSound(value),
      getHapticsSupportLevel: () => mockSupport(),
      stopHaptics: () => mockStop(),
    },
  };
});
const development = globalThis as typeof globalThis & { __DEV__: boolean };
const originalDevelopment = development.__DEV__;
const originalState = AppState.currentState;
beforeEach(() => {
  jest.clearAllMocks();
  development.__DEV__ = true;
  AppState.currentState = 'active';
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue({});
  mockSupport.mockReturnValue(3);
});
afterEach(() => {
  development.__DEV__ = originalDevelopment;
  AppState.currentState = originalState;
  jest.restoreAllMocks();
});

it('does not load the enforcing SDK on an older binary', () => {
  jest.mocked(TurboModuleRegistry.get).mockReturnValue(null);
  expect(pulsarAdapter.isAvailable()).toBe(false);
  expect(mockLoaded).not.toHaveBeenCalled();
  expect(() => pulsarAdapter.play('bloom')).toThrow('unavailable');
  pulsarAdapter.stop();
  expect(mockStop).not.toHaveBeenCalled();
});
it.each(completionHaptics.filter(({ id }) => id !== 'current'))(
  'plays $label through the official preset function, without audio',
  ({ id }) => {
    if (id === 'current') throw new Error('Expected a Pulsar preset');
    expect(pulsarAdapter.isAvailable()).toBe(true);
    pulsarAdapter.play(id);
    expect(mockSound).toHaveBeenCalledWith(false);
    expect(mockPlay).toHaveBeenCalledWith(id);
    pulsarAdapter.stop();
    expect(mockStop).toHaveBeenCalledTimes(1);
  },
);
it('treats unsupported hardware and SDK errors as unavailable', () => {
  mockSupport.mockReturnValue(0);
  expect(pulsarAdapter.isAvailable()).toBe(false);
  mockSupport.mockImplementationOnce(() => {
    throw new Error('engine');
  });
  expect(pulsarAdapter.isAvailable()).toBe(false);
});
it('plays the approved effect and can stop it in production', () => {
  development.__DEV__ = false;
  expect(pulsarAdapter.isAvailable()).toBe(true);
  pulsarAdapter.play('batter');
  pulsarAdapter.stop();
  expect(mockPlay).toHaveBeenCalledWith('batter');
  expect(mockSound).toHaveBeenCalledWith(false);
  expect(mockStop).toHaveBeenCalledTimes(1);
});
it('does not play iPhone patterns on other platforms', () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  expect(pulsarAdapter.isAvailable()).toBe(false);
  expect(() => pulsarAdapter.play('bloom')).toThrow('unavailable');
  expect(mockPlay).not.toHaveBeenCalled();
});
it('does not play while backgrounded', () => {
  AppState.currentState = 'background';
  pulsarAdapter.play('bloom');
  expect(mockPlay).not.toHaveBeenCalled();
});
