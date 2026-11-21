import { summarizeSubscription } from './subscription-summary';

const checkedAt = '2026-11-20T12:00:00.000Z';
const expiresAt = '2027-03-04T12:00:00.000Z';
const renews = new Date(expiresAt).toLocaleDateString(undefined, {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});
const paid = (
  productId: string,
  source: 'subscription' | 'guest_subscription' = 'subscription',
  renewal: { trial?: boolean; autoRenew?: boolean } = {},
) =>
  ({
    status: 'verified',
    checkedAt,
    expiresAt,
    source,
    productId,
    ...renewal,
  }) as const;
const annual = 'com.anthonyyoo.justgo.pro.annual';

it('shows a subscribed account its plan and renewal date', () => {
  expect(
    summarizeSubscription(paid('com.anthonyyoo.justgo.pro.annual'), true),
  ).toEqual({ plan: `Annual, renews ${renews}` });
  expect(
    summarizeSubscription(paid('com.anthonyyoo.justgo.pro.monthly'), true),
  ).toEqual({ plan: `Monthly, renews ${renews}` });
});

it('says when a free trial ends, since that date need not be a renewal', () => {
  expect(
    summarizeSubscription(paid(annual, 'subscription', { trial: true }), true),
  ).toEqual({ plan: `Annual, trial ends ${renews}` });
  expect(
    summarizeSubscription(
      paid(annual, 'subscription', { trial: true, autoRenew: true }),
      true,
    ),
  ).toEqual({ plan: `Annual, trial ends ${renews}` });
});

it('says a plan ends, not renews, once auto-renew is off', () => {
  expect(
    summarizeSubscription(
      paid(annual, 'subscription', { trial: false, autoRenew: false }),
      true,
    ),
  ).toEqual({ plan: `Annual, ends ${renews}` });
  // A trial with auto-renew off ends without converting.
  expect(
    summarizeSubscription(
      paid(annual, 'subscription', { trial: true, autoRenew: false }),
      true,
    ),
  ).toEqual({ plan: `Annual, ends ${renews}` });
});

it('says a paid plan renews when it renews or the server has not heard', () => {
  for (const renewal of [
    { trial: false, autoRenew: true },
    { trial: false },
    {},
  ])
    expect(
      summarizeSubscription(paid(annual, 'subscription', renewal), true),
    ).toEqual({ plan: `Annual, renews ${renews}` });
});

it('names an unknown product without guessing its period', () => {
  expect(
    summarizeSubscription(paid('com.anthonyyoo.justgo.pro.weekly'), true),
  ).toEqual({ plan: `JustGO Pro, renews ${renews}` });
});

it('says an expired subscription ended rather than renews', () => {
  expect(
    summarizeSubscription(paid('com.anthonyyoo.justgo.pro.annual'), false),
  ).toEqual({ plan: `Annual, ended ${renews}` });
  for (const renewal of [
    { trial: true, autoRenew: true },
    { trial: false, autoRenew: false },
  ])
    expect(
      summarizeSubscription(paid(annual, 'subscription', renewal), false),
    ).toEqual({ plan: `Annual, ended ${renews}` });
});

it('says a guest subscription belongs to this phone', () => {
  expect(
    summarizeSubscription(
      paid('com.anthonyyoo.justgo.pro.monthly', 'guest_subscription'),
      true,
    ),
  ).toEqual({
    plan: `Monthly, renews ${renews}`,
    note: 'Saved to this phone, not to an account.',
  });
});

it('describes free, unpaid, unavailable and unchecked answers', () => {
  expect(
    summarizeSubscription(
      { status: 'verified', checkedAt, expiresAt, source: 'free_beta' },
      true,
    ),
  ).toEqual({ plan: 'Free during the beta' });
  expect(summarizeSubscription({ status: 'unpaid', checkedAt }, false)).toEqual(
    { plan: 'No subscription' },
  );
  expect(
    summarizeSubscription({ status: 'unavailable', checkedAt }, false),
  ).toEqual({ plan: 'Subscription status is unavailable' });
  expect(summarizeSubscription(null, false)).toEqual({
    plan: 'Checking your subscription',
  });
});
