import { createAuthStorage } from '../../../platform/auth/auth-storage';
import { createIdentityApi } from '../api';
import { createVault } from '../vault';
import { ManagedIdentityController } from './managed-controller';
import { createManagedIdentityStorage } from './managed-state';
import { createManagedAuth } from './managed-auth';

export function createManagedIdentityController(
  apiUrl = process.env.EXPO_PUBLIC_API_URL,
) {
  const billing = process.env.EXPO_PUBLIC_BILLING_ENABLED === 'true';
  return new ManagedIdentityController({
    // Guests get an anonymous Auth user only with billing on.
    auth: createManagedAuth({ networkErrors: billing }),
    storage: createManagedIdentityStorage(),
    secureStorage: createAuthStorage(),
    legacyVault: createVault(),
    api: createIdentityApi(apiUrl),
    connectionDiagnostics:
      __DEV__ &&
      process.env.EXPO_PUBLIC_JUSTGO_DEV_DIAGNOSTICS === '1' &&
      process.env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER ===
        'iCloud.com.anthonyyoo.justgo.dev',
    guestAccounts: billing,
  });
}
