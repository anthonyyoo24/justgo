import * as Apple from 'expo-apple-authentication';
import { digestStringAsync, getRandomValues } from 'expo-crypto';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { nativeProviderToken } from './provider-token';

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(),
  signInAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(),
  getRandomValues: jest.fn(),
}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn(), signIn: jest.fn() },
  isSuccessResponse: (response: { type: string }) =>
    response.type === 'success',
  isErrorWithCode: (error: unknown) =>
    !!error && typeof error === 'object' && 'code' in error,
  statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
}));
const oldWeb = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const oldIos = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Apple.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(getRandomValues).mockImplementation((value) => {
    value.fill(7);
    return value;
  });
  jest.mocked(digestStringAsync).mockResolvedValue('hashed-nonce');
  jest
    .mocked(Apple.signInAsync)
    .mockResolvedValue({ identityToken: 'synthetic-apple-token' } as Awaited<
      ReturnType<typeof Apple.signInAsync>
    >);
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client';
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client';
});
afterAll(() => {
  if (oldWeb === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  else process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = oldWeb;
  if (oldIos === undefined) delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  else process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = oldIos;
});
it('sends the hashed fresh nonce to Apple and keeps the raw nonce for managed verification without requiring an email', async () => {
  const result = await nativeProviderToken('apple');
  expect(result).toEqual({
    token: 'synthetic-apple-token',
    nonce: '07'.repeat(32),
  });
  expect(Apple.signInAsync).toHaveBeenCalledWith({
    nonce: 'hashed-nonce',
    requestedScopes: [],
  });
  expect(digestStringAsync).toHaveBeenCalledWith('SHA-256', '07'.repeat(32));
});
it('returns quietly for Apple cancellation and fails safely for unavailable Apple auth', async () => {
  jest
    .mocked(Apple.signInAsync)
    .mockRejectedValueOnce({ code: 'ERR_REQUEST_CANCELED' });
  expect(await nativeProviderToken('apple')).toBeNull();
  jest.mocked(Apple.isAvailableAsync).mockResolvedValueOnce(false);
  await expect(nativeProviderToken('apple')).rejects.toMatchObject({
    code: 'CONFIGURATION',
  });
});
it('uses configured Google audience clients and its ID token, with no provider API or offline access scopes', async () => {
  jest.mocked(GoogleSignin.signIn).mockResolvedValueOnce({
    type: 'success',
    data: { idToken: 'synthetic-google-token' },
  } as Awaited<ReturnType<typeof GoogleSignin.signIn>>);
  expect(await nativeProviderToken('google')).toEqual({
    token: 'synthetic-google-token',
  });
  expect(GoogleSignin.configure).toHaveBeenCalledWith({
    webClientId: 'web-client',
    iosClientId: 'ios-client',
    offlineAccess: false,
  });
});
it('handles Google cancellation and missing ID tokens without calling managed Auth', async () => {
  jest
    .mocked(GoogleSignin.signIn)
    .mockResolvedValueOnce({ type: 'cancelled', data: null });
  expect(await nativeProviderToken('google')).toBeNull();
  jest.mocked(GoogleSignin.signIn).mockResolvedValueOnce({
    type: 'success',
    data: { idToken: null },
  } as Awaited<ReturnType<typeof GoogleSignin.signIn>>);
  await expect(nativeProviderToken('google')).rejects.toMatchObject({
    code: 'AUTH',
  });
});
