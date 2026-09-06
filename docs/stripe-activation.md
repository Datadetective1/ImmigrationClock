# Stripe test mode: click-by-click

**Goal: verify the entire purchase lifecycle without charging anybody.**

Payment readiness runs in parallel with customer validation. This document gets
test mode working end to end. It does not turn on production billing, and
nothing here charges a real card.

The code is finished — checkout, customer portal, webhook signature
verification, entitlement cookies, the subscriber store, the pricing page, and
103 tests across four files. It is inert because five environment variables are
unset and `BILLING_ENABLED` is not `"true"`.

Check the current state at any time:

```bash
npm run billing:verify
```

Today it reports every value missing. After step 5 it asks Stripe whether your
key works, whether both prices exist, whether they cost what the pricing page
says, and whether anything is pointing at live mode by accident. It is read-only
and **refuses to run against a live key**.

## Pricing is an unvalidated hypothesis

$19/month and $190/year have never been tested against a human being. They are
not changed here to optimise conversion, and they are labelled as unvalidated in
`docs/customer-validation.md` (question 8 exists to test them). Configure them as
they are; change them when someone tells you to, not before.

---

## PART A — what only you can do (Stripe dashboard)

Everything in Part A needs your Stripe login. **Stay in test mode throughout** —
the toggle is in the top-right of the dashboard and should read **"Test mode"**.

### A1. Create the product and two prices

1. Go to **stripe.com/dashboard** and confirm the **Test mode** toggle is ON.
2. Left sidebar → **Product catalogue** → **+ Add product**.
3. Name: `ImmigrationClock Pro`
4. Description: `Monitoring and bulk work for people who follow US immigration professionally.`
5. Under **Pricing**: choose **Recurring**, amount `19.00`, currency `USD`, billing period **Monthly**.
6. Click **Add another price**. Choose **Recurring**, amount `190.00`, currency `USD`, billing period **Yearly**.
7. Click **Save product**.
8. On the product page you now see two prices. Click each one and copy its **API ID** — it looks like `price_1AbC...`. Keep both.

> Two months free on annual is stated on the pricing page and follows from
> 19 × 12 = 228 against 190. If you change either number, the page recalculates.

### A2. Copy the test secret key

1. Left sidebar → **Developers** → **API keys**.
2. Under **Standard keys**, find **Secret key** and click **Reveal test key**.
3. Copy it. In test mode it starts `sk_test_`.

### A3. Create the webhook endpoint

Do this **after** the site is deployed to a preview URL (step B2), because Stripe
needs a reachable URL.

