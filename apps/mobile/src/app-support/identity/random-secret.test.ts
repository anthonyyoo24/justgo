import { randomSecretHex } from './random-secret';

jest.mock('expo-crypto', () => ({
  getRandomValues: (bytes: Uint8Array) => {
    bytes.forEach((_, index) => (bytes[index] = 0xff - index));
    return bytes;
  },
}));

it('encodes exactly 32 bytes from the platform getRandomValues as hex', () => {
  expect(randomSecretHex()).toBe(
    'fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0efeeedecebeae9e8e7e6e5e4e3e2e1e0',
  );
});
