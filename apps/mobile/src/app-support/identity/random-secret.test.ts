import { randomSecretHex } from './random-secret';

jest.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => {
    bytes.forEach((_, index) => (bytes[index] = index * 8));
    return bytes;
  },
}));

it('encodes exactly 32 bytes from the platform getRandomValues as two-digit hex', () => {
  expect(randomSecretHex()).toBe(
    '0008101820283038404850586068707880889098a0a8b0b8c0c8d0d8e0e8f0f8',
  );
});
