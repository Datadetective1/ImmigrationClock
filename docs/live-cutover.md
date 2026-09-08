# Live payment cutover — the exact checklist

**Status: not yet performed.** This is the runbook for switching ImmigrationClock
from Stripe test mode to taking real money. Sandbox validation is complete; what
remains is configuration, and every step below is an action in the Stripe or
Vercel dashboard.

`docs/stripe-activation.md` covers *test-mode* setup. This document covers the
*live* switch, and assumes that one has already been done.

---

## What is already true

Verified end to end against the sandbox on 7 September 2026, with an 11-step
lifecycle run using real Stripe objects and real signed webhook deliveries:

| Verified | How |
|---|---|
| Checkout → subscription → entitlement | real test purchase, $20.69 charged |
| Webhook signature, ordering, idempotency | real deliveries + replayed real payloads |
| Cancel at period end, access continues | portal config + store state |
| Full refund revokes access immediately | real refund, `/api/billing/watchlist` → 402 |
| Partial refund does **not** revoke | replayed real charge object |
| Refunded subscription cannot restore itself | `stored: false` under the guard |
| Revocation survives sign-out and re-auth | fresh magic link → still expired |
| Failed renewal marks past_due, keeps paid period | replayed real invoice |

Two defects found by running the built server rather than the test suite are
fixed and deployed: the subscriber store was being served from Next's fetch
Data Cache (so revocation never landed), and `/pricing` decided whether to show
the Subscribe button at **build** time (so switching billing on changed nothing
until a redeploy).

---

## Before you start

- [ ] Stripe account activated for live payments (done)
- [ ] Live webhook destination created and Active, 8 events (done — see step 3)
- [ ] Live webhook signing secret stored in your password manager, **not** yet in Vercel
- [ ] `main` is deployed and green

**Do not do these steps piecemeal.** Steps 4–6 change three environment
variables that must move together. A deployment holding a live key with test
prices, or live prices with a test webhook secret, is worse than either mode.

---

## 1. Business identity — do this FIRST

Live charges currently render on a cardholder's statement as
**`LINK.COM* IMMIGRATIONC`**, and invoices name the business **"Link"**. That is
Stripe's default from Managed Payments, and it is the single most likely cause
of an avoidable dispute: a customer who does not recognise a charge disputes it,
and each dispute costs the fee plus the revenue plus the access they keep until
you notice.

1. Stripe Dashboard → **Live mode** → **Settings → Business**
2. Set the **public business name** to `ImmigrationClock`
3. **Settings → Payments → Statement descriptor**: set the descriptor to
   `IMMIGRATIONCLOCK` (or `IMMIGRATIONCLOCK.COM` if the field allows 22 chars)
4. Set the **support email** and **support URL** (`https://immigrationclock.com`)

**Verify:** create nothing — just confirm the preview Stripe shows for the
statement descriptor no longer contains `LINK.COM`.

> Managed Payments means Stripe is merchant of record. The descriptor may still
> carry a Stripe prefix; what matters is that `IMMIGRATIONCLOCK` is in it and
> `LINK.COM` is not the only recognisable token.

## 2. Billing portal configuration (live mode)

The sandbox portal is already correct. Live mode has its own configuration.

1. **Live mode** → **Settings → Billing → Customer portal**
2. **Cancellation:** enabled, **at end of billing period** — this must match
   `/terms`, which promises the customer keeps access until the period ends
3. **Invoice history:** enabled
4. **Payment method update:** enabled
5. **Business information:** set **Terms of service** to
   `https://immigrationclock.com/terms` and **Privacy policy** to
   `https://immigrationclock.com/privacy`

> Leave **subscription update** disabled. There is no monthly→annual upgrade
> path today, and offering one in the portal without testing it is how a
> proration surprise happens.

## 3. Confirm the live webhook destination

Already created. Confirm it still reads:

- URL `https://immigrationclock.com/api/billing/webhook`
- Status **Enabled**
- API version `2026-08-26.dahlia`
- Exactly these **8** events, which must stay in sync with `HANDLED_EVENTS` in
  `src/lib/billing/stripe.ts`:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
