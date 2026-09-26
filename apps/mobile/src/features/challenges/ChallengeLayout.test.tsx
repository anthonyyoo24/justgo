import { render } from '@testing-library/react-native';
import { StyleSheet, Text } from 'react-native';
import { ChallengeLayout } from './ChallengeLayout';

jest.mock('expo-router', () => ({ Link: () => null }));

it('uses the Paper cream as the challenge screen surface', () => {
  const screen = render(
    <ChallengeLayout title="Find a challenge">
      <Text>Card area</Text>
    </ChallengeLayout>,
  );
  const surface = StyleSheet.flatten(
    screen.getByTestId('challenge-screen-surface').props.style,
  ).backgroundColor;
  expect(surface).toBe('#F9EFE8');
});
