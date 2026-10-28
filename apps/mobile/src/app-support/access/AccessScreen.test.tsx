import { fireEvent, render } from '@testing-library/react-native';
import { AccessScreen } from './AccessScreen';
import { useAccess, useIdentity } from '../providers/AppProvider';
let mockWelcomePending = false;
jest.mock('../identity/welcome/WelcomeTransition', () => ({
  useWelcomeTransition: () => mockWelcomePending,
}));
jest.mock('../providers/AppProvider', () => ({
  useAccess: jest.fn(),
  useIdentity: jest.fn(),
}));
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    Link: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Redirect: ({ href }: { href: string }) => <Text>Redirect: {href}</Text>,
  };
});
const access = useAccess as jest.Mock;
const identity = useIdentity as jest.Mock;
beforeEach(() => {
  mockWelcomePending = false;
  identity.mockReturnValue({
    initialized: true,
    busy: false,
    account: { userId: 'a' },
  });
});

it('admits a connected account with verified access without a legal receipt boundary', async () => {
  access.mockReturnValue({ verified: true });
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
  access.mockReturnValue({ verified: false });
  const screen = await render(<AccessScreen />);
  expect(screen.getByText('Redirect: /welcome')).toBeTruthy();
  expect(screen.queryByText('Redirect: /recovery')).toBeNull();
});
it('keeps a new replacement on Terms while its preparation cover is opening', async () => {
  mockWelcomePending = true;
  access.mockReturnValue({ isPending: true, verified: false });
  const screen = await render(<AccessScreen />);
  expect(screen.getByText('Redirect: /acceptance')).toBeTruthy();
  expect(screen.queryByText('Redirect: /welcome')).toBeNull();
  expect(screen.queryByText('Checking your access…')).toBeNull();
});
it('keeps unavailable access closed and offers retry and recovery without a welcome questionnaire', async () => {
  const refetch = jest.fn();
  access.mockReturnValue({
    isPending: false,
    verified: false,
    data: { status: 'unavailable' },
    refetch,
  });
  const screen = await render(<AccessScreen />);
  expect(screen.getByText('We can’t verify access yet.')).toBeTruthy();
  expect(screen.getByText('Account')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Check access again' }),
  );
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
});
it('distinguishes unpaid from unavailable without inventing a purchase action', async () => {
  access.mockReturnValue({
    isPending: false,
    verified: false,
    data: { status: 'unpaid' },
    refetch: jest.fn(),
  });
  const screen = await render(<AccessScreen />);
  expect(screen.getByText(/Purchases aren’t available/)).toBeTruthy();
  expect(screen.queryByText('We can’t verify access yet.')).toBeNull();
});
it('explains approved free testing without asking for a subscription', async () => {
  access.mockReturnValue({
    isPending: false,
    verified: false,
    data: { status: 'unpaid', source: 'free_beta' },
    refetch: jest.fn(),
  });
  const screen = await render(<AccessScreen />);
  expect(screen.getByText(/This is a free test build/)).toBeTruthy();
  expect(screen.queryByText(/active subscription/)).toBeNull();
  expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
});
it('enters tabs only with verified access and returns to recovery when identity disappears', async () => {
  access.mockReturnValue({ verified: true });
  const screen = await render(<AccessScreen />);
  expect(screen.getByText('Redirect: /(tabs)')).toBeTruthy();
  identity.mockReturnValue({ initialized: true, busy: false, account: null });
  await screen.rerender(<AccessScreen />);
  expect(screen.getByText('Redirect: /recovery')).toBeTruthy();
});

it.each([false, true])(
  'routes a restored deleted account to welcome while busy=%s, even with stale access',
  async (busy) => {
    identity.mockReturnValue({
      initialized: true,
      account: null,
      busy,
      deletionStatus: 'deleted',
    });
    access.mockReturnValue({ verified: true });
    const screen = await render(<AccessScreen />);
    expect(screen.getByText('Redirect: /welcome')).toBeTruthy();
    expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
    expect(screen.queryByText('Redirect: /recovery')).toBeNull();
  },
);

