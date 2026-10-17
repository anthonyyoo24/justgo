import {
  harness,
  connected,
  otherDeviceId,
  userId,
  AccountToolRoute,
} from '../../../../test-support/identity/account';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { ActivityIndicator, AppState, type AppStateStatus } from 'react-native';

import RecoveryRoute from '../../../app/recovery';

it.each([
  ['keys', 'Show recovery key'],
  ['transfer', 'Review transfer'],
  ['devices', `Revoke device ${otherDeviceId.slice(0, 8)}`],
  ['troubleshooting', 'Refresh account'],
])(
  'quietly refreshes %s while preserving its action guard',
  async (tool, label) => {
    const { controls } = await connected();
    let finish!: () => void;
    controls.holdRefresh = new Promise((resolve) => {
      finish = resolve;
    });
    harness.mockTool = tool;
    const screen = render(<AccountToolRoute />);
    try {
      await waitFor(() =>
        expect(harness.mockController.getSnapshot().busy).toBe(true),
      );
      expect(screen.queryByText('Connecting securely…')).toBeNull();
      expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    } finally {
      await act(async () => finish());
      await waitFor(() =>
        expect(harness.mockController.getSnapshot().busy).toBe(false),
      );
      screen.unmount();
    }
  },
);

it('shows feedback for a manual refresh even when a focus refresh overlaps', async () => {
  const { controls } = await connected();
  harness.mockTool = 'troubleshooting';
  const screen = render(<AccountToolRoute />);
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().busy).toBe(false),
  );
  let finish!: () => void;
  controls.holdRefresh = new Promise((resolve) => {
    finish = resolve;
  });
  try {
    fireEvent.press(screen.getByRole('button', { name: 'Refresh account' }));
    expect(
      screen.getByRole('progressbar', { name: 'Refresh account in progress' }),
    ).toBeTruthy();
    expect(screen.queryByText('Connecting securely…')).toBeNull();
    harness.mockFocused = false;
    screen.rerender(<AccountToolRoute />);
    harness.mockFocused = true;
    screen.rerender(<AccountToolRoute />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  } finally {
    await act(async () => finish());
    await waitFor(() =>
      expect(harness.mockController.getSnapshot().busy).toBe(false),
    );
    expect(screen.queryByText('Connecting securely…')).toBeNull();
    screen.unmount();
  }
});

it.each([
  'renew',
  'revoke-key',
  'revoke-device',
  'review',
  'approve',
  'retry',
] as const)(
  'shows only the %s action spinner and restores the control when finished',
  async (action) => {
    const { controls, fetcher } = await connected();
    if (action === 'revoke-key') await harness.mockController.saveKey();
    if (action === 'retry')
      fetcher.mockRejectedValueOnce(new Error('synthetic network failure'));
    harness.mockTool =
      action === 'revoke-key'
        ? 'keys'
        : action === 'revoke-device'
          ? 'devices'
          : action === 'review' || action === 'approve'
            ? 'transfer'
            : 'troubleshooting';
    const screen = render(<AccountToolRoute />);
    await waitFor(() =>
      expect(harness.mockController.getSnapshot().busy).toBe(false),
    );
    if (action === 'review' || action === 'approve') {
      fireEvent.changeText(
        screen.getByLabelText('Transfer code'),
        'ABCDEF0123456789',
      );
      if (action === 'approve') {
        fireEvent.press(
          screen.getByRole('button', { name: 'Review transfer' }),
        );
        await screen.findByLabelText('Verification digits');
        fireEvent.changeText(
          screen.getByLabelText('Verification digits'),
          '012345',
        );
      }
    }
    const keyId = harness.mockController
      .getSnapshot()
      .recoveryKeys.find((k) => k.kind === 'key')?.id;
    const details = {
      renew: ['Renew this session', '/sessions', 'POST'],
      'revoke-key': [
        `Revoke recovery key ${keyId?.slice(0, 8)}`,
        `/credentials/${keyId}`,
        'DELETE',
      ],
      'revoke-device': [
        `Revoke device ${otherDeviceId.slice(0, 8)}`,
        `/devices/${otherDeviceId}`,
        'DELETE',
      ],
      review: ['Review transfer', '/transfer-inspections', 'POST'],
      approve: ['Approve this device', '/transfer-approvals', 'POST'],
      retry: ['Retry connection', '/sessions/current', 'GET'],
    } as const;
    const [label, path, method] = details[action];
    let finish!: () => void;
    controls.holdRequest = {
      path,
      method,
      gate: new Promise((resolve) => {
        finish = resolve;
      }),
    };
    try {
      fireEvent.press(screen.getByRole('button', { name: label }));
      if (action === 'revoke-key' || action === 'revoke-device')
        fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
      await waitFor(() =>
        expect(
          fetcher.mock.calls.some(
            ([url, init]) =>
              url.toString().endsWith(path) && init?.method === method,
          ),
        ).toBe(true),
      );
      expect(
        screen.getByRole('progressbar', { name: `${label} in progress` }),
      ).toBeTruthy();
      expect(screen.getAllByRole('progressbar')).toHaveLength(1);
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
      expect(screen.queryByText('Connecting securely…')).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: label }));
    } finally {
      await act(async () => finish());
      await waitFor(() =>
        expect(harness.mockController.getSnapshot().busy).toBe(false),
      );
      expect(screen.queryByRole('progressbar')).toBeNull();
      screen.unmount();
    }
  },
);

