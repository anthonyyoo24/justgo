import * as AppleAuthentication from 'expo-apple-authentication';
import {
  CryptoDigestAlgorithm,
  digestStringAsync,
  getRandomValues,
} from 'expo-crypto';
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { ProviderAuthError, type SignInProvider } from './types';

/** Native provider UI yields only the ID token needed by managed Auth. */
export async function nativeProviderToken(
  provider: SignInProvider,
): Promise<{ token: string; nonce?: string } | null> {
  if (provider === 'apple') {
    if (!(await AppleAuthentication.isAvailableAsync()))
      throw new ProviderAuthError('CONFIGURATION');
    const nonce = Array.from(getRandomValues(new Uint8Array(32)), (value) =>
      value.toString(16).padStart(2, '0'),
    ).join('');
    const hashed = await digestStringAsync(CryptoDigestAlgorithm.SHA256, nonce);
    try {
      const credential = await AppleAuthentication.signInAsync({
        nonce: hashed,
        requestedScopes: [],
      });
      if (!credential.identityToken) throw new ProviderAuthError('AUTH');
      return { token: credential.identityToken, nonce };
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ERR_REQUEST_CANCELED'
      )
        return null;
      throw error;
    }
  }
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!webClientId || !iosClientId)
    throw new ProviderAuthError('CONFIGURATION');
  GoogleSignin.configure({ webClientId, iosClientId, offlineAccess: false });
  try {
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null;
    if (!response.data.idToken) throw new ProviderAuthError('AUTH');
    // The original Google iOS SDK owns its OAuth request. It exposes no custom
    // nonce option; retain Supabase's nonce checks and never disable validation.
    return { token: response.data.idToken };
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED)
      return null;
    throw error;
  }
}