charge.refunded
charge.dispute.created
charge.dispute.closed
invoice.payment_failed
```

> **Why all eight.** The first four grant and change access. The next three are
> money going back out — without `charge.refunded` a fully refunded customer
> keeps Pro for the rest of the term, which is exactly what happened in the
> sandbox before this was corrected. `invoice.payment_failed` names a failed
> renewal directly rather than waiting for a status change that can be late.

## 4. Create the live Product and Prices

Live Price ids are **different** from test ones. The test ids currently in
Vercel will not work against a live key.

1. **Live mode** → **Product catalogue** → **+ Add product**
2. Name: `ImmigrationClock Pro`
3. Description: `Monitoring and bulk work for people who follow US immigration professionally.`
4. Pricing: **Recurring**, `19.00` USD, **Monthly**
5. **Add another price**: **Recurring**, `190.00` USD, **Yearly**
6. Save, then copy both **API IDs** (`price_1…`)

**Keep the amounts exactly 19 and 190.** `src/lib/billing/plans.ts` displays
those figures and `/terms` states them; a test pins the terms copy to
`PLAN_BY_ID`, so changing Stripe without changing the code makes the site
advertise a price it does not charge.

> **Tax.** Both sandbox prices differ in `tax_behavior` (annual `exclusive`,
> monthly `unspecified`). Set **both** live prices to **tax-exclusive** so the
> two intervals behave identically. `/terms` tells the customer tax is added on
> top; a tax-inclusive price would contradict it.

## 5. Swap the three environment variables — together

Vercel → project → **Settings → Environment Variables**, **Production** scope:

| Variable | New value |
|---|---|
| `STRIPE_SECRET_KEY` | the live secret key (`sk_live_…`) |
| `STRIPE_PRICE_PRO_MONTHLY` | live monthly `price_1…` |
| `STRIPE_PRICE_PRO_ANNUAL` | live annual `price_1…` |
| `STRIPE_WEBHOOK_SECRET` | the **live** signing secret from your password manager |

**Save all four before redeploying.** A deployment that picks up some of them is
the half-configured state `checkoutReady` exists to prevent, and a live key with
a test webhook secret means cards are charged while nothing is recorded.

> **Whitespace.** A secret pasted with a trailing newline used to report
> `webhookReady: true` while every signature failed with 400 — silently.
> `verifyWebhookSignature` now trims, so this is defended, but paste cleanly
> anyway: the same hazard applies to the secret key, where it surfaces as a
> Stripe 401 on the first checkout.
>
> **One secret, one destination.** `STRIPE_WEBHOOK_SECRET` holds a single value
> and each Stripe destination signs with its own. The moment this becomes the
> live secret, sandbox deliveries stop verifying. That is expected and correct
> — do not create a second destination to work around it.

## 6. Redeploy

Environment changes only take effect on a new deployment. Trigger one from
Vercel (**Deployments → ⋯ → Redeploy**) or push any commit.

---

## 7. Verify before announcing anything

Run these in order. Every one is read-only.

```bash
# Must report testMode:false and both ready flags true
curl -s https://immigrationclock.com/api/billing/checkout

# Must return 400 invalid_signature — proves the route is live and verifying
curl -s -X POST -H 'Content-Type: application/json' -d '{}' \
  https://immigrationclock.com/api/billing/webhook
```

- [ ] `{"checkoutReady":true,"webhookReady":true,"testMode":false}`
- [ ] `/pricing` shows both Subscribe buttons
- [ ] **The amber "Test mode. No real card is charged" banner is GONE** from
      `/pricing` and `/account`. It is driven by `isTestKey`, so a live key
      removes it automatically — if it is still there, the key did not take.
- [ ] `/terms` shows the "Pro subscriptions & billing" section
- [ ] `/account` signed out shows the sign-in form; the header shows **Sign in**

## 8. One real purchase — the only irreversible step

Do this yourself, with your own card, and refund it immediately afterwards.

1. Sign in on production with an address you control
2. Buy **monthly** ($19 + tax — expect roughly $20.69 in NY)
3. Confirm: redirect back, `/account` shows **Pro — active** with the correct
   renewal date, welcome email arrives **without** a test-mode banner
4. Stripe → Webhooks → live endpoint: `checkout.session.completed` and
   `customer.subscription.created` both **200**
5. **Check your bank statement** and confirm the descriptor reads
   `IMMIGRATIONCLOCK`, not `LINK.COM`
6. Open **Manage billing** → confirm the portal opens, shows the invoice, and
   offers cancellation
7. **Refund it in full** in Stripe
8. Confirm `charge.refunded` delivers **200** and `/account` flips to
   **Pro — expired** on the next request

If step 8 does not revoke access, stop and do not announce. That is the single
most important behaviour in the system and it is the one this whole audit was
built around.

## Rollback

Nothing here is destructive. To return to test mode, put the four test values
back and redeploy. Any live subscription created in the meantime keeps existing
in Stripe and must be cancelled and refunded by hand.

---

## Known limitations, accepted deliberately

- **No monthly→annual upgrade path.** Portal `subscription_update` is off and
  checkout refuses a second subscription with a 409. An existing monthly
  subscriber cannot take the annual price without cancelling and waiting.
- **Purchase analytics under-count.** `checkout_completed` fires when the
  browser returns to `/account`; a customer who closes the tab after paying is
  an uncounted sale. The webhook is the authoritative record.
- **Signed claims have no server-side revocation list.** Sign-out clears the
  browser's copy; an exfiltrated claim stays valid until it expires (≤30 days).
  Every gate re-reads the store, so it grants nothing a cancelled subscription
  would grant.
- **Webhook API version skew.** The endpoint delivers `2026-08-26.dahlia` while
  the client pins `2025-03-31.basil` for its own requests. Validated against
  real Dahlia payloads; revisit if Stripe changes the subscription shape again.
- **Pro sells one working capability** — cross-device follow sync. Honestly
  presented on `/pricing`, and the central commercial risk rather than a defect.
