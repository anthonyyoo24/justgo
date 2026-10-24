import { useEffect, type ReactNode } from 'react';
import { Text } from 'react-native';
import { fireEvent } from '@testing-library/react-native';
import { router, Stack } from 'expo-router';
import {
  act,
  renderRouter,
  screen,
  waitFor,
} from 'expo-router/testing-library';
import RootLayout, { unstable_settings } from '../../app/_layout';
import AccessRoute from '../../app/access';
import HomeRoute from '../../app/(tabs)/index';
import ChallengeRoute from '../../app/(challenge)/challenge';
import ReflectionRoute from '../../app/(challenge)/reflection';
import { ChallengeController } from '../../features/challenges/controller';
import { AccountRepository } from '../../data/activity/repository';
import {
  memoryJournalBackend,
  memoryLocalJournal,
} from '../../../test-support/local-journal';
import {
  MemoryStorage,
  backend,
  card,
  deferred,
  input,
  otherOwner,
  owner,
  today,
  uuid,
  zone,
} from '../../../test-support/journal';

type Snapshot = {
  identity: {
    initialized: boolean;
    busy: boolean;
    account: { userId: string } | null;
    collectionId: string | null;
    collectionKind: 'account';
    deletionStatus: 'pending' | 'cleanup' | 'deleted' | null;
    needsWelcome: boolean;
  };
  access: { verified: boolean; isPending: boolean; refetch: jest.Mock };
  repository: AccountRepository | null;
};
let mockSnapshot: Snapshot;
let mockChallenges: ChallengeController;
let mockSubmission = 900;
const mockListeners = new Set<() => void>();
const mockReflectionUnmounted = jest.fn();
const mockRuntime = {
  get challenges() {
    return mockChallenges;
  },
  activity: { getRepository: () => mockSnapshot.repository },
  canStartChallenge: () => mockSnapshot.access.verified,
};

