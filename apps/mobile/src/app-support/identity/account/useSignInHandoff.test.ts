import { act, renderHook } from '@testing-library/react-native';
import { useSignInHandoff } from './useSignInHandoff';

let mockIdentity = {
  account: { userId: 'owner-a', sessionId: 'session-a' } as {
    userId: string;
    sessionId: string;
  } | null,
  busy: false,
  deletionStatus: null as string | null,
};
let mockAccess = { verified: false, isPending: true, isFetching: true };
let mockJournalState = { ready: true, hydrationError: null as string | null };
let mockDeck = {
  selected: 'streets',
  queues: { streets: { cards: ['card'] } } as Record<
    string,
    { cards: string[] }
  >,
};
const mockRepository = {
  accountId: 'owner-a',
  store: { getState: () => mockJournalState },
};
const mockChallenges = {
  refresh: jest.fn<Promise<void>, []>(),
  getSnapshot: () => mockDeck,
};
jest.mock('../../providers/AppProvider', () => ({
  useIdentity: () => mockIdentity,
  useAccess: () => mockAccess,
  useJournal: () => mockRepository,
  useRuntime: () => ({ challenges: mockChallenges }),
}));

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  mockIdentity = {
    account: { userId: 'owner-a', sessionId: 'session-a' },
    busy: false,
    deletionStatus: null,
  };
  mockAccess = { verified: false, isPending: true, isFetching: true };
  mockJournalState = { ready: true, hydrationError: null };
  mockDeck = { selected: 'streets', queues: { streets: { cards: ['card'] } } };
  mockRepository.accountId = 'owner-a';
  mockChallenges.refresh.mockReset().mockResolvedValue(undefined);
});

it('holds the provider page through slow account, admission and catalog preparation, then enters Challenges directly', async () => {
  mockIdentity.busy = true;
  const pending = deferred();
  mockChallenges.refresh.mockReturnValue(pending.promise);
  const { result, rerender } = renderHook(() => useSignInHandoff(true, false));
  expect(result.current.destination).toBeNull();
  mockIdentity.busy = false;
  rerender({});
  expect(result.current.destination).toBeNull();
  expect(mockChallenges.refresh).not.toHaveBeenCalled();
  mockAccess = { verified: true, isPending: false, isFetching: false };
  rerender({});
  expect(result.current.destination).toBeNull();
  expect(mockChallenges.refresh).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve());
  expect(result.current.destination).toBe('/(tabs)');
  expect(result.current.error).toBe('');
});

it('preserves access denial and does not navigate while an access check is still fetching', () => {
  mockAccess.isPending = false;
  const { result, rerender } = renderHook(() => useSignInHandoff(true, false));
  expect(result.current.destination).toBeNull();
  mockAccess.isFetching = false;
  rerender({});
  expect(result.current.destination).toBe('/access');
  expect(mockChallenges.refresh).not.toHaveBeenCalled();
});

it('returns owner-authenticated import to Data without waiting for challenge access or a catalog', () => {
  const { result } = renderHook(() => useSignInHandoff(true, true));
  expect(result.current.destination).toBe('/data');
  expect(mockChallenges.refresh).not.toHaveBeenCalled();
});

it.each(['missing cards', 'storage failure', 'rejected refresh'])(
  'shows a recoverable preparation error for %s and retries without another provider login',
  async (failure) => {
    mockAccess = { verified: true, isPending: false, isFetching: false };
    if (failure === 'missing cards') mockDeck.queues = {};
    if (failure === 'storage failure')
      mockJournalState.hydrationError = 'unreadable';
    if (failure === 'rejected refresh')
      mockChallenges.refresh.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useSignInHandoff(true, false));
    await act(async () => {});
    expect(result.current.destination).toBeNull();
    expect(result.current.error).toContain('try again');
    mockDeck.queues = { streets: { cards: ['cached-card'] } };
    mockJournalState.hydrationError = null;
    await act(async () => result.current.retry());
    expect(result.current.destination).toBe('/(tabs)');
    expect(mockChallenges.refresh).toHaveBeenCalledTimes(2);
  },
);

it.each(['blur', 'session change', 'owner change'])(
  'ignores a late catalog result after %s',
  async (change) => {
    mockAccess = { verified: true, isPending: false, isFetching: false };
    const old = deferred();
    const next = deferred();
    mockChallenges.refresh
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise);
    let focused = true;
    const { result, rerender } = renderHook(() =>
      useSignInHandoff(focused, false),
    );
    if (change === 'blur') focused = false;
    if (change === 'session change')
      mockIdentity.account = { userId: 'owner-a', sessionId: 'session-b' };
    if (change === 'owner change')
      mockIdentity.account = { userId: 'owner-b', sessionId: 'session-b' };
    rerender({});
    await act(async () => old.resolve());
    expect(result.current.destination).toBeNull();
    expect(result.current.error).toBe('');
  },
);

it('never prepares another collection or a deleted account', () => {
  mockAccess = { verified: true, isPending: false, isFetching: false };
  mockRepository.accountId = 'other-owner';
  const { result, rerender } = renderHook(() => useSignInHandoff(true, false));
  expect(result.current.destination).toBeNull();
  expect(mockChallenges.refresh).not.toHaveBeenCalled();
  mockIdentity.deletionStatus = 'pending';
  mockRepository.accountId = 'owner-a';
  rerender({});
  expect(result.current.destination).toBeNull();
  expect(mockChallenges.refresh).not.toHaveBeenCalled();
});
