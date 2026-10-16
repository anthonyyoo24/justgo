import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { Modal, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChallengeSnapshot } from '../../../features/challenges/controller';
import { card } from '../../../../test-support/journal';
import { WelcomePreparationCover } from './WelcomePreparationCover';
import { WelcomeView } from './WelcomeView';

const mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };
const mockListeners = new Set<() => void>();
let mockState: ChallengeSnapshot;
jest.mock('../../providers/AppProvider', () => ({
  useRuntime: () => ({
    challenges: {
      getSnapshot: () => mockState,
      subscribe: (listener: () => void) => {
        mockListeners.add(listener);
        return () => mockListeners.delete(listener);
      },
    },
  }),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(() => mockInsets),
}));

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['performance'] });
  jest.clearAllMocks();
  jest.mocked(useSafeAreaInsets).mockReturnValue(mockInsets);
  mockState = {
    selected: 'streets',
    queues: {},
    loading: true,
    saving: false,
    completionStarted: false,
    success: null,
    error: '',
  };
});
afterEach(async () => {
  await act(async () => cleanup());
  await act(async () => jest.advanceTimersByTimeAsync(0));
  expect(mockListeners.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});

it('retains the welcome surface through a network error and makes Continue retry', () => {
  const onRetry = jest.fn();
  const onShow = jest.fn();
  const screen = render(
    <WelcomePreparationCover
      preparing
      attempt={0}
      onShow={onShow}
      onRetry={onRetry}
    />,
  );
  expect(
    screen.getByRole('progressbar', { name: 'Preparing your challenges' }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  fireEvent(screen.UNSAFE_getByType(Modal), 'show');
  expect(onShow).toHaveBeenCalledTimes(1);
  act(() => {
    mockState = {
      ...mockState,
      loading: false,
      error:
        'Your challenges couldn’t load. Check your connection and try again.',
    };
    mockListeners.forEach((listener) => listener());
  });
  expect(screen.getByRole('alert')).toHaveTextContent(mockState.error);
  expect(screen.getByText('JustGO')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
  expect(onRetry).toHaveBeenCalledTimes(1);
});

it('times out stalled assets after 15 seconds and gives a retry attempt its full interval', () => {
  mockState = {
    ...mockState,
    loading: false,
    queues: { streets: { turn: 0, cards: [{ ...card, venue: 'streets' }] } },
  };
  const props = { preparing: true, onShow: jest.fn(), onRetry: jest.fn() };
  const screen = render(<WelcomePreparationCover {...props} attempt={0} />);
  act(() => jest.advanceTimersByTime(14_999));
  expect(screen.queryByRole('alert')).toBeNull();
  act(() => jest.advanceTimersByTime(1));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Your challenges are taking longer to prepare. Please try again.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(props.onRetry).toHaveBeenCalledTimes(1);
  screen.rerender(<WelcomePreparationCover {...props} attempt={1} />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  act(() => jest.advanceTimersByTime(14_999));
  expect(screen.queryByRole('alert')).toBeNull();
  act(() => jest.advanceTimersByTime(1));
  expect(screen.getByRole('alert')).toBeTruthy();
  screen.rerender(
    <WelcomePreparationCover {...props} preparing={false} attempt={1} />,
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(
    screen.getByRole('progressbar', { name: 'Creating your account' }),
  ).toBeTruthy();
});

it('cancels the previous attempt timer when retried before expiry', () => {
  mockState = { ...mockState, loading: false };
  const props = { preparing: true, onShow: jest.fn(), onRetry: jest.fn() };
  const screen = render(<WelcomePreparationCover {...props} attempt={0} />);
  act(() => jest.advanceTimersByTime(10_000));
  screen.rerender(<WelcomePreparationCover {...props} attempt={1} />);
  act(() => jest.advanceTimersByTime(5_000));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(jest.getTimerCount()).toBe(1);
  screen.unmount();
  expect(jest.getTimerCount()).toBe(0);
});

it('uses the root’s measured insets on the first modal layout without doubling them', () => {
  jest
    .mocked(useSafeAreaInsets)
    .mockReturnValueOnce(mockInsets)
    .mockReturnValueOnce({ top: 0, bottom: 0, left: 0, right: 0 });
  const screen = render(
    <WelcomePreparationCover
      preparing
      attempt={0}
      onShow={jest.fn()}
      onRetry={jest.fn()}
    />,
  );
  const modal = screen.UNSAFE_getByType(Modal);
  expect(modal.props).toMatchObject({
    visible: true,
    animationType: 'none',
    presentationStyle: 'fullScreen',
  });
  expect(screen.UNSAFE_getByType(WelcomeView).props.insets).toEqual(mockInsets);
  expect(
    StyleSheet.flatten(
      screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle,
    ),
  ).toMatchObject({ paddingBottom: 34 });
});
