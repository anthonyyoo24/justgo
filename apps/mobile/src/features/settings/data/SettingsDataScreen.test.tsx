import { act, fireEvent, render, within } from '@testing-library/react-native';
import { createDataBackup } from '../../../data/backup/data-backup';
import { DestructiveConfirmation } from '../../../components/modals/DestructiveConfirmation';
import { Modal } from 'react-native';
import { SettingsDataScreen } from './SettingsDataScreen';
import { pickBackupFile } from '../../../platform/backup/backup-file';
import { applyImportedPreferences } from './import-preferences';
import {
  attempt,
  deferred,
  owner,
  otherOwner,
} from '../../../../test-support/journal';

let mockOwner = owner;
let mockKind: 'guest' | 'account' = 'guest';
let mockSignedIn = false;
let mockDeletionPending = false;
let mockBlur: (() => void) | undefined;
const mockRouter = {
  push: jest.fn(),
  canGoBack: () => false,
  replace: jest.fn(),
  back: jest.fn(),
};
const mockActivity = { importData: jest.fn(), deleteAllData: jest.fn() };
const mockMotion = {
  reduceMotion: false,
  loading: false,
  saving: false,
  setReduced: jest.fn(),
};
const mockHaptics = {
  enabled: true,
  loading: false,
  saving: false,
  setEnabled: jest.fn(),
};
jest.mock('../../../app-support/providers/AppProvider', () => ({
  useIdentity: () => ({
    collectionKind: mockKind,
    account: mockSignedIn ? { userId: mockOwner } : null,
  }),
  useActivityState: () => ({
    repository: { accountId: mockOwner },
    state: { dataDeletionPending: mockDeletionPending },
  }),
  useJournal: () => ({ accountId: mockOwner }),
  useRuntime: () => ({
    activity: mockActivity,
    client: {
      ownsCollection: (id: string) => id === mockOwner,
      ownsAccount: (id: string) => mockSignedIn && id === mockOwner,
    },
  }),
}));
jest.mock('../../../platform/motion/motion', () => ({
  useMotionPreferences: () => mockMotion,
}));
jest.mock('../../../platform/haptics/haptics', () => ({
  useHapticPreferences: () => mockHaptics,
}));
jest.mock('../../../platform/backup/backup-file', () => ({
  pickBackupFile: jest.fn(),
}));
jest.mock('./import-preferences', () => ({
  applyImportedPreferences: jest.fn(),
}));
jest.mock('./SettingsICloudRow', () => ({
  SettingsICloudRow: () => {
    const { Text } = require('react-native') as typeof import('react-native');
    return <Text accessibilityRole="switch">iCloud Sync</Text>;
  },
}));
jest.mock('../export/SettingsExportRow', () => ({
  SettingsExportRow: () => {
    const { Text } = require('react-native') as typeof import('react-native');
    return <Text accessibilityRole="button">Download my data</Text>;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-router', () => {
  const { useEffect } = require('react') as typeof import('react');
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => () => void) =>
      useEffect(() => {
        mockBlur = effect();
        return mockBlur;
      }, [effect]),
  };
});
const pick = jest.mocked(pickBackupFile);
const apply = jest.mocked(applyImportedPreferences);
function backup(kind: 'guest' | 'account' = 'guest', accountId = owner) {
  const saved = attempt();
  return createDataBackup({
    owner: { id: accountId, kind },
    exportedAt: '2026-10-20T20:00:00.000Z',
    attempts: [saved],
    journal: {
      entries: [
        {
          ...saved,
          accountId,
          feelingScaleVersion: 1,
          reflection: {
            feeling: null,
            text: 'Synthetic private journal.',
            revision: 1,
          },
        },
      ],
      alternatives: [],
    },
    preferences: { reduceMotion: false, haptics: true },
  }).bytes;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = owner;
  mockKind = 'guest';
  mockSignedIn = false;
  mockDeletionPending = false;
  pick.mockResolvedValue(backup());
  mockActivity.importData.mockResolvedValue(undefined);
  mockActivity.deleteAllData.mockResolvedValue(undefined);
  apply.mockResolvedValue(undefined);
});

