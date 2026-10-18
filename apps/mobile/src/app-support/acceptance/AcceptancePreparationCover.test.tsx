import { act, cleanup, fireEvent, render } from '@testing-library/react-native';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChallengeSnapshot } from '../../features/challenges/controller';
import { card } from '../../../test-support/journal';
import { AcceptancePreparationCover } from './AcceptancePreparationCover';
import { AcceptanceView } from './AcceptanceView';

const mockInsets = { top: 47, bottom: 34, left: 0, right: 0 };
const mockListeners = new Set<() => void>();
let mockState: ChallengeSnapshot;
jest.mock('../providers/AppProvider', () => ({
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
jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../lib/legal-links', () => ({
  getLegalLinks: () => ({
    terms: null,
    privacy: null,
    development: false,
  }),
}));
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

it('retains Terms through access and deck preparation, with a deck-only retry after failure', () => {
  const onRetry = jest.fn();
  const onShow = jest.fn();
  const screen = render(
    <AcceptancePreparationCover
      preparing
      attempt={0}
      onShow={onShow}
      onRetry={onRetry}
    />,
  );
  expect(
    screen.getByRole('progressbar', { name: 'Preparing your challenges' }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'I Accept' })).toBeDisabled();
  expect(screen.getByRole('header', { name: 'Terms & Privacy' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(screen.queryByText('A little courage.\nEvery day.')).toBeNull();
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
  expect(screen.queryByText('JustGO')).toBeNull();
  expect(screen.queryByRole('progressbar')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
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
  const screen = render(<AcceptancePreparationCover {...props} attempt={0} />);
  act(() => jest.advanceTimersByTime(14_999));
  expect(screen.queryByRole('alert')).toBeNull();
  act(() => jest.advanceTimersByTime(1));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Your challenges are taking longer to prepare. Please try again.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(props.onRetry).toHaveBeenCalledTimes(1);
  screen.rerender(<AcceptancePreparationCover {...props} attempt={1} />);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'I Accept' })).toBeDisabled();
  act(() => jest.advanceTimersByTime(14_999));
  expect(screen.queryByRole('alert')).toBeNull();
  act(() => jest.advanceTimersByTime(1));
  expect(screen.getByRole('alert')).toBeTruthy();
  screen.rerender(
    <AcceptancePreparationCover {...props} preparing={false} attempt={1} />,
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(
    screen.getByRole('progressbar', { name: 'Checking your access' }),
  ).toBeTruthy();
});

it('cancels the previous attempt timer when retried before expiry', () => {
  mockState = { ...mockState, loading: false };
  const props = { preparing: true, onShow: jest.fn(), onRetry: jest.fn() };
  const screen = render(<AcceptancePreparationCover {...props} attempt={0} />);
  act(() => jest.advanceTimersByTime(10_000));
  screen.rerender(<AcceptancePreparationCover {...props} attempt={1} />);
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
    <AcceptancePreparationCover
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
  expect(screen.UNSAFE_getByType(AcceptanceView).props.insets).toEqual(
    mockInsets,
  );
  const styles = screen
    .UNSAFE_getAllByType(View)
    .map((view) => StyleSheet.flatten(view.props.style));
  expect(styles).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ paddingTop: 47 }),
      expect.objectContaining({ paddingBottom: 34 }),
    ]),
  );
});

it('preserves legal-link failure feedback while the accepted account is preparing', async () => {
  const screen = render(
    <AcceptancePreparationCover
      preparing={false}
      attempt={0}
      onShow={jest.fn()}
      onRetry={jest.fn()}
    />,
  );
  await act(async () => {
    fireEvent.press(screen.getByRole('link', { name: 'Terms of Service' }));
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Couldn’t open the Terms of Service. Please try again.',
  );
  expect(screen.getByRole('button', { name: 'I Accept' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
});
