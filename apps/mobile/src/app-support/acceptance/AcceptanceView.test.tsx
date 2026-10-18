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
    onAccept: jest.fn(),
    onOpenTerms: jest.fn(),
    onOpenPrivacy: jest.fn(),
  };
}

it('discloses the saved data and account-linked analytics scope before explicit acceptance', () => {
  const props = actions();
  const screen = render(<AcceptanceView {...props} />);
  expect(screen.getByRole('header', { name: 'Terms & Privacy' })).toBeTruthy();
  expect(
    screen.getByRole('header', { name: 'Your data is yours' }),
  ).toBeTruthy();
  expect(
    screen.getByText(/saved on your phone and to your private JustGO account/),
  ).toBeTruthy();
  expect(
    screen.getByText(
      /feeling selections and approximate reflection lengths through PostHog/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(
      /A random identifier links this information to your account/,
    ),
  ).toBeTruthy();
  expect(
    screen.getByText(/Your written reflections are never sent to analytics/),
  ).toBeTruthy();
  expect(props.onAccept).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'I Accept' }));
  expect(props.onAccept).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('switch')).toBeNull();
});

it('keeps both legal actions usable while saving and blocks duplicate acceptance', () => {
  const props = actions();
  const screen = render(
    <AcceptanceView {...props} busy busyLabel="Creating your account" />,
  );
  const accept = screen.getByRole('button', { name: 'I Accept' });
  expect(accept).toBeDisabled();
  expect(accept.props.accessibilityState.busy).toBe(true);
  expect(
    screen.getByRole('progressbar', { name: 'Creating your account' }),
  ).toBeTruthy();
  fireEvent.press(accept);
  expect(props.onAccept).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('link', { name: 'Terms of Service' }));
  fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }));
  expect(props.onOpenTerms).toHaveBeenCalledTimes(1);
  expect(props.onOpenPrivacy).toHaveBeenCalledTimes(1);
});

it('distinguishes receipt hydration from saving and restores the acceptance action afterward', () => {
  const props = actions();
  const screen = render(<AcceptanceView {...props} checking />);
  expect(screen.getByRole('button', { name: 'I Accept' })).toBeDisabled();
  expect(
    screen.getByRole('progressbar', { name: 'Checking your acceptance' }),
  ).toBeTruthy();
  screen.rerender(<AcceptanceView {...props} />);
  expect(screen.getByRole('button', { name: 'I Accept' })).toBeEnabled();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByText('I Accept')).toBeTruthy();
});

it('announces a red error without adding account controls', () => {
  const props = actions();
  const screen = render(
    <AcceptanceView
      {...props}
      error="Couldn’t save your acceptance. Please try again."
      legalNotice="Development legal drafts — not final release documents."
    />,
  );
  expect(screen.getByRole('alert').props.accessibilityLiveRegion).toBe(
    'polite',
  );
  expect(
    screen.getByText('Development legal drafts — not final release documents.'),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'I Accept' }));
  fireEvent.press(screen.getByRole('link', { name: 'Terms of Service' }));
  expect(screen.getByRole('alert')).toHaveStyle({ color: '#8B1E32' });
  expect(screen.queryByRole('button', { name: 'Account options' })).toBeNull();
  expect(props.onAccept).toHaveBeenCalledTimes(1);
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
    expect(screen.getByText('I Accept').props.style.fontSize).toBeCloseTo(33.6);
    expect(screen.getByRole('button', { name: 'I Accept' })).toBeEnabled();
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
