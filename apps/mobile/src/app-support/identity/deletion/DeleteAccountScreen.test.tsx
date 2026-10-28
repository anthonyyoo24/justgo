import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import DeleteAccountRoute from '../../../app/delete-account';
import { DeleteAccountConfirmation } from './DeleteAccountConfirmation';

jest.mock('./DeleteAccountConfirmation', () => {
  const actual = jest.requireActual<
    typeof import('./DeleteAccountConfirmation')
  >('./DeleteAccountConfirmation');
  return {
    DeleteAccountConfirmation: jest.fn(actual.DeleteAccountConfirmation),
  };
});
import { preloadWelcomeArtwork } from '../welcome/welcome-artwork';

jest.mock('../welcome/welcome-artwork', () => ({
  preloadWelcomeArtwork: jest.fn().mockResolvedValue(true),
}));

const mockDelete = jest.fn(),
  mockRetry = jest.fn(),
  mockPush = jest.fn(),
  mockReplace = jest.fn();
let mockFocusCleanup: (() => void) | void;
let mockAppStateChange: (state: AppStateStatus) => void;
const mockRemoveAppStateListener = jest.fn();
let finishDelete: (() => void) | undefined;
let finishRetry: (() => void) | undefined;
const mockIdentityListeners = new Set<() => void>();
let mockState = {
  account: { userId: 'owner' } as { userId: string } | null,
  busy: false,
  deletionStatus: null as 'pending' | 'cleanup' | 'deleted' | null,
  message: '',
};
const mockIdentity = {
  deleteAccount: mockDelete,
  retry: mockRetry,
  getSnapshot: () => mockState,
  subscribe: (listener: () => void) => {
    mockIdentityListeners.add(listener);
    return () => {
      mockIdentityListeners.delete(listener);
    };
  },
};
async function rerender(s: Awaited<ReturnType<typeof render>>) {
  await act(() => {
    mockIdentityListeners.forEach((listener) => listener());
  });
  await s.rerender(<DeleteAccountRoute />);
}
jest.mock('../../providers/AppProvider', () => ({
  useIdentity: () => mockState,
  useRuntime: () => ({
    identity: mockIdentity,
  }),
}));
jest.mock('expo-router', () => {
  const React = require('react') as typeof import('react');
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
    useRouter: () => ({
      push: mockPush,
      replace: mockReplace,
      canGoBack: () => false,
    }),
    useFocusEffect: (callback: () => void | (() => void)) =>
      React.useEffect(() => {
        const cleanup = callback();
        mockFocusCleanup = cleanup;
        return cleanup;
      }, [callback]),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('../../../platform/subscriptions/open-subscriptions', () => ({
  openSubscriptionManagement: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../platform/toast/Toast', () => ({
  showMessageToast: jest.fn(),
}));
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      mockAppStateChange = listener;
      return { remove: mockRemoveAppStateListener };
    });
  mockFocusCleanup = undefined;
  finishDelete = undefined;
  finishRetry = undefined;
  mockDelete.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishDelete = resolve;
      }),
  );
  mockRetry.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishRetry = resolve;
      }),
  );
  mockState = {
    account: { userId: 'owner' },
    busy: false,
    deletionStatus: null,
    message: '',
  };
});
afterEach(async () => {
  await act(async () => {
    finishDelete?.();
    finishRetry?.();
  });
  jest.restoreAllMocks();
});
it('opens a centered confirmation, cancels safely and requires a fresh explicit delete', async () => {
  const s = await render(<DeleteAccountRoute />);
  expect(preloadWelcomeArtwork).not.toHaveBeenCalled();
  expect(s.getByText(/This cannot be undone/)).toBeTruthy();
  expect(s.getByText(/in associated iCloud copies/)).toBeTruthy();
  expect(s.queryByText(/enabled iCloud copy/)).toBeNull();
  expect(s.queryByLabelText('Delete your account?')).toBeNull();
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  expect(preloadWelcomeArtwork).toHaveBeenCalledTimes(1);
  expect(s.getByLabelText('Delete your account?')).toHaveProp(
    'role',
    'alertdialog',
  );
  expect(s.getByLabelText('Delete your account?')).toHaveProp(
    'aria-modal',
    true,
  );
  expect(
    s.getByText(
      'Your account, progress and journal on this phone, in JustGO’s cloud and in associated iCloud copies will be permanently deleted. Downloaded files you saved elsewhere remain under your control.\n\nDeleting your account does not cancel an App Store subscription. Manage subscriptions separately in your device’s Settings.',
    ),
  ).toBeTruthy();
  expect(mockDelete).not.toHaveBeenCalled();
  await fireEvent.press(s.getByRole('button', { name: 'Cancel' }));
  expect(s.queryByLabelText('Delete your account?')).toBeNull();
  expect(mockDelete).not.toHaveBeenCalled();
  await fireEvent.press(s.getByLabelText('Back'));
  expect(mockReplace).toHaveBeenCalledWith('/settings');
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  const accept = jest.mocked(DeleteAccountConfirmation).mock.lastCall![0]
    .onConfirm as () => void;
  await act(() => {
    accept();
    accept();
  });
  expect(s.getByRole('progressbar', { name: 'Deleting account' })).toBeTruthy();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
it('treats the native back/Escape dismissal as cancellation', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  await act(() =>
    s.container
      .queryAll((node) => typeof node.props.onRequestClose === 'function')[0]!
      .props.onRequestClose(),
  );
  expect(s.queryByLabelText('Delete your account?')).toBeNull();
  expect(mockDelete).not.toHaveBeenCalled();
});
it('rejects callbacks from a canceled confirmation after reopening for the same account', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  const stale = {
    onConfirm: jest.mocked(DeleteAccountConfirmation).mock.lastCall![0]
      .onConfirm as () => void,
    onCancel: jest.mocked(DeleteAccountConfirmation).mock.lastCall![0]
      .onCancel as () => void,
  };
  await fireEvent.press(s.getByRole('button', { name: 'Cancel' }));
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  await act(stale.onConfirm);
  await act(stale.onCancel);
  expect(mockDelete).not.toHaveBeenCalled();
  expect(s.getByLabelText('Delete your account?')).toBeTruthy();
  await fireEvent.press(s.getByRole('button', { name: 'Delete' }));
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
it('keeps failure feedback inside confirmation and fences it from another account', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  await fireEvent.press(s.getByRole('button', { name: 'Delete' }));
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(s.getByLabelText('Delete your account?')).toBeTruthy();
  mockState = {
    ...mockState,
    account: null,
    message: 'Recover your account before trying again.',
  };
  await rerender(s);
  await act(async () => finishDelete?.());
  expect(
    within(s.getByLabelText('Delete your account?')).getByRole('alert'),
  ).toHaveTextContent('Recover your account before trying again.');
  expect(s.getByRole('button', { name: 'Delete' })).toBeDisabled();
  mockState = { ...mockState, account: { userId: 'other' } };
  await rerender(s);
  expect(s.queryByText('Recover your account before trying again.')).toBeNull();
  expect(s.getByLabelText('Continue to deletion')).toBeEnabled();
});
it('explains subscription cancellation separately and keeps deletion available', async () => {
  const s = await render(<DeleteAccountRoute />);
  expect(s.getByText(/does not cancel an Apple subscription/)).toBeTruthy();
  expect(s.getByLabelText('Cancel subscription')).toBeEnabled();
  expect(s.queryByLabelText('Manage Apple subscriptions')).toBeNull();
  expect(s.getByLabelText('Continue to deletion')).toBeEnabled();
});
it('requires a new confirmation after the connected account changes', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  const staleAccept = jest.mocked(DeleteAccountConfirmation).mock.lastCall![0]
    .onConfirm as () => void;
  mockState = { ...mockState, account: { userId: 'other' } };
  await rerender(s);
  expect(s.queryByLabelText('Delete your account?')).toBeNull();
  await act(staleAccept);
  expect(mockDelete).not.toHaveBeenCalled();
  mockState = { ...mockState, account: { userId: 'owner' } };
  await rerender(s);
  expect(s.queryByLabelText('Delete your account?')).toBeNull();
  expect(s.getByLabelText('Continue to deletion')).toBeTruthy();
});
it.each(['busy', 'account', 'pending'] as const)(
  'rechecks the live %s state before accepting an already queued confirmation',
  async (change) => {
    const s = await render(<DeleteAccountRoute />);
    await fireEvent.press(s.getByLabelText('Continue to deletion'));
    const accept = jest.mocked(DeleteAccountConfirmation).mock.lastCall![0]
      .onConfirm as () => void;
    if (change === 'busy') mockState = { ...mockState, busy: true };
    else if (change === 'account')
      mockState = { ...mockState, account: { userId: 'other' } };
    else mockState = { ...mockState, deletionStatus: 'pending' };
    await act(accept);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockRetry).not.toHaveBeenCalled();
    if (change === 'busy')
      expect(s.getByLabelText('Delete your account?')).toBeTruthy();
    else expect(s.queryByLabelText('Delete your account?')).toBeNull();
  },
);
it('closes confirmation on navigation blur and ignores its stale callback', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  const accept = jest.mocked(DeleteAccountConfirmation).mock.lastCall![0]
    .onConfirm as () => void;
  await act(() => mockFocusCleanup?.());
  expect(s.queryByLabelText('Delete your account?')).toBeNull();
  await act(accept);
  expect(mockDelete).not.toHaveBeenCalled();
});
it('closes confirmation when backgrounded and cleans up its lifecycle listener', async () => {
  const s = await render(<DeleteAccountRoute />);
  for (const status of ['inactive', 'background'] as const) {
    await fireEvent.press(s.getByLabelText('Continue to deletion'));
    await act(() => mockAppStateChange('active'));
    expect(s.getByLabelText('Delete your account?')).toBeTruthy();
    await act(() => mockAppStateChange(status));
    expect(s.queryByLabelText('Delete your account?')).toBeNull();
  }
  expect(mockDelete).not.toHaveBeenCalled();
  await s.unmount();
  expect(mockRemoveAppStateListener).toHaveBeenCalledTimes(1);
});
it.each(['pending', 'cleanup'] as const)(
  'resumes %s without letting the user replace an accepted deletion',
  async (status) => {
    mockState = { ...mockState, account: null, deletionStatus: status };
    const s = await render(<DeleteAccountRoute />);
    expect(s.getByLabelText('Delete your account?')).toBeTruthy();
    await fireEvent.press(s.getByRole('button', { name: 'Delete' }));
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(s.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(s.queryByLabelText('Connect account')).toBeNull();
  },
);
it('guards disconnected, busy and deleted states', async () => {
  mockState.account = null;
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Connect account'));
  expect(mockPush).toHaveBeenCalledWith('/recovery');
  mockState = { ...mockState, account: { userId: 'owner' }, busy: true };
  await rerender(s);
  expect(s.getByLabelText('Continue to deletion')).toBeDisabled();
  mockState = {
    ...mockState,
    account: null,
    busy: false,
    deletionStatus: 'deleted',
  };
  await rerender(s);
  expect(s.getByText('Redirect: /welcome')).toBeTruthy();
  expect(s.queryByLabelText('Back')).toBeNull();
  expect(s.queryByLabelText('Continue to deletion')).toBeNull();
  expect(s.queryByLabelText('Cancel subscription')).toBeNull();
});

it('replaces the delete label with a spinner and prevents dismissal throughout the request', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  const staleCancel = jest.mocked(DeleteAccountConfirmation).mock.lastCall![0]
    .onCancel as () => void;
  await fireEvent.press(s.getByRole('button', { name: 'Delete' }));
  const dialog = within(s.getByLabelText('Delete your account?'));
  expect(dialog.queryByText('Delete')).toBeNull();
  expect(
    dialog.getByRole('progressbar', { name: 'Deleting account' }),
  ).toBeTruthy();
  expect(dialog.getByRole('button', { name: 'Delete' })).toBeDisabled();
  expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await act(() => {
    staleCancel();
    s.container
      .queryAll((node) => typeof node.props.onRequestClose === 'function')[0]!
      .props.onRequestClose();
    mockAppStateChange('background');
  });
  mockState = {
    ...mockState,
    account: null,
    busy: true,
    deletionStatus: 'pending',
  };
  await rerender(s);
  expect(s.getByLabelText('Delete your account?')).toBeTruthy();
  expect(s.getAllByRole('progressbar')).toHaveLength(1);
  expect(s.queryByText('Finish account deletion')).toBeNull();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

it('shows failures only below the modal copy, clears them on retry and closes after successful cleanup', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  await fireEvent.press(s.getByRole('button', { name: 'Delete' }));
  mockState = {
    ...mockState,
    account: null,
    deletionStatus: 'pending',
    message: 'The account service is unavailable. Please retry shortly.',
  };
  await rerender(s);
  await act(async () => finishDelete?.());
  const dialog = within(s.getByLabelText('Delete your account?'));
  expect(dialog.getByRole('alert')).toHaveTextContent(mockState.message);
  expect(dialog.getByRole('alert')).toHaveStyle({ color: '#B3261E' });
  expect(s.getAllByRole('alert')).toHaveLength(1);
  expect(dialog.getByRole('button', { name: 'Delete' })).toBeEnabled();
  await fireEvent.press(dialog.getByRole('button', { name: 'Delete' }));
  expect(mockRetry).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(s.queryByRole('alert')).toBeNull();
  expect(s.getByRole('progressbar', { name: 'Deleting account' })).toBeTruthy();
  mockState = {
    ...mockState,
    deletionStatus: 'deleted',
    message: 'Your account has been deleted.',
  };
  await rerender(s);
  await act(async () => finishRetry?.());
  expect(s.queryByLabelText('Delete your account?')).toBeNull();
  expect(s.getByText('Redirect: /welcome')).toBeTruthy();
  expect(s.queryByRole('progressbar')).toBeNull();
});

it('keeps the warning unchanged through server deletion and local cleanup until welcome replaces it', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  const warning = s.getByText(
    /Your account, progress and journal on this phone/,
  ).props.children;
  await fireEvent.press(s.getByRole('button', { name: 'Delete' }));
  for (const deletionStatus of ['pending', 'cleanup'] as const) {
    mockState = { ...mockState, account: null, busy: true, deletionStatus };
    await rerender(s);
    const dialog = within(s.getByLabelText('Delete your account?'));
    expect(dialog.getByText(warning)).toBeTruthy();
    expect(
      dialog.queryByText(/Finish clearing this phone’s account data/),
    ).toBeNull();
    expect(
      dialog.getByRole('progressbar', { name: 'Deleting account' }),
    ).toBeTruthy();
  }
  mockState = { ...mockState, deletionStatus: 'deleted' };
  await rerender(s);
  await act(async () => finishDelete?.());
  expect(s.getByText('Redirect: /welcome')).toBeTruthy();
  expect(s.queryByLabelText('Delete your account?')).toBeNull();
});