it.each(['pending', 'cleanup'])(
  'resumes %s deletion before presenting access or account creation',
  async (deletionStatus) => {
    identity.mockReturnValue({
      initialized: true,
      account: null,
      busy: true,
      deletionStatus,
    });
    access.mockReturnValue({ verified: true });
    const screen = await render(<AccessScreen />);
    expect(screen.getByText('Redirect: /delete-account')).toBeTruthy();
    expect(screen.queryByText('Redirect: /welcome')).toBeNull();
    expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
  },
);

it.each([
  { initialized: false, busy: false, account: null },
  { initialized: true, busy: true, account: null },
])(
  'waits for account initialization or connection before showing access',
  async (state) => {
    identity.mockReturnValue(state);
    access.mockReturnValue({ verified: false });
    const screen = await render(<AccessScreen />);
    expect(screen.getByLabelText('Loading JustGO')).toBeTruthy();
    expect(screen.queryByText('Redirect: /recovery')).toBeNull();
  },
);

it.each([true, false])(
  'keeps pending access quiet with an account=%s',
  async (hasAccount) => {
    if (!hasAccount)
      identity.mockReturnValue({
        initialized: true,
        busy: false,
        account: null,
        collectionId: 'local-owner',
        needsWelcome: false,
      });
    const refetch = jest.fn();
    access.mockReturnValue({
      verified: false,
      isPending: true,
      isFetching: true,
      refetch,
    });
    const screen = await render(<AccessScreen />);
    expect(screen.getByLabelText('Loading JustGO')).toBeTruthy();
    expect(screen.queryByText('Checking your access…')).toBeNull();
    expect(screen.queryByText('Checking access for this phone.')).toBeNull();
    expect(screen.queryByText('Your account is connected.')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Check access again' }),
    ).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Account')).toBeNull();
    expect(screen.queryByText('Preview app screens')).toBeNull();
    expect(screen.queryByText('View saved history')).toBeNull();
    expect(refetch).not.toHaveBeenCalled();
  },
);

it('opens the app after pending access succeeds without showing the recovery page', async () => {
  access.mockReturnValue({ verified: false, isPending: true });
  const screen = await render(<AccessScreen />);
  expect(screen.getByLabelText('Loading JustGO')).toBeTruthy();
  access.mockReturnValue({
    verified: true,
    isPending: false,
    isFetching: true,
  });
  await screen.rerender(<AccessScreen />);
  expect(screen.getByText('Redirect: /(tabs)')).toBeTruthy();
  expect(screen.queryByLabelText('Loading JustGO')).toBeNull();
  expect(screen.queryByText('We can’t verify access yet.')).toBeNull();
});

it.each([
  { data: { status: 'unpaid' }, title: 'Your next step awaits.' },
  { isError: true, title: 'We can’t verify access yet.' },
])(
  'restores recovery actions when pending access settles: $title',
  async (result) => {
    const refetch = jest.fn();
    access.mockReturnValue({ verified: false, isPending: true, refetch });
    const screen = await render(<AccessScreen />);
    expect(screen.getByLabelText('Loading JustGO')).toBeTruthy();
    access.mockReturnValue({
      verified: false,
      isPending: false,
      refetch,
      ...result,
    });
    await screen.rerender(<AccessScreen />);
    expect(screen.queryByLabelText('Loading JustGO')).toBeNull();
    expect(screen.getByText(result.title)).toBeTruthy();
    expect(screen.getByText('Account')).toBeTruthy();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Check access again' }),
    );
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
  },
);

it.each(['guest', 'signed-out'] as const)(
  'keeps %s local history reachable offline while challenge access is unavailable',
  async (mode) => {
    identity.mockReturnValue({
      initialized: true,
      busy: false,
      account: null,
      collectionId: 'local-owner',
      mode,
      needsWelcome: false,
    });
    access.mockReturnValue({
      verified: false,
      isPending: false,
      isError: true,
      refetch: jest.fn(),
    });
    const screen = await render(<AccessScreen />);
    expect(screen.getByText('View saved history')).toBeTruthy();
    expect(screen.queryByText('Redirect: /recovery')).toBeNull();
    expect(screen.queryByText('Redirect: /(tabs)')).toBeNull();
    expect(screen.getByText('We can’t verify access yet.')).toBeTruthy();
  },
);
