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
async function setup(
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
  const screen = await render(node());
  return {
    ...screen,
    testing,
    preferences,
    refresh: async () => await screen.rerender(node()),
  };
}
it('shows every requested choice and lets the user preview, stop and go back', async () => {
  const screen = await setup();
  expect(screen.getByText(/Reloading restores Batter/)).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(10);
  expect(
    screen.container.queryAll((node) => node.type.endsWith('Switch')),
  ).toHaveLength(0);
  for (const { id, label } of completionHaptics) {
    await fireEvent.press(screen.getByRole('radio', { name: label }));
    expect(screen.testing.select).toHaveBeenLastCalledWith(id);
  }
  screen.testing.selected = 'afterglow';
  await screen.refresh();
  expect(
    screen.getByRole('radio', { name: 'Afterglow' }).props.accessibilityState
      .checked,
  ).toBe(true);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Preview Afterglow' }),
  );
  await waitFor(() => expect(screen.testing.preview).toHaveBeenCalledTimes(1));
  await fireEvent.press(screen.getByRole('button', { name: 'Stop haptic' }));
  expect(screen.testing.stop).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockBack).toHaveBeenCalled();
  await screen.unmount();
  expect(screen.testing.stop).toHaveBeenCalledTimes(2);
});
it.each([
  { enabled: false },
  { loading: true },
  { saving: true },
  { available: false },
])('disables previews for %p', async (prefs) => {
  const screen = await setup(prefs);
  expect(screen.getByRole('button', { name: 'Preview Batter' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Preview Batter' }));
  expect(screen.testing.preview).not.toHaveBeenCalled();
});
it('explains the missing native build and browser without promising vibration', async () => {
  const screen = await setup({ available: false }, { selected: 'bloom' });
  expect(screen.getByText(/Pulsar-enabled/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Preview Bloom' })).toBeDisabled();
  screen.preferences.available = false;
  await screen.refresh();
  expect(screen.getByText(/physical iPhone/)).toBeTruthy();
});
it('shows a spinner while preparing and an accessible red error on failure', async () => {
  const screen = await setup({}, { previewing: true });
  expect(screen.getByRole('progressbar')).toBeTruthy();
  screen.testing.previewing = false;
  screen.testing.error = 'Couldn’t play this haptic. Please try again.';
  await screen.refresh();
  expect(screen.getByRole('alert').props.style.color).toBe('#8B1E32');
  expect(screen.getByRole('button', { name: 'Preview Batter' })).toBeEnabled();
});
it('redirects if the development screen is rendered in production', async () => {
  const development = globalThis as typeof globalThis & { __DEV__: boolean };
  const original = development.__DEV__;
  try {
    development.__DEV__ = false;
    const screen = await setup();
    expect(screen.getByText('Redirect /settings')).toBeTruthy();
    expect(screen.queryByText('Completion effect')).toBeNull();
  } finally {
    development.__DEV__ = original;
  }
});

it('selects a browser radio with Space without scrolling and leaves other keys alone', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  try {
    const screen = await setup();
    const preventDefault = jest.fn();
    const row = screen.getByRole('radio', { name: 'Batter' });
    await fireEvent(row, 'keyDown', {
      nativeEvent: { key: 'Tab' },
      preventDefault,
    });
    expect(screen.testing.select).not.toHaveBeenCalled();
    await fireEvent(row, 'keyDown', {
      nativeEvent: { key: ' ' },
      preventDefault,
    });
    expect(screen.testing.select).toHaveBeenCalledWith('batter');
    await fireEvent(row, 'keyDown', {
      nativeEvent: { key: 'Spacebar' },
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledTimes(2);
  } finally {
    jest.restoreAllMocks();
  }
});
