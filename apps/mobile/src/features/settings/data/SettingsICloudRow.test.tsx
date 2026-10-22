import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Animated, Modal, StyleSheet } from 'react-native';
import { createStore } from 'zustand/vanilla';
import { SettingsICloudRow } from './SettingsICloudRow';
import { ICloudError, type ICloudStatus } from '../../../platform/icloud/model';
import { deferred } from '../../../../test-support/journal';
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
  const { useEffect } = require('react') as typeof import('react');
  return {
    useFocusEffect: (effect: () => () => void) => useEffect(effect, [effect]),
  };
});
const owner = '10000000-0000-4000-8000-000000000001';
let mockOwner: string | null = owner;
let mockStatus: ICloudStatus = {
  status: 'available',
  enabled: false,
  accountToken: 'a'.repeat(64),
};
const mockStatusRead = jest.fn(async () => mockStatus);
const mockToggle = jest.fn(
  async (
    enabled: boolean,
    synchronize?: () => Promise<void>,
    isCurrent?: () => boolean,
  ) => {
    if (enabled) await synchronize?.();
    if (isCurrent && !isCurrent()) throw new ICloudError('DISABLED');
    mockStatus = { ...mockStatus, enabled };
  },
);
const mockCoordinator = {
  store: createStore<{
    status: 'idle' | 'syncing' | 'error';
    error:
      | 'QUOTA_EXCEEDED'
      | 'RESET_CONFIRMATION_REQUIRED'
      | 'ZONE_RECOVERY_REQUIRED'
      | null;
  }>(() => ({ status: 'idle', error: null })),
  synchronize: jest.fn(),
  acknowledgeReset: jest.fn(),
  recoverMissingCollection: jest.fn(),
};
jest.mock('../../../app-support/providers/AppProvider', () => ({
  useRuntime: () => ({
    client: { ownsCollection: (id: string) => id === mockOwner },
    activity: { getICloudCoordinator: () => mockCoordinator },
  }),
  useJournal: () => ({ accountId: mockOwner }),
}));
jest.mock('../../../platform/icloud/icloud-sync', () => ({
  ...jest.requireActual('../../../platform/icloud/model'),
  iCloudSync: {
    status: () => mockStatusRead(),
    setEnabled: (
      enabled: boolean,
      synchronize?: () => Promise<void>,
      isCurrent?: () => boolean,
    ) =>
      synchronize
        ? mockToggle(enabled, synchronize, isCurrent)
        : mockToggle(enabled),
    subscribe: () => () => {},
  },
}));
jest.mock('../../../platform/motion/motion', () => ({
  useReduceMotion: () => mockReduceMotion,
}));
let mockReduceMotion = true;
beforeEach(() => {
  jest.clearAllMocks();
  mockStatusRead.mockReset().mockImplementation(async () => mockStatus);
  mockToggle
    .mockReset()
    .mockImplementation(
      async (
        enabled: boolean,
        synchronize?: () => Promise<void>,
        isCurrent?: () => boolean,
      ) => {
        if (enabled) await synchronize?.();
        if (isCurrent && !isCurrent()) throw new ICloudError('DISABLED');
        mockStatus = { ...mockStatus, enabled };
      },
    );
  mockCoordinator.synchronize.mockReset();
  mockCoordinator.acknowledgeReset.mockReset();
  mockCoordinator.recoverMissingCollection
    .mockReset()
    .mockResolvedValue(undefined);
  mockOwner = owner;
  mockReduceMotion = true;
  mockStatus = {
    status: 'available',
    enabled: false,
    accountToken: 'a'.repeat(64),
  };
  mockCoordinator.store.setState({ status: 'idle', error: null });
  mockCoordinator.synchronize.mockResolvedValue(undefined);
  mockCoordinator.acknowledgeReset.mockResolvedValue(undefined);
});

it.each([false, true])(
  'mounts directly in the confirmed %s state on every visit without an off-to-on transition',
  async (enabled) => {
    mockReduceMotion = false;
    const timing = jest.spyOn(Animated, 'timing');
    try {
      for (let visit = 0; visit < 2; visit++) {
        const status = deferred<ICloudStatus>();
        mockStatusRead.mockReturnValueOnce(status.promise);
        const screen = render(
          <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
        );
        expect(screen.getByText('iCloud Sync')).toBeTruthy();
        expect(
          screen.getByRole('progressbar', { name: 'Loading iCloud Sync' }),
        ).toBeTruthy();
        expect(screen.queryByRole('switch')).toBeNull();
        await act(async () => status.resolve({ ...mockStatus, enabled }));
        expect(screen.getByRole('switch')).toHaveProp(
          'accessibilityState',
          expect.objectContaining({ checked: enabled }),
        );
        const fill = screen
          .UNSAFE_getAllByType(Animated.View)
          .find((node) => node.props.testID === 'settings-toggle-fill');
        expect(fill).toBeDefined();
        expect(StyleSheet.flatten(fill?.props.style).opacity.__getValue()).toBe(
          enabled ? 1 : 0,
        );
        expect(timing).not.toHaveBeenCalled();
        expect(screen.queryByRole('progressbar')).toBeNull();
        screen.unmount();
      }
    } finally {
      timing.mockRestore();
    }
  },
);

