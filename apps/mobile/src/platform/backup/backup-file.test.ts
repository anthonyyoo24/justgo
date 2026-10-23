import { getDocumentAsync } from 'expo-document-picker';
import { clearBackupFiles, pickBackupFile } from './backup-file';

const mockRead = jest.fn();
const mockClose = jest.fn();
const mockDelete = jest.fn();
const mockDeleteDirectory = jest.fn();
let mockExists = true;
let mockSize = 4;
const cache = 'file:///private/cache/DocumentPicker/';
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///private/cache/' },
  FileMode: { ReadOnly: 'r' },
  Directory: jest.fn().mockImplementation(() => ({
    uri: 'file:///private/cache/DocumentPicker/',
    exists: true,
    delete: mockDeleteDirectory,
  })),
  File: jest.fn().mockImplementation((uri: string) => ({
    parentDirectory: { uri: uri.slice(0, uri.lastIndexOf('/') + 1) },
    get exists() {
      return mockExists;
    },
    get size() {
      return mockSize;
    },
    open: () => ({ readBytes: mockRead, close: mockClose }),
    delete: mockDelete,
  })),
}));
const pick = jest.mocked(getDocumentAsync);
const selected = () => ({
  canceled: false as const,
  assets: [
    { uri: `${cache}random.zip`, name: 'backup.zip', size: 4, lastModified: 0 },
  ],
});
const run = (check = jest.fn(), signal = new AbortController().signal) =>
  pickBackupFile(100, check, signal);
beforeEach(() => {
  jest.clearAllMocks();
  mockExists = true;
  mockSize = 4;
  mockRead.mockResolvedValue(new Uint8Array([80, 75, 3, 4]));
  pick.mockResolvedValue(selected());
});

it('reads only a bounded SDK cache copy, closes its handle and removes private bytes', async () => {
  const check = jest.fn();
  await expect(run(check)).resolves.toEqual(new Uint8Array([80, 75, 3, 4]));
  expect(pick).toHaveBeenCalledWith({
    type: ['application/zip', 'application/x-zip-compressed'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  expect(mockRead).toHaveBeenCalledWith(101);
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(check).toHaveBeenCalledTimes(3);
});

it('treats cancelling Files as no import', async () => {
  pick.mockResolvedValue({ canceled: true, assets: null });
  await expect(run()).resolves.toBeNull();
  expect(mockRead).not.toHaveBeenCalled();
});

it('removes a partial picker copy if the provider fails', async () => {
  pick.mockRejectedValue(new Error('Provider unavailable'));
  await expect(run()).rejects.toThrow('Provider unavailable');
  expect(mockDeleteDirectory).toHaveBeenCalledTimes(2);
  expect(mockRead).not.toHaveBeenCalled();
});

it('rejects an unexpected selection shape and removes picker copies', async () => {
  pick.mockResolvedValue({ canceled: false, assets: [] });
  await expect(run()).rejects.toThrow('Choose one backup file.');
  expect(mockDeleteDirectory).toHaveBeenCalledTimes(2);
  expect(mockRead).not.toHaveBeenCalled();
});

it('does not open Files for an already cancelled operation', async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(run(jest.fn(), abort.signal)).resolves.toBeNull();
  expect(pick).not.toHaveBeenCalled();
});

it.each(['stat', 'picker', 'read'] as const)(
  'bounds %s sizes and cleans up',
  async (source) => {
    if (source === 'stat') mockSize = 101;
    if (source === 'picker')
      pick.mockResolvedValue({
        ...selected(),
        assets: [{ ...selected().assets[0]!, size: 101 }],
      });
    if (source === 'read') mockRead.mockResolvedValue(new Uint8Array(101));
    await expect(run()).rejects.toThrow('size limit');
    expect(mockDelete).toHaveBeenCalledTimes(1);
    if (source !== 'read') expect(mockRead).not.toHaveBeenCalled();
  },
);

it('cleans a selection rejected by the account fence', async () => {
  const check = jest
    .fn()
    .mockImplementationOnce(() => {})
    .mockImplementation(() => {
      throw new Error('Account changed');
    });
  await expect(run(check)).rejects.toThrow('Account changed');
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockRead).not.toHaveBeenCalled();
});

it('cleans the picker cache after a cancellation while Files was open', async () => {
  const abort = new AbortController();
  pick.mockImplementation(async () => {
    abort.abort();
    return selected();
  });
  await expect(run(jest.fn(), abort.signal)).resolves.toBeNull();
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockRead).not.toHaveBeenCalled();
});

it('closes and cleans the copy on read failure without removing the original document', async () => {
  mockRead.mockRejectedValue(new Error('Read failed'));
  await expect(run()).rejects.toThrow('Read failed');
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
it('keeps the handle open through the async read and honors cancellation afterward', async () => {
  let finishRead!: (bytes: Uint8Array) => void;
  let startedRead!: () => void;
  const readStarted = new Promise<void>((resolve) => {
    startedRead = resolve;
  });
  mockRead.mockImplementationOnce(() => {
    startedRead();
    return new Promise<Uint8Array>((resolve) => {
      finishRead = resolve;
    });
  });
  const abort = new AbortController();
  const reading = run(jest.fn(), abort.signal);
  await readStarted;
  expect(mockClose).not.toHaveBeenCalled();
  expect(mockDelete).not.toHaveBeenCalled();
  abort.abort();
  finishRead(new Uint8Array([80, 75, 3, 4]));
  await expect(reading).resolves.toBeNull();
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledTimes(1);
});

it('refuses unexpected provider paths without deleting the user document', async () => {
  pick.mockResolvedValue({
    ...selected(),
    assets: [
      { ...selected().assets[0]!, uri: 'file:///user/iCloud/backup.zip' },
    ],
  });
  await expect(run()).rejects.toThrow('copied safely');
  expect(mockDelete).not.toHaveBeenCalled();
  expect(mockRead).not.toHaveBeenCalled();
});

it('cleans interrupted picker copies when asked by startup or account deletion', () => {
  clearBackupFiles();
  expect(mockDeleteDirectory).toHaveBeenCalledTimes(1);
});

it('refuses a missing or empty copied file', async () => {
  mockSize = 0;
  await expect(run()).rejects.toThrow('could not be read');
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockRead).not.toHaveBeenCalled();
});
