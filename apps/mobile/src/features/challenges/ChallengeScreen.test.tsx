import { createContext } from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { colors } from '../../theme/tokens';
import type { ChallengeSnapshot } from './controller';
import { attempt, card } from '../../../test-support/journal';
import { ChallengeScreen } from './ChallengeScreen';
import {
  ChallengeActivityProvider,
  useChallengeActivity,
} from './active/ChallengeActivityProvider';
import { ChallengeFlowScreen } from './active/ChallengeFlowScreen';

const mockMounted = jest.fn();
const mockVenueTabs = jest.fn<null, [unknown]>(() => null);
const mockDeckState = jest.fn();
const mockScreen = jest.fn<null, [unknown]>(() => null);
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissTo: jest.fn(),
};
const mockFocusContext = createContext<boolean | null>(null);
const mockTransitions = new Set<
  (event: { data: { closing: boolean } }) => void
>();
const mockNavigation = {
  addListener: jest.fn(
    (
      _event: string,
      listener: (event: { data: { closing: boolean } }) => void,
    ) => {
      mockTransitions.add(listener);
      return () => mockTransitions.delete(listener);
    },
  ),
};
let mockFocused = true;
let mockAccount: { userId: string } | null = { userId: 'deck-owner' };
let mockCollectionId: string | null = null;
let mockRepository: { accountId: string } | null = null;
const mockMarkReady = jest.fn();
let mockPreparation = { active: false, attempt: 0, markReady: mockMarkReady };
const mockCard = { ...card, venue: 'cafe' as const };
const finishedAttempt = { ...attempt(), venue: 'cafe' as const };
let mockSnapshot: ChallengeSnapshot;
const mockController = {
  subscribe: () => () => {},
  getSnapshot: () => mockSnapshot,
  refresh: jest.fn(),
  skip: jest.fn(),
  select: jest.fn(),
  complete: jest.fn(),
  dismissSuccess: jest.fn(),
};
jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context');
  const { useContext } = require('react');
  return {
    ...actual,
    useSafeAreaInsets: () =>
      useContext(actual.SafeAreaInsetsContext) ?? {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      },
  };
});
jest.mock('expo-router', () => ({
  Stack: { Screen: (props: unknown) => mockScreen(props) },
  useIsFocused: () =>
    require('react').useContext(mockFocusContext) ?? mockFocused,
  useRouter: () => mockRouter,
  useNavigation: () => mockNavigation,
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../app-support/providers/AppProvider', () => ({
  useRuntime: () => ({ challenges: mockController }),
  useIdentity: () => ({
    account: mockAccount,
    collectionId: mockCollectionId,
  }),
  useJournal: () => mockRepository,
}));
jest.mock('../../app-support/identity/welcome/welcome-preparation', () => ({
  useWelcomePreparation: () => mockPreparation,
}));
jest.mock('../../app-support/saving/SavingFeedback', () => ({
  SavingSheetSurface: ({
    toastHostEnabled = true,
  }: {
    toastHostEnabled?: boolean;
  }) => {
    const { View } = require('react-native');
    return toastHostEnabled ? <View testID="sheet-toast-host" /> : null;
  },
}));
jest.mock('react-native-screens', () => ({
  FullWindowOverlay: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View testID="window-overlay">{children}</View>;
  },
}));
jest.mock('./deck/VenueTabs', () => ({
  VenueTabs: (props: unknown) => mockVenueTabs(props),
}));
jest.mock('./deck/ChallengeDeck', () => ({
  ChallengeCard: ({
    onArtworkSettled,
    onTextureSettled,
  }: {
    onArtworkSettled?: () => void;
    onTextureSettled?: () => void;
  }) => {
    const { View } = require('react-native');
    return (
      <View>
        <View
          testID="mock-artwork"
          onLoad={onArtworkSettled}
          onError={onArtworkSettled}
        />
        <View
          testID="mock-texture"
          onLoad={onTextureSettled}
          onError={onTextureSettled}
        />
      </View>
    );
  },
  ChallengeDeck: ({
    onAction,
    disabled,
    covered,
    onVisualReady,
  }: {
    onAction: (direction: -1 | 1) => Promise<void>;
    disabled: boolean;
    covered?: boolean;
    onVisualReady?: () => void;
  }) => {
    const { useEffect } = require('react');
    const { View, Pressable, Text } = require('react-native');
    mockDeckState({ covered, disabled });
    useEffect(() => {
      mockMounted();
    }, []);
    return (
      <View testID="mock-deck" onLayout={onVisualReady}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Accept challenge"
          disabled={disabled}
          onPress={() => void onAction(1)}
        >
          <Text>Accept</Text>
        </Pressable>
      </View>
    );
  },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockTransitions.clear();
  jest.replaceProperty(Platform, 'OS', 'web');
  mockFocused = true;
  mockAccount = { userId: 'deck-owner' };
  mockCollectionId = null;
  mockRepository = { accountId: mockAccount.userId };
  mockPreparation = { active: false, attempt: 0, markReady: mockMarkReady };
  mockSnapshot = {
    selected: 'cafe',
    error: '',
    loading: false,
    saving: false,
    completionStarted: false,
    success: null,
    queues: { cafe: { turn: 0, cards: [mockCard] } },
  };
  mockController.complete.mockResolvedValue(undefined);
});
afterEach(() => jest.restoreAllMocks());
function Flow() {
  return (
    <ChallengeActivityProvider>
      <ChallengeScreen />
    </ChallengeActivityProvider>
  );
}

it('shows a labelled spinner until the challenge deck loads', async () => {
  const loaded = mockSnapshot;
  mockSnapshot = { ...loaded, queues: {}, loading: true };
  const screen = await render(<Flow />);
  expect(screen.getByLabelText('Loading challenges')).toBeVisible();
  expect(screen.queryByText('Finding your challenges…')).toBeNull();
  expect(screen.queryByText('Your challenges couldn’t load.')).toBeNull();
  expect(screen.queryByTestId('mock-deck')).toBeNull();

  mockSnapshot = loaded;
  await screen.rerender(<Flow />);
  expect(screen.queryByLabelText('Loading challenges')).toBeNull();
  expect(screen.getByTestId('mock-deck')).toBeVisible();
});

it('keeps the existing deck visible during a catalog refresh', async () => {
  mockSnapshot = { ...mockSnapshot, loading: true };
  const screen = await render(<Flow />);
  expect(screen.getByTestId('mock-deck')).toBeVisible();
  expect(screen.queryByLabelText('Loading challenges')).toBeNull();
});

it('replaces the spinner with catalog recovery after a failed load', async () => {
  mockSnapshot = { ...mockSnapshot, queues: {}, loading: true };
  const screen = await render(<Flow />);
  expect(screen.getByLabelText('Loading challenges')).toBeVisible();

  mockSnapshot = { ...mockSnapshot, loading: false, error: 'Download failed' };
  await screen.rerender(<Flow />);
  expect(screen.queryByLabelText('Loading challenges')).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent('Download failed');
  expect(screen.queryByText('Your challenges couldn’t load.')).toBeNull();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Refresh challenges' }),
  );
  expect(mockController.refresh).toHaveBeenCalledTimes(2);
});