it('reveals only requested keys, hides them on background and cancels revocation safely', async () => {
  const { fetcher } = await connected();
  let background: ((next: AppStateStatus) => void) | undefined;
  const listener = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, cb) => {
      background = cb;
      return { remove: jest.fn() };
    });
  const screen = render(<AccountToolRoute />);
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().busy).toBe(false),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Show recovery key' }));
  await waitFor(() =>
    expect(screen.getByText(/aaaaaaaa aaaaaaaa/)).toBeTruthy(),
  );
  act(() => background!('background'));
  expect(screen.queryByText(/aaaaaaaa aaaaaaaa/)).toBeNull();
  expect(harness.mockController.getSnapshot().key).toBeNull();
  const key = harness.mockController
    .getSnapshot()
    .recoveryKeys.find((k) => k.kind === 'key')!;
  fireEvent.press(
    screen.getByRole('button', {
      name: `Revoke recovery key ${key.id.slice(0, 8)}`,
    }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(
    false,
  );
  fireEvent.press(
    screen.getByRole('button', {
      name: `Revoke recovery key ${key.id.slice(0, 8)}`,
    }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() =>
    expect(screen.getByText('No recovery keys yet.')).toBeTruthy(),
  );
  expect(harness.mockController.getSnapshot().account?.userId).toBe(userId);
  listener.mockRestore();
});

it('keeps a late key response hidden after navigation focus is lost', async () => {
  const { controls } = await connected();
  let finish!: () => void;
  controls.holdKey = new Promise((resolve) => {
    finish = resolve;
  });
  const screen = render(<AccountToolRoute />);
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().busy).toBe(false),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Show recovery key' }));
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().busy).toBe(true),
  );
  expect(
    screen.getByRole('progressbar', { name: 'Show recovery key in progress' }),
  ).toBeTruthy();
  expect(screen.queryByText('Connecting securely…')).toBeNull();
  harness.mockFocused = false;
  screen.rerender(<AccountToolRoute />);
  await act(async () => {
    finish();
  });
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().busy).toBe(false),
  );
  harness.mockFocused = true;
  screen.rerender(<AccountToolRoute />);
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().busy).toBe(false),
  );
  expect(screen.queryByText(/aaaaaaaa aaaaaaaa/)).toBeNull();
  screen.unmount();
});

it('identifies this phone, confirms removal and sends revoked sessions to recovery', async () => {
  const { fetcher } = await connected();
  harness.mockTool = 'devices';
  const deviceId = harness.mockController.getSnapshot().account!.deviceId;
  const screen = render(<AccountToolRoute />);
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().busy).toBe(false),
  );
  expect(screen.getByText(`This phone · ${deviceId.slice(0, 8)}`)).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', {
      name: `Revoke device ${otherDeviceId.slice(0, 8)}`,
    }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(fetcher.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(
    false,
  );
  fireEvent.press(
    screen.getByRole('button', {
      name: `Revoke device ${otherDeviceId.slice(0, 8)}`,
    }),
  );
  fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.getByText('Access removed')).toBeTruthy());
  expect(harness.mockController.getSnapshot().account?.deviceId).toBe(deviceId);
  fireEvent.press(
    screen.getByRole('button', {
      name: `Revoke device ${deviceId.slice(0, 8)}`,
    }),
  );
  expect(screen.getByText(/This will sign this phone out/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() =>
    expect(screen.getByText('Redirect: /recovery')).toBeTruthy(),
  );
  expect(
    fetcher.mock.calls.some(
      ([url, init]) =>
        url.toString().endsWith(`/devices/${deviceId}`) &&
        init?.method === 'DELETE',
    ),
  ).toBe(true);
  screen.unmount();
  const recovery = render(<RecoveryRoute />);
  expect(
    recovery.getByRole('button', { name: 'Recover an existing account' }),
  ).toBeTruthy();
  expect(recovery.queryByText('Private account')).toBeNull();
});
