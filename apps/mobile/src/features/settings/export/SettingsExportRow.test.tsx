import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SettingsExportRow } from './SettingsExportRow';
import { collectExport } from './data-export';
import { saveExportFile } from '../../../platform/export/export-file';
import { ApiError } from '../../../lib/network/http';
import { deferred, owner, otherOwner } from '../../../../test-support/journal';

let mockOwner: string | null = owner;
let mockKind: 'guest' | 'account' = 'guest';
let mockSignedIn = false;
let mockPreferencesLoading = false;
let mockBlur: (() => void) | undefined;
const mockRouter = { push: jest.fn() };
const mockRepository = { accountId: owner };
jest.mock('../../../app-support/providers/AppProvider', () => ({
  useIdentity: () => ({
    account: mockSignedIn && mockOwner ? { userId: mockOwner } : null,
    collectionKind: mockKind,
  }),
  useJournal: () => (mockOwner ? mockRepository : null),
  useRuntime: () => ({
    client: {
      ownsCollection: (id: string) => id === mockOwner,
      ownsAccount: (id: string) => mockSignedIn && id === mockOwner,
    },
  }),
}));
jest.mock('../../../platform/motion/motion', () => ({
  useMotionPreferences: () => ({
    reduceMotion: true,
    requestedReduceMotion: false,
    loading: false,
    saving: false,
  }),
}));
jest.mock('../../../platform/haptics/haptics', () => ({
  useHapticPreferences: () => ({
    enabled: true,
    loading: mockPreferencesLoading,
    saving: false,
  }),
}));
jest.mock('./data-export', () => ({ collectExport: jest.fn() }));
jest.mock('../../../platform/export/export-file', () => ({
  saveExportFile: jest.fn(),
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
const collect = jest.mocked(collectExport),
  share = jest.mocked(saveExportFile);
beforeEach(() => {
  jest.clearAllMocks();
  mockOwner = owner;
  mockKind = 'guest';
  mockSignedIn = false;
  mockPreferencesLoading = false;
  collect.mockResolvedValue({
    name: 'JustGO-data-fixture.zip',
    bytes: new Uint8Array([1, 2, 3]),
  });
  share.mockResolvedValue('shared');
});

it('offers an explicit complete data download for a guest without requiring an account', async () => {
  const screen = await render(<SettingsExportRow />);
  expect(collect).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Download my data' }),
  );
  await screen.findByText('Your data download was shared.');
  expect(collect).toHaveBeenCalledWith(
    expect.objectContaining({
      ownerKind: 'guest',
      repository: mockRepository,
      reduceMotion: false,
      haptics: true,
    }),
  );
  expect(mockRouter.push).not.toHaveBeenCalled();
});
it('uses account-owned local snapshots while signed out', async () => {
  mockKind = 'account';
  const screen = await render(<SettingsExportRow />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'Download my data' }),
  );
  await screen.findByText(
    'Your phone’s saved data was shared. Sign in to include the latest cloud data.',
  );
  expect(collect).toHaveBeenCalledWith(
    expect.objectContaining({ ownerKind: 'account' }),
  );
});
it('waits for preference hydration and respects another active data action', async () => {
  mockPreferencesLoading = true;
  const screen = await render(<SettingsExportRow />);
  expect(screen.getByRole('button')).toBeDisabled();
  await fireEvent.press(screen.getByRole('button'));
  expect(collect).not.toHaveBeenCalled();
  mockPreferencesLoading = false;
  await screen.rerender(<SettingsExportRow disabled />);
  expect(screen.getByRole('button')).toBeDisabled();
});
it('blocks duplicate taps until sharing finishes and reports browser download accurately', async () => {
  const pending = deferred<'downloaded'>();
  share.mockReturnValue(pending.promise);
  const screen = await render(<SettingsExportRow />);
  await fireEvent.press(screen.getByRole('button'));
  await fireEvent.press(screen.getByRole('button'));
  await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button')).toBeDisabled();
  await act(async () => pending.resolve('downloaded'));
  await screen.findByText('Your ZIP download has started.');
});
it('returns quietly after cancelling and permits a fresh explicit retry', async () => {
  share.mockResolvedValueOnce('cancelled');
  const screen = await render(<SettingsExportRow />);
  await fireEvent.press(screen.getByRole('button'));
  await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  expect(screen.queryByRole('alert')).toBeNull();
  await fireEvent.press(screen.getByRole('button'));
  await screen.findByText('Your data download was shared.');
});
it('shows safe storage feedback rather than private adapter details', async () => {
  collect.mockRejectedValueOnce(new ApiError('STORAGE'));
  const screen = await render(<SettingsExportRow />);
  await fireEvent.press(screen.getByRole('button'));
  await screen.findByText(/could not be read/);
  expect(share).not.toHaveBeenCalled();
});
it('reports a failed cloud read and retries only after another explicit download action', async () => {
  mockKind = 'account';
  mockSignedIn = true;
  collect.mockRejectedValueOnce(new ApiError('NETWORK'));
  share.mockResolvedValueOnce('downloaded');
  const screen = await render(<SettingsExportRow />);
  const button = screen.getByRole('button', { name: 'Download my data' });
  const failure = 'Couldn’t download your data. Please try again.';

  await fireEvent.press(button);
  await screen.findByText(failure);
  await waitFor(() => expect(button).toBeEnabled());
  expect(collect).toHaveBeenCalledTimes(1);
  expect(share).not.toHaveBeenCalled();

  const retry = deferred<Awaited<ReturnType<typeof collectExport>>>();
  collect.mockReturnValueOnce(retry.promise);
  await fireEvent.press(button);
  expect(collect).toHaveBeenCalledTimes(2);
  expect(button).toBeDisabled();
  expect(screen.queryByText(failure)).toBeNull();
  expect(share).not.toHaveBeenCalled();

  await act(() =>
    retry.resolve({
      name: 'JustGO-data-fixture.zip',
      bytes: new Uint8Array([1, 2, 3]),
    }),
  );
  await screen.findByText('Your ZIP download has started.');
  expect(collect).toHaveBeenCalledTimes(2);
  expect(share).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(failure)).toBeNull();
  expect(button).toBeEnabled();
});
it.each(['blur', 'account'] as const)(
  'fences an old private download after %s',
  async (event) => {
    const pending = deferred<Awaited<ReturnType<typeof collectExport>>>();
    collect.mockReturnValue(pending.promise);
    const screen = await render(<SettingsExportRow />);
    await fireEvent.press(screen.getByRole('button'));
    if (event === 'blur') await act(() => mockBlur?.());
    else mockOwner = otherOwner;
    await act(async () =>
      pending.resolve({ name: 'data.zip', bytes: new Uint8Array() }),
    );
    expect(share).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  },
);
