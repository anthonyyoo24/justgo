import { fireEvent, render } from '@testing-library/react-native';
import { ICloudSyncPreview } from './ICloudSyncPreview';
import { iCloudSyncMessages } from '../../features/settings/data/icloud-messages';

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => false, replace: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../platform/motion/motion', () => ({
  useReduceMotion: () => true,
}));

it('previews opening, dismissing and enabling with presentation state only', async () => {
  const screen = await render(<ICloudSyncPreview />);
  expect(
    screen.getByText('SCREEN PREVIEW · No iCloud data is saved'),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole('switch'));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Close iCloud Sync' }),
  );
  expect(screen.getByRole('switch')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: false }),
  );
  await fireEvent.press(screen.getByRole('switch'));
  await fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  expect(screen.queryByTestId('icloud-sync-sheet')).toBeNull();
  expect(screen.getByRole('switch')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: true }),
  );
  await fireEvent.press(screen.getByRole('switch'));
  expect(screen.getByRole('switch')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: false }),
  );
});

it('previews an already-enabled switch on its first render', async () => {
  const screen = await render(<ICloudSyncPreview state="enabled" />);
  expect(screen.getByRole('switch')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: true }),
  );
  expect(screen.queryByTestId('icloud-sync-sheet')).toBeNull();
});

it.each(['recovery', 'reset'])(
  'does not expose the removed clear action through an old %s preview link',
  async (state) => {
    const screen = await render(<ICloudSyncPreview state={state} />);
    await fireEvent.press(screen.getByRole('switch'));
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Start Syncing' }),
    );
    expect(screen.queryByTestId('icloud-sync-sheet')).toBeNull();
    expect(screen.getByRole('switch')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
  },
);

it.each(['busy', 'error'])(
  'previews the %s state without calling iCloud',
  async (state) => {
    const screen = await render(<ICloudSyncPreview state={state} />);
    await fireEvent.press(screen.getByRole('switch'));
    await fireEvent.press(
      screen.getByRole('button', { name: 'Start Syncing' }),
    );
    expect(screen.getByTestId('icloud-sync-sheet')).toBeTruthy();
    if (state === 'busy')
      expect(
        screen.getByRole('progressbar', { name: 'Starting iCloud sync' }),
      ).toBeTruthy();
    else
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Your iCloud storage is full. Free up space then try again.',
      );
  },
);

it.each(Object.entries(iCloudSyncMessages))(
  'previews the complete %s message for layout verification',
  async (state, message) => {
    const screen = await render(<ICloudSyncPreview state={state} />);
    await fireEvent.press(screen.getByRole('switch'));
    expect(screen.queryByRole('alert')).toBeNull();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Start Syncing' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  },
);
