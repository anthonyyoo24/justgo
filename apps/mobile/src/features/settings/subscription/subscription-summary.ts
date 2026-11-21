import type { AccessResponse } from '@justgo/contracts';

const plans: Record<string, string> = {
  'com.anthonyyoo.justgo.pro.annual': 'Annual',
  'com.anthonyyoo.justgo.pro.monthly': 'Monthly',
};

export type SubscriptionSummary = {
  /** One line, such as `Annual, renews March 4, 2027`. */
  plan: string;
  /** Who holds the subscription when that is not the signed-in account. */
  note?: string;
};

function day(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Describes the saved, API-verified answer. The date is the expiry Apple
 * verified. A plan with auto-renew off ends then, a free trial's trial ends
 * then, and any other plan renews, including one whose auto-renew the server
 * has not heard yet. Nothing here grants access or reads the store.
 */
export function summarizeSubscription(
  answer: AccessResponse | null,
  hasAccess: boolean,
): SubscriptionSummary {
  if (!answer) return { plan: 'Checking your subscription' };
  switch (answer.status) {
    case 'unpaid':
      return { plan: 'No subscription' };
    case 'unavailable':
      return { plan: 'Subscription status is unavailable' };
    case 'verified':
      break;
  }
  if (!('productId' in answer)) return { plan: 'Free during the beta' };
  const name = plans[answer.productId] ?? 'JustGO Pro';
  const plan = `${name}, ${
    !hasAccess
      ? 'ended'
      : answer.autoRenew === false
        ? 'ends'
        : answer.trial
          ? 'trial ends'
          : 'renews'
  } ${day(answer.expiresAt)}`;
  return answer.source === 'guest_subscription'
    ? { plan, note: 'Saved to this phone, not to an account.' }
    : { plan };
}