it('starts its catalog read when the matching repository becomes available after identity', async () => {
  mockRepository = null;
  const screen = await render(<Flow />);
  expect(mockController.refresh).not.toHaveBeenCalled();
  mockRepository = { accountId: 'previous-owner' };
  await screen.rerender(<Flow />);
  expect(mockController.refresh).not.toHaveBeenCalled();
  if (!mockAccount) throw new Error('Expected a signed-in fixture');
  mockRepository = { accountId: mockAccount.userId };
  await screen.rerender(<Flow />);
  expect(mockController.refresh).toHaveBeenCalledTimes(1);
});

it('starts the guest catalog read after its local collection repository is ready', async () => {
  mockAccount = null;
  mockCollectionId = 'local-guest';
  mockRepository = null;
  const screen = await render(<Flow />);
  expect(mockController.refresh).not.toHaveBeenCalled();
  mockRepository = { accountId: 'previous-collection' };
  await screen.rerender(<Flow />);
  expect(mockController.refresh).not.toHaveBeenCalled();
  mockRepository = { accountId: mockCollectionId };
  await screen.rerender(<Flow />);
  expect(mockController.refresh).toHaveBeenCalledTimes(1);
});

it.each(['ios', 'web'] as const)(
  'keeps the prepared %s deck mounted when the welcome cover reveals it',
  async (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    mockPreparation = { active: true, attempt: 1, markReady: mockMarkReady };
    const screen = await render(<Flow />);
    const deck = screen.getByTestId('mock-deck');
    expect(
      screen.getByRole('button', { name: 'Accept challenge' }),
    ).toBeDisabled();
    expect(mockVenueTabs).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: true }),
    );
    expect(mockMarkReady).not.toHaveBeenCalled();
    await fireEvent(deck, 'layout');
    expect(mockMarkReady).toHaveBeenCalledTimes(1);
    mockPreparation = { ...mockPreparation, active: false };
    await screen.rerender(<Flow />);
    expect(screen.getByTestId('mock-deck')).toBe(deck);
    expect(mockMounted).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Accept challenge' }),
    ).toBeEnabled();
    expect(mockVenueTabs).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: false }),
    );
    expect(screen.getByTestId('mock-deck').props.onLayout).toBeUndefined();
  },
);

