import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import type { LinkProps } from 'expo-router';
import { NavigationLink, SettingsLink } from './NavigationLink';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Link: ({ href, replace, children, ...props }: Omit<LinkProps, 'ref'>) => (
      <Text
        {...props}
        accessibilityRole="link"
        onPress={() => mockNavigate(href, !!replace)}
      >
        {children}
      </Text>
    ),
  };
});

beforeEach(() => mockNavigate.mockClear());

it('keeps the Settings destination, accessible name and minimum touch height', async () => {
  const screen = await render(<SettingsLink />);
  const link = screen.getByRole('link', { name: 'Open Settings' });
  expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(
    44,
  );
  await fireEvent.press(link);
  expect(mockNavigate).toHaveBeenCalledWith('/settings', false);
});

it('preserves replacement navigation and caller styling for the recovery return link', async () => {
  const screen = await render(
    <NavigationLink href="/" replace style={{ textAlign: 'center' }}>
      Back to app
    </NavigationLink>,
  );
  const link = screen.getByRole('link', { name: 'Back to app' });
  expect(StyleSheet.flatten(link.props.style).textAlign).toBe('center');
  await fireEvent.press(link);
  expect(mockNavigate).toHaveBeenCalledWith('/', true);
});
