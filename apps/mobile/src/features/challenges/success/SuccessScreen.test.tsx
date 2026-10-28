import { fireEvent, render } from '@testing-library/react-native';
import { SuccessScreen } from './SuccessScreen';
import {
  attempt,
  uuid,
  owner as mockOwner,
} from '../../../../test-support/journal';
let mockId: string | undefined;
let mockAccount: object | null;
let mockCollectionId: string | null;
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
jest.mock('../../../app-support/providers/AppProvider', () => ({
  useRuntime: () => mockRuntime,
  useIdentity: () => ({ account: mockAccount, collectionId: mockCollectionId }),
  useJournal: () => ({ accountId: mockOwner, getAttempt: mockGetAttempt }),
}));
beforeEach(() => {
  mockId = uuid(1);
  mockAccount = { userId: mockOwner };
  mockCollectionId = null;
  mockGetAttempt.mockReturnValue(attempt());
  mockRouter.replace.mockClear();
  mockRuntime.challenges.dismissSuccess.mockClear();
});
it('celebrates a local completion and continues without an HTTP lookup', async () => {
  const screen = await render(<SuccessScreen />);
  expect(screen.getByText('That’s a win!')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockRouter.replace).toHaveBeenCalledWith({
    pathname: '/reflection',
    params: { attemptId: uuid(1) },
  });
  expect(mockRuntime.challenges.dismissSuccess).not.toHaveBeenCalled();
});
it('continues a guest completion from its matching collection and rejects another collection', async () => {
  mockAccount = null;
  mockCollectionId = mockOwner;
  const screen = await render(<SuccessScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockRouter.replace).toHaveBeenCalledWith({
    pathname: '/reflection',
    params: { attemptId: uuid(1) },
  });
  mockCollectionId = uuid(99);
  await screen.rerender(<SuccessScreen />);
  expect(screen.queryByText('That’s a win!')).toBeNull();
});
it('does not show a different attempt or the old account result', async () => {
  mockId = uuid(2);
  mockGetAttempt.mockReturnValue(undefined);
  const screen = await render(<SuccessScreen />);
  expect(screen.queryByText('That’s a win!')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
  expect(mockRuntime.challenges.dismissSuccess).toHaveBeenCalled();
  mockId = uuid(1);
  mockAccount = null;
  await screen.rerender(<SuccessScreen />);
  expect(screen.queryByText('That’s a win!')).toBeNull();
});
it('handles a route with no completion ID', async () => {
  mockId = undefined;
  const screen = await render(<SuccessScreen />);
  expect(
    screen.getByText('Complete a challenge to see its result here.'),
  ).toBeTruthy();
});