it('remounts a stalled prepared deck only when an explicit retry changes the attempt', async () => {
  mockPreparation = { active: true, attempt: 1, markReady: mockMarkReady };
  const screen = await render(<Flow />);
  const stalled = screen.getByTestId('mock-deck');
  await screen.rerender(<Flow />);
  expect(screen.getByTestId('mock-deck')).toBe(stalled);
  expect(mockMounted).toHaveBeenCalledTimes(1);
  mockPreparation = { ...mockPreparation, attempt: 2 };
  await screen.rerender(<Flow />);
  expect(screen.getByTestId('mock-deck')).not.toBe(stalled);
  expect(mockMounted).toHaveBeenCalledTimes(2);
  expect(mockMarkReady).not.toHaveBeenCalled();
});

function NativeFlow() {
  return (
    <ChallengeActivityProvider>
      <mockFocusContext.Provider value={mockFocused}>
        <ChallengeScreen />
      </mockFocusContext.Provider>
      {!mockFocused && (
        <mockFocusContext.Provider value={true}>
          <NativeRouteFixture />
        </mockFocusContext.Provider>
      )}
    </ChallengeActivityProvider>
  );
}
function NativeRouteFixture() {
  const { active, presentedStart } = useChallengeActivity();
  return (
    <View
      testID="native-route"
      accessibilityElementsHidden={presentedStart !== active}
    >
      <ChallengeFlowScreen />
    </View>
  );
}
async function settleSurface(
  owner: Parameters<typeof within>[0],
  outcome: 'load' | 'error' = 'load',
) {
  const content = within(owner);
  await fireEvent(
    content.getByTestId('active-challenge-surface', {
      includeHiddenElements: true,
    }),
    'layout',
  );
  await fireEvent(
    content.getByTestId('mock-artwork', { includeHiddenElements: true }),
    outcome,
  );
  await fireEvent(
    content.getByTestId('mock-texture', { includeHiddenElements: true }),
    outcome,
  );
}
async function prepareNativeAccept(screen: Awaited<ReturnType<typeof render>>) {
  await act(async () => await accept(screen));
  await act(
    async () =>
      await settleSurface(
        screen.getByTestId('native-challenge-handoff', {
          includeHiddenElements: true,
        }),
      ),
  );
}
async function enterNativeRoute(screen: Awaited<ReturnType<typeof render>>) {
  await act(async () => {
    await settleSurface(
      screen.getByTestId('native-route', { includeHiddenElements: true }),
    );
    mockTransitions.forEach((listener) =>
      listener({ data: { closing: false } }),
    );
  });
}
async function accept(screen: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(
    screen.getByRole('button', { name: 'Accept challenge' }),
  );
}

