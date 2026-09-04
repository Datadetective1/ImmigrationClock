# Turning payments on

Everything in this file needs a Stripe account and a Vercel project, so none of
it could be done in code. The code side is finished: checkout, the customer
portal, webhook signature verification, entitlement cookies, the subscriber
store, and the pricing page all exist and are tested. They are inert because
`BILLING_ENABLED` is not `"true"` and five environment variables are unset.

Verify the current state at any time:

```bash
npx tsx -e "import('./src/lib/billing/config').then(m => console.log(m.billingStatus(process.env)))"
```

Today it reports every capability false and lists exactly what is missing.

## The nine steps

Do these in order. Steps 1–7 are safe: nothing charges anyone until step 8, and
test mode charges nobody at all.

**1. Create the Stripe account** (or use the existing one) and stay in **test
mode** for steps 2–7. The toggle is top-right in the Stripe dashboard.

**2. Create one product, "ImmigrationClock Pro", with two recurring prices:**
- $19.00 USD / month
- $190.00 USD / year

Copy both price ids. They look like `price_1AbCdEf...`.

> These prices are a hypothesis, not a validated market price. See
> `docs/customer-validation.md` — question 8 exists to test them.

**3. Copy the secret key** from Developers → API keys. In test mode it starts
`sk_test_`.

**4. Generate a session secret** for the entitlement cookie. Any 32+ random
bytes:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**5. Add five environment variables in Vercel** (Project → Settings →
Environment Variables). Add them to Preview first, Production later.

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | the `sk_test_…` key from step 3 |
| `STRIPE_PRICE_PRO_MONTHLY` | the monthly `price_…` id |
| `STRIPE_PRICE_PRO_ANNUAL` | the annual `price_…` id |
| `BILLING_SESSION_SECRET` | the hex string from step 4 |
| `STRIPE_WEBHOOK_SECRET` | filled in at step 6 |

Do not put any of these in the repository. Nothing in the codebase reads a
secret from source, and a test enforces that.

**6. Create the webhook endpoint** in Stripe: Developers → Webhooks → Add
endpoint.

- URL: `https://<your-domain>/api/billing/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`

Copy the signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.

**7. Set `BILLING_ENABLED=true`** in Preview only, and deploy. Then:

- Load `/pricing` — it should show the upgrade button rather than a disabled
  state, and it should say it is in test mode.
- Buy a subscription with Stripe's test card `4242 4242 4242 4242`, any future
  expiry, any CVC.
- Confirm the entitlement cookie is set and `/account` shows the subscription.
- Cancel from the customer portal and confirm access ends.
- Check the Stripe webhook log for three delivered events with 200 responses.

**8. Go live.** Switch Stripe out of test mode, recreate the product and prices
in live mode (test and live objects are separate), create a live webhook
endpoint, and put the live values into Production. `sk_live_` keys charge real
cards, so nothing here should be pasted anywhere until step 7 has passed.

**9. Set `BILLING_ENABLED=true` in Production** and buy one subscription
yourself with a real card, then refund it. Nothing proves the path works like
using it.

## What still is not built

The architecture is complete; two Pro capabilities are not, and the pricing page
says so beside each line rather than in a footnote.

| Capability | Status on the pricing page | Reality |
|---|---|---|
| Watchlist synced across devices | Available | The API route exists and works |
| Email alerts on your watchlist | In build | **Not built.** No send path, no scheduler |
| Employer monitoring | In build | **Not built** |
| Bulk export | Planned | Not built |
| Professional search | Planned | Not built |

**Do not turn on billing in production until at least one Pro-only capability
that a customer would notice is actually working.** Watchlist sync alone is a
thin thing to charge $19/month for. Email alerts are the obvious first one, and
the intelligence inbox now supplies exactly the content such an email would
carry — the brief for anything that lands in "needs attention".

## The honest sequencing question

There is a real argument for doing customer validation *before* step 8. The
$19/$190 prices have never been tested against anybody, and the fastest way to
find out whether they are right is to ask five people the eight questions in
`docs/customer-validation.md` rather than to build a checkout for a price nobody
has reacted to.

Steps 1–7 cost an hour and charge nobody. Step 8 onwards should wait for a
reason to believe the price.