1. **Developers** → **Webhooks** → **+ Add endpoint**.
2. Endpoint URL: `https://<your-preview-domain>/api/billing/webhook`
3. Click **Select events** and choose exactly these eight:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`
   - `invoice.payment_failed`

   > **`customer.subscription.created` is not optional.** It is the only event
   > that carries the billing period at signup — `current_period_end`, which
   > from API version `2025-03-31.basil` onwards lives on each subscription
   > item rather than on the subscription. Without this event a buyer who
   > closes the tab before the success redirect completes is stored with
   > `currentPeriodEnd: 0` and is denied access until their first renewal — a
   > paying customer, locked out, silently. A test asserts this list matches the
   > code.

   > **The last four are how money going back out reaches the entitlement.**
   > Refunding a subscriber in the Stripe dashboard does **not** cancel their
   > subscription, so without `charge.refunded` the stored record kept
   > `status: "active"` with a future period end and access continued for the
   > rest of the term — up to a year on annual, after the money was returned. A
   > chargeback behaved the same. `charge.dispute.created` ends access
   > immediately; `charge.dispute.closed` never restores it automatically;
   > `invoice.payment_failed` records a failed renewal without shortening a
   > period the customer has already paid for.

4. Click **Add endpoint**.
5. On the endpoint page, click **Reveal** under **Signing secret** and copy it. It starts `whsec_`.

### A4. Nothing else

You do not need to configure the customer portal manually — the code creates
portal sessions through the API. If Stripe asks you to activate the portal in
test mode, it is under **Settings → Billing → Customer portal**; click **Save**
on the default configuration.

---

## PART B — the environment values

### B1. Generate the session secret

Run this locally. It never leaves your machine:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### B2. Set six variables in Vercel

Project → **Settings** → **Environment Variables**. Set the **Preview**
environment only. Do not touch Production.

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | the `sk_test_…` from A2 |
| `STRIPE_PRICE_PRO_MONTHLY` | the monthly `price_…` from A1 |
| `STRIPE_PRICE_PRO_ANNUAL` | the annual `price_…` from A1 |
| `BILLING_SESSION_SECRET` | the hex string from B1 |
| `STRIPE_WEBHOOK_SECRET` | the `whsec_…` from A3 |
| `BILLING_ENABLED` | `true` |
| `KV_REST_API_URL` | the Upstash/Vercel KV REST URL |
| `KV_REST_API_TOKEN` | the matching REST token |

Then redeploy the preview.

### The store is not optional any more

The last two are new to this list, and they carry a security property rather
than a convenience.

Two protections added on `fix/revenue-integrity` are enforced **in the store**,
so both are silently absent without it:

- **A checkout session is spendable once.** `/api/billing/activate` is
  unauthenticated by design — someone returning from Stripe has no cookie yet —
  and the session id is the only thing they carry. With a store, that id is
  claimed atomically and buys exactly one cookie. Without one, the claim is
  skipped and a single paid `cs_` id mints unlimited Pro cookies in unlimited
  browsers: a pasted success URL, a leaked referrer, a shared screenshot.
- **Entitlement survives the cookie.** Without a store, entitlement lives only
  in the browser cookie, so a cancellation cannot be reflected until it expires.

Test mode is fine to explore without KV. **Do not enable live billing without
it.**

**Never put any of these in the repository.** Nothing in the codebase reads a
secret from source, and a test enforces it.

### B3. Verify before you buy anything

With the same values in your local shell (or a `.env.local` that is gitignored):

```bash
npm run billing:verify
```

Every line should be `✓`. If a price shows `LIVE MODE`, you created it outside
test mode — delete it and redo A1 with the toggle on.

---

## PART C — the lifecycle to walk

Do these in order on the preview deployment. Test card: **4242 4242 4242 4242**,
any future expiry, any CVC, any postcode.

| # | Step | What correct looks like |
|---|---|---|
| 1 | Open `/pricing` | Upgrade button is live, not disabled. The page says it is in test mode. |
| 2 | Click upgrade, monthly | Redirects to Stripe Checkout showing **$19.00/month** and a test-mode banner |
| 3 | Pay with 4242 | Redirects back to the site, not to an error |
| 4 | Check Stripe → Developers → Webhooks → your endpoint | `checkout.session.completed` AND `customer.subscription.created` both delivered, **200** each |
| 5 | Open `/account` | Shows an active Pro subscription and the renewal date |
| 6 | Check the browser cookie | An entitlement cookie is set. It is signed — it should not be readable as plain JSON |
| 7 | Open the customer portal from `/account` | Stripe's portal loads with the subscription listed |
| 8 | Cancel in the portal | Returns to the site |
| 9 | Check the webhook log again | `customer.subscription.updated` or `.deleted` delivered, **200** |
| 10 | Reload `/account` | Access state reflects the cancellation |
| 11 | Reload `/pricing` | Offers upgrade again |

**If step 4 or 9 shows a non-200**, the signing secret is wrong. Re-copy it from
A3 into `STRIPE_WEBHOOK_SECRET` and redeploy — the webhook rejects anything it
cannot verify, which is the correct behaviour.

**If step 5 shows nothing after a successful payment**, the webhook fired but the
subscriber store is not configured. Check the Redis variables in
`src/lib/billing/store.ts`; without a store, entitlement lives only in the cookie
and will not survive a different browser.

---

## What is NOT built

The architecture is complete; two Pro capabilities are not, and the pricing page
says so beside each line rather than in a footnote.

| Capability | Pricing page says | Reality |
|---|---|---|
| Watchlist synced across devices | Available | The API route exists and works |
| Email alerts on your watchlist | In build | **Not built.** No send path, no scheduler |
| Employer monitoring | In build | **Not built** |
| Bulk export | Planned | Not built |
| Professional search | Planned | Not built |

**Test mode can be fully verified today. Production billing should not be turned
on until at least one Pro-only capability a customer would notice actually
works.** Watchlist sync alone is thin for $19/month. Email alerts are the obvious
first one, and the intelligence inbox now supplies exactly the content such an
email would carry — the brief for anything that lands in "needs attention".

## Going live, later

Not now. When you do: Stripe's test and live objects are separate, so the
product, both prices and the webhook endpoint all have to be created again in
live mode, and the live values go into Vercel's Production environment. `sk_live_`
keys charge real cards.
