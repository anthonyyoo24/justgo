import { fireEvent, render } from '@testing-library/react-native';
import { Platform, Text } from 'react-native';
import { AppStartup, StartupSurface } from './AppStartup';
import { hideNativeSplash } from './native-splash';

type Identity = {
  initialized: boolean;
  needsWelcome: boolean;
  deletionStatus: 'pending' | 'cleanup' | 'deleted' | null;
  account: { userId: string } | null;
  collectionId: string | null;
};
let mockIdentity: Identity;
let mockJournal: {
  repository: { accountId: string } | null;
  state: { ready: boolean; hydrationError: string | null } | null;
};
const mockAdmission = jest.fn(() => ({ verified: false, isPending: true }));
jest.mock('../providers/AppProvider', () => ({
  useIdentity: () => mockIdentity,
  useActivityState: () => mockJournal,
  useAccess: () => mockAdmission(),
}));
jest.mock('../../platform/motion/motion', () => ({
  useMotionPreferences: () => ({ loading: false }),
}));
jest.mock('../../platform/haptics/haptics', () => ({
  useHapticPreferences: () => ({ loading: false }),
}));
jest.mock('./native-splash', () => ({ hideNativeSplash: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, 'OS', 'ios');
  mockIdentity = {
    initialized: true,
    needsWelcome: false,
    deletionStatus: null,
    account: null,
    collectionId: 'synthetic-guest',
  };
  mockJournal = {
    repository: { accountId: 'previous-owner' },
    state: { ready: true, hydrationError: null },
  };
});
afterEach(() => jest.restoreAllMocks());

it('waits for the selected guest collection instead of accepting an older owner’s hydrated journal', async () => {
  const content = () => (
    <AppStartup>
      <Text>Guest content</Text>
    </AppStartup>
  );
  const screen = await render(content());
  await fireEvent(screen.getByTestId('native-startup-surface'), 'layout');
  expect(hideNativeSplash).not.toHaveBeenCalled();
  mockJournal = {
    repository: { accountId: 'synthetic-guest' },
    state: { ready: false, hydrationError: null },
  };
  await screen.rerender(content());
  expect(hideNativeSplash).not.toHaveBeenCalled();
  mockJournal.state!.ready = true;
  await screen.rerender(content());
  expect(hideNativeSplash).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Guest content')).toBeTruthy();
  expect(mockAdmission).not.toHaveBeenCalled();
});

it.each(['pending', 'cleanup', 'deleted', 'welcome', 'no collection'] as const)(
  'exposes %s startup controls without waiting for an obsolete journal',
  async (state) => {
    if (state === 'welcome') mockIdentity.needsWelcome = true;
    else if (state === 'no collection') mockIdentity.collectionId = null;
    else mockIdentity.deletionStatus = state;
    mockJournal = { repository: null, state: null };
    const screen = await render(
      <AppStartup>
        <Text>Startup controls</Text>
      </AppStartup>,
    );
    expect(hideNativeSplash).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId('native-startup-surface'), 'layout');
    expect(hideNativeSplash).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Startup controls')).toBeTruthy();
  },
);

it('requires native layout even when ready, releases only once, and leaves web content unwrapped', async () => {
  const screen = await render(
    <StartupSurface ready>
      <Text>Ready</Text>
    </StartupSurface>,
  );
  expect(hideNativeSplash).not.toHaveBeenCalled();
  await fireEvent(screen.getByTestId('native-startup-surface'), 'layout');
  await screen.rerender(
    <StartupSurface ready={false}>
      <Text>Ready</Text>
    </StartupSurface>,
  );
  await screen.rerender(
    <StartupSurface ready>
      <Text>Ready</Text>
    </StartupSurface>,
  );
  expect(hideNativeSplash).toHaveBeenCalledTimes(1);
  await screen.unmount();
  jest.replaceProperty(Platform, 'OS', 'web');
  jest.mocked(hideNativeSplash).mockClear();
  const web = await render(
    <StartupSurface ready={false}>
      <Text>Web content</Text>
    </StartupSurface>,
  );
  expect(web.getByText('Web content')).toBeTruthy();
  expect(web.queryByTestId('native-startup-surface')).toBeNull();
  expect(hideNativeSplash).not.toHaveBeenCalled();
});
