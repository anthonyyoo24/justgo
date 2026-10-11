import { Platform, Share } from 'react-native';
import { saveExportFile } from './export-file';

const mockDelete = jest.fn();
const mockWrite = jest.fn();
const mockCreate = jest.fn();
let mockExists = true;
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///private/cache' },
  Directory: jest.fn().mockImplementation(() => ({
    get exists() {
      return mockExists;
    },
    delete: () => {
      mockDelete();
      mockExists = false;
    },
    create: () => {
      mockExists = true;
    },
  })),
  File: jest.fn().mockImplementation(() => ({
    uri: 'file:///private/cache/export.zip',
    create: mockCreate,
    write: mockWrite,
  })),
}));
const share = jest.spyOn(Share, 'share');
const archive = { name: 'export.zip', bytes: new Uint8Array([80, 75, 3, 4]) };
beforeEach(() => {
  jest.clearAllMocks();
  mockExists = true;
  mockWrite.mockImplementation(() => {});
  share.mockResolvedValue({ action: Share.sharedAction });
});
afterAll(() => share.mockRestore());
it('shares the local ZIP through iOS and removes both stale and current private cache files', async () => {
  const check = jest.fn();
  await expect(saveExportFile(archive, check)).resolves.toBe('shared');
  expect(mockWrite).toHaveBeenCalledWith(archive.bytes);
  expect(share).toHaveBeenCalledWith({
    url: 'file:///private/cache/export.zip',
  });
  expect(check).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledTimes(2);
});
it('treats dismissing the share sheet as cancellation and cleans its cache', async () => {
  share.mockResolvedValueOnce({ action: Share.dismissedAction });
  await expect(saveExportFile(archive, () => {})).resolves.toBe('cancelled');
  expect(mockExists).toBe(false);
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
    expect(mockExists).toBe(false);
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
