import type { PaidAccess } from './paid-access';

/**
 * Whether the current owner may start a new challenge. With billing off, as
 * today, every guest and account may, online or offline. With billing on
 * (`EXPO_PUBLIC_BILLING_ENABLED`), only a saved, unexpired API verification
 * lets a challenge start. The API checks ownership and each upload on its own.
 */
export function canStartChallenge(access: PaidAccess | null) {
  return access?.canStart() ?? true;
}
