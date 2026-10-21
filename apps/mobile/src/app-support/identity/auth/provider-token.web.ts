import { ProviderAuthError } from './types';

// Web uses the separate PKCE redirect flow, never a native ID-token fallback.
export async function nativeProviderToken(): Promise<never> {
  throw new ProviderAuthError('CONFIGURATION');
}