it('settles a failed status read into the unavailable off state without an activation animation', async () => {
  mockReduceMotion = false;
  mockStatusRead.mockRejectedValueOnce(new Error('Synthetic status failure'));
  const timing = jest.spyOn(Animated, 'timing');
  try {
    const screen = render(
      <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
    );
    const toggle = await screen.findByRole('switch');
    expect(toggle).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: false }),
    );
    expect(timing).not.toHaveBeenCalled();
    expect(screen.queryByRole('progressbar')).toBeNull();
    fireEvent.press(toggle);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'iCloud is unavailable. Your data stays on this phone.',
    );
    expect(
      screen.getByRole('button', { name: 'Start Syncing' }),
    ).toBeDisabled();
  } finally {
    timing.mockRestore();
  }
});
it('defaults off and never enables or uploads merely by opening Data', async () => {
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
    false,
  );
  expect(mockToggle).not.toHaveBeenCalled();
  expect(mockCoordinator.synchronize).not.toHaveBeenCalled();
});
it('explains actual iCloud copying and starts it only after explicit confirmation', async () => {
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  expect(mockToggle).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  await waitFor(() =>
    expect(mockCoordinator.synchronize).toHaveBeenCalledTimes(1),
  );
  expect(mockToggle).toHaveBeenCalledWith(
    true,
    expect.any(Function),
    expect.any(Function),
  );
  await waitFor(() =>
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
      true,
    ),
  );
});
it('explains an unconfigured build inside the sheet with its sync action disabled', async () => {
  mockStatus = { status: 'not_configured', enabled: false, accountToken: null };
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.press(screen.getByRole('switch'));
  expect(
    await screen.findByText('iCloud Sync isn’t set up in this app version.'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start Syncing' })).toBeDisabled();
  expect(mockToggle).not.toHaveBeenCalled();
});
it('reports quota failures without claiming successful sync and permits a real retry', async () => {
  mockCoordinator.synchronize.mockRejectedValueOnce(
    new ICloudError('QUOTA_EXCEEDED'),
  );
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  await screen.findByText(
    'Your iCloud storage is full. Free up space then try again.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Close iCloud Sync' }));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Retry iCloud Sync' }),
  ).toBeNull();
  expect(screen.getByRole('switch')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: false }),
  );
  fireEvent.press(screen.getByRole('switch'));
  fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  await waitFor(() =>
    expect(mockCoordinator.synchronize).toHaveBeenCalledTimes(2),
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
});
it.each([
  ['ACCOUNT_CHANGED', 'Your iCloud account changed. Turn sync on again.'],
  ['CONFLICT', 'Couldn’t sync. Your data stays on this phone. Try again.'],
] as const)(
  'uses concise %s feedback inside the sheet',
  async (code, message) => {
    mockCoordinator.synchronize.mockRejectedValueOnce(new ICloudError(code));
    const screen = render(
      <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
    );
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    fireEvent.press(screen.getByRole('switch'));
    fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  },
);
it('keeps a prior quota error inside the sheet without expanding the Data row', async () => {
  mockCoordinator.store.setState({
    status: 'error',
    error: 'QUOTA_EXCEEDED',
  });
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  expect(screen.queryByRole('alert')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Retry iCloud Sync' }),
  ).toBeNull();
  fireEvent.press(screen.getByRole('switch'));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Your iCloud storage is full. Free up space then try again.',
  );
  expect(mockToggle).not.toHaveBeenCalled();
  expect(mockCoordinator.synchronize).not.toHaveBeenCalled();
});
it('retries a failed first enable only after another explicit opt-in', async () => {
  mockToggle.mockRejectedValueOnce(new ICloudError('UNAVAILABLE'));
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  await screen.findByText(
    'Couldn’t sync. Your data stays on this phone. Try again.',
  );
  expect(screen.queryByText(/Your iCloud storage is full/)).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Close iCloud Sync' }));
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.press(screen.getByRole('switch'));
  expect(mockToggle).toHaveBeenCalledTimes(1);
  expect(mockCoordinator.synchronize).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  });
  await waitFor(() =>
    expect(mockCoordinator.synchronize).toHaveBeenCalledTimes(1),
  );
  expect(mockToggle.mock.calls.map(([enabled]) => enabled)).toEqual([
    true,
    true,
  ]);
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
});

