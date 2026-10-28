import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useEffect } from 'react';
import {
  WelcomeTransition,
  useWelcomeTransition,
  useBeginWelcomeEntry,
  useCancelWelcomeEntry,
} from './WelcomeTransition';
import { useWelcomePreparation } from './welcome-preparation';

let mockDeleted: 'deleted' | null = 'deleted';
let mockAccount: { userId: string } | null = null;
let mockCollectionId: string | null = null;
let mockPending = true;
let mockVerified = false;
let mockNeedsWelcome = false;
const mockRefresh = jest.fn(async () => undefined);
let mockCover: { onShow: () => void; onRetry: () => void } | null;
let mockPreparation: ReturnType<typeof useWelcomePreparation>;
let mockBeginEntry: ReturnType<typeof useBeginWelcomeEntry>;
let mockCancelEntry: ReturnType<typeof useCancelWelcomeEntry>;
jest.mock('../../acceptance/AcceptancePreparationCover', () => ({
  AcceptancePreparationCover: (props: {
    onShow: () => void;
    onRetry: () => void;
  }) => {
    mockCover = props;
    const { Text } = require('react-native') as typeof import('react-native');
    return <Text testID="cover">Welcome cover</Text>;
  },
}));
jest.mock('../../providers/AppProvider', () => ({
  useIdentity: () => ({
    deletionStatus: mockDeleted,
    account: mockAccount,
    collectionId: mockCollectionId,
    needsWelcome: mockNeedsWelcome,
  }),
  useAccess: () => ({ isPending: mockPending, verified: mockVerified }),
  useRuntime: () => ({ challenges: { refresh: mockRefresh } }),
}));
let frames: Map<number, FrameRequestCallback>;
let sequence: number;
beforeEach(() => {
  mockDeleted = 'deleted';
  mockAccount = null;
  mockCollectionId = null;
  mockPending = true;
  mockVerified = false;
  mockNeedsWelcome = false;
  mockCover = null;
  mockRefresh.mockClear();
  frames = new Map();
  sequence = 0;
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.set(++sequence, callback);
    return sequence;
  });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation((id) => {
    if (typeof id === 'number') frames.delete(id);
  });
});
afterEach(() => jest.restoreAllMocks());
async function paint() {
  await act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });
}

function EntryState() {
  const preparation = useWelcomePreparation();
  const beginEntry = useBeginWelcomeEntry();
  const cancelEntry = useCancelWelcomeEntry();
  useEffect(() => {
    mockPreparation = preparation;
  }, [preparation]);
  useEffect(() => {
    mockBeginEntry = beginEntry;
  }, [beginEntry]);
  useEffect(() => {
    mockCancelEntry = cancelEntry;
  }, [cancelEntry]);
  return (
    <Text>
      {useWelcomeTransition() ? 'Welcome loading' : 'Account navigation'}
    </Text>
  );
}
const entry = () => (
  <WelcomeTransition>
    <EntryState />
  </WelcomeTransition>
);

