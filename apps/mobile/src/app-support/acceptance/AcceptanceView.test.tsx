import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Dimensions, type PressableProps } from 'react-native';
import type { ReactElement } from 'react';
import type { LinkProps } from 'expo-router';
import { AcceptanceView } from './AcceptanceView';

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  return {
    Link: ({ children, onPress }: LinkProps) =>
      React.cloneElement(children as ReactElement<PressableProps>, {
        onPress: (event) => onPress?.(event),
      }),
  };
});

function actions() {
  return {
    onContinue: jest.fn(),
    onOpenTerms: jest.fn(),
    onOpenPrivacy: jest.fn(),
  };
}

it('shows the data summary and document links without analytics, Sentry or development notices', () => {
  const props = actions();
  const screen = render(<AcceptanceView {...props} />);
  expect(screen.getByRole('header', { name: 'Terms & Privacy' })).toBeTruthy();
  expect(
    screen.getByRole('header', { name: 'Your data is yours' }),
  ).toBeTruthy();
  expect(
    screen.getByText(
      /You can use JustGO without signing in. Your challenge history, feelings and reflections stay on this phone/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(
      /If you choose to sign in, your account data syncs through JustGO’s cloud service/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(/first sign-in includes the entries you’ve saved/),
  ).toBeTruthy();
  expect(
    screen.getByText(/Your journal remains available when you log out/),
  ).toBeTruthy();
  expect(screen.queryByText(/choose whether to add/)).toBeNull();
  expect(
    screen.queryByText(/Sentry|Analytics|PostHog|Development legal drafts/i),
  ).toBeNull();
  expect(props.onContinue).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(props.onContinue).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('switch')).toBeNull();
});

it('keeps both legal actions usable while saving and blocks duplicate account creation', () => {
  const props = actions();
  const screen = render(
    <AcceptanceView {...props} busy busyLabel="Preparing your challenges" />,
  );
  const accept = screen.getByRole('button', { name: 'Continue' });
  expect(accept).toBeDisabled();
  expect(accept.props.accessibilityState.busy).toBe(true);
  expect(
    screen.getByRole('progressbar', { name: 'Preparing your challenges' }),
  ).toBeTruthy();
  fireEvent.press(accept);
  expect(props.onContinue).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('link', { name: 'Terms of Service' }));
  fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }));
  expect(props.onOpenTerms).toHaveBeenCalledTimes(1);
  expect(props.onOpenPrivacy).toHaveBeenCalledTimes(1);
});

it('restores Continue after account creation is no longer busy', () => {
  const props = actions();
  const screen = render(<AcceptanceView {...props} busy />);
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  expect(
    screen.getByRole('progressbar', { name: 'Preparing your challenges' }),
  ).toBeTruthy();
  screen.rerender(<AcceptanceView {...props} />);
  expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  expect(screen.queryByRole('progressbar')).toBeNull();
});

it('announces a red error without adding account controls', () => {
  const props = actions();
  const screen = render(
    <AcceptanceView {...props} error="Couldn’t connect. Please try again." />,
  );
  expect(screen.getByRole('alert').props.accessibilityLiveRegion).toBe(
    'polite',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.press(screen.getByRole('link', { name: 'Terms of Service' }));
  expect(screen.getByRole('alert')).toHaveStyle({ color: '#8B1E32' });
  expect(screen.queryByRole('button', { name: 'Account options' })).toBeNull();
  expect(props.onContinue).toHaveBeenCalledTimes(1);
  expect(props.onOpenTerms).toHaveBeenCalledTimes(1);
});

it('routes configured legal links through failure-aware openers without default navigation', () => {
  const props = actions();
  const screen = render(
    <AcceptanceView
      {...props}
      termsUrl="http://127.0.0.1:4000/legal/terms"
      privacyUrl="http://127.0.0.1:4000/legal/privacy"
    />,
  );
  const event = { preventDefault: jest.fn() };
  fireEvent.press(
    screen.getByRole('link', { name: 'Terms of Service' }),
    event,
  );
  fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }), event);
  expect(event.preventDefault).toHaveBeenCalledTimes(2);
  expect(props.onOpenTerms).toHaveBeenCalledTimes(1);
  expect(props.onOpenPrivacy).toHaveBeenCalledTimes(1);
});

it('updates body, headings and the action label when the system text size changes', () => {
  const original = Dimensions.get('window');
  const screen = render(<AcceptanceView {...actions()} />);
  try {
    act(() =>
      Dimensions.set({ window: { ...original, width: 320, fontScale: 2.4 } }),
    );
    expect(screen.getByText(/By continuing/).props.style).toMatchObject({
      fontSize: 31.2,
      lineHeight: 40.8,
    });
    expect(
      screen.getByRole('header', { name: 'Terms & Privacy' }).props.style
        .fontSize,
    ).toBeCloseTo(67.2);
    expect(screen.getByText('Continue').props.style.fontSize).toBeCloseTo(33.6);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeEnabled();
  } finally {
    act(() => Dimensions.set({ window: original }));
  }
});

it('lays out both legal links inside the same two-line text paragraph', () => {
  const screen = render(<AcceptanceView {...actions()} />);
  const agreement = screen.getByText(/^By continuing, you agree to our/);
  expect(agreement).toHaveTextContent(
    'By continuing, you agree to our Terms of Service and Privacy Policy.',
  );
  expect(
    within(agreement).getByRole('link', { name: 'Terms of Service' }),
  ).toBeTruthy();
  expect(
    within(agreement).getByRole('link', { name: 'Privacy Policy' }),
  ).toBeTruthy();
  expect(screen.queryByText('Account & data')).toBeNull();
  expect(screen.queryByText('Account & recovery')).toBeNull();
});