it.each(['close', 'backdrop', 'native-back'] as const)(
  'dismisses via %s without enabling sync or uploading',
  async (action) => {
    const screen = render(
      <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
    );
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    fireEvent.press(screen.getByRole('switch'));
    expect(screen.getByTestId('icloud-sync-sheet')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Turn on iCloud Sync' }),
    ).toBeNull();
    if (action === 'close')
      fireEvent.press(
        screen.getByRole('button', { name: 'Close iCloud Sync' }),
      );
    else if (action === 'backdrop')
      fireEvent.press(
        screen.getByTestId('icloud-sync-backdrop', {
          includeHiddenElements: true,
        }),
      );
    else act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(screen.queryByTestId('icloud-sync-sheet')).toBeNull();
    expect(mockToggle).not.toHaveBeenCalled();
    expect(mockCoordinator.synchronize).not.toHaveBeenCalled();
  },
);

it('keeps a centered busy action until sync completes and prevents duplicate starts or dismissal', async () => {
  let finish!: () => void;
  mockCoordinator.synchronize.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  await waitFor(() =>
    expect(mockCoordinator.synchronize).toHaveBeenCalledTimes(1),
  );
  expect(
    screen.getByRole('progressbar', { name: 'Starting iCloud sync' }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start Syncing' })).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Close iCloud Sync' }),
  ).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
  expect(screen.getByTestId('icloud-sync-sheet')).toBeTruthy();
  expect(mockToggle).toHaveBeenCalledTimes(1);
  expect(
    screen.getByRole('switch', { includeHiddenElements: true }),
  ).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: false }),
  );
  await act(async () => finish());
  expect(screen.queryByTestId('icloud-sync-sheet')).toBeNull();
  expect(screen.getByRole('switch')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: true }),
  );
});

it('switches enabled sync off directly without presenting the consent sheet', async () => {
  mockStatus = { ...mockStatus, enabled: true };
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  await waitFor(() =>
    expect(screen.getByRole('switch')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: false }),
    ),
  );
  expect(mockToggle).toHaveBeenCalledWith(false);
  expect(screen.queryByTestId('icloud-sync-sheet')).toBeNull();
  expect(mockCoordinator.synchronize).not.toHaveBeenCalled();
});

it('dismisses consent when the selected collection changes', async () => {
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  mockOwner = '10000000-0000-4000-8000-000000000002';
  screen.rerender(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  expect(screen.queryByTestId('icloud-sync-sheet')).toBeNull();
  expect(mockToggle).not.toHaveBeenCalled();
  expect(mockCoordinator.synchronize).not.toHaveBeenCalled();
});
it('does not commit an activation that finishes after the selected collection changes', async () => {
  let finish!: () => void;
  mockCoordinator.synchronize.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  await waitFor(() =>
    expect(mockCoordinator.synchronize).toHaveBeenCalledTimes(1),
  );
  mockOwner = '10000000-0000-4000-8000-000000000002';
  screen.rerender(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await act(async () => finish());
  expect(mockStatus.enabled).toBe(false);
  expect(screen.queryByTestId('icloud-sync-sheet')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});
it('requires another explicit opt-in after an Apple-account change disables sync', async () => {
  mockCoordinator.synchronize.mockImplementationOnce(async () => {
    mockStatus = {
      ...mockStatus,
      enabled: false,
      accountToken: 'b'.repeat(64),
    };
    throw new ICloudError('ACCOUNT_CHANGED');
  });
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  });
  expect(screen.queryByTestId('icloud-sync-sheet')).toBeNull();
  expect(screen.getByRole('switch')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: false }),
  );
  fireEvent.press(screen.getByRole('switch'));
  expect(mockToggle).toHaveBeenCalledTimes(1);
  expect(mockCoordinator.synchronize).toHaveBeenCalledTimes(1);
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  });
  await waitFor(() =>
    expect(mockCoordinator.synchronize).toHaveBeenCalledTimes(2),
  );
  expect(mockToggle.mock.calls.map(([enabled]) => enabled)).toEqual([
    true,
    true,
  ]);
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
});
it('retries a failed disable without requesting opt-in or synchronizing', async () => {
  mockStatus = { ...mockStatus, enabled: true };
  mockToggle.mockRejectedValueOnce(new ICloudError('UNAVAILABLE'));
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  const retry = await screen.findByRole('button', {
    name: 'Try Again',
  });
  await act(async () => {
    fireEvent.press(retry);
  });
  await waitFor(() => expect(mockToggle).toHaveBeenCalledTimes(2));
  expect(mockToggle.mock.calls).toEqual([[false], [false]]);
  expect(mockCoordinator.synchronize).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Start Syncing' })).toBeNull();
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
});
it('requires an explicit clear-before-sync action after deletion elsewhere', async () => {
  mockCoordinator.store.setState({
    status: 'error',
    error: 'RESET_CONFIRMATION_REQUIRED',
  });
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  expect(mockCoordinator.acknowledgeReset).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.press(screen.getByRole('switch'));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'iCloud data was deleted elsewhere. Clear this phone’s older copy to sync.',
  );
  fireEvent.press(
    screen.getByRole('button', { name: 'Clear older copy and sync' }),
  );
  await waitFor(() =>
    expect(mockCoordinator.acknowledgeReset).toHaveBeenCalledTimes(1),
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
});