it('explains failed cleanup after the attempt stops and retains that copy during retry', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  await fireEvent.press(s.getByRole('button', { name: 'Delete' }));
  mockState = {
    ...mockState,
    account: null,
    busy: false,
    deletionStatus: 'cleanup',
    message: 'Secure storage is unavailable.',
  };
  await rerender(s);
  expect(s.queryByText(/Finish clearing this phone’s account data/)).toBeNull();
  await act(async () => finishDelete?.());
  const dialog = within(s.getByLabelText('Delete your account?'));
  expect(
    dialog.getByText(/Finish clearing this phone’s account data/),
  ).toBeTruthy();
  expect(dialog.getByRole('alert')).toHaveTextContent(mockState.message);
  await fireEvent.press(dialog.getByRole('button', { name: 'Delete' }));
  expect(mockRetry).toHaveBeenCalledTimes(1);
  expect(
    dialog.getByText(/Finish clearing this phone’s account data/),
  ).toBeTruthy();
  expect(
    dialog.queryByText(/Your account, progress and journal on this phone/),
  ).toBeNull();
  expect(dialog.queryByRole('alert')).toBeNull();
  expect(
    dialog.getByRole('progressbar', { name: 'Deleting account' }),
  ).toBeTruthy();
});

it('keeps an old-build preflight error in the modal without adding page feedback', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  await fireEvent.press(s.getByRole('button', { name: 'Delete' }));
  mockState = {
    ...mockState,
    message: 'Update JustGO to delete your account securely.',
  };
  await rerender(s);
  await act(async () => finishDelete?.());
  expect(
    within(s.getByLabelText('Delete your account?')).getByRole('alert'),
  ).toHaveTextContent(mockState.message);
  await fireEvent.press(s.getByRole('button', { name: 'Cancel' }));
  expect(s.queryByText(mockState.message)).toBeNull();
  expect(s.getByLabelText('Continue to deletion')).toBeEnabled();
});

