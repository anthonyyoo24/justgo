import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { strFromU8, unzipSync } from 'fflate';
import { AccountClient, createQueryClient } from '../../lib/account-client';
import { createHttpClient } from '../../lib/http';
import { AccountRepository } from '../../data/activity/repository';
import { ExportDataScreen } from './ExportDataScreen';
import { saveExportFile } from '../../platform/export-file';
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
} from '../../../test-support/journal';

let mockOwner: string | null = owner;
let mockRepo: AccountRepository | null;
let mockClient: AccountClient;
let mockBlur: (() => void) | undefined;
jest.mock('../providers/AppProvider', () => ({
  useRuntime: () => ({ client: mockClient }),
  useIdentity: () => ({ account: mockOwner ? { userId: mockOwner } : null }),
  useJournal: () => mockRepo,
}));
jest.mock('../../platform/motion', () => ({
  useMotionPreferences: () => ({ reduceMotion: false }),
}));
jest.mock('../../platform/export-file', () => ({ saveExportFile: jest.fn() }));
jest.mock('expo-router', () => {
  const { Text } = require('react-native') as typeof import('react-native');
  const { useEffect } = require('react') as typeof import('react');
  return {
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
  mockOwner = owner;
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
  const screen = render(<ExportDataScreen />);
  expect(screen.getByText(/private reflections/)).toBeTruthy();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Export ZIP' }));
  await screen.findByText('Your export was shared.');
  const archive = save.mock.calls[0]![0];
  const json = JSON.parse(strFromU8(unzipSync(archive.bytes)['data.json']!));
  expect(json.localChanges).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Export ZIP' })).toBeEnabled();
});
it.each(['cancelled', 'downloaded'] as const)(
  'reports %s without claiming the file was saved',
  async (result) => {
    save.mockResolvedValue(result);
    const screen = render(<ExportDataScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Export ZIP' }));
    await screen.findByText(
      result === 'cancelled'
        ? 'Export cancelled. You can try again.'
        : 'Your ZIP download has started.',
    );
  },
);
it('blocks duplicate taps until sharing finishes', async () => {
  const pending = deferred<'shared'>();
  save.mockImplementation(() => pending.promise);
  const screen = render(<ExportDataScreen />);
  const button = screen.getByRole('button', { name: 'Export ZIP' });
  fireEvent.press(button);
  fireEvent.press(button);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(
    screen.getByRole('button', { name: 'Preparing export…' }),
  ).toBeDisabled();
  await act(async () => pending.resolve('shared'));
  await screen.findByText('Your export was shared.');
});
it('shows a retryable failure and succeeds on a later explicit attempt', async () => {
  save.mockRejectedValueOnce(new Error('Private adapter detail'));
  const screen = render(<ExportDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Export ZIP' }));
  await screen.findByText(/Check your connection/);
  expect(screen.queryByText('Private adapter detail')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Export ZIP' }));
  await screen.findByText('Your export was shared.');
});
it('fails instead of claiming an export is complete when the phone journal is unreadable', async () => {
  mockRepo!.store.setState({ hydrationError: 'unreadable' });
  const screen = render(<ExportDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Export ZIP' }));
  await screen.findByText(/could not be read/);
  expect(save).not.toHaveBeenCalled();
});
it('cancels an in-flight export when leaving the screen', async () => {
  const pending = deferred<{ ok: true; json: () => Promise<object> }>();
  fetcher.mockImplementation(() => pending.promise);
  const screen = render(<ExportDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Export ZIP' }));
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
  const screen = render(<ExportDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Export ZIP' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  act(() => mockBlur?.());
  expect(screen.getByRole('button', { name: 'Export ZIP' })).toBeEnabled();
  await act(async () => pending.resolve({ ok: true, json: async () => ({}) }));
  expect(save).not.toHaveBeenCalled();
});
it('clears old feedback and cancels stale work when a different account is activated', async () => {
  const pending = deferred<{ ok: true; json: () => Promise<object> }>();
  fetcher.mockImplementation(() => pending.promise);
  const screen = render(<ExportDataScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Export ZIP' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  mockOwner = otherOwner;
  mockClient.changeAccount(otherOwner);
  screen.rerender(<ExportDataScreen />);
  expect(screen.getByRole('button', { name: 'Export ZIP' })).toBeEnabled();
  await act(async () => pending.resolve({ ok: true, json: async () => ({}) }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.queryByText(/could not be created/)).toBeNull();
});
it('keeps recovery reachable and export unavailable when no account is connected', () => {
  mockOwner = null;
  mockRepo!.dispose();
  mockRepo = null;
  const screen = render(<ExportDataScreen />);
  expect(screen.getByText('Account & recovery')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Export ZIP' })).toBeNull();
});
