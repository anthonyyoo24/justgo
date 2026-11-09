import { createMemoryVault } from '../storage';
import { removeDeletedCredentials } from './cleanup';

jest.mock('expo-crypto', () => {
  const { createHash } =
    jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...jest.requireActual<typeof import('expo-crypto')>('expo-crypto'),
    digestStringAsync: async (
      algorithm: string,
      data: string,
      options?: { encoding: 'hex' | 'base64' },
    ) =>
      createHash(algorithm.replace('-', ''))
        .update(data)
        .digest(options?.encoding ?? 'hex'),
  };
});

it('removes the Keychain credential whose lowercase-hex SHA-256 digest is in the server deletion receipt', async () => {
  const vault = createMemoryVault();
  const deleted = {
    id: '00000000-0000-4000-8000-000000000001',
    secret: '0123456789abcdef'.repeat(4),
  };
  const kept = {
    id: '00000000-0000-4000-8000-000000000002',
    secret: 'fedcba9876543210'.repeat(4),
  };
  await vault.add(deleted);
  await vault.add(kept);

  await removeDeletedCredentials(vault, [
    'a8ae6e6ee929abea3afcfc5258c8ccd6f85273e0d4626d26c7279f3250f77c8e',
  ]);

  expect(await vault.credentials()).toEqual([kept]);
});
