# Optional US iOS web checkout proposal

**Status:** Deferred and disabled. [Phase 17](../implementation-plan/phase-17-optional-stripe.md)
owns approval and acceptance. Native billing is a separate prerequisite described
in the [billing proposal](native-billing-and-jobs.md). This is a retained design,
not a current statement of store eligibility; recheck official rules, provider
support, checkout data collection and rollout scope when the phase is scheduled.

The retained design assumes an eligible United States storefront app-to-web Checkout path. Confirm that assumption against Apple's current guidelines and Stripe's current documentation before enabling it. Eligibility is based on storefront/rules, not a device's GPS, language, or an IP guess. Recheck at implementation and release; keep a server-controlled disable switch and default to native purchasing when eligibility is unknown. [Apple guideline 3.1.1(a)](https://developer.apple.com/app-store/review/guidelines/), [Stripe digital goods](https://docs.stripe.com/mobile/digital-goods).

| Audience                   | Initial behavior                                             | Optional behavior                                        |
| -------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| iOS, US storefront         | Apple IAP through RevenueCat                                 | Offer external Stripe Checkout when enabled and eligible |
| iOS, other storefronts     | Apple IAP through RevenueCat                                 | No automatic extension of US rules                       |
| Android — deferred release | Google Play Billing through RevenueCat when Android is built | No alternative-billing program selected                  |

Proposed implementation:

1. The authenticated app requests a checkout for a server-allowlisted product/price. The server checks eligibility and existing paid status, then binds the Checkout Session to its user/RevenueCat mapping.
2. Open a hosted HTTPS checkout in the external browser. Keep account secrets out of URLs; use only short-lived checkout context. The browser does not need an app login.
3. Verify Stripe webhooks and the applicable paid/trial subscription state. Import/bind the purchase into RevenueCat using its supported Stripe integration. Handle failure/refund/cancellation/renewal, not only checkout completion.
4. A universal link returns to the app. The app asks its own API for verified entitlement state; the redirect itself grants nothing.
5. Use RevenueCat's common `premium` entitlement for native and web products. Show the correct management destination: App Store, Google Play, or Stripe customer portal.

RevenueCat supports Stripe Billing purchase integration and external purchase imports tied to the same App User ID used on mobile. Stripe purchases do not have the same user-triggered restore mechanism as native store purchases; preserving/recovering the app identity is therefore especially important. [RevenueCat Stripe Billing](https://www.revenuecat.com/docs/web/integrations/stripe), [external purchase import](https://www.revenuecat.com/docs/web/integrations/stripe/track-external-purchases), [Stripe webhook handling](https://docs.stripe.com/webhooks).

**No signup versus checkout information:** Stripe may collect a billing email and payment details. These must not become mandatory app-account credentials or be sent to behavioral analytics. If “no email” must mean no email collection even at payment time, validate the precise checkout configuration before enabling this option.

Web checkout adds account matching, provider reconciliation, browser-return failures, tax/payment support, and duplicate-subscription handling. Keep native checkout available, check for an existing subscription before starting another, and measure net revenue per eligible paywall visitor, conversion, refunds, and retention. Do not assume a reported 2× LTV result transfers to JustGO.
