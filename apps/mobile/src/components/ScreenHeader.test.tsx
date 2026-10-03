import { fireEvent, render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { ScreenHeader } from './ScreenHeader';

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  Link: ({ children, href }: { children: ReactElement; href: string }) =>
    require('react').cloneElement(children, {
      onPress: () => mockNavigate(href),
    }),
}));

it.each([1, 1.2])('keeps Settings accessible at header scale %s', (scale) => {
  mockNavigate.mockClear();
  const screen = render(<ScreenHeader title="Progress" scale={scale} />);
  expect(screen.getByRole('header', { name: 'Progress' })).toBeTruthy();
  const settings = screen.getByRole('link', { name: 'Open Settings' });
  const hitArea = StyleSheet.flatten(settings.props.style);
  expect(hitArea.width).toBeGreaterThanOrEqual(44);
  expect(hitArea.height).toBeGreaterThanOrEqual(44);
  fireEvent.press(settings);
  expect(mockNavigate).toHaveBeenCalledWith('/settings');
});