it('can dismiss and reopen a pending error without losing the durable retry', async () => {
  mockState = {
    ...mockState,
    account: null,
    deletionStatus: 'pending',
    message: 'Please retry when connected.',
  };
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByRole('button', { name: 'Cancel' }));
  expect(s.queryByRole('alert')).toBeNull();
  expect(s.queryByLabelText('Delete your account?')).toBeNull();
  await fireEvent.press(s.getByRole('button', { name: 'Finish deletion' }));
  expect(
    within(s.getByLabelText('Delete your account?')).getByRole('alert'),
  ).toHaveTextContent(mockState.message);
  await fireEvent.press(s.getByRole('button', { name: 'Delete' }));
  expect(mockRetry).toHaveBeenCalledTimes(1);
  expect(mockDelete).not.toHaveBeenCalled();
});

it('ignores an old request completion after another account opens a fresh modal', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  await fireEvent.press(s.getByRole('button', { name: 'Delete' }));
  mockState = {
    ...mockState,
    account: { userId: 'other' },
    message: 'An old request failed.',
  };
  await rerender(s);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  await act(async () => finishDelete?.());
  expect(s.getByLabelText('Delete your account?')).toBeTruthy();
  expect(s.queryByRole('alert')).toBeNull();
  expect(s.queryByRole('progressbar')).toBeNull();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

it('contains an unexpected request rejection and leaves a retryable modal error', async () => {
  mockDelete.mockRejectedValueOnce(new Error('Synthetic failure'));
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  await act(
    async () =>
      await fireEvent.press(s.getByRole('button', { name: 'Delete' })),
  );
  expect(
    within(s.getByLabelText('Delete your account?')).getByRole('alert'),
  ).toHaveTextContent(
    'Couldn’t finish deleting your account. Please try again.',
  );
  expect(s.getByRole('button', { name: 'Delete' })).toBeEnabled();
});

it('opens a restored deletion after slow hydration and presents its cleanup state inside the modal', async () => {
  mockState = { ...mockState, account: null };
  const s = await render(<DeleteAccountRoute />);
  mockState = { ...mockState, deletionStatus: 'pending', busy: true };
  await rerender(s);
  expect(s.getByRole('progressbar', { name: 'Deleting account' })).toBeTruthy();
  mockState = {
    ...mockState,
    deletionStatus: 'cleanup',
    busy: false,
    message: 'Secure storage is unavailable.',
  };
  await rerender(s);
  const dialog = within(s.getByLabelText('Delete your account?'));
  expect(
    dialog.getByText(/Finish clearing this phone’s account data/),
  ).toBeTruthy();
  expect(dialog.getByRole('alert')).toHaveTextContent(mockState.message);
  expect(mockDelete).not.toHaveBeenCalled();
  expect(mockRetry).not.toHaveBeenCalled();
});

it('discards a request completion after navigation blur', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  await fireEvent.press(s.getByRole('button', { name: 'Delete' }));
  await act(() => mockFocusCleanup?.());
  await act(async () => finishDelete?.());
  expect(s.queryByLabelText('Delete your account?')).toBeNull();
  expect(s.queryByRole('alert')).toBeNull();
});

