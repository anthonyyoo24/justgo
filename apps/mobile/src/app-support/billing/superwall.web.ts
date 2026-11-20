import type { SuperwallBilling } from './superwall';

// Purchases happen only in the iOS app, so the web bundle loads no Superwall
// native module.
export function createSuperwallBilling(): SuperwallBilling | null {
  return null;
}
