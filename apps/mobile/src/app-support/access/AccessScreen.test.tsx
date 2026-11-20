import { render } from '@testing-library/react-native';
import { AccessScreen } from './AccessScreen';
import { useIdentity } from '../providers/AppProvider';
let mockWelcomePending = false;
let mockLock: 'open' | 'checking' | 'locked' | null = null;
jest.mock('../identity/welcome/WelcomeTransition', () => ({
  useWelcomeTransition: () => mockWelcomePending,
}));
jest.mock('../providers/AppProvider', () => ({
  useIdentity: jest.fn(),
  useRuntime: () => ({
    access: mockLock && {
      subscribe: () => () => {},
      status: () => mockLock,
    },
  }),
}));
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
  };
});
const identity = useIdentity as jest.Mock;
beforeEach(() => {
  mockWelcomePending = false;
  mockLock = null;
  identity.mockReturnValue({
    initialized: true,
    busy: false,
    account: { userId: 'a' },
  });
});

it('admits a connected account without a legal receipt boundary or an access check', async () => {
  const screen = await render(<AccessScreen />);
  expect(screen.getByText('Redirect: /(tabs)')).toBeTruthy();
  expect(screen.queryByText('Redirect: /acceptance')).toBeNull();
});

it('sends a fresh installation to welcome before account creation', async () => {
  identity.mockReturnValue({
    initialized: true,
    busy: false,
    account: null,
    needsWelcome: true,
  });
  const screen = await render(<AccessScreen />);
  expect(screen.getByText('Redirect: /welcome')).toBeTruthy();
  expect(screen.queryByText('Redirect: /recovery')).toBeNull();
});

it('keeps a new replacement on Terms while its preparation cover is opening', async () => {
  mockWelcomePending = true;
  const screen = await render(<AccessScreen />);
  expect(screen.getByText('Redirect: /acceptance')).toBeTruthy();
  expect(screen.queryByText('Redirect: /welcome')).toBeNull();
});

it('enters tabs and returns to recovery when identity disappears', async () => {
  const screen = await render(<AccessScreen />);
  expect(screen.getByText('Redirect: /(tabs)')).toBeTruthy();
  identity.mockReturnValue({ initialized: true, busy: false, account: null });
  await screen.rerender(<AccessScreen />);
  expect(screen.getByText('Redirect: /recovery')).toBeTruthy();
});

it.each([false, true])(
  'routes a restored deleted account to welcome while busy=%s',
  async (busy) => {
    identity.mockReturnValue({
      initialized: true,
      account: null,
      busy,
      deletionStatus: 'deleted',
    });
    const screen = await render(<AccessScreen />);
    expect(screen.getByText('Redirect: /welcome')).toBeTruthy();
    expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
    expect(screen.queryByText('Redirect: /recovery')).toBeNull();
  },
);

it.each(['pending', 'cleanup'])(
  'resumes %s deletion before entering the app or creating an account',
  async (deletionStatus) => {
    identity.mockReturnValue({
      initialized: true,
      account: null,
      busy: true,
      deletionStatus,
    });
    const screen = await render(<AccessScreen />);
    expect(screen.getByText('Redirect: /delete-account')).toBeTruthy();
    expect(screen.queryByText('Redirect: /welcome')).toBeNull();
    expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
  },
);

it.each([
  { initialized: false, busy: false, account: null },
  { initialized: true, busy: true, account: null },
])('waits quietly for account initialization or connection', async (state) => {
  identity.mockReturnValue(state);
  const screen = await render(<AccessScreen />);
  expect(screen.getByLabelText('Loading JustGO')).toBeTruthy();
  expect(screen.queryByText('Redirect: /recovery')).toBeNull();
  expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
});

it.each(['guest', 'signed-out'] as const)(
  'enters the app with a %s local collection and no server answer',
  async (mode) => {
    identity.mockReturnValue({
      initialized: true,
      busy: false,
      account: null,
      collectionId: 'local-owner',
      mode,
      needsWelcome: false,
    });
    const screen = await render(<AccessScreen />);
    expect(screen.getByText('Redirect: /(tabs)')).toBeTruthy();
    expect(screen.queryByText('Redirect: /recovery')).toBeNull();
  },
);

describe('with billing on', () => {
  it('waits on the loading screen while the first access answer is on its way', async () => {
    mockLock = 'checking';
    const screen = await render(<AccessScreen />);
    expect(screen.getByLabelText('Loading JustGO')).toBeTruthy();
    expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
    expect(screen.queryByText('Redirect: /locked')).toBeNull();
  });

  it('sends an owner without verified access to the locked screen', async () => {
    mockLock = 'locked';
    const screen = await render(<AccessScreen />);
    expect(screen.getByText('Redirect: /locked')).toBeTruthy();
    expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
  });

  it('enters the app with verified access', async () => {
    mockLock = 'open';
    const screen = await render(<AccessScreen />);
    expect(screen.getByText('Redirect: /(tabs)')).toBeTruthy();
  });

  it('sends a fresh installation to welcome before any lock', async () => {
    mockLock = 'locked';
    identity.mockReturnValue({
      initialized: true,
      busy: false,
      account: null,
      needsWelcome: true,
    });
    const screen = await render(<AccessScreen />);
    expect(screen.getByText('Redirect: /welcome')).toBeTruthy();
  });
});
