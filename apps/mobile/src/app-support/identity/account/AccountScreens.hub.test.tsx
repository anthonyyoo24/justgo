import {
  harness,
  connected,
  userId,
  AccountToolRoute,
} from '../../../../test-support/identity/account';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { Linking } from 'react-native';

import RecoveryRoute from '../../../app/recovery';

import { showMessageToast } from '../../../platform/toast/Toast';

import { supportContact, contactFailureMessage } from '../../contact';

it('uses grouped account sections, opens focused routes and returns to Settings', async () => {
  await connected();
  const screen = render(<RecoveryRoute />);
  expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual([
    'Account & recovery',
    'Account',
    'Recovery',
    'Devices',
  ]);
  expect(screen.getByText('Private account')).toBeTruthy();
  expect(screen.getByText('No email or password.')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Back to app' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Get help' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Refresh account' })).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Renew this session' }),
  ).toBeNull();
  for (const [label, path] of [
    ['Recovery keys', '/account/keys'],
    ['Move to another phone', '/account/transfer'],
    ['Devices', '/account/devices'],
    ['Troubleshooting', '/account/troubleshooting'],
  ] as const) {
    fireEvent.press(screen.getByRole('link', { name: label }));
    expect(harness.mockRouter.push).toHaveBeenLastCalledWith(path);
  }
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(harness.mockRouter.back).toHaveBeenCalledTimes(1);
  harness.mockRouter.canGoBack.mockReturnValue(false);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(harness.mockRouter.replace).toHaveBeenLastCalledWith('/settings');
});

it('keeps private support available from disconnected recovery with safe failure feedback and retry', async () => {
  await connected();
  harness.mockController.rejectSession(
    harness.mockController.currentSession()!.token,
    'SESSION_REVOKED',
  );
  const open = jest
    .spyOn(Linking, 'openURL')
    .mockRejectedValueOnce(new Error('private native detail'))
    .mockResolvedValueOnce(undefined);
  const screen = render(<RecoveryRoute />);
  expect(screen.queryByRole('link', { name: 'Back to app' })).toBeNull();
  harness.mockRouter.canGoBack.mockReturnValue(false);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(harness.mockRouter.replace).toHaveBeenLastCalledWith('/settings');
  fireEvent.press(screen.getByRole('button', { name: 'Get help' }));
  await waitFor(() =>
    expect(showMessageToast).toHaveBeenCalledWith(
      'activity',
      contactFailureMessage,
    ),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Get help' }));
  await waitFor(() => expect(open).toHaveBeenNthCalledWith(2, supportContact));
  open.mockRestore();
});

it('keeps session maintenance in Troubleshooting and falls back to the account page', async () => {
  const { fetcher } = await connected();
  harness.mockTool = 'troubleshooting';
  const previous = harness.mockController.getSnapshot().account!.sessionId;
  const screen = render(<AccountToolRoute />);
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().busy).toBe(false),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Renew this session' }));
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().account?.sessionId).not.toBe(
      previous,
    ),
  );
  expect(
    fetcher.mock.calls.some(
      ([, init]) =>
        init?.body && JSON.parse(init.body as string).kind === 'renewal',
    ),
  ).toBe(true);
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().busy).toBe(false),
  );
  fireEvent.press(
    screen.getByRole('link', { name: 'Recover an existing account' }),
  );
  expect(harness.mockRouter.push).toHaveBeenLastCalledWith('/account/recover');
  harness.mockRouter.canGoBack.mockReturnValue(false);
  fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(harness.mockRouter.replace).toHaveBeenLastCalledWith('/recovery');
});

it('keeps the connected account after a network error and retries its connection', async () => {
  const { fetcher } = await connected();
  fetcher.mockRejectedValueOnce(new Error('synthetic network failure'));
  harness.mockTool = 'troubleshooting';
  const screen = render(<AccountToolRoute />);
  await waitFor(() =>
    expect(screen.getByText(/Couldn’t connect/)).toBeTruthy(),
  );
  expect(screen.queryByText('Connecting securely…')).toBeNull();
  expect(harness.mockController.getSnapshot().busyInBackground).toBe(false);
  expect(harness.mockController.getSnapshot().account?.userId).toBe(userId);
  fireEvent.press(screen.getByRole('button', { name: 'Retry connection' }));
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().busy).toBe(false),
  );
  expect(screen.queryByText(/Couldn’t connect/)).toBeNull();
  expect(harness.mockController.getSnapshot().account?.userId).toBe(userId);
});