it('rejects queued callbacks from the preceding attempt after an error appears', async () => {
  const s = await render(<DeleteAccountRoute />);
  await fireEvent.press(s.getByLabelText('Continue to deletion'));
  const stale = {
    onConfirm: jest.mocked(DeleteAccountConfirmation).mock.lastCall![0]
      .onConfirm as () => void,
    onCancel: jest.mocked(DeleteAccountConfirmation).mock.lastCall![0]
      .onCancel as () => void,
  };
  await fireEvent.press(s.getByRole('button', { name: 'Delete' }));
  mockState = {
    ...mockState,
    account: null,
    deletionStatus: 'pending',
    message: 'Please retry.',
  };
  await rerender(s);
  await act(async () => finishDelete?.());
  await act(() => {
    stale.onConfirm();
    stale.onCancel();
  });
  expect(s.getByRole('alert')).toHaveTextContent('Please retry.');
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockRetry).not.toHaveBeenCalled();
});

it('reconciles a deletion restored between construction and subscription, then unsubscribes', async () => {
  const subscribe = mockIdentity.subscribe;
  jest.spyOn(mockIdentity, 'subscribe').mockImplementationOnce((listener) => {
    const unsubscribe = subscribe(listener);
    mockState = {
      ...mockState,
      account: null,
      deletionStatus: 'pending',
      busy: true,
    };
    return unsubscribe;
  });
  const s = await render(<DeleteAccountRoute />);
  expect(s.getByRole('progressbar', { name: 'Deleting account' })).toBeTruthy();
  expect(mockDelete).not.toHaveBeenCalled();
  await s.unmount();
  expect(mockIdentityListeners.size).toBe(0);
});
