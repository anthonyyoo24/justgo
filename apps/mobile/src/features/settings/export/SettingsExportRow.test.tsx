import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { strFromU8, unzipSync } from 'fflate';
import {
  AccountClient,
  createQueryClient,
} from '../../../lib/network/account-client';
import { createHttpClient } from '../../../lib/network/http';
import { AccountRepository } from '../../../data/activity/repository';
import { SettingsExportRow } from './SettingsExportRow';
import { saveExportFile } from '../../../platform/export/export-file';
import { colors } from '../../../theme/tokens';
import {
  MemoryStorage,
  backend,
  card,
  input,
  owner,
  otherOwner,
  today,
  zone,
  deferred,
} from '../../../../test-support/journal';

let mockOwner: string | null = owner;
let mockRepo: AccountRepository | null;
let mockClient: AccountClient;
let mockBlur: (() => void) | undefined;
let mockHapticsLoading = false;
let mockHapticsSaving = false;
jest.mock('../../../platform/haptics/haptics', () => ({
  useHapticPreferences: () => ({
    enabled: true,
    loading: mockHapticsLoading,
    saving: mockHapticsSaving,
  }),
}));
const mockRouter = { push: jest.fn() };
jest.mock('../../../app-support/providers/AppProvider', () => ({
  useRuntime: () => ({ client: mockClient }),
  useIdentity: () => ({ account: mockOwner ? { userId: mockOwner } : null }),
  useJournal: () => mockRepo,
}));
jest.mock('../../../platform/motion/motion', () => ({
  useMotionPreferences: () => ({ reduceMotion: false }),
}));
jest.mock('../../../platform/export/export-file', () => ({
  saveExportFile: jest.fn(),
}));
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  const { useEffect } = require('react') as typeof import('react');
  return {
    useRouter: () => mockRouter,
    useFocusEffect: (effect: () => () => void) =>
      useEffect(() => {
        mockBlur = effect();
        return mockBlur;
      }, [effect]),
    Link: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
  };
});
const save = jest.mocked(saveExportFile);
let fetcher: jest.Mock;
beforeEach(async () => {
  mockHapticsLoading = false;
  mockHapticsSaving = false;
  mockOwner = owner;
  mockRouter.push.mockReset();
  mockRepo = new AccountRepository({
    accountId: owner,
    storage: new MemoryStorage(),
    transport: backend(),
    today,
    timeZone: zone,
  });
  mockRepo.setEnvironment({ active: true, online: false });
  await mockRepo.hydrate();
  await mockRepo.complete(input(), card);
  fetcher = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      account: { id: owner, createdAt: `${today}T00:00:00.000Z` },
      devices: [],
      attempts: [],
      nextCursor: null,
    }),
  }));
  mockClient = new AccountClient(
    createHttpClient('http://localhost:3000', fetcher),
    {
      current: () =>
        mockOwner ? { userId: mockOwner, token: 'a'.repeat(64) } : null,
      renew: jest.fn(),
      reject: jest.fn(),
    },
    createQueryClient(),
  );
  mockClient.changeAccount(owner);
  save.mockReset().mockResolvedValue('shared');
});
afterEach(() => {
  mockRepo?.dispose();
  mockClient.changeAccount(null);
});
it('requires an explicit export action and creates the real archive with phone-only data', async () => {
  const screen = render(<SettingsExportRow />);
  expect(screen.queryByText('Export ZIP')).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  await screen.findByText('Your export was shared.');
  const archive = save.mock.calls[0]![0];
  const json = JSON.parse(strFromU8(unzipSync(archive.bytes)['data.json']!));
  expect(json.localChanges).toHaveLength(1);
  expect(json.preferences).toEqual({ reduceMotion: false, haptics: true });
  expect(screen.getByRole('button', { name: 'Export my data' })).toBeEnabled();
});
it.each(['hydrating', 'saving'])(
  'waits for %s preferences instead of exporting a stale choice',
  (phase) => {
    mockHapticsLoading = phase === 'hydrating';
    mockHapticsSaving = phase === 'saving';
    const screen = render(<SettingsExportRow />);
    const button = screen.getByRole('button', { name: 'Export my data' });
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(fetcher).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    mockHapticsLoading = false;
    mockHapticsSaving = false;
    screen.rerender(<SettingsExportRow />);
    expect(
      screen.getByRole('button', { name: 'Export my data' }),
    ).toBeEnabled();
  },
);
it('quietly returns to Settings after dismissing sharing and allows another export', async () => {
  const dismissed = deferred<'cancelled'>();
  save.mockImplementationOnce(() => dismissed.promise);
  const screen = render(<SettingsExportRow />);
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: 'Export my data' })).toBeDisabled();
  expect(screen.queryByText('Creating export…')).toBeNull();
  expect(
    screen.getByRole('progressbar', { name: 'Export my data in progress' }),
  ).toBeTruthy();
  await act(async () => dismissed.resolve('cancelled'));
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByRole('button', { name: 'Export my data' })).toBeEnabled();
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  await screen.findByText('Your export was shared.');
  expect(save).toHaveBeenCalledTimes(2);
});
it('reports a browser download without claiming the file was saved', async () => {
  save.mockResolvedValue('downloaded');
  const screen = render(<SettingsExportRow />);
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  await screen.findByText('Your ZIP download has started.');
});
it('blocks duplicate taps until sharing finishes', async () => {
  const pending = deferred<'shared'>();
  save.mockImplementation(() => pending.promise);
  const screen = render(<SettingsExportRow />);
  const button = screen.getByRole('button', { name: 'Export my data' });
  fireEvent.press(button);
  fireEvent.press(button);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: 'Export my data' })).toBeDisabled();
  await act(async () => pending.resolve('shared'));
  await screen.findByText('Your export was shared.');
});
it('shows a retryable failure and succeeds on a later explicit attempt', async () => {
  save.mockRejectedValueOnce(new Error('Private adapter detail'));
  const screen = render(<SettingsExportRow />);
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  expect(
    await screen.findByText('Couldn’t export your data. Please try again.'),
  ).toHaveStyle({ color: '#8B1E32' });
  expect(screen.queryByText('Private adapter detail')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  expect(await screen.findByText('Your export was shared.')).toHaveStyle({
    color: colors.ink,
  });
});
it('clears an earlier error when the next share sheet is dismissed', async () => {
  save
    .mockRejectedValueOnce(new Error('Share failed'))
    .mockResolvedValueOnce('cancelled');
  const screen = render(<SettingsExportRow />);
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  await screen.findByText('Couldn’t export your data. Please try again.');
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Export my data' }),
    ).toBeEnabled(),
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(save).toHaveBeenCalledTimes(2);
});
it('fails instead of claiming an export is complete when the phone journal is unreadable', async () => {
  mockRepo!.store.setState({ hydrationError: 'unreadable' });
  const screen = render(<SettingsExportRow />);
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  expect(await screen.findByText(/could not be read/)).toHaveStyle({
    color: '#8B1E32',
  });
  expect(save).not.toHaveBeenCalled();
});
it('cancels an in-flight export when leaving the screen', async () => {
  const pending = deferred<{ ok: true; json: () => Promise<object> }>();
  fetcher.mockImplementation(() => pending.promise);
  const screen = render(<SettingsExportRow />);
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const signal = fetcher.mock.calls[0]![1].signal as AbortSignal;
  screen.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ ok: true, json: async () => ({}) }));
  expect(save).not.toHaveBeenCalled();
});

