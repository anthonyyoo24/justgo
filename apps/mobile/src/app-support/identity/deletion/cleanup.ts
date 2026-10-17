import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import type { CredentialVault } from '../storage';

export async function removeDeletedCredentials(
  vault: CredentialVault,
  digests: string[],
) {
  if (!vault.remove)
    throw new Error('Credential removal requires an updated development build');
  const deleted = new Set(digests);
  for (const credential of await vault.credentials()) {
    const digest = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      credential.secret,
    );
    if (deleted.has(digest)) await vault.remove(credential.id);
  }
}
