import { createAuthStorage } from '../../../platform/auth/auth-storage';
import { createIdentityApi } from '../api';
import { createVault } from '../vault';
import { ManagedIdentityController } from './managed-controller';
import { createManagedIdentityStorage } from './managed-state';
import { createManagedAuth } from './managed-auth';

export function createManagedIdentityController(
  apiUrl = process.env.EXPO_PUBLIC_API_URL,
) {
  return new ManagedIdentityController({
    auth: createManagedAuth(),
    storage: createManagedIdentityStorage(),
    secureStorage: createAuthStorage(),
    legacyVault: createVault(),
    api: createIdentityApi(apiUrl),
  });
}
