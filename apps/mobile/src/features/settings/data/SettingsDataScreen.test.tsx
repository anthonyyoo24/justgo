import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { ConfirmationModal } from '../../../components/modals/ConfirmationModal';
import { createDataBackup } from '../../../data/backup/data-backup';

import { SettingsDataScreen } from './SettingsDataScreen';
import { pickBackupFile } from '../../../platform/backup/backup-file';
import { applyImportedPreferences } from './import-preferences';
import {
  attempt,
  deferred,
  owner,
  otherOwner,
} from '../../../../test-support/journal';

jest.mock('../../../components/modals/ConfirmationModal', () => {
  const actual = jest.requireActual<
    typeof import('../../../components/modals/ConfirmationModal')
  >('../../../components/modals/ConfirmationModal');
  return {
    ...actual,
    ConfirmationModal: jest.fn(
      (props: React.ComponentProps<typeof actual.ConfirmationModal>) => (
        <actual.ConfirmationModal {...props} />
      ),
    ),
  };
});

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
const mockIdentity = { resetGuestAccount: jest.fn() };
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
    identity: mockIdentity,
    client: {
      ownsCollection: (id: string) => id === mockOwner,
      ownsAccount: (id: string) => mockSignedIn && id === mockOwner,
    },
  }),
}));
jest.mock('../../../app-support/saving/SavingDetails', () => ({
  SavingRecoveryPanel: () => null,
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
    return <Text accessibilityRole="button">Export data</Text>;
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
  mockIdentity.resetGuestAccount.mockResolvedValue(undefined);
  apply.mockResolvedValue(undefined);
});

it('shows only the requested data controls without extra journal sections', async () => {
  const screen = await render(<SettingsDataScreen />);
  expect(screen.getByRole('header', { name: 'Data' })).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'iCloud Sync' })).toBeTruthy();
  for (const label of ['Export data', 'Import data', 'Delete all my data'])
    expect(screen.getByRole('button', { name: label })).toBeTruthy();
  expect(screen.getByText('Delete all my data')).toHaveStyle({
    color: '#B3261E',
  });
  for (const label of [
    'Back up journal',
    'Restore journal',
    'Recover earlier journal',
    'Journal on this phone',
  ])
    expect(screen.queryByText(label)).toBeNull();
});
it('opens the picker in the press gesture, previews bounded data and imports only after confirmation', async () => {
  const screen = await render(<SettingsDataScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  expect(pick).toHaveBeenCalledTimes(1);
  await screen.findByRole('header', { name: 'Import this data?' });
  expect(mockActivity.importData).not.toHaveBeenCalled();
  expect(screen.queryByText('Synthetic private journal.')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm import' }));
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
  const screen = await render(<SettingsDataScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  await screen.findByRole('header', { name: 'Import this data?' });
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel import' }));
  expect(mockActivity.importData).not.toHaveBeenCalled();
  expect(apply).not.toHaveBeenCalled();
});
it('adds another account’s backup to this phone’s data', async () => {
  pick.mockResolvedValueOnce(backup('account', otherOwner));
  const screen = await render(<SettingsDataScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  await screen.findByRole('header', { name: 'Import this data?' });
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm import' }));
  await screen.findByText(
    'Your data was imported. Existing differing journal entries were kept.',
  );
  expect(mockActivity.importData).toHaveBeenCalledWith(
    expect.objectContaining({
      owner: { id: owner, kind: 'guest' },
      journal: expect.objectContaining({
        entries: [expect.objectContaining({ accountId: owner })],
      }),
    }),
  );
});
it('imports into the signed-out account’s phone data without asking for sign-in', async () => {
  mockKind = 'account';
  pick.mockResolvedValueOnce(backup('account'));
  const screen = await render(<SettingsDataScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  await screen.findByRole('header', { name: 'Import this data?' });
  expect(pick).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm import' }));
  await screen.findByText(
    'Your data was imported. Existing differing journal entries were kept.',
  );
  expect(mockActivity.importData).toHaveBeenCalledWith(
    expect.objectContaining({ owner: { id: owner, kind: 'account' } }),
  );
  expect(mockRouter.push).not.toHaveBeenCalled();
});
it('waits for the durable data commit before saving preferences and announcing success', async () => {
  const commit = deferred<void>();
  mockActivity.importData.mockReturnValue(commit.promise);
  const screen = await render(<SettingsDataScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  await screen.findByRole('header', { name: 'Import this data?' });
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm import' }));
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
  const screen = await render(<SettingsDataScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
  await screen.findByRole('header', { name: 'Import this data?' });
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm import' }));
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
    const screen = await render(<SettingsDataScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
    if (event === 'blur') await act(() => mockBlur?.());
    else {
      mockOwner = otherOwner;
      await screen.rerender(<SettingsDataScreen />);
    }
    await act(async () => selection.resolve(backup()));
    expect(
      screen.queryByRole('header', { name: 'Import this data?' }),
    ).toBeNull();
    expect(mockActivity.importData).not.toHaveBeenCalled();
  },
);
const deletionCopy = {
  guest: {
    confirmation:
      'Your challenge history, feelings and reflections on this phone and in associated iCloud copies will be deleted. Backup files you saved remain. This cannot be undone.',
    result: 'All saved data was deleted. Backup files you saved were kept.',
  },
  account: {
    confirmation:
      'Your challenge history, feelings and reflections on this phone, in your JustGO account and in associated iCloud copies will be deleted. Your account, login methods and downloaded files remain. This cannot be undone.',
    result:
      'All saved data was deleted. Your account and downloaded files were kept.',
  },
} as const;
it.each([
  ['guest', false, 'account'],
  ['account', true, 'guest'],
] as const)(
  'deletes a %s collection only after an explicit confirmation that names what it keeps (#563)',
  async (kind, signedIn, other) => {
    mockKind = kind;
    mockSignedIn = signedIn;
    const screen = await render(<SettingsDataScreen />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Delete all my data' }),
    );
    expect(mockActivity.deleteAllData).not.toHaveBeenCalled();
    const dialog = within(screen.getByLabelText('Delete all saved data?'));
    expect(dialog.getByText(deletionCopy[kind].confirmation)).toBeTruthy();
    expect(dialog.queryByText(deletionCopy[other].confirmation)).toBeNull();
    await fireEvent.press(dialog.getByRole('button', { name: 'Delete' }));
    await screen.findByText(deletionCopy[kind].result);
    expect(screen.queryByText(deletionCopy[other].result)).toBeNull();
    expect(mockActivity.deleteAllData).toHaveBeenCalledTimes(1);
  },
);

it('shows durable unfinished deletion on reopening and resumes it while import remains blocked', async () => {
  mockDeletionPending = true;
  mockActivity.deleteAllData.mockImplementationOnce(async () => {
    mockDeletionPending = false;
  });
  const screen = await render(<SettingsDataScreen />);
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Deletion is unfinished. Select Delete all my data to resume.',
  );
  const importButton = screen.getByRole('button', { name: 'Import data' });
  expect(importButton).toBeDisabled();
  await fireEvent.press(importButton);
  expect(pick).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Delete all my data' }),
  );
  expect(
    screen.getByRole('header', { name: 'Finish deleting saved data?' }),
  ).toBeTruthy();
  await fireEvent.press(
    within(
      screen.getByLabelText(/deleting saved data\?|Delete all saved data\?/),
    ).getByRole('button', { name: 'Delete' }),
  );
  await screen.findByText(deletionCopy.guest.result);
  expect(mockActivity.deleteAllData).toHaveBeenCalledTimes(1);
  expect(importButton).toBeEnabled();
  expect(mockActivity.importData).not.toHaveBeenCalled();
});

it('uses the shared modal and cancels safely through its button or native dismissal', async () => {
  const screen = await render(<SettingsDataScreen />);
  for (const dismiss of ['button', 'native'] as const) {
    await fireEvent.press(
      screen.getByRole('button', { name: 'Delete all my data' }),
    );
    expect(screen.getByLabelText('Delete all saved data?')).toHaveProp(
      'role',
      'alertdialog',
    );
    expect(screen.getByLabelText('Delete all saved data?')).toHaveProp(
      'aria-modal',
      true,
    );
    const staleConfirm =
      jest.mocked(ConfirmationModal).mock.lastCall![0].onConfirm;
    if (dismiss === 'button')
      await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    else
      await act(() =>
        screen.container
          .queryAll((node) => node.type === 'Modal')[0]!
          .props.onRequestClose(),
      );
    expect(screen.queryByLabelText('Delete all saved data?')).toBeNull();
    await act(staleConfirm);
  }
  expect(mockActivity.deleteAllData).not.toHaveBeenCalled();
});

it('keeps deletion errors inside the modal and retries without overlapping deletion or cancellation', async () => {
  mockActivity.deleteAllData.mockRejectedValueOnce(new Error('Offline'));
  const screen = await render(<SettingsDataScreen />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Delete all my data' }),
  );
  const dialog = within(screen.getByLabelText('Delete all saved data?'));
  await fireEvent.press(dialog.getByRole('button', { name: 'Delete' }));
  await screen.findByText(
    'Deletion is unfinished. Please try again to finish deleting your saved data.',
  );
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(dialog.getByRole('alert')).toBeTruthy();
  const deletion = deferred<void>();
  mockActivity.deleteAllData.mockReturnValueOnce(deletion.promise);
  const callbacks = jest.mocked(ConfirmationModal).mock.lastCall![0];
  await act(() => {
    callbacks.onConfirm();
    callbacks.onConfirm();
    callbacks.onCancel();
  });
  expect(mockActivity.deleteAllData).toHaveBeenCalledTimes(2);
  expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(dialog.getByRole('button', { name: 'Delete' })).toBeDisabled();
  expect(
    dialog.getByRole('progressbar', { name: 'Deleting saved data' }),
  ).toBeTruthy();
  await act(() =>
    screen.container
      .queryAll((node) => node.type === 'Modal')[0]!
      .props.onRequestClose(),
  );
  expect(screen.getByLabelText('Delete all saved data?')).toBeTruthy();
  await act(async () => deletion.resolve());
  expect(screen.queryByLabelText('Delete all saved data?')).toBeNull();
});

it.each([
  ['guest', 1],
  ['account', 0],
] as const)(
  'replaces the guest account only after a %s collection’s deletion finishes (P16-14)',
  async (kind, resets) => {
    mockKind = kind;
    mockSignedIn = kind === 'account';
    const deletion = deferred<void>();
    mockActivity.deleteAllData.mockRejectedValueOnce(new Error('Offline'));
    mockActivity.deleteAllData.mockReturnValueOnce(deletion.promise);
    const screen = await render(<SettingsDataScreen />);
    const confirm = () =>
      fireEvent.press(
        within(
          screen.getByLabelText(
            /deleting saved data\?|Delete all saved data\?/,
          ),
        ).getByRole('button', { name: 'Delete' }),
      );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Delete all my data' }),
    );
    await confirm();
    // A failed deletion keeps the guest account.
    await screen.findByText(/Deletion is unfinished/);
    expect(mockIdentity.resetGuestAccount).not.toHaveBeenCalled();
    await confirm();
    expect(mockIdentity.resetGuestAccount).not.toHaveBeenCalled();
    await act(async () => deletion.resolve());
    await screen.findByText(
      'All saved data was deleted. Your account and downloaded files were kept.',
    );
    expect(mockIdentity.resetGuestAccount).toHaveBeenCalledTimes(resets);
  },
);

it('authenticates before deleting an account journal while signed out', async () => {
  mockKind = 'account';
  const screen = await render(<SettingsDataScreen />);
  const confirmDeletion = () =>
    fireEvent.press(
      within(screen.getByLabelText('Delete all saved data?')).getByRole(
        'button',
        { name: 'Delete' },
      ),
    );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Delete all my data' }),
  );
  await confirmDeletion();
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: '/account/sign-in',
    params: { returnTo: 'data' },
  });
  expect(mockActivity.deleteAllData).not.toHaveBeenCalled();
  await act(() => mockBlur?.());
  mockSignedIn = true;
  await screen.rerender(<SettingsDataScreen />);
  await act(async () => {});
  expect(screen.queryByLabelText('Delete all saved data?')).toBeNull();
  expect(pick).not.toHaveBeenCalled();
  expect(mockActivity.importData).not.toHaveBeenCalled();
  expect(mockActivity.deleteAllData).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Delete all my data' }),
  );
  await confirmDeletion();
  await screen.findByText(deletionCopy.account.result);
  expect(mockActivity.deleteAllData).toHaveBeenCalledTimes(1);
});

it.each([
  ['guest', false],
  ['account', true],
] as const)(
  'keeps a file pick with its %s owner while the app leaves for Files',
  async (kind, signedIn) => {
    mockKind = kind;
    mockSignedIn = signedIn;
    const lifecycle = new Set<(state: AppStateStatus) => void>();
    const subscribe = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        lifecycle.add(listener);
        return { remove: () => lifecycle.delete(listener) };
      });
    const file = deferred<Uint8Array | null>();
    pick.mockReturnValueOnce(file.promise);
    const screen = await render(<SettingsDataScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Import data' }));
    for (const state of ['inactive', 'background', 'active'] as const)
      await act(() => lifecycle.forEach((listener) => listener(state)));
    await act(async () => file.resolve(backup(kind)));
    await screen.findByRole('header', { name: 'Import this data?' });
    await fireEvent.press(
      screen.getByRole('button', { name: 'Confirm import' }),
    );
    await screen.findByText(
      'Your data was imported. Existing differing journal entries were kept.',
    );
    expect(mockActivity.importData).toHaveBeenCalledTimes(1);
    expect(mockActivity.importData).toHaveBeenCalledWith(
      expect.objectContaining({ owner: { id: owner, kind } }),
    );
    subscribe.mockRestore();
  },
);
