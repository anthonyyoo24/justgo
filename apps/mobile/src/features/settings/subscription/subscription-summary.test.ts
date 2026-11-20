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
) =>
  ({
    status: 'verified',
    checkedAt,
    expiresAt,
    source,
    productId,
  }) as const;

it('shows a subscribed account its plan and renewal date', () => {
  expect(
    summarizeSubscription(paid('com.anthonyyoo.justgo.pro.annual'), true),
  ).toEqual({ plan: `Annual, renews ${renews}` });
  expect(
    summarizeSubscription(paid('com.anthonyyoo.justgo.pro.monthly'), true),
  ).toEqual({ plan: `Monthly, renews ${renews}` });
});

it('reads a trial as its plan, because the verified answer has no trial state', () => {
  // Apple's free trial verifies as the plan it starts, with the trial's end as
  // its expiry, so a trial shows the same line until the contract says more.
  expect(
    summarizeSubscription(paid('com.anthonyyoo.justgo.pro.annual'), true),
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