it('keeps the deck mounted through queue updates, with Settings available while browsing', async () => {
  const screen = await render(<Flow />);
  expect(mockMounted).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: 'Open Settings' })).toBeTruthy();
  mockSnapshot = {
    ...mockSnapshot,
    queues: {
      cafe: {
        turn: 1,
        cards: [{ ...mockCard, id: 'b', text: 'Ask a question.' }],
      },
    },
  };
  await screen.rerender(<Flow />);
  expect(mockMounted).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('View your last completed challenge')).toBeNull();
});
it('keeps navigation mounted behind an opaque full-screen active view and refuses implicit dismissal', async () => {
  const insets = { top: 62, bottom: 34, left: 3, right: 7 };
  const screen = await render(
    <SafeAreaInsetsContext.Provider value={insets}>
      <Flow />
    </SafeAreaInsetsContext.Provider>,
  );
  await accept(screen);
  const modal = screen.container.queryAll((node) => node.type === 'Modal')[0]!;
  expect(mockDeckState).toHaveBeenLastCalledWith(
    expect.objectContaining({ covered: true }),
  );
  expect(modal.props.presentationStyle).toBe('overFullScreen');
  expect(modal.props.transparent).toBe(false);
  expect(modal.props.allowSwipeDismissal).toBe(false);
  // The first modal render already has its safe-area spacing. Native inset
  // measurement after presentation must not move the title/timer/card.
  const activeSurface = within(modal).getByTestId('active-challenge-surface');
  expect(activeSurface.props.accessibilityViewIsModal).toBe(true);
  expect(StyleSheet.flatten(activeSurface.props.style)).toMatchObject({
    flex: 1,
    backgroundColor: colors.cream,
    paddingTop: insets.top,
    paddingBottom: insets.bottom,
    paddingLeft: insets.left,
    paddingRight: insets.right,
  });
  expect(
    within(modal).getByTestId('challenge-screen-surface').props.edges,
  ).toEqual({ top: 'off', bottom: 'off', left: 'off', right: 'off' });
  expect(
    within(modal).queryByRole('link', { name: 'Open Settings' }),
  ).toBeNull();
  expect(within(modal).queryByRole('tab')).toBeNull();
  await fireEvent(modal, 'requestClose');
  expect(screen.getByRole('button', { name: 'Completed' })).toBeEnabled();
  expect(mockController.complete).not.toHaveBeenCalled();
  expect(mockController.skip).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Give up' }));
  expect(screen.queryByTestId('active-challenge-modal')).toBeNull();
  expect(mockController.skip).toHaveBeenCalledWith('cafe', mockCard.id);
  expect(screen.getByRole('link', { name: 'Open Settings' })).toBeTruthy();
  expect(mockDeckState).toHaveBeenLastCalledWith(
    expect.objectContaining({ covered: false }),
  );
});
it('updates the active surface when the root safe area changes without restarting the challenge', async () => {
  const screen = await render(
    <SafeAreaInsetsContext.Provider
      value={{ top: 62, bottom: 34, left: 0, right: 0 }}
    >
      <Flow />
    </SafeAreaInsetsContext.Provider>,
  );
  await accept(screen);
  const timer = screen.getByText('05:00');
  await screen.rerender(
    <SafeAreaInsetsContext.Provider
      value={{ top: 48, bottom: 20, left: 5, right: 9 }}
    >
      <Flow />
    </SafeAreaInsetsContext.Provider>,
  );
  expect(
    StyleSheet.flatten(
      screen.getByTestId('active-challenge-surface').props.style,
    ),
  ).toMatchObject({
    paddingTop: 48,
    paddingBottom: 20,
    paddingLeft: 5,
    paddingRight: 9,
  });
  expect(screen.getByText('05:00')).toBe(timer);
  expect(mockController.complete).not.toHaveBeenCalled();
});
it('keeps Android modal-owned safe areas when its bounds exclude system bars', async () => {
  const platform = jest.replaceProperty(Platform, 'OS', 'android');
  const screen = await render(
    <SafeAreaInsetsContext.Provider
      value={{ top: 24, bottom: 34, left: 0, right: 0 }}
    >
      <Flow />
    </SafeAreaInsetsContext.Provider>,
  );
  try {
    await accept(screen);
    const modal = screen.container.queryAll(
      (node) => node.type === 'Modal',
    )[0]!;
    const surface = within(modal).getByTestId('active-challenge-surface');
    expect(surface.props.edges).toEqual({
      top: 'off',
      bottom: 'additive',
      left: 'off',
      right: 'off',
    });
    expect(StyleSheet.flatten(surface.props.style).paddingTop).toBeUndefined();
    expect(
      StyleSheet.flatten(surface.props.style).paddingBottom,
    ).toBeUndefined();
    expect(
      within(modal).getByTestId('challenge-screen-surface').props.edges,
    ).toEqual({
      top: 'additive',
      bottom: 'off',
      left: 'additive',
      right: 'additive',
    });
  } finally {
    await screen.unmount();
    platform.restore();
  }
});
it('keeps the active modal through local completion until Success takes focus, then returns to browsing', async () => {
  const screen = await render(<Flow />);
  await accept(screen);
  await fireEvent.press(screen.getByRole('button', { name: 'Completed' }));
  await act(async () => {
    mockSnapshot = {
      ...mockSnapshot,
      success: finishedAttempt,
      completionStarted: true,
    };
    await screen.rerender(<Flow />);
  });
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/success',
    params: { attemptId: finishedAttempt.id },
  });
  expect(screen.getByTestId('active-challenge-modal')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Completed' })).toBeDisabled();
  expect(mockController.complete).toHaveBeenCalledWith(
    expect.objectContaining({
      card: mockCard,
      startedAt: expect.any(String),
      startTimeZone: expect.any(String),
    }),
  );
  mockFocused = false;
  await screen.rerender(<Flow />);
  expect(screen.queryByTestId('active-challenge-modal')).toBeNull();
  mockFocused = true;
  await screen.rerender(<Flow />);
  expect(mockController.dismissSuccess).toHaveBeenCalledTimes(1);
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
});
it('uses local completion retry and keeps navigation inaccessible during an interrupted save', async () => {
  const screen = await render(<Flow />);
  await accept(screen);
  mockSnapshot = {
    ...mockSnapshot,
    completionStarted: true,
    error: 'Try Completed again',
  };
  await screen.rerender(<Flow />);
  const modal = screen.container.queryAll((node) => node.type === 'Modal')[0]!;
  expect(
    within(modal).queryByRole('button', { name: 'Refresh challenges' }),
  ).toBeNull();
  expect(
    within(modal).getByRole('button', { name: 'Completed' }),
  ).toBeEnabled();
  expect(within(modal).getByRole('button', { name: 'Give up' })).toBeDisabled();
});
it('clears unfinished React state when the account changes', async () => {
  const screen = await render(<Flow />);
  await accept(screen);
  mockAccount = { userId: 'another-owner' };
  await screen.rerender(<Flow />);
  expect(screen.queryByTestId('active-challenge-modal')).toBeNull();
  expect(mockController.complete).not.toHaveBeenCalled();
});

