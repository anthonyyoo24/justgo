jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(async () => undefined) },
}));

import { iCloudSync } from './icloud-sync.web';

it('never offers CloudKit sync on the web', async () => {
  await expect(iCloudSync.status()).resolves.toMatchObject({
    status: 'unsupported',
    enabled: false,
  });
  await expect(iCloudSync.setEnabled(true)).rejects.toMatchObject({
    code: 'UNSUPPORTED',
  });
});
