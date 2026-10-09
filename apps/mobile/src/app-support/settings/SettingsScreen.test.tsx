import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { LinkProps } from 'expo-router';
import { Linking } from 'react-native';
import SettingsRoute from '../../app/settings';
import { SettingsScreen } from './SettingsScreen';
import { appleStandardTerms } from './legal-links';
import {
  supportContact,
  featureRequestContact,
  contactFailureMessage,
} from '../contact';
import { showMessageToast } from '../../platform/Toast';

let mockAccount: { userId: string } | null = {
  userId: 'disposable-test-account',
};
const mockRouter = {
  canGoBack: jest.fn(() => true),
  back: jest.fn(),
  replace: jest.fn(),
  push: jest.fn(),
};
jest.mock('../providers/AppProvider', () => ({
  useIdentity: () => ({ account: mockAccount }),
}));
jest.mock('../../platform/Toast', () => ({ showMessageToast: jest.fn() }));
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
const originalPrivacy = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
const originalTerms = process.env.EXPO_PUBLIC_TERMS_URL;
const openUrl = jest.spyOn(Linking, 'openURL');
beforeEach(() => {
  delete process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
  delete process.env.EXPO_PUBLIC_TERMS_URL;
  mockAccount = { userId: 'disposable-test-account' };
  mockRouter.canGoBack.mockReturnValue(true);
  mockRouter.back.mockClear();
  mockRouter.replace.mockClear();
  mockRouter.push.mockClear();
  openUrl.mockReset().mockResolvedValue(undefined);
  jest.mocked(showMessageToast).mockClear();
});
afterAll(() => {
  if (originalPrivacy === undefined)
    delete process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
  else process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL = originalPrivacy;
  if (originalTerms === undefined) delete process.env.EXPO_PUBLIC_TERMS_URL;
  else process.env.EXPO_PUBLIC_TERMS_URL = originalTerms;
  openUrl.mockRestore();
});

it('renders the actual route with scoped groups, honest pending controls and no reminders or reset', () => {
  const screen = render(<SettingsRoute />);
  for (const title of [
    'Settings',
    'Preferences',
    'Account & data',
    'Privacy',
    'Support',
    'Feature requests',
    'Legal',
  ])
    expect(screen.getByRole('header', { name: title })).toBeTruthy();
  for (const label of [
    'Haptics',
    'Reduce motion',
    'Export my data',
    'Delete account',
    'General analytics',
    'Sensitive metadata',
  ])
    expect(
      screen.getByLabelText(`${label}. Not available yet.`).props
        .accessibilityState.disabled,
    ).toBe(true);
  expect(screen.queryByText('Practice reminders')).toBeNull();
  expect(screen.queryByText('Reset progress')).toBeNull();
  expect(screen.queryAllByRole('tab')).toHaveLength(0);
  expect(screen.getByText('JustGO · Version 0.1.0')).toBeTruthy();
  expect(
    screen.getByText(/activity waiting to upload stays on this phone/),
  ).toBeTruthy();
});

it('opens existing account tools even when no account is connected', () => {
  mockAccount = null;
  const screen = render(<SettingsScreen />);
  expect(screen.getByText('Connect or recover your account')).toBeTruthy();
  fireEvent.press(screen.getByRole('link', { name: 'Account & recovery' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/recovery');
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

it('disables missing policy and identifies the existing Apple license destination', async () => {
  const screen = render(<SettingsScreen />);
  expect(
    screen.getByRole('button', { name: 'Privacy policy' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  expect(screen.getByText('Apple’s standard license agreement')).toBeTruthy();
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
