import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
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
      return value === null ? null : deviceStateSchema.parse(JSON.parse(value));
    },
    write: async (value) => {
      await module().writeState(JSON.stringify(deviceStateSchema.parse(value)));
    },
    credentials: async () =>
      (await module().listCredentials()).map((value) =>
        credentialSchema.parse(value),
      ),
    add: async (value) => {
      await module().addCredential(value.id, value.secret);
    },
  };
}