it('clears unfinished activity between guest and signed-out account collections', async () => {
  mockAccount = null;
  mockCollectionId = 'guest-collection';
  mockRepository = { accountId: mockCollectionId };
  const screen = await render(<Flow />);
  await accept(screen);
  expect(screen.getByTestId('active-challenge-modal')).toBeTruthy();
  mockCollectionId = 'signed-out-account-collection';
  mockRepository = { accountId: mockCollectionId };
  await screen.rerender(<Flow />);
  expect(screen.queryByTestId('active-challenge-modal')).toBeNull();
  expect(mockController.complete).not.toHaveBeenCalled();
  expect(mockMounted).toHaveBeenCalledTimes(2);
});
it('exposes catalog recovery only when no active challenge exists', async () => {
  mockSnapshot = { ...mockSnapshot, queues: {}, error: 'Download failed' };
  const screen = await render(<Flow />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Refresh challenges' }),
  );
  expect(mockController.refresh).toHaveBeenCalled();
});

it('switches Active to Success in the same native route without a navigation transition', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const screen = await render(<NativeFlow />);
  await prepareNativeAccept(screen);
  expect(mockRouter.push).toHaveBeenCalledWith('/challenge');
  expect(
    screen.container.queryAll((node) => node.type === 'Modal')[0] ?? null,
  ).toBeNull();
  mockFocused = false;
  await screen.rerender(<NativeFlow />);
  await enterNativeRoute(screen);
  const activeSurface = screen.getByTestId('active-challenge-surface');
  const preparedSuccess = screen.getByTestId('success-content', {
    includeHiddenElements: true,
  });
  expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  expect(
    within(activeSurface).queryByRole('link', { name: 'Open Settings' }),
  ).toBeNull();
  expect(within(activeSurface).queryByRole('tab')).toBeNull();
  expect(mockScreen).toHaveBeenLastCalledWith({
    options: { gestureEnabled: false },
  });
  await act(
    async () =>
      await fireEvent.press(screen.getByRole('button', { name: 'Completed' })),
  );
  mockSnapshot = {
    ...mockSnapshot,
    success: finishedAttempt,
    completionStarted: true,
  };
  await screen.rerender(<NativeFlow />);
  // Completed only changes content. Neither dismissing a native modal nor
  // replacing a native stack screen may reveal the deck during this handoff.
  expect(screen.queryByTestId('active-challenge-surface')).toBeNull();
  const success = screen.getByTestId('success-content');
  expect(success).toBe(preparedSuccess);
  expect(screen.getByText('That’s a win!')).toBeTruthy();
  expect(
    screen.container.queryAll((node) => node.type === 'Modal')[0] ?? null,
  ).toBeNull();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  expect(mockScreen).toHaveBeenLastCalledWith({
    options: { gestureEnabled: false },
  });
  await screen.rerender(<NativeFlow />);
  expect(screen.getByTestId('success-content')).toBe(success);
  expect(mockRouter.replace).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith({
    pathname: '/reflection',
    params: { attemptId: finishedAttempt.id },
  });
  mockFocused = true;
  await screen.rerender(<NativeFlow />);
  expect(screen.queryByTestId('active-challenge-surface')).toBeNull();
  expect(mockController.dismissSuccess).toHaveBeenCalledTimes(1);
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
});
it('keeps the prepared cover until both native entry and destination assets are ready, tolerating decorative image failures', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const screen = await render(<NativeFlow />);
  await act(async () => await accept(screen));
  const cover = screen.getByTestId('native-challenge-handoff', {
    includeHiddenElements: true,
  });
  expect(StyleSheet.flatten(cover.props.style).opacity).toBe(0);
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Completed' })).toBeNull();
  const content = within(cover);
  await fireEvent(
    content.getByTestId('active-challenge-surface', {
      includeHiddenElements: true,
    }),
    'layout',
  );
  await fireEvent(
    content.getByTestId('mock-artwork', { includeHiddenElements: true }),
    'load',
  );
  expect(mockRouter.push).not.toHaveBeenCalled();
  await act(
    async () =>
      await fireEvent(
        content.getByTestId('mock-texture', { includeHiddenElements: true }),
        'error',
      ),
  );
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Completed' })).toBeDisabled();
  mockFocused = false;
  await screen.rerender(<NativeFlow />);
  expect(
    screen.getAllByTestId('sheet-toast-host', { includeHiddenElements: true }),
  ).toHaveLength(1);
  await act(async () => {
    await settleSurface(
      screen.getByTestId('native-route', { includeHiddenElements: true }),
    );
    mockTransitions.forEach((listener) =>
      listener({ data: { closing: true } }),
    );
  });
  expect(screen.getByTestId('native-challenge-handoff')).toBeTruthy();
  await act(async () =>
    mockTransitions.forEach((listener) =>
      listener({ data: { closing: false } }),
    ),
  );
  expect(
    screen.queryByTestId('native-challenge-handoff', {
      includeHiddenElements: true,
    }),
  ).toBeNull();
  expect(screen.getByRole('button', { name: 'Completed' })).toBeEnabled();
});
it('does not uncover an entered native destination before its layout and artwork are ready', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const screen = await render(<NativeFlow />);
  await prepareNativeAccept(screen);
  mockFocused = false;
  await screen.rerender(<NativeFlow />);
  await act(async () =>
    mockTransitions.forEach((listener) =>
      listener({ data: { closing: false } }),
    ),
  );
  expect(screen.getByTestId('native-challenge-handoff')).toBeTruthy();
  await act(
    async () =>
      await settleSurface(
        screen.getByTestId('native-route', { includeHiddenElements: true }),
      ),
  );
  expect(
    screen.queryByTestId('native-challenge-handoff', {
      includeHiddenElements: true,
    }),
  ).toBeNull();
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  await screen.unmount();
  expect(mockTransitions.size).toBe(0);
});
it('keeps the departed iOS deck mounted through Active and Success instead of flashing the accepted card again', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const screen = await render(<NativeFlow />);
  expect(mockMounted).toHaveBeenCalledTimes(1);
  await prepareNativeAccept(screen);
  expect(mockDeckState).toHaveBeenLastCalledWith(
    expect.objectContaining({ covered: true }),
  );
  mockFocused = false;
  await screen.rerender(<NativeFlow />);
  await enterNativeRoute(screen);
  expect(mockMounted).toHaveBeenCalledTimes(1);
  mockSnapshot = {
    ...mockSnapshot,
    success: finishedAttempt,
    completionStarted: true,
  };
  await screen.rerender(<NativeFlow />);
  expect(mockMounted).toHaveBeenCalledTimes(1);
  mockFocused = true;
  await screen.rerender(<NativeFlow />);
  expect(mockMounted).toHaveBeenCalledTimes(1);
  expect(mockDeckState).toHaveBeenLastCalledWith(
    expect.objectContaining({ covered: false }),
  );
});
it('keeps failed native saves retryable without abandoning the accepted completion', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const screen = await render(<NativeFlow />);
  await prepareNativeAccept(screen);
  mockFocused = false;
  await screen.rerender(<NativeFlow />);
  await enterNativeRoute(screen);
  mockSnapshot = {
    ...mockSnapshot,
    completionStarted: true,
    error: 'Try Completed again',
  };
  await screen.rerender(<NativeFlow />);
  expect(screen.getByRole('button', { name: 'Give up' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Completed' })).toBeEnabled();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  await act(
    async () =>
      await fireEvent.press(screen.getByRole('button', { name: 'Completed' })),
  );
  expect(mockController.complete).toHaveBeenCalledTimes(1);
  expect(mockController.skip).not.toHaveBeenCalled();
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
});
it('gives up a fresh native challenge through Home without saving a rep', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const screen = await render(<NativeFlow />);
  await prepareNativeAccept(screen);
  mockFocused = false;
  await screen.rerender(<NativeFlow />);
  await enterNativeRoute(screen);
  await act(
    async () =>
      await fireEvent.press(screen.getByRole('button', { name: 'Give up' })),
  );
  expect(mockController.skip).toHaveBeenCalledWith('cafe', mockCard.id);
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)');
  expect(mockController.complete).not.toHaveBeenCalled();
});
it('returns an empty native challenge route to Home after a restart', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  mockFocused = false;
  const screen = await render(<NativeFlow />);
  expect(screen.queryByTestId('active-challenge-surface')).toBeNull();
  expect(screen.queryByTestId('success-content')).toBeNull();
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)');
  expect(mockRouter.push).not.toHaveBeenCalled();
});
it('starts the native route with measured window insets and clears its old account activity', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const insets = { top: 62, bottom: 34, left: 3, right: 7 };
  const tree = () => (
    <SafeAreaInsetsContext.Provider value={insets}>
      <NativeFlow />
    </SafeAreaInsetsContext.Provider>
  );
  const screen = await render(tree());
  await prepareNativeAccept(screen);
  mockFocused = false;
  await screen.rerender(tree());
  await enterNativeRoute(screen);
  expect(
    StyleSheet.flatten(
      screen.getByTestId('active-challenge-surface').props.style,
    ),
  ).toMatchObject({
    paddingTop: 62,
    paddingBottom: 34,
    paddingLeft: 3,
    paddingRight: 7,
  });
  expect(
    StyleSheet.flatten(
      screen.getByTestId('success-surface', { includeHiddenElements: true })
        .props.style,
    ),
  ).toMatchObject({
    paddingTop: 62,
    paddingBottom: 34,
    paddingLeft: 3,
    paddingRight: 7,
  });
  mockAccount = { userId: 'another-owner' };
  await screen.rerender(tree());
  expect(screen.queryByTestId('active-challenge-surface')).toBeNull();
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)');
  expect(mockRouter.replace).not.toHaveBeenCalled();
});
