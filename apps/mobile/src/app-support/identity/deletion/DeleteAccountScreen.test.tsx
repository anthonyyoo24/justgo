import { fireEvent, render } from '@testing-library/react-native';
import DeleteAccountRoute from '../../../app/delete-account';

const mockDelete = jest.fn(),
  mockRetry = jest.fn(),
  mockPush = jest.fn(),
  mockReplace = jest.fn();
let mockState = {
  account: { userId: 'owner' } as { userId: string } | null,
  busy: false,
  deletionStatus: null as 'pending' | 'cleanup' | 'deleted' | null,
  message: '',
};
jest.mock('../../providers/AppProvider', () => ({
  useIdentity: () => mockState,
  useRuntime: () => ({
    identity: { deleteAccount: mockDelete, retry: mockRetry },
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    canGoBack: () => false,
  }),
}));
jest.mock('../../../platform/subscriptions/open-subscriptions', () => ({
  openSubscriptionManagement: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../platform/toast/Toast', () => ({
  showMessageToast: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockDelete.mockResolvedValue(undefined);
  mockRetry.mockResolvedValue(undefined);
  mockState = {
    account: { userId: 'owner' },
    busy: false,
    deletionStatus: null,
    message: '',
  };
});
it('requires explicit confirmation and leaves header Back as the way out', () => {
  const s = render(<DeleteAccountRoute />);
  expect(s.getByText(/This cannot be undone/)).toBeTruthy();
  expect(s.queryByLabelText('Delete account permanently')).toBeNull();
  fireEvent.press(s.getByLabelText('Continue to deletion'));
  expect(mockDelete).not.toHaveBeenCalled();
  expect(s.queryByRole('button', { name: /^Cancel$/ })).toBeNull();
  fireEvent.press(s.getByLabelText('Back'));
  expect(mockReplace).toHaveBeenCalledWith('/settings');
  expect(mockDelete).not.toHaveBeenCalled();
  fireEvent.press(s.getByLabelText('Delete account permanently'));
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
it('explains subscription cancellation separately and keeps deletion available', () => {
  const s = render(<DeleteAccountRoute />);
  expect(s.getByText(/does not cancel an Apple subscription/)).toBeTruthy();
  expect(s.getByLabelText('Cancel subscription')).toBeEnabled();
  expect(s.queryByLabelText('Manage Apple subscriptions')).toBeNull();
  expect(s.getByLabelText('Continue to deletion')).toBeEnabled();
});
it('requires a new confirmation after the connected account changes', () => {
  const s = render(<DeleteAccountRoute />);
  fireEvent.press(s.getByLabelText('Continue to deletion'));
  mockState = { ...mockState, account: { userId: 'other' } };
  s.rerender(<DeleteAccountRoute />);
  expect(s.queryByLabelText('Delete account permanently')).toBeNull();
  expect(s.getByLabelText('Continue to deletion')).toBeTruthy();
});
it.each(['pending', 'cleanup'] as const)(
  'resumes %s without letting the user replace an accepted deletion',
  (status) => {
    mockState = { ...mockState, account: null, deletionStatus: status };
    const s = render(<DeleteAccountRoute />);
    fireEvent.press(s.getByLabelText('Finish deletion'));
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(s.queryByLabelText('Cancel')).toBeNull();
    expect(s.queryByLabelText('Connect account')).toBeNull();
  },
);
it('guards disconnected, busy and deleted states', () => {
  mockState.account = null;
  const s = render(<DeleteAccountRoute />);
  fireEvent.press(s.getByLabelText('Connect account'));
  expect(mockPush).toHaveBeenCalledWith('/recovery');
  mockState = { ...mockState, account: { userId: 'owner' }, busy: true };
  s.rerender(<DeleteAccountRoute />);
  expect(s.getByLabelText('Continue to deletion')).toBeDisabled();
  mockState = {
    ...mockState,
    account: null,
    busy: false,
    deletionStatus: 'deleted',
  };
  s.rerender(<DeleteAccountRoute />);
  expect(
    s.getByText(/This phone’s account data has been cleared/),
  ).toBeTruthy();
  expect(s.queryByLabelText('Continue to deletion')).toBeNull();
  expect(s.queryByLabelText('Cancel subscription')).toBeNull();
});