jest.mock('expo-crypto', () => ({
  randomUUID: () =>
    `20000000-0000-4000-8000-${String(++mockSubmission).padStart(12, '0')}`,
}));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../providers/AppProvider', () => {
  const React = require('react') as typeof import('react');
  function useSnapshot() {
    return React.useSyncExternalStore(
      (listener) => {
        mockListeners.add(listener);
        return () => mockListeners.delete(listener);
      },
      () => mockSnapshot,
      () => mockSnapshot,
    );
  }
  return {
    AppProvider: ({ children }: { children: ReactNode }) => children,
    useIdentity: () => useSnapshot().identity,
    useAccess: () => useSnapshot().access,
    useJournal: () => useSnapshot().repository,
    useRuntime: () => mockRuntime,
  };
});
jest.mock('../identity/welcome/WelcomeTransition', () => ({
  WelcomeTransition: ({ children }: { children: ReactNode }) => children,
  useWelcomeTransition: () => false,
}));
jest.mock('../saving/SavingFeedback', () => ({
  SavingFeedbackShell: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../../features/challenges/ChallengeScreen', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return { ChallengeScreen: () => <Text>Home ready</Text> };
});
// The cold challenge case has no accepted start. Its deck gestures and artwork
// are outside this route/ownership integration boundary.
jest.mock('../../features/challenges/active/ActiveChallengeContent', () => ({
  ActiveChallengeContent: () => null,
}));
jest.mock('../../platform/motion/MotionPreferencesProvider', () => ({
  MotionPreferencesProvider: ({ children }: { children: ReactNode }) =>
    children,
}));
jest.mock('../../platform/haptics/HapticsPreferencesProvider', () => ({
  HapticsPreferencesProvider: ({ children }: { children: ReactNode }) =>
    children,
}));

function TrackedReflectionRoute() {
  useEffect(
    () => () => {
      mockReflectionUnmounted();
    },
    [],
  );
  return <ReflectionRoute />;
}

const routes = {
  _layout: { default: RootLayout, unstable_settings },
  access: AccessRoute,
  acceptance: () => <Text>Acceptance ready</Text>,
  '(tabs)/_layout': () => <Stack screenOptions={{ animation: 'none' }} />,
  '(tabs)/index': HomeRoute,
  '(tabs)/progress': () => <Text>Progress ready</Text>,
  '(challenge)/challenge': ChallengeRoute,
  '(challenge)/success': () => <Text>Success ready</Text>,
  '(challenge)/reflection': TrackedReflectionRoute,
  'account/recover': () => <Text>Recover ready</Text>,
  'account/keys': () => <Text>Keys ready</Text>,
  'account/devices': () => <Text>Devices ready</Text>,
  'account/transfer': () => <Text>Transfer ready</Text>,
  'account/troubleshooting': () => <Text>Troubleshooting ready</Text>,
  'account/sign-in': () => <Text>Sign in ready</Text>,
  'auth/callback': () => <Text>Callback ready</Text>,
  settings: () => <Text>Settings ready</Text>,
  data: () => <Text>Data ready</Text>,
  recovery: () => <Text>Recovery ready</Text>,
  'delete-account': () => <Text>Deletion ready</Text>,
  welcome: () => <Text>Welcome ready</Text>,
  preview: () => <Text>Preview ready</Text>,
};

let storage: MemoryStorage;
let repository: AccountRepository;
let otherRepository: AccountRepository;
const repositories: AccountRepository[] = [];
function createRepository(accountId: string) {
  const next = new AccountRepository({
    accountId,
    storage,
    localJournal: memoryLocalJournal(accountId, storage),
    transport: backend(),
    dataMode: 'local',
    today,
    timeZone: zone,
  });
  next.setEnvironment({ active: true, online: false });
  repositories.push(next);
  return next;
}
async function updateSnapshot(next: Snapshot) {
  await act(() => {
    mockSnapshot = next;
    for (const listener of mockListeners) listener();
  });
}
async function expireAccess() {
  await updateSnapshot({
    ...mockSnapshot,
    access: { ...mockSnapshot.access, verified: false },
  });
}
function openReflection(attemptId: string | undefined = uuid(1)) {
  return renderRouter(routes, {
    initialUrl: attemptId
      ? `/reflection?attemptId=${attemptId}`
      : '/reflection',
  });
}

beforeEach(async () => {
  mockSubmission = 900;
  mockReflectionUnmounted.mockClear();
  storage = new MemoryStorage();
  repository = createRepository(owner);
  otherRepository = createRepository(otherOwner);
  await repository.complete(input(), card);
  await otherRepository.complete(input(2), card);
  await otherRepository.submitReflection(uuid(2), uuid(200), {
    feeling: 'a_lot_better',
    text: 'Another owner’s synthetic writing',
  });
  mockSnapshot = {
    identity: {
      initialized: true,
      busy: false,
      account: { userId: owner },
      collectionId: owner,
      collectionKind: 'account',
      deletionStatus: null,
      needsWelcome: false,
    },
    access: { verified: true, isPending: false, refetch: jest.fn() },
    repository,
  };
  mockChallenges = new ChallengeController(
    { request: jest.fn() },
    { repository: () => mockSnapshot.repository },
  );
});
afterEach(() => {
  mockChallenges.dispose();
  for (const current of repositories.splice(0)) current.dispose();
});

it('preserves unsaved feeling and text across access expiry and saves them locally', async () => {
  const navigation = await openReflection();
  await fireEvent.press(
    await screen.findByRole('radio', { name: 'A little bit better' }),
  );
  await fireEvent.changeText(
    screen.getByLabelText('Your reflection'),
    'Accepted challenge, unfinished reflection',
  );
  expect(repository.getAttempt(uuid(1))?.reflection).toBeNull();

  await expireAccess();
  expect(navigation.getPathname()).toBe('/reflection');
  expect(mockReflectionUnmounted).not.toHaveBeenCalled();
  expect(
    screen.getByRole('radio', { name: 'A little bit better' }).props
      .accessibilityState.checked,
  ).toBe(true);
  expect(screen.getByLabelText('Your reflection').props.value).toBe(
    'Accepted challenge, unfinished reflection',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Save Reflection' }),
  );
  expect(await screen.findByText('We can’t verify access yet.')).toBeTruthy();
  expect(navigation.getPathname()).toBe('/');
  expect(
    (await memoryLocalJournal(owner, storage).get(uuid(1)))?.reflection,
  ).toMatchObject({
    feeling: 'a_little_better',
    text: 'Accepted challenge, unfinished reflection',
  });
});

it('retains newer typing when a save finishes after access expires', async () => {
  const navigation = await openReflection();
  await fireEvent.changeText(
    await screen.findByLabelText('Your reflection'),
    'Submitted before expiry',
  );
  const commit = deferred<void>();
  const journalBackend = memoryJournalBackend(storage);
  journalBackend.beforeCommit = () => commit.promise;
  try {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Save Reflection' }),
    );
    await expireAccess();
    await fireEvent.changeText(
      screen.getByLabelText('Your reflection'),
      'Newer writing after expiry',
    );
    await act(async () => commit.resolve());
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save Reflection' }),
      ).toBeEnabled(),
    );
    expect(navigation.getPathname()).toBe('/reflection');
    expect(mockReflectionUnmounted).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Your reflection').props.value).toBe(
      'Newer writing after expiry',
    );
    expect(repository.getAttempt(uuid(1))?.reflection?.text).toBe(
      'Submitted before expiry',
    );
    journalBackend.beforeCommit = null;
    await fireEvent.press(
      screen.getByRole('button', { name: 'Save Reflection' }),
    );
    expect(await screen.findByText('We can’t verify access yet.')).toBeTruthy();
    expect(
      (await memoryLocalJournal(owner, storage).get(uuid(1)))?.reflection.text,
    ).toBe('Newer writing after expiry');
  } finally {
    commit.resolve();
    journalBackend.beforeCommit = null;
  }
});

