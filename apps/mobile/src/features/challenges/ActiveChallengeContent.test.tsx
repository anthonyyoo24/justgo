import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { card } from '../../../test-support/journal';
import { ActiveChallengeContent } from './ActiveChallengeContent';

jest.mock('react-native-gesture-handler', () => ({ Gesture: {} }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: require('react-native').View },
}));
jest.mock('react-native-worklets', () => ({}));
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../app-support/saving/SavingFeedback', () => ({
  SavingSheetSurface: () => null,
}));
afterEach(() => jest.restoreAllMocks());

it.each(['load', 'error'])(
  'waits for native layout and both decorative assets before reporting readiness (%s)',
  (outcome) => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const ready = jest.fn();
    const screen = render(
      <ActiveChallengeContent
        start={{
          card,
          startedAt: new Date().toISOString(),
          startTimeZone: 'UTC',
          turn: 0,
        }}
        insets={{ top: 62, bottom: 34, left: 0, right: 0 }}
        error=""
        saving={false}
        completed={false}
        completionStarted={false}
        savingVisible={false}
        finish={jest.fn(async () => {})}
        onVisualReady={ready}
      />,
    );
    const art = screen.getByTestId('challenge-illustration', {
      includeHiddenElements: true,
    });
    const texture = screen.getByTestId('challenge-paper-texture', {
      includeHiddenElements: true,
    });
    fireEvent(art, outcome);
    fireEvent(texture, outcome);
    expect(ready).not.toHaveBeenCalled();
    fireEvent(screen.getByTestId('active-challenge-surface'), 'layout');
    expect(ready).toHaveBeenCalledTimes(1);
    fireEvent(art, outcome);
    expect(ready).toHaveBeenCalledTimes(1);
    screen.unmount();
  },
);
