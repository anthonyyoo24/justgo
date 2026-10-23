import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { createStore } from 'zustand/vanilla';
import { SettingsICloudRow } from './SettingsICloudRow';
import { ICloudError, type ICloudStatus } from '../../../platform/icloud/model';
const owner = '10000000-0000-4000-8000-000000000001';
let mockOwner: string | null = owner;
let mockStatus: ICloudStatus = {
  status: 'available',
  enabled: false,
  accountToken: 'a'.repeat(64),
};
const mockStatusRead = jest.fn(async () => mockStatus);
const mockToggle = jest.fn(async (enabled: boolean) => {
  mockStatus = { ...mockStatus, enabled };
});
const mockCoordinator = {
  store: createStore<{
    status: 'idle' | 'syncing' | 'error';
    error: 'QUOTA_EXCEEDED' | 'RESET_CONFIRMATION_REQUIRED' | null;
  }>(() => ({ status: 'idle', error: null })),
  synchronize: jest.fn(),
  acknowledgeReset: jest.fn(),
};
jest.mock('../../../app-support/providers/AppProvider', () => ({
  useRuntime: () => ({
    client: { ownsCollection: (id: string) => id === mockOwner },
    activity: { getICloudCoordinator: () => mockCoordinator },
  }),
  useJournal: () => ({ accountId: owner }),
}));
jest.mock('../../../platform/icloud/icloud-sync', () => ({
  ...jest.requireActual('../../../platform/icloud/model'),
  iCloudSync: {
    status: () => mockStatusRead(),
    setEnabled: (enabled: boolean) => mockToggle(enabled),
    subscribe: () => () => {},
  },
}));
jest.mock('../../../platform/motion/motion', () => ({
  useReduceMotion: () => true,
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = owner;
  mockStatus = {
    status: 'available',
    enabled: false,
    accountToken: 'a'.repeat(64),
  };
  mockCoordinator.store.setState({ status: 'idle', error: null });
  mockCoordinator.synchronize.mockResolvedValue(undefined);
  mockCoordinator.acknowledgeReset.mockResolvedValue(undefined);
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
  fireEvent.press(screen.getByRole('button', { name: 'Turn on iCloud Sync' }));
  await waitFor(() =>
    expect(mockCoordinator.synchronize).toHaveBeenCalledTimes(1),
  );
  expect(mockToggle).toHaveBeenCalledWith(true);
  await waitFor(() =>
    expect(screen.getByRole('switch').props.accessibilityState.checked).toBe(
      true,
    ),
  );
});
it('explains why the switch is disabled in an unconfigured build', async () => {
  mockStatus = { status: 'not_configured', enabled: false, accountToken: null };
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  await waitFor(() => expect(mockStatusRead).toHaveBeenCalled());
  expect(
    await screen.findByText(
      'iCloud Sync is not set up in this version of JustGO yet.',
    ),
  ).toBeTruthy();
  expect(screen.getByRole('switch')).toBeDisabled();
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
  fireEvent.press(screen.getByRole('button', { name: 'Turn on iCloud Sync' }));
  await screen.findByText(
    'iCloud storage is full. Your saved data remains on this phone.',
  );
  fireEvent.press(screen.getByRole('button', { name: 'Retry iCloud Sync' }));
  await waitFor(() =>
    expect(mockCoordinator.synchronize).toHaveBeenCalledTimes(2),
  );
});
it('requires an explicit clear-before-sync action after deletion elsewhere', async () => {
  mockCoordinator.store.setState({
    status: 'error',
    error: 'RESET_CONFIRMATION_REQUIRED',
  });
  const screen = render(
    <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
  );
  expect(mockCoordinator.acknowledgeReset).not.toHaveBeenCalled();
  fireEvent.press(
    screen.getByRole('button', { name: 'Clear older copy and sync' }),
  );
  await waitFor(() =>
    expect(mockCoordinator.acknowledgeReset).toHaveBeenCalledTimes(1),
  );
});

it.each([
  ['unsupported', 'iCloud Sync is available on iPhone and iPad.'],
  [
    'not_authenticated',
    'Sign in to iCloud in your device’s Settings to use iCloud Sync.',
  ],
  ['restricted', 'iCloud access is restricted on this device.'],
  [
    'unavailable',
    'iCloud is unavailable right now. Your saved data stays on this phone.',
  ],
] as const)(
  'explains %s without toggling or uploading',
  async (status, message) => {
    mockStatus = { status, enabled: false, accountToken: null };
    const screen = render(
      <SettingsICloudRow disabled={false} onBusyChange={jest.fn()} />,
    );
    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.getByRole('switch')).toBeDisabled();
    fireEvent.press(screen.getByRole('switch'));
    expect(mockToggle).not.toHaveBeenCalled();
    expect(mockCoordinator.synchronize).not.toHaveBeenCalled();
  },
);
