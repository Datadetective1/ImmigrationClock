# Partner offers

A partner offer gives one group's members a free trial of Pro and a standing
discount, through a page the partner shares. The first one is for the
National Immigration Project.

| Offer id | Page | Trial | Discount | Coupon variable |
|---|---|---|---|---|
| `nip-member` | `/join/nip` | 90 days | 30% off, for as long as the subscription runs | `STRIPE_COUPON_NIP_MEMBER` |

After the trial, Pro on this offer is $13.30 a month or $133 a year.

## How it works

- The page sends `offer: "nip-member"` with the checkout request and with the
  sign-in request, so the sign-in link brings the person back to `/join/nip`.
- The checkout route looks the offer up in `src/lib/billing/offers.ts` and asks
  Stripe for a Checkout Session with `subscription_data[trial_period_days]=90`,
  `discounts[0][coupon]=<coupon id>` and `subscription_data[metadata][offer]`.
  The promotion code box is off for these sessions, because Stripe does not
  allow both.
- Stripe collects a card at checkout and charges nothing until the trial ends.
- A trial checkout finishes with `payment_status: "no_payment_required"`.
  Activation accepts that only after Stripe confirms the subscription is
  `trialing`.
- If the coupon variable is not set, the page shows "This offer is not open
  yet" and the checkout route refuses the offer. It never falls back to the
  full price.

## What it does not do

It does not check membership. Anyone with the link can take the offer. The page
says who it is for and is marked `noindex`. If a check is ever needed, add it
to the checkout route before the session is created.

The coupon has `duration: forever`, so the discount stays on the subscription
until it is cancelled. Nothing removes it if someone leaves the partner
organization.

## Turning it on

Do test mode first, then live. Test and live coupons are separate objects.

1. In Stripe (test mode first), create a coupon:
   - Type: percentage, 30% off
   - Duration: forever
   - Name: `NIP member 30%`
   - ID: `nip-member-30`
   - Applies to the product `ImmigrationClock Pro` only
2. In Stripe, under Settings, Billing, Subscriptions and emails, turn on the
   reminder email before a free trial ends, so members hear from Stripe
   before the first charge.
3. In Vercel, set `STRIPE_COUPON_NIP_MEMBER=nip-member-30` for the matching
   environment (Preview for test mode, Production for live).
4. Redeploy, open `/join/nip`, and check the buttons appear.
5. Test card `4242 4242 4242 4242` in test mode: Stripe Checkout should show
   "90 days free" and then the discounted price.
