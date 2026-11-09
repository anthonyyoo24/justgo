import { getRandomValues } from 'expo-crypto';

export function randomSecretHex(): string {
  return Array.from(getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