it('discards the former owner’s editor when the active account changes', async () => {
  await openReflection();
  await fireEvent.changeText(
    await screen.findByLabelText('Your reflection'),
    'Former owner’s unsaved synthetic writing',
  );
  repository.setAccountCurrent(false);
  await updateSnapshot({
    ...mockSnapshot,
    identity: {
      ...mockSnapshot.identity,
      account: { userId: otherOwner },
      collectionId: otherOwner,
    },
    repository: otherRepository,
  });
  expect(
    await screen.findByText(
      'Open a completed challenge to add or edit its reflection.',
    ),
  ).toBeTruthy();
  expect(mockReflectionUnmounted).toHaveBeenCalled();
  expect(screen.queryByLabelText('Your reflection')).toBeNull();
  expect(repository.getAttempt(uuid(1))?.reflection).toBeNull();
  expect(otherRepository.getAttempt(uuid(1))).toBeUndefined();
});

it.each(['pending', 'cleanup', 'deleted'] as const)(
  'removes the editor and its Back history when account deletion is %s',
  async (deletionStatus) => {
    const navigation = await openReflection();
    await fireEvent.changeText(
      await screen.findByLabelText('Your reflection'),
      'Unsaved synthetic writing before deletion',
    );
    await expireAccess();
    await updateSnapshot({
      ...mockSnapshot,
      identity: { ...mockSnapshot.identity, deletionStatus },
    });
    const destination =
      deletionStatus === 'deleted' ? 'Welcome ready' : 'Deletion ready';
    expect(await screen.findByText(destination)).toBeTruthy();
    expect(navigation.getPathname()).toBe(
      deletionStatus === 'deleted' ? '/welcome' : '/delete-account',
    );
    expect(mockReflectionUnmounted).toHaveBeenCalled();
    expect(screen.queryByLabelText('Your reflection')).toBeNull();
    if (router.canGoBack()) await act(() => router.back());
    expect(await screen.findByText(destination)).toBeTruthy();
    expect(screen.queryByLabelText('Your reflection')).toBeNull();
    expect(repository.getAttempt(uuid(1))?.reflection).toBeNull();
  },
);

it.each([true, false])(
  'dismisses a cold challenge with no owner-local active start (verified=%s)',
  async (verified) => {
    mockSnapshot.access.verified = verified;
    const navigation = await renderRouter(routes, {
      initialUrl: '/challenge',
    });
    expect(
      await screen.findByText(
        verified ? 'Home ready' : 'We can’t verify access yet.',
      ),
    ).toBeTruthy();
    expect(navigation.getPathname()).toBe('/');
    expect(screen.queryByText('Success ready')).toBeNull();
    expect(repository.store.getState().flowAttemptId).toBeNull();
  },
);

it.each([null, uuid(99), uuid(2)])(
  'does not expose an editor or another owner’s writing for unavailable attempt %s',
  async (attemptId) => {
    await openReflection(attemptId ?? '');
    expect(
      await screen.findByText(
        'Open a completed challenge to add or edit its reflection.',
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Your reflection')).toBeNull();
    expect(
      screen.queryByDisplayValue('Another owner’s synthetic writing'),
    ).toBeNull();
    expect(otherRepository.getAttempt(uuid(2))?.reflection?.text).toBe(
      'Another owner’s synthetic writing',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
    expect(await screen.findByText('Home ready')).toBeTruthy();
  },
);
