import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import { z } from 'zod';
import {
  createMemoryVault,
  credentialSchema,
  deviceStateSchema,
  type CredentialVault,
} from './storage';

type NativeVault = {
  readState(): Promise<string | null>;
  writeState(value: string): Promise<void>;
  listCredentials(): Promise<unknown[]>;
  addCredential(id: string, secret: string): Promise<void>;
  removeCredential?: (id: string) => Promise<void>;
};
export function createVault(): CredentialVault {
  if (Platform.OS === 'web') return createMemoryVault();
  const native = requireOptionalNativeModule<NativeVault>('JustGoKeychain');
  const module = () => {
    if (!native)
      throw new Error(
        'An updated iOS development build is required for secure storage.',
      );
    return native;
  };
  return {
    kind: 'keychain',
    read: async () => {
      const value = await module().readState();
      if (value === null) return null;
      const stored: unknown = JSON.parse(value);
      const state = deviceStateSchema.parse(stored);
      // Retire old legal metadata without replacing the pending account proof,
      // recovery credentials, transfer cancellation or deletion safety state.
      if (
        state.pending?.kind === 'bootstrap' &&
        // The successful schema parse above establishes this raw object shape.
        Object.hasOwn((stored as { pending: object }).pending, 'acceptance')
      )
        await module().writeState(JSON.stringify(state));
      return state;
    },
    write: async (value) => {
      await module().writeState(JSON.stringify(deviceStateSchema.parse(value)));
    },
    credentials: async () =>
      (await module().listCredentials()).map((value) =>
        credentialSchema.parse(value),
      ),
    add: async (value) => {
      const credential = credentialSchema.parse(value);
      await module().addCredential(credential.id, credential.secret);
    },
    ...(native?.removeCredential
      ? {
          remove: async (id: string) => {
            await native.removeCredential!(z.uuid().parse(id));
          },
        }
      : {}),
  };
}
