import {
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react-native';
import type { LinkProps } from 'expo-router';
import { Linking } from 'react-native';
import SettingsRoute from '../../app/settings';
import { SettingsScreen } from './SettingsScreen';
import {
  supportContact,
  featureRequestContact,
  contactFailureMessage,
} from '../../app-support/contact';
import { showMessageToast } from '../../platform/toast/Toast';

// Supply build metadata so a reintroduced footer also fails in a free test build.
jest.mock('../../app-support/providers/AppProvider', () => ({
  useAccess: () => ({ data: { source: 'free_beta' } }),
  useIdentity: () => ({ account: null }),
  useJournal: () => null,
  useRuntime: () => ({ client: { ownsAccount: () => false } }),
}));
jest.mock('expo-constants', () => ({ expoConfig: { version: '0.1.0' } }));
jest.mock('./export/SettingsExportRow', () => ({
  SettingsExportRow: () => {
    const { Text } = require('react-native') as typeof import('react-native');
    return <Text accessibilityRole="button">Export my data</Text>;
  },
}));

jest.mock('../../platform/motion/motion', () => ({
  useReduceMotion: () => false,
  useMotionPreferences: () => ({
    reduceMotion: false,
    systemReduced: false,
    loading: false,
    saving: false,
    error: null,
    setReduced: jest.fn(),
  }),
}));
jest.mock('../../platform/haptics/haptics', () => ({
  useHapticFeedback: () => jest.fn(),
  useHapticPreferences: () => ({
    enabled: true,
    available: true,
    loading: false,
    saving: false,
    error: null,
    setEnabled: jest.fn(),
  }),
}));

const mockRouter = {
  canGoBack: jest.fn(() => true),
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
};
jest.mock('../../platform/toast/Toast', () => ({
  showMessageToast: jest.fn(),
}));
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  const React = require('react') as typeof import('react');
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => void) => React.useEffect(effect, [effect]),
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
    Link: ({ href, asChild, children, ref: _ref, ...props }: LinkProps) => {
      // The Router component ref is incompatible with this native Text fixture.
      void _ref;
      return asChild ? (
        React.cloneElement(
          children as React.ReactElement<{ onPress: () => void }>,
          { onPress: () => mockRouter.push(href) },
        )
      ) : (
        <Text
          {...props}
          accessibilityRole="link"
          onPress={() => mockRouter.push(href)}
        >
          {children}
        </Text>
      );
    },
  };
});
const linkEnvironmentKeys = [
  'EXPO_PUBLIC_PRIVACY_POLICY_URL',
  'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_APP_STORE_ID',
  'EXPO_PUBLIC_INSTAGRAM_URL',
  'EXPO_PUBLIC_TIKTOK_URL',
  'EXPO_PUBLIC_TWITTER_URL',
] as const;
const originalLinks = Object.fromEntries(
  linkEnvironmentKeys.map((key) => [key, process.env[key]]),
);
const openUrl = jest.spyOn(Linking, 'openURL');
beforeEach(() => {
  for (const key of linkEnvironmentKeys) delete process.env[key];
  mockRouter.canGoBack.mockReturnValue(true);
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.push.mockClear();
  openUrl.mockReset().mockResolvedValue(undefined);
  jest.mocked(showMessageToast).mockClear();
});
afterAll(() => {
  for (const key of linkEnvironmentKeys) {
    const value = originalLinks[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  openUrl.mockRestore();
});

it('renders the actual route with scoped groups, honest pending controls and no reminders or reset', async () => {
  const screen = await render(<SettingsRoute />);
  expect(
    screen.getAllByRole('header').map((header) => header.props.children),
  ).toEqual(['Settings', 'Preferences', 'Account & data', 'Support', 'About']);
  for (const label of ['General analytics', 'Sensitive metadata'])
    expect(screen.queryByText(label)).toBeNull();
  await fireEvent.press(screen.getByLabelText('Data'));
  expect(mockRouter.push).toHaveBeenCalledWith('/data');
  expect(screen.getByRole('switch', { name: 'Reduce motion' })).toBeEnabled();
  expect(screen.getByRole('switch', { name: 'Haptics' })).toBeEnabled();
  expect(screen.queryByText('Practice reminders')).toBeNull();
  expect(screen.queryByText('Reset progress')).toBeNull();
  expect(screen.queryAllByRole('tab')).toHaveLength(0);
  for (const description of [
    /Activity saves on this phone first/,
    /Optional analytics are off/,
    /Help and suggestions open your email app/,
    /Recovery keys, device transfer & devices/,
    /Connect or recover your account/,
    /Apple’s standard license agreement/,
    /Feelings and reflections are saved on this phone/,
    /Each file is a snapshot/,
    /Recover the same JustGO account before restoring/,
  ])
    expect(screen.queryByText(description)).toBeNull();
});

it('groups journal actions with the account data controls', async () => {
  const screen = await render(<SettingsScreen />);
  const account = within(
    screen.getByRole('header', { name: 'Account & data' }).parent!,
  );
  expect(account.getByRole('link', { name: 'Account' })).toBeTruthy();
  expect(account.getByRole('link', { name: 'Data' })).toBeTruthy();
  expect(account.queryAllByRole('button')).toHaveLength(0);
  for (const label of [
    'Back up journal',
    'Restore journal',
    'Recover earlier journal',
    'Export my data',
    'Delete account',
  ])
    expect(account.queryByText(label)).toBeNull();
  expect(
    screen.queryByRole('header', { name: 'Journal on this phone' }),
  ).toBeNull();
});

it('keeps navigation outside the scrollable settings content', async () => {
  const screen = await render(<SettingsScreen />);
  const content = within(
    screen.container.queryAll((node) => node.type === 'RCTScrollView')[0]!,
  );
  expect(screen.getByRole('header', { name: 'Settings' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  expect(content.queryByRole('header', { name: 'Settings' })).toBeNull();
  expect(content.queryByRole('button', { name: 'Back' })).toBeNull();
  expect(content.getByRole('header', { name: 'Preferences' })).toBeTruthy();
  expect(content.getByRole('button', { name: 'Terms of use' })).toBeTruthy();
});

it('ends after About without version, test-build or developer-preview footer items', async () => {
  const screen = await render(<SettingsScreen />);
  expect(screen.queryByText(/JustGO.*Version/)).toBeNull();
  expect(screen.queryByText(/Free test build/)).toBeNull();
  expect(
    screen.queryByRole('link', { name: 'Preview app screens' }),
  ).toBeNull();
  expect(screen.getByRole('button', { name: 'Terms of use' })).toBeTruthy();
});

it('offers synthetic diagnostic and haptics checks only in development', async () => {
  const development = globalThis as typeof globalThis & { __DEV__: boolean };
  const original = development.__DEV__;
  try {
    development.__DEV__ = true;
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByRole('link', { name: 'Test haptics' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/preview?mode=haptics');
    await fireEvent.press(
      screen.getByRole('link', { name: 'Test error reporting' }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith('/preview?mode=diagnostics');
    development.__DEV__ = false;
    await screen.rerender(<SettingsScreen />);
    expect(screen.queryByRole('link', { name: 'Test haptics' })).toBeNull();
    expect(
      screen.queryByRole('link', { name: 'Test error reporting' }),
    ).toBeNull();
  } finally {
    development.__DEV__ = original;
  }
});

it('groups the two contact actions under Support above About and keeps information links in About', async () => {
  const screen = await render(<SettingsScreen />);
  const support = within(
    screen.getByRole('header', { name: 'Support' }).parent!,
  );
  const about = within(screen.getByRole('header', { name: 'About' }).parent!);
  expect(
    support
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel),
  ).toEqual(['Get help', 'Suggest a feature']);
  expect(
    about
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel),
  ).toEqual([
    'Rate on the App Store',
    'Instagram',
    'TikTok',
    'Twitter / X',
    'Privacy policy',
    'Terms of use',
  ]);
  expect(screen.queryByText('Help & about')).toBeNull();
});

it('keeps rating and social rows unavailable until their destinations are configured', async () => {
  const screen = await render(<SettingsScreen />);
  for (const label of [
    'Rate on the App Store',
    'Instagram',
    'TikTok',
    'Twitter / X',
  ]) {
    const button = screen.getByRole('button', { name: label });
    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button);
  }
  expect(openUrl).not.toHaveBeenCalled();
});

const communityDestinations = [
  [
    'Rate on the App Store',
    'https://apps.apple.com/app/id1234567890?action=write-review',
    'Couldn’t open the App Store. Please try again.',
  ],
  [
    'Instagram',
    'https://www.instagram.com/justgo-test',
    'Couldn’t open Instagram. Please try again.',
  ],
  [
    'TikTok',
    'https://www.tiktok.com/@justgo-test',
    'Couldn’t open TikTok. Please try again.',
  ],
  [
    'Twitter / X',
    'https://x.com/justgo-test',
    'Couldn’t open Twitter / X. Please try again.',
  ],
] as const;
function configureCommunityLinks() {
  process.env.EXPO_PUBLIC_APP_STORE_ID = '1234567890';
  process.env.EXPO_PUBLIC_INSTAGRAM_URL =
    'https://www.instagram.com/justgo-test';
  process.env.EXPO_PUBLIC_TIKTOK_URL = 'https://www.tiktok.com/@justgo-test';
  process.env.EXPO_PUBLIC_TWITTER_URL = 'https://x.com/justgo-test';
}

it('opens configured rating and social destinations without attaching account or activity data', async () => {
  configureCommunityLinks();
  const screen = await render(<SettingsScreen />);
  for (const [label, url] of communityDestinations) {
    await fireEvent.press(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(url));
  }
  expect(openUrl).toHaveBeenCalledTimes(4);
});

it.each(communityDestinations)(
  'keeps %s available after opening fails',
  async (label, url, failureMessage) => {
    configureCommunityLinks();
    openUrl.mockRejectedValueOnce(new Error('private device detail'));
    const screen = await render(<SettingsScreen />);
    const button = screen.getByRole('button', { name: label });
    await fireEvent.press(button);
    await waitFor(() =>
      expect(showMessageToast).toHaveBeenCalledWith('activity', failureMessage),
    );
    expect(button.props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(button);
    await waitFor(() =>
      expect(button.props.accessibilityState.busy).toBe(false),
    );
    expect(openUrl).toHaveBeenNthCalledWith(2, url);
  },
);

it('keeps the existing account recovery action available', async () => {
  const screen = await render(<SettingsScreen />);
  await fireEvent.press(screen.getByRole('link', { name: 'Account' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/recovery');
});

it('opens the concise Data controls from a single link', async () => {
  const screen = await render(<SettingsScreen />);
  await fireEvent.press(screen.getByRole('link', { name: 'Data' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/data');
});

it('returns to the originating screen, or safely goes home when opened directly', async () => {
  const screen = await render(<SettingsScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  mockRouter.canGoBack.mockReturnValue(false);
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockRouter.replace).toHaveBeenCalledWith('/access');
});

it('uses distinct private email subjects, without account or activity attachments', async () => {
  const screen = await render(<SettingsScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Get help' }));
  await waitFor(() => expect(openUrl).toHaveBeenCalledWith(supportContact));
  await fireEvent.press(
    screen.getByRole('button', { name: 'Suggest a feature' }),
  );
  await waitFor(() =>
    expect(openUrl).toHaveBeenCalledWith(featureRequestContact),
  );
  for (const [url] of openUrl.mock.calls) {
    expect(new URL(url).pathname).toBe('anthonyyoo24@gmail.com');
    expect([...new URL(url).searchParams.keys()]).toEqual(['subject']);
  }
  expect(new URL(supportContact).searchParams.get('subject')).toBe(
    'JustGO support',
  );
  expect(new URL(featureRequestContact).searchParams.get('subject')).toBe(
    'JustGO feature request',
  );
});

it('keeps feature requests usable after email opening fails', async () => {
  openUrl.mockRejectedValueOnce(new Error('device detail'));
  const screen = await render(<SettingsScreen />);
  const button = screen.getByRole('button', { name: 'Suggest a feature' });
  await fireEvent.press(button);
  await waitFor(() =>
    expect(showMessageToast).toHaveBeenCalledWith(
      'activity',
      contactFailureMessage,
    ),
  );
  expect(button.props.accessibilityState.disabled).toBe(false);
});

it('keeps missing notices unavailable without substituting an unrelated license', async () => {
  const screen = await render(<SettingsScreen />);
  expect(
    screen.getByRole('button', { name: 'Privacy policy' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(screen.queryByText('Apple’s standard license agreement')).toBeNull();
  expect(screen.getByRole('button', { name: 'Terms of use' })).toBeDisabled();
});

it('opens configured public legal pages', async () => {
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL = 'https://example.com/privacy';
  process.env.EXPO_PUBLIC_TERMS_URL = 'https://example.com/terms';
  const screen = await render(<SettingsScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Privacy policy' }));
  await waitFor(() =>
    expect(openUrl).toHaveBeenCalledWith('https://example.com/privacy'),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Terms of use' }));
  await waitFor(() =>
    expect(openUrl).toHaveBeenCalledWith('https://example.com/terms'),
  );
  expect(screen.queryByText('Apple’s standard license agreement')).toBeNull();
});