it('cancels when a still-mounted stack screen loses focus, and resets the button for returning', async () => {
  const pending = deferred<{ ok: true; json: () => Promise<object> }>();
  fetcher.mockImplementation(() => pending.promise);
  const screen = render(<SettingsExportRow />);
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  act(() => mockBlur?.());
  expect(screen.getByRole('button', { name: 'Export my data' })).toBeEnabled();
  await act(async () => pending.resolve({ ok: true, json: async () => ({}) }));
  expect(save).not.toHaveBeenCalled();
});
it('clears old feedback and cancels stale work when a different account is activated', async () => {
  const pending = deferred<{ ok: true; json: () => Promise<object> }>();
  fetcher.mockImplementation(() => pending.promise);
  const screen = render(<SettingsExportRow />);
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  mockOwner = otherOwner;
  mockClient.changeAccount(otherOwner);
  screen.rerender(<SettingsExportRow />);
  expect(screen.getByRole('button', { name: 'Export my data' })).toBeEnabled();
  await act(async () => pending.resolve({ ok: true, json: async () => ({}) }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
});
it('opens recovery instead of exporting when no account is connected', () => {
  mockOwner = null;
  mockRepo!.dispose();
  mockRepo = null;
  const screen = render(<SettingsExportRow />);
  fireEvent.press(screen.getByRole('button', { name: 'Export my data' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/recovery');
  expect(fetcher).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
