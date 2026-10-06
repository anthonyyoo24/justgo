import { fireEvent, render } from '@testing-library/react-native';
import { SuccessScreen } from './SuccessScreen';
import {
  attempt,
  uuid,
  owner as mockOwner,
} from '../../../test-support/journal';
let mockId: string | undefined;
let mockAccount: object | null;
const mockGetAttempt = jest.fn();
const mockRuntime = {
  challenges: {
    dismissSuccess: jest.fn(),
    getSnapshot: () => ({ success: attempt() }),
  },
};
const mockRouter = { replace: jest.fn() };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ attemptId: mockId }),
  useRouter: () => mockRouter,
  Link: () => null,
}));
jest.mock('../../app-support/providers/AppProvider', () => ({
  useRuntime: () => mockRuntime,
  useIdentity: () => ({ account: mockAccount }),
  useJournal: () => ({ accountId: mockOwner, getAttempt: mockGetAttempt }),
}));
beforeEach(() => {
  mockId = uuid(1);
  mockAccount = { userId: mockOwner };
  mockGetAttempt.mockReturnValue(attempt());
  mockRouter.replace.mockClear();
  mockRuntime.challenges.dismissSuccess.mockClear();
});
it('celebrates a local completion and continues without an HTTP lookup', () => {
  const screen = render(<SuccessScreen />);
  expect(screen.getByText('That’s a win!')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockRouter.replace).toHaveBeenCalledWith({
    pathname: '/reflection',
    params: { attemptId: uuid(1) },
  });
  expect(mockRuntime.challenges.dismissSuccess).not.toHaveBeenCalled();
});
it('does not show a different attempt or the old account result', () => {
  mockId = uuid(2);
  mockGetAttempt.mockReturnValue(undefined);
  const screen = render(<SuccessScreen />);
  expect(screen.queryByText('That’s a win!')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
  expect(mockRuntime.challenges.dismissSuccess).toHaveBeenCalled();
  mockId = uuid(1);
  mockAccount = null;
  screen.rerender(<SuccessScreen />);
  expect(screen.queryByText('That’s a win!')).toBeNull();
});
it('handles a route with no completion ID', () => {
  mockId = undefined;
  const screen = render(<SuccessScreen />);
  expect(
    screen.getByText('Complete a challenge to see its result here.'),
  ).toBeTruthy();
});
