import { Platform, Share } from 'react-native';
import { clearExportFiles, saveExportFile } from './export-file';

const mockDelete = jest.fn();
const mockWrite = jest.fn();
const mockCreate = jest.fn();
const mockDirectories = new Set<string>();
const mockFiles = new Map<string, Uint8Array>();
const mockPath = (parts: (string | { uri: string })[]) =>
  parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///private/cache' },
  Directory: jest
    .fn()
    .mockImplementation((...parts: (string | { uri: string })[]) => {
      const uri = mockPath(parts);
      return {
        uri,
        get exists() {
          return mockDirectories.has(uri);
        },
        delete: () => {
          mockDelete(uri);
          for (const path of mockDirectories) {
            if (path === uri || path.startsWith(`${uri}/`))
              mockDirectories.delete(path);
          }
          for (const path of mockFiles.keys()) {
            if (path.startsWith(`${uri}/`)) mockFiles.delete(path);
          }
        },
        create: (options?: { idempotent?: boolean }) => {
          if (mockDirectories.has(uri) && !options?.idempotent)
            throw new Error('Directory exists');
          mockDirectories.add(uri);
        },
      };
    }),
  File: jest
    .fn()
    .mockImplementation((...parts: (string | { uri: string })[]) => {
      const uri = mockPath(parts);
      return {
        uri,
        create: mockCreate,
        write: (bytes: Uint8Array) => {
          mockWrite(bytes);
          mockFiles.set(uri, bytes);
        },
      };
    }),
}));
const share = jest.spyOn(Share, 'share');
const archive = { name: 'export.zip', bytes: new Uint8Array([80, 75, 3, 4]) };
const root = 'file:///private/cache/justgo-exports';
beforeEach(() => {
  jest.clearAllMocks();
  mockDirectories.clear();
  mockFiles.clear();
  mockWrite.mockImplementation(() => {});
  share.mockResolvedValue({ action: Share.sharedAction });
});
afterAll(() => share.mockRestore());
it('shares the local ZIP through iOS and removes its private cache files', async () => {
  const check = jest.fn();
  await expect(saveExportFile(archive, check)).resolves.toBe('shared');
  expect(mockWrite).toHaveBeenCalledWith(archive.bytes);
  expect(share).toHaveBeenCalledWith({
    url: expect.stringMatching(
      /^file:\/\/\/private\/cache\/justgo-exports\/share-[\d-]+\/export.zip$/,
    ),
  });
  expect(check).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockFiles.size).toBe(0);
});
it('keeps overlapping shares separate until each sheet finishes', async () => {
  let finishFirst!: (result: Awaited<ReturnType<typeof Share.share>>) => void;
  let finishSecond!: (result: Awaited<ReturnType<typeof Share.share>>) => void;
  share.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishFirst = resolve;
      }),
  );
  share.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSecond = resolve;
      }),
  );
  const otherArchive = { ...archive, bytes: new Uint8Array([1, 2, 3]) };
  const first = saveExportFile(archive, () => {});
  const second = saveExportFile(otherArchive, () => {});
  try {
    const firstUri = share.mock.calls[0]![0].url!;
    const secondUri = share.mock.calls[1]![0].url!;
    expect(firstUri).not.toBe(secondUri);
    expect(mockFiles.get(firstUri)).toEqual(archive.bytes);
    expect(mockFiles.get(secondUri)).toEqual(otherArchive.bytes);
    finishFirst({ action: Share.sharedAction });
    await expect(first).resolves.toBe('shared');
    expect(mockFiles.has(firstUri)).toBe(false);
    expect(mockFiles.get(secondUri)).toEqual(otherArchive.bytes);
    finishSecond({ action: Share.dismissedAction });
    await expect(second).resolves.toBe('cancelled');
    expect(mockFiles.size).toBe(0);
  } finally {
    finishFirst({ action: Share.dismissedAction });
    finishSecond({ action: Share.dismissedAction });
    await Promise.all([first, second]);
  }
});
it('clears interrupted app-owned shares on startup or deletion while preserving user-saved copies', async () => {
  const original = 'file:///user/Documents/journal.zip';
  mockFiles.set(original, archive.bytes);
  mockDirectories.add(root);
  mockDirectories.add(`${root}/interrupted`);
  mockFiles.set(`${root}/interrupted/export.zip`, archive.bytes);
  await clearExportFiles();
  expect(mockDirectories.size).toBe(0);
  expect([...mockFiles.keys()]).toEqual([original]);
  await clearExportFiles();
  expect(mockDelete).toHaveBeenCalledTimes(1);
});
it('treats dismissing the share sheet as cancellation and cleans its cache', async () => {
  share.mockResolvedValueOnce({ action: Share.dismissedAction });
  await expect(saveExportFile(archive, () => {})).resolves.toBe('cancelled');
  expect(mockFiles.size).toBe(0);
  expect(mockDirectories).toEqual(new Set([root]));
});
it.each(['write', 'share', 'account'] as const)(
  'cleans up and propagates %s failure without sharing stale data',
  async (failure) => {
    const error = new Error('Synthetic failure');
    if (failure === 'write')
      mockWrite.mockImplementationOnce(() => {
        throw error;
      });
    if (failure === 'share') share.mockRejectedValueOnce(error);
    await expect(
      saveExportFile(archive, () => {
        if (failure === 'account') throw error;
      }),
    ).rejects.toBe(error);
    expect(mockFiles.size).toBe(0);
    expect(mockDirectories).toEqual(new Set([root]));
    if (failure !== 'share') expect(share).not.toHaveBeenCalled();
  },
);
it('fails honestly on unsupported Android file sharing', async () => {
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  try {
    await expect(saveExportFile(archive, () => {})).rejects.toThrow(
      'unavailable',
    );
    expect(share).not.toHaveBeenCalled();
  } finally {
    os.restore();
  }
});