it('shows only the requested data controls without extra journal sections', () => {
  const screen = render(<SettingsDataScreen />);
  expect(screen.getByRole('header', { name: 'Data' })).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'iCloud Sync' })).toBeTruthy();
  for (const label of ['Download my data', 'Import data', 'Delete all my data'])
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
  for (const label of [
    'Back up journal',
    'Restore journal',
    'Recover earlier journal',
    'Journal on this phone',
  ])
    expect(screen.queryByText(label)).toBeNull();
});
it('opens the picker in the press gesture, previews bounded data and imports only after confirmation', async () => {
  const screen = render(<SettingsDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  expect(pick).toHaveBeenCalledTimes(1);
  await screen.findByRole('header', { name: 'Import this data?' });
  expect(mockActivity.importData).not.toHaveBeenCalled();
  expect(screen.queryByText('Synthetic private journal.')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Confirm import' }));
  await screen.findByText(
    'Your data was imported. Existing differing journal entries were kept.',
  );
  expect(mockActivity.importData).toHaveBeenCalledWith(
    expect.objectContaining({
      owner: { id: owner, kind: 'guest' },
      attempts: expect.any(Array),
    }),
  );
  expect(apply).toHaveBeenCalledTimes(1);
});
it('keeps selected data read-only when preview is cancelled', async () => {
  const screen = render(<SettingsDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  await screen.findByRole('header', { name: 'Import this data?' });
  fireEvent.press(screen.getByRole('button', { name: 'Cancel import' }));
  expect(mockActivity.importData).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
});
it('rejects another account’s backup before any data or preference changes', async () => {
  pick.mockResolvedValueOnce(backup('account', otherOwner));
  const screen = render(<SettingsDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  await screen.findByText(
    'Sign in to the account that owns this backup before importing it.',
  );
  expect(mockActivity.importData).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
});
it('authenticates the retained owner before asking for an import file', async () => {
  mockKind = 'account';
  pick.mockResolvedValueOnce(backup('account'));
  const screen = render(<SettingsDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/account/sign-in',
    params: { returnTo: 'data', ownerId: owner },
  });
  expect(pick).not.toHaveBeenCalled();
  expect(mockActivity.importData).not.toHaveBeenCalled();
  act(() => mockBlur?.());
  mockSignedIn = true;
  screen.rerender(<SettingsDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  await screen.findByRole('header', { name: 'Import this data?' });
  expect(pick).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: 'Confirm import' }));
  await screen.findByText(
    'Your data was imported. Existing differing journal entries were kept.',
  );
  expect(mockActivity.importData).toHaveBeenCalledTimes(1);
});
it('waits for the durable data commit before saving preferences and announcing success', async () => {
  const commit = deferred<void>();
  mockActivity.importData.mockReturnValue(commit.promise);
  const screen = render(<SettingsDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  await screen.findByRole('header', { name: 'Import this data?' });
  fireEvent.press(screen.getByRole('button', { name: 'Confirm import' }));
  expect(apply).not.toHaveBeenCalled();
  expect(
    screen.getByRole('button', { name: 'Delete all my data' }),
  ).toBeDisabled();
  await act(async () => commit.resolve());
  await screen.findByText(
    'Your data was imported. Existing differing journal entries were kept.',
  );
});
it('reports partially saved preferences accurately and keeps replayable preview for retry', async () => {
  apply.mockRejectedValueOnce(new Error('Storage unavailable'));
  const screen = render(<SettingsDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  await screen.findByRole('header', { name: 'Import this data?' });
  fireEvent.press(screen.getByRole('button', { name: 'Confirm import' }));
  await screen.findByText(
    'Your saved data was imported, but preferences couldn’t finish saving. Import again to finish.',
  );
  expect(screen.getByRole('button', { name: 'Confirm import' })).toBeEnabled();
});
it.each(['blur', 'owner'] as const)(
  'rejects late file selections after %s',
  async (event) => {
    const selection = deferred<Uint8Array | null>();
    pick.mockReturnValue(selection.promise);
    const screen = render(<SettingsDataScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
    if (event === 'blur') act(() => mockBlur?.());
    else {
      mockOwner = otherOwner;
      screen.rerender(<SettingsDataScreen />);
    }
    await act(async () => selection.resolve(backup()));
    expect(
      screen.queryByRole('header', { name: 'Import this data?' }),
    ).toBeNull();
    expect(mockActivity.importData).not.toHaveBeenCalled();
  },
);
it('deletes only after an explicit confirmation, retaining the account and separately saved files', async () => {
  const screen = render(<SettingsDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Delete all my data' }));
  expect(mockActivity.deleteAllData).not.toHaveBeenCalled();
  fireEvent.press(
    within(
      screen.getByLabelText(/deleting saved data\?|Delete all saved data\?/),
    ).getByRole('button', { name: 'Delete all my data' }),
  );
  await screen.findByText(
    'All saved data was deleted. Your account and downloaded files were kept.',
  );
  expect(mockActivity.deleteAllData).toHaveBeenCalledTimes(1);
});

it('shows durable unfinished deletion on reopening and resumes it while import remains blocked', async () => {
  mockDeletionPending = true;
  mockActivity.deleteAllData.mockImplementationOnce(async () => {
    mockDeletionPending = false;
  });
  const screen = render(<SettingsDataScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Deletion is unfinished. Select Delete all my data to resume.',
  );
  const importButton = screen.getByRole('button', { name: 'Import data' });
  expect(importButton).toBeDisabled();
  fireEvent.press(importButton);
  expect(pick).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Delete all my data' }));
  expect(
    screen.getByRole('header', { name: 'Finish deleting saved data?' }),
  ).toBeTruthy();
  fireEvent.press(
    within(
      screen.getByLabelText(/deleting saved data\?|Delete all saved data\?/),
    ).getByRole('button', { name: 'Delete all my data' }),
  );
  await screen.findByText(
    'All saved data was deleted. Your account and downloaded files were kept.',
  );
  expect(mockActivity.deleteAllData).toHaveBeenCalledTimes(1);
  expect(importButton).toBeEnabled();
  expect(mockActivity.importData).not.toHaveBeenCalled();
});

it('uses the shared modal and cancels safely through its button or native dismissal', () => {
  const screen = render(<SettingsDataScreen />);
  for (const dismiss of ['button', 'native'] as const) {
    fireEvent.press(screen.getByRole('button', { name: 'Delete all my data' }));
    expect(screen.getByLabelText('Delete all saved data?')).toHaveProp(
      'role',
      'alertdialog',
    );
    expect(screen.getByLabelText('Delete all saved data?')).toHaveProp(
      'aria-modal',
      true,
    );
    const staleConfirm = screen.UNSAFE_getByType(DestructiveConfirmation).props
      .onConfirm as () => void;
    if (dismiss === 'button')
      fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    else act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(screen.queryByLabelText('Delete all saved data?')).toBeNull();
    act(staleConfirm);
  }
  expect(mockActivity.deleteAllData).not.toHaveBeenCalled();
});

it('keeps deletion errors inside the modal and retries without overlapping deletion or cancellation', async () => {
  mockActivity.deleteAllData.mockRejectedValueOnce(new Error('Offline'));
  const screen = render(<SettingsDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Delete all my data' }));
  const dialog = within(screen.getByLabelText('Delete all saved data?'));
  fireEvent.press(dialog.getByRole('button', { name: 'Delete all my data' }));
  await screen.findByText(
    'Deletion is unfinished. Please try again to finish deleting your saved data.',
  );
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(dialog.getByRole('alert')).toBeTruthy();
  const deletion = deferred<void>();
  mockActivity.deleteAllData.mockReturnValueOnce(deletion.promise);
  const callbacks = screen.UNSAFE_getByType(DestructiveConfirmation).props as {
    onConfirm: () => void;
    onCancel: () => void;
  };
  act(() => {
    callbacks.onConfirm();
    callbacks.onConfirm();
    callbacks.onCancel();
  });
  expect(mockActivity.deleteAllData).toHaveBeenCalledTimes(2);
  expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(
    dialog.getByRole('button', { name: 'Delete all my data' }),
  ).toBeDisabled();
  expect(
    dialog.getByRole('progressbar', { name: 'Deleting saved data' }),
  ).toBeTruthy();
  act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
  expect(screen.getByLabelText('Delete all saved data?')).toBeTruthy();
  await act(async () => deletion.resolve());
  expect(screen.queryByLabelText('Delete all saved data?')).toBeNull();
});

it('authenticates before deleting an account journal while signed out', () => {
  mockKind = 'account';
  const screen = render(<SettingsDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Delete all my data' }));
  fireEvent.press(
    within(screen.getByLabelText('Delete all saved data?')).getByRole(
      'button',
      { name: 'Delete all my data' },
    ),
  );
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/account/sign-in',
    params: { returnTo: 'data', ownerId: owner },
  });
  expect(mockActivity.deleteAllData).not.toHaveBeenCalled();
});