it('covers access, card loading and their first paint without remounting the prepared destination', async () => {
  const screen = await render(entry());
  expect(screen.getByText('Account navigation')).toBeTruthy();
  mockDeleted = null;
  mockAccount = { userId: 'new-account' };
  await screen.rerender(entry());
  expect(
    screen.getByText('Welcome loading', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(screen.getByTestId('cover')).toBeTruthy();
  expect(mockPreparation.active).toBe(false);
  mockPending = false;
  mockVerified = true;
  await screen.rerender(entry());
  // Do not remove the outgoing route before the persistent modal is shown.
  expect(
    screen.getByText('Welcome loading', { includeHiddenElements: true }),
  ).toBeTruthy();
  await act(() => mockCover!.onShow());
  expect(
    screen.getByText('Account navigation', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(mockPreparation.active).toBe(true);
  await act(() => mockPreparation.markReady());
  await paint();
  expect(screen.getByTestId('cover')).toBeTruthy();
  await paint();
  expect(screen.queryByTestId('cover')).toBeNull();
  expect(mockPreparation.active).toBe(false);
  expect(screen.queryByText('Welcome loading')).toBeNull();
  // A later refresh belongs to normal app navigation, not the welcome handoff.
  mockPending = true;
  await screen.rerender(entry());
  expect(screen.getByText('Account navigation')).toBeTruthy();
});

async function prepare() {
  const screen = await render(entry());
  mockDeleted = null;
  mockAccount = { userId: 'replacement' };
  mockPending = false;
  mockVerified = true;
  await screen.rerender(entry());
  await act(() => mockCover!.onShow());
  return screen;
}

it('retries preparation for the same account, fencing readiness from the previous attempt', async () => {
  const screen = await prepare();
  const staleReady = mockPreparation.markReady;
  await act(() => mockCover!.onRetry());
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(mockPreparation.attempt).toBe(1);
  expect(mockPreparation.active).toBe(true);
  await act(staleReady);
  await paint();
  await paint();
  expect(screen.getByTestId('cover')).toBeTruthy();
  await act(() => mockPreparation.markReady());
  await paint();
  await paint();
  expect(screen.queryByTestId('cover')).toBeNull();
  // Retaining this identity prevents remounting the now-visible deck.
  expect(mockPreparation.attempt).toBe(1);
  expect(mockAccount?.userId).toBe('replacement');
});

it('drops the cover and cancels scheduled paints when the account changes', async () => {
  const screen = await prepare();
  const staleReady = mockPreparation.markReady;
  await act(staleReady);
  await paint();
  expect(frames.size).toBe(1);
  mockAccount = { userId: 'another-account' };
  await screen.rerender(entry());
  expect(screen.queryByTestId('cover')).toBeNull();
  expect(frames.size).toBe(0);
  await act(staleReady);
  await paint();
  expect(screen.getByText('Account navigation')).toBeTruthy();
});

it('does not let an old account readiness callback release a later welcome', async () => {
  const screen = await prepare();
  const staleReady = mockPreparation.markReady;
  mockDeleted = 'deleted';
  mockAccount = null;
  await screen.rerender(entry());
  mockDeleted = null;
  mockAccount = { userId: 'next-account' };
  await screen.rerender(entry());
  await act(() => mockCover!.onShow());
  await act(staleReady);
  await paint();
  await paint();
  expect(screen.getByTestId('cover')).toBeTruthy();
  expect(mockPreparation.active).toBe(true);
});

it('cancels a pending paint when unmounted', async () => {
  const screen = await prepare();
  await act(() => mockPreparation.markReady());
  await screen.unmount();
  expect(frames.size).toBe(0);
});

it('does not cover an existing account or hide a failed access check', async () => {
  mockDeleted = null;
  mockAccount = { userId: 'existing-account' };
  const screen = await render(entry());
  expect(screen.getByText('Account navigation')).toBeTruthy();
  mockDeleted = 'deleted';
  mockAccount = null;
  await screen.rerender(entry());
  mockDeleted = null;
  mockAccount = { userId: 'replacement' };
  mockPending = false;
  await screen.rerender(entry());
  expect(screen.getByText('Account navigation')).toBeTruthy();
  expect(screen.queryByText('Welcome loading')).toBeNull();
});

it('prepares a fresh installation after Continue creates the account and access is verified', async () => {
  mockDeleted = null;
  mockNeedsWelcome = true;
  const screen = await render(entry());
  expect(screen.queryByTestId('cover')).toBeNull();
  await act(() => mockBeginEntry());
  expect(screen.queryByTestId('cover')).toBeNull();
  mockNeedsWelcome = false;
  mockAccount = { userId: 'first-account' };
  mockPending = false;
  mockVerified = true;
  await screen.rerender(entry());
  expect(screen.getByTestId('cover')).toBeTruthy();
  await act(() => mockCover!.onShow());
  await act(() => mockPreparation.markReady());
  await paint();
  await paint();
  expect(screen.queryByTestId('cover')).toBeNull();
});

it('reveals the prepared guest deck after Continue without a signed-in account', async () => {
  mockDeleted = null;
  mockNeedsWelcome = true;
  const screen = await render(entry());
  await act(() => mockBeginEntry());
  mockNeedsWelcome = false;
  mockCollectionId = 'local-guest';
  mockPending = false;
  mockVerified = true;
  await screen.rerender(entry());
  expect(screen.getByTestId('cover')).toBeTruthy();
  await act(() => mockCover!.onShow());
  expect(mockPreparation.active).toBe(true);
  await act(() => mockPreparation.markReady());
  await paint();
  await paint();
  expect(screen.queryByTestId('cover')).toBeNull();
  expect(screen.getByText('Account navigation')).toBeTruthy();
  expect(mockAccount).toBeNull();
});

it('keeps fresh-install recovery on account navigation without starting a welcome deck handoff', async () => {
  mockDeleted = null;
  mockNeedsWelcome = true;
  const screen = await render(entry());
  expect(screen.queryByTestId('cover')).toBeNull();
  mockNeedsWelcome = false;
  mockAccount = { userId: 'recovered-account' };
  mockPending = false;
  mockVerified = true;
  await screen.rerender(entry());
  expect(screen.getByText('Account navigation')).toBeTruthy();
  expect(screen.queryByText('Welcome loading')).toBeNull();
  expect(screen.queryByTestId('cover')).toBeNull();
  expect(mockPreparation.active).toBe(false);
  await paint();
  await paint();
  expect(screen.getByText('Account navigation')).toBeTruthy();
  expect(screen.queryByTestId('cover')).toBeNull();
});

it('cancels an explicit welcome entry before recovering an existing account', async () => {
  mockDeleted = null;
  mockNeedsWelcome = true;
  const screen = await render(entry());
  await act(() => mockBeginEntry());
  expect(screen.queryByTestId('cover')).toBeNull();
  await act(() => mockCancelEntry());
  mockNeedsWelcome = false;
  mockAccount = { userId: 'recovered-account' };
  mockPending = false;
  mockVerified = true;
  await screen.rerender(entry());
  expect(screen.getByText('Account navigation')).toBeTruthy();
  expect(screen.queryByTestId('cover')).toBeNull();
  expect(mockPreparation.active).toBe(false);
  await paint();
  await paint();
  expect(screen.queryByTestId('cover')).toBeNull();
});

it('lets provider loading suppress the post-deletion Terms cover while later guest Continue still prepares normally', async () => {
  const screen = await render(entry());
  await act(() => mockBeginEntry());
  await act(() => mockCancelEntry());
  mockDeleted = null;
  mockAccount = { userId: 'provider-account' };
  await screen.rerender(entry());
  expect(screen.queryByTestId('cover')).toBeNull();
  expect(screen.getByText('Account navigation')).toBeTruthy();
  mockDeleted = 'deleted';
  mockAccount = null;
  await screen.rerender(entry());
  await act(() => mockBeginEntry());
  mockDeleted = null;
  mockCollectionId = 'next-guest';
  mockPending = false;
  mockVerified = true;
  await screen.rerender(entry());
  expect(screen.getByTestId('cover')).toBeTruthy();
  await act(() => mockCover!.onShow());
  await act(() => mockPreparation.markReady());
  await paint();
  await paint();
  expect(screen.queryByTestId('cover')).toBeNull();
});