it('reveals the explicit clear-before-sync action if the first sync discovers a remote deletion', async () => {
  mockCoordinator.synchronize.mockImplementationOnce(async () => {
    mockCoordinator.store.setState({
      status: 'error',
      error: 'RESET_CONFIRMATION_REQUIRED',
    });
    throw new ICloudError('RESET_CONFIRMATION_REQUIRED');
  });
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
  fireEvent.press(screen.getByRole('switch'));
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  });
  expect(mockCoordinator.synchronize).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('icloud-sync-sheet')).toBeTruthy();
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Clear older copy and sync' }),
    ).toBeEnabled(),
  );
  expect(mockCoordinator.acknowledgeReset).not.toHaveBeenCalled();
});

it('keeps missing-zone recovery inside the sheet and requires the explicit clear action', async () => {
  mockCoordinator.synchronize.mockImplementationOnce(async () => {
    mockCoordinator.store.setState({
      status: 'error',
      error: 'ZONE_RECOVERY_REQUIRED',
    });
    throw new ICloudError('ZONE_RECOVERY_REQUIRED');
  });
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  fireEvent.press(await screen.findByRole('switch'));
  await act(async () =>
    fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' })),
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'iCloud data was reset. Clear this phone’s older copy to sync.',
  );
  expect(mockCoordinator.recoverMissingCollection).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Close iCloud Sync' }));
  expect(mockCoordinator.recoverMissingCollection).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('switch'));
  fireEvent.press(
    screen.getByRole('button', { name: 'Clear older copy and sync' }),
  );
  await waitFor(() =>
    expect(mockCoordinator.recoverMissingCollection).toHaveBeenCalledTimes(1),
  );
  expect(mockCoordinator.acknowledgeReset).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.queryByTestId('icloud-sync-sheet')).toBeNull(),
  );
  expect(screen.getByRole('switch')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: true }),
  );
});

it('explains when the installed native build lacks the safe sync bridge', async () => {
  mockCoordinator.synchronize.mockRejectedValueOnce(
    new ICloudError('NOT_CONFIGURED'),
  );
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  fireEvent.press(await screen.findByRole('switch'));
  fireEvent.press(screen.getByRole('button', { name: 'Start Syncing' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Install the latest JustGO build to use iCloud Sync.',
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Start Syncing' })).toBeEnabled(),
  );
  expect(screen.getByRole('switch')).toHaveProp(
    'accessibilityState',
    expect.objectContaining({ checked: false }),
  );
});

it.each([
  ['unsupported', 'iCloud Sync is available on iPhone and iPad.'],
  ['not_authenticated', 'Sign in to iCloud in your device’s Settings to sync.'],
  ['restricted', 'iCloud access is restricted on this device.'],
  ['unavailable', 'iCloud is unavailable. Your data stays on this phone.'],
] as const)(
  'explains %s in the sheet without enabling or uploading',
  async (status, message) => {
    mockStatus = { status, enabled: false, accountToken: null };
    const screen = render(
      <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
    );
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.press(screen.getByRole('switch'));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(
      screen.getByRole('button', { name: 'Start Syncing' }),
    ).toBeDisabled();
    expect(mockToggle).not.toHaveBeenCalled();
    expect(mockCoordinator.synchronize).not.toHaveBeenCalled();
  },
);
