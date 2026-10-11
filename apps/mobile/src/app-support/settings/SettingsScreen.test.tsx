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
import { SettingsGroup } from './SettingsRows';
import { appleStandardTerms } from './information/legal-links';
import {
  supportContact,
  featureRequestContact,
  contactFailureMessage,
} from '../contact';
import { showMessageToast } from '../../platform/toast/Toast';
import { useAccess } from '../providers/AppProvider';

jest.mock('../providers/AppProvider', () => ({ useAccess: jest.fn() }));

jest.mock('../../platform/motion/motion', () => ({
  useMotionPreferences: () => ({
    reduceMotion: false,
    systemReduced: false,
    loading: false,
    saving: false,
    error: null,
    setReduced: jest.fn(),
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
jest.mock('expo-constants', () => ({ expoConfig: { version: '0.1.0' } }));
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  const React = require('react') as typeof import('react');
  return {
    useRouter: () => mockRouter,
    Link: ({ href, asChild, children, ...props }: LinkProps) =>
      asChild ? (
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
      ),
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
  jest
    .mocked(useAccess)
    .mockReturnValue({ data: undefined } as ReturnType<typeof useAccess>);
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

it('renders the actual route with scoped groups, honest pending controls and no reminders or reset', () => {
  const screen = render(<SettingsRoute />);
  expect(
    screen.getAllByRole('header').map((header) => header.props.children),
  ).toEqual([
    'Settings',
    'Preferences',
    'Account & data',
    'Privacy',
    'Support',
    'About',
  ]);
  for (const label of [
    'Haptics',
    'Delete account',
    'General analytics',
    'Sensitive metadata',
  ])
    expect(
      screen.getByLabelText(`${label}. Not available yet.`).props
        .accessibilityState.disabled,
    ).toBe(true);
  expect(screen.getByRole('switch', { name: 'Reduce motion' })).toBeEnabled();
  expect(screen.queryByText('Practice reminders')).toBeNull();
  expect(screen.queryByText('Reset progress')).toBeNull();
  expect(screen.queryAllByRole('tab')).toHaveLength(0);
  expect(screen.getByText('JustGO · Version 0.1.0')).toBeTruthy();
  for (const description of [
    /Activity saves on this phone first/,
    /Optional analytics are off/,
    /Help and suggestions open your email app/,
    /Recovery keys, device transfer & devices/,
    /Connect or recover your account/,
    /Apple’s standard license agreement/,
  ])
    expect(screen.queryByText(description)).toBeNull();
});

it('identifies free testing only when the account server reports beta access', () => {
  const screen = render(<SettingsScreen />);
  expect(screen.queryByText(/Free test build/)).toBeNull();
  jest.mocked(useAccess).mockReturnValue({
    data: {
      status: 'verified',
      source: 'free_beta',
      checkedAt: '2026-10-11T12:00:00.000Z',
      expiresAt: '2026-11-01T12:00:00.000Z',
    },
  } as ReturnType<typeof useAccess>);
  screen.rerender(<SettingsScreen />);
  expect(screen.getByText(/Free test build/)).toBeTruthy();
});

it('groups the two contact actions under Support above About and keeps information links in About', () => {
  const screen = render(<SettingsScreen />);
  const groups = screen.UNSAFE_getAllByType(SettingsGroup);
  const support = within(
    groups.find((group) => group.props.title === 'Support')!,
  );
  const about = within(groups.find((group) => group.props.title === 'About')!);
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

it('keeps rating and social rows unavailable until their destinations are configured', () => {
  const screen = render(<SettingsScreen />);
  for (const label of [
    'Rate on the App Store',
    'Instagram',
    'TikTok',
    'Twitter / X',
  ]) {
    const button = screen.getByRole('button', { name: label });
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
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
  const screen = render(<SettingsScreen />);
  for (const [label, url] of communityDestinations) {
    fireEvent.press(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith(url));
  }
  expect(openUrl).toHaveBeenCalledTimes(4);
});

it.each(communityDestinations)(
  'keeps %s available after opening fails',
  async (label, url, failureMessage) => {
    configureCommunityLinks();
    openUrl.mockRejectedValueOnce(new Error('private device detail'));
    const screen = render(<SettingsScreen />);
    const button = screen.getByRole('button', { name: label });
    fireEvent.press(button);
    await waitFor(() =>
      expect(showMessageToast).toHaveBeenCalledWith('activity', failureMessage),
    );
    expect(button.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(button);
    await waitFor(() =>
      expect(button.props.accessibilityState.busy).toBe(false),
    );
    expect(openUrl).toHaveBeenNthCalledWith(2, url);
  },
);

it('keeps the existing account recovery action available', () => {
  const screen = render(<SettingsScreen />);
  fireEvent.press(screen.getByRole('link', { name: 'Account & recovery' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/recovery');
});

it('opens the data export screen without requiring paid access', () => {
  const screen = render(<SettingsScreen />);
  fireEvent.press(screen.getByRole('link', { name: 'Export my data' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/export-data');
});

it('returns to the originating screen, or safely goes home when opened directly', () => {
  const screen = render(<SettingsScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  mockRouter.canGoBack.mockReturnValue(false);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(mockRouter.replace).toHaveBeenCalledWith('/');
});

it('uses distinct private email subjects, without account or activity attachments', async () => {
  const screen = render(<SettingsScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Get help' }));
  await waitFor(() => expect(openUrl).toHaveBeenCalledWith(supportContact));
  fireEvent.press(screen.getByRole('button', { name: 'Suggest a feature' }));
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
  const screen = render(<SettingsScreen />);
  const button = screen.getByRole('button', { name: 'Suggest a feature' });
  fireEvent.press(button);
  await waitFor(() =>
    expect(showMessageToast).toHaveBeenCalledWith(
      'activity',
      contactFailureMessage,
    ),
  );
  expect(button.props.accessibilityState.disabled).toBe(false);
});

it('disables missing policy and opens the existing Apple license destination without subtext', async () => {
  const screen = render(<SettingsScreen />);
  expect(
    screen.getByRole('button', { name: 'Privacy policy' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(screen.queryByText('Apple’s standard license agreement')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Terms of use' }));
  await waitFor(() => expect(openUrl).toHaveBeenCalledWith(appleStandardTerms));
});

it('opens configured public legal pages', async () => {
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL = 'https://example.com/privacy';
  process.env.EXPO_PUBLIC_TERMS_URL = 'https://example.com/terms';
  const screen = render(<SettingsScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Privacy policy' }));
  await waitFor(() =>
    expect(openUrl).toHaveBeenCalledWith('https://example.com/privacy'),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Terms of use' }));
  await waitFor(() =>
    expect(openUrl).toHaveBeenCalledWith('https://example.com/terms'),
  );
  expect(screen.queryByText('Apple’s standard license agreement')).toBeNull();
});
