import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { HapticsTestScreen } from './HapticsTestScreen';
import {
  HapticsContext,
  type HapticPreferences,
} from '../../platform/haptics/haptics';
import {
  CompletionHapticsContext,
  completionHaptics,
  type CompletionHapticsTesting,
} from '../../platform/haptics/completion/completion-haptics';

const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  const { useEffect } = require('react') as typeof import('react');
  return {
    useRouter: () => ({ canGoBack: () => true, back: mockBack }),
    useFocusEffect: (effect: () => () => void) => useEffect(effect, [effect]),
    Redirect: ({ href }: { href: string }) => <Text>Redirect {href}</Text>,
  };
});
function setup(
  prefs: Partial<HapticPreferences> = {},
  overrides: Partial<CompletionHapticsTesting> = {},
) {
  const preferences: HapticPreferences = {
    enabled: true,
    available: true,
    loading: false,
    saving: false,
    error: null,
    setEnabled: async () => {},
    feedback: () => {},
    ...prefs,
  };
  const testing: CompletionHapticsTesting = {
    selected: 'batter',
    pulsarAvailable: true,
    previewing: false,
    error: null,
    select: jest.fn(),
    preview: jest.fn(async () => {}),
    stop: jest.fn(),
    ...overrides,
  };
  const node = () => (
    <HapticsContext.Provider value={preferences}>
      <CompletionHapticsContext.Provider value={testing}>
        <HapticsTestScreen />
      </CompletionHapticsContext.Provider>
    </HapticsContext.Provider>
  );
  const screen = render(node());
  return {
    ...screen,
    testing,
    preferences,
    refresh: () => screen.rerender(node()),
  };
}
it('shows every requested choice and lets the user preview, stop and go back', async () => {
  const screen = setup();
  expect(screen.getByText(/Reloading restores Batter/)).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(10);
  for (const { id, label } of completionHaptics) {
    fireEvent.press(screen.getByRole('radio', { name: label }));
    expect(screen.testing.select).toHaveBeenLastCalledWith(id);
  }
  screen.testing.selected = 'afterglow';
  screen.refresh();
  expect(
    screen.getByRole('radio', { name: 'Afterglow' }).props.accessibilityState
      .checked,
  ).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Preview Afterglow' }));
  await waitFor(() => expect(screen.testing.preview).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByRole('button', { name: 'Stop haptic' }));
  expect(screen.testing.stop).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockBack).toHaveBeenCalled();
  screen.unmount();
  expect(screen.testing.stop).toHaveBeenCalledTimes(2);
});
it.each([
  { enabled: false },
  { loading: true },
  { saving: true },
  { available: false },
])('disables previews for %p', (prefs) => {
  const screen = setup(prefs);
  expect(screen.getByRole('button', { name: 'Preview Batter' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Preview Batter' }));
  expect(screen.testing.preview).not.toHaveBeenCalled();
});
it('explains the missing native build and browser without promising vibration', () => {
  const screen = setup({}, { selected: 'bloom', pulsarAvailable: false });
  expect(
    screen.getByText(/Pulsar needs the updated iPhone build/),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Preview Bloom' })).toBeDisabled();
  screen.preferences.available = false;
  screen.refresh();
  expect(screen.getByText(/physical iPhone/)).toBeTruthy();
});
it('shows a spinner while preparing and an accessible red error on failure', () => {
  const screen = setup({}, { previewing: true });
  expect(screen.getByRole('progressbar')).toBeTruthy();
  screen.testing.previewing = false;
  screen.testing.error = 'Couldn’t play this haptic. Please try again.';
  screen.refresh();
  expect(screen.getByRole('alert').props.style.color).toBe('#8B1E32');
  expect(screen.getByRole('button', { name: 'Preview Batter' })).toBeEnabled();
});
it('redirects if the development screen is rendered in production', () => {
  const development = globalThis as typeof globalThis & { __DEV__: boolean };
  const original = development.__DEV__;
  try {
    development.__DEV__ = false;
    const screen = setup();
    expect(screen.getByText('Redirect /settings')).toBeTruthy();
    expect(screen.queryByText('Completion effect')).toBeNull();
  } finally {
    development.__DEV__ = original;
  }
});

it('selects a browser radio with Space without scrolling and leaves other keys alone', () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  try {
    const screen = setup();
    const preventDefault = jest.fn();
    const row = screen.getByRole('radio', { name: 'Batter' });
    fireEvent(row, 'keyDown', { key: 'Tab', preventDefault });
    expect(screen.testing.select).not.toHaveBeenCalled();
    fireEvent(row, 'keyDown', { key: ' ', preventDefault });
    expect(screen.testing.select).toHaveBeenCalledWith('batter');
    fireEvent(row, 'keyDown', { key: 'Spacebar', preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(2);
  } finally {
    jest.restoreAllMocks();
  }
});
